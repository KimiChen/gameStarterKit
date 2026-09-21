/**
 * 近景窗 / 手势区 / 提示寿命的回归。
 *
 * 这四条全部来自 2026-09-21 的真机重放（creator-preview run 4）——673 条绿的单测一条都没抓到，
 * 因为它们钉的是我当时**写错的那个假设**。所以每条都直接钉「屏幕上看到的事实」。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_MAX_QUERY_CHUNKS, sgzzChunkRectForGridRect, sgzzClampChunkRect,
    sgzzGridRectForChunkRect, sgzzRectArea,
} from "../src/shared/kits/sgzzmap/api/hexmap/index";
import { sgzzInMapBand } from "../src/kits/sgzzmap/logic/sgzzCamera";
import { SgzzViewportStencil } from "../src/kits/sgzzmap/logic/sgzzViewport";
import { SgzzmapWorldLogic } from "../src/kits/sgzzmap/logic/SgzzmapWorldLogic";
import type { SgzzRuntime } from "../src/kits/sgzzmap/logic/sgzzRuntime";

const VIEWER = { uid: "u1", aid: "", leaderUid: "", friendAids: [] as string[], home: -1 };

test("近景窗：对称收缩，⛔ 不再整体偏到相机左上", () => {
    const want = sgzzChunkRectForGridRect({ minRow: 720, minCol: 720, maxRow: 780, maxCol: 780 });
    const c = sgzzChunkRectForGridRect({ minRow: 750, minCol: 750, maxRow: 750, maxCol: 750 });
    const rect = sgzzClampChunkRect(want, c.minRow, c.minCol);
    assert.ok(sgzzRectArea(rect) <= SGZZ_MAX_QUERY_CHUNKS, "必须钳在一次请求的预算内");
    // 中心块两侧的块数之差 ≤ 1 —— 老写法是 [c-1, c]，右下侧 0 块，屏幕右下角恒无数据
    assert.ok(Math.abs((c.minRow - rect.minRow) - (rect.maxRow - c.minRow)) <= 1);
    assert.ok(Math.abs((c.minCol - rect.minCol) - (rect.maxCol - c.minCol)) <= 1);
});

test("近景窗：贴地图边界时仍占满预算，⛔ 不缩水", () => {
    const want = sgzzChunkRectForGridRect({ minRow: 0, minCol: 0, maxRow: 60, maxCol: 60 });
    const rect = sgzzClampChunkRect(want, 0, 0);
    assert.equal(rect.minRow, 0);
    assert.equal(rect.minCol, 0);
    assert.ok(sgzzRectArea(rect) <= SGZZ_MAX_QUERY_CHUNKS);
    assert.ok(sgzzRectArea(rect) >= 25, `贴边也该拉满，实际 ${sgzzRectArea(rect)}`);
});

test("★ 近景窗盖住 LOD0 整屏：可视集里每一格都在窗内（⛔ 没有「显示成无主」的空白区）", () => {
    // 真机布局：750 宽、地图区高 1122，初始 scale 0.85
    const stencil = new SgzzViewportStencil();
    stencil.refresh(0.85, 750, 1122);
    const centre = { row: 750, col: 750 };
    const span = stencil.spanFor(centre.row);
    const want = sgzzChunkRectForGridRect({
        minRow: centre.row - span.dr, minCol: centre.col - span.dc,
        maxRow: centre.row + span.dr, maxCol: centre.col + span.dc,
    });
    const c = sgzzChunkRectForGridRect({
        minRow: centre.row, minCol: centre.col, maxRow: centre.row, maxCol: centre.col,
    });
    const grid = sgzzGridRectForChunkRect(sgzzClampChunkRect(want, c.minRow, c.minCol));

    let seen = 0, outside = 0;
    stencil.forEach(centre.row, centre.col, 1500, 1500, (row, col) => {
        seen += 1;
        if (row < grid.minRow || row > grid.maxRow || col < grid.minCol || col > grid.maxCol) outside += 1;
    });
    assert.ok(seen > 1000, `LOD0 该有上千可视格，实际 ${seen}`);
    assert.equal(outside, 0, `有 ${outside}/${seen} 个可视格落在近景窗外 —— 这些格会被显示成「无主」`);
});

test("手势区：页眉/页脚上的点不算地图点选", () => {
    const mapTop = 771, mapBottom = -351;
    assert.equal(sgzzInMapBand(0, mapTop, mapBottom), true);
    assert.equal(sgzzInMapBand(mapTop, mapTop, mapBottom), true);
    assert.equal(sgzzInMapBand(mapBottom, mapTop, mapBottom), true);
    assert.equal(sgzzInMapBand(mapBottom - 1, mapTop, mapBottom), false, "页脚按钮区");
    assert.equal(sgzzInMapBand(mapTop + 1, mapTop, mapBottom), false, "页眉区");
});

function fakeRuntime(over: Partial<SgzzRuntime> = {}) {
    let clock = 0;
    const base: SgzzRuntime = {
        selfUid: () => "u1",
        view: async () => ({
            // 窗 = chunk [72..77] ⇒ 格 [720..779]
            rect: { minRow: 72, minCol: 72, maxRow: 77, maxCol: 77 }, revision: 1, viewer: VIEWER,
            alliances: [], owners: [], tiles: [], truncated: false, marches: [],
        }),
        zoom: async () => ({ level: 0, rect: { minRow: 0, minCol: 0, maxRow: 0, maxCol: 0 }, revision: 1, alliances: [], chunks: [] }),
        tile: async () => ({ tile: { cell: 0, ownerUid: "", ownerAid: "", durability: 0, addition: false, capturingAid: "" }, viewer: VIEWER }),
        occupy: async () => { throw Object.assign(new Error("x"), { code: "SGZZMAP_NOT_ADJACENT" }); },
        abandon: async (cell: number) => ({ cell, heldTiles: 0 }),
        now: () => clock,
        tick: () => () => {},
        close: () => {},
        ...over,
    } as SgzzRuntime;
    return { runtime: base, at: (t: number) => { clock = t; } };
}
const flush = () => new Promise((r) => setImmediate(r));

test("★ 提示寿命：操作结果不会被下一次成功轮询抹掉（⛔ 真机上活不过 220 ms）", async () => {
    const f = fakeRuntime();
    const logic = new SgzzmapWorldLogic(f.runtime, 750, 1122);
    f.at(10_000); logic.update(0.016); await flush();
    assert.equal(logic.notice, "");

    logic.select(750, 750);
    await logic.occupySelected();
    assert.equal(logic.notice, "必须与自己或同盟的领地相连");
    assert.equal(logic.noticeKind, "act");

    // 换个视野逼出第二次轮询（lastKey 会挡住同窗重发）
    f.at(20_000); logic.locate(760, 760); logic.update(0.016); await flush();
    assert.equal(logic.notice, "必须与自己或同盟的领地相连", "轮询成功⛔不得抹掉操作结果");

    // 反向：读失败留下的提示，下一次读成功该清掉
    logic.notice = "地图数据读取失败"; logic.noticeKind = "read";
    f.at(30_000); logic.locate(770, 770); logic.update(0.016); await flush();
    assert.equal(logic.notice, "");
});

test("★ 窗外的格标 pending 并单独查 sgzzmap.tile，⛔ 不拿默认空格冒充「无主」", async () => {
    let asked = -1;
    const f = fakeRuntime({
        tile: async (cell: number) => {
            asked = cell;
            return {
                tile: { cell, ownerUid: "u9", ownerAid: "", durability: 3, addition: false, capturingAid: "" },
                viewer: VIEWER,
            };
        },
    });
    const logic = new SgzzmapWorldLogic(f.runtime, 750, 1122);
    f.at(10_000); logic.update(0.016); await flush();
    assert.equal(logic.isLoaded(750, 750), true);
    assert.equal(logic.isLoaded(700, 700), false);

    logic.select(750, 750);
    assert.equal(logic.selection?.pending, false, "窗内的格是确知的");

    logic.select(700, 700);
    assert.equal(logic.selection?.pending, true, "窗外的格必须是 pending");
    await flush();
    assert.equal(asked, 7000700, "必须真去查单格");
    assert.equal(logic.selection?.pending, false);
    assert.equal(logic.selection?.tile.ownerUid, "u9");
});

test("★ 回领地：有地就回自己的地，无地退回地图中心", async () => {
    const f = fakeRuntime({
        view: async () => ({
            rect: { minRow: 72, minCol: 72, maxRow: 77, maxCol: 77 }, revision: 1,
            viewer: { ...VIEWER, home: 7270713 },      // (727, 713)
            alliances: [], owners: [], tiles: [], truncated: false, marches: [],
        }),
    });
    const logic = new SgzzmapWorldLogic(f.runtime, 750, 1122);
    assert.equal(logic.hasHome, false, "还没拉过数据时没有地可回");
    assert.deepEqual(logic.locateHome(), { row: 750, col: 750 }, "无地时回地图中心");

    f.at(10_000); logic.update(0.016); await flush();
    assert.equal(logic.hasHome, true);
    assert.deepEqual(logic.locateHome(), { row: 727, col: 713 });
    const centre = logic.camera.centreCell();
    assert.equal(centre.row, 727);
    assert.equal(centre.col, 713);
});
