import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_MAX_QUADS_PER_MESH, buildSgzzDiamondMesh, buildSgzzPlateMesh, sgzzBorderStripPoly,
    sgzzGridEdgePolys, sgzzPainterCompare, sgzzSelectionEdges, type SgzzQuadInput,
} from "../src/kits/sgzzmap/logic/sgzzMesh";
import {
    SGZZ_PLANNED_LAYERS, sgzzLayerVisible, sgzzVisibleLayers,
} from "../src/kits/sgzzmap/logic/sgzzLayers";
import { SGZZ_MAX_BORDER_EDGES, SgzzBorderSet } from "../src/kits/sgzzmap/logic/sgzzBorder";
import {
    SGZZ_MAP_COLS, SGZZ_MAP_ROWS, SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W,
    sgzzGrid2Pos, sgzzNeighbours, sgzzRingTable,
} from "../src/shared/kits/sgzzmap/api/hexmap/index";

function quad(row: number, col: number): SgzzQuadInput {
    return { row, col, uv: [0, 0, 0.25, 0.5], rgba: [1, 1, 1, 1] };
}
function vertexOf(g: { positions: Float32Array }, quadIndex: number, v: number): [number, number] {
    return [g.positions[(quadIndex * 4 + v) * 3], g.positions[(quadIndex * 4 + v) * 3 + 1]];
}

test("sgzzmap mesh: 一格四顶点就是菱形的 N/E/S/W", () => {
    const g = buildSgzzDiamondMesh([quad(700, 700)]);
    assert.equal(g.quads, 1);
    const c = sgzzGrid2Pos(700, 700);
    assert.deepEqual(vertexOf(g, 0, 0), [c.x, c.y + SGZZ_TILE_HALF_H]);
    assert.deepEqual(vertexOf(g, 0, 1), [c.x + SGZZ_TILE_HALF_W, c.y]);
    assert.deepEqual(vertexOf(g, 0, 2), [c.x, c.y - SGZZ_TILE_HALF_H]);
    assert.deepEqual(vertexOf(g, 0, 3), [c.x - SGZZ_TILE_HALF_W, c.y]);
    assert.deepEqual([...g.indices16], [0, 1, 2, 0, 2, 3]);
    assert.deepEqual(g.minPos, [c.x - SGZZ_TILE_HALF_W, c.y - SGZZ_TILE_HALF_H, 0]);
    assert.deepEqual(g.maxPos, [c.x + SGZZ_TILE_HALF_W, c.y + SGZZ_TILE_HALF_H, 0]);
});

test("sgzzmap mesh: ★ 相邻格共享顶点位置 —— 无缝无叠（等距菱形正好铺满平面）", () => {
    for (const centre of [{ row: 700, col: 700 }, { row: 701, col: 700 }]) {
        const neighbours = sgzzNeighbours(centre.row, centre.col);
        assert.equal(neighbours.length, 6);
        const g = buildSgzzDiamondMesh([quad(centre.row, centre.col), ...neighbours.map((n) => quad(n.row, n.col))]);
        // 收集全部顶点，按坐标归并
        const seen = new Map<string, number>();
        for (let q = 0; q < g.quads; q += 1) {
            for (let v = 0; v < 4; v += 1) {
                const [x, y] = vertexOf(g, q, v);
                const key = `${x.toFixed(6)},${y.toFixed(6)}`;
                seen.set(key, (seen.get(key) ?? 0) + 1);
            }
        }
        // 每个格有 4 个顶点 × 7 格 = 28 个；若无缝，必有大量顶点被多格共享
        const shared = [...seen.values()].filter((n) => n > 1).length;
        assert.ok(shared >= 6, `row=${centre.row} 共享顶点只有 ${shared} 个，说明有缝或有叠`);
        // 面积守恒：七个菱形互不重叠 ⇒ 总面积 = 7 × 2·TW·TH
        const area = 2 * SGZZ_TILE_HALF_W * SGZZ_TILE_HALF_H;
        const bboxW = g.maxPos[0] - g.minPos[0], bboxH = g.maxPos[1] - g.minPos[1];
        assert.ok(bboxW * bboxH >= 7 * area, "包围盒至少装得下七格");
    }
});

test("sgzzmap mesh: 画家序是 (row+col) 再 (row−col)，且稳定", () => {
    assert.ok(sgzzPainterCompare({ row: 1, col: 1 }, { row: 1, col: 2 }) < 0);
    assert.ok(sgzzPainterCompare({ row: 2, col: 1 }, { row: 1, col: 2 }) === 0 - 0 + 2, "同和时按 row−col");
    const input = [quad(5, 5), quad(1, 1), quad(3, 2), quad(2, 3)];
    const g = buildSgzzDiamondMesh(input);
    const sums = input.map((q) => q.row + q.col);
    for (let i = 1; i < sums.length; i += 1) assert.ok(sums[i] >= sums[i - 1], "排完必须按和升序");
    assert.equal(g.quads, 4);
    // (3,2) 与 (2,3) 同和 ⇒ 按 row−col 升序：(2,3) 在前
    assert.deepEqual([input[1].row, input[1].col], [2, 3]);
    assert.deepEqual([input[2].row, input[2].col], [3, 2]);
});

test("sgzzmap mesh: UV 取四边中点、内缩朝中心收；顶点色逐顶点写满", () => {
    const g = buildSgzzDiamondMesh([{ row: 10, col: 10, uv: [0, 0, 1, 1], rgba: [0.1, 0.2, 0.3, 0.4] }]);
    assert.deepEqual([...g.uvs], [0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5]);
    // ⚠ Float32Array 存不下精确的 0.1，逐顶点比要带容差，⛔ 不能 deepEqual
    for (let v = 0; v < 4; v += 1) {
        const got = [...g.colors.slice(v * 4, v * 4 + 4)];
        [0.1, 0.2, 0.3, 0.4].forEach((want, k) => {
            assert.ok(Math.abs(got[k] - want) < 1e-6, `顶点 ${v} 通道 ${k}：${got[k]} ≠ ${want}`);
        });
    }
    const inset = buildSgzzDiamondMesh([{ row: 10, col: 10, uv: [0, 0, 1, 1], rgba: [1, 1, 1, 1] }], 0.1);
    // 内缩后每个 UV 都朝 (0.5,0.5) 靠拢，⛔ 不是轴向收
    for (let v = 0; v < 4; v += 1) {
        const u = inset.uvs[v * 2], vv = inset.uvs[v * 2 + 1];
        assert.ok(Math.abs(u - 0.5) < 0.5 && Math.abs(vv - 0.5) < 0.5, "内缩必须朝中心");
    }
});

test("sgzzmap mesh: 四边形数上限与整幅底图", () => {
    const many: SgzzQuadInput[] = [];
    for (let i = 0; i <= SGZZ_MAX_QUADS_PER_MESH; i += 1) many.push(quad(0, i % 1000));
    assert.throws(() => buildSgzzDiamondMesh(many), "超 Uint16 索引上限必须抛，⛔ 不静默截断");
    assert.equal(buildSgzzDiamondMesh([]).quads, 0, "空 mesh 不炸");

    const plate = buildSgzzPlateMesh({ minX: -10, minY: -5, maxX: 10, maxY: 5 });
    assert.equal(plate.quads, 1);
    assert.deepEqual([...plate.uvs], [0, 0, 1, 0, 1, 1, 0, 1]);
    assert.deepEqual(plate.minPos, [-10, -5, 0]);
    assert.deepEqual(plate.maxPos, [10, 5, 0]);
});

test("sgzzmap border: 单格的边界就是它的六条边，方向号按环序", () => {
    const set = new SgzzBorderSet();
    set.add(700, 700);
    const edges = set.edges(SGZZ_MAP_ROWS, SGZZ_MAP_COLS);
    assert.equal(edges.length, 6, "孤立一格六条边都要描");
    assert.deepEqual(edges.map((e) => e.resDir), [1, 2, 3, 4, 5, 6]);
    for (const e of edges) assert.deepEqual([e.row, e.col], [700, 700]);
    assert.equal(sgzzRingTable(700).length, 6);
});

test("sgzzmap border: 内部格不描边，只描朝外的那几条", () => {
    const set = new SgzzBorderSet();
    const centre = { row: 700, col: 700 };
    set.add(centre.row, centre.col);
    for (const n of sgzzNeighbours(centre.row, centre.col)) set.add(n.row, n.col);
    const edges = set.edges(SGZZ_MAP_ROWS, SGZZ_MAP_COLS);
    // 中心格被六邻包住 ⇒ 它一条边都不该有
    assert.equal(edges.filter((e) => e.row === centre.row && e.col === centre.col).length, 0,
        "被包住的格⛔不描边");
    assert.ok(edges.length > 0, "外圈仍要描边");
    for (const e of edges) assert.ok(set.has(e.row, e.col), "边片必须挂在区域内的格上");
});

test("sgzzmap border: 引用计数可叠加 —— 撤掉一个区域不抹掉另一个的边", () => {
    const set = new SgzzBorderSet();
    set.add(700, 700);
    set.add(700, 700);          // 两个区域都覆盖这一格
    assert.equal(set.size, 1);
    set.remove(700, 700);
    assert.equal(set.size, 1, "还有一个引用，格必须留着");
    assert.equal(set.edges(SGZZ_MAP_ROWS, SGZZ_MAP_COLS).length, 6);
    set.remove(700, 700);
    assert.equal(set.size, 0);
    assert.equal(set.edges(SGZZ_MAP_ROWS, SGZZ_MAP_COLS).length, 0);
    set.remove(700, 700);       // 多撤一次不炸
    assert.equal(set.size, 0);
});

test("sgzzmap border: 地图边缘算「外面」，边片有硬上限", () => {
    const set = new SgzzBorderSet();
    set.add(0, 0);
    const edges = set.edges(SGZZ_MAP_ROWS, SGZZ_MAP_COLS);
    assert.equal(edges.length, 6, "图角上的格，出界的邻居也要描边");

    // ⚠ 连成一列的格彼此**是**邻居 ⇒ 内部格只剩四条外露边，400 格只出 1602 条，压不到上限。
    //   要压满得用互不相邻的散格（每格满 6 条）。
    const big = new SgzzBorderSet();
    for (let row = 0; row < 400; row += 1) big.add(row * 3, (row * 3) % 1000);   // 400 × 6 = 2400 > 2048
    const capped = big.edges(SGZZ_MAP_ROWS, SGZZ_MAP_COLS);
    assert.equal(capped.length, SGZZ_MAX_BORDER_EDGES, "必须钳在上限");
    assert.ok(big.dropped > 0, "被丢掉的数量要记下来（调试面板要显示）");
});

test("★ 网格线：每格只画 NE/SE 两条边 —— 铺满整张网且每条边只画一遍", () => {
    const rgba = [0, 0, 0, 0.2] as const;
    const polys = sgzzGridEdgePolys(700, 700, 0.5, rgba);
    assert.equal(polys.length, 2, "⛔ 画四条会把每条内部边画两遍");

    // 两条边必须是 N→E 与 E→S：端点落在菱形的 N/E/S 三个顶点上
    const c = sgzzGrid2Pos(700, 700);
    const N = [c.x, c.y + SGZZ_TILE_HALF_H], E = [c.x + SGZZ_TILE_HALF_W, c.y], S = [c.x, c.y - SGZZ_TILE_HALF_H];
    const mid = (p: readonly (readonly [number, number])[]) => [
        (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4,
    ];
    const near = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
    assert.ok(near(mid(polys[0].points), [(N[0] + E[0]) / 2, (N[1] + E[1]) / 2]), "第一条是 N→E");
    assert.ok(near(mid(polys[1].points), [(E[0] + S[0]) / 2, (E[1] + S[1]) / 2]), "第二条是 E→S");

    // ★ 无缝无重：一格的 NE 边 = 右上邻格的 SW 边。全平面逐格画两条 ⇒ 每条边恰好一次。
    // 用「边的中点」作为边的身份，在一片格上统计：出现两次就说明画重了。
    const seen = new Map<string, number>();
    for (let row = 700; row < 712; row += 1) {
        for (let col = 700; col < 712; col += 1) {
            for (const poly of sgzzGridEdgePolys(row, col, 0.5, rgba)) {
                const m = mid(poly.points).map((v) => Math.round(v * 1000)).join(",");
                seen.set(m, (seen.get(m) ?? 0) + 1);
            }
        }
    }
    assert.equal([...seen.values()].filter((n) => n > 1).length, 0, "同一条边⛔不得画两遍");
    assert.equal(seen.size, 12 * 12 * 2, "12×12 格该出 288 条互不相同的边");
});

test("★ 层表：未实现的层恒不可见（⛔ 不许门控说该建而渲染器没写）", () => {
    assert.deepEqual([...SGZZ_PLANNED_LAYERS], ["decor", "banner", "label"]);
    for (const id of SGZZ_PLANNED_LAYERS) {
        for (let lod = 0; lod <= 5; lod += 1) {
            assert.equal(sgzzLayerVisible(id, lod), false, `${id} @LOD${lod} 必须不可见`);
        }
        assert.ok(!sgzzVisibleLayers(0).includes(id), `${id} ⛔ 不得出现在 LOD0 的可见层里`);
    }
    // grid 已实现：LOD 0/1 建、LOD 2 起撤
    assert.equal(sgzzLayerVisible("grid", 0), true);
    assert.equal(sgzzLayerVisible("grid", 1), true);
    assert.equal(sgzzLayerVisible("grid", 2), false);
    assert.ok(sgzzVisibleLayers(0).includes("grid"));
});

test("★ 描边：六段首尾相接绕菱形一圈，⛔ 不是重涂整格、也⛔不是六道乱划的斜杠", () => {
    const rgba = [1, 0.878, 0.467, 0.85] as const;
    for (const row of [700, 701]) {          // ⚠ 与行奇偶无关，两种都测
        const c = sgzzGrid2Pos(row, 700);
        const ends: [number, number][][] = [];
        for (let dir = 1; dir <= 6; dir += 1) {
            const poly = sgzzBorderStripPoly(row, 700, dir, 0.6, rgba);
            assert.ok(poly, `resDir ${dir} 必须出条`);
            // 条是「线段 ± 法线」铺出来的四边形 ⇒ 两端中点即线段端点
            const p = poly!.points;
            ends.push([
                [(p[0][0] + p[3][0]) / 2, (p[0][1] + p[3][1]) / 2],
                [(p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2],
            ]);
        }
        // ① 首尾相接：第 i 段的终点 = 第 i+1 段的起点
        for (let i = 0; i < 6; i += 1) {
            const cur = ends[i][1], next = ends[(i + 1) % 6][0];
            assert.ok(Math.hypot(cur[0] - next[0], cur[1] - next[1]) < 1e-6,
                `row ${row}: 第 ${i + 1} 段与第 ${(i + 1) % 6 + 1} 段没接上 —— 那就围不成一圈`);
        }
        // ② 全部落在菱形内缘（⛔ 不许戳出格外，⛔ 也不许缩到格心）
        for (const [i, seg] of ends.entries()) {
            for (const [x, y] of seg) {
                const depth = Math.abs(x - c.x) / SGZZ_TILE_HALF_W + Math.abs(y - c.y) / SGZZ_TILE_HALF_H;
                assert.ok(depth > 0.7 && depth <= 1.0,
                    `row ${row} resDir ${i + 1} 的端点深度 ${depth.toFixed(2)}，该贴内缘`);
            }
        }
        // ③ resDir 1(SW) 与 4(NE) 是整条菱形边，2/3、5/6 各是半条
        const len = (i: number) => Math.hypot(ends[i][1][0] - ends[i][0][0], ends[i][1][1] - ends[i][0][1]);
        const edge = Math.hypot(SGZZ_TILE_HALF_W, SGZZ_TILE_HALF_H) * 0.88;
        for (const i of [0, 3]) assert.ok(Math.abs(len(i) - edge) < 1e-6, `resDir ${i + 1} 该是整条边`);
        for (const i of [1, 2, 4, 5]) assert.ok(Math.abs(len(i) - edge / 2) < 1e-6, `resDir ${i + 1} 该是半条边`);
    }
    assert.equal(sgzzBorderStripPoly(700, 700, 0, 0.6, rgba), null, "方向号越界回 null");
    assert.equal(sgzzBorderStripPoly(700, 700, 7, 0.6, rgba), null, "方向号越界回 null");
});

test("★ 选中框是菱形轮廓，⛔ 不是包围盒长方形", () => {
    const bars = sgzzSelectionEdges(3, 0);
    assert.equal(bars.length, 4);

    // ⚠ 2:1 菱形的边倾角是 atan2(TH,TW) ≈ 26.565°，⛔ 不是 45°（那是正方形转的）
    const tilt = Math.atan2(SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W) * 180 / Math.PI;
    assert.ok(Math.abs(tilt - 26.565) < 0.01, `倾角应约 26.565°，实际 ${tilt.toFixed(3)}`);
    for (const bar of bars) assert.ok(Math.abs(Math.abs(bar.angle) - tilt) < 1e-9);
    // ⛔ 不许出现轴对齐的条（0° / 90°）——那就是长方形
    for (const bar of bars) assert.notEqual(Math.round(Math.abs(bar.angle)) % 90, 0);

    // 四条边的端点要正好落在菱形的四个顶点 N/E/S/W 上
    const corners = new Set<string>();
    for (const bar of bars) {
        const rad = bar.angle * Math.PI / 180;
        const dx = Math.cos(rad) * bar.length / 2, dy = Math.sin(rad) * bar.length / 2;
        for (const s of [-1, 1]) {
            corners.add([bar.x + s * dx, bar.y + s * dy].map((v) => Math.round(v * 1e6) / 1e6).join(","));
        }
    }
    const want = new Set([
        [0, SGZZ_TILE_HALF_H], [SGZZ_TILE_HALF_W, 0], [0, -SGZZ_TILE_HALF_H], [-SGZZ_TILE_HALF_W, 0],
    ].map((p) => p.map((v) => Math.round(v * 1e6) / 1e6).join(",")));
    assert.deepEqual([...corners].sort(), [...want].sort(), "四条边应首尾相接于 N/E/S/W 四个顶点");
});
