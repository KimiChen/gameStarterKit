import { TaskProgressItem } from '../task/TaskProgressItem'

export interface TaskProgress {
    /**
     * 任务类型
     */
    type: int
    /**
     * 累积型任务数值记录（以任务类型为key）
     */
    tasksProgress?: Map<string, TaskProgressItem>
}
