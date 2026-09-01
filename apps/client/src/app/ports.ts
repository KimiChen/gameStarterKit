/**
 * ports（Non-intrusive §7.2 阶段 5b）：feature 可见的**最小能力面**。
 *
 * 这不是通用 DI 容器：feature ⛔ 不得拿到原始 WebSocketClient/RoomClient/SDK Room、
 * Redis key 或任意服务定位器——只取得完成自身行为所需的最小 port。静态门禁
 * （appExitConditions.test.ts 的值导入禁令雏形）与本约定配对。
 *
 * 通道：
 *  - navigation / views：业务路由（open 经 NavigationService，route ownership handle）；
 *  - lobbyRpc：query（只读）+ sendIdempotent（幂等写，PendingOperationJournal
 *    write-ahead 包装：条目先落 inflight 再 send，结算 applied/unknown/failed）；
 *  - session：只读会话视图（⛔ 无 setSession/clearSession——凭证生命周期归 Coordinator）；
 *  - clock：单调时钟 port（Logic 不读引擎时间）；
 *  - ticker：route-scoped 帧回调（signal abort 自动解绑）；
 *  - lifecycle：连接/宿主事件订阅（连接订阅带快照回放，晚到订阅者不错过 ready；
 *    经 runtime 追踪，app dispose 时强制解绑）；
 *  - launch：enterBattle 通道（feature ⛔ 不自行 join/rejoin）。
 */
import { WebSocketClient } from "../net/WebSocketClient";
import type {
    LobbyConnectionListener,
    LobbyConnectionSnapshot,
} from "../net/connectionEvents";
import {
    getSessionGeneration,
    getSessionProfile,
    getUserId,
    isLoggedIn,
} from "./SessionCoordinator";
import type {
    LobbyRpcIdemType,
    LobbyRpcType,
    RpcReq,
    RpcRes,
    IUserView,
} from "../shared/index";
import type { FeatureLaunchTarget } from "./builtinFeature";
import type { FrameScheduler } from "./FrameScheduler";
import type { LifecycleBus, HostLifecycleEvent } from "./LifecycleBus";
import type { NavigationService, NavRouteHandle } from "./NavigationService";
import type { PendingOperationJournal } from "./PendingOperationJournal";

export interface NavigationPort {
    open(routeId: string): Promise<NavRouteHandle>;
    replace(routeId: string): Promise<NavRouteHandle>;
    back(): void;
    close(routeId: string): void;
    closeGroup(group: string): void;
}

export interface LobbyRpcPort {
    /** 只读查询：无副作用路由，断线由调用方按可重试失败处理。 */
    query<T extends LobbyRpcType>(type: T, payload: RpcReq<T>): Promise<RpcRes<T>>;
    /**
     * 幂等写：journal write-ahead（§7.2 约束 1）→ rpcIdem（外部 clientReqId）→
     * 结算。journal 满时 fail-closed 抛 JournalFullError（⛔ 不淘汰未决条目）。
     */
    sendIdempotent<T extends LobbyRpcIdemType>(
        type: T,
        payload: Omit<RpcReq<T>, "clientReqId">,
    ): Promise<RpcRes<T>>;
}

export interface SessionReadPort {
    getUserId(): string;
    isLoggedIn(): boolean;
    getSessionGeneration(): number;
    getSessionProfile(): IUserView | null;
}

export interface ClockPort {
    /** 单调毫秒时钟（Logic 唯一可见的时间源）。 */
    now(): number;
}

export interface TickerPort {
    /** route-scoped 帧回调：signal abort 自动解绑；返回显式解绑器。 */
    add(callback: (dt: number) => void, signal?: AbortSignal): () => void;
}

export interface LifecyclePort {
    /** 连接事件订阅（订阅即回放当前快照，晚到订阅者不错过 ready）。 */
    subscribeConnection(listener: LobbyConnectionListener): () => void;
    getConnectionState(): LobbyConnectionSnapshot;
    /** 宿主 hide/show 订阅（经 LifecycleBus host 通道）。 */
    subscribeHost(listener: (event: HostLifecycleEvent) => void): () => void;
}

export interface ViewsPort {
    /** open 经 navigation（§7.2：feature 不直接触达 ViewMgr）。 */
    open(routeId: string): Promise<NavRouteHandle>;
}

export interface LaunchPort {
    /** Home「进入战斗」的命令通道（并发点击由宿主合流）。 */
    enterBattle(): Promise<void>;
    /**
     * §7.4：统一玩法启动通道——Home 菜单 contribution 点击的唯一出口。
     * target 来自 generated menu contribution；未注入专用 launch 时回退 enterBattle。
     * ⛔ feature install() 内不得 await 对自身 gameplay target 的 ports.launch——
     * 宿主闸会与该 feature 自身的 in-flight install 合流，install 等它自己完成，
     * 循环 await 静默挂死（FeatureHost.launch 合流分支的同款警告）。
     */
    launch(target: FeatureLaunchTarget): Promise<void>;
}

export interface AppPorts {
    readonly navigation: NavigationPort;
    readonly lobbyRpc: LobbyRpcPort;
    readonly session: SessionReadPort;
    readonly clock: ClockPort;
    readonly ticker: TickerPort;
    readonly lifecycle: LifecyclePort;
    readonly views: ViewsPort;
    readonly launch: LaunchPort;
}

/** 判定 RPC 失败是否属于「结果未知」（连接层失败）而非确定性拒绝。 */
function isResultUnknownError(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code;
    return code === "CONN_LOST" || code === "TIMEOUT";
}

export interface AppPortsDeps {
    readonly navigation: NavigationService;
    readonly journal: PendingOperationJournal;
    readonly frameScheduler: FrameScheduler;
    readonly lifecycleBus: LifecycleBus;
    readonly enterBattle: () => Promise<void>;
    /** §7.4 launch 通道（缺省回退 enterBattle——测试替身无需提供）。 */
    readonly launch?: (target: FeatureLaunchTarget) => Promise<void>;
    /** runtime 的订阅追踪：dispose 时强制解绑（订阅计数归零）。 */
    readonly track: (unsubscribe: () => void) => () => void;
    readonly now?: () => number;
}

export function createAppPorts(deps: AppPortsDeps): AppPorts {
    const now = deps.now ?? (() => Date.now());
    return {
        navigation: {
            open: (routeId) => deps.navigation.open(routeId),
            replace: (routeId) => deps.navigation.replace(routeId),
            back: () => deps.navigation.back(),
            close: (routeId) => deps.navigation.close(routeId),
            closeGroup: (group) => deps.navigation.closeGroup(group),
        },
        lobbyRpc: {
            query: (type, payload) => WebSocketClient.inst.rpc(type, payload),
            sendIdempotent: async (type, payload) => {
                const clientReqId = WebSocketClient.newClientReqId();
                // write-ahead（§7.2 约束 1）：条目先落 inflight，再 send；uid 边界在
                // 写入点同步校验（约束 4）。
                deps.journal.begin({
                    uid: getUserId(),
                    clientReqId,
                    route: type,
                    payload,
                });
                try {
                    const result = await WebSocketClient.inst.rpcIdem(type, payload, clientReqId);
                    deps.journal.settle(clientReqId, "applied");
                    return result;
                } catch (error) {
                    deps.journal.settle(clientReqId, isResultUnknownError(error) ? "unknown" : "failed");
                    throw error;
                }
            },
        },
        session: {
            getUserId,
            isLoggedIn,
            getSessionGeneration,
            getSessionProfile,
        },
        clock: { now },
        ticker: {
            add: (callback, signal) => deps.frameScheduler.add(callback, signal),
        },
        lifecycle: {
            subscribeConnection: (listener) =>
                deps.track(WebSocketClient.inst.subscribeConnection(listener)),
            getConnectionState: () => WebSocketClient.inst.getConnectionState(),
            subscribeHost: (listener) =>
                deps.track(deps.lifecycleBus.subscribe("host", listener)),
        },
        views: {
            open: (routeId) => deps.navigation.open(routeId),
        },
        launch: {
            enterBattle: () => deps.enterBattle(),
            launch: (target) => (deps.launch ? deps.launch(target) : deps.enterBattle()),
        },
    };
}
