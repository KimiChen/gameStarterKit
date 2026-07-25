/**
 * 组网关侧登录入口 —— **薄委托**（M12c / DUAL_MODE §2.7）。
 *
 * 登录 orchestration（限流 → code2session → 查/建账号 → 签发 token）已下沉 WebPlatform lib
 * （`@game/webplatform/lib`，MySQL 权威、⛔ 无 Redis、返回**结果码**）。本文件只做两件网关侧的事：
 *   ① lib 结果码 reason → 网关错误类映射（07 边界）；
 *   ② 成功后写组侧 sess:{uid} 缓存（in-process 登录同进程即写；split 拆进程后由 onAuth 懒填）。
 *
 * 出参⛔禁含 openid / unionid / session_key（09·G8）。
 * 注：Arthur 的「存量账号绑定」（旧 deviceId → openid 回填）本项目无存量账号，未移植。
 */
import { devLogin as libDevLogin, wxLogin as libWxLogin, type LoginResult as LibLoginResult } from "@game/webplatform/lib";
import { AuthRequiredError, BannedError, RateLimitedError, WxUnavailableError } from "../errors";
import { writeGroupSess } from "./session";

export interface WxLoginInput { code: string; ip: string; deviceId?: string }

/** 登录出参（shared ILoginRes 服务端侧）：⛔ 禁含 openid/unionid/session_key（09·G8）。 */
export interface LoginResult { userId: string; token: string; isNew: boolean }

type LoginFailReason = Extract<LibLoginResult, { ok: false }>["reason"];

/** lib 结果码 reason → 网关错误类（HTTP/RPC 边界映射，07）。wx_unavailable → INTERNAL(500)。 */
function loginFail(reason: LoginFailReason): never {
  switch (reason) {
    case "banned": throw new BannedError();
    case "rate_limited": throw new RateLimitedError("登录过于频繁");
    case "wx_rate_limited": throw new RateLimitedError("wx api rate limited");
    case "wx_invalid": throw new AuthRequiredError("wx code invalid");
    case "wx_unavailable": throw new WxUnavailableError("wx unavailable");
    default: { const _exhaustive: never = reason; throw new Error(`未处理的登录失败码: ${String(_exhaustive)}`); }
  }
}

/** 成功：token 已由 lib 签 MySQL 权威 → 写组侧 sess 缓存 → 返回精简出参。 */
async function finish(r: Extract<LibLoginResult, { ok: true }>): Promise<LoginResult> {
  await writeGroupSess(r.uid, r.token);
  return { userId: r.uid, token: r.token, isNew: r.isNew };
}

/** wx-login：委托 lib（限流→code2session→查/建号→签发）→ 映射/写组缓存。 */
export async function wxLogin(input: WxLoginInput): Promise<LoginResult> {
  const r = await libWxLogin({ code: input.code, ip: input.ip, deviceId: input.deviceId ?? null });
  return r.ok ? finish(r) : loginFail(r.reason);
}

/** dev-login：委托 lib（devKey→openid `dev_<devKey>`，其余同真实链路）→ 映射/写组缓存。 */
export async function devLogin(devKey: string, ip: string, deviceId: string | null): Promise<LoginResult> {
  const r = await libDevLogin(devKey, ip, deviceId);
  return r.ok ? finish(r) : loginFail(r.reason);
}
