import { TaskItem } from '../task/TaskItem'
import { TaskProgress } from '../task/TaskProgress'

export interface TaskTimeLimitItem {
    /**
     * 上一次重置的时间点
     */
    lastResetTime: int
    /**
     * 每日任务领奖记录
     */
    tasks?: Map<int, TaskItem>
    /**
     * 每日任务目标进度列表
     */
    taskTotal?: Map<int, TaskProgress>
}
