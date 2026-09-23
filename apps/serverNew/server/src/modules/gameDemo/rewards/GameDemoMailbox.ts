import { GameDemoHash as AtomicHash, GameDemoOperation as AtomicOperation } from '../GameDemoPersistence'
import { createHash } from 'node:crypto'
import { AtomicHashTransaction, atomicJsonCodec } from '@arthropoda/game-engine'
import {
    validateGameDemoMail,
    validateGameDemoMailboxRes,
    validateGameDemoMailClaimRes,
    type IGameDemoMailboxRes,
    type IGameDemoMailClaimRes,
    type IGameDemoMailReq,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemo'
import type { GameDemoMail } from '../../../../generated/lobby-contract/kits/gameDemo/api/growth'
import { NativeLobbyAssets } from '../../../runtime/lobby/NativeLobbyAssets'
import { GameDemoAccount } from '../growth/GameDemoAccount'

interface Inbox {
    schemaVersion: 1
    revision: number
    ids: string[]
}
const inboxCodec = atomicJsonCodec<Inbox>((value): value is Inbox => {
    const inbox = value as Inbox | null
    return (
        !!inbox &&
        inbox.schemaVersion === 1 &&
        Number.isSafeInteger(inbox.revision) &&
        inbox.revision >= 0 &&
        Array.isArray(inbox.ids) &&
        inbox.ids.length <= 100 &&
        inbox.ids.every((id) => typeof id === 'string' && id.length === 32) &&
        new Set(inbox.ids).size === inbox.ids.length
    )
})
const mailCodec = atomicJsonCodec<GameDemoMail>((value): value is GameDemoMail => {
    try {
        validateGameDemoMail(value)
        return true
    } catch {
        return false
    }
})

/** Offline delivery is composed into the producer transaction. No socket or timer is required. */
export class GameDemoMailbox {
    private readonly inboxes = new AtomicHash('kt:gameDemo:mailboxes:v1', inboxCodec)
    private readonly mails = new AtomicHash('kt:gameDemo:mails:v1', mailCodec)
    private readonly claims = new AtomicOperation(
        'kt:gameDemo:mail-claims:v1',
        (value): value is IGameDemoMailClaimRes => {
            try {
                validateGameDemoMailClaimRes(value)
                return true
            } catch {
                return false
            }
        },
    )
    private readonly reads = new AtomicOperation('kt:gameDemo:mail-reads:v1', (value): value is IGameDemoMailboxRes => {
        try {
            validateGameDemoMailboxRes(value)
            return true
        } catch {
            return false
        }
    })

    async deliver(
        tx: AtomicHashTransaction,
        uid: string,
        sId: number,
        source: string,
        title: string,
        gold: number,
        now: number,
    ): Promise<string> {
        if (!source || source.length > 256) throw new Error('invalid mail source')
        const id = createHash('sha256')
            .update(JSON.stringify([sId, uid, source]))
            .digest('hex')
            .slice(0, 32)
        const field = JSON.stringify([sId, uid, id])
        const prior = await tx.get(this.mails, field)
        if (prior) {
            if (prior.gold !== gold || prior.title !== title)
                throw { code: 'OPERATION_CONFLICT', msg: '同来源奖励参数不同' }
            return id
        }
        const owner = NativeLobbyAssets.owner(uid, sId)
        const inbox = (await tx.get(this.inboxes, owner)) ?? { schemaVersion: 1 as const, revision: 0, ids: [] }
        const ids = [...inbox.ids]
        if (ids.length === 100) {
            let archived = false
            for (let index = 0; index < ids.length; index++) {
                const candidate = await tx.get(this.mails, JSON.stringify([sId, uid, ids[index]]))
                if (candidate?.claimed) {
                    ids.splice(index, 1)
                    archived = true
                    break
                }
            }
            if (!archived) throw { code: 'GAME_DEMO_MAILBOX_FULL', msg: '未领取邮件过多，请先领取附件' }
        }
        await tx.set(this.mails, field, { id, title, gold, createdAt: now, read: false, claimed: false })
        await tx.set(this.inboxes, owner, { schemaVersion: 1, revision: inbox.revision + 1, ids: [...ids, id] })
        return id
    }

    async read(uid: string, sId: number): Promise<IGameDemoMailboxRes> {
        return AtomicHashTransaction.run((tx) => this.snapshot(tx, uid, sId))
    }

    async markRead(uid: string, sId: number, request: IGameDemoMailReq): Promise<IGameDemoMailboxRes> {
        const result = await this.reads.run(
            JSON.stringify([sId, uid, request.clientReqId]),
            request.mailId,
            async (tx) => {
                const mail = await this.find(tx, uid, sId, request.mailId)
                if (!mail.read) {
                    await tx.set(this.mails, JSON.stringify([sId, uid, mail.id]), { ...mail, read: true })
                    await this.bump(tx, uid, sId)
                }
                return this.snapshot(tx, uid, sId)
            },
        )
        return validateGameDemoMailboxRes(result)
    }

    async claim(uid: string, sId: number, request: IGameDemoMailReq): Promise<IGameDemoMailClaimRes> {
        const result = await this.claims.run(
            JSON.stringify([sId, uid, request.clientReqId]),
            request.mailId,
            async (tx) => {
                const mail = await this.find(tx, uid, sId, request.mailId)
                if (!mail.claimed) {
                    await NativeLobbyAssets.changeGold(tx, uid, sId, mail.gold)
                    await tx.set(this.mails, JSON.stringify([sId, uid, mail.id]), {
                        ...mail,
                        read: true,
                        claimed: true,
                    })
                    await this.bump(tx, uid, sId)
                }
                return {
                    assets: await new GameDemoAccount().snapshot(tx, uid, sId),
                    mailbox: await this.snapshot(tx, uid, sId),
                }
            },
        )
        return validateGameDemoMailClaimRes(result)
    }

    private async find(tx: AtomicHashTransaction, uid: string, sId: number, id: string) {
        const inbox = await tx.get(this.inboxes, NativeLobbyAssets.owner(uid, sId))
        const mail = inbox?.ids.includes(id) ? await tx.get(this.mails, JSON.stringify([sId, uid, id])) : undefined
        if (!mail) throw { code: 'GAME_DEMO_MAIL_NOT_FOUND', msg: '邮件不存在' }
        return mail
    }

    private async bump(tx: AtomicHashTransaction, uid: string, sId: number) {
        const owner = NativeLobbyAssets.owner(uid, sId)
        const inbox = (await tx.get(this.inboxes, owner))!
        await tx.set(this.inboxes, owner, { schemaVersion: 1, revision: inbox.revision + 1, ids: [...inbox.ids] })
    }

    private async snapshot(tx: AtomicHashTransaction, uid: string, sId: number): Promise<IGameDemoMailboxRes> {
        const inbox = await tx.get(this.inboxes, NativeLobbyAssets.owner(uid, sId))
        const mails: GameDemoMail[] = []
        for (const id of inbox?.ids ?? []) {
            const mail = await tx.get(this.mails, JSON.stringify([sId, uid, id]))
            if (!mail) throw new Error('mailbox index refers to a missing mail')
            mails.push(validateGameDemoMail(mail))
        }
        return { revision: inbox?.revision ?? 0, mails }
    }
}
