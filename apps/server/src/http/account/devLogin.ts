/**
 * POST /account/dev-login —— 本地/CI 登录入口（wx.login 接入前的严谨替身）。
 *
 * 只绕过 code2session 一跳：devKey 映射 openid（`dev_<devKey>`），其余**全走真实链路**
 * （限流 → 建号 accounts+MySQL → 不透明 token → sess:{uid} → tokenEpoch 踢线 → 审计）。
 * 受 AUTH_DEV_ENABLED 控制（默认开发开、生产关；生产显式开启 = config 加载期拒绝启动）。
 * 出参与 wx-login 同契约（shared ILoginRes：userId/token/isNew，09·G8 禁含 openid）。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import { AUTH_DEV_ENABLED } from "../../core/infra/config";
import { toErrCode } from "../../core/errors";
import { loginByOpenid, loginRateCheck } from "../../core/auth/wxLogin";

export default createEndpoint("/account/dev-login", {
  method: "POST",
  body: z.object({
    // devKey → openid 前缀映射：同 key 恒同账号（换号 = 换 key）
    devKey: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/),
    deviceId: z.string().max(64).optional(),
  }),
}, async (ctx) => {
  if (!AUTH_DEV_ENABLED) { throw ctx.error(404, { error: "NOT_FOUND" }); }
  const xff = ctx.headers?.get?.("x-forwarded-for") ?? "";
  const ip = xff.split(",").map((s: string) => s.trim()).filter(Boolean).pop() ?? "0.0.0.0";
  try {
    await loginRateCheck(ip);
    return await loginByOpenid(`dev_${ctx.body.devKey}`, null, null, ip, ctx.body.deviceId ?? null, "dev_login");
  } catch (e) {
    const code = toErrCode(e);
    const http = code === "ACCOUNT_BANNED" ? 403 : code === "RATE_LIMITED" ? 429 : 500;
    throw ctx.error(http, { error: code });
  }
});
