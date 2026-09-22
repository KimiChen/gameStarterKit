import type { IRoomResolveReq, IRoomResolveRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { assertInviteProfilesDeclared } from '../lobby/RoomGameplayCatalog'
import { RoomNativeLobbyStore } from '../lobby/RoomNativeLobbyStore'

export class ActionRoomResolve extends NativeLobbyAction {
    async doAction(req: IRoomResolveReq, res: IRoomResolveRes): Promise<void> {
        assertInviteProfilesDeclared()
        Object.assign(res, await new RoomNativeLobbyStore().resolve(this.lobbyUid, this.lobbySid, req.code))
    }
}
