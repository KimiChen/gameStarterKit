import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 点击充值请求
 */
export interface ReqPayClick extends Service<'Base'> {
    /**
     * 计费点ID
     */
    id: int

    /**
     * 渠道ID
     */
    channel: string

    /**
     * 礼包ID
     */
    giftId?: int

    /**
     * 活动名称
     */
    activityName?: string
}

/**
 * 点击充值响应
 */
export interface ResPayClick {
    /**
     * 计费点ID
     */
    id: int

    /**
     * 计费点名称
     */
    name: string

    /**
     * 角色ID
     */
    roleId: int

    /**
     * 计费点价格
     */
    price: int

    /**
     * 支付回调地址
     */
    payback: string
}
