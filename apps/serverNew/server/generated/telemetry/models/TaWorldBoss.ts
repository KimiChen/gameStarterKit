/**
 * 模块名:世界BOSS
 * 事件名:世界BOSS
 * 说明:玩家击杀世界BOSS后推送
 */
export class TaWorldBoss {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'world_boss'

    /**
     * 字段名:BOSS名称
     * 示例:XX
     */
    public boss_name: string = ''

    /**
     * 字段名:BOSS等级
     * 示例:123
     */
    public boss_lv: number = 0

    /**
     * 字段名:奖励类型
     * 示例:归属/无次数
     */
    public awards_type: string = ''

    /**
     * 字段名:奖励内容
     * 示例:XXX
     */
    public awards_items: Array<any> = []

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
