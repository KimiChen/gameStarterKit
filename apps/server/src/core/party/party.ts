/**
 * party 领域服务（docs/MMO.md §6.4；MF6a-B3）：Redis 键族（Lua 原子段）+ 档字段 `partyId`（withUser）。
 *
 * - 顺序：**先 Lua 后档**（Lua 是权威；档字段只是成员指针）；读侧自愈：`partyId` 指向不存在的队 / 名册无我 ⇒ 视为不在队并清字段。
 * - ⛔ 不跨 uid 取锁：kick 只改 Lua 名册，被踢者的档字段在其下一次 `party.get` 自愈清除（同时收到 party.event 唤醒）。
 * - 推送不在本文件（core ⛔ 反向依赖 websocket）：各函数返回受影响成员集合，端点用 `pushToUsers` 发唤醒 / 邀请。
 * - 一致性：party 只在 Redis，与 WorldRoom 无关；断线不自动踢（presence 标 offline）；队长断线不自动转让（产品策略留 kit / 插件）。
 */
import type { IPartyEvent, IPartyView } from "@game/shared/protocol/lobbyRpc/domains/party";
import { PARTY_EVT_LOG_MAX, PARTY_IDLE_TTL_S, PARTY_INVITE_TTL_S, PARTY_MAX_SIZE } from "../infra/config";
import {
  currentZoneId, kParty, kPartyEvtLog, kPartyEvtSeq, kPartyIdSeq, kPartyInvites, kPartyMembers,
} from "../infra/keys";
import { optionalStoredInt, storedInt } from "../infra/numbers";
import { clientForKey } from "../infra/redisRoute";
import { evalshaWithReload, type RedisScript } from "../infra/redisScripts";
import { RpcFault } from "../errors";
import { withUser } from "../uow";
import { loadFields } from "../userRecord";
import { isOnline, readPresenceMany } from "../presence/presence";
import {
  PARTY_ACCEPT, PARTY_CREATE, PARTY_DECLINE, PARTY_INVITE, PARTY_KICK, PARTY_LEAVE, PARTY_LUA_CODE, PARTY_TRANSFER,
} from "./partyScripts";

type LuaReply = [number, number, string];

const partyKeys = (pid: number): string[] => [kParty(pid), kPartyMembers(pid), kPartyInvites(pid), kPartyEvtSeq(pid), kPartyEvtLog(pid)];
const partyClient = (pid: number) => clientForKey(kParty(pid)); // 五键同 hash-tag ⇒ 同实例 / 同槽
const ttlMs = (): number => PARTY_IDLE_TTL_S * 1000;

async function runParty(script: RedisScript, pid: number, argv: (string | number)[]): Promise<LuaReply> {
  const raw = await evalshaWithReload(partyClient(pid), script, partyKeys(pid), argv) as unknown;
  if (!Array.isArray(raw) || raw.length < 2) throw new Error(`[party] Lua ${script.name} 返回形状非法`);
  const code = storedInt(raw[0], `party.${script.name}.code`, { min: -9, max: 9 });
  const seq = storedInt(raw[1], `party.${script.name}.seq`, { min: 0, max: Number.MAX_SAFE_INTEGER });
  const extra = typeof raw[2] === "string" ? raw[2] : "";
  return [code, seq, extra];
}

function faultOf(code: number): RpcFault {
  switch (code) {
    case PARTY_LUA_CODE.NOT_FOUND: return new RpcFault("PARTY_NOT_FOUND", "队伍不存在或已解散");
    case PARTY_LUA_CODE.NOT_MEMBER: return new RpcFault("PARTY_NOT_MEMBER", "不是该队伍成员");
    case PARTY_LUA_CODE.FULL: return new RpcFault("PARTY_FULL", "队伍已满");
    case PARTY_LUA_CODE.ALREADY_IN_PARTY: return new RpcFault("PARTY_ALREADY_IN_PARTY", "已在队伍中");
    case PARTY_LUA_CODE.INVITE_INVALID: return new RpcFault("PARTY_INVITE_INVALID", "邀请不存在或已过期");
    case PARTY_LUA_CODE.NOT_LEADER: return new RpcFault("PARTY_NOT_LEADER", "只有队长可以执行");
    default: return new RpcFault("INTERNAL");
  }
}

/** 档字段 partyId（0 = 不在队）。 */
export async function currentPartyId(uid: string): Promise<number> {
  const f = await loadFields(uid, ["partyId"]);
  return optionalStoredInt(f.partyId, 0, "partyId", { min: 0 });
}

async function setPartyField(uid: string, pid: number): Promise<void> {
  await withUser(uid, async (uow) => { uow.set("partyId", String(pid)); });
}

export async function memberUids(pid: number): Promise<string[]> {
  return partyClient(pid).zrange(kPartyMembers(pid), 0, -1);
}

async function isMember(pid: number, uid: string): Promise<boolean> {
  return (await partyClient(pid).zscore(kPartyMembers(pid), uid)) !== null;
}

/** 已在**有效**队伍（档指针 + 名册双证）⇒ true；指针陈旧则顺手清字段（读侧自愈）。 */
async function assertNotInParty(uid: string, except = 0): Promise<void> {
  const pid = await currentPartyId(uid);
  if (pid === 0 || pid === except) return;
  if (await isMember(pid, uid)) throw new RpcFault("PARTY_ALREADY_IN_PARTY", "已在其它队伍中");
  await setPartyField(uid, 0);
}

export async function createParty(uid: string, now = Date.now()): Promise<{ partyId: number; seq: number }> {
  await assertNotInParty(uid);
  const idKey = kPartyIdSeq();
  const pid = storedInt(await clientForKey(idKey).incr(idKey), "party.idseq", { min: 1, max: Number.MAX_SAFE_INTEGER });
  const [code, seq] = await runParty(PARTY_CREATE, pid, [uid, PARTY_MAX_SIZE, now, ttlMs(), PARTY_EVT_LOG_MAX]);
  if (code !== PARTY_LUA_CODE.OK) throw faultOf(code);
  await setPartyField(uid, pid);
  return { partyId: pid, seq };
}

export async function inviteToParty(
  by: string, target: string, now = Date.now(),
): Promise<{ partyId: number; seq: number; expAt: number; members: string[] }> {
  const pid = await currentPartyId(by);
  if (pid === 0) throw new RpcFault("PARTY_NOT_MEMBER", "先建队或入队再邀请");
  if (by === target) throw new RpcFault("PARTY_ALREADY_IN_PARTY", "不能邀请自己");
  if (!(await isOnline(target, currentZoneId()))) throw new RpcFault("PARTY_TARGET_OFFLINE", "对方不在线");
  const expAt = now + PARTY_INVITE_TTL_S * 1000;
  const [code, seq] = await runParty(PARTY_INVITE, pid, [by, target, now, expAt, ttlMs(), PARTY_EVT_LOG_MAX]);
  if (code !== PARTY_LUA_CODE.OK) {
    if (code === PARTY_LUA_CODE.NOT_FOUND || code === PARTY_LUA_CODE.NOT_MEMBER) await setPartyField(by, 0);
    throw faultOf(code);
  }
  return { partyId: pid, seq, expAt, members: await memberUids(pid) };
}

export async function acceptInvite(uid: string, pid: number, now = Date.now()): Promise<{ seq: number; members: string[] }> {
  await assertNotInParty(uid, pid);
  const [code, seq] = await runParty(PARTY_ACCEPT, pid, [uid, now, ttlMs(), PARTY_EVT_LOG_MAX]);
  if (code !== PARTY_LUA_CODE.OK) throw faultOf(code);
  await setPartyField(uid, pid);
  return { seq, members: await memberUids(pid) };
}

export async function declineInvite(uid: string, pid: number, now = Date.now()): Promise<{ seq: number; members: string[] }> {
  const [code, seq] = await runParty(PARTY_DECLINE, pid, [uid, now, ttlMs(), PARTY_EVT_LOG_MAX]);
  if (code !== PARTY_LUA_CODE.OK) throw faultOf(code);
  return { seq, members: seq === 0 ? [] : await memberUids(pid) };
}

export async function leaveParty(
  uid: string, now = Date.now(),
): Promise<{ partyId: number; disbanded: boolean; seq: number; newLeader: string; members: string[] }> {
  const pid = await currentPartyId(uid);
  if (pid === 0) throw new RpcFault("PARTY_NOT_MEMBER", "不在队伍中");
  const [code, seq, newLeader] = await runParty(PARTY_LEAVE, pid, [uid, now, ttlMs(), PARTY_EVT_LOG_MAX]);
  if (code === PARTY_LUA_CODE.NOT_FOUND || code === PARTY_LUA_CODE.NOT_MEMBER) {
    await setPartyField(uid, 0); // 指针陈旧：自愈后仍按不在队报错
    throw faultOf(code);
  }
  if (code !== PARTY_LUA_CODE.OK && code !== PARTY_LUA_CODE.OK_DISBANDED) throw faultOf(code);
  await setPartyField(uid, 0);
  const disbanded = code === PARTY_LUA_CODE.OK_DISBANDED;
  return { partyId: pid, disbanded, seq, newLeader, members: disbanded ? [] : await memberUids(pid) };
}

export async function kickFromParty(
  leader: string, target: string, now = Date.now(),
): Promise<{ partyId: number; seq: number; members: string[] }> {
  const pid = await currentPartyId(leader);
  if (pid === 0) throw new RpcFault("PARTY_NOT_MEMBER", "不在队伍中");
  const [code, seq] = await runParty(PARTY_KICK, pid, [leader, target, now, ttlMs(), PARTY_EVT_LOG_MAX]);
  if (code !== PARTY_LUA_CODE.OK) throw faultOf(code);
  // 被踢者的档字段 ⛔ 不在此跨 uid 改：其下一次 party.get 自愈清除；端点同时给它发唤醒。
  return { partyId: pid, seq, members: await memberUids(pid) };
}

export async function transferLeader(
  leader: string, target: string, now = Date.now(),
): Promise<{ partyId: number; seq: number; members: string[] }> {
  const pid = await currentPartyId(leader);
  if (pid === 0) throw new RpcFault("PARTY_NOT_MEMBER", "不在队伍中");
  const [code, seq] = await runParty(PARTY_TRANSFER, pid, [leader, target, now, ttlMs(), PARTY_EVT_LOG_MAX]);
  if (code !== PARTY_LUA_CODE.OK) throw faultOf(code);
  return { partyId: pid, seq, members: await memberUids(pid) };
}

/** 当前队伍视图（presence 在线标记）；指针陈旧 ⇒ 清字段并返回 null。 */
export async function getParty(uid: string): Promise<IPartyView | null> {
  const pid = await currentPartyId(uid);
  if (pid === 0) return null;
  const client = partyClient(pid);
  const [hash, membersRaw] = await Promise.all([
    client.hgetall(kParty(pid)),
    client.zrange(kPartyMembers(pid), 0, -1, "WITHSCORES"),
  ]);
  const uids: string[] = [];
  const joinedAt = new Map<string, number>();
  for (let i = 0; i + 1 < membersRaw.length; i += 2) {
    uids.push(membersRaw[i]);
    joinedAt.set(membersRaw[i], optionalStoredInt(membersRaw[i + 1].split(".")[0], 0, "party.joinedAt", { min: 0 }));
  }
  if (!hash || typeof hash.leader !== "string" || hash.leader.length === 0 || !uids.includes(uid)) {
    await setPartyField(uid, 0);
    return null;
  }
  const presence = await readPresenceMany(uids, currentZoneId());
  return {
    partyId: pid,
    leader: hash.leader,
    maxSize: optionalStoredInt(hash.maxSize, PARTY_MAX_SIZE, "party.maxSize", { min: 1 }),
    ver: optionalStoredInt(hash.ver, 1, "party.ver", { min: 1 }),
    members: uids.map((member) => ({ uid: member, joinedAt: joinedAt.get(member) ?? 0, online: presence.get(member) !== null && presence.get(member) !== undefined })),
  };
}

/** 读增量（seq 升序）；窗口外客户端全量刷新（同 guild）。 */
export async function getPartyEvents(uid: string, sinceSeq: number): Promise<{ events: IPartyEvent[]; latestSeq: number; partyId: number }> {
  const pid = await currentPartyId(uid);
  if (pid === 0) return { events: [], latestSeq: 0, partyId: 0 };
  const client = partyClient(pid);
  if (!(await isMember(pid, uid))) {
    await setPartyField(uid, 0);
    return { events: [], latestSeq: 0, partyId: 0 };
  }
  const latestSeq = optionalStoredInt(await client.get(kPartyEvtSeq(pid)), 0, "party.evt.seq", { min: 0 });
  if (latestSeq <= sinceSeq) return { events: [], latestSeq, partyId: pid };
  const raw = await client.lrange(kPartyEvtLog(pid), 0, PARTY_EVT_LOG_MAX - 1);
  const events: IPartyEvent[] = [];
  for (const s of raw) {
    try {
      const value: unknown = JSON.parse(s);
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      if (typeof row.kind !== "string" || row.kind.length < 1 || row.kind.length > 64) continue;
      const seq = storedInt(row.seq, "party event.seq", { min: 1, max: Number.MAX_SAFE_INTEGER });
      const at = storedInt(row.at, "party event.at", { min: 0, max: Number.MAX_SAFE_INTEGER });
      const e: IPartyEvent = Object.prototype.hasOwnProperty.call(row, "data") ? { seq, kind: row.kind, at, data: row.data } : { seq, kind: row.kind, at };
      if (e.seq > sinceSeq) events.push(e);
    } catch { /* 坏行跳过 */ }
  }
  events.sort((a, b) => a.seq - b.seq);
  return { events, latestSeq, partyId: pid };
}
