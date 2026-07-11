/**
 * Lua 脚本注册 + `EVALSHA` / `NOSCRIPT` 自动重载（09·R7）。
 *
 * 脚本清单与返回值契约见 [07 · Lua 脚本清单](../../../../docs/server/07-contracts-and-config.md#lua-脚本清单)。
 * freezeCommit / thawRestore 属 M9 冷档，随 archive/ 交付（08）。
 *
 * ⚠ 返回值 `cold` = `user:{uid}` 不存在。任何写路径不得隐式创建档（09·R2），
 *   只有建号与 thaw 能创建。收到 `cold` → `ensureLive(uid)` → 重试。
 */
import { createHash } from "node:crypto";
import type Redis from "ioredis";

export interface RedisScript { readonly name: string; readonly lua: string; readonly sha: string }

/** 定义 Lua 脚本（sha 本地算好供 EVALSHA）。模块专属脚本（rank/archive）在各自文件用它定义。 */
export const defineScript = (name: string, lua: string): RedisScript =>
  ({ name, lua, sha: createHash("sha1").update(lua).digest("hex") });
const script = defineScript;

/**
 * 交互式玩法写：fence CAS + 只写脏字段 + bump ver（03）。
 * 返回 'ok' | 'stale' | 'cold'。
 */
export const CAS_HSET = script("casHset", `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'cold' end
local cur = tonumber(redis.call('HGET', KEYS[1], 'fence') or '0')
if cur > tonumber(ARGV[1]) then return 'stale' end

for i = 2, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i+1])
end
redis.call('HSET',    KEYS[1], 'fence', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'ver', 1)
return 'ok'
`);

/**
 * outbox intent apply：op_id 幂等，⛔ 无 fence CAS（09·X3：已提交的 intent 是权威决定）。
 * 返回 'ok' | 'dup' | 'cold'（没有 'stale'）。负数下溢回补到 0 并上报（09·X8）：
 * 下溢时返回 'ok:<明细>'，wrapper 记异常后仍视作 'ok'。
 * ARGV[2] now_ms 仅作 applied 的 ZADD score、不参与判定（04 既定契约，不违反 09·R7）。
 */
export const APPLY_EFFECT = script("applyEffect", `
if redis.call('EXISTS', KEYS[1]) == 0   then return 'cold' end
if redis.call('ZSCORE', KEYS[2], ARGV[1]) then return 'dup' end

local N     = #KEYS - 2
local eff   = cjson.decode(ARGV[3])
local under = {}

for _, g in ipairs(eff) do
  if g.kind == 'item' then
    local field = tostring(g.itemId)
    local shard = g.itemId % N
    local v = redis.call('HINCRBY', KEYS[3 + shard], field, g.count)
    if v < 0 then
      redis.call('HSET', KEYS[3 + shard], field, 0)
      under[#under + 1] = 'item:' .. field
    end
  elseif g.kind == 'star' then
    local v = redis.call('HINCRBY', KEYS[1], 'star', g.delta)
    if v < 0 then
      redis.call('HSET', KEYS[1], 'star', 0)
      under[#under + 1] = 'star'
    end
  elseif g.kind == 'setField' then
    redis.call('HSET', KEYS[1], g.field, g.value)
  end
end

redis.call('HINCRBY', KEYS[1], 'ver', 1)
redis.call('ZADD',    KEYS[2], ARGV[2], ARGV[1])
if #under > 0 then return 'ok:' .. table.concat(under, ',') end
return 'ok'
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
 * ARGV = [schemaVersion, nowMs, field, value, ...]。返回 'ok' | 'exists'。
 */
export const CREATE_USER = script("createUser", `
if redis.call('EXISTS', KEYS[1]) == 1 then return 'exists' end
redis.call('HSET', KEYS[1], 'schemaVersion', ARGV[1], 'fence', '0', 'ver', '0', 'createdAt', ARGV[2])
for i = 3, #ARGV, 2 do
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
