/**
 * 活动名称
 */
export class ActivityRankDefine {
    /** 排行榜封禁key */
    static readonly FORBID_RANK_USER = 'Forbid_Rank_User'

    // #region 记录类型
    static readonly NUM_TYPE_NOW = 1 // 当前值

    static readonly NUM_TYPE_TYPE = 2 // 涨幅值

    static readonly NUM_TYPE_TIME = 3 // 时间类
    // #endregion

    // #region 是否展示历史值
    static readonly SHOW_HISTORY_OFF = 0 //冲榜专用-展示历史（0-否/1-是）

    static readonly SHOW_HISTORY_ON = 1
    // #endregion

    // #region 领取奖励, 0不可领取, 1可领取，2已领取

    /** 0不可领取 */
    static readonly AWARD_CAN_NOT_GET = 0

    /** 1可领取，2已领取 */
    static readonly AWARD_CAN_GET = 1

    /** 1可领取，2已领取 */
    static readonly AWARD_ALREADY_GET = 2
    // #endregion

    // #region 联盟冲榜是否计算个人分
    static readonly GUILD_PERSONAL_SCORE_OFF = 0 // 否

    static readonly GUILD_PERSONAL_SCORE_ON = 1 // 是
    // #endregion

    // #region 结算时间
    static readonly SETTLEMENT_TIME = 300 // 冲榜活动延时300秒领奖

    static readonly RANK_SAVE_DAY = 10 // 活动结束后保留排行榜天数
    // #endregion

    // #region 冲榜活动领奖类型
    static readonly AWARD_TYPE_NORMAL = 1 // 正常冲榜奖励

    static readonly AWARD_TYPE_GUILD_LEADER = 2 // 联盟冲榜的盟主奖励

    static readonly AWARD_TYPE_SERVER = 3 // 跨服区服榜奖励
    // #endregion
}
