import {
    DEFAULT_SNAKE_SKIN,
    PUBLIC_SNAKE_SKIN_CATALOG,
    PUBLIC_SNAKE_SKIN_CATALOG_HASH,
    resolveBattleSnakeSkin,
} from "@game/shared";
import {
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
    SERVER_SNAKE_SKIN_BUSINESS_HASH,
    SNAKE_SKIN_BUSINESS_CATALOG_DATA,
} from "./skinBusinessCatalog.generated";

export type SnakeSkinPendingDecision = Readonly<{
    state: "draft" | "unavailable";
    value: null;
}>;
/** 已拍板的业务值。⛔ `state: "approved"` 时 `value` 不得为 null——fail-closed 由 validator 强制。 */
export type SnakeSkinApprovedDecision<T> = Readonly<{ state: "approved"; value: T }>;

/**
 * 稀有度采用**原作 6 档制**：`0 普通 / 1 稀有 / 2 史诗 / 3 传说 / 4 典藏 / 5 至臻`
 * （旧字母名 `C/B/A/S/SS/SSS`）。demo 只用到 `0..3`，`4/5` 无对应皮肤属有意留空。
 */
export type SnakeSkinRarity = 0 | 1 | 2 | 3 | 4 | 5;
export const SNAKE_SKIN_RARITY_NAMES: readonly string[] = ["普通", "稀有", "史诗", "传说", "典藏", "至臻"];
export const SNAKE_SKIN_RARITY_OLD_NAMES: readonly string[] = ["C", "B", "A", "S", "SS", "SSS"];
/** demo 自设的获取方式（⛔ 不是原作 GetMethod/GetMethodV2——那两套由原作服务端下发）。 */
export type SnakeSkinAcquisition = "default" | "levelUnlock" | "achievementUnlock" | "fragmentCraft" | "locked";
const ACQUISITIONS: readonly string[] = ["default", "levelUnlock", "achievementUnlock", "fragmentCraft", "locked"];

export interface SnakeSkinBusinessEntry {
    readonly skinId: number;
    readonly aiEligible: boolean;
    /** 只有原作实测到名字的皮肤是 `approved`（1「小红」、701「招财喵」）；其余保留技术占位。 */
    readonly displayName: Readonly<{ state: "technical-draft" | "approved"; value: string }>;
    readonly rarity: SnakeSkinApprovedDecision<SnakeSkinRarity>;
    readonly ownershipItemId: SnakeSkinPendingDecision;
    readonly fragmentItemId: SnakeSkinPendingDecision;
    readonly acquisition: SnakeSkinApprovedDecision<SnakeSkinAcquisition>;
    /** 仅 `fragmentCraft` 皮肤有门槛；其余为 `unavailable`。demo 自设值，原作无本地门槛数据。 */
    readonly fragmentThreshold: SnakeSkinApprovedDecision<number> | SnakeSkinPendingDecision;
    readonly saleState: SnakeSkinApprovedDecision<"off-sale">;
    readonly price: SnakeSkinPendingDecision;
}

/**
 * 外观经济写（装备/解锁/购买）的运行期 fail-closed 总闸。
 *
 * **这是不变量 8 的锚点**（拍板 A，apps/plugins/snake/README.md §5.7）：此前描述的「双端 catalog hash 比对」
 * 在两侧都是死判据（hash 形参默认值等于本进程常量、生产调用点都不传该参），⛔ 不要再把不变量 8
 * 理解成那条比对。真正活着的判据是本开关 + 双端模块加载期的目录 fail-closed。
 *
 * S3-01 冻结业务目录时**有意未翻**（那时还没有写路径，翻了等于宣称一个不存在的能力）；
 * S3-02/03/04 的 store、RPC 端点与衣柜页面落地后于 S3 收尾翻开。
 */
export const SNAKE_SKIN_COSMETIC_WRITES_ENABLED = true;
export { SERVER_SNAKE_SKIN_BUSINESS_HASH };

function fail(message: string): never {
    throw new Error(`[snake-skin-business] ${message}`);
}

const BUSINESS_KEYS = ["acquisition", "aiEligible", "displayName", "fragmentItemId", "fragmentThreshold", "ownershipItemId", "price", "rarity", "saleState", "skinId"];
const DECISION_KEYS = ["state", "value"];
const EXPECTED_AI_POOL = [101, 111, 112, 132, 133, 139, 401, 403, 411, 701];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

/** approved 且 value 非 null——⛔ `{state:"approved", value:null}` 一律当作未拍板拒绝。 */
function isApproved(decision: unknown): decision is { state: "approved"; value: unknown } {
    return isRecord(decision) && hasExactKeys(decision, DECISION_KEYS)
        && decision.state === "approved" && decision.value !== null;
}

/** 可复用的 fail-closed validator；S3 更新业务值时仍从这里扩展，而非绕过公共 hash。 */
export function validateSnakeSkinBusinessCatalog(value: unknown, embeddedPublicHash: string): readonly SnakeSkinBusinessEntry[] {
    if (embeddedPublicHash !== PUBLIC_SNAKE_SKIN_CATALOG_HASH) {
        fail("embedded public catalog hash does not match @game/shared; regenerate all S1 layers");
    }
    if (!Array.isArray(value) || value.length !== PUBLIC_SNAKE_SKIN_CATALOG.length) {
        fail("business and public catalog lengths differ");
    }
    const publicIds = new Set(PUBLIC_SNAKE_SKIN_CATALOG.map((entry) => entry.skinId));
    const seen = new Set<number>();
    const entries: SnakeSkinBusinessEntry[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const raw: unknown = value[index];
        if (!isRecord(raw) || !hasExactKeys(raw, BUSINESS_KEYS)) fail("business entry has unexpected or missing fields");
        const entry = raw as unknown as SnakeSkinBusinessEntry;
        if (!publicIds.has(entry.skinId) || seen.has(entry.skinId)) fail(`unknown or duplicate skinId ${entry.skinId}`);
        if (entry.skinId !== PUBLIC_SNAKE_SKIN_CATALOG[index].skinId) fail(`skin ${entry.skinId} is out of public catalog order`);
        if (!isRecord(entry.displayName) || !hasExactKeys(entry.displayName as unknown as Record<string, unknown>, DECISION_KEYS)
            || (entry.displayName.state !== "technical-draft" && entry.displayName.state !== "approved")
            || typeof entry.displayName.value !== "string" || entry.displayName.value.length === 0) {
            fail(`skin ${entry.skinId} must carry a non-empty technical-draft or approved display name`);
        }
        // 仍未拍板的三项保持 fail-closed：⛔ 一旦被填值即拒（S3 只放开下面显式列出的字段）。
        for (const decision of [entry.ownershipItemId, entry.fragmentItemId, entry.price]) {
            if (!isRecord(decision) || !hasExactKeys(decision as unknown as Record<string, unknown>, DECISION_KEYS)
                || (decision.state !== "draft" && decision.state !== "unavailable") || decision.value !== null) {
                fail(`skin ${entry.skinId} contains an approved or sentinel business value for a field S3 did not open`);
            }
        }
        if (!isApproved(entry.rarity) || !Number.isSafeInteger(entry.rarity.value)
            || entry.rarity.value < 0 || entry.rarity.value > 5) {
            fail(`skin ${entry.skinId}.rarity must be an approved 0..5 tier (原作 6 档制)`);
        }
        if (!isApproved(entry.acquisition) || !ACQUISITIONS.includes(entry.acquisition.value as string)) {
            fail(`skin ${entry.skinId}.acquisition must be one of ${ACQUISITIONS.join("/")}`);
        }
        if (!isApproved(entry.saleState) || entry.saleState.value !== "off-sale") {
            fail(`skin ${entry.skinId}.saleState must stay approved off-sale in the demo`);
        }
        if (!isRecord(entry.fragmentThreshold) || !hasExactKeys(entry.fragmentThreshold as unknown as Record<string, unknown>, DECISION_KEYS)) {
            fail(`skin ${entry.skinId}.fragmentThreshold has unexpected keys`);
        }
        const craftable = entry.acquisition.value === "fragmentCraft";
        if (craftable) {
            if (!isApproved(entry.fragmentThreshold) || !Number.isSafeInteger(entry.fragmentThreshold.value)
                || (entry.fragmentThreshold.value as number) <= 0) {
                fail(`skin ${entry.skinId} is fragmentCraft and needs an approved positive threshold`);
            }
        } else if (entry.fragmentThreshold.state !== "unavailable" || entry.fragmentThreshold.value !== null) {
            fail(`skin ${entry.skinId} is not fragmentCraft and must leave fragmentThreshold unavailable`);
        }
        if (typeof entry.aiEligible !== "boolean") fail(`skin ${entry.skinId}.aiEligible must be boolean`);
        seen.add(entry.skinId);
        entries.push(entry);
    }
    const aiPool = entries.filter((entry) => entry.aiEligible).map((entry) => entry.skinId);
    if (JSON.stringify(aiPool) !== JSON.stringify(EXPECTED_AI_POOL)) fail("AI pool differs from the frozen 10-ID set");
    return entries;
}

export const SNAKE_SKIN_BUSINESS_CATALOG: readonly SnakeSkinBusinessEntry[] = validateSnakeSkinBusinessCatalog(
    SNAKE_SKIN_BUSINESS_CATALOG_DATA,
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
);
const BUSINESS_BY_ID = new Map(SNAKE_SKIN_BUSINESS_CATALOG.map((entry) => [entry.skinId, entry]));

/** AI 随机池只由服务端业务层提供，顺序固定，不能混入默认玩家皮肤。 */
export const SNAKE_AI_SKIN_POOL: readonly number[] = SNAKE_SKIN_BUSINESS_CATALOG
    .filter((entry) => entry.aiEligible)
    .map((entry) => entry.skinId);

export function getSnakeSkinBusinessEntry(skinId: number): SnakeSkinBusinessEntry | undefined {
    return BUSINESS_BY_ID.get(skinId);
}

/**
 * 碎片合成皮肤及其门槛，按 `skinId` 升序。⛔ 不要另处硬编码这四个 ID——它们由业务目录派生，
 * validator 已保证「`fragmentCraft` ⇔ 有正门槛」，改目录即自动改这里。
 */
export const SNAKE_FRAGMENT_SKIN_THRESHOLDS: ReadonlyMap<number, number> = new Map(
    SNAKE_SKIN_BUSINESS_CATALOG
        .filter((entry) => entry.acquisition.value === "fragmentCraft")
        .map((entry) => [entry.skinId, entry.fragmentThreshold.value as number]),
);
/** 四个碎片皮肤 ID（升序），profile 的 `fragmentBalances` 固定用这组键。 */
export const SNAKE_FRAGMENT_SKIN_IDS: readonly number[] = [...SNAKE_FRAGMENT_SKIN_THRESHOLDS.keys()].sort((a, b) => a - b);

export function assertSnakeSkinPublicHash(peerHash: string): void {
    if (peerHash !== PUBLIC_SNAKE_SKIN_CATALOG_HASH) fail("public catalog hash mismatch; cosmetic operation rejected");
}

/**
 * 外观经济写的运行期判据。
 *
 * `peerHash` **可选**（哨兵形态）：拍板 A 下服务端单方面权威，没有对端目录可比时
 * 「无 peer」⛔ 不构成拒绝理由；只有显式传入且不一致才拒。⚠ 不要把它改回必选参数——
 * 那会让生产调用点被迫编造一个等于本进程常量的实参，判据重新退化成恒真。
 */
export function canWriteSnakeSkinCosmetics(peerHash: string | null = null): boolean {
    if (!SNAKE_SKIN_COSMETIC_WRITES_ENABLED) return false;
    return peerHash === null || peerHash === PUBLIC_SNAKE_SKIN_CATALOG_HASH;
}

export interface ServerBattleSkinResolution {
    readonly requestedSkinId: number;
    readonly resolvedSkinId: number;
    readonly usedFallback: boolean;
    readonly reason: "ok" | "unknown-or-unavailable" | "catalog-hash-mismatch";
}

/** 对战读路径保持可玩：目录漂移或坏 ID 均只渲染默认皮肤 1，不授予任何权益。 */
export function resolveServerBattleSkin(skinId: number, peerHash = PUBLIC_SNAKE_SKIN_CATALOG_HASH): ServerBattleSkinResolution {
    if (peerHash !== PUBLIC_SNAKE_SKIN_CATALOG_HASH) {
        return { requestedSkinId: skinId, resolvedSkinId: DEFAULT_SNAKE_SKIN.skinId, usedFallback: true, reason: "catalog-hash-mismatch" };
    }
    const resolved = resolveBattleSnakeSkin(skinId);
    return {
        requestedSkinId: skinId,
        resolvedSkinId: resolved.skinId,
        usedFallback: resolved.skinId !== skinId,
        reason: resolved.skinId === skinId ? "ok" : "unknown-or-unavailable",
    };
}
