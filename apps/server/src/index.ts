import { listen } from "@colyseus/tools";
import app from "./app.config";
import { PORT } from "./core/infra/config";
import { startInfraMonitors } from "./core/infra/loopMonitor";
import { startStreamDepthAlert, stopStreamDepthAlert } from "./core/match/matchConsumer";
import { setKickHandler, startKickConsumer, stopKickConsumer } from "./core/auth/kickBus";
import { kickUser } from "./websocket/push";
import { registerAllRoutes } from "./websocket/loader";
import {
  beginShutdown,
  defaultLifecycle,
  drainTasks,
} from "./core/infra/lifecycle";
import { closeMysql } from "./core/infra/mysql";
import { closeRedis } from "./core/infra/redisRoute";
import {
  startCharacterRepairWorker,
  stopCharacterRepairWorker,
} from "./player/characterRepair";
import { clearCharacterReadyFlights, drainCharacterReadyFlights } from "./player/character";
import { closeWebPlatformClient } from "./platform/webPlatformClient";
import { stopMailWakeLoop } from "./websocket/push";
import {
  createOrderedProducerStopper,
  installShutdownAggregator,
  runShutdownCleanup,
} from "./shutdown";

let infraMonitorStop: (() => Promise<void>) | null = null;

/**
 * Stop producers before Colyseus starts disposing rooms.  Each stop is kept
 * best-effort so one broken adapter cannot prevent the remaining consumers and
 * timers from being released.
 */
const stopBackgroundProducers = createOrderedProducerStopper([
  { name: "infra-monitors", stop: async () => { await infraMonitorStop?.(); } },
  { name: "stream-depth-alert", stop: stopStreamDepthAlert },
  { name: "kick-consumer", stop: stopKickConsumer },
  { name: "character-repair", stop: stopCharacterRepairWorker },
  { name: "mailwake", stop: stopMailWakeLoop },
]);

async function finishShutdown(): Promise<void> {
  // Rooms have already gone through onLeave/onDispose when this callback runs;
  // only now is it safe to await detached work that can touch their stores.
  await runShutdownCleanup(stopBackgroundProducers, [
    { name: "character-ready", work: drainCharacterReadyFlights },
    { name: "detached-tasks", work: drainTasks },
    { name: "registered-resources", work: () => defaultLifecycle.disposeAll() },
  ]);
}

/**
 * 启动与停服共用一个生命周期边界。
 *
 * `Server.onBeforeShutdown` 只有一个 callback 槽位；所有默认组件必须通过
 * 这里的 registry 汇总，否则后注册的 cleanup 会静默覆盖先注册的 worker。
 */
try {
  // 先登记底层连接，保证启动中途失败或正常停服时都能释放已创建资源；
  // close 函数对尚未惰性创建的连接是 no-op。
  defaultLifecycle.register("redis", closeRedis);
  defaultLifecycle.register("mysql", closeMysql);
  defaultLifecycle.register("webplatform", closeWebPlatformClient);

  // RPC 契约校验前置到启动期：shared 声明与 websocket/<域>/<接口>.ts 不齐 → 进程直接退出
  //（否则要等第一个玩家 joinOrCreate("lobby") 才炸，部署看起来是绿的）。
  // LobbyRoom.onCreate 仍会 await 同一个注册 Promise，多次调用无害。
  await registerAllRoutes();

  // 单线程「心电图」：事件循环延迟 + MySQL 池排队（与 [rpc-budget] 告警配合定位）
  infraMonitorStop = startInfraMonitors();

  // 结算流深度告警：settle worker 没起/积压时网关必须看得见（流禁 MAXLEN，无人消费即无界）
  startStreamDepthAlert();

  // 控制总线踢人（DUAL_MODE §2.3 / M12d）：本节点独立游标消费 stream:kick → 自筛踢在线连接
  setKickHandler(kickUser);
  startKickConsumer();

  // 角色档已创建但 WebPlatform PUT 登记失败的 durable 修复：网关多实例可重复处理，远端 PUT 幂等；
  // worker 只在成功后清 intent，故崩溃不丢。registry 会等待当前有界 pass。
  startCharacterRepairWorker();

  // Colyseus 只注册一次 shutdown aggregator；组件自己的 start 函数会把动态资源
  //（例如 Lobby 首次创建时才启动的 mail wake）追加到同一 registry。
  installShutdownAggregator(app, {
    beginShutdown,
    clearCharacterReadyFlights,
    stopBackgroundProducers,
    finishShutdown,
  });

  // 端口统一走 config.PORT（根 .env.development 可覆盖，默认 2568）——⛔ 不依赖
  // @colyseus/tools 的 process.env.PORT || 2567 隐式默认
  await listen(app, PORT);
} catch (error) {
  // 启动半失败也走同一释放路径；汇总 cleanup 错误后保留原始启动异常。
  beginShutdown();
  clearCharacterReadyFlights();
  await finishShutdown();
  throw error;
}
