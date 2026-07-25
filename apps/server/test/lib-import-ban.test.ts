/**
 * 机检：`@game/webplatform/lib` 只允许在 `platform/`（接缝实现）与 `core/infra/mysql.ts`（池注入）里 import。
 *
 * **为什么**（DUAL_MODE §2.7 / docs/WEBPLATFORM.md）：split 模式下 lib 被注入了**游戏服的池**
 * （`core/infra/mysql.ts:useServerPool`），而 accounts/char_registry 在**独立账号库**——所以在
 * `platform/` 之外直调 lib，就是把账号平面的读写打在**组游戏库**上。故障形态是**静默错误**
 * （`affectedRows=0`、查询空集），不是报错：封号"成功"但没封、`ul` 永远空。
 *
 * ⇒ 游戏服要访问账号平面**一律走 `account.*` 接缝**（in-process → lib、split → HTTP）。
 * 测试目录豁免：测试恒 in-process 且与游戏服共库，直调 lib 是造数据的正当手段。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/** 允许直调 lib 的落点（相对 src/ 的 posix 路径）。新增前先读本文件头部的「为什么」。 */
const ALLOWED = new Set([
  "core/infra/mysql.ts", // 池注入 useServerPool——接缝本身的前提
]);
const ALLOWED_DIRS = ["platform/"]; // 接缝实现（inProcessAccount 等）

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []);
}

test("`@game/webplatform/lib` 只许在 platform/ 与 infra/mysql.ts 直调（split 下直调 = 打错库，静默失败）", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(SRC.length + 1).split("\\").join("/");
    if (ALLOWED.has(rel) || ALLOWED_DIRS.some((d) => rel.startsWith(d))) { continue; }
    const src = readFileSync(file, "utf8");
    // 只看真实 import/require 语句，⛔ 不误伤注释里提到包名（注释里大量引用它做解释）
    const re = /^\s*(?:import|export)\b[^;]*?from\s*["']@game\/webplatform\/lib["']|require\(\s*["']@game\/webplatform\/lib["']\s*\)|import\(\s*["']@game\/webplatform\/lib["']\s*\)/gm;
    if (re.test(src)) { offenders.push(rel); }
  }
  assert.deepEqual(offenders, [],
    `以下文件直调 @game/webplatform/lib——split 下会打在组游戏库上（静默错误）。改走 platform/accountClient 的 account.*：\n  ${offenders.join("\n  ")}`);
});
