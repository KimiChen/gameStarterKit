import { Bean } from '@arthropoda/game-engine'

export class LoveRecordItem extends Bean {
    /**
     * 爱心值类型
     */
    id: int = 0

    /**
     * 当前行为次数
     */
    behaviorCount: int = 0

    /**
     * 当天已获取获取奖励的次数
     */
    dailyTimes: int = 0

    /**
     * 爱心值可领次数
     */
    awardNum: int = 0
}
