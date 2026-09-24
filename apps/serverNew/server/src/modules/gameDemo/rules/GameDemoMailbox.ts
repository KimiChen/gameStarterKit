import type { ReadonlyBean } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type {
    IGameDemoMail,
    IGameDemoMailbox,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import type { User } from '../../user/bean/User'
import type { GameDemoPlayer } from '../bean/GameDemoPlayer'

/** 已投递来源的保留窗口：远大于一次结算的奖励数，保证可靠队列的重复投递落在窗口内。 */
const DELIVERED_SOURCE_LIMIT = 256

/** gameDemo 邮箱：按来源幂等入箱，满箱时先归档已领取邮件。 */
export class GameDemoMailbox {
    static deliver(player: GameDemoPlayer, source: string, title: string, gold: number, now: number): number {
        if (!source || source.length > 128) throw new Error('invalid gameDemo mail source')
        const sources = player.deliveredSources!
        const delivered = sources.get(source)
        if (delivered !== undefined) return delivered

        const mails = player.mails!
        if (mails.size() >= GAME_DEMO_CONFIG.mailboxCapacity) {
            const archived = mails.values().find((mail) => mail.claimed)
            if (!archived) throw { code: 'GAME_DEMO_MAILBOX_FULL', msg: '未领取邮件过多，请先领取附件' }
            mails.delete(archived.id)
        }
        const id = ++player.mailSeq
        mails.set(id, { id, title, gold, createdAt: now, read: false, claimed: false })
        sources.set(source, id)
        if (sources.size() > DELIVERED_SOURCE_LIMIT) {
            let oldest: string | undefined
            let oldestId = Number.MAX_SAFE_INTEGER
            sources.forEach((mailId, key) => {
                if (mailId < oldestId) {
                    oldestId = mailId
                    oldest = key
                }
            })
            if (oldest !== undefined) sources.delete(oldest)
        }
        return id
    }

    static view(player: GameDemoPlayer | ReadonlyBean<GameDemoPlayer> | undefined): IGameDemoMailbox {
        const mails: IGameDemoMail[] = []
        player?.mails?.forEach((mail) =>
            mails.push({
                id: mail.id,
                title: mail.title,
                gold: mail.gold,
                createdAt: mail.createdAt,
                read: mail.read,
                claimed: mail.claimed,
            }),
        )
        return { mails: mails.sort((a, b) => a.id - b.id) }
    }

    static markRead(player: GameDemoPlayer, mailId: number): void {
        const mail = this.require(player, mailId)
        if (!mail.read) mail.read = true
    }

    /** 已领取的邮件重复领取不会再发金币。 */
    static claim(user: Pick<User, 'copper'>, player: GameDemoPlayer, mailId: number): void {
        const mail = this.require(player, mailId)
        if (mail.claimed) return
        user.copper += mail.gold
        mail.claimed = true
        mail.read = true
    }

    private static require(player: GameDemoPlayer, mailId: number) {
        const mail = player.mails?.get(mailId)
        if (!mail) throw { code: 'GAME_DEMO_MAIL_NOT_FOUND', msg: '邮件不存在' }
        return mail
    }
}
