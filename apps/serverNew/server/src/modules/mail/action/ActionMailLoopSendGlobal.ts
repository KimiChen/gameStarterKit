import { RedisLock } from '@arthropoda/game-engine'
import { GlobalMailBean } from '../bean/GlobalMailBean'
import { MailStateKeys } from '../rules/MailStateKeys'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { ReqMailLoopSendGlobal } from '../MailS2S'
import { GlobalMailDispatcher } from '../delivery/GlobalMailDispatcher'
import { GlobalMailStore } from '../delivery/GlobalMailStore'
import { GameAction } from '../../../runtime/action/GameAction'

export class ActionMailLoopSendGlobal extends GameAction {
    async doAction(req: ReqMailLoopSendGlobal, res: ResDefault) {
        await RedisLock.runOrSkip(MailStateKeys.LOCK_MAIL_CACHE_INIT, async () => {
            await this.loadDBToCache()
            if (Array.isArray(req.sIds)) {
                await GlobalMailDispatcher.broadcastSendGlobalMail(req.sIds)
            }
        })
    }

    /**
     * 只加载未过期的邮件
     */
    async loadDBToCache(): Promise<boolean> {
        const mails = await GlobalMailStore.getMailsFromDb()
        if (!Array.isArray(mails)) {
            return false
        }
        const mailsMap = new Map()
        mails.forEach((el) => {
            mailsMap.set(el.id, 1)
        })
        const caches = await GlobalMailBean.loadAll()
        caches.forEach((el) => {
            if (!mailsMap.has(el.id)) {
                el.delete()
            }
        })
        mails.forEach((el) => {
            const s = new GlobalMailBean(el.id)
            s.id = el.id
            s.type = el.type
            s.uqid = el.uqid
            s.title = el.title
            s.content = el.content
            s.awards = el.awards
            s.pastTime = el.pastTime
            s.roleId = el.roleId
            s.updateTime = el.updateTime
            s.initTimeType = el.initTimeType
            s.mailRange = el.mailRange
        })

        return true
    }
}
