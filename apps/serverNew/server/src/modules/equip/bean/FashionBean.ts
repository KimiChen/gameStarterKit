import { Bean } from '@arthropoda/game-engine'

export class FashionBean extends Bean {
    /**
     * 时装ID
     */
    cId: int = 0

    /**
     * 时装类型
     */
    type: int = 0

    /**
     * 时装耐久
     */
    durable: int = 0
}
