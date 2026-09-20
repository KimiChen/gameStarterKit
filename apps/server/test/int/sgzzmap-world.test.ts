/**
 * sgzzmap 世界写入的真栈回归（docs/KIT.md §9；kit README §六）。
 * 单测里内存仓储答的行为，在这里对**真 MySQL** 回归：
 *  - 稀疏地块唯一键、FOR UPDATE 锁序、revision 严格递增；
 *  - 并发占同一邻环不死锁、不丢计数；
 *  - 回执重放跨事务仍原样返回；
 *  - 弃地删行、日志带 tombstone。
 * 前置：本地栈（npm --workspace @game/server run stack）+ db:bootstrap。
 * 与其他 int 文件一样只能单文件串行跑（--test-concurrency=1）。
 */
import "./env-setup"; // 必须第一个 import
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sgzzCellOf, sgzzCubeDistance, sgzzDecodeCell, sgzzIsPassable, sgzzNeighbours, sgzzNextPos } from "@game/shared/kits/sgzzmap/api/hexmap/index";
import { SGZZ_MARCH_MS_PER_TILE, sgzzMarchDurationMs } from "@game/shared/kits/sgzzmap/api/march/index";
import type { RowDataPacket } from "mysql2/promise";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { terrainOf } from "../../src/kits/sgzzmap/content/terrain";
import { createSgzzApi, sgzzInSpawnRegion, type SgzzOperation } from "../../src/kits/sgzzmap/service";
import { RpcFault } from "../../src/core/errors";

const SID = 0;
const TAG = randomUUID().slice(0, 8);
const U1 = `u-sgzz-${TAG}`;
const U2 = `u-sgzz2-${TAG}`;
const api = createSgzzApi();

function op(name: string): SgzzOperation {
    return { opId: `sgzz-int-${TAG}-${name}`, hash: "a".repeat(64), contractVersion: 1 };
}

/** 出生区里一格可通行、且六邻至少两格也可通行的地方。 */
function spawnHub(): { hub: number; ring: number[] } {
    const t = terrainOf();
    for (let row = 750; row < 870; row += 1) {
        for (let col = 750; col < 870; col += 1) {
            if (!sgzzInSpawnRegion(row, col) || !sgzzIsPassable(t, row, col)) continue;
            const ring = sgzzNeighbours(row, col)
                .filter((n) => sgzzIsPassable(t, n.row, n.col) && sgzzInSpawnRegion(n.row, n.col))
                .map((n) => sgzzCellOf(n.row, n.col));
            if (ring.length >= 4) return { hub: sgzzCellOf(row, col), ring };
        }
    }
    throw new Error("出生区里找不到可通行且邻居够多的枢纽格");
}

const { hub, ring } = spawnHub();
/**
 * 两个互不相邻的 hub 邻居。
 * ⚠ 同一格的六个邻居里，相邻序号的两个彼此**也是**邻居——拿它们做「不连地」探针会失败。
 */
function nonAdjacentPair(): [number, number] {
    for (let i = 0; i < ring.length; i += 1) {
        for (let j = i + 1; j < ring.length; j += 1) {
            const a = sgzzDecodeCell(ring[i]), b = sgzzDecodeCell(ring[j]);
            if (sgzzCubeDistance(a, b) > 1) return [ring[i], ring[j]];
        }
    }
    throw new Error("找不到互不相邻的两个邻居");
}
const [SEAT, PROBE] = nonAdjacentPair();

after(async () => {
    const pool = getPool();
    await pool.execute("DELETE FROM k_sgzzmap_tile WHERE server_id = ? AND cell IN (?, ?, ?, ?, ?)",
        [SID, hub, ring[0], ring[1], ring[2], ring[3]]);
    await pool.execute("DELETE FROM k_sgzzmap_holding WHERE server_id = ? AND uid IN (?, ?)", [SID, U1, U2]);
    await pool.execute("DELETE FROM k_sgzzmap_receipt WHERE server_id = ? AND uid IN (?, ?)", [SID, U1, U2]);
    await pool.execute("DELETE FROM k_sgzzmap_alliance_member WHERE server_id = ? AND uid IN (?, ?)", [SID, U1, U2]);
    await pool.execute("DELETE FROM k_sgzzmap_alliance WHERE server_id = ? AND leader_uid IN (?, ?)", [SID, U1, U2]);
    await pool.execute("DELETE FROM k_sgzzmap_march WHERE server_id = ? AND uid IN (?, ?)", [SID, U1, U2]);
    await closeRedis();
    await closeMysql();
});

test("真库：出生落地 → 连地扩张 → 稀疏行与持地计数一致", async () => {
    const pool = getPool();
    await pool.execute("DELETE FROM k_sgzzmap_tile WHERE server_id = ? AND cell IN (?, ?, ?, ?, ?)",
        [SID, hub, ring[0], ring[1], ring[2], ring[3]]);
    await pool.execute("DELETE FROM k_sgzzmap_holding WHERE server_id = ? AND uid = ?", [SID, U1]);

    const first = await api.occupy(U1, SID, hub, op("hub"));
    assert.equal(first.outcome, "captured");
    assert.equal(first.heldTiles, 1);

    const second = await api.occupy(U1, SID, ring[0], op("ring0"));
    assert.equal(second.outcome, "captured");
    assert.equal(second.heldTiles, 2);

    const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT cell, owner_uid, durability FROM k_sgzzmap_tile WHERE server_id = ? AND owner_uid = ? ORDER BY cell",
        [SID, U1]);
    const tiles = rows as unknown as { cell: number; owner_uid: string; durability: number }[];
    assert.equal(tiles.length, 2, "稀疏表里只应有这两行");
    assert.deepEqual(tiles.map((r) => Number(r.cell)).sort((a, b) => a - b), [hub, ring[0]].sort((a, b) => a - b));

    const [hold] = await pool.execute<RowDataPacket[]>(
        "SELECT tiles FROM k_sgzzmap_holding WHERE server_id = ? AND uid = ?", [SID, U1]);
    assert.equal(Number((hold as unknown as { tiles: number }[])[0].tiles), 2, "持地计数必须与实际行数一致");
});

test("真库：并发占同一邻环不死锁，revision 严格递增且无重号", async () => {
    const pool = getPool();
    const [before] = await pool.execute<RowDataPacket[]>(
        "SELECT revision FROM k_sgzzmap_revision WHERE server_id = ?", [SID]);
    const start = Number((before as unknown as { revision: number }[])[0]?.revision ?? 0);

    // 四个并发请求都去碰 hub 的邻环 —— 锁集合高度重叠，锁序错了这里就会死锁或超时
    const results = await Promise.allSettled(ring.slice(0, 4).map((cell, i) =>
        api.occupy(U1, SID, cell, op(`conc-${i}`))));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    assert.ok(ok >= 1, `并发占领至少应有一个成功，实得 ${ok}`);
    for (const r of results) {
        if (r.status === "rejected") {
            // 只允许业务性拒绝（比如上限 / 不连地），⛔ 不允许死锁或超时
            assert.ok(r.reason instanceof RpcFault,
                `并发只允许业务拒绝，实得：${String((r.reason as Error)?.message ?? r.reason)}`);
        }
    }

    const [after2] = await pool.execute<RowDataPacket[]>(
        "SELECT revision FROM k_sgzzmap_revision WHERE server_id = ?", [SID]);
    const end = Number((after2 as unknown as { revision: number }[])[0].revision);
    assert.ok(end > start, "revision 必须推进");

    const [logs] = await pool.execute<RowDataPacket[]>(
        "SELECT revision FROM k_sgzzmap_log WHERE server_id = ? AND revision > ? ORDER BY revision", [SID, start]);
    const revs = (logs as unknown as { revision: number }[]).map((r) => Number(r.revision));
    assert.equal(new Set(revs).size, revs.length, "revision ⛔ 不得重号");
    for (let i = 1; i < revs.length; i += 1) {
        assert.ok(revs[i] > revs[i - 1], "日志必须按 revision 严格递增");
    }
});

test("真库：回执跨事务重放原样返回，⛔ 不再改一次世界", async () => {
    const pool = getPool();
    const cell = ring[0];
    const first = await api.occupy(U1, SID, cell, op("replay"));
    const [beforeRows] = await pool.execute<RowDataPacket[]>(
        "SELECT durability FROM k_sgzzmap_tile WHERE server_id = ? AND cell = ?", [SID, cell]);
    const before = Number((beforeRows as unknown as { durability: number }[])[0].durability);

    const again = await api.occupy(U1, SID, cell, op("replay"));
    assert.deepEqual(again, first, "同一 opId 必须原样重放");

    const [afterRows] = await pool.execute<RowDataPacket[]>(
        "SELECT durability FROM k_sgzzmap_tile WHERE server_id = ? AND cell = ?", [SID, cell]);
    assert.equal(Number((afterRows as unknown as { durability: number }[])[0].durability), before,
        "⛔ 重放不得再加固一次");
});

test("真库：弃地删行、日志带 tombstone、持地计数同步减", async () => {
    const pool = getPool();
    const res = await api.abandon(U1, SID, hub, op("abandon"));
    assert.equal(res.cell, hub);

    const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT cell FROM k_sgzzmap_tile WHERE server_id = ? AND cell = ?", [SID, hub]);
    assert.equal((rows as unknown[]).length, 0, "弃地必须删行，恢复默认无主格");

    const [logs] = await pool.execute<RowDataPacket[]>(
        "SELECT tombstone FROM k_sgzzmap_log WHERE server_id = ? AND operation = 'abandon' ORDER BY revision DESC LIMIT 1",
        [SID]);
    assert.equal(Number((logs as unknown as { tombstone: number }[])[0].tombstone), 1, "弃地日志必须带 tombstone");

    await assert.rejects(() => api.abandon(U2, SID, ring[1], op("abandon-foreign")),
        (e: unknown) => e instanceof RpcFault && e.rpcCode === "SGZZMAP_NOT_OWNED");
});

test("真库：同盟成员之间可连地，非成员不可 —— UNION 态真的跑起来了", async () => {
    const pool = getPool();
    // 清干净这一片，重新布局：U1 占 hub，U2 想占 hub 的邻居
    await pool.execute("DELETE FROM k_sgzzmap_tile WHERE server_id = ? AND cell IN (?, ?, ?, ?, ?)",
        [SID, hub, ring[0], ring[1], ring[2], ring[3]]);
    for (const uid of [U1, U2]) {
        await pool.execute("DELETE FROM k_sgzzmap_holding WHERE server_id = ? AND uid = ?", [SID, uid]);
        await pool.execute("DELETE FROM k_sgzzmap_alliance_member WHERE server_id = ? AND uid = ?", [SID, uid]);
    }
    await pool.execute("DELETE FROM k_sgzzmap_alliance WHERE server_id = ? AND leader_uid IN (?, ?)", [SID, U1, U2]);

    await api.occupy(U1, SID, hub, op("ally-hub"));

    // U2 还没入盟：占 U1 旁边的空格只能靠出生豁免，先把豁免用掉
    await api.occupy(U2, SID, SEAT, op("ally-u2-spawn"));
    await assert.rejects(() => api.occupy(U2, SID, PROBE, op("ally-u2-far")),
        (e: unknown) => e instanceof RpcFault && e.rpcCode === "SGZZMAP_NOT_ADJACENT",
        "⚠ 前提：PROBE 与 U2 自己的地不相邻，唯一的有主邻居 hub 属于非盟友的 U1");

    // 建盟 + 入盟后，U1 的地对 U2 变成 UNION ⇒ 同一格立刻可连
    const created = await api.alliance(U1, SID, {
        clientReqId: `ic-${TAG}`, act: "create", name: "青州军", tag: `Q${TAG.slice(0, 3)}`,
    }, op("ally-create"));
    const aid = created.alliance!.allianceId;
    await api.alliance(U2, SID, { clientReqId: `ij-${TAG}`, act: "join", allianceId: aid }, op("ally-join"));

    const res = await api.occupy(U2, SID, PROBE, op("ally-u2-union"));
    assert.equal(res.outcome, "captured", "入盟后同一格必须可连地");

    const [tiles] = await pool.execute<RowDataPacket[]>(
        "SELECT owner_aid FROM k_sgzzmap_tile WHERE server_id = ? AND owner_uid = ?", [SID, U1]);
    for (const row of tiles as unknown as { owner_aid: string }[]) {
        assert.equal(row.owner_aid, aid, "建盟要把名下地块统统改挂盟旗");
    }

    // 一人一盟：重复入盟被 PK (server_id, uid) 挡住
    await assert.rejects(() => api.alliance(U2, SID, {
        clientReqId: `ij2-${TAG}`, act: "join", allianceId: aid,
    }, op("ally-join2")), (e: unknown) => e instanceof RpcFault && e.rpcCode === "SGZZMAP_ALLIANCE_EXISTS");
});

test("真库：到期行军被结算到终点 —— 覆盖 LIMIT 绑定与 FOR UPDATE 队列", async () => {
    const pool = getPool();
    // 找一条从 hub 出发、两步可通行的直线
    const t = terrainOf();
    let dest: number | null = null;
    for (let dir = 1; dir <= 6 && dest === null; dir += 1) {
        let cur = sgzzDecodeCell(hub); let ok = true;
        for (let i = 0; i < 2; i += 1) {
            cur = sgzzNextPos(cur.row, cur.col, dir);
            if (!sgzzIsPassable(t, cur.row, cur.col)) { ok = false; break; }
        }
        if (ok) dest = sgzzCellOf(cur.row, cur.col);
    }
    assert.ok(dest !== null, "找不到可通行的两步直线");

    const marchId = `m-int-${TAG}`;
    const path = [hub, dest!];
    const departAt = Date.now() - 60_000;
    const arriveAt = departAt + sgzzMarchDurationMs(path);
    assert.equal(arriveAt - departAt, 2 * SGZZ_MARCH_MS_PER_TILE);

    await pool.execute("DELETE FROM k_sgzzmap_tile WHERE server_id = ? AND cell = ?", [SID, dest]);
    await pool.execute("DELETE FROM k_sgzzmap_march WHERE server_id = ? AND march_id = ?", [SID, marchId]);
    await pool.execute(
        "INSERT INTO k_sgzzmap_march (server_id, march_id, uid, path_json, depart_at, arrive_at, status) "
        + "VALUES (?, ?, ?, ?, ?, ?, 'marching')",
        [SID, marchId, U1, JSON.stringify(path), departAt, arriveAt]);

    const res = await api.settleDueMarches(SID);
    assert.ok(res.settled >= 1, `应至少结算一条，实得 ${res.settled}`);

    const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT status FROM k_sgzzmap_march WHERE server_id = ? AND march_id = ?", [SID, marchId]);
    assert.equal((rows as unknown as { status: string }[])[0].status, "arrived");

    const [tiles] = await pool.execute<RowDataPacket[]>(
        "SELECT owner_uid FROM k_sgzzmap_tile WHERE server_id = ? AND cell = ?", [SID, dest]);
    assert.equal((tiles as unknown as { owner_uid: string }[])[0]?.owner_uid, U1,
        "到达必须在终点落地（⚠ 终点与出发地不相邻，⛔ 结算不走连地闸）");

    // 幂等：再结算一次不动它
    const settledAgain = await api.settleDueMarches(SID);
    const [after2] = await pool.execute<RowDataPacket[]>(
        "SELECT durability FROM k_sgzzmap_tile WHERE server_id = ? AND cell = ?", [SID, dest]);
    assert.equal(Number((after2 as unknown as { durability: number }[])[0].durability), 1,
        `⛔ 不得重复落地（第二轮又结算了 ${settledAgain.settled} 条）`);

    await pool.execute("DELETE FROM k_sgzzmap_tile WHERE server_id = ? AND cell = ?", [SID, dest]);
});
