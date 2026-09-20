/**
 * 模块名:装备
 * 事件名:装备耐久
 * 说明:耐久产生变化时推送
 */
export class TaEquipDurable {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'equip_durable'

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
     * 字段名:装备等级
     * 示例:10
     */
    public equip_level: number = 0

    /**
     * 字段名:装备id
     * 示例:1
     */
    public equip_id: number = 0

    /**
     * 字段名:耐久变更前
     * 示例:null
     */
    public before: number = 0

    /**
     * 字段名:耐久变更值
     * 示例:null
     */
    public change: number = 0

    /**
     * 字段名:耐久变更后
     * 示例:null
     */
    public after: number = 0

    /**
     * 字段名:场景
     * 示例:main
     */
    public scene: string = ''

    /**
     * 字段名:场景ID
     * 示例:1901
     */
    public scene_id: number = 0

    /**
     * 字段名:耐久变更原因
     * 示例:PVE击杀/PVP击杀/精铁补充
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
