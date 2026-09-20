/**
 * 模块名:基础
 * 事件名:主线任务
 * 说明:主线任务状态变更后推送
 */
export class TaMaintask {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'maintask'

    /**
     * 字段名:主线任务类型
     * 示例:1
     */
    public maintask_type: string = ''

    /**
     * 字段名:主线任务ID
     * 示例:1001
     */
    public maintask_id: string = ''

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
