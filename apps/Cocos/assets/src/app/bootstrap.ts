/**
 * bootstrap（Non-intrusive §7.2 阶段 5b）：一次 Cocos scene owner 生命周期的装配入口。
 * 原 Main.onLoad/start 的启动编排逐字迁入；Main.ts 只保留 @property 转发、分辨率
 * 设置、update/onDestroy 转发与模块级 installWeChatCompat()。
 *
 * 固定次序（启动不变量，mainGameplay.test.ts 钉住）：
 *  initHttp → initPortal → runtime 会话/生命周期订阅（transport 丢失必须先拆玩法
 *  generation，再让导航层挂 Login）→ wireConnectionEvents（transport→bus→
 *  SessionCoordinator 派生）→ installCocosLifecycleBridge → startNavigation
 *  （openLogin 等价入口，必须最后：页面挂载前所有事件接线已就绪）。
 */
import { DEV_SERVER_URL } from "../core/devEnv";
import { initHttp, initPortal } from "../core/http";
import { AppRuntime } from "./AppRuntime";
import { installCocosLifecycleBridge } from "./CocosLifecycleBridge";
import { lifecycleBus, wireConnectionEvents } from "./wiring";
import { lobbyTransportHub } from "../net/LobbyTransportHub";
import {
  validateLobbyTransportConfig,
  type LobbyTransportConfig,
} from "../net/lobbyTransportConfig";
import type { Node } from "cc";

/**
 * 浏览器预览的局域网调试参数（web 预览：`http://<开发机IP>:7456/?server=http://<游戏服IP>:2568`）：
 * `?server=<http(s) origin>` 覆盖 serverUrl；portalUrl 空串时跟随同一地址（dev 下 portal 即
 * 游戏服自身）。非浏览器环境（无 location）返回 null；非法 origin 由 initHttp/initPortal
 * 既有校验 fail-fast。⛔ 只做读取，不写任何配置。
 */
export function serverUrlFromQuery(): string | null {
  const location = (globalThis as { location?: { search?: string } }).location;
  const search = location?.search;
  if (!search) return null;
  const value = new URLSearchParams(search).get("server");
  return value && value.trim() !== "" ? value : null;
}

/**
 * 浏览器预览的原生 Lobby 调试参数：
 * `http://<开发机IP>:7456/?lobby=native&lobbyUrl=ws://<serverNew>:18091`。
 *
 * 这是**唯一**能在浏览器预览里显式选择 Lobby transport 的入口：场景资产只序列化了
 * `serverUrl`/`portalUrl`，`Main.lobbyTransportKind` 保持缺省，所以真实 Creator 预览
 * 默认只能驱动旧 Colyseus 通道；要在预览里驱动原生通道就得有这条读取。
 *
 * ⛔ 解析失败一律抛出、不静默回落：`?lobby=native` 少给 `lobbyUrl`、或 `lobbyUrl` 不是
 * ws(s) origin，都必须在装配期 fail-fast。静默回落会把它变成「悄悄连了旧通道」——那种
 * 假绿灯正是本参数要消除的东西。非法 origin 的判定复用 validateLobbyTransportConfig
 * （单一真源），本函数不另写一套。
 */
export function lobbyTransportFromQuery(): LobbyTransportConfig | null {
  const location = (globalThis as { location?: { search?: string } }).location;
  const search = location?.search;
  if (!search) return null;
  const params = new URLSearchParams(search);
  const kind = params.get("lobby")?.trim();
  if (!kind) return null;
  if (kind === "colyseus") return validateLobbyTransportConfig({ kind });
  if (kind !== "native" && kind !== "native-websocket")
    throw new Error(`未知的 lobby 查询参数：${kind}`);
  const endpoint = params.get("lobbyUrl")?.trim();
  if (!endpoint)
    throw new Error("?lobby=native 必须同时给出 lobbyUrl=<ws(s)://…>");
  return validateLobbyTransportConfig({ kind: "native-websocket", endpoint });
}

export interface AppBootstrapOptions {
  readonly node: Node;
  /** 服务端 http(s) 地址；空串回落 DEV_SERVER_URL（跟随根 .env.development 的 PORT）。 */
  readonly serverUrl: string;
  /** WebPlatform Public http(s) 地址（登录 + 选服）；空串回落 DEV_SERVER_URL——
   *  dev 模式下 portal 即游戏服自身（服务端 AUTH_PROVIDER=dev 复刻 /v1/sessions/dev
   *  与 /v1/areas 的锁定契约形状），生产/联调外部服务时显式填写 WebPlatform origin。 */
  readonly portalUrl: string;
  /** 默认旧 Colyseus；原生 Lobby 只可通过此显式选择与独立 endpoint 接入。
   *  优先级：`?lobby=` 查询参数（浏览器预览调试）> 本字段（场景显式配置）> 缺省 colyseus。 */
  readonly lobbyTransport?: LobbyTransportConfig;
  readonly gameplayId?: string;
}

/**
 * 装配并启动应用宿主。同步返回 AppRuntime（导航启动是异步的，错误在宿主内观察）；
 * Main.update/onDestroy 分别转发 runtime.tick/dispose。
 */
export function createAppRuntime(options: AppBootstrapOptions): AppRuntime {
  // 查询参数优先：预览调试要能覆盖场景缺省，否则原生通道在真实 GUI 里不可达。
  lobbyTransportHub.configure(
    lobbyTransportFromQuery() ??
      options.lobbyTransport ?? { kind: "colyseus" },
  );
  const runtime = new AppRuntime({
    node: options.node,
    gameplayId: options.gameplayId,
  });
  const serverUrl = options.serverUrl || serverUrlFromQuery() || DEV_SERVER_URL;
  initHttp(serverUrl);
  // portal 空串时跟随同一游戏服地址（dev 下 portal 即游戏服自身）。
  initPortal(options.portalUrl || serverUrl);
  // Register before opening pages so transport loss always tears down the
  // gameplay generation before the navigation layer mounts Login again.
  runtime.wireSessionLifecycle();
  // Transport 连接事件 → LifecycleBus → SessionCoordinator 派生：必须先于任何
  // 页面挂载接通（应用级接线跨场景保持）。
  wireConnectionEvents();
  runtime.trackDisposer(installCocosLifecycleBridge(lifecycleBus));
  void runtime.startNavigation();
  return runtime;
}
