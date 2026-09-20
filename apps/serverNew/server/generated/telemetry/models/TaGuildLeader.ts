/**
 * 模块名:妖盟
 * 事件名:帮主变更
 * 说明:帮主变更后推送
 */
export class TaGuildLeader {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'guild_leader'

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
     * 字段名:新帮主角色ID
     * 示例:1
     */
    public new_leader_id: string = ''

    /**
     * 字段名:变更原因
     * 示例:自动转移/帮主转移/妖盟创建
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
