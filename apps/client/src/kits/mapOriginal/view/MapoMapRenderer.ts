/**
 * 近档地表渲染：可视格 → 一张合并 mesh（图集贴片，缺图集则平涂顶点色）。
 *
 * ⚠ **必须是合并 mesh**：原作是每格一个场景节点（`grid_state_2d_view.lua` 逐格
 *   `sc_create_scene_node`），那在 Cocos 上会是成千上万个节点。
 * ⚠ 平移**只动父节点 transform**，⛔ 不重建网格；只有可视格集或数据变了才重建。
 * ⚠ 换档要换材质与 batch：`USE_TEXTURE` 是编译期宏，⛔ `setProperty` 切换不了。
 */
import { Material, Node } from "cc";
import {
    mapoAtlasUv, mapoTileVariant, MAPO_ATLAS_LODS,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { buildMapoDiamondMesh, MAPO_MAX_QUADS_PER_MESH, type MapoQuadInput } from "../logic/mapoMesh";
import { MAPO_TEXTURED_TINT, mapoBuildPalette, type MapoRgb } from "../logic/mapoPalette";
import { mapoDisplayClassAt } from "../logic/mapoTerrain";
import type { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";
import {
    createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoPipelineToneMapping,
    mapoUnlitTechnique, uploadMapoBatch, type MapoBatch,
} from "./MapoMeshBatch";
import type { MapoArtResources } from "./MapoArtResources";

export interface MapoVisibleCell { readonly row: number; readonly col: number }

export class MapoMapRenderer {
    private terrain: MapoBatch | null = null;
    private material: Material | null = null;
    private materialLod = -1;
    private readonly technique: number;
    private readonly tone: number;
    private palette: MapoRgb[] = [];
    private paletteKey = "";
    private disposed = false;

    constructor(private readonly root: Node, private readonly art: MapoArtResources | null,
                private readonly baseColors: readonly MapoRgb[]) {
        this.technique = mapoUnlitTechnique();
        this.tone = mapoPipelineToneMapping();
    }

    /** 图集只有 LOD0/1/2 有；没有就退回平涂（⛔ 不等资源，首帧要能画）。 */
    private ensureMaterial(lod: number): { material: Material; textured: boolean } {
        const texture = MAPO_ATLAS_LODS.includes(lod) ? this.art?.atlasFor(lod) ?? null : null;
        const textured = texture !== null;
        if (this.material && this.materialLod === lod) {
            return { material: this.material, textured };
        }
        // 贴图变了 mesh 的 material 也得跟着换 ⇒ 连 batch 一起销毁重建
        destroyMapoBatch(this.terrain);
        this.terrain = null;
        this.material?.destroy();
        this.material = createMapoMaterial(this.technique, textured);
        if (texture) this.material.setProperty("mainTexture", texture);
        this.materialLod = lod;
        return { material: this.material, textured };
    }

    private ensurePalette(logic: MapOriginalWorldLogic): void {
        const key = `${logic.graphics.colorMode}|${this.tone}`;
        if (key === this.paletteKey) return;
        this.palette = mapoBuildPalette(this.baseColors, logic.graphics.colorMode, this.tone);
        this.paletteKey = key;
    }

    render(logic: MapOriginalWorldLogic, cells: readonly MapoVisibleCell[]): void {
        if (this.disposed) return;
        const lod = logic.camera.lod;
        const { material, textured } = this.ensureMaterial(lod);
        this.ensurePalette(logic);

        const quads: MapoQuadInput[] = [];
        const limit = Math.min(cells.length, MAPO_MAX_QUADS_PER_MESH);
        for (let i = 0; i < limit; i += 1) {
            const { row, col } = cells[i];
            const id = mapoDisplayClassAt(row, col);
            // ⚠ 贴图时顶点色取纯白：顶点色是相乘的，拿地形色去乘会把贴图整体染一遍
            const c = textured ? MAPO_TEXTURED_TINT : (this.palette[id] ?? this.palette[0]);
            quads.push({
                row, col,
                uv: textured ? mapoAtlasUv(id) : null,
                flip: textured ? mapoTileVariant(row, col) : 0,
                rgba: [c[0] / 255, c[1] / 255, c[2] / 255, 1],
            });
        }
        if (quads.length === 0) {
            destroyMapoBatch(this.terrain);
            this.terrain = null;
            return;
        }
        const geometry = buildMapoDiamondMesh(quads, 0.5);
        if (!this.terrain) {
            this.terrain = createMapoBatch(this.root, "mapo-terrain", geometry, material, 0);
        } else {
            uploadMapoBatch(this.terrain, geometry);
        }
    }

    clear(): void {
        destroyMapoBatch(this.terrain);
        this.terrain = null;
    }

    dispose(): void {
        this.disposed = true;
        destroyMapoBatch(this.terrain);
        this.terrain = null;
        this.material?.destroy();
        this.material = null;
    }
}
