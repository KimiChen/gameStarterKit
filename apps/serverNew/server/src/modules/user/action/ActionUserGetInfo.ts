import type { IGetInfoReq, IGetInfoRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { NativeLobbyUserStore } from '../lobby/NativeLobbyUserStore'

export class ActionUserGetInfo extends NativeLobbyAction {
    async doAction(_req: IGetInfoReq, res: IGetInfoRes): Promise<void> {
        res.user = await new NativeLobbyUserStore(this.lobbyServices.registerCharacter).require(
            this.lobbyUid,
            this.lobbySid,
        )
    }
}
