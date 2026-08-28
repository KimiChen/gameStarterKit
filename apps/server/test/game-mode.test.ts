import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import { C2S, GamePhase, PROTOCOL_VERSION } from "@game/shared";
import {
    GameModeRegistry,
    type GameMode,
} from "../src/rooms/GameMode";
import { GameRoom, type GameRoomRuntimeOptions } from "../src/rooms/GameRoom";
import type { GameRoomState } from "../src/rooms/schema/GameRoomState";

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number };
    send: () => void;
};

function client(sessionId: string): FakeClient {
    return { sessionId, auth: { userId: `u-${sessionId}`, sId: 0 }, send() {} };
}

function installLock(room: GameRoom): void {
    (room as unknown as { lock: () => Promise<void> }).lock = async () => undefined;
}

async function join(room: GameRoom, item: FakeClient): Promise<void> {
    await room.onJoin(item as never, { v: PROTOCOL_VERSION, sId: 0 });
}

test("GameModeRegistry：第二个 mode 可独立登记、创建和撤销", () => {
    const registry = new GameModeRegistry<GameRoomState>();
    const unregister = registry.register("idle", () => ({ id: "idle" }));
    assert.deepEqual(registry.list(), ["idle"]);
    assert.equal(registry.create("idle").id, "idle");
    assert.throws(() => registry.register("idle", () => ({ id: "idle" })), /已登记/);
    unregister();
    assert.equal(registry.has("idle"), false);
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
        onMatchStart: () => events.push("start"),
        onStep: ({ dtMs }) => events.push(`step:${dtMs}`),
        onLeave: ({ client: leaving }) => events.push(`leave:${leaving.sessionId}`),
        onFinish: () => events.push("finish"),
    };
    const options: GameRoomRuntimeOptions = { seed: 42, fixedStepMs: 50, mode };
    const room = new GameRoom(options);
    installLock(room);
    const first = client("a");
    const second = client("b");
    await join(room, first);
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
});
