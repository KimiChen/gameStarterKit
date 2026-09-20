/**
 * 模块名:战斗
 * 事件名:战斗_被玩家击杀
 * 说明:被击杀后推送
 */
export class TaFightPvpLost {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'fight_pvp_lost'

    /**
     * 字段名:获胜角色ID
     * 示例:10002
     */
    public win_role_id: string = ''

    /**
     * 字段名:获胜角色昵称
     * 示例:好不好
     */
    public win_role_name: string = ''

    /**
     * 字段名:获胜角色战力
     * 示例:1000
     */
    public win_role_fp: number = 0

    /**
     * 字段名:获胜角色助阵侠客
     * 示例:玄机
     */
    public win_assist_name: string = ''

    /**
     * 字段名:获胜角色助阵侠客ID
     * 示例:123
     */
    public win_assist_id: string = ''

    /**
     * 字段名:死亡地图
     * 示例:世界BOSS
     */
    public map: string = ''

    /**
     * 字段名:NPC名称
     * 示例:狮王
     */
    public boss_name: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
