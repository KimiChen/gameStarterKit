import { MsgType } from '../../../protocol/MsgType'

export enum MessageDirection {
    default = 0, //表示该请求不关心数据方向,比如不需要返回的请求 推送等
    request,
    response,
}

export type MessageHead = {
    /** 来源fd, 可以是玩家链接也可以是微服务链接fd */
    sendId: int
    /** 目标fd */
    targetId: int
    /** 消息类型,由发起方设置,全链路透传不应该变更 */
    msgType: MsgType
    /** 消息的方向 */
    direction?: MessageDirection
    uId?: int
    serverId?: int
    traceId: int
    isError: int
    /** 调用层级防止发生递归调用 0-255 */
    invokeLayer: int
}
