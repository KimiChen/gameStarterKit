/**
 * 模块名:成就
 * 事件名:成就等级
 * 说明:成就等级状态变更时推送
 */
export class TaAchieveLv {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'achieve_lv'

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
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
