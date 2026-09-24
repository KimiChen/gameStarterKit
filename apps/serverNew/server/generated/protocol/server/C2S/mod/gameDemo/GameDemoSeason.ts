import { GameDemoScoreBean } from '../gameDemo/GameDemoScoreBean'
import { GameDemoRewardBean } from '../gameDemo/GameDemoRewardBean'

export interface GameDemoSeason {
    id: int

    number: int

    phase: string

    startedAt: int

    endsAt: int

    settledAt: int

    scoreSeq: int

    rewardedCount: int
    /**
     * uid → 本期积分。
     */
    scores?: Map<int, GameDemoScoreBean>
    /**
     * 已计入的炼丹批次（`uid:batchId`），可靠队列至少一次投递时据此去重；每期清空。
     */
    applied?: Map<string, int>
    /**
     * 名次 → 奖励；结算后在下一期开启前持续幂等登记投递。
     */
    rewards?: Map<int, GameDemoRewardBean>
}
