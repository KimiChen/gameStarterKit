/**
 * 模块名:拖箱子
 * 事件名:发起采集
 * 说明:采集取消＆发起成时推送
 */
export class TaHomeSetNum {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'home_set_num'

    /**
     * 字段名:抢夺id
     * 示例:10001
     */
    public target_uid: number = 0

    /**
     * 字段名:抢夺昵称
     * 示例:灭霸
     */
    public target_name: string = ''

    /**
     * 字段名:采集资源
     * 示例:精力/仙玉/宝石
     */
    public resource_name: string = ''

    /**
     * 字段名:资源等级
     * 示例:1
     */
    public resource_lv: number = 0

    /**
     * 字段名:资源数量
     * 示例:5
     */
    public resource_num: number = 0

    /**
     * 字段名:采集人数
     * 示例:1
     */
    public worker_num: number = 0

    /**
     * 字段名:采集时间
     * 示例:22
     */
    public time: number = 0

    /**
     * 字段名:采集类型
     * 示例:采集＆抢夺
     */
    public type: string = ''

    /**
     * 字段名:变更原因
     * 示例:发起＆取消
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
