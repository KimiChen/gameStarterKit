/**
 * 近档渲染：地表菱形 + 网格线 + 领地叠色 + 六向描边，各一张合并 mesh。
 *
 * 地表有图集就贴图集、没有就平涂顶点色（⚠ 首帧必须能画：地形数据随代码走，⛔ 不等资源加载）。
 * 图集是逐档的（LOD0/1/2 各一张），换档要换贴图 ⇒ 材质与 batch 都要重建，⛔ 不能只换 UV。
 *
 * ⚠ 一层一张合并 mesh（⛔ 不是每 chunk 一张）：per-chunk 会让跨 chunk 的绘制序随平移抖动。
 * ⚠ 领地叠色**必须**也是合并 mesh —— 原作是每格一个节点，那在 Cocos 上会是成千上万个节点。
 * 兄弟序 = 绘制序：地表(0) → 网格线(1) → 领地(2) → 描边(3) → 摆件(4)。
 * ⚠ 摆件在最上：它是唯一**超出菱形**的一层，压在领地叠色之下就会被半透明的色块糊掉。
 * ⚠ 网格线压在领地叠色**下面**：叠色是半透明的，压上面会把格线糊成一片。
 */
import { Material, Node, Texture2D } from "cc";
import {
    SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W, sgzzAtlasUv, sgzzGrid2Pos, sgzzTileVariant,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_MAX_QUADS_PER_MESH, buildSgzzDiamondMesh, buildSgzzPolyMesh, sgzzBorderStripPoly,
    sgzzGridEdgePolys, type SgzzQuadInput,
} from "../logic/sgzzMesh";
import { sgzzLayerVisible } from "../logic/sgzzLayers";
import { sgzzCompensate, sgzzStateColor, sgzzTerrainColor, type SgzzRgba } from "../logic/sgzzPalette";
import { sgzzTerrainIdAt } from "../logic/sgzzTerrain";
import type { SgzzmapWorldLogic } from "../logic/SgzzmapWorldLogic";
import type { SgzzArtResources } from "./SgzzArtResources";
import {
    SGZZ_MAX_DECOR_QUADS, sgzzDecorAt, sgzzDecorQuad, SGZZ_DECOR_NONE,
} from "../logic/sgzzDecor";
import { sgzzPainterCompare } from "../logic/sgzzMesh";
import {
    createSgzzBatch, createSgzzMaterial, destroySgzzBatch, sgzzPipelineToneMapping,
    sgzzUnlitTechnique, uploadSgzzBatch, type SgzzBatch,
} from "./SgzzMeshBatch";

const BORDER_RGBA: SgzzRgba = [1, 0.878, 0.467, 0.85];
/**
 * 网格线：压在地表上的一层淡黑。⚠ 太重会盖住地形色，太轻在浅色地形上看不见。
 * ⚠ 0.13 是**贴上真实纹理之后**定的：平涂时 0.2 才看得见，有纹理后同样的值会把整片地读成铺地砖。
 */
const GRID_RGBA: SgzzRgba = [0, 0, 0, 0.13];
/** 贴图层的顶点色。⚠ 顶点色相乘 ⇒ 必须是纯白，否则贴图被整体染一遍。 */
const WHITE: SgzzRgba = [1, 1, 1, 1];
/** 网格线的**屏幕**宽度（设计像素）。世界宽 = 它 / scale，⛔ 别写成固定世界宽。 */
const GRID_LINE_PX = 1;

type SgzzPoly = { readonly points: readonly (readonly [number, number])[]; readonly rgba: SgzzRgba };

export class SgzzMapRenderer {
    private terrain: SgzzBatch | null = null;
    private grid: SgzzBatch | null = null;
    private decor: SgzzBatch | null = null;
    private territory: SgzzBatch | null = null;
    private border: SgzzBatch | null = null;
    private readonly material: Material;
    private readonly tone: number;
    private disposed = false;
    /** 当前地表材质与它绑的图集。⚠ 贴图换了必须换材质，⛔ setProperty 改不动 USE_TEXTURE 宏。 */
    private terrainMaterial: Material | null = null;
    private terrainTexture: Texture2D | null = null;
    private art: SgzzArtResources | null = null;

    constructor(private readonly root: Node) {
        this.material = createSgzzMaterial(sgzzUnlitTechnique(), false);
        this.tone = sgzzPipelineToneMapping();
    }

    /** 素材到货后灌进来。⚠ 在此之前地表走平涂，⛔ 不阻塞首帧。 */
    setArt(art: SgzzArtResources | null): void { this.art = art; }

    /**
     * 这一档地表该用的材质：有图集就贴图集，否则平涂。
     * ⚠ 换贴图要**重建材质与 batch**：mesh 的 material 是建 batch 时定的，
     *   而 USE_TEXTURE 是编译期宏，⛔ 不能靠 setProperty 切换。
     */
    private terrainMaterialFor(lod: number): { material: Material; textured: boolean } {
        const texture = this.art?.atlasFor(lod) ?? null;
        if (!texture) {
            if (this.terrainTexture !== null) {   // 从有图集退回平涂：丢掉旧材质
                this.terrainMaterial?.destroy(); this.terrainMaterial = null; this.terrainTexture = null;
                destroySgzzBatch(this.terrain); this.terrain = null;
            }
            return { material: this.material, textured: false };
        }
        if (texture !== this.terrainTexture || !this.terrainMaterial) {
            this.terrainMaterial?.destroy();
            this.terrainMaterial = createSgzzMaterial(sgzzUnlitTechnique(), true);
            this.terrainMaterial.setProperty("mainTexture", texture);
            this.terrainTexture = texture;
            destroySgzzBatch(this.terrain); this.terrain = null;   // 材质变了，batch 必须重建
        }
        return { material: this.terrainMaterial, textured: true };
    }

    render(logic: SgzzmapWorldLogic): void {
        if (this.disposed) return;
        const centre = logic.camera.centreCell();
        const terrainQuads: SgzzQuadInput[] = [];
        const territoryQuads: SgzzQuadInput[] = [];
        const gridPolys: SgzzPoly[] = [];
        const decorCells: { row: number; col: number; id: number }[] = [];
        const wantGrid = sgzzLayerVisible("grid", logic.camera.lod);
        const wantDecor = sgzzLayerVisible("decor", logic.camera.lod);
        const gridRgba = sgzzCompensate(GRID_RGBA, this.tone);
        // 线宽折算成世界单位：拉近了才不会变粗、拉远了才不会消失
        const gridHalf = GRID_LINE_PX / 2 / Math.max(0.01, logic.camera.scale);

        const terrainMat = this.terrainMaterialFor(logic.camera.lod);
        logic.stencil.forEach(centre.row, centre.col, logic.mapRows, logic.mapCols, (row, col) => {
            const id = sgzzTerrainIdAt(row, col);
            // ⚠ 贴图时顶点色取白：顶点色是**相乘**的，拿地形色去乘会把贴图整体染一遍。
            terrainQuads.push({
                row, col,
                uv: terrainMat.textured ? sgzzAtlasUv(id) : null,
                flip: sgzzTileVariant(row, col),
                rgba: terrainMat.textured ? WHITE : sgzzCompensate(sgzzTerrainColor(id), this.tone),
            });
            if (wantGrid) for (const poly of sgzzGridEdgePolys(row, col, gridHalf, gridRgba)) gridPolys.push(poly);
            if (wantDecor) {
                const decorId = sgzzDecorAt(id, row, col);
                if (decorId !== SGZZ_DECOR_NONE) decorCells.push({ row, col, id: decorId });
            }
            const colour = sgzzStateColor(logic.stateAt(row, col));
            if (colour) territoryQuads.push({ row, col, uv: null, rgba: sgzzCompensate(colour, this.tone) });
        });

        this.terrain = this.sync(this.terrain, "sgzz-terrain", terrainQuads, 0, terrainMat.material);
        this.grid = this.syncPoly(this.grid, "sgzz-grid", gridPolys, 1);
        this.territory = this.sync(this.territory, "sgzz-territory", territoryQuads, 2);
        // 描边比格线粗一点才看得出是「边」
        this.border = this.syncPoly(this.border, "sgzz-border", this.borderPolys(logic, gridHalf * 2.5), 3);
        this.decor = this.syncPoly(this.decor, "sgzz-decor", this.decorPolys(decorCells), 4);
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

    /**
     * 摆件四边形。⚠ 必须按**画家序**排：菱形网格上「屏幕越低 = 越靠前」，
     * 一棵树要挡住它**后面**那些格，⛔ 顺着可视模板的遍历序画会前后颠倒。
     */
    private decorPolys(cells: { row: number; col: number; id: number }[]): SgzzPoly[] {
        if (cells.length === 0 || cells.length > SGZZ_MAX_DECOR_QUADS) return [];
        cells.sort(sgzzPainterCompare);
        const out: SgzzPoly[] = [];
        for (const cell of cells) {
            const poly = sgzzDecorQuad(cell.row, cell.col, cell.id);
            if (poly) out.push(poly);
        }
        return out;
    }

    private sync(batch: SgzzBatch | null, name: string, quads: SgzzQuadInput[], at: number,
                 material: Material = this.material): SgzzBatch | null {
        if (quads.length === 0) {
            destroySgzzBatch(batch);
            return null;
        }
        const geometry = buildSgzzDiamondMesh(quads);
        if (!batch) return createSgzzBatch(this.root, name, geometry, material, Math.min(at, this.root.children.length));
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

    /** 切到远档：把近档五层整批撤掉，⛔ 不要留着挡在底图上。 */
    clear(): void {
        destroySgzzBatch(this.terrain); this.terrain = null;
        destroySgzzBatch(this.grid); this.grid = null;
        destroySgzzBatch(this.decor); this.decor = null;
        destroySgzzBatch(this.territory); this.territory = null;
        destroySgzzBatch(this.border); this.border = null;
    }

    dispose(): void {
        this.disposed = true;
        this.clear();
        this.material.destroy();
        this.terrainMaterial?.destroy();
        this.terrainMaterial = null; this.terrainTexture = null; this.art = null;
    }
}
