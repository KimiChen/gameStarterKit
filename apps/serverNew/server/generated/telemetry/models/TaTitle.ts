/**
 * 模块名:称号
 * 事件名:称号变更
 * 说明:称号获得/穿戴时推送
 */
export class TaTitle {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'title'

    /**
     * 字段名:称号类型
     * 示例:荣誉称号
     */
    public titles_type: string = ''

    /**
     * 字段名:称号品质
     * 示例:甲级
     */
    public title_quality: string = ''

    /**
     * 字段名:称号名称
     * 示例:福建大侠
     */
    public title_name: string = ''

    /**
     * 字段名:变更原因
     * 示例:冲榜活动获得
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
