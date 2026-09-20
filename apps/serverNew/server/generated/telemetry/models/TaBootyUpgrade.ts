/**
 * 模块名:奇珍
 * 事件名:奇珍升级
 * 说明:奇珍升级变更后推送
 */
export class TaBootyUpgrade {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'booty_upgrade'

    /**
     * 字段名:奇珍名称
     * 示例:九阳盾
     */
    public booty_name: string = ''

    /**
     * 字段名:奇珍品质
     * 示例:1
     */
    public booty_quality: string = ''

    /**
     * 字段名:奇珍星级
     * 示例:1
     */
    public booty_star: number = 0

    /**
     * 字段名:奇珍id
     * 示例:6666
     */
    public booty_id: number = 0

    /**
     * 字段名:变更前
     * 示例:1
     */
    public before: number = 0

    /**
     * 字段名:变更值
     * 示例:-1
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:2
     */
    public after: number = 0

    /**
     * 字段名:变更原因
     * 示例:奇珍穿戴
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
