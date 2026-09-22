import type { IPurchaseResult, IShopQueryOpReq } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { ShopNativeLobbyStore } from '../lobby/ShopNativeLobbyStore'

export class ActionShopQueryOp extends NativeLobbyAction {
    async doAction(req: IShopQueryOpReq, res: IPurchaseResult): Promise<void> {
        Object.assign(res, await new ShopNativeLobbyStore().query(this.lobbyUid, this.lobbySid, req.opId))
    }
}
