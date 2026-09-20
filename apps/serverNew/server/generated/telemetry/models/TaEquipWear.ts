/**
 * 模块名:装备
 * 事件名:装备穿戴
 * 说明:装备穿戴后推送
 */
export class TaEquipWear {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'equip_wear'

    /**
     * 字段名:装备品质
     * 示例:紫阶
     */
    public equip_quality: string = ''

    /**
     * 字段名:装备名称
     * 示例:布甲
     */
    public equip_name: string = ''

    /**
     * 字段名:装备评分
     * 示例:100
     */
    public equip_fp: number = 0

    /**
     * 字段名:装备等级
     * 示例:10
     */
    public equip_level: number = 0

    /**
     * 字段名:装备部位
     * 示例:1
     */
    public equip_pos: string = ''

    /**
     * 字段名:装备词条
     * 示例:1
     */
    public equip_affix: string = ''

    /**
     * 字段名:装备id
     * 示例:1
     */
    public equip_id: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
