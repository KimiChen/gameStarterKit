/**
 * 账号身份/令牌原语（accounts）—— WebPlatform 权威（DUAL_MODE §2.7）。MySQL-only，⛔ 无 Redis。
 *
 * ⚠ 跨包边界：本 lib 不能 import apps/server 的错误类，故 `verifyToken` **返回结果码**（reason），
 * 由 apps/server 侧映射成 AuthRequiredError/BannedError/EpochStaleError（也正是 2c HTTP 边界要的形态）。
 * token 是不透明 `{uid}.{hex}`，库只存 sha256（⛔ 非 JWT）。
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SESS_TTL_S, TOKEN_BYTES } from "../config";
import { getPool } from "./mysql";
import type { ResultSetHeader, RowDataPacket } from "./mysql";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const safeEqualHex = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

/** uid 是否真账号（F4 sId=0 判据）。 */
export async function accountExists(uid: string): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT 1 FROM accounts WHERE user_id = ? LIMIT 1", [uid]);
  return rows.length > 0;
}

/**
 * 签发 token：生成不透明 `{uid}.{hex}`，写权威记录到 accounts（换发 token_hash 即旧失效；
 * token_issued_epoch 快照 epoch；session_key 传 null 保留旧值，G8）。返回 token 明文。
 * ⚠ 无 accounts 行时 UPDATE 命中 0 行（合成会话/测试）——无害，调用方走 Redis 快路径。
 */
export async function issueToken(uid: string, tokenEpoch: number, sessionKey: string | null): Promise<string> {
  const token = `${uid}.${randomBytes(TOKEN_BYTES).toString("hex")}`;
  await getPool().execute<ResultSetHeader>(
    `UPDATE accounts SET token_hash = ?, token_issued_at = NOW(3), token_issued_epoch = ?,
        session_key = COALESCE(?, session_key) WHERE user_id = ?`,
    [sha256(token), tokenEpoch, sessionKey, uid]);
  return token;
}

/** 校验结果码（不抛业务错误，跨包边界由调用方映射）。 */
export type VerifyResult =
  | { ok: true; epoch: number; status: number }
  | { ok: false; reason: "not_found" | "mismatch" | "banned" | "deregistered" | "stale" | "expired" };

/** 权威校验（纯 MySQL 一条 PK）：hash → status → epoch → 过期。 */
export async function verifyToken(uid: string, token: string): Promise<VerifyResult> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT token_hash, token_issued_epoch, token_epoch, status,
            TIMESTAMPDIFF(SECOND, token_issued_at, NOW(3)) AS age_s
       FROM accounts WHERE user_id = ?`, [uid]);
  if (rows.length === 0) { return { ok: false, reason: "not_found" }; }
  const a = rows[0];
  if (a.token_hash === null || !safeEqualHex(String(a.token_hash), sha256(token))) { return { ok: false, reason: "mismatch" }; }
  if (Number(a.status) === 1) { return { ok: false, reason: "banned" }; }
  if (Number(a.status) !== 0) { return { ok: false, reason: "deregistered" }; }
  if (Number(a.token_issued_epoch) < Number(a.token_epoch)) { return { ok: false, reason: "stale" }; } // 踢人/复活后旧 token
  if (a.age_s === null || Number(a.age_s) > SESS_TTL_S) { return { ok: false, reason: "expired" }; }
  return { ok: true, epoch: Number(a.token_epoch), status: Number(a.status) };
}

/**
 * 撤销 in-tx（DUAL_MODE §2.3，M12d）：UPDATE accounts（epoch+1 + token_hash=NULL[+status]）与
 * INSERT revocation_log **同事务** → 换「可证明零漏发」（撤销的持久真相 + 广播记录原子）。
 * 返回递增后的 token_epoch（**0 = 无此账号**，未撤销）。⛔ 本 lib 不 XADD（跨包无 Redis）——
 * 发行由业务侧 relayer 扫 revocation_log 进控制总线。
 */
async function revokeInTx(uid: string, ban: boolean): Promise<number> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.execute<ResultSetHeader>(
      ban
        ? "UPDATE accounts SET status = 1, token_epoch = token_epoch + 1, token_hash = NULL WHERE user_id = ?"
        : "UPDATE accounts SET token_epoch = token_epoch + 1, token_hash = NULL WHERE user_id = ?",
      [uid]);
    if (r.affectedRows === 0) { await conn.commit(); return 0; } // 无此账号：不写日志、不广播
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT token_epoch FROM accounts WHERE user_id = ?", [uid]);
    const epoch = Number(rows[0].token_epoch);
    await conn.execute<ResultSetHeader>(
      "INSERT INTO revocation_log (user_id, epoch) VALUES (?, ?)", [uid, epoch]);
    await conn.commit();
    return epoch;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** 封号：status=1 + epoch+1 + token_hash=NULL + revocation_log（同事务，G7）。返回新 epoch（0=无此账号）。 */
export async function banAccount(uid: string): Promise<number> { return revokeInTx(uid, true); }

/** 踢人/换端：epoch+1 + token_hash=NULL + revocation_log（status 不变）。返回新 epoch（0=无此账号）。 */
export async function revokeAccount(uid: string): Promise<number> { return revokeInTx(uid, false); }

/** 同步写登录审计（revoke/ban/login/fail 等高危事件不能尽力而为）。 */
export async function auditLogin(
  event: string, uid: string | null, reason: string | null, ip: string | null, deviceId: string | null,
): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO login_audit (user_id, event, reason, ip, device_id) VALUES (?,?,?,INET6_ATON(?),?)",
    [uid, event, reason, ip, deviceId]);
}
