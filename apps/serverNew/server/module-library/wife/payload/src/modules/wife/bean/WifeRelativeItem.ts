import { Bean } from '@arthropoda/game-engine'

export class WifeRelativeItem extends Bean {
    /**
     * 亲属id
     */
    id: int = 0

    /**
     * 奖励领取时间-当天时间表示已领取
     */
    awardTime: int = 0
}
