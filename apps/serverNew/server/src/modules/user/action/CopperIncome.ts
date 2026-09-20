import { User } from '../bean/User'

/** 玩家铜币的在线与离线结算规则。 */
export class CopperIncome {
    static readonly INTERVAL_SECONDS = 5

    static perInterval(level: int): int {
        return Math.floor(100 * Math.pow(Math.max(0, level), 1.1))
    }

    /**
     * 登录时一次性结算离线期间完整的五秒批次，并从当前时刻重新开始计时。
     * 第一次登录没有历史结算点，不产生离线收益。
     */
    static settleOffline(user: User, now: int): { offlineSeconds: int; copper: int } {
        const previous = user.lastCopperIncomeTime
        user.lastCopperIncomeTime = now
        if (previous <= 0 || now <= previous) {
            return { offlineSeconds: 0, copper: 0 }
        }

        const offlineSeconds = now - previous
        const copper = this.copperForIntervals(user.lv, Math.floor(offlineSeconds / this.INTERVAL_SECONDS))
        user.copper += copper
        return { offlineSeconds, copper }
    }

    /** 在线心跳结算；不足五秒的余量保留到下一次心跳。 */
    static settleOnline(user: User, now: int): int {
        if (user.lastCopperIncomeTime <= 0) {
            user.lastCopperIncomeTime = now
            return 0
        }
        const elapsed = now - user.lastCopperIncomeTime
        const intervals = Math.floor(elapsed / this.INTERVAL_SECONDS)
        if (intervals <= 0) {
            return 0
        }

        user.lastCopperIncomeTime += intervals * this.INTERVAL_SECONDS
        const copper = this.copperForIntervals(user.lv, intervals)
        user.copper += copper
        return copper
    }

    /** 断线时从准确的离线起点重新计时；未凑满五秒的在线余量不结算。 */
    static markOffline(user: User, now: int): void {
        user.lastCopperIncomeTime = now
    }

    private static copperForIntervals(level: int, intervals: int): int {
        if (intervals <= 0) {
            return 0
        }
        const copper = this.perInterval(level) * intervals
        if (!Number.isSafeInteger(copper)) {
            throw new Error('铜币收益超出安全整数范围')
        }
        return copper
    }
}
