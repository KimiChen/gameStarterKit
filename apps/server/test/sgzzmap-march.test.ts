import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_MARCH_MS_PER_TILE, SGZZ_MAX_MARCH_STEPS, SGZZ_MAX_TURNING_POINTS, SgzzMarchStatus,
    sgzzExpandPath, sgzzMarchDurationMs, sgzzMarchOrigin, sgzzMarchPositionAt, sgzzMarchSteps,
    sgzzMarchTarget, validateSgzzMarch, type ISgzzMarch,
} from "@game/shared/kits/sgzzmap/api/march/index";
import {
    sgzzCellOf, sgzzCubeDistance, sgzzDecodeCell, sgzzNextPos,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";

/** 从 (row,col) 朝 dir 走 n 步的终点。 */
function walk(row: number, col: number, dir: number, n: number): number {
    let cur = { row, col };
    for (let i = 0; i < n; i += 1) cur = sgzzNextPos(cur.row, cur.col, dir);
    return sgzzCellOf(cur.row, cur.col);
}

function march(points: number[], over: Partial<ISgzzMarch> = {}): ISgzzMarch {
    return {
        marchId: "m1", uid: "u1", path: points,
        departAt: 1_000_000, arriveAt: 1_000_000 + sgzzMarchDurationMs(points),
        status: SgzzMarchStatus.MARCHING, ...over,
    };
}

test("sgzzmap march: 六个方向的直线段都能逐格展开，且每一步恰好一格", () => {
    for (const startRow of [400, 401]) {               // 偶行与奇行都要过
        for (let dir = 1; dir <= 6; dir += 1) {
            const end = walk(startRow, 400, dir, 5);
            const cells = sgzzExpandPath([sgzzCellOf(startRow, 400), end]);
            assert.equal(cells.length, 6, `dir=${dir} 应展开成 6 格`);
            assert.equal(cells[0], sgzzCellOf(startRow, 400));
            assert.equal(cells[5], end);
            for (let i = 1; i < cells.length; i += 1) {
                assert.equal(sgzzCubeDistance(sgzzDecodeCell(cells[i - 1]), sgzzDecodeCell(cells[i])), 1,
                    `dir=${dir} 第 ${i} 步不是一格`);
            }
            assert.equal(new Set(cells).size, cells.length, "⛔ 同一格不得在路径里出现两次");
        }
    }
});

test("sgzzmap march: 多段折线首尾相接、不重复关节", () => {
    const a = sgzzCellOf(500, 500);
    const b = walk(500, 500, 3, 4);
    const bc = sgzzDecodeCell(b);
    const c = walk(bc.row, bc.col, 1, 3);
    const cells = sgzzExpandPath([a, b, c]);
    assert.equal(cells.length, 4 + 3 + 1, "关节格⛔不得算两次");
    assert.equal(cells[0], a);
    assert.equal(cells[4], b, "第一段终点就是关节");
    assert.equal(cells[cells.length - 1], c);
    assert.equal(sgzzMarchSteps([a, b, c]), 7);
    assert.equal(sgzzMarchDurationMs([a, b, c]), 7 * SGZZ_MARCH_MS_PER_TILE);
});

test("sgzzmap march: ★ 非共线的「假直线」必须被拒 —— 六边形里看着直不等于直", () => {
    const src = sgzzCellOf(600, 600);
    // 朝 dir=3 走 4 步的真终点
    const real = walk(600, 600, 3, 4);
    assert.doesNotThrow(() => sgzzExpandPath([src, real]));
    // 同样的 Δrow 但 Δcol 差一格 ⇒ 不在任何一条射线上
    const rc = sgzzDecodeCell(real);
    const fake = sgzzCellOf(rc.row, rc.col + 1);
    assert.throws(() => sgzzExpandPath([src, fake]), "偏一格的终点必须拒");
    // ⚠ 单纯给 real 的 row 加 1 **仍在同一条射线上**（只是走远了一步），测不到东西。
    //   真正的「假直线」得是拐了个弯的终点：先走 3 步 dir3，再走 1 步 dir1。
    const bendMid = sgzzDecodeCell(walk(600, 600, 3, 3));
    const bendEnd = walk(bendMid.row, bendMid.col, 1, 1);
    assert.doesNotThrow(() => sgzzExpandPath([src, sgzzCellOf(bendMid.row, bendMid.col), bendEnd]),
        "拆成两段是合法折线");
    assert.throws(() => sgzzExpandPath([src, bendEnd]),
        "但把拐点抹掉、当成一段直线下发，必须拒");
});

test("sgzzmap march: 路径 fail-closed（空/单点/重复点/超长/超转折点）", () => {
    const a = sgzzCellOf(700, 700);
    assert.throws(() => sgzzExpandPath([]), "空路径");
    assert.throws(() => sgzzExpandPath([a]), "单点不是路径");
    assert.throws(() => sgzzExpandPath([a, a]), "原地不动");
    const long = walk(700, 700, 3, SGZZ_MAX_MARCH_STEPS + 1);
    assert.throws(() => sgzzExpandPath([a, long]), `超过 ${SGZZ_MAX_MARCH_STEPS} 步必须拒`);
    const ok = walk(700, 700, 3, SGZZ_MAX_MARCH_STEPS);
    assert.doesNotThrow(() => sgzzExpandPath([a, ok]), "正好上限应放行");
    // 转折点个数上限
    const many: number[] = [a];
    let cur = sgzzDecodeCell(a);
    for (let i = 0; i < SGZZ_MAX_TURNING_POINTS; i += 1) {
        cur = sgzzNextPos(cur.row, cur.col, (i % 2) + 2);
        many.push(sgzzCellOf(cur.row, cur.col));
    }
    assert.throws(() => sgzzExpandPath(many), `超过 ${SGZZ_MAX_TURNING_POINTS} 个转折点必须拒`);
});

test("sgzzmap march: 插值确定、端点精确、时钟回跳与暂停都钳住", () => {
    const a = sgzzCellOf(800, 800);
    const b = walk(800, 800, 3, 4);
    const m = march([a, b]);
    const cells = sgzzExpandPath([a, b]);

    const start = sgzzMarchPositionAt(m, m.departAt);
    assert.equal(start.cell, a);
    assert.equal(start.t, 0);
    assert.equal(start.stepIndex, 0);

    const mid = sgzzMarchPositionAt(m, m.departAt + 2 * SGZZ_MARCH_MS_PER_TILE + 500);
    assert.equal(mid.cell, cells[2]);
    assert.equal(mid.nextCell, cells[3]);
    assert.equal(mid.t, 0.5);
    assert.equal(mid.stepIndex, 2);

    const end = sgzzMarchPositionAt(m, m.arriveAt);
    assert.equal(end.cell, b);
    assert.equal(end.nextCell, b);
    assert.equal(end.t, 0);

    // ⚠ 时钟回跳 / 拖到未来都不得让 t 出界
    for (const now of [0, m.departAt - 999_999, m.arriveAt + 999_999, Number.MAX_SAFE_INTEGER]) {
        const p = sgzzMarchPositionAt(m, now);
        assert.ok(p.t >= 0 && p.t <= 1, `t 必须钳在 [0,1]，now=${now} 得 ${p.t}`);
        assert.ok(p.stepIndex >= 0 && p.stepIndex <= cells.length - 1);
        assert.ok(cells.includes(p.cell), "⛔ 不得插值到路径外的格");
    }
    // 已到达 / 已撤回：停在终点
    assert.equal(sgzzMarchPositionAt({ ...m, status: SgzzMarchStatus.ARRIVED }, m.departAt).cell, b);
    assert.equal(sgzzMarchPositionAt({ ...m, status: SgzzMarchStatus.RECALLED }, m.departAt).cell, b);
});

test("sgzzmap march: 线型校验重算到达时刻，⛔ 不信任线上传来的数字", () => {
    const a = sgzzCellOf(900, 900);
    const b = walk(900, 900, 4, 3);
    const m = march([a, b]);
    assert.deepEqual(validateSgzzMarch(m), m);
    assert.equal(sgzzMarchOrigin(m), a);
    assert.equal(sgzzMarchTarget(m), b);

    assert.throws(() => validateSgzzMarch({ ...m, arriveAt: m.arriveAt + 1 }), "到达时刻对不上路径必须拒");
    assert.throws(() => validateSgzzMarch({ ...m, arriveAt: m.departAt }), "零耗时必须拒");
    assert.throws(() => validateSgzzMarch({ ...m, status: "flying" }), "状态白名单");
    assert.throws(() => validateSgzzMarch({ ...m, path: [a] }), "单点路径");
    assert.throws(() => validateSgzzMarch({ ...m, extra: 1 }), "多余键");
    assert.throws(() => validateSgzzMarch({ ...m, path: [a, sgzzCellOf(900, 950)] }),
        "非共线路径在校验阶段就被拒");
});
