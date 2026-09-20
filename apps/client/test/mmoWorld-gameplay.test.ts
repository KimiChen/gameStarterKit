/**
 * mmoWorld 客户端玩法插件 + transport 适配（MK0-B4，无头）：
 *  - MmoWorldGameplay：观察者回调 → 视图模型（本人 / 实体 / hp・mp / synced / notice）；输入 → 房间意图（move 规范化到单位圆、stop、leave ⇒ requestExit）；
 *    本人位置取本地预测（职业模板速度 + 灰盒碰撞网格），`pos` 回执按 seq 和解（MK1-B1）；
 *    掉线 / 重同步 / 回执写提示；被服务端踢 ⇒ settled 退出；presentation 无效即抛；
 *  - createMmoWorldRoom：句柄 → 端口（seq 递增的 move / stop / target、观察者流经 reconciler 拼 baseline 后发实体表、私有流推进 cursor、回执 / 掉线回调）；
 *  - createMmoWorldRoomJoiner：world.enter → transport.join（mode / strategy / persona / 凭据）→ MmoWorldRoom；取消 ⇒ 离开。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameplayContext } from "../src/logic/gameplay/index";
import { MmoWorldGameplay, type MmoWorldRoom, type MmoWorldRoomObserver, type MmoWorldPresentation, type MmoWorldViewModel } from "../src/logic/rooms/mmoWorld/MmoWorldGameplay";
import { createMmoWorldRoom, createMmoWorldRoomJoiner } from "../src/net/rooms/MmoWorldRoom";
import type { WorldRoomHandle, WorldRoomTransport } from "../src/net/rooms/WorldRoomTransport";
import { S2C, wireChecksum, type IMmoEntityWire } from "../src/shared/index";

const slime = (id: string, x: number): IMmoEntityWire => ({ id, kind: "creature", templateId: "slime", name: "史莱姆", x, y: 1000, rev: 0, hp: 30, hpMax: 30, level: 1 });
const self: IMmoEntityWire = { id: "char:c1", kind: "character", templateId: "fighter", name: "Rook", x: 1000, y: 1000, rev: 0, hp: 100, hpMax: 100, level: 1 };

function fakeRoom() {
    const calls: unknown[][] = [];
    let observer: MmoWorldRoomObserver | null = null;
    const room: MmoWorldRoom = {
        roomId: "r1", sessionId: "s1", mapId: "greybox", current: true, dropping: false,
        move: (dir) => { calls.push(["move", dir]); return calls.length; },
        moveTo: (target) => { calls.push(["moveTo", target]); return calls.length; },
        stop: () => { calls.push(["stop"]); return calls.length; },
        requestBaseline: (afterSeq) => { calls.push(["baseline", afterSeq]); return true; },
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
    observer().privateState({ hp: 80, hpMax: 100, mp: 50, mpMax: 50 });
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
    let leaveListener: ((kind: string, code: number | undefined) => void) | null = null;
    const handle = {
        kind: "world-room", mode: "mmoWorld", mapId: "greybox", line: 0, roomId: "r1", sessionId: "s1", transferId: null, current: true, dropping: false, left: false,
        onMessage: (type: string, callback: (payload: unknown) => unknown) => { listeners.set(type, callback); return () => { listeners.delete(type); }; },
        onDrop: () => () => undefined,
        onReconnect: () => () => undefined,
        onLeave: (callback: (kind: string, code: number | undefined) => void) => { leaveListener = callback; return () => { leaveListener = null; }; },
        send: (type: string, payload: unknown) => { sent.push([type, payload]); return true; },
        bindObserverStream: (types: Record<string, string>, sink: Record<string, (payload: unknown) => unknown>) => {
            for (const [key, type] of Object.entries(types)) listeners.set(type, sink[key]!);
            return () => { for (const type of Object.values(types)) listeners.delete(type); };
        },
        leave: async () => { sent.push(["leave"]); },
    } as unknown as WorldRoomHandle;
    const emit = (type: string, payload: unknown): void => { listeners.get(type)?.(payload); };
    return { handle, sent, emit, kick: (kind: string) => leaveListener?.(kind, undefined) };
}

test("createMmoWorldRoom：意图返回递增 seq；baseline 三件 → 实体表（synced）；update 合并；私有流推进 cursor；pos 直发回执 → observer.pos；seq 断裂 ⇒ 重同步请求", () => {
    const { handle, sent, emit, kick } = fakeHandle();
    const room = createMmoWorldRoom(handle);
    const snapshots: [number, boolean][] = [];
    const privates: number[] = [];
    const resyncs: (string | null)[] = [];
    const lefts: string[] = [];
    const positions: [number, number][] = [];
    room.observe({
        entities: (snapshot, synced) => { snapshots.push([snapshot.size, synced]); },
        privateState: (state) => { privates.push(state.hp); },
        pos: (payload) => { positions.push([payload.seq, payload.x]); },
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
    emit(S2C.MmoWorldLeave, { seq: 4, tick: 12, id: "slime-camp:0" });
    assert.deepEqual(snapshots.at(-1), [1, true]);
    emit(S2C.MmoWorldUpdate, { seq: 9, tick: 13, id: "char:c1", x: 1012, y: 1000, rev: 2, hp: 100 });
    assert.deepEqual(resyncs, ["seq-gap"], "seq 断裂 ⇒ 标记重同步");
    assert.deepEqual(sent.at(-1), ["c2s.mmoWorld.baselineRequest", { authorityEpoch: 1, afterSeq: 4 }]);
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
