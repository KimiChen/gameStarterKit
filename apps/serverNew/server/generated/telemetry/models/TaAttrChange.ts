/**
 * 模块名:属性
 * 事件名:属性变更
 * 说明:属性点变更值推送
 */
export class TaAttrChange {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'attr_change'

    /**
     * 字段名:变更前
     * 示例:1
     */
    public before: number = 0

    /**
     * 字段名:变更值
     * 示例:1
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:2
     */
    public after: number = 0

    /**
     * 字段名:剩余属性点
     * 示例:1
     */
    public surplus: number = 0

    /**
     * 字段名:属性
     * 示例:力量
     */
    public attr_name: string = ''

    /**
     * 字段名:变更原因
     * 示例:加点/洗点
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
