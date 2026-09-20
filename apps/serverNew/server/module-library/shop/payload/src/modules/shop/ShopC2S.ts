import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'
import { ShopInfoBean } from '../../../generated/protocol/server/C2S/mod/shop/ShopInfoBean'

export interface ReqShopGetList extends Service<'Base'> {
    params: ShopGetListRequest[]
}

interface ShopGetListRequest {
    shopeName: string
}

export interface ResShopGetList {
    shop?: ShopInfoBean
    shopLove?: ShopInfoBean
    shopGuild?: ShopInfoBean
    shopCow?: ShopInfoBean
    shopArena?: ShopInfoBean
    shopBack?: ShopInfoBean
}

// export interface PbShopInfoBean {
//     l: ShopItem[] // 商店列表
//     ext: int // 前端过期时间（时间戳）
//     cKey: string // 商店名shopName
//     refreshNum: int // 商店刷新次数
// }

export interface ReqShopBuy extends Service<'Base'> {
    /**
     * 商店类型
     */
    shopName: string
    /**
     * 商品id
     */
    id: int
    /**
     * 购买数量
     */
    num: int
}

export interface ResShopBuy {
    awards: AwardResponse
}

export interface ReqShopRefresh extends Service<'Base'> {
    /**
     * 商店类型
     */
    shopName: string
}
