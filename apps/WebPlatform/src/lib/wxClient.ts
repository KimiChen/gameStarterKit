/**
 * 微信 code2session（WebPlatform lib）：超时 + 熔断 + 错误码。⚠ 跨包边界**返回结果码**（reason），
 * 不抛业务错误。session_key 仅服务端持有（G8）——lib.login 写 accounts.session_key，⛔ 不下发。
 */
import { wxConfig, WX_BREAKER_OPEN_MS, WX_BREAKER_THRESHOLD, WX_TIMEOUT_MS } from "../config";

export type WxResult =
  | { ok: true; openid: string; unionid: string | null; sessionKey: string }
  | { ok: false; reason: "wx_invalid" | "wx_rate_limited" | "wx_unavailable" };

// 进程级熔断（微信侧故障快速失败，不把线程挂在超时上）。
let consecutiveFailures = 0;
let openUntil = 0;
const breakerOpen = (): boolean => Date.now() < openUntil;
const recordFailure = (): void => {
  consecutiveFailures++;
  if (consecutiveFailures >= WX_BREAKER_THRESHOLD) { openUntil = Date.now() + WX_BREAKER_OPEN_MS; consecutiveFailures = 0; }
};
const recordSuccess = (): void => { consecutiveFailures = 0; };

/** 测试用：复位熔断器。 */
export function _resetBreaker(): void { consecutiveFailures = 0; openUntil = 0; }

/** jscode2session。40029/40226→wx_invalid；45011→wx_rate_limited；-1/超时/缺字段→wx_unavailable（熔断计数）。 */
export async function code2session(jsCode: string): Promise<WxResult> {
  if (breakerOpen()) { return { ok: false, reason: "wx_unavailable" }; }
  const { appid, secret, code2sessionUrl } = wxConfig();
  const url = `${code2sessionUrl}?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(jsCode)}&grant_type=authorization_code`;
  let body: { openid?: string; unionid?: string; session_key?: string; errcode?: number };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(WX_TIMEOUT_MS) });
    body = await res.json() as typeof body;
  } catch { recordFailure(); return { ok: false, reason: "wx_unavailable" }; }
  if (body.errcode) {
    if (body.errcode === -1) { recordFailure(); return { ok: false, reason: "wx_unavailable" }; }
    recordSuccess(); // 业务错误码说明微信侧是通的
    if (body.errcode === 45011) { return { ok: false, reason: "wx_rate_limited" }; }
    return { ok: false, reason: "wx_invalid" };
  }
  if (!body.openid || !body.session_key) { recordFailure(); return { ok: false, reason: "wx_unavailable" }; }
  recordSuccess();
  // ⚠ `unionid` 必须走 `|| null` 而 ⛔ 不是 `?? null`：`??` 只收敛 undefined/null，**空串会原样透传**，
  // 而下游把「unionid 非 null」当成"这是一个可用于找回账号的身份"（login.ts 按 unionid 回读）。
  // 一旦某次 code2session 返回 `unionid: ""`：第一个人建号写入 `unionid=''`，之后**任何** openid
  // 未命中的玩家都会 `WHERE unionid = ''` 命中那一行 ⇒ 以别人的 user_id 登录 + 把原主人顶下线，
  // 且 `isNew=false` 让它看起来像"老号正常回归"，⛔ 无任何告警。上面 openid 本就有空值守卫（`!body.openid`），
  // 这里的不对称正是漏的那半。
  return { ok: true, openid: body.openid, unionid: body.unionid || null, sessionKey: body.session_key };
}
