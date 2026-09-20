import { User } from '../../user/bean/User'
import { ShopConst } from '../rules/ShopConst'
import { ShopErrors } from '../ShopErrors'
import { ShopNormal } from '../session/ShopNormal'
import { ShopSession } from '../session/ShopSession'

type ShopSessionConstructor = new (user: User, shopName: string) => ShopSession

export class ShopRegistry {
    private static readonly shopTypes: Record<string, ShopSessionConstructor> = {
        [ShopConst.SHOP_BASE]: ShopNormal,
        [ShopConst.SHOP_LOVE]: ShopNormal,
        [ShopConst.SHOP_COW]: ShopNormal,
        [ShopConst.SHOP_GUILD]: ShopNormal,
        [ShopConst.SHOP_ARENA]: ShopNormal,
        [ShopConst.SHOP_BACK]: ShopNormal,
    }

    static async getShop(user: User, shopName: string) {
        const ShopType = this.shopTypes[shopName]
        if (!ShopType) {
            throw ShopErrors.ShopNoDefine.params({ vars: { name: shopName } })
        }
        const shopSession: ShopSession = new ShopType(user, shopName)
        await shopSession.initialize()
        return shopSession
    }
}
