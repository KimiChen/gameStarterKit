export class FightLogRecordSchema {
    /** 玩家日志 */
    static TYPE_USER = 1

    /** 怪物日志 */
    static TYPE_MONSTER = 2

    /** 其他日志 */
    static TYPE_OTHER = 3

    /** 妖盟日志 */
    static TYPE_GUILD = 4

    /** 砍价日志 */
    static TYPE_GUILD_BARGAIN = 5

    /** 拖箱子日志 */
    static TYPE_HOME = 6

    /** 被赞日志 */
    static TYPE_LIKE = 7

    /** 日志条数限制 */
    static LOG_LIMIT_NUM = 100

    /** 日志索引：id */
    static LOG_KEY_ID = 1

    /** 日志索引：参数 */
    static LOG_KEY_PARAMS = 2

    /** 日志索引：记录时间 */
    static LOG_KEY_TIME = 3
}
