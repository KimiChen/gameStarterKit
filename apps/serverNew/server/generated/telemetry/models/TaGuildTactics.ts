/**
 * 模块名:妖盟
 * 事件名:妖盟阵法
 * 说明:妖盟阵法等级变更后推送
 */
export class TaGuildTactics {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'guild_tactics'

    /**
     * 字段名:妖盟ID
     * 示例:1
     */
    public guild_id: string = ''

    /**
     * 字段名:妖盟名称
     * 示例:来辣
     */
    public guild_name: string = ''

    /**
     * 字段名:阵法名称
     * 示例:两仪阵
     */
    public tactics_name: string = ''

    /**
     * 字段名:变更后
     * 示例:2
     */
    public after: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
