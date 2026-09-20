import { Bean } from '@arthropoda/game-engine'

export class ArenaUserStatItem extends Bean {
    /**
     * 类型（1进攻，2防守）
     */
    type: int = 0

    /**
     * 胜场数
     */
    win: int = 0

    /**
     * 总场次
     */
    num: int = 0
}
