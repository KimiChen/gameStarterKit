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

export interface SnakeSkinBusinessEntry {
    readonly skinId: number;
    readonly aiEligible: boolean;
    /** S1 仅是技术占位名；正式展示名归 S3 产品审查。 */
    readonly displayName: Readonly<{ state: "technical-draft"; value: string }>;
    readonly rarity: SnakeSkinPendingDecision;
    readonly ownershipItemId: SnakeSkinPendingDecision;
    readonly fragmentItemId: SnakeSkinPendingDecision;
    readonly acquisition: SnakeSkinPendingDecision;
    readonly saleState: SnakeSkinPendingDecision;
    readonly price: SnakeSkinPendingDecision;
}

/** S3 完成前，任何购买/解锁/装备写入均 fail-closed。 */
export const SNAKE_SKIN_COSMETIC_WRITES_ENABLED = false;
export { SERVER_SNAKE_SKIN_BUSINESS_HASH };

function fail(message: string): never {
    throw new Error(`[snake-skin-business] ${message}`);
}

const BUSINESS_KEYS = ["acquisition", "aiEligible", "displayName", "fragmentItemId", "ownershipItemId", "price", "rarity", "saleState", "skinId"];
const DECISION_KEYS = ["state", "value"];
const EXPECTED_AI_POOL = [101, 111, 112, 132, 133, 139, 401, 403, 411, 701];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
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
            || entry.displayName.state !== "technical-draft" || typeof entry.displayName.value !== "string" || entry.displayName.value.length === 0) {
            fail(`skin ${entry.skinId} must retain a non-empty technical-draft display name in S1`);
        }
        for (const decision of [entry.rarity, entry.ownershipItemId, entry.fragmentItemId, entry.acquisition, entry.saleState, entry.price]) {
            if (!isRecord(decision) || !hasExactKeys(decision as unknown as Record<string, unknown>, DECISION_KEYS)
                || (decision.state !== "draft" && decision.state !== "unavailable") || decision.value !== null) {
                fail(`skin ${entry.skinId} contains an approved or sentinel business value before S3`);
            }
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

export function assertSnakeSkinPublicHash(peerHash: string): void {
    if (peerHash !== PUBLIC_SNAKE_SKIN_CATALOG_HASH) fail("public catalog hash mismatch; cosmetic operation rejected");
}

export function canWriteSnakeSkinCosmetics(peerHash: string): boolean {
    return SNAKE_SKIN_COSMETIC_WRITES_ENABLED && peerHash === PUBLIC_SNAKE_SKIN_CATALOG_HASH;
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
