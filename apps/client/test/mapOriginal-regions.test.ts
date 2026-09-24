import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MAPO_REGION_D_BIAS, MAPO_REGION_HEADER_BYTES, MAPO_REGION_RECORD_BYTES,
    mapoOriginalPxToWorld, mapoRegionPos,
} from "../src/shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_REGION_CELLS, MAPO_REGION_SNOW_CELLS,
} from "../src/shared/kits/mapOriginal/content/region.data";
import {
    MAPO_BAND_DESERT, MAPO_BAND_GROUND, MAPO_BAND_SNOW,
} from "../src/shared/kits/mapOriginal/content/bands.data";
import { mapoBandAt } from "../src/kits/mapOriginal/logic/mapoBands";
import { mapoRegionsInRect, mapoSetRegions } from "../src/kits/mapOriginal/logic/mapoRegions";
import { buildMapoSpriteMesh } from "../src/kits/mapOriginal/logic/mapoMesh";

/** 造一张只有 n 条的 regions.bin（大端，与打包期同布局）。 */
function makeTable(rows: readonly { row: number; col: number; cell: number }[]): Uint8Array {
    const recs = rows.map((r) => ({ ...r, s: r.row + r.col, d: r.row - r.col + MAPO_REGION_D_BIAS }))
        .sort((a, b) => (a.s - b.s) || (a.d - b.d));
    const u = new Uint8Array(MAPO_REGION_HEADER_BYTES + recs.length * MAPO_REGION_RECORD_BYTES);
    const v = new DataView(u.buffer);
    v.setUint32(0, recs.length);
    recs.forEach((r, i) => {
        const o = MAPO_REGION_HEADER_BYTES + i * MAPO_REGION_RECORD_BYTES;
        v.setUint16(o, r.s); v.setUint16(o + 2, r.d);
        v.setUint8(o + 4, r.cell); v.setUint8(o + 5, 1); v.setUint16(o + 6, 1);
    });
    return u;
}

const WHOLE = { left: -1e9, right: 1e9, bottom: -1e9, top: 1e9 };

test("mapOriginal 区域件：世界尺寸 = 原图像素 × prefab 的 scale（⛔ 不是只用 native）", () => {
    // ⚠ 这条是为 M0-B2 设的：m2 只有 563 px，只用 native 的话 19 格的形（4.06 格宽）
    //   会缩成 1.88 格 —— 比 7 格的形还小，14 形也会被压成 10 形。
    for (const cell of MAPO_REGION_CELLS) {
        mapoSetRegions(makeTable([{ row: 700, col: 700, cell: cell.id }]));
        const [p] = mapoRegionsInRect(WHOLE, 8);
        assert.ok(p, `格 ${cell.id} 没摆出来`);
        assert.equal(p.w, mapoOriginalPxToWorld(cell.size[0] * cell.scale[0]), `格 ${cell.id} 宽`);
        assert.equal(p.h, mapoOriginalPxToWorld(cell.size[1] * cell.scale[1]), `格 ${cell.id} 高`);
        assert.equal(p.angleDeg, cell.angle, `格 ${cell.id} 角度`);
    }
});

test("mapOriginal 区域件：精灵中心 = 锚点格位置 + prefab 的 offset（pivot 恒中心）", () => {
    // 位置直接是 prefab 锚点，调用方不再减半高。
    // ⚠ 坐标必须在**绿地**（N1 起雪带会换成雪山件格，offset 不同）：(838,1266) 实测是绿地。
    for (const cell of MAPO_REGION_CELLS) {
        mapoSetRegions(makeTable([{ row: 838, col: 1266, cell: cell.id }]));
        const [p] = mapoRegionsInRect(WHOLE, 8);
        const anchor = mapoRegionPos(838 + 1266, 838 - 1266);
        assert.equal(p.x, anchor.x + mapoOriginalPxToWorld(cell.offset[0]), `格 ${cell.id} x`);
        assert.equal(p.y, anchor.y + mapoOriginalPxToWorld(cell.offset[1]),
            `格 ${cell.id} 的精灵中心 y`);
    }
});

test("mapOriginal 区域件：表已是画家序，摆出来的次序照抄（⛔ 客户端不再排）", () => {
    const cellId = MAPO_REGION_CELLS[0].id;
    mapoSetRegions(makeTable([
        { row: 900, col: 900, cell: cellId },   // s = 1800，最靠下
        { row: 100, col: 100, cell: cellId },   // s = 200，最靠上
        { row: 500, col: 500, cell: cellId },
    ]));
    const out = mapoRegionsInRect(WHOLE, 8);
    assert.deepEqual(out.map((p) => p.piece.s), [200, 1000, 1800]);
});

test("mapOriginal 网格：angleDeg 绕**精灵中心**转，0 走轴对齐快路径", () => {
    const uv = [0, 0, 1, 1] as const;
    const sprite = { row: 0, col: 0, x: 0, y: 0, w: 100, h: 200, uv, pivot: [0.5, 0.5] as const };
    const flat = buildMapoSpriteMesh([sprite]);
    // 无旋转：左上 / 右上 / 右下 / 左下
    assert.deepEqual(Array.from(flat.positions.slice(0, 12)),
        [-50, 100, 0, 50, 100, 0, 50, -100, 0, -50, -100, 0]);
    // 转 90°：绕锚点 (0, 0)，左上角 (-50, 100) → (-100, -50)
    const spun = buildMapoSpriteMesh([{ ...sprite, angleDeg: 90 }]);
    const p = Array.from(spun.positions.slice(0, 12)).map((n) => Math.round(n * 1e6) / 1e6);
    assert.deepEqual(p, [-100, -50, 0, -100, 50, 0, 100, 50, 0, 100, -50, 0]);
    assert.deepEqual(spun.minPos, [-100, -50, 0]);
    assert.deepEqual(spun.maxPos, [100, 50, 0]);
    // ⚠ 旋转 ⛔ 不许改顶点数 / 索引，否则合批会错位
    assert.equal(spun.positions.length, flat.positions.length);
    assert.deepEqual(Array.from(spun.indices16), Array.from(flat.indices16));
});

// ── N1：山族件的季/地貌变体 ────────────────────────────────────────────────
// ⚠ 坐标钉自 s1 真实数据（bands.bytes）：(437,319) 雪带、(334,579) 沙带、(838,1266) 绿地。
const SNOW_59 = MAPO_REGION_SNOW_CELLS.find((c) => c.id === 59)!;
const BASE_49 = MAPO_REGION_CELLS.find((c) => c.id === 49)!;

test("mapOriginal 区域件（N1）：雪带锚点出**雪山件**（transform 逐形重读，⛔ 不抄基础季）", () => {
    assert.equal(mapoBandAt(437, 319), MAPO_BAND_SNOW, "(437,319) 应在雪带");
    mapoSetRegions(makeTable([{ row: 437, col: 319, cell: 59 }]));
    const [p] = mapoRegionsInRect(WHOLE, 8);
    assert.ok(p, "雪带锚点没摆出来");
    assert.equal(p.cellLayout, SNOW_59, "雪带里的山12 必须用雪山件格");
    // ★ 雪山 7m_03 的贴图是 mountain_snow/png/4.png（733×427，scale 1.0），
    //   与基础季（m5 697×345，scale 1.15871）**不是同一份 transform** —— 尺寸必须按雪山的算
    assert.equal(p.w, mapoOriginalPxToWorld(SNOW_59.size[0] * SNOW_59.scale[0]), "雪山宽");
    assert.equal(p.h, mapoOriginalPxToWorld(SNOW_59.size[1] * SNOW_59.scale[1]), "雪山高");
});

test("mapOriginal 区域件（N1）：沙带/绿地的锚点仍是**基础季**件", () => {
    // ★ 荒地山的 2D src_name 与基础季逐字相同（land 表实测 13/13）⇒ ⛔ 没有沙件表，
    //   沙带里的山件就该是基础季件；绿地同理。
    assert.equal(mapoBandAt(334, 579), MAPO_BAND_DESERT, "(334,579) 应在沙带");
    assert.equal(mapoBandAt(838, 1266), MAPO_BAND_GROUND, "(838,1266) 应是绿地");
    for (const [row, col] of [[334, 579], [838, 1266]] as const) {
        mapoSetRegions(makeTable([{ row, col, cell: 49 }]));
        const [p] = mapoRegionsInRect(WHOLE, 8);
        assert.ok(p, `(${row},${col}) 没摆出来`);
        assert.equal(p.cellLayout, BASE_49, `(${row},${col}) 必须用基础季件格`);
    }
});

test("mapOriginal 区域件（N1）：雪山表与基础季表同 id 空间、逐形互异", () => {
    // ★ 三套件齐全判据的山族半边：13 形每形都有雪件格，且与基础季格**不是同一个对象**。
    assert.equal(MAPO_REGION_SNOW_CELLS.length, MAPO_REGION_CELLS.length);
    for (const base of MAPO_REGION_CELLS) {
        const snow = MAPO_REGION_SNOW_CELLS.find((c) => c.id === base.id)!;
        assert.ok(snow, `形 ${base.id} 缺雪山格`);
        assert.ok(snow !== base, `形 ${base.id} 的雪/基础格不该是同一对象`);
        assert.equal(snow.variant, "snow");
        assert.equal(base.variant, "base");
        assert.notEqual(snow.textureId, base.textureId, `形 ${base.id} 的雪/基础格不该同坐标`);
    }
});
