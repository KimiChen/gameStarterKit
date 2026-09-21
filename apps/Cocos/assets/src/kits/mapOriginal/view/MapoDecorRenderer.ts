/**
 * 摆件层渲染：一批**原版切片**立在格上，合并成一张带贴图的 mesh。
 *
 * ⚠ 必须画在地表**之上**、且按画家序排（摆件超出菱形、会互相叠压）。
 * ⚠ 图集没加载出来就整层不建 —— ⛔ 不用纯色方块占位（那比没有还难看）。
 */
import { Material, Node } from "cc";
import { MAPO_TILE_HALF_W } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { mapoDecorAt, mapoDecorSize, mapoDecorUv } from "../logic/mapoDecor";
import { buildMapoSpriteMesh, type MapoSpriteInput } from "../logic/mapoMesh";
import { mapoDecorDensityFor } from "../logic/mapoSettings";
import { mapoDisplayClassAt } from "../logic/mapoTerrain";
import type { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique,
    uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

export class MapoDecorRenderer {
    private batch: MapoBatch | null = null;
    private material: Material | null = null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    render(logic: MapOriginalWorldLogic, cells: readonly { row: number; col: number }[]): void {
        if (this.disposed) return;
        const texture = this.art?.decorAtlas ?? null;
        const density = mapoDecorDensityFor(logic.graphics.quality);
        if (!texture || !(density > 0)) { this.clear(); return; }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true);
            this.material.setProperty("mainTexture", texture);
        }
        const sprites: MapoSpriteInput[] = [];
        for (const { row, col } of cells) {
            const place = mapoDecorAt(row, col, mapoDisplayClassAt(row, col), density);
            if (!place) continue;
            const size = mapoDecorSize(place.cell, MAPO_TILE_HALF_W, place.scale);
            sprites.push({
                row, col, x: place.x, y: place.y - MAPO_TILE_HALF_W / 4,
                w: size.w, h: size.h, uv: mapoDecorUv(place.cell),
            });
        }
        if (sprites.length === 0) { this.clear(); return; }
        const geometry = buildMapoSpriteMesh(sprites);
        if (!this.batch) {
            this.batch = createMapoBatch(this.root, "mapo-decor", geometry, this.material);
        } else {
            uploadMapoBatch(this.batch, geometry);
        }
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
