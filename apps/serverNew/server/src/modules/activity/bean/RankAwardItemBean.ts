import { Bean } from '@arthropoda/game-engine'

/**
 * 冲榜奖励定义
 */
export class RankAwardItemBean extends Bean {
    /**
     * 奖励类型
     */
    type: int = 0

    /**
     * 领奖状态
     */
    state: int = 0

    /**
     * 排名
     */
    rank: int = 0
}
