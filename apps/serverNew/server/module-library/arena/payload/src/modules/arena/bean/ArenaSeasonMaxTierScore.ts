import { DiffArray, ServerHashJson, UtilTime } from '@arthropoda/game-engine'

export class ArenaSeasonMaxTierScore extends ServerHashJson {
    /**
     * 玩家Id
     */
    id: int = 0

    /**
     * 所有挑战结果中天梯分最高的三次积分
     */
    l?: DiffArray<int>

    expireTime(): number {
        return 10 * UtilTime.DAY_SECOND
    }
}
