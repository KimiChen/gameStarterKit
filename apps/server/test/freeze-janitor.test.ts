import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeJanitorBudget, normalizeJanitorFrozenAt } from "../src/core/archive/freezeWorker";

test("janitor batch is a finite positive total-scan budget", () => {
  assert.equal(normalizeJanitorBudget(200), 200);
  assert.equal(normalizeJanitorBudget(1.9), 1);
  assert.equal(normalizeJanitorBudget(0), 1, "保留旧调用方的零值兜底");
  assert.equal(normalizeJanitorBudget(-3), 1, "负值不得让 SQL LIMIT 变成负数");
  assert.throws(() => normalizeJanitorBudget(Number.NaN), /janitor batch/);
  assert.throws(() => normalizeJanitorBudget(Number.POSITIVE_INFINITY), /janitor batch/);
  assert.throws(() => normalizeJanitorBudget(Number.MAX_SAFE_INTEGER + 1), /janitor batch/);
});

test("janitor frozen_at accepts driver dates and rejects malformed cursor values", () => {
  const date = new Date("2026-08-28T12:34:56.123Z");
  const normalizedDate = normalizeJanitorFrozenAt(date);
  assert.notStrictEqual(normalizedDate, date, "Date 应复制，避免调用方修改游标");
  assert.equal((normalizedDate as Date).getTime(), date.getTime());
  const text = "2026-08-28 12:34:56.123";
  assert.equal(normalizeJanitorFrozenAt(text), text);
  for (const bad of ["", "   ", "0", "123junk", "not-a-date", "2026-99-99", null, undefined, 0, new Date(Number.NaN)]) {
    assert.throws(() => normalizeJanitorFrozenAt(bad), /user_archive\.frozen_at/);
  }
});
