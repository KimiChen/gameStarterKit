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
    SGZZ_DECOR_JITTER, SGZZ_DECOR_KINDS, SGZZ_DECOR_MARGIN_TILES, SGZZ_DECOR_MAX_HEIGHT,
    SGZZ_DECOR_ANCHOR_Y_PX, SGZZ_DECOR_CANVAS_PX, SGZZ_DECOR_NONE, SGZZ_DECOR_PX_PER_UNIT,
    sgzzDecorAt, sgzzDecorAtlasUv, sgzzDecorBaseY, sgzzDecorQuad, sgzzDecorScale,
    sgzzDecorSpriteQuad, sgzzDecorSpriteUvs,
} from "../src/kits/sgzzmap/logic/sgzzDecor";
import { SgzzmapWorldLogic } from "../src/kits/sgzzmap/logic/SgzzmapWorldLogic";
import {
    SGZZ_BLEND_DEPTH_MAX, SGZZ_BLEND_DEPTH_MIN, SGZZ_BLEND_PRIORITY,
    sgzzBlendDepth, sgzzBlendQuad, sgzzBlendSource,
} from "../src/kits/sgzzmap/logic/sgzzBlend";
import {
    SGZZ_MAP_COLS, SGZZ_MAP_ROWS, SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W,
    sgzzAtlasUv, sgzzGrid2Pos, sgzzNeighbours, sgzzRingTable, sgzzTileVariant,
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
    // ⚠ 实现一层就从这里少一个 —— 这条红过一次（decor 做完时），说明它真的在看守
    assert.deepEqual([...SGZZ_PLANNED_LAYERS], ["banner", "label"]);
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
    // decor 已实现：LOD 0/1 建、LOD 2 起撤
    assert.equal(sgzzLayerVisible("decor", 1), true);
    assert.equal(sgzzLayerVisible("decor", 2), false);
    assert.ok(sgzzVisibleLayers(0).includes("decor"));
    // blend 已实现：LOD 0/1 建、LOD 2 起撤（一格 22×11 像素时过渡看不见）
    assert.equal(sgzzLayerVisible("blend", 1), true);
    assert.equal(sgzzLayerVisible("blend", 2), false);
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

test("★ 图集取样变体：位置的纯函数、四种都用得到、相邻格不同", () => {
    // ⚠ 必须是位置的纯函数：同一格每帧同一个变体，⛔ 随机数会让平移时纹理乱闪
    for (let i = 0; i < 50; i += 1) {
        assert.equal(sgzzTileVariant(700 + i, 713), sgzzTileVariant(700 + i, 713));
    }
    // 四种变体都要出现，且分布不至于太偏（否则等于没打散）
    const hist = [0, 0, 0, 0];
    for (let row = 600; row < 700; row += 1) {
        for (let col = 600; col < 700; col += 1) hist[sgzzTileVariant(row, col)] += 1;
    }
    const total = hist.reduce((a, b) => a + b, 0);
    assert.equal(total, 10_000);
    for (const [i, n] of hist.entries()) {
        assert.ok(n > total * 0.15, `变体 ${i} 只占 ${(n / total * 100).toFixed(1)}%，太偏`);
    }
    // 相邻格大多不同 —— 否则成片同变体，铺地砖感照旧
    let same = 0, pairs = 0;
    for (let row = 600; row < 700; row += 1) {
        for (let col = 600; col < 699; col += 1) {
            pairs += 1;
            if (sgzzTileVariant(row, col) === sgzzTileVariant(row, col + 1)) same += 1;
        }
    }
    assert.ok(same / pairs < 0.4, `相邻同变体占 ${(same / pairs * 100).toFixed(1)}%，打散得不够`);
});

test("★ 翻转只在格内镜像，⛔ 不会采到隔壁格", () => {
    const uv = [...sgzzAtlasUv(1)] as [number, number, number, number];   // forest 那一格
    const [u0, v0, uw, vh] = uv;
    for (const flip of [0, 1, 2, 3]) {
        const g = buildSgzzDiamondMesh([{ row: 700, col: 700, uv, flip, rgba: [1, 1, 1, 1] }]);
        for (let i = 0; i < 4; i += 1) {
            const u = g.uvs[i * 2], v = g.uvs[i * 2 + 1];
            assert.ok(u >= u0 - 1e-9 && u <= u0 + uw + 1e-9, `flip ${flip} 的 u 跑出格外`);
            assert.ok(v >= v0 - 1e-9 && v <= v0 + vh + 1e-9, `flip ${flip} 的 v 跑出格外`);
        }
    }
    // 横翻确实换了内容：N/S 顶点不动（u=0.5），E/W 互换
    const plain = buildSgzzDiamondMesh([{ row: 700, col: 700, uv, flip: 0, rgba: [1, 1, 1, 1] }]);
    const flipped = buildSgzzDiamondMesh([{ row: 700, col: 700, uv, flip: 1, rgba: [1, 1, 1, 1] }]);
    assert.equal(plain.uvs[2], flipped.uvs[6], "E 的 u 该变成原来 W 的");
    assert.equal(plain.uvs[6], flipped.uvs[2], "W 的 u 该变成原来 E 的");
});

test("★ 摆件：地形决定种类、位置的纯函数、水里不种树", () => {
    // ⛔ 水域/海/图外不许有摆件
    for (const terrain of [4, 5, 8]) {
        for (let row = 700; row < 740; row += 1) {
            for (let col = 700; col < 740; col += 1) {
                assert.equal(sgzzDecorAt(terrain, row, col), SGZZ_DECOR_NONE, `地形 ${terrain} 不该有摆件`);
            }
        }
    }
    // ⚠ 位置的纯函数：⛔ 随机数会让平移时摆件乱跳
    for (let i = 0; i < 40; i += 1) {
        assert.equal(sgzzDecorAt(1, 700 + i, 713), sgzzDecorAt(1, 700 + i, 713));
    }
    // 密度要留白：森林最密也得留出空地，平原要稀疏
    const rate = (terrain: number) => {
        let hit = 0, total = 0;
        for (let row = 600; row < 700; row += 1) {
            for (let col = 600; col < 700; col += 1) {
                total += 1;
                if (sgzzDecorAt(terrain, row, col) !== SGZZ_DECOR_NONE) hit += 1;
            }
        }
        return hit / total;
    };
    const forest = rate(1), plain = rate(0);
    assert.ok(forest > 0.45 && forest < 0.65, `森林摆件率 ${(forest * 100).toFixed(1)}%`);
    assert.ok(plain > 0.05 && plain < 0.2, `平原摆件率 ${(plain * 100).toFixed(1)}%，该稀疏`);
    // 森林两种树都要出现
    const kinds = new Set<number>();
    for (let row = 600; row < 700; row += 1) {
        for (let col = 600; col < 700; col += 1) {
            const d = sgzzDecorAt(1, row, col);
            if (d !== SGZZ_DECOR_NONE) kinds.add(d);
        }
    }
    assert.deepEqual([...kinds].sort(), [0, 1], "森林该有阔叶与针叶两种");
});

test("★ 摆件必须超出菱形往上长，⛔ 压回格内就退化成地表片了", () => {
    const c = sgzzGrid2Pos(700, 700);
    for (const kind of SGZZ_DECOR_KINDS) {
        const poly = sgzzDecorQuad(700, 700, kind.id);
        assert.ok(poly, `${kind.name} 该出四边形`);
        const ys = poly!.points.map((p) => p[1]);
        const top = Math.max(...ys), bottom = Math.min(...ys);
        assert.ok(bottom < c.y, `${kind.name} 的底该略沉进格里`);
        const h = top - bottom;
        assert.ok(h >= kind.height * (1 - SGZZ_DECOR_JITTER) - 1e-9
            && h <= kind.height * (1 + SGZZ_DECOR_JITTER) + 1e-9,
            `${kind.name} 高度 ${h.toFixed(1)} 超出抖动带 ${kind.height}±${SGZZ_DECOR_JITTER * 100}%`);
        // 顶边比底边窄 ⇒ 是剪影不是方块
        const topW = Math.abs(poly!.points[1][0] - poly!.points[0][0]);
        const bottomW = Math.abs(poly!.points[2][0] - poly!.points[3][0]);
        assert.ok(topW < bottomW, `${kind.name} 顶边该比底边窄`);
    }
    // ★ 至少有一种要真的高过菱形（2×TH），否则这一层没有存在意义
    assert.ok(SGZZ_DECOR_MAX_HEIGHT > SGZZ_TILE_HALF_H * 2,
        `最高摆件 ${SGZZ_DECOR_MAX_HEIGHT} 没超过一格的高度 ${SGZZ_TILE_HALF_H * 2}`);
    assert.equal(sgzzDecorQuad(700, 700, 99), null, "未知摆件号回 null");
});

test("★ 视口预取余量要盖得住摆件高度，⛔ 否则下边缘的树会突然弹出来", () => {
    // ⚠ 这条红过一次：加了尺寸抖动之后最高摆件从 62 涨到 71.3，越过了默认的 2 格（64）余量。
    const marginWorld = SGZZ_DECOR_MARGIN_TILES * SGZZ_TILE_HALF_H * 2;
    assert.ok(marginWorld >= SGZZ_DECOR_MAX_HEIGHT,
        `余量 ${marginWorld} < 最高摆件 ${SGZZ_DECOR_MAX_HEIGHT.toFixed(1)}：屏幕下方的摆件会弹出`);
    // ⚠ 页模型必须真的用这个余量，⛔ 不能只是常量对了而构造时忘了传
    const logicStencil = new SgzzmapWorldLogic(
        { selfUid: () => "u", view: async () => { throw new Error("x"); }, zoom: async () => { throw new Error("x"); },
          tile: async () => { throw new Error("x"); }, occupy: async () => { throw new Error("x"); },
          abandon: async () => { throw new Error("x"); }, now: () => 0, tick: () => () => {}, close: () => {} } as never,
        750, 1122).stencil;
    assert.equal(logicStencil.marginTiles, SGZZ_DECOR_MARGIN_TILES);
});

test("★ 过渡：一条交界只画一次 —— 只有低优先级那一格画，⛔ 两边都画会互相糊", () => {
    const ROWS = 1500, COLS = 1500;
    // 造一条交界：左半森林(1)、右半平原(0)
    const terrain = (_row: number, col: number) => (col < 700 ? 1 : 0);
    let mine = 0, theirs = 0;
    for (let row = 690; row < 710; row += 1) {
        for (let dir = 1; dir <= 6; dir += 1) {
            if (sgzzBlendSource(terrain, row, 699, dir, ROWS, COLS) >= 0) mine += 1;   // 森林侧
            if (sgzzBlendSource(terrain, row, 700, dir, ROWS, COLS) >= 0) theirs += 1; // 平原侧
        }
    }
    assert.equal(mine, 0, "森林优先级高，⛔ 不该在自己这一格上铺");
    assert.ok(theirs > 0, "平原侧应铺森林的边缘");
    // 铺的必须是**邻格**的地形
    for (let dir = 1; dir <= 6; dir += 1) {
        const src = sgzzBlendSource(terrain, 700, 700, dir, ROWS, COLS);
        if (src >= 0) assert.equal(src, 1, "铺的该是森林");
    }
    // 同地形不铺；出界不铺；图外不参与
    assert.equal(sgzzBlendSource(() => 0, 700, 700, 1, ROWS, COLS), -1, "同地形⛔不铺");
    assert.equal(sgzzBlendSource(() => 1, 0, 0, 2, ROWS, COLS), -1, "出界⛔不铺");
    assert.equal(sgzzBlendSource((_r, c) => (c < 700 ? 8 : 0), 700, 700, 1, ROWS, COLS), -1, "图外⛔不参与");
    assert.equal(sgzzBlendSource((_r, c) => (c < 700 ? 0 : 8), 700, 699, 4, ROWS, COLS), -1, "图外⛔不参与");
    // 优先级里除图外之外必须两两不同，⛔ 平局会让「谁铺谁」不确定
    const active = SGZZ_BLEND_PRIORITY.filter((p) => p >= 0);
    assert.equal(new Set(active).size, active.length, "优先级⛔不得有平局");
    assert.equal(SGZZ_BLEND_PRIORITY[8], -1, "图外必须标成不参与");
});

test("★ 过渡片：贴边不透明、往格内化开，UV 不出本格", () => {
    for (const dir of [1, 2, 3, 4, 5, 6]) {
        const depth = sgzzBlendDepth(700, 713, dir);
        assert.ok(depth >= SGZZ_BLEND_DEPTH_MIN && depth <= SGZZ_BLEND_DEPTH_MAX,
            `depth ${depth} 超出区间`);
        const q = sgzzBlendQuad(700, 713, dir, depth);
        assert.ok(q, `resDir ${dir} 该出片`);
        // ⚠ 贴边两点 alpha=1：留一点透明就会在交界处露出硬线
        assert.deepEqual([...q!.alphas], [1, 1, 0, 0]);
        // 贴边两点必须在菱形边界上（深度 1.0），内沿两点在格内
        const c = sgzzGrid2Pos(700, 713);
        const depthOf = (p: readonly [number, number]) =>
            Math.abs(p[0] - c.x) / SGZZ_TILE_HALF_W + Math.abs(p[1] - c.y) / SGZZ_TILE_HALF_H;
        assert.ok(Math.abs(depthOf(q!.points[0] as [number, number]) - 1) < 1e-9, "第 1 点该贴边");
        assert.ok(Math.abs(depthOf(q!.points[1] as [number, number]) - 1) < 1e-9, "第 2 点该贴边");
        assert.ok(depthOf(q!.points[2] as [number, number]) < 0.7, "内沿该收进格里");
        // UV 全部落在本格的 0..1 内 —— ⛔ 出界会采到图集的出血带甚至隔壁格
        for (const [u, v] of q!.localUvs) {
            assert.ok(u >= -1e-9 && u <= 1 + 1e-9 && v >= -1e-9 && v <= 1 + 1e-9, `UV (${u},${v}) 出界`);
        }
    }
    assert.equal(sgzzBlendQuad(700, 713, 7, 0.5), null, "方向号越界回 null");
    // 深度是「位置+方向」的纯函数：⛔ 随机数会让平移时过渡带宽窄乱跳
    for (let i = 0; i < 30; i += 1) {
        assert.equal(sgzzBlendDepth(700 + i, 713, 3), sgzzBlendDepth(700 + i, 713, 3));
    }
    // 同一格不同方向要有差别，否则六条边一样宽，看着像套了个框
    const widths = new Set([1, 2, 3, 4, 5, 6].map((d) => Math.round(sgzzBlendDepth(700, 713, d) * 1000)));
    assert.ok(widths.size >= 3, "同格六向的过渡宽度太一致");
});

test("★ 摆件贴图：整张画布矩形 + 3px/世界单位的锚点换算，⛔ 不是压窄的梯形", () => {
    const c = sgzzGrid2Pos(700, 713);
    const baseY = sgzzDecorBaseY(700, 713);
    const scale = sgzzDecorScale(700, 713);
    for (const kind of SGZZ_DECOR_KINDS) {
        const q = sgzzDecorSpriteQuad(700, 713, kind.id);
        assert.ok(q, `${kind.name} 该出矩形`);
        const [lt, rt, rb, lb] = q!.points as readonly [number, number][];
        // ① 是矩形：上下两边等宽、左右两边等高
        assert.ok(Math.abs((rt[0] - lt[0]) - (rb[0] - lb[0])) < 1e-9, "上下边应等宽");
        assert.ok(Math.abs(lt[1] - rt[1]) < 1e-9 && Math.abs(lb[1] - rb[1]) < 1e-9, "两端应等高");
        // ② 尺寸由**画布**决定：宽 = 256/3×scale，高 = 256/3×scale ⇒ 与参考框无关
        const canvas = SGZZ_DECOR_CANVAS_PX / SGZZ_DECOR_PX_PER_UNIT * scale;
        assert.ok(Math.abs((rt[0] - lt[0]) - canvas) < 1e-6, `${kind.name} 宽应是画布宽`);
        assert.ok(Math.abs((lt[1] - lb[1]) - canvas) < 1e-6, `${kind.name} 高应是画布高`);
        // ③ 锚点：画布底在 baseY − 32/3×scale（224 以下那 32px）
        const below = (SGZZ_DECOR_CANVAS_PX - SGZZ_DECOR_ANCHOR_Y_PX) / SGZZ_DECOR_PX_PER_UNIT * scale;
        assert.ok(Math.abs(lb[1] - (baseY - below)) < 1e-6, `${kind.name} 底边锚点不对`);
        // ④ 横向以格心居中
        assert.ok(Math.abs((lt[0] + rt[0]) / 2 - c.x) < 1e-6, "应以格心居中");
        // ⑤ ⛔ 不是梯形：占位那套 topRatio 在这里必须无效
        assert.notEqual(rt[0] - lt[0], 0);
    }
    assert.equal(sgzzDecorSpriteQuad(700, 713, 99), null, "未知摆件号回 null");

    // UV 四角与点序一一对应，且落在各自的图集格内
    for (const kind of SGZZ_DECOR_KINDS) {
        const [u0, v0, uw, vh] = sgzzDecorAtlasUv(kind.id);
        assert.deepEqual(sgzzDecorSpriteUvs(kind.id).map((p) => [...p]),
            [[u0, v0], [u0 + uw, v0], [u0 + uw, v0 + vh], [u0, v0 + vh]]);
        assert.ok(u0 >= 0 && v0 >= 0 && u0 + uw <= 1 && v0 + vh <= 1, `${kind.name} UV 出界`);
    }
    // 七个格互不重叠
    const seen = new Set(SGZZ_DECOR_KINDS.map((k) => sgzzDecorAtlasUv(k.id).join(",")));
    assert.equal(seen.size, SGZZ_DECOR_KINDS.length, "图集格⛔不得重合");
});
