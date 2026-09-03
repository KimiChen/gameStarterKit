/** Snake V2 真栈：撮合、分块 baseline、17 蛇动态 roster 与离场补 AI。 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    C2S,
    GamePhase,
    GAME_ROOM_PROTOCOL_VERSION,
    GAMEPLAY_CATALOG,
    RoomName,
    S2C,
    type IGameRoomJoinOptions,
    type ISnakeBaselineBegin,
    type ISnakeBaselineChunk,
    type ISnakeBaselineEnd,
    type ISnakeSnapshotSnake,
} from "@game/shared";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { GameRoom } from "../../src/rooms/GameRoom";
import { gameModeRegistry } from "../../src/rooms/GameMode";
import { createSnakeGameMode } from "../../src/rooms/modes/snake/index";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const MODE_ID = "snake";
const SID = 0;

after(async () => { await closeRedis(); });

const joinOptions = (): IGameRoomJoinOptions => ({
    v: GAME_ROOM_PROTOCOL_VERSION,
    sId: SID,
    mode: MODE_ID,
    modeVersion: GAMEPLAY_CATALOG.snake.modeVersion,
    profile: "dropIn",
});

interface TrackedRoom {
    readonly room: SDKRoom;
    readonly begins: ISnakeBaselineBegin[];
    readonly chunks: ISnakeBaselineChunk[];
    readonly ends: ISnakeBaselineEnd[];
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await sleep(20);
    }
    assert.ok(predicate(), label);
}

async function requestSnakes(entry: TrackedRoom): Promise<readonly ISnakeSnapshotSnake[]> {
    const state = entry.room.state as unknown as { roomEpochId: string };
    const before = entry.begins.length;
    entry.room.send(C2S.SnakeBaselineRequest, { roomEpochId: state.roomEpochId, afterSeq: 0 });
    await waitFor(() => entry.begins.length > before && entry.ends.some((end) =>
        end.baselineId === entry.begins.at(-1)?.baselineId), "必须收到完整 V2 baseline");
    const baseline = entry.begins.at(-1);
    assert.ok(baseline);
    const snakeChunks = entry.chunks.filter((chunk) =>
        chunk.baselineId === baseline.baselineId && chunk.kind === "snakes");
    return snakeChunks.sort((left, right) => left.index - right.index)
        .flatMap((chunk) => chunk.items as ISnakeSnapshotSnake[]);
}

test("snake 真栈：8 真人同房仍为 17 蛇，第 9 人新房，离场只补 401 AI", {
    timeout: 90_000,
}, async () => {
    await assertRedisUp();
    const unregisterFixture = gameModeRegistry.register(MODE_ID, () => createSnakeGameMode());
    const server = new Server({
        transport: new WebSocketTransport(),
        gracefullyShutdown: false,
        greet: false,
        devMode: false,
    });
    server.define(RoomName.Game, GameRoom).filterBy(["sId", "mode", "profile"]);
    const tracked: TrackedRoom[] = [];
    let listening = false;
    try {
        await server.listen(0);
        listening = true;
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;
        const connect = async (name: string): Promise<TrackedRoom> => {
            const { token } = await issueSession(testUid(name), null, "", SID);
            const sdk = new SDKClient(endpoint);
            sdk.auth.token = token;
            const room = await sdk.joinOrCreate(RoomName.Game, joinOptions());
            const entry: TrackedRoom = { room, begins: [], chunks: [], ends: [] };
            room.onMessage(S2C.SnakeBaselineBegin, (value: unknown) => entry.begins.push(value as ISnakeBaselineBegin));
            room.onMessage(S2C.SnakeBaselineChunk, (value: unknown) => entry.chunks.push(value as ISnakeBaselineChunk));
            room.onMessage(S2C.SnakeBaselineEnd, (value: unknown) => entry.ends.push(value as ISnakeBaselineEnd));
            tracked.push(entry);
            return entry;
        };

        const first = await connect("s2-v2-1");
        const roomIdA = first.room.roomId;
        await waitFor(() => {
            const serverRoom = matchMaker.getLocalRoomById(roomIdA);
            return serverRoom && (serverRoom.state as { phase?: string }).phase === GamePhase.Playing;
        }, "首人必须启动无尽 Playing");
        let snakes = await requestSnakes(first);
        assert.equal(snakes.length, 17);
        assert.equal(snakes.filter((snake) => !snake.ai).length, 1);
        assert.equal(snakes.filter((snake) => snake.ai).length, 16);

        for (let index = 2; index <= 8; index += 1) {
            const member = await connect(`s2-v2-${index}`);
            assert.equal(member.room.roomId, roomIdA);
        }
        snakes = await requestSnakes(first);
        assert.equal(snakes.length, 17);
        assert.equal(snakes.filter((snake) => !snake.ai).length, 8);
        assert.equal(snakes.filter((snake) => snake.ai).length, 9);
        assert.equal(snakes.filter((snake) => snake.aiLevel === 401).length, 1);
        assert.equal(snakes.filter((snake) => snake.aiLevel === 402).length, 4);
        assert.equal(snakes.filter((snake) => snake.aiLevel === 403).length, 2);
        assert.equal(snakes.filter((snake) => snake.aiLevel === 404).length, 2);

        const ninth = await connect("s2-v2-9");
        assert.notEqual(ninth.room.roomId, roomIdA);
        const ninthSnakes = await requestSnakes(ninth);
        assert.equal(ninthSnakes.filter((snake) => !snake.ai).length, 1);
        assert.equal(ninthSnakes.filter((snake) => snake.ai).length, 16);

        await tracked[1].room.leave(true);
        await sleep(100);
        snakes = await requestSnakes(first);
        assert.equal(snakes.filter((snake) => !snake.ai).length, 7);
        assert.equal(snakes.filter((snake) => snake.ai).length, 10);
        assert.equal(snakes.filter((snake) => snake.aiLevel === 401).length, 2);
    } finally {
        await Promise.allSettled(tracked.filter((entry) => entry.room.connection?.isOpen)
            .map((entry) => Promise.race([entry.room.leave(true), sleep(2_000)])));
        if (listening) await server.gracefullyShutdown(false);
        unregisterFixture();
    }
});
