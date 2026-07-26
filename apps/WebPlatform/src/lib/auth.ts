/**
 * 账号身份/令牌原语（accounts）—— WebPlatform 权威（DUAL_MODE §2.7）。MySQL-only，⛔ 无 Redis。
 *
 * ⚠ 跨包边界：本 lib 不能 import apps/server 的错误类，故 `verifyToken` **返回结果码**（reason），
 * 由 apps/server 侧映射成 AuthRequiredError/BannedError（也正是 2c HTTP 边界要的形态）。
 * token 是不透明 `{uid}.{hex}`，库只存 sha256（⛔ 非 JWT）。
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
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
/**
 * 签发 token。返回 `issuedAtMs` = 本次签发时刻（**权威侧单调量**，组缓存的写入栅栏靠它，A1）。
 *
 * ⚠ **`GREATEST(...)` 不是花哨写法，是栅栏的正确性前提**：`token_issued_at` 是 `DATETIME(3)`（毫秒），
 * 直接写 `NOW(3)` 时**同一毫秒内的两次签发会打平**，而打平就意味着 `writeGroupSess` 的
 * 「只接受更大的」无法判定先后 ⇒ 迟到的旧写可能覆盖新写（正是 A1 要堵的那件事）。
 * 这里改成「取 `NOW(3)` 与『上一次 + 1ms』的较大者」⇒ **同一 user_id 上严格递增**，⛔ 不会打平。
 * ⚠ 代价（可接受且自愈）：连续高频签发时该列会短暂**跑到真实时间之前**，每次至多 1ms；
 * 因 `GREATEST` 带着 `NOW(3)`，一旦签发变慢立即回落到真实时间。登录限流（容量 5 / 补 0.2 每秒）
 * 决定了单账号不可能持续每秒 1000 次签发 ⇒ 漂移量在毫秒级。
 * 该列同时用于过期判定（`age_s`），漂移方向是"看起来更年轻"，量级远小于 SESS_TTL_S。
 */
export async function issueToken(
  uid: string, sessionKey: string | null,
): Promise<{ token: string; issuedAtMs: number }> {
  const token = `${uid}.${randomBytes(TOKEN_BYTES).toString("hex")}`;
  await getPool().execute<ResultSetHeader>(
    `UPDATE accounts
        SET token_hash = ?,
            token_issued_at = GREATEST(NOW(3),
              COALESCE(token_issued_at, '1970-01-02 00:00:00.000') + INTERVAL 1000 MICROSECOND),
            session_key = COALESCE(?, session_key)
      WHERE user_id = ?`,
    [sha256(token), sessionKey, uid]);
  // 回读权威值：⛔ 不能用 Date.now() 代替——栅栏两侧必须来自**同一个时钟**（MySQL），
  // 否则应用进程间的时钟偏移会让比较失去意义。
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ROUND(UNIX_TIMESTAMP(token_issued_at) * 1000) AS issued_ms
       FROM accounts WHERE user_id = ?`, [uid]);
  return { token, issuedAtMs: Number(rows[0]?.issued_ms ?? 0) };
}

/** 校验结果码（不抛业务错误，跨包边界由调用方映射）。
 *  ⚠ `issuedAtMs`：权威侧签发时刻，组缓存写入栅栏的判据（A1）——⛔ 别在传递链上把它丢了。 */
export type VerifyResult =
  | { ok: true; status: number; issuedAtMs: number }
  | { ok: false; reason: "not_found" | "mismatch" | "banned" | "deregistered" | "expired" };

/**
 * 权威校验（纯 MySQL 一条 PK）：hash → status → 过期。
 * 撤销的两个真相位就是 `token_hash`（NULL=已撤销/换发）与 `status`（1=封禁）——⛔ 无 epoch fence（M12d 简化）。
 */
export async function verifyToken(uid: string, token: string): Promise<VerifyResult> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT token_hash, status, TIMESTAMPDIFF(SECOND, token_issued_at, NOW(3)) AS age_s,
            ROUND(UNIX_TIMESTAMP(token_issued_at) * 1000) AS issued_ms
       FROM accounts WHERE user_id = ?`, [uid]);
  if (rows.length === 0) { return { ok: false, reason: "not_found" }; }
  const a = rows[0];
  if (a.token_hash === null || !safeEqualHex(String(a.token_hash), sha256(token))) { return { ok: false, reason: "mismatch" }; }
  if (Number(a.status) === 1) { return { ok: false, reason: "banned" }; }
  if (Number(a.status) !== 0) { return { ok: false, reason: "deregistered" }; }
  if (a.age_s === null || Number(a.age_s) > SESS_TTL_S) { return { ok: false, reason: "expired" }; }
  // ⚠ 带回 issuedAtMs：调用方（split 的 onAuth 懒填）要拿它当组缓存写入栅栏（A1）
  return { ok: true, status: Number(a.status), issuedAtMs: Number(a.issued_ms ?? 0) };
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

// ⚠ 截断只保证**不产生孤代理**（半个 emoji）。被切掉的那半个字符在 Node → MySQL 的
// utf8 编码里会变成 U+FFFD 替换字符，⛔ MySQL **不会**因此拒收整行（曾有注释断言"照样拒"，
// 实测不成立）。也就是说钳制的失败形态是**静默的内容损坏**，不是报错——真要保内容完整，
// 得从产地限长，⛔ 别指望这里报警。
function clamp(s: string | null, max: number): string | null {
  if (s === null || s.length <= max) { return s; }
  const cut = s.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut; // ⛔ 不切断代理对
}

/**
 * XFF 段 / 对端地址 → `INET6_ATON()` 收得下的 IP 字面量；收不下返回 **null**（列可空，审计行照落）。
 *
 * ⚠ 这不是洁癖：`ip` 与 `deviceId` **同源**（都来自客户端可写的 `X-Forwarded-For`），而
 * `INSERT … INET6_ATON(?)` 在 `STRICT_TRANS_TABLES` 下遇非法串是**抛 ER_WRONG_VALUE_FOR_TYPE(1411)、
 * 不是写 NULL**。抛点在 `issueToken` **之后**（login.ts）⇒ 权威 `token_hash` 已轮换成一个**没人持有**的值、
 * 客户端拿 500 没有 token、审计一行都没有（连 `login_diverged` 都不会有，因为它也走这条 INSERT）——
 * 比 deviceId 那条更彻底的登录分叉，而 `X-Forwarded-For: unknown` 就能打。
 * ⚠ 带端口的 XFF（`1.2.3.4:5678` / `[::1]:5678`）是**部署级必现**形态（部分 LB/网关如此 append）⇒
 * 全服登录 100% 500，故不是简单判非法，而是**先剥端口再判**。
 * ⚠ 与组侧 `core/auth/session.ts` 的同名函数是两份实现：lib 跨包不能 import 组网关代码（同 `clamp`）。
 */
export function normalizeIp(v: string | null | undefined): string | null {
  if (v === undefined || v === null) { return null; }
  const s = v.trim();
  // ⚠ **zone index 必须先排掉**：`net.isIP("fe80::1%en0")` 返回 6（Node 认），但
  // `INET6_ATON('fe80::1%en0')` **抛 1411**（MySQL 不认）——两者判据不一致，只信 isIP 会漏。
  // ⛔ 不是理论情形：Node 给出的链路本地 IPv6 对端地址就带 `%<iface>`。
  if (s.includes("%")) { return null; }
  // ⚠ 判据是 `net.isIP`，它比 INET6_ATON **略严**：前导零形式（`010.1.1.1`）MySQL 收得下而它拒。
  // 这是**刻意**的——八进制/十进制歧义是经典解析差异漏洞面，宁可这一列为 NULL。⛔ 别"放宽对齐"。
  if (isIP(s) !== 0) { return s; }
  const v6 = /^\[(.+)\]:\d{1,5}$/.exec(s);          // [::1]:5678
  if (v6 && isIP(v6[1]) !== 0) { return v6[1]; }
  const v4 = /^([^:]+):\d{1,5}$/.exec(s);           // 1.2.3.4:5678（裸 IPv6 含 ':' 不会命中）
  if (v4 && isIP(v4[1]) !== 0) { return v4[1]; }
  return null;
}

export async function auditLogin(
  event: string, uid: string | null, reason: string | null, ip: string | null, deviceId: string | null,
): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO login_audit (user_id, event, reason, ip, device_id) VALUES (?,?,?,INET6_ATON(?),?)",
    [uid, clamp(event, AUDIT_EVENT_MAX), clamp(reason, AUDIT_REASON_MAX), normalizeIp(ip), clamp(deviceId, AUDIT_DEVICE_MAX)]);
}
