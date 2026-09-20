import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqMailDelete } from '../MailC2S'
import { MailAuditWriter } from '../audit/MailAuditWriter'
import { MailInboxRepository } from '../persistence/MailInboxRepository'
import { ActionMail } from './ActionMail'
import { GmLogDefine } from '../rules/GmLogDefine'

/**
 * 邮件-删除
 */
export class ActionMailDelete extends ActionMail {
    async doAction(req: ReqMailDelete, res: ResDefault) {
        const ids = req.ids
        if (!Array.isArray(ids) || ids.length == 0) {
            throw SystemErrors.SysParamErr.vars([ids])
        }

        const newIds = Array.from(new Set(ids))
        if (newIds.length != ids.length) {
            throw SystemErrors.SysParamErr.vars([ids])
        }

        const mails = await MailInboxRepository.getUserMailByIds(this.user.id, ids)
        let delCount = 0 // 实际删除的数量
        const delMailIds = []
        for (const mail of mails) {
            if (mail.mAward.length > 0 && !mail.mIsAward) {
                continue
            }
            if (mail.mIsRead == 0) {
                continue
            }
            delMailIds.push(mail.mId)
            await mail.remove()
            delCount++
            // 日志记录
            MailAuditWriter.recordLog(this.user, mail, GmLogDefine.MAIL_DELETE)
            // 数数埋点
        }
        ActionMail.delProperty(this.user, delMailIds) // 删除邮件同步给客户端
    }
}
