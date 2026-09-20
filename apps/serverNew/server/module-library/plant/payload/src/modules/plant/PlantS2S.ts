import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 修改青蛙摸鱼状态
 */
export interface ReqPlantSetEmpRelax extends Service<'Base'> {
    uId: number
    empId: number
}

/**
 * 协助浇水
 */
export interface ReqPlantHelpWater extends Service<'Base'> {
    uId: number
    guildId: number
    helpId: number
}
