import { Bean } from '@arthropoda/game-engine'

export class PowerBuyItem extends Bean {
    /**
     * 购买类型
     */
    type: int = 0

    /**
     * 购买次数
     */
    times: int = 0
}
