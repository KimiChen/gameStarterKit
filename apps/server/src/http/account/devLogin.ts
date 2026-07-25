/**
 * POST /account/dev-login —— 本地/CI 登录入口（wx.login 接入前的严谨替身）。
 *
 * 只绕过 code2session 一跳：devKey 映射 openid（`dev_<devKey>`），其余**全走真实链路**
 * （限流 → 建号 accounts → 不透明 token → 写组 sess:{uid}（见 tokenHash 变化即顶号踢旧连接，09·G7c）→ 审计）。
 * 受 AUTH_DEV_ENABLED 控制（默认开发开、生产关；生产显式开启 = config 加载期拒绝启动）。
 * 出参与 wx-login 同契约（shared ILoginRes：userId/token/isNew，09·G8 禁含 openid）。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import { ACCOUNT_MODE, AUTH_DEV_ENABLED } from "../../core/infra/config";
import { toErrCode } from "../../core/errors";
import { devLogin } from "../../platform/inProcessLogin";

export default createEndpoint("/account/dev-login", {
  method: "POST",
  body: z.object({
    // devKey → openid 前缀映射：同 key 恒同账号（换号 = 换 key）
    devKey: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/),
    deviceId: z.string().max(64).optional(),
  }),
}, async (ctx) => {
  // ⛔ split（ACCOUNT_MODE=http）下本端点必须关：登录在 WebPlatform（客户端 portalRequest 直连）。
  // 此处若放行，inProcessLogin 会用**组库**建号/签发 token（WebPlatform 根本不认）——与"直调 lib 打错库"
  // 同一类隐患，故 fail-closed（docs/WEBPLATFORM.md §2）。
  if (ACCOUNT_MODE() === "http") { throw ctx.error(404, { error: "NOT_FOUND" }); }
  if (!AUTH_DEV_ENABLED) { throw ctx.error(404, { error: "NOT_FOUND" }); }
  const xff = ctx.headers?.get?.("x-forwarded-for") ?? "";
  const ip = xff.split(",").map((s: string) => s.trim()).filter(Boolean).pop() ?? "0.0.0.0";
  try {
    return await devLogin(ctx.body.devKey, ip, ctx.body.deviceId ?? null);
  } catch (e) {
    const code = toErrCode(e);
    // BUSY = 同 uid 并发登录抢锁失败/本次签发被更晚登录取代 → 409 可重试（⛔ 不是 500）
    const http = code === "ACCOUNT_BANNED" ? 403 : code === "RATE_LIMITED" ? 429
      : code === "BUSY" ? 409 : 500;
    throw ctx.error(http, { error: code });
  }
});
