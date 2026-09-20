import { Bean } from '@arthropoda/game-engine'

export class TaskMonsterItem extends Bean {
    /**
     * 任务Id
     */
    id: int = 0

    /**
     * 怪物Id
     */
    monsterId: int = 0

    /**
     * 剩余血量
     */
    leftHp: int = 0
}
