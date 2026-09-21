import { createGameServer } from "../game.config";
import { GAME_PORT } from "../core/infra/config";
import { bootstrapProcess } from "../bootstrapProcess";

try {
    await bootstrapProcess(createGameServer(), "game", GAME_PORT);
} catch (error) {
    // Colyseus 的进程异常监听可能吞掉已停服后的再次退出；显式保留启动失败状态。
    process.exitCode = 1;
    throw error;
}
