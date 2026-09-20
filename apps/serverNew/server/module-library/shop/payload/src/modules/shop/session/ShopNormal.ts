import { User } from '../../user/bean/User'
import { ShopCatalog } from '../catalog/ShopCatalog'
import { ShopSession } from './ShopSession'

export class ShopNormal extends ShopSession {
    constructor(user: User, shopName: string) {
        const shopConfig = ShopCatalog.getShopConfig(shopName)!
        super(user, shopName, shopConfig, ShopCatalog.filterAvailableItems(user, shopConfig))
    }
}
