/**
 * MMO MF8-B7 交接真栈故障矩阵（docs/MMO.md §5.4 MF8 退出条件 / §10.2「源 / 目标在交接各阶段崩溃」；真 Server + 真 Redis 租约 / 凭据 + 真 MySQL
 * 状态机 + @colyseus/sdk）。四个注入点各一段（scripts/fault-matrix.config.json `world-transfer` 组；plain test:int 下同样执行，只是不记 coverage）：
 *  - transfer-reply-lost：客户端丢了「交接就绪」token ⇒ world.resolveTransfer 轮换凭据 ⇒ 旧凭据作废、新凭据进目标房；
 *  - transfer-client-drop：客户端 Committed 后掉线（不去目标房）⇒ 交接留在 committed（卸载闸计 1 条在途）⇒ 再次 world.enter 被解析到交接目标 ⇒ 完成；
 *  - transfer-source-crash：源房 Committed 后崩溃（离座 / 归还控制权都没来得及）⇒ 目标房凭凭据照常接住；源房迟到的归还写 0 行；
 *  - transfer-target-crash：目标房 activate 后、finalize 前崩溃 ⇒ 再次 world.enter 懒 finalize（⛔ 二次激活：enter 结果 transferId=null）⇒ 目标房′ 从检查点恢复后接住。
 * 只激活一次：world_transfer 每条 committed → activated 恰一次（持久 CAS），四段都以 finalized 收敛；kit 载荷（via:"portal"）随行落库一次。
 * 前置：本地栈已启动且 db:bootstrap 已到 MF8-B1 形态。⚠ int 文件只能单文件串行跑。
 * 变异验证：enterRpc.resolveCommitted 不作废旧凭据 → reply-lost 段「旧凭据作废」转红；enterRpc.enter 的 activated 分支不懒 finalize → target-crash 段转红
 *（「已消费的交接在取控制权前拒」的变异在 test/world-transfer-room.test.ts）。
 */
import "./env-setup"; // 必须第一个 import
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import { C2S, GAMEPLAY_CATALOG, RoomName, S2C, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase, type IWorldFixtureTransfer, type IWorldRoomJoinOptions } from "@game/shared";
import { withKitTx, withKitWorldTx } from "../../src/core/infra/kitApi";
import { kWorldFence, kWorldLease } from "../../src/core/infra/keys";
import { closeMysql, getPool, type RowDataPacket } from "../../src/core/infra/mysql";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { handleWorldEnter, handleWorldResolveTransfer } from "../../src/core/world/enterRpc";
import { readControl, releaseControl } from "../../src/rooms/core/control";
import { readTransfer } from "../../src/rooms/core/transfer";
import { WorldCheckpointer } from "../../src/rooms/core/WorldCheckpoint";
import { worldAddressOf, worldDirectory } from "../../src/rooms/core/WorldDirectory";
import { WorldLease, defaultWorldLeaseDeps } from "../../src/rooms/core/WorldLease";
import { redisWorldTicketPort, worldTicketHash } from "../../src/rooms/core/WorldTicket";
import { sqlWorldTransferPort } from "../../src/rooms/core/WorldTransfer";
import { worldModeRegistry } from "../../src/rooms/WorldMode";
import { WorldRoom } from "../../src/rooms/WorldRoom";
import { countInFlightTransfers } from "../../tools/plugin/transferGate";
import { exerciseFaultPoint } from "../faultMatrix";
import { KITFIX_CHECKPOINT_TABLE, KITFIX_ID, KITFIX_WORLD_EVENT_TABLE, KITFIX_WORLD_SQL, SqlCheckpointPort } from "../fixtures/kitfixWorld";
import { WORLD_FIXTURE_CHECKPOINT_SCHEMA, WORLD_FIXTURE_MODE_ID, createWorldFixtureMode, type WorldFixtureMode } from "../fixtures/worldFixtureMode";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const SID = 0;
const MAP_A = `wtf-${testUid("a").slice(-10)}-a`.slice(0, 48);
const MAP_B = `wtf-${testUid("b").slice(-10)}-b`.slice(0, 48);
const uids: string[] = [];
const uid = (name: string): string => { const value = testUid(name).slice(0, 32); uids.push(value); return value; };
type WorldStateView = { readonly phase: string; readonly instanceId: string; readonly mapId: string; readonly authorityEpoch: number };
const stateOf = (room: SDKRoom): WorldStateView => JSON.parse(JSON.stringify(room.state)) as WorldStateView;

const port = new SqlCheckpointPort({ query: (sql, params) => getPool().query(sql, params) as never });
const capability = { kitId: KITFIX_ID, port, schema: WORLD_FIXTURE_CHECKPOINT_SCHEMA, eventTable: KITFIX_WORLD_EVENT_TABLE };
const worldEventTables = (kitId: string): readonly string[] => (kitId === KITFIX_ID ? [KITFIX_WORLD_EVENT_TABLE] : []);
const checkpointer = (): WorldCheckpointer => new WorldCheckpointer(capability, SID, {
    withWorldTx: (kitId, sId, scope, fn, deps) => withKitWorldTx(kitId, sId, scope, fn, { worldEventTables, ...deps }),
});

/** 注入点开关（用例内按段置位）：holdComplete = 源房 Committed 后崩溃（completeTransfer 永不跑）；failFinalize = 目标房 finalize 前崩溃。 */
let holdComplete = false;
let failFinalize = false;
/** 快租约（ttl 900 / renew 300）+ 短宽限 + kitfix 检查点编排 + 可注入 timers / transfers。 */
class TestWorldRoom extends WorldRoom {
    constructor() {
        super({
            lease: { acquire: (sId, instanceId, holder) => WorldLease.acquire(sId, instanceId, holder, { ...defaultWorldLeaseDeps, ttlMs: 900, renewMs: 300 }) },
            world: { emptyPolicy: "run", emptyAfterMs: 120_000, checkpointMs: 100_000 },
            checkpointer: checkpointer(),
            drainGraceMs: 100,
            timers: {
                set: (fn, ms) => (holdComplete ? null : setTimeout(fn, ms)),
                clear: (handle) => { if (handle) clearTimeout(handle as NodeJS.Timeout); },
            },
            transfers: {
                ...sqlWorldTransferPort,
                finalize: (sId, transferId) => (failFinalize ? Promise.reject(new Error("crash-before-finalize")) : sqlWorldTransferPort.finalize(sId, transferId)),
            },
        });
    }
}

async function waitFor(predicate: () => boolean | Promise<boolean>, label: string, timeoutMs = 6_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(25);
    }
    assert.ok(await predicate(), label);
}
const once = <T>(room: SDKRoom, type: string): Promise<T> => new Promise((resolve) => { room.onMessage(type, (payload: T) => resolve(payload)); });
const leftCode = (room: SDKRoom): Promise<number> => new Promise((resolve) => { room.onLeave((code: number) => resolve(code)); });

after(async () => {
    const pool = getPool();
    for (const value of uids) {
        const [personas] = await pool.query<RowDataPacket[]>("SELECT persona_id FROM persona WHERE user_id = ?", [value]);
        for (const row of personas) await pool.execute("DELETE FROM world_transfer WHERE server_id = ? AND persona_id = ?", [SID, String(row.persona_id)]);
        await pool.execute("DELETE FROM persona WHERE user_id = ?", [value]);
    }
    for (const mapId of [MAP_A, MAP_B]) {
        const [rows] = await pool.query<RowDataPacket[]>("SELECT instance_id FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, mapId]);
        for (const row of rows) {
            await coordClient().unlink(kWorldLease(SID, String(row.instance_id)), kWorldFence(SID, String(row.instance_id)));
            worldDirectory.forget(SID, String(row.instance_id));
        }
        await pool.execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, mapId]);
    }
    await pool.query(`DROP TABLE IF EXISTS ${KITFIX_CHECKPOINT_TABLE}`);
    await pool.query(`DROP TABLE IF EXISTS ${KITFIX_WORLD_EVENT_TABLE}`);
    await closeRedis();
    await closeMysql();
});

test("交接四注入：reply-lost / client-drop / source-crash / target-crash 下只激活一次、凭据一次性、预留与在途按状态机收敛", { timeout: 90_000 }, async () => {
    await assertRedisUp();
    const pool = getPool();
    for (const statement of KITFIX_WORLD_SQL.split(";").map((s) => s.trim()).filter((s) => s.length > 0)) {
        await pool.query(statement.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS "));
    }
    const modes: WorldFixtureMode[] = [];
    const unregister = worldModeRegistry.register(WORLD_FIXTURE_MODE_ID, () => {
        const mode = createWorldFixtureMode({ capacity: 4, staticCount: 1, checkpoint: capability });
        modes.push(mode);
        return mode as never;
    });
    const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
    server.define(RoomName.World, TestWorldRoom).filterBy(["sId", "mode", "profile", "mapId", "line"]);
    await server.listen(0);
    const rooms: SDKRoom[] = [];
    try {
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;
        const options = (personaId: string, mapId: string, ticket: string): IWorldRoomJoinOptions => ({
            v: WORLD_ROOM_PROTOCOL_VERSION, sId: SID, mode: WORLD_FIXTURE_MODE_ID, modeVersion: GAMEPLAY_CATALOG.worldFixture.modeVersion,
            profile: "world", mapId, personaId, ticket,
        });
        const connect = async (user: string, personaId: string, mapId: string, ticket: string): Promise<SDKRoom> => {
            const { token } = await issueSession(user, null, "", SID);
            const sdk = new SDKClient(endpoint);
            sdk.auth.token = token;
            const room = await sdk.joinOrCreate(RoomName.World, options(personaId, mapId, ticket));
            rooms.push(room);
            await waitFor(() => stateOf(room).phase === WorldPhase.Active && stateOf(room).instanceId.length > 0, `${mapId} Active`);
            return room;
        };
        const enter = (user: string, personaId: string, mapId: string) => handleWorldEnter(user, SID, { personaId, mapId });
        const resolve = (user: string, transferId: string) => handleWorldResolveTransfer(user, SID, { transferId });
        const seated = async (room: SDKRoom, personaId: string): Promise<void> => {
            const local = matchMaker.getLocalRoomById(room.roomId) as unknown as WorldRoom;
            await waitFor(() => local.seatedSessionIds().includes(room.sessionId), `${personaId} 入座 ${room.roomId}`);
        };
        /** 进 A 并发 portal → 拿到「交接就绪」token（或只等 Committed 行）。 */
        const startTransfer = async (name: string): Promise<{ user: string; persona: string; a: SDKRoom; ready: Promise<IWorldFixtureTransfer>; left: Promise<number> }> => {
            const user = uid(name);
            const persona = await withKitTx(KITFIX_ID, SID, (tx) => tx.createPersona(user, 0));
            const first = await enter(user, persona, MAP_A);
            assert.equal(first.transferId, null);
            const a = await connect(user, persona, MAP_A, first.ticket);
            await seated(a, persona);
            const ready = once<IWorldFixtureTransfer>(a, S2C.WorldFixtureTransfer);
            const left = leftCode(a);
            a.send(C2S.WorldFixturePortal, { toMap: MAP_B });
            return { user, persona, a, ready, left };
        };
        const addressB = worldAddressOf(SID, MAP_B, 0);
        const expectFinalized = async (persona: string, transferId: string, epoch: number): Promise<void> => {
            await waitFor(async () => (await readTransfer(SID, transferId))?.state === "finalized", "交接 finalized");
            const row = await readTransfer(SID, transferId);
            assert.deepEqual([row?.active, row?.toMap, row?.payload], [false, MAP_B, { via: "portal" }], "终态 + kit 载荷落库一次");
            const control = await readControl(SID, persona);
            assert.deepEqual([control?.worldAddress, control?.controlEpoch], [addressB, epoch], "控制权在目标分线");
        };

        // ── ① 回复丢失：不用 token 里的凭据，走 resolveTransfer 轮换 ─────────────────────────────────────────────
        await exerciseFaultPoint("transfer-reply-lost", async () => {
            const s = await startTransfer("lost");
            const ready = await s.ready;
            assert.equal(await s.left, 4000, "源房 Committed 后按主动离开关闭（CONSENTED）");
            const resolved = await resolve(s.user, ready.transferId);
            assert.deepEqual([resolved.transferId, resolved.mapId, resolved.endpoint], [ready.transferId, MAP_B, ""], "按 transferId 重取凭据");
            assert.notEqual(resolved.ticket, ready.ticket, "凭据轮换");
            assert.deepEqual(await redisWorldTicketPort().claim({
                sId: SID, session: "ghost", uid: s.user, personaId: s.persona, worldAddress: addressB, controlEpoch: 1, ticketSha256: worldTicketHash(ready.ticket),
            }), { kind: "refused", reason: "missing" }, "旧凭据作废");
            const b = await connect(s.user, s.persona, MAP_B, resolved.ticket);
            await seated(b, s.persona);
            await expectFinalized(s.persona, ready.transferId, 2);
            const afterDone = await resolve(s.user, ready.transferId);
            assert.equal(afterDone.transferId, null, "已终态：resolveTransfer 退化为目标分线普通凭据（重连）");
        });

        // ── ② 客户端掉线：Committed 后不去目标房；再次 enter 被解析到交接目标 ───────────────────────────────────────
        await exerciseFaultPoint("transfer-client-drop", async () => {
            const s = await startTransfer("drop");
            const ready = await s.ready;
            await s.left;
            assert.equal((await readTransfer(SID, ready.transferId))?.state, "committed", "客户端不来 ⇒ 留在 committed");
            // 归还控制权是源房离座后的异步任务（WorldRoom.releaseControlLater）：客户端先看到关闭码，落库可能晚几十毫秒——按条件等，⛔ 立即断言（MK4-B5 故障矩阵全表跑出的竞态）
            await waitFor(async () => (await readControl(SID, s.persona))?.worldAddress === null, "源房已归还控制权");
            assert.equal(await countInFlightTransfers({ query: (sql, params) => pool.query(sql, params) as never }, KITFIX_ID), 1, "卸载闸：该 kit 有 1 条在途 ⇒ 拒卸载");
            const again = await enter(s.user, s.persona, MAP_A);
            assert.deepEqual([again.transferId, again.mapId], [ready.transferId, MAP_B], "enter 被解析到交接目标（⛔ 绕开交接回 A）");
            const b = await connect(s.user, s.persona, MAP_B, again.ticket);
            await seated(b, s.persona);
            await expectFinalized(s.persona, ready.transferId, 2);
            await waitFor(async () => (await countInFlightTransfers({ query: (sql, params) => pool.query(sql, params) as never }, KITFIX_ID)) === 0, "收敛后在途 0");
        });

        // ── ③ 源房崩溃：Committed 后 completeTransfer 永不跑（离座 / 归还都没来得及）⇒ 目标房照常接住；源房迟到归还 0 行 ─────────
        await exerciseFaultPoint("transfer-source-crash", async () => {
            holdComplete = true;
            try {
                const s = await startTransfer("src");
                const ready = await s.ready;
                assert.equal((await readControl(SID, s.persona))?.worldAddress, worldAddressOf(SID, MAP_A, 0), "源房没来得及归还：控制权仍在 A");
                const b = await connect(s.user, s.persona, MAP_B, ready.ticket);
                await seated(b, s.persona);
                await expectFinalized(s.persona, ready.transferId, 2);
                assert.equal(await releaseControl(SID, s.persona, 1), false, "源房迟到的归还写 0 行（epoch 已被目标房抬高）");
            } finally {
                holdComplete = false;
            }
        });

        // ── ④ 目标房崩溃：activate 后 finalize 前 ⇒ 再次 enter 懒 finalize（⛔ 二次激活）⇒ 目标房′ 从检查点恢复后接住 ────────
        await exerciseFaultPoint("transfer-target-crash", async () => {
            const s = await startTransfer("tgt");
            const ready = await s.ready;
            await s.left;
            failFinalize = true;
            let b: SDKRoom;
            try {
                b = await connect(s.user, s.persona, MAP_B, ready.ticket);
                await seated(b, s.persona);
                assert.equal((await readTransfer(SID, ready.transferId))?.state, "activated", "finalize 前崩溃：留在 activated");
                assert.equal((await readControl(SID, s.persona))?.controlEpoch, 2, "已激活一次");
            } finally {
                failFinalize = false;
            }
            // 硬杀目标房：停续租 + 停固定步、⛔ 不 drain（zombie）；租约过期后 B′ 才能建
            const localB = matchMaker.getLocalRoomById(b.roomId) as unknown as WorldRoom;
            (localB as unknown as { lease: { stop(): void } | null }).lease?.stop();
            localB.setSimulationInterval(undefined as never);
            await sleep(1_100);
            const again = await enter(s.user, s.persona, MAP_B);
            assert.equal(again.transferId, null, "懒 finalize 后按普通进入签发（⛔ 二次激活）");
            assert.equal((await readTransfer(SID, ready.transferId))?.state, "finalized");
            await assert.rejects(handleWorldResolveTransfer(s.user, SID, { transferId: "wt_missing_000" }));
            // B′：zombie B 仍持房间列表；新 joinOrCreate 可能命中 zombie 或新房——两者都必须最终落座（zombie 失租后 Draining ⇒ 拒 ⇒ 重试新房）
            let seatedRoom: SDKRoom | null = null;
            for (let attempt = 0; attempt < 6 && seatedRoom === null; attempt += 1) {
                try {
                    const candidate = await connect(s.user, s.persona, MAP_B, (attempt === 0 ? again : await enter(s.user, s.persona, MAP_B)).ticket);
                    await seated(candidate, s.persona);
                    seatedRoom = candidate;
                } catch {
                    await sleep(400);
                }
            }
            assert.ok(seatedRoom, "目标房′ 接住");
            const control = await readControl(SID, s.persona);
            assert.deepEqual([control?.worldAddress, control?.controlEpoch], [addressB, 3], "重连一次 ⇒ epoch 3（激活只发生过一次）");
        });
    } finally {
        for (const room of rooms) {
            const open = (room as unknown as { connection?: { isOpen?: boolean } }).connection?.isOpen === true;
            if (!open) continue;
            try { await Promise.race([room.leave(), sleep(1_000)]); } catch { /* 已关闭 */ }
        }
        await server.gracefullyShutdown(false);
        unregister();
    }
});
