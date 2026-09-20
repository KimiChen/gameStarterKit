import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_MINIMAP_ASSET, sgzzMinimapCell, sgzzMinimapMark, sgzzMinimapToWorld, sgzzMinimapViewport,
    sgzzPlateAsset, sgzzPlateBounds, sgzzPlateLodOf, sgzzWorldToMinimap,
} from "../src/kits/sgzzmap/logic/sgzzFar";
import {
    sgzzBirdviewColor, sgzzBirdviewCorners, sgzzBirdviewQuads,
} from "../src/kits/sgzzmap/logic/sgzzBirdview";
import { SgzzMarchLineTracker, sgzzMarchVisual } from "../src/kits/sgzzmap/logic/sgzzMarchLines";
import { buildSgzzPolyMesh, writeSgzzSegmentQuad } from "../src/kits/sgzzmap/logic/sgzzMesh";
import {
    SGZZ_LOD_MAX, SGZZ_MAP_COLS, SGZZ_MAP_ROWS, sgzzCellOf, sgzzGrid2Pos, sgzzInBounds, sgzzNextPos,
    sgzzWorldBounds,
} from "../src/shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_MAX_ZOOM_LEVEL, sgzzZoomChunkKey, sgzzZoomChunkTiles,
} from "../src/shared/kits/sgzzmap/api/chunk/index";
import {
    SGZZ_MARCH_MS_PER_TILE, sgzzMarchDurationMs, type ISgzzMarch,
} from "../src/shared/kits/sgzzmap/api/march/index";

test("sgzzmap far: 底图世界矩形由 sgzzWorldBounds 算出，与管线烘图口径一致", () => {
    const b = sgzzPlateBounds();
    assert.deepEqual(b, sgzzWorldBounds());
    // 管线 bake-plate.py 实际写进 plate-lod5.info.json 的数字，钉死在这里
    assert.equal(b.minX, -48000);
    assert.equal(b.minY, -48008);
    assert.equal(b.maxX, 47984);
    assert.equal(b.maxY, 0);
    // 只烘了 lod4/lod5 两张
    assert.equal(sgzzPlateLodOf(3), 4);
    assert.equal(sgzzPlateLodOf(4), 4);
    assert.equal(sgzzPlateLodOf(SGZZ_LOD_MAX), 5);
    assert.match(sgzzPlateAsset(3), /plate-lod4$/u);
    assert.match(sgzzPlateAsset(5), /plate-lod5$/u);
    assert.match(SGZZ_MINIMAP_ASSET, /minimap$/u);
});

test("sgzzmap far: 缩略图坐标往返自洽，留白区被夹回内容带", () => {
    const b = sgzzPlateBounds();
    for (const [wx, wy] of [[b.minX, b.maxY], [b.maxX, b.minY], [0, -24000], [-10000, -5000]]) {
        const m = sgzzWorldToMinimap(wx, wy);
        assert.ok(m.x >= -1e-9 && m.x <= 1 + 1e-9, `u 出界 ${m.x}`);
        assert.ok(m.y >= 0.25 - 1e-9 && m.y <= 0.75 + 1e-9, "内容带在中间一半");
        const back = sgzzMinimapToWorld(m.x, m.y);
        assert.ok(Math.abs(back.x - wx) < 1e-6 && Math.abs(back.y - wy) < 1e-6, "往返失败");
    }
    // 上下留白里点一下，要夹回内容带边缘，⛔ 不能算出图外的世界点
    for (const v of [0, 0.1, 0.9, 1]) {
        const w = sgzzMinimapToWorld(0.5, v);
        assert.ok(w.y <= b.maxY + 1e-6 && w.y >= b.minY - 1e-6, `留白区 v=${v} 算出了图外的 y=${w.y}`);
    }
    // 点选落到合法格
    for (const [u, v] of [[0, 0], [1, 1], [0.5, 0.5], [0.02, 0.98]]) {
        const c = sgzzMinimapCell(u, v);
        assert.ok(sgzzInBounds(c.row, c.col), `(${u},${v}) → 出界格 ${c.row},${c.col}`);
    }
    // 某格的标记位置与它的世界坐标一致
    const mark = sgzzMinimapMark(750, 750);
    const p = sgzzGrid2Pos(750, 750);
    assert.deepEqual(mark, sgzzWorldToMinimap(p.x, p.y));
});

test("sgzzmap far: 视口框随缩放变大变小，且永远钳在 0..1", () => {
    const wide = sgzzMinimapViewport(0, -24000, 750, 1204, 0.05);
    const tight = sgzzMinimapViewport(0, -24000, 750, 1204, 2);
    assert.ok(wide.w > tight.w && wide.h > tight.h, "缩得越远框越大");
    for (const r of [wide, tight, sgzzMinimapViewport(-48000, 0, 750, 1204, 0.05)]) {
        assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001,
            `框出界：${JSON.stringify(r)}`);
        assert.ok(r.w > 0 && r.h > 0, "框不能是零面积");
    }
});

test("sgzzmap birdview: 分块是平行四边形，四角来自四个角格且外扩半格", () => {
    const level = 1;
    const size = sgzzZoomChunkTiles(level);
    const key = sgzzZoomChunkKey(level, 400, 400);
    const corners = sgzzBirdviewCorners(level, key, SGZZ_MAP_ROWS, SGZZ_MAP_COLS);
    assert.equal(corners.length, 4);
    // ⚠ 不是轴对齐矩形：四角的 x 与 y 都各不相同
    const xs = new Set(corners.map((c) => c[0].toFixed(3)));
    const ys = new Set(corners.map((c) => c[1].toFixed(3)));
    assert.ok(xs.size >= 3 && ys.size >= 3, "等距下分块必须是平行四边形，⛔ 不是 AABB");
    // 面积约等于 size² 格
    const area = Math.abs(
        (corners[0][0] * corners[1][1] - corners[1][0] * corners[0][1])
        + (corners[1][0] * corners[2][1] - corners[2][0] * corners[1][1])
        + (corners[2][0] * corners[3][1] - corners[3][0] * corners[2][1])
        + (corners[3][0] * corners[0][1] - corners[0][0] * corners[3][1])) / 2;
    const tileArea = 2 * 32 * 16;
    assert.ok(area > tileArea * size * size * 0.8 && area < tileArea * size * size * 1.3,
        `分块面积 ${area} 与 ${size}² 格对不上`);
    // 边角的块会被地图边界截短，但仍是四个点
    const edge = sgzzBirdviewCorners(level, sgzzZoomChunkKey(level, 1499, 1499), SGZZ_MAP_ROWS, SGZZ_MAP_COLS);
    assert.equal(edge.length, 4);
});

test("sgzzmap birdview: 按关系取色，占比越高越实，⛔ 不给同盟分色相", () => {
    const level = 0;
    const size = sgzzZoomChunkTiles(level);
    const full = { key: 1, tiles: size * size, alliance: 0, top: size * size };
    const thin = { key: 2, tiles: 4, alliance: 0, top: 1 };
    const mine = sgzzBirdviewColor(full, ["a1"], "u", "a1", level);
    const foe = sgzzBirdviewColor(full, ["a2"], "u", "a1", level);
    const none = sgzzBirdviewColor({ ...full, alliance: -1 }, [], "u", "a1", level);
    assert.notDeepEqual(mine.slice(0, 3), foe.slice(0, 3), "我盟与敌盟必须不同色");
    assert.notDeepEqual(none.slice(0, 3), mine.slice(0, 3), "无主与我盟必须不同色");
    // 同一关系下，两个不同盟 id 必须同色（⛔ 不按 id 分色相）
    const foe2 = sgzzBirdviewColor(full, ["a9"], "u", "a1", level);
    assert.deepEqual(foe.slice(0, 3), foe2.slice(0, 3));
    // 浓淡
    assert.ok(sgzzBirdviewColor(full, ["a1"], "u", "a1", level)[3]
        > sgzzBirdviewColor(thin, ["a1"], "u", "a1", level)[3], "占比高的更实");
    assert.ok(sgzzBirdviewColor(thin, ["a1"], "u", "a1", level)[3] >= 0.25, "⛔ 不得淡到看不见");
    // 无盟观察者：我盟色不该出现
    const loner = sgzzBirdviewColor(full, ["a1"], "u", "", level);
    assert.deepEqual(loner.slice(0, 3), foe.slice(0, 3), "无盟时别人的地一律是敌色");
});

test("sgzzmap birdview: quads 排序稳定且逐块一一对应", () => {
    const level = SGZZ_MAX_ZOOM_LEVEL;
    const summaries = [
        { key: sgzzZoomChunkKey(level, 600, 600), tiles: 10, alliance: 0, top: 10 },
        { key: sgzzZoomChunkKey(level, 200, 200), tiles: 5, alliance: -1, top: 5 },
    ];
    const quads = sgzzBirdviewQuads(summaries, ["a1"], "u", "a1", level, SGZZ_MAP_ROWS, SGZZ_MAP_COLS);
    assert.equal(quads.length, 2);
    for (const q of quads) assert.equal(q.points.length, 4);
    const again = sgzzBirdviewQuads(summaries, ["a1"], "u", "a1", level, SGZZ_MAP_ROWS, SGZZ_MAP_COLS);
    assert.deepEqual(quads.map((q) => q.points[0]), again.map((q) => q.points[0]), "排序必须稳定");
});

// ── 行军线 ───────────────────────────────────────────────────────────────────
function ray(row: number, col: number, dir: number, n: number): number {
    let cur = { row, col };
    for (let i = 0; i < n; i += 1) cur = sgzzNextPos(cur.row, cur.col, dir);
    return sgzzCellOf(cur.row, cur.col);
}
function march(steps: number, over: Partial<ISgzzMarch> = {}): ISgzzMarch {
    const path = [sgzzCellOf(700, 700), ray(700, 700, 3, steps)];
    return {
        marchId: "m1", uid: "u1", path,
        departAt: 1_000_000, arriveAt: 1_000_000 + sgzzMarchDurationMs(path),
        status: "marching", ...over,
    };
}

test("sgzzmap march line: 简线端点就是起终点，细线逐格且段数 = 步数", () => {
    const m = march(4);
    const v = sgzzMarchVisual(m, m.departAt, true);
    const a = sgzzGrid2Pos(700, 700);
    assert.equal(v.simple.x0, a.x);
    assert.equal(v.simple.y0, a.y);
    assert.equal(v.detail.length, 4, "4 步 ⇒ 4 段");
    // 段段首尾相接
    for (let i = 1; i < v.detail.length; i += 1) {
        assert.equal(v.detail[i].x0, v.detail[i - 1].x1);
        assert.equal(v.detail[i].y0, v.detail[i - 1].y1);
    }
    assert.equal(v.detail[0].x0, a.x, "细线从起点开始");
    assert.equal(v.detail[3].x1, v.simple.x1, "细线终点 = 简线终点");
    // 不要细线时不展开
    assert.equal(sgzzMarchVisual(m, m.departAt, false).detail.length, 0);
});

test("sgzzmap march line: 部队位置随时间插值，端点精确、进度钳在 0..1", () => {
    const m = march(4);
    const start = sgzzMarchVisual(m, m.departAt, false);
    const a = sgzzGrid2Pos(700, 700);
    assert.ok(Math.abs(start.head.x - a.x) < 1e-9 && Math.abs(start.head.y - a.y) < 1e-9);
    assert.equal(start.progress, 0);

    const mid = sgzzMarchVisual(m, m.departAt + 2 * SGZZ_MARCH_MS_PER_TILE, false);
    assert.ok(mid.head.x !== start.head.x || mid.head.y !== start.head.y, "中途必须动了");
    assert.ok(Math.abs(mid.progress - 0.5) < 1e-9);

    const end = sgzzMarchVisual(m, m.arriveAt, false);
    assert.ok(Math.abs(end.head.x - end.simple.x1) < 1e-9, "到点必须精确落在终点");
    assert.equal(end.progress, 1);

    // ⚠ 时钟回跳 / 拖到未来都不得让进度或位置跑飞
    for (const now of [0, m.departAt - 1e9, m.arriveAt + 1e9]) {
        const v = sgzzMarchVisual(m, now, false);
        assert.ok(v.progress >= 0 && v.progress <= 1, `进度出界 ${v.progress}`);
        assert.ok(Number.isFinite(v.head.x) && Number.isFinite(v.head.y));
    }
});

test("sgzzmap march line: 展开结果按 marchId 缓存，⛔ 路径不变不重算", () => {
    const tracker = new SgzzMarchLineTracker();
    const m = march(6);
    tracker.sync([m], true, m.departAt);
    assert.equal(tracker.expansions, 1);
    assert.equal(tracker.size, 1);

    // 同一批再同步 + 推游标若干次：⛔ 不得再展开
    for (let i = 0; i < 10; i += 1) {
        tracker.sync([m], true, m.departAt + i * 100);
        tracker.step([m], m.departAt + i * 100);
    }
    assert.equal(tracker.expansions, 1, "路径没变就⛔不该再展开");
    // 但位置要跟着时间走
    const before = tracker.visuals()[0].head.x;
    tracker.step([m], m.arriveAt);
    assert.notEqual(tracker.visuals()[0].head.x, before, "推进后位置要更新");
});

test("sgzzmap march line: 换批会丢掉旧线，换档会整体重建", () => {
    const tracker = new SgzzMarchLineTracker();
    const a = march(3);
    const b = march(3, { marchId: "m2" });
    tracker.sync([a, b], true, a.departAt);
    assert.equal(tracker.size, 2);
    assert.deepEqual(tracker.visuals().map((v) => v.marchId), ["m1", "m2"], "按 marchId 稳定排序");

    tracker.sync([b], true, a.departAt);
    assert.equal(tracker.size, 1, "撤回/到达的线必须丢掉");
    assert.equal(tracker.visuals()[0].marchId, "m2");

    // 近档 → 远档：细线要没
    tracker.sync([b], false, a.departAt);
    assert.equal(tracker.visuals()[0].detail.length, 0, "远档⛔不画细线");
    tracker.sync([b], true, a.departAt);
    assert.ok(tracker.visuals()[0].detail.length > 0, "回到近档要恢复细线");

    tracker.clear();
    assert.equal(tracker.size, 0);
    assert.equal(tracker.step([], a.departAt), null, "空列表推游标不炸");
});

test("sgzzmap mesh: 线段四边形与多边形 mesh", () => {
    const quad = writeSgzzSegmentQuad(0, 0, 10, 0, 2);
    assert.ok(quad !== null);
    assert.equal(quad!.length, 4);
    // 水平线 ⇒ 法线竖直，四角在 y = ±2
    assert.deepEqual(quad!.map((p) => p[1]).sort(), [-2, -2, 2, 2]);
    // ⚠ 零长度线段必须返回 null，⛔ 否则法线是 NaN、整张 mesh 报废
    assert.equal(writeSgzzSegmentQuad(5, 5, 5, 5, 2), null);
    assert.equal(writeSgzzSegmentQuad(5, 5, 5 + 1e-9, 5, 2), null);

    const mesh = buildSgzzPolyMesh([
        { points: quad!, rgba: [1, 0, 0, 1] },
        { points: [[0, 0], [1, 0], [1, 1], [0, 1]], rgba: [0, 1, 0, 0.5] },
    ]);
    assert.equal(mesh.quads, 2);
    assert.deepEqual([...mesh.indices16], [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    assert.equal(mesh.minPos[1], -2);
    assert.equal(mesh.maxPos[0], 10);
    assert.equal(buildSgzzPolyMesh([]).quads, 0, "空 mesh 不炸");
});
