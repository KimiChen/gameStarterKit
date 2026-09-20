import { Bean } from '@arthropoda/game-engine'

export class PassItem extends Bean {
    /**
     * 阶段id
     */
    id: int = 0

    /**
     * 通过时间
     */
    passTime: int = 0

    /**
     * 击杀玩家
     */
    uId: int = 0
}
