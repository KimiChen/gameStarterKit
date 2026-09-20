import { ProtocolConfig, EngineInitHelper } from '@arthropoda/game-engine'
import { Actions as C2SActions } from '../../../generated/protocol/server/C2S/actions'
import { MsgType } from './C2S/message'
import { serviceProto as C2SServiceProto } from '../../../generated/protocol/server/C2S/serviceProto'

export class ProtocolConfigInitializer {
    private static actionExecutor: ProtocolConfig['execAction'] | undefined

    static registerActionExecutor(actionExecutor: ProtocolConfig['execAction']) {
        this.actionExecutor = actionExecutor
    }

    static async init() {
        if (!this.actionExecutor) {
            throw new Error('protocol action executor is not registered')
        }
        // 核心注册表只含字符串路由、handler 与元数据；PB schema 已随 P6 整体删除，
        // 因此这里不再有「注册 PB schema」这一步，也没有可回退的编解码路径。
        const cfg: ProtocolConfig = {
            actions: {} as ProtocolConfig['actions'],
            protocols: {} as ProtocolConfig['protocols'],
            execAction: this.actionExecutor,
        }
        cfg.actions[MsgType.MessageC2Server] = C2SActions
        cfg.protocols[MsgType.MessageC2Server] = C2SServiceProto

        await EngineInitHelper.initProtocolInfo(cfg)
    }
}
