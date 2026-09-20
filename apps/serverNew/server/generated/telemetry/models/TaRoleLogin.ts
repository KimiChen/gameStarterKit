/**
 * 模块名:基础
 * 事件名:角色登录
 * 说明:角色登录后推送
 */
export class TaRoleLogin {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'role_login'

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
     * 字段名:操作系统
     * 示例:如 Android、iOS 等
     */
    public os: string = ''

    /**
     * 字段名:操作系统版本
     * 示例:iOS 11.2.2、Android 8.0.0 等
     */
    public os_version: string = ''

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
        ['os']: '1',
        ['os_version']: '1',
    }
}
