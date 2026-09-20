import { Bean } from '@arthropoda/game-engine'

export class EquipBean extends Bean {
    /**
     * 装备坑位
     */
    pos: int = 0

    /**
     * 装备ID
     */
    id: int = 0

    /**
     * 对应宝石ID
     */
    gemId: int = 0

    /**
     * 穿戴装备历史等级
     */
    hisLevel: int = 0

    /**
     * 穿戴装备历史品质
     */
    hisQuality: int = 0
}
