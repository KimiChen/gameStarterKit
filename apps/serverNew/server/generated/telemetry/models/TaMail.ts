/**
 * 模块名:基础
 * 事件名:玩家邮件
 * 说明:玩家新增/首次阅读/领取/删除邮件后推送
 */
export class TaMail {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'mail'

    /**
     * 字段名:邮件类型
     * 示例:运营邮件
     */
    public mail_type: string = ''

    /**
     * 字段名:邮件主题
     * 示例:新年快乐
     */
    public mail_title: string = ''

    /**
     * 字段名:邮件内容
     * 示例:新年好呀，新年好呀
     */
    public mail_content: string = ''

    /**
     * 字段名:附件内容
     * 示例:炼体丹X5
     */
    public awards: string = ''

    /**
     * 字段名:邮件状态
     * 示例:新增邮件/首次阅读/领取/删除
     */
    public mail_status: string = ''

    /**
     * 字段名:创建时间
     * 示例:Thu Jan 01 1970 16:00:44 GMT+0800 (China Standard Time)
     */
    public create_time: number = 0

    /**
     * 字段名:过期时间
     * 示例:Thu Jan 01 1970 16:00:44 GMT+0800 (China Standard Time)
     */
    public past_time: number = 0

    /**
     * 字段名:领取时间
     * 示例:Thu Jan 01 1970 16:00:44 GMT+0800 (China Standard Time)
     */
    public awards_time: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
