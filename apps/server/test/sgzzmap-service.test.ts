import assert from "node:assert/strict";
import { test } from "node:test";
import {
    sgzzCellOf, sgzzChunkRectForGridRect, sgzzDecodeCell, sgzzGridRectForChunkRect,
    sgzzInBounds, sgzzIsPassable, sgzzNeighbours, sgzzNextPos,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_MARCH_MS_PER_TILE, SGZZ_SETTLEMENT_BATCH_SIZE,
} from "@game/shared/kits/sgzzmap/api/march/index";
import { sgzzEmptyTile, type ISgzzTile } from "@game/shared/kits/sgzzmap/api/territory/index";
import { createSgzzApi, sgzzInSpawnRegion, type SgzzOperation } from "../src/kits/sgzzmap/service";
import type { SgzzHolding, SgzzReceipt, SgzzRepository } from "../src/kits/sgzzmap/repository";
import type { ISgzzAlliance, ISgzzMembership } from "@game/shared/kits/sgzzmap/api/alliance/index";
import type { ISgzzMarch } from "@game/shared/kits/sgzzmap/api/march/index";
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
    const alliances = new Map<string, ISgzzAlliance>();
    const members = new Map<string, ISgzzMembership>();
    const retags: { uid: string; aid: string }[] = [];
    const marches = new Map<string, ISgzzMarch>();
    const debits: { uid: string; amount: number; opId: string }[] = [];
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
        async readTilesInRect(rect: ISgzzRect) {
            // ⚠ 必须真按窗过滤：回了窗外的格，validateSgzzViewRes 会（正确地）拒掉整个响应
            const g = sgzzGridRectForChunkRect(rect);
            return [...tiles.values()]
                .filter((t) => {
                    const { row, col } = sgzzDecodeCell(t.cell);
                    return row >= g.minRow && row <= g.maxRow && col >= g.minCol && col <= g.maxCol;
                })
                .sort((a, b) => a.cell - b.cell);
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
        async readMembershipForUpdate(uid) { return members.get(uid) ?? null; },
        async readAllianceForUpdate(aid) { return alliances.get(aid) ?? null; },
        async insertAlliance(a) {
            if ([...alliances.values()].some((x) => x.tag === a.tag)) return false;   // uk_tag
            alliances.set(a.allianceId, a); return true;
        },
        async updateAllianceMembers(aid, n) {
            const a = alliances.get(aid); if (a) alliances.set(aid, { ...a, members: n });
        },
        async deleteAlliance(aid) { alliances.delete(aid); },
        async insertMembership(m) { members.set(m.uid, m); },
        async deleteMembership(uid) { members.delete(uid); },
        async retagTiles(uid, aid) {
            retags.push({ uid, aid });
            for (const [cell, t] of tiles) if (t.ownerUid === uid) tiles.set(cell, { ...t, ownerAid: aid });
        },
        async updateReceipt(kind, opId, response) {
            const hit = receipts.get(`${kind}:${opId}`);
            if (hit) receipts.set(`${kind}:${opId}`, { ...hit, response });
        },
        async insertMarch(m) { marches.set(m.marchId, m); },
        async readMarchForUpdate(id) { return marches.get(id) ?? null; },
        async updateMarchStatus(id, status) {
            const m = marches.get(id); if (m) marches.set(id, { ...m, status });
        },
        async readDueMarches(now, limit) {
            return [...marches.values()]
                .filter((m) => m.status === "marching" && m.arriveAt <= now)
                .sort((a, b) => (a.arriveAt - b.arriveAt) || a.marchId.localeCompare(b.marchId))
                .slice(0, limit);
        },
        async countActiveMarches(uid) {
            return [...marches.values()].filter((m) => m.uid === uid && m.status === "marching").length;
        },
    };
    return {
        repo, tiles, holdings, receipts, log, lockOrders, alliances, members, retags, marches, debits,
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
/** 假 KitTx：只提供 debit（经济主账本由框架测试覆盖，这里只要证明「扣一次」）。 */
function apiOn(f: ReturnType<typeof fakeRepo>, now: () => number = () => 1_000_000) {
    const tx = {
        debit: async (uid: string, _cur: number, amount: number, _fence: number, opId: string) => {
            if (f.debits.some((d) => d.opId === opId)) return "DUP" as const;
            f.debits.push({ uid, amount, opId });
            return 100 - amount;
        },
    };
    return createSgzzApi({
        run: (_sId, fn) => fn(tx as never), repository: () => f.repo, now,
        withUserFence: (_uid, _sId, fn) => fn({ fence: 1 }),
    });
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

test("sgzzmap service: 建盟 → 入盟 → 退盟，地块 owner_aid 随之改写", async () => {
    const { cell, neighbour } = spawnPair();
    const f = fakeRepo(); const api = apiOn(f);

    await api.occupy("u1", 1, cell, op("o1"));
    const created = await api.alliance("u1", 1,
        { clientReqId: "c1", act: "create", name: "青州军", tag: "青" }, op("al1"));
    assert.equal(created.membership?.role, "leader");
    assert.equal(created.alliance?.members, 1);
    const aid = created.alliance!.allianceId;
    assert.match(aid, /^a\d+$/u, "盟 id 由 revision 序列派生");
    assert.equal(f.tiles.get(cell)?.ownerAid, aid, "建盟后名下地块要改挂盟旗");
    assert.equal(f.holdings.get("u1")?.allianceId, aid);

    // 第二人入盟后，他占的地对 u1 就是 UNION ⇒ 可连地
    const joined = await api.alliance("u2", 1, { clientReqId: "c2", act: "join", allianceId: aid }, op("al2"));
    assert.equal(joined.membership?.role, "member");
    assert.equal(joined.alliance?.members, 2);
    await api.occupy("u2", 1, neighbour, op("o2"));
    assert.equal(f.tiles.get(neighbour)?.ownerAid, aid, "入盟成员新占的地直接带盟旗");

    // 盟主不能先退
    await assert.rejects(() => api.alliance("u1", 1, { clientReqId: "c3", act: "leave" }, op("al3")),
        faultCode("SGZZMAP_ALLIANCE_LEADER_BUSY"));
    // 成员先退：地块摘旗、人数减
    const left = await api.alliance("u2", 1, { clientReqId: "c4", act: "leave" }, op("al4"));
    assert.equal(left.membership, null);
    assert.equal(left.alliance, null);
    assert.equal(f.tiles.get(neighbour)?.ownerAid, "", "退盟要摘掉地块上的盟旗");
    assert.equal(f.alliances.get(aid)?.members, 1);
    // 只剩盟主 ⇒ 可退，同盟解散
    await api.alliance("u1", 1, { clientReqId: "c5", act: "leave" }, op("al5"));
    assert.equal(f.alliances.has(aid), false, "最后一人退出后同盟解散");
    assert.equal(f.log.at(-1)?.tombstone, true, "解散日志必须带 tombstone");
});

test("sgzzmap service: 盟标唯一 —— 撞 uk_tag 拿 TAG_TAKEN，⛔ 不先查再插", async () => {
    const f = fakeRepo(); const api = apiOn(f);
    await api.alliance("u1", 1, { clientReqId: "c1", act: "create", name: "青州军", tag: "青" }, op("al1"));
    await assert.rejects(
        () => api.alliance("u2", 1, { clientReqId: "c2", act: "create", name: "另一军", tag: "青" }, op("al2")),
        faultCode("SGZZMAP_ALLIANCE_TAG_TAKEN"));
    assert.equal(f.alliances.size, 1);
});

test("sgzzmap service: 一人一盟 —— 已有盟再建/再入都拒", async () => {
    const f = fakeRepo(); const api = apiOn(f);
    const a = await api.alliance("u1", 1, { clientReqId: "c1", act: "create", name: "青州军", tag: "青" }, op("al1"));
    await assert.rejects(
        () => api.alliance("u1", 1, { clientReqId: "c2", act: "create", name: "徐州军", tag: "徐" }, op("al2")),
        faultCode("SGZZMAP_ALLIANCE_EXISTS"));
    await assert.rejects(
        () => api.alliance("u1", 1, { clientReqId: "c3", act: "join", allianceId: a.alliance!.allianceId }, op("al3")),
        faultCode("SGZZMAP_ALLIANCE_EXISTS"));
    await assert.rejects(
        () => api.alliance("u9", 1, { clientReqId: "c4", act: "join", allianceId: "a-nope" }, op("al4")),
        faultCode("SGZZMAP_ALLIANCE_NOT_FOUND"));
    await assert.rejects(() => api.alliance("u9", 1, { clientReqId: "c5", act: "leave" }, op("al5")),
        faultCode("SGZZMAP_ALLIANCE_NOT_MEMBER"));
});

/** 从 cell 出发朝 dir 走 n 步的终点（用于造合法行军路径）。 */
function marchTo(cell: number, dir: number, n: number): number {
    let cur = sgzzDecodeCell(cell);
    for (let i = 0; i < n; i += 1) cur = sgzzNextPos(cur.row, cur.col, dir);
    return sgzzCellOf(cur.row, cur.col);
}
/** 找一条从 cell 出发、全程可通行的 n 步直线。 */
function passableRay(cell: number, steps: number): number | null {
    const t = terrainOf();
    for (let dir = 1; dir <= 6; dir += 1) {
        let cur = sgzzDecodeCell(cell); let ok = true;
        for (let i = 0; i < steps; i += 1) {
            cur = sgzzNextPos(cur.row, cur.col, dir);
            if (!sgzzInBounds(cur.row, cur.col) || !sgzzIsPassable(t, cur.row, cur.col)) { ok = false; break; }
        }
        if (ok) return marchTo(cell, dir, steps);
    }
    return null;
}

test("sgzzmap service: 派遣要从自己的地出发、受在途上限、扣一次钱", async () => {
    const { cell } = spawnPair();
    const dest = passableRay(cell, 3);
    assert.ok(dest !== null, "找不到可通行的三步直线");
    const f = fakeRepo(); const api = apiOn(f);

    // 还没占地就派遣 → 拒
    await assert.rejects(() => api.marchDispatch("u1", 1, [cell, dest!], op("d0")),
        faultCode("SGZZMAP_NOT_OWNED"));

    await api.occupy("u1", 1, cell, op("o1"));
    const res = await api.marchDispatch("u1", 1, [cell, dest!], op("d1"));
    assert.equal(res.march.uid, "u1");
    assert.equal(res.march.status, "marching");
    assert.equal(res.march.arriveAt - res.march.departAt, 3 * SGZZ_MARCH_MS_PER_TILE);
    assert.match(res.march.marchId, /^m\d+$/u, "marchId 由 revision 序列派生");
    assert.equal(f.debits.length, 1, "派遣扣一次钱");

    // 重放同一 opId：不再扣第二次
    const again = await api.marchDispatch("u1", 1, [cell, dest!], op("d1"));
    assert.deepEqual(again, res, "同一 opId 必须原样重放");
    assert.equal(f.debits.length, 1, "⛔ 重放不得再扣一次");

    // 在途上限
    await api.marchDispatch("u1", 1, [cell, dest!], op("d2"));
    await api.marchDispatch("u1", 1, [cell, dest!], op("d3"));
    await assert.rejects(() => api.marchDispatch("u1", 1, [cell, dest!], op("d4")),
        faultCode("SGZZMAP_MARCH_LIMIT"));
});

test("sgzzmap service: 撤回只对在途的自己人生效", async () => {
    const { cell } = spawnPair();
    const dest = passableRay(cell, 3)!;
    const f = fakeRepo(); const api = apiOn(f);
    await api.occupy("u1", 1, cell, op("o1"));
    const sent = await api.marchDispatch("u1", 1, [cell, dest], op("d1"));

    await assert.rejects(() => api.marchRecall("u2", 1, sent.march.marchId, op("r0")),
        faultCode("SGZZMAP_MARCH_NOT_FOUND"), "别人的行军撤不了");
    await assert.rejects(() => api.marchRecall("u1", 1, "m-nope", op("r1")),
        faultCode("SGZZMAP_MARCH_NOT_FOUND"));

    const recalled = await api.marchRecall("u1", 1, sent.march.marchId, op("r2"));
    assert.equal(recalled.march.status, "recalled");
    assert.equal(f.marches.get(sent.march.marchId)?.status, "recalled");
    await assert.rejects(() => api.marchRecall("u1", 1, sent.march.marchId, op("r3")),
        faultCode("SGZZMAP_MARCH_FINISHED"), "已撤回的不能再撤");
});

test("sgzzmap service: 到达结算在终点落地，⛔ 不走连地闸（路径在派遣时已闸过）", async () => {
    const { cell } = spawnPair();
    const dest = passableRay(cell, 3)!;
    const f = fakeRepo();
    let clock = 1_000_000;
    const api = apiOn(f, () => clock);

    await api.occupy("u1", 1, cell, op("o1"));
    const sent = await api.marchDispatch("u1", 1, [cell, dest], op("d1"));
    assert.equal(f.tiles.has(dest), false, "出发时终点还没落地");

    // 还没到点：结算不动它
    clock = sent.march.arriveAt - 1;
    assert.deepEqual(await api.settleDueMarches(1), { settled: 0, more: false });
    assert.equal(f.marches.get(sent.march.marchId)?.status, "marching");

    // 到点：终点被占下，行军转 arrived
    clock = sent.march.arriveAt;
    const settled = await api.settleDueMarches(1);
    assert.equal(settled.settled, 1);
    assert.equal(settled.more, false);
    assert.equal(f.marches.get(sent.march.marchId)?.status, "arrived");
    assert.equal(f.tiles.get(dest)?.ownerUid, "u1", "终点必须落地（⚠ 它与出发地并不相邻）");
    assert.equal(f.holdings.get("u1")?.tiles, 2, "占下新地要加持地计数");

    // 幂等：再结算一次不会重复落地
    const twice = await api.settleDueMarches(1);
    assert.equal(twice.settled, 0);
    assert.equal(f.tiles.get(dest)?.durability, 1, "⛔ 不得重复加固");
});

test("sgzzmap service: 积压超批次时 view 抛 SETTLEMENT_PENDING（懒结算兜底）", async () => {
    const { cell } = spawnPair();
    const dest = passableRay(cell, 1)!;
    const f = fakeRepo();
    let clock = 1_000_000;
    const api = apiOn(f, () => clock);
    await api.occupy("u1", 1, cell, op("o1"));

    // 直接灌满一整批 + 1 条到期行军
    for (let i = 0; i <= SGZZ_SETTLEMENT_BATCH_SIZE; i += 1) {
        f.marches.set(`m-bulk-${i}`, {
            marchId: `m-bulk-${i}`, uid: "u1", path: [cell, dest],
            departAt: clock - 5000, arriveAt: clock - 5000 + SGZZ_MARCH_MS_PER_TILE, status: "marching",
        });
    }
    const here = sgzzDecodeCell(cell);
    const rect = sgzzChunkRectForGridRect({
        minRow: here.row, minCol: here.col, maxRow: here.row, maxCol: here.col,
    });
    await assert.rejects(() => api.view("u1", 1, rect),
        faultCode("SGZZMAP_SETTLEMENT_PENDING"), "积压打满一批就让客户端稍后重试");
    // 再推两轮把积压清掉，view 恢复正常
    await api.settleDueMarches(1);
    await api.settleDueMarches(1);
    const res = await api.view("u1", 1, rect);
    assert.ok(res.tiles.length >= 1, "出发格就在这个窗里");
});

test("sgzzmap service: ★ worker 路径与懒结算路径对同一 fixture 产出完全相同的结果", async () => {
    // 两条驱动路径（worker 用调用方的事务、懒结算自开事务）必须不漂移，
    // ⛔ 否则「谁先跑」会决定世界状态。
    function build() {
        const { cell } = spawnPair();
        const dest = passableRay(cell, 2)!;
        const f = fakeRepo();
        let clock = 1_000_000;
        const api = apiOn(f, () => clock);
        return { f, api, cell, dest, at: (t: number) => { clock = t; } };
    }
    function snapshot(f: ReturnType<typeof fakeRepo>) {
        return JSON.stringify({
            tiles: [...f.tiles.entries()].sort((a, b) => a[0] - b[0]),
            holdings: [...f.holdings.entries()].sort(),
            marches: [...f.marches.entries()].sort(),
            log: f.log,
        });
    }

    const lazy = build();
    await lazy.api.occupy("u1", 1, lazy.cell, op("o1"));
    const sentA = await lazy.api.marchDispatch("u1", 1, [lazy.cell, lazy.dest], op("d1"));
    lazy.at(sentA.march.arriveAt);
    const viaLazy = await lazy.api.settleDueMarches(1);

    const worker = build();
    await worker.api.occupy("u1", 1, worker.cell, op("o1"));
    const sentB = await worker.api.marchDispatch("u1", 1, [worker.cell, worker.dest], op("d1"));
    worker.at(sentB.march.arriveAt);
    // worker 路径：事务由调用方给（这里用同一个假 tx），⛔ 不自开
    const viaWorker = await worker.api.settleOnTx({} as never, 1);

    assert.deepEqual(viaWorker, viaLazy, "两条路径的返回值必须一致");
    assert.equal(snapshot(worker.f), snapshot(lazy.f), "两条路径落库后的世界状态必须逐字段一致");
});
