import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'

/**
 * 邮件-读
 */
export interface ReqMailRead extends Service<'Mail'> {
    id: number
}

/**
 * 邮件-领奖
 */
export interface ReqMailAward extends Service<'Mail'> {
    id: number
}

export interface ResMailAward {
    awards: AwardResponse
}

/**
 * 邮件-批量领奖
 */
export interface ReqMailAwardAll extends Service<'Mail'> {}
export interface ResMailAwardAll {
    awards: AwardResponse
}

/**
 * 邮件-删除
 */
export interface ReqMailDelete extends Service<'Mail'> {
    ids: number[]
}
