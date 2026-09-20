/**
 * 模块名:桃花园
 * 事件名:协助他人
 * 说明:协助他人时推送
 */
export class TaPlantHelp {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'plant_help'

    /**
     * 字段名:被协助人ID
     * 示例:12123
     */
    public been_help_uid: string = ''

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
