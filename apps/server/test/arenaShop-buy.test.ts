/**
 * 竞技场商店插件（plugins/arenaShop）服务端用例：只经 arena kit 的 board 面（假 kit 面注入）——
 * 区 / fence / opId 的编排、不是自己的格 → ARENA_SHOP_TILE_NOT_OWNED、账本 DUP 时 balance=null 原样透传
 * （⛔ 插件不越过 kit 面读余额）、其他错误原样上抛。⛔ 不碰 MySQL / Redis；withUser 也是假的（只给 fence）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ARENA_SHOP_BOOST_COST, validateArenaShopBuyBoostRes } from "@game/shared/protocol/lobbyRpc/domains/arenaShop";
import { RpcFault } from "../src/core/errors";
import { type ArenaShopBuyDeps, buyArenaBoost } from "../src/core/arenaShop/buy";
import { ArenaTileNotOwnedError, arenaOpId } from "../src/kits/arena/api/board/index";

function fakeDeps(boost: ArenaShopBuyDeps["boostTile"]) {
  const calls: unknown[][] = [];
  const deps: ArenaShopBuyDeps = {
    boostTile: async (...args) => { calls.push(args); return boost(...args); },
    arenaOpId,
    withUser: async (_uid, fn) => fn({ fence: 42 }),
    currentZoneId: () => 3,
  };
  return { deps, calls };
}

test("arenaShop：成功路径——sId 来自 currentZoneId、fence 来自 withUser、opId = arenaOpId(boost)、cost = ARENA_SHOP_BOOST_COST", async () => {
  const { deps, calls } = fakeDeps(async (_uid, _sId, _fence, tile) => ({ tile, power: 6, balance: 90 }));
  const result = await buyArenaBoost("u1", 3, "c1", deps);
  assert.deepEqual(result, { tile: 3, power: 6, balance: 90 });
  assert.deepEqual(calls, [["u1", 3, 42, 3, ARENA_SHOP_BOOST_COST, arenaOpId("u1", 3, "boost", "c1")]]);
  assert.equal(ARENA_SHOP_BOOST_COST, 10);
});

test("arenaShop：不是自己的格 → RpcFault ARENA_SHOP_TILE_NOT_OWNED（kit 错误在插件层翻译）", async () => {
  const { deps } = fakeDeps(async (_uid, _sId, _fence, tile) => { throw new ArenaTileNotOwnedError(tile, "u2"); });
  await assert.rejects(buyArenaBoost("u1", 5, "c1", deps), (error: unknown) =>
    error instanceof RpcFault && error.rpcCode === "ARENA_SHOP_TILE_NOT_OWNED");
});

test("arenaShop：账本 DUP（balance=null）原样透传且过响应 validator；其他错误原样上抛", async () => {
  const dup = fakeDeps(async (_uid, _sId, _fence, tile) => ({ tile, power: 6, balance: null }));
  const result = await buyArenaBoost("u1", 3, "c1", dup.deps);
  assert.deepEqual(result, { tile: 3, power: 6, balance: null });
  assert.deepEqual(validateArenaShopBuyBoostRes(result), result, "响应契约接受 balance=null");
  assert.throws(() => validateArenaShopBuyBoostRes({ tile: 3, power: 6, balance: -1 }), "负余额仍拒绝");
  assert.throws(() => validateArenaShopBuyBoostRes({ tile: 3, power: 6 }), "缺 balance 键仍拒绝");
  const failing = fakeDeps(async () => { throw new Error("INSUFFICIENT"); });
  await assert.rejects(buyArenaBoost("u1", 3, "c1", failing.deps), /INSUFFICIENT/u);
});

test("arenaShop：服务端用例只 import kit 的 board 面与框架 uow / 区 / 错误，⛔ 不 import 经济模块或 kit 内部模块", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, "../src/core/arenaShop/buy.ts"), "utf8");
  const specifiers = [...source.matchAll(/from "([^"]+)"/gu)].map((m) => m[1]);
  assert.deepEqual(specifiers.sort(), [
    "../../kits/arena/api/board/index",
    "../errors",
    "../infra/keys",
    "../uow",
    "@game/shared/protocol/lobbyRpc/domains/arenaShop",
  ]);
});
