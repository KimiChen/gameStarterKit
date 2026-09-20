/**
 * 模块名:妖术
 * 事件名:妖术等级
 * 说明:妖术等级变更后推送
 */
export class TaLostKnowledge {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'lost_knowledge'

    /**
     * 字段名:妖术名称
     * 示例:吸星大法
     */
    public lost_knowledge_name: string = ''

    /**
     * 字段名:种族名称
     * 示例:狐狸
     */
    public group_name: string = ''

    /**
     * 字段名:妖术类型
     * 示例:攻击/被动/触发
     */
    public lost_knowledge_type: string = ''

    /**
     * 字段名:变更值
     * 示例:-1
     */
    public change: number = 0

    /**
     * 字段名:变更后
     * 示例:0
     */
    public after: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
