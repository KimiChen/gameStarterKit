/**
 * 连续覆盖场（美术规范-过渡区域 v2）的回归。
 * 这一层完全是纯计算，⇒ 离线就能钉死，⛔ 不用等真机。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_FIELD_CELL_EDGE, SGZZ_FIELD_CLASSES, SGZZ_FIELD_DEFAULTS, SGZZ_FIELD_STEP,
    SGZZ_COAST_CLAMP_CELLS, bakeSgzzField, sgzzBoxRadiusFor, sgzzChamferDistance, sgzzFieldNoise,
    sgzzFromPlane, sgzzGaussianKernel, sgzzToPlane,
} from "../src/kits/sgzzmap/logic/sgzzField";
import { SGZZ_TILE_HALF_W } from "../src/shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_FIELD_TIERS, sgzzFieldBakeRect, sgzzFieldChunkAt, sgzzFieldChunkKey,
    sgzzFieldChunkOf, sgzzFieldChunkQuad, sgzzFieldChunksFor, sgzzFieldTierFor,
} from "../src/kits/sgzzmap/logic/sgzzFieldChunks";

test("map 平面：X=worldX、Y=−2·worldY，一格边长 = 32√2（等距剪切被还原成正方格）", () => {
    assert.deepEqual([...sgzzToPlane(10, 20)], [10, -40]);
    assert.deepEqual([...sgzzFromPlane(10, -40)], [10, 20]);
    assert.ok(Math.abs(SGZZ_FIELD_CELL_EDGE - SGZZ_TILE_HALF_W * Math.SQRT2) < 1e-9);
    // 菱形四顶点在平面里应成正方形：相邻顶点距离都等于 R
    const pts = [[0, 16], [32, 0], [0, -16], [-32, 0]].map(([x, y]) => sgzzToPlane(x, y));
    for (let i = 0; i < 4; i += 1) {
        const a = pts[i], b = pts[(i + 1) % 4];
        assert.ok(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - SGZZ_FIELD_CELL_EDGE) < 1e-9,
            "平面里相邻顶点距离该等于 R");
    }
});

test("扰动是位置的纯函数且连续 —— ⛔ 不能按格号取常数（那样边界是台阶）", () => {
    const period = 6 * SGZZ_FIELD_CELL_EDGE;
    for (let i = 0; i < 20; i += 1) {
        assert.deepEqual([...sgzzFieldNoise(100 + i, 50, period)], [...sgzzFieldNoise(100 + i, 50, period)]);
    }
    // 连续性：相邻采样点的差应远小于量程
    let maxJump = 0;
    for (let x = 0; x < 400; x += SGZZ_FIELD_STEP) {
        const a = sgzzFieldNoise(x, 0, period), b = sgzzFieldNoise(x + SGZZ_FIELD_STEP, 0, period);
        maxJump = Math.max(maxJump, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    }
    assert.ok(maxJump < 0.2, `相邻采样跳变 ${maxJump.toFixed(3)} 太大，边界会有台阶`);
    // 同一格内不同点必须取到不同值（⛔ 每格常数的话平滑完仍露格子）
    const a = sgzzFieldNoise(0, 0, period), b = sgzzFieldNoise(20, 10, period);
    assert.notDeepEqual([...a], [...b]);
});

test("高斯核：半径 3σ、归一化", () => {
    const k = sgzzGaussianKernel(4);
    assert.equal(k.length, 4 * 3 * 2 + 1);
    assert.ok(Math.abs([...k].reduce((a, b) => a + b, 0) - 1) < 1e-6);
    assert.ok(k[(k.length - 1) / 2] === Math.max(...k), "中心应最大");
});

function bake(terrainAt: (row: number, col: number) => number, innerCells = 4) {
    const R = SGZZ_FIELD_CELL_EDGE;
    const step = SGZZ_FIELD_STEP;
    const halo = Math.ceil((SGZZ_FIELD_DEFAULTS.landSigmaCells * 3 * R) / step) + 2;
    const innerN = Math.round((innerCells * R) / step);
    const centre = sgzzToPlane(0, -(700 + 700 + 1) * 16);
    const rect = {
        minX: centre[0] - (innerN / 2 + halo) * step, minY: centre[1] - (innerN / 2 + halo) * step,
        width: innerN + halo * 2, height: innerN + halo * 2, step,
    };
    return bakeSgzzField(terrainAt, rect, { x: halo, y: halo, width: innerN, height: innerN }, 1500, 1500);
}

test("★ 单一地形整片：该类恒 255，其余恒 0", () => {
    const f = bake(() => 1);           // 全森林
    let minOwn = 255, maxOther = 0;
    for (let i = 0; i < f.width * f.height; i += 1) {
        minOwn = Math.min(minOwn, f.weights0[i * 4 + 1]);
        for (const c of [0, 2, 3]) maxOther = Math.max(maxOther, f.weights0[i * 4 + c]);
        for (const c of [0, 1, 2, 3]) maxOther = Math.max(maxOther, f.weights1[i * 4 + c]);
    }
    assert.equal(minOwn, 255, "整片同地形时该类必须满值");
    assert.equal(maxOther, 0, "⛔ 其余类不得有残留");
});

test("★ 直线交界：权重连续过渡，且八通道归一化（⛔ 不保证和为 1 的话着色器会发暗）", () => {
    const f = bake((row) => (row < 700 ? 1 : 0));     // 上森林下平原
    let sawMix = 0, badSum = 0;
    for (let i = 0; i < f.width * f.height; i += 1) {
        let sum = 0;
        for (let c = 0; c < 4; c += 1) sum += f.weights0[i * 4 + c] + f.weights1[i * 4 + c];
        if (Math.abs(sum - 255) > 3) badSum += 1;
        const forest = f.weights0[i * 4 + 1], plain = f.weights0[i * 4];
        if (forest > 40 && plain > 40) sawMix += 1;        // 真的有混合带
    }
    assert.equal(badSum, 0, "每个采样点的八通道之和都该归一到 255");
    assert.ok(sawMix > f.width, `混合带太窄（${sawMix} 个采样点），过渡看不出来`);
});

test("★ 格心保护：格心附近必须仍是本格地形 —— ⛔ 平滑不得改变玩法可读性", () => {
    const terrain = (row: number, col: number) => ((row + col) % 2 === 0 ? 1 : 0);   // 棋盘：最刁钻
    const R = SGZZ_FIELD_CELL_EDGE, step = SGZZ_FIELD_STEP;
    const halo = Math.ceil((SGZZ_FIELD_DEFAULTS.landSigmaCells * 3 * R) / step) + 2;
    const innerN = Math.round((6 * R) / step);
    const centre = sgzzToPlane(0, -(700 + 700 + 1) * 16);
    const rect = {
        minX: centre[0] - (innerN / 2 + halo) * step, minY: centre[1] - (innerN / 2 + halo) * step,
        width: innerN + halo * 2, height: innerN + halo * 2, step,
    };
    const f = bakeSgzzField(terrain, rect, { x: halo, y: halo, width: innerN, height: innerN }, 1500, 1500);
    // 找出被强制成 one-hot 的点（格心保护区），确认它们确实是纯色
    let protectedPts = 0;
    for (let i = 0; i < f.width * f.height; i += 1) {
        const vals = [0, 1, 2, 3].map((c) => f.weights0[i * 4 + c])
            .concat([0, 1, 2, 3].map((c) => f.weights1[i * 4 + c]));
        if (vals.filter((v) => v === 255).length === 1 && vals.filter((v) => v > 0).length === 1) protectedPts += 1;
    }
    assert.ok(protectedPts > 0, "棋盘地形下应存在被保护的格心点");
});

test("★ 地形 8（图外）不参与混合 —— ⛔ 别把雾当陆地混出假岸", () => {
    const f = bake((row) => (row < 700 ? 8 : 0));
    let anyEight = 0, plainSeen = 0;
    for (let i = 0; i < f.width * f.height; i += 1) {
        for (let c = 0; c < 4; c += 1) if (f.weights1[i * 4 + c] > 0 && c + 4 === 8) anyEight += 1;
        if (f.weights0[i * 4] > 0) plainSeen += 1;
    }
    assert.equal(anyEight, 0, "⛔ 8 不该有通道");
    assert.ok(plainSeen > 0, "另一侧的平原仍应有权重");
    assert.equal(SGZZ_FIELD_CLASSES, 8, "只混 0..7");
});

test("★ 分块：块是缓存单元，⛔ 不是视觉边界 —— 同一世界位置落在哪块都算出同样的场", () => {
    // 取一个正好压在块边界上的位置，用两块各自的烘焙参数去算，结果必须一致
    const a = sgzzFieldChunkOf(0, 0), b = sgzzFieldChunkOf(1, 0);
    assert.equal(b.minX, a.minX + a.size, "相邻块应首尾相接");
    assert.equal(sgzzFieldChunkAt(a.minX + 1, a.minY + 1).cx, 0);
    assert.equal(sgzzFieldChunkAt(b.minX + 1, b.minY + 1).cx, 1);
    // key 唯一且可含负块号（地图原点在平面里不是 0）
    const keys = new Set<number>();
    for (let cx = -3; cx <= 3; cx += 1) for (let cy = -3; cy <= 3; cy += 1) keys.add(sgzzFieldChunkKey(cx, cy));
    assert.equal(keys.size, 49);
});

test("★ halo 要盖住**所有**跨出内区的算子 —— ⛔ 只按陆地 σ 算，块边会留下可见接缝", () => {
    // 真机 run 35 的 LOD4 上看得见竖直/水平淡线 —— v2 明说「分块不能成为视觉边界」。
    // 三项都要算进去：① 陆地平滑 ② 海岸平滑（σ 更大）③ 距离场截断范围。
    // ⚠ 三遍盒滤波的实际支撑是 3r（每遍 ±r），⛔ 不是 r。
    for (const tier of SGZZ_FIELD_TIERS) {
        const chunk = sgzzFieldChunkOf(2, -1, tier);
        const { rect, inner } = sgzzFieldBakeRect(chunk);
        const sL = (SGZZ_FIELD_DEFAULTS.landSigmaCells * SGZZ_FIELD_CELL_EDGE) / tier.step;
        const sC = (SGZZ_FIELD_DEFAULTS.coastSigmaCells * SGZZ_FIELD_CELL_EDGE) / tier.step;
        const need = 3 * Math.max(sgzzBoxRadiusFor(sL), sgzzBoxRadiusFor(sC))
            + (SGZZ_COAST_CLAMP_CELLS * SGZZ_FIELD_CELL_EDGE) / tier.step;
        assert.ok(inner.x >= need,
            `tier${tier.tier} 的 halo ${inner.x} < 需要的 ${need.toFixed(1)} —— 块边会有接缝`);
        assert.equal(rect.width, inner.width + inner.x * 2);
        assert.equal(rect.minX + inner.x * rect.step, chunk.minX, "内区起点应正好对上块的左边");
        assert.equal(inner.width, chunk.samples);
    }
});

test("★ 视口取块：世界矩形要按四角换到平面，⛔ 只换中心点会少取一半", () => {
    const chunks = sgzzFieldChunksFor(0, -22416, 400, 600);
    assert.ok(chunks.length >= 4, `只取到 ${chunks.length} 块，视野盖不住`);
    // 由近及远：第一块的中心离镜头最近
    const [pcx, pcy] = sgzzToPlane(0, -22416);
    const d = chunks.map((c) => Math.hypot(c.minX + c.size / 2 - pcx, c.minY + c.size / 2 - pcy));
    assert.deepEqual([...d].sort((x, y) => x - y), d, "⛔ 边角块不得抢在中心块前面");
    // 覆盖性：视口四角所在的块都要在列表里
    for (const [wx, wy] of [[-400, -23016], [400, -23016], [-400, -21816], [400, -21816]]) {
        const p = sgzzToPlane(wx, wy);
        const at = sgzzFieldChunkAt(p[0], p[1]);
        assert.ok(chunks.some((c) => c.cx === at.cx && c.cy === at.cy), `视口角 (${wx},${wy}) 的块没取到`);
    }
});

test("★ 块四边形：平面 y 增大 = 世界 y 减小，⛔ 上下不能弄反", () => {
    const chunk = sgzzFieldChunkOf(0, 0);
    const [lt, rt, , lb] = sgzzFieldChunkQuad(chunk) as readonly [number, number][];
    assert.ok(lt[1] > lb[1], "左上的世界 y 必须大于左下");
    assert.ok(rt[0] > lt[0], "右上的世界 x 必须大于左上");
    assert.equal(lt[1] - lb[1], chunk.size / 2, "世界高度 = 平面尺寸的一半（y 轴压缩 2 倍）");
    assert.equal(rt[0] - lt[0], chunk.size, "世界宽度 = 平面尺寸");
});

test("★ 距离场：chamfer 近似要接近真实欧氏距离，⛔ 不能用模糊指示函数顶替", () => {
    const w = 81, h = 81;
    const seed = new Uint8Array(w * h);
    seed[40 * w + 40] = 1;                       // 中心一个种子
    const d = sgzzChamferDistance(seed, w, h);
    for (const [x, y, want] of [[40, 40, 0], [45, 40, 5], [40, 47, 7], [44, 43, 5]]) {
        const got = d[y * w + x];
        const truth = Math.hypot(x - 40, y - 40);
        assert.ok(Math.abs(got - truth) <= truth * 0.1 + 0.34,
            `(${x},${y}) 距离 ${got.toFixed(2)} 偏离真值 ${truth.toFixed(2)} 太多（want≈${want}）`);
    }
});

/**
 * 造一块含水的地形 fixture 并烘出来。
 * ⚠ 步长必须用**生产档位**的 tier.step，⛔ 不能用 SGZZ_FIELD_STEP（那是规范里的理想值 2，
 *   线上从没用过）。早先用 2 测，把「窄河不断」测成了绿的，而生产步长 4 下它是断的。
 */
function bakeWith(terrain: (row: number, col: number) => number, cells = 6,
                  step = SGZZ_FIELD_TIERS[0].step) {
    const R = SGZZ_FIELD_CELL_EDGE;
    const halo = Math.ceil((SGZZ_FIELD_DEFAULTS.coastSigmaCells * 3 * R) / step) + 2;
    const innerN = Math.round((cells * R) / step);
    const centre = sgzzToPlane(0, -(700 + 700 + 1) * 16);
    const rect = {
        minX: centre[0] - (innerN / 2 + halo) * step, minY: centre[1] - (innerN / 2 + halo) * step,
        width: innerN + halo * 2, height: innerN + halo * 2, step,
    };
    return bakeSgzzField(terrain, rect, { x: halo, y: halo, width: innerN, height: innerN }, 1500, 1500);
}
/** 某采样点的「水占比」= 水域+海 的权重之和 / 255。 */
function waterAt(f: { weights1: Uint8Array }, i: number): number {
    return (f.weights1[i * 4] + f.weights1[i * 4 + 1]) / 255;
}

test("★ 海岸：陆水分界连续过渡，且两侧各自纯净", () => {
    const f = bakeWith((row) => (row < 700 ? 5 : 0));       // 上海下平原
    let pureWater = 0, pureLand = 0, band = 0;
    for (let i = 0; i < f.width * f.height; i += 1) {
        const wv = waterAt(f, i);
        if (wv > 0.98) pureWater += 1;
        else if (wv < 0.02) pureLand += 1;
        else band += 1;
    }
    assert.ok(pureWater > 0 && pureLand > 0, "两侧都该有纯净区");
    assert.ok(band > 0, "⛔ 没有过渡带就还是硬边");
    // ⚠ 过渡带要窄：半宽 0.08R ⇒ 只占一小条，⛔ 糊成一片就看不出岸了
    assert.ok(band < pureWater + pureLand, `过渡带 ${band} 太宽`);
});

test("★ 小岛不被平滑吃掉 —— ⛔ 限位移就是为这个存在的", () => {
    // 一片海里的单格陆地
    const island = (row: number, col: number) => (row === 700 && col === 700 ? 0 : 5);
    const f = bakeWith(island, 6);
    let land = 0;
    for (let i = 0; i < f.width * f.height; i += 1) if (waterAt(f, i) < 0.5) land += 1;
    assert.ok(land > 0, "单格孤岛被整个吃掉了：限位移/格心保护没起作用");

    // 反向：一片陆地里的单格湖
    const lake = (row: number, col: number) => (row === 700 && col === 700 ? 4 : 0);
    const g = bakeWith(lake, 6);
    let water = 0;
    for (let i = 0; i < g.width * g.height; i += 1) if (waterAt(g, i) > 0.5) water += 1;
    assert.ok(water > 0, "单格孤湖被整个吃掉了");
});

test("★ 海岸不沿菱形边走 —— 轮廓必须是弯的，⛔ 不是逐格折角", () => {
    // ⚠ fixture 要在**平面里是斜的**：row+col 恒定在平面里是水平线（逐行扫描取不到切点），
    //   row 恒定才是斜线。⛔ 选错 fixture 这条用例就什么都测不出来。
    const f = bakeWith((row) => (row < 700 ? 5 : 0), 6);
    const cuts: number[] = [];
    for (let j = 0; j < f.height; j += 1) {
        let cut = -1;
        for (let i = 0; i < f.width; i += 1) {
            if (waterAt(f, j * f.width + i) < 0.5) { cut = i; break; }
        }
        if (cut > 0) cuts.push(cut);
    }
    assert.ok(cuts.length > 10, "样本太少");
    // 切换点的步进要细腻：逐格折角的话相邻行的切换点会成段相等再突然跳一大格
    const jumps = cuts.slice(1).map((v, i) => Math.abs(v - cuts[i]));
    // 沿格边走的话，切换点会成段相等再突跳一整格（R/step ≈ 22 个采样点）
    const cellSamples = SGZZ_FIELD_CELL_EDGE / SGZZ_FIELD_STEP;
    const big = jumps.filter((v) => v > cellSamples * 0.5).length;
    assert.equal(big, 0, `有 ${big}/${jumps.length} 处跳超过半格，像是沿格边走的折角`);
    assert.ok(Math.max(...jumps) < cellSamples * 0.5, "最大跳变应远小于一格");
});

test("★ 单格宽的河与陆桥不被掐断（v2 §6 的窄特征保护）—— 两档都要验", () => {
    // ⚠ 断在**边角**不算断：河是平面里的斜线，方形采样区的角上本来就没有它。
    //   只看内区中段，⛔ 拿整块的「有水行数」当判据会把边角误判成断裂。
    const interior = (f: { width: number; height: number }, j: number) =>
        j >= f.height * 0.15 && j <= f.height * 0.85;

    // ⚠ 两个档位都要验：LOD0/1 步长 4、LOD2 步长 16。
    //   ⛔ 只验一档没用 —— 早先只用规范里的理想步长 2 测，把这条测成了绿的。
    for (const tier of SGZZ_FIELD_TIERS) {
    for (const [name, terrain, wantWater] of [
        ["单格宽河", (_row: number, col: number) => (col === 700 ? 4 : 0), true],
        ["单格宽陆桥", (_row: number, col: number) => (col === 700 ? 0 : 5), false],
    ] as const) {
        // ⚠ 采样区要按步长放大，⛔ 固定 8 格的话 tier2（步长 32）只剩 7 行可查，测不出东西
        const f = bakeWith(terrain, Math.ceil((100 * tier.step) / SGZZ_FIELD_CELL_EDGE), tier.step);
        let broken = 0, checked = 0;
        for (let j = 0; j < f.height; j += 1) {
            if (!interior(f, j)) continue;
            checked += 1;
            let has = false;
            for (let i = 0; i < f.width; i += 1) {
                const isWater = waterAt(f, j * f.width + i) > 0.5;
                if (isWater === wantWater) { has = true; break; }
            }
            if (!has) broken += 1;
        }
        assert.ok(checked > 10, `${name}：检查的行太少`);
        assert.equal(broken, 0,
            `${name}（步长 ${tier.step}）在中段断了 ${broken}/${checked} 行 —— 平滑把细特征掐断了`);
    }
    }
});

test("★ 分档：LOD2 用大块，⛔ 一套尺寸吃遍所有档会烘一秒", () => {
    assert.equal(sgzzFieldTierFor(0).cells, 20);
    assert.equal(sgzzFieldTierFor(1).cells, 20);
    assert.ok(sgzzFieldTierFor(2).cells > sgzzFieldTierFor(0).cells, "LOD2 该用更大的块");
    assert.ok(sgzzFieldTierFor(4).cells > sgzzFieldTierFor(2).cells, "LOD3–4 该用更大的块");
    assert.equal(sgzzFieldTierFor(3).tier, sgzzFieldTierFor(4).tier, "LOD3 与 LOD4 同档");
    // ⚠ 步长最多粗一倍：⛔ 再粗（16）时一格才 2.8 个采样点，单格宽的河会被平滑抹掉
    assert.ok(sgzzFieldTierFor(2).step <= sgzzFieldTierFor(0).step * 2,
        `LOD2 步长 ${sgzzFieldTierFor(2).step} 太粗，窄河会消失`);
    // ⚠ 采样点数必须**不随档变**：块放大 4 倍、步长也放大 4 倍 ⇒ 单块成本不变
    for (const tier of SGZZ_FIELD_TIERS) {
        const chunk = sgzzFieldChunkOf(0, 0, tier);
        assert.equal(chunk.samples, Math.round(tier.cells * SGZZ_FIELD_CELL_EDGE / tier.step));
    }
    assert.equal(sgzzFieldChunkOf(0, 0, SGZZ_FIELD_TIERS[0]).samples,
        sgzzFieldChunkOf(0, 0, SGZZ_FIELD_TIERS[1]).samples, "两档单块成本应相同");
    // ⚠ key 必须带档号：⛔ 不带的话两档同坐标的块会互相顶掉
    assert.notEqual(sgzzFieldChunkKey(3, -2, 0), sgzzFieldChunkKey(3, -2, 1));
    const keys = new Set<number>();
    for (const t of [0, 1]) for (let cx = -4; cx <= 4; cx += 1) for (let cy = -4; cy <= 4; cy += 1) {
        keys.add(sgzzFieldChunkKey(cx, cy, t));
    }
    assert.equal(keys.size, 2 * 9 * 9, "key ⛔ 不得碰撞");
    // LOD2 的块数要真的降下来
    const near = sgzzFieldChunksFor(0, -22416, 750 / 0.34 / 2, 1122 / 0.34 / 2, SGZZ_FIELD_TIERS[1]);
    const naive = sgzzFieldChunksFor(0, -22416, 750 / 0.34 / 2, 1122 / 0.34 / 2, SGZZ_FIELD_TIERS[0]);
    assert.ok(near.length * 3 <= naive.length, `LOD2 大块 ${near.length} 块 vs 小块 ${naive.length} 块，省得不够`);
});

test("★ 岸距图：0.5 正好是岸线，水侧 > 0.5、陆侧 < 0.5", () => {
    const f = bakeWith((row) => (row < 700 ? 5 : 0), 8);
    // 与权重来自**同一张场** ⇒ 岸距的符号必须和水占比一致，⛔ 两套轮廓会让岸条错位
    let mismatch = 0, nearShore = 0, checked = 0;
    for (let i = 0; i < f.width * f.height; i += 1) {
        const enc = f.coast[i * 4] / 255;
        const wv = waterAt(f, i);
        if (wv > 0.9 && enc <= 0.5) mismatch += 1;
        if (wv < 0.1 && enc >= 0.5) mismatch += 1;
        if (Math.abs(enc - 0.5) < 0.12) nearShore += 1;
        checked += 1;
        assert.equal(f.coast[i * 4 + 3], 255, "alpha 该恒为 255（⛔ 这张图不是透明度）");
    }
    assert.equal(mismatch, 0, `有 ${mismatch}/${checked} 个点的岸距符号与水占比不一致`);
    assert.ok(nearShore > 0, "应该存在岸线附近的采样点，否则岸条无处可画");
    // ⚠ 编码要**饱和**：远离岸线的点必须压到 0 / 1，⛔ 否则岸条会糊满整屏
    const far = [...f.coast].filter((_, i) => i % 4 === 0).filter((v) => v === 0 || v === 255).length;
    assert.ok(far > f.width * f.height * 0.3, `饱和点只有 ${far}，编码范围太宽`);
});
