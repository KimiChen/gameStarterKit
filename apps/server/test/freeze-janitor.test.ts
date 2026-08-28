import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  janitorSweepWithDependencies,
  normalizeJanitorBudget,
  normalizeJanitorFrozenAt,
  resetJanitorCursor,
  type JanitorSweepDependencies,
} from "../src/core/archive/freezeWorker";
import type { SingletonLease } from "../src/core/infra/lease";
import type { RowDataPacket } from "../src/core/infra/mysql";

// The janitor algorithm is exercised with storage adapters, while the normal
// integration suite covers the concrete Redis/MySQL adapters.  Keeping a
// stable lease value is enough because the injected visit function does not
// perform lease I/O.
const lease = { leaseName: "freeze_worker", holder: "test", fenceToken: 1 } as SingletonLease;

afterEach(() => { resetJanitorCursor(); });

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

function row(userId: string, frozenAt = "2026-08-28 00:00:00.000"): RowDataPacket {
  return { user_id: userId, frozen_at: frozenAt } as RowDataPacket;
}

test("janitor cursor continues across calls and resets after an empty page", async () => {
  const cursors: Array<{ frozenAt: Date | string; userId: string } | null> = [];
  const visited: string[] = [];
  const pages = [
    [row("u1", "2026-08-27 23:59:59.000")],
    [row("u2", "2026-08-28 00:00:00.000")],
    [],
    [row("u1", "2026-08-27 23:59:59.000")],
  ];
  const deps: JanitorSweepDependencies = {
    query: async (cursor) => {
      cursors.push(cursor === null ? null : { ...cursor });
      return pages.shift() ?? [];
    },
    visit: async (uid) => { visited.push(uid); return "unchanged"; },
  };

  assert.deepEqual((await janitorSweepWithDependencies(lease, 1, deps)), {
    scanned: 1, deleted: 0, repaired: 0,
  });
  assert.deepEqual((await janitorSweepWithDependencies(lease, 1, deps)), {
    scanned: 1, deleted: 0, repaired: 0,
  });
  // An exact-size page retains the cursor; the empty query starts a new cycle.
  assert.deepEqual((await janitorSweepWithDependencies(lease, 1, deps)), {
    scanned: 0, deleted: 0, repaired: 0,
  });
  assert.deepEqual((await janitorSweepWithDependencies(lease, 1, deps)), {
    scanned: 1, deleted: 0, repaired: 0,
  });
  assert.deepEqual(cursors, [
    null,
    { frozenAt: "2026-08-27 23:59:59.000", userId: "u1" },
    { frozenAt: "2026-08-28 00:00:00.000", userId: "u2" },
    null,
  ]);
  assert.deepEqual(visited, ["u1", "u2", "u1"]);
});

test("janitor short page resets the cursor, and a failed row is retried without advancing it", async () => {
  const cursors: Array<string | null> = [];
  let shouldFail = true;
  const pages = [
    [row("first"), row("retry")],
    [row("retry")],
    [row("fresh")],
  ];
  const deps: JanitorSweepDependencies = {
    query: async (cursor) => {
      cursors.push(cursor?.userId ?? null);
      return pages.shift() ?? [];
    },
    visit: async (uid) => {
      if (uid === "retry" && shouldFail) {
        shouldFail = false;
        throw new Error("simulated janitor row failure");
      }
      return "deleted";
    },
  };

  await assert.rejects(janitorSweepWithDependencies(lease, 2, deps), /simulated janitor row failure/);
  // The first row succeeded, so the failed second row must leave the cursor at
  // the first row rather than skipping the retry target.
  const result = await janitorSweepWithDependencies(lease, 2, deps);
  assert.deepEqual(result, { scanned: 1, deleted: 1, repaired: 0 });
  assert.deepEqual(cursors, [null, "first"]);

  // The retry page is shorter than the budget, proving that a completed short
  // page starts a fresh cycle on the following invocation.
  const freshCycle = await janitorSweepWithDependencies(lease, 2, deps);
  assert.deepEqual(freshCycle, { scanned: 1, deleted: 1, repaired: 0 });
  assert.deepEqual(cursors, [null, "first", null]);
});
