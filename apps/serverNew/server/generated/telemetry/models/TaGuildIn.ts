/**
 * 模块名:妖盟
 * 事件名:加入妖盟
 * 说明:加入妖盟后推送
 */
export class TaGuildIn {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'guild_in'

    /**
     * 字段名:妖盟ID
     * 示例:10
     */
    public guild_id: string = ''

    /**
     * 字段名:妖盟名称
     * 示例:11
     */
    public guild_name: string = ''

    /**
     * 字段名:妖盟等级
     * 示例:1
     */
    public guild_level: number = 0

    /**
     * 字段名:妖盟职位
     * 示例:帮主
     */
    public position: string = ''

    /**
     * 字段名:帮主角色ID
     * 示例:1
     */
    public leader_id: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
