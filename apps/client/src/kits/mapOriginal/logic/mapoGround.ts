/**
 * 地表底层：**一块 10×10 格 + 一张底纹整数次 GL_REPEAT**。纯逻辑，⛔ 不碰 cc。
 *
 * ★ 这是原版的做法（docs/MAPORIGINAL-2D.md §1.4），⛔ **不是「每格一块菱形地砖」** ——
 *   UV 是**世界轴对齐**的线性映射，底纹**不跟着菱形转**，观感是
 *   「一整张连续的大地毯被菱形裁出来」。
 * ★ 整张 S1 的底就是**一张** `underground1`（§1.5）⇒ 画面上的颜色变化
 *   **全部来自上层的 res_field 摆件与山体件**，⛔ 不来自地表底。
 * ⚠ 取整周期（横 11 纵 5）是为了让**块边界落在整周期上**，块与块之间不出现半个花纹的错茬；
 *   代价是微量拉伸 1.065× / 1.172×。⛔ 别为了"消除拉伸"改成非整数次。
 */
import {
    MAPO_TILE_HALF_H, MAPO_TILE_HALF_W, mapoGrid2Pos,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_GROUND_BLOCK_TILES, MAPO_GROUND_GRID_SIDE, MAPO_GROUND_ORIGIN,
    MAPO_GROUND_REPEAT_U, MAPO_GROUND_REPEAT_V,
} from "../../../shared/kits/mapOriginal/content/ground.data";

/** 一块在世界里的半宽 / 半高。 */
export const MAPO_GROUND_HALF_W = MAPO_GROUND_BLOCK_TILES * MAPO_TILE_HALF_W;
export const MAPO_GROUND_HALF_H = MAPO_GROUND_BLOCK_TILES * MAPO_TILE_HALF_H;

/**
 * 块的四个 UV 角（W / N / E / S），与原版 `GROUND_PIC_TBL` 同式。
 * ⚠ 归一化到「铺几次」：wrap = REPEAT 时 uv > 1 就是平铺，⛔ 不要再除以纹理尺寸。
 */
export const MAPO_GROUND_UV: readonly (readonly [number, number])[] = [
    [0, MAPO_GROUND_REPEAT_V / 2],                      // W
    [MAPO_GROUND_REPEAT_U / 2, 0],                      // N
    [MAPO_GROUND_REPEAT_U, MAPO_GROUND_REPEAT_V / 2],   // E
    [MAPO_GROUND_REPEAT_U / 2, MAPO_GROUND_REPEAT_V],   // S
];

export interface IMapoGroundBlock {
    readonly i: number;
    readonly j: number;
    /** 块**几何中心**的世界坐标。 */
    readonly x: number;
    readonly y: number;
}

export interface IMapoGroundRect {
    readonly left: number; readonly right: number;
    readonly bottom: number; readonly top: number;
}

/** 块下标 → 它覆盖的第一个逻辑格。 */
export function mapoGroundOriginCell(i: number): number {
    return MAPO_GROUND_BLOCK_TILES * i + MAPO_GROUND_ORIGIN;
}

/**
 * 块 (i, j) 的几何中心。
 * ⚠ 与原版同式：`grid2pos(R, C)` 再 `y -= (k−1)·halfH`（k = 10）——
 * ⛔ 不是「原点格的坐标」，也 ⛔ 不是「中心格的坐标」（中心落在格的半格处）。
 */
export function mapoGroundBlockPos(i: number, j: number): { x: number; y: number } {
    const p = mapoGrid2Pos(mapoGroundOriginCell(i), mapoGroundOriginCell(j));
    return { x: p.x, y: p.y - (MAPO_GROUND_BLOCK_TILES - 1) * MAPO_TILE_HALF_H };
}

/**
 * 菱形块与轴对齐矩形是否相交 —— **精确判**，⛔ 不是 AABB。
 *
 * ⚠ 块的 AABB 互相重叠（菱形铺面），只判 AABB 会把四个斜邻块也算进来（实测一点命中 5 块）。
 * 判法：换到缩放坐标 `u = (x−cx)/halfW`、`v = (y−cy)/halfH`，菱形就是 `|u| + |v| ≤ 1`；
 * 矩形在该坐标下仍是轴对齐矩形，且 u、v 相互独立 ⇒ `min|u| + min|v| ≤ 1` 即相交。
 */
function mapoGroundHits(cx: number, cy: number, rect: IMapoGroundRect): boolean {
    const u0 = (rect.left - cx) / MAPO_GROUND_HALF_W, u1 = (rect.right - cx) / MAPO_GROUND_HALF_W;
    const v0 = (rect.bottom - cy) / MAPO_GROUND_HALF_H, v1 = (rect.top - cy) / MAPO_GROUND_HALF_H;
    const mu = u0 <= 0 && u1 >= 0 ? 0 : Math.min(Math.abs(u0), Math.abs(u1));
    const mv = v0 <= 0 && v1 >= 0 ? 0 : Math.min(Math.abs(v0), Math.abs(v1));
    return mu + mv <= 1;
}

/**
 * 可视矩形内的块，**按画家序**（i+j 升序）。
 * ⚠ 块之间不重叠也不透明 ⇒ 次序其实无所谓；排序只为让上传的顶点序稳定、diff 可读。
 */
export function mapoGroundBlocksInRect(rect: IMapoGroundRect): IMapoGroundBlock[] {
    // 由矩形反推块下标范围：s = R+C、d = R−C，R = 10i−10、C = 10j−10
    const k = MAPO_GROUND_BLOCK_TILES;
    const sLo = -rect.top / MAPO_TILE_HALF_H - 1;
    const sHi = -rect.bottom / MAPO_TILE_HALF_H + 1;
    const dLo = rect.left / MAPO_TILE_HALF_W - 1;
    const dHi = rect.right / MAPO_TILE_HALF_W + 1;
    // i + j = (s + 2·|ORIGIN|) / k，i − j = d / k；四角取包围盒再逐块裁
    const ijLo = Math.floor((sLo - 2 * MAPO_GROUND_ORIGIN) / k) - 1;
    const ijHi = Math.ceil((sHi - 2 * MAPO_GROUND_ORIGIN) / k) + 1;
    const imjLo = Math.floor(dLo / k) - 1;
    const imjHi = Math.ceil(dHi / k) + 1;
    const out: IMapoGroundBlock[] = [];
    for (let sum = Math.max(0, ijLo); sum <= ijHi; sum += 1) {
        for (let diff = imjLo; diff <= imjHi; diff += 1) {
            if (((sum + diff) & 1) !== 0) continue;       // i、j 必须都是整数
            const i = (sum + diff) / 2, j = (sum - diff) / 2;
            if (i < 0 || j < 0 || i >= MAPO_GROUND_GRID_SIDE || j >= MAPO_GROUND_GRID_SIDE) continue;
            const p = mapoGroundBlockPos(i, j);
            if (!mapoGroundHits(p.x, p.y, rect)) continue;
            out.push({ i, j, x: p.x, y: p.y });
        }
    }
    out.sort((a, b) => (a.i + a.j - b.i - b.j) || (a.i - a.j - b.i + b.j));
    return out;
}
