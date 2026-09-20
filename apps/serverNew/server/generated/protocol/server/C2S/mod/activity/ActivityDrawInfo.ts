export interface ActivityDrawInfo {
    /**
     * 活动名+活动日期
     */
    name: string
    /**
     * 活动名
     */
    activityName: string
    /**
     * 活动日期
     */
    date: string
    /**
     * 抽奖次数
     */
    drawTimes: int
    /**
     * 已获得激活奖励道具列表
     */
    baseProps?: int[]
    /**
     * 已获得转换奖励道具列表
     *       @uses  int
     *       @noNet
     *       @alias f
     */
    turnProps?: int[]
    /**
     * 可领取次数奖励列表（次数）
     *       @uses  int
     *       @alias g
     */
    timesList?: int[]
    /**
     * 已领取次数奖励列表（次数）
     *       @uses  int
     *       @alias h
     */
    timesGetList?: int[]
}
