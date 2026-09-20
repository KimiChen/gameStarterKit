/**
 * 模块名:供奉
 * 事件名:供奉确认
 * 说明:供奉确认
 */
export class TaWorshipReplace {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'worship_replace'

    /**
     * 字段名:技能品质
     * 示例:绿色
     */
    public quality: string = ''

    /**
     * 字段名:部位
     * 示例:1
     */
    public slotId: number = 0

    /**
     * 字段名:名称
     * 示例:XXX
     */
    public name: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
