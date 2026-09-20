import { Listen } from '@arthropoda/game-engine'
import { Bean } from '@arthropoda/game-engine'
import { ListenAdNumHandler } from '../event/ListenAds'

export class AdItem extends Bean {
    /**
     * 广告id
     */
    adId: int = 0

    /**
     * 今日观看次数
     */
    @Listen(ListenAdNumHandler)
    num: int = 0

    /**
     * 总观看次数
     */
    totalNum: int = 0

    /**
     * 上次观看时间
     */
    lastTime: int = 0
}
