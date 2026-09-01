import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import {
    C2S,
    ErrorCode,
    GamePhase,
    GAME_ROOM_PROTOCOL_VERSION,
    S2C,
} from "@game/shared";
import {
    BALL_MOVE_GAME_MODE_ID,
    IDLE_GAME_MODE_ID,
    gameModeRegistry,
} from "../src/rooms/GameMode";
import {
    GameRoom,
    MODE_PLAYER_FACTORY_REASON,
    MODE_PLAYER_REGISTER_REASON,
} from "../src/rooms/GameRoom";
import {
    createBallMoveGameMode,
    registerBallMoveGameMode,
} from "../src/rooms/modes/ballMove/index";
import {
    IDLE_DEFAULT_PULSE_GOAL,
    IDLE_MAX_PULSE_GOAL,
    createIdleGameMode,
    registerIdleGameMode,
} from "../src/rooms/modes/IdleGameMode";
import {
    GameRoomState,
    IdlePlayerState,
    IdleRoomState,
    PlayerState,
    createRoomStateForMode,
} from "../src/rooms/schema/GameRoomState";

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string };
    sent: Array<[string, unknown]>;
    send(type: string, payload: unknown): void;
};

function client(sessionId: string, mode: string = IDLE_GAME_MODE_ID): FakeClient {
    return {
        sessionId,
        auth: { userId: `u-${sessionId}`, sId: 0, mode },
        sent: [],
        send(type, payload) { this.sent.push([type, payload]); },
    };
}

function idleState(room: GameRoom): IdleRoomState {
    assert.ok(room.state instanceof IdleRoomState);
    return room.state as unknown as IdleRoomState;
}

function installLock(room: GameRoom): void {
    (room as unknown as { lock: () => Promise<void> }).lock = async () => undefined;
}

async function join(room: GameRoom, joined: FakeClient): Promise<void> {
    await room.onJoin(joined as never, {
        v: GAME_ROOM_PROTOCOL_VERSION,
        sId: 0,
        mode: joined.auth.mode,
    });
}

function handler(room: GameRoom, type: string): (sender: FakeClient, payload: unknown) => void {
    // 阶段 2b：统一走 catch-all 单入口（具名 handler 已全部删除）。
    const catchAll = (room.messages as unknown as {
        _: (sender: FakeClient, type: string, payload: unknown) => void;
    })._;
    return (sender, payload) => catchAll.call(room.messages, sender, type, payload);
}

function errorCodes(sender: FakeClient): number[] {
    return sender.sent
        .filter(([type]) => type === S2C.Error)
        .map(([, payload]) => (payload as { code: number }).code);
}

async function startedIdleRoom(goal = IDLE_DEFAULT_PULSE_GOAL): Promise<{
    room: GameRoom;
    state: IdleRoomState;
    first: FakeClient;
    second: FakeClient;
}> {
    const room = new GameRoom({
        seed: 701,
        matchId: () => "m_idle_test",
        mode: createIdleGameMode({ pulseGoal: goal }),
        evidenceEmitter: async () => {
            throw new Error("idle must not emit ballMove evidence");
        },
    });
    installLock(room);
    const first = client("idle-a");
    const second = client("idle-b");
    await join(room, first);
    await join(room, second);
    return { room, state: idleState(room), first, second };
}

test("Idle root：onCreate 只按生成映射选择一次，之后禁止替换", () => {
    const registeredHere = !gameModeRegistry.has(IDLE_GAME_MODE_ID);
    const unregister = registeredHere ? registerIdleGameMode() : () => undefined;
    // ballMove 登记同样只在组合根/显式调用；本用例的 ballRoom.onCreate 需要它。
    const ballRegisteredHere = !gameModeRegistry.has(BALL_MOVE_GAME_MODE_ID);
    const unregisterBall = ballRegisteredHere ? registerBallMoveGameMode() : () => undefined;
    try {
        const beforeCreate = new GameRoom({ seed: 699 });
        assert.equal(
            (beforeCreate as unknown as { state?: unknown }).state,
            undefined,
            "mode 选择前不得把临时 ballMove root 安装进 serializer",
        );
        assert.throws(
            () => beforeCreate.setState(createRoomStateForMode(IDLE_GAME_MODE_ID) as unknown as GameRoomState),
            /禁止外部替换/,
        );
        assert.equal((beforeCreate as unknown as { state?: unknown }).state, undefined);

        const room = new GameRoom({ seed: 700 });
        (room as unknown as { setSimulationInterval(callback: () => void, delay: number): void })
            .setSimulationInterval = () => undefined;
        void room.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: IDLE_GAME_MODE_ID });

        const selected = idleState(room);
        assert.equal(selected.pulseGoal, IDLE_DEFAULT_PULSE_GOAL);
        assert.equal(selected.phase, GamePhase.Waiting);
        assert.throws(
            () => room.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: IDLE_GAME_MODE_ID }),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        );
        assert.throws(
            () => room.setState(createRoomStateForMode(BALL_MOVE_GAME_MODE_ID)),
            /禁止外部替换/,
        );
        assert.throws(
            () => {
                (room as unknown as { state: GameRoomState }).state =
                    createRoomStateForMode(BALL_MOVE_GAME_MODE_ID);
            },
            /禁止外部替换/,
        );
        assert.strictEqual(room.state, selected);

        const ballRoom = new GameRoom({ seed: 702 });
        (ballRoom as unknown as { setSimulationInterval(callback: () => void, delay: number): void })
            .setSimulationInterval = () => undefined;
        void ballRoom.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID });
        assert.ok(ballRoom.state instanceof GameRoomState);
        assert.equal(ballRoom.state instanceof IdleRoomState, false);
    } finally {
        unregister();
        unregisterBall();
    }
});

test("Idle 开局：精确 player/root 字段，生产 goal=3 且拒绝非 Schema/篡改身份 player", async () => {
    const { room, state, first, second } = await startedIdleRoom();
    assert.equal(state.phase, GamePhase.Playing);
    assert.equal(state.matchId, "m_idle_test");
    assert.equal(state.pulseGoal, 3);
    assert.equal(state.winnerId, "");
    assert.equal(state.players.size, 2);
    for (const joined of [first, second]) {
        const player = state.players.get(joined.sessionId);
        assert.ok(player instanceof IdlePlayerState);
        assert.deepEqual({ id: player.id, pulses: player.pulses }, { id: joined.sessionId, pulses: 0 });
        assert.equal("hp" in player, false);
        assert.equal("alive" in player, false);
        assert.equal("x" in player, false);
    }
    await room.onDispose();

    const injected = await startedIdleRoom(2);
    assert.equal(injected.state.pulseGoal, 2);
    await injected.room.onDispose();

    for (const invalid of [0, IDLE_MAX_PULSE_GOAL + 1, 1.5]) {
        const fallback = await startedIdleRoom(invalid);
        assert.equal(fallback.state.pulseGoal, IDLE_DEFAULT_PULSE_GOAL);
        await fallback.room.onDispose();
    }

    const plainPlayerRoom = new GameRoom({
        seed: 706,
        mode: {
            ...createIdleGameMode(),
            createPlayer: ({ sessionId, name }) => ({ id: sessionId, name, pulses: 0 }) as never,
        },
    });
    await assert.rejects(
        join(plainPlayerRoom, client("plain-player")),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
    );
    assert.equal(idleState(plainPlayerRoom).players.size, 0);
    await plainPlayerRoom.onDispose();

    for (const tamper of ["id", "name"] as const) {
        const tamperedIdentityRoom = new GameRoom({
            seed: tamper === "id" ? 707 : 708,
            mode: {
                ...createIdleGameMode(),
                createPlayer: ({ sessionId, name }) => {
                    const player = new IdlePlayerState();
                    player.id = tamper === "id" ? `${sessionId}-tampered` : sessionId;
                    player.name = tamper === "name" ? `${name}-tampered` : name;
                    return player;
                },
            },
        });
        await assert.rejects(
            join(tamperedIdentityRoom, client(`tampered-${tamper}`)),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        );
        assert.equal(idleState(tamperedIdentityRoom).players.size, 0);
        await tamperedIdentityRoom.onDispose();
    }
});

test("player factory 守卫与 schema 注册兜底必须给出可区分的入座诊断", async () => {
    const logs: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { logs.push(args); };
    const reasonOf = (): string[] => logs
        .map(([message]) => typeof message === "string" ? message : "")
        .filter((message) => message.includes("player admission failed"))
        .map((message) => message.slice(message.indexOf("reason=") + "reason=".length));

    try {
        // 本仓守卫：mode 交回的根本不是 Schema。
        const plainRoom = new GameRoom({
            seed: 709,
            mode: {
                ...createIdleGameMode(),
                createPlayer: ({ sessionId, name }) => ({ id: sessionId, name, pulses: 0 }) as never,
            },
        });
        await assert.rejects(
            join(plainRoom, client("diag-plain")),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        );
        assert.equal(idleState(plainRoom).players.size, 0);
        await plainRoom.onDispose();
        assert.deepEqual(reasonOf(), [MODE_PLAYER_FACTORY_REASON]);

        logs.length = 0;
        // 库内兜底：是 Schema、身份也没被篡改，但不是本 root 声明的 childType。
        const wrongSchemaRoom = new GameRoom({
            seed: 710,
            mode: {
                ...createIdleGameMode(),
                createPlayer: ({ sessionId, name }) => {
                    const foreign = new PlayerState();
                    foreign.id = sessionId;
                    foreign.name = name;
                    return foreign as never;
                },
            },
        });
        await assert.rejects(
            join(wrongSchemaRoom, client("diag-foreign")),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        );
        assert.equal(idleState(wrongSchemaRoom).players.size, 0);
        await wrongSchemaRoom.onDispose();
        assert.deepEqual(
            reasonOf(),
            [MODE_PLAYER_REGISTER_REASON],
            "非本 root childType 的 Schema 必须由 MapSchema.set 兜底，且原因码与 factory 守卫可区分",
        );
        assert.notEqual(MODE_PLAYER_FACTORY_REASON, MODE_PLAYER_REGISTER_REASON);
    } finally {
        console.error = originalError;
    }
});

test("IdlePulse：strict {}、只累加发送者，达目标同步结算且不产 evidence", async () => {
    let evidenceEmissions = 0;
    const room = new GameRoom({
        seed: 703,
        mode: createIdleGameMode({ pulseGoal: 2 }),
        evidenceEmitter: async () => { evidenceEmissions++; return { ok: true as const, entryId: "0-0" }; },
    });
    installLock(room);
    const first = client("pulse-a");
    const second = client("pulse-b");
    await join(room, first);
    await join(room, second);
    const state = idleState(room);
    const pulse = handler(room, C2S.IdlePulse);

    pulse(first, { extra: true });
    assert.equal(state.players.get(first.sessionId)?.pulses, 0);
    assert.deepEqual(errorCodes(first), [ErrorCode.BadRequest]);

    pulse(first, {});
    pulse(second, {});
    assert.equal(state.players.get(first.sessionId)?.pulses, 1);
    assert.equal(state.players.get(second.sessionId)?.pulses, 1);
    assert.equal(state.phase, GamePhase.Playing);

    pulse(first, {});
    assert.equal(state.players.get(first.sessionId)?.pulses, 2);
    assert.equal(state.winnerId, first.sessionId);
    assert.equal(state.phase, GamePhase.Settle);
    assert.equal(evidenceEmissions, 0);

    pulse(first, {});
    assert.equal(state.players.get(first.sessionId)?.pulses, 2);
    assert.deepEqual(errorCodes(first), [ErrorCode.BadRequest, ErrorCode.BadRequest]);
    await room.onDispose();
});

test("玩法消息 fail-closed：Idle 拒 Move/Cast，ballMove 拒 IdlePulse", async () => {
    const { room, state, first } = await startedIdleRoom();
    const before = state.players.get(first.sessionId)?.pulses;
    handler(room, C2S.Move)(first, { dirX: 1, dirY: 0 });
    handler(room, C2S.CastSkill)(first, { skillId: 1 });
    assert.equal(state.players.get(first.sessionId)?.pulses, before);
    assert.deepEqual(errorCodes(first), [ErrorCode.BadRequest, ErrorCode.BadRequest]);
    await room.onDispose();

    const ballRoom = new GameRoom({ seed: 704, mode: createBallMoveGameMode() });
    installLock(ballRoom);
    const ballA = client("ball-a", BALL_MOVE_GAME_MODE_ID);
    const ballB = client("ball-b", BALL_MOVE_GAME_MODE_ID);
    await join(ballRoom, ballA);
    await join(ballRoom, ballB);
    const tick = ballRoom.state.tick;
    handler(ballRoom, C2S.IdlePulse)(ballA, {});
    assert.equal(ballRoom.state.tick, tick);
    assert.deepEqual(errorCodes(ballA), [ErrorCode.BadRequest]);
    await ballRoom.onDispose();
});

test("Idle leave：Waiting 正常清理，Playing 对手胜，开局后拒绝晚加入", async () => {
    const waiting = new GameRoom({ seed: 705, mode: createIdleGameMode() });
    const waitingClient = client("waiting-a");
    await join(waiting, waitingClient);
    await waiting.onLeave(waitingClient as never, CloseCode.CONSENTED);
    assert.equal(idleState(waiting).phase, GamePhase.Waiting);
    assert.equal(idleState(waiting).players.size, 0);
    assert.equal(idleState(waiting).winnerId, "");
    await waiting.onDispose();

    const { room, state, first, second } = await startedIdleRoom();
    await assert.rejects(
        join(room, client("late")),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.GameAlreadyStarted)),
    );
    await room.onLeave(second as never, CloseCode.CONSENTED);
    assert.equal(state.phase, GamePhase.Settle);
    assert.equal(state.winnerId, first.sessionId);
    assert.deepEqual([...state.players.keys()], [first.sessionId]);
    await room.onDispose();
});

test("Idle 重连成功：保留座位与 pulses，不触发离场胜负", async () => {
    const { room, state, first, second } = await startedIdleRoom();
    handler(room, C2S.IdlePulse)(second, {});
    (room as unknown as {
        allowReconnection(client: unknown, seconds: number): Promise<unknown>;
    }).allowReconnection = async () => second;

    await room.onLeave(second as never, CloseCode.ABNORMAL_CLOSURE);
    assert.equal(state.phase, GamePhase.Playing);
    assert.equal(state.winnerId, "");
    assert.equal(state.players.size, 2);
    assert.equal(state.players.get(second.sessionId)?.pulses, 1);
    assert.equal(state.players.get(first.sessionId)?.pulses, 0);
    await room.onDispose();
});

test("Idle fixed step：只推进公共 tick，GameRoom 已无 ballMove 注入 API", async () => {
    const { room, state, first } = await startedIdleRoom();
    const player = state.players.get(first.sessionId)!;
    // 阶段 1：注入/回放 harness 下沉到 ballMove mode，通用房间不再实现 ballMove 输入形状。
    // 编译期该 API 已不存在；这里再做运行期断言，防 any 化回潜。
    assert.equal("injectInput" in room, false, "GameRoom 不得再暴露 injectInput");
    assert.equal("setInputSource" in room, false);
    assert.equal("getAcceptedInputs" in room, false);
    // 未绑定到本房的 ballMove mode 句柄同样拒绝注入（idle 房无从接受 ballMove 输入）。
    const strayBallMove = createBallMoveGameMode();
    assert.equal(
        strayBallMove.injectInput({ type: "move", sessionId: first.sessionId, dirX: 1, dirY: 0 }),
        false,
    );
    (room as unknown as { stepFixed(): void }).stepFixed();
    assert.equal(state.tick, 1);
    assert.equal(player.pulses, 0);
    assert.equal("dirX" in player, false);
    assert.deepEqual(strayBallMove.getAcceptedInputs(), []);
    await room.onDispose();
});
