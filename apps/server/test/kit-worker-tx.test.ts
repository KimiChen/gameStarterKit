/**
 * withKitWorkerTx（core/infra/kitApi.ts；docs/MMO.md MF7a-B3）单测：假 pool + 假 singleton_lease 行，⛔ 不连真库
 * （真库两 worker 争租 / 失租写被拒在 test/int/kit-worker-lease.test.ts）。
 * - 守卫是事务首句（同连接）：**真** renewLeaseGuard 跑在假连接上，假连接按语句里出现的谓词（lease_name / holder / fence_token）
 *   逐个比对后答 `Rows matched`；
 * - 失租（被别的 holder 顶替 / 旧 fence 同 holder）⇒ LeaseLostError、整体回滚、回调零执行；
 * - 租约名 ≠ kit:<kit>:<worker> / fence < 1 / sId 非法 ⇒ 触库前拒；越表拒；`.conn` 抛；回调内另开 withKitTx / withKitWorkerTx 拒；
 * - 提交后逐 uid 失效余额缓存；句柄暴露 kitId / workerId / sId / fenceToken。
 * 变异验证：core/infra/lease.ts renewLeaseGuard 删 `AND fence_token = ?`（及其参数）→ 「旧 fence 同 holder 写被拒」转红；
 * kitApi.ts 删守卫首句 → 「被顶替」「旧 fence」双双转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { KitTableAccessError, withKitTx, withKitWorkerTx, type KitWorkerTxDeps } from "../src/core/infra/kitApi";
import { LeaseLostError, renewLeaseGuard, type SingletonLease } from "../src/core/infra/lease";
import type { PoolConnection } from "../src/core/infra/mysql";
import { KIT_EFFECT_KINDS } from "@game/shared/kits/catalog.generated";

interface LeaseRow { readonly leaseName: string; readonly holder: string; readonly fence: number }
interface State {
  executed: { sql: string; params: unknown[] }[];
  committed: number;
  rolledBack: number;
  invalidated: [string, number][];
  debits: unknown[][];
}

function fakeWorkerDeps(row: LeaseRow): { deps: KitWorkerTxDeps; state: State } {
  const state: State = { executed: [], committed: 0, rolledBack: 0, invalidated: [], debits: [] };
  const conn = {
    execute: async (sql: string, params: unknown[]) => {
      state.executed.push({ sql, params });
      if (/UPDATE singleton_lease/u.test(sql)) {
        // 假 singleton_lease 行：谓词按语句实际出现的逐个比对（删掉 fence 谓词的变异 ⇒ 旧 fence 也能匹配）
        const [, leaseName, holder, fence] = params;
        const fenceOk = !sql.includes("fence_token = ?") || Number(fence) === row.fence;
        const matched = leaseName === row.leaseName && holder === row.holder && fenceOk ? 1 : 0;
        return [{ affectedRows: matched, info: `Rows matched: ${matched}  Changed: ${matched}  Warnings: 0` }, []];
      }
      return [[{ ok: 1 }], []];
    },
    query: async () => [[], []],
  } as unknown as PoolConnection;
  const deps: KitWorkerTxDeps = {
    withRcTx: async (fn) => {
      try { const r = await fn(conn); state.committed++; return r; }
      catch (e) { state.rolledBack++; throw e; }
    },
    renewLeaseGuard,
    debitInTx: async (...args) => { state.debits.push(args); return 90; },
    creditInTx: async () => 110,
    insertOutboxIntent: async () => "INSERTED",
    assertOutboxIntentMatches: async () => undefined,
    invalidateBalanceCache: async (uid, sId) => { state.invalidated.push([uid, sId]); },
    kinds: KIT_EFFECT_KINDS,
  };
  return { deps, state };
}

const LEASE: SingletonLease = { leaseName: "kit:arena:tick", holder: "h1", fenceToken: 7 };
const ROW: LeaseRow = { leaseName: "kit:arena:tick", holder: "h1", fence: 7 };

test("守卫是事务首句（同连接、三谓词），之后才放业务 SQL；提交后失效余额缓存；句柄暴露身份与 fence", async () => {
  const { deps, state } = fakeWorkerDeps(ROW);
  const out = await withKitWorkerTx("arena", "tick", 3, LEASE, async (tx) => {
    assert.deepEqual([tx.kitId, tx.workerId, tx.sId, tx.fenceToken], ["arena", "tick", 3, 7]);
    await tx.query("UPDATE k_arena_tile SET owner = ? WHERE server_id = ? AND x = ?", ["u1", 3, 1]);
    assert.equal(await tx.debit("u1", 1, 10, 5, "op-1", "worker"), 90);
    return "done";
  }, deps);
  assert.equal(out, "done");
  assert.match(state.executed[0]?.sql ?? "", /UPDATE singleton_lease/u, "首句是守卫");
  assert.deepEqual(state.executed[0]?.params.slice(1), ["kit:arena:tick", "h1", 7]);
  assert.match(state.executed[1]?.sql ?? "", /UPDATE k_arena_tile/u);
  assert.equal(state.committed, 1);
  assert.equal(state.debits.length, 1);
  assert.deepEqual(state.invalidated, [["u1", 3]]);
});

test("失租：被别的 holder 顶替 ⇒ 首句 0 行 ⇒ LeaseLostError、整体回滚、回调零执行", async () => {
  const { deps, state } = fakeWorkerDeps({ ...ROW, holder: "h2", fence: 8 });
  let ran = false;
  await assert.rejects(withKitWorkerTx("arena", "tick", 3, LEASE, async () => { ran = true; }, deps), LeaseLostError);
  assert.equal(ran, false);
  assert.deepEqual([state.committed, state.rolledBack, state.executed.length], [0, 1, 1], "只跑了守卫一句就回滚");
  assert.deepEqual(state.invalidated, []);
});

test("旧 fence 同 holder（过期后自己抢回、残留的旧 lease 对象）写被拒——fence 谓词就是存储边界", async () => {
  const { deps, state } = fakeWorkerDeps({ ...ROW, fence: 8 }); // 库里 fence 已 8，手上 lease 还是 7
  await assert.rejects(
    withKitWorkerTx("arena", "tick", 3, LEASE, async (tx) => { await tx.query("DELETE FROM k_arena_tile WHERE x = 1"); }, deps),
    LeaseLostError,
  );
  assert.deepEqual([state.committed, state.rolledBack, state.executed.length], [0, 1, 1]);
});

test("租约名必须恰是 kit:<kit>:<worker>：借别的 worker / kit 的租约、fence < 1、sId 非法一律在触库前拒", async () => {
  const { deps, state } = fakeWorkerDeps(ROW);
  await assert.rejects(withKitWorkerTx("arena", "sweep", 3, LEASE, async () => undefined, deps), /不属于 worker kit:arena:sweep/u);
  await assert.rejects(withKitWorkerTx("slg", "tick", 3, LEASE, async () => undefined, deps), /不属于 worker kit:slg:tick/u);
  await assert.rejects(withKitWorkerTx("arena", "tick", 3, { ...LEASE, fenceToken: 0 }, async () => undefined, deps), /fence_token 0 非法/u);
  await assert.rejects(withKitWorkerTx("arena", "tick", 70000, LEASE, async () => undefined, deps), /sId 70000 非法/u);
  await assert.rejects(withKitWorkerTx("Arena", "tick", 3, LEASE, async () => undefined, deps), TypeError);
  assert.equal(state.executed.length, 0);
});

test("越表拒（表闸同 withKitTx）；`.conn` 抛；回调内另开 withKitTx / withKitWorkerTx 拒；作用域随事务结束", async () => {
  const { deps, state } = fakeWorkerDeps(ROW);
  await assert.rejects(
    withKitWorkerTx("arena", "tick", 3, LEASE, async (tx) => { await tx.query("SELECT balance FROM user_currency WHERE user_id = ?", ["u"]); }, deps),
    KitTableAccessError,
  );
  assert.equal(state.rolledBack, 1);
  await assert.rejects(
    withKitWorkerTx("arena", "tick", 3, LEASE, async (tx) => { void (tx as unknown as { conn: unknown }).conn; }, deps),
    /取原始连接 \.conn/u,
  );
  await assert.rejects(
    withKitWorkerTx("arena", "tick", 3, LEASE, async () => withKitTx("arena", 3, async () => undefined, deps), deps),
    /kit worker 事务（kit:arena:tick）内 ⛔ 另开 withKitTx/u,
  );
  await assert.rejects(
    withKitWorkerTx("arena", "tick", 3, LEASE, async () => withKitWorkerTx("arena", "tick", 3, LEASE, async () => undefined, deps), deps),
    /另开 withKitWorkerTx/u,
  );
  assert.equal(state.committed, 0);
  // 作用域只在回调内：事务结束后普通 withKitTx 照常
  await withKitTx("arena", 3, async () => undefined, deps);
  assert.equal(state.committed, 1);
});
