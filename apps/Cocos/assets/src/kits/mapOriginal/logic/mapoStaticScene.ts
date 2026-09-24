/** 静态缓存与概览烘焙共用的场景展开；所有坐标、UV、锚点仍由近景同一套逻辑提供。 */
import { mapoGrid2Pos, MAPO_MAP_ROWS, MAPO_MAP_COLS, MAPO_TILE_HALF_W, MAPO_TILE_HALF_H } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { MAPO_DECOR_TEXTURES, MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H } from "../../../shared/kits/mapOriginal/content/decor.data";
import { MAPO_REGION_ATLAS_W, MAPO_REGION_ATLAS_H } from "../../../shared/kits/mapOriginal/content/region.data";
import { MAPO_RIVER_SYSTEMS } from "../../../shared/kits/mapOriginal/content/river.data";
import { buildMapoGroundMeshes, buildMapoPolygonMeshes, buildMapoSpriteMeshes, type MapoGeometry, type MapoSpriteInput } from "./mapoMesh";
import { mapoGroundBlocksInRect, MAPO_GROUND_HALF_W, MAPO_GROUND_HALF_H, MAPO_GROUND_UV, type IMapoGroundRect } from "./mapoGround";
import { mapoBlocksInRect } from "./mapoBlocks";
import { mapoTopsFor } from "./mapoTops";
import { mapoRegionsInRect, mapoRegionUv } from "./mapoRegions";
import { mapoRoadsInRect } from "./mapoRoads";
import { mapoRiversInRect } from "./mapoRivers";
import { mapoPrefabSkew, mapoPrefabUv } from "./mapoPrefab";
import { mapoDecorAt } from "./mapoDecor";
import { mapoSceneSprites } from "./mapoScene";
import { mapoValueAt } from "./mapoTerrain";
import type { IMapoPrefabCell } from "../../../shared/kits/mapOriginal/content/prefabs.types";

export interface MapoStaticBatch {
    readonly texture: string;
    readonly repeat: boolean;
    readonly geometry: MapoGeometry;
}

export function mapoRegionSprites(rect: IMapoGroundRect): MapoSpriteInput[] {
    return mapoRegionsInRect(rect, Infinity).map((p) => ({
        row: p.piece.s, col: 0, x: p.x, y: p.y, w: p.w, h: p.h, angleDeg: p.angleDeg,
        pivot: p.cellLayout.pivot, skewBasis: mapoPrefabSkew(...p.cellLayout.skew, ...p.cellLayout.scale),
        rgba: p.cellLayout.color.map((v) => v / 255) as [number, number, number, number],
        addColor: p.cellLayout.add_color.map((v) => v / 255) as [number, number, number, number],
        uv: mapoPrefabUv(mapoRegionUv(p.cellLayout, MAPO_REGION_ATLAS_W, MAPO_REGION_ATLAS_H),
            p.cellLayout.mirror_x, p.cellLayout.mirror_y),
    }));
}

/** 资源件可以越过块边，按完整 prefab 展开后做实际几何相交；不按格心裁掉跨块部分。 */
export function mapoStaticDecorSprites(rect: IMapoGroundRect, seconds = 0,
    textures: readonly IMapoPrefabCell[] = MAPO_DECOR_TEXTURES,
    atlas: readonly [number, number] = [MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H]): MapoSpriteInput[] {
    // 当前资产最大外伸 < 256 世界像素；下面对实际顶点的回归测试守住这个内容契约。
    const margin = MAPO_STATIC_DECOR_MARGIN;
    const s0 = -(rect.top + margin) / MAPO_TILE_HALF_H - 2;
    const s1 = -(rect.bottom - margin) / MAPO_TILE_HALF_H + 2;
    const d0 = (rect.left - margin) / MAPO_TILE_HALF_W - 2;
    const d1 = (rect.right + margin) / MAPO_TILE_HALF_W + 2;
    const out: MapoSpriteInput[] = [];
    for (let row = Math.max(0, Math.floor((s0 + d0) / 2)); row <= Math.min(MAPO_MAP_ROWS - 1, Math.ceil((s1 + d1) / 2)); row++) {
        for (let col = Math.max(0, Math.floor((s0 - d1) / 2)); col <= Math.min(MAPO_MAP_COLS - 1, Math.ceil((s1 - d0) / 2)); col++) {
            const p = mapoGrid2Pos(row, col);
            if (p.x < rect.left - margin || p.x > rect.right + margin || p.y < rect.bottom - margin || p.y > rect.top + margin) continue;
            const place = mapoDecorAt(row, col, mapoValueAt(row, col), true);
            if (!place) continue;
            out.push(...mapoSceneSprites(place.cell.scene, textures, atlas, seconds, place));
        }
    }
    return out;
}
export const MAPO_STATIC_DECOR_MARGIN = 256;

/** 图层顺序与 MAPO_LAYER_ORDER 一致；中景保留每个资源件，区域概览只保留地貌。 */
export function mapoStaticScene(rect: IMapoGroundRect, resources: boolean, details = true, seconds = 0): MapoStaticBatch[] {
    const out: MapoStaticBatch[] = [];
    // top 件可伸出所属多边形；块邻域一并查询，最终由烘焙相机裁到像素边界。
    const sourceRect = { left: rect.left - 256, right: rect.right + 256, bottom: rect.bottom - 256, top: rect.top + 256 };
    const add = (texture: string, geometries: MapoGeometry[], repeat = false) => {
        for (const geometry of geometries) out.push({ texture, repeat, geometry });
    };
    add("ground-base", buildMapoGroundMeshes(mapoGroundBlocksInRect(rect).map((b) => ({
        key: b.i + b.j, x: b.x, y: b.y, halfW: MAPO_GROUND_HALF_W, halfH: MAPO_GROUND_HALF_H, uv: MAPO_GROUND_UV,
    }))), true);
    for (const kind of ["desert", "snow"]) {
        const polys = mapoBlocksInRect(kind, sourceRect, Infinity);
        add(`${kind}-base`, buildMapoPolygonMeshes(polys), true);
        add(`${kind}-top-atlas`, buildMapoSpriteMeshes(mapoTopsFor(kind, polys, Infinity, seconds)));
    }
    if (details) add("region-atlas", buildMapoSpriteMeshes(mapoRegionSprites(rect)));
    add("road-atlas", buildMapoSpriteMeshes(mapoRoadsInRect(rect, Infinity)));
    const rivers = mapoRiversInRect(sourceRect, Infinity,
        (s) => [(s * 2 + 1) / (MAPO_RIVER_SYSTEMS.length * 2), 0.5], [1, 1, 1, 1]);
    add("river-fill", buildMapoPolygonMeshes(rivers));
    add("river-top-atlas", buildMapoSpriteMeshes(mapoTopsFor("river", rivers, Infinity, seconds)));
    if (resources && details) add("decor-atlas", buildMapoSpriteMeshes(mapoStaticDecorSprites(rect, seconds)));
    return out;
}
