/** JSON contracts shared by quality selection and the later SC3 asset plan/pool. No engine imports. */
export type QualityTier = "low" | "medium" | "high";
export type ShadowQuality = "off" | "main" | "all";
export const QUALITY_TIERS: readonly QualityTier[] = Object.freeze(["low", "medium", "high"]);
export interface QualityPolicy {
    readonly details: boolean;
    readonly shadows: ShadowQuality;
    readonly maxEffects: number;
    readonly maxUnits: number;
    readonly maxUnitsWithoutInstancing: number;
    readonly textureStepDown: number;
    readonly minTextureSize: number;
}
export interface QualityTable { readonly version: 1; readonly tiers: Readonly<Record<QualityTier, QualityPolicy>>; }
export interface AssetAddress { readonly bundle: string; readonly path: string; }
export interface PoolEntry {
    readonly id: string;
    readonly prefab: AssetAddress;
    readonly capacity: Readonly<Record<QualityTier, number>>;
}
export interface PoolTable {
    readonly version: 1;
    readonly maxActivationsPerFrame: Readonly<Record<QualityTier, number>>;
    readonly entries: readonly PoolEntry[];
}
export interface TextureVariant { readonly quality: QualityTier; readonly lod: 0 | 1 | 2; readonly asset: AssetAddress; }
export interface DetailLayer {
    readonly id: "base" | "details";
    readonly prefabs: readonly AssetAddress[];
    readonly pools: readonly string[];
    /** Explicit quality × mesh LOD addresses; lowering texture quality never changes mesh LOD. */
    readonly textures: readonly { readonly id: string; readonly variants: readonly TextureVariant[] }[];
}
export interface DetailLayersTable { readonly version: 1; readonly layers: readonly DetailLayer[]; }

function fail(path: string, expectation: string): never { throw new Error(`${path}: ${expectation}`); }
function record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
    return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key}`, "unknown field");
    for (const key of allowed) if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`${path}.${key}`, "missing field");
}
function list(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) fail(path, "expected array"); return value; }
function integer(value: unknown, path: string, minimum = 0): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) fail(path, `expected integer >= ${minimum}`);
    return value;
}
function boolean(value: unknown, path: string): boolean { if (typeof value !== "boolean") fail(path, "expected boolean"); return value; }
function id(value: unknown, path: string): string {
    if (typeof value !== "string" || !/^[a-z][A-Za-z0-9]*$/.test(value)) fail(path, "expected identifier");
    return value;
}
function choice<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
    if (typeof value !== "string" || !allowed.includes(value as T)) fail(path, `expected ${allowed.join(" / ")}`);
    return value as T;
}
function version(value: Record<string, unknown>, path: string): void { if (value.version !== 1) fail(`${path}.version`, "expected 1"); }
function address(value: unknown, path: string): AssetAddress {
    const data = record(value, path); keys(data, ["bundle", "path"], path);
    if (typeof data.bundle !== "string" || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(data.bundle)) fail(`${path}.bundle`, "expected bundle name");
    if (typeof data.path !== "string" || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(data.path)) {
        fail(`${path}.path`, "expected relative extensionless asset path");
    }
    return Object.freeze({ bundle: data.bundle, path: data.path });
}
function tierNumbers(value: unknown, path: string, minimum = 0): Readonly<Record<QualityTier, number>> {
    const data = record(value, path); keys(data, QUALITY_TIERS, path);
    return Object.freeze({ low: integer(data.low, `${path}.low`, minimum), medium: integer(data.medium, `${path}.medium`, minimum),
        high: integer(data.high, `${path}.high`, minimum) });
}
function unique(value: string, seen: Set<string>, path: string): void {
    if (seen.has(value)) fail(path, `duplicate ${value}`); seen.add(value);
}

export function parseQualityTable(value: unknown): QualityTable {
    const data = record(value, "quality"); keys(data, ["version", "tiers"], "quality"); version(data, "quality");
    const tiers = record(data.tiers, "quality.tiers"); keys(tiers, QUALITY_TIERS, "quality.tiers");
    const parse = (tier: QualityTier): QualityPolicy => {
        const path = `quality.tiers.${tier}`, row = record(tiers[tier], path);
        keys(row, ["details", "shadows", "maxEffects", "maxUnits", "maxUnitsWithoutInstancing", "textureStepDown", "minTextureSize"], path);
        const policy = {
            details: boolean(row.details, `${path}.details`),
            shadows: choice(row.shadows, ["off", "main", "all"] as const, `${path}.shadows`),
            maxEffects: integer(row.maxEffects, `${path}.maxEffects`), maxUnits: integer(row.maxUnits, `${path}.maxUnits`),
            maxUnitsWithoutInstancing: integer(row.maxUnitsWithoutInstancing, `${path}.maxUnitsWithoutInstancing`),
            textureStepDown: integer(row.textureStepDown, `${path}.textureStepDown`),
            minTextureSize: integer(row.minTextureSize, `${path}.minTextureSize`, 1),
        };
        if (policy.maxUnitsWithoutInstancing > policy.maxUnits) fail(path, "fallback cannot raise unit budget");
        if (![256, 512, 1024, 2048].includes(policy.minTextureSize)) fail(`${path}.minTextureSize`, "expected supported POT size");
        if (policy.textureStepDown > 3) fail(`${path}.textureStepDown`, "at most three texture steps");
        return Object.freeze(policy);
    };
    return Object.freeze({ version: 1, tiers: Object.freeze({ low: parse("low"), medium: parse("medium"), high: parse("high") }) });
}

export function parsePoolTable(value: unknown): PoolTable {
    const data = record(value, "pool"); keys(data, ["version", "maxActivationsPerFrame", "entries"], "pool"); version(data, "pool");
    const seen = new Set<string>();
    const entries = list(data.entries, "pool.entries").map((entry, i) => {
        const path = `pool.entries[${i}]`, row = record(entry, path); keys(row, ["id", "prefab", "capacity"], path);
        const name = id(row.id, `${path}.id`); unique(name, seen, path);
        return Object.freeze({ id: name, prefab: address(row.prefab, `${path}.prefab`), capacity: tierNumbers(row.capacity, `${path}.capacity`) });
    });
    return Object.freeze({ version: 1, maxActivationsPerFrame: tierNumbers(data.maxActivationsPerFrame, "pool.maxActivationsPerFrame", 1),
        entries: Object.freeze(entries) });
}

export function parseDetailLayersTable(value: unknown, pool: PoolTable): DetailLayersTable {
    const data = record(value, "detail-layers"); keys(data, ["version", "layers"], "detail-layers"); version(data, "detail-layers");
    const seen = new Set<string>(), usedPools = new Set<string>(), textures = new Set<string>();
    const layers = list(data.layers, "detail-layers.layers").map((entry, i): DetailLayer => {
        const path = `detail-layers.layers[${i}]`, row = record(entry, path);
        keys(row, ["id", "prefabs", "pools", "textures"], path);
        const name = choice(row.id, ["base", "details"] as const, `${path}.id`); unique(name, seen, path);
        return Object.freeze({
            id: name,
            prefabs: Object.freeze(list(row.prefabs, `${path}.prefabs`).map((v, j) => address(v, `${path}.prefabs[${j}]`))),
            pools: Object.freeze(list(row.pools, `${path}.pools`).map((v) => {
                const name = id(v, `${path}.pools`); unique(name, usedPools, `${path}.pools`);
                if (!pool.entries.some((entry) => entry.id === name)) fail(`${path}.pools`, `unknown pool ${name}`);
                return name;
            })),
            textures: Object.freeze(list(row.textures, `${path}.textures`).map((v, j) => {
                const texturePath = `${path}.textures[${j}]`, texture = record(v, texturePath);
                keys(texture, ["id", "variants"], texturePath);
                const name = id(texture.id, `${texturePath}.id`); unique(name, textures, texturePath);
                const cells = new Set<string>();
                const variants = list(texture.variants, `${texturePath}.variants`).map((v, k): TextureVariant => {
                    const cellPath = `${texturePath}.variants[${k}]`, cell = record(v, cellPath);
                    keys(cell, ["quality", "lod", "asset"], cellPath);
                    const quality = choice(cell.quality, QUALITY_TIERS, `${cellPath}.quality`), lod = integer(cell.lod, `${cellPath}.lod`);
                    if (lod > 2) fail(`${cellPath}.lod`, "expected 0 / 1 / 2");
                    unique(`${quality}:${lod}`, cells, cellPath);
                    return Object.freeze({ quality, lod: lod as 0 | 1 | 2, asset: address(cell.asset, `${cellPath}.asset`) });
                });
                if (cells.size !== 9) fail(texturePath, "expected every quality × LOD variant (3 × 3)");
                return Object.freeze({ id: name, variants: Object.freeze(variants) });
            })),
        });
    });
    if (!seen.has("base")) fail("detail-layers.layers", "base layer required");
    for (const entry of pool.entries) if (!usedPools.has(entry.id)) fail("detail-layers.layers", `pool ${entry.id} has no layer`);
    return Object.freeze({ version: 1, layers: Object.freeze(layers) });
}
