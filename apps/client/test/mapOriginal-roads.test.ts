import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MAPO_ROAD_ATLAS_H, MAPO_ROAD_ATLAS_W, MAPO_ROAD_CELLS, MAPO_ROAD_D_BIAS,
    MAPO_ROAD_HALF_H, MAPO_ROAD_HALF_W, MAPO_ROAD_HEADER_BYTES, MAPO_ROAD_RECORD_BYTES,
    MAPO_ROAD_SIDE, MAPO_ROAD_S_BIAS,
} from "../src/shared/kits/mapOriginal/content/roads.data";
import {
    MAPO_TILE_HALF_H, MAPO_TILE_HALF_W, mapoGrid2Pos, mapoOriginalPxToWorld,
} from "../src/shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_ROAD_WORLD_HALF_H, MAPO_ROAD_WORLD_HALF_W,
    mapoHasRoads, mapoRoadCount, mapoRoadPos, mapoRoadsInRect, mapoSetRoads,
} from "../src/kits/mapOriginal/logic/mapoRoads";
import { buildMapoSpriteMesh } from "../src/kits/mapOriginal/logic/mapoMesh";

function makeTable(rows: readonly { row: number; col: number; cell: number; flip: number }[]): Uint8Array {
    const recs = rows.map((r) => ({
        s: r.row + r.col + MAPO_ROAD_S_BIAS, d: r.row - r.col + MAPO_ROAD_D_BIAS,
        cell: r.cell, flip: r.flip,
    })).sort((a, b) => (a.s - b.s) || (a.d - b.d));
    const u = new Uint8Array(MAPO_ROAD_HEADER_BYTES + recs.length * MAPO_ROAD_RECORD_BYTES);
    const v = new DataView(u.buffer);
    v.setUint32(0, recs.length);
    recs.forEach((r, i) => {
        const o = MAPO_ROAD_HEADER_BYTES + i * MAPO_ROAD_RECORD_BYTES;
        v.setUint16(o, r.s); v.setUint16(o + 2, r.d);
        v.setUint8(o + 4, r.cell); v.setUint8(o + 5, r.flip);
    });
    return u;
}

const WHOLE = { left: -1e9, right: 1e9, bottom: -1e9, top: 1e9 };

test("mapOriginal 道路：路格自成一套网格（半宽 200 / 半高 100 = 4/3 个逻辑格）", () => {
    // ★ 坐标系由干净集 road_info.lua 直给；⛔ 别用逻辑格的 150/75
    assert.equal(MAPO_ROAD_HALF_W, 200);
    assert.equal(MAPO_ROAD_HALF_H, 100);
    assert.equal(1500 * 150 / MAPO_ROAD_HALF_W, MAPO_ROAD_SIDE, "1500 逻辑格 ⇒ 1125 路格");
    // 世界半宽 = 原版半宽换算，且恰是逻辑格半宽的 4/3
    assert.ok(Math.abs(MAPO_ROAD_WORLD_HALF_W - mapoOriginalPxToWorld(200)) < 1e-9);
    assert.ok(Math.abs(MAPO_ROAD_WORLD_HALF_W - MAPO_TILE_HALF_W * 4 / 3) < 1e-6);
    assert.ok(Math.abs(MAPO_ROAD_WORLD_HALF_H - MAPO_TILE_HALF_H * 4 / 3) < 1e-6);
    // ★ 每张路片正好一个路格见方
    for (const c of MAPO_ROAD_CELLS) {
        assert.deepEqual([...c.native], [400, 200], `路片 ${c.id}（${c.cls}）`);
    }
});

test("mapOriginal 道路：摆位 = 等距式子换路格半宽/半高，**无奇偶行错位**", () => {
    for (const [row, col] of [[0, 0], [1, 0], [0, 1], [1, 1], [562, 563], [1124, 1124]] as const) {
        const p = mapoRoadPos(row, col);
        const hw = MAPO_ROAD_WORLD_HALF_W, hh = MAPO_ROAD_WORLD_HALF_H;
        const want = { x: (row - col) * hw, y: -(row + col + 1) * hh };
        assert.ok(Math.abs(p.x - want.x) < 1e-6 && Math.abs(p.y - want.y) < 1e-6, `(${row}, ${col})`);
        // ⛔ 路格 ≠ 逻辑格：同一对 (row,col) 两者必须给出不同坐标（原点除外）
        if (row + col > 0) {
            const g = mapoGrid2Pos(row, col);
            assert.ok(Math.abs(p.y - g.y) > 1e-6, `(${row}, ${col}) 路格不该与逻辑格同位`);
        }
    }
});

test("mapOriginal 道路：8 个邻居方向全部落在菱形相邻位（⛔ 无奇偶错位）", () => {
    // ★ 42,018 条 tiles 的邻居直方图（2026-09-23 实测）：(0,±1) / (±1,0) / (±1,±1) 全方向
    //   密集 ⇒ 路格 8 连通；带奇偶错位会把 (±1,0) 打成 (+0.5hw,−1.5hh)/(+1.5hw,−0.5hh)
    //   交替 ⇒ 行方向的路碎成虚线（实机症状）。⇒ 每个格的全部 8 邻居位移必须是
    //   {(±hw,±hh) 边邻} ∪ {(±2hw,0),(0,±2hh) 点邻}，且与奇偶无关。
    const hw = MAPO_ROAD_WORLD_HALF_W, hh = MAPO_ROAD_WORLD_HALF_H;
    const want: readonly (readonly [number, number])[] = [
        [hw, hh], [hw, -hh], [-hw, hh], [-hw, -hh],
        [2 * hw, 0], [-2 * hw, 0], [0, 2 * hh], [0, -2 * hh],
    ];
    for (const [row, col] of [[0, 0], [1, 0], [2, 1], [561, 562], [562, 563], [1123, 1124]] as const) {
        const p = mapoRoadPos(row, col);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1],
                                [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
            const q = mapoRoadPos(row + dr, col + dc);
            const dx = q.x - p.x, dy = q.y - p.y;
            const hit = want.some(([wx, wy]) => Math.abs(dx - wx) < 1e-6 && Math.abs(dy - wy) < 1e-6);
            assert.ok(hit, `(${row},${col}) → (${row + dr},${col + dc}) 位移 (${dx}, ${dy}) 不是菱形相邻位`);
        }
    }
});

test("mapOriginal 道路：长度对不上就拒收；画家序照表；矩形外不进批", () => {
    assert.throws(() => mapoSetRoads(new Uint8Array(3)), /太短/);
    assert.throws(() => mapoSetRoads(new Uint8Array(10)), /长度不符/);
    mapoSetRoads(makeTable([
        { row: 800, col: 800, cell: 0, flip: 0 },
        { row: 100, col: 100, cell: 1, flip: 0 },
        { row: 400, col: 400, cell: 2, flip: 0 },
    ]));
    assert.ok(mapoHasRoads());
    assert.equal(mapoRoadCount(), 3);
    const all = mapoRoadsInRect(WHOLE, 9);
    assert.deepEqual(all.map((p) => p.row - MAPO_ROAD_S_BIAS), [200, 800, 1600], "画家序");
    const c = mapoRoadPos(400, 400);
    const tight = { left: c.x - 1, right: c.x + 1, bottom: c.y - 1, top: c.y + 1 };
    const inside = mapoRoadsInRect(tight, 9);
    assert.equal(inside.length, 1, "只该命中本格那片");
    const mesh = buildMapoSpriteMesh(inside);
    assert.ok(Math.abs((mesh.positions[1] + mesh.positions[7]) / 2 - c.y) < 0.002,
        "路片中心仍应落在道路网格中心，不能遗留半高偏移");
});

test("mapOriginal 道路：水平翻转用 **UV 宽取负**（⛔ 不翻顶点）", () => {
    mapoSetRoads(makeTable([{ row: 200, col: 200, cell: 0, flip: 1 },
                            { row: 202, col: 202, cell: 0, flip: 0 }]));
    const [flipped, plain] = mapoRoadsInRect(WHOLE, 9);
    const cell = MAPO_ROAD_CELLS.find((x) => x.id === 0)!;
    const u0 = cell.rect[0] / MAPO_ROAD_ATLAS_W, uw = cell.rect[2] / MAPO_ROAD_ATLAS_W;
    assert.ok(Math.abs(plain.uv[0] - u0) < 1e-9 && Math.abs(plain.uv[2] - uw) < 1e-9, "未翻");
    assert.ok(Math.abs(flipped.uv[0] - (u0 + uw)) < 1e-9, "翻转后起点挪到右边");
    assert.ok(Math.abs(flipped.uv[2] + uw) < 1e-9, "翻转后 UV 宽取负");
    // 顶点尺寸不受翻转影响
    assert.equal(flipped.w, plain.w);
    assert.equal(flipped.h, plain.h);
    // v 方向不受影响
    assert.equal(flipped.uv[1], plain.uv[1]);
    assert.equal(flipped.uv[3], plain.uv[3]);
    assert.ok(cell.rect[1] / MAPO_ROAD_ATLAS_H === plain.uv[1]);
});
