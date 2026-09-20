import { Bean } from '@arthropoda/game-engine'

export class TaskProgressItem extends Bean {
    /**
     * 任务类型#param1#param2
     */
    type: string = ''

    /**
     * 任务进度
     */
    progress: int = 0
}
