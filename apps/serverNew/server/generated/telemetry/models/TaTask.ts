/**
 * 模块名:任务经验
 * 事件名:任务经验
 * 说明:任务经验变更时推送
 */
export class TaTask {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'task'

    /**
     * 字段名:任务类型
     * 示例:每日任务活跃度/XX战令经验
     */
    public task_type: string = ''

    /**
     * 字段名:变更前进度
     * 示例:123
     */
    public before_progress: number = 0

    /**
     * 字段名:变更后进度
     * 示例:123
     */
    public after_progress: number = 0

    /**
     * 字段名:变更原因
     * 示例:完成XX任务
     */
    public reason: string = ''

    /**
     * 字段名:奖励内容
     * 示例:[仙玉*1,灵气*1]
     */
    public awards_items: Array<any> = []

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
