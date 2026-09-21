import type { IncomeAccount } from './IncomeAccount'

/** income 模块唯一的收益公式与结算规则。 */
export class IncomeLedger {
    static readonly INTERVAL_SECONDS = 5

    static create(now: number): IncomeAccount {
        return { level: 1, copper: 0, lastIncomeAt: now, offlineCopper: 0, offlineSeconds: 0 }
    }

    static perInterval(level: number): number {
        return Math.floor(100 * Math.pow(Math.max(0, level), 1.1))
    }

    static parkOffline(account: IncomeAccount, now: number): { offlineSeconds: number; copper: number } {
        const previous = account.lastIncomeAt
        account.lastIncomeAt = now
        if (previous <= 0 || now <= previous) return { offlineSeconds: 0, copper: 0 }

        const offlineSeconds = now - previous
        const copper = this.copperForIntervals(account.level, Math.floor(offlineSeconds / this.INTERVAL_SECONDS))
        account.offlineCopper += copper
        account.offlineSeconds += offlineSeconds
        return { offlineSeconds, copper }
    }

    static pendingOffline(account: IncomeAccount): { offlineSeconds: number; copper: number } {
        return { offlineSeconds: account.offlineSeconds, copper: account.offlineCopper }
    }

    static claimOffline(account: IncomeAccount): { offlineSeconds: number; copper: number } {
        const offlineSeconds = account.offlineSeconds
        const copper = account.offlineCopper
        account.offlineSeconds = 0
        account.offlineCopper = 0
        account.copper += copper
        return { offlineSeconds, copper }
    }

    static settleOnline(account: IncomeAccount, now: number): number {
        if (account.lastIncomeAt <= 0) {
            account.lastIncomeAt = now
            return 0
        }
        const intervals = Math.floor((now - account.lastIncomeAt) / this.INTERVAL_SECONDS)
        if (intervals <= 0) return 0
        account.lastIncomeAt += intervals * this.INTERVAL_SECONDS
        const copper = this.copperForIntervals(account.level, intervals)
        account.copper += copper
        return copper
    }

    private static copperForIntervals(level: number, intervals: number): number {
        if (intervals <= 0) return 0
        const copper = this.perInterval(level) * intervals
        if (!Number.isSafeInteger(copper)) throw new Error('铜币收益超出安全整数范围')
        return copper
    }
}
