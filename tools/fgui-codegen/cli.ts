/**
 * fgui-codegen CLI——「重跑 codegen」的可运行入口（守门测试报「AUTO 区块不同步」时跑这个）。
 *
 * 用法：npm run codegen:fgui -- <Pkg> <Comp> [ViewClass] [--view-dir <目录>]
 *   ViewClass 缺省 = <Comp>View；源 XML = apps/art/fairygui/assets/<Pkg>/<Comp>.xml；
 *   目标 = <view-dir>/<ViewClass>.ts（--view-dir 是仓库相对目录，缺省
 *   apps/client/src/view；未来 feature/gameplay 自有 View 目录用，再由 sync:client 灌入
 *   apps/Cocos/assets/src）。
 * 目标已存在 → 幂等重写四个 AUTO 区块（区块外业务代码不动）；不存在 → 生成脚手架并
 * 打印接入清单（sidecar/feature 登记/typecheck 自动纳入/.meta）。
 * 本工具只写 View AUTO 区（§7.5）：⛔ 不覆盖 registry/contracts 生成物，也不自动执行
 * FGUI manifest --write——那两件分别归 codegen:features 与显式资源审计锁。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFguiComponent } from "./parseFgui";
import { emitFguiViewScaffold, regenerateViewSource } from "./binding";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ART = path.join(ROOT, "apps/art/fairygui/assets");
const DEFAULT_VIEW_DIR_RELATIVE = "apps/client/src/view";

const positionals: string[] = [];
let viewDirRelative = DEFAULT_VIEW_DIR_RELATIVE;
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--view-dir") {
    const value = argv[++index];
    if (!value) {
      console.error("[codegen] --view-dir 需要一个仓库相对目录");
      process.exit(1);
    }
    viewDirRelative = value;
  } else if (arg.startsWith("--view-dir=")) {
    viewDirRelative = arg.slice("--view-dir=".length);
  } else if (arg.startsWith("--")) {
    console.error(`[codegen] 未知参数: ${arg}`);
    process.exit(1);
  } else {
    positionals.push(arg);
  }
}
const [pkg, comp, viewClassArg] = positionals;
if (!pkg || !comp) {
  console.error("用法: npm run codegen:fgui -- <Pkg> <Comp> [ViewClass] [--view-dir <目录>]");
  process.exit(1);
}
const viewClass = viewClassArg ?? `${comp}View`;
const VIEW_DIR = path.resolve(ROOT, viewDirRelative);
if (!VIEW_DIR.startsWith(path.join(ROOT, "apps/client/src") + path.sep)) {
  console.error(`[codegen] --view-dir 必须位于 apps/client/src 之内: ${viewDirRelative}`);
  process.exit(1);
}

const xmlPath = path.join(ART, pkg, `${comp}.xml`);
if (!fs.existsSync(xmlPath)) {
  console.error(`[codegen] 找不到 ${path.relative(ROOT, xmlPath)}`);
  const pkgDir = path.join(ART, pkg);
  if (fs.existsSync(pkgDir)) {
    const comps = fs.readdirSync(pkgDir).filter((f) => f.endsWith(".xml")).map((f) => f.replace(/\.xml$/, ""));
    console.error(`[codegen] 包 ${pkg} 下可选组件: ${comps.join(", ") || "(空)"}`);
  } else {
    const pkgs = fs.existsSync(ART) ? fs.readdirSync(ART, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
    console.error(`[codegen] 可选包: ${pkgs.join(", ") || "(art 工程为空)"}`);
  }
  process.exit(1);
}

const fguiComp = parseFguiComponent(fs.readFileSync(xmlPath, "utf8"));
const target = path.join(VIEW_DIR, `${viewClass}.ts`);
const opts = { viewClass, pkg, comp };

if (fs.existsSync(target)) {
  const source = fs.readFileSync(target, "utf8");
  const regen = regenerateViewSource(source, fguiComp, opts);
  if (regen === source) {
    console.log(`[codegen] ${viewClass}.ts 的 AUTO 区块已是最新，无变更`);
  } else {
    fs.writeFileSync(target, regen);
    console.log(`[codegen] 已幂等重写 ${path.relative(ROOT, target)} 的 AUTO 区块（区块外未动）`);
    console.log(`[codegen] REQUIRED 可能已变化：运行 npm --workspace @game/server run codegen:features -- --check 校验 generated contracts 新鲜度`);
  }
} else {
  fs.mkdirSync(VIEW_DIR, { recursive: true });
  fs.writeFileSync(target, emitFguiViewScaffold(fguiComp, opts));
  console.log(`[codegen] 已生成 ${path.relative(ROOT, target)}，接入清单（漏项守门测试会红）：`);
  console.log(`  1. 同目录写 ${viewClass}.view.json sidecar（owner/kind/layer/交互位/logic/sharedPkgs/手写契约段）`);
  console.log(`  2. features/<id>/feature.json：把 sidecar 路径登记进 views（route 需要时同步登记）`);
  console.log(`  3. logic 配对：sidecar.logic 指向的行为层文件（无头单测）`);
  console.log(`  4. npm --workspace @game/server run codegen:features 刷新 registry/contracts 生成物（只读校验用 -- --check）`);
  console.log(`  5. 类型检查：无需改 tsconfig；typecheck:client 与 typecheck:client:legacy 的 src/**/*.ts glob 会自动纳入`);
  console.log(`  6. sync+meta：npm run sync:client 灌入 apps/Cocos 后开一次 Creator 生成 .meta（或照同目录格式手工），随 commit 提交`);
}
