import { IActionLogic } from '../../../action/IActionLogic'
import { MsgType } from '../../../protocol/MsgType'
import { BaseCall, BaseCallOptions } from './BaseCall'
import { CallGroup } from '../../../task/RouteAction'
import { timestamp } from '../../../utils/common'
import { ApiProtocol, ApiReturn, BaseProtocolType } from '../../../protocol/ProtocolInterface'
import { GameError } from '../../../error/GameError'
import { ErrorData } from '../../../error/ErrorData'
import { MsgError } from '../../../protocol/MsgError'

export interface ApiCallOptions<Req, Res, ServiceType extends BaseProtocolType> extends BaseCallOptions<ServiceType> {
    protocol: ApiProtocol
    req: Req
    res: Res
    /** 已解析的对象 handler 不需要初始化 wire codec 或协议表。 */
    handler?: IActionLogic<Req, Res>
}

export type ApiHandler = any

/** 该类同时服务客户端直连与进程内调用，不要加入传输层专用逻辑。 */
export abstract class ApiCall<
    Req = any,
    Res = any,
    ServiceType extends BaseProtocolType = any,
> extends BaseCall<ServiceType> {
    readonly type = 'api' as const

    readonly responseTransport: 'legacy' | 'object' = 'legacy'
    /** 原始业务失败仅留在进程内，wire 层必须显式转换。 */
    failureCause?: unknown

    readonly req: Req

    readonly res: Res

    protected _return?: ApiReturn<Res>

    public actionClass: any

    public actionHandler?: IActionLogic

    /** 绑定分组id */
    public groupName?: string

    /** Event Worker 首次解析后随 IPC 透传的 bindId；Task Worker 不得重复计算。 */
    public routedBindId?: int

    public callGroup?: CallGroup

    public readonly callTime: int = 0

    protected constructor(options: ApiCallOptions<Req, Res, ServiceType>) {
        super(options)
        this.req = options.req
        this.res = options.res

        if (options.handler) {
            this.actionHandler = options.handler
        } else {
            this.actionClass = this.loadApiHandler(options.messageHead.msgType, this.protocol as ApiProtocol)
            if (this.actionClass) this.actionHandler = new this.actionClass()
        }
        this.callTime = timestamp()
    }

    public get return(): ApiReturn<Res> | undefined {
        return this._return
    }

    succ(res: Res): Promise<void> {
        return this._prepareReturn({
            isSucc: true,
            res: res,
        })
    }

    protected async _prepareReturn(ret: ApiReturn<Res>): Promise<void> {
        if (this._return) {
            return
        }
        this._return = ret

        // Do send!
        const opSend = await this._sendReturn(ret)
        if (!opSend.opSuccess) {
            console.error(opSend.err)
            return
        }

    }

    error(errOrMsg: string | MsgError, data?: Partial<MsgError>): Promise<void> {
        let error: MsgError
        if (typeof errOrMsg === 'string') {
            error = new ErrorData(data?.code ?? 0, data?.message ?? '')
        } else {
            error = errOrMsg
        }
        if (data) {
            for (const key in data) {
                Reflect.set(error, key, Reflect.get(data, key))
            }
        }
        return this._prepareReturn({
            isSucc: false,
            err: error,
        })
    }

    protected abstract _sendReturn(ret: ApiReturn<Res>): Promise<{ opSuccess: boolean; err?: string }>

    async actionBefore() {
        // exec API handler
        if (this.actionHandler) {
            await this.actionHandler.actionBefore(this)
        } else {
            // 未找到ApiHandler，且未进行任何输出
            await this.error(`Unhandled API: ${this.protocol.name}`, {
                code: GameError.runtimeError.code,
                message: 'UNHANDLED_API',
            })
        }
    }

    /** 真正调用业务 */
    async doAction() {
        // exec API handler
        if (this.actionHandler) {
            await this.actionHandler.doAction(this.req, this.res)
        } else {
            // 未找到ApiHandler，且未进行任何输出
            await this.error(`Unhandled API: ${this.protocol.name}`, {
                code: GameError.runtimeError.code,
                message: 'UNHANDLED_API',
            })
        }
        return this.res
    }

    public getApiName(): string {
        const service = this.protocol as ApiProtocol
        return service.name
    }

    public getApiType(): string {
        // 分组来自字符串路由的元数据；没有声明时退回 apiName 的第一段。
        const service = this.protocol as ApiProtocol
        if (service.serviceType) {
            return service.serviceType
        }
        const name = service.name
        const index = name.indexOf('/')
        if (index === -1) {
            return ''
        }
        return name.substring(0, index)
    }

    public getMsgType(): MsgType {
        return this.messageHead.msgType
    }

    public loadApiHandler<T extends MsgType>(type: T, svc: ApiProtocol): any {
        throw new Error('not inject yet')
    }

    public loadApiHandlerByName<T extends MsgType>(type: T, name: string) {
        throw new Error('not inject yet')
    }
}

export declare type EncodeApiReturnOutput<T> =
    | {
        isSucc: true
        output: T
        errMsg?: undefined
    }
    | {
        isSucc: false
        errMsg: string
        output?: undefined
    }
