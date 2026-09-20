import { DiffArray } from '@arthropoda/game-engine'
import { Bean } from '@arthropoda/game-engine'

export class TaskBoxAwardItem extends Bean {
    /**
     * 类型
     */
    type: int = 0

    /**
     * 已领奖列表
     */
    box?: DiffArray<int>
}
