/**
 * 发放状态查询（只读，无锁）：granting → 客户端继续轮询，⛔ 不要「超时即失败」（04）。
 */
import { z } from "zod";
import { ShopRpc } from "@game/shared";
import { readBack } from "../../core/economy/outbox";
import { defineRpc } from "../rpc";

export default defineRpc(ShopRpc.QueryOp, {
  schema: z.object({ opId: z.string().min(1).max(64) }),
  handler: async (ctx, p) => readBack(ctx.uid, p.opId),
});
