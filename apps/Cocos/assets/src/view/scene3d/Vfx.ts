import { AssetCatalog, validateAssetLod, validateAssetQuality } from "../../logic/scene3d/assetCatalog";
import type { AssetCatalogData, AssetPlanLod } from "../../logic/scene3d/assetCatalog";
import type { Stage3DQuality } from "../../logic/scene3d/qualityTiers";
import { EntityPool } from "./EntityPool";
import type { EntityPoolEngine, EntityPoolOptions, PooledEntity } from "./EntityPool";

export interface VfxPosition { readonly x: number; readonly y: number; readonly z: number; }
/** World position. Returning undefined ends a follow effect (for example a destroyed socket). */
export type VfxPlacement = { readonly at: VfxPosition } | { readonly follow: () => VfxPosition | undefined };
export interface VfxHandle<N> {
    readonly state: PooledEntity<unknown>["state"];
    /** Borrowed only while active; stop/release invalidates it. */
    readonly node: N | undefined;
    readonly error: unknown;
    stop(): void;
}
export interface VfxEngine<N> extends Omit<EntityPoolEngine<N>, "subscribeFrames"> {
    place(node: N, position: VfxPosition): void;
    subscribeFrames?(step: (frameId: number, nowMs: number) => void): () => void;
}
interface Effect<N> {
    readonly key: string;
    readonly placement: VfxPlacement;
    readonly durationMs: number;
    readonly pooled: PooledEntity<N>;
    expiresAt?: number;
}

/**
 * One-shot admissions: LOD/quality suppression ends effects, never replays them on return.
 * Per-key capacity comes from pool.json; maxEffects bounds ALL pending/active keys together.
 * durationMs starts at first activation and uses monotonic wall time, not clamped game dt.
 * stop/expiry clears particles and returns the node to its bounded pool. evict/close destroys
 * idle nodes before releasing prefab holds; pass the Stage3D lease.signal to own the lifecycle.
 */
export class Vfx<N> {
    private readonly catalog: AssetCatalog;
    private readonly pool: EntityPool<N>;
    private readonly effects = new Set<Effect<N>>();
    private quality: Stage3DQuality;
    private lod: AssetPlanLod;
    private nowMs = 0;
    private frame = -1;
    private closed = false;
    private stepping = false;
    private stopFrames?: () => void;
    private readonly abort = () => this.close();

    constructor(catalog: AssetCatalogData, private readonly engine: VfxEngine<N>, private readonly options: EntityPoolOptions) {
        this.catalog = new AssetCatalog(catalog);
        this.quality = options.quality; this.lod = options.lod ?? 0;
        this.pool = new EntityPool(catalog, { load: engine.load.bind(engine) }, this.poolOptions());
        options.signal?.addEventListener("abort", this.abort, { once: true });
        if (options.signal?.aborted) this.close();
        if (!this.closed) this.stopFrames = engine.subscribeFrames?.((frame, time) => this.step(frame, time));
    }

    play(key: string, placement: VfxPlacement, durationMs: number): VfxHandle<N> | undefined {
        if (this.closed) throw new Error("Vfx is closed");
        if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError("Vfx durationMs must be finite and positive");
        if (!("at" in placement) && typeof placement.follow !== "function") throw new Error("Vfx requires at or follow");
        if ("at" in placement) placement = { at: this.position(placement.at) };
        this.prune();
        if (!this.visible(key) || this.effects.size >= this.quality.maxEffects) return undefined;
        let effect: Effect<N>;
        const pooled = this.pool.spawn(key, (node) => {
            const position = this.resolve(effect);
            if (!position) { this.stop(effect); return; }
            if (!this.effects.has(effect)) return; // follow callbacks may close/release their owner.
            this.engine.place(node, position);
            effect.expiresAt ??= this.nowMs + durationMs;
        });
        if (!pooled) return undefined;
        effect = { key, placement, durationMs, pooled }; this.effects.add(effect);
        return Object.freeze({ get state() { return pooled.state; }, get node() { return pooled.node; },
            get error() { return pooled.error; }, stop: () => this.stop(effect) });
    }

    step(frameId: number, nowMs: number): number {
        if (!Number.isSafeInteger(frameId) || frameId < 0 || frameId < this.frame
            || !Number.isFinite(nowMs) || nowMs < this.nowMs) throw new RangeError("Vfx requires monotonic frame IDs and milliseconds");
        if (this.closed || this.stepping) return 0;
        this.frame = frameId; this.nowMs = nowMs; this.stepping = true;
        try {
            this.prune();
            for (const effect of [...this.effects]) {
                if (effect.expiresAt !== undefined && nowMs >= effect.expiresAt) { this.stop(effect); continue; }
                if (effect.pooled.state !== "active" || !("follow" in effect.placement)) continue;
                try {
                    const position = this.resolve(effect);
                    if (!position) this.stop(effect);
                    else if (this.effects.has(effect) && effect.pooled.node !== undefined) this.engine.place(effect.pooled.node, position);
                } catch (error) { this.stop(effect); this.report(error); }
            }
            const attempts = this.pool.step(frameId);
            this.prune();
            return attempts;
        } finally { this.stepping = false; }
    }

    setLod(lod: AssetPlanLod): void {
        validateAssetLod(lod); if (this.closed) return;
        this.lod = lod; this.reconcile(); this.pool.setLod(lod); this.pool.evict();
    }
    setQuality(quality: Stage3DQuality): void {
        validateAssetQuality(quality.tier); if (this.closed) return;
        this.quality = quality; this.reconcile(); this.pool.setQuality({ ...quality, instancing: false }); this.pool.evict();
    }
    evict(): void { this.pool.evict(); }
    close(): void {
        if (this.closed) return;
        this.closed = true; this.stopFrames?.(); this.stopFrames = undefined;
        this.options.signal?.removeEventListener("abort", this.abort);
        for (const effect of [...this.effects]) this.stop(effect);
        this.pool.close();
    }

    private visible(key: string): boolean {
        const entry = this.catalog.poolAsset(key);
        // SC4: far-LOD effects are always disabled, even without a content hideAtLod row.
        return this.lod < 2 && this.catalog.select(entry, this.quality.tier, this.lod) !== undefined;
    }
    private reconcile(): void {
        this.prune(); let admitted = 0;
        for (const effect of [...this.effects]) {
            if (!this.visible(effect.key) || admitted >= this.quality.maxEffects) this.stop(effect);
            else admitted++;
        }
    }
    private poolOptions(): EntityPoolOptions { return { ...this.options, quality: { ...this.quality, instancing: false } }; }
    private stop(effect: Effect<N>): void { this.effects.delete(effect); effect.pooled.despawn(); }
    private prune(): void {
        for (const effect of this.effects) if (effect.pooled.state === "released" || effect.pooled.state === "failed") this.stop(effect);
    }
    private resolve(effect: Effect<N>): VfxPosition | undefined {
        const value = "at" in effect.placement ? effect.placement.at : effect.placement.follow();
        return value === undefined ? undefined : this.position(value);
    }
    private position(value: VfxPosition): VfxPosition {
        if (![value.x, value.y, value.z].every(Number.isFinite)) throw new RangeError("Vfx position must be finite");
        return { x: value.x, y: value.y, z: value.z };
    }
    private report(error: unknown): void { (this.options.onError ?? console.error)(error); }
}
