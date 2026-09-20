/**
 * 模块名:基础
 * 事件名:角色等级
 * 说明:角色等级变更后推送
 */
export class TaRoleLevel {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'role_level'

    /**
     * 字段名:变更值
     * 示例:1
     */
    public change: number = 0

    /**
     * 字段名:变更前
     * 示例:1
     */
    public before: number = 0

    /**
     * 字段名:变更后
     * 示例:2
     */
    public after: number = 0

    /**
     * 字段名:变更原因
     * 示例:升级
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
