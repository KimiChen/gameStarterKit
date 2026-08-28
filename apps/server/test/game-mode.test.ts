import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import { C2S, ErrorCode, GamePhase, PROTOCOL_VERSION, S2C } from "@game/shared";
import {
    BALL_MOVE_GAME_MODE_ID,
    GameModeRegistry,
    IDLE_GAME_MODE_ID,
    gameModeRegistry,
    type GameMode,
} from "../src/rooms/GameMode";
import { GameRoom, type GameRoomRuntimeOptions } from "../src/rooms/GameRoom";
import { createIdleGameMode, registerIdleGameMode } from "../src/rooms/modes/IdleGameMode";
import type { GameRoomState } from "../src/rooms/schema/GameRoomState";

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string };
    send: () => void;
};

function client(sessionId: string, mode = IDLE_GAME_MODE_ID): FakeClient {
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
    const unregister = registry.register("idle", () => ({ id: "idle" }));
    assert.deepEqual(registry.list(), ["idle"]);
    assert.equal(registry.create("idle").id, "idle");
    assert.throws(() => registry.register("idle", () => ({ id: "idle" })), /已登记/);
    unregister();
    assert.equal(registry.has("idle"), false);
    assert.equal(gameModeRegistry.create(BALL_MOVE_GAME_MODE_ID).emitsGenericMatchEvidence, true);
});

test("GameModeRegistry：同 factory replace 后旧 disposer 不删除新 registration", () => {
    const registry = new GameModeRegistry<GameRoomState>();
    const factory = () => ({ id: IDLE_GAME_MODE_ID });
    const oldOff = registry.register(IDLE_GAME_MODE_ID, factory);
    const newOff = registry.register(IDLE_GAME_MODE_ID, factory, { replace: true });
    oldOff();
    assert.equal(registry.create(IDLE_GAME_MODE_ID).id, IDLE_GAME_MODE_ID);
    newOff();
    assert.equal(registry.has(IDLE_GAME_MODE_ID), false);
    assert.throws(() => registry.register(" idle ", factory), /规范/);
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
        id: "idle",
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
    const first = client("a");
    const second = client("b");
    await join(room, first);
    const duplicateUser = client("a-duplicate");
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
            id: IDLE_GAME_MODE_ID,
            onAdmission: ({ client: admitted }) => { events.push(`admit:${admitted.sessionId}`); },
            onLeave: ({ client: leaving }) => { events.push(`leave:${leaving.sessionId}`); },
        },
    });
    (room as unknown as { lock: () => Promise<void> }).lock = async () => {
        throw new Error("injected lock failure");
    };
    const first = client("rollback-a");
    const second = client("rollback-b");
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
    try {
        const room = new GameRoom({
            seed: 94,
            mode: {
                id: IDLE_GAME_MODE_ID,
                async onMatchStart() {
                    await Promise.resolve();
                    throw new Error("injected async start failure");
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
        await join(room, client("async-a"));
        await assert.rejects(join(room, client("async-b")));
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

test("GameRoom：同步热路径返回 thenable 时显式观察 rejection 并 fail-closed", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
        const mode: GameMode<GameRoomState> = {
            id: IDLE_GAME_MODE_ID,
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
        mode: { id: IDLE_GAME_MODE_ID, onDispose: () => { disposes++; } },
    });
    const first = room.onDispose();
    const second = room.onDispose();
    assert.strictEqual(first, second, "重复 dispose 必须合流到同一可等待 Promise");
    await first;
    assert.equal(disposes, 1);
});
