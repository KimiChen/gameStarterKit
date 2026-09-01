/**
 * SessionCoordinator（Non-intrusive §7.2/§7.3 阶段 5a）：会话状态与 session 级事件的
 * **独家**派生点。吸收原 net/session.ts 的全部模块状态与逻辑（语义逐字保留），
 * net/session.ts 保留为纯 façade 逐一转发本模块。
 *
 * 三个真实场景的接线中枢（D1'）：
 *  - **鉴权失效**：RPC 回包 AUTH_REQUIRED / ACCOUNT_BANNED（权威 = accounts.status + token_hash）
 *    → notifyAuthInvalid → UI 清态回登录页；
 *  - **强制下线**：服务端主动踢（封禁/顶号/强制下线）——先推 `auth.forceLogout{reason}`，
 *    连接已死时由 `onLeave(code)` 按 KICK_CLOSE_CODE 兜底判因（M12d §2.3）；
 *  - **掉线**：大厅房 SDK 自动重连；最终失败（onLeave）后先复用当前 token 重进 Lobby 并拉 GetInfo，
 *    对账失败才清会话并提示重登；
 *  - **换号/顶号**：logout() 清本地会话（token/userId）——房间离开由编排层（view/pages）负责。
 *    ⚠ **单端语义**（09·G7c）：换端登录即顶号——服务端见组 sess 的 tokenHash 变化就踢旧连接
 *    （reason=replaced）；⛔ 不是"互不影响"。
 *
 * transport 事件经 LifecycleBus 注入（app/wiring.ts 的 wireConnectionEvents），本模块
 * 从 closed 事件派生高层语义：auth-invalid → 同一同步栈清凭证并广播（⛔ 两步间不得插
 * await）；final-loss → 对账，失败才回登录；voluntary → 不触发导航。
 *
 * ⛔ 本模块不 import net 客户端类（WebSocketClient/RoomClient），防循环依赖；
 * ⛔ 不自持凭证副本——token 唯一物理存放仍是 core/http（getSessionIdentity 每次现取）。
 */
import { setToken, getToken } from "../core/http";
import {
    ForceLogoutMessage,
    ForceLogoutReason,
    UserRpc,
    validateLobbyRpcResponse,
    type IUserView,
    type WebPlatformLoginResponse,
} from "../shared/index";
import type { AuthInvalidReason, LobbyConnectionEvent } from "../net/connectionEvents";

export type { AuthInvalidReason };

/** One immutable snapshot of the in-memory session identity used across async reconciliation. */
export interface SessionReconcileIdentity {
    readonly generation: number;
    readonly userId: string;
    readonly accessToken: string;
}

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
let sessionProfile: { readonly generation: number; readonly user: IUserView } | null = null;
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

/** Lobby 最终死亡后的可选恢复口；页面组合根注入，session 不反向依赖 transport/View。 */
export type SessionReconcileHandler = (identity: SessionReconcileIdentity) => boolean | Promise<boolean>;
let sessionReconcileHandler: SessionReconcileHandler | null = null;
let sessionReconcileFlight: {
    readonly identity: SessionReconcileIdentity;
    readonly promise: Promise<boolean>;
} | null = null;

function sameSessionIdentity(a: SessionReconcileIdentity, b: SessionReconcileIdentity): boolean {
    return a.generation === b.generation && a.userId === b.userId && a.accessToken === b.accessToken;
}

function cloneUserView(user: IUserView): IUserView {
    return { ...user };
}

function clearSessionProfile(): void {
    sessionProfile = null;
}

/** 登录成功：记会话（token 进 core/http，后续 HTTP Bearer / 房间 join 都取自它）。 */
export function setSession(r: WebPlatformLoginResponse): void {
    userId = r.userId;
    setToken(r.accessToken);
    sessionGeneration++;
    clearSessionProfile();
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
    clearSessionProfile();
}

/** 当前会话世代；异步登录/导航在每个 await 后用它拒绝迟到结果。 */
export function getSessionGeneration(): number {
    return sessionGeneration;
}

/** 当前内存会话身份。accessToken 仍只存于 core/http，不新增持久化或第二份凭证状态。 */
export function getSessionIdentity(): SessionReconcileIdentity | null {
    const accessToken = getToken();
    if (userId === "" || accessToken === "") return null;
    return { generation: sessionGeneration, userId, accessToken };
}

/** 精确判断异步结果是否仍属于捕获时的登录世代。 */
export function isSessionIdentityCurrent(identity: SessionReconcileIdentity): boolean {
    const current = getSessionIdentity();
    return current !== null && sameSessionIdentity(current, identity);
}

/**
 * 原子提交权威自档：先经 shared GetInfo response validator 复制/校验，再比较完整 session identity。
 * `false` 表示结果已过期；身份不一致属于协议错误，直接拒绝而不是污染当前快照。
 */
export function commitSessionProfile(identity: SessionReconcileIdentity, user: IUserView): boolean {
    if (!isSessionIdentityCurrent(identity)) return false;
    const owned = validateLobbyRpcResponse(UserRpc.GetInfo, { user }).user;
    if (owned.uid !== identity.userId) {
        throw new Error("[session] 角色档案身份与登录会话不一致");
    }
    if (!isSessionIdentityCurrent(identity)) return false;
    sessionProfile = { generation: identity.generation, user: cloneUserView(owned) };
    return true;
}

/** 当前世代的角色快照；返回副本，View/Logic 无法回写模块内权威值。 */
export function getSessionProfile(): IUserView | null {
    const profile = sessionProfile;
    if (!profile || profile.generation !== sessionGeneration || !isLoggedIn()) return null;
    return cloneUserView(profile.user);
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
 * 注册应用唯一的回登录出口。**重复注册 fail-fast**（§7.2 (b)）：已有注册未释放时
 * 直接 throw——⛔ 不允许「后注册者静默覆盖、旧 disposer 退化为 no-op」的中间态。
 * 返回解绑器供场景/测试清理。处理器本身必须观察所有 Promise rejection。
 */
export function registerReturnToLogin(handler: ReturnToLoginHandler): () => void {
    if (returnToLoginHandler !== null) {
        throw new Error("[session] returnToLogin 出口已注册且未释放（fail-fast：先 dispose 旧注册再注册）");
    }
    returnToLoginHandler = handler;
    return () => {
        if (returnToLoginHandler === handler) returnToLoginHandler = null;
    };
}

/** 注册当前页面组合根唯一的 Lobby 最终断线对账器。重复注册 fail-fast（§7.2 (b)）。 */
export function registerSessionReconciler(handler: SessionReconcileHandler): () => void {
    if (sessionReconcileHandler !== null) {
        throw new Error("[session] session reconciler 已注册且未释放（fail-fast：先 dispose 旧注册再注册）");
    }
    sessionReconcileHandler = handler;
    return () => {
        if (sessionReconcileHandler === handler) sessionReconcileHandler = null;
    };
}

/**
 * 统一、可等待、幂等的回登录队列。第一次调用会立即清本地会话，保证之后的 Portal
 * 登录请求不会携带旧 Bearer；并发/迟到事件共享同一个 Promise。
 */
export function returnToLogin(reason: ReturnToLoginReason): Promise<void> {
    return sessionTransition.run(reason);
}

/**
 * 回登录原因 → 用户可见文案的唯一映射（§7.3：由 SessionCoordinator 拥有，feature
 * 不参与）。分支逐字迁自原 view/pages.ts 的 returnToLogin 处理器（阶段 5b）：
 * AUTH_INVALID 子因（FORCE_BANNED/REPLACED/REVOKED/ACCOUNT_BANNED）/ BATTLE_LOST /
 * CONN_LOST / BATTLE_JOIN_FAILED。
 */
export function returnToLoginPromptOf(reason: ReturnToLoginReason): {
    readonly title: string;
    readonly content: string;
} {
    let title = "提示";
    let content = "登录已过期，请重新登录";
    if (reason.kind === "AUTH_INVALID") {
        const auth = reason.reason;
        content = auth === "FORCE_BANNED" ? ForceLogoutMessage[ForceLogoutReason.Banned]
            : auth === "FORCE_REPLACED" ? ForceLogoutMessage[ForceLogoutReason.Replaced]
            : auth === "FORCE_REVOKED" ? ForceLogoutMessage[ForceLogoutReason.Revoked]
            : auth === "ACCOUNT_BANNED" ? ForceLogoutMessage[ForceLogoutReason.Banned]
            : "登录已过期，请重新登录";
    } else if (reason.kind === "BATTLE_LOST") {
        title = "战斗已结束";
        content = "与对局的连接已断开";
    } else if (reason.kind === "CONN_LOST") {
        title = "连接断开";
        content = "与服务器的连接已断开，请重新进入";
    } else if (reason.kind === "BATTLE_JOIN_FAILED") {
        title = "进入失败";
        content = "进入对局失败，请重试";
    }
    return { title, content };
}

/**
 * 导航侧提供给回登录 transition 的最小操作面。flight/owner 的所有权仍在
 * app/loginFlow（reopen 算法、活性判定），SessionCoordinator 只经这些回调编排
 * 固定次序——⛔ 本模块不 import WebSocketClient/View，防循环。
 */
export interface SessionNavigator {
    /** owner / app generation 活性（transition 每个 await 后复验的导航侧一半）。 */
    isCurrent(): boolean;
    /** 捕获并标记触发事件时的具体 flight，分配 transition id（同一同步栈内完成）。 */
    beginTransition(): { readonly transitionId: number; readonly observedFlight: unknown };
    /** 释放大厅连接（内部吞错：leave 失败不阻断回登录）。 */
    leave(): Promise<void>;
    closeLobby(): void;
    /** 打开并 await 一个 session 作用域的提示视图（关闭或超时都让 transition 继续）。 */
    prompt(title: string, content: string): Promise<void>;
    /** transition 尾部重开 Login（reopen 算法在 loginFlow，逐字保留）。 */
    reopenLogin(transitionId: number, transitionGen: number, observedFlight: unknown): Promise<void>;
    /** Lobby 最终断线对账（reconcilePageSession，所有权在 loginFlow）。 */
    reconcile(identity: SessionReconcileIdentity): boolean | Promise<boolean>;
}

/**
 * 把导航侧接入 SessionCoordinator——**唯一**的 returnToLogin/reconciler 注册方
 * （§7.2 (a)：pages/loginFlow ⛔ 不再直接调用 register*，两个单槽的 fail-fast 语义
 * 原样生效）。回登录 transition 的固定次序（§7.3）逐字迁自原 view/pages.ts：
 * 关闭发送闸（returnToLogin 入口已 clearSession）→ leave → 复验 → 清空
 * authenticated 页面组 → 文案映射 → 打开并 await session 作用域提示 → 复验 →
 * 重开 Login。每一步 await 之后都复验 app generation + session generation。
 */
export function attachSessionNavigator(navigator: SessionNavigator): () => void {
    const unregisterReconciler = registerSessionReconciler((identity) => navigator.reconcile(identity));
    const unregisterReturn = registerReturnToLogin(async (reason: ReturnToLoginReason) => {
        if (!navigator.isCurrent()) return;
        // 捕获并标记触发事件时的具体 flight；它可能仍在 fetch/ViewMgr.open 中，不能被
        // 处理器直接 await，否则 openLogin 与回登录 transition 会互相等待。
        const transitionGen = sessionGeneration;
        const { transitionId, observedFlight } = navigator.beginTransition();

        // session.returnToLogin 已先 clearSession；这里按统一顺序释放大厅、关闭壳、
        // 提示，最后在旧 flight settle 后调度最新宿主的登录页。所有 await 都在同一个
        // 可观察 Promise 内。
        await navigator.leave();
        if (!navigator.isCurrent() || sessionGeneration !== transitionGen) return;
        navigator.closeLobby();
        const { title, content } = returnToLoginPromptOf(reason);
        await navigator.prompt(title, content);
        if (!navigator.isCurrent() || sessionGeneration !== transitionGen) return;
        await navigator.reopenLogin(transitionId, transitionGen, observedFlight);
    });
    return () => {
        unregisterReconciler();
        unregisterReturn();
    };
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

/**
 * 鉴权失效派生入口。先清会话再**同一同步栈**广播（§7.3 逐字保留：clearSession 与
 * 广播之间 ⛔ 不得插入任何 await，订阅者只能观察到已经无凭证的状态）。
 * 幂等：未登录状态下的迟到上报直接吞掉，防重复弹窗。
 */
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

/** 大厅连接最终死亡派生入口（非鉴权原因）。先尝试 session/profile 对账，失败才回登录。 */
export function notifyConnLost(): void {
    const hadSession = isLoggedIn();
    const eventGeneration = sessionGeneration;
    for (const cb of connLostHandlers) {
        observeSubscriber("connLost", cb);
    }
    if (!hadSession || sessionGeneration !== eventGeneration) return;
    const identity = getSessionIdentity();
    if (!identity) return;
    dispatchSessionReconcile(identity);
}

/**
 * LifecycleBus connection 通道的派生订阅（wireConnectionEvents 接线）：
 *  - closed{auth-invalid} → notifyAuthInvalid(authReason)——同一同步栈清凭证再广播；
 *  - closed{final-loss}   → notifyConnLost()——广播 + 对账，失败才回登录；
 *  - closed{voluntary}    → 不触发导航（现状：主动 leave 不 notify）；
 *  - joining/ready/dropped/reconnected → 本批仅经 bus 透传给订阅者
 *    （RefreshCoordinator 阶段 5b 消费），session 层不派生。
 */
export function handleLobbyConnectionEvent(event: LobbyConnectionEvent): void {
    if (event.kind !== "closed") return;
    if (event.reason === "auth-invalid") {
        notifyAuthInvalid(event.authReason);
        return;
    }
    if (event.reason === "final-loss") {
        notifyConnLost();
    }
    // voluntary：主动关闭，不触发任何 session 广播或导航。
}

/**
 * 同一 session generation 的重复最终断线只启动一次对账。没有恢复器或恢复失败时，
 * 才进入既有 returnToLogin；旧 generation 的迟到结果只结束自身，不能清新会话。
 */
function dispatchSessionReconcile(identity: SessionReconcileIdentity): void {
    const handler = sessionReconcileHandler;
    if (!handler) {
        dispatchReturnToLogin({ kind: "CONN_LOST" });
        return;
    }
    const current = sessionReconcileFlight;
    if (current && sameSessionIdentity(current.identity, identity)) return;

    const promise = Promise.resolve().then(() => handler(identity)).then((recovered) => recovered === true);
    const flight = { identity, promise };
    sessionReconcileFlight = flight;
    promise.then(
        (recovered) => finishSessionReconcile(flight, recovered),
        () => {
            console.error("[session] Lobby 会话/角色快照对账失败");
            finishSessionReconcile(flight, false);
        },
    );
}

function finishSessionReconcile(
    flight: { readonly identity: SessionReconcileIdentity; readonly promise: Promise<boolean> },
    recovered: boolean,
): void {
    if (sessionReconcileFlight === flight) sessionReconcileFlight = null;
    if (recovered || !isSessionIdentityCurrent(flight.identity)) return;
    dispatchReturnToLogin({ kind: "CONN_LOST" });
}

/** 事件 API 保持同步；已注册的异步 transition 在后台运行且 rejection 已被观察。 */
function dispatchReturnToLogin(reason: ReturnToLoginReason): void {
    if (!returnToLoginHandler) return;
    void returnToLogin(reason).catch((e) => {
        console.error("[session] returnToLogin 处理器异常", e);
    });
}
