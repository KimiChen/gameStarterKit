/**
 * 模块名:战斗
 * 事件名:竞技场
 * 说明:竞技场战斗结束后推送
 */
export class TaArena {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'arena'

    /**
     * 字段名:敌方ID
     * 示例:12580
     */
    public enemy_id: string = ''

    /**
     * 字段名:敌方昵称
     * 示例:一按我帮你
     */
    public enemy_name: string = ''

    /**
     * 字段名:敌方战力
     * 示例:100
     */
    public enemy_fp: number = 0

    /**
     * 字段名:类型
     * 示例:进攻
     */
    public type: string = ''

    /**
     * 字段名:战斗结果
     * 示例:胜利
     */
    public fight_rlt: string = ''

    /**
     * 字段名:排名
     * 示例:5
     */
    public rank: number = 0

    /**
     * 字段名:变更值
     * 示例:500
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:1000
     */
    public after: number = 0

    /**
     * 字段名:赛季id
     * 示例:1
     */
    public season_id: number = 0

    /**
     * 字段名:赛季排名
     * 示例:null
     */
    public season_rank: number = 0

    /**
     * 字段名:赛季积分变更值
     * 示例:null
     */
    public season_change: number = 0

    /**
     * 字段名:赛季积分变更后
     * 示例:null
     */
    public season_after: number = 0

    /**
     * 字段名:是否跨服
     * 示例:是
     */
    public if_cross: boolean = false

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
