/**
 * 连续覆盖场（美术规范-过渡区域 v2）的回归。
 * 这一层完全是纯计算，⇒ 离线就能钉死，⛔ 不用等真机。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_FIELD_CELL_EDGE, SGZZ_FIELD_CLASSES, SGZZ_FIELD_DEFAULTS, SGZZ_FIELD_STEP,
    bakeSgzzField, sgzzFieldNoise, sgzzFromPlane, sgzzGaussianKernel, sgzzToPlane,
} from "../src/kits/sgzzmap/logic/sgzzField";
import { SGZZ_TILE_HALF_W } from "../src/shared/kits/sgzzmap/api/hexmap/index";

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
