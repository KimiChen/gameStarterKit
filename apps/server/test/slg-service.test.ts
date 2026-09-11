/** 领域规则与事务故障测试；真实 SQL 行锁/提交序另由 test/int/slg-world.test.ts 覆盖。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SLG_SETTLEMENT_BATCH_SIZE, type ISlgMarch } from "@game/shared/kits/slg/api/march/index";
import { SLG_CHUNK_SIZE, slgMapIndex, tileIdToCoord, type ISlgTile } from "@game/shared/kits/slg/api/worldmap/index";
import { type IEffect, type KitTx, InsufficientBalanceError } from "../src/core/infra/kitApi";
import { createSlgApi, slgOperation, type SlgOperation, type SlgTxRunner } from "../src/kits/slg/service";
import type { SlgChange, SlgReceipt, SlgRepository } from "../src/kits/slg/repository";

interface Zone {
  revision: number;
  tiles: Map<number, ISlgTile>;
  marches: Map<string, ISlgMarch>;
  receipts: Map<string, SlgReceipt>;
  changes: SlgChange[];
  balances: Map<string, number>;
  ledger: Set<string>;
  effects: Map<string, { uid: string; effect: IEffect }>;
}
function emptyZone(): Zone {
  return { revision: 0, tiles: new Map(), marches: new Map(), receipts: new Map(), changes: [], balances: new Map(), ledger: new Set(), effects: new Map() };
}
const HASH = "a".repeat(64);
function operation(uid: string, sId: number, name: "capture" | "dispatch" | "recall", req: string): SlgOperation {
  return slgOperation(uid, sId, name, req, { hash: HASH, contractVersion: 1 });
}
function fixture() {
  const zones = new Map<number, Zone>();
  const trophies = new Map<string, number>();
  let now = 1000;
  let failReceipt = false;
  let insertConflict: ISlgTile | undefined;
  let chain = Promise.resolve();
  let commits = 0;
  const applied: { opId: string; commits: number }[] = [];
  const get = (sId: number): Zone => {
    if (!zones.has(sId)) zones.set(sId, emptyZone());
    return zones.get(sId)!;
  };
  const run: SlgTxRunner = async (sId, fn) => {
    const previous = chain;
    let release!: () => void;
    chain = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const z = get(sId);
    const before = structuredClone(z);
    const tx: KitTx = {
      conn: {} as never, kitId: "slg", sId,
      async query<T>(): Promise<T> { throw new Error("unit test must use injected repository"); },
      async debit(uid, _currency, amount, _fence, opId) {
        if (z.ledger.has(opId)) return "DUP";
        if ((z.balances.get(uid) ?? 0) < amount) throw new InsufficientBalanceError();
        const balance = z.balances.get(uid)! - amount;
        z.balances.set(uid, balance);
        z.ledger.add(opId);
        return balance;
      },
      async credit() { throw new Error("SLG v0 does not credit currency"); },
      async enqueueEffect(uid, opId, effect) {
        if (z.effects.has(opId)) return "DUP";
        z.effects.set(opId, { uid, effect });
        return "INSERTED";
      },
    };
    try {
      const result = await fn(tx);
      commits += 1;
      return result;
    } catch (error) {
      zones.set(sId, before);
      throw error;
    } finally { release(); }
  };
  function repository(_tx: KitTx, sId: number): SlgRepository {
    const z = get(sId);
    let locked = false;
    function check(): void { assert.equal(locked, true, "every domain read/write requires revision lock"); }
    return {
      get revision() { check(); return z.revision; },
      async lockRevision() { locked = true; return z.revision; },
      async readTile(tileId) { check(); return z.tiles.get(tileId) ?? { tileId, ownerUid: "", guardPower: 0 }; },
      async insertTile(tile) {
        check();
        if (insertConflict) { z.tiles.set(insertConflict.tileId, insertConflict); insertConflict = undefined; return false; }
        if (z.tiles.has(tile.tileId)) return false;
        z.tiles.set(tile.tileId, tile); return true;
      },
      async updateTile(tile) { check(); z.tiles.set(tile.tileId, tile); },
      async readTiles(mapId, rect) {
        check(); const mapIndex = slgMapIndex(mapId);
        return [...z.tiles.values()].filter((tile) => {
          const p = tileIdToCoord(tile.tileId);
          if (p.mapIndex !== mapIndex) return false;
          const x = Math.floor(p.x / SLG_CHUNK_SIZE), y = Math.floor(p.y / SLG_CHUNK_SIZE);
          return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
        }).sort((a, b) => a.tileId - b.tileId);
      },
      async readReceipt(kind, opId) { check(); return z.receipts.get(`${kind === "capture" ? "capture" : "march"}:${opId}`) ?? null; },
      async insertReceipt(receipt) {
        check();
        if (failReceipt) { failReceipt = false; throw new Error("injected receipt failure"); }
        const key = `${receipt.kind === "capture" ? "capture" : "march"}:${receipt.opId}`;
        assert.equal(z.receipts.has(key), false);
        z.receipts.set(key, structuredClone(receipt));
      },
      async updateReceipt(kind, opId, response) {
        check(); const key = `${kind === "capture" ? "capture" : "march"}:${opId}`;
        const receipt = z.receipts.get(key); assert.ok(receipt);
        z.receipts.set(key, { ...receipt, response: structuredClone(response) });
      },
      async readMarch(id) { check(); return z.marches.get(id) ?? null; },
      async insertMarch(march) { check(); assert.equal(z.marches.has(march.marchId), false); z.marches.set(march.marchId, march); },
      async updateMarch(march) { check(); z.marches.set(march.marchId, march); },
      async readDue(at, limit) { check(); return [...z.marches.values()].filter((m) => m.status === "marching" && m.arriveAt <= at).sort((a, b) => a.arriveAt - b.arriveAt || (a.marchId < b.marchId ? -1 : a.marchId > b.marchId ? 1 : 0)).slice(0, limit); },
      async countActive(uid) { check(); return [...z.marches.values()].filter((m) => m.uid === uid && m.status === "marching").length; },
      async appendTile(tile, op) { check(); z.revision += 1; z.changes.push({ revision: z.revision, entity: "tile", operation: op, payload: tile, tombstone: tile.ownerUid === "" }); return z.revision; },
      async appendMarch(march, op) { check(); z.revision += 1; z.changes.push({ revision: z.revision, entity: "march", operation: op, payload: march, tombstone: march.status !== "marching" }); return z.revision; },
      async readChanges(after, limit) { check(); return z.changes.filter((c) => c.revision > after).slice(0, limit); },
    };
  }
  const api = createSlgApi({
    run, repository, now: () => now,
    withUserFence: async (_uid, _sId, fn) => fn({ fence: 1 }),
    readTrophies: async (uid, sId) => trophies.get(`${sId}:${uid}`) ?? 0,
    applyEffect: async (uid, sId, opId) => {
      applied.push({ opId, commits });
      const key = `${sId}:${uid}`;
      trophies.set(key, (trophies.get(key) ?? 0) + 1);
      return "ok";
    },
  });
  return {
    api, get, applied,
    at(time: number) { now = time; },
    failReceipt() { failReceipt = true; },
    insertConflict(tile: ISlgTile) { insertConflict = tile; },
    own(uid: string, tileId = 0, sId = 1, guardPower = 1) { get(sId).tiles.set(tileId, { tileId, ownerUid: uid, guardPower }); },
    fund(uid: string, n = 100, sId = 1) { get(sId).balances.set(uid, n); },
  };
}
const RECT = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

test("slg 即时守备：无主占领、己方加固封顶、敌方削守备归零当次夺取；只改主发奖", async () => {
  const f = fixture();
  assert.equal((await f.api.captureTile("u", 1, 4, operation("u", 1, "capture", "c1"))).outcome, "captured");
  assert.equal((await f.api.captureTile("u", 1, 4, operation("u", 1, "capture", "c2"))).tile.guardPower, 2);
  const damaged = await f.api.captureTile("v", 1, 4, operation("v", 1, "capture", "c1"));
  assert.deepEqual(damaged, { tile: { tileId: 4, ownerUid: "u", guardPower: 1 }, outcome: "damaged" });
  assert.equal((await f.api.captureTile("v", 1, 4, operation("v", 1, "capture", "c2"))).outcome, "captured");
  f.own("v", 9, 1, 99);
  const rev = f.get(1).revision;
  assert.equal((await f.api.captureTile("v", 1, 9, operation("v", 1, "capture", "cap"))).tile.guardPower, 99);
  assert.equal(f.get(1).revision, rev, "封顶无变更不写虚假日志");
  assert.equal(f.get(1).effects.size, 2);
  assert.ok(f.applied.every((x) => x.commits > 0), "Redis apply 永远在提交之后");
});

test("slg 稀疏INSERT冲突后按实际新主人重读，不覆盖或误发占领奖", async () => {
  const f = fixture();
  f.insertConflict({ tileId: 3, ownerUid: "rival", guardPower: 3 });
  assert.deepEqual(await f.api.captureTile("u", 1, 3, operation("u", 1, "capture", "a")), {
    tile: { tileId: 3, ownerUid: "rival", guardPower: 2 }, outcome: "damaged",
  });
  assert.equal(f.get(1).effects.size, 0);
});

test("slg 回执绑定hash/version，永久重放首次结果，即使地块后来改主；同op并发不重复变更", async () => {
  const f = fixture(), op = operation("u", 1, "capture", "same");
  const [a, b] = await Promise.all([f.api.captureTile("u", 1, 1, op), f.api.captureTile("u", 1, 1, op)]);
  assert.deepEqual(a, b); assert.equal(f.get(1).revision, 1);
  await f.api.captureTile("v", 1, 1, operation("v", 1, "capture", "next"));
  assert.deepEqual(await f.api.captureTile("u", 1, 1, op), a);
  await assert.rejects(f.api.captureTile("u", 1, 2, { ...op, hash: "b".repeat(64) }), /不同请求/u);
  await assert.rejects(f.api.captureTile("u", 1, 1, { ...op, contractVersion: 2 }), /旧版/u);
  assert.equal(f.get(1).effects.size, 2);
});

test("slg 回执写失败回滚地块、日志、revision和outbox intent；重试正常提交", async () => {
  const f = fixture(), op = operation("u", 1, "capture", "crash");
  f.failReceipt();
  await assert.rejects(f.api.captureTile("u", 1, 1, op), /injected/u);
  assert.equal(f.get(1).tiles.size, 0); assert.equal(f.get(1).revision, 0); assert.equal(f.get(1).effects.size, 0);
  assert.equal(f.applied.length, 0);
  await f.api.captureTile("u", 1, 1, op);
  assert.equal(f.get(1).revision, 1);
});

test("slg 派遣：己方起点、1金币、3支限制；回执重放原余额，源地途中失守不影响到达", async () => {
  const f = fixture(); f.own("u"); f.fund("u");
  const op = operation("u", 1, "dispatch", "m1");
  const result = await f.api.dispatchMarch("u", 1, 0, 1, op);
  assert.equal(result.balance, 99); assert.equal(result.march.arriveAt, 2000);
  await f.api.dispatchMarch("u", 1, 0, 2, operation("u", 1, "dispatch", "m2"));
  await f.api.dispatchMarch("u", 1, 0, 3, operation("u", 1, "dispatch", "m3"));
  await assert.rejects(f.api.dispatchMarch("u", 1, 0, 4, operation("u", 1, "dispatch", "m4")), /三支/u);
  assert.deepEqual(await f.api.dispatchMarch("u", 1, 0, 1, op), result);
  assert.equal(f.get(1).balances.get("u"), 97);
  f.own("rival"); f.at(2000);
  await f.api.readTiles("u", 1, "senzhiguo", RECT);
  assert.equal(f.get(1).marches.get(op.opId)?.status, "arrived");
  assert.equal(f.get(1).tiles.get(1)?.ownerUid, "u");
  assert.deepEqual(await f.api.dispatchMarch("u", 1, 0, 1, op), result, "原响应不受已到达或源地失守影响");
});

test("slg 非己方起点、同点、余额不足、派遣回执失败都不遗留命令或扣款", async () => {
  const f = fixture(); f.own("u");
  await assert.rejects(f.api.dispatchMarch("v", 1, 0, 1, operation("v", 1, "dispatch", "bad")), /自己的/u);
  await assert.rejects(f.api.dispatchMarch("u", 1, 0, 0, operation("u", 1, "dispatch", "same")), /different/u);
  await assert.rejects(f.api.dispatchMarch("u", 1, 0, 1, operation("u", 1, "dispatch", "poor")), InsufficientBalanceError);
  f.fund("u"); f.failReceipt();
  await assert.rejects(f.api.dispatchMarch("u", 1, 0, 1, operation("u", 1, "dispatch", "crash")), /injected/u);
  assert.equal(f.get(1).balances.get("u"), 100); assert.equal(f.get(1).ledger.size, 0);
  assert.equal(f.get(1).marches.size, 0); assert.equal(f.get(1).changes.length, 0);
});

test("slg 撤回在到达前结束且不退款；不泄露他人行军；截止当刻先提交到达再拒撤回", async () => {
  const f = fixture(); f.own("u"); f.fund("u");
  const first = await f.api.dispatchMarch("u", 1, 0, 1, operation("u", 1, "dispatch", "m1"));
  await assert.rejects(f.api.recallMarch("v", 1, first.march.marchId, operation("v", 1, "recall", "spy")), /没有/u);
  f.at(1999);
  const recall = operation("u", 1, "recall", "r1");
  const result = await f.api.recallMarch("u", 1, first.march.marchId, recall);
  assert.equal(result.march.status, "recalled"); assert.equal(f.get(1).balances.get("u"), 99);
  assert.deepEqual(await f.api.recallMarch("u", 1, first.march.marchId, recall), result);
  const second = await f.api.dispatchMarch("u", 1, 0, 1, operation("u", 1, "dispatch", "m2"));
  f.at(second.march.arriveAt);
  await assert.rejects(f.api.recallMarch("u", 1, second.march.marchId, operation("u", 1, "recall", "late")), /已经结束/u);
  assert.equal(f.get(1).marches.get(second.march.marchId)?.status, "arrived", "失败撤回不回滚已提交到达");
  assert.equal(f.get(1).tiles.get(1)?.ownerUid, "u");
  assert.equal(f.get(1).changes.filter((c) => c.entity === "march" && c.tombstone).length, 2);
});

test("slg 同目标按到达时间再marchId排序，两并发结算只生效一次；即时操作在旧到达之后", async () => {
  const f = fixture(); f.own("defender", 8, 1, 2);
  // 故意反向插入；相同到达时刻a先削守备、b随后夺取。
  for (const [marchId, uid] of [["b", "b"], ["a", "a"]]) f.get(1).marches.set(marchId, { marchId, uid, fromTile: 7, toTile: 8, departAt: 0, arriveAt: 1000, status: "marching" });
  const results = await Promise.all([f.api.settleDueMarches(1), f.api.settleDueMarches(1)]);
  assert.equal(results.reduce((n, r) => n + r.settled, 0), 2);
  assert.equal(f.get(1).tiles.get(8)?.ownerUid, "b");
  assert.equal(f.get(1).effects.size, 1);
  f.get(1).marches.set("c", { marchId: "c", uid: "c", fromTile: 7, toTile: 8, departAt: 0, arriveAt: 1000, status: "marching" });
  await f.api.captureTile("instant", 1, 8, operation("instant", 1, "capture", "last"));
  assert.equal(f.get(1).tiles.get(8)?.ownerUid, "instant");
  assert.equal(f.get(1).marches.get("c")?.status, "arrived");
});

test("slg 有界补算满批仍提交进度，绝不跳过剩余事件执行即时操作", async () => {
  const f = fixture();
  for (let i = SLG_SETTLEMENT_BATCH_SIZE; i >= 0; i -= 1) {
    const id = String(i).padStart(3, "0");
    f.get(1).marches.set(id, { marchId: id, uid: `u${i}`, fromTile: 0, toTile: 1, departAt: 0, arriveAt: 1000, status: "marching" });
  }
  const op = operation("instant", 1, "capture", "after-backlog");
  await assert.rejects(f.api.captureTile("instant", 1, 1, op), /补算/u);
  assert.equal([...f.get(1).marches.values()].filter((m) => m.status === "arrived").length, SLG_SETTLEMENT_BATCH_SIZE);
  assert.equal(f.get(1).tiles.get(1)?.ownerUid, `u${SLG_SETTLEMENT_BATCH_SIZE - 1}`);
  assert.equal(f.get(1).receipts.has(`capture:${op.opId}`), false);
  assert.equal((await f.api.captureTile("instant", 1, 1, op)).tile.ownerUid, "instant");
  assert.ok([...f.get(1).marches.values()].every((m) => m.status === "arrived"));
});

test("slg 到达事务故障不遗留半成品，重放修复且只奖励一次", async () => {
  const f = fixture(); f.own("u"); f.fund("u");
  const { march } = await f.api.dispatchMarch("u", 1, 0, 1, operation("u", 1, "dispatch", "m"));
  f.at(march.arriveAt); f.failReceipt();
  const revision = f.get(1).revision;
  await assert.rejects(f.api.settleDueMarches(1), /injected/u);
  assert.equal(f.get(1).revision, revision); assert.equal(f.get(1).tiles.has(1), false);
  assert.equal(f.get(1).marches.get(march.marchId)?.status, "marching");
  assert.equal((await f.api.settleDueMarches(1)).settled, 1);
  assert.equal((await f.api.settleDueMarches(1)).settled, 0);
  assert.equal(f.get(1).effects.size, 1);
});

test("slg 区域隔离、稀疏有界快照与双消费者独立游标", async () => {
  const f = fixture();
  await f.api.captureTile("u", 1, 1, operation("u", 1, "capture", "a"));
  await f.api.captureTile("u", 1, 100, operation("u", 1, "capture", "b"));
  await f.api.captureTile("v", 2, 1, operation("v", 2, "capture", "a"));
  const snapshot = await f.api.readTiles("u", 1, "senzhiguo", RECT);
  assert.deepEqual(snapshot.tiles.map((t) => t.tileId), [1]);
  assert.equal(snapshot.revision, 2); assert.equal(snapshot.myTrophies, 2);
  assert.equal((await f.api.readTiles("u", 2, "senzhiguo", RECT)).tiles[0].ownerUid, "v");
  const one = await f.api.readChanges(1, 0, 1);
  const other = await f.api.readChanges(1, 0, 128);
  assert.equal(one.nextCursor, 1); assert.equal(other.nextCursor, 2);
  assert.deepEqual((await f.api.readChanges(1, one.nextCursor, 1)).changes[0], other.changes[1]);
  await assert.rejects(f.api.readChanges(1, 3), /超前/u);
});
