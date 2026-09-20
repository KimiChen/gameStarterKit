import { Service } from '../../runtime/protocol/ServiceType'

/**
 *  一次性的红点，客户端手动消除
 */
export interface ReqRedDotRead extends Service<'Base'> {
    /**
     * 红点类型
     */
    type: string
    /**
     * 红点KEY，list类型的红点需要传
     */
    key: string
    /**
     * 聊天内消除红点的指定ID
     */
    extraId: int
}
