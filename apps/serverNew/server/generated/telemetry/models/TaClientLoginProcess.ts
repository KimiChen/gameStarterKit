/**
 * 模块名:客户端埋点
 * 事件名:客户端登录流程
 * 说明:完成各登录流程后推送，登录流程按原需求
 */
export class TaClientLoginProcess {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'client_login_process'

    /**
     * 字段名:账号
     * 示例:asdf1234
     */
    public open_id: string = ''

    /**
     * 字段名:事件类型
     * 示例:0
     */
    public event_type: string = ''

    /**
     * 字段名:大类ID
     * 示例:1
     */
    public guide_Id: string = ''

    /**
     * 字段名:客户端事件ID
     * 示例:1
     */
    public client_event_id: string = ''

    /**
     * 字段名:客户端事件名称
     * 示例:初始化SDK
     */
    public client_event_name: string = ''

    /**
     * 字段名:客户端事件时间
     * 示例:1619147713616
     */
    public event_time: number = 0

    /**
     * 字段名:其他参数
     * 示例:0
     */
    public other: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
