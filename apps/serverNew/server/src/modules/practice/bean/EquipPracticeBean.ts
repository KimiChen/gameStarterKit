import { Bean } from '@arthropoda/game-engine'
import { DiffArray } from '@arthropoda/game-engine'

export class EquipPracticeBean extends Bean {
    /**
     * 修炼装备唯一ID
     */
    id: int = 0

    /**
     * 装备效果
     */
    effects?: DiffArray<int>
}
