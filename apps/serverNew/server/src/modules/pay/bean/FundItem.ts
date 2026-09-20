import { DiffArray } from '@arthropoda/game-engine'
import { Bean } from '@arthropoda/game-engine'

/**
 * 基金购买详情
 */
export class FundItem extends Bean {
    /**
     * 基金id
     */
    id: string = ''

    /**
     * 已购买次数
     */
    num: int = 0

    /**
     * 已领取免费奖励
     */
    freeAwards?: DiffArray<int>

    /**
     * 已领取付费奖励
     */
    payAwards?: DiffArray<int>
}
