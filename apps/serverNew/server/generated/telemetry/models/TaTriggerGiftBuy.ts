/**
 * 模块名:触发礼包
 * 事件名:购买日志
 * 说明:购买时推送
 */
export class TaTriggerGiftBuy {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'trigger_gift_buy'

    /**
     * 字段名:礼包id
     * 示例:null
     */
    public trigger_gift_id: string = ''

    /**
     * 字段名:礼包名称
     * 示例:null
     */
    public trigger_gift_name: string = ''

    /**
     * 字段名:礼包价格
     * 示例:null
     */
    public trigger_gift_price: number = 0

    /**
     * 字段名:剩余购买次数
     * 示例:null
     */
    public remaining_num: string = ''

    /**
     * 字段名:购买时触发剩余时间
     * 示例:null
     */
    public remaining_time: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
