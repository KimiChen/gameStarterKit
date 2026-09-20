/**
 * 模块名:战斗
 * 事件名:勾选设置
 * 说明:至宝、时装等勾选状态修改时推送
 */
export class TaSet {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'set'

    /**
     * 字段名:勾选类型
     * 示例:神兵/时装
     */
    public set_type: string = ''

    /**
     * 字段名:设置前
     * 示例:无勾选
     */
    public set_before: string = ''

    /**
     * 字段名:设置后
     * 示例:对玩家生效
     */
    public set_after: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
