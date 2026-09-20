/**
 * 模块名:战斗
 * 事件名:战斗_邀请
 * 说明:邀请战斗后推送
 */
export class TaFightInvitation {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'fight_invitation'

    /**
     * 字段名:邀请地图
     * 示例:场景（无场景记录所属系统）
     */
    public invitation_map: string = ''

    /**
     * 字段名:受邀请角色ID
     * 示例:123456,123456
     */
    public invited_user_id: Array<any> = []

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
