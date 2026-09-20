/**
 * 模块名:活动
 * 事件名:活动奖励领取
 * 说明:活动图标结束时推送
 */
export class TaActivityAwards {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'activity_awards'

    /**
     * 字段名:冲榜活动id
     * 示例:1
     */
    public act_id: string = ''

    /**
     * 字段名:冲榜名称
     * 示例:战力冲榜
     */
    public act_name: string = ''

    /**
     * 字段名:排名
     * 示例:1
     */
    public rank: number = 0

    /**
     * 字段名:活动类型
     * 示例:本服/跨服
     */
    public rank_type: string = ''

    /**
     * 字段名:奖励内容
     * 示例:经验,银两
     */
    public awards_items: Array<any> = []

    /**
     * 字段名:奖励是否领取
     * 示例:是
     */
    public is_awards_take: boolean = false

    /**
     * 字段名:领取时间
     * 示例:Thu Jan 01 1970 16:00:44 GMT+0800 (China Standard Time)
     */
    public awards_time: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
