import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_READ_INTERVAL_MS, SgzzmapWorldLogic, noticeOf,
} from "../src/kits/sgzzmap/logic/SgzzmapWorldLogic";
import type { SgzzRuntime } from "../src/kits/sgzzmap/logic/sgzzRuntime";
import { SgzzGridState } from "../src/shared/kits/sgzzmap/api/territory/index";
import { sgzzCellOf, sgzzNextPos } from "../src/shared/kits/sgzzmap/api/hexmap/index";
import { sgzzMarchDurationMs } from "../src/shared/kits/sgzzmap/api/march/index";

const W = 750, H = 1204;

function fakeRuntime(over: Partial<SgzzRuntime> = {}) {
    const calls = { view: 0, zoom: 0, occupy: 0, abandon: 0 };
    let clock = 0;
    const base: SgzzRuntime = {
        selfUid: () => "u-me",
        view: async () => {
            calls.view += 1;
            return {
                rect: { minRow: 0, minCol: 0, maxRow: 0, maxCol: 0 }, revision: 1,
                viewer: { uid: "u-me", aid: "", leaderUid: "", friendAids: [] },
                alliances: [], owners: [], tiles: [], marches: [],
            };
        },
        zoom: async () => {
            calls.zoom += 1;
            return { level: 0, rect: { minRow: 0, minCol: 0, maxRow: 0, maxCol: 0 }, revision: 1, alliances: [], chunks: [] };
        },
        tile: async () => ({ tile: { cell: 0, ownerUid: "", ownerAid: "", durability: 0, addition: false, capturingAid: "" },
                             viewer: { uid: "u-me", aid: "", leaderUid: "", friendAids: [] } }),
        occupy: async (cell) => {
            calls.occupy += 1;
            return { tile: { cell, ownerUid: "u-me", ownerAid: "", durability: 1, addition: false, capturingAid: "" },
                     outcome: "captured" as const, heldTiles: 1 };
        },
        abandon: async (cell) => { calls.abandon += 1; return { cell, heldTiles: 0 }; },
        now: () => clock,
        tick: () => () => {},
        close: () => {},
        ...over,
    };
    return { runtime: base, calls, at: (t: number) => { clock = t; } };
}
const flush = () => new Promise((r) => setImmediate(r));

test("sgzzmap page: 节流 —— 相机每帧都在动，⛔ 不能每帧发请求", async () => {
    const f = fakeRuntime();
    const logic = new SgzzmapWorldLogic(f.runtime, W, H);
    f.at(10_000);
    for (let i = 0; i < 30; i += 1) { logic.update(0.016); await flush(); }
    assert.equal(f.calls.view, 1, "同一视野内只该发一次");

    // 时间没到就算换了视野也不发
    logic.camera.pan(2000, 0);
    for (let i = 0; i < 5; i += 1) { logic.update(0.016); await flush(); }
    assert.equal(f.calls.view, 1, "间隔没到⛔不发");

    f.at(10_000 + SGZZ_READ_INTERVAL_MS + 1);
    logic.update(0.016); await flush();
    assert.equal(f.calls.view, 2, "间隔到了 + 视野变了才发");
});

test("sgzzmap page: ★ 代际围栏 —— 迟到的旧响应⛔不得覆盖新视野", async () => {
    let release: ((v: unknown) => void) | null = null;
    const slow = new Promise((r) => { release = r; });
    let first = true;
    const f = fakeRuntime({
        view: async () => {
            if (first) {
                first = false;
                await slow;   // 第一次请求卡住
                return {
                    rect: { minRow: 0, minCol: 0, maxRow: 0, maxCol: 0 }, revision: 1,
                    viewer: { uid: "u-me", aid: "", leaderUid: "", friendAids: [] },
                    alliances: [], owners: [{ uid: "u-stale", alliance: -1 }],
                    tiles: [{ cell: sgzzCellOf(700, 700), owner: 0, durability: 9, addition: false, capturing: -1 }],
                    marches: [],
                };
            }
            return {
                rect: { minRow: 0, minCol: 0, maxRow: 0, maxCol: 0 }, revision: 2,
                viewer: { uid: "u-me", aid: "", leaderUid: "", friendAids: [] },
                alliances: [], owners: [{ uid: "u-fresh", alliance: -1 }],
                tiles: [{ cell: sgzzCellOf(800, 800), owner: 0, durability: 1, addition: false, capturing: -1 }],
                marches: [],
            };
        },
    });
    const logic = new SgzzmapWorldLogic(f.runtime, W, H);
    f.at(10_000);
    logic.update(0.016); await flush();          // 发出第一次（卡住）

    // 注意：inflight 期间不会再发；先放行第一次，再让它被新一次覆盖
    release!(null); await flush(); await flush();
    assert.equal(logic.tileAt(700, 700).ownerUid, "u-stale", "第一次的结果先落地");

    f.at(20_000);
    logic.camera.pan(3000, 3000);
    logic.update(0.016); await flush(); await flush();
    assert.equal(logic.tileAt(800, 800).ownerUid, "u-fresh", "新视野的数据要生效");
    assert.equal(logic.tileAt(700, 700).ownerUid, "", "旧视野的数据要被整批换掉");
});

test("sgzzmap page: applyView 把折叠的下标还原成地块，并重建描边", () => {
    const f = fakeRuntime();
    const logic = new SgzzmapWorldLogic(f.runtime, W, H);
    logic.applyView({
        viewer: { uid: "u-me", aid: "a1", leaderUid: "u-lead", friendAids: [] },
        alliances: ["a1", "a2"],
        owners: [{ uid: "u-me", alliance: 0 }, { uid: "u-foe", alliance: 1 }],
        tiles: [
            { cell: sgzzCellOf(700, 700), owner: 0, durability: 3, addition: false, capturing: -1 },
            { cell: sgzzCellOf(700, 701), owner: 1, durability: 2, addition: false, capturing: 0 },
        ],
    });
    const mine = logic.tileAt(700, 700);
    assert.equal(mine.ownerUid, "u-me");
    assert.equal(mine.ownerAid, "a1");
    assert.equal(logic.stateAt(700, 700), SgzzGridState.MY);

    const foe = logic.tileAt(700, 701);
    assert.equal(foe.ownerUid, "u-foe");
    assert.equal(foe.ownerAid, "a2");
    assert.equal(foe.capturingAid, "a1", "capturing 下标要还原成盟 id");
    assert.equal(logic.stateAt(700, 701), SgzzGridState.UNION_CAPTURE, "攻占中优先于归属");

    assert.ok(logic.borders.has(700, 700), "我的地要进描边集");
    assert.ok(!logic.borders.has(700, 701), "敌方的地⛔不进我的描边集");
    assert.equal(logic.tileAt(0, 0).ownerUid, "", "没回的格就是默认无主格");
});

test("sgzzmap page: 选格与占领/放弃，失败会翻成人话且⛔不改本地状态", async () => {
    const f = fakeRuntime();
    const logic = new SgzzmapWorldLogic(f.runtime, W, H);
    assert.equal(logic.select(700, 700), true);
    assert.equal(logic.selection?.row, 700);

    await logic.occupySelected();
    assert.equal(f.calls.occupy, 1);
    assert.equal(logic.tileAt(700, 700).ownerUid, "u-me");
    assert.equal(logic.notice, "已占领");
    assert.ok(logic.borders.has(700, 700));

    await logic.abandonSelected();
    assert.equal(logic.tileAt(700, 700).ownerUid, "", "放弃后回到默认无主格");
    assert.equal(logic.notice, "已放弃");

    // 失败路径
    const bad = fakeRuntime({
        occupy: async () => { throw Object.assign(new Error("x"), { rpcCode: "SGZZMAP_NOT_ADJACENT" }); },
    });
    const l2 = new SgzzmapWorldLogic(bad.runtime, W, H);
    l2.select(700, 700);
    await l2.occupySelected();
    assert.equal(l2.notice, "必须与自己或同盟的领地相连");
    assert.equal(l2.tileAt(700, 700).ownerUid, "", "失败⛔不得改本地状态");

    // 远档不选格
    const l3 = new SgzzmapWorldLogic(fakeRuntime().runtime, W, H);
    for (let i = 0; i < 40; i += 1) l3.camera.zoom(0.5);
    assert.equal(l3.select(700, 700), false, "远档⛔不选格");
});

test("sgzzmap page: 远档改拉分块摘要，⛔ 不再逐格", async () => {
    const f = fakeRuntime();
    const logic = new SgzzmapWorldLogic(f.runtime, W, H);
    f.at(10_000);
    logic.update(0.016); await flush();
    assert.equal(f.calls.view, 1);
    assert.equal(f.calls.zoom, 0);

    for (let i = 0; i < 40; i += 1) logic.camera.zoom(0.5);   // 缩到最远
    f.at(20_000);
    logic.update(0.016); await flush();
    assert.equal(f.calls.zoom, 1, "远档要走 zoom");
    assert.equal(f.calls.view, 1, "⛔ 不再逐格拉");
});

test("sgzzmap page: 结算积压是「稍后再试」而不是报错，且允许重试", async () => {
    let fail = true;
    const f = fakeRuntime({
        view: async () => {
            if (fail) throw Object.assign(new Error("x"), { rpcCode: "SGZZMAP_SETTLEMENT_PENDING" });
            return {
                rect: { minRow: 0, minCol: 0, maxRow: 0, maxCol: 0 }, revision: 1,
                viewer: { uid: "u-me", aid: "", leaderUid: "", friendAids: [] },
                alliances: [], owners: [], tiles: [], marches: [],
            };
        },
    });
    const logic = new SgzzmapWorldLogic(f.runtime, W, H);
    f.at(10_000);
    logic.update(0.016); await flush(); await flush();
    assert.equal(logic.notice, "正在补算到达事件…");

    // ⚠ 失败后必须允许同一视野重试（lastKey 要清掉），⛔ 否则会卡死在空地图
    fail = false;
    f.at(10_000 + SGZZ_READ_INTERVAL_MS + 1);
    logic.update(0.016); await flush(); await flush();
    assert.equal(logic.notice, "", "重试成功后要把提示清掉");
});

test("sgzzmap page: 错误码翻译覆盖全部业务码", () => {
    for (const [code, want] of [
        ["SGZZMAP_IMPASSABLE", "这一格过不去"],
        ["SGZZMAP_NOT_ADJACENT", "必须与自己或同盟的领地相连"],
        ["SGZZMAP_TILE_LIMIT", "已达持地上限"],
        ["SGZZMAP_NOT_OWNED", "这不是你的领地"],
        ["RATE_LIMITED", "操作太快了，缓一缓"],
    ] as const) {
        assert.equal(noticeOf({ rpcCode: code }), want);
    }
    assert.equal(noticeOf(null), "操作失败", "⛔ 不把原始错误甩给玩家");
    assert.equal(noticeOf(new Error("boom")), "操作失败");
});

test("sgzzmap page: view 带回的行军进 tracker，档位决定要不要细线", () => {
    const f = fakeRuntime();
    const logic = new SgzzmapWorldLogic(f.runtime, W, H);
    const from = sgzzCellOf(700, 700);
    let cur = { row: 700, col: 700 };
    for (let i = 0; i < 3; i += 1) cur = sgzzNextPos(cur.row, cur.col, 3);
    const to = sgzzCellOf(cur.row, cur.col);
    const path = [from, to];
    const march = {
        marchId: "m1", uid: "u-me", path,
        departAt: 0, arriveAt: sgzzMarchDurationMs(path), status: "marching" as const,
    };

    logic.applyView({
        viewer: { uid: "u-me", aid: "", leaderUid: "", friendAids: [] },
        alliances: [], owners: [], tiles: [], marches: [march],
    });
    assert.equal(logic.marches.length, 1);
    assert.equal(logic.marchLines.size, 1);
    assert.equal(logic.wantsMarchLines, true, "初始档位要画行军线");
    assert.equal(logic.wantsMarchDetail, true, "近档要画细线");
    assert.ok(logic.marchLines.visuals()[0].detail.length > 0);

    // 缩到最远：线不画了
    for (let i = 0; i < 40; i += 1) logic.camera.zoom(0.5);
    assert.equal(logic.wantsMarchLines, false, "LOD5 ⛔ 不画行军线");
    assert.equal(logic.wantsMarchDetail, false);

    // 下一批不含这条 ⇒ 必须丢掉
    logic.applyView({
        viewer: { uid: "u-me", aid: "", leaderUid: "", friendAids: [] },
        alliances: [], owners: [], tiles: [], marches: [],
    });
    assert.equal(logic.marches.length, 0);
    assert.equal(logic.marchLines.size, 0, "撤回/到达后线必须消失");
});

test("sgzzmap page: applyZoom 记住档位，色块按那一档的分块形状画", () => {
    const f = fakeRuntime();
    const logic = new SgzzmapWorldLogic(f.runtime, W, H);
    logic.applyZoom({ level: 2, alliances: ["a1"], chunks: [{ key: 7, tiles: 9, alliance: 0, top: 9 }] });
    assert.equal(logic.summaryLevel, 2, "⚠ 不记住档位的话色块会按错误的块尺寸画");
    assert.equal(logic.summaries.size, 1);
    assert.deepEqual([...logic.summaryAlliances], ["a1"]);

    logic.applyZoom({ level: 0, alliances: [], chunks: [] });
    assert.equal(logic.summaryLevel, 0);
    assert.equal(logic.summaries.size, 0, "换档要清掉上一档的块");
});

test("sgzzmap page: locate 会强制重拉（⛔ 跳转后不能还盯着旧窗）", async () => {
    const f = fakeRuntime();
    const logic = new SgzzmapWorldLogic(f.runtime, W, H);
    f.at(10_000);
    logic.update(0.016); await flush();
    assert.equal(f.calls.view, 1);

    // 同一时刻直接 locate：lastKey 被清掉，下一次 update 就该重拉
    logic.locate(200, 200);
    f.at(10_000 + SGZZ_READ_INTERVAL_MS + 1);
    logic.update(0.016); await flush();
    assert.equal(f.calls.view, 2, "跳转后必须重拉");
    const centre = logic.camera.centreCell();
    assert.ok(Math.abs(centre.row - 200) <= 1 && Math.abs(centre.col - 200) <= 1);
});
