/**
 * HTTPS wx-login 编排（10·M3）：
 * 限流（独立严格档）→ code2session → 查/建账号（签发前必查 status，09·G7）→
 * 签发不透明 token → sess:{uid} → active:lru → login_audit。
 *
 * 出参⛔禁含 openid / unionid / session_key（09·G8）。
 * 注：Arthur 项目此处还有「存量账号绑定协议」（旧 deviceId 体系 → openid 回填）；
 * 本 starter kit 是全新项目、无存量账号，该协议未移植（需要时参考 Arthur 的 wxLogin.bindLegacy）。
 */
import { LOGIN_RATE_CAPACITY, LOGIN_RATE_REFILL_PER_S } from "../infra/config";
import { kRl } from "../infra/keys";
import { clientForKey } from "../infra/redisRoute";
import { evalshaWithReload, TOKEN_BUCKET } from "../infra/redisScripts";
import { getPool, nextSeq } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { BannedError, RateLimitedError } from "../errors";
import { createUser } from "../userRecord";
import { ensureLive, invalidateUserNegcache } from "../archive/thaw";
import { code2session } from "./wxClient";
import { auditLogin, issueSession, type IssuedSession } from "./session";
import { STAMINA_MAX } from "@game/shared";

export interface WxLoginInput {
  code: string;
  ip: string;
  deviceId?: string;
}

interface AccountRow extends RowDataPacket { user_id: string; status: number; token_epoch: number }

/** 登录限流：独立严格档，按真实 IP（09·G5：⛔ 共享桶连坐）。wx 与 dev 两个入口共用。 */
export async function loginRateCheck(ip: string): Promise<void> {
  const key = kRl(`login:${ip}`);
  const r = await evalshaWithReload(clientForKey(key), TOKEN_BUCKET, [key],
    [LOGIN_RATE_CAPACITY, LOGIN_RATE_REFILL_PER_S, 1]);
  if (r === -1) { throw new RateLimitedError("登录过于频繁"); }
}

/** 建号：seq 发 user_id（同连接纪律在 nextSeq 内，09·DB2）→ accounts 行 → Redis 建档。 */
async function createAccount(openid: string, unionid: string | null): Promise<AccountRow> {
  const uid = `u_${await nextSeq("user_id")}`;
  try {
    await getPool().execute<ResultSetHeader>(
      "INSERT INTO accounts (user_id, openid, unionid) VALUES (?,?,?)", [uid, openid, unionid]);
  } catch (e) {
    if ((e as { errno?: number }).errno === 1062) {
      // 并发建号撞 UNIQUE(openid)：对方赢了，回读复用（发出去的 seq 号作废是安全的，只需单调）
      const [rows] = await getPool().query<AccountRow[]>(
        "SELECT user_id, status, token_epoch FROM accounts WHERE openid = ?", [openid]);
      if (rows.length > 0) { return rows[0]; }
    }
    throw e;
  }
  // 建号是 user:{uid} 的合法创建点（09·R2）。新号初始字段对齐 emptySave 语义。
  // 音频偏好（musicOn/sfxOn）⛔ 不在建号初始化——读侧「缺失即默认开」（07 字段表），存量档零迁移
  try {
    await createUser(uid, {
      registerTime: String(Date.now()),
      stamina: String(STAMINA_MAX),
      lastStaminaRecoverAt: "0", // 满体力：恢复计时未开始（shared logic/stamina.ts）
      avatarId: "-1",
    });
  } catch (e) {
    // 跨存储补偿：accounts 已插入而 Redis 建档失败（Redis 抖动）时回收账号行——否则
    // 「号在档无」的残号会让该 openid 永久走「已存在」分支不再补建 user:{uid}，读档
    // 判 USER_DATA_LOST。createUser 幂等（'exists'），回收后下次登录重走完整建号安全。
    await getPool().execute("DELETE FROM accounts WHERE user_id = ?", [uid])
      .catch((d) => { console.error(`[wxLogin] ☠ 建号补偿失败，残号待人工清理 uid=${uid}`, d); });
    throw e;
  }
  await invalidateUserNegcache(uid).catch(() => {}); // 建号成功立即失效负缓存（09·F4）
  return { user_id: uid, status: 0, token_epoch: 0 } as AccountRow;
}

/** 登录出参（shared ILoginRes 的服务端侧）：⛔ 禁含 openid/unionid/session_key（09·G8）。 */
export interface LoginResult extends IssuedSession { isNew: boolean }

/**
 * 按 openid 登录编排（wx 与 dev 两个 provider 的公共段）：
 * 查/建账号（签发前必查 status，09·G7）→ 签发 token → last_login_at → 审计。
 * ⚠ 限流由调用方**前置**执行（loginRateCheck）：wx 路径必须在 code2session 之前扣桶
 * （否则刷子先烧微信配额再被拦），放本函数内会让 wx 路径双扣。
 */
export async function loginByOpenid(
  openid: string, unionid: string | null, sessionKey: string | null,
  ip: string, deviceId: string | null, auditKind: string,
): Promise<LoginResult> {
  const [rows] = await getPool().query<AccountRow[]>(
    "SELECT user_id, status, token_epoch FROM accounts WHERE openid = ?", [openid]);
  const isNew = rows.length === 0;
  const account: AccountRow = isNew ? await createAccount(openid, unionid) : rows[0];

  // 签发前必查 status（09·G7）：封号挡住重新登录
  if (Number(account.status) !== 0) {
    await auditLogin("fail", account.user_id, "banned", ip, deviceId);
    throw new BannedError();
  }

  // 回流用户解冻（08：访问冷 uid 必须先 ensureLive）：登录是回流的第一入口——
  // 不在这里解冻，用户会「登录成功但档案为空、写操作 THAWING」。热档用户此调用近零成本。
  if (!isNew) { await ensureLive(account.user_id); }

  const session = await issueSession(account.user_id, Number(account.token_epoch), sessionKey);
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET last_login_at = NOW(3) WHERE user_id = ?", [account.user_id]);
  await auditLogin(auditKind, account.user_id, null, ip, deviceId);
  return { ...session, isNew };
}

/**
 * wx-login 主入口：code2session → loginByOpenid。返回 userId + token + isNew（09·G8）。
 */
export async function wxLogin(input: WxLoginInput): Promise<LoginResult> {
  await loginRateCheck(input.ip);
  let wx;
  try {
    wx = await code2session(input.code);
  } catch (e) {
    await auditLogin("fail", null, `code2session:${(e as Error).name}`, input.ip, input.deviceId ?? null);
    throw e;
  }
  return loginByOpenid(wx.openid, wx.unionid, wx.sessionKey, input.ip, input.deviceId ?? null, "wx_login");
}
