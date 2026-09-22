import type { IGetProfileReq, IGetProfileRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { NativeLobbyUserStore } from '../lobby/NativeLobbyUserStore'

export class ActionUserGetProfile extends NativeLobbyAction {
    async doAction(req: IGetProfileReq, res: IGetProfileRes): Promise<void> {
        res.profile = await new NativeLobbyUserStore(this.lobbyServices.registerCharacter).getPublic(
            req.uid,
            this.lobbySid,
        )
    }
}
