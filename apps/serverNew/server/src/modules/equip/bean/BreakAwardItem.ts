import { Bean } from '@arthropoda/game-engine'

export class BreakAwardItem extends Bean {
    /**
     * 系统id
     */
    id: int = 0

    /**
     * 当前已领取到第几级的奖励
     */
    hasAwardLv: int = 1
}
