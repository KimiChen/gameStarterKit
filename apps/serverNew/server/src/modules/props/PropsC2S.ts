import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'

export interface ReqPropAdd extends Service<'Base'> {
    id: int
    num: int
}

export interface ResPropAdd {
    awards: AwardResponse
}

export interface ReqPropUse extends Service<'Base'> {
    propId: int //道具Id
    num: int // 数量
}

export interface ResPropUse {}
