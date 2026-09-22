import type { IUpdateProfileReq, IUpdateProfileRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { NativeLobbyUserStore } from '../lobby/NativeLobbyUserStore'

export class ActionUserUpdateProfile extends NativeLobbyAction {
    async doAction(req: IUpdateProfileReq, res: IUpdateProfileRes): Promise<void> {
        await new NativeLobbyUserStore(this.lobbyServices.registerCharacter).update(this.lobbyUid, this.lobbySid, req)
        res.ok = true
    }
}
