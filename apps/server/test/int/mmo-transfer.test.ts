/**
 * mmo kit MK1-B3 两图交接真栈（真 MySQL / Redis + 真 Server + @colyseus/sdk；docs/MMO.md §7.6 MK1「两图交接」）：灰盒 greybox ↔ greybox-east 一对传送门。
 *  ① 建角（caster）→ world.enter（无在途 ⇒ transferId null）→ 进 greybox → 门外先发 transfer ⇒ opResult rejected「不在传送门范围内」→ 点地走到 gate-east（(1000,700) 半径 60）；
 *  ② 门内 c2s.mmoWorld.transfer ⇒ 框架 MF8 状态机（prepare → 强制点（persona 快照带 arrival）→ 凭据 → commit）⇒ perSession s2c.mmoWorld.transferReady ⇒ 源房以 CONSENTED(4000) 关闭；
 *  ③ 回复丢失注入：不用 token 里的凭据，走 world.resolveTransfer 轮换 ⇒ 新凭据进 greybox-east ⇒ baseline 本人落在东郊 "gate" 落点 (500,720) + 2 只 slime + 职业 HP / MP；
 *     world_transfer 终态 finalized 且 kit 载荷 { portalId, toSpawnPointId } 落库一次；控制权在东郊；
 *  ④ 离座 ⇒ 角色检查点 mapId = greybox-east（选角页据此回东郊）；再 world.enter（无在途 ⇒ transferId null）⇒ 从东郊检查点位置起。
 * 其余三个注入（client-drop / source-crash / target-crash）是框架状态机的性质，由 MF8-B7 `world-transfer-flow` 在夹具 mode 上覆盖，kit ⛔ 复制。
 * 前置：本地栈已启动且 db:bootstrap 到 MK0-B1。⚠ int 文件只能单文件串行跑。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    C2S, GAMEPLAY_CATALOG, RoomName, S2C, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase,
    type IMmoEntityWire, type IMmoWorldBaselineBegin, type IMmoWorldBaselineChunk, type IMmoWorldOpResult, type IMmoWorldPos, type IMmoWorldPrivate, type IMmoWorldTransferReady, type IWorldRoomJoinOptions,
} from "@game/shared";
import { parseWorldAddress } from "@game/shared/kits/mmo/api/world/index";
import { GREYBOX_EAST_MAP_ID, GREYBOX_MAP_ID, GREYBOX_PORTAL_EAST_ID } from "@game/shared/kits/mmo/content/greybox";
import { kWorldFence, kWorldLease } from "../../src/core/infra/keys";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { handleWorldEnter, handleWorldResolveTransfer } from "../../src/core/world/enterRpc";
import { createCharacter, listCharacters } from "../../src/kits/mmo/api/characters/index";
import { mmoOpId } from "../../src/kits/mmo/host";
import { readControl } from "../../src/rooms/core/control";
import { readTransfer } from "../../src/rooms/core/transfer";
import { WorldLease, defaultWorldLeaseDeps } from "../../src/rooms/core/WorldLease";
import { worldAddressOf, worldDirectory } from "../../src/rooms/core/WorldDirectory";
import { worldModeRegistry } from "../../src/rooms/WorldMode";
import { WorldRoom } from "../../src/rooms/WorldRoom";
import { registerMmoWorldWorldMode } from "../../src/rooms/modes/mmoWorld/index";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const SID = 0;
const MAP_A = GREYBOX_MAP_ID;
const MAP_B = GREYBOX_EAST_MAP_ID;
const uids: string[] = [];
const uid = (name: string): string => { const value = testUid(name).slice(0, 32); uids.push(value); return value; };

class TestWorldRoom extends WorldRoom {
    constructor() {
        super({ lease: { acquire: (sId, instanceId, holder) => WorldLease.acquire(sId, instanceId, holder, { ...defaultWorldLeaseDeps, ttlMs: 900, renewMs: 300 }) }, drainGraceMs: 200 });
    }
}

after(async () => {
    const pool = getPool();
    for (const value of uids) {
        const [rows] = await pool.query("SELECT character_id, persona_id FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        for (const row of rows as { character_id: string; persona_id: string }[]) {
            await pool.execute("DELETE FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ?", [SID, row.character_id]);
            await pool.execute("DELETE FROM k_mmo_receipt WHERE server_id = ? AND character_id = ?", [SID, row.character_id]);
            await pool.execute("DELETE FROM world_transfer WHERE server_id = ? AND persona_id = ?", [SID, row.persona_id]);
        }
        await pool.execute("DELETE FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        await pool.execute("DELETE FROM persona WHERE user_id = ?", [value]);
    }
    for (const mapId of [MAP_A, MAP_B]) {
        const [instances] = await pool.query("SELECT instance_id FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, mapId]);
        for (const row of instances as { instance_id: string }[]) {
            await coordClient().unlink(kWorldLease(SID, row.instance_id), kWorldFence(SID, row.instance_id));
            worldDirectory.forget(SID, row.instance_id);
            await pool.execute("DELETE FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ?", [SID, row.instance_id]);
            await pool.execute("DELETE FROM k_mmo_instance WHERE server_id = ? AND instance_id = ?", [SID, row.instance_id]);
        }
        await pool.execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, mapId]);
    }
    await closeRedis();
    await closeMysql();
});

async function waitFor(predicate: () => boolean | Promise<boolean>, label: string, timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(25);
    }
    assert.ok(await predicate(), label);
}

type RootView = { readonly phase: string; readonly mapId: string; readonly instanceId: string };
const rootOf = (room: SDKRoom): RootView => room.state as unknown as RootView;
const once = <T>(room: SDKRoom, type: string): Promise<T> => new Promise((resolve) => { room.onMessage(type, (payload: T) => resolve(payload)); });
const leftCode = (room: SDKRoom): Promise<number> => new Promise((resolve) => { room.onLeave((code: number) => resolve(code)); });

function collect(room: SDKRoom) {
    const begins: IMmoWorldBaselineBegin[] = [];
    const chunks: IMmoWorldBaselineChunk[] = [];
    const privates: IMmoWorldPrivate[] = [];
    const positions: IMmoWorldPos[] = [];
    const results: IMmoWorldOpResult[] = [];
    room.onMessage(S2C.MmoWorldBaselineBegin, (payload: IMmoWorldBaselineBegin) => { begins.push(payload); });
    room.onMessage(S2C.MmoWorldBaselineChunk, (payload: IMmoWorldBaselineChunk) => { chunks.push(payload); });
    room.onMessage(S2C.MmoWorldPrivate, (payload: IMmoWorldPrivate) => { privates.push(payload); });
    room.onMessage(S2C.MmoWorldPos, (payload: IMmoWorldPos) => { positions.push(payload); });
    room.onMessage(S2C.MmoWorldOpResult, (payload: IMmoWorldOpResult) => { results.push(payload); });
    for (const type of [S2C.MmoWorldBaselineEnd, S2C.MmoWorldEnter, S2C.MmoWorldLeave, S2C.MmoWorldUpdate, S2C.Welcome, S2C.Error]) room.onMessage(type, () => undefined);
    const itemsOf = (begin: IMmoWorldBaselineBegin): IMmoEntityWire[] => chunks.filter((chunk) => chunk.baselineId === begin.baselineId).sort((a, b) => a.index - b.index).flatMap((chunk) => chunk.items);
    const selfOf = (): IMmoEntityWire | null => (begins.length > 0 ? itemsOf(begins[0]!).find((item) => item.kind === "character") ?? null : null);
    return { begins, chunks, privates, positions, results, itemsOf, selfOf };
}

test("MK1-B3：门外拒 → 门内交接 ⇒ transferReady + 源房关闭 → resolveTransfer 轮换凭据进东郊落点（2 只 slime）→ finalized + 载荷落库 → 离座检查点 mapId 东郊 → 再进从检查点起", { timeout: 60_000 }, async () => {
    await assertRedisUp();
    const user = uid("mmot");
    const name = `Tf${user.slice(-8)}`;
    const created = await createCharacter(user, SID, { slot: 0, name, classId: "caster", factionId: "dusk" }, mmoOpId(user, SID, "createCharacter", "c1"));
    const personaId = created.character.personaId;
    const unregister = registerMmoWorldWorldMode(worldModeRegistry);
    const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
    server.define(RoomName.World, TestWorldRoom).filterBy(["sId", "mode", "profile", "mapId", "line"]);
    await server.listen(0);
    const rooms: SDKRoom[] = [];
    try {
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;
        // 监听在 join 一回来就挂（再等 Active）：已 Active 的房下一 tick 就发 baseline，晚挂会丢
        const connect = async (mapId: string, ticket: string): Promise<{ room: SDKRoom; inbox: ReturnType<typeof collect> }> => {
            const { token } = await issueSession(user, null, "", SID);
            const sdk = new SDKClient(endpoint);
            sdk.auth.token = token;
            const options: IWorldRoomJoinOptions = {
                v: WORLD_ROOM_PROTOCOL_VERSION, sId: SID, mode: "mmoWorld", modeVersion: GAMEPLAY_CATALOG.mmoWorld.modeVersion, profile: "world", mapId, personaId, ticket,
            };
            const room = await sdk.joinOrCreate(RoomName.World, options);
            rooms.push(room);
            const inbox = collect(room);
            await waitFor(() => rootOf(room).phase === WorldPhase.Active && rootOf(room).instanceId.length > 0, `${mapId} Active`);
            return { room, inbox };
        };
        // ① 进 greybox；门外先发 ⇒ rejected
        const first = await handleWorldEnter(user, SID, { personaId, mapId: MAP_A });
        assert.deepEqual([first.transferId, first.mapId], [null, MAP_A], "无在途交接 ⇒ 普通凭据");
        const { room: a, inbox: inboxA } = await connect(MAP_A, first.ticket);
        await waitFor(() => inboxA.selfOf() !== null, "A baseline 含本人");
        assert.deepEqual([inboxA.selfOf()!.x, inboxA.selfOf()!.y, inboxA.selfOf()!.templateId], [1000, 1000, "caster"]);
        a.send(C2S.MmoWorldTransfer, { portalId: GREYBOX_PORTAL_EAST_ID, clientReqId: "t0" });
        await waitFor(() => inboxA.results.some((result) => result.clientReqId === "t0"), "门外回执");
        assert.deepEqual([inboxA.results[0]!.result, inboxA.results[0]!.detail], ["rejected", "不在传送门范围内"]);
        // 点地走到门内（caster 110 / s：260 单位 ≈ 2.4 s）
        a.send(C2S.MmoWorldMove, { seq: 1, target: { x: 1000, y: 740 } });
        await waitFor(() => inboxA.positions.some((pos) => Math.abs(pos.y - 740) < 1e-6), "到门内 (1000, 740)", 10_000);
        // ② 门内交接 ⇒ transferReady（凭据只此一处）⇒ 源房 CONSENTED 关闭
        const readyPromise = once<IMmoWorldTransferReady>(a, S2C.MmoWorldTransferReady);
        const leftPromise = leftCode(a);
        a.send(C2S.MmoWorldTransfer, { portalId: GREYBOX_PORTAL_EAST_ID, clientReqId: "t1" });
        const ready = await readyPromise;
        assert.deepEqual([parseWorldAddress(ready.worldAddress)?.mapId, ready.ticket.length > 0, ready.expiresAt > Date.now()], [MAP_B, true, true], "交接就绪：东郊分线 + 凭据");
        assert.equal(await leftPromise, 4000, "源房 Committed 后以 CONSENTED 关闭");
        assert.equal((await readTransfer(SID, ready.transferId))?.state, "committed");
        // ③ 回复丢失注入：走 resolveTransfer 轮换凭据进东郊
        const resolved = await handleWorldResolveTransfer(user, SID, { transferId: ready.transferId });
        assert.deepEqual([resolved.transferId, resolved.mapId], [ready.transferId, MAP_B]);
        assert.notEqual(resolved.ticket, ready.ticket, "凭据轮换");
        const { room: b, inbox: inboxB } = await connect(MAP_B, resolved.ticket);
        await waitFor(() => inboxB.selfOf() !== null, "B baseline 含本人");
        const selfB = inboxB.selfOf()!;
        assert.deepEqual([selfB.x, selfB.y], [500, 720], "东郊 gate 落点（persona 快照 arrival）");
        assert.equal(inboxB.itemsOf(inboxB.begins[0]!).filter((item) => item.kind === "creature").length, 2, "东郊 2 只 slime（(700,500) 距 (500,720) ≈ 297 在视距内）");
        await waitFor(() => inboxB.privates.length >= 1, "私有流");
        assert.deepEqual([inboxB.privates[0]!.hpMax, inboxB.privates[0]!.mpMax], [80, 100], "职业 HP / MP 随身");
        await waitFor(async () => (await readTransfer(SID, ready.transferId))?.state === "finalized", "交接 finalized");
        const row = await readTransfer(SID, ready.transferId);
        assert.deepEqual([row?.toMap, row?.payload, row?.active], [MAP_B, { portalId: GREYBOX_PORTAL_EAST_ID, toSpawnPointId: "gate" }, false], "kit 载荷落库一次 + 终态");
        assert.equal((await readControl(SID, personaId))?.worldAddress, worldAddressOf(SID, MAP_B, 0), "控制权在东郊");
        // ④ 离座 ⇒ 角色检查点 mapId = 东郊；再进从检查点起
        await b.leave();
        await waitFor(async () => (await listCharacters(user, SID)).characters[0]?.mapId === MAP_B, "离座检查点 mapId = greybox-east");
        const again = await handleWorldEnter(user, SID, { personaId, mapId: MAP_B });
        assert.equal(again.transferId, null, "已终态 ⇒ 普通进入");
        const { inbox: inboxB2 } = await connect(MAP_B, again.ticket);
        await waitFor(() => inboxB2.selfOf() !== null, "再进东郊 baseline");
        assert.deepEqual([inboxB2.selfOf()!.x, inboxB2.selfOf()!.y], [500, 720], "从东郊检查点位置起");
    } finally {
        for (const room of rooms) {
            if (room.connection.isOpen) await Promise.race([room.leave(), sleep(2_000)]);
        }
        await sleep(300);
        await server.gracefullyShutdown(false);
        unregister();
    }
});
