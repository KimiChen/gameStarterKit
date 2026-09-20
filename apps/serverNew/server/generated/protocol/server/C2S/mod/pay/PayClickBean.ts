export interface PayClickBean {
    id: int
    /**
     * 玩家ID
     */
    uId: int
    /**
     * 渠道ID
     */
    channel: string
    /**
     * 订单ID
     */
    billno: string
    /**
     * 计费点ID
     */
    rechargeId: int
    /**
     * 礼包ID
     */
    giftId: int
    /**
     * 活动名称
     */
    activity: string
}
