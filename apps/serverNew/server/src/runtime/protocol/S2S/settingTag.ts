import { Service } from '../ServiceType'

export interface ReqSettingTagRefresh extends Service<'Gm'> {
    sIds: number[]
}
