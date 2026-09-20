import {
    PUBLIC_SNAKE_SKIN_CATALOG,
    PUBLIC_SNAKE_SKIN_CATALOG_HASH,
    type PublicSnakeSkinCatalogEntry,
} from '../../../../generated/lobby-contract/gameplays/snake/cosmetics'
import type { ISnakeCosmeticCatalogEntry } from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/snakeCosmetic'
import {
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
    SNAKE_SKIN_BUSINESS_CATALOG_ENTRIES,
    SERVER_SNAKE_SKIN_BUSINESS_HASH,
} from './SnakeSkinBusinessCatalogEntries'

/**
 * 衣柜的**服务端**业务目录：裁决用的稀有度、获取方式与碎片门槛。
 *
 * 双端公开身份层（哪些皮肤可用、默认皮肤是谁）只认 shared 的公开目录，
 * 本文件不再复制一份；两者在模块加载期逐项对齐，漂移即 fail-closed。
 */

/** 原作 6 档制：`0 普通 / 1 稀有 / 2 史诗 / 3 传说 / 4 典藏 / 5 至臻`。 */
export type SnakeSkinRarity = 0 | 1 | 2 | 3 | 4 | 5
/** demo 自设的获取方式；`fragmentCraft` 之外的皮肤没有碎片门槛。 */
export type SnakeSkinAcquisition = 'default' | 'levelUnlock' | 'achievementUnlock' | 'fragmentCraft' | 'locked'

const ACQUISITIONS: readonly string[] = ['default', 'levelUnlock', 'achievementUnlock', 'fragmentCraft', 'locked']
const BUSINESS_KEYS = [
    'acquisition',
    'aiEligible',
    'displayName',
    'fragmentItemId',
    'fragmentThreshold',
    'ownershipItemId',
    'price',
    'rarity',
    'saleState',
    'skinId',
]
const DECISION_KEYS = ['state', 'value']
/** 冻结的 AI 随机池；玩法侧未迁移，但表是同一份冻结数据，漂移必须立刻暴露。 */
const EXPECTED_AI_POOL = [101, 111, 112, 132, 133, 139, 401, 403, 411, 701]

export interface SnakeSkinBusinessEntry {
    readonly skinId: number
    readonly aiEligible: boolean
    readonly displayName: Readonly<{ state: 'technical-draft' | 'approved'; value: string }>
    readonly rarity: Readonly<{ state: 'approved'; value: SnakeSkinRarity }>
    readonly acquisition: Readonly<{ state: 'approved'; value: SnakeSkinAcquisition }>
    /** 仅 `fragmentCraft` 皮肤有门槛；其余为 `unavailable`。 */
    readonly fragmentThreshold:
        Readonly<{ state: 'approved'; value: number }> | Readonly<{ state: 'draft' | 'unavailable'; value: null }>
}

function fail(message: string): never {
    throw new Error(`[snake-skin-business] ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value).sort()
    return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

function isApproved(decision: unknown): decision is { state: 'approved'; value: unknown } {
    return (
        isRecord(decision) &&
        hasExactKeys(decision, DECISION_KEYS) &&
        decision.state === 'approved' &&
        decision.value !== null
    )
}

/** fail-closed 校验：长度、顺序、ID 集合、门槛与获取方式必须与 shared 公开目录一致。 */
export function validateSnakeSkinBusinessCatalog(
    value: unknown,
    embeddedPublicHash: string,
    publicCatalog: readonly PublicSnakeSkinCatalogEntry[],
): readonly SnakeSkinBusinessEntry[] {
    if (embeddedPublicHash !== PUBLIC_SNAKE_SKIN_CATALOG_HASH) {
        fail('embedded public catalog hash does not match shared; regenerate the frozen business table')
    }
    if (!Array.isArray(value) || value.length !== publicCatalog.length)
        fail('business and public catalog lengths differ')
    const publicIds = new Set(publicCatalog.map((entry) => entry.skinId))
    const seen = new Set<number>()
    const entries: SnakeSkinBusinessEntry[] = []
    for (let index = 0; index < value.length; index += 1) {
        const raw: unknown = value[index]
        if (!isRecord(raw) || !hasExactKeys(raw, BUSINESS_KEYS)) fail('business entry has unexpected or missing fields')
        const entry = raw as unknown as SnakeSkinBusinessEntry
        if (!publicIds.has(entry.skinId) || seen.has(entry.skinId)) fail(`unknown or duplicate skinId ${entry.skinId}`)
        if (entry.skinId !== publicCatalog[index]!.skinId) fail(`skin ${entry.skinId} is out of public catalog order`)
        if (
            !isRecord(entry.displayName) ||
            !hasExactKeys(entry.displayName as unknown as Record<string, unknown>, DECISION_KEYS) ||
            (entry.displayName.state !== 'technical-draft' && entry.displayName.state !== 'approved') ||
            typeof entry.displayName.value !== 'string' ||
            entry.displayName.value.length === 0
        ) {
            fail(`skin ${entry.skinId} must carry a non-empty technical-draft or approved display name`)
        }
        if (
            !isApproved(entry.rarity) ||
            !Number.isSafeInteger(entry.rarity.value) ||
            entry.rarity.value < 0 ||
            entry.rarity.value > 5
        ) {
            fail(`skin ${entry.skinId}.rarity must be an approved 0..5 tier`)
        }
        if (!isApproved(entry.acquisition) || !ACQUISITIONS.includes(entry.acquisition.value as string)) {
            fail(`skin ${entry.skinId}.acquisition must be one of ${ACQUISITIONS.join('/')}`)
        }
        if (
            !isRecord(entry.fragmentThreshold) ||
            !hasExactKeys(entry.fragmentThreshold as unknown as Record<string, unknown>, DECISION_KEYS)
        ) {
            fail(`skin ${entry.skinId}.fragmentThreshold has unexpected keys`)
        }
        const craftable = entry.acquisition.value === 'fragmentCraft'
        if (craftable) {
            if (
                !isApproved(entry.fragmentThreshold) ||
                !Number.isSafeInteger(entry.fragmentThreshold.value) ||
                (entry.fragmentThreshold.value as number) <= 0
            ) {
                fail(`skin ${entry.skinId} is fragmentCraft and needs an approved positive threshold`)
            }
        } else if (entry.fragmentThreshold.state !== 'unavailable' || entry.fragmentThreshold.value !== null) {
            fail(`skin ${entry.skinId} is not fragmentCraft and must leave fragmentThreshold unavailable`)
        }
        if (typeof entry.aiEligible !== 'boolean') fail(`skin ${entry.skinId}.aiEligible must be boolean`)
        seen.add(entry.skinId)
        entries.push(entry)
    }
    const aiPool = entries.filter((entry) => entry.aiEligible).map((entry) => entry.skinId)
    if (JSON.stringify(aiPool) !== JSON.stringify(EXPECTED_AI_POOL)) fail('AI pool differs from the frozen 10-ID set')
    return entries
}

export const SNAKE_SKIN_BUSINESS_CATALOG: readonly SnakeSkinBusinessEntry[] = validateSnakeSkinBusinessCatalog(
    SNAKE_SKIN_BUSINESS_CATALOG_ENTRIES,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
    PUBLIC_SNAKE_SKIN_CATALOG,
)

export { SERVER_SNAKE_SKIN_BUSINESS_HASH }

const BUSINESS_BY_ID = new Map(SNAKE_SKIN_BUSINESS_CATALOG.map((entry) => [entry.skinId, entry]))

export function getSnakeSkinBusinessEntry(skinId: number): SnakeSkinBusinessEntry | undefined {
    return BUSINESS_BY_ID.get(skinId)
}

/** 碎片合成皮肤及其门槛；由业务目录派生，改目录即自动改这里。 */
export const SNAKE_FRAGMENT_SKIN_THRESHOLDS: ReadonlyMap<number, number> = new Map(
    SNAKE_SKIN_BUSINESS_CATALOG.filter((entry) => entry.acquisition.value === 'fragmentCraft').map((entry) => [
        entry.skinId,
        entry.fragmentThreshold.value as number,
    ]),
)

/** 碎片皮肤 ID（升序）；profile 的 `fragmentBalances` 固定用这组键。 */
export const SNAKE_FRAGMENT_SKIN_IDS: readonly number[] = [...SNAKE_FRAGMENT_SKIN_THRESHOLDS.keys()].sort(
    (a, b) => a - b,
)

/**
 * 外观经济写的运行期总闸：关闭时整条写路径 fail-closed。
 * 只挡玩家发起的装备/解锁，不挡系统授予（系统授予不走本入口）。
 */
let writesEnabled = true

export function canWriteSnakeSkinCosmetics(): boolean {
    return writesEnabled
}

/** 测试 seam：切换写总闸，验证 `SNAKE_COSMETIC_WRITES_DISABLED` 分支。运行时不要调用。 */
export function __setSnakeCosmeticWritesEnabledForTest(value: boolean): void {
    writesEnabled = value
}

/**
 * 业务目录 → wire 展示目录。只下发展示字段；判定材料（拥有集、门槛裁决）仍全在服务端，
 * 客户端拿到门槛数值也无法据此少扣碎片。
 */
export const SNAKE_COSMETIC_WIRE_CATALOG: readonly ISnakeCosmeticCatalogEntry[] = SNAKE_SKIN_BUSINESS_CATALOG.map(
    (entry) => ({
        skinId: entry.skinId,
        displayName: entry.displayName.value,
        rarity: entry.rarity.value,
        acquisition: entry.acquisition.value,
        fragmentThreshold: entry.fragmentThreshold.state === 'approved' ? entry.fragmentThreshold.value : null,
    }),
)
