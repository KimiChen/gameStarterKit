import { IdFieldType, ReadonlyBean } from '@arthropoda/game-engine'
import { UtilTime } from '@arthropoda/game-engine'
import { timestamp } from '@arthropoda/game-engine'
import { User } from '../../user/bean/User'
import { GlobalMailBean } from '../bean/GlobalMailBean'
import { GmMailDefine } from '../rules/GmMailDefine'
import { MailDefine } from '../rules/MailDefine'
import { MailStateAccess } from '../state/MailStateAccess'
import { GlobalMailStore } from './GlobalMailStore'
import { ActionMail } from '../action/ActionMail'

export class MailSendGlobal {
    /**
     * send
     * FIELD_GMAIL_ID  一直保持了顺序,只需要记录最大的id就可以
     * FIELD_GMAIL_ID_RANGE 给指定范围发送邮件,可能会存在当时条件没有达到，后续达到条件，可以领取奖励
     * @param HUser $user
     * @return int
     * @access
     */
    static async send(user: User) {
        const mailTables = await GlobalMailStore.loadAll()
        const now = timestamp()
        let sendNum = 0
        const diffTime = UtilTime.getTimeAdd()
        const mailInfo = MailStateAccess.getMod(user)
        for (const [, mailTable] of mailTables) {
            const id = mailTable.id
            // 判断是否已经发奖了
            if (mailInfo.gmailIds.has(id)) {
                continue
            }
            //过期了
            if (mailTable.pastTime > 0 && now >= mailTable.pastTime) {
                continue
            }
            const roleId = mailTable.roleId
            const mailRange = mailTable.mailRange
            // 屏蔽相关角色
            if (roleId.length > 0) {
                const roleIds = roleId.split(',').map((el) => Number(el))
                if (roleIds.length > 0 && roleIds.includes(user.id)) {
                    continue
                }
            }
            if (mailTable.initTimeType == 2) {
                //注册时间不符
                if (user.initTime > mailTable.updateTime + diffTime) {
                    continue
                }
            }
            const isRangeMail = mailTable.type == GmMailDefine.TYPE_RANGE
            if (isRangeMail) {
                if (!this.checkRangeMail(user, mailRange)) {
                    continue
                }
            }
            mailInfo.gmailIds.set(id, now)

            let awards = []
            if (mailTable.awards.length > 0) {
                awards = JSON.parse(mailTable.awards)
                if (!awards) {
                    Log.error('global mail, awards string format has error')
                    continue
                }
            }

            ActionMail.add(
                user.id,
                MailDefine.TYPE_SYS, // 后台发送的邮件都为系统邮件
                [],
                awards,
                mailTable.title,
                mailTable.content,
                mailTable.pastTime,
                {
                    uqid: mailTable.uqid,
                },
            )
            sendNum++
        }
        this.cleanMailIds(user, mailTables)

        return sendNum
    }

    /**
     * checkRangeMail
     * 判断当前用户是否满足范围邮件的领取条件
     * @access
     * @param HUser  $user
     * @param string $mailRange
     * @return bool
     */
    private static checkRangeMail(user: User, mailRange: string): boolean {
        const ranges = mailRange ? JSON.parse(mailRange) : {}
        if (!ranges) {
            return false
        }
        let limit = 0
        // 渠道的限制条件
        if (Array.isArray(ranges.channel)) {
            if (!ranges.channel.includes(user.spid)) {
                return false
            }
            limit++
        }
        // vip的限制条件
        if (Array.isArray(ranges.vip)) {
            if (!ranges.vip.includes(user.vip)) {
                return false
            }
            limit++
        }
        // 语言限制
        if (Array.isArray(ranges.language)) {
            if (!ranges.language.includes(user.language)) {
                return false
            }
            limit++
        }
        // 帮会的限制条件
        if (Array.isArray(ranges.league_list)) {
            if (!ranges.league_list.includes(user.guild)) {
                return false
            }
            limit++
        }
        // 创建角色的时间限制
        if (ranges.create_start_time && ranges.create_end_time) {
            if (user.initTime < ranges.create_start_time || user.initTime > ranges.create_end_time) {
                return false
            }
            limit++
        }
        if (limit == 0) {
            return false
        }
        return true
    }

    /**
     * cleanMailIds
     * 清除一些不需要记录的id
     * @access
     * @param HUser $user
     * @param array $mailTables
     * @return void
     */
    private static cleanMailIds(
        user: User,
        mailTables: Map<IdFieldType, GlobalMailBean | ReadonlyBean<GlobalMailBean>>,
    ) {
        const cleanTime = timestamp() - 7 * 86400
        const mailInfo = MailStateAccess.getMod(user)
        for (const [mailId, idTime] of mailInfo.gmailIds) {
            if (idTime < cleanTime && !mailTables.has(mailId)) {
                mailInfo.gmailIds.delete(mailId)
            }
        }
    }
}
