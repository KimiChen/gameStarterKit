import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'

export interface ReqGongLvUp extends Service<'Base'> {}

export interface ResGongLvUp {
    lv: int
    awards: AwardResponse
}

export interface ReqGongSkillUp extends Service<'Base'> {
    sorceryId: int //妖术Id
}

export interface ResGongSkillUp {
    sorceryId: int
}
