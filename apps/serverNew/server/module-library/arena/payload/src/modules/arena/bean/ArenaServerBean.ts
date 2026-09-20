import { Bean, DiffArray, DiffMap, OnlyRedis } from '@arthropoda/game-engine'
import { ArenaHighlightItem } from './ArenaHighlightItem'

export class ArenaServerBean extends Bean {
    /**
     * 赛季id
     */
    seasonId: int = 0

    /**
     * 赛季开始时间
     */
    startTime: int = 0

    /**
     * 赛季状态
     */
    status: int = 0

    /**
     * 全服最高天梯日分
     */
    @OnlyRedis
    maxTierScore: int = 0

    /**
     * 每日定时器执行状态
     */
    dailySettlements?: DiffArray<string>

    /**
     * 风采实录-精彩时刻
     */
    @OnlyRedis
    highlightRecords?: DiffMap<int, ArenaHighlightItem>

    /**
     * 风采实录-每日新星
     */
    @OnlyRedis
    stars?: DiffArray<int>
}
