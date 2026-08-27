import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_JOIN_TIMEOUT_MS, MAX_JOIN_TIMER_MS, waitMsForJoin } from "../src/net/joinControl";

test("join deadline contract accepts only safe integer durations and absolute deadlines", () => {
  assert.equal(waitMsForJoin(), DEFAULT_JOIN_TIMEOUT_MS);
  assert.equal(waitMsForJoin({ timeoutMs: 0 }), 0);
  assert.equal(waitMsForJoin({ timeout: 25 }), 25);
  assert.equal(waitMsForJoin({ deadlineMs: 10_025 }, 10_000), 25);
  assert.equal(waitMsForJoin({ deadline: 9_999 }, 10_000), 0);

  for (const value of ["25", null, Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1, MAX_JOIN_TIMER_MS + 1]) {
    assert.throws(() => waitMsForJoin({ timeoutMs: value }), /安全整数/);
  }
  for (const value of ["10025", null, Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1]) {
    assert.throws(() => waitMsForJoin({ deadlineMs: value }), /安全整数/);
  }
  assert.throws(() => waitMsForJoin({ timeoutMs: 10, deadlineMs: 10_010 }), /只能指定一个/);
  assert.throws(() => waitMsForJoin({ timeout: 10, deadline: 10_010 }), /只能指定一个/);
});

test("small absolute deadlines are not reinterpreted as relative durations", () => {
  assert.equal(waitMsForJoin({ deadlineMs: 25 }, 10_000), 0);
});
