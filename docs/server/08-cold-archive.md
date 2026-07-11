# 08 · 冷档冻结层

> **决策**：存储用开源 Redis（**无 tiering**）。容量走「纯 RAM + 16384 桶分片」起步，靠**冷档冻结层**回收僵尸档内存。
>
> 开源 Redis 没有 on-flash（那是 Redis Enterprise 的 Auto Tiering）。本篇是内存兜底的**唯一手段**。

---

## 它改变了什么（先说清楚）

冷档冻结让 **MySQL `user_archive` 成为冷用户的权威**：

| 原先 | 现在 |
|---|---|
| 玩法真源**全部**在 Redis | 玩法真源在 Redis，**冷档例外**（权威在 MySQL `user_archive`） |
| 重建源 = Redis 自身备份 | 对**热用户**仍成立；**冷用户**从 MySQL 重建 |
| 内存随**累计注册用户**增长 | 内存随**活跃用户**增长 ✅ |

> 这是一个**有意接受的例外**。任何人读到「玩法真源 = Redis」时都必须同时知道它。

**货币不在冻结范围**：真源在 MySQL，`cache:currency:{uid}` 在 cache 实例自然过期，thaw 后 miss 回源。不要在 thaw 里碰货币。

---

## 核心不变量：**fence 新鲜度**，不是「谁存在」

> ⛔ 早期版本用「`user:{uid}` 存在 ⇒ Redis 权威」。**这是错的**，会在 Redis 点位恢复（PITR）后删掉更新的 archive 行。

**权威 = `fence` 更大的一方。**

在 `lock:{uid}` 之下执行判定：

```
resolve(uid):
  live    = EXISTS user:{uid}
  archive = SELECT fence_hwm FROM user_archive WHERE user_id = ?

  live && !archive   →  LIVE            正常热档
 !live &&  archive   →  FROZEN          冷档，访问时 thaw
 !live && !archive   →  ABSENT          查 accounts 判「新号」还是「数据丢失」
  live &&  archive   →  比较 fence：
       archive.fence_hwm >  HGET user:{uid} fence   →  ARCHIVE_NEWER   （PITR 场景）
       否则                                          →  LIVE            （freeze/thaw 中断残留）
```

| 情形 | 处理 |
|---|---|
| `LIVE` | 若有 archive 行 → **删除**（陈旧残留） |
| `FROZEN` | thaw |
| `ARCHIVE_NEWER` | **UNLINK 陈旧的 Redis 档，再从 archive 恢复**（Redis 被回滚到了更早的时点） |
| `ABSENT` | `accounts` 有号 ⇒ **数据丢失，告警并拒绝建空档**；无号 ⇒ 真新号，走建号 |

### 为什么必须比 fence

Redis 主挂，从 2 小时前的 RDB 恢复。这 2 小时内冻结的用户，其 **archive 是最新的**，而 Redis 里复活的是旧副本。
按「谁存在」判定会把 archive 删掉 → 这批用户**回档 2 小时且无报错**（玩法态没有 ledger，无对账能发现）。

按 fence 判定：`archive.fence_hwm > redis.fence` → archive 胜 → 重新 thaw 覆盖。**正确。**

> **平局（`==`）判 LIVE**：这正是 freeze 写完 archive 但没来得及 `UNLINK`、或 thaw 恢复完但没来得及删 archive 行的中断态，两边数据相同，删 archive 行即可。

---

## 根本纪律：**一把锁，串行一切**

早期版本 freeze 用 `lock:{uid}`、thaw 用 `thaw:{uid}`、清理任务不加锁 —— 这是四个数据丢失 bug 的共同根因。

> **freeze / thaw / 玩法写 / 清理任务，对同一 uid 全部走同一把跨实例锁 `lock:{uid}`。**

```ts
/** 低层原语：进程内 mutex + 跨实例 Redis 锁 + fence。withUser 建在它之上。 */
export function withUserLock<T>(uid: string, fn: (fence: number) => Promise<T>): Promise<T>;
```

`thaw:{uid}` 这个键**已废弃**，不要再出现。

### 但仅有锁还不够：锁会过期

`lock:{uid}` 是 `PX 5s`，而 freeze 要做「大 Hash 读 + JSON 序列化 + MySQL 大 blob 写」，thaw 要做「MySQL 点查 + 批量 HSET」。**这两个是全系统最慢的操作，5s 盖不住。**

[03](./03-gateway-data-layer.md) 说「锁过期不需看门狗，fence 会拦僵尸写」——**那句话只对 `casHset` 成立**，因为它有 fence CAS。
`UNLINK` 和批量 `HSET` **不是 fence 守卫的写**，锁一过期就会盲删/盲覆盖别人刚写入的新数据。

**两道保险，都要上：**

1. **看门狗续租**：freeze / thaw 持锁期间定期 `PEXPIRE`（值匹配才续），提升活性。
2. **破坏性操作在 Lua 里复检锁归属**：把「验证锁仍属于我」和「UNLINK / HSET 恢复」放进**同一条 Lua**，原子执行。锁已易主 → 返回 `lost`，放弃本次操作，**不造成任何破坏**。

这是正确性的**唯一依靠**；看门狗只是减少无用功。

---

## 没有任何写路径可以隐式创建 `user:{uid}`

> **只有「建号」和「thaw」能创建 `user:{uid}`。**

否则：一个已冻结的 uid 被 relayer 的 `applyEffect` 直接 `HINCRBY` → 在不存在的 hash 上凭空造出一份**残档**（只含 `star` / `ver=1`）→ 后续 `EXISTS` 短路，永不读 archive → **30 天真实存档被一条 grant 覆盖丢光**。

所以 [03](./03-gateway-data-layer.md) 的 `casHset` 与 [04](./04-cross-store-outbox.md) 的 `applyEffect` **都必须前置 `EXISTS` 检查**：

```lua
if redis.call('EXISTS', KEYS[1]) == 0 then return 'cold' end
```

调用方收到 `'cold'` → `await ensureLive(uid)` → 重试。

**relayer 尤其重要**：它不走 `withUser`，扫到的 outbox 行可能属于一个已冻结的 uid（赛季发奖、T+1 退款、GM 补偿都会在冻结**之后**插入新行）。

> **不变量**：冻结的 uid 仍可能有后到的 outbox 行。**任何 apply 之前必须先 thaw。**

---

## `user_archive` 表

DDL 在 [05 · MySQL 表与写法](./05-mysql8-schema.md#user_archive冷档) —— schema 统一收在 05，此处只说字段语义。

| 列 | 语义 |
|---|---|
| `user_id` | PK |
| `snapshot` | 完整玩法档 JSON：`user` 全字段 + 所有 `bag:{uid}:{shard}` + **`applied` 成员集合** |
| `fence_hwm` | 冻结时的 fence 高水位。**权威判定与 thaw 恢复都靠它** |
| `schema_version` | 懒迁移用 |
| `frozen_at` | 死号清退的时间维度（⛔ **不可作分区键**，见下） |

### `applied` 也要归档

冷用户的 `applied:{uid}` 通常已被 `APPLIED_RETENTION` 裁空，归档成本近乎为零。但归档它能消除一整类推理：**任何对 pre-freeze `op_id` 的重放（含人工重放 dead 行）都仍被去重**。

> ⚠️ **dead outbox 行的人工处置契约**：必须通过**重放**（走 `redisApply`，由 `applied` 去重）来解决，
> ⛔ 不得手工把 `status` 直接改成 `done` —— 那会让「已发货」的假设与事实脱节。

---

## 活跃索引：怎么找出冷用户

⛔ 不要 `SCAN` 遍历百万级 key。

```
active:lru:{bucket}     ZSET   member = uid, score = lastActiveMs
                        bucket = crc32(uid) % ACTIVE_LRU_BUCKETS(256)
```

### ⚠️ 它不是 per-uid key，寻址规则不同

`active:lru:{bucket}` 的 hash-tag 是 `{bucket}`，**不是 `{uid}`**。所以：

- 它**不能**用 [06](./06-capacity-and-ops.md) 的 `clientFor(uid)` 路由函数寻址
- 一个 bucket 里的 uid 会散落在**所有**物理实例上

**两次寻址，别搞混：**

```ts
const idx = indexClientFor(bucket);   // 索引实例（固定放置或按 bucket 单独路由）
const usr = clientFor(uid);           // 用户数据实例（按 uid 桶路由）

await idx.zadd(`active:lru:{${bucket}}`, Date.now(), uid);   // 写索引
await usr.hgetall(`user:{${uid}}`);                          // 读用户
```

索引是**可重建的派生数据**（可从 `user:{uid}.lastActiveAt` 全量重建），不需要和玩法写原子，也不需要跟 user 同槽。

### 幽灵项清理

`ZREM` 与 `UNLINK` 不原子。freeze 崩溃或 `ZREM` 失败会把 uid 永久滞留在索引里，每轮扫描都白吃一把锁 + 一次大 Hash 读，**毒化冻结吞吐且永不自愈**。

**候选筛选时先过滤并顺手清除：**

```ts
for (const uid of candidates) {
  if (!(await clientFor(uid).exists(`user:{${uid}}`))) {
    await idx.zrem(key, uid);        // 幽灵项：档已不在，清掉索引
    continue;
  }
  await freezeUser(uid);
}
```

**所有 skip 分支也必须 `ZREM`**（包括「快照为空」）。

---

## 三条硬约束

### 1. `COLD_DAYS` 必须远大于 outbox / applied 保留窗口

```
COLD_DAYS × 86_400_000  >>  max(OUTBOX_RETENTION_MS, APPLIED_RETENTION_MS)
        90 × 86_400_000  >>  max(24h, 48h)                    ✅
```

### 2. 冻结前置闸：无未完成 outbox 行 —— **且必须在锁内复查**

```sql
SELECT 1 FROM gameplay_outbox WHERE user_id = ? AND status IN (0, 2) LIMIT 1;
```

`dead`(2) 也要拦 —— 它还等着人工重放。

> ⚠️ **锁外查一次不够**：一次购买可能在冻结 worker 排队等锁时刚提交了 pending 行。**锁内必须再查一次。**
> 即便如此，冻结**之后**仍可能有新 outbox 行插入 —— 那由「`applyEffect` 遇 `cold` 先 thaw」兜底。

### 3. `fence` 恢复：计数器**和** hash 字段都要写

真正守卫僵尸写的是 **`user:{uid}` 里的 `fence` 字段**（`casHset` 拿它做 CAS），而 `fence:{uid}` 只是发号计数器。

thaw 时**两者都写成 `fence_hwm`**，否则 hash 字段停在旧快照值（可能小于某个滞留 writer 持有的 fence），CAS 会放行僵尸写。

---

## Freeze

**单例 worker**（`singleton_lease` + `fence_token`，见 [P6](./02-failure-patterns.md)）。

```ts
async function freezeUser(uid: string): Promise<'frozen' | 'skipped' | 'lost'> {
  return withUserLock(uid, async (fence) => {
    const r = clientFor(uid);

    // ── 锁内双检 ──
    if (await r.exists(`sess:{${uid}}`)) return 'skipped';
    if (await hasOpenOutbox(uid))        return 'skipped';   // ⚠️ 锁内复查（约束 2）
    if (await lastActiveMs(uid) > Date.now() - COLD_MS) return 'skipped';

    // ── ① 读快照（鲸鱼档走 HSCAN，见「限速与调度」）──
    const snapshot = {
      user:    await readHashSafe(r, `user:{${uid}}`),
      bag:     await readAllBagShards(r, uid),
      applied: await r.zrange(`applied:{${uid}}`, 0, -1, 'WITHSCORES'),
    };
    if (!snapshot.user || !Object.keys(snapshot.user).length) return 'skipped';

    const verAtRead = snapshot.user.ver ?? '0';
    const fenceHwm  = Number(await r.get(`fence:{${uid}}`) ?? 0);

    // ── ② 先写 MySQL（幂等 upsert，fence_hwm 取大）──
    const w = await mysql.exec(
      `INSERT INTO user_archive (user_id, snapshot, schema_version, fence_hwm)
       VALUES (?, CAST(? AS JSON), ?, ?) AS new
       ON DUPLICATE KEY UPDATE
         snapshot = new.snapshot, schema_version = new.schema_version,
         fence_hwm = GREATEST(user_archive.fence_hwm, new.fence_hwm),
         frozen_at = NOW(3)`,
      [uid, JSON.stringify(snapshot), snapshot.user.schemaVersion ?? 1, fenceHwm]);
    if (w.affectedRows === 0) throw new Error('archive write failed');

    // ── ③ Lua：复检锁归属 + ver 未变 → 才 UNLINK。原子，不可能盲删 ──
    const res = await freezeCommitLua(uid, fence, verAtRead);   // 'ok' | 'lost' | 'changed'
    if (res !== 'ok') return 'lost';                            // 放弃，archive 行留给清理任务处理

    await idx.zrem(`active:lru:{${bucketOf(uid)}}`, uid);
    return 'frozen';
  });
}
```

```lua
-- freezeCommit
-- KEYS[1]=lock:{uid}  KEYS[2]=user:{uid}  KEYS[3]=fence:{uid}
-- KEYS[4]=applied:{uid}  KEYS[5..]=bag:{uid}:0..N-1
-- ARGV[1]=myFence  ARGV[2]=verAtRead
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end        -- 锁已易主
if redis.call('HGET', KEYS[2], 'ver') ~= ARGV[2] then return 'changed' end  -- 快照已过期
redis.call('UNLINK', KEYS[2], KEYS[3], KEYS[4])
for i = 5, #KEYS do redis.call('UNLINK', KEYS[i]) end
return 'ok'
```

**崩溃 / 锁过期分析**（这次是完整的）：

| 时点 | 结果 | 收敛 |
|---|---|---|
| ② 之前崩溃 | 无 archive、Redis 完好 | 无事发生 |
| ② 之后、③ 之前崩溃 | archive 与 Redis 并存，`fence_hwm == redis.fence` | `resolve` 判 **LIVE** → 清理任务删 archive 行 |
| ③ 时锁已过期且被别人写入 | Lua 返回 `lost`，**未删任何东西** | archive 陈旧；下次 `resolve` 判 LIVE（`hwm < redis.fence`）→ 删 archive |
| ③ 之后崩溃（ZREM 未执行） | Redis 已删，索引留幽灵项 | 候选筛选时 `EXISTS` 过滤并 `ZREM` |

**任何路径都不会丢数据。**

---

## Thaw

**懒加载**，走**同一把 `lock:{uid}`**（不再有 `thaw:{uid}`）。

```ts
async function ensureLive(uid: string): Promise<void> {
  const r = clientFor(uid);
  if (await r.exists(`user:{${uid}}`)) {
    if (!(await archiveExists(uid))) return;         // 快路径：纯热档
  }

  await singleFlight(`thaw:${uid}`, () =>            // 进程内合并
    withUserLock(uid, async (fence) => {             // 跨实例串行
      const state = await resolve(uid);              // 锁内判定（见上）

      switch (state.kind) {
        case 'LIVE':
          if (state.hasArchive) await mysql.exec(`DELETE FROM user_archive WHERE user_id=?`, [uid]);
          return;

        case 'ABSENT': {
          const acct = await mysql.query(`SELECT 1 FROM accounts WHERE user_id=?`, [uid]);
          if (acct) { alertDataLoss(uid); throw new UserDataLostError(uid); }  // ⛔ 拒绝建空档
          await negativeCache(uid);                                            // 真新号
          throw new UserNotFoundError(uid);                                    // 由建号路径接住
        }

        case 'FROZEN':
        case 'ARCHIVE_NEWER': {
          const row = state.row;
          // Lua：复检锁归属 → (ARCHIVE_NEWER 时先 UNLINK 陈旧档) → 恢复全部 key → 原子
          const res = await thawRestoreLua(uid, fence, row);   // 'ok' | 'lost'
          if (res !== 'ok') throw new BusyError();             // 放弃，未破坏任何东西

          await lazyMigrateSchema(uid, row.schema_version);
          await mysql.exec(`DELETE FROM user_archive WHERE user_id=?`, [uid]);  // 最后一步
          return;
        }
      }
    }));
}
```

```lua
-- thawRestore（原子；⛔ 绝不能用非原子 pipeline）
-- KEYS[1]=lock:{uid} KEYS[2]=user:{uid} KEYS[3]=fence:{uid} KEYS[4]=applied:{uid} KEYS[5..]=bag
-- ARGV[1]=myFence ARGV[2]=fenceHwm ARGV[3]=snapshotJson ARGV[4]=overwrite('1' 时先删陈旧档)
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
if ARGV[4] == '1' then
  redis.call('UNLINK', KEYS[2], KEYS[3], KEYS[4])
  for i = 5, #KEYS do redis.call('UNLINK', KEYS[i]) end
end
local s = cjson.decode(ARGV[3])
-- 恢复 bag / applied / fence 计数器
-- 恢复 user 全字段，并把 hash 的 fence 字段一并写成 fence_hwm（约束 3）
redis.call('HSET', KEYS[2], 'fence', ARGV[2])
redis.call('SET',  KEYS[3], ARGV[2])
return 'ok'
```

> Lua 原子 ⇒ **不存在「user 在、bag 缺」的部分成功**。早期版本用 pipeline 且把 `user:{uid}` 写在最前，
> 部分成功会留下一个「有 user、无背包」的档，随后被清理任务判为 LIVE 删掉 archive → **背包永久清空**。

**崩溃分析**：

| 时点 | 结果 | 收敛 |
|---|---|---|
| Lua 之前崩溃 | 什么都没变 | 重试 |
| Lua 之后、`DELETE archive` 之前崩溃 | 并存，`hwm == redis.fence` | `resolve` 判 LIVE → 清理任务删 archive |
| 锁过期 | Lua 返回 `lost`，**未恢复任何东西** | archive 完好，重试 |

### 惊群防护

| 防护 | 手段 |
|---|---|
| 同进程同 uid | `singleFlight` 合并 |
| 跨实例同 uid | **共用 `lock:{uid}`** |
| 全局速率 | thaw 令牌桶，**per-instance**（见常量），超限返回 `THAWING` |
| 不存在的 uid | `negcache:user:{uid}`（cache 实例，短 TTL）。**读点必须在 `EXISTS user` 之后**，建号成功立即失效 |
| **回流活动** | ⭐ 有名单就**活动开门前批量预热 thaw**，不要让 10 万人挤登录懒加载 |

---

## 清理任务

⚠️ **必须持 `lock:{uid}`。** 早期版本不持锁，直接撞上 freeze 的「写 archive → UNLINK」**正常中间态**，把整档删光。

```ts
for (const uid of await scanArchiveRows(batch)) {
  await withUserLock(uid, async () => {
    const st = await resolve(uid);
    if (st.kind === 'LIVE')          await deleteArchiveRow(uid);   // 陈旧残留
    if (st.kind === 'ARCHIVE_NEWER') await thawOverwrite(uid);      // PITR 后修复
  });
}
```

低频跑（每小时）。⛔ **Redis 点位恢复后必须先暂停清理任务与 freeze worker**，做完 fence 对账再放开（见 [06 · DR](./06-capacity-and-ops.md)）。

---

## 限速与调度

freeze 干的是对单线程 Redis 最不友好的事：大 Hash 读 + `UNLINK`。

- **按字节/字段预算限速，不按 uid 个数。** 普通档 200 字段约 0.1–0.5ms；**鲸鱼档（满背包）一次 `HGETALL` 可达 5–10ms，阻塞整个实例**。
- **鲸鱼走 `HSCAN` 分块读**：`MEMORY USAGE` 或 `HLEN` 探测，字段数 > `WHALE_FIELDS`(2000) 改用 `HSCAN COUNT`，别一次 `HGETALL`。
- **峰期强制 `FREEZE_RATE = 0`**，只在低峰窗跑。
- **背压**：`used_memory / maxmemory > 0.85` 提速；`< 0.5` 降速甚至暂停。
- 速率是 **per-Redis-instance**，随分片数线性扩。
- Redis 慢查询日志里 freeze 期间的大 Hash 读是预期内的；**其他地方出现 `HGETALL` 就是 bug**。

> 这是全设计里**唯一允许读整个 Hash** 的地方（且鲸鱼要 `HSCAN`）。理由：用户已冷、不在热路径、有限速、只在低峰跑。

---

## 常量

| 常量 | 值 | 说明 |
|---|---|---|
| `COLD_DAYS` | **90** | ⚠️ 必须 >> `max(OUTBOX_RETENTION, APPLIED_RETENTION)`；且**要避开月度回流周期**（30 天恰好压在上面，抖动最大化） |
| `FREEZE_ENABLED` | `used_memory/maxmemory > 0.6` | ⚠️ **内存水位驱动，不是注册数**。10 万注册只是「代码路径必须就绪」的里程碑 |
| `FREEZE_RATE` | 50 uid/s **per-instance**，峰期 0 | 按字段预算动态调 |
| `WHALE_FIELDS` | 2000 | 超过则 `HSCAN` 分块 |
| `THAW_RATE` | **1000 uid/s per-instance** | 瓶颈是 Redis 的多 KB `HSET`，不是 MySQL 点查 |
| `ACTIVE_LRU_BUCKETS` | 256 | 索引分片数 |
| `LOCK_RENEW_MS` | 2000 | freeze/thaw 的看门狗续租周期 |

### 为什么 `FREEZE_ENABLED` 不能用注册数

10 万注册 × 10KB × 1.3 ≈ **1.3GB** —— 而 [06](./06-capacity-and-ops.md) 自己说单实例数据面可到 16–25GB。
在用掉不到 8% 容量时就开冻结是**纯负收益**：白白引入 thaw 延迟、抖动、大 key 抖动、MySQL 权威例外，一点内存压力都没解。

而且注册数是**坏代理**：单档 5–25KB 波动 5 倍，同样 10 万注册可能是 0.65GB 也可能 2.6GB。

**用内存水位。**

---

## 监控

| 指标 | 关注 |
|---|---|
| `used_memory / maxmemory` | **0.7 告警**（`noeviction` 下打满 = 全站写雪崩）；0.6 启用冻结 |
| `mem_fragmentation_ratio` / `used_memory_rss` | 见下「内存真的回收了吗」 |
| **解冻速率 / 冻结速率** | 接近 1 = **抖动**，`COLD_DAYS` 定错了 |
| `user_archive` 行数 / 表大小 | 冷档总量 |
| thaw p99 延迟 | 影响老用户回归首屏 |
| `UserDataLostError` 计数 | **必须恒为 0**。非 0 = 真实数据丢失 |
| `freezeCommit` 返回 `lost`/`changed` 比例 | 高 = 锁 TTL 太短或 freeze 太慢 |
| 清理任务处理的 `ARCHIVE_NEWER` 数 | 非 0 说明发生过 PITR 或异常回滚 |

---

## 内存真的回收了吗

**诚实结论：冻结的收益是「封顶增长 / 复用空间」，不是「缩小 RSS」。**

- `UNLINK` 异步释放，但 Redis 未必把内存还给操作系统（jemalloc 碎片）
- `activedefrag yes` 只能回收 5–15%
- `used_memory` 会降，**`used_memory_rss` 未必**。团队常误以为冻结没生效
- RSS 真正回落只有在 `mem_fragmentation_ratio` 持续 > 1.5 时，靠 **rolling failover 重启**（切到从库）实现

---

## `user_archive` 的长期治理

冻结的是 95% 的死号。1000 万注册 → 约 950 万行 × 20KB ≈ **190GB InnoDB**。

- ⛔ **不要按 `frozen_at` 做 RANGE 分区**：分区键必须进 PK，那会让 `user_id` 单独不再唯一 → 同一 uid 出现多行不同 `frozen_at` 的档，`resolve()` 无从判断谁是权威。**`PRIMARY KEY (user_id)` 是正确性要求**（同 [05 · Δ2](./05-mysql8-schema.md#δ2--分区约束打破-match_id-唯一性) 的教训）
- 清退超期死号改用**分批 `DELETE ... WHERE frozen_at < ? LIMIT 1000`**（配合 `idx_frozen`）
- **`ROW_FORMAT=COMPRESSED` 或页压缩** → JSON 可压 3–5 倍，190GB → ~50GB
- **死号清退策略**：> N 个月未回归的档真删（配合 GDPR / 账号注销）
- ⚠️ **单档快照上限**：鲸鱼档可达 MB 级。`mysql2` 默认 `max_allowed_packet` 16MB，**单档必须小于它**，否则 INSERT 直接失败
- 「archive.snapshot 利于 BI」这句话要打折：1000 万行**无生成列索引**的 JSON 查询就是全表扫。它只适合**点查 / 取证**；要做分析必须配生成列 + 索引

---

## 与其它章节的关系

- 容量模型与桶分片、**DR runbook（PITR 后的冷/热档拼接）** → [06](./06-capacity-and-ops.md)
- `withUserLock` / `casHset` 的 `'cold'` 返回 / `fence` → [03](./03-gateway-data-layer.md)
- `applyEffect` 的 `'cold'` 返回 / relayer 前置 thaw / `op_id` → [04](./04-cross-store-outbox.md)
- `user_archive` / `singleton_lease` DDL → [05](./05-mysql8-schema.md)
- 常量、key 全表、错误码（`THAWING`） → [07](./07-contracts-and-config.md)
