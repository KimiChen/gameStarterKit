/**
 * 模块名:活动
 * 事件名:活动积分
 * 说明:活动积分变更时推送
 */
export class TaActivityFraction {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'activity_fraction'

    /**
     * 字段名:冲榜名称
     * 示例:战力冲榜
     */
    public act_name: string = ''

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
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
