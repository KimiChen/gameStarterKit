import { defineServer, defineRoom, monitor, playground } from "colyseus";
import { RoomName } from "@game/shared";
import { GameRoom } from "./rooms/GameRoom";
import { registerMockRoutes } from "./mock/routes";

/**
 * Colyseus 0.17 服务端配置。
 *  - rooms：房间定义，房间名来自双端共享的 RoomName 常量
 *  - express：挂载 HTTP 模拟接口（假数据）与开发工具
 */
const server = defineServer({
    rooms: {
        [RoomName.Game]: defineRoom(GameRoom),
    },

    express: (app) => {
        // 模拟 REST 接口（假数据），路径与协议见 @game/shared 的 ApiPath
        registerMockRoutes(app);

        // 房间监控面板：http://localhost:2567/monitor
        app.use("/monitor", monitor());

        // 开发调试台（非生产环境）：http://localhost:2567/
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }
    },
});

export default server;
