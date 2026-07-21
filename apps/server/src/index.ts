import { listen } from "@colyseus/tools";
import app from "./app.config";
import { PORT } from "./core/infra/config";
import { startInfraMonitors } from "./core/infra/loopMonitor";
import { startStreamDepthAlert } from "./core/match/matchConsumer";
import { registerAllRoutes } from "./websocket/loader";

// RPC 契约校验前置到启动期：shared 声明与 websocket/<域>/<接口>.ts 不齐 → 进程直接退出
// （否则要等第一个玩家 joinOrCreate("lobby") 才炸，部署看起来是绿的）。
// LobbyRoom.onCreate 仍会 await 同一个注册 Promise，多次调用无害。
await registerAllRoutes();

// 单线程「心电图」：事件循环延迟 p99 + MySQL 池排队（与 [rpc-budget] 告警配合定位）
startInfraMonitors();

// 结算流深度告警：settle worker 没起/积压时网关必须看得见（流禁 MAXLEN，无人消费即无界）
startStreamDepthAlert();

// 端口统一走 config.PORT（根 .env.development 可覆盖，默认 2568）——⛔ 不依赖
// @colyseus/tools 的 process.env.PORT || 2567 隐式默认
listen(app, PORT);
