import type {
    ISlgMapTilesReq,
    ISlgMapTilesRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/slg'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { SlgNativeLobbyStore } from '../lobby/SlgNativeLobbyStore'

export class ActionSlgMapTiles extends NativeLobbyAction {
    async doAction(req: ISlgMapTilesReq, res: ISlgMapTilesRes): Promise<void> {
        Object.assign(res, await new SlgNativeLobbyStore().mapTiles(this.lobbyUid, this.lobbySid, req))
    }
}
