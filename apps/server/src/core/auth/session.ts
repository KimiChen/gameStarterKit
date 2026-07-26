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
import { isIP } from "node:net";
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
 * 写组侧 sess:{uid} 缓存（token 已由 WebPlatform lib 签发）：一次性 HSET 全字段 + TTL
 * （最后写者胜，并发登录不会留下「双方互撤为零」的状态）。
 * ⚠ session_key 权威在 accounts（MySQL），组缓存**不再存**（09·G8：无人从组缓存读它）。
 * 登录薄委托（wxLogin）拿到 lib 已签发的 token 后调此写组缓存；split 拆进程后由 onAuth 从 verify 结果懒填。
 */
/**
 * 组 sess 写入栅栏（A1）：**只接受更新的签发时刻**，读-比-写在一条 Lua 里原子完成。
 *
 * ⚠ **⛔ 不能用「比较-并-设置(oldHash CAS)」代替**（评审推翻的上一版药方）：两个请求都在同一时刻
 * 读到 `oldHash=H0` 时，**迟到的旧请求也满足 `oldHash===H0`** ⇒ 它 CAS 成功、真正的赢家反被拒，
 * 终态是旧 token 胜出。CAS 只能保证"没人踩到别人"，⛔ 保证不了"新的赢"——那需要**单调量**。
 *
 * 返回 `[wrote, oldHash]`：wrote=0 表示本次是陈旧写、已被丢弃（⛔ 此时绝不能踢人——踢的是赢家）。
 */
const SESS_FENCE_LUA = `
local storedAt = redis.call('HGET', KEYS[1], 'issuedAt')
if storedAt and tonumber(storedAt) and tonumber(ARGV[2]) <= tonumber(storedAt) then
  return {0, ''}
end
local oldHash = redis.call('HGET', KEYS[1], 'tokenHash')
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'tokenHash', ARGV[1], 'issuedAt', ARGV[2],
           'loginTs', ARGV[3], 'connId', '', 'gwNode', ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[5])
return {1, oldHash or ''}
`;

/**
 * @param issuedAtMs 权威侧签发时刻（`accounts.token_issued_at`，**同 uid 严格递增**，见 lib `issueToken`）。
 *   ⛔ 别传 `Date.now()`：栅栏两侧必须来自同一个时钟（MySQL），否则进程间时钟偏移会让比较失去意义。
 */
export async function writeGroupSess(
  uid: string, token: string, sId: number, gwNode = "", issuedAtMs = 0,
): Promise<void> {
  const key = kSess(uid, sId);
  const newHash = sha256(token);
  // 顶号判据（单端语义）：组 sess 里**原本存着一个不同的 tokenHash** ⇒ 该账号换了登录态（走了一次登录、
  // 换发了 token）⇒ 旧设备的连接要主动踢下线。⚠ 断线重连**不会**命中：重连复用同一 token（hash 相同），
  // 且不经登录；首次连接/sess 已过期时 oldHash=null 也不命中。判据精确到「换了登录态」这一件事。
  // ⚠ 这一读一写**必须原子**：拆成两步就是 A1 描述的那条竞态（中间可任意交错）。
  const res = await clientFor(uid).eval(
    SESS_FENCE_LUA, 1, key, newHash, String(issuedAtMs), String(Date.now()), gwNode, String(SESS_TTL_S),
  ) as [number, string];
  const wrote = Number(res?.[0]) === 1;
  const oldRaw = String(res?.[1] ?? "");
  const oldHash = oldRaw === "" ? null : oldRaw;
  if (!wrote) {
    // 陈旧写（更晚的登录已经写过了）：⛔ 直接返回——既不覆盖缓存，**也绝不踢人**。
    // 上一版没有这条路径，迟到的旧写不仅覆盖缓存，还会拿自己的 newHash 当判别位把**合法的新登录端**踢掉。
    console.warn(`[session] 陈旧的组 sess 写入已丢弃（issuedAtMs=${issuedAtMs} ≤ 已存值）`, uid);
    return;
  }
  await touchActive(uid);
  if (oldHash !== null && oldHash !== newHash) {
    // 顶号：踢旧连接（本节点即时 + 跨节点广播）。⚠ 此刻**新连接尚未注册**——in-process 登录早于连接建立，
    // split 的 onAuth 懒填也早于 onJoin 的 registerOnline，故 ⛔ 不会自踢。
    // ⚠ 带 newHash 判别位：本节点消费者会把这条广播读回来（流无发布者过滤），迟到投递时新连接
    // 可能已 registerOnline —— 判别位保证**只踢旧登录态**、⛔ 不自踢（跨节点同理）。
    kickLocal(uid, ForceLogoutReason.Replaced, newHash, sId);
    // ⚠ 带上 issuedAtMs（A6）：消费侧据此丢弃陈旧的顶号事件，⛔ 防积压时踢掉赢家
    await broadcastKick(uid, ForceLogoutReason.Replaced, newHash, issuedAtMs, sId);
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
export async function verifySession(uid: string, token: string, sId: number): Promise<void> {
  const tokenHash = await clientFor(uid).hget(kSess(uid, sId), "tokenHash");
  if (tokenHash === null) { throw new AuthRequiredError("session 不存在或已过期"); }
  if (!safeEqualHex(tokenHash, sha256(token))) { throw new AuthRequiredError("token 不匹配"); }
}



/**
 * 同步写审计（revoke/ban 等高危事件不能是尽力而为，05）。
 *
 * ⚠ **`reason` 必须在写入前钳到列宽**：它有两个不受控来源——`ban`/`revoke` 是**运营输入**、
 * `login_diverged` 含错误原文。MySQL 在 `STRICT_TRANS_TABLES` 下超长是**抛 ER_DATA_TOO_LONG(1406)
 * 而非截断** ⇒ ① 审计整行写不进（`login_diverged` 恰在它唯一该起作用的场景下失效）；
 * ② `banUser` 末尾这句无 catch ⇒ 权威已写、人已踢，接口却报失败，运营会以为没封上。
 * 列已加宽到 255（schema.sql + db-bootstrap 幂等 MODIFY），钳制是第二道：**split 下账号库
 * 没有自己的 bootstrap（待办 W/E 系列），那边可能还是旧列宽**——靠钳制才不会退回上面两个后果。
 */
// ⚠ **宽度按「本文件实际写的那个库」定，⛔ 不是按"任何部署下最窄的列"一刀切**。
// 本文件用 `core/infra/mysql.ts` 的 `getPool()`＝`MYSQL_URL` 的**组库**，⛔ 从不写账号库
// （split 下组侧 auditLogin 落组库正是待办 **W2** 描述的那件事）。组库必然跑过 db-bootstrap
// （schema.sql 声明 + tools/db-bootstrap.ts 的幂等 `MODIFY reason VARCHAR(255)`）⇒ 这里的
// reason **在任何部署下都是 255**。
// ⚠ 曾经把它收到 64，理由写的是"split 账号库可能还是旧列宽"——**那个理由对本文件是假的**，
// 净效果只有数据损失：运营封号理由被砍、`login_diverged` 的错误原文只剩前 64 字（去掉固定前缀
// 后仅余 ~38 字，等于把上一轮特意加宽列所要保住的东西又丢了）。account 侧那份 64 在
// `@game/webplatform/lib` 的 auth.ts —— 它才可能连到**没有 bootstrap 的**独立账号库。
const AUDIT_REASON_MAX = 255;   // login_audit.reason（组库，schema.sql + bootstrap 保证）
const AUDIT_DEVICE_MAX = 64;    // login_audit.device_id（两库同宽）
const AUDIT_EVENT_MAX = 24;     // login_audit.event（取值是代码字面量，钳制只作兜底）
// ⚠ device_id 的钳制在本文件是**防御性**的：现有三个调用点（ban/revoke/login_diverged）都传 null，
// 真正接客户端 deviceId 的是 lib 那份 auditLogin 与端点校验 —— 机检要钉的是那两处，⛔ 别拿这里充数。

/**
 * 钳到 max「字符」：⛔ 不切断代理对。
 * ⚠ 但**别把这理解成"不切就不会坏"**：曾有注释断言"半个 emoji 是非法 utf8mb4，MySQL 照样拒"——
 * **实测不成立**（mysql2 下孤代理在 Buffer utf8 编码时被替换成 U+FFFD，INSERT 正常成功）。
 * 故钳制的真实失败形态是**静默的内容损坏**，⛔ 不会报错、不会有人发现。要保内容完整只能从产地限长。
 */
function clamp(s: string | null, max: number): string | null {
  if (s === null || s.length <= max) { return s; }
  const cut = s.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut; // 尾部是高代理 ⇒ 连它一起去掉
}

/**
 * XFF 段 / 对端地址 → `INET6_ATON()` 收得下的 IP 字面量；收不下返回 **null**（列可空，审计行照落）。
 *
 * ⚠ `INSERT … INET6_ATON(?)` 在 `STRICT_TRANS_TABLES` 下遇非法串是**抛 1411、不是写 NULL**，而
 * 本文件三个调用点里 `login_diverged` 那条恰恰只在"权威已换发、组缓存没跟上"时才写 ⇒
 * 非法 ip 会让**唯一能定位该分叉的审计**自己抛掉。产地（`http/account/*.ts` 的 XFF 解析）已经
 * 先归一一次，这里是第二道：⛔ 别因为"上面已经校验过"就删。
 * ⚠ 与 `@game/webplatform/lib` 的同名函数是两份实现（跨包不能共享，同 `clamp`）——改一处要改两处。
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

export async function auditLogin(event: string, uid: string | null, reason: string | null, ip: string | null, deviceId: string | null): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO login_audit (user_id, event, reason, ip, device_id) VALUES (?,?,?,INET6_ATON(?),?)",
    [uid, clamp(event, AUDIT_EVENT_MAX), clamp(reason, AUDIT_REASON_MAX), normalizeIp(ip), clamp(deviceId, AUDIT_DEVICE_MAX)]);
}


