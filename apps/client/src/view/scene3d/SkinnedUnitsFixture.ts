import { director, Director, Node, Prefab, SkeletalAnimation, SkinnedMeshRenderer } from "cc";
import type { AnimationClip } from "cc";
import type { AssetCatalogData } from "../../logic/scene3d/assetCatalog";
import type { Stage3DQuality } from "../../logic/scene3d/qualityTiers";
import { resolveSkinningPolicy } from "../../logic/scene3d/skinningPolicy";
import type { BakedFrameBudget } from "../../logic/scene3d/skinningPolicy";
import { assetLease } from "./cocosAssetLoader";
import { createCocosSkinnedUnits } from "./cocosSkinnedUnits";
import { registerJointTextureLayouts } from "./jointTextureLayouts";
import type { SkinnedUnit, SkinnedUnits, SkinningMode } from "./SkinnedUnits";

/** Developer fixture only. Uses the production pool, actual imported clips, and two author layouts. */
export class SkinnedUnitsFixture {
    status: "idle" | "loading" | "ready" | "failed" = "idle";
    error = "";
    readonly entities: SkinnedUnit<Node>[] = [];
    pool: SkinnedUnits<Node> | undefined;
    mainClips: readonly string[] = [];
    alternateClips: readonly string[] = [];
    socketPath = "";
    measuredBakedBudget: BakedFrameBudget | undefined;
    private abort: AbortController | undefined;
    private assets: { release(): void } | undefined;
    private disposed = false;
    private readonly cancel = () => this.close();

    constructor(private readonly catalog: AssetCatalogData, private readonly parent: Node,
        private readonly quality: Stage3DQuality, private readonly signal: AbortSignal) {
        signal.addEventListener("abort", this.cancel, { once: true });
        if (signal.aborted) this.close();
    }

    async setEnabled(enabled: boolean): Promise<void> {
        if (!enabled) { this.clear(); return; }
        if (this.disposed || this.abort) return;
        const owner = this.abort = new AbortController();
        this.status = "loading"; this.error = "";
        try {
            const batch = await assetLease.acquire(["greybox-biped", "greybox-biped-atlas-b"].map((name) =>
                ({ bundle: "resources", path: `stage3d/${name}/${name}`, type: Prefab })), { signal: owner.signal });
            if (owner.signal.aborted) { batch.release(); return; }
            this.assets = batch;
            const [main, alternate] = batch.assets;
            const clipsOf = (prefab: Prefab) => (prefab.data as Node).getComponentsInChildren(SkeletalAnimation)[0]!.clips
                .filter((clip): clip is AnimationClip => clip !== null);
            const mainClips = clipsOf(main!), alternateClips = clipsOf(alternate!);
            const skeleton = (main!.data as Node).getComponentsInChildren(SkinnedMeshRenderer)[0]!.skeleton!;
            const alternateSkeleton = (alternate!.data as Node).getComponentsInChildren(SkinnedMeshRenderer)[0]!.skeleton!;
            if (mainClips.length !== 2 || alternateClips.length !== 2 || skeleton.hash !== alternateSkeleton.hash) throw new Error("Invalid two-atlas fixture assets");
            const policy = resolveSkinningPolicy(this.quality, this.measuredBakedBudget);
            if (!policy.degraded) registerJointTextureLayouts([mainClips, alternateClips].map((clips) => ({ textureLength: 72,
                contents: [{ skeleton: skeleton.hash, clips: clips.map((clip) => clip.hash) }] })));
            this.mainClips = mainClips.map((clip) => clip.name); this.alternateClips = alternateClips.map((clip) => clip.name);
            this.socketPath = skeleton.joints[skeleton.joints.length - 1]!;
            this.pool = createCocosSkinnedUnits(this.catalog, this.parent, { quality: this.quality, signal: owner.signal,
                allowRealtime: true, clips: alternateClips,
                fallback: { billboards: { bipeds: { bundle: "resources", path: "stage3d/P_Stage3d_Billboard" } },
                    measuredBakedBudget: this.measuredBakedBudget },
                onError: (error) => { if (this.abort === owner && !owner.signal.aborted) {
                    this.clear(); this.error = String(error); this.status = "failed";
                } } });
            for (let i = 0; i < policy.maxUnits; i++) {
                const entity = this.pool.spawn("bipeds", i === policy.maxUnits - 1 ? this.alternateClips[0]! : this.mainClips[i % 2]!, (node) => {
                    node.name = `Stage3dSkinned.Unit.${i}`;
                    node.setPosition((i % 10 - 4.5) * 2.5, 0, (Math.floor(i / 10) - 4.5) * 2.5);
                });
                if (entity) this.entities.push(entity);
            }
            this.status = "ready";
        } catch (error) {
            if (owner.signal.aborted) return;
            this.clear(); this.status = "failed"; this.error = String(error);
            console.error("[SkinnedUnitsFixture]", error);
        }
    }

    play(index: number, clip: string, mode?: SkinningMode): void {
        const entity = this.entities[index];
        if (!entity || !this.pool) throw new Error("Missing fixture unit");
        this.pool.play(entity, clip, mode);
    }
    socket(index: number): Node {
        const entity = this.entities[index];
        if (!entity || !this.pool) throw new Error("Missing fixture unit");
        return this.pool.socket(entity, this.socketPath);
    }
    close(): void {
        this.disposed = true; this.signal.removeEventListener("abort", this.cancel); this.clear();
    }
    private clear(): void {
        this.pool?.close(); this.pool = undefined; this.entities.length = 0;
        this.abort?.abort(); this.abort = undefined;
        const assets = this.assets; this.assets = undefined;
        if (assets) director.once(Director.EVENT_AFTER_DRAW, () => assets.release());
        this.status = "idle";
    }
}
