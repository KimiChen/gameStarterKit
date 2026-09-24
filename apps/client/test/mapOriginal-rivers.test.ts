import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
    MAPO_RIVER_D_BIAS, MAPO_RIVER_GEO_COUNT, MAPO_RIVER_HEADER_BYTES, MAPO_RIVER_ORIGIN,
    MAPO_RIVER_RECORD_BYTES, MAPO_RIVER_S_BIAS, MAPO_RIVER_TILES,
} from "../src/shared/kits/mapOriginal/content/river.data";
import {
    mapoOriginalPxToWorld,
} from "../src/shared/kits/mapOriginal/api/hexmap/index";
import {
    mapoHasRivers, mapoRiverCount, mapoRiverPos, mapoRiversInRect, mapoSetRiverGeo, mapoSetRivers,
} from "../src/kits/mapOriginal/logic/mapoRivers";
import { buildMapoPolygonMesh, type MapoPolygonInput } from "../src/kits/mapOriginal/logic/mapoMesh";

/** 造一个几何库：n 条，每条一个三角形（顶点按 seed 变化）。 */
function makeGeo(n: number): Uint8Array {
    const per = 5 + 3 * 8 + 3 * 2;
    const u = new Uint8Array(2 + n * per);
    const v = new DataView(u.buffer);
    v.setUint16(0, n);
    let o = 2;
    for (let i = 0; i < n; i += 1) {
        v.setUint8(o, i % 3); v.setUint16(o + 1, 3); v.setUint16(o + 3, 3); o += 5;
        const pts = [[0, 0], [300 + i, 0], [0, 150 + i]];
        for (const [x, y] of pts) { v.setFloat32(o, x); v.setFloat32(o + 4, y); o += 8; }
        for (const idx of [0, 1, 2]) { v.setUint16(o, idx); o += 2; }
    }
    return u;
}

function makeTable(rows: readonly { row: number; col: number; geo: number }[]): Uint8Array {
    const recs = rows.map((r) => ({
        s: r.row + r.col + MAPO_RIVER_S_BIAS, d: r.row - r.col + MAPO_RIVER_D_BIAS, geo: r.geo,
    })).sort((a, b) => (a.s - b.s) || (a.d - b.d));
    const u = new Uint8Array(MAPO_RIVER_HEADER_BYTES + recs.length * MAPO_RIVER_RECORD_BYTES);
    const v = new DataView(u.buffer);
    v.setUint32(0, recs.length);
    recs.forEach((r, i) => {
        const o = MAPO_RIVER_HEADER_BYTES + i * MAPO_RIVER_RECORD_BYTES;
        v.setUint16(o, r.s); v.setUint16(o + 2, r.d); v.setUint8(o + 4, r.geo); v.setUint8(o + 5, 0);
    });
    return u;
}

const WHOLE = { left: -1e9, right: 1e9, bottom: -1e9, top: 1e9 };
const UV = () => [0.5, 0.5] as const;
const RGBA = [1, 1, 1, 1] as const;

/** ⚠ 几何缓冲是 Float32：与 double 直接比会因舍入而红，⛔ 别用 deepEqual 比浮点。 */
function near(actual: number, want: number, msg: string): void {
    assert.ok(Math.abs(actual - want) < 1e-4, `${msg}：实际 ${actual}，期望 ${want}`);
}

test("mapOriginal 河流：几何库条数/长度对不上就拒收（⛔ 不容忍半截几何库）", () => {
    assert.throws(() => mapoSetRiverGeo(makeGeo(3)), /河流 几何库 3 条/);
    const good = makeGeo(MAPO_RIVER_GEO_COUNT);
    mapoSetRiverGeo(good);
    const trailing = new Uint8Array(good.length + 1);
    trailing.set(good);
    assert.throws(() => mapoSetRiverGeo(trailing), /残留/);
    assert.throws(() => mapoSetRivers(new Uint8Array(3)), /太短/);
});

test("mapOriginal 河流：ninegrid2pos 独立向量，奇偶行均不套 grid2pos 错位", () => {
    // coord_util Proto ld459..465 + river_grid ld28..34，期望值为原版像素。
    for (const [row, col, x, y] of [[-6, -6, 0, 675], [-3, -6, 450, 450],
        [0, 0, 0, -225], [3, 621, -92700, -47025], [1494, 1494, 0, -224325]] as const) {
        const p = mapoRiverPos(row + col, row - col);
        assert.equal(p.x, mapoOriginalPxToWorld(x), `(${row}, ${col}) x`);
        assert.equal(p.y, mapoOriginalPxToWorld(y), `(${row}, ${col}) y`);
    }
});

test("mapOriginal 河流：全部 31140 条摆位与原版 504² 河格坐标函数一致", () => {
    const table = readFileSync(new URL("../../kits/mapOriginal/data/maps/s1/rivers.bin", import.meta.url));
    assert.equal(table.readUInt32BE(0), 31140);
    let oddRows = 0;
    for (let n = 0; n < table.readUInt32BE(0); n++) {
        const o = MAPO_RIVER_HEADER_BYTES + n * MAPO_RIVER_RECORD_BYTES;
        const s = table.readUInt16BE(o) - MAPO_RIVER_S_BIAS, d = table.readUInt16BE(o + 2) - MAPO_RIVER_D_BIAS;
        // 独立复原原版河格索引，然后执行原版九宫坐标式；不用复刻的逻辑格 grid2pos。
        const i = ((s + d) / 2 - MAPO_RIVER_ORIGIN) / MAPO_RIVER_TILES;
        const j = ((s - d) / 2 - MAPO_RIVER_ORIGIN) / MAPO_RIVER_TILES;
        assert.ok(Number.isInteger(i) && Number.isInteger(j));
        if (i % 2) oddRows++;
        const x = Math.floor(((i - 2) - (j - 2)) * 450);
        const y = Math.floor(-((j - 2) + (i - 2) + 1) * 225);
        const p = mapoRiverPos(s, d);
        // 转回整数原版像素比较，避免 32/150 的 double 换算尾差。
        assert.deepEqual({ x: p.x * 150 / 32, y: p.y * 150 / 32 }, { x, y });
    }
    assert.equal(oddRows, 15595, "旧逻辑格投影误偏移的河格数量");
});

test("mapOriginal 河流：顶点按原版 px → 世界单位换算，画家序照表", () => {
    mapoSetRiverGeo(makeGeo(MAPO_RIVER_GEO_COUNT));
    mapoSetRivers(makeTable([
        { row: 900, col: 900, geo: 1 },
        { row: MAPO_RIVER_ORIGIN, col: MAPO_RIVER_ORIGIN, geo: 2 },
        { row: 600, col: 600, geo: 3 },
    ]));
    assert.ok(mapoHasRivers());
    assert.equal(mapoRiverCount(), 3);
    const out = mapoRiversInRect(WHOLE, 8, UV, RGBA);
    assert.deepEqual(out.map((p) => p.s - MAPO_RIVER_S_BIAS), [-12, 1200, 1800], "画家序");
    // 第 1 条用 geo 2（三角形第二个顶点 x = 300 + 1）
    const first = out[0];
    near(first.verts[2], mapoOriginalPxToWorld(301), "顶点必须换算成世界单位");
    assert.equal(first.indices.length, 3);
});

test("mapOriginal 河流：可视矩形外的片不进批", () => {
    mapoSetRiverGeo(makeGeo(MAPO_RIVER_GEO_COUNT));
    mapoSetRivers(makeTable([{ row: 30, col: 30, geo: 1 }, { row: 1200, col: 1200, geo: 1 }]));
    const near = mapoRiverPos(60, 0);
    const tight = { left: near.x - 10, right: near.x + 10, bottom: near.y - 10, top: near.y + 10 };
    const out = mapoRiversInRect(tight, 8, UV, RGBA);
    assert.equal(out.length, 1, "只有本格那片该进批");
    assert.equal(out[0].s - MAPO_RIVER_S_BIAS, 60);
});

test("mapOriginal 网格：多边形合批按 s 排序、索引整体偏移、顶点上限截断", () => {
    const tri = (s: number, x: number): MapoPolygonInput => ({
        s, x, y: 0, geo: 1,
        verts: new Float32Array([0, 0, 10, 0, 0, 10]),
        indices: new Uint16Array([0, 1, 2]),
        uv: [0.25, 0.75], rgba: [0.1, 0.2, 0.3, 1],
    });
    const g = buildMapoPolygonMesh([tri(50, 100), tri(10, 0), tri(30, 50)]);
    // 画家序：s 升序 ⇒ x 依次 0 / 50 / 100
    assert.deepEqual([g.positions[0], g.positions[9], g.positions[18]], [0, 50, 100]);
    // ★ 第 2 片的索引必须整体 +3，⛔ 不能照抄局部下标
    assert.deepEqual(Array.from(g.indices16), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual([g.uvs[0], g.uvs[1]], [0.25, 0.75]);
    [0.1, 0.2, 0.3, 1].forEach((want, i) => near(g.colors[i], want, `顶点色 ${i}`));
    assert.deepEqual([...g.minPos], [0, 0, 0]);
    assert.deepEqual([...g.maxPos], [110, 10, 0]);
    assert.deepEqual([...buildMapoPolygonMesh([]).minPos], [0, 0, 0], "空批不能留 Infinity");
});
