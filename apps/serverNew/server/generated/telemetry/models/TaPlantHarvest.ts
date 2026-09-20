/**
 * 模块名:桃花园
 * 事件名:桃园采集
 * 说明:桃园采集时推送
 */
export class TaPlantHarvest {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'plant_harvest'

    /**
     * 字段名:奖励内容
     * 示例:[仙玉*1,灵气*1]
     */
    public awards_items: Array<any> = []

    /**
     * 字段名:妖仆名称
     * 示例:蛙不困
     */
    public worker_name: string = ''

    /**
     * 字段名:当日累计采集
     * 示例:2
     */
    public harvest_times: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
