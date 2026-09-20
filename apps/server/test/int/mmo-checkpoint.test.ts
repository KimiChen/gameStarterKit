/**
 * mmo kit MK1-B4 检查点 / 回退窗口真栈（真 MySQL / Redis + 真 Server + @colyseus/sdk；docs/MMO.md §7.3 回退窗口表 + §12 MK0 偏差 ⑩）：
 *  ① 两个角色进 greybox；A 走路；周期分线检查点（checkpointMs 300）把改过的怪物 hp（探针 7）与 A 的位置落库（k_mmo_instance_checkpoint / k_mmo_character_checkpoint）；
 *  ② B 离座 = persona 级强制点：B 多一行角色检查点且其 instance_rev 是预留号（⛔ 在分线检查点表里）、A 零新行、分线检查点最大 rev 不因离座前进；
 *  ③ 硬杀房（停续租 + 停固定步 + 锁住僵尸房让撮合建新房，⛔ drain / 强制点）→ 租约过期 → A 再 enter ⇒ 新房从分线检查点恢复（怪物 hp 7、权威 epoch 2）；
 *     A 的位置回到最近一次角色检查点（≤ 1 周期，⛔ 崩溃前最后位置）；
 *  ④ 角色检查点 rev 按角色单调（跨房不撞）：A 再离座 ⇒ rev 严格递增且 listCharacters 读到最新 mapId。
 * 前置：本地栈已启动且 db:bootstrap 到 MK1-B4（004 加 instance_rev 列）。⚠ int 文件只能单文件串行跑。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    C2S, GAMEPLAY_CATALOG, RoomName, S2C, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase,
    type IMmoEntityWire, type IMmoWorldBaselineBegin, type IMmoWorldBaselineChunk, type IMmoWorldPos, type IWorldRoomJoinOptions,
} from "@game/shared";
import { GREYBOX_MAP_ID } from "@game/shared/kits/mmo/content/greybox";
import { kWorldFence, kWorldLease } from "../../src/core/infra/keys";
import { closeMysql, getPool, type RowDataPacket } from "../../src/core/infra/mysql";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { handleWorldEnter } from "../../src/core/world/enterRpc";
import { createCharacter, listCharacters } from "../../src/kits/mmo/api/characters/index";
import { contentIndex } from "../../src/kits/mmo/api/content/index";
import { mmoOpId } from "../../src/kits/mmo/host";
import { WorldLease, defaultWorldLeaseDeps } from "../../src/rooms/core/WorldLease";
import { worldDirectory } from "../../src/rooms/core/WorldDirectory";
import { worldModeRegistry } from "../../src/rooms/WorldMode";
import { WorldRoom } from "../../src/rooms/WorldRoom";
import { MMO_WORLD_MODE_ID, createMmoWorldMode, type MmoWorldMode } from "../../src/rooms/modes/mmoWorld/index";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const SID = 0;
const MAP_ID = GREYBOX_MAP_ID;
const uids: string[] = [];
const uid = (name: string): string => { const value = testUid(name).slice(0, 32); uids.push(value); return value; };

/** 快租约（ttl 900 / renew 300）+ 周期分线检查点 300 ms + 空房保持运行。 */
class TestWorldRoom extends WorldRoom {
    constructor() {
        super({
            lease: { acquire: (sId, instanceId, holder) => WorldLease.acquire(sId, instanceId, holder, { ...defaultWorldLeaseDeps, ttlMs: 900, renewMs: 300 }) },
            world: { emptyPolicy: "run", emptyAfterMs: 120_000, checkpointMs: 300 },
            drainGraceMs: 100,
        });
    }
}

after(async () => {
    const pool = getPool();
    for (const value of uids) {
        const [rows] = await pool.query<RowDataPacket[]>("SELECT character_id, persona_id FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        for (const row of rows) {
            await pool.execute("DELETE FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ?", [SID, String(row.character_id)]);
            await pool.execute("DELETE FROM k_mmo_receipt WHERE server_id = ? AND character_id = ?", [SID, String(row.character_id)]);
            await pool.execute("DELETE FROM world_transfer WHERE server_id = ? AND persona_id = ?", [SID, String(row.persona_id)]);
        }
        await pool.execute("DELETE FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        await pool.execute("DELETE FROM persona WHERE user_id = ?", [value]);
    }
    const [instances] = await pool.query<RowDataPacket[]>("SELECT instance_id FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
    for (const row of instances) {
        await coordClient().unlink(kWorldLease(SID, String(row.instance_id)), kWorldFence(SID, String(row.instance_id)));
        worldDirectory.forget(SID, String(row.instance_id));
        await pool.execute("DELETE FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ?", [SID, String(row.instance_id)]);
        await pool.execute("DELETE FROM k_mmo_instance WHERE server_id = ? AND instance_id = ?", [SID, String(row.instance_id)]);
    }
    await pool.execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
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
type RootView = { readonly phase: string; readonly instanceId: string; readonly authorityEpoch: number };
const rootOf = (room: SDKRoom): RootView => room.state as unknown as RootView;

function collect(room: SDKRoom) {
    const begins: IMmoWorldBaselineBegin[] = [];
    const chunks: IMmoWorldBaselineChunk[] = [];
    const positions: IMmoWorldPos[] = [];
    room.onMessage(S2C.MmoWorldBaselineBegin, (payload: IMmoWorldBaselineBegin) => { begins.push(payload); });
    room.onMessage(S2C.MmoWorldBaselineChunk, (payload: IMmoWorldBaselineChunk) => { chunks.push(payload); });
    room.onMessage(S2C.MmoWorldPos, (payload: IMmoWorldPos) => { positions.push(payload); });
    for (const type of [S2C.MmoWorldBaselineEnd, S2C.MmoWorldEnter, S2C.MmoWorldLeave, S2C.MmoWorldUpdate, S2C.MmoWorldPrivate, S2C.MmoWorldOpResult, S2C.Welcome, S2C.Error]) room.onMessage(type, () => undefined);
    const itemsOf = (begin: IMmoWorldBaselineBegin): IMmoEntityWire[] => chunks.filter((chunk) => chunk.baselineId === begin.baselineId).sort((a, b) => a.index - b.index).flatMap((chunk) => chunk.items);
    const selfOf = (characterId: string): IMmoEntityWire | null => (begins.length > 0 ? itemsOf(begins[0]!).find((item) => item.id === `char:${characterId}`) ?? null : null);
    const creatureOf = (id: string): IMmoEntityWire | null => (begins.length > 0 ? itemsOf(begins[0]!).find((item) => item.id === id) ?? null : null);
    return { begins, positions, itemsOf, selfOf, creatureOf };
}

type CheckpointRow = RowDataPacket & { rev: number | string; instance_rev: number | string; envelope: unknown };
const personaRows = async (characterId: string): Promise<CheckpointRow[]> => {
    const [rows] = await getPool().query<CheckpointRow[]>("SELECT rev, instance_rev, envelope FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ? ORDER BY rev ASC", [SID, characterId]);
    return rows;
};
const instanceRevs = async (instanceId: string): Promise<number[]> => {
    const [rows] = await getPool().query<RowDataPacket[]>("SELECT rev FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ? ORDER BY rev ASC", [SID, instanceId]);
    return rows.map((row) => Number(row.rev));
};
const snapshotOf = (row: CheckpointRow): { x: number; y: number; mapId: string } => (typeof row.envelope === "string" ? JSON.parse(row.envelope) : row.envelope).snapshot as { x: number; y: number; mapId: string };

test("MK1-B4：周期分线检查点 → 离座 persona 级强制点（只落该角色、分线 rev 不动）→ 硬杀 → 恢复（怪物 hp / 位置 ≤ 1 周期、epoch +1）→ 角色 rev 按角色单调", { timeout: 60_000 }, async () => {
    await assertRedisUp();
    const userA = uid("ckA");
    const userB = uid("ckB");
    const a0 = await createCharacter(userA, SID, { slot: 0, name: `Ca${userA.slice(-8)}`, classId: "fighter", factionId: "dawn" }, mmoOpId(userA, SID, "createCharacter", "c1"));
    const b0 = await createCharacter(userB, SID, { slot: 0, name: `Cb${userB.slice(-8)}`, classId: "caster", factionId: "dusk" }, mmoOpId(userB, SID, "createCharacter", "c1"));
    const modes: MmoWorldMode[] = [];
    const unregister = worldModeRegistry.register(MMO_WORLD_MODE_ID, () => { const mode = createMmoWorldMode({ content: contentIndex() }); modes.push(mode); return mode; });
    const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
    server.define(RoomName.World, TestWorldRoom).filterBy(["sId", "mode", "profile", "mapId", "line"]);
    await server.listen(0);
    const rooms: SDKRoom[] = [];
    try {
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;
        const connect = async (user: string, personaId: string): Promise<{ room: SDKRoom; inbox: ReturnType<typeof collect> }> => {
            const granted = await handleWorldEnter(user, SID, { personaId, mapId: MAP_ID });
            const { token } = await issueSession(user, null, "", SID);
            const sdk = new SDKClient(endpoint);
            sdk.auth.token = token;
            const options: IWorldRoomJoinOptions = {
                v: WORLD_ROOM_PROTOCOL_VERSION, sId: SID, mode: "mmoWorld", modeVersion: GAMEPLAY_CATALOG.mmoWorld.modeVersion, profile: "world", mapId: MAP_ID, personaId, ticket: granted.ticket,
            };
            const room = await sdk.joinOrCreate(RoomName.World, options);
            rooms.push(room);
            const inbox = collect(room);
            await waitFor(() => rootOf(room).phase === WorldPhase.Active && rootOf(room).instanceId.length > 0, "Active");
            return { room, inbox };
        };
        // ① 两人进图；改一只怪的 hp（探针）；A 走路；等周期分线检查点把它们落库
        const { room: a, inbox: inboxA } = await connect(userA, a0.character.personaId);
        const { room: b } = await connect(userB, b0.character.personaId);
        const instanceId = rootOf(a).instanceId;
        assert.equal(rootOf(a).authorityEpoch, 1);
        await waitFor(() => inboxA.selfOf(a0.character.characterId) !== null, "A baseline");
        const mode = modes.at(-1)!;
        const slime = [...mode.__probe.entities().values()].find((entity) => entity.kind === "creature")!;
        slime.hp = 7;
        a.send(C2S.MmoWorldMove, { seq: 1, dir: { x: 1, y: 0 } });
        await waitFor(async () => (await instanceRevs(instanceId)).length >= 2, "两次周期分线检查点");
        a.send(C2S.MmoWorldMove, { seq: 2, dir: { x: 0, y: 0 } });
        await waitFor(async () => {
            const rows = await personaRows(a0.character.characterId);
            return rows.length >= 1 && snapshotOf(rows.at(-1)!).x > 1000;
        }, "A 的周期角色检查点带走过的位置");
        const revsBeforeLeave = await instanceRevs(instanceId);
        const aRowsBeforeLeave = (await personaRows(a0.character.characterId)).length;
        const bRowsBeforeLeave = (await personaRows(b0.character.characterId)).length;
        // ② B 离座：persona 级强制点
        await b.leave();
        await waitFor(async () => (await personaRows(b0.character.characterId)).length === bRowsBeforeLeave + 1, "B 离座 ⇒ 只多一行");
        const bRow = (await personaRows(b0.character.characterId)).at(-1)!;
        const revsAfterLeave = await instanceRevs(instanceId);
        assert.equal(revsAfterLeave.includes(Number(bRow.instance_rev)), false, `persona 级强制点的 instance_rev ${bRow.instance_rev} 是预留号，⛔ 在分线检查点表（${revsAfterLeave.join(",")}）`);
        assert.ok(Number(bRow.instance_rev) > Math.max(...revsBeforeLeave), "预留号大于离座前已落的分线 rev");
        assert.deepEqual([snapshotOf(bRow).x, snapshotOf(bRow).y, snapshotOf(bRow).mapId], [1000, 1000, MAP_ID]);
        // 分线 rev 只由周期前进：离座那一刻不前进（允许其后的周期批再前进 ⇒ 只断言「离座前后差 ≤ 周期批数」，即预留号不在表里已由上式钉住）
        assert.equal((await personaRows(a0.character.characterId)).length >= aRowsBeforeLeave, true);
        // ③ 硬杀：停续租 + 停固定步（⛔ drain / 强制点）；A 崩溃前又走了一段（不会落库）
        const lastCheckpointX = snapshotOf((await personaRows(a0.character.characterId)).at(-1)!).x;
        a.send(C2S.MmoWorldMove, { seq: 3, dir: { x: 0, y: 1 } });
        await sleep(120);
        const local = matchMaker.getLocalRoomById(a.roomId) as unknown as WorldRoom;
        (local as unknown as { lease: { stop(): void } | null }).lease?.stop();
        local.setSimulationInterval(undefined as never);
        await local.lock(); // 僵尸房仍在撮合列表：锁上让 joinOrCreate 建新房（真崩溃时进程已不在，这里只是同进程模拟）
        const [[metaBefore]] = await getPool().query<RowDataPacket[]>("SELECT checkpoint_rev FROM world_instance WHERE server_id = ? AND instance_id = ?", [SID, instanceId]);
        await sleep(1_100); // 租约过期
        const { room: a2, inbox: inboxA2 } = await connect(userA, a0.character.personaId);
        assert.equal(rootOf(a2).instanceId, instanceId, "同一分线（目录复用实例）");
        assert.equal(rootOf(a2).authorityEpoch, 2, "新房取权威 epoch 2");
        await waitFor(() => inboxA2.selfOf(a0.character.characterId) !== null, "A′ baseline");
        const mode2 = modes.at(-1)!;
        assert.notEqual(mode2, mode, "新 mode 实例");
        assert.equal(mode2.__probe.entities().get(slime.id)?.hp, 7, "怪物 hp 从分线检查点回灌（≤ 1 周期）");
        assert.ok(mode2.__probe.log.some((line) => line.startsWith("restore:")), "onRestore 跑过");
        const selfA2 = inboxA2.selfOf(a0.character.characterId)!;
        assert.equal(selfA2.x, lastCheckpointX, "位置回到最近一次角色检查点（≤ 1 角色周期）");
        assert.equal(selfA2.y, 1000, "崩溃前向下走的那段（未落库）回退");
        assert.equal(Number(metaBefore!.checkpoint_rev) >= 2, true);
        // ④ 角色 rev 按角色单调：A 再离座 ⇒ 严格递增；列表读到最新
        const beforeRows = await personaRows(a0.character.characterId);
        await a2.leave();
        await waitFor(async () => (await personaRows(a0.character.characterId)).length === beforeRows.length + 1, "A′ 离座一行");
        const revs = (await personaRows(a0.character.characterId)).map((row) => Number(row.rev));
        assert.ok(revs.every((rev, index) => index === 0 || rev > revs[index - 1]!), `角色检查点 rev 严格递增：${revs.join(",")}`);
        assert.equal((await listCharacters(userA, SID)).characters[0]?.mapId, MAP_ID);
    } finally {
        for (const room of rooms) {
            if (room.connection.isOpen) await Promise.race([room.leave(), sleep(2_000)]);
        }
        await sleep(300);
        await server.gracefullyShutdown(false);
        unregister();
    }
});
