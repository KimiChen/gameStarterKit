import { ApiCallInner, PendingApiItem } from '../net/client/base/ApiCallInner'
import { MessageDirection, MessageHead } from '../net/client/base/message'
import { ContextEngine } from '../context/ContextEngine'
import { AsyncReturn, ApiReturn } from '../protocol/ProtocolInterface'
import { TraceIdGen } from '../net/client/codec/TraceIdGen'
import RouteAction from '../task/RouteAction'
import { IActionLogic } from '../action/IActionLogic'
import { LocalActionRegistry } from '../action/LocalActionRegistry'
import { ApiProtocol } from '../protocol/ProtocolInterface'
import { MsgType } from '../protocol/MsgType'

export class Call<T extends {}> {
    constructor(
        public name: string,
        public msg: T,
    ) {}
}

interface LocalCallOptions {
    waitReturn: boolean
    anonymousActionArgs?: {
        handler: { new (): IActionLogic }
    }
}

/**
 * 进程内调用出口。
 *
 * 只负责「按字符串路由找到 handler 并执行」，不持有任何传输层实现：数据通知由各通道自己
 * 发送（原生 Lobby 走 shared 声明的领域推送），因此这里没有 wire 编码、没有跨进程重放，
 * 也没有面向客户端的推送接口。
 */
export class MessageHelper {
    static sendLocalAction(uId: int, sId: int, call: Call<any>) {
        this.doLocalCall(uId, sId, call, { waitReturn: false }).catch((error) => {
            Log.error(`[sendLocalAction] call '${call.name}' error`, error)
        })
    }

    static async callLocalAction<Req extends {}, Res = any>(
        uId: int,
        sId: int,
        call: Call<Req>,
    ): Promise<AsyncReturn<Res>> {
        try {
            return (await this.doLocalCall(uId, sId, call, { waitReturn: true })) as AsyncReturn<Res>
        } catch (error) {
            Log.error(`[callLocalAction] call '${call.name}' error`, error)
            return {
                isSucc: false,
                errMsg: error instanceof Error ? error.message : String(error),
                res: error instanceof Error ? error : undefined,
            }
        }
    }

    static asyncDoAction(uId: int, sId: int, call: Call<any>, handler: { new (): IActionLogic }) {
        this.doLocalCall(uId, sId, call, {
            waitReturn: false,
            anonymousActionArgs: { handler },
        }).catch((error) => Log.error('[asyncDoAction] call error', error))
    }

    static syncDoAction(uId: int, sId: int, call: Call<any>, handler: { new (): IActionLogic }) {
        return this.doLocalCall(uId, sId, call, {
            waitReturn: true,
            anonymousActionArgs: { handler },
        })
    }

    static async syncDoFunc<T>(fn: () => T | Promise<T>): Promise<Awaited<T>> {
        let value: Awaited<T>
        const handler = class implements IActionLogic {
            async getBindId(): Promise<number | undefined> {
                return 0
            }
            async actionBefore(): Promise<void> {
                return
            }
            async doAction(): Promise<void> {
                value = await fn()
            }
        }
        const result = await this.syncDoAction(0, 0, new Call('default/Default', {}), handler)
        if (!result.isSucc) {
            throw result.res ?? new Error(result.errMsg)
        }
        return value!
    }

    static broadcastLocalAction(call: Call<any>) {
        this.sendLocalAction(0, 0, call)
    }

    private static async doLocalCall(
        uId: int,
        sId: int,
        call: Call<any>,
        options: LocalCallOptions,
    ): Promise<AsyncReturn<any>> {
        const actionClass = options.anonymousActionArgs?.handler ?? LocalActionRegistry.get(call.name)
        if (!actionClass) {
            throw new Error(`local action protocol not found: ${call.name}`)
        }

        const protocol: ApiProtocol = {
            name: call.name,
            type: 'api',
            serviceType: 'local',
        }

        const currentCall = ContextEngine.isValid ? ContextEngine.currentCtxEngine!.ctxLogic.call : undefined
        const head: MessageHead = {
            sendId: 0,
            targetId: 0,
            msgType: MsgType.MessageLocalAction,
            direction: MessageDirection.request,
            uId,
            serverId: sId,
            traceId: options.waitReturn ? (currentCall?.messageHead.traceId ?? TraceIdGen.next()) : 0,
            isError: 0,
            invokeLayer: currentCall?.messageHead.invokeLayer ?? 0,
        }

        let resolveResult: (result: AsyncReturn<any>) => void = () => undefined
        const resultPromise = new Promise<AsyncReturn<any>>((resolve) => {
            resolveResult = resolve
        })
        const pending: PendingApiItem = {
            onReturn: (result: ApiReturn<any>) => {
                if (result.isSucc) {
                    resolveResult({ isSucc: true, res: result.res })
                } else {
                    resolveResult({ isSucc: false, res: result.err, errMsg: result.err.message })
                }
            },
        }
        const actionCall = new ApiCallInner(
            pending,
            {
                protocol,
                messageHead: head,
                uId,
                req: call.msg,
                res: {},
            },
            { handler: actionClass },
        )

        if (options.waitReturn) {
            await RouteAction.onApiCall(actionCall)
            return resultPromise
        }
        RouteAction.onApiCall(actionCall).catch((error) => Log.error(error))
        return { isSucc: true, res: undefined }
    }
}
