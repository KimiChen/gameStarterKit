/**
 * 模块名:至宝
 * 事件名:至宝耐久度
 * 说明:至宝耐久度变更后推送
 */
export class TaArmSkinDurability {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'arm_skin_durability'

    /**
     * 字段名:至宝名称
     * 示例:甲级兵器
     */
    public arm_skin_name: string = ''

    /**
     * 字段名:至宝品质
     * 示例:绿色
     */
    public arm_skin_quality: string = ''

    /**
     * 字段名:至宝ID
     * 示例:123
     */
    public arm_skin_id: number = 0

    /**
     * 字段名:变更值
     * 示例:0
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:恢复/消耗
     */
    public after: number = 0

    /**
     * 字段名:变更原因
     * 示例:null
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
