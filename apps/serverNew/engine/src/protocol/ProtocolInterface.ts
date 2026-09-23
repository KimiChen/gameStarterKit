import { MsgError } from './MsgError'

/**
 * 字符串路由的协议元数据。
 *
 * ⛔ 不含数字协议号、schema id 与 PB/tsbuffer 结构：路由只以字符串标识，请求与响应的编解码
 * 由各通道自己的 wire codec 负责（原生 Lobby 走 shared 契约）。保留 `serviceType` 是因为
 * 分组与并发控制仍按微服务分组进行。
 */
export interface ProtocolDef {
    type: 'api' | 'push'
    name: string
    /** api 路由的微服务分组；push 不参与分组。 */
    serviceType?: string
}

export interface ServiceProto {
    version?: number
    protocols: ProtocolDef[]
}

/** 编解码时的消息类型字符串值,而不是ts代码语法的类型 */
export class ProtocolType {
    static readonly API = 'api'

    static readonly PUSH = 'push'
}

export interface ApiProtocol {
    type: 'api'
    name: string
    serviceType: string
}

export interface PushProtocol {
    type: 'push'
    name: string
}

/** 按 MsgType 分类的协议元数据表；只描述字符串路由与分组，不携带任何编解码实现。 */
export interface ProtocolInfoMap {
    version: number
    apiName2Protocol: {
        [apiName: string]: ApiProtocol | undefined
    }
    pushName2Protocol: {
        [pushName: string]: PushProtocol | undefined
    }
}

export type ApiReturn<Res> = ApiReturnSucc<Res> | ApiReturnError

export type AsyncReturn<Res> = AsyncReturnSucc<Res> | AsyncReturnError

export interface AsyncReturnSucc<Res> {
    isSucc: true
    res: Res
    errMsg?: undefined
}

export interface AsyncReturnError {
    isSucc: false
    res?: MsgError | Error
    errMsg: string
}

export interface ApiReturnSucc<Res> {
    isSucc: true
    res: Res
    err?: undefined
}
export interface ApiReturnError {
    isSucc: false
    res?: undefined
    err: MsgError
}

export interface BaseProtocolType {
    /** Send a request, and wait for a response */
    api: {
        [apiName: string]: {
            /** Request type */
            req: any
            /** Response type */
            res: any
        }
    }
    /** Msg service, listen or send one-way msg without response  */
    push: {
        /** Msg type */
        [pushName: string]: any
    }
}

/** 后台可靠任务的投递身份；随 LocalAction 跨进程透传，不混入业务请求结构。 */
export interface BackgroundTaskDelivery {
    readonly taskId: string
    readonly attempt: number
}
