import { ServerHash } from '@arthropoda/game-engine'
import { Mod, OnlyNet } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { ActivityItemBean } from './ActivityItemBean'
import { ActivityRankExtBean } from './ActivityRankExtBean'
import { ActivityRankItemBean } from './ActivityRankItemBean'
import { ActivitySaltItemBean } from './ActivitySaltItemBean'
import { RechargeTotalItemBean } from './RechargeTotalItemBean'
import { ActivityDrawInfo } from './ActivityDrawInfo'

/**
 * 客户端拉取活动信息mod
 */
@OnlyNet
@Mod
export class Activity extends ServerHash {
    id: int = 0

    /**
     * 活动版本号,用于前后端同步活动是否更新
     */
    activityVersion: string = ''

    /**
     * 活动列表<name,Item>
     */
    l?: DiffMap<string, ActivityItemBean>

    /**
     * 活动配表盐值<name,Item>
     */
    dl?: DiffMap<string, ActivitySaltItemBean>

    /**
     * 活动排行榜信息
     */
    activityRankInfo?: DiffMap<string, ActivityRankItemBean>

    /**
     * 活动排行榜额外信息
     */
    activityRankExtInfo?: DiffMap<string, ActivityRankExtBean>

    /**
     * 累计充值信息
     */
    rechargeTotal?: DiffMap<string, RechargeTotalItemBean>

    /**
     * 各活动抽奖信息, [活动名+活动日期=>ActivityDrawInfo]
     */
    drawInfos?: DiffMap<string, ActivityDrawInfo>
}
