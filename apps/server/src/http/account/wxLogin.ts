/**
 * POST /account/wx-login（10·M3）：框架鉴权入口，签发不透明 token（{uid}.{hex}）。
 * 出参只有 { userId, token }，⛔ 禁含 openid/unionid/session_key（09·G8）。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import { toErrCode } from "../../core/errors";
import { wxLogin } from "../../core/auth/wxLogin";

export default createEndpoint("/account/wx-login", {
  method: "POST",
  body: z.object({
    code: z.string().min(1).max(128),
    // login_audit.device_id 是 VARCHAR(64)：超长审计插入会 1406，会话已签发却报 500
    deviceId: z.string().max(64).optional(),
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
});
