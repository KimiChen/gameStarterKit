import { timestamp } from '@arthropoda/game-engine'
import { User } from '../../user/bean/User'
import { Shop } from '../bean/Shop'
import { ShopInfoBean } from '../bean/ShopInfoBean'
import { TotalShopBean } from '../bean/TotalShopBean'

type ShopStateKey = 'shop' | 'shopLove' | 'shopGuild' | 'shopCow' | 'shopArena' | 'shopBack'

const shopStateKeys: Record<string, ShopStateKey> = {
    shop: 'shop',
    shopLove: 'shopLove',
    shopGuild: 'shopGuild',
    shopCow: 'shopCow',
    shopArena: 'shopArena',
    shopBack: 'shopBack',
}

export class ShopStateStore {
    constructor(
        private readonly user: User,
        private readonly shopName: string,
    ) {}

    async initialize() {
        const shopInfo = await this.getShopInfo(false)
        if (!shopInfo) return shopInfo

        const nowTime = timestamp()
        shopInfo.l.forEach((item, id) => {
            if (item.expiredTime <= nowTime) {
                shopInfo.l.delete(id)
            }
        })
        return shopInfo
    }

    async getShopInfo(newIfNull: true): Promise<ShopInfoBean>
    async getShopInfo(newIfNull: false): Promise<ShopInfoBean | undefined>
    async getShopInfo(newIfNull: boolean): Promise<ShopInfoBean | undefined> {
        const shopState = await ShopStateStore.load(this.user.id as number)
        const key = shopStateKeys[this.shopName]
        if (!key) throw new Error(`unknown shop state: ${this.shopName}`)
        let shopInfo = shopState[key]
        if (!shopInfo && newIfNull) {
            shopInfo = new ShopInfoBean()
            shopState[key] = shopInfo
        }
        return shopInfo
    }

    getTotalShopInfo(newIfNull: boolean) {
        const totalShops = this.user.totalShop
        let totalShopInfo = totalShops.get(this.shopName)
        if (!totalShopInfo && newIfNull) {
            totalShopInfo = new TotalShopBean()
            totalShops.set(this.shopName, totalShopInfo)
        }
        return totalShopInfo
    }

    static async load(userId: int) {
        let shopState = await Shop.load(userId)
        if (!shopState) {
            shopState = new Shop(userId)
        }
        return shopState
    }
}
