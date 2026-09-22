/**
 * 远档底图与缩略图的坐标学。⛔ 不碰 cc，只算几何。
 *
 * ⚠ 底图的世界矩形**由 mapoWorldBounds() 算出来，不读 plate-lod*.info.json**：
 * 管线烘图时用的就是同一个函数（tools/maporiginal-assets/bake_content.py 用的就是同一式），
 * ⛔ 少读一个资源、少一处可能漂移的真源。
 */
import {
    MAPO_LOD_MAX, mapoGrid2Pos, mapoPos2GridRaw, mapoClampGrid,
    type IMapoWorldBounds, mapoWorldBounds,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";

/** 哪一档用哪张底图。⚠ 只烘了 lod4/lod5 两张（近三档的素材是区域特写，⛔ 不能当整幅底图）。 */
export function mapoPlateLodOf(lod: number): 4 | 5 {
    return lod >= MAPO_LOD_MAX ? 5 : 4;
}
export function mapoPlateAsset(lod: number): string {
    return `kits/mapOriginal/maps/s1/plate-lod${mapoPlateLodOf(lod)}`;
}
/** ⚠ 显示层地形走 BufferAsset：它塞不进 shared（熵太高），见 logic/mapoTerrain.ts。 */
export const MAPO_TERRAIN_ASSET = "kits/mapOriginal/maps/s1/terrain";
/** 摆件图集（原版切片打包，2048²）。 */
export const MAPO_DECOR_ATLAS_ASSET = "kits/mapOriginal/maps/s1/decor-atlas";
/** 多格地形的区域件图集与摆放表。 */
export const MAPO_REGION_ATLAS_ASSET = "kits/mapOriginal/maps/s1/region-atlas";
export const MAPO_REGIONS_ASSET = "kits/mapOriginal/maps/s1/regions";
/** 河流层：水面填充色图（三张原版 2×2 平色拼的 6×2）。 */
export const MAPO_RIVER_FILL_ASSET = "kits/mapOriginal/maps/s1/river-fill";
/** 河流层：几何库（102 条原版多边形）。 */
export const MAPO_RIVER_GEO_ASSET = "kits/mapOriginal/maps/s1/river-geo";
/** 河流层：摆放表。 */
export const MAPO_RIVERS_ASSET = "kits/mapOriginal/maps/s1/rivers";
/** 地表底纹（256² POT，wrap = REPEAT）。⛔ 不进图集：图集里没法 GL_REPEAT。 */
export const MAPO_GROUND_BASE_ASSET = "kits/mapOriginal/maps/s1/ground-base";
/** snow / desert 块层：底纹 / 几何库 / 摆放表。 */
export function mapoBlockBaseAsset(kind: string): string {
    return `kits/mapOriginal/maps/s1/${kind}-base`;
}
export function mapoBlockGeoAsset(kind: string): string {
    return `kits/mapOriginal/maps/s1/${kind}-geo`;
}
export function mapoBlockTableAsset(kind: string): string {
    return `kits/mapOriginal/maps/s1/${kind}`;
}
/** `_top_group` 手摆细节：每族一张图集 + 一份摆放库。 */
export function mapoTopAtlasAsset(kind: string): string {
    return `kits/mapOriginal/maps/s1/${kind}-top-atlas`;
}
export function mapoTopsAsset(kind: string): string {
    return `kits/mapOriginal/maps/s1/${kind}-tops`;
}
export const MAPO_MINIMAP_ASSET = "kits/mapOriginal/maps/s1/minimap";
/*
 * ⚠ 这里**故意没有**近档地表图集（M2-B1 删除）：那是「8 粗类 × 4 变体的逐格菱形贴片」，
 *   是本仓**自创**的做法，与原版直接矛盾 —— 原版的地表底是「一块 10×10 格 + 一张底纹
 *   整数次 GL_REPEAT」（MAPORIGINAL-2D §1.4），画面上的颜色变化全部来自上层的
 *   res_field 摆件与山体件。现在走 `MAPO_GROUND_BASE_ASSET`。⛔ 别把逐格图集加回来。
 */

export function mapoPlateBounds(): IMapoWorldBounds {
    return mapoWorldBounds();
}

// ── 缩略图坐标 ───────────────────────────────────────────────────────────────
//
// minimap.png 是正方（size×size），内容是把 2:1 的世界包围盒缩到 size×size/2 后**垂直居中**
// （bake-minimap.py）。所以世界 → 缩略图像素要带上下留白。

export interface IMapoMinimapPoint { readonly x: number; readonly y: number }

/** 世界坐标 → 缩略图内的归一化位置（0..1，y 向下）。 */
export function mapoWorldToMinimap(wx: number, wy: number): IMapoMinimapPoint {
    const b = mapoPlateBounds();
    const u = (wx - b.minX) / (b.maxX - b.minX);
    const v = (b.maxY - wy) / (b.maxY - b.minY);
    return { x: u, y: 0.25 + v * 0.5 };   // 上下各留 1/4
}
/** 缩略图归一化位置 → 世界坐标。⚠ 上下留白区要夹回内容带，⛔ 不能算出图外的世界点。 */
export function mapoMinimapToWorld(u: number, v: number): { x: number; y: number } {
    const b = mapoPlateBounds();
    const cu = Math.max(0, Math.min(1, u));
    const cv = Math.max(0, Math.min(1, (v - 0.25) / 0.5));
    return { x: b.minX + cu * (b.maxX - b.minX), y: b.maxY - cv * (b.maxY - b.minY) };
}
/** 缩略图上点一下 → 跳到哪一格。 */
export function mapoMinimapCell(u: number, v: number): { row: number; col: number } {
    const w = mapoMinimapToWorld(u, v);
    const raw = mapoPos2GridRaw(w.x, w.y);
    return mapoClampGrid(raw.row, raw.col);
}
/** 当前视口在缩略图里的框（归一化，已钳在 0..1）。 */
export function mapoMinimapViewport(centreX: number, centreY: number, width: number, height: number,
                                    scale: number): { x: number; y: number; w: number; h: number } {
    const halfW = width / scale / 2, halfH = height / scale / 2;
    const a = mapoWorldToMinimap(centreX - halfW, centreY + halfH);
    const c = mapoWorldToMinimap(centreX + halfW, centreY - halfH);
    const x0 = Math.max(0, Math.min(1, a.x)), y0 = Math.max(0, Math.min(1, a.y));
    const x1 = Math.max(0, Math.min(1, c.x)), y1 = Math.max(0, Math.min(1, c.y));
    return { x: x0, y: y0, w: Math.max(0.01, x1 - x0), h: Math.max(0.01, y1 - y0) };
}

/** 某格在缩略图里的归一化位置（标记用）。 */
export function mapoMinimapMark(row: number, col: number): IMapoMinimapPoint {
    const p = mapoGrid2Pos(row, col);
    return mapoWorldToMinimap(p.x, p.y);
}
