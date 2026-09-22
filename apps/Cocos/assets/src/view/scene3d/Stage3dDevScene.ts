import { _decorator, Component, instantiate, JsonAsset, Node, Prefab, resources } from "cc";
import { DEV } from "cc/env";
import { parseDetailLayersTable, parsePoolTable, parseQualityTable } from "../../logic/scene3d/qualityData";
import { AssetRetainer } from "./AssetLease";
import type { LoadedAsset, RetainedAsset } from "./AssetLease";
import { Stage3D } from "./Stage3D";
import { CocosStage3DEngine } from "./cocosStage3DEngine";
import { readStage3DQuality } from "./quality";

/** Independent developer scene; no Main/AppRuntime, no author-scene nodes or lightmap array. */
@_decorator.ccclass("Stage3dDevScene")
export class Stage3dDevScene extends Component {
    private readonly owner = new AbortController();
    private readonly retainer = new AssetRetainer();
    private readonly held: RetainedAsset<LoadedAsset>[] = [];
    private stage: Stage3D | undefined;
    private content: Node | undefined;
    status: "idle" | "loading" | "ready" | "failed" | "closed" = "idle";
    error = "";

    async start(): Promise<void> {
        if (!DEV) return;
        this.status = "loading";
        try {
            const quality = await this.loadJson("quality");
            const pool = parsePoolTable((await this.loadJson("pool")).json);
            parseQualityTable(quality.json);
            parseDetailLayersTable((await this.loadJson("detail-layers")).json, pool);
            const prefab = await new Promise<Prefab>((resolve, reject) => resources.load("stage3d/P_Stage3d_Baked", Prefab,
                (error, asset) => {
                    if (error) { reject(error); return; }
                    try { resolve(this.hold(asset)); } catch (error) { reject(error); }
                }));
            if (this.owner.signal.aborted) return;
            const stage = this.stage = new Stage3D(new CocosStage3DEngine(), undefined, readStage3DQuality);
            const lease = stage.acquire({ signal: this.owner.signal, isActive: () => !this.owner.signal.aborted },
                { clearColor: { r: 34, g: 39, b: 46, a: 255 } });
            lease.camera.setPose({ x: 8, y: 7, z: 10 }, { x: 0, y: 0, z: 0 });
            lease.light.setDirection({ x: -1, y: -2, z: -1 });
            this.content = instantiate(prefab);
            lease.root.addChild(this.content);
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

    private loadJson(name: string): Promise<JsonAsset> {
        if (this.owner.signal.aborted) return Promise.reject(new Error("Stage3dDevScene closed"));
        return new Promise((resolve, reject) => resources.load(`stage3d/data/${name}`, JsonAsset,
            (error, asset) => {
                if (error) { reject(error); return; }
                try { resolve(this.hold(asset)); } catch (error) { reject(error); }
            }));
    }
    private hold<T extends LoadedAsset>(asset: T): T {
        const held = this.retainer.retain(asset);
        if (this.owner.signal.aborted) held.release(); else this.held.push(held);
        return asset;
    }
    private close(): void {
        this.owner.abort();
        if (this.content) { this.content.active = false; this.content.removeFromParent(); this.content.destroy(); this.content = undefined; }
        this.stage?.dispose(); this.stage = undefined;
        for (const held of this.held.splice(0)) held.release();
        this.status = "closed";
    }
}
