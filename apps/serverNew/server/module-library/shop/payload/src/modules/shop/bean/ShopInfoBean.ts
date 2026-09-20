import { Bean, DiffMap } from '@arthropoda/game-engine'
import { ShopItemBean } from './ShopItemBean'

export class ShopInfoBean extends Bean {
    /**
     * 已购买商品信息,或者可购买的商品列表
     */
    l?: DiffMap<int, ShopItemBean>

    /**
     * 展示的刷新时间
     */
    showExpiredTime: int = 0

    /**
     * 已刷新次数
     */
    refreshNum: int = 0
}
