/**
 * mmoWorld 客户端玩法插件 + transport 适配（MK0-B4，无头）：
 *  - MmoWorldGameplay：观察者回调 → 视图模型（本人 / 实体 / hp・mp / synced / notice）；输入 → 房间意图（move 规范化到单位圆、stop、leave ⇒ requestExit）；
 *    本人位置取本地预测（职业模板速度 + 灰盒碰撞网格），`pos` 回执按 seq 和解（MK1-B1）；
 *    掉线 / 重同步 / 回执写提示；被服务端踢 ⇒ settled 退出；presentation 无效即抛；
 *  - createMmoWorldRoom：句柄 → 端口（seq 递增的 move / stop / target、观察者流经 reconciler 拼 baseline 后发实体表、私有流推进 cursor、回执 / 掉线回调）；
 *  - createMmoWorldRoomJoiner：world.enter → transport.join（mode / strategy / persona / 凭据）→ MmoWorldRoom；取消 ⇒ 离开；
 *  - MK1-B3 两图交接：传送输入只在传送门半径内发；transferReady ⇒ 提示 + 请求退出，stop 时把凭据交给 onTransfer；端口 transfer 发 clientReqId；
 *    joiner 有交接凭据 ⇒ 跳过 enter、transfer strategy；enter 解析出在途交接（transferId 非 null）⇒ 同样 transfer strategy；launch.transfer 校验。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GameplayRegistry, RoomController, registerGameplayModule, type GameplayContext } from "../src/logic/gameplay/index";
import { MmoWorldGameplay, type MmoWorldInput, type MmoWorldRoom, type MmoWorldRoomObserver, type MmoWorldPresentation, type MmoWorldViewModel } from "../src/logic/rooms/mmoWorld/MmoWorldGameplay";
import { createGameplayModule, validateMmoWorldLaunch } from "../src/gameplay/modes/mmoWorld/index";
import { createMmoWorldRoom, createMmoWorldRoomJoiner } from "../src/net/rooms/MmoWorldRoom";
import { WorldRoomTransport, type WorldRoomHandle } from "../src/net/rooms/WorldRoomTransport";
import { S2C, wireChecksum, type IMmoEntityWire } from "../src/shared/index";
import { createGameplayServices } from "../src/gameplay/services";
import { setMmoRuntime, type MmoRuntime } from "../src/kits/mmo/logic/mmoRuntime";
import { createMmoWorldReconciler } from "../src/kits/mmo/api/world/index";
import { contentPacks, presentationOf } from "../src/kits/mmo/api/content/index";

const slime = (id: string, x: number): IMmoEntityWire => ({ id, kind: "creature", templateId: "slime", name: "史莱姆", x, y: 1000, rev: 0, hp: 30, hpMax: 30, level: 1 });
const self: IMmoEntityWire = { id: "char:c1", kind: "character", templateId: "fighter", name: "Rook", x: 1000, y: 1000, rev: 0, hp: 100, hpMax: 100, level: 1, factionId: "dawn" };

function fakeRoom() {
    const calls: unknown[][] = [];
    let observer: MmoWorldRoomObserver | null = null;
    const room: MmoWorldRoom = {
        roomId: "r1", sessionId: "s1", mapId: "greybox", current: true, dropping: false,
        move: (dir) => { calls.push(["move", dir]); return calls.length; },
        moveTo: (target) => { calls.push(["moveTo", target]); return calls.length; },
        stop: () => { calls.push(["stop"]); return calls.length; },
        transfer: (portalId) => { calls.push(["transfer", portalId]); return `t${calls.length}`; },
        say: (text) => { calls.push(["say", text]); return true; },
        target: (entityId) => { calls.push(["target", entityId]); return true; },
        cast: (spellId, targetId) => { calls.push(["cast", spellId, targetId]); return calls.length; },
        pickup: (lootId) => { calls.push(["pickup", lootId]); return `p${calls.length}`; },
        requestBaseline: (afterSeq) => { calls.push(["baseline", afterSeq]); return true; },
        subscribeScriptState: () => () => undefined,
        observe: (next) => { observer = next; return () => { observer = null; }; },
        leave: async () => { calls.push(["leave"]); },
    };
    return { room, calls, observer: () => observer! };
}

function fakePresentation() {
    const renders: MmoWorldViewModel[] = [];
    const presentation: MmoWorldPresentation = { mount: () => { renders.push({ mapId: "mount" } as MmoWorldViewModel); }, render: (model) => { renders.push(model); }, unmount: () => { renders.push({ mapId: "unmount" } as MmoWorldViewModel); } };
    return { presentation, renders };
}

const contextOf = (room: MmoWorldRoom): GameplayContext<MmoWorldRoom> => ({ room, signal: new AbortController().signal, generation: 1, isActive: () => true });

test("MmoWorldGameplay：实体表 → 模型（本人 / 视野 / hp）；输入 → 意图；leave ⇒ requestExit(user-exit)；踢出 ⇒ settled", async () => {
    const { room, calls, observer } = fakeRoom();
    const { presentation, renders } = fakePresentation();
    const exits: string[] = [];
    const host = { generation: 1, isActive: () => true, dispatchInput: async () => true, requestExit: async (reason: string) => { exits.push(reason); } };
    const gameplay = new MmoWorldGameplay({ host, presentation, selfCharacterId: "c1" });
    const context = contextOf(room);
    await gameplay.start(context);
    assert.equal(renders[0]?.mapId, "mount");
    observer().entities(new Map([[self.id, self], ["slime-camp:0", slime("slime-camp:0", 1200)]]), true);
    observer().privateState({ hp: 80, hpMax: 100, mp: 50, mpMax: 50, cooldowns: {}, casting: null, bag: null });
    gameplay.tick(0.016, context);
    const model = renders.at(-1)!;
    assert.deepEqual([model.mapId, model.mapSize, model.self?.id, model.self?.isSelf, model.entities.length, model.hp, model.mp, model.synced], ["greybox", { w: 2000, h: 2000 }, "char:c1", true, 2, 80, 50, true]);
    assert.equal(model.entities.find((entity) => entity.id === "slime-camp:0")?.presentation.label, "史莱姆");
    gameplay.handleInput({ type: "move", dir: { x: 3, y: -0.5 } }, context);
    gameplay.handleInput({ type: "moveTo", x: -5, y: 40 }, context);
    gameplay.handleInput({ type: "stop" }, context);
    const moveDir = calls[0]![1] as { x: number; y: number };
    assert.deepEqual([calls[0]![0], Math.round(moveDir.x * 1000) / 1000, Math.round(moveDir.y * 1000) / 1000], ["move", 0.894, -0.447], "dir 先钳 (1, -0.5) 再归一到单位圆");
    assert.deepEqual(calls.slice(1), [["moveTo", { x: 0, y: 40 }], ["stop"]]);
    observer().opResult({ clientReqId: "c1", result: "rejected", detail: "portal MK1" });
    gameplay.tick(0.016, context);
    assert.equal(renders.at(-1)!.notice, "rejected：portal MK1");
    observer().notice?.({ text: "据点归属改变", level: "info" });
    gameplay.tick(0.016, context);
    assert.equal(renders.at(-1)!.notice, "据点归属改变", "编排公告进入默认与自定义HUD共享模型");
    observer().dropped();
    gameplay.tick(0.016, context);
    assert.equal(renders.at(-1)!.notice, "连接中断，重连中…");
    observer().left("replaced");
    assert.deepEqual(exits, ["settled"]);
    gameplay.handleInput({ type: "leave" }, context);
    assert.deepEqual(exits, ["settled"], "退出只请求一次");
    gameplay.stop({ kind: "manual" });
    assert.equal(renders.at(-1)?.mapId, "unmount");
    const bad = new MmoWorldGameplay({ presentation: {} as MmoWorldPresentation });
    await assert.rejects(bad.start(contextOf(fakeRoom().room)), /presentation/u);
});

test("MmoWorldGameplay：本人位置取本地预测（fighter 120 / 步 6）；pos 回执按 seq 和解后继续预测；视野流位置只给他人", async () => {
    const { room, observer } = fakeRoom();
    const { presentation, renders } = fakePresentation();
    const host = { generation: 1, isActive: () => true, dispatchInput: async () => true, requestExit: async () => undefined };
    const gameplay = new MmoWorldGameplay({ host, presentation, selfCharacterId: "c1" });
    const context = contextOf(room);
    await gameplay.start(context);
    observer().entities(new Map([[self.id, self], ["slime-camp:0", slime("slime-camp:0", 1200)]]), true);
    gameplay.handleInput({ type: "move", dir: { x: 1, y: 0 } }, context);
    gameplay.tick(0.1, context);
    const predicted = renders.at(-1)!;
    assert.deepEqual([predicted.self?.x, predicted.self?.y, predicted.entities.find((entity) => entity.id === "slime-camp:0")?.x], [1012, 1000, 1200], "两步 × 6：视野流仍在 1000，本人显示预测位置；他人取视野流");
    assert.deepEqual([predicted.self?.factionId, predicted.entities.find((entity) => entity.id === "slime-camp:0")?.factionId], ["dawn", null], "名片阵营；无阵营实体 null");
    observer().pos({ seq: 1, tick: 5, x: 1006, y: 1000 });
    gameplay.tick(0.01, context);
    assert.equal(renders.at(-1)!.self?.x, 1006, "回执为准");
    gameplay.tick(0.05, context);
    assert.equal(renders.at(-1)!.self?.x, 1012, "回执后沿方向继续预测");
    gameplay.handleInput({ type: "stop" }, context);
    gameplay.tick(0.2, context);
    assert.equal(renders.at(-1)!.self?.x, 1012, "停下不再预测前进");
    gameplay.stop({ kind: "manual" });
});

function fakeHandle() {
    const sent: unknown[][] = [];
    const listeners = new Map<string, (payload: unknown) => unknown>();
    const leaveListeners = new Set<(kind: string, code: number | undefined) => void>();
    const dropListeners = new Set<() => void>();
    const reconnectListeners = new Set<() => void>();
    const handle = {
        kind: "world-room", mode: "mmoWorld", mapId: "greybox", line: 0, roomId: "r1", sessionId: "s1", transferId: null, current: true, dropping: false, left: false,
        onMessage: (type: string, callback: (payload: unknown) => unknown) => { listeners.set(type, callback); return () => { listeners.delete(type); }; },
        onDrop: (callback: () => void) => { dropListeners.add(callback); return () => { dropListeners.delete(callback); }; },
        onReconnect: (callback: () => void) => { reconnectListeners.add(callback); return () => { reconnectListeners.delete(callback); }; },
        onLeave: (callback: (kind: string, code: number | undefined) => void) => { leaveListeners.add(callback); return () => { leaveListeners.delete(callback); }; },
        send: (type: string, payload: unknown) => { sent.push([type, payload]); return true; },
        bindObserverStream: (types: Record<string, string>, sink: Record<string, (payload: unknown) => unknown>) => {
            for (const [key, type] of Object.entries(types)) listeners.set(type, sink[key]!);
            return () => { for (const type of Object.values(types)) listeners.delete(type); };
        },
        leave: async () => { sent.push(["leave"]); },
    } as unknown as WorldRoomHandle;
    const emit = (type: string, payload: unknown): void => { listeners.get(type)?.(payload); };
    return {
        handle, sent, emit, kick: (kind: string) => { for (const callback of leaveListeners) callback(kind, undefined); },
        drop: () => { for (const callback of dropListeners) callback(); }, reconnect: () => { for (const callback of reconnectListeners) callback(); },
        listenerCount: () => listeners.size + leaveListeners.size + dropListeners.size + reconnectListeners.size,
    };
}

test("createMmoWorldRoom：意图返回递增 seq；baseline 三件 → 实体表（synced）；update 合并；私有流推进 cursor；pos 直发回执 → observer.pos；seq 断裂 ⇒ 重同步请求", () => {
    const { handle, sent, emit, kick } = fakeHandle();
    const room = createMmoWorldRoom(handle);
    const snapshots: [number, boolean][] = [];
    const privates: number[] = [];
    const bags: (number | null)[] = [];
    const resyncs: (string | null)[] = [];
    const lefts: string[] = [];
    const positions: [number, number][] = [];
    const readies: string[] = [];
    const chats: string[] = [];
    const notices: string[] = [];
    room.observe({
        entities: (snapshot, synced) => { snapshots.push([snapshot.size, synced]); },
        privateState: (state) => { privates.push(state.hp); bags.push(state.bag ? state.bag.items.length : null); },
        pos: (payload) => { positions.push([payload.seq, payload.x]); },
        transferReady: (payload) => { readies.push(payload.transferId); },
        chat: (payload) => { chats.push(payload.fromEntityId); },
        notice: (payload) => { notices.push(payload.text); },
        opResult: () => undefined, resync: (reason) => { resyncs.push(reason); }, dropped: () => undefined, reconnected: () => undefined, left: (kind) => { lefts.push(kind); },
    });
    assert.deepEqual([room.move({ x: 1, y: 0 }), room.stop(), room.moveTo({ x: 10, y: 20 })], [1, 2, 3], "意图返回自己的 seq");
    assert.deepEqual(sent, [[S2C.MmoWorldEnter.replace("s2c", "c2s").replace("enter", "move"), { seq: 1, dir: { x: 1, y: 0 } }], ["c2s.mmoWorld.move", { seq: 2, dir: { x: 0, y: 0 } }], ["c2s.mmoWorld.move", { seq: 3, target: { x: 10, y: 20 } }]]);
    const items = [self, slime("slime-camp:0", 1200)];
    emit(S2C.MmoWorldBaselineBegin, { baselineId: "b1", seq: 1, tick: 10, chunkCount: 1, itemCount: 2 });
    emit(S2C.MmoWorldBaselineChunk, { baselineId: "b1", seq: 1, index: 0, items });
    emit(S2C.MmoWorldBaselineEnd, { baselineId: "b1", seq: 1, checksum: wireChecksum(items) });
    assert.deepEqual(snapshots.at(-1), [2, true]);
    emit(S2C.MmoWorldUpdate, { seq: 2, tick: 11, id: "char:c1", x: 1006, y: 1000, rev: 1, hp: 100 });
    assert.deepEqual(snapshots.at(-1), [2, true]);
    emit(S2C.MmoWorldPrivate, { seq: 3, tick: 11, hp: 90, hpMax: 100, mp: 50, mpMax: 50 });
    assert.deepEqual(privates, [90]);
    emit(S2C.MmoWorldPos, { seq: 3, tick: 11, x: 1006, y: 1000 });
    assert.deepEqual(positions, [[3, 1006]], "pos 直发回执到 observer.pos");
    assert.equal(room.transfer("gate-east"), "t4", "transfer 返回 clientReqId");
    assert.deepEqual(sent.at(-1), ["c2s.mmoWorld.transfer", { portalId: "gate-east", clientReqId: "t4" }]);
    emit(S2C.MmoWorldTransferReady, { transferId: "wt_1", worldAddress: "s0/greybox-east/0", ticket: "x".repeat(24), expiresAt: 9 });
    assert.deepEqual(readies, ["wt_1"]);
    assert.equal(room.say("hi"), true);
    assert.deepEqual(sent.at(-1), ["c2s.world.chat", { text: "hi" }], "附近聊天走框架 core 世界 token");
    assert.equal(room.target("slime-camp:0"), true);
    assert.deepEqual(sent.at(-1), ["c2s.mmoWorld.target", { entityId: "slime-camp:0" }]);
    assert.equal(room.cast("strike", "slime-camp:0"), 5, "cast 返回 seq（与移动共用计数）");
    assert.deepEqual(sent.at(-1), ["c2s.mmoWorld.cast", { seq: 5, spellId: "strike", targetId: "slime-camp:0" }]);
    assert.equal(room.cast("guard"), 6);
    assert.deepEqual(sent.at(-1), ["c2s.mmoWorld.cast", { seq: 6, spellId: "guard" }], "无目标不带 targetId");
    assert.equal(room.pickup("loot:1"), "p7", "pickup 返回 clientReqId（与移动共用计数）");
    assert.deepEqual(sent.at(-1), ["c2s.mmoWorld.pickup", { lootId: "loot:1", clientReqId: "p7" }]);
    emit(S2C.MmoWorldPrivate, { seq: 4, tick: 12, hp: 90, hpMax: 100, mp: 40, mpMax: 50, cooldowns: { strike: 1500 }, casting: { spellId: "fireball", readyInMs: 800 }, bag: { rev: 1, items: [{ id: "i1", itemId: "slime-gel", count: 2, location: "bag", slot: 0, rev: 1 }] } });
    assert.deepEqual(privates.at(-1), 90);
    assert.deepEqual(bags, [null, 1], "背包随私有流到达");
    emit(S2C.MmoWorldPrivate, { seq: 5, tick: 12, hp: 80, hpMax: 100, mp: 40, mpMax: 50 });
    assert.deepEqual(bags.at(-1), 1, "没带 bag 的私有流沿用上次背包");
    emit(S2C.WorldChat, { fromEntityId: "char:c1", text: "hi", at: 5 });
    assert.deepEqual(chats, ["char:c1"]);
    emit(S2C.MmoWorldNotice, { text: "守卫已出现", level: "info" });
    assert.deepEqual(notices, ["守卫已出现"]);
    emit(S2C.MmoWorldLeave, { seq: 6, tick: 12, id: "slime-camp:0" });
    assert.deepEqual(snapshots.at(-1), [1, true]);
    emit(S2C.MmoWorldUpdate, { seq: 9, tick: 13, id: "char:c1", x: 1012, y: 1000, rev: 2, hp: 100 });
    assert.deepEqual(resyncs, ["seq-gap"], "seq 断裂 ⇒ 标记重同步");
    assert.deepEqual(sent.at(-1), ["c2s.mmoWorld.baselineRequest", { authorityEpoch: 1, afterSeq: 6 }]);
    kick("replaced");
    assert.deepEqual(lefts, ["replaced"]);
});

test("createMmoWorldRoomJoiner：world.enter → transport.join(mode / strategy / persona / 凭据) → MmoWorldRoom；取消 ⇒ 离开", async () => {
    const joins: unknown[] = [];
    const { handle, sent } = fakeHandle();
    const transport = { join: async (request: unknown) => { joins.push(request); return handle; } } as unknown as WorldRoomTransport;
    const joiner = createMmoWorldRoomJoiner({
        transport: () => transport,
        enter: async (personaId, mapId) => ({ worldAddress: `s0/${mapId}/0`, mapId, line: 0, endpoint: "", ticket: "t".repeat(24), expiresAt: 1, transferId: null, personaId } as never),
    });
    const capability = joiner.join(new AbortController().signal, { personaId: "p1", mapId: "greybox" });
    const room = await capability.ready;
    assert.equal(room.mapId, "greybox");
    assert.deepEqual(joins, [{ mode: "mmoWorld", strategy: { mapId: "greybox", line: 0 }, personaId: "p1", ticket: "t".repeat(24) }]);
    await capability.leave();
    assert.deepEqual(sent.at(-1), ["leave"]);
    assert.throws(() => joiner.join(new AbortController().signal, { mapId: "greybox" }), /缺 personaId/u);
});

test("两图交接（joiner）：交接凭据在手 ⇒ 跳过 world.enter、transfer strategy 直进目标分线；enter 解析出在途交接 ⇒ 同样 transfer strategy；launch.transfer 校验", async () => {
    const joins: { strategy: unknown; ticket: string }[] = [];
    let enters = 0;
    const { handle } = fakeHandle();
    const transport = { join: async (request: { strategy: unknown; ticket: string }) => { joins.push({ strategy: request.strategy, ticket: request.ticket }); return handle; } } as unknown as WorldRoomTransport;
    const joiner = createMmoWorldRoomJoiner({
        transport: () => transport,
        enter: async (personaId, mapId) => { enters += 1; return { worldAddress: `s0/${mapId}/2`, mapId, line: 2, endpoint: "", ticket: "e".repeat(24), expiresAt: 1, transferId: "wt_pending", personaId } as never; },
    });
    const credential = { transferId: "wt_1", worldAddress: "s0/greybox-east/0", ticket: "x".repeat(24), expiresAt: 5 };
    await joiner.joinFor("p1", "greybox-east", new AbortController().signal, credential).ready;
    assert.deepEqual([enters, joins[0]], [0, { strategy: { kind: "transfer", transferId: "wt_1", mapId: "greybox-east", line: 0 }, ticket: "x".repeat(24) }], "凭据在手 ⛔ enter");
    await joiner.join(new AbortController().signal, { characterId: "c1", personaId: "p1", mapId: "greybox" }).ready;
    assert.deepEqual([enters, joins[1]], [1, { strategy: { kind: "transfer", transferId: "wt_pending", mapId: "greybox", line: 2 }, ticket: "e".repeat(24) }], "enter 解析出在途交接 ⇒ transfer strategy");
    await assert.rejects(joiner.joinFor("p1", "greybox", new AbortController().signal, { ...credential, worldAddress: "bad" }).ready, /worldAddress/u);
    assert.deepEqual(validateMmoWorldLaunch({ characterId: "c1", mapId: "greybox-east", transfer: credential }), { characterId: "c1", mapId: "greybox-east", transfer: credential });
    assert.throws(() => validateMmoWorldLaunch({ characterId: "c1", mapId: "greybox", transfer: credential }), /与 mapId 不一致/u);
    assert.throws(() => validateMmoWorldLaunch({ characterId: "c1", mapId: "greybox-east", transfer: { ...credential, ticket: "" } }), /ticket/u);
    assert.throws(() => validateMmoWorldLaunch({ characterId: "c1", mapId: "greybox-east", transfer: { ...credential, extra: 1 } }), /未知字段/u);
});

test("两图交接（gameplay）：传送输入只在传送门半径内发（预测位置）；transferReady ⇒ 提示 + 请求退出，stop 时把凭据交给 onTransfer 恰一次", async () => {
    const { room, calls, observer } = fakeRoom();
    const { presentation, renders } = fakePresentation();
    const exits: string[] = [];
    const handed: string[] = [];
    const host = { generation: 1, isActive: () => true, dispatchInput: async () => true, requestExit: async (reason: string) => { exits.push(reason); } };
    const gameplay = new MmoWorldGameplay({ host, presentation, selfCharacterId: "c1", onTransfer: (ready) => { handed.push(ready.transferId); } });
    const context = contextOf(room);
    await gameplay.start(context);
    observer().entities(new Map([[self.id, self]]), true); // 本人 (1000, 1000)；gate-east 在 (1000, 700) 半径 60
    gameplay.handleInput({ type: "transfer" }, context);
    gameplay.tick(0.016, context);
    assert.deepEqual([calls.filter((call) => call[0] === "transfer").length, renders.at(-1)!.notice], [0, "不在传送门范围内"]);
    observer().pos({ seq: 0, tick: 1, x: 1000, y: 720 }); // 权威位置回执把预测拉到门内
    gameplay.handleInput({ type: "transfer" }, context);
    gameplay.tick(0.016, context);
    assert.deepEqual([calls.at(-1), renders.at(-1)!.notice], [["transfer", "gate-east"], "传送：gate-east"]);
    const ready = { transferId: "wt_1", worldAddress: "s0/greybox-east/0", ticket: "x".repeat(24), expiresAt: 9 };
    observer().transferReady(ready);
    gameplay.tick(0.016, context);
    assert.deepEqual([exits, renders.at(-1)!.notice, handed], [["settled"], "传送中…", []], "先退出本局，凭据 stop 时才交出");
    gameplay.stop({ kind: "manual" });
    gameplay.stop({ kind: "manual" });
    assert.deepEqual(handed, ["wt_1"], "凭据交出恰一次");
});

test("附近聊天（gameplay）：say 输入 ⇒ room.say（空白不发）；收到 chat 只映射 fromEntityId → 视野实体名（不在表 ⇒ ?），日志保留最新 50 行", async () => {
    const { room, calls, observer } = fakeRoom();
    const { presentation, renders } = fakePresentation();
    const host = { generation: 1, isActive: () => true, dispatchInput: async () => true, requestExit: async () => undefined };
    const gameplay = new MmoWorldGameplay({ host, presentation, selfCharacterId: "c1" });
    const context = contextOf(room);
    await gameplay.start(context);
    observer().entities(new Map([[self.id, self], ["slime-camp:0", slime("slime-camp:0", 1200)]]), true);
    gameplay.handleInput({ type: "say", text: "  hello  " }, context);
    gameplay.handleInput({ type: "say", text: "   " }, context);
    assert.deepEqual(calls.filter((call) => call[0] === "say"), [["say", "hello"]], "trim 后发；空白不发");
    observer().chat({ fromEntityId: "char:c1", text: "hello", at: 1 });
    observer().chat({ fromEntityId: "char:ghost", text: "boo", at: 2 });
    gameplay.tick(0.016, context);
    assert.deepEqual(renders.at(-1)!.chat.map((line) => [line.from, line.text]), [["Rook", "hello"], ["?", "boo"]]);
    for (let index = 0; index < 60; index += 1) observer().chat({ fromEntityId: "slime-camp:0", text: `s${index}`, at: 10 + index });
    gameplay.tick(0.016, context);
    assert.deepEqual([renders.at(-1)!.chat.length, renders.at(-1)!.chat.at(-1)!.text, renders.at(-1)!.chat[0]!.from], [50, "s59", "史莱姆"]);
    gameplay.stop({ kind: "manual" });
});

test("战斗（gameplay）：target 输入选目标；cast 无目标时自动选最近存活怪并同步目标；冷却来自 private 集合本地倒计时、冷却中不发；技能栏来自职业模板", async () => {
    const { room, calls, observer } = fakeRoom();
    const { presentation, renders } = fakePresentation();
    const host = { generation: 1, isActive: () => true, dispatchInput: async () => true, requestExit: async () => undefined };
    const gameplay = new MmoWorldGameplay({ host, presentation, selfCharacterId: "c1" });
    const context = contextOf(room);
    await gameplay.start(context);
    observer().entities(new Map([[self.id, self], ["slime-camp:0", slime("slime-camp:0", 1200)], ["slime-camp:1", slime("slime-camp:1", 1100)], ["dead", { ...slime("dead", 1010), hp: 0 }]]), true);
    gameplay.tick(0.016, context);
    assert.deepEqual(renders.at(-1)!.spells, ["strike", "guard"], "战士技能栏");
    gameplay.handleInput({ type: "cast", spellId: "strike" }, context);
    assert.deepEqual(calls.filter((call) => call[0] === "target" || call[0] === "cast"), [["target", "slime-camp:1"], ["cast", "strike", "slime-camp:1"]], "自动选最近存活怪（跳过 hp 0）并同步目标");
    gameplay.tick(0.016, context);
    assert.equal(renders.at(-1)!.targetId, "slime-camp:1");
    gameplay.handleInput({ type: "target", entityId: "slime-camp:0" }, context);
    gameplay.handleInput({ type: "cast", spellId: "strike" }, context);
    assert.deepEqual(calls.at(-1), ["cast", "strike", "slime-camp:0"], "已选目标优先");
    observer().privateState({ hp: 100, hpMax: 100, mp: 50, mpMax: 50, cooldowns: { strike: 1500 }, casting: null, bag: null });
    gameplay.tick(0.5, context);
    assert.equal(renders.at(-1)!.cooldowns.strike, 1000, "本地倒计时（1500 − 500）");
    const before = calls.length;
    gameplay.handleInput({ type: "cast", spellId: "strike" }, context);
    gameplay.tick(0.016, context);
    assert.deepEqual([calls.length, renders.at(-1)!.notice], [before, "冷却中"], "冷却中不发");
    gameplay.tick(1.2, context);
    assert.equal(renders.at(-1)!.cooldowns.strike, undefined, "倒计时到 0 后从集合消失");
    gameplay.handleInput({ type: "target", entityId: null }, context);
    gameplay.tick(0.016, context);
    assert.equal(renders.at(-1)!.targetId, null);
    gameplay.stop({ kind: "manual" });
});

test("掉落（gameplay，MK2-B3）：视野里的 loot 实体带 count 进模型；pickup 输入 ⇒ 拾取半径内最近的掉落（本人预测位置）⇒ room.pickup；没有 ⇒ 提示不发", async () => {
    const { room, calls, observer } = fakeRoom();
    const { presentation, renders } = fakePresentation();
    const host = { generation: 1, isActive: () => true, dispatchInput: async () => true, requestExit: async () => undefined };
    const gameplay = new MmoWorldGameplay({ host, presentation, selfCharacterId: "c1" });
    const context = contextOf(room);
    await gameplay.start(context);
    const loot = (id: string, x: number, count: number): IMmoEntityWire => ({ id, kind: "loot", templateId: "slime-gel", name: "史莱姆凝胶", x, y: 1000, rev: 0, hp: 1, hpMax: 1, level: 1, count });
    observer().entities(new Map([[self.id, self], ["loot:2", loot("loot:2", 1040, 2)], ["loot:1", loot("loot:1", 1030, 1)], ["loot:3", loot("loot:3", 1300, 5)], ["slime-camp:0", slime("slime-camp:0", 1010)]]), true);
    gameplay.tick(0.016, context);
    const model = renders.at(-1)!;
    assert.deepEqual(model.entities.filter((entity) => entity.kind === "loot").map((entity) => [entity.id, entity.count, entity.presentation.label]), [["loot:1", 1, "史莱姆凝胶"], ["loot:2", 2, "史莱姆凝胶"], ["loot:3", 5, "史莱姆凝胶"]]);
    assert.equal(model.entities.find((entity) => entity.isSelf)?.count, null, "非掉落 count null");
    gameplay.handleInput({ type: "pickup" }, context);
    gameplay.tick(0.016, context);
    assert.deepEqual([calls.filter((call) => call[0] === "pickup"), renders.at(-1)!.notice], [[["pickup", "loot:1"]], "拾取：史莱姆凝胶"], "半径 48 内最近的掉落（怪不算）");
    observer().entities(new Map([[self.id, self], ["loot:3", loot("loot:3", 1300, 5)]]), true);
    const before = calls.length;
    gameplay.handleInput({ type: "pickup" }, context);
    gameplay.tick(0.016, context);
    assert.deepEqual([calls.length, renders.at(-1)!.notice], [before, "附近没有掉落"], "半径外不发");
    gameplay.stop({ kind: "manual" });
});

test("背包（gameplay，MK3-B1）：private 流的 bag 进模型 + HUD 摘要（背包数 / 装备名 / 邮箱数）；未收到 ⇒ null / 空串", async () => {
    const { room, observer } = fakeRoom();
    const { presentation, renders } = fakePresentation();
    const host = { generation: 1, isActive: () => true, dispatchInput: async () => true, requestExit: async () => undefined };
    const gameplay = new MmoWorldGameplay({ host, presentation, selfCharacterId: "c1" });
    const context = contextOf(room);
    await gameplay.start(context);
    gameplay.tick(0.016, context);
    assert.deepEqual([renders.at(-1)!.bag, renders.at(-1)!.bagSummary], [null, ""]);
    const bag = { rev: 3, items: [
        { id: "i1", itemId: "slime-gel", count: 2, location: "bag" as const, slot: 0, rev: 1 },
        { id: "i2", itemId: "rusty-blade", count: 1, location: "equip" as const, slot: 0, rev: 3 },
        { id: "i3", itemId: "boar-hide", count: 4, location: "mail" as const, slot: 0, rev: 2 },
    ] };
    observer().privateState({ hp: 100, hpMax: 100, mp: 50, mpMax: 50, cooldowns: {}, casting: null, bag });
    gameplay.tick(0.016, context);
    assert.deepEqual([renders.at(-1)!.bag?.items.length, renders.at(-1)!.bagSummary], [3, "背包 1/24 · 装备 锈剑 · 邮箱 1"]);
    gameplay.stop({ kind: "manual" });
});

test("MMO 模块真实装配：首次进入与切换角色的身份按房间隔离，旧 lease 不会关闭新房", async (t) => {
    const controller = new RoomController<MmoWorldRoom, MmoWorldInput>();
    const registry = new GameplayRegistry<MmoWorldRoom, MmoWorldInput>();
    const bridge = { currentGeneration: () => controller.currentGeneration, dispatchInput: (input: unknown) => controller.input(input as MmoWorldInput), requestStop: (reason: Parameters<typeof controller.stop>[0]) => controller.stop(reason) };
    const handles: ReturnType<typeof fakeHandle>[] = [];
    t.mock.method(WorldRoomTransport, "forCurrentServer", () => ({ join: async () => { const next = fakeHandle(); handles.push(next); return next.handle; } }));
    const identities: (string | undefined)[] = [];
    t.mock.method(MmoWorldGameplay.prototype, "start", async (context: GameplayContext<MmoWorldRoom>) => { identities.push(context.room.selfCharacterId); });
    const characters = ["c1", "c2"].map((characterId, slot) => ({ characterId, personaId: `p${slot + 1}`, slot, name: `Rook${slot}`, classId: "fighter" as const, factionId: "dawn" as const, level: 1, exp: 0, mapId: "greybox", status: "active" as const }));
    const runtime: MmoRuntime = {
        selfUid: () => "u1", characters: async () => ({ characters, orphans: [], maxSlots: 4 }),
        createCharacter: async () => { throw new Error("unused"); }, bag: async () => ({ bag: { rev: 0, items: [] } }), moveItem: async () => ({ bag: { rev: 0, items: [] } }),
        enterWorld: async (_personaId, mapId) => ({ worldAddress: `s0/${mapId}/0`, mapId, line: 0, endpoint: "", ticket: "t".repeat(24), expiresAt: 1, transferId: null }),
        launchWorld: async () => undefined, close: () => undefined,
    };
    const release = setMmoRuntime(runtime);
    t.after(async () => { await controller.dispose(); release(); });
    const module = createGameplayModule(createGameplayServices({ controllerBridge: bridge }));
    registerGameplayModule(registry, module, bridge);
    for (const characterId of ["c1", "c2"]) {
        assert.equal((await controller.startRegistered(registry, "mmoWorld", undefined, { characterId, mapId: "greybox" })).status, "started");
        await controller.stop();
    }
    assert.deepEqual(identities, ["c1", "c2"]);
    const old = module.joiner.join({ characterId: "c1", mapId: "greybox" }, new AbortController().signal);
    await old.ready;
    await old.leave();
    const next = module.joiner.join({ characterId: "c2", mapId: "greybox" }, new AbortController().signal);
    await next.ready;
    await old.leave();
    assert.deepEqual(handles.at(-1)!.sent, [], "旧 lease 的重复清理不能触及后来进入的角色");
    await next.leave();
});

test("MMO 本人只匹配本次 room 身份，多个角色不会共享预测位置", async () => {
    const { room, observer } = fakeRoom();
    const gameplay = new MmoWorldGameplay({ presentation: fakePresentation().presentation });
    await gameplay.start(contextOf({ ...room, selfCharacterId: "c1" }));
    const other: IMmoEntityWire = { ...self, id: "char:a-other", x: 1200 };
    observer().entities(new Map([[other.id, other], [self.id, self]]), true);
    assert.equal(gameplay.model().self?.id, self.id);
    assert.deepEqual(gameplay.model().entities.map((entity) => [entity.id, entity.isSelf, entity.x]), [[other.id, false, 1200], [self.id, true, 1000]]);
    gameplay.stop({ kind: "manual" });
});

test("MMO 增量投影保留阵营和掉落数量", () => {
    const reconciler = createMmoWorldReconciler();
    const loot: IMmoEntityWire = { ...slime("loot:1", 1100), kind: "loot", templateId: "slime-gel", count: 7 };
    const items = [self, loot];
    reconciler.acceptBaselineBegin({ baselineId: "cards", seq: 1, chunkCount: 1, itemCount: 2 });
    reconciler.acceptBaselineChunk({ baselineId: "cards", seq: 1, index: 0, items });
    reconciler.acceptBaselineEnd({ baselineId: "cards", seq: 1, checksum: wireChecksum(items) });
    reconciler.acceptUpdate({ seq: 2, tick: 2, id: self.id, x: 1006, y: 1000, rev: 1, hp: 90 });
    reconciler.acceptUpdate({ seq: 3, tick: 2, id: loot.id, x: 1106, y: 1000, rev: 1, hp: 30 });
    assert.deepEqual(reconciler.snapshot().get(self.id), { ...self, x: 1006, rev: 1, hp: 90 });
    assert.deepEqual(reconciler.snapshot().get(loot.id), { ...loot, x: 1106, rev: 1 });
});

test("MMO 死亡清理旧预测意图，复活回执立即校正本人且不再漂移", async () => {
    const { room, observer, calls } = fakeRoom();
    const gameplay = new MmoWorldGameplay({ selfCharacterId: "c1", presentation: fakePresentation().presentation });
    const context = contextOf(room);
    await gameplay.start(context);
    observer().entities(new Map([[self.id, self]]), true);
    gameplay.handleInput({ type: "move", dir: { x: 1, y: 0 } }, context);
    gameplay.tick(0.1, context);
    assert.equal(gameplay.model().self?.x, 1012);
    const state = { hp: 0, hpMax: 100, mp: 0, mpMax: 50, cooldowns: {}, casting: null, bag: null };
    observer().privateState(state);
    gameplay.handleInput({ type: "moveTo", x: 1600, y: 1000 }, context);
    assert.equal(calls.length, 1, "死亡期间不发送新移动意图");
    observer().pos({ seq: 1, tick: 110, x: 800, y: 900 });
    // 多个固定步合并出站时，复活 pos 先于前一子步的死亡 private 到达。
    observer().privateState(state);
    observer().privateState({ ...state, hp: 100, mp: 50 });
    observer().entities(new Map([[self.id, { ...self, x: 800, y: 900, rev: 2 }]]), true);
    gameplay.tick(0.2, context);
    assert.deepEqual([gameplay.model().self?.x, gameplay.model().self?.y], [800, 900]);
    gameplay.handleInput({ type: "move", dir: { x: 1, y: 0 } }, context);
    gameplay.tick(0.05, context);
    assert.equal(gameplay.model().self?.x, 806);
    gameplay.stop({ kind: "manual" });
});

test("scriptState：早帧缓存 / late subscribe / pack隔离 / rev去重 / 重连新代际 / 离房释放", async () => {
    const { handle, sent, emit, drop, reconnect, listenerCount } = fakeHandle();
    const room = createMmoWorldRoom(handle);
    const frames: unknown[] = [];
    emit(S2C.MmoWorldScriptState, { packId: "pack-one", rev: 8, state: { score: 8 } });
    const off = room.subscribeScriptState("pack-one", (frame) => frames.push(frame));
    assert.deepEqual(frames, [{ packId: "pack-one", rev: 8, state: { score: 8 }, connected: true }]);
    assert.deepEqual(sent.at(-1), ["c2s.mmoWorld.baselineRequest", { authorityEpoch: 1, afterSeq: 0 }], "首次订阅主动补全量");
    emit(S2C.MmoWorldScriptState, { packId: "pack-two", rev: 9, state: { score: 99 } });
    emit(S2C.MmoWorldScriptState, { packId: "pack-one", rev: 7, state: { score: 7 } });
    emit(S2C.MmoWorldScriptState, { packId: "pack-one", rev: 8, state: { score: 80 } });
    assert.equal(frames.length, 1, "不同包与旧/重复rev不投递");
    emit(S2C.MmoWorldScriptState, { packId: "pack-one", rev: 10, state: { score: 10 } });
    assert.equal(frames.length, 2, "full snapshot允许rev跳跃");
    const latest = frames.at(-1) as { state: { score: number } };
    assert.ok(Object.isFrozen(latest.state), "消费者不能篡改共享缓存");
    drop();
    assert.deepEqual(frames.at(-1), { packId: "pack-one", rev: null, state: {}, connected: false });
    emit(S2C.MmoWorldScriptState, { packId: "pack-one", rev: 11, state: { score: 11 } });
    assert.equal(frames.length, 3, "掉线期迟到帧丢弃");
    reconnect();
    assert.deepEqual(frames.at(-1), { packId: "pack-one", rev: null, state: {}, connected: true });
    assert.equal(sent.filter(([type]) => type === "c2s.mmoWorld.baselineRequest").length, 2, "重连补全量");
    emit(S2C.MmoWorldScriptState, { packId: "pack-one", rev: 1, state: { score: 1 } });
    assert.deepEqual(frames.at(-1), { packId: "pack-one", rev: 1, state: { score: 1 }, connected: true }, "恢复后的低rev属于新代际");
    off(); off();
    const before = frames.length;
    emit(S2C.MmoWorldScriptState, { packId: "pack-one", rev: 2, state: { score: 2 } });
    assert.equal(frames.length, before);
    let late = -1;
    room.subscribeScriptState("pack-one", (frame) => { late = frame.rev ?? -1; });
    assert.equal(late, 2, "无订阅者期间也继续维护缓存");
    await room.leave();
    assert.equal(late, -1, "离房时使现有快照失效");
    assert.equal(listenerCount(), 0, "离房释放message与连接监听");
    room.subscribeScriptState("pack-one", () => { throw new Error("已关闭房间不允许新订阅"); });
    assert.equal(listenerCount(), 0);
});

test("MmoWorldGameplay：异步 HUD 加载期间取消，迟到 adapter 只释放、不挂载", async () => {
    const { room } = fakeRoom();
    const { presentation, renders } = fakePresentation();
    let resolve!: (value: MmoWorldPresentation) => void;
    const pending = new Promise<MmoWorldPresentation>((done) => { resolve = done; });
    let selected: MmoWorldRoom | null = null;
    const gameplay = new MmoWorldGameplay({ presentationFactory: (inputRoom) => { selected = inputRoom; return pending; } });
    const controller = new AbortController();
    const started = gameplay.start({ ...contextOf(room), signal: controller.signal });
    assert.equal(selected, room, "factory绑定本次房间");
    controller.abort();
    gameplay.dispose();
    resolve(presentation);
    await started;
    assert.deepEqual(renders.map((model) => model.mapId), ["unmount"]);
});

test("实体表现：当前内容包的模板presentationId生效，共享职业id不串包", async () => {
    for (const pack of contentPacks()) {
        const map = pack.pack.maps[0]!;
        const { room, observer } = fakeRoom();
        const gameplay = new MmoWorldGameplay({ presentation: fakePresentation().presentation });
        await gameplay.start(contextOf({ ...room, mapId: map.mapId }));
        const templates = [
            ...pack.pack.classes.map((value) => ({ kind: "character" as const, id: value.classId, presentationId: value.presentationId })),
            ...pack.pack.creatures.map((value) => ({ kind: "creature" as const, id: value.templateId, presentationId: value.presentationId })),
            ...pack.pack.items.map((value) => ({ kind: "loot" as const, id: value.itemId, presentationId: value.presentationId })),
            ...pack.pack.npcs.filter((value) => value.mapId === map.mapId).map((value) => ({ kind: "npc" as const, id: value.npcId, presentationId: value.presentationId })),
        ];
        const entities = templates.map((template, index): IMmoEntityWire => ({ ...self, id: `entity:${index}`, kind: template.kind, templateId: template.id }));
        observer().entities(new Map(entities.map((entity) => [entity.id, entity])), true);
        const views = gameplay.model().entities;
        for (let i = 0; i < templates.length; i++) {
            assert.deepEqual(views.find((view) => view.id === `entity:${i}`)!.presentation, presentationOf(templates[i]!.presentationId), `${pack.pack.packId}/${templates[i]!.kind}/${templates[i]!.id}`);
        }
        gameplay.stop({ kind: "manual" });
    }
});
