import { RedisInstance } from '@arthropoda/game-engine'
import type {
    IMailListReq,
    IMailListRes,
    IPurchaseResult,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { applyGrants, grantBusinessError } from '../../../runtime/lobby/NativeLobbyGrants'

interface MailRecord {
    mailId: number
    title: string
    body: string
    granted?: { kind: 'item'; itemId: number; count: number }[]
    read: boolean
    claimed: boolean
    createdAt: number
}

/** mail 域持久化信箱；领取位是权威，重试只回读同一附件收据。 */
export class MailNativeLobbyStore {
    private static readonly boxes = 'nativeLobby:mail:boxes:v1'
    private static readonly sequence = 'nativeLobby:mail:sequence:v1'
    constructor(private readonly push: (uid: string, sId: number, type: string, data: unknown) => Promise<boolean>) {}

    async deliver(
        uid: string,
        sId: number,
        mail: Omit<MailRecord, 'mailId' | 'read' | 'claimed' | 'createdAt'>,
    ): Promise<number> {
        const redis = RedisInstance.getCenterRedis()
        const mailId = await redis.hIncrBy(MailNativeLobbyStore.sequence, String(sId), 1)
        const box = await this.read(uid, sId)
        box.unshift({ ...mail, mailId, read: false, claimed: false, createdAt: Date.now() })
        await this.write(uid, sId, box)
        await this.push(uid, sId, 'mail.new', { mailId })
        return mailId
    }
    async list(uid: string, sId: number, req: IMailListReq): Promise<IMailListRes> {
        return {
            mails: (await this.read(uid, sId))
                .filter((m) => req.before === undefined || m.mailId < req.before)
                .slice(0, req.limit ?? 20)
                .map((m) => ({
                    mailId: m.mailId,
                    title: m.title,
                    body: m.body,
                    hasAttach: !!m.granted?.length,
                    read: m.read,
                    claimed: m.claimed,
                    createdAt: m.createdAt,
                })),
        }
    }
    async markRead(uid: string, sId: number, mailId: number): Promise<void> {
        const box = await this.read(uid, sId)
        const mail = box.find((m) => m.mailId === mailId)
        if (mail && !mail.read) {
            mail.read = true
            await this.write(uid, sId, box)
        }
    }
    async claim(uid: string, sId: number, mailId: number): Promise<IPurchaseResult> {
        const box = await this.read(uid, sId)
        const mail = box.find((m) => m.mailId === mailId)
        if (!mail || !mail.granted?.length) throw { code: 'INVALID_PAYLOAD', msg: '邮件附件不存在' }
        const opId = `mail:${sId}:${uid}:${mailId}`
        // 领取位是权威：先把它置位，再发放。这样崩溃后重试走的是「已领取但仍要发放」的分支，
        // 而不是把附件再领一次。
        if (!mail.claimed) {
            mail.claimed = true
            mail.read = true
            await this.write(uid, sId, box)
        }
        try {
            // 附件同样必须真的落地：只回 granted 而不写状态等于把奖励吞掉。
            await applyGrants(uid, sId, opId, mail.granted)
        } catch (error) {
            throw grantBusinessError(error)
        }
        return { opId, status: 'done', balance: 0, granted: mail.granted }
    }
    private async read(uid: string, sId: number): Promise<MailRecord[]> {
        const raw = await RedisInstance.getCenterRedis().hGet(MailNativeLobbyStore.boxes, `${sId}:${uid}`)
        try {
            const parsed = raw ? JSON.parse(raw) : []
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    }
    private write(uid: string, sId: number, box: MailRecord[]): Promise<unknown> {
        return RedisInstance.getCenterRedis().hSet(MailNativeLobbyStore.boxes, `${sId}:${uid}`, JSON.stringify(box))
    }
}
