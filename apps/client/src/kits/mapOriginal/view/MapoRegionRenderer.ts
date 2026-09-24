import { mapoRegionSprites } from "../logic/mapoStaticScene";
/**
 * 区域件层渲染：山脉 / 林丛 / 散落，一件一个 sprite，合并成一张带贴图的 mesh。
 *
 * ★ 摆放全部来自 `regions.bin`（原版锚点 + 无锚连通区每区一件），⛔ 这里不做任何挑选。
 * ⚠ 必须画在地表**之上**、逐格摆件**之下**：原作 2D 就是分层的
 *   （`forest_grid_layer_view` 自带 zorder），山林是地貌、逐格资源件是地物。
 * ⚠ 图集没加载出来就整层不建 —— ⛔ 不用纯色方块占位。
 */
import { Material, Node } from "cc";
import { buildMapoSpriteMeshes } from "../logic/mapoMesh";
import {
    type IMapoWorldRect,
} from "../logic/mapoRegions";
import {
    syncMapoBatches, createMapoMaterial, clearMapoBatches, mapoUnlitTechnique,
    type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";


export class MapoRegionRenderer {
    private readonly batches: MapoBatch[] = [];
    private material: Material | null = null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    /** @returns 真的建出来的件数（进状态行当重放证据）。 */
    render(rect: IMapoWorldRect, enabled: boolean): number {
        if (this.disposed) return 0;
        const texture = this.art?.regionAtlas ?? null;
        if (!texture || !enabled) { this.clear(); return 0; }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true, this.art?.spriteEffect);
            this.material.setProperty("mainTexture", texture);
        }
        const sprites = mapoRegionSprites(rect, this.art!.data);
        if (sprites.length === 0) { this.clear(); return 0; }
        const geometry = buildMapoSpriteMeshes(sprites);
        syncMapoBatches(this.root, "mapo-regions", this.batches, geometry, this.material);
        return sprites.length;
    }

    clear(): void {
        clearMapoBatches(this.batches);
    }

    dispose(): void {
        this.disposed = true;
        clearMapoBatches(this.batches);
        this.material?.destroy();
        this.material = null;
    }
}
