import { User } from '../../user/bean/User'
import { ShopAccessRules } from '../access/ShopAccessRules'
import { ShopProtocolFormatter } from '../protocol/ShopProtocolFormatter'
import { ShopPurchase } from '../purchase/ShopPurchase'
import { ShopRefresh } from '../refresh/ShopRefresh'
import { ShopStateStore } from '../state/ShopStateStore'

export class ShopSession {
    readonly access: ShopAccessRules

    readonly protocol: ShopProtocolFormatter

    readonly purchase: ShopPurchase

    readonly refresh: ShopRefresh

    readonly state: ShopStateStore

    constructor(user: User, shopName: string, shopConfig: IConfShop, detailConfig: Map<int, IConfShopContent>) {
        this.state = new ShopStateStore(user, shopName)
        this.access = new ShopAccessRules(user, shopConfig)
        this.refresh = new ShopRefresh(user, shopConfig, detailConfig, this.state)
        this.purchase = new ShopPurchase(user, detailConfig, this.state, this.refresh, this.access)
        this.protocol = new ShopProtocolFormatter(this.state, this.refresh)
    }

    async initialize() {
        const shopInfo = await this.state.initialize()
        await this.refresh.ensureSchedule(shopInfo)
    }
}
