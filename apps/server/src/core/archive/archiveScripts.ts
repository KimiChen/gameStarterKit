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
 * freezeCommit（08 原文照抄）：同一条 Lua 内复检锁归属（09·L4）+ ver 未变（快照期间
 * 玩法写检测——relayer 的 applyEffect 不持锁也不走 fence，只有 ver 能暴露它）→ 才 UNLINK。
 *
 * ⚠ KEYS[3]=fence:{uid} 计数器**按 08 的 Lua 一并 UNLINK**：thaw 时会以 fence_hwm 同时恢复
 * 计数器与 hash 字段（约束 3 / 09·F3），冻结期间发出的小号 fence 只会拿到 'cold'，无破坏面。
 *
 * 返回 'ok' | 'lost'（锁已易主）| 'changed'（快照已过期，放弃，archive 行留给清理任务）。
 */
export const FREEZE_COMMIT = defineScript("freezeCommit", `
-- KEYS[1]=lock:{uid}  KEYS[2]=user:{uid}  KEYS[3]=fence:{uid}
-- KEYS[4]=applied:{uid}  KEYS[5..]=bag:{uid}:0..N-1
-- ARGV[1]=myFence  ARGV[2]=verAtRead
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
if redis.call('HGET', KEYS[2], 'ver') ~= ARGV[2] then return 'changed' end
redis.call('UNLINK', KEYS[2], KEYS[3], KEYS[4])
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
  redis.call('UNLINK', KEYS[2], KEYS[3], KEYS[4])
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
-- fence_hwm 双写：hash 字段 + 计数器（约束 3）。必须在 user 全字段之后，覆盖快照里的旧 fence
redis.call('HSET', KEYS[2], 'fence', ARGV[2])
redis.call('SET',  KEYS[3], ARGV[2])
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
