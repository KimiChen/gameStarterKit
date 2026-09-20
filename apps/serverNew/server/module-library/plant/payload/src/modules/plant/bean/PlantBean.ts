import { Bean, DiffArray, DiffMap } from '@arthropoda/game-engine'
import { EmployeeItem } from './EmployeeItem'

/**
 * 桃园
 */
export class PlantBean extends Bean {
    /**
     * 桃园-今日浇水次数
     */
    dayWaterTimes: int = 0

    /**
     * 桃园-今日被协助浇水次数
     */
    dayBeenHelpedWaterTimes: int = 0

    /**
     * 桃园-今日被协助的ID列表
     */
    dayBeenHelpedIds?: DiffArray<int>

    /**
     * 桃园-今日唤醒摸鱼次数
     */
    dayWakeEmpTimes: int = 0

    /**
     * 桃园-今日已协助过的玩家id
     */
    hasHelpedUIds?: DiffArray<int>

    /**
     * 今日桃园收获次数
     */
    dayPlantAwardTimes: int = 0

    /**
     * 今日发起请求协助的次数
     */
    dayPlantAskHelpTimes: int = 0

    /**
     * 桃园-职工列表
     */
    employees?: DiffMap<int, EmployeeItem>

    /**
     * 桃园-成熟时间
     */
    matureTime: int = 0

    /**
     * 桃园-上次发送求助时间
     */
    lastAskHelpTime: int = 0
}
