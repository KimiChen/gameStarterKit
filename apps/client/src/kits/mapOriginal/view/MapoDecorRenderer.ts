/**
 * 摆件层渲染：一批**原版切片**立在格上，合并成一张带贴图的 mesh。
 *
 * ★ 放什么完全由该格的**原版 res 值**查表定（`mapoDecorAt`），⛔ 这里不做任何筛选/抽稀。
 * ⚠ 必须画在地表**之上**、且按画家序排（摆件超出菱形、会互相叠压）。
 * ⚠ 图集没加载出来就整层不建 —— ⛔ 不用纯色方块占位（那比没有还难看）。
 */
import { Material, Node } from "cc";
import { compileMapoScene, createMapoScenePlayer, type MapoSceneProgram } from "../logic/mapoSceneCompiled";
import { MapoSpriteUpdates } from "../logic/mapoSpriteUpdates";
import type { IMapoPrefabNode } from "../../../shared/kits/mapOriginal/content/prefabs.types";
import { mapoDecorEnabledFor } from "../logic/mapoSettings";
import type { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";
import type { MapoArtResources } from "./MapoArtResources";
import { syncMapoSpriteUpdates, createMapoMaterial, clearMapoBatches, mapoUnlitTechnique, type MapoBatch } from "./MapoMeshBatch";

export class MapoDecorRenderer {
    private readonly batches: MapoBatch[] = [];
    private readonly geometry = new MapoSpriteUpdates();
    private readonly programs = new Map<IMapoPrefabNode, MapoSceneProgram>();
    private material: Material | null = null;
    private disposed = false;
    private seconds = 0;
    private key = "";
    private config: unknown = null;
    private visible = false;
    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}
    tick(dt: number): void { this.seconds += dt; if (dt > 0 && this.visible) this.flush(); }
    private flush(): void {
        if (!this.material) return;
        syncMapoSpriteUpdates(this.root, "mapo-decor", this.batches, this.geometry.read(this.seconds), this.geometry.batchCount, this.material);
    }
    render(logic: MapOriginalWorldLogic, cells: readonly { row: number; col: number }[]): number {
        if (this.disposed) return 0;
        const texture = this.art?.decorAtlas ?? null, enabled = mapoDecorEnabledFor(logic.graphics.quality);
        if (!texture || !enabled) { this.clear(); return 0; }
        if (!this.material) this.material = createMapoMaterial(mapoUnlitTechnique(), true, this.art?.spriteEffect);
        this.material.setProperty("mainTexture", texture);
        const data = logic.data.decor, key = cells.map(c => `${c.row},${c.col}`).join(";");
        if (this.config !== data.config || this.key !== key || !this.visible) {
            if (this.config !== data.config) this.programs.clear();
            this.config = data.config; this.key = key;
            const sources = [];
            for (const { row, col } of cells) {
                const p = data.mapoDecorAt(row, col, logic.data.terrain.mapoValueAt(row, col), enabled, logic.data.bands.mapoBandAt);
                if (!p) continue;
                let program = this.programs.get(p.cell.scene);
                if (!program) { program = compileMapoScene(p.cell.scene); this.programs.set(p.cell.scene, program); }
                sources.push(createMapoScenePlayer(program, data.textures, data.size, p));
            }
            this.geometry.reset(sources);
        }
        this.visible = true; this.flush(); return this.geometry.size;
    }
    clear(): void {
        this.visible = false; this.key = ""; this.config = null;
        this.geometry.clear(); this.programs.clear(); clearMapoBatches(this.batches);
    }
    dispose(): void { this.disposed = true; this.clear(); this.material?.destroy(); this.material = null; }
}
