/**
 * `_top_group` 的**手摆细节**渲染：一族一个批、一张 top 图集。
 *
 * ★ 必须紧贴在**对应的多边形层之上**（原版 `TOP_LAYER_ORDER = {ground:101, desert:201, snow:301}`
 *   就在各自 polygon 的 +1 档，MAPORIGINAL-2D §1.3）。
 * ⚠ 一族一张图集、一个材质 —— ⛔ 别与多边形层共用材质（那挂的是底纹/填充色）。
 * ⚠ 图集是按 0.4× 缩存的：件的世界尺寸走 `native`，**⛔ 不是图集里的像素**。
 */
import { Material, Node } from "cc";
import { buildMapoSpriteMesh } from "../logic/mapoMesh";
import type { MapoPolygonInput } from "../logic/mapoMesh";
import { mapoHasTops, mapoTopsFor } from "../logic/mapoTops";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique,
    uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

/** 一屏最多展开多少件。⚠ 一片水面能带 30 个件，⛔ 必须有上限。 */
export const MAPO_TOP_MAX_SPRITES = 3_000;

export class MapoTopRenderer {
    private batch: MapoBatch | null = null;
    private material: Material | null = null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null,
                private readonly kind: string) {}

    /** @returns 真的建出来的件数。@param polys 对应多边形层**本帧已裁剪**的结果。 */
    render(polys: readonly MapoPolygonInput[], enabled: boolean): number {
        if (this.disposed) return 0;
        const texture = this.art?.topAtlas(this.kind) ?? null;
        if (!texture || !enabled || !mapoHasTops(this.kind) || polys.length === 0) {
            this.clear();
            return 0;
        }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true);
            this.material.setProperty("mainTexture", texture);
        }
        const sprites = mapoTopsFor(this.kind, polys, MAPO_TOP_MAX_SPRITES);
        if (sprites.length === 0) { this.clear(); return 0; }
        const geometry = buildMapoSpriteMesh(sprites);
        if (!this.batch) {
            this.batch = createMapoBatch(this.root, `mapo-top-${this.kind}`, geometry, this.material);
        } else {
            uploadMapoBatch(this.batch, geometry);
        }
        return sprites.length;
    }

    clear(): void {
        destroyMapoBatch(this.batch);
        this.batch = null;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.material?.destroy();
        this.material = null;
    }
}
