/**
 * 模块名:活动
 * 事件名:活动排名
 * 说明:活动结束时推送
 */
export class TaActivityRank {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'activity_rank'

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
     * 字段名:区服
     * 示例:1/1-2-3-4(展示具体区服)
     */
    public cross_id: string = ''

    /**
     * 字段名:活动类型
     * 示例:本服/跨服
     */
    public rank_type: string = ''

    /**
     * 字段名:排名
     * 示例:1
     */
    public rank: number = 0

    /**
     * 字段名:冲榜分数
     * 示例:100000
     */
    public final_score: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
