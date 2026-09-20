import { Bean } from '@arthropoda/game-engine'

export class TowerPassItem extends Bean {
    /**
     *  塔ID
     */
    id: int = 0

    /**
     * 通过时间
     */
    passTime: int = 0

    /**
     * 通过玩家ID
     */
    uId: int = 0
}
