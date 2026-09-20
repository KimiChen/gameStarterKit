import { RedisInstance, RedisLock } from '@arthropoda/game-engine'
import {
    DEFAULT_SNAKE_SKIN,
    isPlayerUsableSnakeSkin,
} from '../../../../generated/lobby-contract/gameplays/snake/cosmetics'
import type {
    ISnakeCosmeticProfile,
    ISnakeCosmeticProfileRes,
    ISnakeCosmeticSnapshotRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/snakeCosmetic'
import {
    SNAKE_COSMETIC_WIRE_CATALOG,
    SNAKE_FRAGMENT_SKIN_IDS,
    SNAKE_FRAGMENT_SKIN_THRESHOLDS,
    canWriteSnakeSkinCosmetics,
} from './SnakeSkinBusinessCatalog'

/** Redis 里的权威衣柜记录；`version` 不属于它（只做客户端刷新去重）。 */
interface StoredSnakeCosmeticProfile {
    equippedSkinId: number
    ownedSkinIds: number[]
    fragmentBalances: Record<string, number>
}

/**
 * snakeCosmetic 的权威读写面：装备与碎片合成解锁都在 uid 级锁内读改写，重复执行天然无害。
 *
 * 与 natural-write 契约一致：请求不带 `clientReqId`，不重复扣碎片、不重复装备；
 * 写路径先落 Redis 再返回，失败不会回报成功。
 */
export class SnakeCosmeticNativeLobbyStore {
    private static readonly profilesKey = 'nativeLobby:snakeCosmetic:profiles:v1'
    /** `version` 只用于客户端刷新去重，按契约不进 Redis、不做并发控制。 */
    private readonly versions = new Map<string, number>()

    async snapshot(uid: string, sId: number): Promise<ISnakeCosmeticSnapshotRes> {
        const profile = await this.read(uid, sId)
        return { profile: this.snapshotOf(uid, sId, profile), catalog: SNAKE_COSMETIC_WIRE_CATALOG }
    }

    async equip(uid: string, sId: number, skinId: number): Promise<ISnakeCosmeticProfileRes> {
        assertWritesEnabled()
        return this.withUserLock(sId, uid, async () => {
            if (!isPlayerUsableSnakeSkin(skinId)) throw fault('SNAKE_SKIN_UNKNOWN', '皮肤不存在或不可用')
            const current = await this.read(uid, sId)
            if (!current.ownedSkinIds.includes(skinId)) throw fault('SNAKE_SKIN_NOT_OWNED', '尚未拥有该皮肤')
            // 重复装备同一皮肤是 no-op：不涨 version、不写 Redis。
            if (current.equippedSkinId === skinId) return { profile: this.snapshotOf(uid, sId, current) }
            const next: StoredSnakeCosmeticProfile = { ...current, equippedSkinId: skinId }
            await this.write(uid, sId, next)
            return { profile: this.bump(uid, sId, next) }
        })
    }

    async unlock(uid: string, sId: number, skinId: number): Promise<ISnakeCosmeticProfileRes> {
        assertWritesEnabled()
        return this.withUserLock(sId, uid, async () => {
            if (!isPlayerUsableSnakeSkin(skinId)) throw fault('SNAKE_SKIN_UNKNOWN', '皮肤不存在或不可用')
            const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(skinId)
            if (threshold === undefined) throw fault('SNAKE_SKIN_NOT_CRAFTABLE', '该皮肤不支持碎片合成')
            const current = await this.read(uid, sId)
            // 已拥有直接回快照，不再扣碎片。
            if (current.ownedSkinIds.includes(skinId)) return { profile: this.snapshotOf(uid, sId, current) }
            const key = String(skinId)
            const balance = current.fragmentBalances[key] ?? 0
            if (balance < threshold)
                throw fault('SNAKE_SKIN_FRAGMENTS_INSUFFICIENT', `碎片不足：需要 ${threshold}，当前 ${balance}`)
            const next: StoredSnakeCosmeticProfile = {
                equippedSkinId: current.equippedSkinId,
                ownedSkinIds: [...current.ownedSkinIds, skinId].sort((a, b) => a - b),
                // 精确扣门槛并保留超额。
                fragmentBalances: { ...current.fragmentBalances, [key]: balance - threshold },
            }
            await this.write(uid, sId, next)
            return { profile: this.bump(uid, sId, next) }
        })
    }

    private async withUserLock<T>(sId: number, uid: string, run: () => Promise<T>): Promise<T> {
        const lock = RedisLock.create(`nativeLobby:snakeCosmetic:lock:v1:${sId}:${uid}`)
        if (!(await lock.waitLock(1_500))) throw fault('BUSY', '衣柜正在处理，请稍后重试')
        try {
            return await run()
        } finally {
            await lock.unLock()
        }
    }

    private snapshotOf(uid: string, sId: number, profile: StoredSnakeCosmeticProfile): ISnakeCosmeticProfile {
        return {
            version: this.versions.get(versionKey(sId, uid)) ?? 0,
            equippedSkinId: profile.equippedSkinId,
            ownedSkinIds: [...profile.ownedSkinIds].sort((a, b) => a - b),
            fragmentBalances: { ...profile.fragmentBalances },
        }
    }

    private bump(uid: string, sId: number, profile: StoredSnakeCosmeticProfile): ISnakeCosmeticProfile {
        const key = versionKey(sId, uid)
        this.versions.set(key, (this.versions.get(key) ?? 0) + 1)
        return this.snapshotOf(uid, sId, profile)
    }

    private async read(uid: string, sId: number): Promise<StoredSnakeCosmeticProfile> {
        const raw = await RedisInstance.getCenterRedis().hGet(
            SnakeCosmeticNativeLobbyStore.profilesKey,
            userField(uid, sId),
        )
        if (raw === null || raw === undefined) return defaultProfile()
        let parsed: unknown
        try {
            parsed = JSON.parse(raw)
        } catch {
            throw fault('USER_DATA_LOST', '衣柜数据不可用')
        }
        const profile = parseProfile(parsed)
        // 腐坏记录不静默回退默认档：写回默认档会抹掉玩家的皮肤与碎片。
        if (!profile) throw fault('USER_DATA_LOST', '衣柜数据不可用')
        return profile
    }

    private write(uid: string, sId: number, profile: StoredSnakeCosmeticProfile): Promise<unknown> {
        return RedisInstance.getCenterRedis().hSet(
            SnakeCosmeticNativeLobbyStore.profilesKey,
            userField(uid, sId),
            JSON.stringify({
                equippedSkinId: profile.equippedSkinId,
                ownedSkinIds: [...profile.ownedSkinIds].sort((a, b) => a - b),
                fragmentBalances: profile.fragmentBalances,
            }),
        )
    }
}

function fault(code: string, msg: string): { code: string; msg: string } {
    return { code, msg }
}

function assertWritesEnabled(): void {
    if (!canWriteSnakeSkinCosmetics()) throw fault('SNAKE_COSMETIC_WRITES_DISABLED', '衣柜暂时不可用')
}

function versionKey(sId: number, uid: string): string {
    return `${sId}:${uid}`
}

function userField(uid: string, sId: number): string {
    return `${sId}:${uid}`
}

function defaultProfile(): StoredSnakeCosmeticProfile {
    return {
        equippedSkinId: DEFAULT_SNAKE_SKIN.skinId,
        ownedSkinIds: [DEFAULT_SNAKE_SKIN.skinId],
        fragmentBalances: Object.fromEntries(SNAKE_FRAGMENT_SKIN_IDS.map((skinId) => [String(skinId), 0])),
    }
}

/** 严格解析：任何形态不符都返回 null，由调用方按 fail-closed 处理。 */
function parseProfile(value: unknown): StoredSnakeCosmeticProfile | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const owned = parseOwnedSkinIds(record.ownedSkinIds)
    if (!owned) return null
    const fragments = parseFragmentBalances(record.fragmentBalances)
    if (!fragments) return null
    const equipped = record.equippedSkinId
    if (!Number.isSafeInteger(equipped) || !isPlayerUsableSnakeSkin(equipped as number)) return null
    if (!owned.includes(equipped as number)) return null
    return { equippedSkinId: equipped as number, ownedSkinIds: owned, fragmentBalances: fragments }
}

function parseOwnedSkinIds(value: unknown): number[] | null {
    if (!Array.isArray(value)) return null
    const out: number[] = []
    for (const item of value) {
        if (!Number.isSafeInteger(item) || (item as number) <= 0) return null
        if (!isPlayerUsableSnakeSkin(item as number)) return null
        if (out.includes(item as number)) return null
        out.push(item as number)
    }
    if (!out.includes(DEFAULT_SNAKE_SKIN.skinId)) out.push(DEFAULT_SNAKE_SKIN.skinId)
    return out.sort((a, b) => a - b)
}

function parseFragmentBalances(value: unknown): Record<string, number> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const expected = SNAKE_FRAGMENT_SKIN_IDS.map(String)
    for (const key of Object.keys(record)) if (!expected.includes(key)) return null
    const out: Record<string, number> = {}
    for (const key of expected) {
        const balance = record[key] ?? 0
        if (!Number.isSafeInteger(balance) || (balance as number) < 0) return null
        out[key] = balance as number
    }
    return out
}
