/**
 * 模块名:妖术
 * 事件名:妖术释放
 * 说明:妖术释放后推送
 * 释放一次推送一条
 */
export class TaLostKnowledgeUse {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'lost_knowledge_use'

    /**
     * 字段名:妖术类型
     * 示例:攻击/被动/触发
     */
    public lost_knowledge_type: string = ''

    /**
     * 字段名:战斗类型
     * 示例:PVP/PVE
     */
    public fight_type: string = ''

    /**
     * 字段名:变更原因
     * 示例:场景（无场景记录所属系统）
     */
    public reason: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
