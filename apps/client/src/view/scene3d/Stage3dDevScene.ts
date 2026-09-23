import { _decorator, Component, instantiate, JsonAsset, Node, Prefab } from "cc";
import { DEV } from "cc/env";
import { parseDetailLayersTable, parsePoolTable, parseQualityTable } from "../../logic/scene3d/qualityData";
import { assetLease } from "./cocosAssetLoader";
import { OwnedRenderingRetirement } from "./ownedRendering";
import { Stage3D } from "./Stage3D";
import { CocosStage3DEngine } from "./cocosStage3DEngine";
import { readStage3DQuality } from "./quality";
import { createCocosEntityPool } from "./cocosEntityPool";
import type { EntityPool, PooledEntity } from "./EntityPool";
import { SkinnedUnitsFixture } from "./SkinnedUnitsFixture";

/** Independent developer scene; no Main/AppRuntime, no author-scene nodes or lightmap array. */
@_decorator.ccclass("Stage3dDevScene")
export class Stage3dDevScene extends Component {
    /** Inspector / preview switch. Actual admission and visibility follow the JSON quality policy. */
    @_decorator.property({})
    entitiesEnabled = false;
    @_decorator.property({})
    skinnedEnabled = false;
    skinned: SkinnedUnitsFixture | undefined;
    private appliedSkinned = false;
    entityPool: EntityPool<Node> | undefined;
    readonly entities: PooledEntity<Node>[] = [];
    private appliedEntities = false;
    private frameEntities: ((enabled: boolean) => void) | undefined;
    private readonly owner = new AbortController();
    private assets: { release(): void } | undefined;
    private stage: Stage3D | undefined;
    private content: Node | undefined;
    status: "idle" | "loading" | "ready" | "failed" | "closed" = "idle";
    error = "";

    async start(): Promise<void> {
        if (!DEV) return;
        this.status = "loading";
        try {
            const acquired = await assetLease.acquire([
                { bundle: "resources", path: "stage3d/data/quality", type: JsonAsset },
                { bundle: "resources", path: "stage3d/data/pool", type: JsonAsset },
                { bundle: "resources", path: "stage3d/data/detail-layers", type: JsonAsset },
                { bundle: "resources", path: "stage3d/P_Stage3d_Baked", type: Prefab },
            ] as const, { signal: this.owner.signal });
            if (this.owner.signal.aborted) { acquired.release(); return; }
            this.assets = acquired;
            const [quality, poolData, layerData, prefab] = acquired.assets;
            const pool = parsePoolTable(poolData.json);
            const qualityTable = parseQualityTable(quality.json);
            const layers = parseDetailLayersTable(layerData.json, pool);
            const stage = this.stage = new Stage3D(new CocosStage3DEngine(), undefined, readStage3DQuality);
            const lease = stage.acquire({ signal: this.owner.signal, isActive: () => !this.owner.signal.aborted },
                { clearColor: { r: 34, g: 39, b: 46, a: 255 } });
            lease.camera.setPose({ x: 8, y: 7, z: 10 }, { x: 0, y: 0, z: 0 });
            lease.light.setDirection({ x: -1, y: -2, z: -1 });
            this.content = instantiate(prefab);
            lease.root.addChild(this.content);
            this.entityPool = createCocosEntityPool({ quality: qualityTable, pool, layers }, lease.root,
                { quality: stage.quality, signal: lease.signal, onError: (error) => { this.error = String(error); } });
            this.skinned = new SkinnedUnitsFixture({ quality: qualityTable, pool, layers }, lease.root, stage.quality, lease.signal);
            this.frameEntities = (enabled) => lease.camera.setPose(enabled ? { x: 0, y: 110, z: 145 } : { x: 8, y: 7, z: 10 },
                { x: 0, y: 0, z: 0 });
            this.frameSkinning = () => lease.camera.setPose({ x: 0, y: 48, z: 66 }, { x: 0, y: 0, z: 0 });
            this.setEntitiesEnabled(this.entitiesEnabled);
            this.setSkinnedEnabled(this.skinnedEnabled);
            this.status = "ready";
        } catch (error) {
            if (this.owner.signal.aborted) return;
            this.error = String(error);
            this.close();
            this.status = "failed";
            console.error("[Stage3dDevScene]", error);
        }
    }

    onDestroy(): void { this.close(); }

    update(): void {
        if (this.entityPool && this.entitiesEnabled !== this.appliedEntities) this.setEntitiesEnabled(this.entitiesEnabled);
        if (this.skinned && this.skinnedEnabled !== this.appliedSkinned) this.setSkinnedEnabled(this.skinnedEnabled);
    }

    setSkinnedEnabled(enabled: boolean): void {
        this.skinnedEnabled = enabled;
        if (!this.skinned || this.appliedSkinned === enabled) return;
        this.appliedSkinned = enabled;
        this.frameEntities?.(false);
        if (enabled) this.frameSkinning?.();
        void this.skinned.setEnabled(enabled);
    }

    private frameSkinning: (() => void) | undefined;

    /** Queue 500 greyboxes; low hides details, medium admits 300, high admits 500. */
    setEntitiesEnabled(enabled: boolean): void {
        this.entitiesEnabled = enabled;
        if (!this.entityPool || this.appliedEntities === enabled) return;
        this.appliedEntities = enabled;
        this.frameEntities?.(enabled);
        if (enabled) {
            for (let i = 0; i < 500; i++) {
                const entity = this.entityPool.spawn("cubes", (node) => {
                    node.name = `Stage3dPool.Cube.${i}`;
                    node.setPosition((i % 25 - 12) * 2.3, 0.5, (Math.floor(i / 25) - 10) * 2.3);
                });
                if (entity) this.entities.push(entity);
            }
        } else {
            for (const entity of this.entities.splice(0)) entity.despawn();
            this.entityPool.evict();
        }
    }

    private close(): void {
        this.skinned?.close(); this.skinned = undefined; this.frameSkinning = undefined;
        this.entityPool?.close(); this.entityPool = undefined;
        this.entities.length = 0; this.frameEntities = undefined;
        const retirement = new OwnedRenderingRetirement();
        if (this.content) retirement.capture(this.content);
        this.owner.abort();
        if (this.content) { this.content.active = false; this.content.removeFromParent(); this.content.destroy(); this.content = undefined; }
        this.stage?.dispose(); this.stage = undefined;
        const assets = this.assets; this.assets = undefined;
        if (assets) retirement.finish(() => assets.release());
        this.status = "closed";
    }
}
