/**
 * 模块名:基础
 * 事件名:创建角色id
 * 说明:创建角色id后推送
 */
export class TaRoleidCreate {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'roleid_create'

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
     * 字段名:性别
     * 示例:男
     */
    public sex: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {
        ['device_model']: '1',
        ['network_type']: '1',
        ['ip']: '1',
    }
}
