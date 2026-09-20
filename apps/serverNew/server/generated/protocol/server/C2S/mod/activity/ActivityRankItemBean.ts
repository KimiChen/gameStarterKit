import { RankAwardItemBean } from '../activity/RankAwardItemBean'

export interface ActivityRankItemBean {
    /**
     * 活动名称
     */
    activityName: string
    /**
     * 领取奖励,0不可领取,1可领取，2已领取
     */
    award: int
    /**
     * 排行榜关键字
     */
    rankKey: string
    /**
     * 排行榜最大数量
     */
    num: int
    /**
     * 是否跨服
     */
    isCross: boolean
    /**
     * 领奖信息
     */
    awardInfos?: Map<int, RankAwardItemBean>
    /**
     * 是否已结算
     */
    settlement: boolean
}
