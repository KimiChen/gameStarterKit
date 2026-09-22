import type {
    ISlgTileCaptureReq,
    ISlgTileCaptureRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/slg'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { SlgNativeLobbyStore } from '../lobby/SlgNativeLobbyStore'

export class ActionSlgTileCapture extends NativeLobbyAction {
    async doAction(req: ISlgTileCaptureReq, res: ISlgTileCaptureRes): Promise<void> {
        Object.assign(res, await new SlgNativeLobbyStore().capture(this.lobbyUid, this.lobbySid, req))
    }
}
