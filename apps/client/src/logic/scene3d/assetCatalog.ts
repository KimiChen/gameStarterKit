import { parseAssetAddress, parseDetailLayersTable, parsePoolTable, parseQualityTable, QUALITY_TIERS } from "./qualityData";
import type { AssetAddress, DetailLayer, DetailLayersTable, PoolTable, QualityTable, QualityTier, TextureVariant } from "./qualityData";

export type AssetPlanLod = TextureVariant["lod"];
export type PlannedAssetKind = "prefab" | "texture";
export interface PrefabLodVariants {
    readonly prefab: AssetAddress;
    /** Explicit addresses for LOD 0/1/2; repeat the far address for a two-level model. */
    readonly lods: readonly [AssetAddress, AssetAddress, AssetAddress];
}
export interface AssetCatalogData {
    readonly quality: QualityTable;
    readonly pool: PoolTable;
    readonly layers: DetailLayersTable;
    /** Omit a prefab to keep its registered address at all LODs. No filename inference. */
    readonly prefabLods?: readonly PrefabLodVariants[];
}

export interface CatalogAsset {
    readonly layer: DetailLayer["id"];
    readonly kind: PlannedAssetKind;
    readonly select: (quality: QualityTier, lod: AssetPlanLod) => AssetAddress | undefined;
}
export const addressKey = (asset: AssetAddress): string => `${asset.bundle}:${asset.path}`;
export function validateAssetLod(lod: AssetPlanLod): void {
    if (lod !== 0 && lod !== 1 && lod !== 2) throw new RangeError("AssetPlan: invalid LOD");
}
export function validateAssetQuality(quality: QualityTier): void {
    if (!QUALITY_TIERS.includes(quality)) throw new RangeError("AssetPlan: invalid quality tier");
}
/** Shared immutable selection policy: asset acquisition and entity activation cannot diverge. */
export class AssetCatalog {
    readonly quality: QualityTable;
    readonly pool: PoolTable;
    private readonly prefabs = new Map<string, CatalogAsset>();
    private readonly pools = new Map<string, CatalogAsset>();
    private readonly textures = new Map<string, CatalogAsset>();
    constructor(catalog: AssetCatalogData) {
        this.quality = parseQualityTable(catalog.quality);
        const pool = this.pool = parsePoolTable(catalog.pool);
        const layers = parseDetailLayersTable(catalog.layers, pool);
        const variants = new Map<string, readonly AssetAddress[]>();
        const hidden = new Map((layers.hideAtLod ?? []).map((row) => [addressKey(row.prefab), row.lod] as const));
        const registered = new Set(pool.entries.map((p) => addressKey(p.prefab)));
        for (const layer of layers.layers) for (const asset of layer.prefabs) registered.add(addressKey(asset));
        for (const row of catalog.prefabLods ?? []) {
            const key = addressKey(parseAssetAddress(row.prefab));
            if (!registered.has(key)) throw new Error(`AssetPlan: unknown prefab variant source ${key}`);
            if (variants.has(key)) throw new Error(`AssetPlan: duplicate prefab variants ${key}`);
            if (!Array.isArray(row.lods) || row.lods.length !== 3) throw new Error(`AssetPlan: expected all three prefab LOD addresses for ${key}`);
            variants.set(key, Array.from(row.lods, (asset) => parseAssetAddress(asset)));
        }
        const prefabs = this.prefabs, pools = this.pools, textures = this.textures;
        const prefabAsset = (layer: DetailLayer["id"], asset: AssetAddress): CatalogAsset => {
            const variant = variants.get(addressKey(asset)), hideAtLod = hidden.get(addressKey(asset));
            return { layer, kind: "prefab", select: (_quality, lod) => hideAtLod !== undefined && lod >= hideAtLod
                ? undefined : variant ? variant[lod] : asset };
        };
        for (const layer of layers.layers) {
            for (const asset of layer.prefabs) {
                const key = addressKey(asset), previous = prefabs.get(key);
                if (previous && previous.layer !== layer.id) throw new Error(`AssetPlan: prefab ${key} belongs to multiple layers`);
                prefabs.set(key, prefabAsset(layer.id, asset));
            }
            for (const id of layer.pools) pools.set(id, prefabAsset(layer.id, pool.entries.find((p) => p.id === id)!.prefab));
            for (const texture of layer.textures) {
                // The parser requires all nine cells. Missing variants never silently use a high-quality asset.
                textures.set(texture.id, { layer: layer.id, kind: "texture",
                    select: (quality, lod) => texture.variants.find((v) => v.quality === quality && v.lod === lod)!.asset });
            }
        }
    }
    prefab(asset: AssetAddress): CatalogAsset { return this.required(this.prefabs, addressKey(parseAssetAddress(asset)), "prefab"); }
    poolAsset(id: string): CatalogAsset { return this.required(this.pools, id, "pool"); }
    texture(id: string): CatalogAsset { return this.required(this.textures, id, "texture"); }
    select(entry: CatalogAsset, quality: QualityTier, lod: AssetPlanLod): AssetAddress | undefined {
        if (entry.layer === "details" && !this.quality.tiers[quality].details) return undefined;
        return entry.select(quality, lod);
    }
    private required(entries: ReadonlyMap<string, CatalogAsset>, key: string, label: string): CatalogAsset {
        const value = entries.get(key);
        if (!value) throw new Error(`AssetPlan: unknown ${label} ${key}`);
        return value;
    }
}
