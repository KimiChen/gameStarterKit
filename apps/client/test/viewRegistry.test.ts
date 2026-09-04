/**
 * 页面注册表守门（docs/CLIENT.md §4/§5；Non-intrusive §7.5 阶段 6 manifest 化）——
 * 与服务端 loader 启动校验同哲学，客户端在测试期做：
 *  1. generated view manifest 声明的每个 view 目录**递归**发现的 *View.ts ⇔ 登记条目
 *     双向相等（未登记的 View 文件红；机械件 MACHINERY 豁免）——原「非递归 readdirSync」
 *     硬编码目录形状已废；
 *  2. 每条登记的 logic 路径存在（原 `logic/page/<Name>Logic.ts` 硬编码已废，路径由
 *     manifest 逐条声明）；
 *  3. 注册表（稳定 façade）与 generated catalog / FGUI_CONTRACTS 单源派生一致；
 *  4. 每个页面的 sharedPkgs ⊇ art 依赖**传递闭包**（生成器已算过一遍；此处按同一算法
 *     **独立重算**，防生成器闭包实现静默退化）；
 *  5. 代码内 ui://Pkg/ 引用 ⊆ 本页包 ∪ sharedPkgs；
 *  6. AUTO 区块与 .fui 同步且未被手改（fgui 条目；恒等断言 + REQUIRED ⇔ contract 单源）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VIEW_LAYERS } from "../src/view/layers";
import { FGUI_CONTRACTS } from "../src/view/fguiContracts";
import { VIEW_REGISTRY } from "../src/view/viewRegistry";
import {
  GENERATED_VIEW_CATALOG,
  VIEW_SOURCE_DIRS,
  VIEW_SOURCE_RECORDS,
} from "../src/generated/views.generated";
import { parseFguiComponent } from "../../../tools/fgui-codegen/parseFgui";
import { regenerateViewSource } from "../../../tools/fgui-codegen/binding";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ART_DIR = join(REPO_ROOT, "apps/art/fairygui/assets");
/** view 目录下的机械件（非页面视图），不参与文件⇔manifest 比对 */
const MACHINERY = new Set(["FguiView.ts"]);

function viewFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...viewFilesUnder(full));
    else if (/^[A-Z].*View\.ts$/.test(entry.name) && !MACHINERY.has(entry.name)) out.push(full);
  }
  return out;
}

test("manifest 目录递归发现的 *View.ts ⇔ generated 登记条目 双向相等", () => {
  assert.ok(VIEW_SOURCE_DIRS.length >= 1, "manifest 必须声明至少一个 view 目录");
  // ⚠ VIEW_SOURCE_DIRS 允许嵌套（built-in 声明 view/ 全树，玩法 feature 只声明自己的
  // view/rooms/<id>/ 子树）：同一文件会被两条目录各发现一次。比对的不变式是**集合相等**，
  // 去重是如实建模而非弱化——registered 侧本就是一 View 一条（一 View 一 manifest 由
  // 生成器 fail-fast 保证），任一侧多出/少一个文件仍必红。
  const discovered = [...new Set(VIEW_SOURCE_DIRS
    .flatMap((dir) => viewFilesUnder(join(REPO_ROOT, dir)))
    .map((full) => full.slice(REPO_ROOT.length).split("\\").join("/")))]
    .sort();
  const registered = VIEW_SOURCE_RECORDS.map((record) => record.path).slice().sort();
  assert.deepEqual(discovered, registered,
    "view 目录里的 *View.ts 与 generated manifest 必须一一对应（新 View 写 sidecar 并重跑 codegen:features；删 View 用 --allow-delete）");
});

test("manifest 逐条 logic 路径存在 + sidecar 文件存在（View↔Logic 配对，不再硬编码 logic/page）", () => {
  assert.ok(VIEW_SOURCE_RECORDS.length >= 6, "manifest 条目数异常（扫描空转？）");
  for (const record of VIEW_SOURCE_RECORDS) {
    assert.ok(existsSync(join(REPO_ROOT, record.logic)),
      `${record.name}: manifest 声明的 logic 缺失 ${record.logic}`);
    assert.ok(existsSync(join(REPO_ROOT, record.sidecar)),
      `${record.name}: manifest 声明的 sidecar 缺失 ${record.sidecar}`);
  }
});

test("稳定 façade 与 generated 单源：VIEW_REGISTRY ⇔ catalog ⇔ manifest fgui 条目 ⇔ FGUI_CONTRACTS", () => {
  assert.equal(VIEW_REGISTRY, GENERATED_VIEW_CATALOG,
    "viewRegistry 必须是 generated catalog 的稳定 façade（不许出现第二份手写全集）");
  const fguiNames = VIEW_SOURCE_RECORDS.filter((record) => record.kind === "fgui")
    .map((record) => record.name).sort();
  assert.deepEqual(Object.keys(VIEW_REGISTRY).sort(), fguiNames,
    "catalog 键必须等于 manifest 的 fgui 条目集合（cocos 条目不进 ViewMgr catalog）");
  for (const [key, meta] of Object.entries(VIEW_REGISTRY)) {
    assert.equal(meta.name, key, `注册键与 meta.name 不一致: ${key}`);
    assert.ok((VIEW_LAYERS as readonly string[]).includes(meta.layer), `${key}: 非法 layer ${meta.layer}`);
    assert.equal(typeof meta.load, "function", `${key}: load 必须是动态 import 闭包`);
  }
  // contract 单源：catalog 条目的 contract 与 FGUI_CONTRACTS 是同一批对象（⛔ 第二份全集）
  const keyOf = (c: { pkg: string; comp: string }): string => `${c.pkg}/${c.comp}`;
  const fromRegistry = Object.values(VIEW_REGISTRY).map((m) => keyOf(m.contract)).sort();
  const declared = FGUI_CONTRACTS.map(keyOf).sort();
  assert.deepEqual(fromRegistry, declared, "catalog 契约与 FGUI_CONTRACTS 必须同集合");
  const byIdentity = new Set(FGUI_CONTRACTS);
  for (const meta of Object.values(VIEW_REGISTRY)) {
    assert.ok(byIdentity.has(meta.contract),
      `${meta.name}: catalog 的 contract 必须与 FGUI_CONTRACTS 是同一对象（单源，非副本）`);
  }
  // manifest 的 pkg/comp 与 contract 一致（fgui-manifest.mjs 消费同一份记录）
  const recordByName = new Map(VIEW_SOURCE_RECORDS.map((record) => [record.name, record]));
  for (const [key, meta] of Object.entries(VIEW_REGISTRY)) {
    const record = recordByName.get(key);
    assert.equal(record?.pkg, meta.contract.pkg, `${key}: manifest pkg 与 contract 不一致`);
    assert.equal(record?.comp, meta.contract.comp, `${key}: manifest comp 与 contract 不一致`);
  }
});

function xmlFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...xmlFilesUnder(full));
    else if (entry.name.endsWith(".xml")) files.push(full);
  }
  return files;
}

/** id→包名（扫每个包 package.xml 的 packageDescription id） */
function buildPkgIdMap(): Map<string, string> {
  const id2name = new Map<string, string>();
  for (const pkg of readdirSync(ART_DIR)) {
    const px = join(ART_DIR, pkg, "package.xml");
    if (!existsSync(px)) continue;
    const m = /<packageDescription\b[^>]*\bid\s*=\s*(["'])([^"']+)\1/i.exec(readFileSync(px, "utf8"));
    if (m) id2name.set(m[2], pkg);
  }
  return id2name;
}

/** 某包直接引用的外部包名集合（扫递归 XML 的 pkg/ui:// 引用）。 */
function directDeps(pkg: string, id2name: Map<string, string>): Set<string> {
  const own = [...id2name.entries()].find(([, n]) => n === pkg)?.[0];
  const ids = new Set<string>();
  for (const file of xmlFilesUnder(join(ART_DIR, pkg))) {
    if (basename(file) === "package.xml") continue;
    const s = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const m of s.matchAll(/\bpkg\s*=\s*(["'])([^"']+)\1/gi)) ids.add(m[2]);
    // Named URLs are common in hand-authored XML; binary URLs concatenate the
    // package id and resource id, whose length is not a stable API.
    for (const m of s.matchAll(/ui:\/\/([^\s"'<>|&]+)/gi)) {
      const raw = m[1].replace(/[),.;\]}]+$/g, "");
      const slash = raw.indexOf("/");
      if (slash >= 0) ids.add(raw.slice(0, slash));
      else {
        const id = [...id2name.keys()].filter((candidate) => raw.startsWith(candidate))
          .sort((a, b) => b.length - a.length)[0];
        if (id) ids.add(id);
      }
    }
  }
  const names = new Set<string>();
  for (const id of ids) { if (id !== own && id2name.has(id)) names.add(id2name.get(id)!); }
  return names;
}

test("generated 条目 sharedPkgs ⊇ art 依赖传递闭包（独立重算，防生成器闭包实现退化）", () => {
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
  const name2id = new Map([...id2name.entries()].map(([id, name]) => [name, id]));
  for (const [key, meta] of Object.entries(GENERATED_VIEW_CATALOG)) {
    const need = closure(meta.contract.pkg);
    // 生成器把 assetUrls 所属包并入闭包；独立重算保持同一口径。
    for (const url of meta.contract.assetUrls ?? []) {
      const assetPkg = url.slice("ui://".length).split("/")[0];
      if (name2id.has(assetPkg) && assetPkg !== meta.contract.pkg) need.add(assetPkg);
    }
    const declared = new Set((meta.sharedPkgs ?? []).map((p) => p.replace(/^ui\//, "")));
    const missing = [...need].filter((n) => !declared.has(n)).sort();
    assert.deepEqual(missing, [],
      `${key}: sharedPkgs 缺依赖包 ${JSON.stringify(missing)}（fairygui 不自动加载，运行时这些包的元素会空白）——` +
      `补进 ${key}View.view.json 的 sharedPkgs（形如 "ui/<包名>"）并重跑 codegen:features`);
  }
});

test("代码内 ui://Pkg/ 引用 ⊆ 本页包 ∪ sharedPkgs（写错包名不报错、运行时图标/元素空白）", () => {
  // art XML 闭包抓不到**代码里手写**的跨包 ui:// URL（icon/GLoader.url 等）——
  // 曾漏检真实 bug：login_status_* 写成页面自己的包名，测试全绿、运行时图标空白。
  const recordByName = new Map(VIEW_SOURCE_RECORDS.map((record) => [record.name, record]));
  for (const [key, meta] of Object.entries(GENERATED_VIEW_CATALOG)) {
    const record = recordByName.get(key)!;
    const src = readFileSync(join(REPO_ROOT, record.path), "utf8");
    const allowed = new Set([meta.contract.pkg, ...(meta.sharedPkgs ?? []).map((p) => p.replace(/^ui\//, ""))]);
    const bad = new Set<string>();
    for (const m of src.matchAll(/ui:\/\/([^\s"'<>|/]+)\//g)) {
      if (!allowed.has(m[1])) bad.add(m[1]);
    }
    assert.deepEqual([...bad].sort(), [],
      `${record.path} 引用了闭包外的包 ${JSON.stringify([...bad].sort())}——包名写错（资源实际在别的包）` +
      `或漏在 ${key}View.view.json 的 sharedPkgs 声明（fairygui 不自动加载，运行时元素空白）`);
  }
});

test("已登记页面的 AUTO 区块与 .fui 同步且未被手改（双向漂移机检）", () => {
  const recordByName = new Map(VIEW_SOURCE_RECORDS.map((record) => [record.name, record]));
  for (const [key, meta] of Object.entries(GENERATED_VIEW_CATALOG)) {
    const record = recordByName.get(key)!;
    const viewPath = join(REPO_ROOT, record.path);
    const xmlPath = join(ART_DIR, meta.contract.pkg, `${meta.contract.comp}.xml`);
    const source = readFileSync(viewPath, "utf8");
    const comp = parseFguiComponent(readFileSync(xmlPath, "utf8"));
    const regen = regenerateViewSource(source, comp, {
      viewClass: `${key}View`, pkg: meta.contract.pkg, comp: meta.contract.comp,
    });
    assert.equal(regen, source,
      `${record.path} 的 AUTO 区块与 .fui 不同步（忘跑 codegen？）或生成区被手改（重跑 codegen 恢复）`);
    // View 内嵌 AUTO REQUIRED ⇔ generated contract.required（生成器按同一 binding 规则
    // 从 XML 计算——此处双向兜住「忘跑 codegen:features」与「忘跑 codegen:fgui」）
    const m = /static readonly REQUIRED = (\[[\s\S]*?\]) as const;/.exec(source);
    assert.ok(m, `${record.path} 缺 static REQUIRED（codegen 产物）`);
    assert.deepEqual(JSON.parse(m[1]), [...meta.contract.required],
      `${record.path} 内嵌 REQUIRED 与 generated contract.required 不一致`);
  }
});
