/**
 * 模块名:妖盟
 * 事件名:妖盟财富
 * 说明:妖盟财富变更后推送
 */
export class TaGuildWealth {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'guild_wealth'

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
     * 字段名:妖盟等级
     * 示例:2
     */
    public guild_level: number = 0

    /**
     * 字段名:变更值
     * 示例:-2000
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:1200
     */
    public after: number = 0

    /**
     * 字段名:变更原因
     * 示例:求贤阁-周芷若
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
