/**
 * 模块名:装备
 * 事件名:装备强化
 * 说明:装备强化后推送
 */
export class TaEquipIntensify {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'equip_intensify'

    /**
     * 字段名:装备部位
     * 示例:1
     */
    public equip_pos: string = ''

    /**
     * 字段名:变更后
     * 示例:1
     */
    public after: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
