import { Material, Node } from "cc";
import { mapoGridLineSprites } from "../logic/mapoGridLines";
import { buildMapoSpriteMeshes } from "../logic/mapoMesh";
import { syncMapoBatches, createMapoMaterial, clearMapoBatches, mapoUnlitTechnique, type MapoBatch } from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";
export class MapoGridRenderer {
    private readonly batches: MapoBatch[] = [];
    private material: Material | null = null;
    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}
    render(cells: readonly { row: number; col: number }[], enabled: boolean): void {
        if (!enabled || !this.art?.gridLine || !this.art.spriteEffect) { this.clear(); return; }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true, this.art.spriteEffect);
            this.material.setProperty("mainTexture", this.art.gridLine);
        }
        const geometry = buildMapoSpriteMeshes(mapoGridLineSprites(cells));
        syncMapoBatches(this.root, "mapo-grid-lines", this.batches, geometry, this.material);
    }
    clear(): void { clearMapoBatches(this.batches); }
    dispose(): void { this.clear(); this.material?.destroy(); this.material = null; }
}
