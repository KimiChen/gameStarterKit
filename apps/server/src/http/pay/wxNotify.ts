/**
 * POST /pay/wx-notify —— 微信支付回调（10·M6）。⚠ 首版用共享密钥头校验（WXPAY_NOTIFY_SECRET），
 * 上线前必须换微信支付平台证书验签（APIv3）。
 *
 * ⚠ **`PAY_ENABLED` 缺省关 ⇒ 501**：支付链当前不可上线（无下单端点、非 APIv3 验签、无对账，
 * 见 docs/EXTRAS.md §3.4）。此前唯一的闸是"未配 secret 即 401"——但 401 **不区分**「没鉴权」与
 * 「功能压根没上线」，排障时会往错误方向查。501 放在密钥闸**之前**：能被未鉴权者探到"支付没开"
 * 是无害信息，而把"没上线"说清楚是这个开关的全部目的。
 */
import { type RpcErrCode } from "@game/shared";
import { PAY_ENABLED } from "../../core/infra/config";
import { safeSecretEqual } from "../../core/auth/session";
import { createGameEndpoint } from "../contract";

export default createGameEndpoint("PayWxNotify", {
  method: "POST",
}, async (ctx) => {
  if (!PAY_ENABLED()) { throw ctx.error(501, { error: "NOT_IMPLEMENTED" }); }
  const secret = process.env.WXPAY_NOTIFY_SECRET ?? "";
  if (!safeSecretEqual(ctx.headers?.get?.("x-notify-secret"), secret)) { // 恒时；未配 secret 即拒（fail-closed）
    throw ctx.error(401, { error: "AUTH_REQUIRED" satisfies RpcErrCode });
  }
  const { handleWxPayNotify } = await import("../../core/economy/purchases");
  const r = await handleWxPayNotify(ctx.body);
  if (r === "mismatch") { throw ctx.error(400, { error: "ORDER_MISMATCH" satisfies RpcErrCode }); }
  return { code: "SUCCESS" }; // ok / already 都 ack（微信要求幂等应答）
});
