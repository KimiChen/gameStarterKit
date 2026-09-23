import type { AssetCatalogData, AssetPlanLod } from "../../logic/scene3d/assetCatalog";
import type { Stage3DQuality } from "../../logic/scene3d/qualityTiers";
import { EntityPool } from "./EntityPool";
import type { EntityPoolEngine, EntityPoolOptions, EntityTemplate, PooledEntity } from "./EntityPool";

export type SkinningMode = "baked" | "realtime";
export interface SkinnedTemplate<N> extends EntityTemplate<N> {
    /** Inactive nodes remember the request; activate applies it before the first draw. */
    play(node: N, clip: string, mode: SkinningMode): void;
    socket(node: N, path: string): N;
}
export interface SkinnedUnitsEngine<N> extends EntityPoolEngine<N> {
    load(...args: Parameters<EntityPoolEngine<N>["load"]>): Promise<SkinnedTemplate<N>>;
}
export interface SkinnedUnitsOptions extends EntityPoolOptions {
    /** Explicit permission for blending/CPU skinning. No automatic fallback on missing float textures. */
    readonly allowRealtime?: boolean;
}
export interface SkinnedUnit<N> extends PooledEntity<N> {
    readonly clip: string;
    readonly mode: SkinningMode;
}
interface Unit<N> { pooled: PooledEntity<N>; clip: string; mode: SkinningMode; }

/** EntityPool owns admission, LOD, frame budgets and leases. Handles never address a reused node.
 * A socket is borrowed for the current active node only; despawn/LOD replacement invalidates it.
 * Consumers detach their socket children before despawn. Clip/mode switches keep that node/socket.
 */
export class SkinnedUnits<N> {
    private readonly pool: EntityPool<N>;
    private readonly templates = new Map<N, SkinnedTemplate<N>>();
    private readonly units = new Map<SkinnedUnit<N>, Unit<N>>();
    private quality: Stage3DQuality;

    constructor(catalog: AssetCatalogData, engine: SkinnedUnitsEngine<N>, private readonly options: SkinnedUnitsOptions) {
        this.quality = options.quality;
        this.pool = new EntityPool(catalog, {
            subscribeFrames: engine.subscribeFrames?.bind(engine),
            load: async (...args) => {
                const template = await engine.load(...args);
                return {
                    create: () => { const node = template.create(); this.templates.set(node, template); return node; },
                    activate: (node) => template.activate(node),
                    deactivate: (node) => template.deactivate(node),
                    retire: (node) => { this.templates.delete(node); template.retire(node); },
                    release: () => template.release(),
                };
            },
        }, { ...options, quality: this.poolQuality(options.quality) });
    }

    spawn(id: string, clip: string, configure: (node: N) => void = () => {}, mode: SkinningMode = "baked"): SkinnedUnit<N> | undefined {
        this.validate(clip, mode);
        this.prune();
        if (this.units.size >= this.quality.maxUnits) return undefined;
        if (mode === "realtime" && this.realtimeCount() >= this.quality.maxUnitsWithoutInstancing) return undefined;
        let unit: Unit<N>;
        const pooled = this.pool.spawn(id, (node) => {
            configure(node);
            // configure may synchronously despawn/close; do not restart a stale node.
            if (unit.pooled.state === "pending" && unit.pooled.node === node) this.templates.get(node)!.play(node, unit.clip, unit.mode);
        });
        if (!pooled) return undefined;
        unit = { pooled, clip, mode };
        const handle: SkinnedUnit<N> = Object.freeze({
            get state() { return pooled.state; }, get node() { return pooled.node; }, get error() { return pooled.error; },
            get clip() { return unit.clip; }, get mode() { return unit.mode; },
            retry: () => pooled.retry(), despawn: () => { this.units.delete(handle); pooled.despawn(); },
        });
        this.units.set(handle, unit);
        return handle;
    }

    play(entity: SkinnedUnit<N>, clip: string, mode: SkinningMode = entity.mode): void {
        this.validate(clip, mode);
        const unit = this.owned(entity);
        if (mode === "realtime" && unit.mode !== mode && this.realtimeCount() >= this.quality.maxUnitsWithoutInstancing) {
            throw new Error("SkinnedUnits realtime capacity exceeded");
        }
        const node = unit.pooled.node;
        if (node !== undefined) this.templates.get(node)!.play(node, clip, mode);
        unit.clip = clip; unit.mode = mode;
    }

    socket(entity: SkinnedUnit<N>, path: string): N {
        const unit = this.owned(entity), node = unit.pooled.node;
        if (unit.pooled.state !== "active" || node === undefined) throw new Error("SkinnedUnits socket requires an active unit");
        if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid socket joint path");
        return this.templates.get(node)!.socket(node, path);
    }

    step(frameId: number): number { return this.pool.step(frameId); }
    setLod(lod: AssetPlanLod): void { this.pool.setLod(lod); this.prune(); }
    setQuality(quality: Stage3DQuality): void {
        this.prune();
        if (quality.jointTexture === "unavailable" && [...this.units.values()].some((unit) => unit.mode === "baked")) {
            throw new Error("Baked joint textures unavailable; explicitly switch or despawn baked units first");
        }
        this.quality = quality;
        let admitted = 0, realtime = 0;
        for (const [handle, unit] of this.units) {
            if (admitted >= quality.maxUnits || (unit.mode === "realtime" && realtime >= quality.maxUnitsWithoutInstancing)) handle.despawn();
            else { admitted++; if (unit.mode === "realtime") realtime++; }
        }
        this.pool.setQuality(this.poolQuality(quality)); this.prune();
    }
    evict(): void { this.pool.evict(); }
    close(): void { this.pool.close(); this.units.clear(); }

    private owned(entity: SkinnedUnit<N>): Unit<N> {
        const unit = this.units.get(entity);
        if (!unit || unit.pooled.state === "released") throw new Error("Expired or foreign SkinnedUnits handle");
        return unit;
    }
    private prune(): void { for (const [handle, unit] of this.units) if (unit.pooled.state === "released") this.units.delete(handle); }
    private realtimeCount(): number { return [...this.units.values()].filter((unit) => unit.pooled.state !== "released" && unit.mode === "realtime").length; }
    private poolQuality(quality: Stage3DQuality): Stage3DQuality { return { ...quality, instancing: quality.bakedSkinningInstancing }; }
    private validate(clip: string, mode: SkinningMode): void {
        if (!clip || typeof clip !== "string") throw new Error("SkinnedUnits requires a clip name");
        if (mode !== "baked" && mode !== "realtime") throw new Error("Unknown skinning mode");
        if (mode === "realtime" && !this.options.allowRealtime) throw new Error("Realtime skinning requires allowRealtime");
        if (mode === "baked" && this.quality.jointTexture === "unavailable") throw new Error("Baked joint textures unavailable");
    }
}
