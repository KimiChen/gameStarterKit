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
 * 「踢在线」由业务侧广播 kick 承担（⛔ 无自动收敛：漏踢即活到 sess TTL，送达保证走 GM `/admin/kick`，09·G7b）。
 * 返回**账号是否存在**（false = 无此 uid，调用方不必踢/广播）。
 *
 * ⚠ **⛔ 绝不用 `affectedRows` 表达"账号存在"**：它的语义随连接 flags 翻转 ——
 * 游戏服池显式 `-FOUND_ROWS`（changed 语义）⇒ **重复封同一账号第二次返回 false**；
 * WebPlatform 独立进程用 mysql2 默认（**带 FOUND_ROWS** = matched 语义）⇒ 返回 true。
 * 于是同一份 lib 的返回值**随部署模式变化**，而 GM 规格把 false 解释成"账号不存在→跳过踢人"
 * ⇒ **失败后的幂等重试会永远跳过踢人**（正是 SOP 要防的）。故显式查存在性，与 flags 解耦。
 */
export async function banAccount(uid: string): Promise<boolean> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET status = 1, token_hash = NULL WHERE user_id = ?", [uid]);
  return accountExists(uid); // ⚠ ⛔ 不用 affectedRows，见下方说明
}

/** 踢人/换端：`token_hash=NULL`（status 不变，账号仍可重新登录换发新 token）。返回是否命中账号。 */
export async function revokeAccount(uid: string): Promise<boolean> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET token_hash = NULL WHERE user_id = ?", [uid]);
  return accountExists(uid); // ⚠ 同上
}

/**
 * 同步写登录审计（revoke/ban/login/fail 等高危事件不能尽力而为）。
 *
 * ⚠ `reason` 写入前钳到列宽：`STRICT_TRANS_TABLES` 下超长是**抛 ER_DATA_TOO_LONG(1406) 而非截断**，
 * 会把整行审计弄丢、并让调用方误判成操作失败。与组侧 `core/auth/session.ts` 的 `clampReason` 同一份语义
 * （两边各一份实现：lib 跨包不能 import 组网关代码）。
 */
// ⚠ 宽度取**最小兼容值**而非本仓 schema.sql 的值：本服务在 split 下连的是**独立账号库**，
// 而那个库尚无自己的 bootstrap（待办）⇒ 很可能仍是加宽前的 VARCHAR(64)，钳到 255 对它毫无保护。
// ⛔ 账号库 migration 被强制执行之前，不要把这里跟着 schema.sql 放宽（组侧 session.ts 同款注释）。
const AUDIT_REASON_MAX = 64;
const AUDIT_DEVICE_MAX = 64;  // ⚠ device_id 来自**客户端输入**，本服务端点无运行期校验时全靠它兜
const AUDIT_EVENT_MAX = 24;

function clamp(s: string | null, max: number): string | null {
  if (s === null || s.length <= max) { return s; }
  const cut = s.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut; // ⛔ 不切断代理对
}

export async function auditLogin(
  event: string, uid: string | null, reason: string | null, ip: string | null, deviceId: string | null,
): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO login_audit (user_id, event, reason, ip, device_id) VALUES (?,?,?,INET6_ATON(?),?)",
    [uid, clamp(event, AUDIT_EVENT_MAX), clamp(reason, AUDIT_REASON_MAX), ip, clamp(deviceId, AUDIT_DEVICE_MAX)]);
}
