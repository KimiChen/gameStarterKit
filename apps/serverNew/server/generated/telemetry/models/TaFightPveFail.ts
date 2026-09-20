/**
 * 模块名:战斗
 * 事件名:战斗_击杀BOSS失败
 * 说明:击杀BOSS失败后推送
 */
export class TaFightPveFail {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'fight_pve_fail'

    /**
     * 字段名:副本类型
     * 示例:世界boss
     */
    public map_type: string = ''

    /**
     * 字段名:boss类型
     * 示例:姑苏河畔
     */
    public boss_type: string = ''

    /**
     * 字段名:NPC名称
     * 示例:狮王(100级)
     */
    public boss_name: string = ''

    /**
     * 字段名:战斗结果
     * 示例:被BOSS击杀/退出地图
     */
    public fight_result: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
