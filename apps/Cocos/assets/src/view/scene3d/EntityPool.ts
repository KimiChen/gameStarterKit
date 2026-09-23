import { AssetCatalog, addressKey, validateAssetLod, validateAssetQuality } from "../../logic/scene3d/assetCatalog";
import type { AssetCatalogData, AssetPlanLod } from "../../logic/scene3d/assetCatalog";
import type { AssetAddress, PoolEntry } from "../../logic/scene3d/qualityData";
import type { Stage3DQuality } from "../../logic/scene3d/qualityTiers";

/** One retained prefab and shared material set. release follows retirement of ALL its nodes. */
export interface EntityTemplate<N> {
    create(): N;
    activate(node: N): void;
    deactivate(node: N): void;
    /** Stops rendering synchronously; the adapter owns deferred engine/GPU destruction. */
    retire(node: N): void;
    release(): void;
}
export interface EntityPoolEngine<N> {
    load(asset: AssetAddress, instancing: boolean, signal: AbortSignal): Promise<EntityTemplate<N>>;
    subscribeFrames?(step: (frameId: number) => void): () => void;
}
export type EntityState = "pending" | "active" | "hidden" | "failed" | "released";
export interface PooledEntity<N> {
    readonly state: EntityState;
    readonly node: N | undefined;
    readonly error: unknown;
    /** Only failed entities retry; stale handles never address a reused node. */
    retry(): void;
    despawn(): void;
}
export interface EntityPoolOptions {
    readonly quality: Stage3DQuality;
    readonly lod?: AssetPlanLod;
    readonly signal?: AbortSignal;
    readonly onError?: (error: unknown) => void;
}
interface Entry<N> {
    readonly definition: PoolEntry;
    readonly entities: Set<Entity<N>>;
    readonly buckets: Map<string, Bucket<N>>;
}
interface Bucket<N> {
    readonly entry: Entry<N>;
    readonly key: string;
    readonly abort: AbortController;
    readonly idle: N[];
    readonly users: Set<Entity<N>>;
    template?: EntityTemplate<N>;
    loading: boolean;
}
interface Entity<N> {
    readonly entry: Entry<N>;
    readonly configure: (node: N) => void;
    state: EntityState;
    node?: N;
    bucket?: Bucket<N>;
    error?: unknown;
}

/**
 * spawn only admits a logical entity. step(frameId) is the sole creation/activation
 * boundary, shared by every prefab in this pool. Repeated calls with the same frame
 * ID share the remaining budget; use a monotonic counter, not root.frameCount.
 *
 * Capacity bounds admitted entities AND active + idle nodes per pool entry, across
 * all LODs. Hidden entities retain their admission but no prefab. Downgrading drops
 * newest admissions beyond the new capacity. Idle nodes keep the template lease;
 * evict(), an incompatible quality/LOD change or close() retires them first.
 */
export class EntityPool<N> {
    private readonly catalog: AssetCatalog;
    private readonly entries = new Map<string, Entry<N>>();
    private readonly queue = new Set<Entity<N>>();
    private quality: Stage3DQuality;
    private lod: AssetPlanLod;
    private closed = false;
    private stepping = false;
    private engineCallback = false;
    private frame = -1;
    private used = 0;
    private stopFrames?: () => void;
    private readonly abort = () => this.close();

    constructor(catalog: AssetCatalogData, private readonly engine: EntityPoolEngine<N>, private readonly options: EntityPoolOptions) {
        this.catalog = new AssetCatalog(catalog);
        this.quality = options.quality;
        this.lod = options.lod ?? 0;
        validateAssetQuality(this.quality.tier); validateAssetLod(this.lod);
        for (const definition of this.catalog.pool.entries) {
            this.entries.set(definition.id, { definition, entities: new Set(), buckets: new Map() });
        }
        options.signal?.addEventListener("abort", this.abort, { once: true });
        if (options.signal?.aborted) this.close();
        if (!this.closed) this.stopFrames = engine.subscribeFrames?.((frame) => this.step(frame));
    }

    spawn(id: string, configure: (node: N) => void = () => {}): PooledEntity<N> | undefined {
        if (this.closed) throw new Error("EntityPool is closed");
        const entry = this.entries.get(id);
        if (!entry) throw new Error(`EntityPool: unknown pool ${id}`);
        if (entry.entities.size >= this.capacity(entry)) return undefined;
        const entity: Entity<N> = { entry, configure, state: "hidden" };
        entry.entities.add(entity);
        this.enqueue(entity);
        return Object.freeze({
            get state() { return entity.state; }, get node() { return entity.node; }, get error() { return entity.error; },
            retry: () => { if (entity.state === "failed") { entity.error = undefined; this.enqueue(entity); } },
            despawn: () => this.despawn(entity),
        });
    }

    /** Returns activation attempts this call; failures also consume this frame's budget. */
    step(frameId: number): number {
        if (!Number.isSafeInteger(frameId) || frameId < 0 || frameId < this.frame) throw new RangeError("EntityPool requires monotonic frame IDs");
        if (this.closed || this.stepping || this.engineCallback) return 0;
        if (frameId !== this.frame) { this.frame = frameId; this.used = 0; }
        let attempts = 0;
        this.stepping = true;
        try {
            for (const entity of [...this.queue]) {
                if (this.closed || this.used >= this.catalog.pool.maxActivationsPerFrame[this.quality.tier]) break;
                if (!this.queue.has(entity)) continue;
                const bucket = entity.bucket!;
                if (!bucket.template) continue; // Ready prefabs behind a slow load can still progress.
                const template = bucket.template;
                this.queue.delete(entity);
                this.used++; attempts++;
                try {
                    let node = bucket.idle.pop();
                    if (node === undefined) {
                        this.makeRoom(entity.entry);
                        node = template.create();
                    }
                    if (entity.bucket !== bucket || entity.state !== "pending") { template.retire(node); continue; }
                    entity.node = node;
                    entity.configure(node);
                    if (entity.bucket !== bucket || entity.node !== node || entity.state !== "pending") continue;
                    // Publish before engine onEnable: despawn/close from a component sees its active owner.
                    entity.state = "active";
                    template.activate(node);
                } catch (error) {
                    if (entity.bucket === bucket) {
                        this.removeNode(entity, true);
                        bucket.users.delete(entity); entity.bucket = undefined;
                        entity.state = "failed"; entity.error = error;
                        this.dropEmpty(bucket);
                    }
                    this.report(error);
                }
            }
        } finally { this.stepping = false; }
        return attempts;
    }

    setLod(lod: AssetPlanLod): void {
        validateAssetLod(lod);
        if (this.closed || this.lod === lod) return;
        this.lod = lod; this.reconcile();
    }
    setQuality(quality: Stage3DQuality): void {
        validateAssetQuality(quality.tier);
        if (this.closed) return;
        this.quality = quality; this.reconcile();
    }
    /** Retires inactive nodes only. Active/queued consumers keep their own valid holds. */
    evict(): void {
        for (const entry of this.entries.values()) for (const bucket of [...entry.buckets.values()]) {
            this.evictBucket(bucket); this.dropEmpty(bucket);
        }
    }
    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.stopFrames?.(); this.stopFrames = undefined;
        this.options.signal?.removeEventListener("abort", this.abort);
        for (const entry of this.entries.values()) for (const entity of [...entry.entities]) this.despawn(entity);
        this.evict();
    }

    private capacity(entry: Entry<N>): number { return entry.definition.capacity[this.quality.tier]; }
    private selection(entry: Entry<N>): AssetAddress | undefined {
        return this.catalog.select(this.catalog.poolAsset(entry.definition.id), this.quality.tier, this.lod);
    }
    private key(asset: AssetAddress): string { return `${addressKey(asset)}:${this.quality.instancing}`; }
    private enqueue(entity: Entity<N>): void {
        const asset = this.selection(entity.entry);
        if (!asset) { entity.state = "hidden"; return; }
        const key = this.key(asset);
        let bucket = entity.entry.buckets.get(key);
        if (!bucket) {
            bucket = { entry: entity.entry, key, abort: new AbortController(), idle: [], users: new Set(), loading: false };
            entity.entry.buckets.set(key, bucket);
        }
        entity.bucket = bucket; entity.state = "pending";
        bucket.users.add(entity); this.queue.add(entity);
        if (!bucket.template && !bucket.loading) this.load(bucket, asset);
    }
    private load(bucket: Bucket<N>, asset: AssetAddress): void {
        bucket.loading = true;
        const current = () => !this.closed && bucket.entry.buckets.get(bucket.key) === bucket;
        // Promise boundary also captures synchronous adapter errors; callbacks never activate nodes.
        Promise.resolve().then(() => {
            if (!current()) return undefined;
            return this.engine.load(asset, this.quality.instancing, bucket.abort.signal);
        }).then((template) => {
            if (!template) return;
            if (!current()) { this.safely(() => template.release()); return; }
            bucket.template = template; bucket.loading = false;
        }).catch((error: unknown) => {
            if (!current()) return;
            for (const entity of bucket.users) {
                this.queue.delete(entity); entity.bucket = undefined; entity.state = "failed"; entity.error = error;
            }
            bucket.users.clear(); bucket.loading = false;
            this.dropEmpty(bucket); this.report(error);
        });
    }
    private reconcile(): void {
        for (const entry of this.entries.values()) {
            for (const entity of [...entry.entities].slice(this.capacity(entry))) this.despawn(entity);
            const asset = this.selection(entry), key = asset && this.key(asset);
            for (const entity of entry.entities) {
                if (entity.bucket?.key === key && entity.bucket !== undefined) continue;
                this.detach(entity);
                this.enqueue(entity);
            }
            for (const bucket of [...entry.buckets.values()]) {
                if (bucket.key !== key) { this.evictBucket(bucket); this.dropEmpty(bucket); }
            }
            while (this.nodeCount(entry) > this.capacity(entry)) this.evictOne(entry);
        }
    }
    private removeNode(entity: Entity<N>, destroy = false): void {
        const node = entity.node, bucket = entity.bucket;
        entity.node = undefined;
        if (node === undefined || !bucket?.template) return;
        if (destroy) this.safely(() => bucket.template!.retire(node));
        else {
            bucket.idle.push(node);
            this.safely(() => bucket.template!.deactivate(node));
        }
    }
    private detach(entity: Entity<N>): void {
        this.queue.delete(entity);
        const bucket = entity.bucket;
        this.removeNode(entity);
        entity.bucket = undefined;
        if (bucket) { bucket.users.delete(entity); this.dropEmpty(bucket); }
    }
    private despawn(entity: Entity<N>): void {
        if (entity.state === "released") return;
        entity.state = "released";
        entity.entry.entities.delete(entity);
        this.detach(entity);
    }
    private dropEmpty(bucket: Bucket<N>): void {
        if (bucket.users.size || bucket.idle.length || bucket.entry.buckets.get(bucket.key) !== bucket) return;
        bucket.entry.buckets.delete(bucket.key); // Invalidate before abort/release can reenter.
        bucket.abort.abort();
        if (bucket.template) this.safely(() => bucket.template!.release());
    }
    private evictBucket(bucket: Bucket<N>): void {
        for (const node of bucket.idle.splice(0)) this.safely(() => bucket.template!.retire(node));
    }
    private nodeCount(entry: Entry<N>): number {
        return [...entry.entities].filter((entity) => entity.node !== undefined).length
            + [...entry.buckets.values()].reduce((sum, bucket) => sum + bucket.idle.length, 0);
    }
    private evictOne(entry: Entry<N>): void {
        for (const bucket of entry.buckets.values()) if (bucket.idle.length) {
            const node = bucket.idle.shift()!;
            this.safely(() => bucket.template!.retire(node)); this.dropEmpty(bucket); return;
        }
        throw new Error("EntityPool capacity invariant failed");
    }
    private makeRoom(entry: Entry<N>): void {
        while (this.nodeCount(entry) >= this.capacity(entry)) this.evictOne(entry);
    }
    private safely(action: () => void): void {
        const previous = this.engineCallback;
        this.engineCallback = true;
        try { action(); } catch (error) { this.report(error); }
        finally { this.engineCallback = previous; }
    }
    private report(error: unknown): void { (this.options.onError ?? console.error)(error); }
}
