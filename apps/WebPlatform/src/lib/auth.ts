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

/** 封号：MySQL status=1 + epoch+1 + token_hash=NULL（撤销的持久真相，G7）。 */
export async function banAccount(uid: string): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET status = 1, token_epoch = token_epoch + 1, token_hash = NULL WHERE user_id = ?", [uid]);
}

/** 踢人/换端：MySQL epoch+1 + token_hash=NULL（status 不变）。 */
export async function revokeAccount(uid: string): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET token_epoch = token_epoch + 1, token_hash = NULL WHERE user_id = ?", [uid]);
}
