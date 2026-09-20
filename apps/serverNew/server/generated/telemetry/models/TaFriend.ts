/**
 * 模块名:好友
 * 事件名:好友变更
 * 说明:好友变更时推送
 */
export class TaFriend {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'friend'

    /**
     * 字段名:好友角色id
     * 示例:678910
     */
    public friend_user_id: string = ''

    /**
     * 字段名:好友角色昵称
     * 示例:小侠
     */
    public friend_user_name: string = ''

    /**
     * 字段名:变更原因
     * 示例:添加
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
