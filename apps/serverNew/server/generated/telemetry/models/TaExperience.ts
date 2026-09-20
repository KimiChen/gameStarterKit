/**
 * 模块名:历练
 * 事件名:历练
 * 说明:玩家击杀历练BOSS后推送
 */
export class TaExperience {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'experience'

    /**
     * 字段名:历练名称
     * 示例:XX
     */
    public experience_name: string = ''

    /**
     * 字段名:历练等级
     * 示例:123
     */
    public experience_lv: number = 0

    /**
     * 字段名:历练类型
     * 示例:功法/法宝/中午场
     */
    public experience_type: string = ''

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
     * 字段名:伤害排名
     * 示例:1
     */
    public hurt_rank: number = 0

    /**
     * 字段名:治疗排名
     * 示例:1
     */
    public cure_rank: number = 0

    /**
     * 字段名:控制排名
     * 示例:1
     */
    public control_rank: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
