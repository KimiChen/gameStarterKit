/**
 * fgui-codegen CLI——「重跑 codegen」的可运行入口（守门测试报「AUTO 区块不同步」时跑这个）。
 *
 * 用法：npm run codegen:fgui -- <Pkg> <Comp> [ViewClass]
 *   ViewClass 缺省 = <Comp>View；源 XML = apps/art/fairygui/assets/<Pkg>/<Comp>.xml；
 *   目标 = apps/client/assets/src/view/<ViewClass>.ts。
 * 目标已存在 → 幂等重写四个 AUTO 区块（区块外业务代码不动）；不存在 → 生成脚手架并
 * 打印接入清单（契约/注册表/typecheck 排除/.meta）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFguiComponent } from "./parseFgui";
import { emitFguiViewScaffold, regenerateViewSource } from "./binding";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ART = path.join(ROOT, "apps/art/fairygui/assets");
const VIEW_DIR = path.join(ROOT, "apps/client/assets/src/view");

const [pkg, comp, viewClassArg] = process.argv.slice(2);
if (!pkg || !comp) {
  console.error("用法: npm run codegen:fgui -- <Pkg> <Comp> [ViewClass]");
  process.exit(1);
}
const viewClass = viewClassArg ?? `${comp}View`;

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
  }
} else {
  fs.writeFileSync(target, emitFguiViewScaffold(fguiComp, opts));
  console.log(`[codegen] 已生成 ${path.relative(ROOT, target)}，接入清单（漏项守门测试会红）：`);
  console.log(`  1. view/fguiContracts.ts：加 ${comp} 契约常量并放进 FGUI_CONTRACTS`);
  console.log(`  2. view/viewRegistry.ts：加 defineView 条目（contract/layer/fullscreen/onlyOne/permanent/interactive/load）`);
  console.log(`  3. logic/page/${viewClass.replace(/View$/, "")}Logic.ts：行为层配对文件`);
  console.log(`  4. apps/client/tsconfig.typecheck.json exclude：加 "assets/src/view/${viewClass}.ts"（依赖 fairygui，Creator 侧验证）`);
  console.log(`  5. .meta：开一次 Creator 生成（或照同目录格式手工），随 commit 提交`);
}
