/**
 * 模块名:装备
 * 事件名:装备抽取
 * 说明:装备抽取后推送（10连传10条）
 */
export class TaEquipLottery {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'equip_lottery'

    /**
     * 字段名:类型
     * 示例:免费/半价/元宝/精铁
     */
    public equip_type: string = ''

    /**
     * 字段名:装备等级
     * 示例:130
     */
    public equip_level: number = 0

    /**
     * 字段名:装备部位
     * 示例:护手
     */
    public equip_pos: string = ''

    /**
     * 字段名:装备品质
     * 示例:红/橙/黄
     */
    public equip_quality: string = ''

    /**
     * 字段名:装备ID
     * 示例:123
     */
    public equip_id: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
