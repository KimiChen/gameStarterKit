/**
 * 模块名:妖盟
 * 事件名:山头砍价礼包
 * 说明:用户针对山头砍价礼包砍价或购买时上传该条日志
 */
export class TaGuildGift {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'guild_gift'

    /**
     * 字段名:山头id
     * 示例:223
     */
    public guild_id: string = ''

    /**
     * 字段名:山头等级
     * 示例:2
     */
    public guild_lv: number = 0

    /**
     * 字段名:山头名称
     * 示例:咖喱给给
     */
    public guild_name: string = ''

    /**
     * 字段名:当前售卖的礼包配置id
     * 示例:5
     */
    public gift_id: number = 0

    /**
     * 字段名:本次操作类型
     * 示例:砍价/购买/领差价
     */
    public type: string = ''

    /**
     * 字段名:本次操作所处阶段
     * 示例:砍价期间/重置期间
     */
    public phase: string = ''

    /**
     * 字段名:价格变更前
     * 示例:600
     */
    public before: number = 0

    /**
     * 字段名:价格变更值
     * 示例:-100
     */
    public change: number = 0

    /**
     * 字段名:当前价格
     * 示例:500
     */
    public after: number = 0

    /**
     * 字段名:累计砍价次数
     * 示例:7/22
     */
    public bargain_num: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
