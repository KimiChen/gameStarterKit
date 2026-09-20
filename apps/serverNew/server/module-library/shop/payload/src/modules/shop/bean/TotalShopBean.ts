import { Bean, DiffMap } from '@arthropoda/game-engine'

export class TotalShopBean extends Bean {
    /**
     * 商店名称
     */
    shopName: string = ''

    /**
     * 已购买商品信息 [id => num]
     */
    buyInfo?: DiffMap<int, int>
}
