import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import {
    C2S,
    ErrorCode,
    GamePhase,
    GameplayModeId,
    PROTOCOL_VERSION,
    ROOM_STATE_VALIDATORS,
    S2C,
} from "@game/shared";
import {
    BALL_MOVE_GAME_MODE_ID,
    GameModeRegistry,
    IDLE_GAME_MODE_ID,
    createBallMoveGameMode,
    gameModeRegistry,
    type GameMode,
} from "../src/rooms/GameMode";
import { GameRoom, type GameRoomRuntimeOptions } from "../src/rooms/GameRoom";
import { registerDefaultGameModes } from "../src/rooms/modes/catalog";
import { createIdleGameMode, registerIdleGameMode } from "../src/rooms/modes/IdleGameMode";
import {
    ROOM_STATE_ROOT_CONSTRUCTORS,
    type GameRoomState,
    IdlePlayerState,
    type IdleRoomState,
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
    await room.onJoin(item as never, { v: PROTOCOL_VERSION, sId: 0, mode: item.auth.mode });
}

test("GameModeRegistry：第二个 mode 可独立登记、创建和撤销", () => {
    const registry = new GameModeRegistry<GameRoomState>();
    const unregister = registry.register(IDLE_GAME_MODE_ID, createIdleGameMode);
    assert.deepEqual(registry.list(), ["idle"]);
    assert.equal(registry.create("idle").id, "idle");
    assert.throws(() => registry.register(IDLE_GAME_MODE_ID, createIdleGameMode), /已登记/);
    unregister();
    assert.equal(registry.has("idle"), false);
    assert.deepEqual(gameModeRegistry.create(BALL_MOVE_GAME_MODE_ID).matchEvidenceRuleset, {
        id: BALL_MOVE_GAME_MODE_ID,
        version: 1,
    });
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

test("GameModeRegistry：漏配规则归属或 player factory 时 fail-closed", () => {
    const missingRules = new GameModeRegistry<GameRoomState>();
    missingRules.register(IDLE_GAME_MODE_ID, () => ({
        id: IDLE_GAME_MODE_ID,
        createPlayer: createIdleGameMode().createPlayer,
    }) as never);
    assert.throws(() => missingRules.create(IDLE_GAME_MODE_ID), /usesDefaultBallMoveRules/);

    const missingPlayer = new GameModeRegistry<GameRoomState>();
    missingPlayer.register(IDLE_GAME_MODE_ID, () => ({
        id: IDLE_GAME_MODE_ID,
        usesDefaultBallMoveRules: false,
    }) as never);
    assert.throws(() => missingPlayer.create(IDLE_GAME_MODE_ID), /createPlayer/);
});

test("生产 mode catalog 与 shared/state 生成映射保持精确同集", () => {
    const unregister = registerDefaultGameModes();
    try {
        const canonicalModes = [...Object.values(GameplayModeId)].sort();
        assert.deepEqual(gameModeRegistry.list(), canonicalModes);
        assert.deepEqual(Object.keys(ROOM_STATE_VALIDATORS).sort(), canonicalModes);
        assert.deepEqual(Object.keys(ROOM_STATE_ROOT_CONSTRUCTORS).sort(), canonicalModes);
    } finally {
        unregister();
    }
});

test("GameRoom：onCreate 从生产 registry 选择 idle，未知 mode 和直连错 mode 均拒绝", async () => {
    const unregister = registerIdleGameMode(gameModeRegistry);
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
        idleRoom.onCreate({ v: PROTOCOL_VERSION, sId: 0, mode: IDLE_GAME_MODE_ID });
        assert.equal(idleRoom.gameplayModeId, IDLE_GAME_MODE_ID);
        assert.equal(unexpectedBallFactories, 0, "idle 创建不得实例化或依赖 ballMove factory");

        const unknownRoom = new GameRoom({ seed: 8 });
        (unknownRoom as unknown as { setSimulationInterval: (callback: () => void, delay: number) => void })
            .setSimulationInterval = () => {};
        assert.throws(
            () => unknownRoom.onCreate({ v: PROTOCOL_VERSION, sId: 0, mode: "missing-mode" }),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        );
        assert.throws(
            () => unknownRoom.onCreate({ v: PROTOCOL_VERSION, sId: 0 } as never),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
        );
        assert.throws(
            () => unknownRoom.onCreate({ v: PROTOCOL_VERSION - 1, sId: 0, mode: IDLE_GAME_MODE_ID }),
            (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.ProtocolMismatch)),
        );

        mutableRegistry.create = originalCreate;
        const defaultRoom = new GameRoom({ seed: 9 });
        (defaultRoom as unknown as { setSimulationInterval: (callback: () => void, delay: number) => void })
            .setSimulationInterval = () => {};
        defaultRoom.onCreate({ v: PROTOCOL_VERSION, sId: 0, mode: BALL_MOVE_GAME_MODE_ID });
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
    for (const legacy of [{ v: PROTOCOL_VERSION - 1 }, {}]) {
        await assert.rejects(
            GameRoom.onAuth("", legacy as never, undefined as never),
            assertCode(ErrorCode.ProtocolMismatch),
        );
        const room = new GameRoom({ seed: 91 });
        assert.throws(() => room.onCreate(legacy as never), assertCode(ErrorCode.ProtocolMismatch));
    }

    await assert.rejects(
        GameRoom.onAuth("", { v: PROTOCOL_VERSION } as never, undefined as never),
        assertCode(ErrorCode.BadRequest),
    );
    const current = new GameRoom({ seed: 92 });
    assert.throws(
        () => current.onCreate({ v: PROTOCOL_VERSION } as never),
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
    (room.messages as Record<string, (client: unknown, payload: unknown) => void>)[C2S.Ping](
        sender,
        { clientTime: 10 },
    );
    assert.deepEqual(sent, [[S2C.Pong, { clientTime: 10, serverTime: 25 }]]);
});

test("GameRoom：transport/admission/tick/finish 均通过可替换 mode 接缝", async () => {
    const events: string[] = [];
    const mode: GameMode<GameRoomState> = {
        ...createBallMoveGameMode(),
        onAdmission: ({ client: joined }) => {
            events.push(`admission:${joined.sessionId}`);
        },
        onMessage: ({ type, client: sender }) => {
            if (type !== C2S.Move) return false;
            events.push(`message:${sender.sessionId}`);
            return true;
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

    const player = room.state.players.get("a")!;
    const before = { dirX: player.dirX, dirY: player.dirY };
    const move = (room.messages as Record<string, (sender: unknown, payload: unknown) => void>)[C2S.Move];
    move(first, { dirX: 1, dirY: 0 });
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
            onMessage: (() => Promise.reject(new Error("async message"))) as never,
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
        (room.messages as Record<string, (client: unknown, payload: unknown) => void>)[C2S.Ping](
            sender,
            { clientTime: 1 },
        );
        room.state.phase = GamePhase.Playing;
        (room as unknown as { stepFixed: () => void }).stepFixed();
        (room as unknown as { settle: () => void }).settle();
        await new Promise<void>((resolve) => setImmediate(resolve));

        assert.equal(sent.some(([type]) => type === S2C.Error), true, "async message hook 必须按错误消费");
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
        evidenceEmitter: async () => { emissions++; return null; },
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
