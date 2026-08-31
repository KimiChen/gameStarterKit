/**
 * 购买（04 三阶段协议）。RPC 层幂等占位（IN_PROGRESS 挡并发双击）只是 UX 快闸；
 * 真正的 exactly-once 在数据层（ledger UNIQUE + applied op_id，09·I1 双层）——
 * 两层用同一个 clientReqId 派生（09·I2/I3）。
 *
 * 幂等审计（阶段 4，§6.12）：**idempotent-write + durable**——op_id（deriveOpId）+
 * ledger UNIQUE + applied payload 绑定为权威；通用 idem 结果缓存不可得时走
 * shop.queryOp 领域收据查询恢复（readBack）。
 */
import { ShopRpc } from "@game/shared";
import { InvalidPayloadError } from "../../core/errors";
import { getShopSku } from "../../core/economy/catalog";
import { purchase } from "../../core/economy/outbox";
import { defineRpc } from "../rpc";

export default defineRpc(ShopRpc.Purchase, {
  handler: async (ctx, p) => {
    const sku = getShopSku(p.sku);
    if (!sku) { throw new InvalidPayloadError(`未知 SKU: ${p.sku}`); }
    return purchase(ctx.uid, sku, p.clientReqId);
  },
});
