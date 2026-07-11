/**
 * 排行 Lua 脚本（M7 专属，用 infra/redisScripts 的 defineScript 定义，随 evalshaWithReload
 * 走 EVALSHA + NOSCRIPT 自动重载，09·R7）。
 *
 * ⛔ 累加禁止 `ZINCRBY`（09·K1）：会把旧 frac 累进新分数，破坏小数位 tie-break 语义。
 * 必须单条 Lua 原子完成：ZSCORE 取旧值 → floor 还原整数分 → 加 delta → 重算 encodeScore → ZADD 覆写。
 *
 * 时钟（09·R7）：tie-break 时间戳属「记录先后」而非判定逻辑，但仍取 `redis.call('TIME')` 秒——
 * 单一权威时钟，多 app 节点漂移不会污染先后次序；SEASON_BASE / SEASON_LEN_S 是静态配置，作 ARGV 传入。
 *
 * ⚠ Cluster 风险（待 M0 Sentinel vs Cluster 拍板）：KEYS[1] `rank:{type}:{season}` 与
 *   KEYS[2] `rank_sub:{type}:{season}` 无 hash-tag、不同槽，Cluster 下同一条 Lua 会 CROSSSLOT
 *   （09·R3）。Sentinel / 单实例形态无碍；若拍板 Cluster，需给两 key 加同一 hash-tag 或拆两步。
 */
import { defineScript } from "../infra/redisScripts";

/**
 * 更新分：KEYS = [rank:{type}:{season}, rank_sub:{type}:{season}]
 * ARGV = [uid, delta, SEASON_BASE, SEASON_LEN_S, subJson]
 * 返回累加后的整数分（tostring，Lua 返回 number 会被 Redis 截断成整数，这里本来就是整数，
 * 但统一走字符串避免歧义）。
 *
 * frac 计算与 score.ts 的 encodeScore **逐行对齐**：先推导 now 所属赛季窗口（早于 base 归第 0 季），
 * elapsed clamp 到 [0, len]，frac = (1 - elapsed/len) / 10。
 */
export const RANK_UPSERT = defineScript("rankUpsert", `
local t   = redis.call('TIME')
local now = tonumber(t[1])

local base = tonumber(ARGV[3])
local len  = tonumber(ARGV[4])

-- ZSCORE → floor 还原整数分 → 加 delta（⛔ 不 ZINCRBY，09·K1）
local old = redis.call('ZSCORE', KEYS[1], ARGV[1])
local intScore = 0
if old then intScore = math.floor(tonumber(old)) end
intScore = intScore + tonumber(ARGV[2])

-- 重算 encodeScore（与 score.ts 同一公式）：赛季窗口推导 + clamp [0, len]
local n = math.floor((now - base) / len)
if n < 0 then n = 0 end
local elapsed = now - (base + n * len)
if elapsed < 0 then elapsed = 0 end
if elapsed > len then elapsed = len end
local frac = (1 - elapsed / len) / 10

redis.call('ZADD', KEYS[1], intScore + frac, ARGV[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[5])
return tostring(intScore)
`);
