import type { IPurchaseResult, IShopPurchaseReq } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { ShopNativeLobbyStore } from '../lobby/ShopNativeLobbyStore'

export class ActionShopPurchase extends NativeLobbyAction {
    async doAction(req: IShopPurchaseReq, res: IPurchaseResult): Promise<void> {
        Object.assign(res, await new ShopNativeLobbyStore().purchase(this.lobbyUid, this.lobbySid, req))
    }
}
