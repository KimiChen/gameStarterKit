import type {
    IArenaBoardReq,
    IArenaBoardRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/arena'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { ArenaNativeLobbyStore } from '../lobby/ArenaNativeLobbyStore'

export class ActionArenaBoard extends NativeLobbyAction {
    async doAction(_req: IArenaBoardReq, res: IArenaBoardRes): Promise<void> {
        Object.assign(res, await new ArenaNativeLobbyStore().board(this.lobbyUid, this.lobbySid))
    }
}
