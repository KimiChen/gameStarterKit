import { Bean } from '@arthropoda/game-engine'

export class ShopItemBean extends Bean {
    id: int = 0

    /**
     * 已购买次数
     */
    buyNum: int = 0

    /**
     * 信息过期时间
     */
    expiredTime: int = 0
}
