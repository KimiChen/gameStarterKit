import {
    getServerIdByUid,
    IUserOnline,
    RedisInstance,
    timestamp,
    UserOnlineMgr,
    UtilTime,
} from '@arthropoda/game-engine'
import { MailModel as MailEntity } from '../../../../generated/persistence/MailModel'
import { GameAction } from '../../../runtime/action/GameAction'
import { MailPropItem } from '../../../runtime/protocol/S2S/commom'
import { User } from '../../user/bean/User'
import { BPropBean } from '../bean/BPropBean'
import { MailItemBean } from '../bean/MailItemBean'
import { MailLocalization } from '../language/MailLocalization'
import { MailDefine } from '../rules/MailDefine'
import { MailStateKeys } from '../rules/MailStateKeys'
import { MailStateAccess } from '../state/MailStateAccess'

export class ActionMail extends GameAction {
    static readonly MAIL_EXPIRE_DAY = 30

    static add(
        uIds: number | number[],
        type: number = MailDefine.TYPE_DEFAULT,
        params = {},
        awards: MailPropItem[] = [],
        title = '',
        content = '',
        pastTime = -1,
        otherValues: Partial<MailEntity> = {},
    ) {
        if (!Array.isArray(uIds)) uIds = [uIds]
        for (const uid of uIds) {
            if (getServerIdByUid(uid) <= 0) throw new Error('入参错误:' + uIds.join(','))
        }

        const now = timestamp()
        if (pastTime === -1) pastTime = now + UtilTime.DAY_SECOND * this.MAIL_EXPIRE_DAY
        let baseMailValues: Partial<MailEntity> = {
            mType: type,
            mTitle: title,
            mContent: content,
            mParams: Object.keys(params).length > 0 ? JSON.stringify(params) : '',
            mPastTime: pastTime,
            mDateline: now,
        }
        if (type === MailDefine.TYPE_PAY_NOTICE) {
            baseMailValues.mAwardShow = awards.length > 0 ? JSON.stringify(awards) : ''
            baseMailValues.mAward = ''
        } else {
            baseMailValues.mAward = awards.length > 0 ? JSON.stringify(awards) : ''
            baseMailValues.mAwardShow = ''
        }
        baseMailValues = { ...baseMailValues, ...otherValues }

        Ctx.mailRecords ??= { count: 0, uIds: {}, mails: [] }
        for (const uId of uIds) Ctx.mailRecords.uIds[uId] = true
        Ctx.mailRecords.count += 1
        Ctx.mailRecords.mails.push({ uIds, mail: baseMailValues, awards })
    }

    static async endAction() {
        if (!Ctx.mailRecords) return

        const count = Ctx.mailRecords.count
        let startMailId = (await RedisInstance.getServerRedis().incrBy(MailStateKeys.MAIL_INCR_ID_KEY, count)) - count
        const users: { [uId: number]: User | undefined } = {}
        const onlineUsers: { [uId: number]: IUserOnline } = {}

        if (Ctx.mailRecords.uIds) {
            const sId2UId: { [sId: number]: number[] } = {}
            for (const key in Ctx.mailRecords.uIds ?? {}) {
                const uId = Number(key)
                const user = await User.load(uId)
                if (!user) {
                    Log.error('can not find the uid:' + uId)
                    continue
                }
                users[uId] = user
                const sId = getServerIdByUid(uId)
                sId2UId[sId] ??= []
                sId2UId[sId].push(uId)
            }
            for (const sId in sId2UId) {
                const currentOnlineUsers = await UserOnlineMgr.getUsers(Number(sId), ...sId2UId[sId])
                for (const key in currentOnlineUsers) {
                    const userOnline = currentOnlineUsers[key]
                    if (userOnline) onlineUsers[userOnline.uId] = userOnline
                }
            }
        }

        const values: Partial<MailEntity>[] = []
        for (const item of Ctx.mailRecords.mails) {
            for (const uId of item.uIds) {
                const mailValues: Partial<MailEntity> = {
                    ...item.mail,
                    mId: ++startMailId,
                    userId: String(uId),
                }
                values.push(mailValues)

                if (onlineUsers[uId]) {
                    const user = users[uId]
                    if (!user) {
                        Log.error(`发送邮件时找不到uid对应的玩家:${uId}`)
                        continue
                    }
                    const mailItem = new MailItemBean({
                        mId: mailValues.mId ?? 0,
                        userId: Number(mailValues.userId ?? 0),
                        mType: mailValues.mType ?? 0,
                        mFrom: mailValues.mFrom ?? '',
                        mFromName: mailValues.mFromName ?? '',
                        mFromCid: mailValues.mFromCid ?? 0,
                        mTitle: MailLocalization.getValueByUserLanguage(user.language ?? '', mailValues.mTitle ?? ''),
                        mContent: MailLocalization.getValueByUserLanguage(
                            user.language ?? '',
                            mailValues.mContent ?? '',
                        ),
                        mIsRead: mailValues.mIsRead ?? 0,
                        mIsAward: mailValues.mIsAward ?? 0,
                        mDateline: mailValues.mDateline ?? 0,
                        mPastTime: mailValues.mPastTime ?? 0,
                        mParams: mailValues.mParams ?? '',
                    })
                    item.awards.forEach((award) => {
                        mailItem.awards.set(mailItem.awards.maxKey() + 1, new BPropBean(award))
                    })
                    if (user.mail) user.mail.mails.set(mailValues.mId!, mailItem)
                }
            }
        }
        await MailEntity.createQueryBuilder().insert().values(values).execute()
    }

    static readAwardChange(user: User, mails: MailEntity[]) {
        const changedMails = new Map()
        for (const mail of mails) {
            const { userId, ...rest } = mail
            changedMails.set(
                mail.mId,
                new MailItemBean({
                    userId: Number(userId),
                    ...rest,
                    mIsAward: 0,
                    mIsRead: 0,
                }),
            )
        }
        const mailInfo = MailStateAccess.getMod(user)
        mailInfo.mails.buildNet(changedMails)
        for (const mail of mails) {
            const { mIsAward, mIsRead } = mail
            mailInfo.mails.get(mail.mId)!.mIsRead = mIsAward
            mailInfo.mails.get(mail.mId)!.mIsAward = mIsRead
        }
    }

    static delProperty(user: User, mailIds: number[]) {
        const changedMails = new Map()
        for (const mailId of mailIds) changedMails.set(mailId, new MailItemBean({}))
        const mailInfo = MailStateAccess.getMod(user)
        mailInfo.mails.buildNet(changedMails)
        for (const mailId of mailIds) mailInfo.mails.delete(mailId)
    }
}
