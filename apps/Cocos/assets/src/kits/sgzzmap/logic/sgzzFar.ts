/**
 * 远档底图与缩略图的坐标学。⛔ 不碰 cc，只算几何。
 *
 * ⚠ 底图的世界矩形**由 sgzzWorldBounds() 算出来，不读 plate-lod*.info.json**：
 * 管线烘图时用的就是同一个函数（tools/sgzzmap-maps/lib/projection.py 逐式对齐），
 * 已实测两边一致（-48000,-48008 → 47984,0）。少读一个资源、少一处可能漂移的真源。
 */
import {
    SGZZ_LOD_MAX, sgzzGrid2Pos, sgzzPos2GridRaw, sgzzClampGrid,
    type ISgzzWorldBounds, sgzzWorldBounds,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";

/** 哪一档用哪张底图。⚠ 只烘了 lod4/lod5 两张（近三档的素材是区域特写，⛔ 不能当整幅底图）。 */
export function sgzzPlateLodOf(lod: number): 4 | 5 {
    return lod >= SGZZ_LOD_MAX ? 5 : 4;
}
export function sgzzPlateAsset(lod: number): string {
    return `kits/sgzzmap/maps/zhongyuan/plate-lod${sgzzPlateLodOf(lod)}`;
}
export const SGZZ_MINIMAP_ASSET = "kits/sgzzmap/maps/zhongyuan/minimap";

export function sgzzPlateBounds(): ISgzzWorldBounds {
    return sgzzWorldBounds();
}

// ── 缩略图坐标 ───────────────────────────────────────────────────────────────
//
// minimap.png 是正方（size×size），内容是把 2:1 的世界包围盒缩到 size×size/2 后**垂直居中**
// （bake-minimap.py）。所以世界 → 缩略图像素要带上下留白。

export interface ISgzzMinimapPoint { readonly x: number; readonly y: number }

/** 世界坐标 → 缩略图内的归一化位置（0..1，y 向下）。 */
export function sgzzWorldToMinimap(wx: number, wy: number): ISgzzMinimapPoint {
    const b = sgzzPlateBounds();
    const u = (wx - b.minX) / (b.maxX - b.minX);
    const v = (b.maxY - wy) / (b.maxY - b.minY);
    return { x: u, y: 0.25 + v * 0.5 };   // 上下各留 1/4
}
/** 缩略图归一化位置 → 世界坐标。⚠ 上下留白区要夹回内容带，⛔ 不能算出图外的世界点。 */
export function sgzzMinimapToWorld(u: number, v: number): { x: number; y: number } {
    const b = sgzzPlateBounds();
    const cu = Math.max(0, Math.min(1, u));
    const cv = Math.max(0, Math.min(1, (v - 0.25) / 0.5));
    return { x: b.minX + cu * (b.maxX - b.minX), y: b.maxY - cv * (b.maxY - b.minY) };
}
/** 缩略图上点一下 → 跳到哪一格。 */
export function sgzzMinimapCell(u: number, v: number): { row: number; col: number } {
    const w = sgzzMinimapToWorld(u, v);
    const raw = sgzzPos2GridRaw(w.x, w.y);
    return sgzzClampGrid(raw.row, raw.col);
}
/** 当前视口在缩略图里的框（归一化，已钳在 0..1）。 */
export function sgzzMinimapViewport(centreX: number, centreY: number, width: number, height: number,
                                    scale: number): { x: number; y: number; w: number; h: number } {
    const halfW = width / scale / 2, halfH = height / scale / 2;
    const a = sgzzWorldToMinimap(centreX - halfW, centreY + halfH);
    const c = sgzzWorldToMinimap(centreX + halfW, centreY - halfH);
    const x0 = Math.max(0, Math.min(1, a.x)), y0 = Math.max(0, Math.min(1, a.y));
    const x1 = Math.max(0, Math.min(1, c.x)), y1 = Math.max(0, Math.min(1, c.y));
    return { x: x0, y: y0, w: Math.max(0.01, x1 - x0), h: Math.max(0.01, y1 - y0) };
}

/** 某格在缩略图里的归一化位置（标记用）。 */
export function sgzzMinimapMark(row: number, col: number): ISgzzMinimapPoint {
    const p = sgzzGrid2Pos(row, col);
    return sgzzWorldToMinimap(p.x, p.y);
}
