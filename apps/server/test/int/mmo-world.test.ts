/**
 * mmo kit MK0 真栈（真 MySQL / Redis + 真 Server + @colyseus/sdk；docs/MMO.md §7.6 MK0 验收「一个角色进图、走路、看到怪」）：
 *  ① characters 面：建角（createPersona + 角色行 + 回执同事务）→ 列表；同 opId 重放回读；同槽再建 MmoSlotTakenError；同名 MmoNameTakenError；
 *  ② mmoWorld 真房：凭据（world.enter 同形）→ joinOrCreate(RoomName.World) → Active root（packId / population）→ 首个 baseline 含本人 + 三只 slime
 *     （视距 400 内）→ move 意图 ⇒ update 单流 seq 递增且本人 x 前进、直发 pos 回执 seq = 意图（MK1-B1）→ private 收到 hp / mp → baselineRequest ⇒ 再一份 baseline；
 *  ③ 离座强制点：leave 后 k_mmo_character_checkpoint 落一行（snapshot 位置 = 离座时位置、mapId = greybox）、k_mmo_character.checkpoint_rev 前进、
 *     列表的 mapId 变成 greybox；再进图从检查点位置起（onEnter 回灌）。
 * 前置：本地栈已启动且 db:bootstrap 到 MK0-B1（k_mmo_* 七表）。⚠ int 文件只能单文件串行跑。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    C2S, GAMEPLAY_CATALOG, RoomName, S2C, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase,
    type IMmoEntityWire, type IMmoWorldBaselineBegin, type IMmoWorldBaselineChunk, type IMmoWorldPos, type IMmoWorldPrivate, type IMmoWorldUpdate, type IWorldRoomJoinOptions,
} from "@game/shared";
import { GREYBOX_MAP_ID } from "@game/shared/kits/mmo/content/greybox";
import { kWorldFence, kWorldLease } from "../../src/core/infra/keys";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { MmoNameTakenError, MmoSlotTakenError, createCharacter, listCharacters } from "../../src/kits/mmo/api/characters/index";
import { mmoOpId } from "../../src/kits/mmo/host";
import { readControl } from "../../src/rooms/core/control";
import { issueWorldTicket } from "../../src/rooms/core/WorldTicket";
import { WorldLease, defaultWorldLeaseDeps } from "../../src/rooms/core/WorldLease";
import { worldAddressOf, worldDirectory } from "../../src/rooms/core/WorldDirectory";
import { worldModeRegistry } from "../../src/rooms/WorldMode";
import { WorldRoom } from "../../src/rooms/WorldRoom";
import { registerMmoWorldWorldMode } from "../../src/rooms/modes/mmoWorld/index";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const SID = 0;
const MAP_ID = GREYBOX_MAP_ID;
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
        const [rows] = await pool.query("SELECT character_id FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        for (const row of rows as { character_id: string }[]) {
            await pool.execute("DELETE FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ?", [SID, row.character_id]);
            await pool.execute("DELETE FROM k_mmo_receipt WHERE server_id = ? AND character_id = ?", [SID, row.character_id]);
        }
        await pool.execute("DELETE FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        await pool.execute("DELETE FROM persona WHERE user_id = ?", [value]);
    }
    const [instances] = await pool.query("SELECT instance_id FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
    for (const row of instances as { instance_id: string }[]) {
        await coordClient().unlink(kWorldLease(SID, row.instance_id), kWorldFence(SID, row.instance_id));
        worldDirectory.forget(SID, row.instance_id);
        await pool.execute("DELETE FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ?", [SID, row.instance_id]);
        await pool.execute("DELETE FROM k_mmo_instance WHERE server_id = ? AND instance_id = ?", [SID, row.instance_id]);
    }
    await pool.execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
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

type RootView = { readonly phase: string; readonly mapId: string; readonly packId: string; readonly packVersion: number; readonly population: number; readonly instanceId: string };
const rootOf = (room: SDKRoom): RootView => room.state as unknown as RootView;

function collect(room: SDKRoom) {
    const begins: IMmoWorldBaselineBegin[] = [];
    const chunks: IMmoWorldBaselineChunk[] = [];
    const updates: IMmoWorldUpdate[] = [];
    const privates: IMmoWorldPrivate[] = [];
    const positions: IMmoWorldPos[] = [];
    room.onMessage(S2C.MmoWorldBaselineBegin, (payload: IMmoWorldBaselineBegin) => { begins.push(payload); });
    room.onMessage(S2C.MmoWorldBaselineChunk, (payload: IMmoWorldBaselineChunk) => { chunks.push(payload); });
    room.onMessage(S2C.MmoWorldBaselineEnd, () => undefined);
    room.onMessage(S2C.MmoWorldEnter, () => undefined);
    room.onMessage(S2C.MmoWorldLeave, () => undefined);
    room.onMessage(S2C.MmoWorldUpdate, (payload: IMmoWorldUpdate) => { updates.push(payload); });
    room.onMessage(S2C.MmoWorldPrivate, (payload: IMmoWorldPrivate) => { privates.push(payload); });
    room.onMessage(S2C.MmoWorldPos, (payload: IMmoWorldPos) => { positions.push(payload); });
    room.onMessage(S2C.Welcome, () => undefined);
    room.onMessage(S2C.Error, () => undefined);
    const itemsOf = (begin: IMmoWorldBaselineBegin): IMmoEntityWire[] => chunks.filter((chunk) => chunk.baselineId === begin.baselineId).sort((a, b) => a.index - b.index).flatMap((chunk) => chunk.items);
    return { begins, chunks, updates, privates, positions, itemsOf };
}

test("MK0：建角 → 进图（看到三只 slime）→ 走路 → 离座强制点落角色检查点 → 再进图从检查点位置起", { timeout: 60_000 }, async () => {
    await assertRedisUp();
    const user = uid("mmo");
    const name = `Rk${user.slice(-8)}`;
    // ① characters 面
    const created = await createCharacter(user, SID, { slot: 0, name, classId: "fighter", factionId: "dawn" }, mmoOpId(user, SID, "createCharacter", "c1"));
    assert.equal(created.replayed, false);
    const replay = await createCharacter(user, SID, { slot: 0, name, classId: "fighter", factionId: "dawn" }, mmoOpId(user, SID, "createCharacter", "c1"));
    assert.deepEqual([replay.replayed, replay.character.characterId], [true, created.character.characterId], "同 opId 重放回读回执");
    await assert.rejects(createCharacter(user, SID, { slot: 0, name: `${name}b`, classId: "caster", factionId: "dusk" }, mmoOpId(user, SID, "createCharacter", "c2")), MmoSlotTakenError);
    await assert.rejects(createCharacter(user, SID, { slot: 1, name, classId: "caster", factionId: "dusk" }, mmoOpId(user, SID, "createCharacter", "c3")), MmoNameTakenError);
    const listing = await listCharacters(user, SID);
    assert.deepEqual(listing.characters.map((c) => [c.slot, c.name, c.mapId, c.status]), [[0, name, null, "active"]]);
    assert.deepEqual(listing.orphans, [], "建角事务原子：无孤儿 persona");
    const personaId = created.character.personaId;

    // ② 真房
    const unregister = registerMmoWorldWorldMode(worldModeRegistry);
    const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
    server.define(RoomName.World, TestWorldRoom).filterBy(["sId", "mode", "profile", "mapId", "line"]);
    await server.listen(0);
    const rooms: SDKRoom[] = [];
    try {
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;
        // 监听在 join 一回来就挂（再等 Active）：再进已 Active 的房时下一 tick 就发 baseline，晚挂会丢（MK1-B3 修）
        const connect = async (): Promise<{ room: SDKRoom; inbox: ReturnType<typeof collect> }> => {
            const { token } = await issueSession(user, null, "", SID);
            const sdk = new SDKClient(endpoint);
            sdk.auth.token = token;
            const control = await readControl(SID, personaId);
            const issued = await issueWorldTicket({ sId: SID, uid: user, personaId, worldAddress: worldAddressOf(SID, MAP_ID, 0), controlEpoch: control?.controlEpoch ?? 0, transferId: null, nowMs: Date.now() });
            const options: IWorldRoomJoinOptions = {
                v: WORLD_ROOM_PROTOCOL_VERSION, sId: SID, mode: "mmoWorld", modeVersion: GAMEPLAY_CATALOG.mmoWorld.modeVersion, profile: "world", mapId: MAP_ID, personaId, ticket: issued.ticket,
            };
            const room = await sdk.joinOrCreate(RoomName.World, options);
            rooms.push(room);
            return { room, inbox: collect(room) };
        };
        const { room: a, inbox } = await connect();
        await waitFor(() => rootOf(a).phase === WorldPhase.Active && rootOf(a).instanceId.length > 0, "Active root");
        assert.deepEqual([rootOf(a).mapId, rootOf(a).packId, rootOf(a).packVersion, rootOf(a).population], [MAP_ID, "greybox", 4, 1], "root：图 / 内容包 / 在线数");
        await waitFor(() => inbox.begins.length >= 1 && inbox.itemsOf(inbox.begins[0]!).length >= 4, "首个 baseline：本人 + 三只 slime");
        const items = inbox.itemsOf(inbox.begins[0]!);
        const self = items.find((item) => item.kind === "character");
        assert.ok(self && self.name === name && self.templateId === "fighter", "本人投影");
        assert.equal(items.filter((item) => item.kind === "creature" && item.templateId === "slime").length, 3, "视距 400 内三只 slime");
        assert.deepEqual([self.x, self.y], [1000, 1000], "首次进图在出生点");
        await waitFor(() => inbox.privates.length >= 1, "本人私有流 hp / mp");
        assert.deepEqual([inbox.privates[0]!.hp, inbox.privates[0]!.mp], [100, 50]);

        // 走路：dir (1,0) ⇒ 每步 120 × 0.05 = 6 单位
        a.send(C2S.MmoWorldMove, { seq: 1, dir: { x: 1, y: 0 } });
        await waitFor(() => inbox.updates.some((update) => update.id === self.id && update.x >= 1024), "本人 x 前进（≥ 4 步）");
        const seqs = inbox.updates.map((update) => update.seq);
        for (let index = 1; index < seqs.length; index += 1) assert.ok(seqs[index]! >= seqs[index - 1]!, "update 单流 seq 单调");
        await waitFor(() => inbox.positions.some((pos) => pos.seq === 1 && pos.x >= 1024), "直发 pos 回执：seq = 意图 1 且 x 前进");
        a.send(C2S.MmoWorldMove, { seq: 2, dir: { x: 0, y: 0 } });
        await sleep(200);
        const lastX = inbox.updates.filter((update) => update.id === self.id).at(-1)!.x;
        await sleep(200);
        assert.equal(inbox.updates.filter((update) => update.id === self.id).at(-1)!.x, lastX, "停下后不再前进");
        assert.deepEqual([inbox.positions.at(-1)!.seq, inbox.positions.at(-1)!.x], [2, lastX], "最后一条 pos 回执 = 停下意图 seq 2、位置 = 视野流终点");
        assert.ok(lastX > 1000 && lastX < 1200, `位置 ${lastX}`);

        // baselineRequest ⇒ 再一份 baseline
        a.send(C2S.MmoWorldBaselineRequest, { authorityEpoch: 1, afterSeq: 0 });
        await waitFor(() => inbox.begins.length >= 2, "客户端重同步 ⇒ 第二份 baseline");

        // ③ 离座强制点
        await a.leave();
        await waitFor(async () => {
            const [rows] = await getPool().query("SELECT checkpoint_rev FROM k_mmo_character WHERE server_id = ? AND character_id = ?", [SID, created.character.characterId]);
            return Number((rows as { checkpoint_rev: number }[])[0]?.checkpoint_rev ?? 0) >= 1;
        }, "离座 ⇒ 角色检查点落库、checkpoint_rev 前进");
        const [rows] = await getPool().query("SELECT envelope FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ? ORDER BY rev DESC LIMIT 1", [SID, created.character.characterId]);
        const envelope = (rows as { envelope: unknown }[])[0]!.envelope;
        const snapshot = (typeof envelope === "string" ? JSON.parse(envelope) : envelope).snapshot as { mapId: string; x: number; y: number; hp: number; mp: number };
        assert.equal(snapshot.mapId, MAP_ID);
        assert.ok(Math.abs(snapshot.x - lastX) < 1e-6 && snapshot.y === 1000, `快照位置 ${JSON.stringify(snapshot)}`);
        const after = await listCharacters(user, SID);
        assert.equal(after.characters[0]?.mapId, MAP_ID, "选角页读最新检查点的 mapId");

        // 再进图：从检查点位置起（persona 信封回灌）
        const { inbox: inboxB } = await connect();
        await waitFor(() => inboxB.begins.length >= 1 && inboxB.itemsOf(inboxB.begins[0]!).some((item) => item.kind === "character"), "再进图 baseline");
        const selfB = inboxB.itemsOf(inboxB.begins[0]!).find((item) => item.kind === "character")!;
        assert.ok(Math.abs(selfB.x - lastX) < 1e-6, `回灌位置 ${selfB.x} vs ${lastX}`);
    } finally {
        for (const room of rooms) {
            if (room.connection.isOpen) await Promise.race([room.leave(), sleep(2_000)]);
        }
        await sleep(300);
        await server.gracefullyShutdown(false);
        unregister();
    }
});
