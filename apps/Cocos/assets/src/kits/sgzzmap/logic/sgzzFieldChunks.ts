/**
 * 覆盖场的分块：哪些块要烘、烘多大、每帧烘几块。
 *
 * ⚠ 分块只是**缓存单元**，⛔ 不能成为视觉边界：同一世界位置的覆盖率/扰动/UV 必须与块无关。
 *   本文件只决定「烘哪一块」，场本身由 sgzzField 按**绝对 map 平面坐标**算，天然跨块一致。
 *
 * ⚠ 烘焙分辨率**不必**等于采样步长的理想值：权重场是低频的，
 *   小图 + GPU 双线性放大就够，⛔ 按 2 世界单位逐点烘会是 JS 里的灾难（每块上亿次运算）。
 */
import {
    SGZZ_COAST_CLAMP_CELLS, SGZZ_FIELD_CELL_EDGE, SGZZ_FIELD_DEFAULTS, sgzzBoxRadiusFor,
    type SgzzFieldRect,
} from "./sgzzField";
import { sgzzToPlane } from "./sgzzField";
import { SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W } from "../../../shared/kits/sgzzmap/api/hexmap/index";

/**
 * 分档的块尺寸与采样步长。
 *
 * ⚠ 块尺寸必须**随档位放大**，⛔ 一套尺寸吃遍所有档：
 *   20 格块在 LOD0 只要 8 块，到 LOD2 就要 36 块（× 31 ms = 1.1 秒）。
 *   放大到 80 格后 LOD2 只要 6 块，而采样点数不变（步长同步 ×4）⇒ **单块成本不变**。
 * ⚠ 两档的块**不是同一批**（尺寸不同）⇒ 缓存 key 必须带档号，⛔ 否则会互相顶掉。
 */
export interface SgzzFieldTier {
    readonly tier: number;
    readonly cells: number;
    readonly step: number;
}
export const SGZZ_FIELD_TIERS: readonly SgzzFieldTier[] = Object.freeze([
    { tier: 0, cells: 20, step: 4 },    // LOD 0–1：近看，要细
    // ⚠ LOD2 只能粗**一倍**（步长 8）：步长 16 时一格才 2.8 个采样点，
    //   单格宽的河/陆桥直接被平滑抹掉（实测断 2/16 行）。而 LOD2 一格仍有 22×11 屏幕像素，
    //   河看不见是真的玩法可读性问题。⛔ 别为了省块数把步长调到 16。
    { tier: 1, cells: 40, step: 8 },
    // ⚠ LOD3–4：步长 32 时一格才 1.4 个采样点，但**窄河仍然保得住** ——
    //   细特征保护是按世界单位算的（0.55R），会随步长缩放（实测三种步长都 0/160 不断）。
    //   ⛔ 别据此以为「步长随便粗」：保护只保细特征，开阔岸线的精度仍随步长下降。
    // ⚠ LOD3–5 共用这一档：LOD5 要 32 块（缓存上限 48，放得下）。
    //   ⛔ 别为了省块数再加一档 320格/步64 —— 那时一格才 0.71 个采样点，低于奈奎斯特会走样。
    { tier: 2, cells: 160, step: 32 },
]);
export function sgzzFieldTierFor(lod: number): SgzzFieldTier {
    if (lod <= 1) return SGZZ_FIELD_TIERS[0];
    return lod <= 2 ? SGZZ_FIELD_TIERS[1] : SGZZ_FIELD_TIERS[2];   // LOD3–5 同档
}
/** ⚠ 兼容旧引用：默认档（LOD0/1）的块尺寸与步长。 */
export const SGZZ_FIELD_CHUNK_CELLS = SGZZ_FIELD_TIERS[0].cells;
export const SGZZ_FIELD_BAKE_STEP = SGZZ_FIELD_TIERS[0].step;
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
    readonly tier: number;
    readonly cx: number;
    readonly cy: number;
    /** map 平面矩形（内区，不含 halo）。 */
    readonly minX: number; readonly minY: number; readonly size: number;
    /** 内区采样点数（= 权重图边长）。 */
    readonly samples: number;
}

/** 块号 → 唯一 key。⚠ 带**档号**：两档的块尺寸不同，⛔ 不带档号会互相顶掉。 */
export function sgzzFieldChunkKey(cx: number, cy: number, tier = 0): number {
    return ((tier * 8192 + cx + 4096) * 8192) + (cy + 4096);
}

/** map 平面坐标 → 块号。 */
export function sgzzFieldChunkAt(planeX: number, planeY: number, tier = SGZZ_FIELD_TIERS[0]):
    { cx: number; cy: number } {
    const side = tier.cells * SGZZ_FIELD_CELL_EDGE;
    return { cx: Math.floor(planeX / side), cy: Math.floor(planeY / side) };
}

export function sgzzFieldChunkOf(cx: number, cy: number, tier = SGZZ_FIELD_TIERS[0]): SgzzFieldChunk {
    const side = tier.cells * SGZZ_FIELD_CELL_EDGE;
    return {
        key: sgzzFieldChunkKey(cx, cy, tier.tier), tier: tier.tier, cx, cy,
        minX: cx * side, minY: cy * side, size: side,
        samples: Math.max(2, Math.round(side / tier.step)),
    };
}

/** 烘一块要的采样区（**含 halo**）与内区偏移。halo 只为平滑正确，⛔ 不输出。 */
export function sgzzFieldBakeRect(chunk: SgzzFieldChunk):
    { rect: SgzzFieldRect; inner: { x: number; y: number; width: number; height: number } } {
    const step = SGZZ_FIELD_TIERS[chunk.tier].step;
    // ★ halo 必须盖住**所有**会跨出内区的算子，⛔ 只按陆地 σ 算会在块边留下可见接缝
    //   （真机 run 35 的 LOD4 上看得见竖直/水平淡线）——v2 明说「分块不能成为视觉边界」。
    //   三项：① 陆地权重平滑 ② 海岸平滑（σ 更大）③ 有符号距离场的 ±3R 截断范围。
    //   ⚠ 三遍盒滤波的实际支撑是 3r（每遍 ±r），⛔ 不是 r。
    const sigmaLand = (SGZZ_FIELD_DEFAULTS.landSigmaCells * SGZZ_FIELD_CELL_EDGE) / step;
    const sigmaCoast = (SGZZ_FIELD_DEFAULTS.coastSigmaCells * SGZZ_FIELD_CELL_EDGE) / step;
    const blur = 3 * Math.max(sgzzBoxRadiusFor(sigmaLand), sgzzBoxRadiusFor(sigmaCoast));
    const clampDist = (SGZZ_COAST_CLAMP_CELLS * SGZZ_FIELD_CELL_EDGE) / step;
    const halo = Math.ceil(blur + clampDist) + 2;
    return {
        rect: {
            minX: chunk.minX - halo * step, minY: chunk.minY - halo * step,
            width: chunk.samples + halo * 2, height: chunk.samples + halo * 2, step,
        },
        inner: { x: halo, y: halo, width: chunk.samples, height: chunk.samples },
    };
}

/**
 * 视口（引擎世界坐标的包围盒）覆盖到哪些块。
 * ⚠ 输入是**世界**包围盒，内部换到 map 平面 —— ⛔ 直接拿世界 y 当平面 y 会少取一半的块。
 */
export function sgzzFieldChunksFor(centreWorldX: number, centreWorldY: number,
                                   halfWorldW: number, halfWorldH: number,
                                   tier: SgzzFieldTier = SGZZ_FIELD_TIERS[0]): SgzzFieldChunk[] {
    // 世界矩形的四角换到平面后取包围盒（y 轴翻倍且反向 ⇒ ⛔ 不能只换中心点）
    const corners = [
        sgzzToPlane(centreWorldX - halfWorldW, centreWorldY - halfWorldH),
        sgzzToPlane(centreWorldX + halfWorldW, centreWorldY - halfWorldH),
        sgzzToPlane(centreWorldX - halfWorldW, centreWorldY + halfWorldH),
        sgzzToPlane(centreWorldX + halfWorldW, centreWorldY + halfWorldH),
    ];
    const minX = Math.min(...corners.map((p) => p[0])), maxX = Math.max(...corners.map((p) => p[0]));
    const minY = Math.min(...corners.map((p) => p[1])), maxY = Math.max(...corners.map((p) => p[1]));
    const a = sgzzFieldChunkAt(minX, minY, tier), b = sgzzFieldChunkAt(maxX, maxY, tier);
    const out: SgzzFieldChunk[] = [];
    for (let cy = a.cy; cy <= b.cy; cy += 1) {
        for (let cx = a.cx; cx <= b.cx; cx += 1) out.push(sgzzFieldChunkOf(cx, cy, tier));
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
