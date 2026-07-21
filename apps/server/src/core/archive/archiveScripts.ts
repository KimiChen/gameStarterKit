/**
 * 冷档冻结层 Lua（[08 · 冷档冻结层](docs/SERVER.md)，
 * 脚本清单与返回值契约见 [07 · Lua 脚本清单](docs/SERVER.md)）。
 *
 * `UNLINK` / 批量恢复 `HSET` **不是 fence 守卫的写**（08：那句「锁过期不需看门狗」只对 casHset 成立）：
 * 锁一过期就会盲删 / 盲覆盖别人刚写入的新数据。所以两条脚本都把「复检锁归属」和破坏性操作
 * 放进**同一条 Lua** 原子执行（09·L4）——锁已易主返回 'lost'，零破坏。这是正确性的唯一依靠，
 * 看门狗（09·L6）只是减少无用功。
 *
 * KEYS 全部带 `{uid}` hash-tag 同槽（09·R3），单条 Lua 才能原子操作。
 */
import { kApplied, kBagAll, kFence, kLock, kUser } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { defineScript, evalshaWithReload } from "../infra/redisScripts";

/**
 * `user_archive.snapshot` 的 JSON 形状（08 · user_archive 表）：
 * user 全字段 + 所有 bag 分片 + **applied 成员集合**（09·F2：pre-freeze op_id 重放仍被去重）。
 * 全部值保持 Redis 原始字符串——cjson 不动它们，恢复时按原样写回。
 */
export interface ArchiveSnapshot {
  /** user:{uid} 全字段（含 fence/ver/schemaVersion，恢复时 fence 被 fence_hwm 覆盖）。 */
  user: Record<string, string>;
  /** 下标 = shard 0..BAG_SHARDS-1（与 kBagAll 顺序一致，S2：分片数永不随手改）。 */
  bag: Record<string, string>[];
  /** applied:{uid} 的 `ZRANGE 0 -1 WITHSCORES` 平铺数组 [member, score, ...]。 */
  applied: string[];
}

/**
 * freezeCommit：同一条 Lua 内复检锁归属（09·L4）+ ver 未变（快照期间玩法写检测——
 * relayer 的 applyEffect 不持锁也不走 fence，只有 ver 能暴露它）→ 才 UNLINK。
 *
 * ⚠ KEYS[3]=fence:{uid} 计数器**保留不删**（偏离 08 原文，评审修正）：它的契约本就是
 * 「永不过期永不重置」——删除后冷档期间 acquireLease 会从 1 重新 INCR，若冷档期长到计数
 * 反超 fence_hwm，thaw 绝对写回 hwm = 计数**回退**，滞留 writer 的大号 fence 就能穿过
 * hash 字段 CAS（僵尸写被重新接受）。保留计数器 + thaw 侧 MAX 双保险闭死此窗口。
 *
 * 返回 'ok' | 'lost'（锁已易主）| 'changed'（快照已过期，放弃，archive 行留给清理任务）。
 */
export const FREEZE_COMMIT = defineScript("freezeCommit", `
-- KEYS[1]=lock:{uid}  KEYS[2]=user:{uid}  KEYS[3]=fence:{uid}
-- KEYS[4]=applied:{uid}  KEYS[5..]=bag:{uid}:0..N-1
-- ARGV[1]=myFence  ARGV[2]=verAtRead
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
if redis.call('HGET', KEYS[2], 'ver') ~= ARGV[2] then return 'changed' end
-- ⛔ KEYS[3]=fence 计数器不删（永不重置契约；防冷档期重新计数导致 thaw 后计数回退）
redis.call('UNLINK', KEYS[2], KEYS[4])
for i = 5, #KEYS do redis.call('UNLINK', KEYS[i]) end
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
-- KEYS[1]=lock:{uid} KEYS[2]=user:{uid} KEYS[3]=fence:{uid} KEYS[4]=applied:{uid} KEYS[5..]=bag
-- ARGV[1]=myFence ARGV[2]=fenceHwm ARGV[3]=snapshotJson ARGV[4]=overwrite('1' 时先删陈旧档)
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
if ARGV[4] == '1' then
  -- overwrite（ARCHIVE_NEWER/PITR）：删陈旧档，但 ⛔ KEYS[3]=fence 计数器保留——
  -- acquireLease 是「先 INCR 再抢锁」，抢锁**失败**者也推计数器：resolve 读完计数器到
  -- 本 Lua 执行之间（TOCTOU），并发失败抢锁可把计数推过 hwm——删除后按 hwm 恢复
  -- = 计数回退、已发号被复用（评审修正，与 freezeCommit 同一契约：计数器永不重置）
  redis.call('UNLINK', KEYS[2], KEYS[4])
  for i = 5, #KEYS do redis.call('UNLINK', KEYS[i]) end
end
local s = cjson.decode(ARGV[3])
-- 恢复 user 全字段（值是 Redis 原始字符串，原样写回）
for f, v in pairs(s.user) do
  redis.call('HSET', KEYS[2], f, v)
end
-- 恢复 bag：s.bag[i]（Lua 1 起）对应 KEYS[4+i] = shard i-1（与 kBagAll 顺序一致）
if s.bag then
  for i, shard in ipairs(s.bag) do
    for f, v in pairs(shard) do
      redis.call('HSET', KEYS[4 + i], f, v)
    end
  end
end
-- 恢复 applied（WITHSCORES 平铺 [member, score, ...]）——pre-freeze op_id 重放仍判 dup（09·F2）
if s.applied then
  for i = 1, #s.applied, 2 do
    redis.call('ZADD', KEYS[4], s.applied[i + 1], s.applied[i])
  end
end
-- fence 双写：hash 字段 + 计数器（约束 3），取 MAX(当前计数器, fence_hwm)——
-- ⛔ 不许绝对写回 hwm：计数器若已超 hwm（冷档期发号/历史残留），回退 = 滞留 writer
-- 的大号 fence 能穿过 hash CAS（僵尸写复活）；MAX 保证单调性在任何交错下不破
local cur = tonumber(redis.call('GET', KEYS[3])) or 0
local hwm = tonumber(ARGV[2])
local fence = math.max(cur, hwm)
redis.call('HSET', KEYS[2], 'fence', fence)
redis.call('SET',  KEYS[3], fence)
return 'ok'
`);

/** freeze/thaw 共用的 KEYS 排列（两条脚本注释里的顺序，⛔ 不要改动次序）。 */
const archiveKeys = (uid: string): string[] =>
  [kLock(uid), kUser(uid), kFence(uid), kApplied(uid), ...kBagAll(uid)];

/** freezeCommit 包装：'changed' = 快照期间有玩法写（如 relayer applyEffect），放弃本轮。 */
export async function freezeCommit(
  uid: string, myFence: number, verAtRead: string,
): Promise<"ok" | "lost" | "changed"> {
  return await evalshaWithReload(
    clientFor(uid), FREEZE_COMMIT, archiveKeys(uid),
    [String(myFence), verAtRead],
  ) as "ok" | "lost" | "changed";
}

/** thawRestore 包装。snapshot 若来自 MySQL JSON 列已被 mysql2 解析成对象——stringify 统一在这里做（09·DB8）。 */
export async function thawRestore(
  uid: string, myFence: number, fenceHwm: number, snapshot: ArchiveSnapshot, overwrite: boolean,
): Promise<"ok" | "lost"> {
  return await evalshaWithReload(
    clientFor(uid), THAW_RESTORE, archiveKeys(uid),
    [String(myFence), String(fenceHwm), JSON.stringify(snapshot), overwrite ? "1" : "0"],
  ) as "ok" | "lost";
}
