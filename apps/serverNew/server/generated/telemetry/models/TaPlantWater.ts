/**
 * 模块名:桃花园
 * 事件名:浇水
 * 说明:浇水时推送
 */
export class TaPlantWater {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'plant_water'

    /**
     * 字段名:浇水次数
     * 示例:1
     */
    public water_times: number = 0

    /**
     * 字段名:当日剩余次数
     * 示例:1
     */
    public left_water_imes: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
