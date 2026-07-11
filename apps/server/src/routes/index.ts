import { createEndpoint, createRouter } from "@colyseus/core";
import { z } from "zod";
import { wxLogin } from "../auth/wxLogin";
import { toErrCode } from "../core/errors";

/**
 * 类型化 HTTP 端点（Colyseus 0.17 createRouter，better-call）——服务端框架的**真实**接口。
 * `/api/*` 的 mock 接口仍在 mock/routes.ts（express 挂载），替换时逐个删掉 mock。
 *
 * ⚠ 本组端点依赖本地栈（Redis + MySQL，`npm --workspace @game/server run stack`）
 *   与微信凭证（WX_APPID / WX_SECRET 环境变量）；纯 mock 联调不受影响。
 */
export const routes = createRouter({
  version: createEndpoint("/version", { method: "GET" }, async (ctx) => {
    return ctx.json({ name: "game-server" });
  }),

  // wx-login（10·M3）：框架鉴权入口，签发不透明 token（{uid}.{hex}）。
  // 出参只有 { userId, token }，⛔ 禁含 openid/unionid/session_key（09·G8）
  wxLogin: createEndpoint("/account/wx-login", {
    method: "POST",
    body: z.object({
      code: z.string().min(1),
      deviceId: z.string().optional(),
    }),
  }, async (ctx) => {
    // 真实 IP 取 XFF **最右段**：可信 LB 把真实对端 append 到末尾，最左段是客户端可伪造的
    // （伪造最左段可每请求换 IP 绕过登录限流桶，09·G5）。部署要求网关前置恰一层可信 LB
    const xff = ctx.headers?.get?.("x-forwarded-for") ?? "";
    const ip = xff.split(",").map((s: string) => s.trim()).filter(Boolean).pop() ?? "0.0.0.0";
    try {
      return await wxLogin({ code: ctx.body.code, ip, deviceId: ctx.body.deviceId });
    } catch (e) {
      const code = toErrCode(e);
      const http = code === "ACCOUNT_BANNED" ? 403 : code === "RATE_LIMITED" ? 429
        : code === "AUTH_REQUIRED" || code === "AUTH_EPOCH_STALE" ? 401 : 500;
      throw ctx.error(http, { error: code });
    }
  }),

  // 微信支付回调（10·M6）。⚠ 首版用共享密钥头校验（WXPAY_NOTIFY_SECRET），
  // 上线前必须换微信支付平台证书验签（APIv3）
  wxPayNotify: createEndpoint("/pay/wx-notify", {
    method: "POST",
    body: z.object({
      orderId: z.string().min(1).max(64),
      wxTxnId: z.string().min(1).max(64),
      amountFen: z.number().int().positive(),
    }),
  }, async (ctx) => {
    const secret = process.env.WXPAY_NOTIFY_SECRET ?? "";
    if (!secret || ctx.headers?.get?.("x-notify-secret") !== secret) {
      throw ctx.error(401, { error: "AUTH_REQUIRED" });
    }
    const { handleWxPayNotify } = await import("../economy/purchases");
    const r = await handleWxPayNotify(ctx.body);
    if (r === "mismatch") { throw ctx.error(400, { error: "ORDER_MISMATCH" }); }
    return { code: "SUCCESS" }; // ok / already 都 ack（微信要求幂等应答）
  }),
});
