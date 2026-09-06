/**
 * 竞技场商店用例（plugins/arenaShop）：花 ARENA_SHOP_BOOST_COST 金币给自己的一格加守备。
 * 插件只消费 arena kit 的 `board` api 面（boostTile / arenaOpId / ArenaTileNotOwnedError）——⛔ 不 import kit
 * 内部模块、不碰 k_arena_* 表、不自建账本、不 import 框架经济模块：扣款只发生在 kit-api 的 `tx.debit`（同 opId
 * 账本幂等），余额只来自那次扣款的返回值（账本 DUP 重放时为 null，原样透传——插件 ⛔ 不越过 kit 面去读 user_currency）。
 * 写路径形态与 shop.purchase 相同：`currentZoneId()` 取区、`withUser(uid)` 拿 fence（用户锁 + 冷档自愈），
 * kit 事务在锁内执行。域错误：kit 的 ArenaTileNotOwnedError → ARENA_SHOP_TILE_NOT_OWNED（本域 errorCodes）；
 * 扣款失败由框架抛 INSUFFICIENT_BALANCE / STALE_FENCE（分别归 shop 域 / core 所有，本域不重复声明）。
 * `deps` 只给单测注入（假 kit 面 / 假 withUser），生产缺省即真实实现。
 */
import { ARENA_SHOP_BOOST_COST, type IArenaShopBuyBoostRes } from "@game/shared/protocol/lobbyRpc/domains/arenaShop";
import { currentZoneId } from "../infra/keys";
import { RpcFault } from "../errors";
import { withUser } from "../uow";
import { ArenaTileNotOwnedError, arenaOpId, boostTile } from "../../kits/arena/api/board/index";

export interface ArenaShopBuyDeps {
  readonly boostTile: typeof boostTile;
  readonly arenaOpId: typeof arenaOpId;
  readonly withUser: <T>(uid: string, fn: (uow: { readonly fence: number }) => Promise<T>) => Promise<T>;
  readonly currentZoneId: () => number;
}

const DEFAULT_DEPS: ArenaShopBuyDeps = { boostTile, arenaOpId, withUser, currentZoneId };

export async function buyArenaBoost(
  uid: string, tile: number, clientReqId: string, deps: ArenaShopBuyDeps = DEFAULT_DEPS,
): Promise<IArenaShopBuyBoostRes> {
  const sId = deps.currentZoneId();
  const opId = deps.arenaOpId(uid, sId, "boost", clientReqId);
  return deps.withUser(uid, async (uow) => {
    try {
      const result = await deps.boostTile(uid, sId, uow.fence, tile, ARENA_SHOP_BOOST_COST, opId);
      return { tile: result.tile, power: result.power, balance: result.balance };
    } catch (error) {
      if (error instanceof ArenaTileNotOwnedError) throw new RpcFault("ARENA_SHOP_TILE_NOT_OWNED", `格 ${tile} 不是你的，先去竞技场占领`);
      throw error;
    }
  });
}
