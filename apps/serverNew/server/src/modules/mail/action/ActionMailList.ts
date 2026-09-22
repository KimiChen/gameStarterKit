import type { IMailListReq, IMailListRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { MailNativeLobbyStore } from '../lobby/MailNativeLobbyStore'

export class ActionMailList extends NativeLobbyAction {
    async doAction(req: IMailListReq, res: IMailListRes): Promise<void> {
        Object.assign(
            res,
            await new MailNativeLobbyStore(this.lobbyServices.pushToUser).list(this.lobbyUid, this.lobbySid, req),
        )
    }
}
