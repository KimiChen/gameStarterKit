/**
 * 机检：**除 `core/errors.ts` 外，源码里禁止出现 `new ServerError(`** —— 拒连一律走 `joinRefused()`。
 *
 * ⚠ 为什么是"白名单式"而不是"解析实参判越界"：Colyseus 把 `ServerError.code` 当 HTTP status 用
 * （`router/default_routes.mjs`: `ctx.error(e.code,…)` → `new Response(…,{status})`），传业务码
 * （2001/3004/…）会抛 `RangeError: init["status"] must be in the range of 200 to 599` ⇒
 * **拒连仍发生但业务码到不了客户端**，而只断言"被拒"的测试完全看不出来（假绿）。
 *
 * ⛔ 本测试**曾经**试图解析实参判越界，结果对 `rooms/GameRoom.ts` 完全失效：它用**裸名** `ErrorCode`
 * 导入的是 **shared 业务码**，而检查器拿这个名字去查 **Colyseus 的**表 → `undefined` → 静默跳过
 * （变异测试实证：把修复原样退回，测试依然全绿）。识别标识符归属需要真解析 import，
 * 正则做不到且**失败方向是 fail-open**。故改为不猜实参、只认调用点：`new ServerError(` 一律判红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorCode as ColyseusErrorCode } from "@colyseus/core";
import { ErrorCode as GameErrorCode, joinErrCodeOf } from "@game/shared";
import { joinRefused } from "../src/core/errors";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
/** 唯一允许构造 ServerError 的地方（joinRefused 的实现处；其取值由下面第二条用例锁死）。 */
const ALLOWED = "core/errors.ts";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []);
}

test("⛔ 除 core/errors.ts 外禁止 `new ServerError(` —— 拒连一律走 joinRefused（防业务码当 HTTP status）", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(SRC.length + 1).split("\\").join("/");
    if (rel === ALLOWED) { continue; }
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/new\s+ServerError\s*\(/g)) {
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push(`${rel}:${line}`);
    }
  }
  assert.deepEqual(offenders, [],
    `拒连请改用 core/errors.ts 的 joinRefused(code, kind)——⛔ ServerError 第一参会被当 HTTP status：\n  ${offenders.join("\n  ")}`);
});

test("joinRefused：status 恒落 200–599 + 业务码可从 message 还原", () => {
  // ⛔ 跳过 Ok(0)：它不是拒绝原因，且解码器刻意把 0 视作"无业务码"（`Number("") === 0`，
  // 否则空 message 会被误解成业务码 0）。
  for (const code of Object.values(GameErrorCode).filter((c) => c !== GameErrorCode.Ok)) {
    for (const kind of ["auth", "app"] as const) {
      const e = joinRefused(code, kind);
      assert.ok(e.code >= 200 && e.code <= 599, `status ${e.code} 越界（code=${code}）`);
      assert.equal(joinErrCodeOf(e.message), code, "客户端可从 message 还原业务码");
    }
  }
  assert.equal(joinRefused(GameErrorCode.TokenExpired, "auth").code, ColyseusErrorCode.AUTH_FAILED);
  assert.equal(joinRefused(GameErrorCode.WrongServer).code, ColyseusErrorCode.APPLICATION_ERROR);
});
