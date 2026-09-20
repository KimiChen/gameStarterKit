/**
 * 模块名:宝石
 * 事件名:宝石
 * 说明:镶嵌＆升级后推送
 */
export class TaJewelInlay {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'jewel_inlay'

    /**
     * 字段名:装备部位
     * 示例:衣服
     */
    public equip_pos: string = ''

    /**
     * 字段名:宝石品质
     * 示例:1
     */
    public jewel_quality: string = ''

    /**
     * 字段名:原有宝石品质
     * 示例:0
     */
    public before_jewel_quality: string = ''

    /**
     * 字段名:宝石名称
     * 示例:攻击石
     */
    public jewel_name: string = ''

    /**
     * 字段名:变更原因
     * 示例:镶嵌/升级
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
