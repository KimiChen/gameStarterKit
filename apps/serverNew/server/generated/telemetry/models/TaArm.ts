/**
 * 模块名:法宝
 * 事件名:法宝等级
 * 说明:法宝等级变更后推送
 */
export class TaArm {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'arm'

    /**
     * 字段名:法宝名称
     * 示例:锈剑
     */
    public arm_name: string = ''

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
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
