import { DiffArray, Mod, OnlyRedis, ServerHashJson, UtilTime } from '@arthropoda/game-engine'
import { ArenaUserDailyItem } from './ArenaUserDailyItem'

@Mod
export class ArenaSeasonUser extends ServerHashJson {
    /**
     * 玩家ID
     */
    id: int = 0

    /**
     * 竞技场日常信息
     */
    daily?: ArenaUserDailyItem

    /**
     * 赛季最大分数
     */
    @OnlyRedis
    maxSeasonTierScores?: DiffArray<int>

    /**
     * 赛季奖励是否已领取
     */
    isAward: boolean = false

    /**
     * 上次匹配时间
     */
    lastMatchTime: int = 0

    /**
     * 连胜场次
     */
    winStreak: int = 0

    /**
     * 每日最大分数
     */
    @OnlyRedis
    maxDailyTierScores?: DiffArray<int>

    expireTime(): number {
        return 15 * UtilTime.DAY_SECOND
    }
}
