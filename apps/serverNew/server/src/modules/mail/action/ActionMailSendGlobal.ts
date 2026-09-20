import { User } from '../../user/bean/User'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { ReqMailSendGlobal } from '../MailS2S'
import { GameAction } from '../../../runtime/action/GameAction'
import { MailSendGlobal } from '../delivery/MailSendGlobal'

export class ActionMailSendGlobal extends GameAction {
    async doAction(req: ReqMailSendGlobal, res: ResDefault) {
        const user = await User.load(req.uid)
        if (!user) {
            return
        }
        await MailSendGlobal.send(user)
    }
}
