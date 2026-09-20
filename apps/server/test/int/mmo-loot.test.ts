/**
 * mmo kit MK2-B3 掉落真栈（真 MySQL / Redis + 真 Server + @colyseus/sdk；docs/MMO.md §7.3 事件批原子规则 + §8.2 lootClaimed）：
 *  ① A 进 greybox；探针打死一只 slime ⇒ 按 lootTable 掷骰的掉落作为 kind loot 实体 enter（带 count）；
 *  ② A 点地走到掉落旁 ⇒ pickup ⇒ opResult ok + 掉落 leave；再拾同一件 ⇒ rejected（不存在）；
 *  ③ lootClaimed 事件**随周期分线检查点**（checkpointMs 300）同事务落进 k_mmo_world_event（status 0、checkpoint_rev ≤ world_instance.checkpoint_rev ⇒ 门内）；
 *  ④ 真租约 + withKitWorkerTx 跑 worker 一轮 ⇒ k_mmo_item_instance 多一行（模板 / 数量 = 掉落、bag 槽 0）+ k_mmo_receipt op_id = event_id；
 *  ⑤ 再跑一轮 ⇒ more:false、物品行数不变（至少一次 + 回执去重 ⇒ 0 重复）；
 *  ⑥（MK3-B1）拾取后世界房按节拍轮询背包 ⇒ 私有流带上新 bag（含刚落库的凝胶）。
 * 前置：本地栈已启动且 db:bootstrap 到 MK1-B4。⚠ int 文件只能单文件串行跑。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    C2S, GAMEPLAY_CATALOG, RoomName, S2C, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase,
    type IMmoEntityWire, type IMmoWorldBaselineBegin, type IMmoWorldBaselineChunk, type IMmoWorldEnter, type IMmoWorldLeave, type IMmoWorldOpResult, type IMmoWorldPos, type IMmoWorldPrivate,
    type IWorldRoomJoinOptions,
} from "@game/shared";
import { GREYBOX_MAP_ID } from "@game/shared/kits/mmo/content/greybox";
import { MMO_EVENT_LOOT_CLAIMED, type IMmoBagWire } from "@game/shared/kits/mmo/api/inventory/index";
import { withKitWorkerTx } from "../../src/core/infra/kitApi";
import { kWorldFence, kWorldLease } from "../../src/core/infra/keys";
import { tryAcquireLease } from "../../src/core/infra/lease";
import { closeMysql, getPool, type RowDataPacket } from "../../src/core/infra/mysql";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { handleWorldEnter } from "../../src/core/world/enterRpc";
import { createCharacter } from "../../src/kits/mmo/api/characters/index";
import { contentIndex } from "../../src/kits/mmo/api/content/index";
import { mmoOpId } from "../../src/kits/mmo/host";
import worker, { MMO_WORLD_EVENT_TABLE } from "../../src/kits/mmo/workers/worldEvents";
import { WorldLease, defaultWorldLeaseDeps } from "../../src/rooms/core/WorldLease";
import { worldDirectory } from "../../src/rooms/core/WorldDirectory";
import { worldModeRegistry } from "../../src/rooms/WorldMode";
import { WorldRoom } from "../../src/rooms/WorldRoom";
import { MMO_WORLD_MODE_ID, createMmoWorldMode, type MmoWorldMode } from "../../src/rooms/modes/mmoWorld/index";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const SID = 0;
const MAP_ID = GREYBOX_MAP_ID;
const LEASE_HOLDER = `int-loot-${process.pid}`;
const uids: string[] = [];
const uid = (name: string): string => { const value = testUid(name).slice(0, 32); uids.push(value); return value; };

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
            await pool.execute("DELETE FROM k_mmo_item_instance WHERE server_id = ? AND owner_character_id = ?", [SID, String(row.character_id)]);
            await pool.execute("DELETE FROM world_transfer WHERE server_id = ? AND persona_id = ?", [SID, String(row.persona_id)]);
        }
        await pool.execute("DELETE FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        await pool.execute("DELETE FROM persona WHERE user_id = ?", [value]);
    }
    const [instances] = await pool.query<RowDataPacket[]>("SELECT instance_id FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
    for (const row of instances) {
        await coordClient().unlink(kWorldLease(SID, String(row.instance_id)), kWorldFence(SID, String(row.instance_id)));
        worldDirectory.forget(SID, String(row.instance_id));
        await pool.execute(`DELETE FROM ${MMO_WORLD_EVENT_TABLE} WHERE server_id = ? AND instance_id = ?`, [SID, String(row.instance_id)]);
        await pool.execute("DELETE FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ?", [SID, String(row.instance_id)]);
        await pool.execute("DELETE FROM k_mmo_instance WHERE server_id = ? AND instance_id = ?", [SID, String(row.instance_id)]);
    }
    await pool.execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
    // 归还 worker 租约（⛔ 删行：租约行由 kit 安装 / db:bootstrap 预铺，tryAcquireLease 只 UPDATE 过期行）
    await pool.execute("UPDATE singleton_lease SET expires_at = NOW(3) - INTERVAL 1 SECOND WHERE lease_name = ? AND holder = ?", ["kit:mmo:worldEvents", LEASE_HOLDER]);
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
type RootView = { readonly phase: string; readonly instanceId: string };
const rootOf = (room: SDKRoom): RootView => room.state as unknown as RootView;

function collect(room: SDKRoom) {
    const begins: IMmoWorldBaselineBegin[] = [];
    const chunks: IMmoWorldBaselineChunk[] = [];
    const enters: IMmoEntityWire[] = [];
    const leaves: string[] = [];
    const positions: IMmoWorldPos[] = [];
    const results: IMmoWorldOpResult[] = [];
    const bags: IMmoBagWire[] = [];
    room.onMessage(S2C.MmoWorldBaselineBegin, (payload: IMmoWorldBaselineBegin) => { begins.push(payload); });
    room.onMessage(S2C.MmoWorldBaselineChunk, (payload: IMmoWorldBaselineChunk) => { chunks.push(payload); });
    room.onMessage(S2C.MmoWorldEnter, (payload: IMmoWorldEnter) => { enters.push(payload.entity); });
    room.onMessage(S2C.MmoWorldLeave, (payload: IMmoWorldLeave) => { leaves.push(payload.id); });
    room.onMessage(S2C.MmoWorldPos, (payload: IMmoWorldPos) => { positions.push(payload); });
    room.onMessage(S2C.MmoWorldOpResult, (payload: IMmoWorldOpResult) => { results.push(payload); });
    room.onMessage(S2C.MmoWorldPrivate, (payload: IMmoWorldPrivate) => { if (payload.bag) bags.push(payload.bag); });
    for (const type of [S2C.MmoWorldBaselineEnd, S2C.MmoWorldUpdate, S2C.Welcome, S2C.Error]) room.onMessage(type, () => undefined);
    const itemsOf = (begin: IMmoWorldBaselineBegin): IMmoEntityWire[] => chunks.filter((chunk) => chunk.baselineId === begin.baselineId).sort((a, b) => a.index - b.index).flatMap((chunk) => chunk.items);
    const selfOf = (characterId: string): IMmoEntityWire | null => (begins.length > 0 ? itemsOf(begins[0]!).find((item) => item.id === `char:${characterId}`) ?? null : null);
    return { begins, enters, leaves, positions, results, bags, itemsOf, selfOf };
}

interface EventRow extends RowDataPacket { event_id: string; kind: string; payload: unknown; status: number; checkpoint_rev: number | string }
const eventRows = async (instanceId: string): Promise<EventRow[]> => {
    const [rows] = await getPool().query<EventRow[]>(`SELECT event_id, kind, payload, status, checkpoint_rev FROM ${MMO_WORLD_EVENT_TABLE} WHERE server_id = ? AND instance_id = ? ORDER BY seq ASC`, [SID, instanceId]);
    return rows;
};
const itemRows = async (characterId: string): Promise<RowDataPacket[]> => {
    const [rows] = await getPool().query<RowDataPacket[]>("SELECT item_id, template_id, location, slot, count FROM k_mmo_item_instance WHERE server_id = ? AND owner_character_id = ? ORDER BY slot ASC", [SID, characterId]);
    return rows;
};

test("MK2-B3：打死 slime ⇒ 掉落 enter → 走过去拾取 ⇒ ok + leave（再拾拒）→ lootClaimed 随周期分线检查点落 k_mmo_world_event → worker 一轮发物品 + 回执 → 再跑一轮零重复", { timeout: 60_000 }, async () => {
    await assertRedisUp();
    const userA = uid("lootA");
    const a0 = await createCharacter(userA, SID, { slot: 0, name: `La${userA.slice(-8)}`, classId: "fighter", factionId: "dawn" }, mmoOpId(userA, SID, "createCharacter", "c1"));
    const characterId = a0.character.characterId;
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
        const granted = await handleWorldEnter(userA, SID, { personaId: a0.character.personaId, mapId: MAP_ID });
        const { token } = await issueSession(userA, null, "", SID);
        const sdk = new SDKClient(endpoint);
        sdk.auth.token = token;
        const options: IWorldRoomJoinOptions = {
            v: WORLD_ROOM_PROTOCOL_VERSION, sId: SID, mode: "mmoWorld", modeVersion: GAMEPLAY_CATALOG.mmoWorld.modeVersion, profile: "world", mapId: MAP_ID, personaId: a0.character.personaId, ticket: granted.ticket,
        };
        const a = await sdk.joinOrCreate(RoomName.World, options);
        rooms.push(a);
        const inbox = collect(a);
        await waitFor(() => rootOf(a).phase === WorldPhase.Active && rootOf(a).instanceId.length > 0, "Active");
        const instanceId = rootOf(a).instanceId;
        await waitFor(() => inbox.selfOf(characterId) !== null, "A baseline");
        // ① 探针打死一只 slime ⇒ 掉落 enter
        const mode = modes.at(-1)!;
        const slime = [...mode.__probe.entities().values()].find((entity) => entity.kind === "creature" && entity.templateId === "slime")!;
        mode.__probe.damage(slime.id, 30);
        await waitFor(() => inbox.enters.some((entity) => entity.kind === "loot"), "掉落 enter");
        const drop = inbox.enters.find((entity) => entity.kind === "loot")!;
        const dropEntity = mode.__probe.loot().get(drop.id)!;
        assert.deepEqual([drop.templateId, drop.count, drop.x, drop.y], [dropEntity.itemId, dropEntity.count, slime.x, slime.y], "掉落投影 = 权威掉落（落在尸体位置）");
        assert.ok(inbox.leaves.includes(slime.id), "怪离开视野");
        // ② 走过去拾取
        a.send(C2S.MmoWorldMove, { seq: 1, target: { x: drop.x, y: drop.y } });
        await waitFor(() => { const last = inbox.positions.at(-1); return !!last && Math.hypot(last.x - drop.x, last.y - drop.y) <= 1; }, "走到掉落旁");
        a.send(C2S.MmoWorldPickup, { lootId: drop.id, clientReqId: "p1" });
        await waitFor(() => inbox.results.some((result) => result.clientReqId === "p1"), "拾取回执");
        assert.deepEqual(inbox.results.find((result) => result.clientReqId === "p1"), { clientReqId: "p1", result: "ok" });
        await waitFor(() => inbox.leaves.includes(drop.id), "掉落 leave");
        a.send(C2S.MmoWorldPickup, { lootId: drop.id, clientReqId: "p2" });
        await waitFor(() => inbox.results.some((result) => result.clientReqId === "p2"), "再拾回执");
        assert.deepEqual(inbox.results.find((result) => result.clientReqId === "p2")?.result, "rejected");
        // ③ 事件随周期分线检查点落库（门内）
        await waitFor(async () => (await eventRows(instanceId)).some((row) => row.kind === MMO_EVENT_LOOT_CLAIMED), "lootClaimed 落 k_mmo_world_event（随周期检查点）");
        const [event] = (await eventRows(instanceId)).filter((row) => row.kind === MMO_EVENT_LOOT_CLAIMED);
        const payload = (typeof event!.payload === "string" ? JSON.parse(event!.payload) : event!.payload) as Record<string, unknown>;
        assert.deepEqual([event!.status, payload.actorCharacterId, payload.lootId, payload.itemTemplateId, payload.count], [0, characterId, drop.id, drop.templateId, drop.count]);
        const [[meta]] = await getPool().query<RowDataPacket[]>("SELECT checkpoint_rev FROM world_instance WHERE server_id = ? AND instance_id = ?", [SID, instanceId]);
        assert.ok(Number(event!.checkpoint_rev) <= Number(meta!.checkpoint_rev), `门内：事件 checkpoint_rev ${event!.checkpoint_rev} ≤ 已落库 ${meta!.checkpoint_rev}`);
        // ④ worker 一轮（真租约 + 租约守卫事务）⇒ 物品 + 回执
        const lease = await tryAcquireLease("kit:mmo:worldEvents", LEASE_HOLDER, 15);
        assert.ok(lease, "取到 worker 租约");
        const passOnce = () => withKitWorkerTx("mmo", "worldEvents", SID, lease!, (tx) => worker.pass(tx, { kitId: "mmo", workerId: "worldEvents", sId: SID, now: Date.now(), signal: new AbortController().signal }));
        assert.deepEqual(await passOnce(), { more: true });
        const items = await itemRows(characterId);
        assert.deepEqual(items.map((row) => [String(row.template_id), String(row.location), Number(row.slot), Number(row.count)]), [[drop.templateId, "bag", 0, drop.count!]], "物品进 bag 槽 0");
        const [receipts] = await getPool().query<RowDataPacket[]>("SELECT op_id, kind FROM k_mmo_receipt WHERE server_id = ? AND character_id = ? AND kind = ?", [SID, characterId, MMO_EVENT_LOOT_CLAIMED]);
        assert.deepEqual(receipts.map((row) => [String(row.op_id), String(row.kind)]), [[String(event!.event_id), MMO_EVENT_LOOT_CLAIMED]], "回执 op_id = event_id");
        assert.equal((await eventRows(instanceId)).find((row) => row.event_id === event!.event_id)?.status, 1, "事件 done");
        // ⑤ 再跑一轮：无可认领 ⇒ more:false；物品行不变
        assert.deepEqual(await passOnce(), { more: false });
        assert.equal((await itemRows(characterId)).length, 1, "0 重复");
        // ⑥ 世界房轮询到落库的背包 ⇒ 私有流带 bag（进图那份是空背包）
        assert.deepEqual(inbox.bags[0]?.items, [], "进图私有流带预热的空背包");
        await waitFor(() => inbox.bags.some((bag) => bag.items.some((item) => item.itemId === drop.templateId && item.count === drop.count)), "拾取后私有流带上落库的物品", 20_000);
    } finally {
        for (const room of rooms) {
            if (room.connection.isOpen) await Promise.race([room.leave(), sleep(2_000)]);
        }
        await sleep(300);
        await server.gracefullyShutdown(false);
        unregister();
    }
});
