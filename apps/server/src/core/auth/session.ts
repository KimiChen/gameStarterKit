/**
 * 会话签发 / 校验 / 撤销（[02·P1](docs/SERVER.md) / 07；M12c 2b-1：token 记录改 MySQL 权威）。
 *
 * - token 是**不透明随机串**（randomBytes），服务端只存 sha256——⛔ 不是 JWT（被否掉的方案）。
 * - **权威 token 记录在 MySQL `accounts`**（token_hash / token_issued_at / token_issued_epoch / session_key）：
 *   `verifySessionStrict` 纯 MySQL 一条 PK 表达（WebPlatform MySQL-only 也能验，DUAL_MODE §2.7）。
 * - `token_epoch` 是 L2 第三种 fence（仅封号/踢人递增，权威在 accounts）；签发时快照进 `token_issued_epoch`，
 *   `token_issued_epoch < token_epoch` 即 stale（AUTH_EPOCH_STALE）。
 * - Redis `sess:{uid}` 退为**组侧缓存**：快路径 tokenHash + freeze-guard 存在性 + connId/gwNode。
 *   2b-1 由 issueSession 暂时双写；2b-2 拆进程后由 onAuth 从 verify 结果懒填（2d 加 verifiedAt）。
 * - 封号/踢人（M12d §2.3）= **先写 MySQL** token_epoch+1 + token_hash=NULL + revocation_log（同事务）→ 控制总线
 *   广播 epoch → 各节点本地 maxEpoch → 快路径比对即拒 + 自筛踢在线连接；⛔ **不再删 sess**（改由 maxEpoch 快检），⛔ 绝不删 user:{uid}（09·G7）。
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { AUTH_REVERIFY_TTL_S, SESS_TTL_S } from "../infra/config";
import { kSess } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { getPool } from "../infra/mysql";
import type { ResultSetHeader } from "../infra/mysql";
import { AuthRequiredError, BannedError, EpochStaleError } from "../errors";
import { touchActive } from "../userRecord";
// 权威 token 逻辑（MySQL-only）在 WebPlatform lib；本文件只做组侧 Redis 缓存 + 结果码→错误类映射。
import { issueToken, verifyToken, banAccount, revokeAccount } from "@game/webplatform/lib";
// 控制总线（DUAL_MODE §2.3 / M12d）：本地 maxEpoch 快检 + 撤销即时扇出（撤销源直接 applyRevoke + drainRevocations）。
import { applyRevoke, drainRevocations, revokedEpoch } from "./revoke";

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
  // 权威 token 记录（MySQL accounts）由 WebPlatform lib 生成并写入，返回不透明 token。
  const token = await issueToken(uid, tokenEpoch, sessionKey);
  await writeGroupSess(uid, token, tokenEpoch, gwNode);
  return { userId: uid, token };
}

/**
 * 写组侧 sess:{uid} 缓存（token 已由 WebPlatform lib 签发）：一次性 HSET 全字段 + TTL
 * （最后写者胜，并发登录不会留下「双方互撤为零」的状态）。
 * ⚠ session_key 权威在 accounts（MySQL），组缓存**不再存**（09·G8：无人从组缓存读它）。
 * 登录薄委托（wxLogin）拿到 lib 已签发的 token 后调此写组缓存；split 拆进程后由 onAuth 从 verify 结果懒填。
 */
export async function writeGroupSess(uid: string, token: string, tokenEpoch: number, gwNode = ""): Promise<void> {
  const key = kSess(uid);
  await clientFor(uid).multi()
    .del(key) // 原子换发：旧会话字段不残留
    .hset(key, {
      tokenHash: sha256(token),
      tokenEpoch: String(tokenEpoch),
      verifiedAt: String(Date.now()), // 权威校验时刻（快路径 §2.3 verifiedAt 兜底）
      loginTs: String(Date.now()),
      connId: "",
      gwNode,
    })
    .expire(key, SESS_TTL_S)
    .exec();
  await touchActive(uid);
}

/**
 * 快路径校验（每 RPC）：读 sess:{uid}（tokenHash + tokenEpoch + verifiedAt）。撤销靠**本地 maxEpoch 快检**
 * （M12d §2.3）——控制总线广播到达即 `sess.tokenEpoch < revokedEpoch(uid)` 拒，下一条 RPC 生效；
 * verifiedAt 兜底 maxEpoch 漏读；epoch 权威双保险见 verifySessionStrict。
 */
export async function verifySession(
  uid: string, token: string,
  // verifiedAt 陈旧时的**权威重验**——按部署模式注入：默认 = 本地 verifySessionStrict（in-process，共享库）；
  // split 由 httpAccount 传入远程 /verify（⚠ ⛔ 不打本地组 pool——split 账号库是 WebPlatform 独立库，
  // 本地根本没这行 accounts，用本地重验会把每个连接的用户在 AUTH_REVERIFY_TTL_S 后全部误踢）。
  reverify: (uid: string, token: string) => Promise<void> = verifySessionStrict,
): Promise<void> {
  const [tokenHash, tokenEpochStr, verifiedAtStr] = await clientFor(uid).hmget(kSess(uid), "tokenHash", "tokenEpoch", "verifiedAt");
  if (tokenHash === null) { throw new AuthRequiredError("session 不存在或已过期"); }
  if (!safeEqualHex(tokenHash, sha256(token))) { throw new AuthRequiredError("token 不匹配"); }
  // maxEpoch 快检（§2.3 C2/C4）：控制总线把撤销 epoch 推到本节点，会话 epoch 落后即拒——广播到达即在
  // 下一条 RPC 生效，不依赖删键/TTL（关掉「定向踢+广播双失 → 被封用户整个 TTL 内照常收发」窗）。
  if (Number(tokenEpochStr ?? "0") < revokedEpoch(uid)) { throw new EpochStaleError(); }
  // verifiedAt 兜底（§2.3 U2）：缓存超 AUTH_REVERIFY_TTL_S 未回权威 → 重验 + 刷新（maxEpoch 被 evict/漏读的兜底）。
  if (Date.now() - Number(verifiedAtStr ?? "0") > AUTH_REVERIFY_TTL_S * 1000) {
    await reverify(uid, token); // 权威；token_hash=NULL / epoch-stale / banned 即抛
    await clientFor(uid).hset(kSess(uid), "verifiedAt", String(Date.now()));
  }
}

/**
 * 严格校验（建立连接时）：sess 校验 + 回源 MySQL 比对 token_epoch / status。
 * 拦截 Redis failover 后从旧副本「复活」的被撤销会话（02·P1）。
 */
export async function verifySessionStrict(uid: string, token: string): Promise<void> {
  // 权威校验走 WebPlatform lib（MySQL-only，返回结果码）；组侧只做「结果码→错误类映射 + 组缓存清理」。
  const r = await verifyToken(uid, token);
  if (r.ok) { return; }
  if (r.reason === "banned") { throw new BannedError(); } // 封号 → ACCOUNT_BANNED（07）
  if (r.reason === "stale") {
    await clientFor(uid).del(kSess(uid)); // 复活会话就地清组缓存（2d 拆进程后此清理移组侧 onAuth）
    throw new EpochStaleError();
  }
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
 * 封号：lib in-tx（status=1 + epoch+1 + revocation_log，撤销的持久真相）→ 控制总线扇出撤销 epoch。
 * ⛔ 不再删 sess（DUAL_MODE §2.3：业务侧不直接 del sess，改由 maxEpoch 快检拒 + M12d-b 自筛踢）；⛔ 绝不删 user:{uid}。
 */
export async function banUser(uid: string, reason: string): Promise<void> {
  const epoch = await banAccount(uid); // 新 token_epoch（0 = 无此账号）
  if (epoch > 0) {
    applyRevoke(uid, epoch);   // 本节点即时（maxEpoch 快检下一条 RPC 即拒；M12d-b 追加自筛踢）
    await drainRevocations();  // 即时扇出其它组/节点（relayer 兜底崩溃窗）
  }
  await auditLogin("ban", uid, reason, null, null);
}

/** 踢人/强制下线：lib in-tx（epoch+1 + revocation_log，status 不变）→ 控制总线扇出。⛔ 不再删 sess。 */
export async function revokeSessions(uid: string, reason: string): Promise<void> {
  const epoch = await revokeAccount(uid);
  if (epoch > 0) {
    applyRevoke(uid, epoch);
    await drainRevocations();
  }
  await auditLogin("revoke", uid, reason, null, null);
}
