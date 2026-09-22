import assert from "node:assert/strict";
import { test } from "node:test";
import {
    mapoMinimapCell, mapoMinimapToWorld, mapoMinimapViewport, mapoPlateBounds,
    mapoWorldToMinimap,
} from "../src/kits/mapOriginal/logic/mapoFar";
import { MAPO_MAP_COLS, MAPO_MAP_ROWS } from "../src/shared/kits/mapOriginal/api/hexmap/index";

test("mapOriginal 缩略图：内容占中间半幅，上下各 1/4 留白（与烘焙画布同契约）", () => {
    // ⚠ 这条把**图**与**点选换算**钉在一起：缩略图现在由地形按同一投影烘
    //   （minimap.info.json 的 contentTop = side/4），⛔ 改一边必须改另一边。
    const b = mapoPlateBounds();
    assert.equal(mapoWorldToMinimap(b.minX, b.maxY).y, 0.25, "世界上沿落在 v=0.25");
    assert.equal(mapoWorldToMinimap(b.minX, b.minY).y, 0.75, "世界下沿落在 v=0.75");
    assert.equal(mapoWorldToMinimap(b.minX, b.maxY).x, 0, "世界左沿落在 u=0");
    assert.equal(mapoWorldToMinimap(b.maxX, b.maxY).x, 1, "世界右沿落在 u=1");
});

test("mapOriginal 缩略图：world↔minimap 往返一致；留白区被夹回内容带", () => {
    const b = mapoPlateBounds();
    for (const [wx, wy] of [[b.minX, b.maxY], [b.maxX, b.minY],
                            [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]] as const) {
        const m = mapoWorldToMinimap(wx, wy);
        const back = mapoMinimapToWorld(m.x, m.y);
        assert.ok(Math.abs(back.x - wx) < 1e-6 && Math.abs(back.y - wy) < 1e-6, `往返 (${wx}, ${wy})`);
    }
    // ⚠ 上下留白：v<0.25 与 v>0.75 必须夹回内容带边界，⛔ 不能算出图外的世界点
    assert.equal(mapoMinimapToWorld(0.5, 0).y, mapoMinimapToWorld(0.5, 0.25).y);
    assert.equal(mapoMinimapToWorld(0.5, 1).y, mapoMinimapToWorld(0.5, 0.75).y);
});

test("mapOriginal 缩略图：点四角都落在图内的合法格", () => {
    for (const [u, v] of [[0, 0.25], [1, 0.25], [0, 0.75], [1, 0.75], [0.5, 0.5],
                          [0, 0], [1, 1]] as const) {
        const c = mapoMinimapCell(u, v);
        assert.ok(c.row >= 0 && c.row < MAPO_MAP_ROWS, `(${u}, ${v}) row ${c.row}`);
        assert.ok(c.col >= 0 && c.col < MAPO_MAP_COLS, `(${u}, ${v}) col ${c.col}`);
    }
});

test("mapOriginal 缩略图：视口框恒在 0..1 内且非零面积", () => {
    for (const scale of [0.05, 0.5, 2.0]) {
        const r = mapoMinimapViewport(0, -1000, 720, 1280, scale);
        assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001,
            `scale ${scale}: ${JSON.stringify(r)}`);
        assert.ok(r.w > 0 && r.h > 0);
    }
});
