/**
 * 铁律 4 机检：`apps/shared` 必须零依赖 —— 只用 TS 语言 + ES 标准库。
 *
 * ⚠ **为什么必须是机检、而不是靠人记铁律**：2026-07-26 实测，这条铁律的两半**完全没有闸**——
 *   ① `import { z } from "zod"` 进 `apps/shared/src` ⇒ `tsc -p apps/shared` **报 0 错**。
 *      原因：npm workspaces 把依赖提升到根 `node_modules`，而 `apps/shared` 没有自己的
 *      `node_modules` ⇒ Bundler 解析直接命中根上那份。⛔ 类型检查永远发现不了。
 *   ② `export const enum X {}` ⇒ 同样 **0 错**（`isolatedModules` 只拦 *ambient* const enum）。
 *   而 `node:fs`（TS2307，因 `"types": []`）与 `window`（TS2304，因 lib 只有 ES2017）**已有闸**，
 *   所以此前"看起来有保护"，实际漏的恰是最可能被顺手写下的两种。
 *
 * 违反的后果：shared 是双端单源契约，`sync:shared` 会把它整份复制进 `apps/client/src/shared`
 * 再级联进 `apps/Cocos/assets/src`。一个 npm import 跟着镜像进小游戏包 ⇒ Cocos 构建期或
 * 微信真机运行期才炸（无头 CI 全绿），正是铁律 5 机检（serverImportBan）当年要防的同一类形态。
 * `const enum` 则是跨文件内联后与镜像不一致（Cocos 按 isolatedModules 单文件转译）。
 *
 * 本文件形态照 `apps/client/test/serverImportBan.test.ts`（纯文本扫描 + 给判据写反例）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SHARED_SRC = join(import.meta.dirname, "../../shared/src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { out.push(...walk(p)); }
    else if (e.name.endsWith(".ts")) { out.push(p); }
  }
  return out;
}

/** 取出所有模块说明符（import/export … from "x"、`import("x")`、`require("x")`）。 */
function specifiersOf(src: string): string[] {
  const out: string[] = [];
  // 先剥注释：否则文档里举反例的字样（本仓注释密度高）会被当成真代码。
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const re of [
    /(?:^|[\s;}])(?:import|export)\s[^;]*?from\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /(?:^|[\s;}])import\s+["'`]([^"'`]+)["'`]/g,   // 裸副作用 import
  ]) {
    for (const m of code.matchAll(re)) { out.push(m[1]); }
  }
  return out;
}

/** 相对路径以外的一切都是外部依赖（npm 包 / Node 内建 / 裸标识符）。 */
const isRelative = (s: string): boolean => s.startsWith("./") || s.startsWith("../");

test("铁律 4：apps/shared 只许相对导入（⛔ 禁 npm 包与 Node 内建——workspaces 提升让 tsc 抓不到）", () => {
  const bad: string[] = [];
  for (const file of walk(SHARED_SRC)) {
    for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
      if (!isRelative(spec)) { bad.push(`${relative(SHARED_SRC, file)} → "${spec}"`); }
    }
  }
  assert.deepEqual(bad, [],
    "shared 出现非相对导入（铁律 4：零依赖，只用 TS 语言 + ES 标准库）。\n"
    + "⚠ 注意 tsc 不会报这个——workspaces 把包提升到根 node_modules，解析会成功；\n"
    + "  它只会在 sync:shared 灌进客户端后、Cocos 构建或微信真机运行时才炸。\n"
    + bad.map((b) => `  - ${b}`).join("\n"));
});

test("铁律 4：apps/shared 禁 `const enum`（Cocos 单文件转译下跨文件内联不安全）", () => {
  const bad: string[] = [];
  for (const file of walk(SHARED_SRC)) {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    // `declare const enum` 已被 isolatedModules 拦住；这里要抓的是普通与导出形态。
    if (/(?:^|[\s;}])(?:export\s+)?const\s+enum\s/.test(code)) {
      bad.push(relative(SHARED_SRC, file));
    }
  }
  assert.deepEqual(bad, [],
    `shared 出现 const enum（铁律 4）。isolatedModules 只拦 ambient 形态，⛔ 拦不住这个：\n`
    + bad.map((b) => `  - ${b}`).join("\n"));
});

test("机检自身有效：两条判据都能认出违规，且 ⛔ 不误伤相对导入/注释里的举例/普通 enum", () => {
  // 给判据写反例是本仓纪律（同 serverImportBan/logic-purity/floating-promise）。
  const violating = [
    'import { z } from "zod";',
    'import fs from "node:fs";',
    'export { a } from "lodash";',
    'const m = await import("some-pkg");',
    'const r = require("cjs-pkg");',
    'import "side-effect-pkg";',
  ];
  for (const line of violating) {
    const specs = specifiersOf(line).filter((s) => !isRelative(s));
    assert.equal(specs.length, 1, `应判违规但没抓到：${line}`);
  }

  const clean = [
    'import type { IUserView } from "./user";',
    'export * from "../constants/game";',
    'const m = await import("./logic/index");',
    '// 反例：这里写 import { z } from "zod" 只是注释，⛔ 不该命中',
    '/* import fs from "node:fs" —— 块注释里的举例同样不该命中 */',
  ];
  for (const line of clean) {
    const specs = specifiersOf(line).filter((s) => !isRelative(s));
    assert.deepEqual(specs, [], `⛔ 误伤了合法写法：${line}`);
  }

  const constEnumRe = /(?:^|[\s;}])(?:export\s+)?const\s+enum\s/;
  assert.ok(constEnumRe.test("export const enum Foo { A }"), "应抓 export const enum");
  assert.ok(constEnumRe.test("const enum Bar { B }"), "应抓裸 const enum");
  assert.ok(!constEnumRe.test("export enum Ok { A }"), "⛔ 不该误伤普通 enum");
  assert.ok(!constEnumRe.test("const enumLike = 1;"), "⛔ 不该误伤 enumLike 这种标识符");
});
