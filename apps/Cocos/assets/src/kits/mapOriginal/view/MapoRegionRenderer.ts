import { mapoPrefabSkew, mapoPrefabUv } from "../logic/mapoPrefab";
/**
 * 区域件层渲染：山脉 / 林丛 / 散落，一件一个 sprite，合并成一张带贴图的 mesh。
 *
 * ★ 摆放全部来自 `regions.bin`（原版锚点 + 无锚连通区每区一件），⛔ 这里不做任何挑选。
 * ⚠ 必须画在地表**之上**、逐格摆件**之下**：原作 2D 就是分层的
 *   （`forest_grid_layer_view` 自带 zorder），山林是地貌、逐格资源件是地物。
 * ⚠ 图集没加载出来就整层不建 —— ⛔ 不用纯色方块占位。
 */
import { Material, Node } from "cc";
import {
    MAPO_REGION_ATLAS_H, MAPO_REGION_ATLAS_W,
} from "../../../shared/kits/mapOriginal/content/region.data";
import { buildMapoSpriteMesh, type MapoSpriteInput } from "../logic/mapoMesh";
import {
    mapoRegionsInRect, mapoRegionUv, type IMapoWorldRect,
} from "../logic/mapoRegions";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique,
    uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

/**
 * 一屏最多建多少件。
 * ⚠ 散落件有 1.6 万个 1 格小区，远档一屏能框进几千个 ⇒ 必须有上限。
 * ⛔ 别靠 `MAPO_MAX_QUADS_PER_MESH` 兜底（那是静默截断，画面会缺一角而不报）。
 */
export const MAPO_REGION_MAX_PIECES = 2_400;

export class MapoRegionRenderer {
    private batch: MapoBatch | null = null;
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
        const placed = mapoRegionsInRect(rect, MAPO_REGION_MAX_PIECES);
        if (placed.length === 0) { this.clear(); return 0; }
        const sprites: MapoSpriteInput[] = placed.map((p) => ({
            // ⚠ row/col 只给画家序用；表已是画家序，这里给等距量即可（同序）
            row: p.piece.s, col: 0,
            x: p.x, y: p.y, w: p.w, h: p.h, angleDeg: p.angleDeg,
            pivot: p.cellLayout.pivot,
            skewBasis: mapoPrefabSkew(...p.cellLayout.skew, ...p.cellLayout.scale),
            rgba: p.cellLayout.color.map((v) => v / 255) as [number, number, number, number],
            addColor: p.cellLayout.add_color.map((v) => v / 255) as [number, number, number, number],
            uv: mapoPrefabUv(mapoRegionUv(p.cellLayout, MAPO_REGION_ATLAS_W, MAPO_REGION_ATLAS_H),
                p.cellLayout.mirror_x, p.cellLayout.mirror_y),
        }));
        const geometry = buildMapoSpriteMesh(sprites);
        if (!this.batch) {
            this.batch = createMapoBatch(this.root, "mapo-regions", geometry, this.material);
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
        this.disposed = true;
        destroyMapoBatch(this.batch);
        this.batch = null;
        this.material?.destroy();
        this.material = null;
    }
}
