/**
 * 模块名:桃花园
 * 事件名:被协助
 * 说明:被协助时推送
 */
export class TaPlantBeenHelp {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'plant_been_help'

    /**
     * 字段名:协助人ID
     * 示例:12123
     */
    public help_uid: string = ''

    /**
     * 字段名:协助人名称
     * 示例:小甜兔
     */
    public help_name: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
