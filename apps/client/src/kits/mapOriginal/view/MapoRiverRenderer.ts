/**
 * 河流层渲染：原版水面多边形合批。
 *
 * ★ 几何与摆放全部来自原版（`river-geo.bin` + `rivers.bin`），⛔ 这里不做任何拼接/挑选。
 * ⚠ 必须画在地表**之上**、山族件与逐格摆件**之下**：原作的 `MAP_ZORDER` 里
 *   `RIVER(1600)` 在 `TERRAIN(300)` 之上、`RES(3400)` 之下（MAPORIGINAL-2D §2）。
 * ⚠ 三件（几何库 / 摆放表 / 填充图）缺一则整层不建 —— ⛔ 不用纯色多边形占位。
 */
import { Material, Node } from "cc";
import {
    MAPO_RIVER_SYSTEMS, MAPO_RIVER_TINT,
} from "../../../shared/kits/mapOriginal/content/river.data";
import { buildMapoPolygonMesh, type MapoPolygonInput } from "../logic/mapoMesh";
import { mapoHasRivers, mapoRiversInRect, type IMapoWorldRectLike } from "../logic/mapoRivers";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique,
    uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

/**
 * 一屏最多建多少片水面。
 * ⚠ 全图 3.1 万片；远档一屏能框进几千片 ⇒ 必须有上限。
 * ⛔ 别靠 `MAPO_MAX_VERTS_PER_MESH` 兜底（那是静默截断，画面会缺一段河而不报）。
 */
export const MAPO_RIVER_MAX_PIECES = 1_200;

/** 填充图是 `三水系 × 2px` 宽、2px 高；取每块的中心texel。 */
function uvOfSystem(system: number): readonly [number, number] {
    const n = MAPO_RIVER_SYSTEMS.length;
    return [(system * 2 + 1) / (n * 2), 0.5];
}

const TINT_RGBA: readonly [number, number, number, number] = [
    MAPO_RIVER_TINT[0] / 255, MAPO_RIVER_TINT[1] / 255, MAPO_RIVER_TINT[2] / 255, 1,
];

export class MapoRiverRenderer {
    private batch: MapoBatch | null = null;
    private material: Material | null = null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    /**
     * @returns 本帧裁剪出来的片（⚠ 同一批要喂给 `MapoTopRenderer`，⛔ 别让它再裁一遍）。
     */
    render(rect: IMapoWorldRectLike, enabled: boolean): MapoPolygonInput[] {
        if (this.disposed) return [];
        const texture = this.art?.riverFill ?? null;
        if (!texture || !enabled || !mapoHasRivers()) { this.clear(); return []; }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true);
            this.material.setProperty("mainTexture", texture);
        }
        const polys = mapoRiversInRect(rect, MAPO_RIVER_MAX_PIECES, uvOfSystem, TINT_RGBA);
        if (polys.length === 0) { this.clear(); return []; }
        const geometry = buildMapoPolygonMesh(polys);
        if (!this.batch) {
            this.batch = createMapoBatch(this.root, "mapo-rivers", geometry, this.material);
        } else {
            uploadMapoBatch(this.batch, geometry);
        }
        return polys;
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
