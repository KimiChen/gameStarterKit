import { listen } from "@colyseus/tools";
import type { Server } from "colyseus";
import { startInfraMonitors } from "./core/infra/loopMonitor";
import { startStreamDepthAlert, stopStreamDepthAlert } from "./core/match/matchConsumer";
import { setKickHandler, startKickConsumer, stopKickConsumer } from "./core/auth/kickBus";
import { kickUser, pushLocalHandlers, stopMailWakeLoop } from "./websocket/push";
import { registerAllRoutes } from "./websocket/loader";
import { beginShutdown, defaultLifecycle, drainTasks } from "./core/infra/lifecycle";
import { closeMysql } from "./core/infra/mysql";
import { closeRedis } from "./core/infra/redisRoute";
import { startCharacterRepairWorker, stopCharacterRepairWorker } from "./player/characterRepair";
import { clearCharacterReadyFlights, drainCharacterReadyFlights } from "./player/character";
import { closeWebPlatformClient } from "./platform/webPlatformClient";
import { setPushLocalHandlers, startPushConsumer, stopPushConsumer } from "./core/push/pushBus";
import { createOrderedProducerStopper, installShutdownAggregator, runShutdownCleanup } from "./shutdown";

export type ProcessRole = "combined" | "lobby" | "game" | "world";

/** 锁定版本的 Colyseus 监听在 EADDRINUSE 时可能悬挂；预先订阅 transport 的真实错误。 */
export async function listenProcessServer(app: Server, port: number): Promise<void> {
    const transportServer = app.transport.server;
    await new Promise<void>((resolve, reject) => {
        const finish = (error?: unknown) => {
            transportServer?.removeListener("error", fail);
            if (error !== undefined) reject(error);
            else resolve();
        };
        const fail = (error: Error) => finish(error);
        transportServer?.once("error", fail);
        void listen(app, port).then(() => finish(), fail);
    });
}

const production = {
    registerResources: () => {
        defaultLifecycle.register("redis", closeRedis);
        defaultLifecycle.register("mysql", closeMysql);
        defaultLifecycle.register("webplatform", closeWebPlatformClient);
    },
    registerAllRoutes, startInfraMonitors, startStreamDepthAlert, stopStreamDepthAlert,
    installLobbyHandlers: () => { setKickHandler(kickUser); setPushLocalHandlers(pushLocalHandlers); },
    clearLobbyHandlers: () => { setKickHandler(null); setPushLocalHandlers(null); },
    startKickConsumer, stopKickConsumer, startCharacterRepairWorker, stopCharacterRepairWorker,
    startPushConsumer, stopPushConsumer, stopMailWakeLoop,
    beginShutdown, clearCharacterReadyFlights, drainCharacterReadyFlights, drainTasks,
    disposeResources: () => defaultLifecycle.disposeAll(),
    listen: listenProcessServer,
    stopServer: (app: Server) => app.gracefullyShutdown(false),
};

/** 依赖注入只用于验证真实装配顺序；四个生产入口都用同一默认实现。 */
export type BootstrapDependencies = typeof production;

/** 按角色启动后台任务；停服：封准入 → 停生产者 → 房间释放 → 排空任务 → 关连接。 */
export async function bootstrapProcess(
    app: Server, role: ProcessRole, port: number, deps: BootstrapDependencies = production,
): Promise<void> {
    const lobby = role === "combined" || role === "lobby";
    const game = role === "combined" || role === "game";
    const world = role === "combined" || role === "world";
    let infraMonitorStop: (() => Promise<void>) | null = null;
    const stopBackgroundProducers = createOrderedProducerStopper([
        { name: "infra-monitors", stop: async () => { await infraMonitorStop?.(); } },
        ...(game ? [{ name: "stream-depth-alert", stop: deps.stopStreamDepthAlert }] : []),
        ...(lobby ? [
            { name: "kick-consumer", stop: deps.stopKickConsumer },
            { name: "character-repair", stop: deps.stopCharacterRepairWorker },
            { name: "mailwake", stop: deps.stopMailWakeLoop },
        ] : []),
        ...(lobby || world ? [{ name: "push-bus", stop: deps.stopPushConsumer }] : []),
    ]);
    let finishing: Promise<void> | null = null;
    const finishShutdown = () => finishing ??= runShutdownCleanup(stopBackgroundProducers, [
        { name: "character-ready", work: deps.drainCharacterReadyFlights },
        { name: "detached-tasks", work: deps.drainTasks },
        { name: "registered-resources", work: deps.disposeResources },
    ]);
    try {
        deps.registerResources();
        if (lobby) {
            await deps.registerAllRoutes();
            deps.installLobbyHandlers();
        } else {
            // HTTP 也可能 import websocket/push；显式归零避免 import 副作用决定角色。
            deps.clearLobbyHandlers();
        }
        infraMonitorStop = deps.startInfraMonitors();
        if (game) deps.startStreamDepthAlert();
        if (lobby) deps.startKickConsumer();
        if (lobby || world) deps.startPushConsumer(role === "world" ? "room" : role === "lobby" ? "lobby" : "all");
        if (lobby) deps.startCharacterRepairWorker();
        installShutdownAggregator(app, {
            beginShutdown: deps.beginShutdown,
            clearCharacterReadyFlights: deps.clearCharacterReadyFlights,
            stopBackgroundProducers,
            finishShutdown,
        });
        await deps.listen(app, port);
        console.info(`[process] ${role} listening on ${port}`);
    } catch (error) {
        deps.beginShutdown();
        deps.clearCharacterReadyFlights();
        // Server 构造/半监听也拥有 transport、driver、presence；底层业务连接释放不能替代它。
        await runShutdownCleanup(stopBackgroundProducers, [
            { name: "colyseus-server", work: () => deps.stopServer(app) },
            { name: "process-resources", work: finishShutdown },
        ]);
        throw error;
    }
}
