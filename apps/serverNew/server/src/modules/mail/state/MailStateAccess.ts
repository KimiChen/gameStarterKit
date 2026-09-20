import { User } from '../../user/bean/User'
import { MailBean } from '../bean/MailBean'

export class MailStateAccess {
    static getMod(user: User): MailBean {
        if (!user.mail) user.mail = new MailBean()
        return user.mail
    }
}
