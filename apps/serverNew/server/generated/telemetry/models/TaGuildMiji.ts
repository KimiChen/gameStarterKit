/**
 * 模块名:妖盟
 * 事件名:妖盟点修
 * 说明:妖盟点修变更后推送
 */
export class TaGuildMiji {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'guild_miji'

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
     * 字段名:秘籍名称
     * 示例:技能名称1
     */
    public miji_name: string = ''

    /**
     * 字段名:秘籍类型
     * 示例:增伤
     */
    public miji_type: string = ''

    /**
     * 字段名:变更后
     * 示例:1200
     */
    public after: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
