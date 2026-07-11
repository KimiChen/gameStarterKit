# 06 · 容量、分片与运维

> 「玩法真源 = Redis」这个决定解决了**灾难恢复**的归属，但它**不解决容量**。
> 这两件事经常被混为一谈。本篇讲容量、分片，以及**运维必须签字的 SLA**。

---

## 容量模型

**热档不驱逐、冷档冻结释放。**

| 阶段 | 内存 ≈ |
|---|---|
| **启用冻结前** | 累计注册用户 × 单档 × 1.3 —— 与 DAU/CCU 完全解耦 |
| **启用冻结后** | **活跃用户** × 单档 × 1.3 + 抖动余量 |

> 留存 5% 的产品，冻结前 **95% 的内存在养死号**。这正是 [08 · 冷档冻结层](./08-cold-archive.md) 存在的理由。
> 下面的增长曲线表描述的是**冻结前**（也是容量规划的上界）。

### 单用户 Hash 开销

Redis 7.x 的 Hash 有两种编码：

- **listpack**（小 Hash）：字段数 ≤ `hash-max-listpack-entries`(128) 且每个 value ≤ `hash-max-listpack-value`(64B)。紧凑。
- **hashtable**：超阈值即**整表转换，不可逆**。游戏用户档字段多或存 JSON 大 value → **几乎必然是 hashtable**。

hashtable 下**每字段固定开销 ~90–110B**（`dictEntry` + key sds + value sds + jemalloc 尺寸类对齐），**与 payload 无关**。

| 设计 | 单档估算 |
|---|---|
| 精简（少量标量 + 3–5 个 JSON blob 字段） | ~5 KB |
| 混合（热标量字段级 + 冷集合 blob 化）**← 推荐** | ~10 KB |
| 全字段级脏追踪（100–200 个独立字段） | ~15–25 KB |

> **字段级脏追踪省的是写放大，付的是内存。** 150 字段 × 100B ≈ 15KB 光是字典开销。

### 增长曲线

```
内存 ≈ 注册用户数 × 单档大小 × 碎片系数(~1.3)
```

| 注册用户 | 5KB/档 | 10KB/档 | 20KB/档 |
|---|---|---|---|
| 10 万 | ~0.65 GB | ~1.3 GB | ~2.6 GB |
| 100 万 | ~6.5 GB | ~13 GB | ~26 GB |
| 1000 万 | ~65 GB | ~130 GB | ~260 GB |

### 规划口径（不是机器物理内存）

- `maxmemory` **只用到 60–65%** —— 预留 fork COW、碎片整理、复制 backlog。
  → **130GB 数据要 ~200GB+ 内存。**
- **单实例数据面控制在 ≤ 16–25 GB**。超过后 fork / BGSAVE 停顿、failover 重载、碎片整理都变得不可接受。
  → 100 万级就该开始分片，1000 万级必须 8+ 分片。
- 鲸鱼档（超大背包 / 满成就）是长尾，**p99 可达均值 3–5 倍**，分片时要防热点。

### 逃生口：冷档冻结层（已选定）

P2 的修法演变过两次，最终落点如下：

| 方案 | 结局 |
|---|---|
| ~~冷用户降级到 MySQL + lazy 回源~~ | ❌ 被「玩法真源 = Redis」作废（MySQL 无数据可回源） |
| ~~Redis-on-Flash 冷 value 下沉 SSD~~ | ❌ 被「用开源 Redis」作废（**OSS 没有 tiering**，那是 Redis Enterprise 的 Auto Tiering） |
| **纯 RAM + 桶分片起步；注册数 > 10 万启用冷档冻结层** | ✅ **已定** |

**冷档冻结层**：N 天未登录的用户整档序列化进 MySQL `user_archive`，从 Redis `UNLINK`；访问时懒解冻回源。

- 内存随**活跃用户**增长，不再随累计注册用户增长
- 代价：**冷档的权威变成 MySQL** —— 「玩法真源全放 Redis」有了例外
- 完整设计（不变量、崩溃恢复、fence 恢复、outbox 互锁、惊群防护）→ **[08 · 冷档冻结层](./08-cold-archive.md)**

> ⚠️ 开源 Redis **没有** on-flash tiering。若将来确实需要，那意味着上 **Redis Enterprise**（商业授权）。
> 当前决定是**不为尚未到来的规模提前付费**：16384 虚拟桶路由表的设计目的，正是让你先纯 RAM 起步，加实例时只搬部分桶。

---

## 分片：16384 虚拟桶 + 路由表

借鉴 `aisanguo` 的 `user_redis_list.conf`（区服 → Redis 实例映射表，加实例只改配置不动代码）。但微信小游戏**没有区服概念**，分片键只能纯由 uid 派生。

### 为什么要虚拟桶

直接 `crc32(uid) % 实例数` → 加一台实例几乎所有 uid 重映射 → **全量搬迁**。

固定 16384 桶 + 桶→实例路由表 → 加实例只搬**部分桶**。

```ts
const BUCKETS = 16384;                              // 固定，永不改（对齐 Cluster slot 数）
const bucketOf = (uid: string) => crc32(uid) % BUCKETS;   // 同 uid 永远同桶，与实例数无关
```

### 路由表

```yaml
# redis-route.yaml —— 加实例只改这张表 + 迁对应桶
buckets: 16384
instances:
  - { id: r0, addr: 10.0.0.10:6379, buckets: [[0, 4095]] }
  - { id: r1, addr: 10.0.0.11:6379, buckets: [[4096, 8191]] }
  - { id: r2, addr: 10.0.0.12:6379, buckets: [[8192, 12287]] }
  - { id: r3, addr: 10.0.0.13:6379, buckets: [[12288, 16383]] }
```

```ts
// 启动时展开成 O(1) 查表
const bucket2inst = new Int16Array(BUCKETS);
ROUTE.forEach((inst, i) =>
  inst.buckets.forEach(([lo, hi]) => { for (let b = lo; b <= hi; b++) bucket2inst[b] = i; }));

const clientFor = (uid: string) => pool[bucket2inst[bucketOf(uid)]];
```

### hash-tag：per-user key 必须同槽

`withUser` 的多键 Lua（`user` + `applied` + `lock`）要原子执行，这些 key 必须落同一 slot：

```
user:{123}    sess:{123}    lock:{123}    applied:{123}
```

`{123}` 是 hash-tag —— Redis 只对花括号内内容算 slot。

### ⚠️ hash-tag 的硬约束

**跨用户的全局 key 与 `user:{uid}` 不同槽，不能塞进同一条 Lua。**

Cluster 下这些操作全是 `CROSSSLOT`：

- 排行两段式 hydrate（多用户 `HMGET rank_sub`）
- 全服邮件批量发道具
- 公会成员战力汇总
- GM 批量补偿

**要么**逐个操作、放弃跨用户原子性；**要么** hash-tag 强绑同槽（引入热点倾斜）。

> **Redis 形态（Sentinel 单主 vs Cluster）必须上线前拍板。** 见 [README](./README.md#仍待拍板)。

### 扩容与缩容

- 加实例：改路由表 + 在线迁移对应桶。
- **缩容很难**：老实例内存永不释放。冷档冻结（[08](./08-cold-archive.md)）能封顶增长，但 RSS 未必回落（见 08「内存真的回收了吗」）。
- 存量迁移需要在线双写方案，别指望「只改路由表」。

---

## 运维必须签字的 SLA

> **「Redis 不会丢」在 `appendfsync everysec` + 异步主从下是假的。**
>
> 真实丢失 = `max(1s fsync 窗口, 主从复制延迟)`。failover 提升的是**落后的异步副本**，高写入时复制延迟可达数秒。
> 而玩法态**没有 ledger、无对账能事后发现** —— 玩家战力回档、道具消失，服务端**无报错**。

下面每条都要量化并签字，否则「玩法真源在 Redis」是建在口号上。

### 1. 持久化策略

- durable 实例：**纯 RAM + `appendfsync everysec`**（开源 Redis 无 tiering）
- **不给整实例上 `appendfsync always`** —— 写 QPS 会从十万级掉到几千~万级、延迟从亚毫秒到毫秒级
- 贵重效果由 **MySQL `gameplay_outbox` intent 兜底**（RPO=0），而不是靠 fsync

### 2. failover RPO 上界

给出**具体数字**：异步复制延迟的承诺值。

若某些字段要 RPO=0 → `WAIT numreplicas 1 timeout`（半同步）。代价：每写多一个 RTT，延迟至少翻倍；**副本宕机时 `WAIT` 超时 = 写阻塞**（拿可用性换一致性）。

### 3. 冷启动 RTO 实测

> **RPO = 0 ≠ RTO = 0。**

- 最大 RDB 加载 / AOF 重放时间：**几分钟到几十分钟**，期间**全站玩法读写不可用**（不是降级，是全停）
- 对比：MySQL failover 是秒级

必须实测并写进 SLA。

### 4. 定期 DR 演练

**真的拿备份恢复一次。**

很多团队的「能重建」只是纸面承诺，真出事才发现 AOF 损坏 / 恢复脚本跑不通。

#### ⛔ Redis 点位恢复（PITR）后的强制步骤

从旧 RDB/AOF 恢复会让 Redis 回到时刻 T。**这期间被冻结的用户，其 `user_archive` 比复活的 Redis 副本更新。**

1. **先暂停 freeze worker 与清理任务**（否则清理任务会按旧逻辑删掉更新的 archive 行）
2. 跑 **fence 对账**：对所有 `user_archive` 行比较 `fence_hwm` 与 Redis 的 `user:{uid}.fence`
   - `archive.fence_hwm > redis.fence` ⇒ **archive 更新** ⇒ 用 archive 覆盖 Redis（`ARCHIVE_NEWER`）
   - 否则 Redis 胜，删 archive 行
3. 对账完成后再放开 worker

> 这就是 [08](./08-cold-archive.md) 用 **fence 新鲜度**（而非「谁存在」）判权威的原因。
> 按「谁存在」判定，一次 2 小时前的恢复会让这期间冻结的**几十万用户静默回档**，且服务端无报错。

### 5. durable / cache 物理分实例

| 实例 | 策略 |
|---|---|
| `redis-durable` | `maxmemory-policy noeviction` + 纯 RAM + 主从 |
| `redis-cache` | `maxmemory-policy allkeys-lru` |

> ⛔ **「放独立逻辑库 `SELECT n` 就能隔离内存策略」是技术错误。**
> `maxmemory-policy` 是**实例级**配置，逻辑库不隔离内存策略，也共享同一 `maxmemory`。
> 可驱逐的 cache 增长会把 noeviction 的 durable 玩法数据一起顶到 OOM。

### 6. 大 key 运维

- 删除一律 **`UNLINK`**（同步 `DEL` 一个大 Hash 单条就能卡住实例几十毫秒）
- `redis-cli --bigkeys` / `MEMORY USAGE` 采样监控大 key 分布
- RDB fork 时段避开高峰，**预留 ~2× 内存**（COW）
- `MIGRATE` 大 key 会阻塞 slot 迁移

---

## 监控与告警

| 指标 | 阈值 / 动作 |
|---|---|
| `used_memory / maxmemory` | **0.7 即告警**并启动扩容评估（noeviction 下打满 = 全站写雪崩，要留人工干预窗口） |
| 主从复制延迟 | 超过承诺 RPO 即告警 |
| `gameplay_outbox` pending 深度 / 最老 pending 年龄 | 持续增长 = relayer 挂了或 Redis 写不进 |
| outbox `attempts` 超阈值行数 | 死信积压，需人工介入 |
| `stream:match` PEL 深度 | P7 证据链消费滞后 |
| 大 key 数量 / 最大 Hash 字段数 | 防单线程阻塞 |
| Redis 慢查询日志 | `HGETALL` 出现即是 bug（**唯一例外**：冻结 worker，见 [08](./08-cold-archive.md)） |
| 解冻速率 / 冻结速率 | 接近 1 = **抖动**，`COLD_DAYS` 定错了 |
| `USER_DATA_LOST` 计数 | **必须恒为 0**。非 0 = 真实数据丢失 |
| MySQL 死锁率（errno 1213） | RR 间隙锁引起，考虑切 RC |

---

## Schema 演进：Redis 没有 `ALTER`

MySQL 加字段 = 一条 `ALTER` 全表生效。**Redis Hash 字段是运行时松散的** —— 老用户的 Hash 里根本没有新字段，改语义 / 改编码 / 删字段没有统一入口。

### 风险

滚动发布期新旧代码**共享同一 Redis**：新版改了背包 blob 的序列化格式，老版实例读到新格式解析失败，或写回把新字段冲掉 —— **互相写坏对方数据**。一次没做双读兼容的上线就能污染一批用户存档。

### 对策

1. 存档 blob 带 **`schemaVersion`** 字段。
2. 读侧**强制兼容 N 与 N-1** 两个版本（双读）。
3. 写侧灰度期先写兼容格式。
4. key 命名变更走 **expand → contract**（双写新旧 key，再收敛）。
5. 配**懒迁移 worker**：读到老版本时顺手升级。
6. **把「Redis 数据契约」纳入部署流程一等公民** —— 和 MySQL 迁移脚本同等对待。

---

## BI / GM / 风控怎么办

真源在 Redis Hash 里，跑留存 / 背包分布 / 战力分布报表**没法 SQL join**；线上实例 `SCAN` 百万 key 做聚合会拖垮它。

**方案：单向只读导出通道**

```
Redis (durable) ──定时快照/keyspace 事件──▶ 数仓 / MySQL 只读镜像
```

- **明确定性：非权威、不回写、不参与恢复。**
- 与在线权威路径**解耦**（导出挂了不影响线上）。
- GM 改档**必须走和玩法写同一条 `withUser` + Lua CAS 通道**，⛔ 禁止旁路直改 Hash。

---

## 已知代价（需产品/风控确认）

「玩法真源 = Redis」是一组权衡，这些代价已经确认接受，但要让相关方知情：

| 代价 | 说明 |
|---|---|
| **无历史可追** | Hash 只存当前值。玩家投诉「道具没了」、风控回溯「3 天前战力怎么暴涨」、bug 批量写坏后定点回滚 —— 都无从下手 |
| **撤销只能前向补偿** | 不能「恢复旧值」，只能 clawback 冲正 |
| **恢复期全站玩法不可用** | Redis 冷启动几分钟到几十分钟 |
| **内存成本随活跃用户上涨** | DRAM 每 GB 成本比 MySQL 磁盘高 1–2 个数量级（冷档冻结把死号移出内存，见 [08](./08-cold-archive.md)） |
| **老实例缩不了容** | 冷档冻结能**封顶增长**，但 `UNLINK` 后 RSS 未必回落（jemalloc 碎片）。真正还内存给 OS 只能靠 rolling failover 重启 |

> 若「定点回滚 / 审计追溯」后来变成硬需求，就必须让关键玩法变更也走**不可变事件流**（绝对值快照，非增量）。
> 那会重新引入一条落库管道 —— 提前知道这个岔路口在哪。

---

## 最后一句

> **Redis「物理不丢」≠「Redis 里的值是对的」。**
>
> 持久性可以外包给运维，**一致性不行**。
> [P4](./02-failure-patterns.md)（执行前幂等占位）、[P6](./02-failure-patterns.md)（fence 守业务写）、大 Hash 阻塞单线程、schema 演进无 `ALTER` —— 这些都是**应用层责任**，运维的物理持久性承诺一条也堵不住。
