/**
 * 模块名:时装
 * 事件名:时装耐久度
 * 说明:时装耐久度变更后推送
 */
export class TaClothingDurability {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'clothing_durability'

    /**
     * 字段名:时装名称
     * 示例:龙刀
     */
    public clothing_name: string = ''

    /**
     * 字段名:时装品质
     * 示例:甲级兵器
     */
    public clothing_quality: string = ''

    /**
     * 字段名:时装id
     * 示例:6666
     */
    public clothing_id: number = 0

    /**
     * 字段名:变更值
     * 示例:-1
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:0
     */
    public after: number = 0

    /**
     * 字段名:变更原因
     * 示例:恢复/消耗
     */
    public reason: string = ''

    /**
     * 字段名:场景
     * 示例:XX地图
     */
    public scene: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
