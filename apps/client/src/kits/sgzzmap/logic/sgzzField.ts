/**
 * 连续覆盖场（美术规范-过渡区域 v2 §3/§5）：把逐格的地形 id 展开成**连续的逐类覆盖率**，
 * 平滑之后打成两张 RGBA8 权重图，交给着色器按世界坐标混合。
 *
 * ⚠ ⛔ 不能把地形 id 数字直接插值 —— id 是分类不是数值，插出来的「2.5」没有意义。
 *   必须逐类展开成 0/1 覆盖率再分别平滑。
 *
 * ⚠ **map 平面**：X = worldX、Y = −2·worldY。这一步把等距剪切还原成正方格，
 *   一格的边长 R = 32√2。⛔ 不在这个平面上算的话，高斯核在屏幕上会是椭圆，
 *   平滑出来的边界一边胖一边瘦。
 *
 * ⚠ 采样偏移用**世界坐标**的低频噪声，⛔ 不能用格内坐标 —— 那样每格的扰动一模一样，
 *   平滑完照样露出格子。
 *
 * ⚠ A 通道是**权重**不是透明度：⛔ 不要预乘、不要在 A=0 时清 RGB。
 */
import {
    SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W, sgzzClampGrid, sgzzPos2GridRaw,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";

/** map 平面里一格的边长。⚠ = 半宽×√2（菱形对角 64×32 ⇒ 还原成边长 45.25 的正方格）。 */
export const SGZZ_FIELD_CELL_EDGE = SGZZ_TILE_HALF_W * Math.SQRT2;
/** 覆盖场采样步长（世界单位）。 */
export const SGZZ_FIELD_STEP = 2;
/** 参与混合的地形类数。⚠ 地形 8（图外）**不参与** —— 它是雾，另有遮罩。 */
export const SGZZ_FIELD_CLASSES = 8;

export interface SgzzFieldParams {
    /** 陆地权重平滑 σ（单位：格边长 R）。 */
    readonly landSigmaCells: number;
    /** 世界坐标低频扰动的振幅上限（R）与主周期（R）。 */
    readonly noiseAmplitudeCells: number;
    readonly noisePeriodCells: number;
    /** 格心判别余量（R）：这个半径内强制归属本格的地形，保证玩法可读性。 */
    readonly cellCenterMarginCells: number;
}

/** 交付 manifest 里的参考参数。⚠ 改这些要连带重烘，⛔ 不要在运行时随手改。 */
export const SGZZ_FIELD_DEFAULTS: SgzzFieldParams = Object.freeze({
    landSigmaCells: 0.46,
    noiseAmplitudeCells: 0.04,
    noisePeriodCells: 6,
    cellCenterMarginCells: 0.08,
});

/** 引擎世界坐标 → map 平面。 */
export function sgzzToPlane(worldX: number, worldY: number): readonly [number, number] {
    return [worldX, -2 * worldY];
}
/** map 平面 → 引擎世界坐标。与 sgzzToPlane 互逆。 */
export function sgzzFromPlane(planeX: number, planeY: number): readonly [number, number] {
    return [planeX, -planeY / 2];
}

/**
 * 世界坐标的低频扰动。⚠ 必须是**位置的纯函数**且连续，
 * ⛔ 不能用格号做种子（那样每格是常数，边界会是台阶）。
 */
export function sgzzFieldNoise(planeX: number, planeY: number, periodWorld: number): readonly [number, number] {
    const k = (2 * Math.PI) / Math.max(1e-6, periodWorld);
    // 两个互质频率的正弦叠加：连续、可微、无缝拼接（⛔ 不用随机表，块间会对不上）
    const nx = Math.sin(planeX * k) * 0.6 + Math.sin(planeY * k * 0.73 + 1.7) * 0.4;
    const ny = Math.cos(planeY * k) * 0.6 + Math.cos(planeX * k * 0.61 + 0.4) * 0.4;
    return [nx, ny];
}

export interface SgzzFieldRect {
    /** 采样区（map 平面，含 halo）。 */
    readonly minX: number; readonly minY: number;
    /** 每轴采样点数。 */
    readonly width: number; readonly height: number;
    readonly step: number;
}

export interface SgzzBakedField {
    /** 地形 0..3 的权重（RGBA8）。 */
    readonly weights0: Uint8Array;
    /** 地形 4..7 的权重（RGBA8）。 */
    readonly weights1: Uint8Array;
    readonly width: number;
    readonly height: number;
}

/** 一维高斯核（分离卷积用）。⚠ 半径取 3σ，⛔ 截太短边界会有台阶。 */
export function sgzzGaussianKernel(sigma: number): Float32Array {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const out = new Float32Array(radius * 2 + 1);
    let sum = 0;
    for (let i = -radius; i <= radius; i += 1) {
        const v = Math.exp(-(i * i) / (2 * sigma * sigma));
        out[i + radius] = v; sum += v;
    }
    for (let i = 0; i < out.length; i += 1) out[i] /= sum;
    return out;
}

/** 分离高斯：先横后纵，就地复用两块缓冲。⛔ 不要写成二维核，那是 O(r²) 的浪费。 */
function blurSeparable(src: Float32Array, tmp: Float32Array, w: number, h: number, kernel: Float32Array): void {
    const r = (kernel.length - 1) / 2;
    for (let y = 0; y < h; y += 1) {
        const row = y * w;
        for (let x = 0; x < w; x += 1) {
            let acc = 0;
            for (let k = -r; k <= r; k += 1) {
                const sx = Math.min(w - 1, Math.max(0, x + k));   // 边缘钳制
                acc += src[row + sx] * kernel[k + r];
            }
            tmp[row + x] = acc;
        }
    }
    for (let x = 0; x < w; x += 1) {
        for (let y = 0; y < h; y += 1) {
            let acc = 0;
            for (let k = -r; k <= r; k += 1) {
                const sy = Math.min(h - 1, Math.max(0, y + k));
                acc += tmp[sy * w + x] * kernel[k + r];
            }
            src[y * w + x] = acc;
        }
    }
}

/**
 * 烘一块覆盖场。
 *
 * @param terrainAt 逐格地形 id（调用方负责越界钳制）
 * @param rect      采样区（map 平面，**已含 halo**）
 * @param inner     要输出的内区（相对 rect 的采样点偏移与尺寸）——halo 只是为了平滑正确，⛔ 不输出
 */
export function bakeSgzzField(
    terrainAt: (row: number, col: number) => number,
    rect: SgzzFieldRect,
    inner: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    rows: number, cols: number,
    params: SgzzFieldParams = SGZZ_FIELD_DEFAULTS,
): SgzzBakedField {
    const R = SGZZ_FIELD_CELL_EDGE;
    const w = rect.width, h = rect.height;
    const total = w * h;
    const cover: Float32Array[] = [];
    for (let c = 0; c < SGZZ_FIELD_CLASSES; c += 1) cover.push(new Float32Array(total));

    // 逐格归属（未扰动）与到格心的距离，供格心保护用
    const ownClass = new Int8Array(total);
    const centreDist = new Float32Array(total);
    const amp = params.noiseAmplitudeCells * R;
    const period = params.noisePeriodCells * R;

    for (let j = 0; j < h; j += 1) {
        for (let i = 0; i < w; i += 1) {
            const idx = j * w + i;
            const px = rect.minX + i * rect.step, py = rect.minY + j * rect.step;
            // ⚠ 扰动只作用于**覆盖率采样**，格心保护仍按未扰动位置算，⛔ 否则玩法可读性会被噪声推翻
            const n = sgzzFieldNoise(px, py, period);
            const [wx, wy] = sgzzFromPlane(px + n[0] * amp, py + n[1] * amp);
            const raw = sgzzPos2GridRaw(wx, wy);
            const g = sgzzClampGrid(raw.row, raw.col, rows, cols);
            const id = terrainAt(g.row, g.col);
            if (id >= 0 && id < SGZZ_FIELD_CLASSES) cover[id][idx] = 1;

            const [ux, uy] = sgzzFromPlane(px, py);
            const ur = sgzzClampGrid(sgzzPos2GridRaw(ux, uy).row, sgzzPos2GridRaw(ux, uy).col, rows, cols);
            ownClass[idx] = terrainAt(ur.row, ur.col);
            // 到本格中心的距离（map 平面）
            const centreWorldY = -(ur.row + ur.col + 1) * SGZZ_TILE_HALF_H
                - ((ur.row & 1) === 1 ? SGZZ_TILE_HALF_H * 0.5 : 0);
            const centreWorldX = (ur.row - ur.col - ((ur.row & 1) === 1 ? 0.5 : 0)) * SGZZ_TILE_HALF_W;
            const [cpx, cpy] = sgzzToPlane(centreWorldX, centreWorldY);
            centreDist[idx] = Math.hypot(px - cpx, py - cpy);
        }
    }

    const kernel = sgzzGaussianKernel((params.landSigmaCells * R) / rect.step);
    const tmp = new Float32Array(total);
    for (let c = 0; c < SGZZ_FIELD_CLASSES; c += 1) blurSeparable(cover[c], tmp, w, h, kernel);

    const margin = params.cellCenterMarginCells * R;
    const weights0 = new Uint8Array(inner.width * inner.height * 4);
    const weights1 = new Uint8Array(inner.width * inner.height * 4);
    for (let j = 0; j < inner.height; j += 1) {
        for (let i = 0; i < inner.width; i += 1) {
            const src = (j + inner.y) * w + (i + inner.x);
            const dst = (j * inner.width + i) * 4;
            const own = ownClass[src];
            // ★ 格心保护：这个半径内强制本格地形，⛔ 平滑不得改变玩法可读性
            if (centreDist[src] <= margin && own >= 0 && own < SGZZ_FIELD_CLASSES) {
                if (own < 4) weights0[dst + own] = 255; else weights1[dst + (own - 4)] = 255;
                continue;
            }
            // ⚠ 阈值后取三次幂再归一：钝化三类交汇处的「和稀泥」，⛔ 不做会出现发灰的洞
            let sum = 0;
            const cubed: number[] = [];
            for (let c = 0; c < SGZZ_FIELD_CLASSES; c += 1) {
                const v = cover[c][src];
                const t = v <= 0 ? 0 : v * v * v;
                cubed.push(t); sum += t;
            }
            if (sum <= 1e-6) {
                if (own >= 0 && own < SGZZ_FIELD_CLASSES) {
                    if (own < 4) weights0[dst + own] = 255; else weights1[dst + (own - 4)] = 255;
                }
                continue;
            }
            for (let c = 0; c < SGZZ_FIELD_CLASSES; c += 1) {
                const v = Math.round((cubed[c] / sum) * 255);
                if (c < 4) weights0[dst + c] = v; else weights1[dst + (c - 4)] = v;
            }
        }
    }
    return { weights0, weights1, width: inner.width, height: inner.height };
}
