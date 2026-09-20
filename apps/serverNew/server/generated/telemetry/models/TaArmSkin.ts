/**
 * 模块名:至宝
 * 事件名:至宝
 * 说明:至宝获取后推送
 */
export class TaArmSkin {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'arm_skin'

    /**
     * 字段名:至宝名称
     * 示例:绝世剑
     */
    public arm_skin_name: string = ''

    /**
     * 字段名:至宝品质
     * 示例:甲级兵器
     */
    public arm_skin_quality: string = ''

    /**
     * 字段名:至宝ID
     * 示例:6666
     */
    public arm_skin_id: number = 0

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
