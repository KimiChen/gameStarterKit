/**
 * 私房邀请码 lease 与 access ticket 的原子 Lua（Non-intrusive §6.7/§6.8；
 * 登记见 docs/SERVER.md §13）。复用 `core/infra/redisScripts.ts` 的 `defineScript` +
 * `evalshaWithReload` 装载器，⛔ 不另建装载器；与 `core/infra/lease.ts`（singleton
 * worker lease）无关，也 ⛔ 不与 `StoredIdem` 共用记录结构（§6 抬头）。
 *
 * 运行实例：coordination Redis（组内单实例，dev 缺省复用 durable 实例；⛔ 不能用可
 * 淘汰 cache 实例）。TICKET_ISSUE_CREATION 刻意跨 hash-tag（quota {uid} + ticket 无 tag）
 * ——单实例上合法；这些键族 ⛔ 不得搬到 cluster 化部署。
 *
 * leaseToken 比较：Lua 侧双方先 `redis.sha1hex` 再比（哈希后比较不泄露前缀匹配长度，
 * 恒定时间等价）；TS 侧绝不比较 leaseToken 原文（§6.7：CAS 恒定时间比较）。
 */
import { defineScript } from "../../infra/redisScripts";

/**
 * 分配六位码 lease：码 key 已存在（active 或 tombstone）→ `taken`（调用方有界重试换码，
 * ⛔ 重试耗尽 fail-closed，不扩大次数、不降级长码）；否则 generation 计数器 +1 并写入
 * active lease。generation 是 per-(sId,code) 单调分配代号（独立 INCR key，永不重置），
 * value 内嵌当次快照（§6.7）。
 * KEYS=[kInviteCode, kInviteCodeGen]
 * ARGV=[leaseTtlMs, roomId, mode, modeVersion, profile, sId, leaseToken]
 * 返回 ['taken'] | ['ok', generation]
 */
export const INVITE_CODE_ALLOCATE = defineScript("inviteCodeAllocate", `
if redis.call('EXISTS', KEYS[1]) == 1 then return { 'taken' } end
local generation = redis.call('INCR', KEYS[2])
local rec = cjson.encode({
  v = 1, state = 'active',
  roomId = ARGV[2], mode = ARGV[3], modeVersion = tonumber(ARGV[4]),
  profile = ARGV[5], sId = tonumber(ARGV[6]), leaseToken = ARGV[7],
  generation = generation,
})
-- EXISTS 闸后本键必然缺失（Lua 原子段内无并发写）；仍带 NX 保持「⛔ 不覆盖既有租约」的
-- 语义显式可见（§10.2 变异验证：改成无条件 SET 覆盖 → 并发双 lease，用例转红）。
redis.call('SET', KEYS[1], rec, 'NX', 'PX', ARGV[1])
return { 'ok', generation }
`);

/**
 * 续租 CAS：owner leaseToken（sha1 双侧哈希比较）+ roomId + sId 全部匹配才 PEXPIRE。
 * 旧房不得续租删除后来重用同一码的新租约（generation 换代后 leaseToken 必不同）。
 * KEYS=[kInviteCode]  ARGV=[leaseTokenSha1, leaseTtlMs, roomId, sId]
 * 返回 'renewed' | 'lost'（I/O 失败由 TS 侧归 'unknown'）
 */
export const INVITE_CODE_RENEW = defineScript("inviteCodeRenew", `
local cur = redis.call('GET', KEYS[1])
if cur == false then return 'lost' end
local ok, rec = pcall(cjson.decode, cur)
if not ok or type(rec) ~= 'table' or rec.v ~= 1 or rec.state ~= 'active' then return 'lost' end
if redis.sha1hex(tostring(rec.leaseToken)) ~= ARGV[1] then return 'lost' end
if tostring(rec.roomId) ~= ARGV[3] or tostring(rec.sId) ~= ARGV[4] then return 'lost' end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 'renewed'
`);

/**
 * Start 成功 / room dispose：active lease → tombstone（同一 key 写入墓碑 value、
 * PX=codeCooldownMs，⛔ **不是 DEL**——隔离期内 resolve 折叠为「码不存在」，分配器
 * SET NX 因 key 仍存在不会重用该码；期满 TTL 自然回收（§6.7 第 7 条）。
 * KEYS=[kInviteCode]  ARGV=[leaseTokenSha1, cooldownMs, roomId, sId]
 * 返回 'ok' | 'lost'
 */
export const INVITE_CODE_TOMBSTONE = defineScript("inviteCodeTombstone", `
local cur = redis.call('GET', KEYS[1])
if cur == false then return 'lost' end
local ok, rec = pcall(cjson.decode, cur)
if not ok or type(rec) ~= 'table' or rec.v ~= 1 or rec.state ~= 'active' then return 'lost' end
if redis.sha1hex(tostring(rec.leaseToken)) ~= ARGV[1] then return 'lost' end
if tostring(rec.roomId) ~= ARGV[3] or tostring(rec.sId) ~= ARGV[4] then return 'lost' end
redis.call('SET', KEYS[1], cjson.encode({ v = 1, state = 'tombstone', generation = rec.generation }), 'PX', ARGV[2])
return 'ok'
`);

/**
 * prepareCreate：配额原子检查 + 签发 creation ticket（§6.8——「原子检查该 uid 当前活跃
 * invite room 与未消费 creation ticket 的总数」）。过期 quota 成员先按 score 剪除；
 * 未消费 ticket 计入配额并随 exp 自然回收。时钟取 Lua `TIME`（09·R7：⛔ 禁止 app 传
 * 时钟做判定）。
 * KEYS=[kRoomTicketQuota, kRoomTicket]
 * ARGV=[maxPerUid, ticketTtlMs, jti, recordJson, quotaTtlMs]
 * 返回 ['quota'] | ['dup'] | ['ok']
 */
export const TICKET_ISSUE_CREATION = defineScript("roomTicketIssueCreation", `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) then return { 'quota' } end
if redis.call('EXISTS', KEYS[2]) == 1 then return { 'dup' } end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), 't:' .. ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
redis.call('SET', KEYS[2], ARGV[4], 'PX', ARGV[2])
return { 'ok' }
`);

/**
 * GameRoom onCreate 原子占有 creation claim（§6.8：由 claim 固定 expectedOwnerUid，
 * ⛔ 禁止「第一个入座者」/客户端自报 kind=create/players.size===0 推断房主）。
 * issued → claimed(roomId)，并把配额成员 t:<jti> 置换为 r:<roomId>
 * （score=Lua TIME + 房间存活上限；活跃私房继续占配额槽直到 dispose/score 过期）。
 * ⚠ KEYS[2]（quota）由 TS 侧先读记录取 uid 再构造——本脚本对记录做完整 CAS 复验，
 * 预读只用于 key 派生，不参与授权。
 * KEYS=[kRoomTicket, kRoomTicketQuota]
 * ARGV=[sId, mode, profile, roomId, roomHorizonMs, quotaTtlMs, uid]
 * 返回 ['missing'|'invalid'|'mismatch'] | ['state', s] | ['ok', uid, modeVersion]
 */
export const TICKET_CLAIM_CREATION = defineScript("roomTicketClaimCreation", `
local cur = redis.call('GET', KEYS[1])
if cur == false then return { 'missing' } end
local ok, rec = pcall(cjson.decode, cur)
if not ok or type(rec) ~= 'table' or rec.v ~= 1 or rec.purpose ~= 'create' then return { 'invalid' } end
if tostring(rec.sId) ~= ARGV[1] or rec.mode ~= ARGV[2] or rec.profile ~= ARGV[3]
  or tostring(rec.uid) ~= ARGV[7] then
  return { 'mismatch' }
end
if rec.state ~= 'issued' then return { 'state', tostring(rec.state) } end
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
rec.state = 'claimed'
rec.roomId = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(rec), 'KEEPTTL')
redis.call('ZREM', KEYS[2], 't:' .. tostring(rec.jti))
redis.call('ZADD', KEYS[2], now + tonumber(ARGV[5]), 'r:' .. ARGV[4])
redis.call('PEXPIRE', KEYS[2], ARGV[6])
return { 'ok', tostring(rec.uid), tostring(rec.modeVersion) }
`);

/**
 * join ticket 原子 claim（准入时序第 3 步）：issued → pending(session)，并在同一原子段
 * 校验 uid 之外的全部绑定（sId/roomId/mode/profile/code/lease generation）。
 * seated 后重放、pending 被他 session 持有都拒绝（§6.8 有界状态机）。
 * KEYS=[kRoomTicket]
 * ARGV=[session, sId, roomId, mode, profile, code, generation]
 * 返回 ['missing'|'invalid'|'mismatch'|'seated'] | ['pending', session] | ['ok', uid]
 */
export const TICKET_CLAIM_JOIN = defineScript("roomTicketClaimJoin", `
local cur = redis.call('GET', KEYS[1])
if cur == false then return { 'missing' } end
local ok, rec = pcall(cjson.decode, cur)
if not ok or type(rec) ~= 'table' or rec.v ~= 1 or rec.purpose ~= 'join' then return { 'invalid' } end
if tostring(rec.sId) ~= ARGV[2] or rec.roomId ~= ARGV[3] or rec.mode ~= ARGV[4]
  or rec.profile ~= ARGV[5] or tostring(rec.code) ~= ARGV[6]
  or tostring(rec.generation) ~= ARGV[7] then
  return { 'mismatch' }
end
if rec.state == 'seated' then return { 'seated' } end
if rec.state == 'pending' then return { 'pending', tostring(rec.session) } end
if rec.state ~= 'issued' then return { 'invalid' } end
rec.state = 'pending'
rec.session = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(rec), 'KEEPTTL')
return { 'ok', tostring(rec.uid) }
`);

/**
 * ticket 状态推进 CAS（准入时序第 2–5 步失败退回 / 第 6 步落座）：
 *  - pending(session) → issued：入座前安全失败，在原 exp 内恢复（KEEPTTL）；
 *  - pending(session) → seated：落座后不可回退，重放一律被 claim 的 seated 分支拒绝；
 *  - claimed(roomId) → seated：房主经 onJoin 校验 uid 后消费 creation claim。
 * KEYS=[kRoomTicket]  ARGV=[expectedState, holder(session|roomId), nextState]
 * 返回 'ok' | 'missing' | 'invalid' | 'state' | 'holder'
 */
export const TICKET_TRANSITION = defineScript("roomTicketTransition", `
local cur = redis.call('GET', KEYS[1])
if cur == false then return 'missing' end
local ok, rec = pcall(cjson.decode, cur)
if not ok or type(rec) ~= 'table' or rec.v ~= 1 then return 'invalid' end
if rec.state ~= ARGV[1] then return 'state' end
if ARGV[1] == 'pending' and tostring(rec.session) ~= ARGV[2] then return 'holder' end
if ARGV[1] == 'claimed' and tostring(rec.roomId) ~= ARGV[2] then return 'holder' end
if ARGV[3] == 'issued' then rec.session = nil end
rec.state = ARGV[3]
redis.call('SET', KEYS[1], cjson.encode(rec), 'KEEPTTL')
return 'ok'
`);
