import { MessageHead } from './message'
import { ApiProtocol, PushProtocol, BaseProtocolType } from '../../../protocol/ProtocolInterface'

export interface BaseCallOptions<ServiceType extends BaseProtocolType> {
    protocol: ApiProtocol | PushProtocol
    messageHead: MessageHead
    uId: int
}

export abstract class BaseCall<ServiceType extends BaseProtocolType> {
    readonly protocol: ApiProtocol | PushProtocol

    readonly startTime: int

    readonly messageHead: MessageHead

    readonly uId: int

    protected constructor(options: BaseCallOptions<ServiceType>) {
        this.protocol = options.protocol
        this.startTime = Date.now()
        this.messageHead = options.messageHead
        this.uId = options.messageHead.uId ?? 0
    }
}
