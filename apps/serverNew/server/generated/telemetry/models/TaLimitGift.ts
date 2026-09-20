/**
 * 模块名:限时礼包
 * 事件名:限时礼包
 * 说明:限时礼包触发或购买后推送
 */
export class TaLimitGift {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'limit_gift'

    /**
     * 字段名:礼包类型
     * 示例:神兵助力礼包
     */
    public gift_type: string = ''

    /**
     * 字段名:描述
     * 示例:神兵达到29级
     */
    public gift_desc: string = ''

    /**
     * 字段名:礼包名称
     * 示例:神兵助力礼包-1
     */
    public gift_name: string = ''

    /**
     * 字段名:价格
     * 示例:12
     */
    public gift_price: number = 0

    /**
     * 字段名:礼包内容
     * 示例:武学币x100，杀气x100
     */
    public gift_content: Array<any> = []

    /**
     * 字段名:变更原因
     * 示例:触发
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
