/**
 * 模块名:客户端埋点
 * 事件名:广告位曝光
 * 说明:打开特定带广告相关界面时推送
 */
export class TaAdvertisingAppear {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'Advertising_appear'

    /**
     * 字段名:客户端事件ID
     * 示例:1
     */
    public client_event_id: number = 0

    /**
     * 字段名:客户端事件名称
     * 示例:体力/天墉城广告礼包/每日福利
     */
    public client_event_name: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
