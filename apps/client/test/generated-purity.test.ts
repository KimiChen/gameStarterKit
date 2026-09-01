/**
 * 第二条引擎纯度门禁（Non-intrusive §7.5 守门 3；阶段 6）：
 * 覆盖 `src/gameplay/**`（含 generated catalog 装配面）与 `src/generated/**`。
 *
 * 与 logic-purity（扫描根 src/logic，⛔ 保持不动）刻意分立：那条正则会把
 * `import type { Node } from "cc"` 判违规，而 gameplay/catalog.ts 今天就这么写。
 * 本门禁规则：**禁止对 cc / fairygui-cc / db:// 的值导入**（静态 import/export-from/
 * require，含副作用导入），**允许 `import type` 与字面量动态 import**——生成的 load
 * 闭包正是字面量动态 import（铁律 10），presentation 经 catalog 的动态 import 挂接。
 * 形态参考仓内已有的全 src 递归扫描式导入禁令（serverImportBan / appExitConditions）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GAMEPLAY_DIR = fileURLToPath(new URL("../src/gameplay", import.meta.url));
const GENERATED_DIR = fileURLToPath(new URL("../src/generated", import.meta.url));

/**
 * 值导入禁令：静态 import/export ... from、副作用 import "..."、require(...)
 * 指向 cc / cc/* / fairygui-cc / db://*。`import type` / `export type` 放行；
 * 动态 `import("...")` 因引号前必有 `(` 而不落入任何分支——字面量动态 import 放行。
 */
const BANNED_VALUE_IMPORT =
  /(?:(?:^|\n)\s*(?:import\s+(?!type\b)[^;]*?from\s*|import\s*|export\s+(?!type\b)[^;]*?from\s*)|require\s*\(\s*)["'](?:cc|cc\/[^"']*|fairygui-cc|db:\/\/[^"']*)["']/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name))
      : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : []);
}

test("src/gameplay/** 与 src/generated/** 禁 cc/fairygui-cc/db:// 值导入（type-only 与字面量动态 import 放行）", () => {
  const files = [...walk(GAMEPLAY_DIR), ...walk(GENERATED_DIR)];
  assert.ok(files.length >= 4, "扫描目标异常（gameplay/catalog + 三件 generated 应至少 4 个文件）——门禁空转");
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, BANNED_VALUE_IMPORT,
      `${file} 含被禁的引擎值导入（渲染实现只准经字面量动态 import 挂接；类型用 import type）`);
  }
});

test("门禁正则自测：值导入/副作用导入/export-from/require 判违规，type-only 与动态 import 放行", () => {
  for (const bad of [
    'import { Node } from "cc";',
    'import { view } from "cc/env";',
    'import * as fgui from "fairygui-cc";',
    'import { GRoot } from "db://fairygui-cc/fairygui.mjs";',
    'export { GButton } from "db://fairygui-cc/fairygui.mjs";',
    'export * from "cc";',
    'import "cc";',
    'const cc = require("cc");',
    'import {\n  Node,\n} from "cc";',
  ]) {
    assert.match(`\n${bad}\n`, BANNED_VALUE_IMPORT, `应判违规: ${JSON.stringify(bad)}`);
  }
  for (const good of [
    'import type { Node } from "cc";',
    'import type { GComponent } from "db://fairygui-cc/fairygui.mjs";',
    'export type { ViewMeta } from "../view/defineView";',
    'const m = await import("db://fairygui-cc/fairygui.mjs");',
    'load: () => import("../view/LoginView").then((m) => m.LoginView),',
    'import { defineView } from "../view/defineView";',
    'import { GameplayModeId } from "../shared/index";',
  ]) {
    assert.doesNotMatch(`\n${good}\n`, BANNED_VALUE_IMPORT, `不应误伤: ${JSON.stringify(good)}`);
  }
});
