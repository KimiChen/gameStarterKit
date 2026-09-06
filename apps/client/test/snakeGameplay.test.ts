/** Snake Endless V2 客户端：流、HUD、控制、本地偏好与 gameplay 输入生命周期。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SnakeDeathCause,
    SnakeDelta,
    SnakeRunEndReason,
    SnakeRunState,
    snakeWireChecksum,
    type ISnakeBaselineBegin,
    type ISnakeBaselineChunk,
    type ISnakeBaselineEnd,
    type ISnakeEndlessRoomMeta,
    type ISnakePlayerState,
    type ISnakeReliveDecisionResult,
    type ISnakeReliveOffered,
    type ISnakeReliveResolved,
    type ISnakeRoomState,
    type ISnakeRunFinalizing,
    type ISnakeRunResultV2,
    type ISnakeRunDelta,
    type ISnakeSnapshotSnake,
    type ISnakeWorldDelta,
    type ISnakeWorldSnapshot,
} from "../src/shared/index";
import { SNAKE_ENDLESS_CONFIG, SNAKE_RULESET } from "../src/shared/gameplays/snake/ruleset";
import {
    SnakeSnapshotBuffer,
    type SnakeSnapshotLike,
} from "../src/logic/rooms/snake/SnakeSnapshotBuffer";
import { deriveSnakeHud, deriveSnakeRelive } from "../src/logic/rooms/snake/SnakeHud";
import {
    SNAKE_HANDEDNESS_STORAGE_KEY,
    SnakeHandednessPreference,
    SnakePointerRouter,
    snakeControlLayout,
    snakeControlShiftY,
    type HandednessPreferencePort,
} from "../src/logic/rooms/snake/SnakeControls";
import {
    createSnakeGameplay,
    type SnakePresentation,
    type SnakeRoomLike,
} from "../src/logic/rooms/snake/SnakeGameplay";
import { createSnakeRoomAdapter, type SnakeTypedRoom } from "../src/net/rooms/SnakeRoom";

const EPOCH = "epoch-v2";

function snake(points: readonly { x: number; y: number }[], overrides: Partial<ISnakeSnapshotSnake> = {}): ISnakeSnapshotSnake {
    return {
        id: "self",
        name: "我",
        skinId: 1,
        ai: false,
        aiLevel: null,
        alive: true,
        score: 10,
        length: 80,
        boost: false,
        bodyScale: 1.001,
        magnetUntilTick: null,
        protectUntilTick: null,
        points,
        ...overrides,
    };
}

function run(overrides: Partial<ISnakeRunDelta> = {}): ISnakeRunDelta {
    return {
        id: "self",
        runId: `${EPOCH}:run:1`,
        state: SnakeRunState.Active,
        stateVersion: 2,
        deathSeq: 0,
        deathCause: SnakeDeathCause.None,
        magnetCollected: 0,
        starCollected: 0,
        magnetUntilTick: null,
        ...overrides,
    };
}

function snapshotOf(seq: number, tick: number, points = [{ x: tick, y: 0 }, { x: tick - 2, y: 0 }]): SnakeSnapshotLike {
    return {
        roomEpochId: EPOCH,
        matchId: EPOCH,
        tick,
        envelopeTick: tick,
        seq,
        snakes: [snake(points)],
        foods: [{ id: 1, kind: 0, variant: 1, x: 10, y: 20 }],
        wrecks: [],
        tools: [],
        runs: [run()],
        displayRank: [{ rank: 1, id: "self", name: "我", score: 10, length: 80, ai: false, self: true }],
    };
}

function meta(): ISnakeEndlessRoomMeta {
    return {
        roomEpochId: EPOCH,
        playingStartedTick: 0,
        battlefieldConfigId: SNAKE_ENDLESS_CONFIG.battlefieldConfigId,
        lifecycleConfigId: SNAKE_ENDLESS_CONFIG.lifecycleConfigId,
        reliveFlowConfigId: SNAKE_ENDLESS_CONFIG.reliveFlowConfigId,
        relivePolicyId: SNAKE_ENDLESS_CONFIG.relivePolicyId,
        onlineAdaptationId: SNAKE_ENDLESS_CONFIG.onlineAdaptationId,
        layerVersions: SNAKE_ENDLESS_CONFIG.layerVersions,
        layerHashes: SNAKE_ENDLESS_CONFIG.layerHashes,
        configHash: SNAKE_ENDLESS_CONFIG.configHash,
        totalTime: 0,
        matchDurationTicks: 0,
        hasDeadline: false,
        endTick: null,
    };
}

function baselinePackets(snapshot: ISnakeWorldSnapshot): {
    begin: ISnakeBaselineBegin;
    chunks: ISnakeBaselineChunk[];
    end: ISnakeBaselineEnd;
} {
    const groups: Array<readonly [ISnakeBaselineChunk["kind"], readonly unknown[]]> = [
        ["snakes", snapshot.snakes], ["foods", snapshot.foods], ["wrecks", snapshot.wrecks],
        ["tools", snapshot.tools], ["runs", snapshot.runs],
        ["displayRank", snapshot.displayRank],
    ];
    const chunks = groups.map(([kind, items], index): ISnakeBaselineChunk => ({
        baselineId: `base-${snapshot.seq}`,
        roomEpochId: EPOCH,
        envelopeTick: snapshot.envelopeTick,
        seq: snapshot.seq,
        index,
        kind,
        items,
    }));
    return {
        begin: {
            baselineId: `base-${snapshot.seq}`,
            roomEpochId: EPOCH,
            envelopeTick: snapshot.envelopeTick,
            seq: snapshot.seq,
            chunkCount: chunks.length,
            snakeCount: snapshot.snakes.length,
            foodCount: snapshot.foods.length,
            wreckCount: 0,
            toolCount: 0,
            runCount: snapshot.runs.length,
            pointCount: snapshot.snakes.reduce((sum, entry) => sum + entry.points.length, 0),
            meta: meta(),
        },
        chunks,
        end: {
            baselineId: `base-${snapshot.seq}`,
            roomEpochId: EPOCH,
            envelopeTick: snapshot.envelopeTick,
            seq: snapshot.seq,
            checksum: snakeWireChecksum(snapshot),
        },
    };
}

function pathDelta(previous: ISnakeWorldSnapshot, next: ISnakeWorldSnapshot): ISnakeWorldDelta {
    return {
        roomEpochId: EPOCH,
        tick: next.tick,
        envelopeTick: next.envelopeTick,
        seq: next.seq,
        baseSeq: previous.seq,
        snakeUpserts: [],
        snakePathDeltas: [{ id: "self", append: [next.snakes[0].points[0]], trimTail: 1 }],
        snakeRemovals: [],
        foodUpserts: [],
        foodRemovals: [],
        wreckUpserts: [],
        wreckRemovals: [],
        toolUpserts: [],
        toolRemovals: [],
        runRemovals: [],
        runUpdates: [],
        displayRank: next.displayRank,
        checksum: snakeWireChecksum(next),
    };
}

test("分块 baseline 只有完整、有序且 checksum 正确时原子提交", () => {
    const snapshot = snapshotOf(1, 10);
    const packets = baselinePackets(snapshot);
    const buffer = new SnakeSnapshotBuffer();
    buffer.attach(EPOCH);
    assert.equal(buffer.acceptBaselineBegin(packets.begin), true);
    assert.equal(buffer.acceptBaselineChunk(packets.chunks[1]), false, "乱序块必须拒绝");
    assert.equal(buffer.ready, false);
    assert.equal(buffer.takeResyncRequest()?.reason, "baseline-chunk-order");
    assert.equal(buffer.takeResyncRequest(), null, "同一故障只发一次重取");
    assert.equal(buffer.ready, false, "请求发出后仍等待新 baseline");

    const retry = baselinePackets(snapshotOf(2, 12));
    assert.equal(buffer.acceptBaselineBegin(retry.begin), true);
    for (const chunk of retry.chunks) assert.equal(buffer.acceptBaselineChunk(chunk), true);
    assert.equal(buffer.acceptBaselineEnd(retry.end), true);
    assert.equal(buffer.ready, true);
    assert.equal(buffer.latestSnapshot?.seq, 2);
});

test("有序 path append/trim delta 可插值；丢序/checksum 错转入 resync", () => {
    const first = snapshotOf(1, 10, [{ x: 10, y: 0 }, { x: 8, y: 0 }]);
    const second = snapshotOf(2, 12, [{ x: 12, y: 0 }, { x: 10, y: 0 }]);
    const buffer = new SnakeSnapshotBuffer();
    buffer.attach(EPOCH);
    assert.equal(buffer.offer(first), true);
    assert.equal(buffer.acceptDelta(pathDelta(first, second)), true);
    assert.equal(buffer.latestSnapshot?.snakes[0].points[0].x, 12);
    assert.equal(buffer.sample(11)?.snakes[0].points[0].x, 11);
    const third = snapshotOf(4, 14, [{ x: 14, y: 0 }, { x: 12, y: 0 }]);
    assert.equal(buffer.acceptDelta({ ...pathDelta(second, third), baseSeq: 2 }), false);
    assert.equal(buffer.takeResyncRequest()?.reason, "delta-seq");
    assert.equal(buffer.ready, false);
});

test("tool ID 在 epoch 内移除后复用被拒，tool/buff 只按 envelopeTick 校验", () => {
    const withTool: ISnakeWorldSnapshot = {
        ...snapshotOf(1, 100),
        tools: [{ id: 7, toolId: 10001, x: 0, y: 0, expireTick: 500 }],
    };
    const removed: ISnakeWorldSnapshot = { ...snapshotOf(2, 102), tools: [] };
    const buffer = new SnakeSnapshotBuffer();
    buffer.attach(EPOCH);
    buffer.offer(withTool);
    const removal: ISnakeWorldDelta = {
        ...pathDelta(withTool, removed),
        toolRemovals: [7],
        checksum: snakeWireChecksum(removed),
    };
    assert.equal(buffer.acceptDelta(removal), true);
    const reused = snapshotOf(3, 104);
    assert.equal(buffer.acceptDelta({
        ...pathDelta(removed, reused),
        toolUpserts: [{ id: 7, toolId: 10001, x: 0, y: 0, expireTick: 504 }],
    }), false);
    assert.equal(buffer.takeResyncRequest()?.reason, "tool-id-reuse");

    const retry = baselinePackets({
        ...snapshotOf(3, 104),
        tools: [{ id: 7, toolId: 10001, x: 0, y: 0, expireTick: 504 }],
    });
    assert.equal(buffer.acceptBaselineBegin(retry.begin), true);
    for (const chunk of retry.chunks) assert.equal(buffer.acceptBaselineChunk(chunk), true);
    assert.equal(buffer.acceptBaselineEnd(retry.end), false, "resync baseline 也不得复用 epoch 内已退场 tool ID");
    assert.equal(buffer.takeResyncRequest(), null, "同一 resync 故障仍只派发一次请求");

    const legal = { ...pathDelta(snapshotOf(1, 100), snapshotOf(2, 102)),
        toolUpserts: [{ id: 1, toolId: 10001 as const, x: 0, y: 0, expireTick: 502 }] };
    assert.doesNotThrow(() => SnakeDelta.validate(legal));
    assert.throws(() => SnakeDelta.validate({ ...legal,
        toolUpserts: [{ id: 1, toolId: 10001, x: 0, y: 0, expireTick: 503 }] }), /MESSAGE_FIELD_RANGE/u);
    assert.throws(() => SnakeDelta.validate({ ...legal,
        toolUpserts: [{ id: 1, toolId: 9, x: 0, y: 0, expireTick: 502 }] }), /MESSAGE_FIELD_RANGE/u);
});

test("delta 显式删除已离场 run，不靠 checksum 失败反复重取 baseline", () => {
    const first = { ...snapshotOf(1, 10), runs: [run(), run({ id: "left", runId: `${EPOCH}:run:2` })] };
    const second = snapshotOf(2, 12);
    const buffer = new SnakeSnapshotBuffer();
    buffer.attach(EPOCH);
    assert.equal(buffer.offer(first), true);
    assert.equal(buffer.acceptDelta({ ...pathDelta(first, second), runRemovals: ["left"] }), true);
    assert.deepEqual(buffer.latestSnapshot?.runs.map((entry) => entry.id), ["self"]);
    assert.equal(buffer.takeResyncRequest(), null);
    assert.throws(() => SnakeDelta.validate({
        ...pathDelta(first, second),
        runRemovals: ["self"],
        runUpdates: [run()],
    }), /MESSAGE_FIELD_RANGE/u, "同一 run 不得在一个 delta 同时删除和更新");
});

test("HUD 无房级时长；磁铁/保护和复活窗只读权威绝对 tick", () => {
    const frame = {
        ...snapshotOf(1, 200),
        snakes: [snake([{ x: 0, y: 0 }], { magnetUntilTick: 220, protectUntilTick: 210 })],
    };
    const player = {
        id: "self", runId: `${EPOCH}:run:1`, runState: SnakeRunState.Active,
        deathSeq: 0, stateVersion: 1,
    } as ISnakePlayerState;
    const state = { countdownEndTick: 0, players: new Map([["self", player]]) } as ISnakeRoomState;
    const hud = deriveSnakeHud(frame, state, "self");
    assert.equal(hud.hasRoomDeadline, false);
    assert.equal(hud.countdownSeconds, 0);
    assert.equal(hud.magnetRemainingTicks, 20);
    assert.equal(hud.protectionRemainingTicks, 10);

    Object.assign(player, {
        runState: SnakeRunState.PendingRelive,
        deathSeq: 1,
        deathCause: SnakeDeathCause.Collision,
        stateVersion: 4,
        coinCost: 100,
        coinBalance: 900,
        reliveIndex: 1,
        decisionDeadlineTick: 300,
        score: 123,
        length: 456,
    });
    const relive = deriveSnakeRelive(state, "self", 201);
    assert.equal(relive?.deathCause, "collision");
    assert.equal(relive?.decisionSeconds, 5);
    assert.equal(relive?.coinBalance, 900);
});

test("750×1624 中央控制区、Safe Area 与左右手功能镜像精确", () => {
    assert.equal(snakeControlShiftY(0), 0);
    assert.equal(snakeControlShiftY(100), 41);
    const right = snakeControlLayout("right", 0);
    assert.deepEqual(right.map(({ id, x, y, visibleDiameter, hitRadius }) =>
        [id, x, y, visibleDiameter, hitRadius]), [
        ["s1", 130, 410, 88, 56], ["s2", 295, 490, 104, 64],
        ["s3", 455, 490, 104, 64], ["s4", 620, 410, 144, 88],
        ["joystick", 375, 220, 220, 155],
    ]);
    assert.deepEqual(right.filter((entry) => entry.visible).map((entry) => [entry.id, entry.action]),
        [["s4", "boost"], ["joystick", "steer"]]);
    const left = snakeControlLayout("left", 100);
    assert.deepEqual(left.filter((entry) => entry.visible).map((entry) => [entry.id, entry.action]),
        [["s1", "boost"], ["joystick", "steer"]]);
    assert.ok(left.every((entry) => entry.y === right.find((candidate) => candidate.id === entry.id)!.y + 41));
});

test("设备偏好先写后用；非法/读异常/写失败均稳定回退 right", () => {
    let stored: string | null = null;
    const port: HandednessPreferencePort = {
        read: (key) => { assert.equal(key, SNAKE_HANDEDNESS_STORAGE_KEY); return stored; },
        write: (key, value) => { assert.equal(key, SNAKE_HANDEDNESS_STORAGE_KEY); stored = value; },
    };
    const preference = new SnakeHandednessPreference(port);
    assert.equal(preference.load(), "right");
    assert.equal(preference.set("left"), true);
    assert.equal(stored, "left");
    assert.equal(preference.current, "left");
    stored = "invalid";
    assert.equal(preference.load(), "right");
    const broken = new SnakeHandednessPreference({
        read: () => { throw new Error("read"); },
        write: () => { throw new Error("write"); },
    });
    assert.equal(broken.load(), "right");
    assert.equal(broken.set("left"), false);
    assert.equal(broken.current, "right");
});

test("pointer owner：按钮优先、摇杆拖出继续、双指 boost、cancel-all 无残留", () => {
    const events: string[] = [];
    const router = new SnakePointerRouter("right", 0, {
        steer: (x, y) => events.push(`steer:${x.toFixed(2)},${y.toFixed(2)}`),
        centerJoystick: () => events.push("center"),
        setBoost: (active) => events.push(`boost:${active}`),
        activate: (action) => events.push(`activate:${action}`),
    });
    assert.equal(router.start(1, 375, 300), "joystick");
    assert.equal(router.start(2, 620, 410), "s4");
    assert.equal(router.start(3, 620, 410), null, "同控件已有 owner 时第三指不能抢占");
    router.move(1, 900, 900);
    assert.equal(router.ownerCount, 2);
    router.cancelAll();
    assert.equal(router.ownerCount, 0);
    assert.ok(events.includes("boost:true"));
    assert.ok(events.includes("boost:false"));
    assert.equal(events.at(-1), "center");
    assert.equal(router.start(4, 130, 410), null, "隐藏 S1 不渲染也不命中");
});

interface FakePresentation extends SnakePresentation {
    renders: number;
    cancelled: number;
    confirmations: boolean[];
    handedness: string[];
    reconnecting: boolean[];
    notices: unknown[];
    finalizing: unknown[];
    results: unknown[];
}

function fakePresentation(): FakePresentation {
    const port: HandednessPreferencePort = { read: () => null, write: () => {} };
    return {
        handednessPreference: port,
        renders: 0,
        cancelled: 0,
        confirmations: [],
        handedness: [],
        reconnecting: [],
        notices: [],
        finalizing: [],
        results: [],
        mount: () => {},
        render() { this.renders += 1; },
        showReliveNotice(message) { this.notices.push(message); },
        showRunFinalizing(message) { this.finalizing.push(message); },
        showRunResult(message) { this.results.push(message); },
        showEndRunConfirmation(visible) { this.confirmations.push(visible); },
        setHandedness(value) { this.handedness.push(value); },
        cancelInput() { this.cancelled += 1; },
        setReconnecting(value) { this.reconnecting.push(value); },
        unmount: () => {},
    };
}

interface FakeRoom extends SnakeRoomLike {
    stateValue: ISnakeRoomState;
    sentInputs: Array<{ dirX: number; dirY: number; boost: boolean }>;
    relives: unknown[];
    endRuns: unknown[];
    baselineRequests: unknown[];
    callbacks: {
        begin: Array<(value: ISnakeBaselineBegin) => void>;
        chunk: Array<(value: ISnakeBaselineChunk) => void>;
        end: Array<(value: ISnakeBaselineEnd) => void>;
        delta: Array<(value: ISnakeWorldDelta) => void>;
        state: Array<(value: ISnakeRoomState) => void>;
        offered: Array<(value: ISnakeReliveOffered) => void>;
        decision: Array<(value: ISnakeReliveDecisionResult) => void>;
        resolved: Array<(value: ISnakeReliveResolved) => void>;
        finalizing: Array<(value: ISnakeRunFinalizing) => void>;
        result: Array<(value: ISnakeRunResultV2) => void>;
    };
}

function fakePlayer(): ISnakePlayerState {
    return {
        id: "self", name: "我", joinOrdinal: 1, connected: true, alive: true, score: 0, length: 80,
        deathCount: 0, killCount: 0, headX: 0, headY: 0, direction: 0, boost: false, ackSeq: 0,
        skinId: 1, magnetUntilTick: 0, protectUntilTick: 0, runId: `${EPOCH}:run:1`,
        runState: SnakeRunState.Active, stateVersion: 2, runStartedTick: 61, activeTicks: 1,
        deathSeq: 0, deathCause: SnakeDeathCause.None, relivesUsed: 0, magnetCollected: 0, starCollected: 0,
        relivePolicyVersion: 1, terminalIntent: "", resolveAtTick: 0, reliveIndex: 0, coinCost: 0,
        coinBalance: 10_000,
        offeredTick: 0, decisionDeadlineTick: 0, decisionClientReqId: "", receiptId: "", reliveReceiptState: "none",
    };
}

function fakeState(player = fakePlayer()): ISnakeRoomState {
    return {
        tick: 100, phase: "playing", matchId: EPOCH, roomEpochId: EPOCH, playingStartedTick: 0,
        countdownEndTick: 60, totalTime: 0, matchDurationTicks: 0, hasDeadline: false, endTick: 0,
        battlefieldConfigId: SNAKE_ENDLESS_CONFIG.battlefieldConfigId,
        lifecycleConfigId: SNAKE_ENDLESS_CONFIG.lifecycleConfigId,
        reliveFlowConfigId: SNAKE_ENDLESS_CONFIG.reliveFlowConfigId,
        relivePolicyId: SNAKE_ENDLESS_CONFIG.relivePolicyId,
        onlineAdaptationId: SNAKE_ENDLESS_CONFIG.onlineAdaptationId,
        battlefieldLayerVersion: 1, lifecycleLayerVersion: 1, reliveFlowLayerVersion: 1,
        relivePolicyLayerVersion: 1, onlineAdaptationLayerVersion: 2,
        battlefieldLayerHash: SNAKE_ENDLESS_CONFIG.layerHashes.battlefield,
        lifecycleLayerHash: SNAKE_ENDLESS_CONFIG.layerHashes.lifecycle,
        reliveFlowLayerHash: SNAKE_ENDLESS_CONFIG.layerHashes.reliveFlow,
        relivePolicyLayerHash: SNAKE_ENDLESS_CONFIG.layerHashes.relivePolicy,
        onlineAdaptationLayerHash: SNAKE_ENDLESS_CONFIG.layerHashes.onlineAdaptation,
        configHash: SNAKE_ENDLESS_CONFIG.configHash, snapshotSeq: 0, baselineSeq: 0,
        draining: false, onlineCoinReliveEnabled: false, players: new Map([[player.id, player]]),
    };
}

function fakeRoom(): FakeRoom {
    const callbacks = {
        begin: [], chunk: [], end: [], delta: [], state: [], offered: [], decision: [], resolved: [],
        finalizing: [], result: [],
    } as FakeRoom["callbacks"];
    const room: FakeRoom = {
        roomId: "room", sessionId: "self", dropping: false, stateValue: fakeState(),
        sentInputs: [], relives: [], endRuns: [], baselineRequests: [], callbacks,
        state() { return this.stateValue; },
        onWelcome: () => () => {}, onError: () => () => {},
        onBaselineBegin(callback) { callbacks.begin.push(callback); return () => {}; },
        onBaselineChunk(callback) { callbacks.chunk.push(callback); return () => {}; },
        onBaselineEnd(callback) { callbacks.end.push(callback); return () => {}; },
        onDelta(callback) { callbacks.delta.push(callback); return () => {}; },
        onReliveOffered(callback) { callbacks.offered.push(callback); return () => {}; },
        onReliveDecisionResult(callback) { callbacks.decision.push(callback); return () => {}; },
        onReliveResolved(callback) { callbacks.resolved.push(callback); return () => {}; },
        onRunFinalizing(callback) { callbacks.finalizing.push(callback); return () => {}; },
        onRunResult(callback) { callbacks.result.push(callback); return () => {}; },
        onStateChange(callback) { callbacks.state.push(callback); return () => {}; },
        sendInput(dirX, dirY, boost) { this.sentInputs.push({ dirX, dirY, boost }); return this.sentInputs.length; },
        sendReliveDecision(payload) { this.relives.push(payload); return true; },
        sendEndRun(runId, clientReqId) { this.endRuns.push({ runId, clientReqId }); return true; },
        requestBaseline(roomEpochId, afterSeq) { this.baselineRequests.push({ roomEpochId, afterSeq }); return true; },
        clearBoost: () => {}, ping: () => {},
    };
    return room;
}

function context(room: SnakeRoomLike) {
    return { room, signal: new AbortController().signal, generation: 1, isActive: () => true };
}

test("Gameplay：完整 baseline 后渲染；结束本次需二次确认；断线 cancel 并重取", async () => {
    const presentation = fakePresentation();
    const room = fakeRoom();
    const gameplay = createSnakeGameplay({ presentationFactory: () => presentation });
    const ctx = context(room);
    await gameplay.start(ctx);
    const packets = baselinePackets(snapshotOf(1, 100));
    room.callbacks.begin[0](packets.begin);
    for (const chunk of packets.chunks) room.callbacks.chunk[0](chunk);
    room.callbacks.end[0](packets.end);
    gameplay.tick(0.05, ctx);
    assert.equal(presentation.renders, 1);
    gameplay.handleInput({ type: "steer", dirX: 1, dirY: 0, boost: true }, ctx);
    assert.equal(room.sentInputs.length, 1);
    gameplay.handleInput({ type: "request-end-run" }, ctx);
    assert.deepEqual(presentation.confirmations, [true]);
    assert.equal(room.endRuns.length, 0);
    gameplay.handleInput({ type: "cancel-end-run" }, ctx);
    gameplay.handleInput({ type: "request-end-run" }, ctx);
    gameplay.handleInput({ type: "confirm-end-run" }, ctx);
    assert.equal(room.endRuns.length, 1);

    (room as { dropping: boolean }).dropping = true;
    gameplay.tick(0.05, ctx);
    (room as { dropping: boolean }).dropping = false;
    gameplay.tick(0.05, ctx);
    assert.deepEqual(presentation.reconnecting, [true, false]);
    assert.equal(room.baselineRequests.length, 1);
    assert.ok(presentation.cancelled >= 3);
    gameplay.dispose();
});

test("Gameplay：复活/终局 push 按 run、deathSeq、stateVersion 单调收敛且去重", async () => {
    const presentation = fakePresentation();
    const room = fakeRoom();
    const gameplay = createSnakeGameplay({ presentationFactory: () => presentation });
    const ctx = context(room);
    await gameplay.start(ctx);
    const runId = room.stateValue.players.get("self")!.runId;
    const offered: ISnakeReliveOffered = {
        runId,
        deathSeq: 1,
        offeredTick: 110,
        decisionDeadlineTick: 210,
        reliveIndex: 1,
        relivesRemaining: 5,
        coinCost: 100,
        relivePolicyVersion: 1,
    };
    room.callbacks.offered[0](offered);
    room.callbacks.offered[0](offered);
    assert.equal(presentation.notices.length, 1, "重复 offer 不得重复表现");
    const resolved: ISnakeReliveResolved = {
        runId,
        deathSeq: 1,
        clientReqId: "accept-1",
        result: "revived",
        resolvedTick: 112,
        protectUntilTick: 172,
        receiptId: "test-receipt",
    };
    room.callbacks.resolved[0](resolved);
    room.callbacks.offered[0]({ ...offered, offeredTick: 111, decisionDeadlineTick: 211 });
    assert.equal(presentation.notices.length, 2, "resolved 后的同 deathSeq 旧 offer 不得倒退 UI");

    const player = room.stateValue.players.get("self")!;
    player.deathSeq = 2;
    player.stateVersion = 8;
    room.callbacks.state[0](room.stateValue);
    room.callbacks.decision[0]({
        runId,
        deathSeq: 1,
        clientReqId: "late",
        outcome: "retryableFailure",
        retryable: true,
    });
    assert.equal(presentation.notices.length, 2, "旧 deathSeq decisionResult 必须丢弃");
    room.callbacks.finalizing[0]({ runId, stateVersion: 7, endReason: "reliveTimeout" });
    assert.equal(presentation.finalizing.length, 0, "旧 stateVersion finalizing 必须丢弃");
    room.callbacks.finalizing[0]({ runId, stateVersion: 8, endReason: "reliveTimeout" });
    room.callbacks.finalizing[0]({ runId, stateVersion: 8, endReason: "reliveTimeout" });
    assert.equal(presentation.finalizing.length, 1);
    const result: ISnakeRunResultV2 = {
        resultVersion: 2,
        runId,
        endReason: "reliveTimeout",
        confirmedThroughTick: 210,
        rewardStatus: "applied",
        qualified: true,
        stats: {
            skinIdAtRunStart: 1, activeTicks: 600, score: 120, finalLength: 90, maxLength: 110,
            kills: 2, deaths: 1, relivesUsed: 1, reliveCoinSpent: 100,
            magnetCollected: 1, starCollected: 3, meaningfulInputCount: 9,
        },
        coin: { amount: 17, balanceAfter: 9917 },
        progression: {
            xpAmount: 43, xpAfter: 43, levelBefore: 1, levelAfter: 1,
            fragmentSkinId: 401, fragmentAmount: 2,
            achievementProgressAfter: { "101": 2, "132": 600, "139": 3, "701": 120 },
            newlyUnlockedSkinIds: [],
        },
    };
    room.callbacks.result[0](result);
    room.callbacks.result[0](result);
    assert.equal(presentation.results.length, 1, "同 run 结果只展示一次");
    gameplay.dispose();
});

function fakeTypedRoom(overrides: { ackSeq?: number; sendResult?: boolean } = {}): SnakeTypedRoom & { sent: unknown[] } {
    const sent: unknown[] = [];
    return {
        kind: "typed-game-room", mode: "snake", roomId: "r1", sessionId: "self", current: true, dropping: false,
        state: { players: new Map([["self", { ackSeq: overrides.ackSeq ?? 0 }]]) },
        state$: () => null, onMessage: () => () => {},
        send: (_type: unknown, payload: unknown) => { sent.push(payload); return overrides.sendResult ?? true; },
        sent,
    } as never;
}

test("Room adapter：输入合流、seq 无空洞、重连从权威 ack 续发且 boost=false", () => {
    const adapter = createSnakeRoomAdapter();
    const room = fakeTypedRoom();
    assert.equal(adapter.pushInput(room, 1, 0, false), 1);
    assert.equal(adapter.pushInput(room, 1, 0, false), 0);
    assert.equal(adapter.pushInput(room, 0, 1, true), 2);
    const closed = fakeTypedRoom({ sendResult: false });
    assert.equal(adapter.pushInput(closed, 0, -1, false), 0);
    assert.equal(adapter.inputSeq, 2);
    const reconnected = fakeTypedRoom({ ackSeq: 5 });
    adapter.reconcile(reconnected, "reconnected");
    assert.equal(adapter.inputSeq, 6);
    assert.deepEqual(reconnected.sent.at(-1), { dirX: 0, dirY: -1, boost: false, seq: 6 });
});

test("容量常量仍覆盖 17 蛇/1030 food/10 tool/88162 点", () => {
    assert.equal(SNAKE_RULESET.snapshotMaxSnakes, 17);
    assert.equal(SNAKE_RULESET.snapshotMaxFoods, 1030);
    assert.equal(SNAKE_RULESET.snapshotMaxTools, 10);
    assert.equal(SNAKE_RULESET.snapshotMaxPointsPerSnake, 5186);
    assert.equal(SNAKE_RULESET.snapshotMaxPointsTotal, 88162);
});

test("Gameplay：结束请求看门狗——超时先用当前 runId 重发一次，两次都没进终局就把确认框还给玩家", async () => {
    // 真机实证 2026-09-06：服务端对 runId 不匹配 / 已 Finalized 的 endRun 是静默丢弃，
    // 客户端点完确认就关框 ⇒ 玩家看到「点了没反应」。这里钉住自愈：重发一次 + 兜底重开确认框。
    const presentation = fakePresentation();
    const room = fakeRoom();
    const gameplay = createSnakeGameplay({ presentationFactory: () => presentation });
    const ctx = context(room);
    await gameplay.start(ctx);
    gameplay.handleInput({ type: "request-end-run" }, ctx);
    gameplay.handleInput({ type: "confirm-end-run" }, ctx);
    assert.equal(room.endRuns.length, 1, "确认即发一次");
    assert.deepEqual(presentation.confirmations, [true, false]);

    // 服务端静默丢弃：不给任何终局消息。第一次超时 → 用**当前** runId 重发。
    const player = room.stateValue.players.get("self")!;
    (player as { runId: string }).runId = `${player.runId}:next`;
    gameplay.tick(1.6, ctx);
    assert.equal(room.endRuns.length, 2, "超时后重发一次");
    const [first, second] = room.endRuns as Array<{ runId: string; clientReqId: string }>;
    assert.equal(second.runId, player.runId, "重发用的是当前 runId，⛔ 不是发第一次时的旧值");
    assert.notEqual(second.clientReqId, first.clientReqId);

    // 还是没反应：把确认框重新弹回来，⛔ 不静默吞掉这次操作。
    gameplay.tick(1.6, ctx);
    assert.equal(room.endRuns.length, 2, "只重发一次");
    assert.deepEqual(presentation.confirmations, [true, false, true], "兜底重开确认框");
    gameplay.tick(1.6, ctx);
    assert.deepEqual(presentation.confirmations, [true, false, true], "看门狗已收摊，⛔ 不反复弹");
    gameplay.dispose();
});

test("Gameplay：终局消息到达即收摊看门狗（⛔ 不再重发、不再弹确认框）", async () => {
    const presentation = fakePresentation();
    const room = fakeRoom();
    const gameplay = createSnakeGameplay({ presentationFactory: () => presentation });
    const ctx = context(room);
    await gameplay.start(ctx);
    const player = room.stateValue.players.get("self")!;
    gameplay.handleInput({ type: "request-end-run" }, ctx);
    gameplay.handleInput({ type: "confirm-end-run" }, ctx);
    assert.equal(room.endRuns.length, 1);
    room.callbacks.finalizing[0]({ runId: player.runId, stateVersion: 3, reason: SnakeRunEndReason.ExplicitExit } as never);
    gameplay.tick(1.6, ctx);
    gameplay.tick(1.6, ctx);
    assert.equal(room.endRuns.length, 1, "终局已到：⛔ 不重发");
    assert.deepEqual(presentation.confirmations, [true, false], "⛔ 不再弹确认框");
    gameplay.dispose();
});
