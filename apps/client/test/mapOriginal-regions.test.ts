import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MAPO_REGION_D_BIAS, MAPO_REGION_HEADER_BYTES, MAPO_REGION_RECORD_BYTES,
    mapoOriginalPxToWorld, mapoRegionPos,
} from "../src/shared/kits/mapOriginal/api/hexmap/index";
import { MAPO_REGION_CELLS } from "../src/shared/kits/mapOriginal/content/region.data";
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
        assert.equal(p.w, mapoOriginalPxToWorld(cell.native[0] * cell.scale[0]), `格 ${cell.id} 宽`);
        assert.equal(p.h, mapoOriginalPxToWorld(cell.native[1] * cell.scale[1]), `格 ${cell.id} 高`);
        assert.equal(p.angleDeg, cell.angle, `格 ${cell.id} 角度`);
    }
});

test("mapOriginal 区域件：精灵中心 = 锚点格位置 + prefab 的 offset（pivot 恒中心）", () => {
    // ⚠ 渲染按「底边中点」对齐，所以 y 要比中心低 h/2；漏了这一步件会整体上浮半个身位
    for (const cell of MAPO_REGION_CELLS) {
        mapoSetRegions(makeTable([{ row: 501, col: 300, cell: cell.id }]));
        const [p] = mapoRegionsInRect(WHOLE, 8);
        const anchor = mapoRegionPos(501 + 300, 501 - 300);
        assert.equal(p.x, anchor.x + mapoOriginalPxToWorld(cell.offset[0]), `格 ${cell.id} x`);
        assert.equal(p.y + p.h / 2, anchor.y + mapoOriginalPxToWorld(cell.offset[1]),
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
    const flat = buildMapoSpriteMesh([{ row: 0, col: 0, x: 0, y: 0, w: 100, h: 200, uv }]);
    // 无旋转：左上 / 右上 / 右下 / 左下
    assert.deepEqual(Array.from(flat.positions.slice(0, 12)),
        [-50, 200, 0, 50, 200, 0, 50, 0, 0, -50, 0, 0]);
    // 转 90°：绕中心 (0, 100)，左上角 (-50, 200) → (-100, 50)
    const spun = buildMapoSpriteMesh([{ row: 0, col: 0, x: 0, y: 0, w: 100, h: 200, uv, angleDeg: 90 }]);
    const p = Array.from(spun.positions.slice(0, 12)).map((n) => Math.round(n * 1e6) / 1e6);
    assert.deepEqual(p, [-100, 50, 0, -100, 150, 0, 100, 150, 0, 100, 50, 0]);
    // ⚠ 旋转 ⛔ 不许改顶点数 / 索引，否则合批会错位
    assert.equal(spun.positions.length, flat.positions.length);
    assert.deepEqual(Array.from(spun.indices16), Array.from(flat.indices16));
});
