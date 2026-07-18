/**
 * POST /pay/wx-notify —— 微信支付回调（10·M6）。⚠ 首版用共享密钥头校验（WXPAY_NOTIFY_SECRET），
 * 上线前必须换微信支付平台证书验签（APIv3）。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import type { RpcErrCode } from "@game/shared";

export default createEndpoint("/pay/wx-notify", {
  method: "POST",
  body: z.object({
    orderId: z.string().min(1).max(64),
    wxTxnId: z.string().min(1).max(64),
    amountFen: z.number().int().positive(),
  }),
}, async (ctx) => {
  const secret = process.env.WXPAY_NOTIFY_SECRET ?? "";
  if (!secret || ctx.headers?.get?.("x-notify-secret") !== secret) {
    throw ctx.error(401, { error: "AUTH_REQUIRED" satisfies RpcErrCode });
  }
  const { handleWxPayNotify } = await import("../../core/economy/purchases");
  const r = await handleWxPayNotify(ctx.body);
  if (r === "mismatch") { throw ctx.error(400, { error: "ORDER_MISMATCH" satisfies RpcErrCode }); }
  return { code: "SUCCESS" }; // ok / already 都 ack（微信要求幂等应答）
});
