/**
 * snake 玩法的真栈集成测试（真 Server + 真 Redis + @colyseus/sdk，⛔ 不 mock 撮合——
 * 先 `npm --workspace @game/server run stack`）。drop-in 语义在 snake 上的验收：
 *  ① 单人 joinOrCreate：首人即开局，快照里 1 真人 + 7 AI（AI 填充）；
 *  ② 8 个真人陆续进同一 roomId，快照里全真人（AI 全部让位）；
 *  ③ 第 9 人 → 新 roomId（满员撮合排除，框架既有行为）；
 *  ④ 真人离开后 AI 补刷（快照里重新出现 AI）。
 * fixture mode 用生产装配（createSnakeGameMode）临时登记，测试结束 unregister
 *（生产 catalog.ts 的默认登记在客户端 module 就绪的阶段同批落地）。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    GamePhase,
    GAME_ROOM_PROTOCOL_VERSION,
    GAMEPLAY_CATALOG,
    RoomName,
    S2C,
    type IGameRoomJoinOptions,
    type ISnakeWorldSnapshot,
} from "@game/shared";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { GameRoom } from "../../src/rooms/GameRoom";
import { gameModeRegistry } from "../../src/rooms/GameMode";
import { createSnakeGameMode } from "../../src/rooms/modes/snake/index";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const MODE_ID = "snake";
const SID = 0;

after(async () => {
    await closeRedis();
});

const joinOptions = (): IGameRoomJoinOptions => ({
    v: GAME_ROOM_PROTOCOL_VERSION,
    sId: SID,
    mode: MODE_ID,
    modeVersion: GAMEPLAY_CATALOG.snake.modeVersion,
    profile: "dropIn",
});

type TrackedRoom = {
    room: SDKRoom;
    snapshots: ISnakeWorldSnapshot[];
};

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await sleep(20);
    }
    assert.ok(predicate(), label);
}

test("snake 真栈：AI 填充 / 8 真人同房全真人 / 第 9 人新房 / 离开后 AI 补刷", {
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
            const uid = testUid(name);
            const { token } = await issueSession(uid, null, "", SID);
            const sdk = new SDKClient(endpoint);
            sdk.auth.token = token;
            const room = await sdk.joinOrCreate(RoomName.Game, joinOptions());
            const entry: TrackedRoom = { room, snapshots: [] };
            room.onMessage(S2C.SnakeSnapshot, (payload: unknown) => {
                entry.snapshots.push(payload as ISnakeWorldSnapshot);
            });
            tracked.push(entry);
            return entry;
        };
        const latestSnapshotOf = async (entry: TrackedRoom): Promise<ISnakeWorldSnapshot> => {
            await waitFor(() => entry.snapshots.length > 0, "必须收到世界快照");
            return entry.snapshots[entry.snapshots.length - 1];
        };

        // ── ① 首人即开局 + AI 填充 ─────────────────────────────────────
        const first = await connect("s1");
        const roomIdA = first.room.roomId;
        await waitFor(() => {
            const serverRoom = matchMaker.getLocalRoomById(roomIdA);
            return serverRoom && (serverRoom.state as { phase?: string }).phase === GamePhase.Playing;
        }, "首人入座后必须已是 Playing（drop-in 首人即开局）");
        // 等移动解禁后的快照（倒计时冻结窗内的快照也存在但 AI 已填好）
        const firstSnapshot = await latestSnapshotOf(first);
        assert.equal(firstSnapshot.snakes.filter((snake) => !snake.ai).length, 1);
        assert.equal(firstSnapshot.snakes.filter((snake) => snake.ai).length, 7,
            "单人房必须 AI 填充到 8 蛇");
        assert.equal(firstSnapshot.snakes.length, 8);

        // ── ② 真人陆续进同一房，AI 逐步让位 ────────────────────────────
        for (let index = 2; index <= 8; index++) {
            const member = await connect(`s${index}`);
            assert.equal(member.room.roomId, roomIdA, `第 ${index} 人必须撮合进同一 snake 房`);
        }
        let fullSnapshot = await latestSnapshotOf(first);
        await waitFor(() => {
            fullSnapshot = first.snapshots[first.snapshots.length - 1];
            return fullSnapshot.snakes.filter((snake) => !snake.ai).length === 8;
        }, "8 真人全部出现在快照（AI 全让位）");
        assert.equal(fullSnapshot.snakes.filter((snake) => snake.ai).length, 0,
            "8 真人时 AI 必须全部让位");

        // ── ③ 第 9 人 → 新房 ──────────────────────────────────────────
        const ninth = await connect("s9");
        assert.notEqual(ninth.room.roomId, roomIdA, "第 9 人必须开新房");
        const ninthSnapshot = await latestSnapshotOf(ninth);
        assert.equal(ninthSnapshot.snakes.filter((snake) => !snake.ai).length, 1);
        assert.equal(ninthSnapshot.snakes.filter((snake) => snake.ai).length, 7,
            "新房同样 AI 填充");

        // ── ④ 真人离开 → AI 补刷 ─────────────────────────────────────
        await tracked[1].room.leave(true); // A 房走一人（consented → 立即释放）
        await waitFor(() => {
            const snapshot = first.snapshots[first.snapshots.length - 1];
            return snapshot && snapshot.snakes.filter((snake) => snake.ai).length === 1;
        }, "真人离开后必须补刷 1 条 AI");
    } finally {
        await Promise.allSettled(tracked
            .filter((entry) => entry.room.connection?.isOpen)
            .map((entry) => Promise.race([entry.room.leave(true), sleep(2_000)])));
        if (listening) await server.gracefullyShutdown(false);
        unregisterFixture();
    }
});
