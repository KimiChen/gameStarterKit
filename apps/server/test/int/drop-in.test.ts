/**
 * drop-in（自由加入）房型的真栈集成测试（真 Server + 真 Redis + @colyseus/sdk，⛔ 不 mock
 * 撮合——先 `npm --workspace @game/server run stack`）。验收四场景（规格 §3）：
 *  ① 同 sId/mode/profile 的 8 个 joinOrCreate 落同一 roomId，且首人后 phase=Playing；
 *  ② 第 9 人 → 新 roomId（满员由 Colyseus 按 maxClients 自动排除撮合，零新代码）；
 *  ③ 老房离开 1 人后，下一个 joinOrCreate 回填老房 roomId（⛔ 不是再开新房——减员自动恢复）；
 *  ④ 断线重连宽限占座计入容量：宽限内老房不接新客（撮合层 reserved seat + 房内 players 双占座）。
 *
 * fixture mode：dropInFixture（manifest maxPlayers=8 → roster.max=8 → maxClients=8——
 * 「8 人上限是玩法 manifest 配置参数」的实证），临时登记进 registry，测试结束 unregister
 * （生产 catalog.ts ⛔ 不登记它；本测试自建 Server）。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    GAMEPLAY_CATALOG,
    GamePhase,
    GAME_ROOM_PROTOCOL_VERSION,
    RoomName,
    type IGameRoomJoinOptions,
} from "@game/shared";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { GameRoom } from "../../src/rooms/GameRoom";
import { gameModeRegistry } from "../../src/rooms/GameMode";
import { DropInFixturePlayerState, type DropInFixtureState } from "../../src/rooms/schema/GameRoomState";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const FIXTURE_MODE_ID = "dropInFixture";
// per-mode 契约版本取 catalog 单源（manifest.json）：⛔ 不写字面量，否则 manifest 一改就红。
const FIXTURE_MODE_VERSION = GAMEPLAY_CATALOG.dropInFixture.modeVersion;
const SID = 0;

after(async () => {
    await closeRedis();
});

const joinOptions = (): IGameRoomJoinOptions => ({
    v: GAME_ROOM_PROTOCOL_VERSION,
    sId: SID,
    mode: FIXTURE_MODE_ID,
    modeVersion: FIXTURE_MODE_VERSION,
    profile: "dropIn",
});

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await sleep(20);
    }
    assert.ok(predicate(), label);
}

test("drop-in 真栈：8 人同房即时开局 / 第 9 人新房 / 空位回填老房 / 宽限占座计容量", {
    timeout: 60_000,
}, async () => {
    await assertRedisUp();

    // fixture mode 临时登记（roster 满足 drop-in 注册期断言：min=1/autoStart=1；max=8 来自 manifest）。
    const unregisterFixture = gameModeRegistry.register(FIXTURE_MODE_ID, () => ({
        id: FIXTURE_MODE_ID,
        roster: { min: 1, max: 8, autoStart: 1 },
        createPlayer({ sessionId, name }: { sessionId: string; name: string }) {
            const player = new DropInFixturePlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
    }) as never);

    const server = new Server({
        transport: new WebSocketTransport(),
        gracefullyShutdown: false,
        greet: false,
        devMode: false,
    });
    server.define(RoomName.Game, GameRoom).filterBy(["sId", "mode", "profile"]);

    let listening = false;
    const rooms: SDKRoom[] = [];
    try {
        await server.listen(0);
        listening = true;
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;

        const connect = async (name: string): Promise<SDKRoom> => {
            const uid = testUid(name);
            const { token } = await issueSession(uid, null, "", SID);
            const sdk = new SDKClient(endpoint);
            sdk.auth.token = token;
            const room = await sdk.joinOrCreate(RoomName.Game, joinOptions());
            rooms.push(room);
            return room;
        };

        // ── 场景 ①：首人即开局；2..8 人 joinOrCreate 全部落同一房 ────────────────
        // 变异验证：去掉 onJoin autoStart 的 drop-in 分支 → 首房停在 Waiting，phase 断言红；
        // 去掉 onJoin phase 闸的 drop-in 分支 → 第 2 人起被 GameAlreadyStarted 拒，joinOrCreate 抛。
        const first = await connect("d1");
        const roomIdA = first.roomId;
        const serverRoomA = matchMaker.getLocalRoomById(roomIdA) as GameRoom;
        const viewA = serverRoomA.state as unknown as DropInFixtureState;
        await waitFor(() => viewA.phase === GamePhase.Playing, "首人入座后房间必须已是 Playing");
        assert.equal(viewA.players.size, 1);
        assert.equal((serverRoomA as unknown as { maxClients: number }).maxClients, 8,
            "maxClients 必须来自 manifest maxPlayers=8（经 roster.max）");

        for (let index = 2; index <= 8; index++) {
            const member = await connect(`d${index}`);
            assert.equal(member.roomId, roomIdA, `第 ${index} 人必须撮合进同一 drop-in 房（Playing 中准入）`);
        }
        await waitFor(() => viewA.players.size === 8, "8 人全部落座");
        assert.equal(viewA.phase, GamePhase.Playing, "后续入座不重开局");

        // ── 场景 ②：第 9 人 → 新房（满员自动排除撮合，零新代码）────────────────
        // 变异验证：把 GameRoom.onCreate 的 `maxClients = mode.roster.max` 删掉 → 撮合层
        // 不知满员，第 9 人仍进老房，本断言红。
        const ninth = await connect("d9");
        const roomIdB = ninth.roomId;
        assert.notEqual(roomIdB, roomIdA, "第 9 人必须开新房");
        const serverRoomB = matchMaker.getLocalRoomById(roomIdB) as GameRoom;
        const viewB = serverRoomB.state as unknown as DropInFixtureState;
        await waitFor(() => viewB.phase === GamePhase.Playing, "新房同样首人即开局");

        // ── 场景 ③：老房出空位后回填（减员自动恢复撮合）────────────────────────
        // 变异验证：drop-in 开局若 lock 房间（去掉 performStartMatch 的 skip）→ 老房被显式锁死，
        // 减员不自动恢复，第 10 人只能进 B 房/新房，本断言红。
        await rooms[3].leave(true); // 老房一人主动离开（consented → 立即释放座位）
        await waitFor(() => viewA.players.size === 7, "老房出空位");
        await waitFor(() => !(serverRoomA as unknown as { locked: boolean }).locked,
            "减员后 Colyseus 自动解除满员锁");
        const backfill = await connect("d10");
        assert.equal(backfill.roomId, roomIdA, "空位必须优先回填老房（⛔ 不是新房）");
        await waitFor(() => viewA.players.size === 8, "回填后老房再次满员");

        // ── 场景 ④：断线重连宽限占座计入容量 ────────────────────────────────────
        // 变异验证：让非主动断线立即删除座位（去掉 allowReconnection 宽限）→ 老房出空位，
        // 第 11 人回填老房，本断言红。
        const dropped = rooms[5]; // 老房成员非主动断线（consented=false → 进入重连宽限）
        assert.equal(dropped.roomId, roomIdA);
        await dropped.leave(false);
        await sleep(200); // 让服务端进入 allowReconnection 宽限（座位保留）
        assert.equal(viewA.players.size, 8, "宽限内座位保留（players map 占座）");
        assert.equal((serverRoomA as unknown as { locked: boolean }).locked, true,
            "宽限内 reserved seat 计入 Colyseus 容量，老房保持满员锁");
        const eleventh = await connect("d11");
        assert.notEqual(eleventh.roomId, roomIdA, "宽限占座计入容量：第 11 人 ⛔ 不得进老房");
        assert.equal(eleventh.roomId, roomIdB, "有空位的既有房（B 房）优先于开新房");
    } finally {
        // 已离开/已断线的 SDK room 再次 leave() 的 promise 永不 settle（onLeave 已消费）；
        // 只对仍开着的连接 leave，并给每个 leave 一个兜底超时，⛔ 不让收尾把测试挂死。
        await Promise.allSettled(rooms
            .filter((room) => room.connection?.isOpen)
            .map((room) => Promise.race([room.leave(true), sleep(2_000)])));
        if (listening) await server.gracefullyShutdown(false);
        unregisterFixture();
    }
});
