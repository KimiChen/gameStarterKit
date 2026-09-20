import { Bean, DiffArray } from '@arthropoda/game-engine'

export class TowerBean extends Bean {
    /**
     * 当前正在挑战的爬塔ID
     */
    towerId: int = 0

    /**
     * 当前场景是否扣除道具
     */
    towerCost: int = 0

    /**
     * 爬塔每日被帮助次数
     */
    towerDailyHelps: int = 0

    /**
     * 爬塔当前挑战是否被帮助
     */
    towerBeHelpUid?: DiffArray<int>

    /**
     * 个人领取奖励id列表
     */
    towerSelfAwards?: DiffArray<int>

    /**
     * 全服领取奖励id列表
     */
    towerGlobalAwards?: DiffArray<int>
}
