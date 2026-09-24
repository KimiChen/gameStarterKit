/**
 * 道路层渲染：路片合批。
 *
 * ⚠ 位置在地表与河流**之间**：原版 `MAP_ZORDER` 是
 *   `TERRAIN(300) < ROAD(900) < RIVER(1600)`（MAPORIGINAL-2D §2）。
 * ⚠ 路是**纯表现层**（§4.2）：⛔ 别拿它做通行/行军判定。
 */
import { Material, Node } from "cc";
import { buildMapoSpriteMeshes } from "../logic/mapoMesh";
import { type IMapoRoadRect } from "../logic/mapoRoads";
import {
    syncMapoBatches, createMapoMaterial, clearMapoBatches, mapoUnlitTechnique,
    type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";


export class MapoRoadRenderer {
    private readonly batches: MapoBatch[] = [];
    private material: Material | null = null;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    render(rect: IMapoRoadRect, enabled: boolean): number {
        if (this.disposed) return 0;
        const texture = this.art?.roadAtlas ?? null;
        if (!texture || !enabled || !this.art!.data.roads.mapoHasRoads()) { this.clear(); return 0; }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true, this.art?.spriteEffect);
            this.material.setProperty("mainTexture", texture);
        }
        const sprites = this.art!.data.roads.mapoRoadsInRect(rect, Infinity);
        if (sprites.length === 0) { this.clear(); return 0; }
        const geometry = buildMapoSpriteMeshes(sprites);
        syncMapoBatches(this.root, "mapo-roads", this.batches, geometry, this.material);
        return sprites.length;
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
