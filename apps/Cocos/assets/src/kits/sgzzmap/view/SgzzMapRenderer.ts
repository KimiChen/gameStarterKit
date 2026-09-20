/**
 * 近档渲染：地表菱形 + 领地叠色 + 六向描边，各一张合并 mesh。
 *
 * ⚠ 一层一张合并 mesh（⛔ 不是每 chunk 一张）：per-chunk 会让跨 chunk 的绘制序随平移抖动。
 * ⚠ 领地叠色**必须**也是合并 mesh —— 原作是每格一个节点，那在 Cocos 上会是成千上万个节点。
 * 兄弟序 = 绘制序：地表(0) → 领地(1) → 描边(2)。
 */
import { Material, Node } from "cc";
import {
    SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W, sgzzGrid2Pos,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";
import { buildSgzzDiamondMesh, type SgzzQuadInput } from "../logic/sgzzMesh";
import { sgzzCompensate, sgzzStateColor, sgzzTerrainColor, type SgzzRgba } from "../logic/sgzzPalette";
import { sgzzTerrainIdAt } from "../logic/sgzzTerrain";
import type { SgzzmapWorldLogic } from "../logic/SgzzmapWorldLogic";
import {
    createSgzzBatch, createSgzzMaterial, destroySgzzBatch, sgzzPipelineToneMapping,
    sgzzUnlitTechnique, uploadSgzzBatch, type SgzzBatch,
} from "./SgzzMeshBatch";

const BORDER_RGBA: SgzzRgba = [1, 0.878, 0.467, 0.85];

export class SgzzMapRenderer {
    private terrain: SgzzBatch | null = null;
    private territory: SgzzBatch | null = null;
    private border: SgzzBatch | null = null;
    private readonly material: Material;
    private readonly tone: number;
    private disposed = false;

    constructor(private readonly root: Node) {
        this.material = createSgzzMaterial(sgzzUnlitTechnique(), false);
        this.tone = sgzzPipelineToneMapping();
    }

    render(logic: SgzzmapWorldLogic): void {
        if (this.disposed) return;
        const centre = logic.camera.centreCell();
        const terrainQuads: SgzzQuadInput[] = [];
        const territoryQuads: SgzzQuadInput[] = [];

        logic.stencil.forEach(centre.row, centre.col, logic.mapRows, logic.mapCols, (row, col) => {
            terrainQuads.push({
                row, col, uv: null,
                rgba: sgzzCompensate(sgzzTerrainColor(sgzzTerrainIdAt(row, col)), this.tone),
            });
            const colour = sgzzStateColor(logic.stateAt(row, col));
            if (colour) territoryQuads.push({ row, col, uv: null, rgba: sgzzCompensate(colour, this.tone) });
        });

        this.terrain = this.sync(this.terrain, "sgzz-terrain", terrainQuads, 0);
        this.territory = this.sync(this.territory, "sgzz-territory", territoryQuads, 1);
        this.border = this.sync(this.border, "sgzz-border", this.borderQuads(logic), 2);
    }

    /** 边片：在该格朝 resDir 方向的半边上压一条细菱形。⛔ 没有美术前先用几何顶色。 */
    private borderQuads(logic: SgzzmapWorldLogic): SgzzQuadInput[] {
        const rgba = sgzzCompensate(BORDER_RGBA, this.tone);
        const out: SgzzQuadInput[] = [];
        for (const edge of logic.borders.edges(logic.mapRows, logic.mapCols)) {
            out.push({ row: edge.row, col: edge.col, uv: null, rgba });
        }
        return out;
    }

    private sync(batch: SgzzBatch | null, name: string, quads: SgzzQuadInput[], at: number): SgzzBatch | null {
        if (quads.length === 0) {
            destroySgzzBatch(batch);
            return null;
        }
        const geometry = buildSgzzDiamondMesh(quads);
        if (!batch) return createSgzzBatch(this.root, name, geometry, this.material, Math.min(at, this.root.children.length));
        uploadSgzzBatch(batch, geometry);
        return batch;
    }

    /** 选中格的世界坐标与屏幕尺寸，交给 View 摆一个高亮框。 */
    static selectionRect(row: number, col: number, scale: number): {
        x: number; y: number; w: number; h: number;
    } {
        const p = sgzzGrid2Pos(row, col);
        return { x: p.x, y: p.y, w: SGZZ_TILE_HALF_W * 2 * scale, h: SGZZ_TILE_HALF_H * 2 * scale };
    }

    dispose(): void {
        this.disposed = true;
        destroySgzzBatch(this.terrain); this.terrain = null;
        destroySgzzBatch(this.territory); this.territory = null;
        destroySgzzBatch(this.border); this.border = null;
        this.material.destroy();
    }
}
