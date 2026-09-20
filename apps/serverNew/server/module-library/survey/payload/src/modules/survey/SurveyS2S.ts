import { Service } from '../../runtime/protocol/ServiceType'

export interface ReqSurveyBack extends Service<'Base'> {
    uId: int
    qaCode: string
}
