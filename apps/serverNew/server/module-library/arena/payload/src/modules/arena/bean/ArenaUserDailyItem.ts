import { Bean, DiffArray, DiffMap, OnlyNet, OnlyRedis } from '@arthropoda/game-engine'
import { ArenaMatchItem } from './ArenaMatchItem'

export class ArenaUserDailyItem extends Bean {
    /**
     * 已挑战次数
     */
    challengeTimes: int = 0

    /**
     * 已购买的战次数
     */
    buyTimes: int = 0

    /**
     * 前日结算剩余次数
     * @alias c
     */
    leftTimes: int = 0

    /**
     * 锁定开始时间
     */
    @OnlyRedis
    lock: int = 0

    /**
     * 当场匹配列表
     */
    @OnlyRedis
    matchList?: DiffMap<int, ArenaMatchItem>

    /**
     * 已匹配列表
     */
    @OnlyRedis
    alreadyMatchList?: DiffArray<int>

    /**
     * 已挑战列表
     */
    @OnlyRedis
    challengedList?: DiffArray<int>

    /**
     * 声望分
     */
    @OnlyNet
    prestige: int = 0

    /**
     * 今日天梯分
     */
    @OnlyNet
    tierScore: int = 0

    /**
     * 奖励已获取次数
     */
    awardTimes: int = 0
}
