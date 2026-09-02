/**
 * snake 客户端无头测试：快照缓冲接受/插值、HUD 派生、Gameplay 生命周期与输入闸、
 * adapter 的 seq/合流/重连续发（docs/snakeoff/04 §4/§6/§8 验收点）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SnakeSnapshotBuffer,
    type SnakeSnapshotLike,
} from "../src/logic/rooms/snake/SnakeSnapshotBuffer";
import { deriveSnakeHud, deriveSnakeRanking, deriveSnakeSettle } from "../src/logic/rooms/snake/SnakeHud";
import {
    createSnakeGameplay,
    type SnakePresentation,
    type SnakeRoomLike,
} from "../src/logic/rooms/snake/SnakeGameplay";
import { createSnakeRoomAdapter, type SnakeTypedRoom } from "../src/net/rooms/SnakeRoom";
import { GamePhase } from "../src/shared/index";

function snapshotOf(seq: number, tick: number, matchId = "m1"): SnakeSnapshotLike {
    return {
        matchId,
        tick,
        seq,
        snakes: [{
            id: "self",
            name: "我",
            skin: 0,
            ai: false,
            alive: true,
            score: seq * 10,
            length: 30 + seq,
            boost: false,
            points: [{ x: tick, y: 0 }, { x: tick - 18, y: 0 }],
        }],
        foods: [{ id: 1, kind: 0, x: 10, y: 20 }],
        wrecks: [],
    };
}

// ── SnakeSnapshotBuffer ──────────────────────────────────────────────────

test("快照缓冲：接受条件（matchId/seq 单调/tick 不回退）与换局 reset", () => {
    const buffer = new SnakeSnapshotBuffer();
    assert.equal(buffer.ready, false);
    buffer.attach("m1");
    assert.equal(buffer.offer(snapshotOf(1, 10)), true);
    assert.equal(buffer.ready, true);
    assert.equal(buffer.offer(snapshotOf(2, 12)), true);
    assert.equal(buffer.offer(snapshotOf(2, 13)), false, "seq 不增拒绝");
    assert.equal(buffer.offer(snapshotOf(1, 14)), false, "seq 倒退拒绝");
    assert.equal(buffer.offer(snapshotOf(3, 11)), false, "tick 回退拒绝");
    assert.equal(buffer.offer(snapshotOf(4, 20, "m2")), false, "异局快照拒绝");
    buffer.attach("m2"); // 换局 reset
    assert.equal(buffer.ready, false, "换局必须清空缓冲");
    assert.equal(buffer.offer(snapshotOf(1, 1, "m2")), true, "新局 seq 从 1 重新开始也接受");
});

test("快照缓冲：两份快照间插值，范围外钳制", () => {
    const buffer = new SnakeSnapshotBuffer();
    buffer.attach("m1");
    buffer.offer(snapshotOf(1, 10));
    buffer.offer(snapshotOf(2, 12));
    // renderTick 11 = 两份中点：x 从 10 到 12 插值为 11
    const frame = buffer.sample(11);
    assert.ok(frame);
    assert.equal(frame.snakes[0].points[0].x, 11, "中点插值");
    // 早于前一份 → 钳在前一份
    assert.equal(buffer.sample(5)?.snakes[0].points[0].x, 10);
    // 晚于最新 → 钳在最新
    assert.equal(buffer.sample(99)?.snakes[0].points[0].x, 12);
    // 只有一份 → 原样
    const single = new SnakeSnapshotBuffer();
    single.attach("m1");
    single.offer(snapshotOf(1, 10));
    assert.equal(single.sample(8)?.snakes[0].points[0].x, 10, "单份快照不插值");
});

// ── SnakeHud ─────────────────────────────────────────────────────────────

test("HUD 派生：倒计时 tick 驱动 + 排名序 + 自己高亮 + 复活倒计时", () => {
    const frame = {
        tick: 100,
        snakes: [
            { id: "a", name: "甲", skin: 0, ai: false, alive: true, score: 30, length: 40, boost: false, points: [{ x: 0, y: 0 }] },
            { id: "b", name: "乙", skin: 1, ai: false, alive: true, score: 50, length: 30, boost: false, points: [{ x: 0, y: 0 }] },
            { id: "ai-1", name: "AI-1", skin: 15, ai: true, alive: true, score: 50, length: 60, boost: false, points: [{ x: 0, y: 0 }] },
        ],
        foods: [],
        wrecks: [],
    };
    const state = {
        endTick: 1900,
        countdownEndTick: 0,
        winnerId: "",
        players: new Map([
            ["a", { killCount: 2, deathCount: 0, respawnTick: 0 }],
            ["b", { killCount: 0, deathCount: 1, respawnTick: 130 }],
        ]),
    } as never;
    const hud = deriveSnakeHud(frame, state, "b");
    assert.equal(hud.countdownSeconds, 90, "倒计时 = (endTick - tick)/20 上取整");
    assert.equal(hud.inStartCountdown, false);
    assert.equal(hud.entries[0].id, "ai-1", "同分时击杀数多者前（b 0 杀 < ai-1 0 杀？ 同 0 比死亡）");
    assert.equal(hud.entries[1].id, "b");
    assert.equal(hud.entries.find((entry) => entry.isSelf)?.id, "b");
    assert.equal(hud.selfRespawnSeconds, 2, "复活倒计时 = (respawnTick - tick)/20 上取整");
});

test("HUD 排名：分数↓ → 击杀↓ → 死亡↑ → id 序；结算模型取 winner/self", () => {
    const frame = {
        tick: 1900,
        snakes: [
            { id: "x", name: "X", skin: 0, ai: false, alive: false, score: 50, length: 10, boost: false, points: [] },
            { id: "y", name: "Y", skin: 1, ai: false, alive: true, score: 50, length: 10, boost: false, points: [] },
        ],
        foods: [],
        wrecks: [],
    };
    const state = {
        endTick: 1900,
        countdownEndTick: 0,
        winnerId: "x",
        players: new Map([
            ["x", { killCount: 1, deathCount: 0, respawnTick: 0 }],
            ["y", { killCount: 0, deathCount: 0, respawnTick: 0 }],
        ]),
    } as never;
    const ranking = deriveSnakeRanking(frame, state, "y");
    assert.equal(ranking[0].id, "x", "同分同长比击杀");
    const settle = deriveSnakeSettle(frame, state, "y");
    assert.equal(settle.winnerName, "X", "结算取权威 winnerId 的名字");
    assert.equal(settle.selfEntry?.id, "y");
});

// ── SnakeGameplay 生命周期与输入闸 ───────────────────────────────────────

function fakePresentation(): SnakePresentation & { renders: number; settles: number; masks: boolean[] } {
    const state = { renders: 0, settles: 0, masks: [] as boolean[] };
    return Object.assign(state, {
        mount: () => {},
        render: () => { state.renders++; },
        showSettle: () => { state.settles++; },
        setReconnecting: (flag: boolean) => { state.masks.push(flag); },
        unmount: () => {},
    });
}

function fakeRoom(overrides: Partial<SnakeRoomLike> = {}): SnakeRoomLike & {
    sentInputs: Array<{ dirX: number; dirY: number; boost: boolean }>;
    snapshotCbs: Array<(snapshot: never) => void>;
    stateCbs: Array<(state: never) => void>;
    counts: { clearedBoost: number };
} {
    const sentInputs: Array<{ dirX: number; dirY: number; boost: boolean }> = [];
    const snapshotCbs: Array<(snapshot: never) => void> = [];
    const stateCbs: Array<(state: never) => void> = [];
    // ⚠ 计数器必须放共享引用的子对象里：Object.assign 按值拷贝标量，顶层放
    // clearedBoost: 0 会让 room.clearedBoost 永远是构造时的 0（实测踩过）。
    const counts = { clearedBoost: 0 };
    const extra = {
        sentInputs,
        snapshotCbs,
        stateCbs,
        counts,
    };
    return Object.assign({
        roomId: "r1",
        sessionId: "self",
        dropping: false,
        state: () => null,
        onWelcome: () => () => {},
        onError: () => () => {},
        onSnapshot: (cb: (snapshot: never) => void) => { snapshotCbs.push(cb); return () => {}; },
        onStateChange: (cb: (state: never) => void) => { stateCbs.push(cb); return () => {}; },
        sendInput: (dirX: number, dirY: number, boost: boolean) => {
            sentInputs.push({ dirX, dirY, boost });
            return sentInputs.length;
        },
        clearBoost: () => { counts.clearedBoost++; },
        ping: () => {},
    }, extra, overrides);
}

function fakeContext(room: SnakeRoomLike): {
    room: SnakeRoomLike;
    signal: AbortSignal;
    generation: number;
    isActive(): boolean;
} {
    return { room, signal: new AbortController().signal, generation: 1, isActive: () => true };
}

test("SnakeGameplay：快照入缓冲 → tick 出渲染帧；Settle 停输入并只结算一次", async () => {
    const presentation = fakePresentation();
    const gameplay = createSnakeGameplay({ presentationFactory: () => presentation });
    const room = fakeRoom({
        state: () => ({ matchId: "m1", phase: GamePhase.Playing, endTick: 1900, countdownEndTick: 0, players: new Map() }) as never,
    });
    const context = fakeContext(room); // ⚠ context 身份必须稳定：plugin 用它识别本局
    await gameplay.start(context);
    room.snapshotCbs[0](snapshotOf(1, 10) as never);
    room.snapshotCbs[0](snapshotOf(2, 12) as never);
    assert.equal(gameplay.snapshotBufferReady, true);
    gameplay.tick(0.05, context);
    assert.equal(presentation.renders, 1, "有帧后 tick 必须渲染");

    // Settle：停输入 + 结算一次
    const settleState = { matchId: "m1", phase: GamePhase.Settle, endTick: 1900, countdownEndTick: 0, winnerId: "self", players: new Map() };
    room.stateCbs[0](settleState as never);
    assert.equal(presentation.settles, 1);
    gameplay.handleInput({ type: "steer", dirX: 1, dirY: 0, boost: false }, context);
    assert.equal(room.sentInputs.length, 0, "Settle 后输入必须被拒");
    room.stateCbs[0](settleState as never);
    assert.equal(presentation.settles, 1, "Settle 展示幂等");

    gameplay.stop({ kind: "manual" }, context);
    gameplay.stop({ kind: "manual" }, context);
    gameplay.dispose();
    gameplay.dispose();
});

test("SnakeGameplay：断线期间清 boost + 遮罩 + 拒输入；重连恢复", async () => {
    const presentation = fakePresentation();
    const gameplay = createSnakeGameplay({ presentationFactory: () => presentation });
    const room = fakeRoom();
    const context = fakeContext(room);
    await gameplay.start(context);
    room.snapshotCbs[0](snapshotOf(1, 10) as never);

    // drop
    (room as { dropping: boolean }).dropping = true;
    gameplay.tick(0.05, context);
    assert.deepEqual(presentation.masks, [true], "drop 必须开遮罩");
    assert.equal(room.counts.clearedBoost, 1, "drop 立即清 boost 意图");
    gameplay.handleInput({ type: "steer", dirX: 1, dirY: 0, boost: false }, context);
    assert.equal(room.sentInputs.length, 0, "重连中拒新输入");

    // 恢复
    (room as { dropping: boolean }).dropping = false;
    gameplay.tick(0.05, context);
    assert.deepEqual(presentation.masks, [true, false], "重连恢复必须收遮罩");
    gameplay.handleInput({ type: "steer", dirX: 1, dirY: 0, boost: false }, context);
    assert.equal(room.sentInputs.length, 1, "恢复后输入放行");
    gameplay.dispose();
});

// ── adapter：seq 管理 / 合流 / 重连续发 ──────────────────────────────────

function fakeTypedRoom(overrides: { ackSeq?: number; sendResult?: boolean } = {}): SnakeTypedRoom & {
    sent: Array<unknown>;
} {
    const sent: unknown[] = [];
    const self = { ackSeq: overrides.ackSeq ?? 0 };
    return Object.assign({
        kind: "typed-game-room",
        mode: "snake",
        roomId: "r1",
        sessionId: "self",
        current: true,
        dropping: false,
        state: { players: new Map([["self", self]]) },
        state$: () => null,
        onMessage: () => () => {},
        send: (_type: unknown, payload: unknown) => {
            sent.push(payload);
            return overrides.sendResult ?? true;
        },
        sent,
    }, { sent }) as never;
}

test("SnakeRoomAdapter：seq 严格递增 + 不变输入合流 + 发送闸关闭回退 seq", () => {
    const adapter = createSnakeRoomAdapter();
    const room = fakeTypedRoom();
    assert.equal(adapter.pushInput(room, 1, 0, false), 1, "首次发送分配 seq 1");
    assert.equal(adapter.pushInput(room, 1, 0, false), 0, "不变输入合流不发");
    assert.equal(adapter.pushInput(room, 0, 1, false), 2, "方向变化才发");
    assert.equal(adapter.pushInput(room, 0, 1, true), 3, "boost 变化也发");

    // 发送闸关闭：seq 回退，不产生空洞
    const closed = fakeTypedRoom({ sendResult: false });
    assert.equal(adapter.pushInput(closed, 0, -1, false), 0, "发送失败不消耗 seq");
    assert.equal(adapter.inputSeq, 3, "seq 回退到 3");
});

test("SnakeRoomAdapter：重连从权威 ackSeq 续发（boost 先 false，不重放不归零）", () => {
    const adapter = createSnakeRoomAdapter();
    const room = fakeTypedRoom();
    adapter.pushInput(room, 1, 0, true); // seq 1
    adapter.pushInput(room, 0, 1, true); // seq 2
    // 模拟重连：服务端 ackSeq=5（中间 3 条在宽限期到达过）
    const reconnected = fakeTypedRoom({ ackSeq: 5 });
    adapter.reconcile(reconnected, "reconnected");
    assert.equal(adapter.inputSeq, 6, "续发分配 seq 6 = ack 5 + 1");
    const last = reconnected.sent[reconnected.sent.length - 1] as { boost: boolean; seq: number };
    assert.equal(last.boost, false, "重连后 boost 先 false");
    assert.equal(last.seq, 6);
    // 非 reconnected 的 reconcile 不动作
    const other = fakeTypedRoom();
    adapter.reconcile(other, "ready");
    assert.equal(other.sent.length, 0, "ready 不触发续发");
});
