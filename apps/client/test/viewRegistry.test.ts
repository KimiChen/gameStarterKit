/**
 * 页面注册表守门（docs/CLIENT.md 方案 1/2）——与服务端 loader 启动校验同哲学，客户端在测试期做：
 *  1. view/*View.ts 文件集合 ⇔ VIEW_REGISTRY 键集合 双向相等（漏登记/漏文件都红）
 *  2. 注册表引用的契约 ⇔ fguiContracts.FGUI_CONTRACTS 双向相等（合流靠测试而非 import 方向——
 *     registry 因 load 闭包被排除在无头 typecheck 外，契约文件必须保持纯数据可检）
 *  3. 每个已注册页面的 View 文件 AUTO 区块与 .fui 当前结构同步且未被手改
 *     （regenerateViewSource 恒等断言 = 「忘跑 codegen」与「手改生成区」双向漂移一次兜住）
 *  4. 每个页面的 sharedPkgs ⊇ 其 art 依赖**传递闭包**（fairygui 不自动加载依赖包——少一个
 *     跨包元素就空白不渲染，如 btn_login 图标在 L10n_zh_hans；闭包从 art XML 的 pkg=/ui:// 引用推导）
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VIEW_LAYERS } from "../src/view/layers";
import { FGUI_CONTRACTS } from "../src/view/fguiContracts";
import { VIEW_REGISTRY } from "../src/view/viewRegistry";
import { parseFguiComponent } from "../../../tools/fgui-codegen/parseFgui";
import { regenerateViewSource } from "../../../tools/fgui-codegen/binding";

const VIEW_DIR = fileURLToPath(new URL("../src/view", import.meta.url));
const ART_DIR = fileURLToPath(new URL("../../art/fairygui/assets", import.meta.url));
/** view/ 下的机械件（非页面视图），不参与文件⇔注册表比对 */
const MACHINERY = new Set(["FguiView.ts"]);

function pageViewFiles(): string[] {
  return readdirSync(VIEW_DIR)
    .filter((f) => /^[A-Z].*View\.ts$/.test(f) && !MACHINERY.has(f));
}

test("view/*View.ts 文件集合 ⇔ 注册表键集合（含 meta 基本合法性）", () => {
  const files = pageViewFiles().map((f) => f.replace(/View\.ts$/, "")).sort();
  const names = Object.keys(VIEW_REGISTRY).sort();
  assert.deepEqual(files, names,
    "页面文件与 viewRegistry 必须一一对应（新页面加注册条目；删页面删条目）");
  const LOGIC_PAGE_DIR = fileURLToPath(new URL("../src/logic/page", import.meta.url));
  for (const [key, meta] of Object.entries(VIEW_REGISTRY)) {
    assert.equal(meta.name, key, `注册键与 meta.name 不一致: ${key}`);
    assert.ok((VIEW_LAYERS as readonly string[]).includes(meta.layer), `${key}: 非法 layer ${meta.layer}`);
    assert.equal(typeof meta.load, "function", `${key}: load 必须是动态 import 闭包`);
    // 视图/逻辑二分的配对机检（四步动线第 3 步）：每个注册页面必须有同名 Logic
    assert.ok(existsSync(join(LOGIC_PAGE_DIR, `${key}Logic.ts`)),
      `${key}: 缺 logic/page/${key}Logic.ts 配对文件（行为层，无头单测）`);
  }
});

test("注册表契约 ⇔ FGUI_CONTRACTS 双向相等（键 + required 字段级）", () => {
  const keyOf = (c: { pkg: string; comp: string }): string => `${c.pkg}/${c.comp}`;
  const fromRegistry = Object.values(VIEW_REGISTRY).map((m) => keyOf(m.contract)).sort();
  const declared = FGUI_CONTRACTS.map(keyOf).sort();
  assert.deepEqual(fromRegistry, declared,
    "每个注册页面的 contract 必须同时列进 FGUI_CONTRACTS（契约测试的遍历入口），反之亦然");
  // 字段级：两处副本只键级比对会漏 required 内容漂移（如一边加了元素另一边没加）
  const byKey = new Map(FGUI_CONTRACTS.map((c) => [keyOf(c), c]));
  for (const meta of Object.values(VIEW_REGISTRY)) {
    const entry = byKey.get(keyOf(meta.contract));
    assert.deepEqual([...meta.contract.required], [...(entry?.required ?? [])],
      `${keyOf(meta.contract)}: 注册表与 FGUI_CONTRACTS 的 required 内容不一致`);
  }
});

/** id→包名（扫每个包 package.xml 的 packageDescription id） */
function buildPkgIdMap(): Map<string, string> {
  const id2name = new Map<string, string>();
  for (const pkg of readdirSync(ART_DIR)) {
    const px = join(ART_DIR, pkg, "package.xml");
    if (!existsSync(px)) continue;
    const m = /packageDescription id="([^"]+)"/.exec(readFileSync(px, "utf8"));
    if (m) id2name.set(m[1], pkg);
  }
  return id2name;
}

/** 某包直接引用的外部包名集合（扫其组件 XML 的 pkg="…" 属性 + ui://<8位包id> 引用） */
function directDeps(pkg: string, id2name: Map<string, string>): Set<string> {
  const own = [...id2name.entries()].find(([, n]) => n === pkg)?.[0];
  const ids = new Set<string>();
  for (const f of readdirSync(join(ART_DIR, pkg))) {
    if (!f.endsWith(".xml") || f === "package.xml") continue;
    const s = readFileSync(join(ART_DIR, pkg, f), "utf8");
    for (const m of s.matchAll(/pkg="([^"]+)"/g)) ids.add(m[1]);
    for (const m of s.matchAll(/ui:\/\/([0-9a-z]{8})/g)) ids.add(m[1]);
  }
  const names = new Set<string>();
  for (const id of ids) { if (id !== own && id2name.has(id)) names.add(id2name.get(id)!); }
  return names;
}

test("每个页面 sharedPkgs ⊇ art 依赖传递闭包（缺包=跨包元素空白不渲染）", () => {
  const id2name = buildPkgIdMap();
  const depCache = new Map<string, Set<string>>();
  const deps = (pkg: string): Set<string> =>
    depCache.get(pkg) ?? depCache.set(pkg, directDeps(pkg, id2name)).get(pkg)!;
  // 传递闭包（不含自身；自身包由 ViewMgr 打开时加载）
  const closure = (pkg: string): Set<string> => {
    const seen = new Set<string>(); const stack = [pkg];
    while (stack.length) { for (const d of deps(stack.pop()!)) { if (!seen.has(d)) { seen.add(d); stack.push(d); } } }
    seen.delete(pkg);
    return seen;
  };
  for (const [key, meta] of Object.entries(VIEW_REGISTRY)) {
    const need = closure(meta.contract.pkg);
    const declared = new Set((meta.sharedPkgs ?? []).map((p) => p.replace(/^ui\//, "")));
    const missing = [...need].filter((n) => !declared.has(n)).sort();
    assert.deepEqual(missing, [],
      `${key}: sharedPkgs 缺依赖包 ${JSON.stringify(missing)}（fairygui 不自动加载，运行时这些包的元素会空白）——` +
      `补进 viewRegistry ${key}.sharedPkgs（形如 "ui/<包名>"）`);
  }
});

test("已注册页面的 AUTO 区块与 .fui 同步且未被手改（双向漂移机检）", () => {
  for (const [key, meta] of Object.entries(VIEW_REGISTRY)) {
    const viewPath = join(VIEW_DIR, `${key}View.ts`);
    const xmlPath = join(ART_DIR, meta.contract.pkg, `${meta.contract.comp}.xml`);
    const source = readFileSync(viewPath, "utf8");
    const comp = parseFguiComponent(readFileSync(xmlPath, "utf8"));
    const regen = regenerateViewSource(source, comp, {
      viewClass: `${key}View`, pkg: meta.contract.pkg, comp: meta.contract.comp,
    });
    assert.equal(regen, source,
      `${key}View.ts 的 AUTO 区块与 .fui 不同步（忘跑 codegen？）或生成区被手改（重跑 codegen 恢复）`);
    // 第三处副本：View 内嵌 AUTO REQUIRED ⇔ 注册条目 contract.required（字段级）
    const m = /static readonly REQUIRED = (\[[\s\S]*?\]) as const;/.exec(source);
    assert.ok(m, `${key}View.ts 缺 static REQUIRED（codegen 产物）`);
    assert.deepEqual(JSON.parse(m[1]), [...meta.contract.required],
      `${key}View.ts 内嵌 REQUIRED 与注册条目 contract.required 不一致`);
  }
});
