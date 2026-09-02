import { defineServer, defineRoom, monitor, playground } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RoomName } from "@game/shared";
import { GameRoom } from "./rooms/GameRoom";
import { assertRoomProfilesConfigured } from "./rooms/core/RoomProfile";
import { registerDefaultGameModes } from "./rooms/modes/catalog";
import { LobbyRoom } from "./websocket/LobbyRoom";
import { AUTH_PROVIDER, MAX_WS_PAYLOAD_BYTES } from "./core/infra/config";
import { routes } from "./http/index";
import { mountDevPublicEndpoints } from "./http/_support/devPublic";
import { createDevAuthProvider } from "./platform/devAuthProvider";
import { installWebPlatformClient } from "./platform/webPlatformClient";

registerDefaultGameModes();
// 启动期断言（Non-intrusive §6.2/§4.6）：catalog 声明的每个 (mode, profile) 都有 policy 定义、
// owner-ready/invite profile 的 state fragment 存在；配对不等式已在 config 加载期断言。
assertRoomProfilesConfigured();

// AUTH_PROVIDER=dev（铁律 12 的非生产显式例外；config.ts 的生产闸在此之前已拒）：
// 安装进程内开发身份提供者 + 挂载 dev 公开端点（登录/选服复刻锁定契约路径）。
if (AUTH_PROVIDER === "dev") {
    installWebPlatformClient(createDevAuthProvider());
}

/**
 * Colyseus 0.17 服务端配置。
 *  - rooms：房间定义，房间名来自双端共享的 RoomName 常量
 *  - routes：游戏服自己的真实 HTTP 端点（健康检查、版本、对时、公告，以及可选的 kick 与支付回调，见 http/index.ts）
 *  - express：挂载开发工具（monitor / playground）
 *
 * `export const server` 供测试直接 boot(server)（@colyseus/testing），监听入口在 index.ts。
 */
export const server = defineServer({
    rooms: {
        // ⚠ **区服/玩法/组合撮合硬闸**：`filterBy(["sId", "mode", "profile"])` 只匹配同区同
        //   玩法同 profile 的房（⛔ 不加 sId 则 1 区与 2 区玩家会被撮合进同一场对局 —— 而战斗
        //   路径不碰 per-zone 键，`keys.ts` 的 fail-fast 逮不到，属**静默混区**；profile 一次性
        //   扩入过滤键，Non-intrusive §6.6——不同房间组合互不混撮）。
        // ⚠ 必须与 `groupAdmitsZone` 的「缺 sId 收紧」成对：filterBy 只在 options **含** 该键时
        //   才纳入过滤（`RegisteredHandler.getFilterOptions` 用 hasOwnProperty），缺 sId 的 join
        //   会绕过过滤匹配到任意房。单形态（不带 sId）两侧都无该键，互相匹配，行为不变；
        //   本版本 profile 仍可选（缺省注入 "default" 发生在校验层，两侧都不带即互相匹配，
        //   wire 兼容零破坏；必填收紧随下一版本 bump）。邀请码房在创建期 setPrivate(true)，
        //   ⛔ 不进普通撮合候选，⛔ roomCode 不进 filterBy/metadata（§6.6）。
        [RoomName.Game]: defineRoom(GameRoom).filterBy(["sId", "mode", "profile"]),
        // 网关大厅房（框架 M5）：取数/邮件/工会走单一 rpc 消息通道。连接需要 WebPlatform
        // Public API 签发的 token，strict auth 通过 Internal HTTP 回源；
        // 不需要大厅功能的联调不 join 它即可，不影响 GameRoom。
        [RoomName.Lobby]: defineRoom(LobbyRoom),
    },

    routes,

    // 大包防护在 transport 层：超限断帧不解码（09·G4；dispatcher 校验只是兜底）
    transport: new WebSocketTransport({ maxPayload: MAX_WS_PAYLOAD_BYTES }),

    express: async (app) => {

        if (AUTH_PROVIDER === "dev") {
            mountDevPublicEndpoints(app); // /v1/sessions/dev + /v1/areas（dev 登录/选服）
        }

        // ⚠ **管理面全部只在非生产挂载**：/monitor 不只是查看页——它带房间管理能力
        // （列房间/查连接/踢人/销毁房），裸挂生产 = 未鉴权的运维后台。
        // 生产要用请置于**已鉴权的反向代理之后**并显式开 ADMIN_PANEL_ENABLED（届时另加鉴权，勿直接放开）。
        if (process.env.NODE_ENV !== "production") {
            app.use("/monitor", monitor());   // 房间监控面板：http://localhost:2568/monitor
            app.use("/", playground());       // 开发调试台：http://localhost:2568/
        }
    },

    // 横向扩展时改这里即可，房间代码不动：
    // presence: new RedisPresence(), driver: new RedisDriver(), publicAddress: "...",
    // ⚠ 多项目共用 Redis 的 PROJECT_ID 前缀只覆盖业务键（keys.ts）：RedisDriver/RedisPresence
    //   用固定键名 roomcaches/roomcount，不可加前缀（tools/m0/colyseus-redis-probe.ts 实测）。
    //   启用横向扩展时各项目**必须独立 Redis 实例**承载 driver/presence——
    //   ⛔ 独立 db 不够：Pub/Sub 是实例全局的（不分 db），$lobby/匹配协调等固定频道
    //   跨项目必撞，故障形态是静默错乱（幽灵房间/匹配混淆）而非报错。
    //   （自维「键+频道全带前缀」的 driver/presence 封装技术上可行但贴内部实现，不推荐。）
});

export default server;
