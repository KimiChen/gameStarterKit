import { Bean, DiffMap } from '@arthropoda/game-engine'
import { TriggerGiftItem } from './TriggerGiftItem'

export class TriggerGiftGroupItem extends Bean {
    /**
     * 礼包组ID
     */
    id: int = 0

    /**
     * 结束时间
     */
    endTime: int = 0

    /**
     * 礼包集合
     */
    gifts?: DiffMap<int, TriggerGiftItem>
}
