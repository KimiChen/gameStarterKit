import type {
    IRoomPrepareCreateReq,
    IRoomPrepareCreateRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { assertInviteProfilesDeclared } from '../lobby/RoomGameplayCatalog'
import { RoomNativeLobbyStore } from '../lobby/RoomNativeLobbyStore'

export class ActionRoomPrepareCreate extends NativeLobbyAction {
    async doAction(req: IRoomPrepareCreateReq, res: IRoomPrepareCreateRes): Promise<void> {
        assertInviteProfilesDeclared()
        Object.assign(res, await new RoomNativeLobbyStore().prepare(this.lobbyUid, this.lobbySid, req))
    }
}
