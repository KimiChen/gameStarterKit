import { ServerHashJson } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { RankAwardItemBean } from './RankAwardItemBean'

/**
 * 在定榜的时候就保存可领取玩家信息
 */
export class RankAwardBean extends ServerHashJson {
    /**
     * 玩家id
     */
    id: int = 0

    /**
     * 玩家id
     */
    uId: int = 0

    /**
     * 排名，联盟冲榜表示联盟排名
     */
    rank: int = 0

    /**
     * 领奖信息
     */
    awardInfos?: DiffMap<int, RankAwardItemBean>
}
