import { timestamp } from '@arthropoda/game-engine'
import { MailModel as MailEntity } from '../../../../generated/persistence/MailModel'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Props } from '../../props/inventory/Props'
import { ReqMailAward, ResMailAward } from '../MailC2S'
import { MailErrors } from '../MailErrors'
import { MailAuditWriter } from '../audit/MailAuditWriter'
import { ActionMail } from './ActionMail'
import { GmLogDefine } from '../rules/GmLogDefine'

/**
 * 邮件-领奖
 */
export class ActionMailAward extends ActionMail {
    async doAction(req: ReqMailAward, res: ResMailAward) {
        const mailId = req.id
        const mail = await MailEntity.findOne({ where: { userId: String(this.user.id), mId: mailId } })
        if (!mail) {
            throw SystemErrors.SysParamErr.vars([mailId])
        }

        if (!mail.mAward || mail.mMoreStatus > 0) {
            throw MailErrors.MailNoAward.vars([mailId])
        }

        if (mail.mIsAward) {
            throw MailErrors.MailHaveAward.vars([mailId])
        }
        const time = timestamp()
        mail.mIsAward = 1
        mail.mAwardTime = time
        mail.mIsRead = 1

        // 同步客户端
        ActionMail.readAwardChange(this.user, [mail])

        // 日志记录
        MailAuditWriter.recordLog(this.user, mail, GmLogDefine.MAIL_AWARD)

        const awardsStr = mail.mAward.replaceAll('\\n', '')
        const awards = JSON.parse(awardsStr)

        res.awards = { awards: [] }
        await Props.addProps(this.user, awards, res.awards)
        await mail.save()
    }
}
