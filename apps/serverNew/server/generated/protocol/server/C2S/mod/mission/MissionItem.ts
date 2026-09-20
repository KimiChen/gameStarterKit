export interface MissionItem {
    /**
     * 历练场景类型
     */
    type: int
    /**
     * 剩余已购买的可挑战数量
     */
    buyNum: int
    /**
     * 已挑战次数
     */
    challenge: int
    /**
     * 设置boss复活不提醒
     */
    subscribes?: Map<int, int>
    /**
     * 设置boss复活不提醒历史
     */
    subscribesHis?: Map<int, int>
    /**
     * 结算剩余的可挑战次数
     */
    settleNum: int
    /**
     * 累计挑战次数
     */
    totalTimes: int
}
