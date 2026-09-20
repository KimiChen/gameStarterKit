/**
 * 远档渲染：整幅底图（带贴图的一个四边形）+ 鸟瞰聚合色块。
 * 兄弟序 = 绘制序：底图(0) → 色块(1)。
 *
 * ⚠ 底图的世界矩形来自 sgzzPlateBounds()（= sgzzWorldBounds()），与管线烘图同一个函数 ⇒
 * 对齐是构造出来的，⛔ 不用标定。
 */
import { Material, Node } from "cc";
import { sgzzBirdviewQuads } from "../logic/sgzzBirdview";
import { sgzzPlateBounds, sgzzPlateLodOf } from "../logic/sgzzFar";
import { buildSgzzPlateMesh, buildSgzzPolyMesh } from "../logic/sgzzMesh";
import { sgzzCompensate } from "../logic/sgzzPalette";
import type { SgzzmapWorldLogic } from "../logic/SgzzmapWorldLogic";
import {
    createSgzzBatch, createSgzzMaterial, destroySgzzBatch, sgzzPipelineToneMapping,
    sgzzUnlitTechnique, uploadSgzzBatch, type SgzzBatch,
} from "./SgzzMeshBatch";
import type { SgzzArtResources } from "./SgzzArtResources";

export class SgzzFarRenderer {
    private plate: SgzzBatch | null = null;
    private blocks: SgzzBatch | null = null;
    private plateLod: 4 | 5 | 0 = 0;
    private readonly plateMaterials = new Map<number, Material>();
    private readonly blockMaterial: Material;
    private readonly tone: number;
    private readonly technique: number;
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: SgzzArtResources | null) {
        this.technique = sgzzUnlitTechnique();
        this.blockMaterial = createSgzzMaterial(this.technique, false);
        this.tone = sgzzPipelineToneMapping();
    }

    private plateMaterial(lod: 4 | 5): Material | null {
        const texture = lod === 5 ? this.art?.plate5 : this.art?.plate4;
        if (!texture) return null;
        const hit = this.plateMaterials.get(lod);
        if (hit) return hit;
        const material = createSgzzMaterial(this.technique, true);
        material.setProperty("mainTexture", texture);
        this.plateMaterials.set(lod, material);
        return material;
    }

    render(logic: SgzzmapWorldLogic): void {
        if (this.disposed) return;
        const wanted = sgzzPlateLodOf(logic.camera.lod);
        const material = this.plateMaterial(wanted);
        if (material) {
            // 换档要换贴图 ⇒ 换材质 ⇒ 这张批次要重建
            if (this.plate && this.plateLod !== wanted) {
                destroySgzzBatch(this.plate);
                this.plate = null;
            }
            const geometry = buildSgzzPlateMesh(sgzzPlateBounds(), sgzzCompensate([1, 1, 1, 1], this.tone));
            if (!this.plate) {
                this.plate = createSgzzBatch(this.root, `sgzz-plate-${wanted}`, geometry, material, 0);
                this.plateLod = wanted;
            } else {
                uploadSgzzBatch(this.plate, geometry);
            }
        } else if (this.plate) {
            // 贴图没加载出来：⛔ 不留一张纯白板挡住色块
            destroySgzzBatch(this.plate);
            this.plate = null;
            this.plateLod = 0;
        }

        const quads = sgzzBirdviewQuads(logic.summaries.values(), logic.summaryAlliances,
            logic.viewer.uid, logic.viewer.aid, logic.summaryLevel, logic.mapRows, logic.mapCols)
            .map((q) => ({ points: q.points, rgba: sgzzCompensate(q.rgba, this.tone) }));
        if (quads.length === 0) {
            destroySgzzBatch(this.blocks);
            this.blocks = null;
            return;
        }
        const geometry = buildSgzzPolyMesh(quads);
        if (!this.blocks) {
            this.blocks = createSgzzBatch(this.root, "sgzz-birdview", geometry, this.blockMaterial);
        } else {
            uploadSgzzBatch(this.blocks, geometry);
        }
    }

    /** 切回近档：底图与色块整批撤掉。 */
    clear(): void {
        destroySgzzBatch(this.plate); this.plate = null;
        this.plateLod = 0;
        destroySgzzBatch(this.blocks); this.blocks = null;
    }

    dispose(): void {
        this.disposed = true;
        destroySgzzBatch(this.plate); this.plate = null;
        destroySgzzBatch(this.blocks); this.blocks = null;
        for (const material of this.plateMaterials.values()) material.destroy();
        this.plateMaterials.clear();
        this.blockMaterial.destroy();
    }
}
