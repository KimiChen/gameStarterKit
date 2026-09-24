/**
 * 摆件层渲染：一批**原版切片**立在格上，合并成一张带贴图的 mesh。
 *
 * ★ 放什么完全由该格的**原版 res 值**查表定（`mapoDecorAt`），⛔ 这里不做任何筛选/抽稀。
 * ⚠ 必须画在地表**之上**、且按画家序排（摆件超出菱形、会互相叠压）。
 * ⚠ 图集没加载出来就整层不建 —— ⛔ 不用纯色方块占位（那比没有还难看）。
 */
import { Material, Node } from "cc";
import { mapoDecorAt } from "../logic/mapoDecor";
import { mapoSceneAnimated, mapoSceneSprites } from "../logic/mapoScene";
import { MAPO_DECOR_TEXTURES, MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H } from "../../../shared/kits/mapOriginal/content/decor.data";
import { buildMapoSpriteMeshes, type MapoSpriteInput } from "../logic/mapoMesh";
import { mapoDecorEnabledFor } from "../logic/mapoSettings";
import type { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";
import {
    syncMapoBatches, createMapoMaterial, clearMapoBatches, mapoUnlitTechnique,
    type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

export class MapoDecorRenderer {
    private readonly batches: MapoBatch[] = [];
    private material: Material | null = null;
    private disposed = false;
    private seconds = 0;
    private animated = false;
    private visible: { logic: MapOriginalWorldLogic; cells: readonly { row: number; col: number }[] } | null = null;

    tick(dt: number): void {
        this.seconds += dt;
        if (dt > 0 && this.visible && this.animated) {
            this.render(this.visible.logic, this.visible.cells);
        }
    }

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    /** @returns 真的立起来的摆件数（进状态行当重放证据，⛔ 不让重放去读内部状态）。 */
    render(logic: MapOriginalWorldLogic, cells: readonly { row: number; col: number }[]): number {
        if (this.disposed) return 0;
        const texture = this.art?.decorAtlas ?? null;
        const enabled = mapoDecorEnabledFor(logic.graphics.quality);
        if (!texture || !enabled) { this.clear(); return 0; }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true, this.art?.spriteEffect);
            this.material.setProperty("mainTexture", texture);
        }
        this.visible = { logic, cells };
        this.animated = false;
        const sprites: MapoSpriteInput[] = [];
        for (const { row, col } of cells) {
            const place = mapoDecorAt(row, col, logic.data.terrain.mapoValueAt(row, col), enabled, logic.data.bands.mapoBandAt);
            if (!place) continue;
            this.animated = this.animated || mapoSceneAnimated(place.cell.scene);
            sprites.push(...mapoSceneSprites(place.cell.scene, MAPO_DECOR_TEXTURES,
                [MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H], this.seconds, place));
        }
        if (sprites.length === 0) { this.clear(); return 0; }
        const geometry = buildMapoSpriteMeshes(sprites);
        syncMapoBatches(this.root, "mapo-decor", this.batches, geometry, this.material);
        return sprites.length;
    }

    clear(): void {
        this.visible = null;
        clearMapoBatches(this.batches);
    }

    dispose(): void {
        this.disposed = true;
        this.visible = null;
        clearMapoBatches(this.batches);
        this.material?.destroy();
        this.material = null;
    }
}
