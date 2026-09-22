import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MAPO_GROUND_BLOCK_TILES, MAPO_GROUND_GRID_SIDE, MAPO_GROUND_ORIGIN,
    MAPO_GROUND_REPEAT_U, MAPO_GROUND_REPEAT_V,
} from "../src/shared/kits/mapOriginal/content/ground.data";
import {
    MAPO_TILE_HALF_H, MAPO_TILE_HALF_W, mapoGrid2Pos,
} from "../src/shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_GROUND_HALF_H, MAPO_GROUND_HALF_W, MAPO_GROUND_UV,
    mapoGroundBlockPos, mapoGroundBlocksInRect, mapoGroundOriginCell,
} from "../src/kits/mapOriginal/logic/mapoGround";
import { buildMapoGroundMesh } from "../src/kits/mapOriginal/logic/mapoMesh";

test("mapOriginal 地表底：块 i 覆盖逻辑行 10·i−10 起的 10 行（152 = 150 + 2 margin）", () => {
    assert.equal(mapoGroundOriginCell(0), -MAPO_GROUND_BLOCK_TILES, "块 0 是 margin");
    assert.equal(mapoGroundOriginCell(1), 0, "块 1 从第 0 行起");
    assert.equal(mapoGroundOriginCell(150), 1490, "块 150 到 1499 收尾");
    assert.equal((MAPO_GROUND_GRID_SIDE - 2) * MAPO_GROUND_BLOCK_TILES, 1500, "150 块盖满 1500 行");
    assert.equal(MAPO_GROUND_ORIGIN, -MAPO_GROUND_BLOCK_TILES);
});

test("mapOriginal 地表底：块摆在几何中心（grid2pos(R,C) 再下移 (k−1)·halfH）", () => {
    for (const [i, j] of [[0, 0], [1, 1], [75, 90], [151, 151]] as const) {
        const p = mapoGroundBlockPos(i, j);
        const g = mapoGrid2Pos(mapoGroundOriginCell(i), mapoGroundOriginCell(j));
        assert.equal(p.x, g.x, `块 (${i}, ${j}) x`);
        assert.equal(p.y, g.y - (MAPO_GROUND_BLOCK_TILES - 1) * MAPO_TILE_HALF_H, `块 (${i}, ${j}) y`);
    }
    // 块的世界半宽/半高 = 10 格
    assert.equal(MAPO_GROUND_HALF_W, MAPO_GROUND_BLOCK_TILES * MAPO_TILE_HALF_W);
    assert.equal(MAPO_GROUND_HALF_H, MAPO_GROUND_BLOCK_TILES * MAPO_TILE_HALF_H);
});

test("mapOriginal 地表底：UV 是世界轴对齐的线性映射（⛔ 底纹不跟着菱形转）", () => {
    // ★ 与原版 GROUND_PIC_TBL 同式：W=(0, V/2) N=(U/2, 0) E=(U, V/2) S=(U/2, V)
    assert.deepEqual(MAPO_GROUND_UV.map((p) => [...p]), [
        [0, MAPO_GROUND_REPEAT_V / 2],
        [MAPO_GROUND_REPEAT_U / 2, 0],
        [MAPO_GROUND_REPEAT_U, MAPO_GROUND_REPEAT_V / 2],
        [MAPO_GROUND_REPEAT_U / 2, MAPO_GROUND_REPEAT_V],
    ]);
    // ★ 轴对齐的判据：u 只随 x 变、v 只随 y 变 ⇒ W/E 的 v 相等、N/S 的 u 相等
    const [W, N, E, S] = MAPO_GROUND_UV;
    assert.equal(W[1], E[1], "W 与 E 的 v 必须相等（u 只随 x 变）");
    assert.equal(N[0], S[0], "N 与 S 的 u 必须相等（v 只随 y 变）");
    // ★ 铺满整块是**整数次**：块边界落在整周期上，⛔ 不出现半个花纹的错茬
    assert.equal(MAPO_GROUND_REPEAT_U % 1, 0);
    assert.equal(MAPO_GROUND_REPEAT_V % 1, 0);
});

test("mapOriginal 地表底：可视矩形只取相交的块，且不漏不重", () => {
    const c = mapoGroundBlockPos(75, 75);
    const tight = { left: c.x - 1, right: c.x + 1, bottom: c.y - 1, top: c.y + 1 };
    const one = mapoGroundBlocksInRect(tight);
    assert.equal(one.length, 1, `一点应只命中一块，实际 ${one.length}`);
    assert.deepEqual([one[0].i, one[0].j], [75, 75]);

    const wide = {
        left: c.x - MAPO_GROUND_HALF_W * 2, right: c.x + MAPO_GROUND_HALF_W * 2,
        bottom: c.y - MAPO_GROUND_HALF_H * 2, top: c.y + MAPO_GROUND_HALF_H * 2,
    };
    const many = mapoGroundBlocksInRect(wide);
    assert.ok(many.length >= 5, `大矩形应命中多块，实际 ${many.length}`);
    const keys = new Set(many.map((b) => `${b.i},${b.j}`));
    assert.equal(keys.size, many.length, "⛔ 不许重复块");
    for (const b of many) {
        assert.ok(b.i >= 0 && b.j >= 0 && b.i < MAPO_GROUND_GRID_SIDE && b.j < MAPO_GROUND_GRID_SIDE);
    }
    // 画家序：i+j 升序
    for (let k = 1; k < many.length; k += 1) {
        assert.ok(many[k - 1].i + many[k - 1].j <= many[k].i + many[k].j, "画家序");
    }
});

test("mapOriginal 地表底：网格顶点走 N/E/S/W，UV 按 W/N/E/S 换序取", () => {
    const g = buildMapoGroundMesh([{
        key: 0, x: 0, y: 0, halfW: 320, halfH: 160, uv: MAPO_GROUND_UV,
    }]);
    assert.deepEqual(Array.from(g.positions.slice(0, 12)),
        [0, 160, 0, 320, 0, 0, 0, -160, 0, -320, 0, 0], "N/E/S/W");
    // 顶点 0 是 N ⇒ 取 UV 表的第 1 项（N）
    assert.deepEqual([g.uvs[0], g.uvs[1]], [...MAPO_GROUND_UV[1]]);
    // 顶点 3 是 W ⇒ 取第 0 项
    assert.deepEqual([g.uvs[6], g.uvs[7]], [...MAPO_GROUND_UV[0]]);
    // ★ UV 必须**大于 1**（靠 GL_REPEAT 平铺），⛔ 不是归一化到 0..1 的图集坐标
    assert.ok(Math.max(...Array.from(g.uvs)) > 1, "UV 没超过 1 ⇒ 不会平铺");
    assert.deepEqual(Array.from(g.indices16), [0, 1, 2, 0, 2, 3]);
    assert.deepEqual(Array.from(g.colors.slice(0, 4)), [1, 1, 1, 1], "顶点色恒白");
});
