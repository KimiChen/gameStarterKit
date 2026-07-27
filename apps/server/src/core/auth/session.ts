/**
 * 游戏组 session cache（[02·P1](docs/SERVER.md) / 07）。
 *
 * - token 是 WebPlatform 签发的**不透明字符串**；游戏服只在组缓存保存 sha256。
 * - strict auth 通过 platform/webPlatformClient HTTP 回权威，成功后用 issuedAtMs 懒填本缓存。
 * - Redis `sess:{uid}` 退为**组侧缓存**：快路径 tokenHash + freeze-guard 存在性 + connId/gwNode。
 *   每消息校验只读本缓存，不逐消息回源。
 * - **封号 = 账号级「下次登不上」+ 踢在线**（M12d §2.3，两步**都必做**）：
 *   ① WebPlatform 在一个事务内写 `accounts.status=1`、删除全部 `account_sessions` 并记审计
 *      → 新建连接/重新登录即拒；
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
import { AuthRequiredError } from "../errors";
import { touchActive } from "../userRecord";
// 踢人通道（§2.3）：同区顶号时主动踢旧连接；账号封禁/撤销由 WebPlatform 管理面负责。
import { broadcastKick, kickLocal } from "./kickBus";
import { ForceLogoutReason } from "@game/shared";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
/** token → 组 sess 里存的 hash（在线表用它做顶号判别位：踢时排除新登录态那条连接）。 */
export const tokenHashOf = (token: string): string => sha256(token);
const safeEqualHex = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

/**
 * 共享密钥比较（**恒时**）——给 `/admin/kick`、`/pay/wx-notify` 这类头部密钥鉴权用。
 *
 * ⚠ 为什么不直接 `!==`：JS 字符串比较逐字符短路，理论上可被计时侧信道逐字节猜。本仓对 token hash
 * 处处用 `timingSafeEqual`（见上方 `safeEqualHex`、lib/auth.ts 同款），密钥端点⛔不该是例外。
 * ⚠ 先各自 sha256 再比：`timingSafeEqual` 要求两侧**等长**，直接比会因长度不等而抛错，
 * 那本身就泄漏了密钥长度；摘要恒 32 字节，长度差异不再可观测。
 */
export const safeSecretEqual = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());


/**
 * 写组侧 sess:{uid} 缓存（token 已由 WebPlatform 签发）：一次性 HSET 全字段 + TTL
 * （最后写者胜，并发登录不会留下「双方互撤为零」的状态）。
 * onAuth 从 Internal verify 结果取得权威 issuedAtMs 后写入。
 */
/**
 * 组 sess 写入栅栏（A1）：**只接受更新的签发时刻**，读-比-写在一条 Lua 里原子完成。
 *
 * ⚠ **⛔ 不能用「比较-并-设置(oldHash CAS)」代替**（评审推翻的上一版药方）：两个请求都在同一时刻
 * 读到 `oldHash=H0` 时，**迟到的旧请求也满足 `oldHash===H0`** ⇒ 它 CAS 成功、真正的赢家反被拒，
 * 终态是旧 token 胜出。CAS 只能保证"没人踩到别人"，⛔ 保证不了"新的赢"——那需要**单调量**。
 *
 * 返回三态：
 * - `written`：本次更新较新，已写缓存；
 * - `unchanged`：同一签发时刻 + 同一 token（同 token 多连接/重连），无需重复写；
 * - `stale`：缓存已有更晚签发，或同一时刻却是不同 token，拒绝本次准入。
 *
 * ⚠ 不能只返回 boolean：同一 token 的第二条连接会再次 strict verify，issuedAt 与缓存相等，
 * 这是合法的 `unchanged`；若把所有 no-op 都当 stale，会把多连接/重连误拒。
 */
const SESS_FENCE_LUA = `
local storedAt = redis.call('HGET', KEYS[1], 'issuedAt')
if storedAt and tonumber(storedAt) then
  local incomingAt = tonumber(ARGV[2])
  local currentAt = tonumber(storedAt)
  local currentHash = redis.call('HGET', KEYS[1], 'tokenHash') or ''
  if incomingAt < currentAt then
    return {-1, currentHash}
  end
  if incomingAt == currentAt then
    if currentHash == ARGV[1] then
      return {0, currentHash}
    end
    return {-1, currentHash}
  end
end
local oldHash = redis.call('HGET', KEYS[1], 'tokenHash')
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'tokenHash', ARGV[1], 'issuedAt', ARGV[2],
           'loginTs', ARGV[3], 'connId', '', 'gwNode', ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[5])
return {1, oldHash or ''}
`;

export type GroupSessWriteResult = "written" | "unchanged" | "stale";

/**
 * @param issuedAtMs WebPlatform 权威侧签发时刻（同 `(uid,sId)` 严格递增）。
 *   ⛔ 别传 `Date.now()`：栅栏两侧必须来自同一个时钟（MySQL），否则进程间时钟偏移会让比较失去意义。
 */
export async function writeGroupSess(
  uid: string, token: string, sId: number, gwNode = "", issuedAtMs = 0,
): Promise<GroupSessWriteResult> {
  const key = kSess(uid, sId);
  const newHash = sha256(token);
  // 顶号判据（单端语义）：组 sess 里**原本存着一个不同的 tokenHash** ⇒ 该账号换了登录态（走了一次登录、
  // 换发了 token）⇒ 旧设备的连接要主动踢下线。⚠ 断线重连**不会**命中：重连复用同一 token（hash 相同），
  // 且不经登录；首次连接/sess 已过期时 oldHash=null 也不命中。判据精确到「换了登录态」这一件事。
  // ⚠ 这一读一写**必须原子**：拆成两步就是 A1 描述的那条竞态（中间可任意交错）。
  const res = await clientFor(uid).eval(
    SESS_FENCE_LUA, 1, key, newHash, String(issuedAtMs), String(Date.now()), gwNode, String(SESS_TTL_S),
  ) as [number, string];
  const status = Number(res?.[0]);
  const oldRaw = String(res?.[1] ?? "");
  const oldHash = oldRaw === "" ? null : oldRaw;
  if (status < 0) {
    // 陈旧写（更晚的登录已经写过了）：⛔ 直接返回——既不覆盖缓存，**也绝不踢人**。
    // 上一版没有这条路径，迟到的旧写不仅覆盖缓存，还会拿自己的 newHash 当判别位把**合法的新登录端**踢掉。
    console.warn(`[session] 陈旧的组 sess 写入已丢弃（issuedAtMs=${issuedAtMs} ≤ 已存值）`, uid);
    return "stale";
  }
  if (status === 0) {
    // 同 token + 同 issuedAt：同一登录态的第二条连接/重连，合法复用，⛔ 不触发顶号。
    return "unchanged";
  }
  await touchActive(uid);
  if (oldHash !== null && oldHash !== newHash) {
    // 顶号：踢旧连接（本节点即时 + 跨节点广播）。⚠ 此刻**新连接尚未注册**——
    // Internal verify 后的 onAuth 懒填早于 onJoin.registerOnline，故 ⛔ 不会自踢。
    // ⚠ 带 newHash 判别位：本节点消费者会把这条广播读回来（流无发布者过滤），迟到投递时新连接
    // 可能已 registerOnline —— 判别位保证**只踢旧登录态**、⛔ 不自踢（跨节点同理）。
    kickLocal(uid, ForceLogoutReason.Replaced, newHash, sId);
    // ⚠ 带上 issuedAtMs（A6）：消费侧据此丢弃陈旧的顶号事件，⛔ 防积压时踢掉赢家
    await broadcastKick(uid, ForceLogoutReason.Replaced, newHash, issuedAtMs, sId);
  }
  return "written";
}

/**
 * 快路径校验（每 RPC）：**纯组缓存 hash 比对**，⛔ 零权威回源（per-message 不打账号服务）。
 *
 * ⚠ 它**不感知**权威侧的封号——在线撤销由「踢」承担（GM 工具直连各节点 `/admin/kick` 确认送达，
 * 见 DUAL_MODE §2.3 封号 SOP）。⛔ 缺踢这一步，被封用户的在场连接可存活至 sess TTL（3d），**无自动收敛**。
 * 换端顶号（单端语义）无需此路径感知：新登录 `writeGroupSess` 覆写 sess（旧 token 下一条即 hash 不符），
 * 且当场检测到 hash 变化 → 主动踢旧连接（reason=replaced）。
 * 权威校验只在建连点由 `platform/webPlatformClient` 调 Internal verify。
 */
export async function verifySession(uid: string, token: string, sId: number): Promise<void> {
  const tokenHash = await clientFor(uid).hget(kSess(uid, sId), "tokenHash");
  if (tokenHash === null) { throw new AuthRequiredError("session 不存在或已过期"); }
  if (!safeEqualHex(tokenHash, sha256(token))) { throw new AuthRequiredError("token 不匹配"); }
}
