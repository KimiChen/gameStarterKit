import assert from "node:assert/strict";
import { test } from "node:test";
import {
    sgzzCellOf, sgzzIsPassable, sgzzNeighbours,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";
import { sgzzEmptyTile, type ISgzzTile } from "@game/shared/kits/sgzzmap/api/territory/index";
import { createSgzzApi, sgzzInSpawnRegion, type SgzzOperation } from "../src/kits/sgzzmap/service";
import type { SgzzHolding, SgzzReceipt, SgzzRepository } from "../src/kits/sgzzmap/repository";
import { terrainOf } from "../src/kits/sgzzmap/content/terrain";
import { RpcFault } from "../src/core/errors";
import type { ISgzzRect } from "@game/shared/kits/sgzzmap/api/hexmap/index";

const HASH = "a".repeat(64);
/** RpcFault 的 message 是给人看的文案，错误码在 rpcCode 上。⛔ 不要拿正则去匹配 message。 */
const faultCode = (code: string) => (e: unknown): boolean => e instanceof RpcFault && e.rpcCode === code;
function op(opId: string, over: Partial<SgzzOperation> = {}): SgzzOperation {
    return { opId, hash: HASH, contractVersion: 1, ...over };
}

/** 内存版仓储：只为无头地跑通事务编排；SQL 行为由 int 用例覆盖。 */
function fakeRepo() {
    const tiles = new Map<number, ISgzzTile>();
    const holdings = new Map<string, SgzzHolding>();
    const receipts = new Map<string, SgzzReceipt>();
    const log: { entity: string; operation: string; tombstone: boolean }[] = [];
    const lockOrders: number[][] = [];
    let revision = 0;
    let failNextInsert = false;
    let raceTile: ISgzzTile | null = null;
    const repo: SgzzRepository = {
        get revision() { return revision; },
        async lockRevision() { return revision; },
        async readTilesForUpdate(cells) {
            lockOrders.push([...cells]);
            const out = new Map<number, ISgzzTile>();
            for (const c of cells) out.set(c, tiles.get(c) ?? sgzzEmptyTile(c));
            return out;
        },
        async readTile(cell) { return tiles.get(cell) ?? sgzzEmptyTile(cell); },
        async readTilesInRect(_rect: ISgzzRect) {
            return [...tiles.values()].sort((a, b) => a.cell - b.cell);
        },
        async insertTile(tile) {
            if (failNextInsert) {
                failNextInsert = false;
                if (raceTile) { tiles.set(raceTile.cell, raceTile); raceTile = null; }
                return false;
            }
            if (tiles.has(tile.cell)) return false;
            tiles.set(tile.cell, tile); return true;
        },
        async updateTile(tile) { tiles.set(tile.cell, tile); },
        async deleteTile(cell) { tiles.delete(cell); },
        async readHoldingForUpdate(uid) {
            const hit = holdings.get(uid) ?? { uid, allianceId: "", tiles: 0 };
            holdings.set(uid, hit); return hit;
        },
        async upsertHolding(h) { holdings.set(h.uid, h); },
        async readReceipt(kind, opId) { return receipts.get(`${kind}:${opId}`) ?? null; },
        async insertReceipt(r) { receipts.set(`${r.kind}:${r.opId}`, r); },
        async appendLog(entity, operation, _payload, tombstone) {
            revision += 1; log.push({ entity, operation, tombstone }); return revision;
        },
    };
    return {
        repo, tiles, holdings, receipts, log, lockOrders,
        seed(cell: number, over: Partial<ISgzzTile>) {
            tiles.set(cell, { ...sgzzEmptyTile(cell), durability: 1, ...over });
        },
        setHolding(uid: string, h: Partial<SgzzHolding>) {
            holdings.set(uid, { uid, allianceId: "", tiles: 0, ...h });
        },
        /** 模拟并发：加锁时还是空格，INSERT 撞唯一键失败，且此刻真实状态已是 rival。 */
        raceOnInsert(cell: number, rival: Partial<ISgzzTile>) {
            failNextInsert = true;
            raceTile = { ...sgzzEmptyTile(cell), durability: 1, ...rival, cell };
        },
    };
}
function apiOn(f: ReturnType<typeof fakeRepo>) {
    return createSgzzApi({ run: (_sId, fn) => fn({} as never), repository: () => f.repo, now: () => 1_000_000 });
}

/** 在出生区里找一格可通行的真实地形，并要求它有一个同样可通行的邻居。 */
function spawnPair(): { cell: number; neighbour: number } {
    const t = terrainOf();
    for (let row = 750; row < 860; row += 1) {
        for (let col = 750; col < 860; col += 1) {
            if (!sgzzInSpawnRegion(row, col) || !sgzzIsPassable(t, row, col)) continue;
            for (const n of sgzzNeighbours(row, col)) {
                if (sgzzIsPassable(t, n.row, n.col) && sgzzInSpawnRegion(n.row, n.col)) {
                    return { cell: sgzzCellOf(row, col), neighbour: sgzzCellOf(n.row, n.col) };
                }
            }
        }
    }
    throw new Error("出生区里找不到可通行的相邻两格");
}
/** 一格可通行、但离出生区足够远 ⇒ 只可能因「不连地」被拒。 */
function passableFarCell(): number {
    const t = terrainOf();
    for (let row = 300; row < 1200; row += 11) {
        for (let col = 300; col < 1200; col += 11) {
            if (!sgzzInSpawnRegion(row, col) && sgzzIsPassable(t, row, col)
                && Math.abs(row - 750) + Math.abs(col - 750) > 300) {
                return sgzzCellOf(row, col);
            }
        }
    }
    throw new Error("找不到可通行的远处格");
}
function impassableCell(): number {
    const t = terrainOf();
    for (let row = 0; row < 1500; row += 7) {
        for (let col = 0; col < 1500; col += 7) {
            if (!sgzzIsPassable(t, row, col)) return sgzzCellOf(row, col);
        }
    }
    throw new Error("找不到不可通行格");
}

test("sgzzmap service: 零地块玩家在出生区落地，其余一律要连地", async () => {
    const { cell, neighbour } = spawnPair();
    const f = fakeRepo(); const api = apiOn(f);

    const first = await api.occupy("u1", 1, cell, op("o1"));
    assert.equal(first.outcome, "captured");
    assert.equal(first.heldTiles, 1);
    assert.equal(first.tile.ownerUid, "u1");

    // 相邻格：可连
    const second = await api.occupy("u1", 1, neighbour, op("o2"));
    assert.equal(second.outcome, "captured");
    assert.equal(second.heldTiles, 2);

    // 远处一格：不可连（且已非零地块，拿不到出生豁免）
    const far = passableFarCell();
    await assert.rejects(() => api.occupy("u1", 1, far, op("o3")), faultCode("SGZZMAP_NOT_ADJACENT"));
});

test("sgzzmap service: 出生豁免只给零地块，且只落无主格", async () => {
    const { cell } = spawnPair();
    const f = fakeRepo(); const api = apiOn(f);
    f.seed(cell, { ownerUid: "u-other", durability: 1 });
    await assert.rejects(() => api.occupy("u1", 1, cell, op("o1")), faultCode("SGZZMAP_NOT_ADJACENT"),
        "出生豁免不给有主格");

    const g = fakeRepo(); const api2 = apiOn(g);
    g.setHolding("u1", { tiles: 3 });
    await assert.rejects(() => api2.occupy("u1", 1, cell, op("o2")), faultCode("SGZZMAP_NOT_ADJACENT"),
        "已有地块就不再给出生豁免");
});

test("sgzzmap service: 不可通行地形先于一切被拒", async () => {
    const f = fakeRepo(); const api = apiOn(f);
    await assert.rejects(() => api.occupy("u1", 1, impassableCell(), op("o1")), faultCode("SGZZMAP_IMPASSABLE"));
    assert.equal(f.tiles.size, 0, "被拒不得留下任何地块行");
    assert.equal(f.receipts.size, 0, "被拒不得留下回执");
});

test("sgzzmap service: 加锁一定按 cell 升序（⛔ 否则并发占领必死锁）", async () => {
    const { cell } = spawnPair();
    const f = fakeRepo(); const api = apiOn(f);
    await api.occupy("u1", 1, cell, op("o1"));
    assert.ok(f.lockOrders.length > 0);
    for (const order of f.lockOrders) {
        const sorted = [...order].sort((a, b) => a - b);
        assert.deepEqual(order, sorted, "加锁顺序必须升序");
        assert.equal(new Set(order).size, order.length, "⛔ 同一格不得重复加锁");
    }
    // 目标格本身必须在锁集合里
    assert.ok(f.lockOrders[0].includes(cell));
});

test("sgzzmap service: 回执重放优先于重算；换请求体必冲突", async () => {
    const { cell } = spawnPair();
    const f = fakeRepo(); const api = apiOn(f);
    const first = await api.occupy("u1", 1, cell, op("same"));
    const logLen = f.log.length;

    const again = await api.occupy("u1", 1, cell, op("same"));
    assert.deepEqual(again, first, "同一 opId 必须原样重放");
    assert.equal(f.log.length, logLen, "⛔ 重放不得再写日志");
    assert.equal(f.tiles.get(cell)?.durability, 1, "⛔ 重放不得再加固一次");

    await assert.rejects(() => api.occupy("u1", 1, cell, op("same", { hash: "b".repeat(64) })),
        faultCode("OPERATION_CONFLICT"));
    await assert.rejects(() => api.occupy("u1", 1, cell, op("same", { contractVersion: 2 })),
        faultCode("OPERATION_RESULT_EXPIRED"));
    await assert.rejects(() => api.occupy("u2", 1, cell, op("same")), faultCode("OPERATION_CONFLICT"));
});

test("sgzzmap service: 稀疏空格撞唯一键后在同事务重读真实状态结算", async () => {
    const { cell } = spawnPair();
    const f = fakeRepo(); const api = apiOn(f);
    // 加锁时是空格（拿到出生豁免），INSERT 的瞬间被 rival 抢先插入、且守军 3
    f.raceOnInsert(cell, { ownerUid: "u-rival", ownerAid: "a-r", durability: 3 });
    const res = await api.occupy("u1", 1, cell, op("o1"));
    // ⛔ 按「旧的默认无主格」结算会得到 captured；真实状态是守军 3 的敌格 ⇒ 只能削减
    assert.equal(res.outcome, "damaged", "必须按事务内重读到的真实状态结算");
    assert.equal(res.tile.ownerUid, "u-rival");
    assert.equal(res.tile.durability, 2);
    assert.equal(res.heldTiles, 0, "没占下来就⛔不能加持地计数");
    assert.equal(f.tiles.get(cell)?.ownerUid, "u-rival");
});

test("sgzzmap service: 弃地只有地主能做，持地计数同步减", async () => {
    const { cell } = spawnPair();
    const f = fakeRepo(); const api = apiOn(f);
    await api.occupy("u1", 1, cell, op("o1"));
    await assert.rejects(() => api.abandon("u2", 1, cell, op("a0")), faultCode("SGZZMAP_NOT_OWNED"));

    const res = await api.abandon("u1", 1, cell, op("a1"));
    assert.equal(res.cell, cell);
    assert.equal(res.heldTiles, 0);
    assert.equal(f.tiles.has(cell), false, "弃地要删行，恢复成默认无主格");
    assert.equal(f.log.at(-1)?.tombstone, true, "弃地日志必须带 tombstone");
});

test("sgzzmap service: view 折叠 owners/alliances，只回非默认格且按 cell 升序", async () => {
    const f = fakeRepo(); const api = apiOn(f);
    const a = sgzzCellOf(700, 700), b = sgzzCellOf(700, 701), c = sgzzCellOf(701, 700);
    f.seed(c, { ownerUid: "u-a", ownerAid: "aa", durability: 2 });
    f.seed(a, { ownerUid: "u-a", ownerAid: "aa", durability: 3 });
    f.seed(b, { ownerUid: "u-b", ownerAid: "", durability: 1 });
    const res = await api.view("u1", 1, { minRow: 70, minCol: 70, maxRow: 70, maxCol: 70 });

    assert.deepEqual(res.tiles.map((t) => t.cell), [a, b, c], "必须按 cell 升序");
    assert.equal(res.owners.length, 2, "同一 (uid,盟) 只折叠成一个 owner");
    assert.deepEqual(res.alliances, ["aa"], "无盟不进 alliances");
    const ownerA = res.owners[res.tiles[0].owner];
    assert.equal(ownerA.uid, "u-a");
    assert.equal(res.alliances[ownerA.alliance], "aa");
    assert.equal(res.owners[res.tiles[1].owner].alliance, -1, "无盟地主的 alliance 下标是 -1");
    assert.equal(res.viewer.uid, "u1");
    for (const t of res.tiles) assert.ok(t.owner >= 0 || t.capturing >= 0, "⛔ 不得回默认格");
});
