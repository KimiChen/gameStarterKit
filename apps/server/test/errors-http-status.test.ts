/**
 * 机检：`new ServerError(code, …)` 的 code **必须是合法 HTTP status（200–599）**。
 *
 * ⚠ 为什么：Colyseus 的 matchmake 路由把它直接当 status 用
 * （`@colyseus/core/router/default_routes.mjs`：`throw ctx.error(e.code, …)` → `new Response(…, {status})`），
 * 所以框架自己的 `ErrorCode` 全是 520–526。传业务码（2001/3004/3005/4002/4003…）会抛
 * `RangeError: init["status"] must be in the range of 200 to 599` ⇒ **拒连仍发生但业务码到不了客户端**，
 * 服务端还刷 SERVER_ERROR 日志——而只断言"被拒"的测试完全看不出来（假绿）。
 *
 * ⇒ 拒连一律走 `core/errors.ts` 的 `joinRefused()`（status=525/526，业务码走 message）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorCode as ColyseusErrorCode, ServerError } from "@colyseus/core";
import { ErrorCode as GameErrorCode } from "@game/shared";
import { joinRefused } from "../src/core/errors";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []);
}

test("⛔ 源码里不得出现 status 越界的 `new ServerError(<非 200–599>)`（曾致 RangeError + 业务码丢失）", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(SRC.length + 1);
    if (rel.endsWith("core/errors.ts")) { continue; } // joinRefused 的定义处（本测另行断言其取值）
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/new ServerError\(\s*([^,)]+)/g)) {
      const arg = m[1].trim();
      const num = /^\d+$/.test(arg) ? Number(arg)
        : /^ErrorCode\.\w+$/.test(arg) ? (ColyseusErrorCode as Record<string, number>)[arg.split(".")[1]]
        : null; // 非字面量/非框架码：交给下面的"必须用 joinRefused"约定，跳过
      if (num !== null && num !== undefined && (num < 200 || num > 599)) {
        offenders.push(`${rel} ← new ServerError(${arg}) = ${num}`);
      }
      // 业务码（shared ErrorCode）直接传进 ServerError：一定越界
      if (/^SharedErrorCode\.\w+$|^GameErrorCode\.\w+$/.test(arg)) {
        offenders.push(`${rel} ← new ServerError(${arg})：业务码不能当 status，请用 joinRefused()`);
      }
    }
  }
  assert.deepEqual(offenders, [], `拒连请改用 core/errors.ts 的 joinRefused()：\n  ${offenders.join("\n  ")}`);
});

test("joinRefused：status 合法 + 业务码经 message 可还原", () => {
  for (const code of Object.values(GameErrorCode)) {
    for (const kind of ["auth", "app"] as const) {
      const e = joinRefused(code, kind);
      assert.ok(e.code >= 200 && e.code <= 599, `status ${e.code} 越界（code=${code}）`);
      assert.equal(Number(e.message), code, "客户端可 Number(msg) 还原业务码 → shared ErrorMessage 取文案");
    }
  }
  assert.equal(joinRefused(GameErrorCode.TokenExpired, "auth").code, ColyseusErrorCode.AUTH_FAILED);
  assert.equal(joinRefused(GameErrorCode.WrongServer).code, ColyseusErrorCode.APPLICATION_ERROR);
});
