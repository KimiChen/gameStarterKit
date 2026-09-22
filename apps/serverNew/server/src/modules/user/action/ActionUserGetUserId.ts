import type { IGetUserIdReq, IGetUserIdRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'

export class ActionUserGetUserId extends NativeLobbyAction {
    async doAction(_req: IGetUserIdReq, res: IGetUserIdRes): Promise<void> {
        res.uid = this.lobbyUid
    }
}
