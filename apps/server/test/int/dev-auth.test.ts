/**
 * dev 身份提供者的真链集成测试（真 Redis/MySQL/HTTP/WS，⛔ 不 mock——
 * 先 `npm --workspace @game/server run stack`）：
 *  ① POST /v1/sessions/dev 形状合法（锁定契约 validator 复核）+ 同 devKey 稳定同账号；
 *  ② GET /v1/areas 单服目录（serverId=0、可进入）；
 *  ③ dev token 全链：Lobby join（sess 快路径）+ GameRoom join（dev provider 权威 verify）；
 *  ④ 角色登记落 MySQL：join 前 false、join 后经真链路 ensure 链收敛为 ready；
 *  ⑤ 错误路径：未知/被顶 token verify 拒绝、畸形请求 400、register 对无 profile 拒（user cold）。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import express, { type Application } from "express";
import type { AddressInfo } from "node:net";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    GAME_ROOM_PROTOCOL_VERSION,
    GAMEPLAY_CATALOG,
    LOBBY_PROTOCOL_VERSION,
    RoomName,
    validateWebPlatformAreaListResponse,
    validateWebPlatformLoginResponse,
    type IGameRoomJoinOptions,
} from "@game/shared";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { defaultLifecycle } from "../../src/core/infra/lifecycle";
import { closeMysql } from "../../src/core/infra/mysql";
import { mountDevPublicEndpoints } from "../../src/http/_support/devPublic";
import { createDevAuthProvider, devUidOf } from "../../src/platform/devAuthProvider";
import { closeWebPlatformClient, installWebPlatformClient } from "../../src/platform/webPlatformClient";
import { GameRoom } from "../../src/rooms/GameRoom";
import { gameModeRegistry } from "../../src/rooms/GameMode";
import { createIdleGameMode } from "../../src/rooms/modes/idle/index";
import { LobbyRoom } from "../../src/websocket/LobbyRoom";
import { assertRedisUp, sleep } from "./helpers";

after(async () => {
    closeWebPlatformClient(); // keep-alive HTTP agent 会挂住事件循环
    await defaultLifecycle.disposeAll(); // Lobby join 留下的 mailwake/kick/stream 循环与 infra monitors
    await closeRedis();
    await closeMysql();
});

type DevServer = {
    endpoint: string;
    close(): Promise<void>;
};

async function bootDevServer(): Promise<DevServer> {
    const app: Application = express();
    mountDevPublicEndpoints(app);
    const http = await new Promise<ReturnType<Application["listen"]>>((resolve) => {
        const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const address = http.address() as AddressInfo;
    return {
        endpoint: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => http.close((e) => (e ? reject(e) : resolve()))),
    };
}

test("dev-auth 真链：登录/选服/权威 verify/角色登记/双房 join", { timeout: 60_000 }, async () => {
    await assertRedisUp();
    installWebPlatformClient(createDevAuthProvider());
    const provider = createDevAuthProvider();

    const dev = await bootDevServer();
    const unregisterIdle = gameModeRegistry.register("idle", () => createIdleGameMode());
    const server = new Server({
        transport: new WebSocketTransport(),
        gracefullyShutdown: false,
        greet: false,
        devMode: false,
    });
    server.define(RoomName.Game, GameRoom).filterBy(["sId", "mode", "profile"]);
    server.define(RoomName.Lobby, LobbyRoom);
    const joined: SDKRoom[] = [];
    try {
        await server.listen(0);
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const wsEndpoint = `http://127.0.0.1:${address.port}`;

        // ① dev 登录（HTTP 契约面）
        const login = await fetch(`${dev.endpoint}/v1/sessions/dev`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ devKey: "int-tester", serverId: 0 }),
        });
        assert.equal(login.status, 200, `dev 登录必须 200：${login.status}`);
        const loginBody = validateWebPlatformLoginResponse(await login.json());
        assert.equal(loginBody.userId, devUidOf("int-tester"), "uid 必须由 devKey 稳定派生");
        assert.ok(loginBody.accessToken.length > 0);

        // ①b 同 devKey 再登：同一账号、token 轮换（顶号语义由 writeGroupSess 承担）
        const relogin = await fetch(`${dev.endpoint}/v1/sessions/dev`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ devKey: "int-tester", serverId: 0 }),
        });
        const reloginBody = validateWebPlatformLoginResponse(await relogin.json());
        assert.equal(reloginBody.userId, loginBody.userId);
        assert.notEqual(reloginBody.accessToken, loginBody.accessToken, "重复登录必须换发 token");
        // ①c 旧 token 已被顶掉：dev provider 按「索引反查 + sess hash 比对」判失效
        await assert.rejects(provider.verify(loginBody.accessToken, 0), /session 不存在或已过期/);
        // ⑤a 畸形请求 400
        const bad = await fetch(`${dev.endpoint}/v1/sessions/dev`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ devKey: "", serverId: 0 }),
        });
        assert.equal(bad.status, 400, "畸形请求必须 400");

        const token = reloginBody.accessToken;

        // ② 选服目录：gameHttpUrl/gameWsUrl 必须跟随请求方 Host——⛔ 不得写死
        // 127.0.0.1（登录流程拿到目录会用它重建 HTTP 底座，写死时局域网设备转去连自己）
        const areas = await fetch(`${dev.endpoint}/v1/areas`);
        const areaBody = validateWebPlatformAreaListResponse(await areas.json());
        assert.equal(areaBody.servers.length, 1);
        assert.equal(areaBody.servers[0].serverId, 0);
        assert.ok(areaBody.servers[0].openTime > 0, "dev 服必须可进入");
        const devHost = new URL(dev.endpoint).host;
        assert.equal(areaBody.servers[0].gameHttpUrl, `http://${devHost}`,
            "gameHttpUrl 必须跟随请求方 Host（LAN 调试前提）");
        assert.equal(areaBody.servers[0].gameWsUrl, `ws://${devHost}`);

        // ③ Lobby join（sess 快路径）
        const sdk = new SDKClient(wsEndpoint);
        sdk.auth.token = token;
        const lobby = await sdk.joinOrCreate(RoomName.Lobby, { v: LOBBY_PROTOCOL_VERSION });
        joined.push(lobby);
        assert.ok(lobby.roomId.length > 0, "dev token 必须能进 Lobby");

        // ③ GameRoom join（dev provider 权威 verify 路径）
        const joinOptions: IGameRoomJoinOptions = {
            v: GAME_ROOM_PROTOCOL_VERSION,
            sId: 0,
            mode: "idle",
            modeVersion: GAMEPLAY_CATALOG.idle.modeVersion,
            profile: "default",
        };
        const sdk2 = new SDKClient(wsEndpoint);
        sdk2.auth.token = token;
        const game = await sdk2.joinOrCreate(RoomName.Game, joinOptions);
        joined.push(game);
        await sleep(300);
        const serverRoom = matchMaker.getLocalRoomById(game.roomId);
        assert.ok(serverRoom, "房间必须已在服务端建立");

        // ④ 角色登记（MySQL marker）：join 触发真链路 ensure 链（pending → registerCharacter
        // → ready），join 后必须收敛为 true——dev provider 被真链路真实消费过；
        // 「user cold」契约顺带钉住：register 只允许标已有 profile（无档即拒）。
        assert.equal(await provider.hasCharacter(loginBody.userId, 0), true,
            "join 后角色登记必须收敛为 ready（真链路 ensure 链真实消费 dev provider）");
        const freshUid = devUidOf("int-never-joined");
        assert.equal(await provider.hasCharacter(freshUid, 0), false, "未建 profile 必须 false");
        await assert.rejects(provider.registerCharacter(freshUid, 0), /cold/,
            "registerCharacter 对无 profile 的 uid 必须按 user cold 拒绝（只标已有 profile）");

        // ⑤b 未知 token：权威 verify 拒绝
        await assert.rejects(provider.verify("no-such-token", 0), /session 不存在或已过期/);
    } finally {
        await Promise.allSettled(joined
            .filter((room) => room.connection?.isOpen)
            .map((room) => Promise.race([room.leave(true), sleep(2_000)])));
        await server.gracefullyShutdown(false);
        unregisterIdle();
        await dev.close();
    }
});
