/**
 * 模块名:基础
 * 事件名:角色登出
 * 说明:角色登出后推送
 */
export class TaRoleLeave {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'role_leave'

    /**
     * 字段名:设备型号
     * 示例:iPhone11
     */
    public device_model: string = ''

    /**
     * 字段名:网络状态
     * 示例:WiFi
     */
    public network_type: string = ''

    /**
     * 字段名:IP
     * 示例:192.168.1.1
     */
    public ip: string = ''

    /**
     * 字段名:登录渠道
     * 示例:1
     */
    public login_source: string = ''

    /**
     * 字段名:客户端版本
     * 示例:1.1.1
     */
    public client_ver: string = ''

    /**
     * 字段名:服务端版本
     * 示例:2.2.2
     */
    public server_ver: string = ''

    /**
     * 字段名:是否付费
     * 示例:是
     */
    public is_pay: boolean = false

    /**
     * 字段名:当次在线时长
     * 示例:1
     */
    public online_time: number = 0

    /**
     * 字段名:客户端平台
     * 示例:mac/IOS/WINDOWS/Android
     */
    public platform: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {
        ['device_model']: '1',
        ['network_type']: '1',
        ['ip']: '1',
    }
}
