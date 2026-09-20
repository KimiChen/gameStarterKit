import { Bean, DiffMap, OnlyRedis } from '@arthropoda/game-engine'
import { MissionItem } from './MissionItem'

export class MissionBean extends Bean {
    /**
     * 历练个人数据
     */
    missions?: DiffMap<int, MissionItem>

    /**
     * 今日(跨服)夔牛挑战次数
     */
    @OnlyRedis
    dailyKuiCowTimes: int = 0

    /**
     * 当前个人历练新手保护额外奖励可领地图
     */
    missionAwardsMapId: int = 0
}
