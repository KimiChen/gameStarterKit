import { EmployeeItem } from '../plant/EmployeeItem'

export interface PlantBean {
    /**
     * 桃园-今日浇水次数
     */
    dayWaterTimes: int
    /**
     * 桃园-今日被协助浇水次数
     */
    dayBeenHelpedWaterTimes: int
    /**
     * 桃园-今日被协助的ID列表
     */
    dayBeenHelpedIds?: int[]
    /**
     * 桃园-今日唤醒摸鱼次数
     */
    dayWakeEmpTimes: int
    /**
     * 桃园-今日已协助过的玩家id
     */
    hasHelpedUIds?: int[]
    /**
     * 今日桃园收获次数
     */
    dayPlantAwardTimes: int
    /**
     * 今日发起请求协助的次数
     */
    dayPlantAskHelpTimes: int
    /**
     * 桃园-职工列表
     */
    employees?: Map<int, EmployeeItem>
    /**
     * 桃园-成熟时间
     */
    matureTime: int
    /**
     * 桃园-上次发送求助时间
     */
    lastAskHelpTime: int
}
