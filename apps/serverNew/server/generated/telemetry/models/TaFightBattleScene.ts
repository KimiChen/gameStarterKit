/**
 * 模块名:战斗
 * 事件名:战斗场景变更
 * 说明:战斗场景变更时推送
 */
export class TaFightBattleScene {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'fight_battle_scene'

    /**
     * 字段名:地图名称
     * 示例:武学副本
     */
    public scene_type: string = ''

    /**
     * 字段名:场景
     * 示例:紫儿
     */
    public scene: string = ''

    /**
     * 字段名:变更原因
     * 示例:进入地图/退出地图
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
