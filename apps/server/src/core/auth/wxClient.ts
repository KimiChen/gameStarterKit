/**
 * 微信 code2session 客户端：超时 + 熔断 + 错误码映射（10·M3）。
 *
 * 出参含 session_key —— **仅服务端持有，绝不下发**（09·G8）；调用方只允许把它写进
 * sess:{uid}（服务端侧），任何 RPC 出参禁止携带 openid / unionid / session_key。
 */
import { wxConfig, WX_BREAKER_OPEN_MS, WX_BREAKER_THRESHOLD, WX_TIMEOUT_MS } from "../infra/config";
import { AuthRequiredError, RateLimitedError } from "../errors";

export interface WxSession {
  openid: string;
  unionid: string | null;
  sessionKey: string;
}

// ── 熔断器（进程级；微信侧故障时快速失败，避免把网关线程都挂在 3s 超时上） ──
let consecutiveFailures = 0;
let openUntil = 0;

const breakerOpen = (): boolean => Date.now() < openUntil;
const breakerRecordFailure = (): void => {
  consecutiveFailures++;
  if (consecutiveFailures >= WX_BREAKER_THRESHOLD) {
    openUntil = Date.now() + WX_BREAKER_OPEN_MS;
    consecutiveFailures = 0; // 半开后重新计数
  }
};
const breakerRecordSuccess = (): void => { consecutiveFailures = 0; };

/** 微信侧不可用（超时/熔断/系统繁忙）——客户端退避重试，不算凭证错误。 */
export class WxUnavailableError extends Error {
  constructor(msg: string) { super(msg); this.name = "WxUnavailableError"; }
}

/**
 * jscode2session。错误码映射（微信文档）：
 * 40029 code 无效 → AuthRequiredError（客户端重新 wx.login）
 * 40226 高风险用户 → AuthRequiredError
 * 45011 API 频控 → RateLimitedError
 * -1 系统繁忙 / 超时 / 网络错 → WxUnavailableError（熔断计数）
 */
export async function code2session(jsCode: string): Promise<WxSession> {
  if (breakerOpen()) { throw new WxUnavailableError("wx breaker open"); }
  const { appid, secret, code2sessionUrl } = wxConfig();
  const url = `${code2sessionUrl}?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(jsCode)}&grant_type=authorization_code`;

  let body: { openid?: string; unionid?: string; session_key?: string; errcode?: number; errmsg?: string };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(WX_TIMEOUT_MS) });
    body = await res.json() as typeof body;
  } catch (e) {
    breakerRecordFailure();
    throw new WxUnavailableError(`code2session 请求失败: ${String(e)}`);
  }

  if (body.errcode) {
    if (body.errcode === -1) { breakerRecordFailure(); throw new WxUnavailableError("wx system busy"); }
    breakerRecordSuccess(); // 业务错误码说明微信侧是通的
    if (body.errcode === 45011) { throw new RateLimitedError("wx api rate limited"); }
    throw new AuthRequiredError(`wx code invalid (errcode=${body.errcode})`);
  }
  if (!body.openid || !body.session_key) {
    breakerRecordFailure();
    throw new WxUnavailableError("code2session 响应缺字段");
  }
  breakerRecordSuccess();
  return { openid: body.openid, unionid: body.unionid ?? null, sessionKey: body.session_key };
}

/** 测试用：复位熔断器状态。 */
export function _resetBreaker(): void { consecutiveFailures = 0; openUntil = 0; }
