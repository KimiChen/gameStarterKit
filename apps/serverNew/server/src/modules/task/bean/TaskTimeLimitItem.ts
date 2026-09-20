import { Bean, DiffMap, OnlyRedis } from '@arthropoda/game-engine'
import { TaskItem } from './TaskItem'
import { TaskProgress } from './TaskProgress'

export class TaskTimeLimitItem extends Bean {
    /**
     * 上一次重置的时间点
     */
    @OnlyRedis
    lastResetTime: int = 0

    /**
     * 每日任务领奖记录
     */
    tasks?: DiffMap<int, TaskItem>

    /**
     * 每日任务目标进度列表
     */
    taskTotal?: DiffMap<int, TaskProgress>
}
