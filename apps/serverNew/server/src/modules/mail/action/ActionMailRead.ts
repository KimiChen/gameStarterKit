import { timestamp } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqMailRead } from '../MailC2S'
import { MailAuditWriter } from '../audit/MailAuditWriter'
import { MailInboxRepository } from '../persistence/MailInboxRepository'
import { ActionMail } from './ActionMail'
import { GmLogDefine } from '../rules/GmLogDefine'

/**
 * 邮件-读
 */
export class ActionMailRead extends ActionMail {
    async doAction(req: ReqMailRead, res: ResDefault) {
        //业务逻辑
        const id = req.id
        if (id < 1) {
            throw SystemErrors.SysParamErr.vars([id])
        }

        const mail = await MailInboxRepository.getMailOne(this.user.id, id)
        if (!mail || mail.mIsRead > 0) {
            return
        }

        //没有奖励的才改mIsAward字段
        if (!mail.mAward) {
            mail.mIsRead = 1
            mail.mIsAward = 1
            mail.mAwardTime = timestamp()
            await mail.save()
            ActionMail.readAwardChange(this.user, [mail])
            // 日志记录
            MailAuditWriter.recordLog(this.user, mail, GmLogDefine.MAIL_READ)

            // 数数埋点
        }
    }
}
