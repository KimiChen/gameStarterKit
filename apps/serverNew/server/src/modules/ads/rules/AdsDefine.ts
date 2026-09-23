import { UtilTime } from '@arthropoda/game-engine'
import { TaskDefine } from '../../task/rules/TaskDefine'
import { User } from '../../user/bean/User'
import { AdItem } from '../bean/AdItem'

/**
 * 激励广告的判定规则。
 *
 * 广告状态挂在 User.ads 上，没有独立的每日重置字段，
 * 因此"今日次数"和"冷却"都以上次观看时间 lastTime 为准实时推算，
 * 跨天判定与 UserDayInit 的过天口径保持一致（自然日）。
 */
export class AdsDefine {
    /**
     * 「看广告送称号」的广告 -> 称号映射。
     *
     * 正规做法是把它做成 `ads_awards.json` 的一个字段；当前配置声明没有该字段，
     * 所以先用这张内置表承载。配置表支持后再迁过去，迁移时只需改这个类。
     *
     * 表里没有的 adId 返回 0，表示这条广告不发称号。
     */
    static readonly TITLE_AWARDS: Readonly<Record<int, int>> = {
        /** 401 看广告送称号 -> 10908（看广告获得） */
        401: 10908,
    }

    /**
     * 取这条广告附带的称号奖励，没有则返回 0。
     * @param adId 广告id
     */
    static resolveTitleAward(adId: int): int {
        return AdsDefine.TITLE_AWARDS[adId] ?? 0
    }

    /**
     * 是否已经跨过自然日。
     *
     * 只有 lastTime 早于今天才需要重置今日次数；
     * lastTime 为 0 说明从未观看，同样不需要重置。
     */
    static isCrossDay(lastTime: int, now: int): boolean {
        if (lastTime <= 0) {
            return false
        }
        return UtilTime.formatYMD(lastTime) !== UtilTime.formatYMD(now)
    }

    /** 冷却剩余秒数，0 表示可以立即观看 */
    static resolveCdRemain(item: AdItem, cd: int, now: int): int {
        if (cd <= 0 || item.lastTime <= 0) {
            return 0
        }
        const remain = item.lastTime + cd - now
        return remain > 0 ? remain : 0
    }

    /** 解锁条件是否全部满足 */
    static isUnlocked(user: User, required: readonly IConfAds_awardsRequired[]): boolean {
        for (const condition of required) {
            if (!AdsDefine.isConditionMet(user, condition)) {
                return false
            }
        }
        return true
    }

    /**
     * 单条解锁条件判定。
     *
     * 目前配置只用到"通过任务开启功能"，条件是主线任务id：
     * 主线任务链的 nextId 依次递增，因此"当前主线任务id大于条件值"即代表该任务已完成。
     * 未识别的条件类型不做拦截，避免新增配置类型时误锁玩法。
     */
    static isConditionMet(user: User, condition: IConfAds_awardsRequired): boolean {
        switch (condition.type) {
            case TaskDefine.TARGET_1065_MAIN_TASK:
                return user.mainTaskId > condition.value
            default:
                return true
        }
    }
}
