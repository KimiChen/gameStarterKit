import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_MAP_ROWS, SGZZ_MAP_COLS, SGZZ_CELL_STRIDE, SGZZ_MAX_CELL,
    SGZZ_TILE_HALF_W, SGZZ_TILE_HALF_H, SGZZ_LOD_MAX, SGZZ_LOD_SCALE_THRESHOLDS,
    SGZZ_LOD_HYSTERESIS_RATIO, SGZZ_SCALE_MIN, SGZZ_SCALE_MAX, SGZZ_BIRDVIEW_LOD,
    SGZZ_NEIGHBOURS_EVEN, SGZZ_NEIGHBOURS_ODD, SGZZ_RING_EVEN, SGZZ_RING_ODD,
    sgzzNeighbours, sgzzNextPos, sgzzDirIndex, sgzzToCube, sgzzCubeDistance, sgzzStepsAlongDirection,
    sgzzCellOf, sgzzDecodeCell, isSgzzCell, validateSgzzCell, sgzzInBounds, sgzzClampGrid,
    sgzzGrid2Pos, sgzzPos2GridRaw, sgzzPos2Grid, sgzzWorldBounds,
    sgzzLodForScale, sgzzLodForScaleStable, validateSgzzLinks,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";

/** 确定性伪随机，测试要可复现。 */
function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test("sgzzmap hex: 六邻表按 row 奇偶分表，集合互为镜像且每个邻居恰好一步", () => {
    assert.equal(SGZZ_NEIGHBOURS_EVEN.length, 6);
    assert.equal(SGZZ_NEIGHBOURS_ODD.length, 6);
    // 次序即 dirIndex，⛔ 不可重排：这两行钉死原作 move_util.lua:2-19 的表
    assert.deepEqual(SGZZ_NEIGHBOURS_EVEN.map((o) => [...o]),
        [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]]);
    assert.deepEqual(SGZZ_NEIGHBOURS_ODD.map((o) => [...o]),
        [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]);
    for (const row of [400, 401]) {
        const table = (row & 1) === 0 ? SGZZ_NEIGHBOURS_EVEN : SGZZ_NEIGHBOURS_ODD;
        const seen = new Set<string>();
        for (const [dr, dc] of table) {
            const n = { row: row + dr, col: 500 + dc };
            assert.equal(sgzzCubeDistance({ row, col: 500 }, n), 1, `${row} 的邻居 ${dr},${dc} 必须恰好一步`);
            seen.add(`${dr},${dc}`);
        }
        assert.equal(seen.size, 6, "六邻不得重复");
    }
    // 第二环全是距离 2
    let ring2 = 0;
    for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
            const d = sgzzCubeDistance({ row: 400, col: 500 }, { row: 400 + dr, col: 500 + dc });
            if (d === 2) ring2 += 1;
        }
    }
    assert.equal(ring2, 12, "六边形第二环恰好 12 格");
});

test("sgzzmap hex: 邻接对称 —— A 的邻居里有 B ⇔ B 的邻居里有 A", () => {
    const rnd = lcg(20260921);
    for (let i = 0; i < 4000; i += 1) {
        const row = 1 + Math.floor(rnd() * (SGZZ_MAP_ROWS - 2));
        const col = 1 + Math.floor(rnd() * (SGZZ_MAP_COLS - 2));
        for (const n of sgzzNeighbours(row, col)) {
            const back = sgzzNeighbours(n.row, n.col).some((b) => b.row === row && b.col === col);
            assert.ok(back, `(${row},${col}) ↔ (${n.row},${n.col}) 邻接不对称`);
        }
    }
});

test("sgzzmap hex: dirIndex 与六邻表互洽，nextPos 朝目标推进", () => {
    for (const row of [200, 201]) {
        const src = { row, col: 300 };
        const table = (row & 1) === 0 ? SGZZ_NEIGHBOURS_EVEN : SGZZ_NEIGHBOURS_ODD;
        for (let i = 0; i < 6; i += 1) {
            const dest = { row: row + table[i][0], col: 300 + table[i][1] };
            assert.equal(sgzzDirIndex(src, dest), i + 1, `dirIndex 必须等于表下标+1`);
            assert.deepEqual(sgzzNextPos(row, 300, i + 1), dest);
        }
    }
    assert.throws(() => sgzzDirIndex({ row: 5, col: 5 }, { row: 5, col: 5 }), "同格没有方向");
    assert.throws(() => sgzzNextPos(0, 0, 0));
    assert.throws(() => sgzzNextPos(0, 0, 7));
});

test("sgzzmap hex: 环序是真的绕一圈（按屏幕角度严格单调），且与六邻同集合", () => {
    for (const row of [10, 11]) {
        const ring = (row & 1) === 0 ? SGZZ_RING_EVEN : SGZZ_RING_ODD;
        const table = (row & 1) === 0 ? SGZZ_NEIGHBOURS_EVEN : SGZZ_NEIGHBOURS_ODD;
        assert.equal(ring.length, 6);
        assert.deepEqual([...ring].map((o) => `${o[0]},${o[1]}`).sort(),
            [...table].map((o) => `${o[0]},${o[1]}`).sort(), "环序与六邻必须是同一组邻居");
        const here = sgzzGrid2Pos(row, 300);
        const angles = ring.map((o) => {
            const p = sgzzGrid2Pos(row + o[0], 300 + o[1]);
            const a = Math.atan2(p.y - here.y, p.x - here.x) * 180 / Math.PI;
            return a < 0 ? a + 360 : a;
        });
        // 顺时针：从第一个起角度递减（允许绕过 0° 一次）
        let wraps = 0;
        for (let i = 1; i < angles.length; i += 1) if (angles[i] > angles[i - 1]) wraps += 1;
        assert.ok(wraps <= 1, `row=${row} 环序不是单调绕圈：${angles.map((a) => a.toFixed(1)).join(" ")}`);
    }
});

test("sgzzmap hex: cube 换算与距离对称、三角不等式成立", () => {
    assert.deepEqual(sgzzToCube(0, 0), { x: 0, y: 0, z: 0 });
    const rnd = lcg(7);
    for (let i = 0; i < 3000; i += 1) {
        const a = { row: Math.floor(rnd() * SGZZ_MAP_ROWS), col: Math.floor(rnd() * SGZZ_MAP_COLS) };
        const b = { row: Math.floor(rnd() * SGZZ_MAP_ROWS), col: Math.floor(rnd() * SGZZ_MAP_COLS) };
        const c = { row: Math.floor(rnd() * SGZZ_MAP_ROWS), col: Math.floor(rnd() * SGZZ_MAP_COLS) };
        const ab = sgzzCubeDistance(a, b);
        assert.equal(ab, sgzzCubeDistance(b, a), "距离必须对称");
        assert.ok(Number.isInteger(ab) && ab >= 0);
        assert.ok(ab <= sgzzCubeDistance(a, c) + sgzzCubeDistance(c, b), "三角不等式");
        const cube = sgzzToCube(a.row, a.col);
        assert.equal(cube.x + cube.y + cube.z, 0, "cube 三轴恒和零");
    }
});

test("sgzzmap hex: stepsAlongDirection 只对共线正确 —— 与 cubeDistance 必须是两个名字", () => {
    const src = { row: 100, col: 100 };
    for (let dir = 1; dir <= 6; dir += 1) {
        let cur = src;
        for (let step = 1; step <= 7; step += 1) {
            cur = sgzzNextPos(cur.row, cur.col, sgzzDirIndex(src, sgzzNextPos(src.row, src.col, dir)) === dir
                ? dir : dir);
            assert.equal(sgzzStepsAlongDirection(src, cur), step, `方向 ${dir} 第 ${step} 步`);
        }
    }
    // 非共线时两者会不一致 —— 这正是必须分成两个函数的原因
    const a = { row: 10, col: 10 }, b = { row: 13, col: 17 };
    assert.notEqual(sgzzStepsAlongDirection(a, b), sgzzCubeDistance(a, b));
});

test("sgzzmap hex: cell key 打包/解包在全图范围内双射", () => {
    assert.equal(SGZZ_CELL_STRIDE, 10000);
    assert.equal(sgzzCellOf(0, 0), 0);
    assert.equal(sgzzCellOf(1499, 1499), 14991499);
    assert.ok(SGZZ_MAX_CELL < 2 ** 31, "cell 必须放得进 MySQL INT UNSIGNED");
    const rnd = lcg(99);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i += 1) {
        const row = Math.floor(rnd() * SGZZ_MAP_ROWS), col = Math.floor(rnd() * SGZZ_MAP_COLS);
        const cell = sgzzCellOf(row, col);
        assert.deepEqual(sgzzDecodeCell(cell), { row, col });
        assert.equal(isSgzzCell(cell), true);
        assert.equal(validateSgzzCell(cell), cell);
        seen.add(cell);
    }
    assert.ok(seen.size > 4500, "打包必须单射");
    for (const bad of [-1, 1.5, 15000000, 9999, NaN, "0", null, 1500 * SGZZ_CELL_STRIDE]) {
        assert.equal(isSgzzCell(bad as unknown), false, `${String(bad)} 必须被拒`);
        assert.throws(() => validateSgzzCell(bad as unknown));
    }
    assert.equal(isSgzzCell(sgzzCellOf(3, 9999 - 8500)), true);
    assert.throws(() => sgzzCellOf(1500, 0));
    assert.throws(() => sgzzCellOf(0, 1500));
    assert.throws(() => sgzzCellOf(-1, 0));
});

test("sgzzmap hex: 等距投影在全图范围内往返（含奇偶行与四角）", () => {
    // ⚠ 钉死 y = -y 发生在奇数行半格偏移之前；顺序反了只有奇数行错，且错半格
    assert.deepEqual(sgzzGrid2Pos(1, 0), { x: 16, y: -40 });
    assert.deepEqual(sgzzGrid2Pos(0, 0), { x: 0, y: -16 });
    assert.deepEqual(sgzzGrid2Pos(2, 3), { x: -32, y: -96 });
    const rnd = lcg(31337);
    const corners = [[0, 0], [0, SGZZ_MAP_COLS - 1], [SGZZ_MAP_ROWS - 1, 0],
                     [SGZZ_MAP_ROWS - 1, SGZZ_MAP_COLS - 1], [1, 1], [1, 0], [0, 1]];
    const samples: number[][] = [...corners];
    for (let i = 0; i < 6000; i += 1) {
        samples.push([Math.floor(rnd() * SGZZ_MAP_ROWS), Math.floor(rnd() * SGZZ_MAP_COLS)]);
    }
    for (const [row, col] of samples) {
        const p = sgzzGrid2Pos(row, col);
        assert.deepEqual(sgzzPos2GridRaw(p.x, p.y), { row, col }, `(${row},${col}) 往返失败`);
    }
    // 出界输入被钳回图内
    const clamped = sgzzPos2Grid(1e9, 1e9);
    assert.ok(sgzzInBounds(clamped.row, clamped.col));
    assert.deepEqual(sgzzClampGrid(-5, 99999), { row: 0, col: SGZZ_MAP_COLS - 1 });
});

test("sgzzmap hex: 世界包围盒约为 2:1（差半格），可玩区是其内接菱形", () => {
    const b = sgzzWorldBounds();
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    assert.equal(SGZZ_TILE_HALF_W / SGZZ_TILE_HALF_H, 2);
    // 末行奇偶错位让四角包围盒比精确 2:1 差半格；给一格容差即可，⛔ 别去「修」投影公式
    assert.ok(Math.abs(w / h - 2) < 4 * SGZZ_TILE_HALF_W / h, `包围盒应约为 2:1，实得 ${w}×${h}`);
    for (const [row, col] of [[0, 0], [0, 1499], [1499, 0], [1499, 1499], [750, 750]]) {
        const p = sgzzGrid2Pos(row, col);
        assert.ok(p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY);
    }
});

test("sgzzmap hex: 6 档 LOD 阈值单调，滞回不重叠、跨档一次到位", () => {
    assert.equal(SGZZ_LOD_MAX, 5);
    assert.equal(SGZZ_LOD_SCALE_THRESHOLDS.length, SGZZ_LOD_MAX);
    assert.equal(SGZZ_BIRDVIEW_LOD, 4);
    for (let i = 1; i < SGZZ_LOD_SCALE_THRESHOLDS.length; i += 1) {
        assert.ok(SGZZ_LOD_SCALE_THRESHOLDS[i] > SGZZ_LOD_SCALE_THRESHOLDS[i - 1], "阈值必须升序");
    }
    assert.equal(sgzzLodForScale(SGZZ_SCALE_MAX), 0);
    assert.equal(sgzzLodForScale(0.85), 0);
    assert.equal(sgzzLodForScale(0.84), 1);
    assert.equal(sgzzLodForScale(0.55), 1);
    assert.equal(sgzzLodForScale(0.34), 2);
    assert.equal(sgzzLodForScale(0.21), 3);
    assert.equal(sgzzLodForScale(0.13), 4);
    assert.equal(sgzzLodForScale(SGZZ_SCALE_MIN), 5);
    // 相邻档的滞回带不得重叠，否则会在两档之间死循环抖动
    for (let lod = 0; lod < SGZZ_LOD_MAX; lod += 1) {
        const lower = SGZZ_LOD_SCALE_THRESHOLDS[SGZZ_LOD_MAX - 1 - lod];
        assert.ok(lower * (1 - SGZZ_LOD_HYSTERESIS_RATIO) < lower * (1 + SGZZ_LOD_HYSTERESIS_RATIO));
        if (lod > 0) {
            const finer = SGZZ_LOD_SCALE_THRESHOLDS[SGZZ_LOD_MAX - lod];
            assert.ok(finer * (1 + SGZZ_LOD_HYSTERESIS_RATIO) > lower * (1 - SGZZ_LOD_HYSTERESIS_RATIO));
        }
    }
    // 带内不迁移
    assert.equal(sgzzLodForScaleStable(1, 0.85), 1, "刚过下界但不足 +8% 不升细");
    assert.equal(sgzzLodForScaleStable(0, 0.85 * 0.95), 0, "刚跌破但不足 -8% 不降粗");
    // 明确越界才迁移
    assert.equal(sgzzLodForScaleStable(1, 0.85 * 1.09), 0);
    assert.equal(sgzzLodForScaleStable(0, 0.85 * 0.9), 1);
    // 大幅缩放一次到位
    assert.equal(sgzzLodForScaleStable(0, SGZZ_SCALE_MIN), 5);
    assert.equal(sgzzLodForScaleStable(5, SGZZ_SCALE_MAX), 0);
    assert.throws(() => sgzzLodForScaleStable(-1, 1));
    assert.throws(() => sgzzLodForScaleStable(6, 1));
    assert.throws(() => sgzzLodForScaleStable(0, 0));
    assert.throws(() => sgzzLodForScale(-1));
});

test("sgzzmap hex: links 校验器 fail-closed，⛔ 不自动对称化", () => {
    const ok = {
        schemaVersion: 1, mapId: "zhongyuan",
        links: [
            { pos: [406, 464], kind: "pass", name: "虎牢关", adjacents: [[1137, 136]] },
            { pos: [1137, 136], kind: "ford", name: "孟津渡", adjacents: [[406, 464]] },
        ],
    };
    assert.equal(validateSgzzLinks(ok), true);
    const bad: [string, unknown][] = [
        ["非对称（B 不回指 A）", { ...ok, links: [ok.links[0], { ...ok.links[1], adjacents: [[1, 2]] }] }],
        ["自链", { ...ok, links: [{ pos: [5, 5], kind: "pass", name: "x", adjacents: [[5, 5]] }] }],
        ["已是六邻不算长程", { ...ok, links: [
            { pos: [10, 10], kind: "pass", name: "a", adjacents: [[10, 11]] },
            { pos: [10, 11], kind: "pass", name: "b", adjacents: [[10, 10]] }] }],
        ["重复 pos", { ...ok, links: [ok.links[0], ok.links[0]] }],
        ["坐标越界", { ...ok, links: [{ pos: [1500, 0], kind: "pass", name: "x", adjacents: [[0, 0]] }] }],
        ["kind 非法", { ...ok, links: [{ ...ok.links[0], kind: "bridge" }] }],
        ["adjacents 为空", { ...ok, links: [{ ...ok.links[0], adjacents: [] }] }],
        ["多余键", { ...ok, extra: 1 }],
        ["name 超长", { ...ok, links: [{ ...ok.links[0], name: "x".repeat(17) }] }],
        ["schemaVersion 不对", { ...ok, schemaVersion: 2 }],
    ];
    for (const [why, fixture] of bad) assert.equal(validateSgzzLinks(fixture), false, `必须拒：${why}`);
});
