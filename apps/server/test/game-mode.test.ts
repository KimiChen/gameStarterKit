import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join as joinPath } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import {
    C2S,
    ErrorCode,
    GAME_WIRE_OWNERS,
    GAME_WIRE_PHASES,
    GAMEPLAY_CATALOG,
    GamePhase,
    GameplayModeId,
    MAX_PLAYERS,
    GAME_ROOM_PROTOCOL_VERSION,
    ROOM_STATE_VALIDATORS,
    S2C,
    type C2SType,
    type GamePhaseType,
} from "@game/shared";
import {
    BALL_MOVE_GAME_MODE_ID,
    GameModeRegistry,
    IDLE_GAME_MODE_ID,
    gameModeRegistry,
    type GameMode,
} from "../src/rooms/GameMode";
import { GameRoom, type GameRoomRuntimeOptions } from "../src/rooms/GameRoom";
import { registerDefaultGameModes } from "../src/rooms/modes/catalog";
import { createBallMoveGameMode, registerBallMoveGameMode } from "../src/rooms/modes/ballMove/index";
import { createIdleGameMode, registerIdleGameMode } from "../src/rooms/modes/IdleGameMode";
import {
    GameRoomState,
    IdlePlayerState,
    IdleRoomState,
    ROOM_STATE_ROOT_CONSTRUCTORS,
} from "../src/rooms/schema/GameRoomState";

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string };
    send: () => void;
};

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

function client(sessionId: string, mode: string = IDLE_GAME_MODE_ID): FakeClient {
    return { sessionId, auth: { userId: `u-${sessionId}`, sId: 0, mode }, send() {} };
}

function installLock(room: GameRoom): void {
    (room as unknown as { lock: () => Promise<void> }).lock = async () => undefined;
}

async function join(room: GameRoom, item: FakeClient): Promise<void> {
    await room.onJoin(item as never, { v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: item.auth.mode });
}

/** 消息驱动统一走 catch-all（阶段 2b 后 `messages` 只有 `"_"` 一个键）。 */
function dispatch(room: GameRoom, type: string, sender: unknown, payload: unknown): void {
    (room.messages as unknown as { _: (c: unknown, t: string, p: unknown) => void })._(sender, type, payload);
}

test("GameModeRegistry：第二个 mode 可独立登记、创建和撤销", () => {
    const registry = new GameModeRegistry<GameRoomState>();
    const unregister = registry.register(IDLE_GAME_MODE_ID, createIdleGameMode);
    assert.deepEqual(registry.list(), ["idle"]);
    assert.equal(registry.create("idle").id, "idle");
    assert.throws(() => registry.register(IDLE_GAME_MODE_ID, createIdleGameMode), /已登记/);
    unregister();
    assert.equal(registry.has("idle"), false);
    // ballMove 经同一 registry 路径登记后必须携带自己的 evidence capability
    //（阶段 1 起证据契约不再是 mode 的 ruleset 字段，而是可选能力对象）。
    const offBall = registry.register(BALL_MOVE_GAME_MODE_ID, createBallMoveGameMode);
    const ball = registry.create(BALL_MOVE_GAME_MODE_ID);
    assert.equal(typeof ball.evidence?.assertRosterCompatible, "function");
    assert.equal(typeof ball.evidence?.captureInitialState, "function");
    assert.equal(typeof ball.evidence?.build, "function");
    offBall();
    assert.equal(registry.has(BALL_MOVE_GAME_MODE_ID), false);
});

test("GameModeRegistry：同 factory replace 后旧 disposer 不删除新 registration", () => {
    const registry = new GameModeRegistry<GameRoomState>();
    const factory = createIdleGameMode;
    const oldOff = registry.register(IDLE_GAME_MODE_ID, factory);
    const newOff = registry.register(IDLE_GAME_MODE_ID, factory, { replace: true });
    oldOff();
    assert.equal(registry.create(IDLE_GAME_MODE_ID).id, IDLE_GAME_MODE_ID);
    newOff();
    assert.equal(registry.has(IDLE_GAME_MODE_ID), false);
    assert.throws(() => registry.register(" idle ", factory), /规范/);
});

test("GameModeRegistry：漏配 player factory 时 fail-closed", () => {
    const missingPlayer = new GameModeRegistry<GameRoomState>();
    missingPlayer.register(IDLE_GAME_MODE_ID, () => ({
        id: IDLE_GAME_MODE_ID,
    }) as never);
    assert.throws(() => missingPlayer.create(IDLE_GAME_MODE_ID), /createPlayer/);
});

test("生产 mode catalog 与 shared/state 生成映射保持精确同集", () => {
    const unregister = registerDefaultGameModes();
    try {
        const canonicalModes = [...Object.values(GameplayModeId)].sort();
        assert.deepEqual(gameModeRegistry.list(), canonicalModes);
        assert.deepEqual(Object.keys(GAMEPLAY_CATALOG).sort(), canonicalModes);
        assert.deepEqual(Object.keys(ROOM_STATE_VALIDATORS).sort(), canonicalModes);
        assert.deepEqual(Object.keys(ROOM_STATE_ROOT_CONSTRUCTORS).sort(), canonicalModes);
    } finally {
        unregister();
    }
});

test("GameRoom：onCreate 从生产 registry 选择 idle，未知 mode 和直连错 mode 均拒绝", async () => {
    const unregisterIdle = registerIdleGameMode(gameModeRegistry);
    // ballMove 的登记也在组合根（不再是 import GameMode 的副作用），本用例的
    // defaultRoom 需要生产 registry 认得它。
    const unregisterBall = registerBallMoveGameMode(gameModeRegistry);
    const unregister = () => {
        unregisterIdle();
        unregisterBall();
    };
    const mutableRegistry = gameModeRegistry as unknown as {
        create(id: string): GameMode<GameRoomState>;
    };
    const originalCreate = mutableRegistry.create;
    let unexpectedBallFactories = 0;
    mutableRegistry.create = (id) => {
        if (id === BALL_MOVE_GAME_MODE_ID) {
            unexpectedBallFactories++;
            throw new Error("injected ballMove factory failure");
        }
        return originalCreate.call(gameModeRegistry, id);
    };
    try {
        const idleRoom = new GameRoom({ seed: 7 });
        (idleRoom as unknown as { setSimulationInterval: (callback: () => void, delay: number) => void })
            .setSimulationInterval = () => {};
        idleRoom.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: IDLE_GAME_MODE_ID });
        assert.equal(idleRoom.gameplayModeId, IDLE_GAME_MODE_ID);
        assert.equal(unexpectedBallFactories, 0, "idle 创建不得实例化或依赖 ballMove factory");

        const unknownRoom = new GameRoom({ seed: 8 });
        (unknownRoom as unknown as { setSimulationInterval: (callback: () => void, delay: number) => void })
            .setSimulationInterval = () => {};
        assert.throws(
            () => unknownRoom.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: "missing-mode" }),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        );
        assert.throws(
            () => unknownRoom.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0 } as never),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        );
        assert.throws(
            () => unknownRoom.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION - 1, sId: 0, mode: IDLE_GAME_MODE_ID }),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.ProtocolMismatch)),
        );

        mutableRegistry.create = originalCreate;
        const defaultRoom = new GameRoom({ seed: 9 });
        (defaultRoom as unknown as { setSimulationInterval: (callback: () => void, delay: number) => void })
            .setSimulationInterval = () => {};
        defaultRoom.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID });
        await assert.rejects(
            defaultRoom.onJoin(client("wrong-mode", IDLE_GAME_MODE_ID) as never, {}),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        );
    } finally {
        mutableRegistry.create = originalCreate;
        unregister();
    }
});

test("GameRoom：legacy protocol preflight 先于 v5 mode 必填校验", async () => {
    const assertCode = (code: number) => (error: unknown) =>
        error instanceof Error && error.message.includes(String(code));
    for (const legacy of [{ v: GAME_ROOM_PROTOCOL_VERSION - 1 }, {}]) {
        await assert.rejects(
            GameRoom.onAuth("", legacy as never, undefined as never),
            assertCode(ErrorCode.ProtocolMismatch),
        );
        const room = new GameRoom({ seed: 91 });
        assert.throws(() => room.onCreate(legacy as never), assertCode(ErrorCode.ProtocolMismatch));
    }

    await assert.rejects(
        GameRoom.onAuth("", { v: GAME_ROOM_PROTOCOL_VERSION } as never, undefined as never),
        assertCode(ErrorCode.BadRequest),
    );
    const current = new GameRoom({ seed: 92 });
    assert.throws(
        () => current.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION } as never),
        assertCode(ErrorCode.BadRequest),
    );
});

test("idle mode：保留 GameRoom Ping/Pong transport capability", () => {
    const room = new GameRoom({ seed: 11, clock: () => 25, mode: createIdleGameMode() });
    const sent: Array<[string, unknown]> = [];
    const sender = {
        sessionId: "idle-ping",
        auth: { userId: "u-idle-ping", sId: 0, mode: IDLE_GAME_MODE_ID },
        send(type: string, payload: unknown) { sent.push([type, payload]); },
    };
    dispatch(room, C2S.Ping, sender, { clientTime: 10 });
    assert.deepEqual(sent, [[S2C.Pong, { clientTime: 10, serverTime: 25 }]]);
});

test("GameRoom：transport/admission/tick/finish 均通过可替换 mode 接缝", async () => {
    const events: string[] = [];
    const mode: GameMode<GameRoomState> = {
        ...createBallMoveGameMode(),
        onAdmission: ({ client: joined }) => {
            events.push(`admission:${joined.sessionId}`);
        },
        // commands 键必须属于本玩法的 wire token 集合；覆写 Move 即「mode 消费了该消息」。
        commands: {
            [C2S.Move]: (context) => {
                events.push(`message:${context.client.sessionId}`);
            },
        },
        onMatchStart: () => { events.push("start"); },
        onStep: ({ dtMs }) => events.push(`step:${dtMs}`),
        onLeave: ({ client: leaving }) => { events.push(`leave:${leaving.sessionId}`); },
        onFinish: () => { events.push("finish"); },
        onDispose: () => { events.push("dispose"); },
    };
    const options: GameRoomRuntimeOptions = { seed: 42, fixedStepMs: 50, mode };
    const room = new GameRoom(options);
    installLock(room);
    const first = client("a", BALL_MOVE_GAME_MODE_ID);
    const second = client("b", BALL_MOVE_GAME_MODE_ID);
    await join(room, first);
    const duplicateUser = client("a-duplicate", BALL_MOVE_GAME_MODE_ID);
    duplicateUser.auth.userId = first.auth.userId;
    await assert.rejects(
        join(room, duplicateUser),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.AlreadyInRoom)),
    );
    assert.deepEqual(events, ["admission:a"], "通用重复账号闸必须先于 mode admission hook");
    await join(room, second);
    assert.equal(room.state.phase, GamePhase.Playing);
    assert.deepEqual(events.slice(0, 3), ["admission:a", "admission:b", "start"]);

    // 本段断言的是「mode 消费了消息 → 不落入 ballMove 默认规则」，读的是 ball 专属字段，
    // 所以必须显式收窄到 ballMove root 视图。
    const player = (room.state as unknown as GameRoomState).players.get("a")!;
    const before = { dirX: player.dirX, dirY: player.dirY };
    dispatch(room, C2S.Move, first, { dirX: 1, dirY: 0 });
    assert.deepEqual({ dirX: player.dirX, dirY: player.dirY }, before,
        "mode 消费消息后不应落入 ballMove 默认规则");

    (room as unknown as { stepFixed: () => void }).stepFixed();
    assert.ok(events.includes("step:50"));

    // This is a transport/mode unit test; suppress durable evidence so it does
    // not open a Redis connection when the local integration stack is absent.
    (room as unknown as { participantUserId: Map<string, string> }).participantUserId.clear();
    player.alive = false;
    (room as unknown as { maybeSettle: () => void }).maybeSettle();
    assert.equal(room.state.phase, GamePhase.Settle);
    assert.ok(events.includes("finish"));

    await room.onLeave(second as never, CloseCode.CONSENTED);
    assert.ok(events.includes("leave:b"));
    await room.onDispose();
    await room.onDispose();
    assert.equal(events.filter((event) => event === "finish").length, 1);
    assert.equal(events.filter((event) => event === "dispose").length, 1);
});

test("GameRoom：开局失败会归还本次 mode admission 且迟到 leave 不重复释放", async () => {
    const events: string[] = [];
    const room = new GameRoom({
        seed: 93,
        mode: {
            ...createBallMoveGameMode(),
            onAdmission: ({ client: admitted }) => { events.push(`admit:${admitted.sessionId}`); },
            onLeave: ({ client: leaving }) => { events.push(`leave:${leaving.sessionId}`); },
        },
    });
    (room as unknown as { lock: () => Promise<void> }).lock = async () => {
        throw new Error("injected lock failure");
    };
    const first = client("rollback-a", BALL_MOVE_GAME_MODE_ID);
    const second = client("rollback-b", BALL_MOVE_GAME_MODE_ID);
    await join(room, first);
    await assert.rejects(join(room, second));
    assert.deepEqual(events, ["admit:rollback-a", "admit:rollback-b", "leave:rollback-b"]);
    assert.equal(room.state.players.has(second.sessionId), false);

    await room.onLeave(second as never, CloseCode.CONSENTED);
    assert.equal(events.filter((event) => event === "leave:rollback-b").length, 1);
    await room.onDispose();
});

test("GameRoom：可等待 mode hook 失败被观察，dispose 合流并继续公共清理", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    let leaveCalls = 0;
    let disposeCalls = 0;
    const matchEvents: string[] = [];
    try {
        const room = new GameRoom({
            seed: 94,
            mode: {
                ...createBallMoveGameMode(),
                async onMatchInitialize() {
                    matchEvents.push("initialize:start");
                    await Promise.resolve();
                    matchEvents.push("initialize:done");
                },
                async onMatchStart() {
                    matchEvents.push("start");
                    await Promise.resolve();
                    throw new Error("injected async start failure");
                },
                async onMatchRollback() {
                    await Promise.resolve();
                    matchEvents.push("rollback");
                    throw new Error("injected async rollback failure");
                },
                async onLeave() {
                    leaveCalls++;
                    await Promise.resolve();
                    throw new Error("injected async leave failure");
                },
                async onDispose() {
                    disposeCalls++;
                    await Promise.resolve();
                    throw new Error("injected async dispose failure");
                },
            },
        });
        installLock(room);
        await join(room, client("async-a", BALL_MOVE_GAME_MODE_ID));
        await assert.rejects(join(room, client("async-b", BALL_MOVE_GAME_MODE_ID)));
        assert.deepEqual(matchEvents, ["initialize:start", "initialize:done", "start", "rollback"]);
        assert.equal(leaveCalls, 1, "start rollback 必须等待并观察 async leave");

        const firstDispose = room.onDispose();
        const secondDispose = room.onDispose();
        assert.strictEqual(firstDispose, secondDispose);
        await firstDispose;
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(disposeCalls, 1);
        assert.equal((room as unknown as { sessionUserId: Map<string, string> }).sessionUserId.size, 0);
        assert.equal((room as unknown as { modeAdmissions: Set<string> }).modeAdmissions.size, 0);
        assert.deepEqual(unhandled, []);
    } finally {
        process.off("unhandledRejection", onUnhandled);
    }
});

test("GameRoom：每个可等待开局 hook 后重验 roster/generation，不发布单人或已销毁对局", async () => {
    const exerciseLeave = async (blockedHook: "initialize" | "start") => {
        const entered = deferred();
        const release = deferred();
        let startCalls = 0;
        const room = new GameRoom({
            seed: blockedHook === "initialize" ? 941 : 942,
            mode: {
                ...createIdleGameMode(),
                async onMatchInitialize() {
                    if (blockedHook !== "initialize") return;
                    entered.resolve();
                    await release.promise;
                },
                async onMatchStart() {
                    startCalls++;
                    if (blockedHook !== "start") return;
                    entered.resolve();
                    await release.promise;
                },
            },
        });
        installLock(room);
        const first = client(`${blockedHook}-leave-a`);
        const second = client(`${blockedHook}-leave-b`);
        await join(room, first);
        const rejectedJoin = assert.rejects(join(room, second));
        await entered.promise;
        await room.onLeave(first as never, CloseCode.CONSENTED);
        release.resolve();
        await rejectedJoin;
        assert.equal(room.state.phase, GamePhase.Waiting);
        assert.equal(room.state.players.size, 0, "失败 join 与 Waiting leave 必须都完成清理");
        assert.equal(startCalls, blockedHook === "start" ? 1 : 0,
            "initialize 后 roster 已变时不得继续调用 start hook");
        await room.onDispose();
    };

    await exerciseLeave("initialize");
    await exerciseLeave("start");

    const entered = deferred();
    const release = deferred();
    let startCallsAfterDispose = 0;
    const disposedRoom = new GameRoom({
        seed: 943,
        mode: {
            ...createIdleGameMode(),
            async onMatchInitialize() {
                entered.resolve();
                await release.promise;
            },
            onMatchStart() { startCallsAfterDispose++; },
        },
    });
    installLock(disposedRoom);
    await join(disposedRoom, client("dispose-start-a"));
    const rejectedJoin = assert.rejects(join(disposedRoom, client("dispose-start-b")));
    await entered.promise;
    const disposal = disposedRoom.onDispose();
    release.resolve();
    await Promise.all([disposal, rejectedJoin]);
    assert.equal(startCallsAfterDispose, 0, "dispose 后不得继续进入后续 start hook");
    assert.notEqual(disposedRoom.state.phase, GamePhase.Playing);
});

test("GameRoom：dispose 等待进行中的 initialize/start/rollback hook 后再做最终清理", async () => {
    const exercise = async (blockedHook: "initialize" | "start" | "rollback") => {
        const entered = deferred();
        const release = deferred();
        const events: string[] = [];
        const room = new GameRoom({
            seed: blockedHook === "initialize" ? 944 : blockedHook === "start" ? 945 : 946,
            mode: {
                ...createIdleGameMode(),
                async onMatchInitialize() {
                    events.push("initialize:start");
                    if (blockedHook === "initialize") {
                        entered.resolve();
                        await release.promise;
                    }
                    events.push("initialize:done");
                },
                async onMatchStart() {
                    events.push("start:start");
                    if (blockedHook === "start") {
                        entered.resolve();
                        await release.promise;
                        events.push("start:done");
                        return;
                    }
                    if (blockedHook === "rollback") throw new Error("injected start failure");
                    events.push("start:done");
                },
                async onMatchRollback() {
                    events.push("rollback:start");
                    if (blockedHook === "rollback") {
                        entered.resolve();
                        await release.promise;
                    }
                    events.push("rollback:done");
                },
                onDispose() { events.push("dispose"); },
            },
        });
        installLock(room);
        const state = room.state as unknown as IdleRoomState;
        for (const sessionId of [`${blockedHook}-a`, `${blockedHook}-b`]) {
            const player = new IdlePlayerState();
            player.id = sessionId;
            player.name = sessionId;
            state.players.set(sessionId, player);
        }
        const internals = room as unknown as {
            messageBudget: Map<string, { windowStart: number; count: number }>;
        };
        internals.messageBudget.set("dispose-order-probe", { windowStart: 0, count: 1 });

        const rejectedStart = assert.rejects(room.startMatch());
        await entered.promise;
        let disposalSettled = false;
        const disposal = room.onDispose().then(() => { disposalSettled = true; });
        await Promise.resolve();
        assert.equal(disposalSettled, false, `dispose 不得越过 ${blockedHook} hook`);
        assert.equal(events.includes("dispose"), false);

        release.resolve();
        await Promise.all([rejectedStart, disposal]);
        assert.equal(events.at(-1), "dispose");
        const completed = blockedHook === "initialize"
            ? "initialize:done"
            : blockedHook === "start"
                ? "start:done"
                : "rollback:done";
        assert.ok(events.indexOf(completed) < events.indexOf("dispose"));
        assert.equal(internals.messageBudget.size, 0, "最终公共清理必须在 hook 完成后执行");
    };

    await exercise("initialize");
    await exercise("start");
    await exercise("rollback");
});

test("GameRoom：开局致命 disconnect 不与等待中的 dispose 自锁", { timeout: 2_000 }, async () => {
    const events: string[] = [];
    let locked = false;
    const room = new GameRoom({
        seed: 947,
        mode: {
            ...createIdleGameMode(),
            onMatchStart() {
                events.push("start");
                throw new Error("injected start failure");
            },
            onMatchRollback() { events.push("rollback"); },
            onDispose() { events.push("dispose"); },
        },
    });
    Object.defineProperty(room, "locked", { configurable: true, get: () => locked });
    (room as unknown as { lock(): Promise<void> }).lock = async () => {
        locked = true;
        events.push("lock");
    };
    (room as unknown as { unlock(): Promise<void> }).unlock = async () => {
        events.push("unlock");
        throw new Error("injected unlock failure");
    };
    let disposal: Promise<void> | undefined;
    (room as unknown as { disconnect(code?: number): Promise<unknown> }).disconnect = () => {
        events.push("disconnect");
        disposal = room.onDispose();
        return disposal;
    };

    const state = room.state as unknown as IdleRoomState;
    for (const sessionId of ["disconnect-a", "disconnect-b"]) {
        const player = new IdlePlayerState();
        player.id = sessionId;
        player.name = sessionId;
        state.players.set(sessionId, player);
    }

    await assert.rejects(room.startMatch(), /injected start failure/);
    assert.ok(disposal, "unlock 失败必须触发 room disconnect");
    await disposal;
    assert.deepEqual(events, ["lock", "start", "rollback", "unlock", "disconnect", "dispose"]);
});

test("GameRoom：同步热路径返回 thenable 时显式观察 rejection 并 fail-closed", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
        const mode = {
            ...createIdleGameMode(),
            // 玩法输入的异步 command 是不支持的热路径形态：必须被观察并按错误消费。
            commands: { [C2S.IdlePulse]: (() => Promise.reject(new Error("async command"))) as never },
            onStep: (() => Promise.reject(new Error("async step"))) as never,
            onFinish: (() => Promise.reject(new Error("async finish"))) as never,
        };
        const room = new GameRoom({ seed: 95, clock: () => 10, mode });
        const sent: Array<[string, unknown]> = [];
        const sender = {
            sessionId: "thenable",
            auth: { userId: "u-thenable", sId: 0, mode: IDLE_GAME_MODE_ID },
            send(type: string, payload: unknown) { sent.push([type, payload]); },
        };
        room.state.phase = GamePhase.Playing;
        dispatch(room, C2S.IdlePulse, sender, {});
        (room as unknown as { stepFixed: () => void }).stepFixed();
        (room as unknown as { settle: () => void }).settle();
        await new Promise<void>((resolve) => setImmediate(resolve));

        assert.equal(sent.some(([type]) => type === S2C.Error), true, "async command 必须按错误消费");
        assert.deepEqual(unhandled, []);
        await room.onDispose();
    } finally {
        process.off("unhandledRejection", onUnhandled);
    }
});

test("idle mode：generic settle 不写 ballMove casual evidence", async () => {
    let emissions = 0;
    const room = new GameRoom({
        seed: 96,
        mode: createIdleGameMode(),
        evidenceEmitter: async () => { emissions++; return { ok: true as const, entryId: "0-0" }; },
    });
    installLock(room);
    const first = client("idle-evidence-a");
    const second = client("idle-evidence-b");
    await join(room, first);
    await join(room, second);
    assert.equal(room.state.phase, GamePhase.Playing);
    await room.onLeave(second as never, CloseCode.CONSENTED);
    assert.equal(room.state.phase, GamePhase.Settle);
    assert.equal(emissions, 0);
    await room.onDispose();
});

test("GameRoom：未结算直接销毁仍只调用一次 mode dispose", async () => {
    let disposes = 0;
    const room = new GameRoom({
        seed: 10,
        mode: { ...createIdleGameMode(), onDispose: () => { disposes++; } },
    });
    const first = room.onDispose();
    const second = room.onDispose();
    assert.strictEqual(first, second, "重复 dispose 必须合流到同一可等待 Promise");
    await first;
    assert.equal(disposes, 1);
});

// ── roster 声明化（plan-v4 条目 4 阶段一）────────────────────────────────────
//
// 「几个人算满 / 几个人能开 / 几个人自动开」是玩法事实，此前以字面量散在通用 shell 的五处。
// 下面的用例钉两件事：① 建 mode 实例时对非法 roster fail-closed；② shell 真的按声明分发，
// 而不是恰好与旧字面量相等——所以构造的 mode 必须用**与旧字面量不同**的值。

/** 现有用例的既定做法：不 stub 掉真实 simulation interval，node --test 会被存活定时器挂住。 */
function stubSimulation(room: GameRoom): void {
    (room as unknown as { setSimulationInterval: (callback: () => void, delay: number) => void })
        .setSimulationInterval = () => {};
}

test("GameModeRegistry：非法 roster 必须在建实例时抛（非 register 时），⛔ 不留到运行期兜底", () => {
    const registry = new GameModeRegistry<GameRoomState>();
    // 探针 id 不是 ballMove：commands 键属于 ballMove 的 wire token 集合，必须一并摘掉。
    const { evidence: _unusedEvidence, commands: _unusedCommands, ...ballMove } = createBallMoveGameMode();
    const withRoster = (roster: unknown) => {
        const id = `roster-probe`;
        registry.register(id, () => ({ ...ballMove, id, roster } as never), { replace: true });
        return () => registry.create(id);
    };
    assert.throws(withRoster(undefined), /必须声明 roster\{min,max,autoStart\}/);
    assert.throws(withRoster({ min: 2, max: 4 }), /roster\.autoStart 必须是 ≥1 的整数/);
    assert.throws(withRoster({ min: 0, max: 4, autoStart: 2 }), /roster\.min 必须是 ≥1 的整数/);
    assert.throws(withRoster({ min: 2, max: 1.5, autoStart: 2 }), /roster\.max 必须是 ≥1 的整数/);
    // root players map 的容量由生成 validator 按 shared 的 MAX_PLAYERS 烧死，超过它会在 schema 层炸
    assert.throws(withRoster({ min: 2, max: MAX_PLAYERS + 1, autoStart: 2 }), /超过 root players map 的容量/);
    assert.throws(withRoster({ min: 3, max: 2, autoStart: 2 }), /roster\.min=3 大于 roster\.max=2/);
    assert.throws(withRoster({ min: 2, max: 4, autoStart: 1 }), /roster\.autoStart=1 必须落在 \[2, 4\]/);
    assert.throws(withRoster({ min: 2, max: 4, autoStart: 5 }), /roster\.autoStart=5 必须落在 \[2, 4\]/);
    // 合法值必须放行，否则上面全部 throws 可能只是因为 create 本身坏了
    assert.deepEqual(withRoster({ min: 1, max: 3, autoStart: 2 })().roster, { min: 1, max: 3, autoStart: 2 });
});

test("注入式 mode 也必须过同一道 roster 闸——⛔ 注入路径不得成为绕过闸的后门", () => {
    const broken = { ...createBallMoveGameMode(), roster: undefined } as unknown as GameMode<GameRoomState>;
    assert.throws(
        () => new GameRoom({ seed: 1, mode: broken }),
        /必须声明 roster\{min,max,autoStart\}/,
        "注入 mode 不经过 GameModeRegistry.create，必须在构造期补闸",
    );
});

test("shell 的人数闸按 mode.roster 分发：满员/自动开局都随声明变化", async () => {
    // 刻意与旧字面量（max=MAX_PLAYERS=4、autoStart=2）都不同：若 shell 还在读字面量，
    // 下面两条断言至少有一条会失败。
    // ⚠ 必须摘掉 evidence capability：ballMove v1 证据把 initialRoster 冻结成恰好 2 条，
    // 一个 3 人开局的 mode 再声明该证据就是自相矛盾的声明（下面单独有用例钉这条）。
    const { evidence: _unusedEvidence, ...ballMove } = createBallMoveGameMode();
    const mode: GameMode<GameRoomState> = {
        ...ballMove,
        roster: { min: 3, max: 3, autoStart: 3 },
    };
    const room = new GameRoom({ seed: 42, fixedStepMs: 50, mode });
    stubSimulation(room);
    installLock(room);
    room.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID });
    assert.equal(room.maxClients, 3, "onCreate 必须把 maxClients 赋成 mode.roster.max（撮合侧读的就是它）");

    await join(room, client("a", BALL_MOVE_GAME_MODE_ID));
    await join(room, client("b", BALL_MOVE_GAME_MODE_ID));
    assert.equal(room.state.phase, GamePhase.Waiting, "autoStart=3 时两人不得开局（旧字面量是 2）");

    await join(room, client("c", BALL_MOVE_GAME_MODE_ID));
    assert.equal(room.state.phase, GamePhase.Playing, "满 3 人必须自动开局");

    await assert.rejects(
        join(room, client("d", BALL_MOVE_GAME_MODE_ID)),
        (error: unknown) => error instanceof Error
            && error.message.includes(String(ErrorCode.GameAlreadyStarted)),
    );
    await room.onDispose();
});

test("shell 的开局下限按 mode.roster.min：低于它 startMatch 不开局", async () => {
    const { evidence: _unusedEvidence, ...ballMove } = createBallMoveGameMode();
    const mode: GameMode<GameRoomState> = {
        ...ballMove,
        // autoStart 抬到 4 使自动开局不会抢跑，min=3 才是本例要钉的那条闸
        roster: { min: 3, max: 4, autoStart: 4 },
    };
    const room = new GameRoom({ seed: 42, fixedStepMs: 50, mode });
    stubSimulation(room);
    installLock(room);
    room.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID });
    await join(room, client("a", BALL_MOVE_GAME_MODE_ID));
    await join(room, client("b", BALL_MOVE_GAME_MODE_ID));
    assert.equal(await room.startMatch(), false, "两人未达 min=3，⛔ 不得开局（旧字面量下这里会开）");
    assert.equal(room.state.phase, GamePhase.Waiting);

    await join(room, client("c", BALL_MOVE_GAME_MODE_ID));
    assert.equal(room.state.phase, GamePhase.Waiting, "autoStart=4 未达成，自动开局不得抢跑");
    assert.equal(await room.startMatch(), true, "达到 min=3 后显式 startMatch 必须成功");
    await room.onDispose();
});

test("声明 ballMove v1 证据的 mode，其 roster 必须与冻结的 2 人 initialRoster 自洽", () => {
    // 这条耦合此前无人守：证据侧 copyRoster 用 exactArray(2,2) 冻死，而 shell 直到真开局时
    // 才撞上，表现为给加入者的 1000/Unknown + 回滚。定性成建实例时的自相矛盾声明更准确。
    const registry = new GameModeRegistry<GameRoomState>();
    const id = "ruleset-roster-probe";
    const make = (roster: GameMode<GameRoomState>["roster"]) => {
        registry.register(id, () => {
            // 探针 id 不是 ballMove：commands 属于 ballMove 的 token 集合，摘掉后只留证据耦合。
            const { commands: _unusedCommands, ...ballMove } = createBallMoveGameMode();
            return { ...ballMove, id, roster };
        }, { replace: true });
        return () => registry.create(id);
    };
    assert.throws(
        make({ min: 3, max: 4, autoStart: 3 }),
        /声明了 ballMove v1 证据，其 roster\.min\/autoStart 必须都是 2，实际 min=3 autoStart=3/,
    );
    assert.throws(make({ min: 2, max: 4, autoStart: 3 }), /实际 min=2 autoStart=3/);
    // 生产默认值必须放行，否则上面两条 throws 可能只是因为断言写反了
    assert.equal(make({ min: 2, max: MAX_PLAYERS, autoStart: 2 })().roster.autoStart, 2);
    // ⛔ 不连 max 一起断言：max 是座位上限，与「开局时恰好几人」不是同一件事
    assert.equal(make({ min: 2, max: 2, autoStart: 2 })().roster.max, 2);
});

test("满员闸的上限来自 mode.roster.max——这是防御性闸，用预置座位直接抵达", async () => {
    // ⚠ 正常路径到不了这条闸：min ≤ autoStart ≤ max 成立时，人数一到 autoStart 就开局了，
    // 座位数永远够不到 max。它是 joinById/直连的兜底。所以这里绕过 onJoin 直接预置座位，
    // 让房间停在「Waiting 且已满」这个只有兜底闸能处理的状态。⛔ 不要因为够不到就不测：
    // 兜底闸读错常量，恰恰只会在被绕过的那条路径上出事。
    const { evidence: _unusedEvidence, ...ballMove } = createBallMoveGameMode();
    const mode: GameMode<GameRoomState> = { ...ballMove, roster: { min: 2, max: 2, autoStart: 2 } };
    const room = new GameRoom({ seed: 42, fixedStepMs: 50, mode });
    stubSimulation(room);
    installLock(room);
    room.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID });
    for (const sessionId of ["seat-a", "seat-b"]) {
        room.state.players.set(sessionId, mode.createPlayer({ sessionId, name: sessionId, randomInt: () => 0 }));
    }
    assert.equal(room.state.phase, GamePhase.Waiting, "预置座位不触发开局，房间必须仍在 Waiting");
    await assert.rejects(
        join(room, client("late", BALL_MOVE_GAME_MODE_ID)),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.RoomFull)),
        "满 roster.max=2 必须 RoomFull——⛔ 若这里读的是 MAX_PLAYERS=4，第 3 个人会被放进来",
    );
    await room.onDispose();
});

test("开局边界重验的人数下限同样来自 mode.roster.min", () => {
    // 这条同样是防御性重验：startMatch 入口已经挡过一次 min，所以正常路径下它不会先触发。
    // 直接调用被验方法是抵达它的唯一诚实方式——用 join 编不出「已过入口闸却人数不足」的状态。
    const { evidence: _unusedEvidence, ...ballMove } = createBallMoveGameMode();
    const boundaryOf = (min: number) => {
        const mode: GameMode<GameRoomState> = { ...ballMove, roster: { min, max: 4, autoStart: min } };
        const room = new GameRoom({ seed: 42, fixedStepMs: 50, mode });
        stubSimulation(room);
        room.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID });
        for (const sessionId of ["seat-a", "seat-b"]) {
            room.state.players.set(sessionId, mode.createPlayer({ sessionId, name: sessionId, randomInt: () => 0 }));
        }
        const internals = room as unknown as {
            lifecycleGeneration: number;
            assertMatchStartBoundary(generation: number, sessions: ReadonlySet<string>, stage: string): void;
        };
        return () => internals.assertMatchStartBoundary(
            internals.lifecycleGeneration, new Set(["seat-a", "seat-b"]), "probe",
        );
    };
    assert.throws(boundaryOf(3), /match participants or phase changed during probe/, "2 人 < min=3 必须炸");
    assert.doesNotThrow(boundaryOf(2), "2 人 == min=2 必须放行——否则上面的 throws 只是恒真");
});

// ── commands / wire token 准入（Non-intrusive §4.5 阶段 2b）─────────────────
//
// `GameModeInputs`（accepts/phases）已删除：玩法输入的消息名、phase 与预算成本由该玩法
// wire.ts 的 token 声明、经 codegen:gameplays 聚合进 wire catalog；mode 只声明
// `commands`（typed handler map），其键必须 ⊆ 本玩法的 wire token 集合。

test("GameModeRegistry：非法 commands 必须在建实例时抛（非 register 时）", () => {
    const registry = new GameModeRegistry<GameRoomState>();
    const withCommands = (commands: unknown) => {
        registry.register(IDLE_GAME_MODE_ID, () => ({ ...createIdleGameMode(), commands } as never), {
            replace: true,
        });
        return () => registry.create(IDLE_GAME_MODE_ID);
    };
    assert.throws(withCommands([]), /commands 必须是「消息名 → handler」对象/);
    assert.throws(withCommands({ [C2S.IdlePulse]: "not-a-fn" }), /commands\["c2s\.idle\.pulse"\] 必须是函数/);
    assert.throws(
        withCommands({ "c2s.not.a.message": () => undefined }),
        /commands 键 c2s\.not\.a\.message 不属于该玩法的 wire token 集合/,
    );
    // Ping/Chat 属 core/shell：mode 声明它们等于让准入出现两个真源
    assert.throws(withCommands({ [C2S.Ping]: () => undefined }), /commands 键 c2s\.ping 不属于该玩法/);
    assert.throws(withCommands({ [C2S.Chat]: () => undefined }), /commands 键 c2s\.chat 不属于该玩法/);
    // 别的玩法的消息名同样拒绝：owner 分发下这个键永远收不到消息
    assert.throws(withCommands({ [C2S.Move]: () => undefined }), /commands 键 c2s\.move 不属于该玩法/);
    // 合法：本玩法自己的 token 键；未声明 commands 的 mode 也合法（纯状态玩法）
    assert.equal(typeof withCommands({ [C2S.IdlePulse]: () => undefined })().commands?.[C2S.IdlePulse], "function");
    assert.equal(withCommands(undefined)().commands, undefined);
});

test("注入式 mode 的 commands 也必须过同一道闸", () => {
    const broken = {
        ...createIdleGameMode(),
        commands: { [C2S.Move]: () => undefined },
    } as unknown as GameMode<GameRoomState>;
    assert.throws(
        () => new GameRoom({ seed: 1, mode: broken }),
        /commands 键 c2s\.move 不属于该玩法的 wire token 集合/,
    );
});

/** owner 独占 + token phases 的行为探针：owner mode 声明全量 capture commands。 */
function reachedGameplayInput(type: C2SType, phase: GamePhaseType, ownerId: string): {
    reached: boolean;
    errors: number;
} {
    const seen: C2SType[] = [];
    const errors: unknown[][] = [];
    const capture = (captured: C2SType) => () => { seen.push(captured); };
    const mode = ownerId === IDLE_GAME_MODE_ID
        ? { ...createIdleGameMode(), commands: { [C2S.IdlePulse]: capture(C2S.IdlePulse) } }
        : {
            ...createBallMoveGameMode(),
            commands: { [C2S.Move]: capture(C2S.Move), [C2S.CastSkill]: capture(C2S.CastSkill) },
        };
    const room = new GameRoom({ seed: 1, clock: () => 0, mode: mode as never });
    stubSimulation(room);
    room.state.phase = phase;
    const sender = {
        sessionId: "matrix",
        auth: { userId: "u-matrix", sId: 0, mode: ownerId },
        send: (sentType: string, payload: unknown) => errors.push([sentType, payload]),
    };
    dispatch(room, type, sender, MATRIX_VALID_PAYLOAD[type]);
    return { reached: seen.length > 0, errors: errors.filter(([sentType]) => sentType === S2C.Error).length };
}

// 每条玩法消息一份**合法** payload——⛔ 必须合法，否则会先撞 exact validator，测不到准入闸。
const MATRIX_VALID_PAYLOAD: Record<string, unknown> = {
    [C2S.Move]: { dirX: 1, dirY: 0 },
    [C2S.CastSkill]: { skillId: 1 },
    [C2S.IdlePulse]: {},
};

test("shell 不再认识具体玩法输入：IdlePulse 只对 owner mode 开放", () => {
    // ① 非 owner 的 mode（ballMove）：⛔ 必须在 owner 闸就拒，不得到达 commands
    const declined = reachedGameplayInput(C2S.IdlePulse, GamePhase.Playing, BALL_MOVE_GAME_MODE_ID);
    assert.equal(declined.reached, false, "非 owner 的 mode 不得收到 IdlePulse——旧 shell 的 switch 会放行");
    assert.equal(declined.errors, 1, "被拒的输入必须回一条错误");

    // ② owner mode：必须到达 commands
    const accepted = reachedGameplayInput(C2S.IdlePulse, GamePhase.Playing, IDLE_GAME_MODE_ID);
    assert.equal(accepted.reached, true);
    assert.equal(accepted.errors, 0, "owner 声明的输入不得报错");

    // ③ token phases 只声明了 Playing：同一 mode 在 Waiting 必须被拒
    const wrongPhase = reachedGameplayInput(C2S.IdlePulse, GamePhase.Waiting, IDLE_GAME_MODE_ID);
    assert.equal(wrongPhase.reached, false, "token 未声明 Waiting 时必须拒");
    assert.equal(wrongPhase.errors, 1);
});

/**
 * wire catalog 的**穷尽矩阵**：把「shell 不得认识任何具体玩法输入」从一句 ⛔ 变成会红的闸。
 *
 * 判据对每条玩法 C2S × 每个 phase 断言三件事：owner mode 的准入 === token phases 声明；
 * 非 owner mode 一律拒。数据全部来自生成的 wire catalog——往 dispatcher 里塞任何具名
 * 玩法分支都会让某一格转红。
 */
test("wire catalog 穷尽矩阵：owner 独占 + token phases 决定玩法输入准入", () => {
    const ALL_PHASES = [GamePhase.Waiting, GamePhase.Playing, GamePhase.Settle] as const;
    const gameplayInputs = Object.keys(GAME_WIRE_PHASES) as C2SType[];
    assert.ok(gameplayInputs.length >= 3, `玩法输入数量异常：${gameplayInputs.length}`);
    // shell 公共消息集合变了就必须重新审视本矩阵，⛔ 不要只改这一行
    const coreC2S = Object.entries(GAME_WIRE_OWNERS)
        .filter(([type, owner]) => owner === "core" && type.startsWith("c2s."))
        .map(([type]) => type);
    assert.deepEqual(coreC2S.sort(), [C2S.Chat, C2S.Ping].sort());

    for (const type of gameplayInputs) {
        assert.ok(type in MATRIX_VALID_PAYLOAD, `新增玩法 C2S ${type} 必须在本矩阵补一份合法 payload`);
        const owner = GAME_WIRE_OWNERS[type as keyof typeof GAME_WIRE_OWNERS] as string;
        const nonOwner = owner === IDLE_GAME_MODE_ID ? BALL_MOVE_GAME_MODE_ID : IDLE_GAME_MODE_ID;
        const declaredPhases = GAME_WIRE_PHASES[type as keyof typeof GAME_WIRE_PHASES] as readonly GamePhaseType[];
        for (const phase of ALL_PHASES) {
            assert.equal(
                reachedGameplayInput(type, phase, owner).reached,
                declaredPhases.includes(phase),
                `${type} 在 ${phase}：owner mode 的准入必须等于 token phases 声明`,
            );
            assert.equal(
                reachedGameplayInput(type, phase, nonOwner).reached,
                false,
                `${type} 在 ${phase}：非 owner mode 必须被拒——`
                + "若这一格红了，多半是 dispatcher 里出现了具名玩法分支",
            );
        }
    }
});

test("shell 公共消息的 phase 规则仍归 shell：Ping W/P/S 全放行，Chat 只在 W/P", () => {
    const probe = (type: C2SType, phase: GamePhaseType, payload: unknown): number => {
        const room = new GameRoom({ seed: 1, clock: () => 0, mode: createIdleGameMode() });
        stubSimulation(room);
        room.state.phase = phase;
        const errors: unknown[] = [];
        const sender = {
            sessionId: "core-phase",
            auth: { userId: "u-core-phase", sId: 0, mode: IDLE_GAME_MODE_ID },
            send: (sentType: string) => { if (sentType === S2C.Error) errors.push(sentType); },
        };
        dispatch(room, type, sender, payload);
        return errors.length;
    };
    for (const phase of [GamePhase.Waiting, GamePhase.Playing, GamePhase.Settle] as const) {
        assert.equal(probe(C2S.Ping, phase, { clientTime: 1 }), 0,
            `Ping 在 ${phase} 必须放行——结算界面的心跳不能被判掉线`);
    }
    assert.equal(probe(C2S.Chat, GamePhase.Waiting, { text: "hi" }), 0);
    assert.equal(probe(C2S.Chat, GamePhase.Playing, { text: "hi" }), 0);
    assert.equal(probe(C2S.Chat, GamePhase.Settle, { text: "hi" }), 1, "Chat 在 Settle 必须被拒");
});

// ── 阶段 1（Non-intrusive §6.1 / §9）：删默认玩法回退，未登记 mode fail-fast ────

test("未登记 mode fail-fast：requireMode 不再回退 ballMove", async () => {
    // 前提：本文件不向生产 registry 泄漏 ballMove 登记（各用例 try/finally 已归还）。
    assert.equal(
        gameModeRegistry.has(BALL_MOVE_GAME_MODE_ID),
        false,
        "前提：生产 registry 此刻不含 ballMove（登记只发生在组合根/显式调用）",
    );

    // ① 未注入 mode 的房间：任何触及 mode 的入口都必须炸，⛔ 不得静默选出 ballMove。
    const bare = new GameRoom({ seed: 981 });
    assert.throws(() => bare.stepFixed(), /has no game mode/);
    await assert.rejects(bare.startMatch(), /has no game mode/);

    // ② onCreate 撞上未登记 mode：BadRequest 拒绝，且拒绝后房间依然没有 mode（不回退）。
    const created = new GameRoom({ seed: 982 });
    stubSimulation(created);
    assert.throws(
        () => created.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID }),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        "未登记的 ballMove 必须像任何未知 mode 一样被拒绝",
    );
    assert.throws(() => created.stepFixed(), /has no game mode/, "拒绝后不得留下任何回退 mode");
});

test("阶段 1 退出条件：apps/server 源码与测试不再出现 ballMove 默认规则旗标", () => {
    // ⚠ 旗标名动态拼出，避免本测试自身成为 grep 命中。
    const banned = ["usesDefault", "BallMove", "Rules"].join("");
    const serverRoot = fileURLToPath(new URL("..", import.meta.url));
    const offenders: string[] = [];
    let scanned = 0;
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = joinPath(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "node_modules") continue;
                walk(full);
                continue;
            }
            if (!/\.(ts|md|json|mjs)$/.test(entry.name)) continue;
            scanned++;
            if (readFileSync(full, "utf8").includes(banned)) offenders.push(full);
        }
    };
    walk(joinPath(serverRoot, "src"));
    walk(joinPath(serverRoot, "test"));
    assert.ok(scanned >= 50, `扫描面异常小（${scanned} 个文件），检查根路径是否指错`);
    assert.deepEqual(offenders, [], `旗标已随阶段 1 删除，⛔ 不得回潜：\n${offenders.join("\n")}`);
});

/**
 * 把 fail-closed 闸的**真实时机**钉住：`register()` 不校验，`create()` 才校验。
 *
 * 注释、文档与用例名一度都写着「登记期」，但 `register(id, factory)` 只收下 factory、不调用它，
 * 此时没有实例可校验——一个非法 mode 能被成功注册，直到第一次**建房**才炸。这是当前形状的
 * 真实边界（`Room.__init()` 早于 `onCreate()`，mode 只能在建房时才选定），⛔ 不要把它说成
 * 注册就会拦住。
 */
test("fail-closed 闸的真实时机：register 放行，create 才抛", () => {
    const registry = new GameModeRegistry<GameRoomState>();
    const id = "timing-probe";
    const broken = () => ({ ...createBallMoveGameMode(), id, roster: undefined } as never);
    // ① register 不调用 factory，因此不校验——⛔ 这不是缺陷，是形状使然，但必须说实话
    assert.doesNotThrow(() => registry.register(id, broken), "register 不得校验（它拿不到实例）");
    assert.equal(registry.has(id), true, "非法 mode 确实被成功登记了");
    // ② create 才是闸
    assert.throws(() => registry.create(id), /必须声明 roster\{min,max,autoStart\}/);
});
