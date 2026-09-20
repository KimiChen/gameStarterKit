/**
 * 模块名:系统解锁
 * 事件名:系统解锁
 * 说明:解锁系统时推送
 */
export class TaSystemUnlock {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'system_unlock'

    /**
     * 字段名:系统名称
     * 示例:兵器
     */
    public system_name: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
