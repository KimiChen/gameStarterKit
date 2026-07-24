/**
 * 登录编排（WebPlatform lib，DUAL_MODE §2.7）：限流(进程内) → code2session(wx) → 查/建 accounts(签发前查 status，G7)
 * → issueToken → last_login + 审计。**返回结果码**（跨包边界，业务侧/端点映射错误类）。
 * ⛔ 无 Redis、⛔ 不建游戏档（createUser 挪 onJoin 的 ensureCharacter）、⛔ 无跨存储补偿（已解耦）。
 */
import { LOGIN_RATE_CAPACITY, LOGIN_RATE_REFILL_PER_S } from "../config";
import { getPool, nextSeq } from "./mysql";
import type { ResultSetHeader, RowDataPacket } from "./mysql";
import { auditLogin, issueToken } from "./auth";
import { code2session } from "./wxClient";

export type LoginResult =
  | { ok: true; uid: string; token: string; epoch: number; isNew: boolean }
  | { ok: false; reason: "banned" | "rate_limited" | "wx_invalid" | "wx_rate_limited" | "wx_unavailable" };

// 进程内登录限流令牌桶（per WebPlatform 实例；规模化靠前置 LB 按 IP，§2.7）。按真实 IP，⛔ 不共享桶连坐（G5）。
const buckets = new Map<string, { tokens: number; last: number }>();
function rateAllow(ip: string): boolean {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) { b = { tokens: LOGIN_RATE_CAPACITY, last: now }; buckets.set(ip, b); }
  b.tokens = Math.min(LOGIN_RATE_CAPACITY, b.tokens + ((now - b.last) / 1000) * LOGIN_RATE_REFILL_PER_S);
  b.last = now;
  if (b.tokens < 1) { return false; }
  b.tokens -= 1;
  return true;
}

interface AccountRow extends RowDataPacket { user_id: string; status: number; token_epoch: number }

/** 建号：seq 发 user_id（同连接纪律在 nextSeq，09·DB2）→ accounts 行。⛔ 不建游戏档。 */
async function createAccount(openid: string, unionid: string | null): Promise<AccountRow> {
  const uid = `u_${await nextSeq("user_id")}`;
  try {
    await getPool().execute<ResultSetHeader>(
      "INSERT INTO accounts (user_id, openid, unionid) VALUES (?,?,?)", [uid, openid, unionid]);
  } catch (e) {
    if ((e as { errno?: number }).errno === 1062) {
      // 并发建号撞 UNIQUE(openid)：对方赢了，回读复用（发出去的 seq 号作废安全，只需单调）
      const [rows] = await getPool().query<AccountRow[]>(
        "SELECT user_id, status, token_epoch FROM accounts WHERE openid = ?", [openid]);
      if (rows.length > 0) { return rows[0]; }
    }
    throw e;
  }
  return { user_id: uid, status: 0, token_epoch: 0 } as AccountRow;
}

/** 按 openid 登录（dev 直连 / wx 经 code2session 后的公共段）。签发前必查 status（G7）。 */
export async function loginByOpenid(
  openid: string, unionid: string | null, sessionKey: string | null,
  ip: string, deviceId: string | null, auditKind: string,
): Promise<LoginResult> {
  const [rows] = await getPool().query<AccountRow[]>(
    "SELECT user_id, status, token_epoch FROM accounts WHERE openid = ?", [openid]);
  const isNew = rows.length === 0;
  const account = isNew ? await createAccount(openid, unionid) : rows[0];
  if (Number(account.status) !== 0) {
    await auditLogin("fail", account.user_id, "banned", ip, deviceId);
    return { ok: false, reason: "banned" };
  }
  const token = await issueToken(account.user_id, Number(account.token_epoch), sessionKey);
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET last_login_at = NOW(3) WHERE user_id = ?", [account.user_id]);
  await auditLogin(auditKind, account.user_id, null, ip, deviceId);
  return { ok: true, uid: account.user_id, token, epoch: Number(account.token_epoch), isNew };
}

export interface WxLoginInput { code: string; ip: string; deviceId?: string | null }

/** wx-login：限流 → code2session → loginByOpenid。⚠ 限流在 code2session **之前**（否则刷子先烧微信配额，G5）。 */
export async function wxLogin(input: WxLoginInput): Promise<LoginResult> {
  if (!rateAllow(input.ip)) { return { ok: false, reason: "rate_limited" }; }
  const wx = await code2session(input.code);
  if (!wx.ok) {
    await auditLogin("fail", null, `code2session:${wx.reason}`, input.ip, input.deviceId ?? null);
    return { ok: false, reason: wx.reason };
  }
  return loginByOpenid(wx.openid, wx.unionid, wx.sessionKey, input.ip, input.deviceId ?? null, "wx_login");
}

/** dev-login：限流 → devKey 映射 openid（`dev_<devKey>`）→ loginByOpenid。 */
export async function devLogin(devKey: string, ip: string, deviceId: string | null): Promise<LoginResult> {
  if (!rateAllow(ip)) { return { ok: false, reason: "rate_limited" }; }
  return loginByOpenid(`dev_${devKey}`, null, null, ip, deviceId, "dev_login");
}
