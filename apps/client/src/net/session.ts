/**
 * 会话状态（纯 TS 无头层）：token/userId 生命周期 + 鉴权失效/连接死亡事件枢纽。
 *
 * 三个真实场景的接线中枢（D1'）：
 *  - **鉴权失效**：RPC 回包 AUTH_REQUIRED / ACCOUNT_BANNED（权威 = accounts.status + token_hash）
 *    → notifyAuthInvalid → UI 清态回登录页；
 *  - **强制下线**：服务端主动踢（封禁/顶号/强制下线）——先推 `auth.forceLogout{reason}`，
 *    连接已死时由 `onLeave(code)` 按 KICK_CLOSE_CODE 兜底判因（M12d §2.3）；
 *  - **掉线**：大厅房 SDK 自动重连；重连最终失败（onLeave）→ notifyConnLost → UI 提示重登；
 *  - **换号/顶号**：logout() 清本地会话（token/userId）——房间离开由编排层（view/pages）负责。
 *    ⚠ **单端语义**（09·G7c）：换端登录即顶号——服务端见组 sess 的 tokenHash 变化就踢旧连接
 *    （reason=replaced）；⛔ 不是"互不影响"。
 *
 * ⛔ 本模块不 import net 客户端类（WebSocketClient/RoomClient 反向调用本模块，防循环依赖）。
 */
import { setToken, getToken } from "../core/http";
import type { WebPlatformLoginResponse } from "../shared/index";

/**
 * 鉴权失效原因。两类来源：
 * - RPC 错误码（快路径/建连校验失败）：`AUTH_REQUIRED` / `ACCOUNT_BANNED` / `AUTH_EPOCH_STALE`（保留码，服务端已不产出）
 * - **强制下线**（服务端主动踢，先推 `auth.forceLogout{reason}`、关闭码兜底）：`FORCE_BANNED` / `FORCE_REPLACED`（顶号）/ `FORCE_REVOKED`
 */
export type AuthInvalidReason =
    | "AUTH_EPOCH_STALE" | "AUTH_REQUIRED" | "ACCOUNT_BANNED"
    | "FORCE_BANNED" | "FORCE_REPLACED" | "FORCE_REVOKED";

/**
 * 导航层使用的统一回登录原因。网络层只负责发出事件，不依赖 View；注册了
 * `registerReturnToLogin` 后，三类失效事件会被串行送进同一个 transition。
 */
export type ReturnToLoginReason =
    | { kind: "AUTH_INVALID"; reason: AuthInvalidReason }
    | { kind: "CONN_LOST" }
    | { kind: "BATTLE_LOST" }
    | { kind: "BATTLE_JOIN_FAILED" };

export type ReturnToLoginHandler = (reason: ReturnToLoginReason) => Promise<void> | void;

let userId = "";
let sessionGeneration = 0;
const authInvalidHandlers = new Set<(reason: AuthInvalidReason) => void>();
const connLostHandlers = new Set<() => void>();
// 战斗房（GameRoom）连接最终死亡。⚠ 与 connLost（大厅房）**刻意分开**：两者的来源和
// 本地回滚不同——大厅断线要回收大厅 RPC，战斗断线还必须**回滚战斗态**（拆渲染层/输入/ECS
// + inBattle 复位）。两者最终都通过已注册的 returnToLogin 编排回登录并清理 bearer；这里的
// 事件回调只负责通知订阅者，不应把 transport 死亡误当成鉴权原因。
const battleLostHandlers = new Set<() => void>();

/** Event subscribers are invoked by transport callbacks and are not awaited by
 * the caller. Observe returned thenables as well as synchronous exceptions so
 * a detached session transition cannot create an unhandled rejection. */
function observeSubscriber(scope: string, invoke: () => unknown): void {
    let result: unknown;
    try {
        result = invoke();
    } catch {
        console.error(`[session] ${scope} 处理器异常`);
        return;
    }
    try {
        if (result !== null
            && (typeof result === "object" || typeof result === "function")
            && typeof (result as { then?: unknown }).then === "function") {
            Promise.resolve(result).catch(() => console.error(`[session] ${scope} 处理器 rejection`));
        }
    } catch {
        console.error(`[session] ${scope} 处理器 rejection`);
    }
}

/** 当前页面组合根提供的唯一回登录实现。模块级是刻意的：session 不反向依赖 View。 */
let returnToLoginHandler: ReturnToLoginHandler | null = null;

/** 登录成功：记会话（token 进 core/http，后续 HTTP Bearer / 房间 join 都取自它）。 */
export function setSession(r: WebPlatformLoginResponse): void {
    userId = r.userId;
    setToken(r.accessToken);
    sessionGeneration++;
    sessionTransition.reset();
}

export function getUserId(): string {
    return userId;
}

export function isLoggedIn(): boolean {
    return userId !== "" && getToken() !== "";
}

/** 登出/换号：清本地会话。之后 isLoggedIn()=false，新登录重新 setSession。 */
export function clearSession(): void {
    userId = "";
    setToken("");
    sessionGeneration++;
}

/** 当前会话世代；异步登录/导航在每个 await 后用它拒绝迟到结果。 */
export function getSessionGeneration(): number {
    return sessionGeneration;
}

/**
 * 可独立测试的会话 transition：同一世代内并发事件共享 Promise，完成后吞掉旧事件；
 * `reset()` 由下一次 setSession 调用，开启新的会话世代。
 */
export class SessionTransition {
    private inFlight: { promise: Promise<void>; epoch: number } | null = null;
    private handled = false;
    private epoch = 0;

    constructor(private readonly resolveHandler: () => ReturnToLoginHandler | null = () => returnToLoginHandler) {}

    reset(): void {
        // 新会话开始后，旧 transition 的 Promise 仍可由其调用方等待，但不能再和
        // 新会话的失效事件合流，也不能在旧 Promise 完成时覆盖新的 handled 状态。
        this.epoch++;
        this.inFlight = null;
        this.handled = false;
    }

    run(reason: ReturnToLoginReason): Promise<void> {
        if (this.inFlight) return this.inFlight.promise;
        if (this.handled) return Promise.resolve();
        // notifyAuthInvalid 的兼容广播在进入这里前已经清过一次；避免重复递增
        // generation，同时保证直接调用 returnToLogin 仍会清掉残留 user/token。
        if (userId !== "" || getToken() !== "") clearSession();
        const epoch = this.epoch;
        const generation = sessionGeneration;
        const handler = this.resolveHandler();
        const p = Promise.resolve().then(() => {
            // setSession() 可能在 handler 开始前建立了新会话；旧事件只需结束，
            // 不能把新会话再次导航回登录页。
            if (this.epoch !== epoch || sessionGeneration !== generation) return;
            return handler?.(reason);
        }).then(() => undefined);
        const record = { promise: p, epoch };
        this.inFlight = record;
        p.then(
            () => {
                if (this.inFlight === record) {
                    this.inFlight = null;
                    this.handled = true;
                }
            },
            () => {
                if (this.inFlight === record) {
                    this.inFlight = null;
                    // A rejected navigation did not complete the transition;
                    // keep the gate open so an explicit retry can recover.
                    this.handled = false;
                }
            },
        );
        return p;
    }
}

const sessionTransition = new SessionTransition();

/**
 * 注册应用唯一的回登录出口。重复注册只替换实现，不会增加事件订阅；返回解绑器供
 * 场景/测试清理。处理器本身必须观察所有 Promise rejection。
 */
export function registerReturnToLogin(handler: ReturnToLoginHandler): () => void {
    returnToLoginHandler = handler;
    return () => {
        if (returnToLoginHandler === handler) returnToLoginHandler = null;
    };
}

/**
 * 统一、可等待、幂等的回登录队列。第一次调用会立即清本地会话，保证之后的 Portal
 * 登录请求不会携带旧 Bearer；并发/迟到事件共享同一个 Promise。
 */
export function returnToLogin(reason: ReturnToLoginReason): Promise<void> {
    return sessionTransition.run(reason);
}

/** 订阅鉴权失效（踢线/token 过期/封号），返回解绑函数。 */
export function onAuthInvalid(cb: (reason: AuthInvalidReason) => void): () => void {
    authInvalidHandlers.add(cb);
    return () => { authInvalidHandlers.delete(cb); };
}

/** 订阅大厅连接最终死亡（自动重连耗尽），返回解绑函数。 */
export function onConnLost(cb: () => void): () => void {
    connLostHandlers.add(cb);
    return () => { connLostHandlers.delete(cb); };
}

/** 网络层上报鉴权失效。先清会话再广播（幂等：未登录状态下的迟到上报直接吞掉，防重复弹窗）。 */
export function notifyAuthInvalid(reason: AuthInvalidReason): void {
    if (!isLoggedIn()) return;
    clearSession();
    const eventGeneration = sessionGeneration;
    for (const cb of authInvalidHandlers) {
        observeSubscriber("authInvalid", () => cb(reason));
    }
    // A subscriber may synchronously establish a replacement session.  The
    // stale invalidation must not clear or navigate that newer session.
    if (sessionGeneration === eventGeneration) {
        dispatchReturnToLogin({ kind: "AUTH_INVALID", reason });
    }
}

/** 网络层上报大厅连接最终死亡（非鉴权原因）。注册导航出口后会统一回登录并清理 bearer。 */
/** 订阅战斗房连接最终死亡（Main 回滚战斗态、view 层做导航/提示），返回解绑函数。 */
export function onBattleLost(cb: () => void): () => void {
    battleLostHandlers.add(cb);
    return () => { battleLostHandlers.delete(cb); };
}

/** 网络层上报战斗房最终死亡（非主动 leave）。注册导航出口后会统一回登录并清理 bearer。 */
export function notifyBattleLost(): void {
    const hadSession = isLoggedIn();
    const eventGeneration = sessionGeneration;
    for (const cb of battleLostHandlers) {
        observeSubscriber("battleLost", cb);
    }
    // Always broadcast so gameplay state can roll back, but do not open a
    // login transition for a stale transport callback after logout.
    if (hadSession && sessionGeneration === eventGeneration) {
        dispatchReturnToLogin({ kind: "BATTLE_LOST" });
    }
}

export function notifyConnLost(): void {
    const hadSession = isLoggedIn();
    const eventGeneration = sessionGeneration;
    for (const cb of connLostHandlers) {
        observeSubscriber("connLost", cb);
    }
    if (hadSession && sessionGeneration === eventGeneration) {
        dispatchReturnToLogin({ kind: "CONN_LOST" });
    }
}

/** 事件 API 保持同步；已注册的异步 transition 在后台运行且 rejection 已被观察。 */
function dispatchReturnToLogin(reason: ReturnToLoginReason): void {
    if (!returnToLoginHandler) return;
    void returnToLogin(reason).catch((e) => {
        console.error("[session] returnToLogin 处理器异常", e);
    });
}
