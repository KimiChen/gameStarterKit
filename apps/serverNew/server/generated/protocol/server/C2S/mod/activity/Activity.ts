import { ActivityItemBean } from '../activity/ActivityItemBean'
import { ActivitySaltItemBean } from '../activity/ActivitySaltItemBean'
import { ActivityRankItemBean } from '../activity/ActivityRankItemBean'
import { ActivityRankExtBean } from '../activity/ActivityRankExtBean'
import { RechargeTotalItemBean } from '../activity/RechargeTotalItemBean'
import { ActivityDrawInfo } from '../activity/ActivityDrawInfo'

export interface Activity {
    id: int
    /**
     * 活动版本号,用于前后端同步活动是否更新
     */
    activityVersion: string
    /**
     * 活动列表<name,Item>
     */
    l?: Map<string, ActivityItemBean>
    /**
     * 活动配表盐值<name,Item>
     */
    dl?: Map<string, ActivitySaltItemBean>
    /**
     * 活动排行榜信息
     */
    activityRankInfo?: Map<string, ActivityRankItemBean>
    /**
     * 活动排行榜额外信息
     */
    activityRankExtInfo?: Map<string, ActivityRankExtBean>
    /**
     * 累计充值信息
     */
    rechargeTotal?: Map<string, RechargeTotalItemBean>
    /**
     * 各活动抽奖信息, [活动名+活动日期=>ActivityDrawInfo]
     */
    drawInfos?: Map<string, ActivityDrawInfo>
}
