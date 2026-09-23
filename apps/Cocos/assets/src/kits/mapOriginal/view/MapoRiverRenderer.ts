/**
 * 河流层渲染：原版水面多边形合批。
 *
 * ★ 几何与摆放全部来自原版（`river-geo.bin` + `rivers.bin`），⛔ 这里不做任何拼接/挑选。
 * ⚠ 必须画在地表**之上**、山族件与逐格摆件**之下**：原作的 `MAP_ZORDER` 里
 *   `RIVER(1600)` 在 `TERRAIN(300)` 之上、`RES(3400)` 之下（MAPORIGINAL-2D §2）。
 * ⚠ 三件（几何库 / 摆放表 / 填充图）缺一则整层不建 —— ⛔ 不用纯色多边形占位。
 */
import { Material, Node, Vec4 } from "cc";
import {
    MAPO_RIVER_SYSTEMS,
} from "../../../shared/kits/mapOriginal/content/river.data";
import { buildMapoPolygonMeshes, type MapoPolygonInput } from "../logic/mapoMesh";
import { mapoHasRivers, mapoRiversInRect, type IMapoWorldRectLike } from "../logic/mapoRivers";
import {
    syncMapoBatches, createMapoMaterial, clearMapoBatches, mapoUnlitTechnique,
    type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";


/** 填充图是 `三水系 × 2px` 宽、2px 高；取每块的中心texel。 */
function uvOfSystem(system: number): readonly [number, number] {
    const n = MAPO_RIVER_SYSTEMS.length;
    return [(system * 2 + 1) / (n * 2), 0.5];
}

export class MapoRiverRenderer {
    private readonly batches: MapoBatch[] = [];
    private material: Material | null = null;
    private disposed = false;
    private seconds = 0;
    private cameraX = 0;
    private cameraY = 0;
    private flow: boolean | null = null;
    tick(dt: number, x: number, y: number): void {
        this.seconds += dt; this.cameraX = x * 150 / 32; this.cameraY = y * 150 / 32;
        if (this.flow && this.material) this.material.setProperty("clockCamera", new Vec4(this.seconds, this.cameraX, this.cameraY, 0));
    }

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    /**
     * @returns 本帧裁剪出来的片（⚠ 同一批要喂给 `MapoTopRenderer`，⛔ 别让它再裁一遍）。
     */
    render(rect: IMapoWorldRectLike, enabled: boolean, waterFlow = true): MapoPolygonInput[] {
        if (this.disposed) return [];
        const flow = waterFlow && !!this.art?.riverEffect && !!this.art.riverMask && !!this.art.riverNormal;
        if (this.flow !== flow) { this.clear(); this.material?.destroy(); this.material = null; this.flow = flow; }
        const texture = flow ? this.art!.riverMask : this.art?.riverFill ?? null;
        if (!texture || !enabled || !mapoHasRivers()) { this.clear(); return []; }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true, flow ? this.art!.riverEffect : this.art?.spriteEffect);
            this.material.setProperty("mainTexture", texture);
            if (flow) {
                this.material.setProperty("normalTexture", this.art!.riverNormal);
                this.material.setProperty("clockCamera", new Vec4(this.seconds, this.cameraX, this.cameraY, 0));
            }
        }
        const polys = mapoRiversInRect(rect, Infinity, uvOfSystem, [1, 1, 1, 1]);
        if (polys.length === 0) { this.clear(); return []; }
        const geometry = buildMapoPolygonMeshes(polys);
        syncMapoBatches(this.root, "mapo-rivers", this.batches, geometry, this.material);
        return polys;
    }

    clear(): void {
        clearMapoBatches(this.batches);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.material?.destroy();
        this.material = null;
    }
}
