/**
 * 道路层渲染：路片合批。
 *
 * ⚠ 位置在地表与河流**之间**：原版 `MAP_ZORDER` 是
 *   `TERRAIN(300) < ROAD(900) < RIVER(1600)`（MAPORIGINAL-2D §2）。
 * ⚠ 路是**纯表现层**（§4.2）：⛔ 别拿它做通行/行军判定。
 */
import { Material, Node } from "cc";
import { buildMapoSpriteMesh } from "../logic/mapoMesh";
import { mapoHasRoads, mapoRoadsInRect, type IMapoRoadRect } from "../logic/mapoRoads";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique,
    uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

/** 一屏最多建多少片。⚠ 全图 4.2 万片；路格比逻辑格大 4/3，一屏几十片够用。 */
export const MAPO_ROAD_MAX_PIECES = 1_200;

export class MapoRoadRenderer {
    private batch: MapoBatch | null = null;
    private material: Material | null = null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    render(rect: IMapoRoadRect, enabled: boolean): number {
        if (this.disposed) return 0;
        const texture = this.art?.roadAtlas ?? null;
        if (!texture || !enabled || !mapoHasRoads()) { this.clear(); return 0; }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true);
            this.material.setProperty("mainTexture", texture);
        }
        const sprites = mapoRoadsInRect(rect, MAPO_ROAD_MAX_PIECES);
        if (sprites.length === 0) { this.clear(); return 0; }
        const geometry = buildMapoSpriteMesh(sprites);
        if (!this.batch) {
            this.batch = createMapoBatch(this.root, "mapo-roads", geometry, this.material);
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
