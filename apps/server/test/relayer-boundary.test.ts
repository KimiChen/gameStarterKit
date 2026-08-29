import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeOutboxMetadata,
  relayerTick,
  type RelayerDependencies,
} from "../src/core/economy/relayer";
import { LeaseLostError, type SingletonLease } from "../src/core/infra/lease";
import { OUTBOX_DEAD, OUTBOX_MAX_ATTEMPTS, OUTBOX_PENDING } from "../src/core/infra/config";
import type { PoolConnection } from "../src/core/infra/mysql";

test("relayer outbox metadata normalizes mysql numeric strings before routing/arithmetic", () => {
  assert.deepEqual(
    normalizeOutboxMetadata({ server_id: "9", attempts: "2" }),
    { serverId: 9, attempts: 2 },
  );
  assert.deepEqual(
    normalizeOutboxMetadata({ server_id: 0, attempts: 0 }),
    { serverId: 0, attempts: 0 },
  );
});

test("relayer outbox metadata rejects malformed or overflowing durable values", () => {
  for (const row of [
    { server_id: "9junk", attempts: "0" },
    { server_id: "1", attempts: "2.5" },
    { server_id: -1, attempts: 0 },
    { server_id: 65_536, attempts: 0 },
    { server_id: 0, attempts: 65_535 },
  ]) {
    assert.throws(() => normalizeOutboxMetadata(row), /outbox\.(server_id|attempts)/);
  }
});

const lease = (holder: string): SingletonLease => ({
  leaseName: "outbox_relayer",
  holder,
  fenceToken: 1,
});

const pendingRow = {
  op_id: "op-boundary",
  user_id: "user-boundary",
  server_id: "9",
  effect: [{ kind: "item" as const, itemId: 29, count: 1 }],
  attempts: "0",
};

test("relayer runs apply, thaw, and trim only after guarded transactions close", async () => {
  let txDepth = 0;
  let txCalls = 0;
  let applyCalls = 0;
  const events: string[] = [];

  const connection = {
    query: async () => [[pendingRow]],
    execute: async () => [{ affectedRows: 1 }],
  } as unknown as PoolConnection;
  const withLeaseTx: RelayerDependencies["withLeaseTx"] = async <T>(
    _lease: SingletonLease,
    fn: (conn: PoolConnection) => Promise<T>,
  ): Promise<T> => {
    txCalls++;
    txDepth++;
    events.push("tx:start");
    try { return await fn(connection); }
    finally {
      events.push("tx:end");
      txDepth--;
    }
  };
  const dependencies: RelayerDependencies = {
    withLeaseTx,
    redisApply: async () => {
      assert.equal(txDepth, 0, "Redis apply must not run inside MySQL transaction");
      applyCalls++;
      events.push(`apply:${applyCalls}`);
      return applyCalls === 1 ? "cold" : "ok";
    },
    ensureLive: async () => {
      assert.equal(txDepth, 0, "thaw must not run inside MySQL transaction");
      events.push("thaw");
    },
    trimApplied: async () => {
      assert.equal(txDepth, 0, "trim must not run inside MySQL transaction");
      events.push("trim");
      return 0;
    },
    random: () => 0,
    reportFailure: () => assert.fail("successful apply must not report a failure"),
  };

  assert.equal(await relayerTick(lease("leader"), dependencies), 1);
  assert.equal(txCalls, 2, "selection and finalization use separate short transactions");
  assert.deepEqual(events, [
    "tx:start", "tx:end",
    "apply:1", "thaw", "apply:2",
    "tx:start", "tx:end",
    "trim",
  ]);
});

test("lease loss after apply blocks stale finalization and successor converges by dup replay", async () => {
  let applied = false;
  let done = false;
  const applyResults: string[] = [];

  const redisApply: RelayerDependencies["redisApply"] = async () => {
    const result = applied ? "dup" : "ok";
    applied = true;
    applyResults.push(result);
    return result;
  };

  let staleTxCall = 0;
  const staleConnection = {
    query: async () => [[pendingRow]],
    execute: async () => {
      done = true;
      return [{ affectedRows: 1 }];
    },
  } as unknown as PoolConnection;
  const staleDependencies: RelayerDependencies = {
    withLeaseTx: async <T>(_lease: SingletonLease, fn: (conn: PoolConnection) => Promise<T>): Promise<T> => {
      staleTxCall++;
      if (staleTxCall === 2) { throw new LeaseLostError("outbox_relayer"); }
      return fn(staleConnection);
    },
    redisApply,
    ensureLive: async () => {},
    trimApplied: async () => 0,
    random: () => 1,
    reportFailure: () => assert.fail("lease loss must not report an uncommitted transition"),
  };

  await assert.rejects(
    relayerTick(lease("stale"), staleDependencies),
    (error: unknown) => error instanceof LeaseLostError,
  );
  assert.equal(applied, true, "external effect may commit before lease loss is observed");
  assert.equal(done, false, "stale leader cannot finalize the MySQL row");

  const successorConnection = {
    query: async () => [[pendingRow]],
    execute: async () => {
      done = true;
      return [{ affectedRows: 1 }];
    },
  } as unknown as PoolConnection;
  const successorDependencies: RelayerDependencies = {
    withLeaseTx: async <T>(_lease: SingletonLease, fn: (conn: PoolConnection) => Promise<T>): Promise<T> =>
      fn(successorConnection),
    redisApply,
    ensureLive: async () => {},
    trimApplied: async () => 0,
    random: () => 1,
    reportFailure: () => assert.fail("successful replay must not report a failure"),
  };

  assert.equal(await relayerTick(lease("successor"), successorDependencies), 1);
  assert.equal(done, true);
  assert.deepEqual(applyResults, ["ok", "dup"]);
});

test("relayer failure accounting commits retry/dead transitions before reporting", async () => {
  for (const item of [
    { attempts: "0", expectedAttempts: 1, expectedStatus: OUTBOX_PENDING, reports: 0 },
    {
      attempts: String(OUTBOX_MAX_ATTEMPTS),
      expectedAttempts: OUTBOX_MAX_ATTEMPTS + 1,
      expectedStatus: OUTBOX_DEAD,
      reports: 1,
    },
  ]) {
    let txDepth = 0;
    const updates: unknown[][] = [];
    const reports: string[] = [];
    const row = { ...pendingRow, attempts: item.attempts };
    const connection = {
      query: async () => [[row]],
      execute: async (_sql: string, params: unknown[]) => {
        updates.push(params);
        return [{ affectedRows: 1 }];
      },
    } as unknown as PoolConnection;
    const dependencies: RelayerDependencies = {
      withLeaseTx: async <T>(_lease: SingletonLease, fn: (conn: PoolConnection) => Promise<T>): Promise<T> => {
        txDepth++;
        try { return await fn(connection); }
        finally { txDepth--; }
      },
      redisApply: async () => {
        assert.equal(txDepth, 0);
        throw new Error("apply failed");
      },
      ensureLive: async () => assert.fail("failed apply must not thaw"),
      trimApplied: async () => assert.fail("failed apply must not trim"),
      random: () => 0,
      reportFailure: (message) => {
        assert.equal(txDepth, 0, "dead-letter reporting must run after commit");
        reports.push(message);
      },
    };

    assert.equal(await relayerTick(lease("failure"), dependencies), 1);
    assert.deepEqual(updates[0], [
      item.expectedAttempts,
      "Error: apply failed",
      item.expectedStatus,
      row.op_id,
      9,
      OUTBOX_PENDING,
    ]);
    assert.equal(reports.length, item.reports);
  }
});

test("relayer corrupt metadata uses pending CAS and reports only a committed dead letter", async () => {
  for (const affectedRows of [0, 1]) {
    let txDepth = 0;
    const reports: string[] = [];
    const row = { ...pendingRow, server_id: "bad-zone" };
    const connection = {
      query: async () => [[row]],
      execute: async (_sql: string, params: unknown[]) => {
        assert.deepEqual(params.slice(2), [OUTBOX_DEAD, row.op_id, OUTBOX_PENDING]);
        return [{ affectedRows }];
      },
    } as unknown as PoolConnection;
    const dependencies: RelayerDependencies = {
      withLeaseTx: async <T>(_lease: SingletonLease, fn: (conn: PoolConnection) => Promise<T>): Promise<T> => {
        txDepth++;
        try { return await fn(connection); }
        finally { txDepth--; }
      },
      redisApply: async () => assert.fail("corrupt metadata must fail before Redis"),
      ensureLive: async () => assert.fail("corrupt metadata must fail before thaw"),
      trimApplied: async () => assert.fail("corrupt metadata must not trim"),
      random: () => 0,
      reportFailure: (message) => {
        assert.equal(txDepth, 0);
        reports.push(message);
      },
    };

    assert.equal(await relayerTick(lease("corrupt"), dependencies), 1);
    assert.equal(reports.length, affectedRows);
  }
});

test("relayer lost failure guard and zero-row finalization produce no stale report or trim", async () => {
  let failureTx = 0;
  const failureDependencies: RelayerDependencies = {
    withLeaseTx: async <T>(_lease: SingletonLease, fn: (conn: PoolConnection) => Promise<T>): Promise<T> => {
      failureTx++;
      if (failureTx === 2) throw new LeaseLostError("outbox_relayer");
      return fn({ query: async () => [[pendingRow]] } as unknown as PoolConnection);
    },
    redisApply: async () => { throw new Error("apply failed"); },
    ensureLive: async () => {},
    trimApplied: async () => 0,
    random: () => 0,
    reportFailure: () => assert.fail("lost failure transaction must not report"),
  };
  await assert.rejects(
    relayerTick(lease("lost-failure"), failureDependencies),
    (error: unknown) => error instanceof LeaseLostError,
  );

  let trimCalls = 0;
  let successTx = 0;
  const successDependencies: RelayerDependencies = {
    withLeaseTx: async <T>(_lease: SingletonLease, fn: (conn: PoolConnection) => Promise<T>): Promise<T> => {
      successTx++;
      const connection = successTx === 1
        ? { query: async () => [[pendingRow]] }
        : { execute: async () => [{ affectedRows: 0 }] };
      return fn(connection as unknown as PoolConnection);
    },
    redisApply: async () => "ok",
    ensureLive: async () => {},
    trimApplied: async () => { trimCalls++; return 0; },
    random: () => 0,
    reportFailure: () => assert.fail("successful apply must not report"),
  };
  assert.equal(await relayerTick(lease("zero-finalize"), successDependencies), 1);
  assert.equal(trimCalls, 0, "zero-row finalization must not trim idempotency evidence");
});
