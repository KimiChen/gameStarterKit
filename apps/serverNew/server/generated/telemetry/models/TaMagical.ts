/**
 * 模块名:神通
 * 事件名:神通
 * 说明:神通获取后推送
 */
export class TaMagical {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'magical'

    /**
     * 字段名:神通名称
     * 示例:绝世剑
     */
    public magical_name: string = ''

    /**
     * 字段名:神通品质
     * 示例:甲级兵器
     */
    public magical_quality: string = ''

    /**
     * 字段名:神通id
     * 示例:6666
     */
    public magical_id: number = 0

    /**
     * 字段名:变更原因
     * 示例:激活/已拥有转耐久
     */
    public reason: string = ''

    /**
     * 字段名:激活原因
     * 示例:万圣节活动激活
     */
    public activation_reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
