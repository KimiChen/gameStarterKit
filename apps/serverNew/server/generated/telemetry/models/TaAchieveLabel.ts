/**
 * 模块名:成就
 * 事件名:成就标签
 * 说明:成就标签状态变更时推送
 */
export class TaAchieveLabel {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'achieve_label'

    /**
     * 字段名:标签名称
     * 示例:我我我
     */
    public label_name: string = ''

    /**
     * 字段名:标签品质
     * 示例:绿色
     */
    public label_quality: string = ''

    /**
     * 字段名:标签描述
     * 示例:你你你
     */
    public label_describe: string = ''

    /**
     * 字段名:标签状态
     * 示例:穿戴/获取/卸下
     */
    public label_stute: string = ''

    /**
     * 字段名:标签坑位
     * 示例:1号位
     */
    public label_position: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
