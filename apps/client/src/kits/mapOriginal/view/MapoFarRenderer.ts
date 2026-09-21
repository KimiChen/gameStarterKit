/**
 * 远档渲染：整幅底图（带贴图的一个四边形）。
 *
 * ⚠ 底图的世界矩形来自 mapoPlateBounds()（= mapoWorldBounds()），与 bake_content.py 烘图
 * 同一个函数 ⇒ **对齐是构造出来的**，⛔ 不用标定。
 * ⚠ 这也是为什么远档底图是**自己烘的**而不是直接贴原版鸟瞰图：原版那张是 3D 相机的透视
 * 渲染，与正交等距 ⛔ 不存在可靠 2D 对齐（实测 IoU 0.62 / NCC 0.30 / 全仿射退化）。
 * ⛔ v1 无鸟瞰聚合色块（那要服务端分块摘要）。
 */
import { Material, Node } from "cc";
import { mapoPlateBounds, mapoPlateLodOf } from "../logic/mapoFar";
import { buildMapoPlateMesh } from "../logic/mapoMesh";
import { MAPO_TEXTURED_TINT, mapoCompensate } from "../logic/mapoPalette";
import type { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoPipelineToneMapping,
    mapoUnlitTechnique, uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

export class MapoFarRenderer {
    private plate: MapoBatch | null = null;
    private plateLod: 4 | 5 | 0 = 0;
    private readonly plateMaterials = new Map<number, Material>();
    private readonly tone: number;
    private readonly technique: number;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null) {
        this.technique = mapoUnlitTechnique();
        this.tone = mapoPipelineToneMapping();
    }

    private plateMaterial(lod: 4 | 5): Material | null {
        const texture = lod === 5 ? this.art?.plate5 : this.art?.plate4;
        if (!texture) return null;
        const hit = this.plateMaterials.get(lod);
        if (hit) return hit;
        const material = createMapoMaterial(this.technique, true);
        material.setProperty("mainTexture", texture);
        this.plateMaterials.set(lod, material);
        return material;
    }

    render(logic: MapOriginalWorldLogic): void {
        if (this.disposed) return;
        const wanted = mapoPlateLodOf(logic.camera.lod);
        const material = this.plateMaterial(wanted);
        if (material) {
            // 换档要换贴图 ⇒ 换材质 ⇒ 这张批次要重建
            if (this.plate && this.plateLod !== wanted) {
                destroyMapoBatch(this.plate);
                this.plate = null;
            }
            // ⚠ 贴了图集就取纯白：顶点色是**相乘**的，拿地形色去乘会把底图整体染一遍
            const tint = mapoCompensate(MAPO_TEXTURED_TINT, this.tone);
            const geometry = buildMapoPlateMesh(mapoPlateBounds(),
                [tint[0] / 255, tint[1] / 255, tint[2] / 255, 1]);
            if (!this.plate) {
                this.plate = createMapoBatch(this.root, `mapo-plate-${wanted}`, geometry, material, 0);
                this.plateLod = wanted;
            } else {
                uploadMapoBatch(this.plate, geometry);
            }
        } else if (this.plate) {
            // 贴图没加载出来：⛔ 不留一张纯白板挡住色块
            destroyMapoBatch(this.plate);
            this.plate = null;
            this.plateLod = 0;
        }

    }

    /** 切回近档：底图整批撤掉。 */
    clear(): void {
        destroyMapoBatch(this.plate); this.plate = null;
        this.plateLod = 0;
    }

    dispose(): void {
        this.disposed = true;
        destroyMapoBatch(this.plate); this.plate = null;
        for (const material of this.plateMaterials.values()) material.destroy();
        this.plateMaterials.clear();
    }
}
