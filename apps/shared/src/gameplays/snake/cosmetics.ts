import {
    PUBLIC_SNAKE_SKIN_CATALOG_DATA,
    PUBLIC_SNAKE_SKIN_CATALOG_HASH,
} from "./snakeSkinCatalogData";

export type SnakeSkinPublicationState = "active" | "retired";

/** 双端可见的公开身份层；价格、名称、素材路径均不属于该契约。 */
export interface PublicSnakeSkinCatalogEntry {
    readonly skinId: number;
    readonly contentVersion: number;
    readonly publicationState: SnakeSkinPublicationState;
    readonly isDefault: boolean;
    readonly sortOrder: number;
    readonly playerUsable: boolean;
    readonly technicalLabel: string;
}

const ENTRY_KEYS = [
    "contentVersion",
    "isDefault",
    "playerUsable",
    "publicationState",
    "skinId",
    "sortOrder",
    "technicalLabel",
] as const;

function fail(message: string): never {
    throw new Error(`[snake-skin-catalog] ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>): boolean {
    const keys = Object.keys(value).sort();
    return keys.length === ENTRY_KEYS.length && keys.every((key, index) => key === ENTRY_KEYS[index]);
}

/** fail-fast exact validator：多字段、缺字段、重复 ID 与非法默认项一律拒绝。 */
export function validatePublicSnakeSkinCatalog(value: unknown): readonly PublicSnakeSkinCatalogEntry[] {
    if (!Array.isArray(value) || value.length === 0) fail("catalog must be a non-empty array");
    const seen = new Set<number>();
    const entries: PublicSnakeSkinCatalogEntry[] = [];
    let defaultCount = 0;
    let previousSortOrder = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < value.length; index += 1) {
        const raw: unknown = value[index];
        if (!isRecord(raw) || !exactKeys(raw)) fail(`entry ${index} must contain exactly ${ENTRY_KEYS.join(", ")}`);
        if (!Number.isSafeInteger(raw.skinId) || Number(raw.skinId) <= 0) fail(`entry ${index}.skinId must be a positive safe integer`);
        if (!Number.isSafeInteger(raw.contentVersion) || Number(raw.contentVersion) <= 0) fail(`entry ${index}.contentVersion must be a positive safe integer`);
        if (!Number.isSafeInteger(raw.sortOrder)) fail(`entry ${index}.sortOrder must be a safe integer`);
        if (raw.publicationState !== "active" && raw.publicationState !== "retired") fail(`entry ${index}.publicationState is invalid`);
        if (typeof raw.isDefault !== "boolean" || typeof raw.playerUsable !== "boolean") fail(`entry ${index} boolean fields are invalid`);
        if (typeof raw.technicalLabel !== "string" || raw.technicalLabel.length === 0) fail(`entry ${index}.technicalLabel must be non-empty`);
        const skinId = Number(raw.skinId);
        if (Number(raw.sortOrder) < previousSortOrder) fail(`entry ${index}.sortOrder must be in stable ascending order`);
        previousSortOrder = Number(raw.sortOrder);
        if (seen.has(skinId)) fail(`duplicate skinId ${skinId}`);
        seen.add(skinId);
        if (raw.isDefault) {
            defaultCount += 1;
            if (raw.publicationState !== "active" || !raw.playerUsable) fail(`default skin ${skinId} must be active and player-usable`);
        }
        entries.push(raw as unknown as PublicSnakeSkinCatalogEntry);
    }
    if (defaultCount !== 1) fail(`expected exactly one default skin, found ${defaultCount}`);
    return entries;
}

export const PUBLIC_SNAKE_SKIN_CATALOG: readonly PublicSnakeSkinCatalogEntry[] =
    validatePublicSnakeSkinCatalog(PUBLIC_SNAKE_SKIN_CATALOG_DATA);
export { PUBLIC_SNAKE_SKIN_CATALOG_HASH };

const PUBLIC_SKINS_BY_ID = new Map(PUBLIC_SNAKE_SKIN_CATALOG.map((entry) => [entry.skinId, entry]));
export const DEFAULT_SNAKE_SKIN = PUBLIC_SNAKE_SKIN_CATALOG.find((entry) => entry.isDefault)!;

export function getPublicSnakeSkin(skinId: number): PublicSnakeSkinCatalogEntry | undefined {
    return PUBLIC_SKINS_BY_ID.get(skinId);
}

export function isPlayerUsableSnakeSkin(skinId: number): boolean {
    const entry = getPublicSnakeSkin(skinId);
    return entry?.publicationState === "active" && entry.playerUsable;
}

/** 对战安全降级：未知/下架/不可用 ID 统一落到唯一默认皮肤。 */
export function resolveBattleSnakeSkin(skinId: number): PublicSnakeSkinCatalogEntry {
    const entry = getPublicSnakeSkin(skinId);
    return entry?.publicationState === "active" && entry.playerUsable ? entry : DEFAULT_SNAKE_SKIN;
}
