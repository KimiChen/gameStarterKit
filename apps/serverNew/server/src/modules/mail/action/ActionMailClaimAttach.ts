import type { IMailClaimAttachReq, IPurchaseResult } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyAction } from '../../../runtime/action/NativeLobbyAction'
import { MailNativeLobbyStore } from '../lobby/MailNativeLobbyStore'

export class ActionMailClaimAttach extends NativeLobbyAction {
    async doAction(req: IMailClaimAttachReq, res: IPurchaseResult): Promise<void> {
        Object.assign(
            res,
            await new MailNativeLobbyStore(this.lobbyServices.pushToUser).claim(
                this.lobbyUid,
                this.lobbySid,
                req.mailId,
            ),
        )
    }
}
