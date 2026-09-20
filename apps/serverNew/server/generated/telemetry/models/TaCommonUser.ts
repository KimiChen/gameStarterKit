/**
 * TaCommonUser
 * 数数事件公共属性
 */
export class TaCommonUser {
    /**
     * 玩家数数版本号
     */
    public taVersion: int = 0

    /**
     * #event_time
     * 时间
     */
    public event_time: number = 0

    /**
     * #device_id
     * 设备号
     */
    public device_id: string = ''

    /**
     * role_source
     * 注册渠道
     */
    public role_source: string = ''

    /**
     * open_id
     * 账号
     */
    public open_id: string = ''

    /**
     * #account_id
     * 账户id
     */
    public account_id: string = ''

    /**
     * server_id
     * 区服ID
     */
    public server_id: string = ''

    /**
     * mix_id
     * 合服id
     */
    public mix_id: string = ''

    /**
     * line_id
     * 线路id
     */
    public line_id: string = ''

    /**
     * role_name
     * 角色名称
     */
    public role_name: string = ''

    /**
     * role_level
     * 角色等级
     */
    public role_level: number = 0

    /**
     * role_vip_level
     * VIP等级
     */
    public role_vip_level: number = 0

    /**
     * role_fp
     * 评分
     */
    public role_fp: number = 0

    /**
     * current_gc
     * 当前元宝数
     */
    public current_gc: number = 0

    /**
     * maintask_id
     * 主线ID
     */
    public maintask_id: number = 0

    /**
     * maintask_status
     * 主线状态
     */
    public maintask_status: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {
        ['event_time']: '1',
        ['device_id']: '1',
        ['account_id']: '1',
    }
}
