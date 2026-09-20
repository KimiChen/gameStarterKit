import { Mod, ServerHash, UtilTime } from '@arthropoda/game-engine'
import { ShopInfoBean } from './ShopInfoBean'

/**
 * 商店
 */
@Mod
export class Shop extends ServerHash {
    id: int = 0

    /**
     * 基础商店
     */
    shop?: ShopInfoBean

    /**
     * 爱心商店
     */
    shopLove?: ShopInfoBean

    /**
     * 联盟商店
     */
    shopGuild?: ShopInfoBean

    /**
     * 夔牛商店
     */
    shopCow?: ShopInfoBean

    /**
     * 竞技商店
     */
    shopArena?: ShopInfoBean

    /**
     * 馈礼坊商店
     */
    shopBack?: ShopInfoBean

    expireTime(): number {
        return 32 * UtilTime.DAY_SECOND
    }

    getNotifyUids(): number[] {
        return [this.id]
    }
}
