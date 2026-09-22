import type {
    IArenaShopBuyBoostReq,
    IArenaShopBuyBoostRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/arenaShop'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { ArenaShopNativeLobbyStore } from '../lobby/ArenaShopNativeLobbyStore'

export class ActionArenaShopBuyBoost extends NativeLobbyAction {
    async doAction(req: IArenaShopBuyBoostReq, res: IArenaShopBuyBoostRes): Promise<void> {
        Object.assign(res, await new ArenaShopNativeLobbyStore().buyBoost(this.lobbyUid, this.lobbySid, req))
    }
}
