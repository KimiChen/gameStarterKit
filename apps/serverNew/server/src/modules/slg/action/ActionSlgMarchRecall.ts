import type {
    ISlgMarchRecallReq,
    ISlgMarchRecallRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/slg'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { SlgNativeLobbyStore } from '../lobby/SlgNativeLobbyStore'

export class ActionSlgMarchRecall extends NativeLobbyAction {
    async doAction(req: ISlgMarchRecallReq, res: ISlgMarchRecallRes): Promise<void> {
        Object.assign(res, await new SlgNativeLobbyStore().recall(this.lobbyUid, this.lobbySid, req))
    }
}
