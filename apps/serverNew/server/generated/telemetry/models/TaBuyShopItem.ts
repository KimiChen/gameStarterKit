/**
 * 模块名:商城
 * 事件名:商城购买道具
 * 说明:在商城内购买道具、礼包时推送；
 * 一键购买时不同商品、同商品不同价格需要进行区分
 */
export class TaBuyShopItem {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'buy_shop_item'

    /**
     * 字段名:商城类型
     * 示例:礼包商城
     */
    public shop_type: string = ''

    /**
     * 字段名:商品id
     * 示例:1
     */
    public commodity_id: number = 0

    /**
     * 字段名:商品名称
     * 示例:武学礼包
     */
    public commodity_name: string = ''

    /**
     * 字段名:购买数量
     * 示例:10
     */
    public buy_quantity: number = 0

    /**
     * 字段名:消耗资源
     * 示例:101
     */
    public cost_resource: number = 0

    /**
     * 字段名:消耗数量
     * 示例:1000
     */
    public cost_num: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
