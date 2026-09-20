import { Bean } from '@arthropoda/game-engine'

export class GuildTimerBean extends Bean {
    /**
     * 每日数据重置时间
     */
    dailyInitTime: int = 0

    /**
     * 每周数据重置时间
     */
    weeklyExpInitTime: int = 0
}
