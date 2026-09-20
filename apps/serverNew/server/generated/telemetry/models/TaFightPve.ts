/**
 * 模块名:战斗
 * 事件名:战斗_击杀BOSS
 * 说明:击杀BOSS后推送
 */
export class TaFightPve {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'fight_pve'

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
     * 示例:胜利
     */
    public fight_result: string = ''

    /**
     * 字段名:是否召唤
     * 示例:是/否
     */
    public is_summon: boolean = false

    /**
     * 字段名:奖励内容
     * 示例:经验,银两
     */
    public awards_items: Array<any> = []

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
