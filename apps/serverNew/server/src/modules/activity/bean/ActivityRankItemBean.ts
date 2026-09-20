import { Bean } from '@arthropoda/game-engine'
import { OnlyNet } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { RankAwardItemBean } from './RankAwardItemBean'

export class ActivityRankItemBean extends Bean {
    /**
     * 活动名称
     */
    activityName: string = ''

    /**
     * 领取奖励,0不可领取,1可领取，2已领取
     */
    award: int = 0

    /**
     * 排行榜关键字
     */
    rankKey: string = ''

    /**
     * 排行榜最大数量
     */
    num: int = 0

    /**
     * 是否跨服
     */
    isCross: boolean = false

    /**
     * 领奖信息
     */
    awardInfos?: DiffMap<int, RankAwardItemBean>

    /**
     * 是否已结算
     */
    @OnlyNet
    settlement: boolean = false
}
