import { defineServer } from "colyseus";
import { gameRooms, registerGameRuntime } from "./game.config";
import { lobbyRooms } from "./lobby.config";
import { registerWorldRuntime, worldRooms, worldServerOptions } from "./world.config";
import { processServerOptions } from "./process.config";

registerGameRuntime();
registerWorldRuntime();

/** 本地默认合体配置；测试仍可 boot(server)。独立入口各自只登记一种房型。 */
export const server = defineServer({
    ...processServerOptions(),
    rooms: { ...lobbyRooms, ...gameRooms, ...worldRooms },
    // RedisDriver / Presence 使用固定键与 Pub/Sub 频道，须独立 Redis 实例。
    // 拆分时此配置只由 world 使用，lobby / game 不加入 world 的匹配池。
    ...worldServerOptions(),
});

export default server;
