import { Bean } from '@arthropoda/game-engine'

/**
 * 战斗击杀对象
 */
export class FightKillItem extends Bean {
    /**
     * 目标ID
     */
    targetId: int = 0

    /**
     * 次数
     */
    count: int = 0

    /**
     * 最后时间
     */
    lastTime: int = 0
}
