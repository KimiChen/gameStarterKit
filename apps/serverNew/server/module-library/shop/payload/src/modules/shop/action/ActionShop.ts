import { GameAction } from '../../../runtime/action/GameAction'
import { ShopRegistry } from '../registry/ShopRegistry'

export class ActionShop extends GameAction {
    protected getShop(shopName: string) {
        return ShopRegistry.getShop(this.user, shopName)
    }
}
