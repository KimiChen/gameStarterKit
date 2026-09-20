import { timestamp } from '@arthropoda/game-engine'
import { Equal, In, MoreThan, Or } from '@arthropoda/typeorm'
import { MailModel as MailEntity } from '../../../../generated/persistence/MailModel'

export class MailInboxRepository {
    static async getUserMailByIds(uId: number, mailIds: number[]): Promise<MailEntity[]> {
        if (mailIds.length === 0) return []
        return MailEntity.find({
            where: { userId: String(uId), mMoreStatus: 0, mId: In(mailIds) },
        })
    }

    static async getMailOne(uId: number, mailId: number): Promise<MailEntity | null> {
        const mail = await MailEntity.findOne({ where: { mId: mailId } })
        if (!mail || mail.userId !== String(uId)) return null
        return mail
    }

    static async getUserMailAll(uId: number): Promise<MailEntity[]> {
        const now = timestamp()
        return MailEntity.createQueryBuilder()
            .where({
                userId: String(uId),
                mMoreStatus: 0,
                mPastTime: Or(Equal(0), MoreThan(now)),
            })
            .setFindOptions({
                order: { mIsRead: 'asc', mIsAward: 'asc', mId: 'desc' },
            })
            .getMany()
    }
}
