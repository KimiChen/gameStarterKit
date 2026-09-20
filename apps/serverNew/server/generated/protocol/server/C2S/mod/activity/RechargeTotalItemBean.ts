export interface RechargeTotalItemBean {
    /**
     * 活动名称
     */
    activityName: string
    /**
     * 充值的金额
     */
    recharge: int
    /**
     * 已领取档位集合
     */
    gets?: int[]
}
