/**
 * 账号身份/令牌原语（accounts）—— WebPlatform 权威（DUAL_MODE §2.7）。MySQL-only，⛔ 无 Redis。
 *
 * ⚠ 跨包边界：本 lib 不能 import apps/server 的错误类，故 `verifyToken` **返回结果码**（reason），
 * 由 apps/server 侧映射成 AuthRequiredError/BannedError（也正是 2c HTTP 边界要的形态）。
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
 * 签发 token：生成不透明 `{uid}.{hex}`，写权威记录到 accounts（**换发 token_hash 即旧失效**——
 * 撤销与换端全靠它；session_key 传 null 保留旧值，G8）。返回 token 明文。
 * ⚠ 无 accounts 行时 UPDATE 命中 0 行（合成会话/测试）——无害，调用方走 Redis 快路径。
 */
export async function issueToken(uid: string, sessionKey: string | null): Promise<string> {
  const token = `${uid}.${randomBytes(TOKEN_BYTES).toString("hex")}`;
  await getPool().execute<ResultSetHeader>(
    `UPDATE accounts SET token_hash = ?, token_issued_at = NOW(3),
        session_key = COALESCE(?, session_key) WHERE user_id = ?`,
    [sha256(token), sessionKey, uid]);
  return token;
}

/** 校验结果码（不抛业务错误，跨包边界由调用方映射）。 */
export type VerifyResult =
  | { ok: true; status: number }
  | { ok: false; reason: "not_found" | "mismatch" | "banned" | "deregistered" | "expired" };

/**
 * 权威校验（纯 MySQL 一条 PK）：hash → status → 过期。
 * 撤销的两个真相位就是 `token_hash`（NULL=已撤销/换发）与 `status`（1=封禁）——⛔ 无 epoch fence（M12d 简化）。
 */
export async function verifyToken(uid: string, token: string): Promise<VerifyResult> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT token_hash, status, TIMESTAMPDIFF(SECOND, token_issued_at, NOW(3)) AS age_s
       FROM accounts WHERE user_id = ?`, [uid]);
  if (rows.length === 0) { return { ok: false, reason: "not_found" }; }
  const a = rows[0];
  if (a.token_hash === null || !safeEqualHex(String(a.token_hash), sha256(token))) { return { ok: false, reason: "mismatch" }; }
  if (Number(a.status) === 1) { return { ok: false, reason: "banned" }; }
  if (Number(a.status) !== 0) { return { ok: false, reason: "deregistered" }; }
  if (a.age_s === null || Number(a.age_s) > SESS_TTL_S) { return { ok: false, reason: "expired" }; }
  return { ok: true, status: Number(a.status) };
}

/**
 * 封号（M12d 简化模型，09·G7）：**一条 UPDATE** —— `status=1` + `token_hash=NULL`。
 * 语义 = 「下次登不上」（login 签发前查 status；verify 见 hash=NULL/status=1 即拒）；
 * 「踢在线」由业务侧广播 kick 承担（best-effort，漏了有快路径 verifiedAt 兜底）。
 * 返回是否命中账号（false = 无此 uid，调用方不必广播）。
 */
export async function banAccount(uid: string): Promise<boolean> {
  const [r] = await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET status = 1, token_hash = NULL WHERE user_id = ?", [uid]);
  return r.affectedRows > 0;
}

/** 踢人/换端：`token_hash=NULL`（status 不变，账号仍可重新登录换发新 token）。返回是否命中账号。 */
export async function revokeAccount(uid: string): Promise<boolean> {
  const [r] = await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET token_hash = NULL WHERE user_id = ?", [uid]);
  return r.affectedRows > 0;
}

/** 同步写登录审计（revoke/ban/login/fail 等高危事件不能尽力而为）。 */
export async function auditLogin(
  event: string, uid: string | null, reason: string | null, ip: string | null, deviceId: string | null,
): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO login_audit (user_id, event, reason, ip, device_id) VALUES (?,?,?,INET6_ATON(?),?)",
    [uid, event, reason, ip, deviceId]);
}
