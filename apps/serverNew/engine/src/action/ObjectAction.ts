import { ContextEngine } from '../context/ContextEngine'
import { ApiCall } from '../net/client/base/ApiCall'
import { MessageDirection } from '../net/client/base/message'
import { TraceIdGen } from '../net/client/codec/TraceIdGen'
import type { ApiReturn } from '../protocol/ProtocolInterface'
import { MsgType } from '../protocol/MsgType'
import RouteAction from '../task/RouteAction'
import type { ActionRouting } from './ActionRouting'

/** 从持久化身份映射取得的内部角色 ID；不是 Number(外部 uid)。 */
export interface ObjectActionIdentity {
    readonly uid: number
    readonly sId: number
    /**
     * shared 契约里的字符串 uid（可信外部身份）。
     * 跨进程转发时目标 worker 靠它解析内部身份；⛔ 业务代码不得用它做数值运算或当内部 ID 用。
     */
    readonly externalUid?: string
    /** 已解析的两项调度信息；对象存在即表示已解析，包括两个 ID 都为空。 */
    readonly routing?: ActionRouting
    /** 跨进程转发时复用源调用的 traceId / invokeLayer，保持全链路可追踪。 */
    readonly traceId?: number
    readonly invokeLayer?: number
}

/** server 已完成 shared 校验后，按字符串路由直接执行对象。 */
export interface ObjectActionHandler<Req, Res> {
    getTaskGroupId?(call: ObjectActionCall<Req, Res>): number | null | undefined | Promise<number | null | undefined>
    getBindId?(call: ObjectActionCall<Req, Res>): number | null | undefined | Promise<number | null | undefined>
    actionBefore?(call: ObjectActionCall<Req, Res>): Promise<void> | void
    doAction(req: Req, res: Res, call: ObjectActionCall<Req, Res>): Promise<void> | void
}

/**
 * 为不经过 RootBean diff 的显式 store 登记已提交数据差异。
 *
 * ⛔ 只能在**对象调用**上下文里调用，且**不再静默忽略**：
 *  - 没有调用上下文（cron / 模块初始化 / http 控制器等后台路径）⇒ 直接抛错。
 *  - 有上下文但不是对象出口（本地 Action、内部动作）⇒ 也抛错。
 *
 * 理由：这两种情况下变更既进不了 `reply.sync`，也不会被主动 sync 带走，静默忽略的后果是
 * 「数据已经提交、客户端永远不知道」，而且没有任何痕迹可查。要在后台改显式 store，
 * 就把它放进一个 Action（或用显式同步投递），⛔ 不要靠这个函数伪造某个客户端的同步。
 */
export function recordObjectActionSync(mods: unknown): void {
    const call = ContextEngine.isValid ? ContextEngine.currentCtxEngine!.ctxLogic.call : undefined
    if (!call) {
        throw new Error(
            'recordObjectActionSync requires an object action call context: ' +
                '显式 store 的变更只能在对象路由内登记；后台写路径必须复用 Action 或走显式同步投递。',
        )
    }
    if (call.responseTransport !== 'object') {
        throw new Error(
            `recordObjectActionSync requires an object transport call, got ${String(call.responseTransport)}: ` +
                '非对象出口的变更进不了 reply.sync，必须改为在对象路由内执行或显式投递。',
        )
    }
    call.appendSyncChange(call.uId, mods)
}

export class ObjectActionCall<Req, Res> extends ApiCall<Req, Res> {
    override readonly responseTransport = 'object' as const

    /** 可信外部字符串 uid；跨进程转发时随请求一起传递。 */
    readonly externalUid?: string

    constructor(
        readonly route: string,
        req: Req,
        res: Res,
        handler: ObjectActionHandler<Req, Res>,
        identity: ObjectActionIdentity,
    ) {
        if (!route || !Number.isSafeInteger(identity.uid) || identity.uid <= 0
            || !Number.isSafeInteger(identity.sId) || identity.sId < 1 || identity.sId > 65535) {
            throw new Error('object action requires a route and trusted internal uid/sId')
        }
        const parent = ContextEngine.isValid ? ContextEngine.currentCtxEngine!.ctxLogic.call : undefined
        // 只消费 ApiCall 的上下文描述：路由是字符串，没有数字协议号，也没有 schema id。
        super({
            protocol: { name: route, type: 'api', serviceType: route.split('.')[0] },
            messageHead: {
                sendId: 0, targetId: 0, msgType: MsgType.MessageLocalAction,
                direction: MessageDirection.request,
                uId: identity.uid, serverId: identity.sId,
                traceId: identity.traceId ?? parent?.messageHead.traceId ?? TraceIdGen.next(),
                isError: 0, invokeLayer: identity.invokeLayer ?? parent?.messageHead.invokeLayer ?? 0,
            },
            uId: identity.uid,
            req,
            res,
            handler: {
                getTaskGroupId: async () => handler.getTaskGroupId?.(this),
                getBindId: async () => handler.getBindId?.(this),
                actionBefore: async () => { await handler.actionBefore?.(this) },
                doAction: async (request, response) => { await handler.doAction(request, response, this) },
            },
        })
        // 转发链上的嵌套对象调用继承首次解析结果，避免目标进程重算后再次路由。
        const forwardedParent = parent as ObjectActionCall<Req, Res> | undefined
        this.externalUid = identity.externalUid ?? forwardedParent?.externalUid
        const routing = identity.routing ?? (parent?.routingResolved ? parent : undefined)
        if (routing) {
            this.taskGroupId = routing.taskGroupId
            this.bindId = routing.bindId
            this.routingResolved = true
        }
    }

    override getApiType(): string {
        return this.route.split('.')[0]
    }

    protected async _sendReturn(_ret: ApiReturn<Res>): Promise<{ opSuccess: boolean }> {
        return { opSuccess: true }
    }

    get result(): { readonly ok: true; readonly data: Res; readonly sync?: unknown } | { readonly ok: false; readonly error: unknown } {
        const ret = this.return
        if (!ret) return { ok: false, error: new Error(`object action did not return: ${this.route}`) }
        if (!ret.isSucc) return { ok: false, error: this.failureCause ?? ret.err }
        const sync = this.syncForReply ?? (this.syncChanges?.[this.uId] === undefined ? undefined : { mods: this.syncChanges[this.uId] })
        return sync === undefined
            ? { ok: true, data: ret.res }
            : { ok: true, data: ret.res, sync }
    }
}

/** 与本地 Action 共用调度、上下文、事件、Redis 提交和提交后任务；仅响应出口不再附加 PB mod。 */
export async function executeObjectAction<Req, Res>(
    route: string,
    req: Req,
    res: Res,
    handler: ObjectActionHandler<Req, Res>,
    identity: ObjectActionIdentity,
): Promise<{ readonly ok: true; readonly data: Res; readonly sync?: unknown } | { readonly ok: false; readonly error: unknown }> {
    const call = new ObjectActionCall(route, req, res, handler, identity)
    await RouteAction.onApiCall(call)
    return call.result
}

/** 跨进程转发请求在目标 worker 内的父调用路由名；只占分组、不承载业务。 */
const FORWARDED_ROUTE = 'internal.forwardedRoute'

/**
 * 目标 worker 执行跨进程转发过来的对象路由。
 *
 * 先建立父调用再执行 `run`，父调用占用 bindId 分组；直接业务 ObjectActionCall
 * 继承 taskGroupId、bindId 与 traceId 后就地执行，不重算调度，也不会被误判为跨进程绕回。
 * 业务失败按原始错误抛出，避免在进程边界被压成数字错误码。
 */
export async function executeForwardedRoute<T>(identity: ObjectActionIdentity, run: () => Promise<T>): Promise<T> {
    let value: T | undefined
    const call = new ObjectActionCall<Record<string, never>, Record<string, never>>(
        FORWARDED_ROUTE,
        {},
        {},
        {
            doAction: async () => {
                value = await run()
            },
        },
        identity,
    )
    await RouteAction.onApiCall(call)
    const result = call.result
    if (!result.ok) throw result.error
    return value as T
}
