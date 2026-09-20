/**
 * 爱心记录模型
 */
export class LoveRecordModel {
    /** int 行为类型 */
    id: int = 0

    /** int 今日已获得奖励次数 */
    dailyTimes: int = 0

    /** int 行为累计次数 */
    behaviorCount: int = 0

    /** int 添加可领奖次数（增量） */
    awardAddTimes: int = 0
}
