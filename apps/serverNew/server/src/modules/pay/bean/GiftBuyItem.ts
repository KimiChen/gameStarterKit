import { Bean } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { PropBean } from '../../props/bean/PropBean'

export class GiftBuyItem extends Bean {
    /**
     * 礼包id
     */
    id: int = 0

    /**
     * 购买次数
     */
    num: int = 0

    /**
     * 自选奖励
     */
    chooseAwards?: DiffMap<int, PropBean>
}
