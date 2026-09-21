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
/** 算作「水」的地形 id：水域 4、海 5。⚠ 图外 8 ⛔ 不算水也不算陆。 */
export const SGZZ_WATER_CLASSES: readonly number[] = Object.freeze([4, 5]);
export function sgzzIsWaterClass(id: number): boolean {
    return id === 4 || id === 5;
}

export interface SgzzFieldParams {
    /** 陆地权重平滑 σ（单位：格边长 R）。 */
    readonly landSigmaCells: number;
    /** 世界坐标低频扰动的振幅上限（R）与主周期（R）。 */
    readonly noiseAmplitudeCells: number;
    readonly noisePeriodCells: number;
    /** 格心判别余量（R）：这个半径内强制归属本格的地形，保证玩法可读性。 */
    readonly cellCenterMarginCells: number;
    /** 开阔岸线平滑 σ（R）。⚠ 比陆地权重的 σ 大：海岸要更圆滑。 */
    readonly coastSigmaCells: number;
    /** 岸线相对原始轮廓的位移上限（R）。⛔ 不限的话平滑会把小岛整个吃掉。 */
    readonly coastDisplacementMaxCells: number;
    /** 陆水颜色混合半宽（R）：零等值线两侧多宽范围内做过渡。 */
    readonly waterBlendHalfWidthCells: number;
}

/** 交付 manifest 里的参考参数。⚠ 改这些要连带重烘，⛔ 不要在运行时随手改。 */
export const SGZZ_FIELD_DEFAULTS: SgzzFieldParams = Object.freeze({
    landSigmaCells: 0.46,
    noiseAmplitudeCells: 0.04,
    noisePeriodCells: 6,
    cellCenterMarginCells: 0.08,
    coastSigmaCells: 0.60,
    coastDisplacementMaxCells: 0.38,
    waterBlendHalfWidthCells: 0.08,
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

/**
 * 二值图 → 到最近「1」的距离（chamfer 3-4 两遍近似，单位 = 采样步长）。
 *
 * ⚠ ⛔ 不要用「模糊指示函数」代替距离场：模糊会把窄河、小岛整个吃掉，
 *   而距离场的零等值线在细特征上稳得多（v2 §6 专门点了这条）。
 */
export function sgzzChamferDistance(seed: Uint8Array, w: number, h: number): Float32Array {
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let i = 0; i < w * h; i += 1) d[i] = seed[i] ? 0 : INF;
    // ⚠ 内联边界判断，⛔ 不要用 at(x,y) 闭包：每像素 8 次闭包调用，实测两遍要 17 ms
    for (let y = 0; y < h; y += 1) {
        const row = y * w, up = row - w;
        for (let x = 0; x < w; x += 1) {
            const i = row + x;
            let v = d[i];
            if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
            if (y > 0) {
                if (d[up + x] + 3 < v) v = d[up + x] + 3;
                if (x > 0 && d[up + x - 1] + 4 < v) v = d[up + x - 1] + 4;
                if (x + 1 < w && d[up + x + 1] + 4 < v) v = d[up + x + 1] + 4;
            }
            d[i] = v;
        }
    }
    for (let y = h - 1; y >= 0; y -= 1) {
        const row = y * w, down = row + w;
        for (let x = w - 1; x >= 0; x -= 1) {
            const i = row + x;
            let v = d[i];
            if (x + 1 < w && d[i + 1] + 3 < v) v = d[i + 1] + 3;
            if (y + 1 < h) {
                if (d[down + x] + 3 < v) v = d[down + x] + 3;
                if (x + 1 < w && d[down + x + 1] + 4 < v) v = d[down + x + 1] + 4;
                if (x > 0 && d[down + x - 1] + 4 < v) v = d[down + x - 1] + 4;
            }
            d[i] = v;
        }
    }
    for (let i = 0; i < w * h; i += 1) d[i] = d[i] >= INF ? INF : d[i] / 3;   // 3-4 核的单位化
    return d;
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

/**
 * 三遍盒滤波近似高斯。⚠ **O(1)/像素**（滑动和），与半径无关。
 *
 * ⛔ 不要用逐点卷积核：σ=0.46R、步长 4 时半径 16 ⇒ 33 抽头 × 8 类 × 2 方向，
 *   实测单块 122 ms（60fps 的预算是 16.7 ms）。三遍盒滤波在这类低频场上肉眼不可分。
 * ⚠ 盒宽按 σ 反算：三遍盒的等效方差 = 3·(n²−1)/12。
 */
export function sgzzBoxRadiusFor(sigma: number): number {
    return Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
}

function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, vertical: boolean): void {
    const n = 2 * r + 1;
    const outer = vertical ? w : h, inner = vertical ? h : w;
    const stride = vertical ? w : 1, base = vertical ? 1 : w;
    for (let o = 0; o < outer; o += 1) {
        const head = o * base;
        // 起始窗口（边缘按钳制复制）
        let acc = src[head] * (r + 1);
        for (let k = 1; k <= r; k += 1) acc += src[head + Math.min(inner - 1, k) * stride];
        for (let i = 0; i < inner; i += 1) {
            dst[head + i * stride] = acc / n;
            const add = src[head + Math.min(inner - 1, i + r + 1) * stride];
            const sub = src[head + Math.max(0, i - r) * stride];
            acc += add - sub;
        }
    }
}

function blurSeparable(src: Float32Array, tmp: Float32Array, w: number, h: number, radius: number): void {
    for (let pass = 0; pass < 3; pass += 1) {
        boxPass(src, tmp, w, h, radius, false);
        boxPass(tmp, src, w, h, radius, true);
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
    const margin = params.cellCenterMarginCells * R;
    const w = rect.width, h = rect.height;
    const total = w * h;
    const cover: Float32Array[] = [];
    for (let c = 0; c < SGZZ_FIELD_CLASSES; c += 1) cover.push(new Float32Array(total));

    // 逐格归属（未扰动）与到格心的距离，供格心保护用
    const ownClass = new Int8Array(total);
    const centreDist = new Float32Array(total);
    const waterSeed = new Uint8Array(total);
    const landSeed = new Uint8Array(total);
    const amp = params.noiseAmplitudeCells * R;
    const period = params.noisePeriodCells * R;

    // ⚠ 噪声是**可分离**的（x 项 + y 项）⇒ 预算 4 张一维表。
    // ⛔ 逐采样点调 4 次三角函数：68k 点 × 4 = 27 万次，实测占烘焙的大头。
    const k = (2 * Math.PI) / Math.max(1e-6, period);
    const sinX = new Float32Array(w), cosX = new Float32Array(w);
    const sinY = new Float32Array(h), cosY = new Float32Array(h);
    for (let i = 0; i < w; i += 1) {
        const px = rect.minX + i * rect.step;
        sinX[i] = Math.sin(px * k) * 0.6;
        cosX[i] = Math.cos(px * k * 0.61 + 0.4) * 0.4;
    }
    for (let j = 0; j < h; j += 1) {
        const py = rect.minY + j * rect.step;
        sinY[j] = Math.sin(py * k * 0.73 + 1.7) * 0.4;
        cosY[j] = Math.cos(py * k) * 0.6;
    }

    for (let j = 0; j < h; j += 1) {
        for (let i = 0; i < w; i += 1) {
            const idx = j * w + i;
            const px = rect.minX + i * rect.step, py = rect.minY + j * rect.step;
            // ⚠ 扰动只作用于**覆盖率采样**，格心保护仍按未扰动位置算，⛔ 否则玩法可读性会被噪声推翻
            const nx = sinX[i] + sinY[j], ny = cosY[j] + cosX[i];
            const [wx, wy] = sgzzFromPlane(px + nx * amp, py + ny * amp);
            const raw = sgzzPos2GridRaw(wx, wy);
            const g = sgzzClampGrid(raw.row, raw.col, rows, cols);
            const id = terrainAt(g.row, g.col);
            if (id >= 0 && id < SGZZ_FIELD_CLASSES) cover[id][idx] = 1;
            // 陆水二值（图外 8 ⛔ 既不算水也不算陆，两边都留 0 ⇒ 它附近不生成假岸）
            if (sgzzIsWaterClass(id)) waterSeed[idx] = 1;
            else if (id >= 0 && id < SGZZ_FIELD_CLASSES) landSeed[idx] = 1;

            const [ux, uy] = sgzzFromPlane(px, py);
            // ⚠ 只解一次：早先这行把 sgzzPos2GridRaw 调了**两遍**（取 row 一遍、取 col 一遍）
            const uraw = sgzzPos2GridRaw(ux, uy);
            const ur = sgzzClampGrid(uraw.row, uraw.col, rows, cols);
            ownClass[idx] = terrainAt(ur.row, ur.col);
            // 到本格中心的距离（map 平面）
            const centreWorldY = -(ur.row + ur.col + 1) * SGZZ_TILE_HALF_H
                - ((ur.row & 1) === 1 ? SGZZ_TILE_HALF_H * 0.5 : 0);
            const centreWorldX = (ur.row - ur.col - ((ur.row & 1) === 1 ? 0.5 : 0)) * SGZZ_TILE_HALF_W;
            const [cpx, cpy] = sgzzToPlane(centreWorldX, centreWorldY);
            centreDist[idx] = Math.hypot(px - cpx, py - cpy);
        }
    }

    const landRadius = sgzzBoxRadiusFor((params.landSigmaCells * R) / rect.step);
    const tmp = new Float32Array(total);
    for (let c = 0; c < SGZZ_FIELD_CLASSES; c += 1) blurSeparable(cover[c], tmp, w, h, landRadius);

    // ── 海岸：有符号距离场 → 平滑 → 限位移 → 加扰动（v2 §3.2/§5） ──────────────
    // ⚠ 正值 = 水。⛔ 不要用模糊指示函数代替距离场：那会把窄河小岛整个吃掉。
    const distToLand = sgzzChamferDistance(landSeed, w, h);
    const distToWater = sgzzChamferDistance(waterSeed, w, h);
    const clampD = (3 * R) / rect.step;          // ⚠ 截断到 ±3R，⛔ 不截的话远处的巨值会把高斯拉偏
    const d0 = new Float32Array(total);
    for (let i = 0; i < total; i += 1) {
        const v = waterSeed[i] ? Math.min(distToLand[i], clampD) : -Math.min(distToWater[i], clampD);
        d0[i] = Number.isFinite(v) ? v : (waterSeed[i] ? clampD : -clampD);
    }
    const coast = Float32Array.from(d0);
    blurSeparable(coast, tmp, w, h, sgzzBoxRadiusFor((params.coastSigmaCells * R) / rect.step));
    const maxDisp = (params.coastDisplacementMaxCells * R) / rect.step;
    const coastAmp = (params.noiseAmplitudeCells * R) / rect.step;
    for (let j = 0; j < h; j += 1) {
        for (let i = 0; i < w; i += 1) {
            const idx = j * w + i;
            // ⚠ 限位移：平滑可以把岸线推圆，⛔ 但不能把它推到离原轮廓 0.38R 之外（小岛会消失）
            let g = Math.max(d0[idx] - maxDisp, Math.min(d0[idx] + maxDisp, coast[idx]));
            g += (sinX[i] + sinY[j] + cosY[j] + cosX[i]) * 0.5 * coastAmp;
            // ★ 格心保护：格心附近岸线⛔不得翻面，否则玩法上「这格是水还是陆」会被美术推翻
            if (centreDist[idx] <= margin) {
                const wantWater = sgzzIsWaterClass(ownClass[idx]);
                if (wantWater && g <= 0) g = margin / rect.step;
                if (!wantWater && ownClass[idx] >= 0 && g >= 0) g = -margin / rect.step;
            }
            coast[idx] = g;
        }
    }

    const weights0 = new Uint8Array(inner.width * inner.height * 4);
    const weights1 = new Uint8Array(inner.width * inner.height * 4);
    // ⚠ 复用一条缓冲：⛔ 每个输出像素 new 一个数组 = 5 万次分配
    const cubed = new Float32Array(SGZZ_FIELD_CLASSES);
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
            for (let c = 0; c < SGZZ_FIELD_CLASSES; c += 1) {
                const v = cover[c][src];
                const t = v <= 0 ? 0 : v * v * v;
                cubed[c] = t; sum += t;
            }
            // ★ 海岸：用平滑后的零等值线定陆水，⛔ 不再沿用逐格的菱形边
            //   —— 这是「连续弯曲海岸」与「菱形锯齿」的分界点。
            const half = Math.max(1e-6, (params.waterBlendHalfWidthCells * R) / rect.step);
            const t01 = Math.max(0, Math.min(1, (coast[src] + half) / (2 * half)));
            const waterness = t01 * t01 * (3 - 2 * t01);          // smoothstep
            for (let c = 0; c < SGZZ_FIELD_CLASSES; c += 1) {
                cubed[c] *= sgzzIsWaterClass(c) ? waterness : 1 - waterness;
            }
            sum = 0;
            for (let c = 0; c < SGZZ_FIELD_CLASSES; c += 1) sum += cubed[c];
            if (sum <= 1e-6) {
                // 窄带一侧完全没覆盖率（例：整片水里的一点陆）⇒ 按 waterness 兜底成纯水/纯陆
                const fallback = waterness > 0.5 ? 5 : 0;
                cubed[fallback] = 1; sum = 1;
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
