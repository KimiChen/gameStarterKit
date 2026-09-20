import { RedisInstance } from '@arthropoda/game-engine'
import {
    EFFECT_FIELD_VALUE_RULES,
    validateEffectFieldValue,
    type IGrant,
} from '../../../generated/lobby-contract/protocol/lobbyRpc'

/**
 * 原生 Lobby 的**发放落地**面（04 三阶段协议的阶段 2）。
 *
 * `IPurchaseResult.granted` 只是**副作用描述**：客户端据此渲染「你拿到了什么」。
 * 真正落地必须由服务端写进权威状态，否则就是「回了成功但什么都没发生」——本模块就是那个落地面。
 *
 * 与通用幂等闸的分工：闸只是 30/60 秒量级的 UX 快闸（其自身文档已声明「不是 exactly-once 真源」），
 * 结果窗口过后客户端重试仍会重跑 handler。因此这里按 `(uid, sId, opId, grantIndex)` 写**领域发放回执**，
 * 用 `HSETNX` 做「每一条 grant 只发一次」的原子闸；发放失败立刻撤掉回执，让重试能再试。
 *
 * 落地面：
 *  - `item` → 道具账本 `nativeLobby:grants:items:v1`，字段 `${sId}:${uid}:${itemId}` 累加数量；
 *  - `star` → 用户档 `nativeLobby:user:profile:v1` 的 `star` 累加（不得为负）；
 *  - `setField` → 用户档的同名字段，值域与字符串编码由 shared 的
 *    `validateEffectFieldValue` + `EFFECT_FIELD_VALUE_RULES` 决定（⛔ 不在服务端自造一份规则）；
 *  - `kit:<id>` → 原生 Lobby 尚无 kit 落地面：**扣款前就拒绝**，绝不先扣钱再静默丢弃发放。
 *
 * 用户档的读改写只在 `executeSerialized`（同一 sId+uid 串行）内发生；跨进程的并发归属见 P5。
 */
const ITEMS_KEY = 'nativeLobby:grants:items:v1'
const RECEIPTS_KEY = 'nativeLobby:grants:receipts:v1'
/** 与 `NativeLobbyUserStore` 同一个键：`star` / `setField` 必须落在真实档案上。 */
const PROFILE_KEY = 'nativeLobby:user:profile:v1'

/**
 * 原生 Lobby 用户档能承载的字段（`IUserView` + 三个私有项）。
 * ⛔ 不能直接用 `EFFECT_FIELD_ALLOWLIST`：它含 `drainProbe` 这类不在档里的探针字段，
 * 写进去会让 `user.getInfo` 的严格视图校验失败——那是把「发放成功」变成「档案读不出来」。
 */
const PROFILE_FIELDS = [
    'nickname',
    'avatarId',
    'province',
    'star',
    'maxRound',
    'wins',
    'losses',
    'stamina',
    'lastStaminaRecoverAt',
    'musicOn',
    'sfxOn',
    'guildId',
] as const

type ProfileField = (typeof PROFILE_FIELDS)[number]

/** 发放中的故障：调用方据此回 `GRANTING` 而不是把「没发出去」伪装成成功。 */
export function grantBusinessError(error: unknown): { code: string; msg: string } {
    const candidate = error as { code?: unknown; msg?: unknown } | null
    if (candidate && typeof candidate.code === 'string' && typeof candidate.msg === 'string')
        return candidate as {
            code: string
            msg: string
        }
    return { code: 'GRANTING', msg: '发放中，请稍后重试' }
}

/**
 * 扣款**之前**的可行性检查：不支持的 kind 必须在这里就被拒绝。
 * 「先扣钱、再把发不出去的 grant 丢掉」是比报错严重得多的缺陷。
 */
export function assertLandableGrants(grants: readonly IGrant[]): void {
    for (const grant of grants) {
        if (grant.kind === 'item' || grant.kind === 'star') continue
        if (grant.kind === 'setField') {
            if (!(PROFILE_FIELDS as readonly string[]).includes(grant.field)) throw unsupported(`字段 ${grant.field}`)
            continue
        }
        throw unsupported(`effect kind ${grant.kind}`)
    }
}

/** 按 opId 逐条幂等地发放；同一条 grant 重复调用是 no-op。 */
export async function applyGrants(uid: string, sId: number, opId: string, grants: readonly IGrant[]): Promise<void> {
    assertLandableGrants(grants)
    const redis = RedisInstance.getCenterRedis()
    for (let index = 0; index < grants.length; index += 1) {
        const field = `${sId}:${uid}:${opId}:${index}`
        // 原子闸：只有第一个到达者执行这一条发放。
        if (!(await redis.hSetNX(RECEIPTS_KEY, field, 'applying'))) continue
        try {
            await applyGrant(uid, sId, grants[index]!)
        } catch (error) {
            // 失败立刻撤掉回执：否则重试会看到「已发放」而永久吞掉这条奖励。
            await redis.hDel(RECEIPTS_KEY, field)
            throw error
        }
        await redis.hSet(RECEIPTS_KEY, field, 'done')
    }
}

/** 道具账本的只读面；供发放断言与后续查询路由复用。 */
export async function grantedItemCount(uid: string, sId: number, itemId: number): Promise<number> {
    return Number((await RedisInstance.getCenterRedis().hGet(ITEMS_KEY, `${sId}:${uid}:${itemId}`)) ?? 0)
}

async function applyGrant(uid: string, sId: number, grant: IGrant): Promise<void> {
    const redis = RedisInstance.getCenterRedis()
    if (grant.kind === 'item') {
        await redis.hIncrBy(ITEMS_KEY, `${sId}:${uid}:${grant.itemId}`, grant.count)
        return
    }
    if (grant.kind === 'star') {
        const profile = await readProfile(uid, sId)
        const star = Number(profile.star ?? 0) + grant.delta
        if (!Number.isSafeInteger(star) || star < 0) throw { code: 'INTERNAL', msg: '段位星数不能为负' }
        await writeProfile(uid, sId, { ...profile, star })
        return
    }
    // setField：值域与字符串编码一律走 shared 的规则，服务端不自造第二份。
    // ⛔ `assertLandableGrants` 的收窄不跨函数：这里必须自己再判一次 kind，
    // 否则 `kit:<id>` 会一路落到「按 setField 写档」上——那正是它要拒绝的情形。
    if (grant.kind !== 'setField') throw unsupported(`effect kind ${grant.kind}`)
    const value = validateEffectFieldValue(grant.field, grant.value)
    const rule = EFFECT_FIELD_VALUE_RULES[grant.field as ProfileField]
    const profile = await readProfile(uid, sId)
    await writeProfile(uid, sId, { ...profile, [grant.field]: decodeFieldValue(rule.kind, value) })
}

function decodeFieldValue(kind: 'text' | 'integer' | 'flag', value: string): string | number | boolean {
    if (kind === 'text') return value
    if (kind === 'flag') return value === '1'
    return Number(value)
}

async function readProfile(uid: string, sId: number): Promise<Record<string, unknown>> {
    const raw = await RedisInstance.getCenterRedis().hGet(PROFILE_KEY, `${sId}:${uid}`)
    if (!raw) throw { code: 'USER_DATA_LOST', msg: '角色档案不存在' }
    try {
        const value = JSON.parse(raw) as Record<string, unknown>
        if (!value || typeof value !== 'object') throw new Error('not an object')
        return value
    } catch {
        throw { code: 'USER_DATA_LOST', msg: '角色档案不可用' }
    }
}

async function writeProfile(uid: string, sId: number, profile: Record<string, unknown>): Promise<void> {
    const next = { ...profile, ver: Number(profile.ver ?? 0) + 1 }
    await RedisInstance.getCenterRedis().hSet(PROFILE_KEY, `${sId}:${uid}`, JSON.stringify(next))
}

function unsupported(target: string): { code: string; msg: string } {
    return { code: 'INTERNAL', msg: `原生 Lobby 尚无 ${target} 的落地面，已拒绝发放而不是静默丢弃` }
}
