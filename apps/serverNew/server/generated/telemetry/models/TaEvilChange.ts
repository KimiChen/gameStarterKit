/**
 * 模块名:罪恶值
 * 事件名:罪恶值变更
 * 说明:罪恶值变更时推送
 */
export class TaEvilChange {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'evil_change'

    /**
     * 字段名:变更前
     * 示例:1
     */
    public before: number = 0

    /**
     * 字段名:变更后
     * 示例:1
     */
    public after: number = 0

    /**
     * 字段名:变更值
     * 示例:2
     */
    public change: number = 0

    /**
     * 字段名:变更原因
     * 示例:击杀玩家/时间恢复
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
