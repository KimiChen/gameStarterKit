import { Service } from '../../runtime/protocol/ServiceType'
import { MailPropItem } from '../../runtime/protocol/S2S/commom'

export interface ReqMailSendGlobal extends Service<'Mail'> {
    uid: number
}

export interface ReqMailAdd extends Service<'Mail'> {
    uId: number
    title?: string
    content?: string
    pastTime?: number
    uqid?: number
    awards?: MailPropItem[]
    type?: number
    fromId?: number
    fromName?: string
    params?: string
}

export interface ReqTracelessAward extends Service<'Mail'> {
    uId: number
    l?: MailPropItem[]
    uqid: number
}

export interface ReqTracelessReduceItem extends Service<'Mail'> {
    uId: number
    l?: MailPropItem[]
    uqid: number
    type: number
}

export interface ReqMailLoopSendGlobal extends Service<'Mail'> {
    sIds: number[]
}
