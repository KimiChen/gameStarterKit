import type {
    IArenaCaptureReq,
    IArenaCaptureRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/arena'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { ArenaNativeLobbyStore } from '../lobby/ArenaNativeLobbyStore'

export class ActionArenaCapture extends NativeLobbyAction {
    async doAction(req: IArenaCaptureReq, res: IArenaCaptureRes): Promise<void> {
        Object.assign(res, await new ArenaNativeLobbyStore().capture(this.lobbyUid, this.lobbySid, req))
    }
}
