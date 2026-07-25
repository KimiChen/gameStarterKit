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
import type { ILoginRes } from "../shared/index";

/**
 * 鉴权失效原因。两类来源：
 * - RPC 错误码（快路径/建连校验失败）：`AUTH_REQUIRED` / `ACCOUNT_BANNED` / `AUTH_EPOCH_STALE`（保留码，服务端已不产出）
 * - **强制下线**（服务端主动踢，先推 `auth.forceLogout{reason}`、关闭码兜底）：`FORCE_BANNED` / `FORCE_REPLACED`（顶号）/ `FORCE_REVOKED`
 */
export type AuthInvalidReason =
    | "AUTH_EPOCH_STALE" | "AUTH_REQUIRED" | "ACCOUNT_BANNED"
    | "FORCE_BANNED" | "FORCE_REPLACED" | "FORCE_REVOKED";

let userId = "";
const authInvalidHandlers = new Set<(reason: AuthInvalidReason) => void>();
const connLostHandlers = new Set<() => void>();
// 战斗房（GameRoom）连接最终死亡。⚠ 与 connLost（大厅房）**刻意分开**：两者的处置不同——
// 大厅断线只需提示重进；战斗断线还必须**回滚战斗态**（拆渲染层/输入/ECS + inBattle 复位），
// 否则 Main 会拿着一个死房间继续驱动渲染，玩家卡在冻结画面里无路可回。
const battleLostHandlers = new Set<() => void>();

/** 登录成功：记会话（token 进 core/http，后续 HTTP Bearer / 房间 join 都取自它）。 */
export function setSession(r: ILoginRes): void {
    userId = r.userId;
    setToken(r.token);
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
    for (const cb of authInvalidHandlers) {
        try { cb(reason); } catch (e) { console.error("[session] authInvalid 处理器异常", e); }
    }
}

/** 网络层上报大厅连接最终死亡（非鉴权原因）。登录态保留——UI 可提示后用原 token 重连。 */
/** 订阅战斗房连接最终死亡（Main 回滚战斗态、view 层做导航/提示），返回解绑函数。 */
export function onBattleLost(cb: () => void): () => void {
    battleLostHandlers.add(cb);
    return () => { battleLostHandlers.delete(cb); };
}

/** 网络层上报战斗房最终死亡（非主动 leave）。登录态不受影响——只是这一局没了。 */
export function notifyBattleLost(): void {
    for (const cb of battleLostHandlers) {
        try { cb(); } catch (e) { console.error("[session] battleLost 处理器异常", e); }
    }
}

export function notifyConnLost(): void {
    for (const cb of connLostHandlers) {
        try { cb(); } catch (e) { console.error("[session] connLost 处理器异常", e); }
    }
}
