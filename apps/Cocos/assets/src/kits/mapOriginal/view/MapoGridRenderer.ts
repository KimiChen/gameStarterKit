import { Material, Node } from "cc";
import { mapoGridLineSprites } from "../logic/mapoGridLines";
import { buildMapoSpriteMesh } from "../logic/mapoMesh";
import { createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique, uploadMapoBatch, type MapoBatch } from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";
export class MapoGridRenderer {
    private batch: MapoBatch | null = null;
    private material: Material | null = null;
    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}
    render(cells: readonly { row: number; col: number }[], enabled: boolean): void {
        if (!enabled || !this.art?.gridLine || !this.art.spriteEffect) { this.clear(); return; }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true, this.art.spriteEffect);
            this.material.setProperty("mainTexture", this.art.gridLine);
        }
        const geometry = buildMapoSpriteMesh(mapoGridLineSprites(cells));
        if (!this.batch) this.batch = createMapoBatch(this.root, "mapo-grid-lines", geometry, this.material);
        else uploadMapoBatch(this.batch, geometry);
    }
    clear(): void { destroyMapoBatch(this.batch); this.batch = null; }
    dispose(): void { this.clear(); this.material?.destroy(); this.material = null; }
}
