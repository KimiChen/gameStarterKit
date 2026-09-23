import { Call, MessageHelper, executeForwardedRoute, type BackgroundTaskDelivery } from '@arthropoda/game-engine'
import { writeProcessRouteTrace } from './writeProcessRouteTrace'

/**
 * 多进程 worker 间请求的显式对象编码。
 *
 * 只传「已经解析好的对象」：字符串路由、业务 payload、请求配对 id 与可信身份。
 * ⛔ 不把客户端原始帧（含旧二进制包头）透传给目标 worker 重放——目标 worker 没有连接，
 * 也无法对未校验的字节重新做契约校验，重放会让「谁负责校验」变成不可判定。
 * 结果同样以对象回传，由持有连接的一端编码并发送 wire 消息。
 */

/** 进程边界上的业务失败；字符串码来自 shared 契约或领域 handler 抛出的原始错误。 */
export interface ProcessPipeFailure {
    /** wire 合法的字符串错误码。 */
    readonly code: string
    readonly msg: string
    readonly noLogin?: boolean
}

export type ProcessPipeOutcome =
    { readonly ok: true; readonly res?: unknown } | { readonly ok: false; readonly err: ProcessPipeFailure }

/** 目标 worker 执行原生 Lobby 路由所需的可信身份；字符串 uid 来自已认证连接，不是业务 payload。 */
export interface LobbyRouteIdentity {
    readonly uid: string
    readonly sId: number
    /** 源 worker 首次解析出的内部 uid；目标 worker 不重新解析、也不做 Number(uid)。 */
    readonly internalUid: number
    /** 源 worker 首次解析出的两项调度值，目标 worker 复用而不重算。 */
    readonly taskGroupId?: number
    readonly bindId?: number
    readonly traceId: number
    readonly invokeLayer: number
}

export type ProcessPipeRequest =
    | { readonly kind: 'lookup-user-connection'; readonly uid: number; readonly sid: number }
    | { readonly kind: 'internal-action'; readonly payload: unknown; readonly remoteAddress?: string }
    /** 对象 LocalAction 调用：目标 worker 用本进程 LocalActionRegistry 执行。 */
    | {
          readonly kind: 'routed-local-action'
          readonly apiName: string
          readonly req: unknown
          readonly uid: number
          readonly sid: number
          readonly taskGroupId?: number
          readonly bindId?: number
          readonly traceId: number
          readonly invokeLayer: number
          readonly backgroundTask?: BackgroundTaskDelivery
      }
    /**
     * 原生 Lobby 字符串路由：payload 已由 shared 校验，handler 由目标 worker 自己的登记表解析。
     *
     * RPC 请求配对 id 不在这里：配对由持有连接的一端完成，跨进程转发发生在配对之后，
     * 因此配对 id 只需要留在监听进程，传过来不产生任何行为差异。
     */
    | {
          readonly kind: 'routed-lobby-route'
          readonly route: string
          readonly payload: unknown
          readonly uid: string
          readonly internalUid: number
          readonly sid: number
          readonly taskGroupId?: number
          readonly bindId?: number
          readonly traceId: number
          readonly invokeLayer: number
      }
    /** 跨进程唤醒推送：只有持有连接的进程能写 wire 消息。 */
    | {
          readonly kind: 'lobby-push'
          readonly uid: string
          readonly sid: number
          readonly type: string
          readonly data: unknown
      }
    /** 非监听 worker 的通用数据同步；定位键是仅当前在线有效的内部 uid。 */
    | { readonly kind: 'lobby-sync'; readonly internalUid: number; readonly sid: number; readonly data: unknown }
    | { readonly kind: 'lobby-kick'; readonly uid: string; readonly sid: number; readonly reason: string }

export interface ProcessPipeDependencies {
    /** 用目标 worker 自己登记的原生 Lobby 路由执行；跨进程不传闭包，也不传客户端帧。 */
    executeLobbyRoute(route: string, identity: LobbyRouteIdentity, payload: unknown): Promise<unknown>
    executeInternalAction(payload: unknown, remoteAddress?: string): Promise<unknown>
    lookupUserConnection(uid: number, sid: number): Promise<number | null>
    pushLobbyConnection(uid: string, sid: number, type: string, data: unknown): Promise<boolean>
    syncLobbyConnection?(internalUid: number, sid: number, data: unknown): Promise<boolean>
    kickLobbyConnection(uid: string, sid: number, reason: string): boolean
}

export function isProcessPipeRequest(value: unknown): value is ProcessPipeRequest {
    if (!value || typeof value !== 'object') return false
    const kind = (value as { kind?: unknown }).kind
    return typeof kind === 'string' && PIPE_KINDS.has(kind)
}

const PIPE_KINDS = new Set([
    'lookup-user-connection',
    'internal-action',
    'routed-local-action',
    'routed-lobby-route',
    'lobby-push',
    'lobby-sync',
    'lobby-kick',
])

/** 目标 worker 侧的统一入口；所有分支都返回对象，调用方负责决定谁来写 wire。 */
export async function handleProcessPipeRequest(
    deps: ProcessPipeDependencies,
    message: ProcessPipeRequest,
): Promise<unknown> {
    switch (message.kind) {
        case 'lookup-user-connection':
            return deps.lookupUserConnection(message.uid, message.sid)
        case 'internal-action':
            return deps.executeInternalAction(message.payload, message.remoteAddress)
        case 'routed-local-action':
            writeProcessRouteTrace({
                event: 'exec',
                kind: message.kind,
                route: message.apiName,
                uid: message.uid,
                taskGroupId: message.taskGroupId ?? null,
                bindId: message.bindId ?? null,
                pid: process.pid,
            })
            return executeLocalAction(message)
        case 'routed-lobby-route': {
            writeProcessRouteTrace({
                event: 'exec',
                kind: message.kind,
                route: message.route,
                uid: message.uid,
                taskGroupId: message.taskGroupId ?? null,
                bindId: message.bindId ?? null,
                pid: process.pid,
            })
            const identity: LobbyRouteIdentity = {
                uid: message.uid,
                sId: message.sid,
                internalUid: message.internalUid,
                taskGroupId: message.taskGroupId,
                bindId: message.bindId,
                traceId: message.traceId,
                invokeLayer: message.invokeLayer,
            }
            try {
                const res = await executeForwardedRoute(
                    {
                        uid: message.internalUid,
                        sId: message.sid,
                        // 可信外部身份必须随转发一起落到父调用上：嵌套对象调用据此继承，
                        // 目标 worker 不需要（也不允许）重新解析或从 payload 里猜。
                        externalUid: message.uid,
                        routing: { taskGroupId: message.taskGroupId, bindId: message.bindId },
                        traceId: message.traceId,
                        invokeLayer: message.invokeLayer,
                    },
                    () => deps.executeLobbyRoute(message.route, identity, message.payload),
                )
                return { ok: true, res }
            } catch (error) {
                return { ok: false, err: normalizeProcessPipeFailure(error) }
            }
        }
        case 'lobby-push':
            return deps.pushLobbyConnection(message.uid, message.sid, message.type, message.data)
        case 'lobby-sync':
            return deps.syncLobbyConnection?.(message.internalUid, message.sid, message.data) ?? false
        case 'lobby-kick':
            return deps.kickLobbyConnection(message.uid, message.sid, message.reason)
    }
}

/**
 * LocalAction 的执行体：按 apiName 从**本进程**的登记表解析 handler，用携带的 uid/sId 执行。
 *
 * 没有连接也能跑：`callLocalAction` 只消费传入的 uid/sId，不查在线归属表。
 */
async function executeLocalAction(
    message: Extract<ProcessPipeRequest, { kind: 'routed-local-action' }>,
): Promise<unknown> {
    const result = await MessageHelper.callLocalAction(
        message.uid,
        message.sid,
        new Call(message.apiName, (message.req ?? {}) as Record<string, unknown>, message.backgroundTask),
        {
            routing: { taskGroupId: message.taskGroupId, bindId: message.bindId },
            traceId: message.traceId,
            invokeLayer: message.invokeLayer,
            backgroundTask: message.backgroundTask,
        },
    )
    return result.isSucc
        ? { ok: true, res: result.res }
        : { ok: false, err: normalizeProcessPipeFailure(result.res ?? result.errMsg) }
}

/** 把任意抛出物归一为可跨进程回传的失败；只接受字符串错误码。 */
export function normalizeProcessPipeFailure(value: unknown): ProcessPipeFailure {
    if (value && typeof value === 'object') {
        const candidate = value as Record<string, unknown>
        const rawCode = candidate.code
        const rawMsg = candidate.msg ?? candidate.message
        if (typeof rawCode === 'string' && typeof rawMsg === 'string') {
            return { code: rawCode, msg: rawMsg }
        }
        const item =
            typeof (value as { getItem?: unknown }).getItem === 'function'
                ? (value as { getItem: () => Record<string, unknown> }).getItem()
                : undefined
        const msg = typeof rawMsg === 'string' ? rawMsg : typeof item?.message === 'string' ? item.message : undefined
        if (msg !== undefined) {
            // 没有字符串码时给一个稳定的兜底，禁止把数字错误码当成字符串码回传。
            return {
                code: 'INTERNAL',
                msg,
                noLogin: (candidate.noLogin ?? item?.noLogin) === true,
            }
        }
    }
    return { code: 'INTERNAL', msg: '服务器内部错误' }
}
