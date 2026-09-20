import { Bean, DiffMap } from '@arthropoda/game-engine'
import { TaskProgressItem } from './TaskProgressItem'

export class TaskProgress extends Bean {
    /**
     * 任务类型
     */
    type: int = 0

    /**
     * 累积型任务数值记录（以任务类型为key）
     */
    tasksProgress?: DiffMap<string, TaskProgressItem>
}
