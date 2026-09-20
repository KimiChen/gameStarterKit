import { AttributeScale } from '../../attr/rules/AttributeScale'
import { Props } from '../../props/inventory/Props'
import { User } from '../../user/bean/User'
import { ResShopBuy } from '../ShopC2S'
import { ShopInfoBean } from '../bean/ShopInfoBean'
import { ShopItemBean } from '../bean/ShopItemBean'
import { ShopConst } from '../rules/ShopConst'
import { ShopErrors } from '../ShopErrors'
import { ShopAccessRules } from '../access/ShopAccessRules'
import { ShopRefresh } from '../refresh/ShopRefresh'
import { ShopStateStore } from '../state/ShopStateStore'

export class ShopPurchase {
    constructor(
        private readonly user: User,
        private readonly detailConfig: Map<int, IConfShopContent>,
        private readonly state: ShopStateStore,
        private readonly refresh: ShopRefresh,
        private readonly access: ShopAccessRules,
    ) {}

    async buy(shopItemId: int, buyNum: int, response: ResShopBuy) {
        const shopItemConf = this.getItemConfig(shopItemId)
        if (!this.access.isUnlocked()) {
            throw ShopErrors.ShopNoUnlock
        }
        await this.checkNumEnough(shopItemId, shopItemConf, buyNum)
        await this.cost(shopItemId, shopItemConf, buyNum)
        await this.addBuyNum(shopItemId, buyNum, shopItemConf)

        response.awards = { awards: [] }
        await Props.addProp(this.user, shopItemConf.propId, shopItemConf.num * buyNum, response.awards)
    }

    private getItemConfig(shopItemId: int) {
        if (!this.detailConfig.has(shopItemId)) {
            throw ShopErrors.ShopItemErr
        }
        return this.detailConfig.get(shopItemId)!
    }

    private async checkNumEnough(shopItemId: int, shopItemConf: IConfShopContent, buyNum: int) {
        if (shopItemConf.buyLimitNum == ShopConst.NO_LIMIT) {
            return true
        }
        if (this.refresh.isAutoRefresh) {
            const shopInfo = await this.state.getShopInfo(false)
            if (!shopInfo || !shopInfo.l.has(shopItemId)) {
                throw ShopErrors.ShopNoTimes
            }
        }
        const hasBuyNum = await this.getBuyNum(shopItemId, shopItemConf)
        if (hasBuyNum + buyNum > shopItemConf.buyLimitNum) {
            throw ShopErrors.ShopNoTimes
        }
        return true
    }

    private async getBuyNum(shopItemId: int, shopItemConf: IConfShopContent) {
        if (shopItemConf.buyLimitNum > ShopConst.NO_LIMIT && shopItemConf.buyLimitType == ShopConst.LimitTypeTotal) {
            const totalInfo = this.state.getTotalShopInfo(false)
            return totalInfo?.buyInfo.get(shopItemId) ?? 0
        }
        const shopInfo = await this.state.getShopInfo(false)
        return shopInfo?.l.get(shopItemId)?.buyNum ?? 0
    }

    private async cost(shopItemId: int, shopItemConf: IConfShopContent, buyNum: int) {
        if (shopItemConf.costId == 0 || shopItemConf.costNum < 1) return 0

        let costNum = 0
        if (shopItemConf.increase > 0) {
            let hasBuyNum = await this.getBuyNum(shopItemId, shopItemConf)
            for (let i = 0; i < buyNum; i++) {
                costNum += this.getRiseCostNum(shopItemConf, hasBuyNum)
                hasBuyNum++
            }
        } else {
            costNum = shopItemConf.costNum * buyNum
        }
        await Props.costProp(this.user, shopItemConf.costId, costNum)
        return costNum
    }

    private getRiseCostNum(shopItemConf: IConfShopContent, buyNum: int) {
        if (shopItemConf.increase > 0) {
            return shopItemConf.costNum * (1 + (shopItemConf.increase / AttributeScale.NUMBER_RATIO) * buyNum)
        }
        return shopItemConf.costNum
    }

    private async addBuyNum(shopItemId: int, buyNum: int, shopItemConf: IConfShopContent) {
        if (shopItemConf.buyLimitNum == ShopConst.NO_LIMIT) return

        const expiredTime = this.refresh.getItemExpiredTime(shopItemConf)
        if (expiredTime == 0) {
            const totalShopInfo = this.state.getTotalShopInfo(true)!
            totalShopInfo.buyInfo.set(shopItemId, (totalShopInfo.buyInfo.get(shopItemId) ?? 0) + buyNum)
            return
        }

        const shopInfo: ShopInfoBean = await this.state.getShopInfo(true)
        let shopItem = shopInfo.l.get(shopItemId)
        if (!shopItem) {
            shopItem = new ShopItemBean({ id: shopItemId, expiredTime })
            shopInfo.l.set(shopItemId, shopItem)
        }
        shopItem.buyNum += buyNum
    }
}
