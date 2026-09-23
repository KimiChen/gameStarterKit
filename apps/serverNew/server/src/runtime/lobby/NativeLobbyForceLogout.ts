import {
    ForceLogoutReason,
    type ForceLogoutReasonType,
} from '../../../generated/lobby-contract/native/lobbyRpc/index.generated'
import { forwardLobbyKick } from '../../startup/lobbyRole'
import { hasNativeLobbyEnvironment, type NativeLobbyRuntime } from '../../startup/NativeLobbyRuntime'
import { nativeLobbyRuntime } from '../../startup/ServiceRuntime'
import type { RuntimeServerLike } from '../../startup/runtimeTypes'

/**
 * 运营强制下线（4903）的对外入口契约与唯一执行点。
 *
 * 请求要过两段路，两段最终都落到 `NativeLobbyAuthProvider.revoke`：
 * 1. 运营/运维侧 → 服务进程的内部 HTTP 动作（`type: 'lobbyKick'`，单进程直接执行）；
 * 2. 多进程下内部 HTTP 已落在**持有连接的监听 worker**，因此就地执行；仅错误路由时才走
 *    `lobby-kick` 管道（见 `forwardLobbyKick`）。
 * ⛔ 不要在任何一段里另起第二套下线语义——那会让「谁踢的、按哪个关闭码踢的」不可判定。
 *
 * 入口按**外部字符串 uid**定位会话：原生 Lobby 的在线表、推送出口与用户档案全部以外部 uid 为键
 * （`nativeLobby:identity:v1` 的字段是 `${sId}:${外部 uid}`），内部数值 uid 没有反查索引。
 * 因此这里不接受数字 uid，也不做 `Number(uid)` 猜测。
 */

/**
 * 运营入口唯一允许的原因。
 *
 * 4901 由鉴权拒绝（封号）触发、4902 由顶号触发，两者都有各自的权威来源；让运营入口也能指定
 * 这两种原因，等于允许伪造「谁触发的下线」。因此只接受 `revoked`。
 */
export const OPS_FORCE_LOGOUT_REASON: ForceLogoutReasonType = ForceLogoutReason.Revoked

/** 内部动作入口上承载运营下线的 payload 类型；解析与路由必须认同一个字面量。 */
export const OPS_FORCE_LOGOUT_TYPE = 'lobbyKick'
/** `/gm/api` 使用内部数值 role_id 的桥接动作；只允许 4903 运营下线。 */
export const OPS_ROLE_FORCE_LOGOUT_TYPE = 'lobbyKickByRoleId'

export interface OpsForceLogoutRequest {
    /** 外部字符串 uid。 */
    readonly uid: string
    /** 目标区服；必须等于本进程固定服务的区号。 */
    readonly sId: number
}

export interface OpsRoleForceLogoutRequest {
    readonly roleId: number
    readonly sId: number
}

/** 解析运营下线请求；字段缺失、类型不符、区号不符一律抛错（fail-closed，不猜默认值）。 */
export function parseOpsForceLogout(payload: unknown): OpsForceLogoutRequest {
    const params = (payload as { actionParams?: unknown } | null | undefined)?.actionParams
    if (!params || typeof params !== 'object') throw new Error('invalid force logout payload')
    const { uid, sId, reason } = params as { uid?: unknown; sId?: unknown; reason?: unknown }
    if (typeof uid !== 'string' || uid.length === 0) throw new Error('force logout requires a non-empty string uid')
    if (!Number.isInteger(sId) || (sId as number) < 1) throw new Error('force logout requires a positive integer sId')
    if (sId !== SERVER_ID) throw new Error(`force logout sid mismatch: expected=${SERVER_ID}, actual=${String(sId)}`)
    if (reason !== undefined && reason !== OPS_FORCE_LOGOUT_REASON) {
        throw new Error(`force logout only accepts reason=${OPS_FORCE_LOGOUT_REASON}`)
    }
    return { uid, sId: sId as number }
}

/** 解析由 GM 桥接发出的内部 role_id 下线请求；不接受外部 uid，避免两种身份混用。 */
export function parseOpsRoleForceLogout(payload: unknown): OpsRoleForceLogoutRequest {
    const params = (payload as { actionParams?: unknown } | null | undefined)?.actionParams
    if (!params || typeof params !== 'object') throw new Error('invalid role force logout payload')
    const { roleId, sId, reason } = params as { roleId?: unknown; sId?: unknown; reason?: unknown }
    if (!Number.isSafeInteger(roleId) || (roleId as number) < 1) {
        throw new Error('force logout requires a positive integer roleId')
    }
    if (!Number.isInteger(sId) || (sId as number) < 1) throw new Error('force logout requires a positive integer sId')
    if (sId !== SERVER_ID) throw new Error(`force logout sid mismatch: expected=${SERVER_ID}, actual=${String(sId)}`)
    if (reason !== undefined && reason !== OPS_FORCE_LOGOUT_REASON) {
        throw new Error(`force logout only accepts reason=${OPS_FORCE_LOGOUT_REASON}`)
    }
    return { roleId: roleId as number, sId: sId as number }
}

/**
 * 在服务进程里执行运营下线；只有持有原生 Lobby 端点的监听进程能真正踢人。
 *
 * 没配置原生入口 = 本进程根本没有原生连接可踢，返回 false 是诚实结论；
 * 配置了却不在本进程 = 路由错了（例如把请求交给了非监听 worker），必须响亮失败而不是假装成功。
 *
 * `resolveRuntime` 按 `lobbyRoleOf` 的既有做法经参数注入，使「两个失败分支 + 成功分支」都能在
 * 不真起进程的前提下被直接验证；缺省值才是生产路径（模块级 `nativeLobbyRuntime()`）。
 */
export function revokeOpsOnline(
    request: OpsForceLogoutRequest,
    resolveRuntime: () => NativeLobbyRuntime | undefined = nativeLobbyRuntime,
): boolean {
    const runtime = resolveRuntime()
    if (!runtime) {
        if (!hasNativeLobbyEnvironment()) return false
        throw new Error('ops force logout must be executed in the native Lobby listener process')
    }
    return runtime.revoke(request.uid, request.sId)
}

/** 运营后台 role_id 入口；实际关闭语义仍由同一个原生 Lobby 运行时执行。 */
export function revokeOpsRoleOnline(
    request: OpsRoleForceLogoutRequest,
    resolveRuntime: () => NativeLobbyRuntime | undefined = nativeLobbyRuntime,
): boolean {
    const runtime = resolveRuntime()
    if (!runtime) {
        if (!hasNativeLobbyEnvironment()) return false
        throw new Error('ops force logout must be executed in the native Lobby listener process')
    }
    return runtime.revokeByInternalUid(request.roleId, request.sId)
}

/**
 * 内部动作入口里的运营下线出口：**能就地执行就地执行**，否则改写成管道请求发给监听进程。
 *
 * 判据不是「本进程是不是主控」，而是「本进程是不是持有连接的监听进程」——只有那里有在线表与
 * wire 出口。多进程下内部 HTTP 端点就由监听进程承载（见 `MultiProcessRuntime.onWorkerStart`），
 * 所以生产路径走的是就地执行；管道分支保留下来是因为它才是「请求落错进程」时的正确答案，
 * 而且「谁是监听进程」这个判定必须只有一处。
 *
 * `payload` 不是运营下线请求时返回 `undefined`，让调用方继续走它原来的内部动作路由。
 *
 * ⛔ 不要让主控进程在这里「顺便」直接踢：它没有在线表，直接执行只会静默返回 false；
 * ⛔ 也不要反过来在监听进程里绕一圈管道：alloy-core 不接受主控发起的进程请求，
 * 监听进程给自己发请求只会多一轮序列化。
 */
export async function routeOpsForceLogout(
    runtime: RuntimeServerLike,
    payload: unknown,
    pipeTimeoutMs: number,
    resolveRuntime: () => NativeLobbyRuntime | undefined = nativeLobbyRuntime,
): Promise<{ kicked: boolean } | undefined> {
    if ((payload as { type?: unknown } | null | undefined)?.type !== OPS_FORCE_LOGOUT_TYPE) return undefined
    const request = parseOpsForceLogout(payload)
    // 请求已经落在持有连接的进程里：就地执行，不要再绕一圈管道。
    if (resolveRuntime()) return { kicked: revokeOpsOnline(request, resolveRuntime) }
    const kicked = await forwardLobbyKick(runtime, pipeTimeoutMs)(request.uid, request.sId, OPS_FORCE_LOGOUT_REASON)
    return { kicked }
}
