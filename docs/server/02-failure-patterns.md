# 02 · 七个反复出现的失效模式

7 个子系统各自深化设计 + 对抗性评审后，挖出 **31 个上线阻断级（critical）+ 67 个 major** 问题。但真正的结论不是「98 条零散 bug」——而是**同一批失效模式在每个子系统反复出现**，绝大多数指向同一个根因：

> **把强一致需求错误地建在 Redis 的最终一致之上。**

先建立这 7 条横切原则，再看各子系统就都是它的实例。

每条都标注了「玩法真源 = Redis」决定之后的**当前状态**。

---

## P1 · 撤销/货币不能只押「删 Redis key」

**状态：仍然成立（对货币/会话）**

### 问题

Redis 主从异步复制 + AOF `everysec`：**failover 会复活被删的 session、蒸发未落库的货币**。

- 封号后切到落后副本 → 被封会话又能查到
- 已 ack 的充值在复制跟上前主库崩溃 → 凭空消失

真实 RPO = `max(AOF fsync 窗口, 主从复制延迟)`，高写入下是**数秒**，不是 1s。

### 修法

- 撤销引入与账号绑定的**持久 `token_epoch`**（落 MySQL）。session 带签发时的 epoch，落后即失效。「删 key」只是加速，**不是唯一真相**。
- 货币彻底移出 Redis-then-batch：**同步 write-through MySQL 事务**（`UPDATE balance + INSERT outbox` 同事务），Redis 只做读缓存。

### 本轮修订

玩法的「撤销」不再是「恢复 MySQL 旧值」（MySQL 已无玩法数据）——只能**前向补偿 clawback**。

> ⚠️ **不要把 lock fence 和 `token_epoch` 混成同一个计数器。**
> `fence` 每次抢锁递增（守并发写；Redis 计数器 `fence:{uid}`，其 MySQL 持久形态是 `user_currency.last_fence` 列）；
> `token_epoch` 仅封号/踢人时递增（守鉴权，落 MySQL `accounts`）。
> 若每个请求都在 bump 同一个计数器，撤销语义就失效了。命名对照见 [07](./07-contracts-and-config.md#术语与命名统一)。

---

## P2 · `noeviction` + 热用户只进不出 = OOM 写雪崩

**状态：修法已作废，换新方案**

### 问题

内存随**历史累计注册用户数**单调增长，**不是在线数**。留存 5% 的产品，95% 的内存在养死号。

`noeviction` 下内存打满，所有写命令（新登录 `HSET`、`EXPIRE` 续期）一律返回 OOM 错误 —— **全站写入雪崩，不是优雅降级**。

### 修法演变（改过两次，注意别看旧版）

| 方案 | 结局 |
|---|---|
| ~~冷用户降级到 MySQL + lazy 回源~~ | ❌ 被「玩法真源 = Redis」作废（MySQL 无数据可回源） |
| ~~Redis-on-Flash 冷 value 下沉 SSD~~ | ❌ 被「用开源 Redis」作废（OSS 无 tiering，那是 Enterprise 的 Auto Tiering） |

### 现行修法

1. **纯 RAM + 16384 虚拟桶分片**起步：加实例只搬部分桶，不触发全量 rehash。
2. **冷档冻结层**（注册数 > 10 万启用）：N 天未登录的整档序列化进 MySQL `user_archive`，从 Redis `UNLINK`；访问时懒解冻。
   → 内存随**活跃用户**增长，不再随累计注册用户增长。
3. **durable / cache 物理隔离**：两个独立实例，不是一个实例分逻辑库。

> ⚠️ 冷档冻结层让 **MySQL 成为冷档的权威** —— 这是「玩法真源 = Redis」的**一个有意接受的例外**。
> 它引入了三条必须遵守的约束（`COLD_DAYS` 与 outbox 窗口的关系、冻结前置闸、`fence` 高水位恢复），**照抄前务必读** [08](./08-cold-archive.md)。

详见 [06 · 容量与运维](./06-capacity-and-ops.md) 与 [08 · 冷档冻结层](./08-cold-archive.md)。

---

## P3 · Stream 用 `MAXLEN` 裁剪 = 静默删掉未落库数据

**状态：收窄，只对存活的可靠流生效**

### 问题

多处设计以为 `XADD ... MAXLEN ~` 只裁「已 ACK」的旧条目 —— **错的**。

`MAXLEN` 按**流长度**无条件裁掉最老条目，**完全不看消费组 PEL / ACK 状态**。worker 落后时正是积压最多、最容易触发的时刻，未落库的数据被直接删除。

### 修法

- 用基于**已落库位点**的 `XTRIM MINID`（只裁 `< 全局已持久化 id` 的条目）
- `MAXLEN` 仅作**远超峰值**的兜底防爆
- 对 pending 深度 + 内存双告警
- 不变量：**裁剪只发生在「已 ACK 之下」**

### 本轮修订

玩法进度流已删。本条只对**存活的可靠流**生效：

- `stream:match`（P7 证据链）
- `mail` 必达流

> 纯分析用的、可丢的流，`MAXLEN` 反而可以放心用。

---

## P4 · 幂等要「执行前占位」+ 下沉数据层

**状态：仍然成立，玩法侧兜底改到 Redis**

### 问题

普遍写法是 `GET 命中 → 否则执行 → 成功后 SET NX`：

- GET 与执行之间**没有原子占位** → 并发双发（双击 / 弱网重发 / 多开）**双双 miss、双双执行** → 重复扣费 / 重复发奖
- 「仅成功后 SET」不覆盖**崩溃 / 超时**路径
- pending 哨兵用 24h 长 TTL 会变**毒丸**，卡死用户 24 小时

### 修法

1. 执行前原子 `SET NX PX` 一个**短租约**（5–15s）哨兵占位。抢到才执行，完成后覆写为结果；没抢到就轮询/等结果。
2. 真正的幂等**下沉到数据层**：
   - 货币：MySQL `UNIQUE(user_id, idem_key)`
   - **玩法：Redis 原生**（`applied:{uid}` ZSET 里的 `op_id`）—— 因为 Redis 现在是被假设不丢的权威，Redis 原生幂等成为**可接受的最终裁决**，而非以前的「快路径」

   > 二者其实是**同一个服务端派生的 id**：`currency_ledger.idem_key` = `gameplay_outbox.op_id` = `applied:{uid}` 的 member。**三处同一个 id** 串起整条链路，详见 [04](./04-cross-store-outbox.md#op_id-怎么来)。
3. 幂等 key 绑 `type` + `sha256(payload)`，防跨操作串味。

> ⚠️ **`INSERT IGNORE` 是陷阱**：它把截断 / NOT NULL / CHECK 违反全部降级为 warning 静默吞掉。
> 用 `INSERT ... ON DUPLICATE KEY UPDATE id = id`，`ROW_COUNT() = 0` 即表示重复。

---

## P5 · at-least-once + `HINCRBY` 增量 = 永久发散

**状态：对玩法侧按定义消失**

### 问题（历史）

游戏节点用非幂等 `HINCRBY` 直写 Redis 热态，MySQL 侧却用幂等语义。Stream 至少一次投递 + `XAUTOCLAIM` 重放一次：

- MySQL 不重复计
- Redis 已多加且不回滚
- → **Redis 余额永远比 MySQL 多，且以谁为准无解**

### 本轮修订

玩法侧的「跨存储发散」**按定义消失** —— 只有一个存储，无副本可发散。对账 job 只剩**货币缓存**一处。

**但纪律保留**，目的变了：

> 单写者 + **绝对值覆写**（不是重加 delta），目的从「防两库发散」变成 **「防单库重放双 apply」**。

Redis 侧的 apply 必须用 `op_id` 守卫（见 [04](./04-cross-store-outbox.md) 的 Lua）。

---

## P6 · fencing token 要守「业务写」，不只守租约行

**状态：仍然成立，玩法侧改到 Redis Lua**

### 问题

设计只对 `singleton_lease` 心跳行做 `WHERE fence_token = ?`，但 relayer/worker 批量写业务表那一步**没有 token 守卫**。

GC 暂停超过锁 TTL 的**僵尸 leader**，在自杀前已经把过期批次写进业务表，新 leader 同时写 → **货币双写 / 覆盖**。

### 修法

- 把「lease 守卫 `UPDATE`」与「业务批写」放进**同一个 MySQL 事务**，守卫 UPDATE 作事务第一句；受影响 0 行立即 `ROLLBACK` 并自杀。
- 业务写**绝不脱离 token 守卫单独提交**。

### 本轮修订

玩法业务写现在落 Redis → fence 必须在 **Lua 里对 hash 的 `fence` 字段做 CAS**：

```lua
local cur = tonumber(redis.call('HGET', KEYS[1], 'fence') or '0')
if cur > tonumber(ARGV[2]) then return 'stale' end   -- 僵尸写被拒
```

MySQL 的 `WHERE last_fence <= :f` 只保留给货币/订单。

> **推论：锁 `PX 5s` 中途过期不需要看门狗续租。** 这正是 fencing 的意义——僵尸写会在 fence 守卫处被拒。
> 但 Redis 投影也必须比 fence，否则旧 writer 能覆盖新值。

---

## P7 · ranked 的「服务端权威」是假的

**状态：仍然成立，发奖变成跨存储操作**

### 问题

裁判模型下服务端只 **mirror 客户端自报**的 `round` / `hearts` / `Defeated`，不跑仿真；胜负 tiebreak 全靠客户端上报值。

而反作弊是**纯事后软告警**（`VersusRoom.ts` 的 `verifyOne` 在 `verdict === false` 时仅 `console.warn`，**当前不落任何列/表**），金币 / 段位 / 排行 ZSET / 战绩在校验**之前**就已写死、**无追回**。

→ 天梯可被伪造进度和双开直接操纵。

叠加已承认的 iOS JSC / Android V8 浮点末位差异，两个**诚实**客户端也可能各自算出不同的 `round`。

### 修法

1. ranked 结算把 gold / star / rank 的落地**延迟到无头重放校验通过之后**（先写 pending，验过再 commit）。
2. `verdict = suspect` 走 **clawback**：反向冲销 delta + 从排行 ZSET 撤下。
3. **发奖类结算强制 100% 校验**，抽样只用于低风险局。
4. 休闲局可保持乐观即时结算。
5. 文档里**不要**把它描述成「服务端权威判定」——它是信任模型。

### 本轮修订

发奖被拆两半（**货币走 MySQL、道具走 Redis**）→ 单次发奖成为**跨存储操作**，必须走 [outbox intent 协议](./04-cross-store-outbox.md)。

clawback 也分头：扣币走 MySQL 冲正、收道具走 Redis 补偿。

> 回放校验的输入必须完整：包含服务端下发的 `InjectWave` 注入序列（含 nonce/tick）、`loadout`、`mapIndex`。
> 否则 verifier 重放出的轨迹和真实对局不一致，误报/漏报。

---

## 速查表

| # | 模式 | 当前状态 | 一句话修法 |
|---|---|---|---|
| P1 | 撤销/货币只押删 Redis key | 成立 | MySQL `token_epoch` + 货币同步事务 |
| P2 | noeviction 只进不出 OOM | **修法改过两次** | 纯 RAM + 桶分片 + **冷档冻结层**（[08](./08-cold-archive.md)） |
| P3 | Stream `MAXLEN` 删未落库数据 | 收窄 | `XTRIM MINID` 按落库位点裁 |
| P4 | 幂等事后 SET | 成立 | 执行前短租约占位 + 数据层 UNIQUE |
| P5 | `HINCRBY` 增量跨库发散 | 收窄 | 绝对值覆写（防单库重放） |
| P6 | fence 只守租约行 | 成立 | 守卫与业务写同事务 / Redis Lua CAS |
| P7 | ranked 服务端权威是假的 | 成立 | 发奖延迟到重放校验 + clawback |
