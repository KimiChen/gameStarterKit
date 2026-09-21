import { executeObjectAction, RedisInstance, timestamp } from '@arthropoda/game-engine'
import type {
    IIncomeClaimOfflineRes,
    IIncomeGetPendingRes,
    IIncomeSettleOnlineRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/income'
import type { IncomeAccount } from '../IncomeAccount'
import { IncomeLedger } from '../IncomeLedger'

/**
 * income 域的原生 Lobby 持久化面。
 *
 * 账户只落在 `nativeLobby:income:account:v1`：首次认证原子创建一份 1 级、0 铜币的
 * 新服务账户。⛔ 不读取旧通道 `User` Bean 或 `User_<internalUid>` 哈希。
 */
export class IncomeNativeLobbyStore {
    private static readonly accountsKey = 'nativeLobby:income:account:v1'

    async pending(internalUid: number, sId: number): Promise<IIncomeGetPendingRes> {
        const account = await this.require(internalUid, sId)
        const offline = IncomeLedger.pendingOffline(account)
        return {
            level: account.level,
            intervalSeconds: IncomeLedger.INTERVAL_SECONDS,
            perInterval: IncomeLedger.perInterval(account.level),
            offlineSeconds: offline.offlineSeconds,
            offlineCopper: offline.copper,
            copper: account.copper,
        }
    }

    async settleOnline(internalUid: number, sId: number): Promise<IIncomeSettleOnlineRes> {
        const account = await this.require(internalUid, sId)
        const copper = IncomeLedger.settleOnline(account, timestamp())
        await this.save(internalUid, sId, account)
        return { copper, balance: account.copper }
    }

    async claimOffline(internalUid: number, sId: number): Promise<IIncomeClaimOfflineRes> {
        const account = await this.require(internalUid, sId)
        const claimed = IncomeLedger.claimOffline(account)
        await this.save(internalUid, sId, account)
        return { copper: claimed.copper, offlineSeconds: claimed.offlineSeconds, balance: account.copper }
    }

    /** 认证后创建账户；已有账户则把本次离线时段暂存，领取前不入账。 */
    async parkOffline(internalUid: number, externalUid: string, sId: number): Promise<void> {
        await executeObjectAction(
            'income/enter',
            {},
            {},
            {
                doAction: async () => {
                    const now = timestamp()
                    const account = await this.read(internalUid, sId)
                    if (!account) {
                        await this.create(internalUid, sId, now)
                        return
                    }
                    IncomeLedger.parkOffline(account, now)
                    await this.save(internalUid, sId, account)
                },
            },
            { uid: internalUid, externalUid, sId },
        )
    }

    private async require(internalUid: number, sId: number): Promise<IncomeAccount> {
        const account = await this.read(internalUid, sId)
        if (!account) throw new Error('income account was not initialized during authentication')
        return account
    }

    private async create(internalUid: number, sId: number, now: number): Promise<void> {
        const redis = RedisInstance.getCenterRedis()
        const field = accountField(internalUid, sId)
        const account = IncomeLedger.create(now)
        const created = await redis.hSetNX(IncomeNativeLobbyStore.accountsKey, field, JSON.stringify(account))
        if (created) return
    }

    private async read(internalUid: number, sId: number): Promise<IncomeAccount | null> {
        const raw = await RedisInstance.getCenterRedis().hGet(IncomeNativeLobbyStore.accountsKey, accountField(internalUid, sId))
        if (!raw) return null
        try {
            const value = JSON.parse(raw) as IncomeAccount
            return isAccount(value) ? value : null
        } catch {
            return null
        }
    }

    private async save(internalUid: number, sId: number, account: IncomeAccount): Promise<void> {
        await RedisInstance.getCenterRedis().hSet(
            IncomeNativeLobbyStore.accountsKey,
            accountField(internalUid, sId),
            JSON.stringify(account),
        )
    }
}

function accountField(internalUid: number, sId: number): string {
    return `${sId}:${internalUid}`
}

function isAccount(value: IncomeAccount): boolean {
    return Number.isSafeInteger(value?.level)
        && value.level >= 1
        && Number.isSafeInteger(value.copper)
        && value.copper >= 0
        && Number.isSafeInteger(value.lastIncomeAt)
        && value.lastIncomeAt >= 0
        && Number.isSafeInteger(value.offlineCopper)
        && value.offlineCopper >= 0
        && Number.isSafeInteger(value.offlineSeconds)
        && value.offlineSeconds >= 0
}
