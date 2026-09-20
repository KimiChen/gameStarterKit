/**
 * 模块名:境界
 * 事件名:境界提升
 * 说明:境界提升时推送
 */
export class TaGroupPosition {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'group_position'

    /**
     * 字段名:是否成功
     * 示例:失败/成功
     */
    public is_success: boolean = false

    /**
     * 字段名:变更前职位
     * 示例:教徒
     */
    public pos_before: string = ''

    /**
     * 字段名:变更后职位
     * 示例:地字门徒
     */
    public pos_after: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
