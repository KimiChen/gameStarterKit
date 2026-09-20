/**
 * 模块名:道具资源变更
 * 事件名:道具资源变更
 * 说明:道具资源变更后推送
 */
export class TaItemChange {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'item_change'

    /**
     * 字段名:道具类型
     * 示例:道具
     */
    public item_type: string = ''

    /**
     * 字段名:道具id
     * 示例:101
     */
    public item_id: string = ''

    /**
     * 字段名:道具名称
     * 示例:元宝
     */
    public item_name: string = ''

    /**
     * 字段名:变更值
     * 示例:1000
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:1050
     */
    public after: number = 0

    /**
     * 字段名:场景
     * 示例:main
     */
    public scene: string = ''

    /**
     * 字段名:场景ID
     * 示例:1901
     */
    public scene_id: string = ''

    /**
     * 字段名:BOSS名称
     * 示例:狮王
     */
    public area: string = ''

    /**
     * 字段名:变更原因
     * 示例:充值档位
     */
    public reason: string = ''

    /**
     * 字段名:所属系统
     * 示例:充值
     */
    public action_mod: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
