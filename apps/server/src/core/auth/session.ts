/**
 * 会话签发 / 校验 / 撤销（[02·P1](docs/SERVER.md) / 07；M12c 2b-1：token 记录改 MySQL 权威）。
 *
 * - token 是**不透明随机串**（randomBytes），服务端只存 sha256——⛔ 不是 JWT（被否掉的方案）。
 * - **权威 token 记录在 MySQL `accounts`**（token_hash / token_issued_at / session_key）：
 *   `verifySessionStrict` 纯 MySQL 一条 PK 表达（WebPlatform MySQL-only 也能验，DUAL_MODE §2.7）。
 * - 撤销的真相位只有两个：`token_hash`（NULL=已撤销/换发）与 `status`（1=封禁）——⛔ 无 epoch fence（M12d 简化）。
 * - Redis `sess:{uid}` 退为**组侧缓存**：快路径 tokenHash + freeze-guard 存在性 + connId/gwNode。
 *   in-process 登录写；split 拆进程后由 onAuth 从 verify 结果懒填。
 * - **封号 = 账号级「下次登不上」+ 踢在线**（M12d §2.3，两步**都必做**）：
 *   ① 写权威（一条 UPDATE：status=1 + token_hash=NULL）→ 新建连接/重新登录即拒；
 *   ② **踢在线**——GM 工具直连各节点 `/admin/kick` 并确认送达（⛔ 缺此步，被封用户在场连接可存活至
 *      sess TTL 3d，**无自动收敛**：快路径不回权威）。控制总线 `stream:kick` 是程序化封号的便捷扇出，
 *      但**不构成保证**（fire-and-forget）。发钱另由结算 recheck 兜（U6）。
 *   ⛔ 不删 sess（TTL 自然过期），⛔ 绝不删 user:{uid}（09·G7）。
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { SESS_TTL_S } from "../infra/config";
import { kSess } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { getPool } from "../infra/mysql";
import type { ResultSetHeader } from "../infra/mysql";
import { AuthRequiredError, BannedError } from "../errors";
import { touchActive } from "../userRecord";
// 权威 token 逻辑（MySQL-only）在 WebPlatform lib；本文件只做组侧 Redis 缓存 + 结果码→错误类映射。
import { issueToken, verifyToken, banAccount, revokeAccount } from "@game/webplatform/lib";
// 控制总线（DUAL_MODE §2.3 / M12d）：踢在线（本节点即时 + 跨组广播）。权威撤销已落 MySQL，踢是 best-effort。
import { broadcastKick, kickLocal } from "./revoke";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const safeEqualHex = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export interface IssuedSession { userId: string; token: string }

/**
 * 签发会话：生成不透明 token，sess:{uid} 一次性 HSET 全字段 + TTL（最后写者胜，
 * 并发登录不会留下「双方互撤为零」的状态）。sessionKey 仅服务端持有（09·G8）。
 *
 * token 形如 `{uid}.{random hex}`：uid 前缀让网关**从 token 反查 userId**（09·G1，
 * ⛔ 不信客户端单独传的 userId），随机段不可预测、库里只存整串 sha256——仍是不透明 token
 * （uid 本就是客户端已知的公开标识，前缀不构成「载荷」，⛔ 不是 JWT）。
 */
export async function issueSession(uid: string, sessionKey: string | null, gwNode = ""): Promise<IssuedSession> {
  // 权威 token 记录（MySQL accounts）由 WebPlatform lib 生成并写入，返回不透明 token。
  const token = await issueToken(uid, sessionKey);
  await writeGroupSess(uid, token, gwNode);
  return { userId: uid, token };
}

/**
 * 写组侧 sess:{uid} 缓存（token 已由 WebPlatform lib 签发）：一次性 HSET 全字段 + TTL
 * （最后写者胜，并发登录不会留下「双方互撤为零」的状态）。
 * ⚠ session_key 权威在 accounts（MySQL），组缓存**不再存**（09·G8：无人从组缓存读它）。
 * 登录薄委托（wxLogin）拿到 lib 已签发的 token 后调此写组缓存；split 拆进程后由 onAuth 从 verify 结果懒填。
 */
export async function writeGroupSess(uid: string, token: string, gwNode = ""): Promise<void> {
  const key = kSess(uid);
  await clientFor(uid).multi()
    .del(key) // 原子换发：旧会话字段不残留
    .hset(key, {
      tokenHash: sha256(token),
      loginTs: String(Date.now()),
      connId: "",
      gwNode,
    })
    .expire(key, SESS_TTL_S)
    .exec();
  await touchActive(uid);
}

/**
 * 快路径校验（每 RPC）：**纯组缓存 hash 比对**，⛔ 零权威回源（per-message 不打账号服务）。
 *
 * ⚠ 它**不感知**权威侧的封号——在线撤销由「踢」承担（GM 工具直连各节点 `/admin/kick` 确认送达，
 * 见 DUAL_MODE §2.3 封号 SOP）。⛔ 缺踢这一步，被封用户的在场连接可存活至 sess TTL（3d），**无自动收敛**。
 * 换端顶号无需此路径感知：新登录 `writeGroupSess` 覆写 sess，旧 token 下一条即 hash 不符。
 * 权威校验见 verifySessionStrict（建连点 onAuth 走它）。
 */
export async function verifySession(uid: string, token: string): Promise<void> {
  const tokenHash = await clientFor(uid).hget(kSess(uid), "tokenHash");
  if (tokenHash === null) { throw new AuthRequiredError("session 不存在或已过期"); }
  if (!safeEqualHex(tokenHash, sha256(token))) { throw new AuthRequiredError("token 不匹配"); }
}

/**
 * 严格校验（建立连接时）：回源 MySQL 权威（token_hash 匹配 + status + 过期）。
 * 拦截 Redis failover 后从旧副本「复活」的被撤销会话（02·P1）——权威 hash 已 NULL/换发即拒。
 */
export async function verifySessionStrict(uid: string, token: string): Promise<void> {
  // 权威校验走 WebPlatform lib（MySQL-only，返回结果码）；组侧只做「结果码→错误类映射」。
  const r = await verifyToken(uid, token);
  if (r.ok) { return; }
  if (r.reason === "banned") { throw new BannedError(); } // 封号 → ACCOUNT_BANNED（07）
  if (r.reason === "deregistered") { throw new AuthRequiredError("账号已注销"); }
  throw new AuthRequiredError(`token 校验失败(${r.reason})`); // not_found / mismatch / expired
}

/** 网关入口：token 反查 uid（09·G1）+ 校验。strict 用于建立连接，快路径用于每 RPC。 */
export async function verifyBearer(token: string, strict = false): Promise<string> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) { throw new AuthRequiredError("token 格式无效"); }
  const uid = token.slice(0, dot);
  if (strict) { await verifySessionStrict(uid, token); } else { await verifySession(uid, token); }
  return uid;
}

/** 同步写审计（revoke/ban 等高危事件不能是尽力而为，05）。 */
export async function auditLogin(event: string, uid: string | null, reason: string | null, ip: string | null, deviceId: string | null): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO login_audit (user_id, event, reason, ip, device_id) VALUES (?,?,?,INET6_ATON(?),?)",
    [uid, event, reason, ip, deviceId]);
}

/**
 * 封号（账号级，所有区）：lib 一条 UPDATE 写权威（status=1 + token_hash=NULL = **下次登不上**）
 * → 踢在线（本节点即时 + 广播其它节点），逼其重走登录流程被 status 拦。
 * ⛔ 不删 sess（在线失效靠踢：本节点即时 + 总线扇出 + GM `/admin/kick` 确认）；⛔ 绝不删 user:{uid}（09·G7）。
 */
export async function banUser(uid: string, reason: string): Promise<void> {
  const hit = await banAccount(uid); // 权威：status=1 + token_hash=NULL（下次登不上）
  if (hit) {
    kickLocal(uid);            // 本节点在线即时踢
    await broadcastKick(uid);  // 其它组/节点自筛踢（best-effort）
  }
  await auditLogin("ban", uid, reason, null, null);
}

/** 踢人/强制下线：权威 token_hash=NULL（status 不变，可重新登录换发）→ 踢在线。⛔ 不删 sess（TTL 自然过期）。 */
export async function revokeSessions(uid: string, reason: string): Promise<void> {
  const hit = await revokeAccount(uid);
  if (hit) {
    kickLocal(uid);
    await broadcastKick(uid);
  }
  await auditLogin("revoke", uid, reason, null, null);
}
