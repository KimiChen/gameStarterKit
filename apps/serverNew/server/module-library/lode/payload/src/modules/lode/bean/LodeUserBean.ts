import { Bean, DiffArray, DiffMap, OnlyNet, OnlyRedis } from '@arthropoda/game-engine'
import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'

/**
 * 玩家灵脉信息
 */
export class LodeUserBean extends Bean {
    /**
     * 灵脉-挑战次数
     */
    lodeTimes: int = 0

    /**
     * 灵脉-上次匹配时间
     */
    lodeLastMatchTime: int = 0

    /**
     * 灵脉-当前占领灵脉
     */
    lodeId: int = 0

    /**
     * 灵脉-当前占领产出开始时间
     */
    lodeSettleStartTime: int = 0

    /**
     * 灵脉-结算类型-1被动离开（被抢） 2境界提升 3主动离开 4自动离开 5手动结算
     */
    lodeSettleType: int = 0

    /**
     * 灵脉-非手动结算境界
     */
    lodeSettleRealm: int = 0

    /**
     * 灵脉-抢夺者
     */
    @OnlyRedis
    lodeAtkUid: int = 0

    /**
     * 灵脉-非手动结算时长（秒）
     */
    lodeSettleDuration: int = 0

    /**
     * 灵脉-可结算多少分钟
     */
    lodeSettleNum: int = 0

    /**
     * 灵脉-今日已结算多少分钟
     */
    lodeDaySettleNum: int = 0

    /**
     * 灵脉-上次发送求助时间
     */
    lastLodeAskHelpTime: int = 0

    /**
     * 灵脉-今日守护次数
     */
    dayLodeProtectTimes: int = 0

    /**
     * 灵脉-今日被协助次数
     */
    dayLodeBeHelpedTimes: int = 0

    /**
     * 灵脉-今日被协助的ID列表
     */
    dayBeHelpedIds?: DiffArray<int>

    /**
     * 灵脉-今日已协助过的玩家id
     */
    hasHelpedLodeUIds?: DiffArray<int>

    /**
     * 所匹配位置集合[位置,灵脉id]
     */
    matchLodes?: DiffMap<int, int>

    /**
     * 抢夺者信息
     */
    @OnlyNet
    lodeAtkUser?: UserInfoOnlyNetBean
}
