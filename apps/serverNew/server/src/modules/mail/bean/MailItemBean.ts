import { Bean } from '@arthropoda/game-engine'
import { BPropBean } from './BPropBean'
import { DiffMap } from '@arthropoda/game-engine'

export class MailItemBean extends Bean {
    mId: int = 0 // 邮件Id

    userId: int = 0 // 玩家id

    mType: int = 0 // 邮件类型

    mFrom: string = '' // 来自那里

    mFromName: string = '' // 来自谁

    mFromCid: int = 0 // 好友头像id

    mTitle: string = '' //标题

    mContent: string = '' //内容

    mIsRead: int = 0 //是否阅读

    mIsAward: int = 0 //是否领取

    mDateline: int = 0 //发邮件时间

    mPastTime: int = 0 //邮件过期时间

    awards?: DiffMap<int, BPropBean>

    mParams: string = '' // 参数
}
