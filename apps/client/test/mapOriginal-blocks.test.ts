import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MAPO_BLOCK_D_BIAS, MAPO_BLOCK_HEADER_BYTES, MAPO_BLOCK_LAYERS,
    MAPO_BLOCK_RECORD_BYTES, MAPO_BLOCK_S_BIAS,
} from "../src/shared/kits/mapOriginal/content/blocks.data";
import {
    MAPO_GROUND_BLOCK_TILES, MAPO_GROUND_ORIGIN,
} from "../src/shared/kits/mapOriginal/content/ground.data";
import {
    MAPO_GROUND_HALF_H, MAPO_GROUND_HALF_W, MAPO_GROUND_UV, mapoGroundBlockPos,
} from "../src/kits/mapOriginal/logic/mapoGround";
import {
    MAPO_BLOCK_KINDS, mapoBlockCount, mapoBlocksInRect, mapoHasBlocks,
    mapoSetBlockGeo, mapoSetBlocks,
} from "../src/kits/mapOriginal/logic/mapoBlocks";

const KIND = MAPO_BLOCK_KINDS[0];
const META = MAPO_BLOCK_LAYERS[0];

/** 造一个几何库：每条一个「整块菱形」（W/N/E/S），顶点用原版 px。 */
function makeGeo(n: number): Uint8Array {
    const per = 5 + 4 * 8 + 6 * 2;
    const u = new Uint8Array(2 + n * per);
    const v = new DataView(u.buffer);
    v.setUint16(0, n);
    let o = 2;
    // 一块 = 3000×1500 原版 px ⇒ 半宽 1500、半高 750
    const pts = [[-1500, 0], [0, 750], [1500, 0], [0, -750]];
    for (let i = 0; i < n; i += 1) {
        v.setUint8(o, 0); v.setUint16(o + 1, 4); v.setUint16(o + 3, 6); o += 5;
        for (const [x, y] of pts) { v.setFloat32(o, x); v.setFloat32(o + 4, y); o += 8; }
        for (const idx of [0, 1, 2, 0, 2, 3]) { v.setUint16(o, idx); o += 2; }
    }
    return u;
}

function makeTable(rows: readonly { i: number; j: number; geo: number }[]): Uint8Array {
    const recs = rows.map((r) => {
        const row = MAPO_GROUND_BLOCK_TILES * r.i + MAPO_GROUND_ORIGIN;
        const col = MAPO_GROUND_BLOCK_TILES * r.j + MAPO_GROUND_ORIGIN;
        return { s: row + col + MAPO_BLOCK_S_BIAS, d: row - col + MAPO_BLOCK_D_BIAS, geo: r.geo };
    }).sort((a, b) => (a.s - b.s) || (a.d - b.d));
    const u = new Uint8Array(MAPO_BLOCK_HEADER_BYTES + recs.length * MAPO_BLOCK_RECORD_BYTES);
    const v = new DataView(u.buffer);
    v.setUint32(0, recs.length);
    recs.forEach((r, i) => {
        const o = MAPO_BLOCK_HEADER_BYTES + i * MAPO_BLOCK_RECORD_BYTES;
        v.setUint16(o, r.s); v.setUint16(o + 2, r.d); v.setUint8(o + 4, r.geo); v.setUint8(o + 5, 0);
    });
    return u;
}

const WHOLE = { left: -1e9, right: 1e9, bottom: -1e9, top: 1e9 };

test("mapOriginal 块层：两层都在，次序 ground(100) < desert(200) < snow(300)", () => {
    assert.deepEqual([...MAPO_BLOCK_KINDS], ["desert", "snow"]);
    assert.deepEqual(MAPO_BLOCK_LAYERS.map((l) => l.order), [200, 300]);
    // ⚠ 次序即绘制序：desert 在 snow 之下，⛔ 别按字母序排
    for (let i = 1; i < MAPO_BLOCK_LAYERS.length; i += 1) {
        assert.ok(MAPO_BLOCK_LAYERS[i - 1].order < MAPO_BLOCK_LAYERS[i].order);
    }
});

test("mapOriginal 块层：几何库条数对不上就拒收", () => {
    assert.throws(() => mapoSetBlockGeo(KIND, makeGeo(3)), /几何库 3 条/);
    assert.throws(() => mapoSetBlockGeo("nope", makeGeo(1)), /没有 nope/);
    assert.throws(() => mapoSetBlocks(KIND, new Uint8Array(3)), /表太短/);
});

test("mapOriginal 块层：UV 与地表底**同一套块级世界投影**（⛔ 不是按多边形包围盒）", () => {
    // ⚠ 这条是本批最关键的一致性：块层的花纹必须与地表底同周期同相位，否则块边界会错茬。
    mapoSetBlockGeo(KIND, makeGeo(META.geoCount));
    mapoSetBlocks(KIND, makeTable([{ i: 40, j: 40, geo: 1 }]));
    assert.ok(mapoHasBlocks(KIND));
    assert.equal(mapoBlockCount(KIND), 1);
    const [p] = mapoBlocksInRect(KIND, WHOLE, 4);
    assert.ok(p.uvs, "块层必须走逐顶点 UV");
    // 几何顶点序是 W/N/E/S（makeGeo 里就是这么摆的）⇒ UV 应与 MAPO_GROUND_UV 逐项相等
    const want = MAPO_GROUND_UV;
    for (let k = 0; k < 4; k += 1) {
        assert.ok(Math.abs(p.uvs![k * 2] - want[k][0]) < 1e-4, `第 ${k} 点 u`);
        assert.ok(Math.abs(p.uvs![k * 2 + 1] - want[k][1]) < 1e-4, `第 ${k} 点 v`);
    }
    // ★ UV 必须超过 1（靠 GL_REPEAT 平铺）
    assert.ok(Math.max(...Array.from(p.uvs!)) > 1);
});

test("mapOriginal 块层：摆位与地表底的块中心重合，矩形外不进批", () => {
    mapoSetBlockGeo(KIND, makeGeo(META.geoCount));
    mapoSetBlocks(KIND, makeTable([{ i: 40, j: 40, geo: 1 }, { i: 120, j: 30, geo: 2 }]));
    const c = mapoGroundBlockPos(40, 40);
    const all = mapoBlocksInRect(KIND, WHOLE, 8);
    assert.equal(all.length, 2);
    const first = all.find((p) => Math.abs(p.x - c.x) < 1e-6 && Math.abs(p.y - c.y) < 1e-6);
    assert.ok(first, "块层的摆位必须与 mapoGroundBlockPos 重合");
    const tight = {
        left: c.x - MAPO_GROUND_HALF_W, right: c.x + MAPO_GROUND_HALF_W,
        bottom: c.y - MAPO_GROUND_HALF_H, top: c.y + MAPO_GROUND_HALF_H,
    };
    assert.equal(mapoBlocksInRect(KIND, tight, 8).length, 1, "远处那块不该进批");
    assert.equal(mapoBlocksInRect(KIND, WHOLE, 1).length, 1, "limit 必须生效");
});
