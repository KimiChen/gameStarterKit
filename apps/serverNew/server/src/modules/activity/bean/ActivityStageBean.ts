import { ServerHashJson } from '@arthropoda/game-engine'
import { DiffArray } from '@arthropoda/game-engine'
import { ActivityItemBean } from './ActivityItemBean'

/**
 * 活动阶段状态缓存
 * redisKey:ActivityStageCache_sId
 * key:activityName
 */
export class ActivityStageBean extends ServerHashJson {
    /**
     * 活动id
     */
    id: int = 0

    /**
     * 区服Id
     */
    sId: int = 0

    /**
     * 活动id
     */
    activityId: int = 0

    /**
     * 活动名称
     */
    activityName: string = ''

    /**
     * 活动信息
     */
    openInfo?: ActivityItemBean

    /**
     * 活动配置盐值
     */
    salt: string = ''

    /**
     * 活动当前阶段
     */
    stage: int = 0

    /**
     * 参与的区服id列表
     */
    sIds?: DiffArray<int>
}
