import { Bean } from '@arthropoda/game-engine'

/**
 * 所有的累计任务进度统计
 */
export class TaskItem extends Bean {
    /**
     * 任务ID
     */
    id: int = 0

    /**
     * 领奖状态：（0未领取/大于0代表已领奖）
     */
    status: int = 0
}
