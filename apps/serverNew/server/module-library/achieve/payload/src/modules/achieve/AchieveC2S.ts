import { AwardResponse } from '../../runtime/protocol/C2S/commom'
import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 成就资历奖励领取
 */
export interface ReqAchieveBadgeAward extends Service<'Task'> {
    cId: int
}

export interface ResAchieveBadgeAward {
    award: AwardResponse
}

/**
 * 点亮成就标签
 */
export interface ReqAchieveLabel extends Service<'Task'> {
    cId: int
}

/**
 * 点亮成就标签
 */
export interface ReqAchieveLabelDress extends Service<'Task'> {
    cId: int
    targetId: int
}

/**
 * 卸下成就标签
 */
export interface ReqAchieveLabelUnDress extends Service<'Task'> {
    cId: int
}
