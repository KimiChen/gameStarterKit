import { DiffMap, ServerHash } from '@arthropoda/game-engine'
import { GameDemoRewardBean } from './GameDemoRewardBean'
import { GameDemoScoreBean } from './GameDemoScoreBean'

/**
 * 本区服当前的炼丹冲榜活动（单例 id=1）。
 *
 * 非玩家资源：所有写入经 `GameDemoTaskAction` 声明的活动 taskGroupId / bindId 在同一 Task Worker 串行。
 */
export class GameDemoSeason extends ServerHash {
    id: int = 0
    number: int = 0
    phase: string = 'running'
    startedAt: int = 0
    endsAt: int = 0
    settledAt: int = 0
    scoreSeq: int = 0
    rewardedCount: int = 0

    /** uid → 本期积分。 */
    scores?: DiffMap<int, GameDemoScoreBean>

    /** 已计入的炼丹批次（`uid:batchId`），可靠队列至少一次投递时据此去重；每期清空。 */
    applied?: DiffMap<string, int>

    /** 名次 → 奖励；结算后在下一期开启前持续幂等登记投递。 */
    rewards?: DiffMap<int, GameDemoRewardBean>
}
