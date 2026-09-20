import { ReqShopGetList, ResShopGetList } from '../ShopC2S'
import { ActionShop } from './ActionShop'

export class ActionShopGetList extends ActionShop {
    async doAction(req: ReqShopGetList, res: ResShopGetList) {
        for (const shopReq of req.params) {
            const shopName = shopReq.shopeName

            const shopSession = await this.getShop(shopName)
            if (!shopSession.access.isUnlocked()) {
                continue
            }

            const shopInfo = await shopSession.protocol.formatList()

            ;(res as any)[shopName] = shopInfo.toModData()
        }

        return
    }
}
