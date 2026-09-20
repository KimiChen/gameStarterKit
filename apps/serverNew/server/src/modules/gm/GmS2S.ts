import { Service } from '../../runtime/protocol/ServiceType'

export interface ReqRepairScript extends Service<'Gm'> {
    scriptName: string
    serverIds: number[]
    args: string[]
}

export interface ReqChangeServerState extends Service<'Gm'> {
    sIds: number[]
}

export interface ReqServerStop extends Service<'Gm'> {
    sIds: number[]
}

export interface ReqGmUserForbid extends Service<'Gm'> {
    uId: int
    type: int
    forbid: boolean
    time: int
}
