/**
 * 模块名:装备
 * 事件名:装备分享
 * 说明:装备分享后推送
 */
export class TaEquipShare {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'equip_share'

    /**
     * 字段名:装备名称
     * 示例:布甲
     */
    public equip_name: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
