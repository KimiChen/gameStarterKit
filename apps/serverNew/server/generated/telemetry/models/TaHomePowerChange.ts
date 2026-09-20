/**
 * 模块名:拖箱子
 * 事件名:体力
 * 说明:体力变更时推送
 */
export class TaHomePowerChange {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'home_power_change'

    /**
     * 字段名:疲劳状态
     * 示例:充沛、正常、疲惫、力竭
     */
    public tired_stage: string = ''

    /**
     * 字段名:变更值
     * 示例:1
     */
    public change: number = 0

    /**
     * 字段名:变更前
     * 示例:10
     */
    public before: number = 0

    /**
     * 字段名:变更后
     * 示例:11
     */
    public after: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
