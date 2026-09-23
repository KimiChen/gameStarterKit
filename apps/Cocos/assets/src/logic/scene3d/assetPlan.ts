import { parseAssetAddress, parseDetailLayersTable, parsePoolTable, parseQualityTable, QUALITY_TIERS } from "./qualityData";
import type { AssetAddress, DetailLayer, DetailLayersTable, PoolTable, QualityTable, QualityTier, TextureVariant } from "./qualityData";

export const DEFAULT_ASSET_GRACE_MS = 5_000;
export type AssetPlanLod = TextureVariant["lod"];
export type PlannedAssetKind = "prefab" | "texture";

/** Chunk contents reference the existing tables; layer ownership is never duplicated here. */
export interface AssetPlanChunk {
    readonly key: number;
    readonly prefabs?: readonly AssetAddress[];
    readonly pools?: readonly string[];
    readonly textures?: readonly string[];
}
export interface PrefabLodVariants {
    readonly prefab: AssetAddress;
    /** Explicit addresses for LOD 0/1/2; repeat the far address for a two-level model. */
    readonly lods: readonly [AssetAddress, AssetAddress, AssetAddress];
}
export interface AssetPlanCatalog {
    readonly quality: QualityTable;
    readonly pool: PoolTable;
    readonly layers: DetailLayersTable;
    readonly chunks: readonly AssetPlanChunk[];
    /** Omit a prefab to keep its registered address at all LODs. No filename inference. */
    readonly prefabLods?: readonly PrefabLodVariants[];
}
export interface AssetPlanOptions {
    /** Monotonic milliseconds, injected by the caller. No timers or host clock in Logic. */
    readonly now: () => number;
    readonly graceMs?: number;
}
export interface PlannedAsset extends AssetAddress {
    /** Identity includes kind: one imported file can expose multiple asset types. */
    readonly key: string;
    readonly kind: PlannedAssetKind;
    readonly generation: number;
}
export interface AssetPlanDelta {
    readonly acquire: readonly PlannedAsset[];
    readonly release: readonly PlannedAsset[];
}

interface CatalogAsset {
    readonly layer: DetailLayer["id"];
    readonly kind: PlannedAssetKind;
    readonly select: (quality: QualityTier, lod: AssetPlanLod) => AssetAddress;
}
interface Hold { readonly request: PlannedAsset; leftAt?: number; }
const addressKey = (asset: AssetAddress): string => `${asset.bundle}:${asset.path}`;
const delta = (acquire: PlannedAsset[] = [], release: PlannedAsset[] = []): AssetPlanDelta =>
    Object.freeze({ acquire: Object.freeze(acquire), release: Object.freeze(release) });
function required<T>(entries: ReadonlyMap<string, T>, key: string, label: string): T {
    const value = entries.get(key);
    if (!value) throw new Error(`AssetPlan: unknown ${label} ${key}`);
    return value;
}

/**
 * One plan per page lifetime, with a detached catalog snapshot. update() takes an
 * already stabilized LOD (lodForValueStable owns threshold hysteresis). It filters
 * layers BEFORE selecting variants and unions visible chunk assets by kind/address.
 *
 * A delta is an instruction, not proof of a loaded asset. The View maps kind to
 * engine constructors and keeps an AssetLease job/hold per PlannedAsset token.
 * On failure, reject(token) permits retry on the next update. On release, cancel
 * pending jobs and retire nodes/render references before returning loaded leases.
 * current(token) fences late completions; never use address alone after a retry.
 *
 * Call update() or flush() each frame to expire grace periods even with a still
 * camera. Reentry during update wins over an as-yet-unflushed deadline. close()
 * immediately drains all tokens, including in-flight/grace entries, and is final.
 */
export class AssetPlan {
    private readonly quality: QualityTable;
    private readonly chunks = new Map<number, readonly CatalogAsset[]>();
    private readonly holds = new Map<string, Hold>();
    private readonly now: () => number;
    private readonly graceMs: number;
    private lastTime = -Infinity;
    private generation = 0;
    private closed = false;

    constructor(catalog: AssetPlanCatalog, options: AssetPlanOptions) {
        this.now = options.now;
        this.graceMs = options.graceMs ?? DEFAULT_ASSET_GRACE_MS;
        if (typeof this.now !== "function") throw new TypeError("AssetPlan requires an injected clock");
        if (!Number.isFinite(this.graceMs) || this.graceMs < 0) throw new RangeError("AssetPlan graceMs must be finite and nonnegative");
        this.quality = parseQualityTable(catalog.quality);
        const pool = parsePoolTable(catalog.pool);
        const layers = parseDetailLayersTable(catalog.layers, pool);
        const variants = new Map<string, readonly AssetAddress[]>();
        const registered = new Set(pool.entries.map((p) => addressKey(p.prefab)));
        for (const layer of layers.layers) for (const asset of layer.prefabs) registered.add(addressKey(asset));
        for (const row of catalog.prefabLods ?? []) {
            const key = addressKey(parseAssetAddress(row.prefab));
            if (!registered.has(key)) throw new Error(`AssetPlan: unknown prefab variant source ${key}`);
            if (variants.has(key)) throw new Error(`AssetPlan: duplicate prefab variants ${key}`);
            if (!Array.isArray(row.lods) || row.lods.length !== 3) throw new Error(`AssetPlan: expected all three prefab LOD addresses for ${key}`);
            variants.set(key, Array.from(row.lods, (asset) => parseAssetAddress(asset)));
        }
        const prefabs = new Map<string, CatalogAsset>(), pools = new Map<string, CatalogAsset>(), textures = new Map<string, CatalogAsset>();
        const prefabAsset = (layer: DetailLayer["id"], asset: AssetAddress): CatalogAsset => {
            const lods = variants.get(addressKey(asset));
            return { layer, kind: "prefab", select: (_quality, lod) => lods ? lods[lod] : asset };
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
        for (const chunk of catalog.chunks) {
            if (!Number.isSafeInteger(chunk.key)) throw new RangeError("AssetPlan chunk key must be a safe integer");
            if (this.chunks.has(chunk.key)) throw new Error(`AssetPlan: duplicate chunk ${chunk.key}`);
            this.chunks.set(chunk.key, [
                ...(chunk.prefabs ?? []).map((a) => required(prefabs, addressKey(parseAssetAddress(a)), "prefab")),
                ...(chunk.pools ?? []).map((id) => required(pools, id, "pool")),
                ...(chunk.textures ?? []).map((id) => required(textures, id, "texture")),
            ]);
        }
    }

    update(quality: QualityTier, lod: AssetPlanLod, visibleChunks: Iterable<number>): AssetPlanDelta {
        if (this.closed) throw new Error("AssetPlan is closed");
        if (!QUALITY_TIERS.includes(quality)) throw new RangeError("AssetPlan: invalid quality tier");
        if (lod !== 0 && lod !== 1 && lod !== 2) throw new RangeError("AssetPlan: invalid LOD");
        const desired = new Map<string, { readonly kind: PlannedAssetKind; readonly asset: AssetAddress }>();
        // Resolve the entire input before touching state; an invalid viewport cannot lose existing holds.
        for (const key of new Set(visibleChunks)) {
            const entries = this.chunks.get(key);
            if (!entries) throw new Error(`AssetPlan: unknown visible chunk ${key}`);
            for (const entry of entries) {
                if (entry.layer === "details" && !this.quality.tiers[quality].details) continue;
                const asset = entry.select(quality, lod);
                desired.set(`${entry.kind}:${addressKey(asset)}`, { kind: entry.kind, asset });
            }
        }
        const now = this.readTime(), acquire: PlannedAsset[] = [];
        for (const key of [...desired.keys()].sort()) {
            const held = this.holds.get(key);
            if (held) { held.leftAt = undefined; continue; }
            const { kind, asset } = desired.get(key)!;
            const request = Object.freeze({ key, kind, bundle: asset.bundle, path: asset.path, generation: ++this.generation });
            this.holds.set(key, { request });
            acquire.push(request);
        }
        for (const [key, hold] of this.holds) {
            if (!desired.has(key) && hold.leftAt === undefined) hold.leftAt = now;
        }
        return delta(acquire, this.expire(now));
    }

    flush(): AssetPlanDelta { return this.closed ? delta() : delta([], this.expire(this.readTime())); }

    /** Hold validity, including grace; render eligibility still follows the current quality/LOD/viewport. */
    current(request: PlannedAsset): boolean { return this.holds.get(request.key)?.request === request; }

    /** Call only after the failed acquisition has returned its references (AssetLease does this). */
    reject(request: PlannedAsset): boolean {
        if (!this.current(request)) return false;
        this.holds.delete(request.key);
        return true;
    }

    close(): AssetPlanDelta {
        this.closed = true;
        const release = [...this.holds.values()].map((hold) => hold.request).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
        this.holds.clear();
        return delta([], release);
    }

    private readTime(): number {
        const now = this.now();
        if (!Number.isFinite(now) || now < this.lastTime) throw new RangeError("AssetPlan clock must return finite monotonic milliseconds");
        this.lastTime = now;
        return now;
    }

    private expire(now: number): PlannedAsset[] {
        const release: PlannedAsset[] = [];
        for (const [key, hold] of this.holds) {
            if (hold.leftAt !== undefined && now - hold.leftAt >= this.graceMs) {
                this.holds.delete(key);
                release.push(hold.request);
            }
        }
        return release.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    }
}
