/**
 * 模块名:战斗
 * 事件名:杀敌数变更
 * 说明:杀敌数变更时推送
 */
export class TaKill {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'kill'

    /**
     * 字段名:变更值
     * 示例:1
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:2
     */
    public after: number = 0

    /**
     * 字段名:变更原因
     * 示例:激活XXboss/挂机获取
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
