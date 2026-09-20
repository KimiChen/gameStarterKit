/**
 * 模块名:基础
 * 事件名:聊天
 * 说明:玩家聊天时推送
 */
export class TaChat {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'chat'

    /**
     * 字段名:聊天类型
     * 示例:世界聊天/私聊/山头
     */
    public chat_type: string = ''

    /**
     * 字段名:聊天对象
     * 示例:XXX
     */
    public chat_object: string = ''

    /**
     * 字段名:对象ID
     * 示例:123124
     */
    public chat_id: number = 0

    /**
     * 字段名:聊天内容
     * 示例:123
     */
    public chat_content: string = ''

    /**
     * 字段名:聊天方式
     * 示例:分享装备/协助分享/正常交流
     */
    public share_type: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
