/**
 * 铁律 5 机检：apps/client/src 全目录禁止 import 任何 colyseus npm 模块。
 *
 * 客户端只用全局 Colyseus（lib/colyseus 的 UMD 插件 + 手写 colyseus.d.ts 声明），
 * 禁 import 服务端包 colyseus / @colyseus/core，也禁模块形态的 @colyseus/sdk——
 * apps/client 无独立 package.json，依赖借 server workspace 提升到根 node_modules，
 * 违规导入在无头 typecheck（moduleResolution bundler）与 tsx 单测下都能解析通过，
 * 只会在 Creator/小游戏构建时才炸。此约定此前只有口头铁律，本测试补上机检。
 * 随 npm run test:fgui 一起跑（root package.json 的 glob 自动纳入本文件）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));
// 前缀匹配四种引入形态：from "..."（静态 import/export）、裸副作用 import "..."、
// 动态 import("...")、require("...")；包名按前缀截（colyseus 起头即中，覆盖旧客户端包
// colyseus.js 与深路径 colyseus/lib/...）。相对路径 ./lib/colyseus/... 以 . 开头不误伤。
const BANNED = /(?:from\s+|import\s+|import\s*\(\s*|require\s*\(\s*)["'`](?:colyseus|@colyseus\/)/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name))
      : e.name.endsWith(".ts") ? [join(dir, e.name)] : []);
}

test("client/src 全目录禁 import colyseus 服务端/npm 包（铁律 5 机检）", () => {
  const files = walk(SRC_DIR);
  assert.ok(files.length >= 30, "client/src 下应有完整源码树（防扫错目录空转）");
  for (const f of files) {
    assert.ok(!BANNED.test(readFileSync(f, "utf8")),
      `${f} import 了 colyseus npm 模块——客户端只许用全局 Colyseus（UMD 插件），npm 提升让它在无头检查下能过、小游戏构建时才炸`);
  }
});

test("守门正则覆盖违规形态，全局 Colyseus 用法不误伤", () => {
  assert.ok(BANNED.test(`import { Room } from "colyseus";`), "服务端主包");
  assert.ok(BANNED.test(`import { matchMaker } from "@colyseus/core";`), "服务端核心包");
  assert.ok(BANNED.test(`import { Client } from "@colyseus/sdk";`), "SDK 也禁模块形态——只许走全局");
  assert.ok(BANNED.test(`export { Schema } from "@colyseus/schema";`));
  assert.ok(BANNED.test(`const m = await import("colyseus");`));
  assert.ok(BANNED.test(`import "colyseus";`), "裸副作用导入同样把服务端包拉进构建");
  assert.ok(BANNED.test(`const c = require("colyseus");`), "CJS 形态");
  assert.ok(BANNED.test("const m = await import(`@colyseus/sdk`);"), "反引号动态导入");
  assert.ok(BANNED.test(`import { Client } from "colyseus.js";`), "旧客户端包名（0.16 教程常见）");
  assert.ok(BANNED.test(`import x from "colyseus/lib/Room";`), "深路径");
  assert.ok(!BANNED.test(`private client: Colyseus.Client | null = null;`), "全局命名空间是合法形态");
  assert.ok(!BANNED.test(`import { S2C } from "../shared/index";`));
  assert.ok(!BANNED.test(`import type {} from "./lib/colyseus/colyseus";`), "相对路径的本地 lib 不误伤");
});
