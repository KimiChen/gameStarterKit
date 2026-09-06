/**
 * Lua 脚本注册 + `EVALSHA` / `NOSCRIPT` 自动重载（09·R7）。
 *
 * 脚本清单与返回值契约的登记点见 docs/SERVER.md §13。
 * freezeCommit / thawRestore 属冷档模块，随 archive/ 交付。
 *
 * ⚠ 返回值 `cold` = `user:{uid}` 不存在。任何写路径不得隐式创建档（09·R2），
 *   只有建号与 thaw 能创建。收到 `cold` → `ensureLive(uid)` → 重试。
 */
import { createHash } from "node:crypto";
import type Redis from "ioredis";
import {
  EFFECT_FIELD_ALLOWLIST, EFFECT_MAX_COUNT, EFFECT_MAX_DELTA, EFFECT_MAX_FIELD_LENGTH,
  EFFECT_MAX_GRANTS, EFFECT_MAX_ITEM_ID, EFFECT_MAX_QUANTITY, EFFECT_MAX_VALUE_BYTES,
  EFFECT_FIELD_VALUE_RULES, EFFECT_RESERVED_FIELDS, EFFECT_SCHEMA_VERSION,
} from "@game/shared";
import { BAG_SHARDS, SCHEMA_VERSION } from "./config";
import { USER_GENERIC_WRITE_RESERVED_FIELDS } from "../userSchema";

export interface RedisScript { readonly name: string; readonly lua: string; readonly sha: string }

/** 定义 Lua 脚本（sha 本地算好供 EVALSHA）。模块专属脚本（archive 等）在各自文件用它定义。 */
export const defineScript = (name: string, lua: string): RedisScript =>
  ({ name, lua, sha: createHash("sha1").update(lua).digest("hex") });
const script = defineScript;
const luaSet = (values: readonly string[]): string =>
  `{${values.map((value) => `[${JSON.stringify(value)}]=true`).join(",")}}`;
const LUA_USER_GENERIC_RESERVED = luaSet(USER_GENERIC_WRITE_RESERVED_FIELDS);

/**
 * 原子读取 user schema 元数据与调用方字段。返回首项 `absent`，或
 * `[live, schemaVersion, ver, fence, createdAt, checkedAt, ...requested]`。
 * 脚本只读，供 loadFields 与 ensureLive 共用同一个无撕裂快照。
 */
export const READ_USER_FIELDS = script("readUserFields", `
local kind = redis.call('TYPE', KEYS[1]).ok
if kind == 'none' then return { 'absent' } end
if kind ~= 'hash' then return redis.error_reply('user key type ' .. kind .. ' expected hash') end
local names = {
  'schemaVersion', 'ver', 'fence', 'createdAt', 'characterRegistrationCheckedAt'
}
for i = 1, #ARGV do names[#names + 1] = ARGV[i] end
local values = redis.call('HMGET', KEYS[1], unpack(names))
local result = { 'live' }
for i = 1, #values do result[#result + 1] = values[i] or false end
return result
`);

/**
 * 锁内热档 v1→v2 原子迁移。所有来源值与目标值在首个 HSET 前完成类型、范围和 CAS
 * preflight；relayer 在锁外 bump ver 时返回 changed，由 wrapper 重读 registry 后重试。
 */
export const MIGRATE_USER_SCHEMA = script("migrateUserSchema", `
-- KEYS[1]=lock KEYS[2]=user
-- ARGV=[myFence, expectedSchema, expectedVer, expectedFence, expectedCreatedAt|'',
--       expectedCheckedAt|'', targetSchema, targetVer, targetCheckedAt]
local function keyType(key) return redis.call('TYPE', key).ok end
local function canonicalUnsigned(value)
  if type(value) ~= 'string' or not string.match(value, '^%d+$') then return nil end
  if #value > 1 and string.sub(value, 1, 1) == '0' then return nil end
  local number = tonumber(value)
  if number == nil or number < 0 or number ~= math.floor(number) or number > 9007199254740991 then
    return nil
  end
  return number
end
if #KEYS ~= 2 or #ARGV ~= 9 then return redis.error_reply('user schema migrate argv invalid') end
if keyType(KEYS[1]) ~= 'string' then return redis.error_reply('user schema migrate lock type') end
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
local userType = keyType(KEYS[2])
if userType == 'none' then return 'cold' end
if userType ~= 'hash' then return redis.error_reply('user schema migrate user type') end
if (ARGV[2] ~= '${SCHEMA_VERSION - 1}' and ARGV[2] ~= '${SCHEMA_VERSION}')
  or ARGV[7] ~= '${SCHEMA_VERSION}' then
  return redis.error_reply('user schema migrate version plan invalid')
end
local currentSchema = redis.call('HGET', KEYS[2], 'schemaVersion')
if currentSchema ~= ARGV[2] then return 'changed' end
local currentVer = redis.call('HGET', KEYS[2], 'ver')
local currentFence = redis.call('HGET', KEYS[2], 'fence')
local currentCreatedAt = redis.call('HGET', KEYS[2], 'createdAt')
local currentCheckedAt = redis.call('HGET', KEYS[2], 'characterRegistrationCheckedAt')
local parsedVer = canonicalUnsigned(currentVer)
if parsedVer == nil or canonicalUnsigned(currentFence) == nil then
  return redis.error_reply('user schema migrate metadata invalid')
end
if currentCreatedAt ~= false and canonicalUnsigned(currentCreatedAt) == nil then
  return redis.error_reply('user schema migrate createdAt invalid')
end
if currentCheckedAt ~= false and canonicalUnsigned(currentCheckedAt) == nil then
  return redis.error_reply('user schema migrate checkedAt invalid')
end
if ARGV[2] == '${SCHEMA_VERSION}' and currentCheckedAt == false then
  return redis.error_reply('user schema migrate checkedAt missing')
end
if currentVer ~= ARGV[3] or currentFence ~= ARGV[4] then return 'changed' end
if (ARGV[5] == '' and currentCreatedAt ~= false)
  or (ARGV[5] ~= '' and currentCreatedAt ~= ARGV[5]) then
  return 'changed'
end
if (ARGV[6] == '' and currentCheckedAt ~= false)
  or (ARGV[6] ~= '' and currentCheckedAt ~= ARGV[6]) then
  return 'changed'
end
if ARGV[2] == '${SCHEMA_VERSION}' then
  if ARGV[8] ~= currentVer or ARGV[9] ~= currentCheckedAt then
    return redis.error_reply('user schema current plan invalid')
  end
  return 'current'
end
local targetVer = canonicalUnsigned(ARGV[8])
if targetVer == nil or targetVer ~= parsedVer + 1 then
  return redis.error_reply('user schema migrate target ver invalid')
end
if canonicalUnsigned(ARGV[9]) == nil then
  return redis.error_reply('user schema migrate checkedAt invalid')
end
redis.call('HSET', KEYS[2],
  'schemaVersion', ARGV[7],
  'ver', ARGV[8],
  'characterRegistrationCheckedAt', ARGV[9])
return 'ok'
`);

/**
 * 交互式玩法写：fence CAS + 只写脏字段 + bump ver（03）。
 * 返回 'ok' | 'stale' | 'cold'。
 */
export const CAS_HSET = script("casHset", `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'cold' end
if #ARGV < 3 or (#ARGV % 2) ~= 1 then return redis.error_reply('casHset argv invalid') end
local reserved = ${LUA_USER_GENERIC_RESERVED}
for i = 2, #ARGV, 2 do
  if reserved[ARGV[i]] == true then return redis.error_reply('casHset reserved field ' .. ARGV[i]) end
end
if redis.call('HGET', KEYS[1], 'schemaVersion') ~= '${SCHEMA_VERSION}' then
  return redis.error_reply('casHset schema invalid')
end
local rawFence = redis.call('HGET', KEYS[1], 'fence')
local rawVer = redis.call('HGET', KEYS[1], 'ver')
if rawFence == false or rawVer == false then return redis.error_reply('casHset metadata invalid') end
local cur = tonumber(rawFence)
local requested = tonumber(ARGV[1])
local ver = tonumber(rawVer)
if cur == nil or cur < 0 or cur ~= math.floor(cur) or cur > 9007199254740991
  or requested == nil or requested < 0 or requested ~= math.floor(requested) or requested > 9007199254740991
  or ver == nil or ver < 0 or ver ~= math.floor(ver) or ver >= 9007199254740991 then
  return redis.error_reply('casHset metadata invalid')
end
if cur > requested then return 'stale' end

for i = 2, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i+1])
end
redis.call('HSET', KEYS[1], 'fence', ARGV[1], 'ver', tostring(ver + 1))
return 'ok'
`);

/**
 * outbox intent apply：op_id 幂等，⛔ 无 fence CAS（09·X3：已提交的 intent 是权威决定）。
 * 返回 'ok' | 'dup' | 'cold'（没有 'stale'）。负数下溢回补到 0 并上报（09·X8）：
 * 下溢时返回 'ok:<明细>'，wrapper 记异常后仍视作 'ok'。
 * ARGV[2] now_ms 仅作 applied 的 ZADD score、不参与判定（04 既定契约，不违反 09·R7）。
 */
/**
 * 共享 effect 契约的 Lua 侧镜像。这里不能只依赖 TypeScript validator：relayer 可能直接
 * 从 MySQL 读取历史 JSON，且所有字段写入必须在同一 Redis 脚本内完成。
 * KEYS = [user, applied, appliedPayload, bag0..bagN, ...kitKeys]。
 * ARGV = [opId, now_ms, effectJson, kitMapJson?]——ARGV[4]（docs/KIT.md §4「effect kind 登记通道」）是
 * `{ "<kit:kitId:name>": { k: 1-based KEYS 序号, f: 字段, m: delta 上限 } }`，由 outbox.kitEffectKeysFor 从
 * KIT_EFFECT_KINDS 投影（只含本 effect 出现的 kind）；缺省 / 空串 = 无 kit 键（既有调用形态不变）。
 * kit 键必须紧随 bag 分片之后且被 map 一一引用：`#KEYS == LUA_KEY_COUNT + map 引用的去重键数`。
 * kit grant = 对 KEYS[k] 的 HASH 字段 f 做整数累加（delta ∈ [1, m]），沿用「先验后写」而不是裸 HINCRBY：
 * 坏的现值在首个写入前就拒绝，不会半途 WRONGTYPE / 非整数报错留下部分写入。
 */
/** ARGV[4] 的 TS 侧形态（outbox.kitEffectKeysFor 产出）。 */
export type KitEffectKeyMap = Readonly<Record<string, { readonly k: number; readonly f: string; readonly m: number }>>;
const LUA_EFFECT_FIELDS = luaSet(EFFECT_FIELD_ALLOWLIST);
const LUA_EFFECT_RESERVED = luaSet(EFFECT_RESERVED_FIELDS);
const LUA_EFFECT_FIELD_RULES = `{${Object.entries(EFFECT_FIELD_VALUE_RULES).map(([field, rule]) => {
  if (rule.kind === "flag") return `[${JSON.stringify(field)}]={kind='flag'}`;
  if (rule.kind === "integer") {
    return `[${JSON.stringify(field)}]={kind='integer',min=${rule.min},max=${rule.max}}`;
  }
  return `[${JSON.stringify(field)}]={kind='text',max=${rule.maxBytes}}`;
}).join(",")}}`;
const LUA_EFFECT_VERSION = String(EFFECT_SCHEMA_VERSION);
const LUA_MAX_GRANTS = String(EFFECT_MAX_GRANTS);
const LUA_MAX_QUANTITY = String(EFFECT_MAX_QUANTITY);
const LUA_MAX_ITEM_ID = String(EFFECT_MAX_ITEM_ID);
const LUA_MAX_COUNT = String(EFFECT_MAX_COUNT);
const LUA_MAX_DELTA = String(EFFECT_MAX_DELTA);
const LUA_MAX_FIELD_LENGTH = String(EFFECT_MAX_FIELD_LENGTH);
const LUA_MAX_VALUE_BYTES = String(EFFECT_MAX_VALUE_BYTES);
const LUA_MAX_SAFE_INTEGER = String(Number.MAX_SAFE_INTEGER);
const LUA_KEY_COUNT = String(3 + BAG_SHARDS);

export const APPLY_EFFECT = script("applyEffect", `
-- Return a stable domain error without touching any key. The caller maps err:* to InvalidEffectError.
local function invalid(code) return 'err:' .. code end
local function exact(tbl, expected, expectedCount)
  if type(tbl) ~= 'table' then return false end
  local count = 0
  for key, _ in pairs(tbl) do
    count = count + 1
    if expected[key] ~= true then return false end
  end
  if count ~= expectedCount then return false end
  for key, _ in pairs(expected) do
    if tbl[key] == nil then return false end
  end
  return true
end
local function intIn(value, min, max)
  return type(value) == 'number' and value == math.floor(value) and value >= min and value <= max
end

-- A missing user is a normal cold result, but malformed effects are rejected before this script
-- can create any applied/bag key. The three first keys are user/applied/payload-hash.
if redis.call('EXISTS', KEYS[1]) == 0 then return 'cold' end
-- kit effect kind 投影（ARGV[4]，可缺省）：kind -> { k = KEYS 序号, f = 字段, m = 上限 }。
-- 键数校验 = 基础键数 + map 引用的去重 kit 键数；每个 kit 键序号都必须落在 bag 之后且被引用。
local kitMap = {}
local kitKeyCount = 0
if ARGV[4] ~= nil and ARGV[4] ~= '' then
  local kitDecoded, kitRaw = pcall(cjson.decode, ARGV[4])
  if not kitDecoded or type(kitRaw) ~= 'table' then return invalid('EFFECT_DATA_CORRUPT') end
  local seenKitKeys = {}
  for kind, spec in pairs(kitRaw) do
    if type(kind) ~= 'string' or string.sub(kind, 1, 4) ~= 'kit:' then return invalid('EFFECT_DATA_CORRUPT') end
    if not exact(spec, { k = true, f = true, m = true }, 3) then return invalid('EFFECT_DATA_CORRUPT') end
    if not intIn(spec.k, ${LUA_KEY_COUNT} + 1, #KEYS) then return invalid('EFFECT_DATA_CORRUPT') end
    if type(spec.f) ~= 'string' or #spec.f < 1 or #spec.f > ${LUA_MAX_FIELD_LENGTH}
      or not string.match(spec.f, '^[A-Za-z][A-Za-z0-9_]*$') then
      return invalid('EFFECT_DATA_CORRUPT')
    end
    if not intIn(spec.m, 1, ${LUA_MAX_SAFE_INTEGER}) then return invalid('EFFECT_DATA_CORRUPT') end
    if not seenKitKeys[spec.k] then
      seenKitKeys[spec.k] = true
      kitKeyCount = kitKeyCount + 1
    end
    kitMap[kind] = spec
  end
end
if #KEYS ~= ${LUA_KEY_COUNT} + kitKeyCount then return invalid('EFFECT_DATA_CORRUPT') end
-- Redis Lua does not roll back writes when a later command raises a WRONGTYPE error.
-- Check every target up front; missing bag/applied keys are valid because HSET/ZADD
-- creates them during the apply pass. No other client can change a key type while
-- this script is running, so the preflight remains valid through all writes.
local function expectedType(key, expected)
  local kind = redis.call('TYPE', key)
  local actual = kind.ok
  return actual == 'none' or actual == expected
end
for i = 1, #KEYS do
  for j = i + 1, #KEYS do
    if KEYS[i] == KEYS[j] then return invalid('EFFECT_DATA_CORRUPT') end
  end
end
if not expectedType(KEYS[1], 'hash')
  or not expectedType(KEYS[2], 'zset')
  or not expectedType(KEYS[3], 'hash') then
  return invalid('EFFECT_DATA_CORRUPT')
end
for i = 4, #KEYS do
  if not expectedType(KEYS[i], 'hash') then return invalid('EFFECT_DATA_CORRUPT') end
end
if redis.call('HGET', KEYS[1], 'schemaVersion') ~= '${SCHEMA_VERSION}' then
  return invalid('EFFECT_DATA_CORRUPT')
end
local decoded, eff = pcall(cjson.decode, ARGV[3])
if not decoded or type(eff) ~= 'table' then return invalid('EFFECT_NOT_OBJECT') end
if not exact(eff, { schemaVersion = true, grants = true }, 2) then return invalid('EFFECT_KEYS') end
if eff.schemaVersion ~= ${LUA_EFFECT_VERSION} then return invalid('EFFECT_SCHEMA_VERSION') end
if type(eff.grants) ~= 'table' then return invalid('EFFECT_GRANTS') end

local N = ${LUA_KEY_COUNT} - 3
if N < 1 then return invalid('EFFECT_DATA_CORRUPT') end
local applyAt = tonumber(ARGV[2])
if not intIn(applyAt, 0, ${LUA_MAX_SAFE_INTEGER}) then return invalid('EFFECT_DATA_CORRUPT') end
local grantCount = #eff.grants
if grantCount > ${LUA_MAX_GRANTS} then return invalid('EFFECT_TOO_LARGE') end
-- cjson arrays must be dense and must not carry named properties.
local seenCount = 0
for key, _ in pairs(eff.grants) do
  if type(key) ~= 'number' or key ~= math.floor(key) or key < 1 or key > grantCount then
    return invalid('EFFECT_GRANTS')
  end
  seenCount = seenCount + 1
end
if seenCount ~= grantCount then return invalid('EFFECT_GRANTS') end

local allowFields = ${LUA_EFFECT_FIELDS}
local reservedFields = ${LUA_EFFECT_RESERVED}
local fieldRules = ${LUA_EFFECT_FIELD_RULES}
local itemDeltas = {}
local itemShards = {}
local starDelta = 0
local hasStar = false
local setFields = {}
local kitDeltas = {}
local under = {}
local quantity = 0

for i = 1, grantCount do
  local g = eff.grants[i]
  if type(g) ~= 'table' or type(g.kind) ~= 'string' then
    return invalid('EFFECT_UNKNOWN_KIND')
  end
  if g.kind == 'item' then
    if not exact(g, { kind = true, itemId = true, count = true }, 3) then return invalid('EFFECT_GRANT_KEYS') end
    if not intIn(g.itemId, 1, ${LUA_MAX_ITEM_ID}) then return invalid('EFFECT_ITEM_ID') end
    if not intIn(g.count, -${LUA_MAX_COUNT}, ${LUA_MAX_COUNT}) or g.count == 0 then return invalid('EFFECT_COUNT') end
    quantity = quantity + math.abs(g.count)
    if quantity > ${LUA_MAX_QUANTITY} then return invalid('EFFECT_QUANTITY') end
    local field = tostring(g.itemId)
    itemDeltas[field] = (itemDeltas[field] or 0) + g.count
    itemShards[field] = g.itemId % N
  elseif g.kind == 'star' then
    if not exact(g, { kind = true, delta = true }, 2) then return invalid('EFFECT_GRANT_KEYS') end
    if not intIn(g.delta, -${LUA_MAX_DELTA}, ${LUA_MAX_DELTA}) or g.delta == 0 then return invalid('EFFECT_DELTA') end
    quantity = quantity + math.abs(g.delta)
    if quantity > ${LUA_MAX_QUANTITY} then return invalid('EFFECT_QUANTITY') end
    starDelta = starDelta + g.delta
    hasStar = true
  elseif g.kind == 'setField' then
    if not exact(g, { kind = true, field = true, value = true }, 3) then return invalid('EFFECT_GRANT_KEYS') end
    if type(g.field) ~= 'string' or #g.field < 1 or #g.field > ${LUA_MAX_FIELD_LENGTH}
      or not string.match(g.field, '^[A-Za-z][A-Za-z0-9_]*$') then
      return invalid('EFFECT_FIELD')
    end
    if reservedFields[g.field] == true then return invalid('EFFECT_RESERVED_FIELD') end
    if allowFields[g.field] ~= true then return invalid('EFFECT_FIELD') end
    -- Redis Lua strings are byte sequences; #g.value is the UTF-8 byte length
    -- used by the shared validator as well.
    if type(g.value) ~= 'string' or #g.value > ${LUA_MAX_VALUE_BYTES} then return invalid('EFFECT_VALUE') end
    local rule = fieldRules[g.field]
    if rule == nil then return invalid('EFFECT_FIELD') end
    if rule.kind == 'flag' then
      if g.value ~= '0' and g.value ~= '1' then return invalid('EFFECT_VALUE') end
    elseif rule.kind == 'integer' then
      if not string.match(g.value, '^-?[0-9]+$') then return invalid('EFFECT_VALUE') end
      local numeric = tonumber(g.value)
      if numeric == nil or not intIn(numeric, rule.min, rule.max) then return invalid('EFFECT_VALUE') end
    elseif rule.kind == 'text' then
      if #g.value > rule.max then return invalid('EFFECT_VALUE') end
    else
      return invalid('EFFECT_DATA_CORRUPT')
    end
    -- Last setField in the same effect wins, matching the deterministic array order in TS.
    setFields[g.field] = g.value
  elseif string.sub(g.kind, 1, 4) == 'kit:' then
    -- kit effect kind（KIT.md §4）：必须在 ARGV[4] 投影表内，否则与 TS validator 同码拒绝。
    local spec = kitMap[g.kind]
    if spec == nil then return invalid('EFFECT_UNKNOWN_KIND') end
    if not exact(g, { kind = true, delta = true }, 2) then return invalid('EFFECT_GRANT_KEYS') end
    if not intIn(g.delta, 1, spec.m) then return invalid('EFFECT_DELTA') end
    quantity = quantity + g.delta
    if quantity > ${LUA_MAX_QUANTITY} then return invalid('EFFECT_QUANTITY') end
    local slot = kitDeltas[spec.k]
    if slot == nil then slot = {}; kitDeltas[spec.k] = slot end
    slot[spec.f] = (slot[spec.f] or 0) + g.delta
  else
    return invalid('EFFECT_UNKNOWN_KIND')
  end
end

-- The applied ZSET is the exactly-once marker. Bind it to the canonical payload so reusing an
-- op-id for a different payload is a stable conflict instead of a silent duplicate.
if redis.call('ZSCORE', KEYS[2], ARGV[1]) then
  local previous = redis.call('HGET', KEYS[3], ARGV[1])
  -- A marker without a payload binding is legacy/partial state.  It cannot prove that
  -- this retry carries the same effect, so fail closed instead of silently accepting
  -- a potentially different payload as a duplicate.
  if previous == ARGV[3] then return 'dup' end
  return 'conflict'
end

-- Validate every current numeric value before the first write. HSET (rather than HINCRBY) in the
-- apply pass means a malformed pre-existing hash cannot fail half way through the effect.
local verRaw = redis.call('HGET', KEYS[1], 'ver')
if verRaw == false then return invalid('EFFECT_DATA_CORRUPT') end
local ver = tonumber(verRaw)
if not intIn(ver, 0, ${LUA_MAX_SAFE_INTEGER})
  or ver >= ${LUA_MAX_SAFE_INTEGER} then return invalid('EFFECT_DATA_CORRUPT') end
local itemValues = {}
for field, delta in pairs(itemDeltas) do
  local shard = itemShards[field]
  local currentRaw = redis.call('HGET', KEYS[4 + shard], field) or '0'
  local current = tonumber(currentRaw)
  if not intIn(current, 0, ${LUA_MAX_SAFE_INTEGER}) then return invalid('EFFECT_DATA_CORRUPT') end
  if delta > 0 and current > ${LUA_MAX_SAFE_INTEGER} - delta then return invalid('EFFECT_DATA_CORRUPT') end
  local nextValue = current + delta
  if nextValue < 0 then
    nextValue = 0
    under[#under + 1] = 'item:' .. field
  end
  if not intIn(nextValue, 0, ${LUA_MAX_SAFE_INTEGER}) then return invalid('EFFECT_DATA_CORRUPT') end
  itemValues[field] = nextValue
end
local starValue = nil
if hasStar then
  local currentRaw = redis.call('HGET', KEYS[1], 'star') or '0'
  local current = tonumber(currentRaw)
  if not intIn(current, 0, ${LUA_MAX_SAFE_INTEGER}) then return invalid('EFFECT_DATA_CORRUPT') end
  if starDelta > 0 and current > ${LUA_MAX_SAFE_INTEGER} - starDelta then return invalid('EFFECT_DATA_CORRUPT') end
  starValue = current + starDelta
  if starValue < 0 then
    starValue = 0
    under[#under + 1] = 'star'
  end
  if not intIn(starValue, 0, ${LUA_MAX_SAFE_INTEGER}) then return invalid('EFFECT_DATA_CORRUPT') end
end
local kitValues = {}
for keyIndex, fields in pairs(kitDeltas) do
  local values = {}
  for field, delta in pairs(fields) do
    local currentRaw = redis.call('HGET', KEYS[keyIndex], field) or '0'
    local current = tonumber(currentRaw)
    if not intIn(current, 0, ${LUA_MAX_SAFE_INTEGER}) then return invalid('EFFECT_DATA_CORRUPT') end
    if current > ${LUA_MAX_SAFE_INTEGER} - delta then return invalid('EFFECT_DATA_CORRUPT') end
    values[field] = current + delta
  end
  kitValues[keyIndex] = values
end

-- Apply pass: all shape/range/current-value checks above have completed successfully.
for field, value in pairs(itemValues) do
  redis.call('HSET', KEYS[4 + itemShards[field]], field, tostring(value))
end
if starValue ~= nil then redis.call('HSET', KEYS[1], 'star', tostring(starValue)) end
for field, value in pairs(setFields) do
  redis.call('HSET', KEYS[1], field, value)
end
for keyIndex, fields in pairs(kitValues) do
  for field, value in pairs(fields) do
    redis.call('HSET', KEYS[keyIndex], field, tostring(value))
  end
end
redis.call('HSET', KEYS[1], 'ver', tostring(ver + 1))
redis.call('ZADD', KEYS[2], applyAt, ARGV[1])
redis.call('HSET', KEYS[3], ARGV[1], ARGV[3])
if #under > 0 then return 'ok:' .. table.concat(under, ',') end
return 'ok'
`);

/**
 * Remove applied markers and their payload bindings as one Redis transaction.
 * The database eligibility check happens in the caller; once an op is selected,
 * this script keeps the two Redis structures from diverging if a process dies
 * between individual commands.
 */
export const TRIM_APPLIED = script("trimApplied", `
-- KEYS[1]=lock KEYS[2]=user KEYS[3]=applied KEYS[4]=appliedPayload
-- ARGV[1]=myFence ARGV[2..]=eligible op ids
if #KEYS ~= 4 or #ARGV < 2 then return redis.error_reply('trimApplied argument count') end
local function keyType(key)
  local reply = redis.call('TYPE', key)
  return reply['ok']
end
if keyType(KEYS[1]) ~= 'string' or redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
local userType = keyType(KEYS[2])
if userType == 'none' then return 'cold' end
if userType ~= 'hash' then return redis.error_reply('trimApplied user key type') end
local appliedType = keyType(KEYS[3])
if appliedType ~= 'none' and appliedType ~= 'zset' then
  return redis.error_reply('trimApplied applied key type')
end
local payloadType = keyType(KEYS[4])
if payloadType ~= 'none' and payloadType ~= 'hash' then
  return redis.error_reply('trimApplied payload key type')
end
if redis.call('HGET', KEYS[2], 'schemaVersion') ~= '${SCHEMA_VERSION}' then
  return redis.error_reply('trimApplied schema invalid')
end
local rawVer = redis.call('HGET', KEYS[2], 'ver')
if rawVer == false then return redis.error_reply('trimApplied user ver invalid') end
local ver = tonumber(rawVer)
if ver == nil or ver < 0 or ver ~= math.floor(ver) or ver >= ${LUA_MAX_SAFE_INTEGER} then
  return redis.error_reply('trimApplied user ver invalid')
end
local removed = 0
for i = 2, #ARGV do
  if redis.call('ZREM', KEYS[3], ARGV[i]) == 1 then removed = removed + 1 end
  redis.call('HDEL', KEYS[4], ARGV[i])
end
if removed > 0 then redis.call('HSET', KEYS[2], 'ver', tostring(ver + 1)) end
return removed
`);

/** 释放锁：值（=fence）匹配才 DEL。返回 1 | 0。 */
export const CAS_DEL = script("casDel", `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`);

/**
 * 令牌桶限流。时钟在 Lua 内取 \`TIME\`（09·R7：⛔ 禁止 app 传时钟做判定）。
 * ARGV = [capacity, refillPerSec, cost]。返回 ≥0 = 允许（剩余令牌，取整）；-1 = 拒绝。
 */
export const TOKEN_BUCKET = script("tokenBucket", `
local t    = redis.call('TIME')
local now  = tonumber(t[1]) + tonumber(t[2]) / 1000000
local cap  = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])

local d      = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(d[1])
local ts     = tonumber(d[2])
if tokens == nil or ts == nil then tokens = cap; ts = now end

tokens = math.min(cap, tokens + (now - ts) * rate)
local allowed = tokens >= cost
if allowed then tokens = tokens - cost end

redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
-- rate <= 0（不回填）时 cap/rate 除零会让 PEXPIRE 抛错杀死整条脚本：兜底 24h
local ttl = 86400000
if rate > 0 then ttl = math.min(ttl, math.ceil(cap / rate * 2000)) end
redis.call('PEXPIRE', KEYS[1], ttl)
if allowed then return math.floor(tokens) end
return -1
`);

/**
 * 看门狗续租：仍持有锁（值==fence）才 PEXPIRE（09·L6：仅 freeze/thaw 慢操作启用）。
 * 裸 PEXPIRE 会给别人刚抢到的锁续命，必须 CAS。返回 1 | 0（0 = 锁已易主，看门狗停止）。
 * ⚠ 07 Lua 清单外的支撑脚本（同 casDel 一族的锁归属 CAS），随 L6 看门狗交付。
 */
export const CAS_RENEW = script("casRenew", `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`);

/**
 * 建号原子创建 user:{uid}：已存在则不动（⛔ 隐式创建/覆盖都是 09·R2 禁区，
 * 只有本脚本的建号路径与 thaw 的 thawRestore 允许创建档）。
 * ARGV = [schemaVersion, nowMs, characterRegistration|'', field, value, ...]。
 * checkedAt 固定由底座写 0，调用方字段不得覆盖任何保留字段。返回 'ok' | 'exists'。
 */
export const CREATE_USER = script("createUser", `
local function canonicalUnsigned(value)
  if type(value) ~= 'string' or not string.match(value, '^%d+$') then return false end
  if #value > 1 and string.sub(value, 1, 1) == '0' then return false end
  local number = tonumber(value)
  return number ~= nil and number >= 0 and number == math.floor(number) and number <= 9007199254740991
end
if #ARGV < 3 or (#ARGV % 2) ~= 1 then return redis.error_reply('createUser argv invalid') end
if ARGV[1] ~= '${SCHEMA_VERSION}' or not canonicalUnsigned(ARGV[2]) then
  return redis.error_reply('createUser metadata invalid')
end
if ARGV[3] ~= '' and ARGV[3] ~= 'pending' then
  return redis.error_reply('createUser registration invalid')
end
local reserved = ${LUA_USER_GENERIC_RESERVED}
for i = 4, #ARGV, 2 do
  if reserved[ARGV[i]] == true then return redis.error_reply('createUser reserved field ' .. ARGV[i]) end
end
if redis.call('EXISTS', KEYS[1]) == 1 then return 'exists' end
redis.call('HSET', KEYS[1],
  'schemaVersion', ARGV[1],
  'fence', '0',
  'ver', '0',
  'createdAt', ARGV[2],
  'characterRegistrationCheckedAt', '0')
if ARGV[3] ~= '' then redis.call('HSET', KEYS[1], 'characterRegistration', ARGV[3]) end
for i = 4, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i+1])
end
return 'ok'
`);

/**
 * EVALSHA，NOSCRIPT 时自动 SCRIPT LOAD 重载再试一次（09·R7）。
 * Redis 重启 / failover 到未缓存脚本的实例时 script cache 会清空，这是唯一正确的兜底。
 */
export async function evalshaWithReload(
  client: Redis,
  s: RedisScript,
  keys: string[],
  argv: (string | number)[],
): Promise<unknown> {
  try {
    return await client.evalsha(s.sha, keys.length, ...keys, ...argv);
  } catch (e) {
    if (e instanceof Error && e.message.includes("NOSCRIPT")) {
      const loaded = (await client.call("SCRIPT", "LOAD", s.lua)) as string;
      if (loaded !== s.sha) {
        throw new Error(`SCRIPT LOAD sha 不一致: ${s.name} 期望 ${s.sha} 实际 ${loaded}`);
      }
      return client.evalsha(s.sha, keys.length, ...keys, ...argv);
    }
    throw e;
  }
}
