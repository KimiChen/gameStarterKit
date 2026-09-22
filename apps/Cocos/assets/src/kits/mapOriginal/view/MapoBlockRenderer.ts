/**
 * snow / desert 的 **block 级地貌带**渲染：一层一个批、一张贴图、GL_REPEAT。
 *
 * ★ 三层是「**叠**」不是「替」（MAPORIGINAL-2D §1.3）：次序 ground(100) < desert(200) < snow(300)，
 *   同一块可以同时挂草地底 + 沙漠 + 雪（实测 489 块两者兼有）。
 * ⚠ 每层**必须各自一个批**：一个材质只能挂一张 mainTexture，
 *   ⛔ 别把两层塞进同一张 mesh（贴图会串）。
 * ⚠ 贴图与地表底一样要 POT + `WrapMode.REPEAT`。
 */
import { Material, Node, Texture2D } from "cc";
import { buildMapoPolygonMesh } from "../logic/mapoMesh";
import { mapoBlocksInRect, mapoHasBlocks, type IMapoBlockRect } from "../logic/mapoBlocks";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique,
    uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

/** 一屏最多建多少片。⚠ 全图 desert 4,762 + snow 4,186，远档一屏能框进上千片。 */
export const MAPO_BLOCK_MAX_PIECES = 900;

export class MapoBlockRenderer {
    private batch: MapoBatch | null = null;
    private material: Material | null = null;
    private wrapped = false;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null,
                private readonly kind: string) {}

    /** @returns 真的建出来的片数。 */
    render(rect: IMapoBlockRect, enabled: boolean): number {
        if (this.disposed) return 0;
        const texture = this.art?.blockBase(this.kind) ?? null;
        if (!texture || !enabled || !mapoHasBlocks(this.kind)) { this.clear(); return 0; }
        if (!this.wrapped) {
            texture.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
            this.wrapped = true;
        }
        if (!this.material) {
            this.material = createMapoMaterial(mapoUnlitTechnique(), true);
            this.material.setProperty("mainTexture", texture);
        }
        const polys = mapoBlocksInRect(this.kind, rect, MAPO_BLOCK_MAX_PIECES);
        if (polys.length === 0) { this.clear(); return 0; }
        const geometry = buildMapoPolygonMesh(polys);
        if (!this.batch) {
            this.batch = createMapoBatch(this.root, `mapo-block-${this.kind}`, geometry, this.material);
        } else {
            uploadMapoBatch(this.batch, geometry);
        }
        return polys.length;
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
