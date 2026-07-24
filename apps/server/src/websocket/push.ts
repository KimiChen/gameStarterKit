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
import { LobbyPush } from "@game/shared";
import { PUSH_ALL_CHUNK } from "../core/infra/config";
import { K_STREAM_MAILWAKE } from "../core/infra/keys";
import { clientForKey } from "../core/infra/redisRoute";
import { fieldOf, startStreamConsumer, type StreamConsumer } from "../core/infra/streamConsumer";

export interface PushSink { (type: string, data: unknown): void }

// 本节点在线用户注册表（uid → 连接推送函数；LobbyRoom onJoin/onLeave 维护）
const online = new Map<string, PushSink>();

export function registerOnline(uid: string, sink: PushSink): void { online.set(uid, sink); }
export function unregisterOnline(uid: string, sink?: PushSink): void {
  if (!sink || online.get(uid) === sink) {
    online.delete(uid);
    setOnlineGuild(uid, null); // 下线清理（工会在线索引三个维护点之一）
  }
}
export function pushToUser(uid: string, type: string, data: unknown): boolean {
  const sink = online.get(uid);
  if (!sink) { return false; } // 不在本节点：不投递（权威在 MySQL，上线自拉）
  sink(type, data);
  return true;
}

// ── 工会在线索引 + 集合广播（docs/SERVER.md 2026-07）──────────────────────
// guildId 冗余进在线态 → 广播路径零 DB/Redis IO。三个维护点：登录挂载（LobbyRoom.onJoin
// 异步读档）、下线清理（上面 unregisterOnline）、换会更新（guild 域写端点成功后调用）。
// 单线程免锁；将来跨服时 pushToGuild/pushToAll 即 Redis Stream 消费侧的本地落地端。

const guildOf = new Map<string, number>();          // uid → guildId
const guildOnline = new Map<number, Set<string>>(); // guildId → 在线 uid 集合

/** 设置/清除某在线玩家的工会归属（guildId null/0 = 无工会）。玩家不在线时只做清除。 */
export function setOnlineGuild(uid: string, guildId: number | null): void {
  const old = guildOf.get(uid);
  if (old !== undefined) {
    const set = guildOnline.get(old);
    set?.delete(uid);
    if (set !== undefined && set.size === 0) { guildOnline.delete(old); }
    guildOf.delete(uid);
  }
  if (guildId !== null && guildId > 0 && online.has(uid)) {
    guildOf.set(uid, guildId);
    let set = guildOnline.get(guildId);
    if (!set) { set = new Set(); guildOnline.set(guildId, set); }
    set.add(uid);
  }
}

/** 工会广播（在线成员量级几十，直推不分片）。返回实际送达连接数；失败即放弃（尽力通道，
 *  可靠性由「唤醒 + seq 自愈拉取」语义承担，见 shared lobbyRpc/guild.ts）。 */
export function pushToGuild(guildId: number, type: string, data: unknown): number {
  let n = 0;
  for (const uid of guildOnline.get(guildId) ?? []) {
    try { if (pushToUser(uid, type, data)) { n++; } } catch { /* 将死连接，放弃 */ }
  }
  return n;
}

/** 全服广播：每 PUSH_ALL_CHUNK 个连接 setImmediate 让出事件循环（单线程版「丢给 task 进程」）。
 *  片间让出期间 Map 允许增删（JS Map 迭代语义安全）；期间上/下线的玩家收不收到属可接受抖动。 */
export async function pushToAll(type: string, data: unknown): Promise<number> {
  let n = 0;
  let i = 0;
  for (const sink of online.values()) {
    try { sink(type, data); n++; } catch { /* 尽力通道 */ }
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
