import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    ErrorCode,
    GamePhase,
    MAP_WIDTH,
    PLAYER_MOVE_SPEED,
    PROTOCOL_VERSION,
    PLAYER_INIT_HP,
    S2C,
    TICK_MS,
    type IGameRoomJoinOptions,
} from "@game/shared";
import {
    GameRoom,
    GAME_ROOM_MAX_MESSAGES_PER_SECOND,
    MAX_ACCEPTED_INPUTS,
    type GameRoomRuntimeOptions,
} from "../src/rooms/GameRoom";
import { BALL_MOVE_GAME_MODE_ID, createBallMoveGameMode } from "../src/rooms/GameMode";
import {
    validateMatchEvidenceV3,
    type MatchEvidenceV3,
} from "../src/core/match/matchEvidence";
import { replayMatchEvidenceV3 } from "../src/core/match/matchReplay";

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string };
    sent: Array<[string, unknown]>;
    send: (type: string, payload: unknown) => void;
};

function fakeClient(sessionId: string, userId = sessionId, sId = 0): FakeClient {
    const client: FakeClient = {
        sessionId,
        auth: { userId, sId, mode: BALL_MOVE_GAME_MODE_ID },
        sent: [],
        send(type, payload) { this.sent.push([type, payload]); },
    };
    return client;
}

function options(): IGameRoomJoinOptions {
    return { v: PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID };
}

function installLock(room: GameRoom, lock: () => Promise<void> = async () => undefined): void {
    // Room.lock() needs a MatchMaker listing, which is intentionally absent in these
    // pure unit tests. Replace only the external lock boundary.
    (room as unknown as { lock: () => Promise<void> }).lock = lock;
}

async function join(room: GameRoom, client: FakeClient): Promise<void> {
    await room.onJoin(client as never, options());
}

function runtime(seed: number, now = 0): GameRoomRuntimeOptions {
    return { seed, clock: () => now, fixedStepMs: 50 };
}

/**
 * Snapshot only the formal simulation state.  `PlayerState.name` belongs to
 * the admission/display stream and is intentionally excluded: an extra
 * waiting-room join consumes admission RNG without changing the match RNG.
 */
function simulationSnapshot(room: GameRoom): unknown {
    const players: Record<string, unknown> = {};
    for (const [sessionId, player] of room.state.players.entries()) {
        players[sessionId] = {
            id: player.id,
            x: player.x,
            y: player.y,
            hp: player.hp,
            maxHp: player.maxHp,
            alive: player.alive,
            dirX: player.dirX,
            dirY: player.dirY,
            lastCastTick: { ...player.lastCastTick },
            level: player.level,
        };
    }
    return {
        tick: room.state.tick,
        phase: room.state.phase,
        matchId: room.state.matchId,
        players,
    };
}

test("GameRoom auth 只信标准 token，options.token 只能逐字匹配", async () => {
    const base = { v: PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID };
    await assert.rejects(
        GameRoom.onAuth("", { ...base, token: "options-only" }, undefined as never),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.TokenExpired)),
        "缺失 Colyseus 标准 token 时不能仅凭 options.token 建连",
    );
    await assert.rejects(
        GameRoom.onAuth("standard-token", { ...base, token: "different-token" }, undefined as never),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.TokenExpired)),
        "options.token 与标准 token 不一致时必须拒绝",
    );
});

test("GameRoom S2C 出站 payload 先经 shared runtime validator，再交给 transport", () => {
    const room = new GameRoom(runtime(10));
    const client = fakeClient("s1");
    const sent: Array<[string, unknown]> = [];
    client.send = (type, payload) => { sent.push([type, payload]); };
    const sendS2C = (room as unknown as {
        sendS2C: (client: unknown, type: string, payload: unknown) => void;
    }).sendS2C.bind(room);

    sendS2C(client, S2C.Pong, { clientTime: 1, serverTime: 2 });
    assert.deepEqual(sent, [[S2C.Pong, { clientTime: 1, serverTime: 2 }]]);
    assert.throws(
        () => sendS2C(client, S2C.Pong, { clientTime: 1, serverTime: 2, extra: true }),
        /WIRE_KEYS/,
    );
    assert.equal(sent.length, 1, "非法 payload 不得进入 client.send");

    const broadcasted: Array<[string, unknown]> = [];
    (room as unknown as { broadcast: (type: string, payload: unknown) => void }).broadcast = (type, payload) => {
        broadcasted.push([type, payload]);
    };
    const broadcastS2C = (room as unknown as {
        broadcastS2C: (type: string, payload: unknown) => void;
    }).broadcastS2C.bind(room);
    broadcastS2C(S2C.Chat, { fromId: "s1", fromName: "甲", text: "hi", time: 3 });
    assert.equal(broadcasted.length, 1);
    assert.throws(
        () => broadcastS2C(S2C.Chat, { fromId: "s1", fromName: "甲", text: "hi", time: Number.NaN }),
        /WIRE_INTEGER/,
    );
    assert.equal(broadcasted.length, 1, "非法 payload 不得进入 room.broadcast");
});

test("GameRoom C2S exact runtime schema rejects NaN/range/length/unknown keys", async () => {
    const room = new GameRoom(runtime(11));
    installLock(room);
    const a = fakeClient("a", "ua");
    await join(room, a);
    const b = fakeClient("b", "ub");
    await join(room, b);
    const player = room.state.players.get(a.sessionId)!;
    const before = { x: player.x, y: player.y, dirX: player.dirX, dirY: player.dirY };
    const move = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Move];

    move(a, { dirX: Number.NaN, dirY: 0 });
    move(a, { dirX: 2, dirY: 0 });
    move(a, { dirX: 0, dirY: 0, extra: true });
    assert.deepEqual(
        { x: player.x, y: player.y, dirX: player.dirX, dirY: player.dirY },
        before,
        "非法移动不能进入玩法状态",
    );

    const chat = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Chat];
    chat(a, { text: "x".repeat(101) });
    const cast = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.CastSkill];
    cast(a, { skillId: 1, targetId: "" });
    assert.ok(a.sent.some(([, payload]) => (payload as { code?: number }).code === ErrorCode.BadRequest));
});

test("GameRoom C2S rejects non-plain and symbol-keyed direct handler payloads", async () => {
    const room = new GameRoom(runtime(110));
    installLock(room);
    const a = fakeClient("a", "ua");
    await join(room, a);
    const b = fakeClient("b", "ub");
    await join(room, b);
    const move = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Move];
    const player = room.state.players.get("a")!;
    const before = { x: player.x, y: player.y, dirX: player.dirX, dirY: player.dirY };
    class MovePayload {
        dirX = 1;
        dirY = 0;
    }
    const nonEnumerable = { dirX: 0, dirY: 1 };
    Object.defineProperty(nonEnumerable, "extra", { value: true, enumerable: false });
    const symbolPayload = { dirX: 1, dirY: 0, [Symbol("extra")]: true };
    move(a, new MovePayload());
    move(a, nonEnumerable);
    move(a, symbolPayload);
    assert.deepEqual(
        { x: player.x, y: player.y, dirX: player.dirX, dirY: player.dirY },
        before,
        "带隐藏字段或 symbol 字段的移动不能进入玩法状态",
    );
    assert.equal(a.sent.filter(([, payload]) => (payload as { code?: number }).code === ErrorCode.BadRequest).length, 3);
});

test("rejected skills do not enter the accepted input sequence", async () => {
    const room = new GameRoom(runtime(111));
    installLock(room);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    await join(room, b);
    const cast = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.CastSkill];

    // The wire shape is valid, but the skill id is not in the server skill table.
    cast(a, { skillId: 0xffff, targetId: b.sessionId });
    assert.equal(room.getAcceptedInputs().length, 0);

    // A real cast is recorded exactly once; an immediate retry is rejected by cooldown.
    cast(a, { skillId: 1, targetId: b.sessionId });
    assert.equal(room.getAcceptedInputs().length, 1);
    cast(a, { skillId: 1, targetId: b.sessionId });
    assert.equal(room.getAcceptedInputs().length, 1);

    // Replay/injected inputs use the same post-application rule.
    const replayRoom = new GameRoom(runtime(112));
    installLock(replayRoom);
    await join(replayRoom, fakeClient("a", "ua"));
    await join(replayRoom, fakeClient("b", "ub"));
    assert.equal(replayRoom.injectInput({ type: "castSkill", sessionId: "a", skillId: 0xffff }), true);
    replayRoom.stepFixed();
    assert.equal(replayRoom.getAcceptedInputs().length, 0);
    assert.equal(replayRoom.injectInput({ type: "castSkill", sessionId: "a", skillId: 1 }), true);
    replayRoom.stepFixed();
    assert.equal(replayRoom.getAcceptedInputs().length, 1);
    assert.equal(replayRoom.injectInput({ type: "castSkill", sessionId: "a", skillId: 1 }), true);
    replayRoom.stepFixed();
    assert.equal(replayRoom.getAcceptedInputs().length, 1);
});

test("accepted input evidence has a bounded capacity and rejects later side effects", async () => {
    let evidence: MatchEvidenceV3 | undefined;
    const room = new GameRoom({
        ...runtime(113),
        maxAcceptedInputs: 1,
        evidenceEmitter: (value) => {
            evidence = value;
            return Promise.resolve({ ok: true as const, entryId: "0-0" });
        },
    });
    installLock(room);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    await join(room, b);
    const move = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Move];
    const player = room.state.players.get("a")!;

    move(a, { dirX: 1, dirY: 0 });
    assert.equal(room.getAcceptedInputs().length, 1);
    assert.equal(player.dirX, 1);
    const errorsBefore = a.sent.filter(([, payload]) => (payload as { code?: number }).code === ErrorCode.BadRequest).length;

    move(a, { dirX: -1, dirY: 0 });
    assert.equal(room.getAcceptedInputs().length, 1, "达到上限后证据序列不得继续增长");
    assert.equal(player.dirX, 1, "证据容量耗尽时不得半应用新的移动");
    assert.equal(
        a.sent.filter(([, payload]) => (payload as { code?: number }).code === ErrorCode.BadRequest).length,
        errorsBefore + 1,
    );

    assert.ok(MAX_ACCEPTED_INPUTS > 1, "生产上限应大于测试覆盖的小容量覆写");
    await room.onLeave(b as never, 4000);
    assert.deepEqual(evidence?.events.map((event) => event.type), ["move", "leave"]);
});

test("cast 达到 accepted input 上限时在冷却与伤害之前 fail-closed", async () => {
    const room = new GameRoom({ ...runtime(213), maxAcceptedInputs: 1 });
    installLock(room);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    await join(room, b);
    const cast = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.CastSkill];
    const playerA = room.state.players.get("a")!;
    const playerB = room.state.players.get("b")!;
    const badRequests = (sender: FakeClient): number => sender.sent
        .filter(([, payload]) => (payload as { code?: number }).code === ErrorCode.BadRequest).length;

    // 先用一次合法 cast 占满容量：它必须真的结算过，后面的对照才有意义。
    cast(a, { skillId: 1, targetId: "b" });
    assert.equal(room.getAcceptedInputs().length, 1);
    assert.ok(playerB.hp < PLAYER_INIT_HP, "占位的第一发必须真的落伤害");
    assert.deepEqual(Object.keys(playerA.lastCastTick), ["1"], "占位的第一发必须写入冷却");
    const hpA = playerA.hp;
    const hpB = playerB.hp;
    const errorsBefore = badRequests(b);

    // b 从未施法：技能表、存活、冷却全部合法，唯一可能的拒绝理由只有证据容量闸。
    cast(b, { skillId: 1, targetId: "a" });
    assert.equal(room.getAcceptedInputs().length, 1, "达到上限后 cast 不得进入证据链");
    assert.equal(playerA.hp, hpA, "容量耗尽时不得先结算伤害再拒绝（否则证据与状态脱节）");
    assert.equal(playerB.hp, hpB);
    assert.deepEqual(Object.keys(playerB.lastCastTick), [], "容量耗尽时不得写入冷却");
    assert.equal(badRequests(b), errorsBefore + 1, "被容量闸拒绝的 cast 必须回 BadRequest");
});

test("winning cast is appended before settlement emits replayable v3 evidence", async () => {
    let emissions = 0;
    const room = new GameRoom({
        ...runtime(114),
        matchId: () => "m_winning_cast",
        evidenceEmitter: (evidence) => {
            assert.equal(evidence.events.at(-1)?.type, "castSkill");
            replayMatchEvidenceV3(validateMatchEvidenceV3(evidence));
            emissions++;
            return Promise.resolve({ ok: true as const, entryId: "0-0" });
        },
    });
    installLock(room);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    await join(room, b);
    const cast = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.CastSkill];

    cast(a, { skillId: 3, targetId: b.sessionId });
    for (let tick = 0; tick < 100; tick++) room.stepFixed();
    cast(a, { skillId: 3, targetId: b.sessionId });
    for (let tick = 0; tick < 100; tick++) room.stepFixed();
    cast(a, { skillId: 3, targetId: b.sessionId });

    assert.equal(room.state.phase, GamePhase.Settle);
    assert.equal(room.state.tick, 200);
    assert.equal(emissions, 1);
});

test("Playing leave is appended before death/removal and emits ordered deterministic evidence", async () => {
    let emitted: MatchEvidenceV3 | undefined;
    const room = new GameRoom({
        ...runtime(115),
        matchId: () => "m_ordered_leave",
        evidenceEmitter: (evidence) => {
            assert.equal(evidence.events.at(-1)?.type, "leave");
            replayMatchEvidenceV3(validateMatchEvidenceV3(evidence));
            emitted = evidence;
            return Promise.resolve({ ok: true as const, entryId: "0-0" });
        },
    });
    installLock(room);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    await join(room, b);
    const initialX = room.state.players.get(a.sessionId)!.x;
    const move = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Move];
    move(a, { dirX: 1, dirY: 0 });
    for (let tick = 0; tick < 10; tick++) room.stepFixed();
    assert.equal(
        room.state.players.get(a.sessionId)!.x,
        Math.min(initialX + PLAYER_MOVE_SPEED * (room.fixedStep / 1000) * 10, MAP_WIDTH),
    );

    const calls: string[] = [];
    const internals = room as unknown as {
        recordLeaveEvent(sessionId: string, acceptedTick: number): void;
        recordDeath(sessionId: string): void;
        removePlayer(sessionId: string, removeParticipant: boolean): void;
    };
    const recordLeaveEvent = internals.recordLeaveEvent.bind(room);
    const recordDeath = internals.recordDeath.bind(room);
    const removePlayer = internals.removePlayer.bind(room);
    internals.recordLeaveEvent = (sessionId, acceptedTick) => {
        calls.push("event");
        assert.equal(room.state.players.get(sessionId)?.alive, true);
        recordLeaveEvent(sessionId, acceptedTick);
    };
    internals.recordDeath = (sessionId) => {
        calls.push("death");
        recordDeath(sessionId);
    };
    internals.removePlayer = (sessionId, removeParticipant) => {
        calls.push("remove");
        removePlayer(sessionId, removeParticipant);
    };

    await room.onLeave(b as never, 4000);
    assert.deepEqual(calls, ["event", "death", "remove"]);
    assert.deepEqual(emitted?.initialRoster.map((entry) => entry.sessionId), ["a", "b"]);
    assert.deepEqual(
        emitted?.initialState.players.map((player) => [player.sessionId, player.name]),
        emitted?.initialRoster.map((entry) => [entry.sessionId, entry.name]),
    );
});

test("diagonal move evidence preserves accepted input and normalizes exactly once in replay", async () => {
    let emitted: MatchEvidenceV3 | undefined;
    const room = new GameRoom({
        ...runtime(1_150),
        matchId: () => "m_diagonal_replay",
        evidenceEmitter: (evidence) => {
            replayMatchEvidenceV3(validateMatchEvidenceV3(evidence));
            emitted = evidence;
            return Promise.resolve({ ok: true as const, entryId: "0-0" });
        },
    });
    installLock(room);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    await join(room, b);

    const move = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Move];
    move(a, { dirX: 1, dirY: 1 });
    room.stepFixed();
    await room.onLeave(b as never, 4000);

    const moveEvent = emitted?.events.find((event) => event.type === "move");
    assert.deepEqual(moveEvent, {
        type: "move",
        sessionId: a.sessionId,
        dirX: 1,
        dirY: 1,
        acceptedTick: 0,
    });
    assert.equal(room.state.phase, GamePhase.Settle);
});

test("settlement freezes replay evidence before the mode finish hook can mutate live state", async () => {
    let emitted: MatchEvidenceV3 | undefined;
    const room = new GameRoom({
        ...runtime(1_151),
        matchId: () => "m_finish_snapshot",
        mode: {
            ...createBallMoveGameMode(),
            onFinish: ({ state }) => {
                state.players.get("a")!.hp = 0;
            },
        },
        evidenceEmitter: (evidence) => {
            replayMatchEvidenceV3(validateMatchEvidenceV3(evidence));
            emitted = evidence;
            return Promise.resolve({ ok: true as const, entryId: "0-0" });
        },
    });
    installLock(room);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    await join(room, b);

    await room.onLeave(b as never, 4000);

    assert.equal(room.state.players.get(a.sessionId)?.hp, 0, "finish hook must have run");
    assert.equal(
        emitted?.finalState.players.find((player) => player.sessionId === a.sessionId)?.hp,
        PLAYER_INIT_HP,
        "durable evidence must be the pre-hook settlement snapshot",
    );
});

test("Playing leave settles before awaiting a slow mode leave hook", async () => {
    let releaseHook!: () => void;
    const hookGate = new Promise<void>((resolve) => { releaseHook = resolve; });
    let emitted: MatchEvidenceV3 | undefined;
    const room = new GameRoom({
        ...runtime(1_152),
        matchId: () => "m_slow_leave",
        mode: {
            ...createBallMoveGameMode(),
            onLeave: () => hookGate,
        },
        evidenceEmitter: (evidence) => {
            replayMatchEvidenceV3(validateMatchEvidenceV3(evidence));
            emitted = evidence;
            return Promise.resolve({ ok: true as const, entryId: "0-0" });
        },
    });
    installLock(room);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    await join(room, b);

    const leaving = room.onLeave(b as never, 4000);
    const frozenTick = room.state.tick;
    assert.equal(room.state.phase, GamePhase.Settle, "phase must freeze before the hook resolves");
    assert.equal(emitted?.events.at(-1)?.type, "leave");

    room.stepFixed();
    const move = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Move];
    move(a, { dirX: 1, dirY: 0 });
    assert.equal(room.state.tick, frozenTick, "slow cleanup must not leave simulation running");
    assert.equal(emitted?.events.length, 1, "no gameplay event may follow the leave event");

    releaseHook();
    await leaving;
});

test("Waiting/Settle phase whitelist prevents simulation input and update", async () => {
    const room = new GameRoom(runtime(12));
    installLock(room);
    const a = fakeClient("a", "ua");
    await join(room, a);
    const player = room.state.players.get(a.sessionId)!;
    const waitingX = player.x;
    const move = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Move];
    move(a, { dirX: 1, dirY: 0 });
    (room as unknown as { update: (dt: number) => void }).update(1000);
    assert.equal(player.dirX, 0);
    assert.equal(player.x, waitingX, "等待期位置保持不变");
    assert.equal(room.state.tick, 0);

    // A direct state transition models a room after settle; the same handler must remain inert.
    room.state.phase = GamePhase.Settle;
    move(a, { dirX: -1, dirY: 0 });
    assert.equal(player.dirX, 0);
});

test("startMatch waits for lock before publishing Playing and rolls back on lock failure", async () => {
    let release!: () => void;
    const pendingLock = new Promise<void>((resolve) => { release = resolve; });
    const room = new GameRoom(runtime(13));
    installLock(room, () => pendingLock);
    const a = fakeClient("a", "ua");
    await join(room, a);
    const joinB = join(room, fakeClient("b", "ub"));
    await Promise.resolve();
    assert.equal(room.state.phase, GamePhase.Waiting);
    assert.equal(room.state.matchId, "");
    release();
    await joinB;
    assert.equal(room.state.phase, GamePhase.Playing);
    assert.notEqual(room.state.matchId, "");

    const failed = new GameRoom(runtime(14));
    installLock(failed, async () => { throw new Error("driver unavailable"); });
    await join(failed, fakeClient("a", "ua"));
    await assert.rejects(join(failed, fakeClient("b", "ub")));
    assert.equal(failed.state.phase, GamePhase.Waiting);
    assert.equal(failed.state.matchId, "");
    assert.equal(failed.state.players.size, 1, "失败的第二次入房回滚新增座位");
});

test("startMatch resets every gameplay field changed while waiting", async () => {
    const room = new GameRoom(runtime(17));
    installLock(room);
    const a = fakeClient("a", "ua");
    await join(room, a);
    const waiting = room.state.players.get("a")!;
    waiting.hp = 1;
    waiting.maxHp = 2;
    waiting.alive = false;
    waiting.dirX = 1;
    waiting.dirY = -1;
    waiting.lastCastTick = { 1: 12345 };
    waiting.level = 9;
    room.state.tick = 88;
    await join(room, fakeClient("b", "ub"));
    const started = room.state.players.get("a")!;
    assert.equal(room.state.phase, GamePhase.Playing);
    assert.equal(room.state.tick, 0);
    assert.equal(started.hp, PLAYER_INIT_HP);
    assert.equal(started.maxHp, PLAYER_INIT_HP);
    assert.equal(started.alive, true);
    assert.equal(started.dirX, 0);
    assert.equal(started.dirY, 0);
    assert.deepEqual(started.lastCastTick, {});
    assert.equal(started.level, 1);
});

test("a leave during lock aborts the start instead of publishing a one-player match", async () => {
    let release!: () => void;
    const pendingLock = new Promise<void>((resolve) => { release = resolve; });
    const room = new GameRoom(runtime(18));
    installLock(room, () => pendingLock);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    const pendingJoin = join(room, b);
    await Promise.resolve();
    await room.onLeave(a as never, 4000);
    release();
    await assert.rejects(pendingJoin);
    assert.equal(room.state.phase, GamePhase.Waiting);
    assert.equal(room.state.players.size, 0);
});

test("Waiting leave clears both identity indexes so the same account can rejoin", async () => {
    const room = new GameRoom(runtime(15));
    installLock(room);
    const first = fakeClient("first", "same-user");
    await join(room, first);
    await room.onLeave(first as never, 4000);
    await join(room, fakeClient("second", "same-user"));
    assert.equal(room.state.players.size, 1);
});

test("same seed + fixed steps + injected inputs produce identical state", async () => {
    const make = async (): Promise<GameRoom> => {
        const room = new GameRoom({ ...runtime(0x12345678), matchId: () => "m_deterministic" });
        installLock(room);
        await join(room, fakeClient("a", "ua"));
        await join(room, fakeClient("b", "ub"));
        return room;
    };
    const left = await make();
    const right = await make();
    const leftA = left.state.players.get("a")!;
    const rightA = right.state.players.get("a")!;
    assert.deepEqual(
        { x: leftA.x, y: leftA.y, hp: leftA.hp, alive: leftA.alive },
        { x: rightA.x, y: rightA.y, hp: rightA.hp, alive: rightA.alive },
    );
    assert.equal(left.state.matchId, right.state.matchId);
    assert.equal(leftA.hp, PLAYER_INIT_HP);

    assert.equal(left.injectInput({ type: "move", sessionId: "a", dirX: 1, dirY: 0 }), true);
    assert.equal(right.injectInput({ type: "move", sessionId: "a", dirX: 1, dirY: 0 }), true);
    (left as unknown as { stepFixed: () => void }).stepFixed();
    (right as unknown as { stepFixed: () => void }).stepFixed();
    assert.deepEqual(
        { x: leftA.x, y: leftA.y, tick: left.state.tick },
        { x: rightA.x, y: rightA.y, tick: right.state.tick },
    );
    assert.equal(left.getAcceptedInputs().length, 1);
});

test("default seed sequence keeps rooms created in the same millisecond distinct and replayable", (t) => {
    const fixedNow = 0x12345678;
    t.mock.method(Date, "now", () => fixedNow);

    // Exercise the production constructor path: no injected seed means every
    // room must consume the module-level sequence even when wall time is equal.
    const seeds = Array.from({ length: 8 }, () => new GameRoom().seedForReplay);
    assert.equal(new Set(seeds).size, seeds.length, "same-millisecond rooms must not share a seed");

    const sequence = seeds.map((seed) => (seed ^ fixedNow) >>> 0);
    for (let index = 1; index < sequence.length; index++) {
        assert.equal(
            sequence[index],
            (sequence[0] + index) >>> 0,
            "default seed must consume one deterministic sequence value per room",
        );
    }

    const replay = new GameRoom({ seed: seeds[0] });
    assert.equal(replay.seedForReplay, seeds[0], "emitted seed must reproduce through the injected replay path");
});

test("same seed keeps formal match state deterministic across different waiting histories", async () => {
    const make = async (withWaitingHistory: boolean): Promise<GameRoom> => {
        const room = new GameRoom({
            ...runtime(0x2468ace0),
            matchId: () => "m_waiting_history",
        });
        installLock(room);

        if (withWaitingHistory) {
            // This player joins while the room is still Waiting, exercises the
            // admission/display RNG, and leaves before the actual participants
            // arrive.  The extra history must not perturb formal match state.
            const observer = fakeClient("observer", "u-observer");
            await join(room, observer);
            const ping = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Ping];
            ping(observer, { clientTime: 1 });
            await room.onLeave(observer as never, 4000);
        }

        await join(room, fakeClient("a", "ua"));
        await join(room, fakeClient("b", "ub"));
        return room;
    };

    const quiet = await make(false);
    const noisy = await make(true);
    assert.equal(quiet.state.phase, GamePhase.Playing);
    assert.equal(noisy.state.phase, GamePhase.Playing);
    assert.deepEqual(
        simulationSnapshot(quiet),
        simulationSnapshot(noisy),
        "等待期入退场和消息不能改变正式对局的初始模拟状态（昵称不属于该快照）",
    );

    // Compare a later frame too, including a random-consuming skill, so the
    // assertion covers the match RNG stream and not just spawn coordinates.
    assert.equal(quiet.injectInput({ type: "move", sessionId: "a", dirX: 1, dirY: 0 }), true);
    assert.equal(noisy.injectInput({ type: "move", sessionId: "a", dirX: 1, dirY: 0 }), true);
    quiet.stepFixed();
    noisy.stepFixed();
    assert.equal(quiet.injectInput({ type: "castSkill", sessionId: "a", skillId: 1, targetId: "b" }), true);
    assert.equal(noisy.injectInput({ type: "castSkill", sessionId: "a", skillId: 1, targetId: "b" }), true);
    quiet.stepFixed();
    noisy.stepFixed();
    assert.deepEqual(simulationSnapshot(quiet), simulationSnapshot(noisy));
});

test("input source is fail-closed and respects declared ticks", async () => {
    let calls = 0;
    const room = new GameRoom({
        ...runtime(19),
        input: () => {
            calls++;
            if (calls === 1) return [{ type: "move", sessionId: "a", dirX: 1, dirY: 0, tick: 1 }];
            if (calls === 2) return [null as never, { type: "unknown" } as never];
            throw new Error("broken replay adapter");
        },
    });
    installLock(room);
    await join(room, fakeClient("a", "ua"));
    await join(room, fakeClient("b", "ub"));
    const player = room.state.players.get("a")!;
    const startX = player.x;
    (room as unknown as { stepFixed: () => void }).stepFixed();
    assert.equal(player.x, startX, "tick 不匹配的 source 输入不能提前应用");
    assert.doesNotThrow(() => (room as unknown as { stepFixed: () => void }).stepFixed());
    assert.doesNotThrow(() => (room as unknown as { stepFixed: () => void }).stepFixed());
    assert.equal(room.getAcceptedInputs().length, 0);
});

test("hostile injected proxies and iterators are dropped without breaking the next frame", async () => {
    const room = new GameRoom({ seed: 20, fixedStepMs: 50 });
    installLock(room);
    await join(room, fakeClient("a", "ua"));
    await join(room, fakeClient("b", "ub"));
    const player = room.state.players.get("a")!;

    const revocable = Proxy.revocable({
        type: "move",
        sessionId: "a",
        dirX: 1,
        dirY: 0,
    }, {});
    revocable.revoke();
    assert.doesNotThrow(() => assert.equal(room.injectInput(revocable.proxy as never), false));

    let calls = 0;
    const throwingItem = new Proxy({
        type: "move",
        sessionId: "a",
        dirX: 1,
        dirY: 0,
    }, {
            get() { throw new Error("hostile getter"); },
        });
    assert.doesNotThrow(() => assert.equal(room.injectInput(throwingItem as never), false));
    const validItem = { type: "move", sessionId: "a", dirX: 1, dirY: 0 } as const;
    room.setInputSource(() => {
        calls++;
        if (calls === 1) {
            const broken = [throwingItem] as unknown[];
            Object.defineProperty(broken, Symbol.iterator, {
                configurable: true,
                get() { throw new Error("hostile iterator"); },
            });
            return broken as never;
        }
        return [validItem];
    });

    assert.doesNotThrow(() => room.stepFixed());
    assert.equal(player.dirX, 0, "坏迭代器/字段不能半应用本帧");
    assert.doesNotThrow(() => room.stepFixed());
    assert.equal(player.dirX, 1, "下一帧仍可应用合法输入");
    assert.equal(room.getAcceptedInputs().length, 1);
});

test("dispose invalidates a pending match start and prevents a late lock from publishing Playing", async () => {
    let release!: () => void;
    const pendingLock = new Promise<void>((resolve) => { release = resolve; });
    const room = new GameRoom({ seed: 21, fixedStepMs: 50, startLockTimeoutMs: 1000 });
    installLock(room, () => pendingLock);
    const a = fakeClient("a", "ua");
    await join(room, a);
    const pendingJoin = join(room, fakeClient("b", "ub"));
    await Promise.resolve();
    assert.equal(room.state.phase, GamePhase.Waiting);

    await room.onDispose();
    release();
    await assert.rejects(pendingJoin);
    assert.equal(room.state.phase, GamePhase.Waiting);
    assert.equal(room.state.matchId, "");
    assert.equal(await room.startMatch(), false, "销毁后的房间不能重新开局");
});

test("a timed-out lock gates retries until its late unlock settles", async () => {
    let resolveLock!: () => void;
    let resolveUnlock!: () => void;
    let lockCalls = 0;
    let unlockCalls = 0;
    let locked = false;
    const room = new GameRoom({ seed: 26, fixedStepMs: 50, startLockTimeoutMs: 5 });
    // The real Room.lock() flips this private bit before awaiting its driver;
    // model that transition explicitly in this pure unit test.
    Object.defineProperty(room, "locked", { configurable: true, get: () => locked });
    (room as unknown as { lock: () => Promise<void> }).lock = () => {
        lockCalls++;
        locked = true;
        if (lockCalls === 1) return new Promise<void>((resolve) => { resolveLock = resolve; });
        return Promise.resolve();
    };
    (room as unknown as { unlock: () => Promise<void> }).unlock = () => {
        unlockCalls++;
        return new Promise<void>((resolve) => {
            resolveUnlock = () => { locked = false; resolve(); };
        });
    };

    await join(room, fakeClient("a", "ua"));
    await assert.rejects(join(room, fakeClient("b", "ub")));
    // The late lock has not settled yet; a new join must not start a second
    // attempt that could later be unlocked by the first attempt's callback.
    await assert.rejects(join(room, fakeClient("c", "uc")));
    resolveLock();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(unlockCalls, 1);
    await assert.rejects(join(room, fakeClient("d", "ud")), "迟到 unlock 未完成前继续拒绝重试");
    resolveUnlock();
    await new Promise<void>((resolve) => setImmediate(resolve));

    await join(room, fakeClient("e", "ue"));
    assert.equal(room.state.phase, GamePhase.Playing);
    assert.equal(lockCalls, 2, "释放旧锁后才允许新的开局 lock");
    assert.equal(unlockCalls, 1, "旧锁只释放一次");
});

test("dispose still best-effort releases a late lock", async () => {
    let resolveLock!: () => void;
    let unlockCalls = 0;
    let locked = false;
    const room = new GameRoom({ seed: 27, fixedStepMs: 50, startLockTimeoutMs: 5 });
    Object.defineProperty(room, "locked", { configurable: true, get: () => locked });
    (room as unknown as { lock: () => Promise<void> }).lock = () => {
        locked = true;
        return new Promise<void>((resolve) => { resolveLock = resolve; });
    };
    (room as unknown as { unlock: () => Promise<void> }).unlock = async () => {
        unlockCalls++;
        locked = false;
    };
    await join(room, fakeClient("a", "ua"));
    await assert.rejects(join(room, fakeClient("b", "ub")));
    await room.onDispose();
    resolveLock();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(unlockCalls, 1, "销毁后迟到成功仍应释放外部锁");
    assert.equal(locked, false);
});

test("dispose before timeout also releases a lock that settles late", async () => {
    let resolveLock!: () => void;
    let unlockCalls = 0;
    let locked = false;
    const room = new GameRoom({ seed: 271, fixedStepMs: 50, startLockTimeoutMs: 1000 });
    Object.defineProperty(room, "locked", { configurable: true, get: () => locked });
    (room as unknown as { lock: () => Promise<void> }).lock = () => {
        locked = true;
        return new Promise<void>((resolve) => { resolveLock = resolve; });
    };
    (room as unknown as { unlock: () => Promise<void> }).unlock = async () => {
        unlockCalls++;
        locked = false;
    };

    await join(room, fakeClient("a", "ua"));
    const pendingJoin = join(room, fakeClient("b", "ub"));
    await Promise.resolve();
    await room.onDispose();
    resolveLock();
    await assert.rejects(pendingJoin);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(unlockCalls, 1, "dispose 触发的 abort 后迟到 lock 也必须释放");
    assert.equal(locked, false);
});

test("disposed rooms ignore late leave callbacks, messages, ticks, and injected input", async () => {
    const room = new GameRoom(runtime(29));
    installLock(room);
    const a = fakeClient("a", "ua");
    await join(room, a);
    await join(room, fakeClient("b", "ub"));
    const player = room.state.players.get("a")!;
    const before = { x: player.x, dirX: player.dirX, tick: room.state.tick, sent: a.sent.length };

    await room.onDispose();
    const move = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Move];
    const ping = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Ping];
    assert.doesNotThrow(() => move(a, { dirX: 1, dirY: 0 }));
    assert.doesNotThrow(() => ping(a, { clientTime: 0 }));
    assert.doesNotThrow(() => room.injectInput({ type: "move", sessionId: "a", dirX: 1, dirY: 0 }));
    (room as unknown as { update: (dt: number) => void }).update(1000);
    room.stepFixed();
    await room.onLeave(a as never, 4000);

    assert.deepEqual(
        { x: player.x, dirX: player.dirX, tick: room.state.tick, sent: a.sent.length },
        before,
        "销毁后的房间不得继续推进、处理消息或发送回包",
    );
    assert.equal(room.state.players.has("a"), true, "迟到 onLeave 不得二次清理已销毁状态");
});

test("onLeave does not mutate a room after reconnection await resolves post-dispose", async () => {
    const room = new GameRoom(runtime(30));
    installLock(room);
    const a = fakeClient("a", "ua");
    await join(room, a);
    let release!: () => void;
    (room as unknown as { allowReconnection: () => Promise<void> }).allowReconnection = () =>
        new Promise<void>((resolve) => { release = resolve; });
    const pendingLeave = room.onLeave(a as never, 4001);
    await Promise.resolve();
    await room.onDispose();
    release();
    await pendingLeave;
    assert.equal(room.state.players.has("a"), true);
});

test("match start lock has a bounded deadline and rolls back without hanging the join", async () => {
    const room = new GameRoom({ seed: 22, fixedStepMs: 50, startLockTimeoutMs: 5 });
    installLock(room, () => new Promise<void>(() => undefined));
    await join(room, fakeClient("a", "ua"));
    await assert.rejects(join(room, fakeClient("b", "ub")));
    assert.equal(room.state.phase, GamePhase.Waiting);
    assert.equal(room.state.matchId, "");
    assert.equal(room.state.players.size, 1);
});

test("startMatch returning false is treated as a failed join and does not send welcome", async () => {
    const room = new GameRoom(runtime(23));
    installLock(room);
    const first = fakeClient("a", "ua");
    await join(room, first);
    (room as unknown as { startMatch: () => Promise<boolean> }).startMatch = async () => false;
    const second = fakeClient("b", "ub");
    await assert.rejects(join(room, second));
    assert.equal(room.state.players.size, 1);
    assert.equal(second.sent.length, 0, "未进入 Playing 不得发送 welcome");
});

test("faulty clocks and enormous dt stay finite and keep the room loop alive", async () => {
    let clockMode: "throw" | "fraction" = "throw";
    const room = new GameRoom({
        seed: 24,
        fixedStepMs: 50,
        clock: () => clockMode === "throw" ? (() => { throw new Error("clock unavailable"); })() : 12.75,
    });
    installLock(room);
    const a = fakeClient("a", "ua");
    await join(room, a);
    await join(room, fakeClient("b", "ub"));
    const update = (room as unknown as { update: (dt: number) => void }).update.bind(room);
    assert.doesNotThrow(() => update(Number.MAX_VALUE));
    assert.ok(Number.isSafeInteger(room.state.tick));
    assert.ok(room.state.tick <= 121, "catch-up 必须受上限约束");

    const ping = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Ping];
    assert.doesNotThrow(() => ping(a, { clientTime: 0 }));
    clockMode = "fraction";
    assert.doesNotThrow(() => ping(a, { clientTime: 0 }));
    const pongs = a.sent.filter(([type]) => type === S2C.Pong);
    assert.equal(pongs.at(-1)?.[1] && (pongs.at(-1)![1] as { serverTime: number }).serverTime, 12);
});

test("fixed-step options cannot produce an invalid Welcome tick rate", async () => {
    const room = new GameRoom({ seed: 28, fixedStepMs: 1 });
    installLock(room);
    const a = fakeClient("a", "ua");
    await join(room, a);
    assert.equal(room.fixedStep, TICK_MS, "过高 tickRate 的步长应回退默认值");
    const welcome = a.sent.find(([type]) => type === S2C.Welcome)?.[1] as { tickRate: number } | undefined;
    assert.equal(welcome?.tickRate, 20);

    const fractional = new GameRoom({ seed: 29, fixedStepMs: 16.5 });
    assert.equal(
        fractional.fixedStep,
        TICK_MS,
        "v3 evidence requires the same integer fixed-step domain as the live room",
    );
});

test("per-client message budget returns controlled errors and stays isolated by session", async () => {
    let now = 0;
    const room = new GameRoom({ seed: 16, clock: () => now, fixedStepMs: 50 });
    installLock(room);
    const a = fakeClient("a", "ua");
    const b = fakeClient("b", "ub");
    await join(room, a);
    await join(room, b);
    const ping = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Ping];
    assert.equal(room.maxMessagesPerSecond, GAME_ROOM_MAX_MESSAGES_PER_SECOND);

    for (let i = 0; i < GAME_ROOM_MAX_MESSAGES_PER_SECOND; i++) {
        ping(a, { clientTime: i });
    }
    assert.equal(a.sent.filter(([type]) => type === S2C.Pong).length, GAME_ROOM_MAX_MESSAGES_PER_SECOND);
    assert.equal(
        a.sent.filter(([type, payload]) => type === S2C.Error
            && (payload as { code?: number }).code === ErrorCode.BadRequest).length,
        0,
        "预算内的合法 Ping 必须全部得到正常 Pong",
    );

    ping(a, { clientTime: GAME_ROOM_MAX_MESSAGES_PER_SECOND });
    assert.equal(
        a.sent.filter(([type]) => type === S2C.Pong).length,
        GAME_ROOM_MAX_MESSAGES_PER_SECOND,
        "超预算的 Ping 不得伪装成 Pong",
    );
    assert.equal(
        a.sent.filter(([type, payload]) => type === S2C.Error
            && (payload as { code?: number }).code === ErrorCode.BadRequest).length,
        1,
        "超预算只返回一个可识别的受控 BadRequest",
    );

    // A separate session has its own bucket and remains able to receive Pong.
    ping(b, { clientTime: 7 });
    assert.equal(b.sent.filter(([type]) => type === S2C.Pong).length, 1);
    assert.equal(
        b.sent.filter(([type, payload]) => type === S2C.Error
            && (payload as { code?: number }).code === ErrorCode.BadRequest).length,
        0,
        "A 超预算不能消耗 B 的消息预算",
    );

    // The same client gets a fresh allowance in the next one-second window.
    now = 1_000;
    ping(a, { clientTime: 1_001 });
    assert.equal(
        a.sent.filter(([type]) => type === S2C.Pong).length,
        GAME_ROOM_MAX_MESSAGES_PER_SECOND + 1,
        "新时间窗应恢复该客户端的正常 Pong 配额",
    );
});
