import { timestamp } from '@arthropoda/game-engine'
import { User } from '../../user/bean/User'
import { MailModel as MailEntity } from '../../../../generated/persistence/MailModel'
import { GmLogDefine } from '../rules/GmLogDefine'
import { PropItem } from '../../../runtime/protocol/C2S/commom'
import { ReqMailAwardAll, ResMailAwardAll } from '../MailC2S'
import { Props } from '../../props/inventory/Props'
import { MailAuditWriter } from '../audit/MailAuditWriter'
import { MailInboxRepository } from '../persistence/MailInboxRepository'
import { ActionMail } from './ActionMail'

/**
 * 邮件-批量领奖
 */
export class ActionMailAwardAll extends ActionMail {
    async doAction(req: ReqMailAwardAll, res: ResMailAwardAll) {
        //业务逻辑
        const mails = await MailInboxRepository.getUserMailAll(this.user.id)

        let awards: PropItem[] = []
        let num = 0
        const receiveMails = []
        for (const mail of mails) {
            // 如果是文本邮件 未读 类型是日常邮件 则设置为已读
            if (!mail.mAward && !mail.mIsRead) {
                receiveMails.push(mail)
                num++
                continue
            }

            if (mail.mIsAward || !mail.mAward) {
                continue
            }
            const itemAwardsStr = mail.mAward.replaceAll('\\n', '')
            const itemAwards = JSON.parse(itemAwardsStr)
            if (Array.isArray(itemAwards)) {
                awards = [...awards, ...itemAwards]
            }
            receiveMails.push(mail)
            num++
            // 日志记录
            MailAuditWriter.recordLog(this.user, mail, GmLogDefine.MAIL_AWARD)

            // 数数埋点
        }

        if (awards.length == 0) {
            return
        }
        await ActionMailAwardAll.receive(this.user, receiveMails)

        res.awards = { awards: [] }
        await Props.addProps(this.user, awards, res.awards)
    }

    /**
     * 领奖
     * @param MailModel $mail
     */
    private static async receive(user: User, mails: MailEntity[]) {
        for (const mail of mails) {
            mail.mIsAward = 1
            mail.mIsRead = 1
            mail.mAwardTime = timestamp()
            await mail.save()
        }
        ActionMail.readAwardChange(user, mails)
    }
}
