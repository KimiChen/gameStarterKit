import { AssetCatalog, addressKey, validateAssetLod, validateAssetQuality } from "./assetCatalog";
import type { AssetCatalogData, AssetPlanLod, CatalogAsset, PlannedAssetKind } from "./assetCatalog";
import type { AssetAddress, QualityTier } from "./qualityData";
export type { AssetPlanLod, PlannedAssetKind, PrefabLodVariants } from "./assetCatalog";

export const DEFAULT_ASSET_GRACE_MS = 5_000;
/** Chunk contents reference the existing tables; layer ownership is never duplicated here. */
export interface AssetPlanChunk {
    readonly key: number;
    readonly prefabs?: readonly AssetAddress[];
    readonly pools?: readonly string[];
    readonly textures?: readonly string[];
}
export interface AssetPlanCatalog extends AssetCatalogData {
    readonly chunks: readonly AssetPlanChunk[];
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

interface Hold { readonly request: PlannedAsset; leftAt?: number; }
const delta = (acquire: PlannedAsset[] = [], release: PlannedAsset[] = []): AssetPlanDelta =>
    Object.freeze({ acquire: Object.freeze(acquire), release: Object.freeze(release) });

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
    private readonly catalog: AssetCatalog;
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
        this.catalog = new AssetCatalog(catalog);
        for (const chunk of catalog.chunks) {
            if (!Number.isSafeInteger(chunk.key)) throw new RangeError("AssetPlan chunk key must be a safe integer");
            if (this.chunks.has(chunk.key)) throw new Error(`AssetPlan: duplicate chunk ${chunk.key}`);
            this.chunks.set(chunk.key, [
                ...(chunk.prefabs ?? []).map((a) => this.catalog.prefab(a)),
                ...(chunk.pools ?? []).map((id) => this.catalog.poolAsset(id)),
                ...(chunk.textures ?? []).map((id) => this.catalog.texture(id)),
            ]);
        }
    }

    update(quality: QualityTier, lod: AssetPlanLod, visibleChunks: Iterable<number>): AssetPlanDelta {
        if (this.closed) throw new Error("AssetPlan is closed");
        validateAssetQuality(quality); validateAssetLod(lod);
        const desired = new Map<string, { readonly kind: PlannedAssetKind; readonly asset: AssetAddress }>();
        // Resolve the entire input before touching state; an invalid viewport cannot lose existing holds.
        for (const key of new Set(visibleChunks)) {
            const entries = this.chunks.get(key);
            if (!entries) throw new Error(`AssetPlan: unknown visible chunk ${key}`);
            for (const entry of entries) {
                const asset = this.catalog.select(entry, quality, lod);
                if (!asset) continue;
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
