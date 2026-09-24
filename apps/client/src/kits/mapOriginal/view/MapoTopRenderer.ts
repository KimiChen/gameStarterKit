/**
 * `_top_group` 的**手摆细节**渲染：一族按 16 位索引拆批、共用一张 top 图集。
 *
 * ★ 必须紧贴在**对应的多边形层之上**（原版 `TOP_LAYER_ORDER = {ground:101, desert:201, snow:301}`
 *   就在各自 polygon 的 +1 档，MAPORIGINAL-2D §1.3）。
 * ⚠ 一族一张图集、一个材质 —— ⛔ 别与多边形层共用材质（那挂的是底纹/填充色）。
 * ⚠ 图集是按 0.4× 缩存的：件的世界尺寸走 `prefab.size × scale`，**⛔ 不是图集里的像素**。
 */
import { Material, Node } from "cc";
import type { MapoPolygonInput } from "../logic/mapoMesh";
import { MapoSpriteUpdates } from "../logic/mapoSpriteUpdates";
import type { MapoArtResources } from "./MapoArtResources";
import { syncMapoSpriteUpdates, createMapoMaterial, clearMapoBatches, mapoUnlitTechnique, type MapoBatch } from "./MapoMeshBatch";

export class MapoTopRenderer {
    private readonly batches: MapoBatch[] = [];
    private readonly geometry = new MapoSpriteUpdates();
    private material: Material | null = null;
    private disposed = false;
    private seconds = 0;
    private visible = false;
    private config: unknown = null;
    private key = "";
    constructor(private readonly root: Node, private readonly art: MapoArtResources | null, private readonly kind: string) {}
    tick(dt: number): void { this.seconds += dt; if (dt > 0 && this.visible) this.flush(); }
    private flush(): void {
        if (!this.material) return;
        syncMapoSpriteUpdates(this.root, `mapo-top-${this.kind}`, this.batches, this.geometry.read(this.seconds), this.geometry.batchCount, this.material);
    }
    render(polys: readonly MapoPolygonInput[], enabled: boolean): number {
        if (this.disposed) return 0;
        const texture = this.art?.topAtlas(this.kind) ?? null;
        if (!texture || !enabled || !this.art!.data.tops.mapoHasTops(this.kind) || polys.length === 0) { this.clear(); return 0; }
        if (!this.material) this.material = createMapoMaterial(mapoUnlitTechnique(), true, this.art?.spriteEffect);
        this.material.setProperty("mainTexture", texture);
        const data = this.art!.data.tops, key = polys.map(p => `${p.s},${p.geo},${p.x},${p.y}`).join(";");
        if (!this.visible || this.config !== data.config || this.key !== key) {
            this.geometry.reset(data.mapoTopSources(this.kind, polys)); this.config = data.config; this.key = key;
        }
        this.visible = true; this.flush(); return this.geometry.size;
    }
    clear(): void { this.visible = false; this.key = ""; this.config = null; this.geometry.clear(); clearMapoBatches(this.batches); }
    dispose(): void { if (this.disposed) return; this.disposed = true; this.clear(); this.material?.destroy(); this.material = null; }
}
