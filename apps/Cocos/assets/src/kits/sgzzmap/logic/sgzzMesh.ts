/**
 * 菱形网格几何。产出的是**纯数组**（positions/uvs/colors/indices16），⛔ 不碰 cc。
 *
 * ⚠ 几何要点（已验算）：等距菱形以 a=(TW,TH)、b=(0.5TW,−1.5TH) 铺面，|det| = 2·TW·TH
 * 恰等于半对角 TW,TH 的菱形面积 ⇒ **无缝无叠**。每格 4 顶点 / 6 索引，顶点取 N/E/S/W 四点。
 * ⚠ 画家序是纯整数排序：(row+col) 升序、(row−col) 升序。⛔ 不要用浮点 y 去比。
 */
import {
    SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W, sgzzGrid2Pos,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";

export interface SgzzGeometry {
    readonly positions: Float32Array;
    readonly uvs: Float32Array;
    readonly colors: Float32Array;
    readonly indices16: Uint16Array;
    readonly quads: number;
    readonly minPos: readonly [number, number, number];
    readonly maxPos: readonly [number, number, number];
}
export interface SgzzQuadInput {
    readonly row: number;
    readonly col: number;
    /** 图集格（左上 u,v 与宽高，均为 0..1）；不贴图就传 null。 */
    readonly uv: readonly [number, number, number, number] | null;
    readonly rgba: readonly [number, number, number, number];
}

/** Uint16 索引上限 ⇒ 单个 mesh 的四边形数硬顶。超了必须拆 mesh。 */
export const SGZZ_MAX_QUADS_PER_MESH = 16_383;
/** 菱形四边中点的 UV（配合图集格的 2:1 尺寸）。 */
const DIAMOND_UV: readonly (readonly [number, number])[] = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];

/** 画家序比较：先 (row+col)，再 (row−col)。⛔ 两者都要，否则同一条斜线上的次序不稳定。 */
export function sgzzPainterCompare(a: { row: number; col: number }, b: { row: number; col: number }): number {
    const sa = a.row + a.col, sb = b.row + b.col;
    if (sa !== sb) return sa - sb;
    return (a.row - a.col) - (b.row - b.col);
}

/**
 * 把一批格铺成一张 mesh。入参会被就地排序成画家序。
 * 半像素内缩沿**对角**边法线收（⛔ 不是轴向），否则图集相邻格会渗色。
 */
export function buildSgzzDiamondMesh(quads: SgzzQuadInput[], inset = 0): SgzzGeometry {
    if (quads.length > SGZZ_MAX_QUADS_PER_MESH) {
        throw new RangeError(`SGZZ mesh quads ${quads.length} > ${SGZZ_MAX_QUADS_PER_MESH}`);
    }
    quads.sort(sgzzPainterCompare);
    const n = quads.length;
    const positions = new Float32Array(n * 4 * 3);
    const uvs = new Float32Array(n * 4 * 2);
    const colors = new Float32Array(n * 4 * 4);
    const indices16 = new Uint16Array(n * 6);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < n; i += 1) {
        const q = quads[i];
        const c = sgzzGrid2Pos(q.row, q.col);
        const hw = SGZZ_TILE_HALF_W, hh = SGZZ_TILE_HALF_H;
        // N, E, S, W
        const pts: readonly (readonly [number, number])[] = [
            [c.x, c.y + hh], [c.x + hw, c.y], [c.x, c.y - hh], [c.x - hw, c.y],
        ];
        for (let v = 0; v < 4; v += 1) {
            const px = pts[v][0], py = pts[v][1];
            positions[(i * 4 + v) * 3] = px;
            positions[(i * 4 + v) * 3 + 1] = py;
            positions[(i * 4 + v) * 3 + 2] = 0;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;

            if (q.uv) {
                const [u0, v0, uw, vh] = q.uv;
                // 朝格中心收 inset 比例，等价于沿四条对角边的法线内缩
                const du = (DIAMOND_UV[v][0] - 0.5) * (1 - inset) + 0.5;
                const dv = (DIAMOND_UV[v][1] - 0.5) * (1 - inset) + 0.5;
                uvs[(i * 4 + v) * 2] = u0 + du * uw;
                uvs[(i * 4 + v) * 2 + 1] = v0 + dv * vh;
            }
            for (let k = 0; k < 4; k += 1) colors[(i * 4 + v) * 4 + k] = q.rgba[k];
        }
        const base = i * 4;
        indices16.set([base, base + 1, base + 2, base, base + 2, base + 3], i * 6);
    }
    if (n === 0) { minX = minY = maxX = maxY = 0; }
    return {
        positions, uvs, colors, indices16, quads: n,
        minPos: [minX, minY, 0], maxPos: [maxX, maxY, 0],
    };
}

/** 一张整幅底图的四边形（远档用）。 */
export function buildSgzzPlateMesh(bounds: { minX: number; minY: number; maxX: number; maxY: number },
                                   rgba: readonly [number, number, number, number] = [1, 1, 1, 1]): SgzzGeometry {
    const positions = new Float32Array([
        bounds.minX, bounds.maxY, 0, bounds.maxX, bounds.maxY, 0,
        bounds.maxX, bounds.minY, 0, bounds.minX, bounds.minY, 0,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const colors = new Float32Array(16);
    for (let v = 0; v < 4; v += 1) for (let k = 0; k < 4; k += 1) colors[v * 4 + k] = rgba[k];
    return {
        positions, uvs, colors, indices16: new Uint16Array([0, 1, 2, 0, 2, 3]), quads: 1,
        minPos: [bounds.minX, bounds.minY, 0], maxPos: [bounds.maxX, bounds.maxY, 0],
    };
}

/**
 * 把一条线段铺成一个带宽度的四边形（行军线用）。
 * ⚠ 零长度线段要直接跳过，⛔ 否则法线是 NaN、整张 mesh 报废。
 */
export function writeSgzzSegmentQuad(x0: number, y0: number, x1: number, y1: number,
                                     halfWidth: number): readonly (readonly [number, number])[] | null {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-6)) return null;
    const nx = (-dy / len) * halfWidth, ny = (dx / len) * halfWidth;
    return [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
}

/** 由任意四边形（四角，顺时针或逆时针）铺 mesh；给行军线与鸟瞰色块共用。 */
export function buildSgzzPolyMesh(
    polys: readonly { readonly points: readonly (readonly [number, number])[]; readonly rgba: readonly [number, number, number, number] }[],
): SgzzGeometry {
    if (polys.length > SGZZ_MAX_QUADS_PER_MESH) {
        throw new RangeError(`SGZZ poly quads ${polys.length} > ${SGZZ_MAX_QUADS_PER_MESH}`);
    }
    const n = polys.length;
    const positions = new Float32Array(n * 4 * 3);
    const uvs = new Float32Array(n * 4 * 2);
    const colors = new Float32Array(n * 4 * 4);
    const indices16 = new Uint16Array(n * 6);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i += 1) {
        const { points, rgba } = polys[i];
        for (let v = 0; v < 4; v += 1) {
            const px = points[v][0], py = points[v][1];
            positions[(i * 4 + v) * 3] = px;
            positions[(i * 4 + v) * 3 + 1] = py;
            positions[(i * 4 + v) * 3 + 2] = 0;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            for (let k = 0; k < 4; k += 1) colors[(i * 4 + v) * 4 + k] = rgba[k];
        }
        const base = i * 4;
        indices16.set([base, base + 1, base + 2, base, base + 2, base + 3], i * 6);
    }
    if (n === 0) { minX = minY = maxX = maxY = 0; }
    return { positions, uvs, colors, indices16, quads: n, minPos: [minX, minY, 0], maxPos: [maxX, maxY, 0] };
}

/**
 * 一格的网格线：只画 **NE / SE** 两条边。
 *
 * ⚠ 平面上每条边恰好是某一格的 NE 或 SE 边（一格的 NE 边 = 右上邻格的 SW 边），
 * 所以逐格画两条就铺满整张网，⛔ 画四条会把每条内部边画两遍 ——
 * 四边形翻倍，而且半透明线叠加后会一深一浅，看起来像脏了。
 * ⚠ 线宽是**世界单位**：调用方要按 `屏幕像素 / scale` 折算，否则拉近了变粗、拉远了消失。
 */
export function sgzzGridEdgePolys(row: number, col: number, halfWidth: number,
                                  rgba: readonly [number, number, number, number]):
    { readonly points: readonly (readonly [number, number])[]; readonly rgba: readonly [number, number, number, number] }[] {
    const c = sgzzGrid2Pos(row, col);
    const hw = SGZZ_TILE_HALF_W, hh = SGZZ_TILE_HALF_H;
    const out: { points: readonly (readonly [number, number])[]; rgba: readonly [number, number, number, number] }[] = [];
    // N→E（右上边）与 E→S（右下边）
    for (const [x0, y0, x1, y1] of [
        [c.x, c.y + hh, c.x + hw, c.y],
        [c.x + hw, c.y, c.x, c.y - hh],
    ]) {
        const points = writeSgzzSegmentQuad(x0, y0, x1, y1, halfWidth);
        if (points) out.push({ points, rgba });
    }
    return out;
}

/**
 * 菱形边界上的六个点（本格局部坐标）：S → W → NW中点 → N → E → SE中点。
 *
 * ★ `resDir` i 的共享边界**正好**是第 i 段（RING[i-1] → RING[i%6]）——六段首尾相接绕一圈。
 * 其中 `resDir` 1（SW）与 4（NE）是**整条**菱形边；2/3（NW）与 5/6（SE）各是**半条**——
 * 这套铺法是「错缝砌砖」，NW / SE 两条边各挨着两个邻格，所以一人一半。
 * ⚠ 与行奇偶**无关**（两种奇偶实测一致）。
 */
const BORDER_RING: readonly (readonly [number, number])[] = [
    [0, -SGZZ_TILE_HALF_H],                          // S
    [-SGZZ_TILE_HALF_W, 0],                          // W
    [-SGZZ_TILE_HALF_W / 2, SGZZ_TILE_HALF_H / 2],   // NW 中点
    [0, SGZZ_TILE_HALF_H],                           // N
    [SGZZ_TILE_HALF_W, 0],                           // E
    [SGZZ_TILE_HALF_W / 2, -SGZZ_TILE_HALF_H / 2],   // SE 中点
];
/** 往格心收一点，让边条落在菱形**内缘**而不是骑在边上（骑着会和邻格的边条打架）。 */
const BORDER_INSET = 0.88;

/**
 * 一格在 resDir(1..6) 方向上的**边界条**：画在该方向真正的共享边界上，略向内收。
 *
 * ⛔ 早先两版都错过：
 *  ① 把 resDir 整个丢掉、每个边界方向铺一整格菱形 —— 孤地 6 个方向叠 6 层 alpha 0.85
 *    ⇒ 几乎不透明，把底下的领地色完全盖住（真机上那格是黄的而不是蓝的）；
 *  ② 改画「到邻格连线的中垂线」—— 方向对了但位置不对，六段互不相接、还戳出格外，
 *    看着像六道乱划的斜杠。共享边界不是中垂线，是上面 BORDER_RING 的那一段。
 */
export function sgzzBorderStripPoly(row: number, col: number, resDir: number, halfWidth: number,
                                    rgba: readonly [number, number, number, number]):
    { readonly points: readonly (readonly [number, number])[]; readonly rgba: readonly [number, number, number, number] } | null {
    if (!Number.isInteger(resDir) || resDir < 1 || resDir > 6) return null;
    const c = sgzzGrid2Pos(row, col);
    const a = BORDER_RING[resDir - 1], b = BORDER_RING[resDir % 6];
    const points = writeSgzzSegmentQuad(
        c.x + a[0] * BORDER_INSET, c.y + a[1] * BORDER_INSET,
        c.x + b[0] * BORDER_INSET, c.y + b[1] * BORDER_INSET, halfWidth);
    return points ? { points, rgba } : null;
}
