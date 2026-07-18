import { listen } from "@colyseus/tools";
import app from "./app.config";
import { startInfraMonitors } from "./core/infra/loopMonitor";
import { registerAllRoutes } from "./websocket/loader";

// RPC 契约校验前置到启动期：shared 声明与 websocket/<域>/<接口>.ts 不齐 → 进程直接退出
// （否则要等第一个玩家 joinOrCreate("lobby") 才炸，部署看起来是绿的）。
// LobbyRoom.onCreate 仍会 await 同一个注册 Promise，多次调用无害。
await registerAllRoutes();

// 单线程「心电图」：事件循环延迟 p99 + MySQL 池排队（与 [rpc-budget] 告警配合定位）
startInfraMonitors();

// 端口取 PORT 环境变量，默认 2567
listen(app);
