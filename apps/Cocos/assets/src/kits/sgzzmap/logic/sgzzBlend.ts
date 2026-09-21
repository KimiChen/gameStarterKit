/**
 * 地表过渡（blend）：把**上位地形的边缘**铺到下位地形那一格上，抹掉交界处的菱形锯齿。
 *
 * ⚠ ⛔ 不按「地形对」做：9 种地形 36 对 × 6 方向 = 216 张，这条路不走。
 * 过渡片 = **邻格地形自己的贴图** + 一条「贴边不透明、往格内化开」的逐顶点 alpha 斜坡，
 * 所以一套机制服务全部组合，零额外贴图。
 *
 * ⚠ 现在是**占位实现**：alpha 斜坡是线性的、化开前沿是直的。
 * 美术的过渡蒙版（见 `~/Downloads/maps/美术规范-过渡区域.md`）到货后换成带不规则前沿的蒙版，
 * 几何、优先级、变体机制不变。
 *
 * ⚠ 一条交界只画**一次**：只有低优先级的那一格画，⛔ 两边都画会互相糊。
 */
import {
    SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W, sgzzGrid2Pos, sgzzInBounds, sgzzRingTable,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";

/**
 * 地形优先级：**高的往低的那一格上铺边缘**。
 * ⚠ 下标即地形 id（0 平原 / 1 森林 / 2 丘陵 / 3 山地 / 4 水域 / 5 海 / 6 湿地 / 7 荒漠 / 8 图外）。
 * ⚠ 图外(8) 取 -1 = **不参与过渡**：它本来就是雾，往它上面铺边缘只会脏。
 */
export const SGZZ_BLEND_PRIORITY: readonly number[] = Object.freeze([
    0,   // 平原：最低，谁都能往它上面铺
    5,   // 森林
    2,   // 丘陵
    6,   // 山地
    7,   // 水域
    8,   // 海：最高
    4,   // 湿地
    1,   // 荒漠
    -1,  // 图外：⛔ 不参与
]);

/** 过渡带化开的深度区间（占「边界到格心」的比例）。⚠ 太浅看不出，太深会盖掉下面那格。 */
export const SGZZ_BLEND_DEPTH_MIN = 0.38;
export const SGZZ_BLEND_DEPTH_MAX = 0.62;

/** 菱形边界上的六个点（本格局部坐标）：S → W → NW中点 → N → E → SE中点。与描边同一套。 */
const RING: readonly (readonly [number, number])[] = [
    [0, -SGZZ_TILE_HALF_H],
    [-SGZZ_TILE_HALF_W, 0],
    [-SGZZ_TILE_HALF_W / 2, SGZZ_TILE_HALF_H / 2],
    [0, SGZZ_TILE_HALF_H],
    [SGZZ_TILE_HALF_W, 0],
    [SGZZ_TILE_HALF_W / 2, -SGZZ_TILE_HALF_H / 2],
];

/** 这一格朝 resDir 方向该不该铺过渡，铺的话铺哪种地形。-1 = 不铺。 */
export function sgzzBlendSource(terrainAt: (row: number, col: number) => number,
                                row: number, col: number, resDir: number,
                                rows: number, cols: number): number {
    const step = sgzzRingTable(row)[resDir - 1];
    if (!step) return -1;
    const nr = row + step[0], nc = col + step[1];
    if (!sgzzInBounds(nr, nc, rows, cols)) return -1;
    const mine = terrainAt(row, col), theirs = terrainAt(nr, nc);
    if (mine === theirs) return -1;
    const pm = SGZZ_BLEND_PRIORITY[mine] ?? -1, pt = SGZZ_BLEND_PRIORITY[theirs] ?? -1;
    // ⚠ 任一侧不参与就不铺；⚠ 严格大于 ⇒ 一条交界只有低的那一格画，⛔ 不会两边都糊
    if (pm < 0 || pt < 0 || pt <= pm) return -1;
    return theirs;
}

/**
 * 化开深度的变体。⚠ 位置 + 方向 的纯函数（⛔ 随机数会让平移时过渡带宽窄乱跳），
 * 混洗常数与「摆件种类」「摆件尺寸」「UV 翻转」都不同 —— ⛔ 同源会现出规律带。
 */
export function sgzzBlendDepth(row: number, col: number, resDir: number): number {
    let h = (row * 1103515245) ^ (col * 12345) ^ (resDir * 2654435761);
    h = (h ^ (h >>> 15)) * 2246822519;
    h = (h ^ (h >>> 13)) >>> 0;
    return SGZZ_BLEND_DEPTH_MIN + (h % 1000) / 1000 * (SGZZ_BLEND_DEPTH_MAX - SGZZ_BLEND_DEPTH_MIN);
}

/** 格内点 → 该格图集片的归一化局部 UV。菱形 N/E/S/W 对到片的四条边中点（与地表同约定）。 */
function localUv(dx: number, dy: number): readonly [number, number] {
    return [0.5 + 0.5 * dx / SGZZ_TILE_HALF_W, 0.5 - 0.5 * dy / SGZZ_TILE_HALF_H];
}

export interface SgzzBlendQuad {
    readonly points: readonly (readonly [number, number])[];
    /** 四个顶点的局部 UV（0..1，还需按图集片矩形映射）。 */
    readonly localUvs: readonly (readonly [number, number])[];
    /** 四个顶点的 alpha 系数：贴边两点 1，往格内两点 0。 */
    readonly alphas: readonly number[];
}

/**
 * 一格朝 resDir 方向的过渡片：从该方向的**共享边界段**往格心化开的四边形。
 *
 * ⚠ 贴边那两点 alpha = 1，⛔ 留一点透明就会在交界处露出硬线。
 * ⚠ UV 按**本格**的局部映射算（⛔ 不是按邻格）：邻格的贴图内容是各向同性的，
 *   按邻格算会让点落到片外、采到出血带。
 */
export function sgzzBlendQuad(row: number, col: number, resDir: number, depth: number): SgzzBlendQuad | null {
    if (!Number.isInteger(resDir) || resDir < 1 || resDir > 6) return null;
    const c = sgzzGrid2Pos(row, col);
    const a = RING[resDir - 1], b = RING[resDir % 6];
    const t = Math.max(0, Math.min(1, depth));
    // 往格心收 t：alpha 0 的那条内沿
    const ai: readonly [number, number] = [a[0] * (1 - t), a[1] * (1 - t)];
    const bi: readonly [number, number] = [b[0] * (1 - t), b[1] * (1 - t)];
    const pts: readonly (readonly [number, number])[] = [a, b, bi, ai];
    return {
        points: pts.map((p) => [c.x + p[0], c.y + p[1]] as const),
        localUvs: pts.map((p) => localUv(p[0], p[1])),
        alphas: [1, 1, 0, 0],
    };
}

/** 一屏过渡片的硬上限。超了整层不画，⛔ 不抛异常（它只是好看，不是功能）。 */
export const SGZZ_MAX_BLEND_QUADS = 12_000;
