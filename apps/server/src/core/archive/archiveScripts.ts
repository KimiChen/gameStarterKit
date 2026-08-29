/**
 * 冷档冻结层 Lua（模块状态见 docs/SERVER.md §9，
 * 脚本清单与返回值契约的登记点见 docs/SERVER.md §13）。
 *
 * `UNLINK` / 批量恢复 `HSET` **不是 fence 守卫的写**（08：那句「锁过期不需看门狗」只对 casHset 成立）：
 * 锁一过期就会盲删 / 盲覆盖别人刚写入的新数据。所以两条脚本都把「复检锁归属」和破坏性操作
 * 放进**同一条 Lua** 原子执行（09·L4）——锁已易主返回 'lost'，零破坏。这是正确性的唯一依靠，
 * 看门狗（09·L6）只是减少无用功。
 *
 * KEYS 全部带 `{uid}` hash-tag 同槽（09·R3），单条 Lua 才能原子操作。
 */
import { SCHEMA_VERSION } from "../infra/config";
import { kApplied, kAppliedPayload, kArchiveProof, kBagAll, kFence, kLock, kSess, kUser } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { defineScript, evalshaWithReload } from "../infra/redisScripts";

/**
 * `user_archive.snapshot` 的 JSON 形状（08 · user_archive 表）：
 * user 全字段 + 所有 bag 分片 + **applied 成员集合及 payload 绑定**（09·F2：pre-freeze op_id
 * 重放仍被去重，且严格阻止同一 op_id 换 effect）。
 * 全部值保持 Redis 原始字符串——cjson 不动它们，恢复时按原样写回。
 */
export interface ArchiveSnapshot {
  /** user:{uid} 全字段（含 fence/ver/schemaVersion，恢复时 fence 被 fence_hwm 覆盖）。 */
  user: Record<string, string>;
  /** 下标 = shard 0..BAG_SHARDS-1（与 kBagAll 顺序一致，S2：分片数永不随手改）。 */
  bag: Record<string, string>[];
  /** applied:{uid} 的 `ZRANGE 0 -1 WITHSCORES` 平铺数组 [member, score, ...]。 */
  applied: string[];
  /** applied:payload:{uid} 的 field→规范化 effect JSON；旧快照可能缺失该字段。 */
  appliedPayload?: Record<string, string>;
}

/**
 * A healthy uid has at most the current archive proof plus the in-flight attempt.
 * Keeping the scan ceiling local to the script makes PREPARE work bounded even if
 * an operator or an older build left a malformed proof hash behind.
 */
const ARCHIVE_PROOF_MAX_FIELDS = 64;

/**
 * MySQL PREPARED 写入前登记本次唯一 freeze_id。proof 是 HASH membership，不能用会被后续
 * attempt 覆盖的单值：resolve 只检查当前 archive 行自己的 freeze_id，迟到/失败分支互不遮蔽。
 */
export const PREPARE_ARCHIVE_CANDIDATE = defineScript("prepareArchiveCandidate", `
-- KEYS[1]=lock:{uid} KEYS[2]=user:{uid} KEYS[3]=archive:proof:{uid}
-- ARGV[1]=myFence ARGV[2]=verAtRead ARGV[3]=freezeId ARGV[4]=protectedFreezeId|''
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
if redis.call('HGET', KEYS[2], 'ver') ~= ARGV[2] then return 'changed' end
if redis.call('HGET', KEYS[2], 'schemaVersion') ~= '${SCHEMA_VERSION}' then return 'changed' end
if ARGV[3] == '' then return redis.error_reply('archive freeze id empty') end
if ARGV[4] ~= '' and redis.call('HEXISTS', KEYS[3], ARGV[4]) ~= 1 then
  return 'changed'
end
local proofCount = redis.call('HLEN', KEYS[3])
if proofCount > ${ARCHIVE_PROOF_MAX_FIELDS} then return 'proof_full' end
-- Positive-count HRANDFIELD returns every unique field when count >= HLEN.
-- proofCount is hard-capped above, so cleanup work and reply size are bounded.
if proofCount > 0 then
  local fields = redis.call('HRANDFIELD', KEYS[3], proofCount)
  for _, field in ipairs(fields) do
    if field ~= ARGV[4] then redis.call('HDEL', KEYS[3], field) end
  end
end
redis.call('HSET', KEYS[3], ARGV[3], '1')
return 'ok'
`);

/**
 * freezeCommit：同一条 Lua 内复检锁归属（09·L4）+ ver 未变（快照期间玩法写检测——
 * relayer 的 applyEffect 不持锁也不走 fence，只有 ver 能暴露它）→ 才 UNLINK。
 *
 * ⚠ KEYS[3]=fence:{uid} 计数器**保留不删**（偏离 08 原文，评审修正）：它的契约本就是
 * 「永不过期永不重置」——删除后冷档期间 acquireLease 会从 1 重新 INCR，若冷档期长到计数
 * 反超 fence_hwm，thaw 绝对写回 hwm = 计数**回退**，滞留 writer 的大号 fence 就能穿过
 * hash 字段 CAS（僵尸写被重新接受）。保留计数器 + thaw 侧 MAX 双保险闭死此窗口。
 *
 * 返回 'ok' | 'lost'（锁已易主）| 'changed'（快照已过期）| 'active'（扫描后有登录写入）。
 */
export const FREEZE_COMMIT = defineScript("freezeCommit", `
-- KEYS[1]=lock:{uid} KEYS[2]=user:{uid} KEYS[3]=fence:{uid} KEYS[4]=archive:proof:{uid}
-- KEYS[5]=sess:{uid}:sN KEYS[6]=applied:{uid} KEYS[7]=applied:payload:{uid} KEYS[8..]=bag:{uid}:0..N-1
-- ARGV[1]=myFence ARGV[2]=verAtRead ARGV[3]=freezeId
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
if redis.call('HGET', KEYS[2], 'ver') ~= ARGV[2] then return 'changed' end
if redis.call('HGET', KEYS[2], 'schemaVersion') ~= '${SCHEMA_VERSION}' then return 'changed' end
if redis.call('HEXISTS', KEYS[4], ARGV[3]) ~= 1 then return 'unprepared' end
if redis.call('EXISTS', KEYS[5]) == 1 then return 'active' end
-- ⛔ KEYS[3]=fence 与 KEYS[4]=archive proof 均保留：前者防发号回退，后者按 freeze_id 证明分支同源。
redis.call('UNLINK', KEYS[2], KEYS[6], KEYS[7])
for i = 8, #KEYS do redis.call('UNLINK', KEYS[i]) end
return 'ok'
`);

/**
 * thawRestore（08）：复检锁归属 → (ARCHIVE_NEWER 时先 UNLINK 陈旧档) → **单条 Lua 原子恢复
 * 全部 key**（09·F3，⛔ 禁止 pipeline——部分成功会留「有 user、无背包」的档，随后被清理任务
 * 判 LIVE 删掉 archive，背包永久清空）。
 *
 * fence_hwm 同时写**计数器 fence:{uid} 和 hash 的 fence 字段**（约束 3 / 09·F3）：
 * 真正拦僵尸写的是 hash 字段（casHset 拿它 CAS），只写计数器会让 CAS 放行
 * 「快照旧值 < 滞留 writer fence ≤ hwm」的僵尸写。
 *
 * 返回 'ok' | 'lost'。
 */
export const THAW_RESTORE = defineScript("thawRestore", `
-- KEYS[1]=lock:{uid} KEYS[2]=user:{uid} KEYS[3]=fence:{uid} KEYS[4]=archive:proof:{uid}
-- KEYS[5]=applied:{uid} KEYS[6]=applied:payload:{uid} KEYS[7..]=bag
-- ARGV[1]=myFence ARGV[2]=fenceHwm ARGV[3]=snapshotJson ARGV[4]=overwrite ARGV[5]=freezeId
if #KEYS < 7 then return redis.error_reply('archive restore key count') end
local function keyType(key)
  local reply = redis.call('TYPE', key)
  return reply['ok']
end
local function expectedType(key, expected)
  local actual = keyType(key)
  if actual ~= 'none' and actual ~= expected then
    return redis.error_reply('archive restore key type ' .. actual .. ' expected ' .. expected)
  end
  return nil
end
if keyType(KEYS[1]) ~= 'string' then return redis.error_reply('archive restore lock type') end
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
if ARGV[5] == '' then return redis.error_reply('archive freeze id empty') end
if ARGV[4] ~= '0' and ARGV[4] ~= '1' then return redis.error_reply('archive overwrite invalid') end
local hwm = tonumber(ARGV[2])
if hwm == nil or hwm < 0 or hwm ~= math.floor(hwm) or hwm > 9007199254740991 then
  return redis.error_reply('archive hwm invalid')
end
local counterRaw = redis.call('GET', KEYS[3])
local cur = 0
if counterRaw then
  cur = tonumber(counterRaw)
  if cur == nil or cur < 0 or cur ~= math.floor(cur) or cur > 9007199254740991 then
    return redis.error_reply('archive fence counter invalid')
  end
end
local typeError = expectedType(KEYS[2], 'hash')
if typeError then return typeError end
typeError = expectedType(KEYS[3], 'string')
if typeError then return typeError end
typeError = expectedType(KEYS[4], 'hash')
if typeError then return typeError end
typeError = expectedType(KEYS[5], 'zset')
if typeError then return typeError end
typeError = expectedType(KEYS[6], 'hash')
if typeError then return typeError end
for i = 7, #KEYS do
  typeError = expectedType(KEYS[i], 'hash')
  if typeError then return typeError end
end
if ARGV[4] == '0' then
  for i = 2, #KEYS do
    if i ~= 3 and i ~= 4 and keyType(KEYS[i]) ~= 'none' then
      return redis.error_reply('archive restore nonempty target')
    end
  end
end
local decoded, s = pcall(cjson.decode, ARGV[3])
if not decoded or type(s) ~= 'table' then
  return redis.error_reply('archive snapshot invalid json')
end
local topCount = 0
for key, _ in pairs(s) do
  if key ~= 'user' and key ~= 'bag' and key ~= 'applied' and key ~= 'appliedPayload' then
    return redis.error_reply('archive snapshot key invalid')
  end
  topCount = topCount + 1
end
if topCount < 3 or topCount > 4 or type(s.user) ~= 'table'
  or type(s.user.schemaVersion) ~= 'string' or type(s.user.ver) ~= 'string' then
  return redis.error_reply('archive snapshot user invalid')
end
if s.user.schemaVersion ~= '${SCHEMA_VERSION}' then
  return redis.error_reply('archive snapshot schema invalid')
end
local function canonicalUserInt(value)
  if type(value) ~= 'string' or not string.match(value, '^%d+$') then return nil end
  if #value > 1 and string.sub(value, 1, 1) == '0' then return nil end
  local number = tonumber(value)
  if number == nil or number < 0 or number ~= math.floor(number) or number > 9007199254740991 then
    return nil
  end
  return number
end
if canonicalUserInt(s.user.ver) == nil then
  return redis.error_reply('archive snapshot ver invalid')
end
if canonicalUserInt(s.user.fence) == nil then
  return redis.error_reply('archive snapshot fence invalid')
end
if s.user.createdAt ~= nil and canonicalUserInt(s.user.createdAt) == nil then
  return redis.error_reply('archive snapshot createdAt invalid')
end
if canonicalUserInt(s.user.characterRegistrationCheckedAt) == nil then
  return redis.error_reply('archive snapshot characterRegistrationCheckedAt invalid')
end
for field, value in pairs(s.user) do
  if type(field) ~= 'string' or type(value) ~= 'string' then
    return redis.error_reply('archive snapshot user field invalid')
  end
end
if type(s.bag) ~= 'table' or #s.bag ~= (#KEYS - 6) then
  return redis.error_reply('archive snapshot bag invalid')
end
local bagCount = 0
for key, _ in pairs(s.bag) do
  if type(key) ~= 'number' or key ~= math.floor(key) or key < 1 or key > #s.bag then
    return redis.error_reply('archive snapshot bag key invalid')
  end
  bagCount = bagCount + 1
end
if bagCount ~= #s.bag then return redis.error_reply('archive snapshot bag sparse') end
for _, shard in ipairs(s.bag) do
  if type(shard) ~= 'table' then return redis.error_reply('archive snapshot bag shard invalid') end
  for field, value in pairs(shard) do
    if type(field) ~= 'string' or type(value) ~= 'string' then
      return redis.error_reply('archive snapshot bag field invalid')
    end
  end
end
if type(s.applied) ~= 'table' or (#s.applied % 2) ~= 0 then
  return redis.error_reply('archive snapshot applied invalid')
end
local appliedCount = 0
for key, _ in pairs(s.applied) do
  if type(key) ~= 'number' or key ~= math.floor(key) or key < 1 or key > #s.applied then
    return redis.error_reply('archive snapshot applied key invalid')
  end
  appliedCount = appliedCount + 1
end
if appliedCount ~= #s.applied then return redis.error_reply('archive snapshot applied sparse') end
for i = 1, #s.applied, 2 do
  local score = type(s.applied[i + 1]) == 'string' and tonumber(s.applied[i + 1]) or nil
  if type(s.applied[i]) ~= 'string' or type(s.applied[i + 1]) ~= 'string'
    or not string.match(s.applied[i + 1], '^[0-9]+$') or score == nil or score < 0
    or score ~= math.floor(score) or score > 9007199254740991 then
    return redis.error_reply('archive snapshot applied entry invalid')
  end
end
if s.appliedPayload ~= nil then
  if type(s.appliedPayload) ~= 'table' then return redis.error_reply('archive snapshot payload invalid') end
  for op, payload in pairs(s.appliedPayload) do
    if type(op) ~= 'string' or type(payload) ~= 'string' then
      return redis.error_reply('archive snapshot payload entry invalid')
    end
  end
end
if ARGV[4] == '1' then
  -- overwrite（ARCHIVE_NEWER/PITR）：删陈旧档，但 ⛔ KEYS[3]=fence 计数器保留——
  -- acquireLease 是「先 INCR 再抢锁」，抢锁**失败**者也推计数器：resolve 读完计数器到
  -- 本 Lua 执行之间（TOCTOU），并发失败抢锁可把计数推过 hwm——删除后按 hwm 恢复
  -- = 计数回退、已发号被复用（评审修正，与 freezeCommit 同一契约：计数器永不重置）
  redis.call('UNLINK', KEYS[2], KEYS[5], KEYS[6])
  for i = 7, #KEYS do redis.call('UNLINK', KEYS[i]) end
end
-- 恢复 user 全字段（值是 Redis 原始字符串，原样写回）
for f, v in pairs(s.user) do
  redis.call('HSET', KEYS[2], f, v)
end
-- 恢复 bag：s.bag[i]（Lua 1 起）对应 KEYS[6+i] = shard i-1（与 kBagAll 顺序一致）
if s.bag then
  for i, shard in ipairs(s.bag) do
    for f, v in pairs(shard) do
      redis.call('HSET', KEYS[6 + i], f, v)
    end
  end
end
-- Restore payload bindings when present.  Older snapshots omit this optional member;
-- their applied markers intentionally remain unbound and therefore fail closed on retry.
if s.appliedPayload then
  for op, payload in pairs(s.appliedPayload) do
    redis.call('HSET', KEYS[6], op, payload)
  end
end
-- 恢复 applied（WITHSCORES 平铺 [member, score, ...]）——pre-freeze op_id 重放仍判 dup（09·F2）
if s.applied then
  for i = 1, #s.applied, 2 do
    redis.call('ZADD', KEYS[5], s.applied[i + 1], s.applied[i])
  end
end
-- fence 双写：hash 字段 + 计数器（约束 3），取 MAX(当前计数器, fence_hwm)——
-- ⛔ 不许绝对写回 hwm：计数器若已超 hwm（冷档期发号/历史残留），回退 = 滞留 writer
-- 的大号 fence 能穿过 hash CAS（僵尸写复活）；MAX 保证单调性在任何交错下不破
local fence = math.max(cur, hwm)
redis.call('HSET', KEYS[2], 'fence', fence)
redis.call('SET',  KEYS[3], fence)
redis.call('HSET', KEYS[4], ARGV[5], '1')
return 'ok'
`);

/** thawRestore 的 KEYS 排列（脚本注释里的顺序，⛔ 不要改动次序）。 */
const archiveKeys = (uid: string): string[] =>
  [kLock(uid), kUser(uid), kFence(uid), kArchiveProof(uid), kApplied(uid), kAppliedPayload(uid), ...kBagAll(uid)];

const freezeKeys = (uid: string, sId: number): string[] => [
  kLock(uid), kUser(uid), kFence(uid), kArchiveProof(uid), kSess(uid, sId),
  kApplied(uid), kAppliedPayload(uid), ...kBagAll(uid),
];

export async function prepareArchiveCandidate(
  uid: string,
  myFence: number,
  verAtRead: string,
  freezeId: string,
  protectedFreezeId: string | null,
): Promise<"ok" | "lost" | "changed" | "proof_full"> {
  const result = await evalshaWithReload(
    clientFor(uid),
    PREPARE_ARCHIVE_CANDIDATE,
    [kLock(uid), kUser(uid), kArchiveProof(uid)],
    [String(myFence), verAtRead, freezeId, protectedFreezeId ?? ""],
  );
  if (result === "ok" || result === "lost" || result === "changed" || result === "proof_full") {
    return result;
  }
  throw new Error(`prepareArchiveCandidate 返回非法结果：${String(result)}`);
}

/** freezeCommit 包装：'changed' = 快照期间有玩法写（如 relayer applyEffect），放弃本轮。 */
export async function freezeCommit(
  uid: string, sId: number, myFence: number, verAtRead: string, freezeId: string,
): Promise<"ok" | "lost" | "changed" | "active"> {
  const result = await evalshaWithReload(
    clientFor(uid), FREEZE_COMMIT, freezeKeys(uid, sId),
    [String(myFence), verAtRead, freezeId],
  );
  if (result === "ok" || result === "lost" || result === "changed" || result === "active") {
    return result;
  }
  throw new Error(`freezeCommit 返回非法结果：${String(result)}`);
}

/** thawRestore 包装。snapshot 若来自 MySQL JSON 列已被 mysql2 解析成对象——stringify 统一在这里做（09·DB8）。 */
export async function thawRestore(
  uid: string,
  myFence: number,
  fenceHwm: number,
  snapshot: ArchiveSnapshot,
  overwrite: boolean,
  freezeId: string,
): Promise<"ok" | "lost"> {
  return await evalshaWithReload(
    clientFor(uid), THAW_RESTORE, archiveKeys(uid),
    [String(myFence), String(fenceHwm), JSON.stringify(snapshot), overwrite ? "1" : "0", freezeId],
  ) as "ok" | "lost";
}
