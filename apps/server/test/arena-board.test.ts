/**
 * arena kit 服务端 api 面（kits/arena/api/{board,ranking}）：用假 KitTx（内存 k_arena_board + k_arena_attempt + 记录
 * debit / enqueueEffect 调用）与记录器形态的 effect 收尾驱动占领规则、回执重放、商店 boost 的扣款路径、tile 校验、
 * 排名聚合与 opId 命名空间。⛔ 不碰 MySQL / Redis。
 * kit-api 自身（表闸 / withKitTx / applyKitEffect）由 kit-api.test.ts 钉；这里只证 kit 代码对门面的用法。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ARENA_BOOST_POWER, ARENA_MAX_POWER, ARENA_TILE_COUNT } from "@game/shared/kits/arena/api/board/index";
import { CUR_GOLD, type IEffect, type KitTx } from "../src/core/infra/kitApi";
import { deriveOpId } from "../src/core/economy/outbox";
import {
  ARENA_TROPHY_EFFECT_KIND, type ArenaEffectApplier, ArenaTileNotOwnedError, type ArenaTxRunner, arenaOpId, createArenaBoardApi,
} from "../src/kits/arena/api/board/index";
import { createArenaRankingApi } from "../src/kits/arena/api/ranking/index";

interface Row { tile: number; owner_uid: string; power: number }
interface AttemptRow { op_id: string; uid: string; tile: number; outcome: string; power: number; owner_uid: string }

/** 假 kit 事务：按 kit 代码实际发出的 SQL 形态模拟 k_arena_board / k_arena_attempt；debit / enqueueEffect 可编排。 */
function fakeKit(options: { debit?: "DUP" | number | Error; effect?: "INSERTED" | "DUP" } = {}) {
  const rows = new Map<string, Row>();
  const attempts = new Map<string, AttemptRow>();
  const key = (sId: number, tile: number) => `${sId}:${tile}`;
  const debits: unknown[][] = [];
  const effects: { uid: string; opId: string; effect: IEffect }[] = [];
  const applied: { uid: string; sId: number; opId: string; effect: IEffect; committed: number }[] = [];
  const sqls: string[] = [];
  let sIdSeen = -1;
  let committed = 0;
  const run: ArenaTxRunner = async (sId, fn) => {
    sIdSeen = sId;
    // 事务语义：回调抛出即整体回滚（快照恢复）
    const snapshotRows = new Map(rows);
    const snapshotAttempts = new Map(attempts);
    const snapshotEffects = effects.length;
    const tx: KitTx = {
      conn: {} as never,
      kitId: "arena",
      sId,
      async query<T>(sql: string, params: unknown[] = []): Promise<T> {
        sqls.push(sql);
        if (sql.startsWith("SELECT tile, owner_uid, power FROM k_arena_board WHERE server_id = ? ORDER BY tile")) {
          return [...rows.entries()].filter(([k]) => k.startsWith(`${params[0]}:`)).map(([, row]) => row)
            .sort((a, b) => a.tile - b.tile) as T;
        }
        if (sql.startsWith("SELECT tile, owner_uid, power FROM k_arena_board WHERE server_id = ? AND tile = ? FOR UPDATE")) {
          const row = rows.get(key(params[0] as number, params[1] as number));
          return (row ? [row] : []) as T;
        }
        if (sql.startsWith("INSERT INTO k_arena_board (server_id, tile, owner_uid, power) VALUES (?, ?, ?, ?)")) {
          rows.set(key(params[0] as number, params[1] as number), { tile: params[1] as number, owner_uid: params[2] as string, power: params[3] as number });
          return { affectedRows: 1 } as T;
        }
        if (sql.startsWith("SELECT op_id, uid, tile, outcome, power, owner_uid FROM k_arena_attempt WHERE server_id = ? AND op_id = ? FOR UPDATE")) {
          const row = attempts.get(`${params[0]}:${params[1]}`);
          return (row ? [row] : []) as T;
        }
        if (sql.startsWith("INSERT INTO k_arena_attempt (server_id, op_id, uid, tile, outcome, power, owner_uid) VALUES (?, ?, ?, ?, ?, ?, ?)")) {
          const k = `${params[0]}:${params[1]}`;
          if (attempts.has(k)) throw new Error("ER_DUP_ENTRY: k_arena_attempt PRIMARY");
          attempts.set(k, { op_id: params[1] as string, uid: params[2] as string, tile: params[3] as number, outcome: params[4] as string, power: params[5] as number, owner_uid: params[6] as string });
          return { affectedRows: 1 } as T;
        }
        throw new Error(`fakeKit: 未预期的 SQL ${sql}`);
      },
      async debit(uid, currency, amount, fence, opId, reason) {
        debits.push([uid, currency, amount, fence, opId, reason]);
        const r = options.debit ?? 100;
        if (r instanceof Error) throw r;
        return r;
      },
      async credit() { throw new Error("arena kit 不入账"); },
      async enqueueEffect(uid, opId, effect) {
        effects.push({ uid, opId, effect });
        return options.effect ?? "INSERTED";
      },
    };
    try {
      const out = await fn(tx);
      committed += 1;
      return out;
    } catch (error) {
      rows.clear(); for (const [k, v] of snapshotRows) rows.set(k, v);
      attempts.clear(); for (const [k, v] of snapshotAttempts) attempts.set(k, v);
      effects.length = snapshotEffects;
      throw error;
    }
  };
  const apply: ArenaEffectApplier = async (uid, sId, opId, effect) => { applied.push({ uid, sId, opId, effect, committed }); return "ok"; };
  return {
    run, apply, rows, attempts, debits, effects, applied, sqls,
    get sId() { return sIdSeen; },
    get committed() { return committed; },
    seed(sId: number, tile: number, owner: string, power: number) { rows.set(key(sId, tile), { tile, owner_uid: owner, power }); },
    at(sId: number, tile: number) { return rows.get(key(sId, tile)); },
  };
}

test("arena board：readBoard 补齐 ARENA_TILE_COUNT 格、tile 升序；空表也是整张无主棋盘", async () => {
  const kit = fakeKit();
  kit.seed(1, 5, "u1", 3);
  const api = createArenaBoardApi(kit.run);
  const board = await api.readBoard(1);
  assert.equal(board.length, ARENA_TILE_COUNT);
  assert.deepEqual(board.map((tile) => tile.tile), Array.from({ length: ARENA_TILE_COUNT }, (_x, i) => i));
  assert.deepEqual(board[5], { tile: 5, ownerUid: "u1", power: 3 });
  assert.deepEqual(board[0], { tile: 0, ownerUid: "", power: 0 });
  assert.equal(kit.sId, 1, "withKitTx 绑定请求所在区");
  const empty = await createArenaBoardApi(fakeKit().run).readBoard(0);
  assert.equal(empty.filter((tile) => tile.ownerUid === "").length, ARENA_TILE_COUNT);
});

test("arena board：越界守备值（INT UNSIGNED 无 CHECK）在数据出口钳到 ARENA_MAX_POWER，整张棋盘仍可读", async () => {
  const kit = fakeKit();
  kit.seed(0, 9, "u1", ARENA_MAX_POWER + 51);
  const api = createArenaBoardApi(kit.run, kit.apply);
  assert.deepEqual((await api.readBoard(0))[9], { tile: 9, ownerUid: "u1", power: ARENA_MAX_POWER });
  assert.deepEqual(await api.captureTile("u1", 0, 9, "op-c"), { kind: "reinforced", tile: 9, power: ARENA_MAX_POWER, ownerUid: "u1", replayed: false });
});

test("arena board：占无主格 → captured power=1、入队 kit:arena:trophy +1（effect 先于棋盘写）、写回执，提交后才 apply effect", async () => {
  const kit = fakeKit();
  const api = createArenaBoardApi(kit.run, kit.apply);
  const outcome = await api.captureTile("u1", 1, 3, "op-1");
  assert.deepEqual(outcome, { kind: "captured", tile: 3, power: 1, ownerUid: "u1", replayed: false });
  assert.deepEqual(kit.at(1, 3), { tile: 3, owner_uid: "u1", power: 1 });
  assert.equal(kit.effects.length, 1);
  const effect = { schemaVersion: 1, grants: [{ kind: ARENA_TROPHY_EFFECT_KIND, delta: 1 }] };
  assert.deepEqual(kit.effects[0], { uid: "u1", opId: "op-1", effect });
  assert.equal(ARENA_TROPHY_EFFECT_KIND, "kit:arena:trophy");
  assert.equal(kit.debits.length, 0, "占领不扣款");
  assert.deepEqual(kit.attempts.get("1:op-1"), { op_id: "op-1", uid: "u1", tile: 3, outcome: "captured", power: 1, owner_uid: "u1" });
  // 阶段 2/3 收尾：同一 opId / 同一 effect，且发生在事务提交之后（committed 计数已为 1）
  assert.deepEqual(kit.applied, [{ uid: "u1", sId: 1, opId: "op-1", effect, committed: 1 }]);
});

test("arena board：自己的格再占 = 加固 +1（封顶 ARENA_MAX_POWER），不发奖杯", async () => {
  const kit = fakeKit();
  kit.seed(0, 7, "u1", 2);
  const api = createArenaBoardApi(kit.run);
  assert.deepEqual(await api.captureTile("u1", 0, 7, "op-a"), { kind: "reinforced", tile: 7, power: 3, ownerUid: "u1", replayed: false });
  assert.equal(kit.effects.length, 0);
  kit.seed(0, 8, "u1", ARENA_MAX_POWER);
  assert.deepEqual(await api.captureTile("u1", 0, 8, "op-b"), { kind: "reinforced", tile: 8, power: ARENA_MAX_POWER, ownerUid: "u1", replayed: false });
  assert.equal(kit.applied.length, 0, "不改主不 apply effect");
});

test("arena board：敌格有守备 → taken 并让它 −1（提交）；守备归零后可夺取（改主 + 奖杯）", async () => {
  const kit = fakeKit();
  kit.seed(0, 2, "u2", 2);
  const api = createArenaBoardApi(kit.run, kit.apply);
  assert.deepEqual(await api.captureTile("u1", 0, 2, "op-1"), { kind: "taken", tile: 2, power: 1, ownerUid: "u2", replayed: false });
  assert.deepEqual(kit.at(0, 2), { tile: 2, owner_uid: "u2", power: 1 });
  assert.deepEqual(await api.captureTile("u1", 0, 2, "op-2"), { kind: "taken", tile: 2, power: 0, ownerUid: "u2", replayed: false });
  assert.equal(kit.effects.length, 0, "未改主不发奖杯");
  assert.deepEqual(await api.captureTile("u1", 0, 2, "op-3"), { kind: "captured", tile: 2, power: 1, ownerUid: "u1", replayed: false });
  assert.deepEqual(kit.at(0, 2), { tile: 2, owner_uid: "u1", power: 1 });
  assert.equal(kit.effects.length, 1);
  assert.equal(kit.effects[0].opId, "op-3");
  assert.deepEqual(kit.applied.map((item) => item.opId), ["op-3"]);
});

test("arena board：同 opId 重放走回执——三种结果都原样回读、棋盘零写入、effect 不再入队 / 不再 apply（taken 不再削守备）", async () => {
  const kit = fakeKit();
  kit.seed(0, 2, "u2", 5);
  kit.seed(0, 7, "u1", 2);
  const api = createArenaBoardApi(kit.run, kit.apply);
  // taken：首次 −1（5 → 4），同 opId 重放 N 次仍是 4（对抗审阅 #1：拒绝响应里的削守备不能被重试重复提交）
  assert.deepEqual(await api.captureTile("u1", 0, 2, "op-t"), { kind: "taken", tile: 2, power: 4, ownerUid: "u2", replayed: false });
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(await api.captureTile("u1", 0, 2, "op-t"), { kind: "taken", tile: 2, power: 4, ownerUid: "u2", replayed: true });
  }
  assert.deepEqual(kit.at(0, 2), { tile: 2, owner_uid: "u2", power: 4 });
  // reinforced：首次 +1（2 → 3），重放不再 +1（对抗审阅 #9：idem 缓存过期后的加固重放）
  assert.deepEqual(await api.captureTile("u1", 0, 7, "op-r"), { kind: "reinforced", tile: 7, power: 3, ownerUid: "u1", replayed: false });
  assert.deepEqual(await api.captureTile("u1", 0, 7, "op-r"), { kind: "reinforced", tile: 7, power: 3, ownerUid: "u1", replayed: true });
  assert.deepEqual(kit.at(0, 7), { tile: 7, owner_uid: "u1", power: 3 });
  // captured：重放不再入队 effect、不再 apply；回执带的是首次的值（即使该格之后已被别人夺走）
  assert.deepEqual(await api.captureTile("u1", 0, 4, "op-c"), { kind: "captured", tile: 4, power: 1, ownerUid: "u1", replayed: false });
  kit.seed(0, 4, "u3", 1);
  assert.deepEqual(await api.captureTile("u1", 0, 4, "op-c"), { kind: "captured", tile: 4, power: 1, ownerUid: "u1", replayed: true });
  assert.deepEqual(kit.at(0, 4), { tile: 4, owner_uid: "u3", power: 1 }, "重放不改棋盘");
  assert.equal(kit.effects.length, 1);
  assert.deepEqual(kit.applied.map((item) => item.opId), ["op-c"], "重放不再 apply");
  // 重放携带别的 tile：回执优先（与 dispatcher 幂等缓存同义：返回首次结果）
  assert.deepEqual(await api.captureTile("u1", 0, 9, "op-c"), { kind: "captured", tile: 4, power: 1, ownerUid: "u1", replayed: true });
  assert.equal(kit.committed, 9);
});

test("arena board：outbox 已有同 opId intent 但无回执 → 账本不一致，抛出回滚（棋盘 / 回执零写入）；tile 越界即抛且零 SQL", async () => {
  const kit = fakeKit({ effect: "DUP" });
  const api = createArenaBoardApi(kit.run, kit.apply);
  await assert.rejects(api.captureTile("u1", 0, 4, "op-x"), /账本不一致/u);
  assert.equal(kit.at(0, 4), undefined, "回滚：不写棋盘");
  assert.equal(kit.attempts.size, 0, "回滚：不写回执");
  assert.equal(kit.applied.length, 0);
  assert.equal(kit.committed, 0);
  const before = kit.sqls.length;
  await assert.rejects(api.captureTile("u1", 0, ARENA_TILE_COUNT, "op-y"), RangeError);
  await assert.rejects(api.captureTile("u1", 0, -1, "op-y"), RangeError);
  await assert.rejects(api.captureTile("u1", 0, 1.5, "op-y"), RangeError);
  assert.equal(kit.sqls.length, before);
});

test("arena board：同 opId 并发到达——第二个事务写回执撞主键即抛、整体回滚（数据层 fail-closed，不 apply）", async () => {
  const kit = fakeKit();
  // 模拟「并发赢家先落回执」：本事务 SELECT 回执时（READ COMMITTED 快照）看不到，INSERT 时撞主键
  let stage = 0;
  const racy: ArenaTxRunner = (sId, fn) => kit.run(sId, async (tx) => fn({
    ...tx,
    async query<T>(sql: string, params?: unknown[]): Promise<T> {
      if (stage === 0 && sql.startsWith("SELECT op_id")) { stage = 1; return [] as T; }
      if (stage === 1 && sql.startsWith("INSERT INTO k_arena_attempt")) { stage = 2; throw new Error("ER_DUP_ENTRY"); }
      return tx.query<T>(sql, params);
    },
  }));
  await assert.rejects(createArenaBoardApi(racy, kit.apply).captureTile("u1", 0, 5, "op-race"), /ER_DUP_ENTRY/u);
  assert.equal(kit.at(0, 5), undefined, "回滚：棋盘未动");
  assert.equal(kit.applied.length, 0, "未提交不 apply");
  assert.equal(stage, 2);
});

test("arena board：boostTile 只对自己的格——不是自己的即抛 ArenaTileNotOwnedError 且零扣款；自己的格先 debit 再 +ARENA_BOOST_POWER（封顶）", async () => {
  const kit = fakeKit({ debit: 90 });
  kit.seed(0, 1, "u2", 1);
  kit.seed(0, 2, "u1", 1);
  kit.seed(0, 3, "u1", ARENA_MAX_POWER - 1);
  const api = createArenaBoardApi(kit.run);
  await assert.rejects(api.boostTile("u1", 0, 7, 1, 10, "op-1"), (error: unknown) =>
    error instanceof ArenaTileNotOwnedError && error.tile === 1 && error.ownerUid === "u2");
  await assert.rejects(api.boostTile("u1", 0, 7, 0, 10, "op-1"), ArenaTileNotOwnedError, "无主格也不能 boost");
  assert.equal(kit.debits.length, 0);
  assert.deepEqual(await api.boostTile("u1", 0, 7, 2, 10, "op-2"), { tile: 2, power: 1 + ARENA_BOOST_POWER, balance: 90 });
  assert.deepEqual(kit.debits, [["u1", CUR_GOLD, 10, 7, "op-2", "arena.boost"]]);
  assert.deepEqual(kit.at(0, 2), { tile: 2, owner_uid: "u1", power: 1 + ARENA_BOOST_POWER });
  assert.deepEqual(await api.boostTile("u1", 0, 7, 3, 10, "op-3"), { tile: 3, power: ARENA_MAX_POWER, balance: 90 });
  await assert.rejects(api.boostTile("u1", 0, 7, 2, 0, "op-4"), RangeError, "cost 必须为正");
  assert.equal(kit.effects.length, 0, "boost 不发奖杯");
});

test("arena board：boostTile 账本 DUP（同 opId 已扣过）→ 不再加守备、balance=null；扣款失败即整体不写", async () => {
  const dup = fakeKit({ debit: "DUP" });
  dup.seed(0, 2, "u1", 4);
  assert.deepEqual(await createArenaBoardApi(dup.run).boostTile("u1", 0, 1, 2, 10, "op-d"), { tile: 2, power: 4, balance: null });
  assert.deepEqual(dup.at(0, 2), { tile: 2, owner_uid: "u1", power: 4 });
  const failing = fakeKit({ debit: new Error("INSUFFICIENT") });
  failing.seed(0, 2, "u1", 4);
  await assert.rejects(createArenaBoardApi(failing.run).boostTile("u1", 0, 1, 2, 10, "op-e"), /INSUFFICIENT/u);
  assert.deepEqual(failing.at(0, 2), { tile: 2, owner_uid: "u1", power: 4 });
});

test("arena ranking：topOwners 按格数 → 守备和 → uid 聚合，limit 截断，无主格不计", async () => {
  const kit = fakeKit();
  kit.seed(0, 0, "u2", 5);
  kit.seed(0, 1, "u1", 1);
  kit.seed(0, 2, "u1", 1);
  kit.seed(0, 3, "u3", 9);
  const api = createArenaRankingApi(kit.run);
  assert.deepEqual(await api.topOwners(0), [
    { ownerUid: "u1", tiles: 2, power: 2 },
    { ownerUid: "u3", tiles: 1, power: 9 },
    { ownerUid: "u2", tiles: 1, power: 5 },
  ]);
  assert.deepEqual(await api.topOwners(0, 1), [{ ownerUid: "u1", tiles: 2, power: 2 }]);
  await assert.rejects(api.topOwners(0, 0), RangeError);
});

test("arena opId：kit 命名空间化（kit:arena:<op>），与 deriveOpId 同一派生、不同 op / clientReqId 不撞", () => {
  assert.equal(arenaOpId("u1", 3, "capture", "c1"), deriveOpId("u1", 3, "kit:arena:capture", "c1"));
  assert.equal(arenaOpId("u1", 3, "boost", "c1"), deriveOpId("u1", 3, "kit:arena:boost", "c1"));
  assert.notEqual(arenaOpId("u1", 3, "capture", "c1"), arenaOpId("u1", 3, "boost", "c1"));
  assert.notEqual(arenaOpId("u1", 3, "capture", "c1"), arenaOpId("u1", 3, "capture", "c2"));
  assert.notEqual(arenaOpId("u1", 3, "capture", "c1"), deriveOpId("u1", 3, "shop.purchase", "c1"));
});
