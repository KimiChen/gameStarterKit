import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'

/**
 * 爱心值领取
 */
export interface ReqLoveAward extends Service<'Base'> {
    /** 爱心值类型：1历练 2点赞 3浇水 */
    type: int
}

export interface ResLoveAward {
    awards: AwardResponse
}

export interface ReqLoveTest extends Service<'Base'> {
    type: int
}
