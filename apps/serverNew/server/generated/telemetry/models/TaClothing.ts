/**
 * 模块名:时装
 * 事件名:时装
 * 说明:时装获取后推送
 */
export class TaClothing {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'clothing'

    /**
     * 字段名:时装名称
     * 示例:绝世剑
     */
    public clothing_name: string = ''

    /**
     * 字段名:时装品质
     * 示例:甲级兵器
     */
    public clothing_quality: string = ''

    /**
     * 字段名:时装id
     * 示例:6666
     */
    public clothing_id: number = 0

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
