import { BPropBean } from '../mail/BPropBean'

export interface MailItemBean {
    mId: int

    userId: int

    mType: int

    mFrom: string

    mFromName: string

    mFromCid: int

    mTitle: string

    mContent: string

    mIsRead: int

    mIsAward: int

    mDateline: int

    mPastTime: int

    awards?: Map<int, BPropBean>

    mParams: string
}
