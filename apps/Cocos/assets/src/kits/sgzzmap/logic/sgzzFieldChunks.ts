/**
 * 覆盖场的分块：哪些块要烘、烘多大、每帧烘几块。
 *
 * ⚠ 分块只是**缓存单元**，⛔ 不能成为视觉边界：同一世界位置的覆盖率/扰动/UV 必须与块无关。
 *   本文件只决定「烘哪一块」，场本身由 sgzzField 按**绝对 map 平面坐标**算，天然跨块一致。
 *
 * ⚠ 烘焙分辨率**不必**等于采样步长的理想值：权重场是低频的，
 *   小图 + GPU 双线性放大就够，⛔ 按 2 世界单位逐点烘会是 JS 里的灾难（每块上亿次运算）。
 */
import { SGZZ_FIELD_CELL_EDGE, SGZZ_FIELD_DEFAULTS, type SgzzFieldRect } from "./sgzzField";
import { sgzzToPlane } from "./sgzzField";
import { SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W } from "../../../shared/kits/sgzzmap/api/hexmap/index";

/** 一块覆盖多少格（map 平面上的边长 = 这个数 × R）。⚠ 越大越省 draw call，越小越好分帧。 */
export const SGZZ_FIELD_CHUNK_CELLS = 20;
/** 烘焙采样步长（世界单位）。⚠ 4 而不是规范里的 2：见文件头，⛔ 2 在 JS 里跑不动。 */
export const SGZZ_FIELD_BAKE_STEP = 4;
/**
 * 每帧最多烘几块。⚠ 一次全烘会卡住主线程，⛔ 不要为了「一次到位」去掉这个闸。
 * ⚠ 实测单块 31 ms（16.7 ms 是 60fps 的预算）⇒ 只能 1 块。
 *   进图时约 16 块 ⇒ 半秒左右的分帧填充；⛔ 调成 2 会让进图那几帧直接掉到 20fps。
 *   真正的解法是挪到 worker，那是另一件事。
 */
export const SGZZ_FIELD_BAKE_BUDGET = 1;
/** 最多缓存几块（超出按最久未用淘汰）。 */
export const SGZZ_FIELD_CACHE_LIMIT = 48;

/** 一块在 map 平面里的矩形与烘焙参数。 */
export interface SgzzFieldChunk {
    readonly key: number;
    readonly cx: number;
    readonly cy: number;
    /** map 平面矩形（内区，不含 halo）。 */
    readonly minX: number; readonly minY: number; readonly size: number;
    /** 内区采样点数（= 权重图边长）。 */
    readonly samples: number;
}

/** 块号 → 唯一 key。⚠ 允许负块号（地图原点在平面里不是 0）。 */
export function sgzzFieldChunkKey(cx: number, cy: number): number {
    return ((cx + 4096) << 13) | (cy + 4096);
}

/** map 平面坐标 → 块号。 */
export function sgzzFieldChunkAt(planeX: number, planeY: number): { cx: number; cy: number } {
    const side = SGZZ_FIELD_CHUNK_CELLS * SGZZ_FIELD_CELL_EDGE;
    return { cx: Math.floor(planeX / side), cy: Math.floor(planeY / side) };
}

export function sgzzFieldChunkOf(cx: number, cy: number): SgzzFieldChunk {
    const side = SGZZ_FIELD_CHUNK_CELLS * SGZZ_FIELD_CELL_EDGE;
    return {
        key: sgzzFieldChunkKey(cx, cy), cx, cy,
        minX: cx * side, minY: cy * side, size: side,
        samples: Math.max(2, Math.round(side / SGZZ_FIELD_BAKE_STEP)),
    };
}

/** 烘一块要的采样区（**含 halo**）与内区偏移。halo 只为平滑正确，⛔ 不输出。 */
export function sgzzFieldBakeRect(chunk: SgzzFieldChunk):
    { rect: SgzzFieldRect; inner: { x: number; y: number; width: number; height: number } } {
    const sigma = (SGZZ_FIELD_DEFAULTS.landSigmaCells * SGZZ_FIELD_CELL_EDGE) / SGZZ_FIELD_BAKE_STEP;
    const halo = Math.ceil(sigma * 3) + 2;   // ⚠ 3σ 截断，⛔ 截太短块边会有台阶
    return {
        rect: {
            minX: chunk.minX - halo * SGZZ_FIELD_BAKE_STEP,
            minY: chunk.minY - halo * SGZZ_FIELD_BAKE_STEP,
            width: chunk.samples + halo * 2, height: chunk.samples + halo * 2,
            step: SGZZ_FIELD_BAKE_STEP,
        },
        inner: { x: halo, y: halo, width: chunk.samples, height: chunk.samples },
    };
}

/**
 * 视口（引擎世界坐标的包围盒）覆盖到哪些块。
 * ⚠ 输入是**世界**包围盒，内部换到 map 平面 —— ⛔ 直接拿世界 y 当平面 y 会少取一半的块。
 */
export function sgzzFieldChunksFor(centreWorldX: number, centreWorldY: number,
                                   halfWorldW: number, halfWorldH: number): SgzzFieldChunk[] {
    // 世界矩形的四角换到平面后取包围盒（y 轴翻倍且反向 ⇒ ⛔ 不能只换中心点）
    const corners = [
        sgzzToPlane(centreWorldX - halfWorldW, centreWorldY - halfWorldH),
        sgzzToPlane(centreWorldX + halfWorldW, centreWorldY - halfWorldH),
        sgzzToPlane(centreWorldX - halfWorldW, centreWorldY + halfWorldH),
        sgzzToPlane(centreWorldX + halfWorldW, centreWorldY + halfWorldH),
    ];
    const minX = Math.min(...corners.map((p) => p[0])), maxX = Math.max(...corners.map((p) => p[0]));
    const minY = Math.min(...corners.map((p) => p[1])), maxY = Math.max(...corners.map((p) => p[1]));
    const a = sgzzFieldChunkAt(minX, minY), b = sgzzFieldChunkAt(maxX, maxY);
    const out: SgzzFieldChunk[] = [];
    for (let cy = a.cy; cy <= b.cy; cy += 1) {
        for (let cx = a.cx; cx <= b.cx; cx += 1) out.push(sgzzFieldChunkOf(cx, cy));
    }
    // 由近及远：先烘镜头中心那几块，⛔ 别让边角块抢在中心前面
    const [pcx, pcy] = sgzzToPlane(centreWorldX, centreWorldY);
    out.sort((p, q) => {
        const dp = Math.hypot(p.minX + p.size / 2 - pcx, p.minY + p.size / 2 - pcy);
        const dq = Math.hypot(q.minX + q.size / 2 - pcx, q.minY + q.size / 2 - pcy);
        return dp - dq;
    });
    return out;
}

/** 块的四个角（引擎世界坐标，顺时针：左上、右上、右下、左下），给渲染层铺四边形。 */
export function sgzzFieldChunkQuad(chunk: SgzzFieldChunk): readonly (readonly [number, number])[] {
    // 平面 → 世界：x 不变、y = −planeY/2。⚠ 平面 y 增大 = 世界 y 减小 ⇒ 上下要换过来
    const x0 = chunk.minX, x1 = chunk.minX + chunk.size;
    const yTop = -chunk.minY / 2, yBottom = -(chunk.minY + chunk.size) / 2;
    return [[x0, yTop], [x1, yTop], [x1, yBottom], [x0, yBottom]];
}

/** ⚠ 引用一下格半宽/半高，免得有人以为块尺寸与格几何无关。 */
export const SGZZ_FIELD_CHUNK_WORLD_W = SGZZ_FIELD_CHUNK_CELLS * SGZZ_TILE_HALF_W * Math.SQRT2;
export const SGZZ_FIELD_CHUNK_WORLD_H = SGZZ_FIELD_CHUNK_WORLD_W / (SGZZ_TILE_HALF_W / SGZZ_TILE_HALF_H);
