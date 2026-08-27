/**
 * 工会事件存取——广播/事件系统的存储侧（docs/SERVER.md 2026-07）。
 *
 * 语义（shared lobbyRpc/guild.ts 文件头是双端契约真源）：
 *  - 事件流是**增量通知载体**（近 GUILD_EVT_LOG_MAX 条窗口），⛔ 不是权威存储——
 *    各玩法系统的权威在自己的库表，事件 data 只放小对象/引用；
 *  - seq 用 INCR 单调发号；INCR 与 LPUSH 非原子，崩溃窗口可能产生 seq 空洞——
 *    客户端同时会按响应里的 `latestSeq` 抬水位（见 client GuildLogic），因此 INCR 与 LPUSH 之间的
 *    交错可能让某条已发号事件被永久跳过；⛔ 不要按连号消费，也不要把本流当作不丢通道；
 *  - 推送侧在调用方组合（端点先 emitGuildEvent 再 pushToGuild），本模块不 import
 *    websocket/（分层方向：websocket → core，不反向）。
 */
import type { IGuildEvent } from "@game/shared";
import { GUILD_EVT_LOG_MAX } from "../infra/config";
import { kGuildEvtLog, kGuildEvtSeq } from "../infra/keys";
import { clientForKey } from "../infra/redisRoute";
import { optionalStoredInt, storedInt } from "../infra/numbers";

/** 发一条工会事件，返回其 seq。调用方随后 pushToGuild(gid, LobbyPush.GuildEvent, { seq })。 */
export async function emitGuildEvent(guildId: number, kind: string, data?: unknown): Promise<number> {
  const seqKey = kGuildEvtSeq(guildId);
  const client = clientForKey(seqKey); // seq/log 同 hash-tag 同实例
  const seq = storedInt(await client.incr(seqKey), "guild event seq", { min: 1, max: Number.MAX_SAFE_INTEGER });
  const evt: IGuildEvent = { seq, kind, at: Date.now(), ...(data !== undefined ? { data } : {}) };
  await client.multi()
    .lpush(kGuildEvtLog(guildId), JSON.stringify(evt))
    .ltrim(kGuildEvtLog(guildId), 0, GUILD_EVT_LOG_MAX - 1)
    .exec();
  return seq;
}

/** 读增量（seq 升序）。窗口外的部分拿不到——客户端按契约做全量刷新。 */
export async function readGuildEvents(
  guildId: number, sinceSeq: number,
): Promise<{ events: IGuildEvent[]; latestSeq: number }> {
  const client = clientForKey(kGuildEvtSeq(guildId));
  const latestSeq = optionalStoredInt(await client.get(kGuildEvtSeq(guildId)), 0, "guild event seq", { min: 0 });
  if (latestSeq <= sinceSeq) { return { events: [], latestSeq }; }
  const raw = await client.lrange(kGuildEvtLog(guildId), 0, GUILD_EVT_LOG_MAX - 1);
  const events: IGuildEvent[] = [];
  for (const s of raw) {
    try {
      const value: unknown = JSON.parse(s);
      if (!value || typeof value !== "object" || Array.isArray(value)) { continue; }
      const row = value as Record<string, unknown>;
      if (typeof row.kind !== "string" || row.kind.length < 1 || row.kind.length > 64) { continue; }
      const seq = storedInt(row.seq, "guild event.seq", { min: 1, max: Number.MAX_SAFE_INTEGER });
      const at = storedInt(row.at, "guild event.at", { min: 0, max: Number.MAX_SAFE_INTEGER });
      const e: IGuildEvent = Object.prototype.hasOwnProperty.call(row, "data")
        ? { seq, kind: row.kind, at, data: row.data }
        : { seq, kind: row.kind, at };
      if (e.seq > sinceSeq) { events.push(e); }
    } catch { /* 坏行跳过（seq 空洞无害语义） */ }
  }
  events.sort((a, b) => a.seq - b.seq);
  return { events, latestSeq };
}
