import type { RuntimeServerLike } from './runtimeTypes'
import { hasNativeLobbyEnvironment, type LobbyPushForwarder, type LobbySyncForwarder } from './NativeLobbyRuntime'
import type { ProcessPipeRequest } from './processPipe'
import { writeProcessRouteTrace } from './writeProcessRouteTrace'
import type { ForceLogoutReasonType } from '../../generated/lobby-contract/protocol/lobbyRpc'

/**
 * 多进程下原生 Lobby 的角色判定。
 *
 * 单独成模块是为了让「谁是监听进程、谁只转发」这个判定**可被直接验证**：它是「禁止静默降级单进程」
 * 的唯一判定点，判定错了的表现是「配置齐全但没人绑定端点」或「多个进程抢同一个端口」，
 * 两种都不是本地能看出来的失败。
 *
 * 依赖全部经参数注入（`runtime` + `pipeTimeoutMs` + `hasEnvironment`），因此不需要真的起多进程。
 */

/** 原生 Lobby 端点只由该 worker 绑定；其它 worker 只装载路由表并把推送转发给它。 */
export const NATIVE_LOBBY_HOST_WORKER_ID = 0

export type WorkerRole = 'MASTER' | 'WORKER' | 'TASK_WORKER' | 'USER_TASK_WORKER'

/** 角色分配结果；`undefined` 表示本进程不参与原生入口（未配置时才是合法结果）。 */
export type NativeLobbyRoleAssignment =
    | { readonly role: 'listen' }
    | { readonly role: 'forward'; readonly forwardPush: LobbyPushForwarder; readonly forwardSync: LobbySyncForwarder }
    | undefined

export function workerRole(runtime: RuntimeServerLike): WorkerRole {
    const workerId = runtime.worker_id
    if (workerId === null) return 'MASTER'
    if (workerId < runtime.setting.worker_num) return 'WORKER'
    if (workerId < runtime.setting.worker_num + runtime.setting.task_worker_num) return 'TASK_WORKER'
    return 'USER_TASK_WORKER'
}

export function schedulerOwner(runtime: RuntimeServerLike): boolean {
    const workerId = runtime.worker_id
    return runtime.setting.task_worker_num > 0 ? workerId === runtime.setting.worker_num : workerId === 0
}

/**
 * 决定本 worker 的原生 Lobby 角色。
 *
 * 监听进程必须同时具备业务运行时（鉴权、幂等闸、路由表都在它内部），而且同一个端口不能被多个
 * 进程重复绑定，所以只有指定的 worker 绑定端点；其余 worker 装载路由表并把推送转给监听进程。
 * 配置了原生入口却没有角色时由 `initializeServiceRuntime` 直接报错，不做静默降级。
 */
export function lobbyRoleOf(
    runtime: RuntimeServerLike,
    role: WorkerRole,
    options: { readonly pipeTimeoutMs: number; readonly hasEnvironment?: boolean },
): NativeLobbyRoleAssignment {
    const hasEnvironment = options.hasEnvironment ?? hasNativeLobbyEnvironment()
    if (!hasEnvironment) return undefined
    if (role === 'WORKER' && runtime.worker_id === NATIVE_LOBBY_HOST_WORKER_ID) return { role: 'listen' }
    return {
        role: 'forward',
        forwardPush: forwardLobbyPush(runtime, options.pipeTimeoutMs),
        forwardSync: forwardLobbySync(runtime, options.pipeTimeoutMs),
    }
}

/** 非监听 worker 的推送出口：只有持有连接的监听进程能写 wire 消息。 */
export function forwardLobbyPush(runtime: RuntimeServerLike, pipeTimeoutMs: number): LobbyPushForwarder {
    return async (uid, sId, type, data) => {
        const request: ProcessPipeRequest = { kind: 'lobby-push', uid, sid: sId, type, data }
        // 推送是「非监听进程 → 监听进程」的单向转发，外部只能看到最终到达的连接。
        // 没有这行痕迹，「推送到底跨没跨进程」就只能靠推断。
        writeProcessRouteTrace({
            event: 'push',
            kind: request.kind,
            route: type,
            sourceWorkerId: runtime.worker_id,
            targetWorkerId: NATIVE_LOBBY_HOST_WORKER_ID,
        })
        const result = await runtime.requestMessage(request, NATIVE_LOBBY_HOST_WORKER_ID, pipeTimeoutMs)
        // 只有监听进程明确回 true 才算送达；超时、缺连接、回包异常一律是 false，不猜成功。
        return result === true
    }
}

/** 非监听进程的用户数据同步出口；监听进程按当前在线 internal uid 找连接。 */
export function forwardLobbySync(runtime: RuntimeServerLike, pipeTimeoutMs: number): LobbySyncForwarder {
    return async (internalUid, sId, data) => {
        const request: ProcessPipeRequest = { kind: 'lobby-sync', internalUid, sid: sId, data }
        writeProcessRouteTrace({
            event: 'push',
            kind: request.kind,
            route: 'sync',
            sourceWorkerId: runtime.worker_id,
            targetWorkerId: NATIVE_LOBBY_HOST_WORKER_ID,
        })
        return (await runtime.requestMessage(request, NATIVE_LOBBY_HOST_WORKER_ID, pipeTimeoutMs)) === true
    }
}

/**
 * 非监听进程的踢人出口（4901 封禁 / 4902 顶号 / 4903 运营下线）。
 *
 * 与推送同理：只有持有连接的一端能写 `forceLogout` 与关闭码。运营下线的请求由主控进程
 * 收到后转发到这里，因此「谁是监听进程」这个判定仍然只有本模块一处。
 */
export function forwardLobbyKick(
    runtime: RuntimeServerLike,
    pipeTimeoutMs: number,
): (uid: string, sId: number, reason: ForceLogoutReasonType) => Promise<boolean> {
    return async (uid, sId, reason) => {
        const request: ProcessPipeRequest = { kind: 'lobby-kick', uid, sid: sId, reason }
        // 主控进程（`worker_id === null`）也会走到这里：痕迹里的 `sourceWorkerId: null`
        // 正是「这条请求不是监听进程自己发起的」的直接证据。
        writeProcessRouteTrace({
            event: 'kick',
            kind: request.kind,
            route: reason,
            sourceWorkerId: runtime.worker_id,
            targetWorkerId: NATIVE_LOBBY_HOST_WORKER_ID,
        })
        const result = await runtime.requestMessage(request, NATIVE_LOBBY_HOST_WORKER_ID, pipeTimeoutMs)
        // 目标进程只在「确实踢掉了当前在线连接」时回 true；`false` 表示该 uid/sId 当时不在线。
        return result === true
    }
}
