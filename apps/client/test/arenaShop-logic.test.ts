/**
 * 竞技场商店插件（plugins/arenaShop）客户端逻辑：只列自己的格（经 arena kit 的 client board 面）、购买闸
 * （未装载 / 不是自己的 / 在途）、成功更新守备与余额、错误码翻译、宿主未就绪 ⛔ 不做假实现。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARENA_TILE_COUNT, fetchArenaBoard } from "../src/kits/arena/api/board/index";
import { ArenaShopLogic, describeArenaShopError } from "../src/plugins/arenaShop/logic/ArenaShopLogic";
import type { ArenaShopRuntime } from "../src/plugins/arenaShop/logic/arenaShopRuntime";
import { ARENA_SHOP_BOOST_COST } from "../src/shared/protocol/lobbyRpc/domains/arenaShop";
import type { IArenaTile } from "../src/shared/kits/arena/api/board/index";

class FakeRpcError extends Error {
    constructor(readonly code: string) { super(code); }
}

function board(overrides: Partial<Record<number, { ownerUid: string; power: number }>> = {}): IArenaTile[] {
    return Array.from({ length: ARENA_TILE_COUNT }, (_x, tile) => ({ tile, ownerUid: "", power: 0, ...overrides[tile] }));
}

function runtimeWith(tiles: IArenaTile[], buyBoost?: ArenaShopRuntime["buyBoost"]) {
    const runtime = {
        closed: 0,
        selfUid: () => "me",
        board: async () => ({ tiles, myTrophies: 0 }),
        buyBoost: buyBoost ?? (async (tile: number) => ({ tile, power: 6, balance: 90 })),
        close() { runtime.closed += 1; },
    };
    return runtime as typeof runtime & ArenaShopRuntime;
}

test("arenaShop：只列自己的格；未装载 / 敌格 / 无主格不可买；购买成功更新守备与余额并写提示", async () => {
    const runtime = runtimeWith(board({ 1: { ownerUid: "me", power: 1 }, 2: { ownerUid: "u2", power: 3 }, 5: { ownerUid: "me", power: 2 } }));
    const logic = new ArenaShopLogic(runtime);
    let changed = 0;
    logic.onChanged = () => { changed += 1; };
    assert.equal(logic.boostCost(), ARENA_SHOP_BOOST_COST);
    assert.deepEqual(logic.ownTiles(), []);
    assert.equal(logic.canBuy(1), false, "未装载");
    assert.equal(await logic.buy(1), false);
    assert.equal(await logic.refresh(), true);
    assert.deepEqual(logic.ownTiles().map((tile) => [tile.tile, tile.label, tile.power]), [[1, "B1", 1], [5, "B2", 2]]);
    assert.equal(logic.canBuy(2), false, "敌格");
    assert.equal(logic.canBuy(0), false, "无主格");
    assert.equal(logic.canBuy(1), true);
    const pending = logic.buy(1);
    assert.equal(logic.isBusy(), true);
    assert.equal(logic.canBuy(5), false, "在途");
    assert.equal(await pending, true);
    assert.equal(logic.currentNotice().kind, "success");
    assert.equal(logic.currentNotice().text, "B1 我方 1 → 守备 6，余额 90");
    assert.equal(logic.lastBalance(), 90);
    assert.equal(logic.ownTiles()[0].power, 6);
    assert.ok(changed >= 4);
    logic.close();
    assert.equal(runtime.closed, 1);
});

test("arenaShop：域错误码 / 框架经济码 / 网络码翻译；失败后可重试", async () => {
    const runtime = runtimeWith(board({ 1: { ownerUid: "me", power: 1 } }), async () => { throw new FakeRpcError("ARENA_SHOP_TILE_NOT_OWNED"); });
    const logic = new ArenaShopLogic(runtime);
    await logic.refresh();
    assert.equal(await logic.buy(1), false);
    assert.equal(logic.currentNotice().kind, "error");
    assert.equal(logic.currentNotice().text, "这格不是你的，先去竞技场占领");
    assert.equal(logic.canBuy(1), true, "失败后可重试");
    assert.equal(logic.lastBalance(), null);
    assert.equal(describeArenaShopError(new FakeRpcError("INSUFFICIENT_BALANCE")), "金币不足");
    assert.match(describeArenaShopError(new FakeRpcError("CONN_LOST")), /不会重复扣款/u);
    assert.equal(describeArenaShopError(new FakeRpcError("SOMETHING")), "购买失败（SOMETHING）");
    assert.equal(describeArenaShopError(new Error("x")), "购买失败，请稍后重试");
});

test("arenaShop：账本重放（balance=null）→ 守备照更新、余额保留上次已知值、提示说明未扣款", async () => {
    let first = true;
    const runtime = runtimeWith(board({ 1: { ownerUid: "me", power: 1 } }), async (tile: number) => {
        const balance = first ? 90 : null;
        first = false;
        return { tile, power: 6, balance };
    });
    const logic = new ArenaShopLogic(runtime);
    await logic.refresh();
    assert.equal(await logic.buy(1), true);
    assert.equal(logic.lastBalance(), 90);
    assert.equal(await logic.buy(1), true);
    assert.equal(logic.lastBalance(), 90, "null 不覆盖已知余额");
    assert.equal(logic.currentNotice().text, "B1 我方 6 → 守备 6（重放：本次未扣款）");
    const fresh = new ArenaShopLogic(runtimeWith(board({ 1: { ownerUid: "me", power: 1 } }), async (tile: number) => ({ tile, power: 6, balance: null })));
    await fresh.refresh();
    assert.equal(await fresh.buy(1), true);
    assert.equal(fresh.lastBalance(), null, "从未拿到余额就仍是 null");
});

test("arenaShop：插件只经 kit 的 client board 面读棋盘（fetchArenaBoard 走 lobbyRpc.query arena.board），⛔ 不自己点名 ArenaRpc", async () => {
    const calls: [string, unknown][] = [];
    const tiles = board();
    const result = await fetchArenaBoard({ query: async (type, payload) => { calls.push([type, payload]); return { tiles, myTrophies: 2 } as never; } });
    assert.deepEqual(calls, [["arena.board", {}]]);
    assert.deepEqual(result, { tiles, myTrophies: 2 });
    const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/plugins/arenaShop");
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        (entry.isDirectory() ? walk(path.join(dir, entry.name)) : (entry.name.endsWith(".ts") ? [path.join(dir, entry.name)] : [])));
    for (const file of walk(pluginDir)) {
        const source = fs.readFileSync(file, "utf8");
        assert.doesNotMatch(source, /domains\/arena"/u, `${path.relative(pluginDir, file)} 不得 import kit 的 arena 域文件`);
        for (const m of source.matchAll(/from "([^"]+kits\/arena[^"]*)"/gu)) {
            assert.match(m[1], /kits\/arena\/api\/[A-Za-z]+\/index$/u, `${path.relative(pluginDir, file)} 只能 import kit 的 api 面：${m[1]}`);
        }
    }
});

test("arenaShop：宿主未就绪（runtime null）→ 不可刷新 / 不可买、提示未就绪、close 无副作用", async () => {
    const logic = new ArenaShopLogic(null);
    assert.equal(logic.isReady(), false);
    assert.equal(await logic.refresh(), false);
    assert.equal(await logic.buy(0), false);
    assert.equal(logic.currentNotice().text, "竞技场商店未就绪（plugin 未装载）");
    logic.close();
});
