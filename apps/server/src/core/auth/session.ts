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
 *   ② **踢在线**——GM 工具直连各节点 `/admin/kick` 并确认送达；踢 = **先推 `auth.forceLogout{reason}`
 *      再用语义化关闭码关连接**，客户端据此弹「封禁/顶号/强制下线」正确提示（⛔ 缺此步，被封用户在场连接可存活至
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
import { AuthRequiredError } from "../errors";
import { touchActive } from "../userRecord";
// 踢人通道（§2.3）：顶号时主动踢旧连接。权威撤销的编排在 ./ban.ts。
import { broadcastKick, kickLocal } from "./kickBus";
import { ForceLogoutReason } from "@game/shared";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const safeEqualHex = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));


/**
 * 写组侧 sess:{uid} 缓存（token 已由 WebPlatform lib 签发）：一次性 HSET 全字段 + TTL
 * （最后写者胜，并发登录不会留下「双方互撤为零」的状态）。
 * ⚠ session_key 权威在 accounts（MySQL），组缓存**不再存**（09·G8：无人从组缓存读它）。
 * 登录薄委托（wxLogin）拿到 lib 已签发的 token 后调此写组缓存；split 拆进程后由 onAuth 从 verify 结果懒填。
 */
export async function writeGroupSess(uid: string, token: string, gwNode = ""): Promise<void> {
  const key = kSess(uid);
  const newHash = sha256(token);
  // 顶号判据（单端语义）：组 sess 里**原本存着一个不同的 tokenHash** ⇒ 该账号换了登录态（走了一次登录、
  // 换发了 token）⇒ 旧设备的连接要主动踢下线。⚠ 断线重连**不会**命中：重连复用同一 token（hash 相同），
  // 且不经登录；首次连接/sess 已过期时 oldHash=null 也不命中。判据精确到「换了登录态」这一件事。
  const oldHash = await clientFor(uid).hget(key, "tokenHash");
  await clientFor(uid).multi()
    .del(key) // 原子换发：旧会话字段不残留
    .hset(key, {
      tokenHash: newHash,
      loginTs: String(Date.now()),
      connId: "",
      gwNode,
    })
    .expire(key, SESS_TTL_S)
    .exec();
  await touchActive(uid);
  if (oldHash !== null && oldHash !== newHash) {
    // 顶号：踢旧连接（本节点即时 + 跨节点广播）。⚠ 此刻**新连接尚未注册**——in-process 登录早于连接建立，
    // split 的 onAuth 懒填也早于 onJoin 的 registerOnline，故 ⛔ 不会自踢。
    kickLocal(uid, ForceLogoutReason.Replaced);
    await broadcastKick(uid, ForceLogoutReason.Replaced);
  }
}

/**
 * 快路径校验（每 RPC）：**纯组缓存 hash 比对**，⛔ 零权威回源（per-message 不打账号服务）。
 *
 * ⚠ 它**不感知**权威侧的封号——在线撤销由「踢」承担（GM 工具直连各节点 `/admin/kick` 确认送达，
 * 见 DUAL_MODE §2.3 封号 SOP）。⛔ 缺踢这一步，被封用户的在场连接可存活至 sess TTL（3d），**无自动收敛**。
 * 换端顶号（单端语义）无需此路径感知：新登录 `writeGroupSess` 覆写 sess（旧 token 下一条即 hash 不符），
 * 且当场检测到 hash 变化 → 主动踢旧连接（reason=replaced）。
 * 权威校验见 verifySessionStrict（建连点 onAuth 走它）。
 */
export async function verifySession(uid: string, token: string): Promise<void> {
  const tokenHash = await clientFor(uid).hget(kSess(uid), "tokenHash");
  if (tokenHash === null) { throw new AuthRequiredError("session 不存在或已过期"); }
  if (!safeEqualHex(tokenHash, sha256(token))) { throw new AuthRequiredError("token 不匹配"); }
}



/** 同步写审计（revoke/ban 等高危事件不能是尽力而为，05）。 */
export async function auditLogin(event: string, uid: string | null, reason: string | null, ip: string | null, deviceId: string | null): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO login_audit (user_id, event, reason, ip, device_id) VALUES (?,?,?,INET6_ATON(?),?)",
    [uid, event, reason, ip, deviceId]);
}


