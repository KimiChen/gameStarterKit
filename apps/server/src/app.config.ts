import { defineServer, defineRoom, monitor, playground } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RoomName } from "@game/shared";
import { GameRoom } from "./rooms/GameRoom";
import { LobbyRoom } from "./gateway/LobbyRoom";
import { MAX_WS_PAYLOAD_BYTES } from "./infra/config";
import { routes } from "./routes/index";
import { registerMockRoutes } from "./mock/routes";

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
        // 网关大厅房（框架 M5）：取数/排位/邮件走单一 rpc 消息通道。连接需要框架 token
        //（/account/wx-login 签发），且依赖本地栈（npm --workspace @game/server run stack）；
        // 纯 mock 联调不 join 它即可，不影响 GameRoom。
        [RoomName.Lobby]: defineRoom(LobbyRoom),
    },

    routes,

    // 大包防护在 transport 层：超限断帧不解码（09·G4；dispatcher 校验只是兜底）
    transport: new WebSocketTransport({ maxPayload: MAX_WS_PAYLOAD_BYTES }),

    express: (app) => {
        // 模拟 REST 接口（假数据），路径与协议见 @game/shared 的 ApiPath
        registerMockRoutes(app);

        // 房间监控面板：http://localhost:2568/monitor
        app.use("/monitor", monitor());

        // 开发调试台（非生产环境）：http://localhost:2568/
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }
    },

    // 横向扩展时改这里即可，房间代码不动：
    // presence: new RedisPresence(), driver: new RedisDriver(), publicAddress: "...",
});

export default server;
