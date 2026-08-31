/// <reference path="../../client/src/lib/colyseus/colyseus.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import * as ColyseusSDK from "@colyseus/sdk";
import {
    Client as SDKClient,
    CloseCode as SDKCloseCode,
    type Room as SDKRoom,
} from "@colyseus/sdk";
import { matchMaker, Server, type AuthContext } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
    C2S,
    GamePhase,
    GameplayModeId,
    PROTOCOL_VERSION,
    RoomName,
    validateGameRoomJoinOptions,
    type IGameRoomJoinOptions,
} from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import {
    BALL_MOVE_GAME_MODE_ID,
    gameModeRegistry,
    IDLE_GAME_MODE_ID,
} from "../src/rooms/GameMode";
import { registerBallMoveGameMode } from "../src/rooms/modes/ballMove/index";
import { registerIdleGameMode } from "../src/rooms/modes/IdleGameMode";
import {
    GameRoomState,
    IdleRoomState,
} from "../src/rooms/schema/GameRoomState";

type WireState = {
    readonly phase: string;
    readonly tick: number;
    readonly matchId: string;
    readonly pulseGoal?: number;
    readonly winnerId?: string;
    readonly players: {
        readonly size: number;
        get(sessionId: string): Record<string, unknown> | undefined;
    };
    toJSON(): Record<string, unknown>;
};

type ReconnectableSDKRoom = SDKRoom & {
    readonly connection: {
        close(code?: number, reason?: string): void;
    };
};

const moveMessagesByMode = new Map<string, number>();
let roomSequence = 0;

/** Real GameRoom with only the two external production boundaries replaced. */
class MultiModeWireRoom extends GameRoom {
    static override async onAuth(
        token: string,
        options: IGameRoomJoinOptions | undefined,
        _context: AuthContext,
    ) {
        const parsed = validateGameRoomJoinOptions(options);
        if (typeof token !== "string" || token.length === 0) throw new Error("missing test token");
        return {
            userId: `wire-user:${token}`,
            sId: parsed.sId ?? 0,
            mode: parsed.mode,
        };
    }

    constructor() {
        const sequence = ++roomSequence;
        super({
            seed: sequence,
            matchId: () => `wire-match-${sequence}`,
            evidenceEmitter: async () => ({ ok: true as const, entryId: "0-0" }),
        });

        // 阶段 2b：只剩 catch-all 一个键；`Room.__init()` 消费前在构造器内包裹仍然可行。
        const dispatch = this.messages["_"];
        this.messages["_"] = (client, type, payload) => {
            if (type === C2S.Move) {
                moveMessagesByMode.set(
                    this.gameplayModeId,
                    (moveMessagesByMode.get(this.gameplayModeId) ?? 0) + 1,
                );
            }
            dispatch.call(this, client, type, payload);
        };
    }
}

function wireOptions(mode: string, token: string): IGameRoomJoinOptions {
    return { v: PROTOCOL_VERSION, token, sId: 0, mode };
}

function sdkClient(endpoint: string, token: string): SDKClient {
    const client = new SDKClient(endpoint);
    client.auth.token = token;
    return client;
}

function stateOf(room: SDKRoom): WireState {
    return room.state as unknown as WireState;
}

function physicalRoomOfRoomClient(client: unknown): SDKRoom {
    const room = (client as { slot?: { room?: SDKRoom | null } | null }).slot?.room;
    assert.ok(room, "test probe requires the current physical SDK room");
    return room;
}

async function waitFor(
    predicate: () => boolean,
    label: string,
    timeoutMs = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${label}`);
}

test("one real GameRoom definition carries independent ballMove and idle Schema patches", {
    timeout: 30_000,
}, async () => {
    moveMessagesByMode.clear();
    const unregisterIdle = gameModeRegistry.has(IDLE_GAME_MODE_ID)
        ? undefined
        : registerIdleGameMode(gameModeRegistry);
    // ballMove 登记在组合根；本测试自建 Server，不经 app.config，需自行登记。
    const unregisterBallMove = gameModeRegistry.has(BALL_MOVE_GAME_MODE_ID)
        ? undefined
        : registerBallMoveGameMode(gameModeRegistry);
    const globals = globalThis as unknown as { Colyseus?: unknown };
    const previousColyseus = globals.Colyseus;
    globals.Colyseus = ColyseusSDK;

    const server = new Server({
        transport: new WebSocketTransport(),
        gracefullyShutdown: false,
        greet: false,
        devMode: false,
    });
    server.define(RoomName.Game, MultiModeWireRoom).filterBy(["sId", "mode"]);

    let listening = false;
    let ballA: SDKRoom | undefined;
    let ballB: SDKRoom | undefined;
    let idleB: SDKRoom | undefined;
    let idleOwnership: { leave(): Promise<void> } | undefined;
    try {
        await server.listen(0);
        listening = true;
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object", "transport must expose its bound port");
        const endpoint = `http://127.0.0.1:${address.port}`;

        const ballClientA = sdkClient(endpoint, "ball-a");
        const ballClientB = sdkClient(endpoint, "ball-b");
        ballA = await ballClientA.joinOrCreate(
            RoomName.Game,
            wireOptions(GameplayModeId.BallMove, "ball-a"),
        );
        ballB = await ballClientB.joinOrCreate(
            RoomName.Game,
            wireOptions(GameplayModeId.BallMove, "ball-b"),
        );
        assert.equal(ballA.roomId, ballB.roomId, "ballMove clients must share their filtered room");

        const { RoomClient } = await import("../../client/src/net/RoomClient");
        const { createIdleRoomAdapter } = await import("../../client/src/net/rooms/GameRoomTransport");
        const idleRoomClient = new RoomClient();
        idleRoomClient.init(endpoint);
        const activeIdleOwnership = idleRoomClient.joinGame(
            createIdleRoomAdapter(),
            { token: "idle-a", sId: 0 },
            { timeoutMs: 5_000 },
        );
        idleOwnership = activeIdleOwnership;
        const idleA = await activeIdleOwnership.ready;
        const idlePhysicalRoom = physicalRoomOfRoomClient(idleRoomClient) as ReconnectableSDKRoom;
        const idleClientB = sdkClient(endpoint, "idle-b");
        idleB = await idleClientB.joinOrCreate(
            RoomName.Game,
            wireOptions(GameplayModeId.Idle, "idle-b"),
        );
        assert.equal(idleA.roomId, idleB.roomId, "idle clients must share their filtered room");
        assert.notEqual(idleA.roomId, ballA.roomId, "mode filter must keep the two games physically separate");

        await waitFor(
            () => stateOf(ballA!).phase === GamePhase.Playing
                && stateOf(ballA!).players.size === 2
                && stateOf(ballB!).phase === GamePhase.Playing,
            "ballMove Playing state on both SDK clients",
        );
        await waitFor(
            () => stateOf(idlePhysicalRoom).phase === GamePhase.Playing
                && stateOf(idlePhysicalRoom).players.size === 2
                && stateOf(idleB!).phase === GamePhase.Playing,
            "idle Playing state on both SDK clients",
        );

        const ballServerRoom = matchMaker.getLocalRoomById(ballA.roomId);
        const idleServerRoom = matchMaker.getLocalRoomById(idleA.roomId);
        assert.ok(ballServerRoom instanceof MultiModeWireRoom);
        assert.ok(idleServerRoom instanceof MultiModeWireRoom);
        assert.ok(ballServerRoom.state instanceof GameRoomState);
        assert.equal(ballServerRoom.state instanceof IdleRoomState, false);
        assert.ok(idleServerRoom.state instanceof IdleRoomState);
        assert.equal(idleServerRoom.state instanceof GameRoomState, false);
        const idleServerState = idleServerRoom.state as unknown as IdleRoomState;
        const selectedIdleRoot = idleServerRoom.state;
        assert.throws(
            () => {
                (idleServerRoom as unknown as { state: GameRoomState }).state = new GameRoomState();
            },
            /禁止外部替换/,
            "Colyseus 0.17 current `.state =` API 不得绕过 mode root ownership",
        );
        assert.strictEqual(idleServerRoom.state, selectedIdleRoot);
        assert.equal(ballServerRoom.constructor, idleServerRoom.constructor, "both roots must come from one Room definition");
        assert.equal(ballServerRoom.locked, true);
        assert.equal(idleServerRoom.locked, true);

        const ballJSON = stateOf(ballA).toJSON();
        const idleJSON = stateOf(idlePhysicalRoom).toJSON();
        assert.deepEqual(Object.keys(ballJSON).sort(), ["matchId", "phase", "players", "tick"]);
        assert.deepEqual(
            Object.keys(idleJSON).sort(),
            ["matchId", "phase", "players", "pulseGoal", "tick", "winnerId"],
        );

        let ballPatchCount = 0;
        let idlePatchCount = 0;
        ballA.onStateChange(() => { ballPatchCount++; });
        idlePhysicalRoom.onStateChange(() => { idlePatchCount++; });

        const ballPlayer = stateOf(ballA).players.get(ballA.sessionId);
        assert.ok(ballPlayer);
        const initialX = ballPlayer.x;
        assert.equal(typeof initialX, "number");
        ballA.send(C2S.Move, { dirX: 1, dirY: 0 });
        await waitFor(
            () => stateOf(ballA!).players.get(ballA!.sessionId)?.x !== initialX,
            "ballMove x patch",
        );
        assert.ok(ballPatchCount > 0, "ballMove SDK must observe a post-join patch");

        assert.equal(idlePhysicalRoom.reconnection.maxEnqueuedMessages, 0,
            "production RoomClient must disable the SDK's pre-state replay queue");
        idlePhysicalRoom.reconnection.minUptime = 0;
        idlePhysicalRoom.reconnection.minDelay = 10;
        idlePhysicalRoom.reconnection.maxDelay = 10;
        idlePhysicalRoom.reconnection.delay = 10;
        idlePhysicalRoom.reconnection.maxRetries = 10;
        const dropped = new Promise<void>((resolve) => idlePhysicalRoom.onDrop(() => resolve()));
        const reconnected = new Promise<void>((resolve) => idlePhysicalRoom.onReconnect(() => resolve()));
        assert.equal(moveMessagesByMode.get(GameplayModeId.Idle) ?? 0, 0);
        idlePhysicalRoom.connection.close(SDKCloseCode.MAY_TRY_RECONNECT, "multi-mode-wire-test");
        idleA.send(C2S.IdlePulse, {});
        await dropped;
        await reconnected;
        await waitFor(() => !idleA.dropping, "RoomClient reconnect ownership recovery");
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(idleA.current, true);
        assert.equal(idleA.sessionId, idlePhysicalRoom.sessionId);
        assert.equal(idleServerState.players.get(idleA.sessionId)?.pulses, 0,
            "socket close 后、下一 state 前的发送不能由 SDK 自动重放");
        assert.equal(
            moveMessagesByMode.get(GameplayModeId.Idle) ?? 0,
            0,
            "production idle adapter must not fabricate Move on join or reconnect",
        );

        const lateClient = sdkClient(endpoint, "idle-late");
        await assert.rejects(
            lateClient.joinById(
                idleA.roomId,
                wireOptions(GameplayModeId.Idle, "idle-late"),
            ),
            "a third SDK client must not enter the full, locked room",
        );
        assert.equal(idleServerRoom.clients.length, 2);
        assert.equal(idleServerState.players.size, 2);

        for (let pulses = 1; pulses <= 3; pulses++) {
            assert.equal(idleA.send(C2S.IdlePulse, {}), true);
            await waitFor(
                () => stateOf(idlePhysicalRoom).players.get(idleA.sessionId)?.pulses === pulses,
                `idle pulse patch ${pulses}`,
            );
        }
        await waitFor(
            () => stateOf(idlePhysicalRoom).phase === GamePhase.Settle
                && stateOf(idlePhysicalRoom).winnerId === idleA.sessionId,
            "idle settlement patch",
        );
        assert.ok(idlePatchCount >= 3, "idle SDK must observe each pulse patch");
        assert.equal(idleServerState.phase, GamePhase.Settle);
        assert.equal(idleServerState.winnerId, idleA.sessionId);
        assert.equal(idleServerState.players.get(idleA.sessionId)?.pulses, 3);
        assert.equal("x" in (idleServerState.players.get(idleA.sessionId) ?? {}), false);
        assert.equal("pulses" in (ballServerRoom.state.players.get(ballA.sessionId) ?? {}), false);
    } finally {
        await Promise.allSettled([
            idleOwnership?.leave() ?? Promise.resolve(),
            idleB?.leave() ?? Promise.resolve(),
            ballA?.leave() ?? Promise.resolve(),
            ballB?.leave() ?? Promise.resolve(),
        ]);
        if (listening) await server.gracefullyShutdown(false);
        unregisterIdle?.();
        unregisterBallMove?.();
        if (previousColyseus === undefined) delete globals.Colyseus;
        else globals.Colyseus = previousColyseus;
    }
});
