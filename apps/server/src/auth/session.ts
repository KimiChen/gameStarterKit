/**
 * 会话签发 / 校验 / 撤销（[02·P1](../../../../docs/server/02-failure-patterns.md) / 07）。
 *
 * - token 是**不透明随机串**（randomBytes），服务端只存 sha256——⛔ 不是 JWT（被否掉的方案）。
 * - `token_epoch` 三处一致（09·L2 第三种 fence，仅封号/踢人递增）：MySQL accounts（权威）、
 *   sess:{uid}.tokenEpoch、签发时的 token 记录（= sess 本身，token 无载荷）。
 * - 封号/踢人 = **先写 MySQL** token_epoch+1，再删 sess:{uid}；⛔ 绝不删 user:{uid}（09·G7）。
 * - 多端策略待 M0 拍板；当前实现单会话最后写者胜（新登录轮换 token = 互踢），
 *   sess 结构保持 hash，改多端只动本文件。
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SESS_TTL_S, TOKEN_BYTES } from "../infra/config";
import { kSess } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { getPool } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { AuthRequiredError, BannedError, EpochStaleError } from "../core/errors";
import { touchActive } from "../gameplay/userStore";

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
export async function issueSession(uid: string, tokenEpoch: number, sessionKey: string | null, gwNode = ""): Promise<IssuedSession> {
  const token = `${uid}.${randomBytes(TOKEN_BYTES).toString("hex")}`;
  const redis = clientFor(uid);
  const key = kSess(uid);
  await redis.multi()
    .del(key) // 原子换发：旧会话字段不残留
    .hset(key, {
      tokenHash: sha256(token),
      tokenEpoch: String(tokenEpoch),
      loginTs: String(Date.now()),
      connId: "",
      gwNode,
      ...(sessionKey !== null ? { sessionKey } : {}),
    })
    .expire(key, SESS_TTL_S)
    .exec();
  await touchActive(uid);
  return { userId: uid, token };
}

/**
 * 快路径校验（每 RPC）：只查 sess:{uid}。封号/踢人会删 sess，所以此路径足以让
 * 存量 token **立即**失效；epoch 双保险见 verifySessionStrict。
 */
export async function verifySession(uid: string, token: string): Promise<void> {
  const [tokenHash] = await clientFor(uid).hmget(kSess(uid), "tokenHash");
  if (tokenHash === null) { throw new AuthRequiredError("session 不存在或已过期"); }
  if (!safeEqualHex(tokenHash, sha256(token))) { throw new AuthRequiredError("token 不匹配"); }
}

/**
 * 严格校验（建立连接时）：sess 校验 + 回源 MySQL 比对 token_epoch / status。
 * 拦截 Redis failover 后从旧副本「复活」的被撤销会话（02·P1）。
 */
export async function verifySessionStrict(uid: string, token: string): Promise<void> {
  await verifySession(uid, token);
  const [sessEpochStr] = await clientFor(uid).hmget(kSess(uid), "tokenEpoch");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT status, token_epoch FROM accounts WHERE user_id = ?", [uid]);
  if (rows.length === 0) { throw new AuthRequiredError("账号不存在"); }
  if (Number(rows[0].status) === 1) { throw new BannedError(); } // 封号 → ACCOUNT_BANNED（07）
  if (Number(rows[0].status) !== 0) { throw new AuthRequiredError("账号已注销"); }
  if (Number(sessEpochStr ?? "0") < Number(rows[0].token_epoch)) {
    await clientFor(uid).del(kSess(uid)); // 复活会话就地清除
    throw new EpochStaleError();
  }
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

/** 封号：先 MySQL（status=1 + epoch+1，撤销的持久真相），后删 sess。⛔ 绝不删 user:{uid}。 */
export async function banUser(uid: string, reason: string): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET status = 1, token_epoch = token_epoch + 1 WHERE user_id = ?", [uid]);
  await clientFor(uid).del(kSess(uid));
  await auditLogin("ban", uid, reason, null, null);
}

/** 踢人/强制下线：epoch+1 + 删 sess，账号状态不变。 */
export async function revokeSessions(uid: string, reason: string): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET token_epoch = token_epoch + 1 WHERE user_id = ?", [uid]);
  await clientFor(uid).del(kSess(uid));
  await auditLogin("revoke", uid, reason, null, null);
}
