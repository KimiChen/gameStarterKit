/**
 * 模块名:充值模块
 * 事件名:订单完成
 * 说明:订单完成时推送
 */
export class TaOrderFinish {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'order_finish'

    /**
     * 字段名:计费点id
     * 示例:1
     */
    public recharge_id: string = ''

    /**
     * 字段名:商品类型
     * 示例:日礼包
     */
    public recharge_type: string = ''

    /**
     * 字段名:商品项
     * 示例:1
     */
    public gift_id: string = ''

    /**
     * 字段名:礼包名称
     * 示例:6元武学日礼包
     */
    public gift_name: string = ''

    /**
     * 字段名:订单号
     * 示例:ddh111
     */
    public order_id: string = ''

    /**
     * 字段名:合作方订单号
     * 示例:hzfddh111
     */
    public ext_order_id: string = ''

    /**
     * 字段名:支付金额
     * 示例:10
     */
    public pay_amount: number = 0

    /**
     * 字段名:支付美元金额
     * 示例:10
     */
    public pay_amount_usd: number = 0

    /**
     * 字段名:充值ip
     * 示例:192.168.1.1
     */
    public ip: string = ''

    /**
     * 字段名:是否首次充值
     * 示例:是
     */
    public is_first_pay: boolean = false

    /**
     * 字段名:充值渠道
     * 示例:1
     */
    public pay_source: string = ''

    /**
     * 字段名:当前体力值
     * 示例:1
     */
    public current_phy: number = 0

    /**
     * 字段名:当日充值次数
     * 示例:4
     */
    public daily_recharge_times: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
