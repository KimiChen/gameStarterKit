/**
 * 会话状态（纯 TS 无头层）：token/userId 生命周期 + 鉴权失效/连接死亡事件枢纽。
 *
 * 三个真实场景的接线中枢（D1'）：
 *  - **踢线**：任何通道收到 AUTH_EPOCH_STALE / AUTH_REQUIRED / ACCOUNT_BANNED
 *    （tokenEpoch 被 bump = 账号在别处登录/被封）→ notifyAuthInvalid → UI 清态回登录页；
 *  - **掉线**：大厅房 SDK 自动重连；重连最终失败（onLeave）→ notifyConnLost → UI 提示重登；
 *  - **换号**：logout() 清本地会话（token/userId）——房间离开由编排层（view/pages）负责，
 *    服务端旧 sess:{uid} 靠 TTL 自然过期（不 bump epoch：不踢同账号其他设备）。
 *
 * ⛔ 本模块不 import net 客户端类（WebSocketClient/RoomClient 反向调用本模块，防循环依赖）。
 */
import { setToken, getToken } from "../core/http";
import type { ILoginRes } from "../shared/index";

export type AuthInvalidReason = "AUTH_EPOCH_STALE" | "AUTH_REQUIRED" | "ACCOUNT_BANNED";

let userId = "";
const authInvalidHandlers = new Set<(reason: AuthInvalidReason) => void>();
const connLostHandlers = new Set<() => void>();

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
export function notifyConnLost(): void {
    for (const cb of connLostHandlers) {
        try { cb(); } catch (e) { console.error("[session] connLost 处理器异常", e); }
    }
}
