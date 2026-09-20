export interface ActivityItemBean {
    /**
     * 活动配置表的id
     */
    id: int
    /**
     * 活动名称
     */
    name: string
    /**
     * 活动开始时间
     */
    startTs: int
    /**
     * 活动结束时间
     */
    endTs: int
    /**
     * 奖励开始时间
     */
    awardStart: int
    /**
     * 奖励结束时间
     */
    awardEnd: int
    /**
     * 预览时间
     */
    openTs: int
    /**
     * 预览关闭时间
     */
    closeTs: int
    /**
     * 每日开启时间
     */
    dailyStart: int
    /**
     * 每日结束时间
     */
    dailyEnd: int
    /**
     * 结算期时长-秒
     */
    settleTime: int
    /**
     * 跨服活动涉及的区服id
     */
    crossSids?: int[]
    /**
     * 跨服自增id
     */
    crossId: int
}
