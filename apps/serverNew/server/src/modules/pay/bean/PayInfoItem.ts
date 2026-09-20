import { Bean } from '@arthropoda/game-engine'
/**
 * 玩家充值信息
 */
export class PayInfoItem extends Bean {
    /**
     * 充值档id
     */
    id: int = 0

    /**
     * 是否有首充翻倍资格
     */
    isDouble: boolean = false

    /**
     * 已购数量
     */
    buyNum: int = 0

    /**
     * 上次购买时间
     */
    buyTime: int = 0
}
