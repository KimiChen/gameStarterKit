/** 游戏服仍持有的认证原语纯函数守门（无 Redis/MySQL）。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { safeEqualHex, safeSecretEqual } from "../src/core/auth/session";

test("safeEqualHex：损坏的等长 hash fail-closed 且不得抛 RangeError", () => {
  const hash = "a".repeat(64);
  assert.equal(safeEqualHex(hash, hash), true);
  assert.equal(safeEqualHex(hash, "b".repeat(64)), false);
  for (const bad of ["g".repeat(64), "a".repeat(63), "A".repeat(64), "", "not-a-hash"]) {
    assert.doesNotThrow(() => safeEqualHex(hash, bad));
    assert.equal(safeEqualHex(hash, bad), false);
  }
});

test("safeSecretEqual：长度不等 ⛔ 不得抛（timingSafeEqual 直接比会因不等长抛错 = 泄漏长度）", () => {
  // 这是改用恒时比较时最容易踩的坑：node 的 timingSafeEqual 要求两侧等长，
  // 直接把两个密钥丢进去，长度不同就抛 ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH ⇒
  // 端点 500 而不是 401，且"抛没抛"本身就把长度信息漏出去了。故实现先各自 sha256 再比。
  assert.equal(safeSecretEqual("a", "abcdefghijklmnop"), false);
  assert.equal(safeSecretEqual("abcdefghijklmnop", "a"), false);
  assert.equal(safeSecretEqual("", "x"), false);
});

test("safeSecretEqual：相等为真、任一为空/缺失一律假（fail-closed）", () => {
  assert.equal(safeSecretEqual("s3cret", "s3cret"), true);
  assert.equal(safeSecretEqual("s3cret", "s3crEt"), false);
  // ⛔ 未配置密钥不得成为开门：两侧都空也必须假（端点据此 fail-closed）
  assert.equal(safeSecretEqual("", ""), false);
  assert.equal(safeSecretEqual(undefined, undefined), false);
  assert.equal(safeSecretEqual(null, "s3cret"), false);
  assert.equal(safeSecretEqual("s3cret", null), false);
  assert.equal(safeSecretEqual("s3cret", undefined), false);
});
