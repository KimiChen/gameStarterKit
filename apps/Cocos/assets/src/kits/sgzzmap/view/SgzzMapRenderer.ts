/**
 * 近档渲染：地表菱形 + 网格线 + 领地叠色 + 六向描边，各一张合并 mesh。
 *
 * ⚠ 一层一张合并 mesh（⛔ 不是每 chunk 一张）：per-chunk 会让跨 chunk 的绘制序随平移抖动。
 * ⚠ 领地叠色**必须**也是合并 mesh —— 原作是每格一个节点，那在 Cocos 上会是成千上万个节点。
 * 兄弟序 = 绘制序：地表(0) → 网格线(1) → 领地(2) → 描边(3)。
 * ⚠ 网格线压在领地叠色**下面**：叠色是半透明的，压上面会把格线糊成一片。
 */
import { Material, Node } from "cc";
import {
    SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W, sgzzGrid2Pos,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_MAX_QUADS_PER_MESH, buildSgzzDiamondMesh, buildSgzzPolyMesh, sgzzBorderStripPoly,
    sgzzGridEdgePolys, type SgzzQuadInput,
} from "../logic/sgzzMesh";
import { sgzzLayerVisible } from "../logic/sgzzLayers";
import { sgzzCompensate, sgzzStateColor, sgzzTerrainColor, type SgzzRgba } from "../logic/sgzzPalette";
import { sgzzTerrainIdAt } from "../logic/sgzzTerrain";
import type { SgzzmapWorldLogic } from "../logic/SgzzmapWorldLogic";
import {
    createSgzzBatch, createSgzzMaterial, destroySgzzBatch, sgzzPipelineToneMapping,
    sgzzUnlitTechnique, uploadSgzzBatch, type SgzzBatch,
} from "./SgzzMeshBatch";

const BORDER_RGBA: SgzzRgba = [1, 0.878, 0.467, 0.85];
/** 网格线：压在地表上的一层淡黑。⚠ 太重会盖住地形色，太轻在浅色地形上看不见。 */
const GRID_RGBA: SgzzRgba = [0, 0, 0, 0.2];
/** 网格线的**屏幕**宽度（设计像素）。世界宽 = 它 / scale，⛔ 别写成固定世界宽。 */
const GRID_LINE_PX = 1;

type SgzzPoly = { readonly points: readonly (readonly [number, number])[]; readonly rgba: SgzzRgba };

export class SgzzMapRenderer {
    private terrain: SgzzBatch | null = null;
    private grid: SgzzBatch | null = null;
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
        const gridPolys: SgzzPoly[] = [];
        const wantGrid = sgzzLayerVisible("grid", logic.camera.lod);
        const gridRgba = sgzzCompensate(GRID_RGBA, this.tone);
        // 线宽折算成世界单位：拉近了才不会变粗、拉远了才不会消失
        const gridHalf = GRID_LINE_PX / 2 / Math.max(0.01, logic.camera.scale);

        logic.stencil.forEach(centre.row, centre.col, logic.mapRows, logic.mapCols, (row, col) => {
            terrainQuads.push({
                row, col, uv: null,
                rgba: sgzzCompensate(sgzzTerrainColor(sgzzTerrainIdAt(row, col)), this.tone),
            });
            if (wantGrid) for (const poly of sgzzGridEdgePolys(row, col, gridHalf, gridRgba)) gridPolys.push(poly);
            const colour = sgzzStateColor(logic.stateAt(row, col));
            if (colour) territoryQuads.push({ row, col, uv: null, rgba: sgzzCompensate(colour, this.tone) });
        });

        this.terrain = this.sync(this.terrain, "sgzz-terrain", terrainQuads, 0);
        this.grid = this.syncPoly(this.grid, "sgzz-grid", gridPolys, 1);
        this.territory = this.sync(this.territory, "sgzz-territory", territoryQuads, 2);
        // 描边比格线粗一点才看得出是「边」
        this.border = this.syncPoly(this.border, "sgzz-border", this.borderPolys(logic, gridHalf * 2.5), 3);
    }

    /**
     * 边条：在该格朝 resDir 方向的边界上压一段中垂线条。⛔ 没有美术前先用几何顶色。
     * ⚠ 必须逐 resDir 画**条**，⛔ 不能每个边界方向铺一整格 —— 孤地有 6 个边界方向，
     *   叠 6 层 alpha 0.85 会把整格涂成不透明，底下的领地色全看不见。
     */
    private borderPolys(logic: SgzzmapWorldLogic, halfWidth: number): SgzzPoly[] {
        const rgba = sgzzCompensate(BORDER_RGBA, this.tone);
        const out: SgzzPoly[] = [];
        for (const edge of logic.borders.edges(logic.mapRows, logic.mapCols)) {
            const poly = sgzzBorderStripPoly(edge.row, edge.col, edge.resDir, halfWidth, rgba);
            if (poly) out.push(poly);
        }
        return out;
    }

    /** 任意四边形层（网格线）。⚠ 超过单 mesh 上限就整层撤掉：网格线是装饰，⛔ 不值得为它抛异常炸掉整页。 */
    private syncPoly(batch: SgzzBatch | null, name: string, polys: SgzzPoly[], at: number): SgzzBatch | null {
        if (polys.length === 0 || polys.length > SGZZ_MAX_QUADS_PER_MESH) {
            destroySgzzBatch(batch);
            return null;
        }
        const geometry = buildSgzzPolyMesh(polys);
        if (!batch) return createSgzzBatch(this.root, name, geometry, this.material, Math.min(at, this.root.children.length));
        uploadSgzzBatch(batch, geometry);
        return batch;
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

    /** 切到远档：把近档四层整批撤掉，⛔ 不要留着挡在底图上。 */
    clear(): void {
        destroySgzzBatch(this.terrain); this.terrain = null;
        destroySgzzBatch(this.grid); this.grid = null;
        destroySgzzBatch(this.territory); this.territory = null;
        destroySgzzBatch(this.border); this.border = null;
    }

    dispose(): void {
        this.disposed = true;
        this.clear();
        this.material.destroy();
    }
}
