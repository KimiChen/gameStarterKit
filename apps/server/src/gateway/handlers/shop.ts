/**
 * 商店 handlers（10·M6）：purchase 走 04 三阶段协议；queryOp 供「发放中」轮询。
 *
 * RPC 层幂等占位（IN_PROGRESS 挡并发双击）只是 UX 快闸；真正的 exactly-once 在数据层
 * （ledger UNIQUE + applied op_id，09·I1 双层）——两层用同一个 clientReqId 派生（09·I2/I3）。
 */
import { z } from "zod";
import { InvalidPayloadError } from "../../core/errors";
import { getShopSku } from "../../economy/catalog";
import { purchase, readBack } from "../../economy/outbox";
import { registerRoute } from "../dispatcher";

export function registerShopRoutes(): void {
  registerRoute("shop.purchase", {
    schema: z.object({
      clientReqId: z.string().min(1).max(64),
      sku: z.string().min(1).max(64),
    }),
    idem: true,
    handler: async (ctx, p) => {
      const sku = getShopSku(p.sku);
      if (!sku) { throw new InvalidPayloadError(`未知 SKU: ${p.sku}`); }
      return purchase(ctx.uid, sku, p.clientReqId);
    },
  });

  // 状态查询（只读，无锁）：granting → 客户端继续轮询，⛔ 不要「超时即失败」（04）
  registerRoute("shop.queryOp", {
    schema: z.object({ opId: z.string().min(1).max(64) }),
    handler: async (ctx, p) => readBack(ctx.uid, p.opId),
  });
}
