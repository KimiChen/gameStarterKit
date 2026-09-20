/**
 * 行军线渲染：简线（起点直连终点）+ 细线（逐格）+ 部队位置标记，合并成一张 mesh。
 * ⚠ 线宽要**按缩放反算**：网格建在世界坐标里、由父节点统一缩放，
 * 不反算的话缩远了线会细成一根头发丝。
 */
import { Material, Node } from "cc";
import { SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W } from "../../../shared/kits/sgzzmap/api/hexmap/index";
import { buildSgzzPolyMesh, writeSgzzSegmentQuad } from "../logic/sgzzMesh";
import { sgzzCompensate, type SgzzRgba } from "../logic/sgzzPalette";
import type { SgzzmapWorldLogic } from "../logic/SgzzmapWorldLogic";
import {
    createSgzzBatch, createSgzzMaterial, destroySgzzBatch, sgzzPipelineToneMapping,
    sgzzUnlitTechnique, uploadSgzzBatch, type SgzzBatch,
} from "./SgzzMeshBatch";

const SIMPLE: SgzzRgba = [0.408, 0.769, 0.949, 0.55];
const DETAIL: SgzzRgba = [0.984, 0.855, 0.494, 0.85];
const HEAD: SgzzRgba = [1, 0.965, 0.784, 1];
/** 屏幕上想要的线宽（设计像素）。 */
const SIMPLE_PX = 3;
const DETAIL_PX = 5;

export class SgzzMarchRenderer {
    private batch: SgzzBatch | null = null;
    private readonly material: Material;
    private readonly tone: number;
    private disposed = false;

    constructor(private readonly root: Node) {
        this.material = createSgzzMaterial(sgzzUnlitTechnique(), false);
        this.tone = sgzzPipelineToneMapping();
    }

    render(logic: SgzzmapWorldLogic): void {
        if (this.disposed) return;
        if (!logic.wantsMarchLines || logic.marchLines.size === 0) {
            destroySgzzBatch(this.batch);
            this.batch = null;
            return;
        }
        const scale = Math.max(1e-4, logic.camera.scale);
        const simpleHalf = SIMPLE_PX / 2 / scale;
        const detailHalf = DETAIL_PX / 2 / scale;
        const simple = sgzzCompensate(SIMPLE, this.tone);
        const detail = sgzzCompensate(DETAIL, this.tone);
        const head = sgzzCompensate(HEAD, this.tone);

        const polys: { points: readonly (readonly [number, number])[]; rgba: SgzzRgba }[] = [];
        for (const visual of logic.marchLines.visuals()) {
            const line = writeSgzzSegmentQuad(visual.simple.x0, visual.simple.y0,
                visual.simple.x1, visual.simple.y1, simpleHalf);
            if (line) polys.push({ points: line, rgba: simple });
            for (const seg of visual.detail) {
                const quad = writeSgzzSegmentQuad(seg.x0, seg.y0, seg.x1, seg.y1, detailHalf);
                if (quad) polys.push({ points: quad, rgba: detail });
            }
            // 部队位置：一个小菱形
            const hw = SGZZ_TILE_HALF_W * 0.45, hh = SGZZ_TILE_HALF_H * 0.45;
            polys.push({
                points: [
                    [visual.head.x, visual.head.y + hh], [visual.head.x + hw, visual.head.y],
                    [visual.head.x, visual.head.y - hh], [visual.head.x - hw, visual.head.y],
                ],
                rgba: head,
            });
        }
        if (polys.length === 0) {
            destroySgzzBatch(this.batch);
            this.batch = null;
            return;
        }
        const geometry = buildSgzzPolyMesh(polys);
        if (!this.batch) this.batch = createSgzzBatch(this.root, "sgzz-march", geometry, this.material);
        else uploadSgzzBatch(this.batch, geometry);
    }

    dispose(): void {
        this.disposed = true;
        destroySgzzBatch(this.batch); this.batch = null;
        this.material.destroy();
    }
}
