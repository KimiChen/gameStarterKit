export interface FundItem {
    /**
     * 基金id
     */
    id: string
    /**
     * 已购买次数
     */
    num: int
    /**
     * 已领取免费奖励
     */
    freeAwards?: int[]
    /**
     * 已领取付费奖励
     */
    payAwards?: int[]
}
