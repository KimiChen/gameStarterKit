export interface FirstPayItem {
    /**
     * 充值表id
     */
    id: int
    /**
     * 登录天数
     */
    loginDays: int
    /**
     * 已领取的奖励天数
     */
    hasAwards: int
    /**
     * 是否弹窗
     */
    isPop: boolean
}
