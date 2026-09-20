import { ReqShopRefresh } from '../ShopC2S'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ActionShop } from './ActionShop'

export class ActionShopRefresh extends ActionShop {
    async doAction(req: ReqShopRefresh, res: ResDefault) {
        const shopSession = await this.getShop(req.shopName)
        await shopSession.refresh.manualRefresh()

        return
    }
}
