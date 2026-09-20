import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqShopBuy, ResShopBuy } from '../ShopC2S'
import { ActionShop } from './ActionShop'

export class ActionShopBuy extends ActionShop {
    async doAction(req: ReqShopBuy, res: ResShopBuy) {
        const shopName = req.shopName
        const shopItemId = req.id
        const buyNum = req.num

        // TODO 判断活动是否开启

        if (shopItemId < 1 || buyNum < 1) {
            throw SystemErrors.SysParamErr.params({ vars: [shopItemId, buyNum] })
        }
        const shopSession = await this.getShop(shopName)
        await shopSession.purchase.buy(shopItemId, buyNum, res)

        return
    }
}
