import type { IMailMarkReadReq, IMailMarkReadRes } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { MailNativeLobbyStore } from '../lobby/MailNativeLobbyStore'

export class ActionMailMarkRead extends NativeLobbyAction {
    async doAction(req: IMailMarkReadReq, res: IMailMarkReadRes): Promise<void> {
        await new MailNativeLobbyStore(this.lobbyServices.pushToUser).markRead(this.lobbyUid, this.lobbySid, req.mailId)
        res.ok = true
    }
}
