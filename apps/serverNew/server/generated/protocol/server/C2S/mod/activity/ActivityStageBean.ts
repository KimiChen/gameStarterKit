import { ActivityItemBean } from '../activity/ActivityItemBean'

export interface ActivityStageBean {
    /**
     * 活动id
     */
    id: int
    /**
     * 区服Id
     */
    sId: int
    /**
     * 活动id
     */
    activityId: int
    /**
     * 活动名称
     */
    activityName: string
    /**
     * 活动信息
     */
    openInfo?: ActivityItemBean
    /**
     * 活动配置盐值
     */
    salt: string
    /**
     * 活动当前阶段
     */
    stage: int
    /**
     * 参与的区服id列表
     */
    sIds?: int[]
}
