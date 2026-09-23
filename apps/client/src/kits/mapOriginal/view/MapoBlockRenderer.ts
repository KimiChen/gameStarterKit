/**
 * snow / desert 的 **block 级地貌带**渲染：一层按 16 位索引拆批、共用一张贴图、GL_REPEAT。
 *
 * ★ 三层是「**叠**」不是「替」（MAPORIGINAL-2D §1.3）：次序 ground(100) < desert(200) < snow(300)，
 *   同一块可以同时挂草地底 + 沙漠 + 雪（实测 489 块两者兼有）。
 * ⚠ 每层**必须各自一个批**：一个材质只能挂一张 mainTexture，
 *   ⛔ 别把两层塞进同一张 mesh（贴图会串）。
 * ⚠ 贴图与地表底一样要 POT + `WrapMode.REPEAT`。
 */
import { Material, Node, Texture2D } from "cc";
import { buildMapoPolygonMeshes, type MapoPolygonInput } from "../logic/mapoMesh";
import { mapoBlocksInRect, mapoHasBlocks, type IMapoBlockRect } from "../logic/mapoBlocks";
import {
    syncMapoBatches, createMapoMaterial, clearMapoBatches, mapoUnlitTechnique,
    type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";


export class MapoBlockRenderer {
    private readonly batches: MapoBatch[] = [];
    private material: Material | null = null;
    private wrapped = false;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null,
                private readonly kind: string) {}

    /**
     * @returns 本帧裁剪出来的片（⚠ 同一批要喂给 `MapoTopRenderer`，⛔ 别让它再裁一遍）。
     */
    render(rect: IMapoBlockRect, enabled: boolean): MapoPolygonInput[] {
        if (this.disposed) return [];
        const texture = this.art?.blockBase(this.kind) ?? null;
        if (!texture || !enabled || !mapoHasBlocks(this.kind)) { this.clear(); return []; }
        if (!this.wrapped) {
            texture.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
            this.wrapped = true;
        }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true, this.art?.spriteEffect);
            this.material.setProperty("mainTexture", texture);
        }
        const polys = mapoBlocksInRect(this.kind, rect, Infinity);
        if (polys.length === 0) { this.clear(); return []; }
        const geometry = buildMapoPolygonMeshes(polys);
        syncMapoBatches(this.root, `mapo-block-${this.kind}`, this.batches, geometry, this.material);
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
