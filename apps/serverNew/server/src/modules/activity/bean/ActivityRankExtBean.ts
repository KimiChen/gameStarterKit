import { Bean } from '@arthropoda/game-engine'

export class ActivityRankExtBean extends Bean {
    /**
     * 活动名称
     */
    activityName: string = ''

    /**
     * 排行榜关键字
     */
    rankKey: string = ''

    /**
     * 历史最高
     */
    maxValue: int = 0
}
