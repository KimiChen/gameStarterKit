import { User } from '../bean/User'

/**
 * 玩家铜币的在线与离线结算规则。
 *
 * 在线与离线**共用一条时间轴**（`user.lastCopperIncomeTime`）：
 *  - 在线：心跳 `settleOnline` 按完整五秒批次入账，余量留到下一次；
 *  - 离线：登录 `parkOffline` 只把这段时间的收益**算好暂存**，⛔ 不直接进 `copper`。
 *
 * 离线收益必须由客户端请求领取（`claimOffline`）：暂存期间 `lastCopperIncomeTime` 已推进到
 * 登录时刻，因此在线结算不会把同一段离线时间再算一遍——两条路径共用一条基线，天然不重复计息。
 */
export class CopperIncome {
    static readonly INTERVAL_SECONDS = 5

    static perInterval(level: int): int {
        return Math.floor(100 * Math.pow(Math.max(0, level), 1.1))
    }

    /**
     * 登录时结算离线期间完整的五秒批次，结果**暂存**待领，并从当前时刻重新开始计时。
     *
     * ⛔ 与旧实现的关键差别：不再 `user.copper += copper`。登录即到账就没有「客户端请求才发放」
     * 的语义了，所以这里只累加 `offlineCopperPending` / `offlineCopperSecondsPending`。
     * 累加而非覆盖：上一次登录没领走的那笔，不能因为再登录一次就消失。
     * 第一次登录没有历史结算点，不产生离线收益。
     */
    static parkOffline(user: User, now: int): { offlineSeconds: int; copper: int } {
        const previous = user.lastCopperIncomeTime
        user.lastCopperIncomeTime = now
        if (previous <= 0 || now <= previous) {
            return { offlineSeconds: 0, copper: 0 }
        }

        const offlineSeconds = now - previous
        const copper = this.copperForIntervals(user.lv, Math.floor(offlineSeconds / this.INTERVAL_SECONDS))
        user.offlineCopperPending += copper
        user.offlineCopperSecondsPending += offlineSeconds
        return { offlineSeconds, copper }
    }

    /** 待领取的离线收益（只读；弹窗数据源）。⛔ 不改动任何字段。 */
    static pendingOffline(user: User): { offlineSeconds: int; copper: int } {
        return { offlineSeconds: user.offlineCopperSecondsPending, copper: user.offlineCopperPending }
    }

    /**
     * 领取离线收益：唯一把暂存记进 `copper` 的入口。
     *
     * 先清零再入账，重复调用第二次数额为 0（「重放返回首次结果」由调用侧的 clientReqId 闸承担）。
     */
    static claimOffline(user: User): { offlineSeconds: int; copper: int } {
        const offlineSeconds = user.offlineCopperSecondsPending
        const copper = user.offlineCopperPending
        user.offlineCopperPending = 0
        user.offlineCopperSecondsPending = 0
        if (copper > 0) {
            user.copper += copper
        }
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
