/**
 * arena kit（kits/arena）客户端：board / ranking api 面的纯函数（坐标标签、归属、可占领判定、排名文案）
 * 与棋盘页逻辑（加载、占领闸、成功 / 失败提示、ARENA_TILE_TAKEN 后重读、宿主未就绪 ⛔ 不做假实现）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    ARENA_GRID_SIZE, ARENA_TILE_COUNT, describeBoard, formatTile, tileGridPosition, tileLabel, tileOwnership,
} from "../src/kits/arena/api/board/index";
import { formatRanking, rankOwners } from "../src/kits/arena/api/ranking/index";
import { ArenaBoardLogic, describeArenaError } from "../src/kits/arena/logic/ArenaBoardLogic";
import type { ArenaRuntime } from "../src/kits/arena/logic/arenaRuntime";
import type { IArenaTile } from "../src/shared/kits/arena/api/board/index";

class FakeRpcError extends Error {
    constructor(readonly code: string) { super(code); }
}

function board(overrides: Partial<Record<number, { ownerUid: string; power: number }>> = {}): IArenaTile[] {
    return Array.from({ length: ARENA_TILE_COUNT }, (_x, tile) => ({ tile, ownerUid: "", power: 0, ...overrides[tile] }));
}

/** 假宿主：缺省的 capture 像服务端一样把该格改成自己的、奖杯 +1，之后的 board() 读到新状态。 */
function runtimeWith(options: { tiles?: IArenaTile[]; trophies?: number; capture?: ArenaRuntime["capture"] } = {}) {
    let tiles = options.tiles ?? board();
    let trophies = options.trophies ?? 0;
    const runtime = {
        closed: 0,
        boards: 0,
        setTiles(next: IArenaTile[]) { tiles = next; },
        selfUid: () => "me",
        board: async () => { runtime.boards += 1; return { tiles, myTrophies: trophies }; },
        capture: options.capture ?? (async (tile: number) => {
            tiles = tiles.map((item) => (item.tile === tile ? { tile, ownerUid: "me", power: 1 } : item));
            trophies += 1;
            return { tile, power: 1, trophies };
        }),
        close() { runtime.closed += 1; },
    };
    return runtime as typeof runtime & ArenaRuntime;
}

test("arena board 面：4×4 坐标标签、归属与可占领判定、缺格补齐", () => {
    assert.equal(ARENA_GRID_SIZE, 4);
    assert.deepEqual(tileGridPosition(0), { row: 0, col: 0 });
    assert.deepEqual(tileGridPosition(5), { row: 1, col: 1 });
    assert.equal(tileLabel(0), "A1");
    assert.equal(tileLabel(3), "D1");
    assert.equal(tileLabel(15), "D4");
    assert.equal(tileOwnership({ tile: 0, ownerUid: "", power: 0 }, "me"), "empty");
    assert.equal(tileOwnership({ tile: 0, ownerUid: "me", power: 1 }, "me"), "self");
    assert.equal(tileOwnership({ tile: 0, ownerUid: "u2", power: 1 }, "me"), "enemy");
    const views = describeBoard([{ tile: 2, ownerUid: "u2", power: 2 }, { tile: 3, ownerUid: "u2", power: 0 }, { tile: 4, ownerUid: "me", power: 1 }], "me");
    assert.equal(views.length, ARENA_TILE_COUNT);
    assert.deepEqual(views.map((view) => view.tile), Array.from({ length: ARENA_TILE_COUNT }, (_x, i) => i));
    assert.equal(views[2].capturable, false, "敌格有守备不可占");
    assert.equal(views[3].capturable, true, "敌格守备归零可夺");
    assert.equal(views[4].capturable, true, "自己的格可加固");
    assert.equal(views[0].capturable, true, "无主格可占");
    assert.equal(formatTile(views[2]), "C1 敌方 2");
    assert.equal(formatTile(views[4]), "A2 我方 1");
    assert.equal(formatTile(views[0]), "A1 无主");
});

test("arena ranking 面：按格数 → 守备和 → uid 聚合；文案标记本人", () => {
    const tiles = board({ 0: { ownerUid: "u2", power: 5 }, 1: { ownerUid: "me", power: 1 }, 2: { ownerUid: "me", power: 1 }, 3: { ownerUid: "u3", power: 9 } });
    assert.deepEqual(rankOwners(tiles), [
        { ownerUid: "me", tiles: 2, power: 2 },
        { ownerUid: "u3", tiles: 1, power: 9 },
        { ownerUid: "u2", tiles: 1, power: 5 },
    ]);
    assert.deepEqual(formatRanking(tiles, "me", 2), ["1. ▶ 我 · 2 格 · 守备 2", "2. u3 · 1 格 · 守备 9"]);
    assert.deepEqual(formatRanking(board(), "me"), []);
});

test("arena 棋盘页：refresh 装载棋盘与奖杯；未装载 / 敌格有守备 / 在途都不可占；占领成功写提示并本地更新", async () => {
    const runtime = runtimeWith({ tiles: board({ 1: { ownerUid: "u2", power: 2 } }), trophies: 4 });
    const logic = new ArenaBoardLogic(runtime);
    let changed = 0;
    logic.onChanged = () => { changed += 1; };
    assert.equal(logic.isReady(), true);
    assert.equal(logic.canCapture(0), false, "未装载不可占");
    assert.equal(await logic.capture(0), false);
    assert.equal(await logic.refresh(), true);
    assert.equal(logic.isLoaded(), true);
    assert.equal(logic.myTrophies(), 4);
    assert.equal(logic.canCapture(1), false, "敌格有守备");
    assert.equal(logic.canCapture(0), true);
    const pending = logic.capture(0);
    assert.equal(logic.isBusy(), true);
    assert.equal(logic.canCapture(5), false, "在途期间不可占");
    assert.equal(await pending, true);
    assert.equal(logic.currentNotice().kind, "success");
    assert.match(logic.currentNotice().text, /A1 已占领 · 守备 1 · 奖杯 5/u);
    assert.equal(logic.myTrophies(), 5, "重读后以服务端奖杯为准");
    assert.equal(logic.board()[0].ownership, "self");
    assert.equal(runtime.boards, 2, "成功后重读整张棋盘");
    assert.ok(changed >= 4);
    logic.close();
    assert.equal(runtime.closed, 1);
});

test("arena 棋盘页：ARENA_TILE_TAKEN → 错误提示 + 重读棋盘（提示保留）；其他错误不重读；错误码翻译", async () => {
    const runtime = runtimeWith({
        tiles: board({ 1: { ownerUid: "u2", power: 0 } }),
        capture: async () => { throw new FakeRpcError("ARENA_TILE_TAKEN"); },
    });
    const logic = new ArenaBoardLogic(runtime);
    await logic.refresh();
    runtime.setTiles(board({ 1: { ownerUid: "u2", power: 0 } }));
    assert.equal(await logic.capture(1), false);
    assert.equal(logic.currentNotice().kind, "error");
    assert.equal(logic.currentNotice().text, "这格还有守备，再试几次就能夺下");
    assert.equal(runtime.boards, 2, "TAKEN 后重读（敌格已被削）");

    const other = runtimeWith({ capture: async () => { throw new FakeRpcError("TIMEOUT"); } });
    const logic2 = new ArenaBoardLogic(other);
    await logic2.refresh();
    assert.equal(await logic2.capture(0), false);
    assert.equal(other.boards, 1, "网络错误不重读");
    assert.match(logic2.currentNotice().text, /不会重复/u);

    assert.equal(describeArenaError(new FakeRpcError("SOMETHING")), "操作失败（SOMETHING）");
    assert.equal(describeArenaError(new Error("x")), "操作失败，请稍后重试");
});

test("arena 棋盘页：宿主未就绪（runtime null）→ 不可刷新 / 不可占领、提示未就绪、close 无副作用", async () => {
    const logic = new ArenaBoardLogic(null);
    assert.equal(logic.isReady(), false);
    assert.equal(await logic.refresh(), false);
    assert.equal(logic.canCapture(0), false);
    assert.equal(await logic.capture(0), false);
    assert.equal(logic.currentNotice().text, "竞技场未就绪（kit 未装载）");
    assert.deepEqual(logic.ranking(), []);
    assert.equal(logic.board().length, ARENA_TILE_COUNT);
    logic.close();
});
