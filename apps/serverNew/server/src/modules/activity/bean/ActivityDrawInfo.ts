import { Bean, DiffArray } from '@arthropoda/game-engine'

/**
 * @property string           $name         活动名+活动日期
 * @property string           $activityName 活动名
 * @property string           $date         活动日期
 * @property int              $drawTimes    抽奖次数
 * @property int[]|ArrayRedis $baseProps    已获得激活奖励道具列表
 * @property int[]|ArrayRedis $turnProps    已获得转换奖励道具列表
 * @property int[]|ArrayRedis $timesList    可领取次数奖励列表（次数）
 * @property int[]|ArrayRedis $timesGetList 已领取次数奖励列表（次数）
 */
export class ActivityDrawInfo extends Bean {
    /**
     * 活动名+活动日期
     */
    name: string = ''

    /**
     * 活动名
     */
    activityName: string = ''

    /**
     * 活动日期
     */
    date: string = ''

    /**
     * 抽奖次数
     */
    drawTimes: int = 0

    /**
     * 已获得激活奖励道具列表
     */
    baseProps?: DiffArray<int>

    /**
     * 已获得转换奖励道具列表
     * @uses  int
     * @noNet
     * @alias f
     */
    turnProps?: DiffArray<int>

    /**
     * 可领取次数奖励列表（次数）
     * @uses  int
     * @alias g
     */
    timesList?: DiffArray<int>

    /**
     * 已领取次数奖励列表（次数）
     * @uses  int
     * @alias h
     */
    timesGetList?: DiffArray<int>
}
