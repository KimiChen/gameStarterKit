import { MissionItem } from '../mission/MissionItem'

export interface MissionBean {
    /**
     * 历练个人数据
     */
    missions?: Map<int, MissionItem>
    /**
     * 今日(跨服)夔牛挑战次数
     */
    dailyKuiCowTimes: int
    /**
     * 当前个人历练新手保护额外奖励可领地图
     */
    missionAwardsMapId: int
}
