/**
 * 服务端主动推送（per-user）雏形 + 邮件唤醒流（10·M5）。
 *
 * - 投递状态权威在 MySQL `mail` 表（09·A6）：流丢了/重复了都无碍——客户端收到唤醒后
 *   走 mail.list 拉权威，按 mail_id 去重（至少一次投递）。
 * - `stream:mailwake` 是**可靠流**：⛔ 禁止 MAXLEN 裁剪（09·K6），消费按位点 `XTRIM MINID`。
 *   本网关节点用独立 consumer（XREAD 简单游标，不用 group——每个网关节点都要看到全部唤醒，
 *   因为目标用户可能连在任何节点；未连本节点的条目直接跳过）。
 * - 裁剪 owner：所有网关都只是读者，唤醒流的裁剪走「最老未消费位点」保守裁——雏形阶段
 *   由本模块定期按 now-24h 的 MINID 兜底裁（唤醒的时效价值只有几分钟，24h 已远超）。
 */
import {
  ForceLogoutReason, KICK_CLOSE_CODE, LobbyPush,
  type ForceLogoutReasonType, type IForceLogoutPush,
} from "@game/shared";
import { PUSH_ALL_CHUNK } from "../core/infra/config";
import { K_STREAM_MAILWAKE } from "../core/infra/keys";
import { clientForKey } from "../core/infra/redisRoute";
import { fieldOf, startStreamConsumer, type StreamConsumer } from "../core/infra/streamConsumer";

export interface PushSink { (type: string, data: unknown): void }

/** 本节点的一条在线连接。`tokenHash` 是**顶号判别位**：踢时可排除「持新登录态的连接」。 */
interface OnlineConn {
  sink: PushSink; kick: (closeCode: number) => void; tokenHash: string;
  /** 该连接所在的区（M12e）：顶号只踢同区，⛔ 别踢到玩家在别区的另一个在线角色。 */
  sId: number;
}

/**
 * 本节点在线注册表：**uid → sessionId → 连接**（LobbyRoom onJoin/onLeave 维护）。
 *
 * ⚠ 必须按 sessionId 分槽、⛔ 不能一个 uid 只存一条：同一 token 可开多条大厅连接（onAuth 无单连接闸），
 * 旧实现里「较新连接先离开」会把**仍存活的较老连接**一起抹掉 —— 那条连接从此对 kick/push 完全不可见，
 * 而 `/admin/kick` 会回 `kicked:false`，让 GM 的 ack（09·G7b）产生**假阴性**（以为踢干净了，其实还在线）。
 */
const online = new Map<string, Map<string, OnlineConn>>();

export function registerOnline(uid: string, sessionId: string, conn: OnlineConn): void {
  let m = online.get(uid);
  if (!m) { m = new Map(); online.set(uid, m); }
  m.set(sessionId, conn);
}
export function unregisterOnline(uid: string, sessionId: string): void {
  const m = online.get(uid);
  if (!m || !m.delete(sessionId)) { return; }
  if (m.size === 0) {
    online.delete(uid);
    setOnlineGuild(uid, null); // 全部下线才清（工会在线索引三个维护点之一）
  }
}

/**
 * 本节点该 uid 的在线连接**全部**强制下线（撤销自筛踢，§2.3）。不命中直接跳过。返回是否踢到 ≥1 条。
 *
 * ⚠ 顺序固定：**先推 `auth.forceLogout{reason}` 再关连接**——客户端据此弹正确提示
 * （封禁 / 顶号 / 强制下线），⛔ 否则只看到"连接断开"、绕一圈重连才知道真相。
 * 推送尽力而为（连接已死推不到），故同时用**语义化关闭码**兜底（`KICK_CLOSE_CODE`）。
 *
 * @param exceptTokenHash **顶号专用判别位**：跳过持该 hash 的连接（= 新登录态那条）。
 *   ⚠ 没有它会**自踢**：顶号时 `writeGroupSess` 既同步 kickLocal 又 `broadcastKick`，而本节点的消费者
 *   会把自己发的事件读回来（流无发布者过滤）；迟到投递时新连接可能已 registerOnline ⇒ 把刚登录的踢掉。
 *   跨节点同理（新连接可能落在任一节点），故判别位比「发布者自筛」更稳。
 */
/**
 * @param sId 只踢该区的连接（**顶号**，M12e：单端语义作用域 = `(账号, 区)`）；
 *   **省略 = 踢该 uid 的全部连接**（封号/撤销：账号级，"这个人不能玩"而非"不能玩这个区"）。
 */
export function kickUser(
  uid: string, reason: ForceLogoutReasonType = ForceLogoutReason.Banned, exceptTokenHash?: string,
  sId?: number,
): boolean {
  const m = online.get(uid);
  if (!m) { return false; }
  let kicked = false;
  for (const conn of [...m.values()]) {
    if (sId !== undefined && conn.sId !== sId) { continue; } // ⛔ 别区的在线角色：顶号不该碰它
    if (exceptTokenHash !== undefined && conn.tokenHash === exceptTokenHash) { continue; } // 新登录态：⛔ 不自踢
    try { conn.sink(LobbyPush.ForceLogout, { reason } satisfies IForceLogoutPush); } catch { /* 推不到就靠关闭码 */ }
    try { conn.kick(KICK_CLOSE_CODE[reason]); } catch { /* 将死连接，放弃 */ }
    kicked = true;
  }
  return kicked;
}

/** 投递给该 uid 在本节点的**全部**连接。返回是否至少送达一条（不在本节点：权威在 MySQL，上线自拉）。 */
export function pushToUser(uid: string, type: string, data: unknown): boolean {
  const m = online.get(uid);
  if (!m || m.size === 0) { return false; }
  let sent = false;
  for (const conn of [...m.values()]) {
    try { conn.sink(type, data); sent = true; } catch { /* 单连接失败不影响其它 */ }
  }
  return sent;
}

// ── 工会在线索引 + 集合广播（docs/SERVER.md 2026-07）──────────────────────
// guildId 冗余进在线态 → 广播路径零 DB/Redis IO。三个维护点：登录挂载（LobbyRoom.onJoin
// 异步读档）、下线清理（上面 unregisterOnline）、换会更新（guild 域写端点成功后调用）。
// 单线程免锁；将来跨服时 pushToGuild/pushToAll 即 Redis Stream 消费侧的本地落地端。

// ⚠ **索引键必须带区**（A2）：公会目录的 gid 是全局的，而公会数据的 Redis 键是 per-zone
// （`kGuildEvtSeq`/`kGuildLog` 走 `P()`）⇒ 只按 gid 建索引会让**同 gid 的不同区塌进同一个集合**，
// s1 的公会事件推到 s2 的成员身上（实证过）。⛔ 别以为"GROUP_ZONES 为空就没多区"：空 = 承载全部区。
const zKey = (sId: number, gid: number): string => `${sId}:${gid}`;
// uid → 该玩家所在的 (区, 公会)。⚠ **存区号而不是清理时现取**：下线清理路径（unregisterOnline）
// ⛔ 不在 zoneCtx 内，那里调 currentZoneId() 会在 GROUP_ZONES 非空时直接抛（keys.ts fail-fast）。
const guildOf = new Map<string, { sId: number; gid: number }>();
const guildOnline = new Map<string, Set<string>>(); // `${sId}:${gid}` → 在线 uid 集合

/**
 * 设置/清除某在线玩家的工会归属（guildId null/0 = 无工会）。玩家不在线时只做清除。
 * @param sId 设置时**必填**（玩家所在区）；清除时忽略——用登记时存下的区号，见上方注释。
 */
export function setOnlineGuild(uid: string, guildId: number | null, sId?: number): void {
  const old = guildOf.get(uid);
  if (old !== undefined) {
    const k = zKey(old.sId, old.gid);
    const set = guildOnline.get(k);
    set?.delete(uid);
    if (set !== undefined && set.size === 0) { guildOnline.delete(k); }
    guildOf.delete(uid);
  }
  if (guildId !== null && guildId > 0 && online.has(uid)) {
    if (sId === undefined) {
      // ⛔ 宁可不挂索引也不挂错区：挂错的后果是跨区推送（A2 要修的正是它）
      console.error(`[push] setOnlineGuild 缺 sId，⛔ 跳过挂载（uid=${uid} gid=${guildId}）`);
      return;
    }
    guildOf.set(uid, { sId, gid: guildId });
    const k = zKey(sId, guildId);
    let set = guildOnline.get(k);
    if (!set) { set = new Set(); guildOnline.set(k, set); }
    set.add(uid);
  }
}

/** 工会广播（在线成员量级几十，直推不分片）。返回实际送达连接数；失败即放弃（尽力通道，
 *  可靠性由「唤醒 + seq 自愈拉取」语义承担，见 shared lobbyRpc/guild.ts）。
 *  @param sId 公会所在区——⛔ 必填，缺了就会推给同 gid 的**所有区**（A2）。 */
export function pushToGuild(guildId: number, type: string, data: unknown, sId: number): number {
  let n = 0;
  for (const uid of guildOnline.get(zKey(sId, guildId)) ?? []) {
    try { if (pushToUser(uid, type, data)) { n++; } } catch { /* 将死连接，放弃 */ }
  }
  return n;
}

/** 全服广播：每 PUSH_ALL_CHUNK 个连接 setImmediate 让出事件循环（单线程版「丢给 task 进程」）。
 *  片间让出期间 Map 允许增删（JS Map 迭代语义安全）；期间上/下线的玩家收不收到属可接受抖动。 */
export async function pushToAll(type: string, data: unknown): Promise<number> {
  let n = 0;
  let i = 0;
  for (const conns of online.values()) {
    for (const conn of conns.values()) {
      try { conn.sink(type, data); n++; } catch { /* 尽力通道 */ }
    }
    if (++i % PUSH_ALL_CHUNK === 0) { await new Promise<void>((r) => setImmediate(r)); }
  }
  return n;
}

let mailwake: StreamConsumer | null = null;

/** 消费循环（每网关节点一个）：XREAD 阻塞读 stream:mailwake → 在线则 push mail.new（通用工厂 §4.5）。 */
export function startMailWakeLoop(): void {
  if (mailwake) { return; } // 单例护栏（多 LobbyRoom.onCreate 只起一个）
  mailwake = startStreamConsumer("mailwake", () => clientForKey(K_STREAM_MAILWAKE), K_STREAM_MAILWAKE, (fields) => {
    const uid = fieldOf(fields, "uid");
    const mailId = fieldOf(fields, "mailId");
    // 目标不在本节点：pushToUser 返回 false 直接跳过（权威在 MySQL，上线自拉，09·A6）
    if (uid && mailId !== undefined) { pushToUser(uid, LobbyPush.MailNew, { mailId: Number(mailId) }); }
  });
}

export function stopMailWakeLoop(): void { mailwake?.stop(); mailwake = null; }
