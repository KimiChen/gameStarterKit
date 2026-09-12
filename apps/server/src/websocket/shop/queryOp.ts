/**
 * 发放状态查询（只读，无锁）：granting → 客户端继续轮询，⛔ 不要「超时即失败」（04）。
 */
import { ShopRpc } from "@game/shared";
import { currentZoneId } from "../../framework/infra/keys";
import { readBack } from "../../modules/economy/outbox";
import { defineRpc } from "../rpc";

export default defineRpc(ShopRpc.QueryOp, {
  // sId 取当前区上下文（zoneCtx；单形态/未包裹 = 0，DUAL_MODE §3.4）
  handler: async (ctx, p) => readBack(ctx.uid, currentZoneId(), p.opId),
});
