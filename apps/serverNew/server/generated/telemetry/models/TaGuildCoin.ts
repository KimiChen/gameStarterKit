/**
 * 模块名:妖盟
 * 事件名:妖丹
 * 说明:妖丹变更后推送
 */
export class TaGuildCoin {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'guild_coin'

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
     * 示例:500
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:1700
     */
    public after: number = 0

    /**
     * 字段名:变更原因
     * 示例:击杀妖盟boss
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
