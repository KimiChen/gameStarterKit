import { ShopInfoBean } from '../bean/ShopInfoBean'
import { ShopRefresh } from '../refresh/ShopRefresh'
import { ShopStateStore } from '../state/ShopStateStore'

export class ShopProtocolFormatter {
    constructor(
        private readonly state: ShopStateStore,
        private readonly refresh: ShopRefresh,
    ) {}

    async formatList() {
        const shopInfo = (await this.state.getShopInfo(false)) ?? new ShopInfoBean()
        shopInfo.showExpiredTime = this.refresh.getNextRefreshTime()
        return shopInfo
    }
}
