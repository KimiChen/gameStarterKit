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
  | { ok: true; uid: string; token: string; isNew: boolean }
  | { ok: false; reason: "banned" | "rate_limited" | "wx_invalid" | "wx_rate_limited" | "wx_unavailable" };

// 进程内登录限流令牌桶（per WebPlatform 实例；规模化靠前置 LB 按 IP，§2.7）。按真实 IP，⛔ 不共享桶连坐（G5）。
const buckets = new Map<string, { tokens: number; last: number }>();
/**
 * 桶表清扫阈值。⚠ 没有清扫时这张表**只增不减**：本服务监听 0.0.0.0、当前无鉴权（待办 W1），
 * 直连者每次换一个 IP 就能永久占一格内存。**已满的桶不含任何信息**（与从未见过的 IP 等价），
 * 故删掉它是语义无损的 —— 这也是清扫条件只看"是否已回满"的原因。
 */
const RL_SWEEP_AT = 10_000;
function sweepFullBuckets(now: number): void {
  for (const [ip, b] of buckets) {
    if (b.tokens + ((now - b.last) / 1000) * LOGIN_RATE_REFILL_PER_S >= LOGIN_RATE_CAPACITY) { buckets.delete(ip); }
  }
}
function rateAllow(ip: string): boolean {
  const now = Date.now();
  if (buckets.size >= RL_SWEEP_AT) { sweepFullBuckets(now); }
  let b = buckets.get(ip);
  if (!b) { b = { tokens: LOGIN_RATE_CAPACITY, last: now }; buckets.set(ip, b); }
  b.tokens = Math.min(LOGIN_RATE_CAPACITY, b.tokens + ((now - b.last) / 1000) * LOGIN_RATE_REFILL_PER_S);
  b.last = now;
  if (b.tokens < 1) { return false; }
  b.tokens -= 1;
  return true;
}

interface AccountRow extends RowDataPacket { user_id: string; status: number }

/**
 * 建号：seq 发 user_id（同连接纪律在 nextSeq，09·DB2）→ accounts 行。⛔ 不建游戏档。
 *
 * 返回 `created` 标明**本次是否真的新建**：1062 恢复回读到的是**已存在的号**（并发赢家 / 同人换 openid），
 * 调用方据此定 `isNew` —— ⛔ 恒 true 会让首登奖励/首充判据对老号反复触发。
 */
async function createAccount(openid: string, unionid: string | null): Promise<{ row: AccountRow; created: boolean }> {
  const uid = `u_${await nextSeq("user_id")}`;
  try {
    await getPool().execute<ResultSetHeader>(
      "INSERT INTO accounts (user_id, openid, unionid) VALUES (?,?,?)", [uid, openid, unionid]);
  } catch (e) {
    if ((e as { errno?: number }).errno === 1062) {
      // 撞唯一键 → 回读复用（发出去的 seq 号作废安全，只需单调）。
      // ⚠ accounts 有**两个**唯一键，两个都要兜，只兜 openid 会让另一个键的冲突落到下方 throw ⇒ 500：
      //   `uk_openid`  —— 并发建号对方赢了（常态路径）；
      //   `uk_unionid` —— 本人已有行但 openid 不同（appid/主体变更、存量导入、微信侧异常）。
      //     unionid 在同一开放平台主体下标识**同一个人**，复用该行即正确的账号连续性。
      //     ⛔ 不顺手改写该行 openid：静默重写身份列的风险高于多走一次本恢复路径。
      // 顺序：openid 更精确故先查；两键皆未命中说明撞的不是这两个键 ⇒ 原样抛，不吞。
      const [byOpenid] = await getPool().query<AccountRow[]>(
        "SELECT user_id, status FROM accounts WHERE openid = ?", [openid]);
      if (byOpenid.length > 0) { return { row: byOpenid[0], created: false }; }
      if (unionid !== null) {
        const [byUnionid] = await getPool().query<AccountRow[]>(
          "SELECT user_id, status FROM accounts WHERE unionid = ?", [unionid]);
        if (byUnionid.length > 0) { return { row: byUnionid[0], created: false }; }
      }
    }
    throw e;
  }
  return { row: { user_id: uid, status: 0 } as AccountRow, created: true };
}

/** 按 openid 登录（dev 直连 / wx 经 code2session 后的公共段）。签发前必查 status（G7）。 */
export async function loginByOpenid(
  openid: string, unionid: string | null, sessionKey: string | null,
  ip: string, deviceId: string | null, auditKind: string,
): Promise<LoginResult> {
  const [rows] = await getPool().query<AccountRow[]>(
    "SELECT user_id, status FROM accounts WHERE openid = ?", [openid]);
  let account = rows[0];
  let isNew = false;
  // ⚠ **openid 没查到 ≠ 新号**：同一开放平台主体下 `unionid` 标识**同一个人**，openid 变更
  // （appid/主体变更、存量导入、微信侧异常）时该账号仍在。此前只在 INSERT 撞 1062 的**异常路径**里
  // 才按 unionid 回读，而 `isNew` 早在那之前就按 openid 算好了 ⇒ 老号每次登录都：烧一个 seq 号、
  // 发一条注定失败的 INSERT、回读旧账号，并**恒返回 isNew:true**（首登奖励/首充判据会反复触发）。
  // 提到正常路径来查即同时解决三者；1062 恢复保留为**并发**兜底（见 createAccount）。
  if (account === undefined && unionid !== null) {
    const [byUnionid] = await getPool().query<AccountRow[]>(
      "SELECT user_id, status FROM accounts WHERE unionid = ?", [unionid]);
    account = byUnionid[0];
  }
  if (account === undefined) {
    const created = await createAccount(openid, unionid);
    account = created.row;
    isNew = created.created; // ⛔ 不能恒 true：并发下 1062 恢复回读到的是**别人刚建的同一个号**
  }
  if (Number(account.status) !== 0) {
    await auditLogin("fail", account.user_id, "banned", ip, deviceId);
    return { ok: false, reason: "banned" };
  }
  const token = await issueToken(account.user_id, sessionKey);
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET last_login_at = NOW(3) WHERE user_id = ?", [account.user_id]);
  await auditLogin(auditKind, account.user_id, null, ip, deviceId);
  return { ok: true, uid: account.user_id, token, isNew };
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
