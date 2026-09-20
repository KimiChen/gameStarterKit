/**
 * 模块名:功法
 * 事件名:功法等级
 * 说明:功法等级变更后推送
 */
export class TaCardLevel {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'card_level'

    /**
     * 字段名:功法名称
     * 示例:易筋经一重
     */
    public card_name: string = ''

    /**
     * 字段名:变更值
     * 示例:1
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:1
     */
    public after: number = 0

    /**
     * 字段名:变更原因
     * 示例:功法升级
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
