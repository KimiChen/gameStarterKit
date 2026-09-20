/**
 * 模块名:桃花园
 * 事件名:发起协助申请
 * 说明:发起协助申请时推送
 */
export class TaPlantAskHelp {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'plant_ask_help'

    /**
     * 字段名:当日发起协助次数
     * 示例:1
     */
    public ask_times: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
