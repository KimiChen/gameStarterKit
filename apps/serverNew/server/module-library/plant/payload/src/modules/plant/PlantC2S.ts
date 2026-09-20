import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'

/**
 * 帮别人浇水
 */
export interface ReqPlantWater extends Service<'Base'> {
    /**
     * 目标uid
     */
    targetUId: int
}

export interface ResPlantWater {
    awards: AwardResponse
}

/**
 * 升级青蛙
 */
export interface ReqPlantLvUp extends Service<'Base'> {
    /**
     * 青蛙id
     */
    id: int
}

/**
 * 唤醒
 */
export interface ReqPlantWake extends Service<'Base'> {
    /**
     * 青蛙id
     */
    id: int
}

/**
 * 发送求助
 */
export interface ReqPlantAskHelp extends Service<'Guild'> {}

/**
 * 收获
 */
export interface ReqPlantHarvest extends Service<'Base'> {}

export interface ResPlantHarvest {
    awards: AwardResponse
}
