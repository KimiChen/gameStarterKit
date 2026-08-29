import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  janitorSweepWithDependencies,
  normalizeJanitorBudget,
  normalizeJanitorFrozenAt,
  readPinnedUserHash,
  resetJanitorCursor,
  resetSweepCursor,
  sweepOnceWithDependencies,
  type JanitorSweepDependencies,
  type SweepDependencies,
} from "../src/core/archive/freezeWorker";
import { LeaseLostError, type SingletonLease } from "../src/core/infra/lease";
import type { RowDataPacket } from "../src/core/infra/mysql";
import { currentZoneId } from "../src/core/infra/keys";
import type Redis from "ioredis";
import { WHALE_FIELDS } from "../src/core/infra/config";

// The janitor algorithm is exercised with storage adapters, while the normal
// integration suite covers the concrete Redis/MySQL adapters.  Keeping a
// stable lease value is enough because the injected visit function does not
// perform lease I/O.
const lease = { leaseName: "freeze_worker", holder: "test", fenceToken: 1 } as SingletonLease;

afterEach(() => { resetJanitorCursor(); resetSweepCursor(); });

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

function row(userId: string, frozenAt = "2026-08-28 00:00:00.000", serverId = 0): RowDataPacket {
  return { user_id: userId, server_id: serverId, frozen_at: frozenAt } as RowDataPacket;
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
    query: async (_sId, cursor) => {
      cursors.push(cursor === null ? null : { ...cursor });
      return pages.shift() ?? [];
    },
    visit: async (uid) => { visited.push(uid); return "unchanged"; },
  };

  assert.deepEqual((await janitorSweepWithDependencies(lease, 1, [0], deps)), {
    scanned: 1, deleted: 0, repaired: 0,
  });
  assert.deepEqual((await janitorSweepWithDependencies(lease, 1, [0], deps)), {
    scanned: 1, deleted: 0, repaired: 0,
  });
  // An exact-size page retains the cursor; the empty query starts a new cycle.
  assert.deepEqual((await janitorSweepWithDependencies(lease, 1, [0], deps)), {
    scanned: 0, deleted: 0, repaired: 0,
  });
  assert.deepEqual((await janitorSweepWithDependencies(lease, 1, [0], deps)), {
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

test("janitor 每区独立游标：同时间同 uid 的两个配置区都不会被跳过", async () => {
  const cursors: Array<{ sId: number; userId: string | null }> = [];
  const visits: string[] = [];
  const deps: JanitorSweepDependencies = {
    query: async (sId, cursor) => {
      cursors.push({ sId, userId: cursor?.userId ?? null });
      return [row("same", "2026-08-28 00:00:00.000", sId)];
    },
    visit: async (uid, sId) => { visits.push(`${sId}:${uid}`); return "unchanged"; },
  };
  await janitorSweepWithDependencies(lease, 1, [1, 2], deps);
  await janitorSweepWithDependencies(lease, 1, [1, 2], deps);
  assert.deepEqual(cursors, [{ sId: 1, userId: null }, { sId: 2, userId: null }]);
  assert.deepEqual(visits, ["1:same", "2:same"]);
});

test("janitor 只查询配置区，满区轮转且空区 probe 计入总预算", async () => {
  const fullQueries: number[] = [];
  const fullDeps: JanitorSweepDependencies = {
    query: async (sId, _cursor, budget) => {
      fullQueries.push(sId);
      return Array.from({ length: budget }, (_, i) => row(`u${sId}_${i}`));
    },
    visit: async () => "unchanged",
  };
  await janitorSweepWithDependencies(lease, 2, [1, 2], fullDeps);
  await janitorSweepWithDependencies(lease, 1, [1, 2], fullDeps);
  assert.deepEqual(fullQueries, [1, 2], "满区吃完预算后，下轮必须从后继区开始");

  resetJanitorCursor();
  const emptyQueries: number[] = [];
  const emptyDeps: JanitorSweepDependencies = {
    query: async (sId) => { emptyQueries.push(sId); return []; },
    visit: async () => { throw new Error("空区不得 visit"); },
  };
  await janitorSweepWithDependencies(lease, 2, [1, 2, 3], emptyDeps);
  assert.deepEqual(emptyQueries, [1, 2], "空区 query 次数不得超过总预算");
  await janitorSweepWithDependencies(lease, 1, [1, 2, 3], emptyDeps);
  assert.deepEqual(emptyQueries, [1, 2, 3], "下一轮继续后继区");
  assert.ok(!emptyQueries.includes(9), "未配置区绝不 query/visit");
});

function sweepDeps(overrides: Partial<SweepDependencies> = {}): SweepDependencies {
  return {
    zones: [1, 2],
    bucketCount: 2,
    ratePerSec: 100,
    queryCandidates: async () => [],
    userExists: async () => true,
    removeCandidate: async () => true,
    deferCandidate: async () => {},
    memoryInfo: async () => "used_memory:80\r\nmaxmemory:100\r\n",
    freeze: async () => "frozen",
    takeRateToken: () => true,
    wait: async () => {},
    guardLease: async () => {},
    ...overrides,
  };
}

test("freeze sweep 的 budget 是跨全部区/桶总预算，满桶后下轮前进到下一槽", async () => {
  const queried: string[] = [];
  const frozen: string[] = [];
  const deps = sweepDeps({
    queryCandidates: async (sId, bucket, _cutoff, limit) => {
      queried.push(`${sId}:${bucket}:${limit}`);
      return Array.from({ length: limit }, (_, i) => `u${sId}_${bucket}_${i}`);
    },
    freeze: async (uid, sId) => {
      assert.equal(currentZoneId(), sId, "worker 必须为每个区建立 zoneCtx");
      frozen.push(`${sId}:${uid}`);
      return "frozen";
    },
  });
  const first = await sweepOnceWithDependencies(lease, 2, deps);
  const second = await sweepOnceWithDependencies(lease, 1, deps);
  assert.equal(first.candidates, 2);
  assert.equal(second.candidates, 1);
  assert.deepEqual(queried, ["1:0:2", "1:1:1"]);
  assert.deepEqual(frozen, ["1:u1_0_0", "1:u1_0_1", "1:u1_1_0"]);
});

test("freeze sweep 全空多区时 slot probe 也消耗预算，下一轮从后继槽继续", async () => {
  const queried: string[] = [];
  const deps = sweepDeps({
    zones: [1, 2],
    bucketCount: 4,
    queryCandidates: async (sId, bucket) => {
      queried.push(`${sId}:${bucket}`);
      return [];
    },
  });
  await sweepOnceWithDependencies(lease, 3, deps);
  assert.deepEqual(queried, ["1:0", "1:1", "1:2"], "空桶查询次数不得超过 totalBudget");
  await sweepOnceWithDependencies(lease, 1, deps);
  assert.deepEqual(queried, ["1:0", "1:1", "1:2", "1:3"], "下轮从后继槽继续而非重扫起点");
});

test("freeze bucket 内永久 skip 不饥饿后继候选，budget=1 有界轮转", async () => {
  const order = ["stuck", "ready"];
  const visited: string[] = [];
  const deps = sweepDeps({
    zones: [1],
    bucketCount: 1,
    queryCandidates: async () => order.slice(0, 1),
    freeze: async (uid) => {
      visited.push(uid);
      return uid === "stuck" ? "skipped" : "frozen";
    },
    deferCandidate: async (_sId, _bucket, uid) => {
      const index = order.indexOf(uid);
      if (index >= 0) { order.push(...order.splice(index, 1)); }
    },
  });

  assert.equal((await sweepOnceWithDependencies(lease, 1, deps)).skipped, 1);
  assert.equal((await sweepOnceWithDependencies(lease, 1, deps)).frozen, 1);
  assert.deepEqual(visited, ["stuck", "ready"]);
});

test("freeze sweep 在 rate=0/空扫描前也必须先消费 singleton lease", async () => {
  let queries = 0;
  const lost = sweepDeps({
    zones: [1],
    bucketCount: 1,
    ratePerSec: 0,
    queryCandidates: async () => { queries++; return []; },
    guardLease: async () => { throw new LeaseLostError("freeze_worker"); },
  });
  await assert.rejects(
    sweepOnceWithDependencies(lease, 1, lost),
    (error: unknown) => error instanceof LeaseLostError,
  );
  assert.equal(queries, 0, "失租必须在任何 Redis 扫描前终止");

  let heartbeats = 0;
  const idle = sweepDeps({
    zones: [1],
    bucketCount: 1,
    ratePerSec: 0,
    guardLease: async () => { heartbeats++; },
  });
  assert.deepEqual(await sweepOnceWithDependencies(lease, 1, idle), {
    candidates: 0,
    ghosts: 0,
    frozen: 0,
    skipped: 0,
    lost: 0,
    waterlineSkipped: 0,
    waterlineErrors: 0,
  });
  assert.equal(heartbeats, 1);
});

test("whale 分页扫描钉住初始 ver：旧业务页 + writer + 新 ver 页确定判 changed", async () => {
  let currentVer = "7";
  const events: string[] = [];
  const redis = {
    hget: async () => {
      events.push(`pin:${currentVer}`);
      return currentVer;
    },
    hlen: async () => WHALE_FIELDS + 1,
    hgetall: async () => assert.fail("whale path must not use HGETALL"),
    hscan: async (_key: string, cursor: string) => {
      events.push(`scan:${cursor}`);
      return cursor === "0"
        ? ["1", ["nickname", "old-value"]]
        : ["0", ["schemaVersion", "1", "ver", currentVer]];
    },
  } as unknown as Redis;
  let wrote = false;

  const result = await readPinnedUserHash(redis, "user:{u}", async (cursor) => {
    if (cursor === "1" && !wrote) {
      wrote = true;
      currentVer = "8";
      events.push("writer:8");
    }
  });

  assert.deepEqual(result, { outcome: "changed", verAtRead: "7" });
  assert.deepEqual(events, ["pin:7", "scan:0", "writer:8", "scan:1"]);
});

test("janitor 每行 visit 前守卫 lease，失租不推进游标也不触发 ARCHIVE_NEWER 修复", async () => {
  const cursors: Array<string | null> = [];
  let guards = 0;
  let visits = 0;
  const deps: JanitorSweepDependencies = {
    query: async (_sId, cursor) => {
      cursors.push(cursor?.userId ?? null);
      return [row("archive-newer")];
    },
    guardLease: async () => {
      guards++;
      if (guards === 1) { throw new LeaseLostError("freeze_worker"); }
    },
    visit: async () => { visits++; return "repaired"; },
  };

  await assert.rejects(
    janitorSweepWithDependencies(lease, 1, [0], deps),
    (error: unknown) => error instanceof LeaseLostError,
  );
  assert.equal(visits, 0, "失租时不得进入可能覆写 Redis 的 visit");
  assert.deepEqual(await janitorSweepWithDependencies(lease, 1, [0], deps), {
    scanned: 1,
    deleted: 0,
    repaired: 1,
  });
  assert.deepEqual(cursors, [null, null], "失败行必须从相同 keyset 起点重试");
});

test("freeze sweep 对 maxmemory=0、畸形 INFO 和 INFO 异常均 fail-closed", async () => {
  const cases: Array<() => Promise<string>> = [
    async () => "used_memory:80\r\nmaxmemory:0\r\n",
    async () => "used_memory:bad\r\nmaxmemory:100\r\n",
    async () => { throw new Error("redis unavailable"); },
  ];
  const frozen: string[] = [];
  for (const memoryInfo of cases) {
    resetSweepCursor();
    const stats = await sweepOnceWithDependencies(lease, 1, sweepDeps({
      zones: [3],
      bucketCount: 1,
      queryCandidates: async () => ["candidate"],
      memoryInfo,
      freeze: async (uid) => { frozen.push(uid); return "frozen"; },
    }));
    assert.equal(stats.frozen, 0);
  }
  assert.deepEqual(frozen, []);
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
    query: async (_sId, cursor) => {
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

  await assert.rejects(janitorSweepWithDependencies(lease, 2, [0], deps), /simulated janitor row failure/);
  // The first row succeeded, so the failed second row must leave the cursor at
  // the first row rather than skipping the retry target.
  const result = await janitorSweepWithDependencies(lease, 2, [0], deps);
  assert.deepEqual(result, { scanned: 1, deleted: 1, repaired: 0 });
  assert.deepEqual(cursors, [null, "first"]);

  // The retry page is shorter than the budget, proving that a completed short
  // page starts a fresh cycle on the following invocation.
  const freshCycle = await janitorSweepWithDependencies(lease, 2, [0], deps);
  assert.deepEqual(freshCycle, { scanned: 1, deleted: 1, repaired: 0 });
  assert.deepEqual(cursors, [null, "first", null]);
});
