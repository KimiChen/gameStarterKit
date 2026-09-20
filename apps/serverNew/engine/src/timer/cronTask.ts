import { CronTime } from 'cron'
import Heap from 'heap-js'

export interface CronTask {
    // 任务名称
    taskName: string
    // 任务cron表达式
    cronTime: CronTime
    // 下一次执行时间
    nextRunTime: int
    // 执行逻辑
    onTick: () => void | Promise<void>
}

export class CronTaskMinHeap extends Heap<CronTask> {
    constructor() {
        super((a, b) => a.nextRunTime - b.nextRunTime)
    }
}

