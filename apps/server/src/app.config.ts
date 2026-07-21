import { defineServer, defineRoom, monitor, playground } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RoomName } from "@game/shared";
import { GameRoom } from "./rooms/GameRoom";
import { LobbyRoom } from "./websocket/LobbyRoom";
import { MAX_WS_PAYLOAD_BYTES } from "./core/infra/config";
import { routes } from "./http/index";
import { registerMockRoutes } from "./mock/index";

/**
 * Colyseus 0.17 服务端配置。
 *  - rooms：房间定义，房间名来自双端共享的 RoomName 常量
 *  - routes：服务端框架的真实 HTTP 端点（M3 wx-login / M6 支付回调，见 routes/index.ts）
 *  - express：挂载 HTTP 模拟接口（假数据）与开发工具
 *
 * `export const server` 供测试直接 boot(server)（@colyseus/testing），监听入口在 index.ts。
 */
export const server = defineServer({
    rooms: {
        [RoomName.Game]: defineRoom(GameRoom),
        // 网关大厅房（框架 M5）：取数/邮件/工会走单一 rpc 消息通道。连接需要框架 token
        //（/account/wx-login 签发），且依赖本地栈（npm --workspace @game/server run stack）；
        // 纯 mock 联调不 join 它即可，不影响 GameRoom。
        [RoomName.Lobby]: defineRoom(LobbyRoom),
    },

    routes,

    // 大包防护在 transport 层：超限断帧不解码（09·G4；dispatcher 校验只是兜底）
    transport: new WebSocketTransport({ maxPayload: MAX_WS_PAYLOAD_BYTES }),

    express: async (app) => {
        // 模拟 REST 接口（假数据）：扫描 mock/api/ 自动挂载（Colyseus 0.17 会 await 本钩子）
        await registerMockRoutes(app);

        // 房间监控面板：http://localhost:2568/monitor
        app.use("/monitor", monitor());

        // 开发调试台（非生产环境）：http://localhost:2568/
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
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
