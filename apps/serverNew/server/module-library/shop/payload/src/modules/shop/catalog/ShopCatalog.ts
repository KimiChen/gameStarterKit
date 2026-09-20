import { User } from '../../user/bean/User'
import { ShopConst } from '../rules/ShopConst'

export class ShopCatalog {
    static getShopConfig(shopName: string): IConfShop | undefined {
        const confName = ShopConst.shopConfMap[shopName]
        if (!confName) {
            return undefined
        }
        if (confName == ShopConst.BASE_CONF_NAME) {
            for (const [, config] of C.shop()) {
                if (config.enName == shopName) {
                    return config
                }
            }
            return undefined
        }
        return (C as any)[confName]()
    }

    static filterAvailableItems(user: User, shopConfig: IConfShop) {
        const detailConfig = new Map<int, IConfShopContent>()

        for (const [id, shopItem] of shopConfig.content) {
            if (shopItem.unlockItemType == ShopConst.ITEM_UNLOCK_LEVEL && shopItem.unlockItemValue > user.lv) {
                continue
            }
            detailConfig.set(id, shopItem)
        }
        return detailConfig
    }
}
