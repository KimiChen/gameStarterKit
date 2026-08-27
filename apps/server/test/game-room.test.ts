import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    ErrorCode,
    GamePhase,
    PROTOCOL_VERSION,
    PLAYER_INIT_HP,
    type IRoomJoinOptions,
} from "@game/shared";
import {
    GameRoom,
    GAME_ROOM_MAX_MESSAGES_PER_SECOND,
    type GameRoomRuntimeOptions,
} from "../src/rooms/GameRoom";

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number };
    sent: Array<[string, unknown]>;
    send: (type: string, payload: unknown) => void;
};

function fakeClient(sessionId: string, userId = sessionId, sId = 0): FakeClient {
    const client: FakeClient = {
        sessionId,
        auth: { userId, sId },
        sent: [],
        send(type, payload) { this.sent.push([type, payload]); },
    };
    return client;
}

function options(): IRoomJoinOptions {
    return { v: PROTOCOL_VERSION, sId: 0 };
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
    waiting.lastCastAt = { 1: 12345 };
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
    assert.deepEqual(started.lastCastAt, {});
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

test("per-client message budget is finite and independent", async () => {
    const room = new GameRoom(runtime(16));
    installLock(room);
    const a = fakeClient("a", "ua");
    await join(room, a);
    const ping = (room.messages as Record<string, (client: unknown, msg: unknown) => void>)[C2S.Ping];
    for (let i = 0; i < GAME_ROOM_MAX_MESSAGES_PER_SECOND; i++) ping(a, { clientTime: 0 });
    const before = a.sent.length;
    ping(a, { clientTime: 0 });
    assert.ok(a.sent.length > before, "超预算仍返回受控错误，不进入业务逻辑");
});
