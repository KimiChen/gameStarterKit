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
import { devLogin as libDevLogin, verifyToken, wxLogin as libWxLogin, type LoginResult as LibLoginResult } from "@game/webplatform/lib";
import { AuthRequiredError, BannedError, BusyError, RateLimitedError, WxUnavailableError } from "../core/errors";
import { writeGroupSess } from "../core/auth/session";
import { withUserLock } from "../core/locks";
import { zoneCtx } from "../core/infra/keys";

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

/**
 * 成功收尾：**回权威确认本次签发仍有效**，再写组侧 sess 缓存。
 *
 * ⚠ **并发登录定序**（同 uid 两次登录几乎同时）：MySQL 行锁把两次 `issueToken` 串起来、
 * 最后落库者是权威赢家；但两次 `writeGroupSess` 各写各的，**晚落地的早登录会用陈旧 hash
 * 覆盖缓存** ⇒ 缓存与权威分叉：**输家凭缓存继续玩，赢家每条 RPC 401 且被顶号广播踢掉**
 * （判别位 `exceptHash` 恰好保护的是输家）。
 *
 * 修法 = 把「回权威 + 写缓存」放进**同一把 per-uid 锁**串行：
 * - 锁内 `verifyToken` 识别出输家 ⇒ ⛔ 不写缓存、⛔ 不广播踢，向客户端报**可重试**错误（BUSY）；
 *   客户端重登即成为新的赢家（正常顶号语义）。
 * - 无论如何交错，最后一个持锁者读到的都是已结算的 MySQL 状态 ⇒ 两存储终态一致。
 *
 * ⚠ 复用**唯一那把** per-uid 锁（09·L1 禁第二把）；它是 per-zone 键、而登录本就与区无关，
 * 故显式 `sId=0`（区服部署下与各区玩法锁不同键，互不阻塞）。
 * ⚠ split 不走本路径（登录在 WebPlatform、缓存由 onAuth 回权威后懒填），天然无此竞态。
 */
async function finish(r: Extract<LibLoginResult, { ok: true }>): Promise<LoginResult> {
  await zoneCtx.run({ sId: 0 }, () => withUserLock(r.uid, async () => {
    const v = await verifyToken(r.uid, r.token);
    if (!v.ok) {
      throw new BusyError(`并发登录：本次签发已被更晚的登录取代（${v.reason}），请重试`);
    }
    await writeGroupSess(r.uid, r.token);
  }));
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
