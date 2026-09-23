import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MAPO_TOP_ATLASES, MAPO_TOP_DOWNSCALE, MAPO_TOP_RECORD_BYTES,
} from "../src/shared/kits/mapOriginal/content/tops.data";
import { mapoOriginalPxToWorld } from "../src/shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_TOP_KINDS, mapoHasTops, mapoSetTops, mapoTopUv, mapoTopsFor,
} from "../src/kits/mapOriginal/logic/mapoTops";
import type { MapoPolygonInput } from "../src/kits/mapOriginal/logic/mapoMesh";

const ATLAS = MAPO_TOP_ATLASES[0];      // river
const KIND = ATLAS.kind;

/** 造一份摆放库：第 1 组两件、第 2 组一件，其余组空。 */
function makeTops(spec: readonly (readonly (readonly [number, number, number, number, number, number, number])[])[]): Uint8Array {
    const total = spec.reduce((n, g) => n + g.length, 0);
    const u = new Uint8Array(2 + spec.length * 2 + total * MAPO_TOP_RECORD_BYTES);
    const v = new DataView(u.buffer);
    v.setUint16(0, spec.length);
    spec.forEach((g, i) => v.setUint16(2 + i * 2, g.length));
    let o = 2 + spec.length * 2;
    for (const g of spec) {
        for (const [cell, x, y, sx, sy, ang, lowZ] of g) {
            v.setUint16(o, cell);
            v.setFloat32(o + 2, x); v.setFloat32(o + 6, y);
            v.setFloat32(o + 10, sx); v.setFloat32(o + 14, sy);
            v.setFloat32(o + 18, ang);
            v.setFloat32(o + 22, 123); v.setFloat32(o + 26, 89);
            v.setFloat32(o + 30, 0.5); v.setFloat32(o + 34, 0.5);
            for (let i = 48; i < 52; i++) v.setUint8(o + i, 255);
            v.setFloat32(o + 56, lowZ);
            o += MAPO_TOP_RECORD_BYTES;
        }
    }
    return u;
}

function emptySpec(): (readonly [number, number, number, number, number, number, number])[][] {
    return Array.from({ length: ATLAS.groups }, () => []);
}

test("mapOriginal 手摆件：三族齐备，组数与件数是实测值", () => {
    assert.deepEqual([...MAPO_TOP_KINDS], ["river", "desert", "snow"]);
    assert.deepEqual(MAPO_TOP_ATLASES.map((a) => a.sprites), [597, 481, 821]);
    assert.deepEqual(MAPO_TOP_ATLASES.map((a) => a.groups), [102, 51, 52]);
    // ★ 图集是**缩过的**、native 是原版像素 —— 世界尺寸只能按 native 算
    for (const a of MAPO_TOP_ATLASES) {
        for (const c of a.cells) {
            assert.equal(c.rect[2], Math.max(1, Math.round(c.native[0] * MAPO_TOP_DOWNSCALE)));
            assert.equal(c.rect[3], Math.max(1, Math.round(c.native[1] * MAPO_TOP_DOWNSCALE)));
        }
    }
});

test("mapOriginal 手摆件：组数/件数/长度任一对不上就拒收", () => {
    assert.throws(() => mapoSetTops(KIND, makeTops([[]])), /手摆件 1 组/);
    assert.throws(() => mapoSetTops("nope", makeTops(emptySpec())), /没有 nope/);
    const spec = emptySpec();
    spec[0] = [[0, 0, 0, 1, 1, 0, 0]];
    assert.throws(() => mapoSetTops(KIND, makeTops(spec)), /手摆件 1 个/);
});

test("mapOriginal 手摆件：尺寸走 prefab.size × scale、锚点位置 = 多边形原点 + pos", () => {
    // 尺寸不能用图集里的缩略像素；位置直接传 prefab 中心，不再转换成底边。
    const spec = emptySpec();
    const rest = ATLAS.sprites - 2;
    spec[0] = [[ATLAS.cells[0].id, 40, 90, 2, 3, 12, 0],
               [ATLAS.cells[1].id, -10, 5, 1, 1, 0, 1]];
    spec[1] = Array.from({ length: rest }, () => [ATLAS.cells[0].id, 0, 0, 1, 1, 0, 0] as const);
    mapoSetTops(KIND, makeTops(spec));
    assert.ok(mapoHasTops(KIND));
    const poly = { s: 7, x: 1000, y: -2000, geo: 1, verts: new Float32Array(),
                   indices: new Uint16Array(), uv: [0, 0], rgba: [1, 1, 1, 1] } as MapoPolygonInput;
    const out = mapoTopsFor(KIND, [poly], 99);
    assert.equal(out.length, 2, "第 1 组两件");
    const w = mapoOriginalPxToWorld(123 * 2), h = mapoOriginalPxToWorld(89 * 3);
    assert.ok(Math.abs(out[0].w - w) < 1e-6, "宽 = size × scaleX");
    assert.ok(Math.abs(out[0].h - h) < 1e-6, "高 = size × scaleY");
    assert.ok(Math.abs(out[0].x - (1000 + mapoOriginalPxToWorld(40))) < 1e-6, "x = 原点 + pos.x");
    assert.ok(Math.abs(out[0].y - (-2000 + mapoOriginalPxToWorld(90))) < 1e-6,
        "y = 原点 + pos.y");
    assert.deepEqual(out[0].pivot, [0.5, 0.5]);
    assert.equal(out[0].angleDeg, 12);
    // 空组不出件
    assert.equal(mapoTopsFor(KIND, [{ ...poly, geo: 3 }], 99).length, 0);
    // limit 生效
    assert.equal(mapoTopsFor(KIND, [poly], 1).length, 1);
});

test("mapOriginal 手摆件：UV 用**图集**尺寸归一化（⛔ 不是 native）", () => {
    const c = ATLAS.cells[0];
    const uv = mapoTopUv(KIND, c);
    assert.ok(Math.abs(uv[0] - c.rect[0] / ATLAS.size[0]) < 1e-9);
    assert.ok(Math.abs(uv[2] - c.rect[2] / ATLAS.size[0]) < 1e-9);
    assert.ok(Math.abs(uv[3] - c.rect[3] / ATLAS.size[1]) < 1e-9);
    assert.ok(uv[0] + uv[2] <= 1 && uv[1] + uv[3] <= 1, "UV 必须在 0..1 内");
});
