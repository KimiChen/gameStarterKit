/** SLG SQL/Redis 真实集成：并发竞争、永久回执、事务故障、到达排序与提交序。 */
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { SLG_MAP_W, SLG_MAP_H, SLG_CHUNK_SIZE, tileIdFromGrid } from "@game/shared/kits/slg/api/worldmap/index";
import { createSlgApi, slgOperation, type SlgApiDeps } from "../../src/kits/slg/service";
import { createUser } from "../../src/core/userRecord";
import { CUR_GOLD, withKitTx } from "../../src/core/infra/kitApi";
import { closeMysql, getPool, withRcTx, type RowDataPacket } from "../../src/core/infra/mysql";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { zoneCtx } from "../../src/core/infra/keys";
import { creditInTx, getBalance, invalidateBalanceCache } from "../../src/core/economy/currency";
import { deriveOpId } from "../../src/core/economy/outbox";
import { assertRedisUp, cleanupUser } from "./helpers";

const zones: number[] = [];
const users: { uid: string; sId: number }[] = [];
const HASH = "c".repeat(64);
const RECT = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const tables = ["k_slg_capture", "k_slg_march_receipt", "k_slg_tile_log", "k_slg_march_log", "k_slg_march", "k_slg_tile", "k_slg_revision"];
before(async () => { await assertRedisUp(); });
after(async () => {
  try {
    for (const { uid, sId } of users) {
      await getPool().execute("DELETE FROM currency_ledger WHERE user_id = ? AND server_id = ?", [uid, sId]);
      await getPool().execute("DELETE FROM user_currency WHERE user_id = ? AND server_id = ?", [uid, sId]);
      await getPool().execute("DELETE FROM gameplay_outbox WHERE user_id = ? AND server_id = ?", [uid, sId]);
      await invalidateBalanceCache(uid, sId);
      await zoneCtx.run({ sId }, () => cleanupUser(uid));
    }
    for (const sId of zones) for (const table of tables) await getPool().execute(`DELETE FROM ${table} WHERE server_id = ?`, [sId]);
  } finally { await closeRedis(); await closeMysql(); }
});
async function fixture(overrides: Partial<SlgApiDeps> = {}) {
  let sId = 0;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = randomInt(50000, 65000);
    if (zones.includes(candidate)) continue;
    try {
      await getPool().execute("INSERT INTO k_slg_revision (server_id, revision) VALUES (?, 0)", [candidate]);
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { errno?: number }).errno === 1062) continue;
      throw error;
    }
    sId = candidate; zones.push(sId); break;
  }
  assert.ok(sId, "预留空的测试区，绝不清理已有区的数据");
  let now = 1000;
  const api = createSlgApi({ now: () => now, ...overrides });
  async function user(gold = 100) {
    const uid = `slgt-${randomUUID().slice(0, 25)}`;
    users.push({ uid, sId });
    await zoneCtx.run({ sId }, () => createUser(uid));
    if (gold) await withRcTx((conn) => creditInTx(conn, uid, sId, CUR_GOLD, gold, deriveOpId(uid, sId, "slg.test.seed", "once"), "slg.test.seed"));
    return uid;
  }
  return {
    api, sId, user,
    at(value: number) { now = value; },
    op(uid: string, kind: "capture" | "dispatch" | "recall", id: string) { return slgOperation(uid, sId, kind, id, { hash: HASH, contractVersion: 1 }); },
    async count(table: string) { assert.ok(tables.includes(table)); const [rows] = await getPool().query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${table} WHERE server_id = ?`, [sId]); return Number(rows[0].n); },
    async outbox(uid: string) { const [rows] = await getPool().query<RowDataPacket[]>("SELECT op_id, status FROM gameplay_outbox WHERE user_id = ? AND server_id = ? ORDER BY op_id", [uid, sId]); return rows; },
  };
}

test("slg MySQL：两用户并发争同一不存在格，唯一竞争结果、回执与奖励一致", async () => {
  const f = await fixture(); const a = await f.user(), b = await f.user();
  const results = await Promise.all([f.api.captureTile(a, f.sId, 3, f.op(a, "capture", "a")), f.api.captureTile(b, f.sId, 3, f.op(b, "capture", "b"))]);
  assert.ok(results.every((r) => r.outcome === "captured"), "守备1被下一次直接夺取，两个不同操作均有真实改主");
  assert.equal(await f.count("k_slg_tile"), 1); assert.equal(await f.count("k_slg_capture"), 2);
  assert.equal((await f.outbox(a)).length + (await f.outbox(b)).length, 2);
  const log = await f.api.readChanges(f.sId, 0);
  assert.deepEqual(log.changes.map((c) => c.revision), [1, 2]);
  const snapshot = await f.api.readTiles(a, f.sId, RECT);
  assert.deepEqual(snapshot.tiles[0], log.changes[1].payload);
});

test("slg MySQL：同op并发/重建API永久重放一次，payload与契约版本冲突拒绝", async () => {
  const f = await fixture(); const uid = await f.user(); const op = f.op(uid, "capture", "same");
  const results = await Promise.all(Array.from({ length: 8 }, () => f.api.captureTile(uid, f.sId, 5, op)));
  assert.ok(results.every((r) => JSON.stringify(r) === JSON.stringify(results[0])));
  assert.equal(await f.count("k_slg_capture"), 1); assert.equal(await f.count("k_slg_tile_log"), 1);
  assert.equal((await f.outbox(uid)).length, 1);
  const restarted = createSlgApi({ now: () => 86400000 });
  assert.deepEqual(await restarted.captureTile(uid, f.sId, 5, op), results[0]);
  await assert.rejects(restarted.captureTile(uid, f.sId, 6, { ...op, hash: "d".repeat(64) }), /不同请求/u);
  await assert.rejects(restarted.captureTile(uid, f.sId, 5, { ...op, contractVersion: 2 }), /旧版/u);
  assert.equal(await f.count("k_slg_tile"), 1);
});

test("slg MySQL/Redis：真实用户fence下并发派遣只容3支，主账本只扣3次；重放原余额", async () => {
  const f = await fixture(); const uid = await f.user();
  await f.api.captureTile(uid, f.sId, 0, f.op(uid, "capture", "source"));
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => f.api.dispatchMarch(uid, f.sId, 0, i + 1, f.op(uid, "dispatch", `m${i}`))));
  const success = results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
  assert.equal(success.length, 3); assert.equal(await getBalance(uid, f.sId), 97);
  assert.equal(await f.count("k_slg_march"), 3); assert.equal(await f.count("k_slg_march_receipt"), 3);
  const [ledger] = await getPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM currency_ledger WHERE user_id = ? AND server_id = ? AND reason = 'slg.march.dispatch'", [uid, f.sId]);
  assert.equal(Number(ledger[0].n), 3);
  const initial = success[0];
  assert.deepEqual(await f.api.dispatchMarch(uid, f.sId, 0, initial.march.toTile, f.op(uid, "dispatch", `m${initial.march.toTile - 1}`)), initial);
});

test("slg MySQL：扣款后回执finalize故障回滚扣款/命令/占位/日志；同op可安全重试", async () => {
  let crash = true;
  const f = await fixture({ run: (sId, fn) => withKitTx("slg", sId, (tx) => fn({ ...tx,
    query: async <T>(sql: string, params: unknown[] = []) => {
      if (crash && sql.startsWith("UPDATE k_slg_march_receipt")) { crash = false; throw new Error("fault after debit before receipt finalize"); }
      return tx.query<T>(sql, params);
    },
  })) });
  const uid = await f.user();
  await f.api.captureTile(uid, f.sId, 0, f.op(uid, "capture", "source"));
  const op = f.op(uid, "dispatch", "crash");
  await assert.rejects(f.api.dispatchMarch(uid, f.sId, 0, 1, op), /fault after debit/u);
  assert.equal(await getBalance(uid, f.sId), 100);
  assert.equal(await f.count("k_slg_march"), 0); assert.equal(await f.count("k_slg_march_receipt"), 0); assert.equal(await f.count("k_slg_march_log"), 0);
  assert.equal((await f.api.dispatchMarch(uid, f.sId, 0, 1, op)).balance, 99);
});

test("slg MySQL：到达/撤回边界在锁后判时；到达补算不随失败撤回回滚", async () => {
  const f = await fixture(); const uid = await f.user();
  await f.api.captureTile(uid, f.sId, 0, f.op(uid, "capture", "source"));
  const first = await f.api.dispatchMarch(uid, f.sId, 0, 1, f.op(uid, "dispatch", "first"));
  f.at(first.march.arriveAt - 1);
  const recallOp = f.op(uid, "recall", "recall");
  assert.equal((await f.api.recallMarch(uid, f.sId, first.march.marchId, recallOp)).march.status, "recalled");
  assert.equal(await getBalance(uid, f.sId), 99);
  const second = await f.api.dispatchMarch(uid, f.sId, 0, 1, f.op(uid, "dispatch", "second"));
  f.at(second.march.arriveAt);
  await assert.rejects(f.api.recallMarch(uid, f.sId, second.march.marchId, f.op(uid, "recall", "late")), /已经结束/u);
  const snapshot = await f.api.readTiles(uid, f.sId, RECT);
  assert.equal(snapshot.tiles.find((t) => t.tileId === 1)?.ownerUid, uid);
  assert.equal(snapshot.myTrophies, 2, "到达奖杯经真实outbox/effect落对应区");
  const changes = (await f.api.readChanges(f.sId, 0)).changes;
  assert.equal(changes.filter((c) => c.entity === "march" && c.tombstone).length, 2);
});

test("slg MySQL：反向插入/两实例并发结算、33条积压跨批次保持顺序并保留提交进度", async () => {
  const f = await fixture(); const a = await f.user(), b = await f.user();
  for (let i = 32; i >= 0; i -= 1) {
    await getPool().execute("INSERT INTO k_slg_march (server_id, march_id, uid, from_tile, to_tile, depart_at, arrive_at, status) VALUES (?, ?, ?, 0, 1, 0, 1000, 'marching')", [f.sId, `seed-${String(i).padStart(2, "0")}`, i % 2 ? b : a]);
  }
  const op = f.op(b, "capture", "instant-after-backlog");
  await assert.rejects(f.api.captureTile(b, f.sId, 1, op), /补算/u);
  const [progress] = await getPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM k_slg_march WHERE server_id = ? AND status = 'arrived'", [f.sId]);
  assert.equal(Number(progress[0].n), 32); assert.equal(await f.count("k_slg_capture"), 0);
  const otherInstance = createSlgApi({ now: () => 1000 });
  const settled = await Promise.all([f.api.settleDueMarches(f.sId), otherInstance.settleDueMarches(f.sId)]);
  assert.equal(settled.reduce((n, r) => n + r.settled, 0), 1);
  const snapshot = await f.api.readTiles(a, f.sId, RECT);
  assert.equal(snapshot.tiles[0].ownerUid, a, "seed32最后到达按稳定ID归属a");
  assert.equal(await f.count("k_slg_march_receipt"), 33);
  assert.equal((await f.outbox(a)).length + (await f.outbox(b)).length, 33);
  const [neutral] = await getPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM k_slg_tile WHERE server_id = ? AND owner_uid = ''", [f.sId]);
  assert.equal(Number(neutral[0].n), 0, "临时中性锁占位未遗留到提交后");
});

test("slg MySQL：写日志后延迟提交，另一事务不能越过revision，提交序即日志序", async () => {
  let release!: () => void, signal!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { signal = resolve; });
  let hold = true;
  const f = await fixture({ run: (sId, fn) => withKitTx("slg", sId, async (tx) => {
    const result = await fn(tx);
    if (hold) { hold = false; signal(); await gate; }
    return result;
  }) });
  const a = await f.user(), b = await f.user();
  const early = f.api.captureTile(a, f.sId, 4, f.op(a, "capture", "early"));
  await ready;
  let laterCommitted = false;
  const independent = createSlgApi({ now: () => 1000 });
  const late = independent.captureTile(b, f.sId, 5, f.op(b, "capture", "late")).then((r) => { laterCommitted = true; return r; });
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(laterCommitted, false);
    assert.equal(await f.count("k_slg_tile_log"), 0, "事务外看不到未提交日志");
  } finally { release(); }
  await Promise.all([early, late]);
  const changes = (await independent.readChanges(f.sId, 0)).changes;
  assert.deepEqual(changes.map((c) => c.revision), [1, 2]);
  assert.deepEqual(changes.map((c) => (c.payload as { ownerUid: string }).ownerUid), [a, b]);
});

test("slg MySQL：提交后Redis提示/effect不可用，日志仍完整且重放不双发intent", async () => {
  const f = await fixture({ applyEffect: async () => { throw new Error("Redis unavailable after SQL commit"); } });
  const uid = await f.user(); const op = f.op(uid, "capture", "redis-down");
  const first = await f.api.captureTile(uid, f.sId, 9, op);
  assert.deepEqual(await f.api.captureTile(uid, f.sId, 9, op), first);
  assert.equal((await f.outbox(uid)).length, 1); assert.equal(Number((await f.outbox(uid))[0].status), 0);
  const independent = createSlgApi({ now: () => 1000 });
  const changes = await independent.readChanges(f.sId, 0);
  assert.deepEqual(changes.changes[0].payload, first.tile);
  assert.equal(changes.nextCursor, 1);
});

test("slg MySQL：1500×1500地图边缘chunk稀疏分页与跨区隔离，不种默认格或读入邻接行", async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const f = await fixture({ run: (sId, fn) => withKitTx("slg", sId, (tx) => fn({ ...tx,
    query: async <T>(sql: string, params: unknown[] = []) => {
      queries.push({ sql, params }); return tx.query<T>(sql, params);
    },
  })) });
  const other = await fixture(); const uid = await f.user();
  assert.equal(SLG_MAP_W, 1500); assert.equal(SLG_MAP_H, 1500);
  const chunkX = Math.ceil(SLG_MAP_W / SLG_CHUNK_SIZE) - 1, chunkY = Math.ceil(SLG_MAP_H / SLG_CHUNK_SIZE) - 1;
  const edgeTile = tileIdFromGrid(SLG_MAP_W - 1, SLG_MAP_H - 1);
  await f.api.captureTile(uid, f.sId, edgeTile, f.op(uid, "capture", "edge"));
  await f.api.captureTile(uid, f.sId, tileIdFromGrid(chunkX * SLG_CHUNK_SIZE - 1, SLG_MAP_H - 1), f.op(uid, "capture", "neighbor"));
  const edge = await f.api.readTiles(uid, f.sId, { minX: chunkX, maxX: chunkX, minY: chunkY, maxY: chunkY });
  assert.equal(edge.tiles.length, 1); assert.equal(edge.tiles[0].tileId, edgeTile);
  assert.equal(await f.count("k_slg_tile"), 2, "225 万默认格不落SQL，仅存两条被修改格");
  await f.api.readTiles(uid, f.sId, { minX: chunkX - 1, maxX: chunkX, minY: chunkY - 1, maxY: chunkY });
  const reads = queries.filter((query) => query.sql.includes("FROM k_slg_tile") && query.sql.includes(" OR "));
  assert.equal(reads.length, 2);
  for (const query of reads) {
    assert.doesNotMatch(query.sql, /MOD|FLOOR/u, "不按整张1500宽的跨度扫描后过滤");
    const ranges = query.params.slice(1);
    assert.ok(ranges.length <= 128, "最多64个行范围，所有坐标参数绑定");
    let candidates = 0;
    for (let i = 0; i < ranges.length; i += 2) candidates += Number(ranges[i + 1]) - Number(ranges[i]) + 1;
    assert.ok(candidates <= 1024, `SQL候选格由视口限定，实际${candidates}`);
  }
  assert.equal((await other.api.readTiles(uid, other.sId, RECT)).tiles.length, 0);
  const page1 = await f.api.readChanges(f.sId, 0, 1);
  const page2 = await f.api.readChanges(f.sId, page1.nextCursor, 1);
  assert.equal(page2.changes[0].revision, 2);
  assert.equal((await f.api.readChanges(f.sId, 0)).changes.length, 2, "另一消费者不共享游标");
});
