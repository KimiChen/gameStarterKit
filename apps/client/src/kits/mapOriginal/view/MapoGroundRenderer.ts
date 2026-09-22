/**
 * 地表底渲染：每块一个菱形，底纹靠 **GL_REPEAT** 平铺（M2-B1）。
 *
 * ★ 这是原版的做法（MAPORIGINAL-2D §1.4/§1.5）：整张 S1 的底就是**一张**
 *   `underground1`，UV 世界轴对齐、底纹不跟着菱形转。
 * ⚠ 贴图必须设 `WrapMode.REPEAT` 且是 POT —— ⛔ 图集里做不到 GL_REPEAT，
 *   所以它是**独立一张贴图**，⛔ 别塞回地表图集。
 * ⚠ 顶点色恒白：颜色变化来自上层的摆件与山体件，⛔ 不在这一层调色。
 */
import { Material, Node, Texture2D } from "cc";
import { buildMapoGroundMesh, type MapoGroundInput } from "../logic/mapoMesh";
import {
    MAPO_GROUND_HALF_H, MAPO_GROUND_HALF_W, MAPO_GROUND_UV,
    mapoGroundBlocksInRect, type IMapoGroundRect,
} from "../logic/mapoGround";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique,
    uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

export class MapoGroundRenderer {
    private batch: MapoBatch | null = null;
    private material: Material | null = null;
    private wrapped = false;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {}

    /** @returns 真的建出来的块数（进状态行当重放证据）。 */
    render(rect: IMapoGroundRect, enabled: boolean): number {
        if (this.disposed) return 0;
        const texture = this.art?.groundBase ?? null;
        if (!texture || !enabled) { this.clear(); return 0; }
        if (!this.wrapped) {
            // ⚠ 必须在建材质**之前**设：wrap 是采样器状态，改了要重新取 GFX 采样器
            texture.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
            this.wrapped = true;
        }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true);
            this.material.setProperty("mainTexture", texture);
        }
        const blocks: MapoGroundInput[] = mapoGroundBlocksInRect(rect).map((b) => ({
            key: b.i + b.j, x: b.x, y: b.y,
            halfW: MAPO_GROUND_HALF_W, halfH: MAPO_GROUND_HALF_H, uv: MAPO_GROUND_UV,
        }));
        if (blocks.length === 0) { this.clear(); return 0; }
        const geometry = buildMapoGroundMesh(blocks);
        if (!this.batch) {
            this.batch = createMapoBatch(this.root, "mapo-ground", geometry, this.material);
        } else {
            uploadMapoBatch(this.batch, geometry);
        }
        return blocks.length;
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
