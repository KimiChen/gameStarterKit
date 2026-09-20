import { DiffArray } from '@arthropoda/game-engine'
import { Bean } from '@arthropoda/game-engine'

export class RechargeTotalItemBean extends Bean {
    /**
     * 活动名称
     */
    activityName: string = ''

    /**
     * 充值的金额
     */
    recharge: int = 0

    /**
     * 已领取档位集合
     */
    gets?: DiffArray<int>
}
