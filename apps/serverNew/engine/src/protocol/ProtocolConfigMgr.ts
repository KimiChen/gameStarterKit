import { ApiCall } from '../net/client/base/ApiCall'
import { ApiProtocol, ProtocolInfoMap, ServiceProto } from './ProtocolInterface'
import { MsgType } from './MsgType'

export interface ProtocolConfig {
    /** MsgType => { apiName => Action 类 }：字符串路由到 handler。 */
    actions: Record<MsgType, { [apiName: string]: any }>
    /** MsgType => 字符串路由元数据（分组与推送名）。⛔ 不含数字协议号与 schema。 */
    protocols: Record<MsgType, ServiceProto>
    //onlyJsonFunction
    execAction: (reqData: any, ip?: string) => Promise<string>
}

/**
 * 客户端协议与本地 Action 的注册表：**只按字符串路由**索引 handler 与元数据。
 *
 * 这里不持有任何编解码实现，也不分配数字协议号：请求/响应的 wire 编解码由各通道自己的
 * codec 负责（原生 Lobby 走 shared 契约），因此核心 Action/Bean 流程与传输层完全解耦。
 */
export class ProtocolConfigMgr {
    private static actions: Record<MsgType, { [apiName: string]: any }>

    /** 字符串路由元数据 */
    private static protocolMap: Record<MsgType, ProtocolInfoMap>

    //onlyJsonFunction
    static execAction: (reqData: any, ip?: string) => Promise<string>

    public static async init(cfg: ProtocolConfig) {
        this.actions = {} as any
        this.protocolMap = {} as any

        for (const key in cfg.actions) {
            const msgType = Int(key) as MsgType
            this.actions[msgType] = cfg.actions[msgType]
        }

        for (const key in cfg.protocols) {
            const msgType = Int(key) as MsgType
            this.protocolMap[msgType] = getProtocolMap(cfg.protocols[msgType])
        }

        this.execAction = cfg.execAction

        //方法注入,断开循环引用报错
        ApiCall.prototype.loadApiHandler = this.loadAction.bind(this)
        ApiCall.prototype.loadApiHandlerByName = this.loadActionByName.bind(this)
    }

    /**
     * 获取当前协议的版本号
     */
    public static loadVersion(type: MsgType): int {
        return this.protocolMap[type]?.version ?? 0
    }

    public static loadAction<T extends MsgType>(type: T, svc: ApiProtocol) {
        return this.actions[type]?.[svc.name]
    }

    public static loadActionByName<T extends MsgType>(type: T, name: string) {
        return this.actions[type]?.[name]
    }

    public static loadApiProtocolByName(type: MsgType, name: string) {
        const info = this.protocolMap[type]?.apiName2Protocol[name]
        return info === undefined ? undefined : info
    }

    public static loadMsgProtocolByName<T extends MsgType>(type: T, msgName: string) {
        if (this.protocolMap[type] === undefined) {
            return undefined
        }
        return this.protocolMap[type].pushName2Protocol[msgName]
    }

    static get getApiProtocolMap(): Record<MsgType, ApiProtocol[]> {
        const r: Record<MsgType, ApiProtocol[]> = {} as any
        for (const key in this.protocolMap) {
            const msgType = Int(key) as MsgType
            const protocolMap = this.protocolMap[msgType]
            for (const apiName in protocolMap.apiName2Protocol) {
                const item = protocolMap.apiName2Protocol[apiName]
                if (!item) {
                    throw new Error('getApiProtocolMap:' + msgType)
                }
                r[msgType] = r[msgType] ?? []
                r[msgType].push(item)
            }
        }
        return r
    }
}

/** 只按字符串路由建立索引；数字协议号与 schema id 不再存在。 */
function getProtocolMap(proto: ServiceProto): ProtocolInfoMap {
    const map: ProtocolInfoMap = {
        version: proto.version ?? 0,
        apiName2Protocol: {},
        pushName2Protocol: {},
    }

    for (const v of proto.protocols) {
        if (v.type === 'api') {
            map.apiName2Protocol[v.name] = { type: 'api', name: v.name, serviceType: v.serviceType ?? '' }
        } else {
            map.pushName2Protocol[v.name] = { type: 'push', name: v.name }
        }
    }

    return map
}
