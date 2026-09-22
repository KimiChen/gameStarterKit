import type {
    ISlgMarchDispatchReq,
    ISlgMarchDispatchRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/slg'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { SlgNativeLobbyStore } from '../lobby/SlgNativeLobbyStore'

export class ActionSlgMarchDispatch extends NativeLobbyAction {
    async doAction(req: ISlgMarchDispatchReq, res: ISlgMarchDispatchRes): Promise<void> {
        Object.assign(res, await new SlgNativeLobbyStore().dispatch(this.lobbyUid, this.lobbySid, req))
    }
}
