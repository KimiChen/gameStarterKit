/**
 * MMO MF4-B8 世界房真栈（真 Server + 真 Redis 租约 + 真 MySQL 权威 / 控制权 + @colyseus/sdk；docs/MMO.md §5.4 MF4 退出条件）：
 *  ① worldFixture 只新增文件即建房 / 准入 / 推进：SDK joinOrCreate(RoomName.World) → Active root（Schema 生命周期字段）→ move 意图 → pos 回执（服务端积分）；
 *     world_instance 行 active + 权威 epoch 1 + 租约键存在；persona.control_epoch 1 + world_address 指向分线；
 *  ② 双登只一个控制权：同 persona 第二连接 ⇒ 第一连接以 KICK_CLOSE_CODE[Replaced] 关闭、control_epoch=2、同分线同房；
 *  ③ 租约失效拒输入并 Draining：DEL kWorldLease ⇒ 续租 lost ⇒ Draining（新准入 WorldDraining）⇒ 宽限后 Offline：会话以 WITH_ERROR 关闭、
 *     world_instance.state=offline、控制权归还（world_address NULL）、房已 dispose；
 *  ④ 错误码：错 v ⇒ ProtocolMismatch、match 形态 mode ⇒ BadRequest、不存在 persona ⇒ PersonaNotFound、非本账号 persona ⇒ BadRequest。
 * 前置：本地 Redis / MySQL 栈已启动且 db:bootstrap 到 MF4-B3 形态。⚠ int 文件只能单文件串行跑。
 * 变异验证：WorldRoom.onJoin 删 ⑨ 顶号离座 → ②「旧连接被踢」转红；WorldLease.start 不回调 onLost → ③「续租 lost ⇒ Draining」转红。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    C2S, ErrorCode, ForceLogoutReason, GAMEPLAY_CATALOG, KICK_CLOSE_CODE, RoomName, S2C, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase,
    type IWorldFixturePos, type IWorldRoomJoinOptions,
} from "@game/shared";
import { withKitTx } from "../../src/core/infra/kitApi";
import { kWorldFence, kWorldLease } from "../../src/core/infra/keys";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { readControl, readInstance } from "../../src/rooms/core/control";
import { WorldLease, defaultWorldLeaseDeps } from "../../src/rooms/core/WorldLease";
import { worldAddressOf, worldDirectory } from "../../src/rooms/core/WorldDirectory";
import { worldModeRegistry } from "../../src/rooms/WorldMode";
import { WORLD_DRAINED_CLOSE_CODE, WorldRoom } from "../../src/rooms/WorldRoom";
import { WORLD_FIXTURE_MODE_ID, createWorldFixtureMode } from "../fixtures/worldFixtureMode";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const SID = 0;
const MAP_ID = `wr-${testUid("map").slice(-12)}`.slice(0, 48);
const uids: string[] = [];
const uid = (name: string): string => { const value = testUid(name).slice(0, 32); uids.push(value); return value; };

/** 测试房型：快租约（ttl 900 / renew 300）+ 短宽限；其余全走生产缺省（真目录 / 真控制面 / 占位 ticket 端口）。 */
class TestWorldRoom extends WorldRoom {
    constructor() {
        super({
            lease: { acquire: (sId, instanceId, holder) => WorldLease.acquire(sId, instanceId, holder, { ...defaultWorldLeaseDeps, ttlMs: 900, renewMs: 300 }) },
            drainGraceMs: 200,
        });
    }
}

after(async () => {
    for (const value of uids) await getPool().execute("DELETE FROM persona WHERE user_id = ?", [value]);
    const [rows] = await getPool().query("SELECT instance_id FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
    for (const row of rows as { instance_id: string }[]) {
        await coordClient().unlink(kWorldLease(SID, row.instance_id), kWorldFence(SID, row.instance_id));
        worldDirectory.forget(SID, row.instance_id);
    }
    await getPool().execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
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

const codeOf = (code: number) => (error: unknown): boolean => error instanceof Error && error.message.includes(String(code));

type WorldStateView = { readonly tick: number; readonly phase: string; readonly instanceId: string; readonly mapId: string; readonly line: number; readonly authorityEpoch: number; readonly entityCount: number };
const stateOf = (room: SDKRoom): WorldStateView => room.state as unknown as WorldStateView;

test("worldFixture 真栈：建房 / 准入 / 推进；双登只一个控制权；租约失效 ⇒ Draining → Offline；错误码", { timeout: 40_000 }, async () => {
    await assertRedisUp();
    const uidA = uid("wa");
    const uidB = uid("wb");
    const uidC = uid("wc");
    const personaA = await withKitTx("arena", SID, (tx) => tx.createPersona(uidA, 0));
    const personaB = await withKitTx("arena", SID, (tx) => tx.createPersona(uidB, 0));
    const personaC = await withKitTx("arena", SID, (tx) => tx.createPersona(uidC, 0));
    const unregister = worldModeRegistry.register(WORLD_FIXTURE_MODE_ID, () => createWorldFixtureMode({ capacity: 4 }) as never);
    const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
    server.define(RoomName.World, TestWorldRoom).filterBy(["sId", "mode", "profile", "mapId", "line"]);
    await server.listen(0);
    const rooms: SDKRoom[] = [];
    try {
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;
        const options = (personaId: string, overrides: Partial<IWorldRoomJoinOptions> = {}): IWorldRoomJoinOptions => ({
            v: WORLD_ROOM_PROTOCOL_VERSION, sId: SID, mode: WORLD_FIXTURE_MODE_ID, modeVersion: GAMEPLAY_CATALOG.worldFixture.modeVersion,
            profile: "world", mapId: MAP_ID, personaId, ticket: "t".repeat(24), ...overrides,
        });
        const connect = async (user: string, personaId: string, overrides: Partial<IWorldRoomJoinOptions> = {}): Promise<SDKRoom> => {
            const { token } = await issueSession(user, null, "", SID);
            const sdk = new SDKClient(endpoint);
            sdk.auth.token = token;
            const room = await sdk.joinOrCreate(RoomName.World, options(personaId, overrides));
            rooms.push(room);
            return room;
        };

        // ① 建房 / 准入 / 推进
        const a = await connect(uidA, personaA);
        const aPos: IWorldFixturePos[] = [];
        a.onMessage(S2C.WorldFixturePos, (payload: IWorldFixturePos) => { aPos.push(payload); });
        await waitFor(() => stateOf(a).phase === WorldPhase.Active && stateOf(a).instanceId.length > 0, "SDK 收到 Active root");
        const view = stateOf(a);
        assert.deepEqual([view.mapId, view.line, view.authorityEpoch, view.entityCount], [MAP_ID, 0, 1, 5], "生命周期字段 + 4 静态体 + 1 移动体");
        const instanceId = view.instanceId;
        const row = await readInstance(SID, instanceId);
        assert.ok(row && row.state === "active" && row.authorityEpoch === 1 && row.holder.startsWith(a.roomId), `world_instance 行：${JSON.stringify(row)}`);
        assert.equal(await coordClient().exists(kWorldLease(SID, instanceId)), 1, "租约键存在");
        assert.deepEqual(await readControl(SID, personaA), { controlEpoch: 1, worldAddress: worldAddressOf(SID, MAP_ID, 0) });
        a.send(C2S.WorldFixtureMove, { dirX: 1, dirY: 0, seq: 1 });
        await waitFor(() => aPos.length >= 1, "move 意图 ⇒ pos 回执");
        assert.deepEqual({ entityId: aPos[0]!.entityId, x: aPos[0]!.x, y: aPos[0]!.y, seq: aPos[0]!.seq }, { entityId: `mover-${personaA}`, x: 502, y: 500, seq: 1 }, "服务端常量速度积分");
        await waitFor(() => stateOf(a).tick > 5, "固定步推进");

        // ④ 错误码（onAuth / onJoin 各自的拒绝点）
        await assert.rejects(connect(uidB, personaB, { v: WORLD_ROOM_PROTOCOL_VERSION + 1 }), codeOf(ErrorCode.ProtocolMismatch), "错 v");
        await assert.rejects(connect(uidB, personaB, { mode: "snake", modeVersion: GAMEPLAY_CATALOG.snake.modeVersion, profile: "dropIn" }), codeOf(ErrorCode.BadRequest), "match 形态 mode ⛔ 进世界房");
        await assert.rejects(connect(uidB, "p_missing_000000000001"), codeOf(ErrorCode.PersonaNotFound), "persona 不存在");
        await assert.rejects(connect(uidB, personaA), codeOf(ErrorCode.BadRequest), "非本账号 persona");

        // ② 双登只一个控制权
        let aLeaveCode: number | undefined;
        a.onLeave((code) => { aLeaveCode = code; });
        const a2 = await connect(uidA, personaA);
        await waitFor(() => aLeaveCode !== undefined, "旧连接被踢");
        assert.equal(aLeaveCode, KICK_CLOSE_CODE[ForceLogoutReason.Replaced]);
        assert.equal(a2.roomId, a.roomId, "同分线同房");
        assert.deepEqual(await readControl(SID, personaA), { controlEpoch: 2, worldAddress: worldAddressOf(SID, MAP_ID, 0) });
        const local = matchMaker.getLocalRoomById(a2.roomId) as unknown as WorldRoom;
        assert.ok(local instanceof WorldRoom);
        await waitFor(() => local.seatedSessionIds().length === 1 && local.seatedSessionIds()[0] === a2.sessionId, "会话表只剩新连接");
        const b = await connect(uidB, personaB);
        await waitFor(() => local.seatedCount === 2, "B 入座");

        // ③ 租约失效 ⇒ Draining ⇒ Offline
        let a2LeaveCode: number | undefined;
        let bLeaveCode: number | undefined;
        a2.onLeave((code) => { a2LeaveCode = code; });
        b.onLeave((code) => { bLeaveCode = code; });
        await coordClient().del(kWorldLease(SID, instanceId));
        await waitFor(() => local.phase === WorldPhase.Draining || local.phase === WorldPhase.Offline, "续租 lost ⇒ Draining", 3_000);
        await assert.rejects(connect(uidC, personaC), codeOf(ErrorCode.WorldDraining), "Draining 拒新准入");
        await waitFor(() => a2LeaveCode !== undefined && bLeaveCode !== undefined, "宽限后 Offline 关闭全部会话", 5_000);
        assert.deepEqual([a2LeaveCode, bLeaveCode], [WORLD_DRAINED_CLOSE_CODE, WORLD_DRAINED_CLOSE_CODE]);
        await waitFor(async () => (await readInstance(SID, instanceId))?.state === "offline", "world_instance.state = offline");
        await waitFor(async () => (await readControl(SID, personaA))?.worldAddress === null && (await readControl(SID, personaB))?.worldAddress === null, "控制权归还");
        assert.equal(await coordClient().exists(kWorldLease(SID, instanceId)), 0, "租约键不存在");
        await waitFor(() => matchMaker.getLocalRoomById(a2.roomId) === undefined, "房已 dispose");
    } finally {
        // 已被服务端关闭的 SDK room 再 leave 会等一个永不到来的 LEAVE 回执：只对仍开着的连接 leave，且限时。
        for (const room of rooms) {
            const open = (room as unknown as { connection?: { isOpen?: boolean } }).connection?.isOpen === true;
            if (!open) continue;
            try { await Promise.race([room.leave(), sleep(1_000)]); } catch { /* 已关闭 */ }
        }
        await server.gracefullyShutdown(false);
        unregister();
    }
});
