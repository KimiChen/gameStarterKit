/**
 * POST /account/wx-login（10·M3）：框架鉴权入口，签发不透明 token（{uid}.{hex}）。
 * 出参只有 { userId, token }，⛔ 禁含 openid/unionid/session_key（09·G8）。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import { ACCOUNT_MODE } from "../../core/infra/config";
import { toErrCode } from "../../core/errors";
import { normalizeIp } from "../../core/auth/session";
import { wxLogin } from "../../platform/inProcessLogin";

export default createEndpoint("/account/wx-login", {
  method: "POST",
  body: z.object({
    code: z.string().min(1).max(128),
    // login_audit.device_id 是 VARCHAR(64)：超长审计插入会 1406，会话已签发却报 500
    // ⚠ `nullish` 而非 `optional`：`optional()` 只收 undefined，显式 `deviceId: null` 会 400。
    // split 侧（WebPlatform index.ts 的 pickDeviceId）把 null 当缺省放行 ⇒ 同一请求体两模式一 400 一 200，
    // 正是本仓反复踩的「两种部署模式入参语义不同」。统一取**宽**的一侧：null 与缺省同义
    // （shared `ILoginReq.deviceId?: string` 本就是可选；且非 JS 端的序列化器普遍把空值写成 null）。
    deviceId: z.string().max(64).nullish(),
  }),
}, async (ctx) => {
  // ⛔ split（ACCOUNT_MODE=http）下本端点必须关：登录在 WebPlatform（客户端 portalRequest 直连）。
  // 此处若放行，inProcessLogin 会用**组库**建号/签发 token（WebPlatform 根本不认）——与"直调 lib 打错库"
  // 同一类隐患，故 fail-closed（docs/WEBPLATFORM.md §2）。
  if (ACCOUNT_MODE() === "http") { throw ctx.error(404, { error: "NOT_FOUND" }); }
  // 真实 IP 取 XFF **最右段**：可信 LB 把真实对端 append 到末尾，最左段是客户端可伪造的
  // （伪造最左段可每请求换 IP 绕过登录限流桶，09·G5）。部署要求网关前置恰一层可信 LB
  // ⚠ ip 有两个下游、需求不同：**限流桶键**只要逐客户端稳定互异，**审计**才要求合法 IP
  // （`INET6_ATON(?)` 遇非法串在 strict 下**抛 1411**，且抛点在 token 已轮换之后 ⇒ 幽灵 token
  // + 零审计；合法性由 core/auth/session.ts 写入侧那道 normalizeIp 兜）。故此处只做**提高桶键
  // 质量**的归一：能归一就用归一值（剥掉端口，否则每条连接的临时端口都换一个桶 = 限流失效）；
  // 归一不了但段存在就用**原始段**（⛔ 别退 "0.0.0.0"：那会把所有畸形 XFF 塞进同一个桶，
  // 反倒制造 09·G5 禁的连坐）；压根没有段才退 "0.0.0.0"（拿不到对端，见 HANDOFF §8.5）。
  const xff = ctx.headers?.get?.("x-forwarded-for") ?? "";
  const rightmost = xff.split(",").map((s: string) => s.trim()).filter(Boolean).pop();
  const ip = normalizeIp(rightmost) ?? rightmost ?? "0.0.0.0";
  try {
    return await wxLogin({ code: ctx.body.code, ip, deviceId: ctx.body.deviceId ?? undefined });
  } catch (e) {
    const code = toErrCode(e);
    // ⛔ 无 AUTH_EPOCH_STALE 分支：M12d 砍 epoch fence 后服务端不再产出该码（errors.ts 已无映射）
    const http = code === "ACCOUNT_BANNED" ? 403 : code === "RATE_LIMITED" ? 429
      : code === "AUTH_REQUIRED" ? 401
      // BUSY = 同 uid 并发登录抢锁失败/本次签发被更晚登录取代 → 409 可重试（⛔ 不是 500）
      : code === "BUSY" ? 409 : 500;
    throw ctx.error(http, { error: code });
  }
});
