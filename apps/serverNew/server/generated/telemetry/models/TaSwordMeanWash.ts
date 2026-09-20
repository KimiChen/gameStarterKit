/**
 * 模块名:器灵洗练
 * 事件名:器灵洗练
 * 说明:器灵洗练后推送
 */
export class TaSwordMeanWash {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'sword_mean_wash'

    /**
     * 字段名:器灵品质
     * 示例:绿色
     */
    public sword_mean_quality: string = ''

    /**
     * 字段名:孔位
     * 示例:1
     */
    public sword_mean_position: number = 0

    /**
     * 字段名:名称
     * 示例:XXX
     */
    public sword_mean_name: string = ''

    /**
     * 字段名:变更前属性
     * 示例:力量+1、暴击+10%
     */
    public attribute_before: string = ''

    /**
     * 字段名:变更后属性
     * 示例:力量+1、暴击+15%
     */
    public attribute_after: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
