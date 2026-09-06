/**
 * arenaShop.buyBoost——竞技场商店的唯一写端点。幂等（clientReqId 重放）由 dispatcher 的 idem 层统一处理；
 * 同 opId 的扣款幂等由 kit-api 账本兜底。
 */
import { ArenaShopRpc } from "@game/shared/protocol/lobbyRpc/domains/arenaShop";
import { buyArenaBoost } from "../../core/arenaShop/buy";
import { defineRpc } from "../rpc";

export default defineRpc(ArenaShopRpc.BuyBoost, {
  handler: (ctx, p) => buyArenaBoost(ctx.uid, p.tile, p.clientReqId),
});
