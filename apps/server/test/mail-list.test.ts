import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMailCreatedAt } from "../src/websocket/mail/list";

test("mail.created_at 统一接受 epoch 毫秒的 number/数字字符串、Date 和日期字符串", () => {
  const epoch = Date.UTC(2026, 7, 28, 4, 34, 56, 789);
  assert.equal(normalizeMailCreatedAt(epoch), epoch);
  assert.equal(normalizeMailCreatedAt(String(epoch)), epoch);
  assert.equal(normalizeMailCreatedAt(new Date(epoch)), epoch);
  assert.equal(normalizeMailCreatedAt(new Date(epoch).toISOString()), epoch);
  assert.equal(normalizeMailCreatedAt("2026-08-28T04:34:56.789Z"), epoch);
});

test("mail.created_at 拒绝无法证明为非负安全整数毫秒的值", () => {
  for (const bad of [
    new Date(Number.NaN), Number.NaN, Number.POSITIVE_INFINITY, 1.5,
    "", "not-a-date", "1700000000000junk", "-1", -1, null, undefined, {},
  ]) {
    assert.throws(() => normalizeMailCreatedAt(bad), /mail\.created_at/);
  }
});
