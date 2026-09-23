import { Material, Node } from "cc";
import { mapoSelectionSprites } from "../logic/mapoSelection";
import { buildMapoSpriteMesh } from "../logic/mapoMesh";
import { createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique, uploadMapoBatch, type MapoBatch } from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

export class MapoSelectionRenderer {
    private batch: MapoBatch | null = null;
    private material: Material | null = null;
    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}
    render(seconds: number): void {
        if (!this.art?.choose || !this.art.spriteEffect) return;
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true, this.art.spriteEffect);
            this.material.setProperty("mainTexture", this.art.choose);
        }
        const geometry = buildMapoSpriteMesh(mapoSelectionSprites(seconds));
        if (!this.batch) this.batch = createMapoBatch(this.root, "mapo-selection-2080", geometry, this.material);
        else uploadMapoBatch(this.batch, geometry);
    }
    dispose(): void {
        destroyMapoBatch(this.batch); this.batch = null;
        this.material?.destroy(); this.material = null;
    }
}
