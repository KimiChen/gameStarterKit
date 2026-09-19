/**
 * MMO MF7b-B5 崩溃重启真栈（真 Server + 真 Redis 租约 + 真 MySQL：world_instance / persona / kitfix 两表 + @colyseus/sdk；docs/MMO.md §5.4 MF7b / §7.3）：
 *  ① 房 A（SDK 真连接）：alice 移动 → loot（durable 事件）→ 强制点 ⇒ 同一世界事务落分线快照 + persona 快照 + 事件行 + world_instance.checkpoint_rev；
 *  ② grant worker（真租约 withKitWorkerTx）认领门内事件 ⇒ credit（opId = eventId）⇒ 余额 +5；再跑一轮 0 事件；
 *  ③ 硬杀 A（停续租 + 停固定步 + ⛔ 不 drain）→ 租约过期 → A′ 直构（同一持久层）取权威 epoch 2、Recovering 从检查点 rev 1 回灌；
 *     alice 再入 A′ ⇒ persona 检查点回灌：位置 = 强制点时的位置（回退 ≤ 1 周期，⛔ 不是崩溃前最后位置）、控制权 epoch 2；
 *  ④ A 的迟到写（zombie 强制检查点）⇒ withWorldTx 首句 0 行 ⇒ AuthorityLostError ⇒ A Draining；checkpoint_rev 不被旧 owner 推进；
 *  ⑤ 货币 0 回退：重启后 worker 不重复发奖（事件已 done）；A′ 再 loot + 强制点 ⇒ 新事件 ⇒ 余额 +5（恰一次）。
 * 前置：本地 Redis / MySQL 栈已启动（本文件在 dev 库直接建 / 删 kitfix 两表）。⚠ int 文件只能单文件串行跑。
 * 变异验证：WorldCheckpointer.save 不落 persona 快照 → ③「位置回灌」转红；withKitWorldTx 删首句谓词 → ④「迟到写被拒」转红。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import { C2S, GAMEPLAY_CATALOG, RoomName, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase, type IWorldRoomJoinOptions } from "@game/shared";
import { KIT_EFFECT_KINDS } from "@game/shared/kits/catalog.generated";
import { CUR_GOLD } from "../../src/core/infra/config";
import { creditInTx, debitInTx, getBalance, invalidateBalanceCache } from "../../src/core/economy/currency";
import { assertOutboxIntentMatches, insertOutboxIntent } from "../../src/core/economy/outbox";
import { withKitTx, withKitWorkerTx, withKitWorldTx, type KitWorkerTxDeps } from "../../src/core/infra/kitApi";
import { kWorldFence, kWorldLease } from "../../src/core/infra/keys";
import { renewLeaseGuard, tryAcquireLease } from "../../src/core/infra/lease";
import { closeMysql, getPool, withRcTx, type RowDataPacket } from "../../src/core/infra/mysql";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { readControl, readInstance } from "../../src/rooms/core/control";
import { WorldCheckpointer } from "../../src/rooms/core/WorldCheckpoint";
import { WorldLease, defaultWorldLeaseDeps } from "../../src/rooms/core/WorldLease";
import { worldDirectory } from "../../src/rooms/core/WorldDirectory";
import { worldModeRegistry } from "../../src/rooms/WorldMode";
import { WorldRoom, type WorldRoomAuth } from "../../src/rooms/WorldRoom";
import {
    KITFIX_CHECKPOINT_TABLE, KITFIX_GRANT_WORKER, KITFIX_ID, KITFIX_WORLD_EVENT_TABLE, KITFIX_WORLD_SQL, SqlCheckpointPort, createGrantWorker,
} from "../fixtures/kitfixWorld";
import {
    WORLD_FIXTURE_CHECKPOINT_SCHEMA, WORLD_FIXTURE_MODE_ID, createWorldFixtureMode, type WorldFixtureMode, type WorldFixturePersonaSnapshot,
} from "../fixtures/worldFixtureMode";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const SID = 0;
const MAP_ID = `wcr-${testUid("map").slice(-12)}`.slice(0, 48);
const LEASE_NAME = `kit:${KITFIX_ID}:${KITFIX_GRANT_WORKER}`;
const uids: string[] = [];
const uid = (name: string): string => { const value = testUid(name).slice(0, 32); uids.push(value); return value; };

const port = new SqlCheckpointPort({ query: (sql, params) => getPool().query(sql, params) as never });
const capability = { kitId: KITFIX_ID, port, schema: WORLD_FIXTURE_CHECKPOINT_SCHEMA, eventTable: KITFIX_WORLD_EVENT_TABLE };
const worldEventTables = (kitId: string): readonly string[] => (kitId === KITFIX_ID ? [KITFIX_WORLD_EVENT_TABLE] : []);
const checkpointer = (): WorldCheckpointer => new WorldCheckpointer(capability, SID, {
    withWorldTx: (kitId, sId, scope, fn, deps) => withKitWorldTx(kitId, sId, scope, fn, { worldEventTables, ...deps }),
});
/** 测试房型：快租约（ttl 900 / renew 300）、run 策略、周期检查点关掉（只用强制点，让位置回退可控）、注入 kitfix 检查点编排。 */
class TestWorldRoom extends WorldRoom {
    /** Colyseus 建房无参（真固定步）；直构的 A′ 传 manualTick（由用例 advance 驱动，⛔ 留下 interval 钉住进程）。 */
    constructor(manualTick = false) {
        super({
            lease: { acquire: (sId, instanceId, holder) => WorldLease.acquire(sId, instanceId, holder, { ...defaultWorldLeaseDeps, ttlMs: 900, renewMs: 300 }) },
            world: { emptyPolicy: "run", emptyAfterMs: 120_000, checkpointMs: 100_000 },
            checkpointer: checkpointer(),
            drainGraceMs: 100,
            manualTick,
        });
    }
}

after(async () => {
    const pool = getPool();
    for (const value of uids) await pool.execute("DELETE FROM persona WHERE user_id = ?", [value]);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT instance_id FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
    for (const row of rows) {
        await coordClient().unlink(kWorldLease(SID, String(row.instance_id)), kWorldFence(SID, String(row.instance_id)));
        worldDirectory.forget(SID, String(row.instance_id));
    }
    await pool.execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
    await pool.execute("DELETE FROM singleton_lease WHERE lease_name = ?", [LEASE_NAME]);
    await pool.query(`DROP TABLE IF EXISTS ${KITFIX_CHECKPOINT_TABLE}`);
    await pool.query(`DROP TABLE IF EXISTS ${KITFIX_WORLD_EVENT_TABLE}`);
    await closeRedis();
    await closeMysql();
});

async function waitFor(predicate: () => boolean | Promise<boolean>, label: string, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(25);
    }
    assert.ok(await predicate(), label);
}

interface CheckpointRow extends RowDataPacket { scope: string; key_id: string; rev: number; envelope: unknown }
interface EventRow extends RowDataPacket { event_id: string; seq: number; status: number; checkpoint_rev: number; payload: unknown }
const envelopeOf = (row: CheckpointRow): { rev: number; snapshot: unknown } => {
    const raw = typeof row.envelope === "string" ? JSON.parse(row.envelope) as { rev: number; snapshot: unknown } : row.envelope as { rev: number; snapshot: unknown };
    return { rev: Number(raw.rev), snapshot: raw.snapshot };
};

test("崩溃重启：强制点同事务落盘 → worker 发奖恰一次 → 硬杀 A → A′ 从检查点恢复（位置回退 ≤ 1 周期、货币 0 回退）→ A 迟到写被存储边界拒", { timeout: 60_000 }, async () => {
    await assertRedisUp();
    const pool = getPool();
    for (const statement of KITFIX_WORLD_SQL.split(";").map((s) => s.trim()).filter((s) => s.length > 0)) {
        await pool.query(statement.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS "));
    }
    await pool.execute("INSERT IGNORE INTO singleton_lease (lease_name, holder, fence_token, expires_at) VALUES (?, '', 0, NOW(3) - INTERVAL 1 SECOND)", [LEASE_NAME]);
    const uidA = uid("wa");
    const personaA = await withKitTx(KITFIX_ID, SID, (tx) => tx.createPersona(uidA, 0));
    const owner = { kind: "persona", personaId: personaA } as const;
    const modes: WorldFixtureMode[] = [];
    const unregister = worldModeRegistry.register(WORLD_FIXTURE_MODE_ID, () => {
        const mode = createWorldFixtureMode({ capacity: 4, staticCount: 2, checkpoint: capability });
        modes.push(mode);
        return mode as never;
    });
    const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
    server.define(RoomName.World, TestWorldRoom).filterBy(["sId", "mode", "profile", "mapId", "line"]);
    await server.listen(0);
    const rooms: SDKRoom[] = [];
    const workerDeps: KitWorkerTxDeps = {
        withRcTx, renewLeaseGuard, debitInTx, creditInTx, insertOutboxIntent, assertOutboxIntentMatches, invalidateBalanceCache, kinds: KIT_EFFECT_KINDS, worldEventTables,
    };
    // kit 表闸不放行框架表 persona：夹具直接经框架池回查 uid（真 kit 会把 uid 写进事件载荷或自己的角色表）
    const grant = createGrantWorker(async (_tx, sId, personaId) => {
        const [personaRows] = await pool.query<RowDataPacket[]>("SELECT user_id FROM persona WHERE server_id = ? AND persona_id = ?", [sId, personaId]);
        return personaRows.length === 0 ? null : String(personaRows[0]!.user_id);
    });
    const runGrantPass = async (): Promise<number> => {
        const lease = await tryAcquireLease(LEASE_NAME, `worker-${process.pid}`, 15, pool);
        assert.ok(lease, "grant worker 取到租约");
        let processed = 0;
        for (let round = 0; round < 4; round += 1) {
            const before = processed;
            const result = await withKitWorkerTx(KITFIX_ID, KITFIX_GRANT_WORKER, SID, lease, (tx) =>
                grant.pass(tx, { kitId: KITFIX_ID, workerId: KITFIX_GRANT_WORKER, sId: SID, now: Date.now(), signal: new AbortController().signal }), workerDeps);
            const [done] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${KITFIX_WORLD_EVENT_TABLE} WHERE server_id = ? AND status = 1`, [SID]);
            processed = Number(done[0]!.n);
            if (!(result as { more?: boolean } | undefined)?.more || processed === before) break;
        }
        await pool.execute("UPDATE singleton_lease SET expires_at = NOW(3) - INTERVAL 1 SECOND WHERE lease_name = ?", [LEASE_NAME]);
        return processed;
    };
    let aPrime: TestWorldRoom | null = null;
    try {
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;
        const options = (): IWorldRoomJoinOptions => ({
            v: WORLD_ROOM_PROTOCOL_VERSION, sId: SID, mode: WORLD_FIXTURE_MODE_ID, modeVersion: GAMEPLAY_CATALOG.worldFixture.modeVersion,
            profile: "world", mapId: MAP_ID, personaId: personaA, ticket: "t".repeat(24),
        });
        // ① 房 A：SDK 真连接
        const { token } = await issueSession(uidA, null, "", SID);
        const sdk = new SDKClient(endpoint);
        sdk.auth.token = token;
        const a = await sdk.joinOrCreate(RoomName.World, options());
        rooms.push(a);
        const local = matchMaker.getLocalRoomById(a.roomId) as unknown as TestWorldRoom;
        assert.ok(local instanceof WorldRoom);
        await waitFor(() => local.seatedCount === 1, "alice 入座");
        const modeA = modes[modes.length - 1]!;
        const instanceId = local.address.instanceId;
        assert.equal(local.checkpointRevision, 0, "空世界起步");
        a.send(C2S.WorldFixtureMove, { dirX: 1, dirY: 0, seq: 1 });
        await waitFor(() => (modeA.__probe.moverOf(a.sessionId)?.x ?? 0) >= 510, "alice 向东移动");
        a.send(C2S.WorldFixtureMove, { dirX: 0, dirY: 0, seq: 2 });
        await sleep(120);
        local.signal("loot", { session: a.sessionId, amount: 5 });
        local.signal("checkpoint", {});
        await waitFor(() => local.checkpointRevision >= 1, "强制点落盘 ⇒ rev 1");
        await local.flushCheckpoints();
        const checkpointX = modeA.__probe.moverOf(a.sessionId)!.x;
        const [cpRows] = await pool.query<CheckpointRow[]>(`SELECT scope, key_id, rev, envelope FROM ${KITFIX_CHECKPOINT_TABLE} WHERE server_id = ? ORDER BY scope, rev`, [SID]);
        const instanceCp = cpRows.filter((row) => row.scope === "instance" && row.key_id === instanceId).map(envelopeOf);
        const personaCp = cpRows.filter((row) => row.scope === "persona" && row.key_id === personaA).map(envelopeOf);
        assert.deepEqual(instanceCp.map((c) => c.rev), [1], "分线快照 rev 1");
        assert.deepEqual(personaCp.map((c) => c.rev), [1], "persona 快照 rev 1（同一世界事务）");
        assert.equal((personaCp[0]!.snapshot as WorldFixturePersonaSnapshot).x, checkpointX);
        const [evRows] = await pool.query<EventRow[]>(`SELECT event_id, seq, status, checkpoint_rev, payload FROM ${KITFIX_WORLD_EVENT_TABLE} WHERE server_id = ? AND instance_id = ? ORDER BY seq`, [SID, instanceId]);
        assert.deepEqual(evRows.map((row) => [Number(row.seq), Number(row.status), Number(row.checkpoint_rev)]), [[1, 0, 1]], "事件行随同一批落库，checkpoint_rev = 1");
        assert.equal((await readInstance(SID, instanceId))?.checkpointRev, 1, "world_instance.checkpoint_rev 同事务推进");
        // ② worker：门内事件 ⇒ credit 恰一次；再跑一轮 0 事件
        assert.equal(await runGrantPass(), 1);
        assert.equal(await getBalance(uidA, SID, CUR_GOLD, owner), 5, "发奖 +5");
        assert.equal(await runGrantPass(), 1, "再跑：无新事件（done 不重复）");
        assert.equal(await getBalance(uidA, SID, CUR_GOLD, owner), 5);
        // 崩溃前继续移动（⛔ 无检查点）：这段位移将丢失（≤ 1 周期）
        a.send(C2S.WorldFixtureMove, { dirX: 1, dirY: 0, seq: 3 });
        await waitFor(() => (modeA.__probe.moverOf(a.sessionId)?.x ?? 0) >= checkpointX + 10, "崩溃前又走了一段");
        const lastX = modeA.__probe.moverOf(a.sessionId)!.x;
        // ③ 硬杀 A：停续租 + 停固定步、⛔ 不 drain（zombie）
        (local as unknown as { lease: { stop(): void } | null }).lease?.stop();
        local.setSimulationInterval(undefined as never);
        await sleep(1_100); // > ttl 900：租约过期
        assert.equal(await coordClient().exists(kWorldLease(SID, instanceId)), 0, "租约已过期");
        aPrime = new TestWorldRoom(true);
        await aPrime.onCreate(options());
        assert.equal(aPrime.address.instanceId, instanceId, "同一分线");
        assert.equal(aPrime.address.authorityEpoch, 2, "A′ 取权威 epoch 2");
        assert.equal(aPrime.checkpointRevision, 1, "Recovering 从检查点 rev 1 回灌");
        const modeAPrime = modes[modes.length - 1]!;
        assert.ok(modeAPrime !== modeA && modeAPrime.__probe.log.some((line) => line.startsWith("restore:")), "onRestore 回灌分线快照");
        assert.equal((aPrime.state as { entityCount?: number }).entityCount, 2, "静态体从快照恢复");
        const alice2 = {
            sessionId: "sa2", sent: [] as unknown[], closed: null as number | null,
            auth: { userId: uidA, sId: SID, mode: WORLD_FIXTURE_MODE_ID, profile: "world", mapId: MAP_ID, line: null, personaId: personaA, ticketSha256: "a".repeat(64), resumeSeq: null } satisfies WorldRoomAuth,
            send(type: string, payload: unknown) { this.sent.push([type, payload]); },
            leave(code?: number) { this.closed = code ?? -1; },
        };
        await aPrime.onJoin(alice2 as never, {});
        assert.ok(modeAPrime.__probe.log.includes("enter:sa2:restored"), "准入 persona 检查点回灌");
        const restoredX = modeAPrime.__probe.moverOf("sa2")!.x;
        assert.equal(restoredX, checkpointX, "位置 = 强制点时的位置（回退 ≤ 1 周期）");
        assert.ok(restoredX < lastX, "崩溃前未落盘的位移丢失（≤ 1 周期）");
        assert.equal((await readControl(SID, personaA))?.controlEpoch, 2, "控制权交到 A′（epoch 2）");
        // ④ A 的迟到写：zombie 强制检查点 ⇒ 首句 0 行 ⇒ AuthorityLostError ⇒ A Draining；checkpoint_rev 不被旧 owner 推进
        (local as unknown as { runtime: { forceCheckpoint(reason: string): boolean } }).runtime.forceCheckpoint("late");
        await local.flushCheckpoints();
        await waitFor(() => local.phase === WorldPhase.Draining || local.phase === WorldPhase.Offline, "旧 owner 迟到写被拒 ⇒ Draining", 3_000);
        assert.equal((await readInstance(SID, instanceId))?.checkpointRev, 1, "旧 owner ⛔ 推进 checkpoint_rev");
        assert.equal((await readInstance(SID, instanceId))?.authorityEpoch, 2);
        // ⑤ 货币 0 回退：重启后 worker 不重复发奖；A′ 再 loot + 强制点 ⇒ 新事件恰一次
        assert.equal(await runGrantPass(), 1, "重启后无新事件");
        assert.equal(await getBalance(uidA, SID, CUR_GOLD, owner), 5, "0 重复发奖");
        aPrime.signal("loot", { session: "sa2", amount: 5 });
        aPrime.signal("checkpoint", {});
        aPrime.advance(50);
        await aPrime.flushCheckpoints();
        assert.equal(aPrime.checkpointRevision, 2, "A′ 接着编号");
        assert.equal(await runGrantPass(), 2);
        assert.equal(await getBalance(uidA, SID, CUR_GOLD, owner), 10, "新事件恰一次");
        const [finalRows] = await pool.query<EventRow[]>(`SELECT event_id, seq, status, checkpoint_rev FROM ${KITFIX_WORLD_EVENT_TABLE} WHERE server_id = ? AND instance_id = ? ORDER BY seq`, [SID, instanceId]);
        assert.deepEqual(finalRows.map((row) => [Number(row.seq), Number(row.status), Number(row.checkpoint_rev)]), [[1, 1, 1], [2, 1, 2]]);
    } finally {
        for (const room of rooms) {
            const open = (room as unknown as { connection?: { isOpen?: boolean } }).connection?.isOpen === true;
            if (!open) continue;
            try { await Promise.race([room.leave(), sleep(1_000)]); } catch { /* 已关闭 */ }
        }
        if (aPrime) await aPrime.onDispose();
        await server.gracefullyShutdown(false);
        unregister();
    }
});
