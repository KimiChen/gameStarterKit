# 09 · 开发约束（PR 审查清单）

> 本篇是 01–08 全部设计的**规则收敛**：写代码必须遵守、code review 按条核对。
> 每条有编号（如 `A2`、`DB3`），review 时直接引用「违反 A2」。规则的**推导过程**在括号链接的原文里——不服先读原文再挑战。
>
> 配套：[10 · 实现步骤](./10-implementation-plan.md) 告诉你按什么顺序做；本篇告诉你做的时候**什么不能碰**。
>
> 前缀含义：A 数据权威 · L 锁与 fence · I 幂等 · X 跨存储 outbox · R Redis · **DB MySQL** · G 网关 · K 排行与流 · F 冷档 · S 演进。
> （MySQL 规则用 `DB` 前缀，避免与 10 的里程碑编号 M0–M10 混淆。）

---

## 最容易犯的十个错（先背这个）

1. 把货币写进 Redis 当权威（`HINCRBY coin`）→ 违反 **A2**，钱会蒸发
2. 幂等写成「成功后 SET」→ 违反 **I1**，并发双发会双双执行
3. 用 `INSERT IGNORE` 去重 → 违反 **DB1**，静默吞掉截断/NOT NULL 错误
4. `HGETALL` 读整个用户档 → 违反 **R1**，阻塞整个 Redis 实例
5. module 级全局变量收集脏字段 → 违反 **R8**，A 玩家的改动会 flush 进 B
6. 往 `TINYINT` 的 `status` 列插字符串 `'pending'` → 违反 **DB6**，严格模式下每次购买都报 1366
7. 在不存在的 `user:{uid}` 上直接 `HINCRBY` → 违反 **R2**，凭空造残档、冷档整档丢失
8. 给 outbox apply 加 fence CAS → 违反 **X3**，锁过期后道具永远发不出去
9. `UNLINK`/批量恢复不在 Lua 里复检锁归属 → 违反 **L4**，锁过期后盲删别人刚写的新档
10. 客户端传 `userId` 就信 → 违反 **G1**

---

## A · 数据权威与分级

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **A1** | 写任何字段前先查[数据分级表](./01-architecture.md#数据分级核心)确定真源与写路径。判断口径：「掉了会不会有人投诉/退款」 | 走错写路径 = 丢数据或白做管道 | 01 |
| **A2** | 货币/账号/订单真源 = **MySQL 同步事务**。⛔ 禁止在 Redis 对货币做权威增量；Redis 侧只有 `cache:currency:{uid}`（cache 实例、只读、TTL 5m、miss 回源） | 货币蒸发/复活，P1 | 01/02 |
| **A3** | 玩法状态（热档）真源 = **Redis**，⛔ 不落 MySQL。禁止复活 dirty 集合 / flush worker / `user_snapshot` 任何形态的 write-behind 管道 | 双写者永久发散，P5 | 01/02 |
| **A4** | **冷档例外**：N 天未登录的档权威在 MySQL `user_archive`。访问冷 uid 必须先 `ensureLive()` | 读到空档/建号覆盖老玩家 | 08 |
| **A5** | `user_snapshot_readonly` / 数仓导出 = **非权威、不回写、不参与恢复**。GM 改档必须走 `withUser` 通道，⛔ 禁止旁路直改 Hash | 改出不一致，无对账能发现 | 05/06 |
| **A6** | **邮件投递状态以 MySQL `mail.read_at` / `claimed_at` 为唯一权威**，Redis Stream 只作实时唤醒；客户端按 `mail_id` 去重（至少一次投递）。附件领取走 `attach_op_id` → outbox | 换网关节点后 PEL 孤儿丢邮件 | 05/01 |

## L · 锁与 fence

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **L1** | 同一 uid 的**玩法写 / freeze / thaw / 清理任务**全部走同一把 `lock:{uid}`（`withUserLock`）。⛔ `thaw:{uid}` 已废弃，禁止引入第二把 per-uid 锁 | 两把锁互不互斥 = 冷档四个数据丢失 bug 的根因 | 08 |
| **L2** | 三个 fence 概念禁止混用：① per-uid 锁 fence（`fence:{uid}` 计数器 / hash 的 `fence` 字段 / MySQL `last_fence` 列）② `singleton_lease.fence_token` ③ `token_epoch`（仅封号/踢人递增） | 撤销语义失效或僵尸写放行 | 07 |
| **L3** | fence 必须守**业务写**：MySQL `WHERE last_fence <= :f`；Redis 在 `casHset` Lua 内 CAS。⛔ 只守租约行不算守 | 僵尸 leader 双写货币，P6 | 02 |
| **L4** | `UNLINK`、批量恢复 `HSET` 等**不受 fence 守卫的破坏性操作**，必须在**同一条 Lua 里先复检锁归属**（`GET lock == myFence`）再执行；返回 `lost` 即放弃、零破坏 | 锁过期后盲删/盲覆盖新数据 | 08 |
| **L5** | 进程内 per-uid 排队用 **async mutex（await 队列）**。⛔ 禁止 `sleep()` 轮询抢锁；跨实例锁**有界重试**，禁止无限递归 | 空转 event loop / 栈溢出 | 03 |
| **L6** | `LOCK_TTL_MS`(5s) 必须 > 货币事务 p99（M0 压测定数）。**看门狗续租仅 freeze/thaw 慢操作启用**（`LOCK_RENEW_MS`），`casHset` 路径锁过期是安全的（fence 拦），⛔ 不要给普通写路径加看门狗 | 拉长僵尸持锁 / 冷档盲删 | 03/08 |

## I · 幂等

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **I1** | 幂等 = **执行前**原子占位（`SET NX PX`，pending 短租约 **10s**）+ **数据层 UNIQUE 兜底**。⛔ 禁止「成功后 SET」；⛔ 禁止 pending 用长 TTL（24h = 毒丸卡死用户） | 并发双发双执行，P4 | 02/07 |
| **I2** | `op_id` **服务端派生**：`uuidv5(uid:type:clientReqId)`。客户端只提供 `clientReqId`，重试必须复用同一个 | 幂等失效或客户端伪造 | 04 |
| **I3** | **三处同一个 id**：`currency_ledger.idem_key` = `gameplay_outbox.op_id` = `applied:{uid}` member | 链路断裂无法对账 | 04 |
| **I4** | 幂等唯一键是 `UNIQUE(user_id, idem_key)`，⛔ 不是全局 `UNIQUE(idem_key)` | 跨用户串号误判重复 | 05 |
| **I5** | `APPLIED_RETENTION ≥ 2 × OUTBOX_RETENTION`；`applied:{uid}` 裁剪用 `ZREMRANGEBYSCORE`，窗口必须**严格大于** outbox 保留窗口 | relayer 重放老 intent 二次发货 | 04 |

## X · 跨存储 outbox

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **X1** | 同时碰「钱(MySQL) + 道具(Redis)」的操作必须走 outbox：**MySQL 事务（ledger + 扣款 + INSERT intent 三者原子）→ `redisApply` → `markOutboxDone`**。货币先行 | 扣了钱没发货 / 发了货没扣钱 | 04 |
| **X2** | 只改 Redis 不碰钱的请求**直接 `withUser` + `casHset`**，⛔ 不要引入 outbox | 无谓复杂度 | 04 |
| **X3** | outbox apply（`applyEffect`）**不做 fence CAS**——已提交的 intent 是权威决定，exactly-once 靠 `op_id`。返回值只有 `ok/dup/cold`，⛔ 没有 `stale` | 锁过期后全部进死信，道具永远发不出 | 04 |
| **X4** | `gameplay_outbox.status` 是 `TINYINT`，全代码用数字常量 `OUTBOX_PENDING=0/DONE=1/DEAD=2`。⛔ 禁止字符串 | 严格模式 1366，每次购买失败 | 04 |
| **X5** | relayer 遇 `cold` → `ensureLive(uid)` → 重试。⛔ relayer 不走 `withUser`，但 apply 前必须处理冷档 | 在缺失 hash 上造残档 → 整档丢失 | 04/08 |
| **X6** | dead 行人工处置**必须走重放**（`redisApply`，由 `applied` 去重）。⛔ 禁止手改 `status = done` | 「已发货」假设与事实脱节 | 08 |
| **X7** | relayer / freeze worker / 赛季轮换是**单例**：`singleton_lease` + `fence_token`，续租 UPDATE 与业务批写**同一个 MySQL 事务**、守卫作第一句、0 行即 ROLLBACK 自杀。⛔ 禁止用 `GET_LOCK` 替代（连接作用域，连接池下泄漏） | 僵尸 leader 双写 | 05 |
| **X8** | clawback 扣道具注意**负数下溢**：Lua 里 `HINCRBY` 后结果 `< 0` 则回补到 0 并记录异常 | 负数背包 / 异常无痕 | 04 |

## R · Redis 纪律

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **R1** | ⛔ 禁止 `HGETALL` 大 Hash。读用 `HMGET` 按需取字段；背包拆 `bag:{uid}:{0..3}`。**唯一例外**：freeze worker（限速 + 低峰 + 鲸鱼档走 `HSCAN`） | 单线程阻塞，全实例 p99 飙升 | 03/08 |
| **R2** | ⛔ 任何写路径不得隐式创建 `user:{uid}`。`casHset` / `applyEffect` 前置 `EXISTS`，缺失返回 `cold`。只有**建号**和 **thaw** 能创建 | 冷档被残档覆盖，整档丢失 | 08 |
| **R3** | per-user key 一律 `{uid}` hash-tag 同槽。⛔ 跨用户 key（`rank:*`、`active:lru:{bucket}`、`stream:match`）不进同一条 Lua | Cluster 下 `CROSSSLOT` | 06 |
| **R4** | durable（`noeviction`）与 cache（`allkeys-lru`）**物理分实例**。⛔「逻辑库 `SELECT n` 隔离内存策略」是技术错误 | cache 增长把 durable 顶到 OOM 写雪崩 | 06 |
| **R5** | 权威 key（`user`/`bag`/`fence`/`applied`）**无 TTL**；协调 key（`lock` 5s / `idem` 10s/60s / `sess` 3d）按 [07 key 全表](./07-contracts-and-config.md#redis-key-全表)设 TTL。新增 key **必须先进 07 全表**，⛔ 禁止自创 | 驱逐 = 丢数据；或锁永不释放 | 07 |
| **R6** | 删大 key 一律 `UNLINK`，⛔ 禁止同步 `DEL` | 单条卡实例几十毫秒 | 06 |
| **R7** | 所有 Lua 走 `EVALSHA` + `NOSCRIPT` 自动 `SCRIPT LOAD` 重载。**时钟敏感的判定逻辑**（限流 `tokenBucket` 等）在 Lua 内用 `redis.call('TIME')`，⛔ 禁止 app 传时钟做判定。（`applyEffect` 的 `now_ms` 仅作 `applied` 的 ZADD score、不参与判定，是 [04](./04-cross-store-outbox.md) 既定契约，不在此列） | failover 后脚本失效 / 多节点时钟漂移污染限流 | 03/04/07 |
| **R8** | 脏追踪必须**每 RPC 作用域**（`UnitOfWork` 实例）。⛔ 禁止 module 级全局脏表；⛔ 禁止 Proxy 魔术拦截 | async 交错把 A 的改动 flush 进 B | 03 |
| **R9** | `ioredis.hmget` 返回**与字段顺序对齐的数组**（缺失为 `null`），不是对象。自己 zip | 类型错误静默读错字段 | 03 |

## DB · MySQL 纪律

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **DB1** | 去重用 `INSERT ... ON DUPLICATE KEY UPDATE id = id`（`affectedRows`：插入=1/重复=0）。⛔ 禁止 `INSERT IGNORE` | 截断/NOT NULL/CHECK 全被静默吞 | 05 |
| **DB2** | 无 `RETURNING`。自增用 `result.insertId`；CAS 用 `affectedRows` 判成败；要新值同事务内 `SELECT`。`LAST_INSERT_ID()` 连接局部——`seq` 表二语句形必须**同一根连接** | 连接池下取到错值 | 05 |
| **DB3** | id / token / hash / `idem_key` 列一律 `CHARACTER SET ascii COLLATE ascii_bin` | 默认排序不敏感，`u_Ab`/`u_ab` 撞主键 | 05 |
| **DB4** | 分区键必须进 PK → 单列唯一性被打破。`match_results` 用非分区 `match_index` 做幂等闸；`user_archive` ⛔ 禁按 `frozen_at` 等时间列 RANGE 分区（`PARTITION BY KEY(user_id)` 可选），**`PRIMARY KEY (user_id)` 是正确性要求** | 重复结算不被拦 / 冷档双行无法判权威 | 05/08 |
| **DB5** | 货币 / outbox / 转账会话切 `READ COMMITTED`（前提 `binlog_format=ROW`）；写路径**主键等值定位**；捕获 1213/1205 指数退避重试 | RR 间隙锁死锁风暴 | 05 |
| **DB6** | `TINYINT` 状态列全用数字常量。默认 `sql_mode` 含 `STRICT_TRANS_TABLES`，保持严格模式 | 1366 或静默截断 | 04/05 |
| **DB7** | 多步 DDL 不是一个事务。大表 ALTER 走 `gh-ost`/`pt-osc`，小改 `ALGORITHM=INSTANT`，每步幂等可重入 | 迁移中途失败留半迁移态 | 05 |
| **DB8** | `mysql2` 自动把 `JSON` 列解析成对象——传给 Lua 前必须 `JSON.stringify`（统一在 `redisApply` 内做）。鲸鱼档 snapshot < `max_allowed_packet`(16MB) | ARGV 类型错 / INSERT 失败 | 04/05 |

## G · 网关与协议

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **G1** | `userId` 一律**从 token 反查**。⛔ 禁止信任客户端传的 `userId`（现有 `VersusRoom.onAuth` 的「userId+token 配对校验」是过渡态，目标态删掉 userId 入参） | 越权 | README/03 |
| **G2** | 读写分路：只读 handler（`readUser`/`readUserReadonly`）**不取分布式锁、不进脏表**；读别人的档必须 readonly 冻结对象 | 每次看档抢锁 / 误写别人档 | 03 |
| **G3** | 错误码按 [07 错误码表](./07-contracts-and-config.md#错误码表)，客户端按 `code` 分支，⛔ 禁止解析 `msg`。新增错误码必须先加表 | 前后端契约漂移 | 07 |
| **G4** | 大包防护在 **ws transport 层设 `maxPayload`**（超限断帧不解码）；dispatcher 层校验只是兜底 | 大包已吃完内存才被拒 | 03 |
| **G5** | 匿名/optional-auth 的限流与幂等 key 用 `sessionId`/真实 IP。⛔ 禁止 `userId=null` 塌缩成共享 key | 一个匿名连接连坐全站 | 03 |
| **G6** | 未知 `type` 只回 `UNKNOWN_TYPE` + 低权重计数，⛔ 不计 flood 不封禁 | 灰度期误封新客户端 | 03/07 |
| **G7** | 封号/踢人 = MySQL `token_epoch+1`（先写 MySQL）+ 删 `sess:{uid}`。⛔ 绝不删 `user:{uid}`；`wx-login` 签发前必须 `SELECT status` | failover 复活被封会话 / 封号挡不住重登 | 02/05 |
| **G8** | **`session_key` 仅服务端持有，绝不下发**；`wx-login` 出参⛔禁含 `openid` / `unionid` / `session_key` | 隐私标识与密钥泄漏 | 01 |
| **G9** | handler 超时用 `Promise.race` **无法真正取消**——超时后 handler 仍在后台跑并可能完成副作用。关键写副作用必须在数据层做幂等/CAS（I1/L3），⛔ 不依赖应用层取消 | 超时重试与迟到首跑双写 | 03 |

## K · 排行、结算与流

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **K1** | `encodeScore` 分母 = **赛季长度** `SEASON_LEN_S`（⛔ 不是绝对 epoch）；`intScore` 控制在 ~1e12 内；累加必须**单条 Lua**内 `ZSCORE→重算→ZADD`，⛔ 禁止直接 `ZINCRBY` | tie-break 分辨率归零 / 语义破坏 | 03 |
| **K2** | 结算去重键 = `lb:dedup:{matchId}:{uid}`，⛔ 禁止只按 `matchId` | 一局里除首人外全部丢更新 | 03 |
| **K3** | ranked 发奖**延迟到无头重放校验通过**（先 pending 再 commit）；**发奖类结算强制 100% 校验**，抽样只用于低风险局；`verdict=suspect` 走 clawback（新 `op_id` 反向冲销，注意 X8）。发奖状态落 MySQL `rank_award UNIQUE(season,uid)`，⛔ 不只存 Redis | 天梯被伪造进度操纵，P7 | 02 |
| **K4** | `matchId` 在 `startMatch` 生成一次写进 state（现仓库**没有**，要新增），结算复用。落库前过 `match_index` 幂等闸 | 重跑生成不同 id → 战绩重复计数 | 05/README |
| **K5** | 回放校验输入必须**完整**：服务端下发的 `InjectWave` 注入序列（含 nonce/tick）、`loadout`、`mapIndex` 都要入证据链 | verifier 误报/漏报 | 02 |
| **K6** | 可靠流（`stream:match` 证据链、mail 唤醒流）⛔ 禁止 `MAXLEN` 裁剪（按长度无条件删最老条目，**不看 ACK**）。用基于已落库位点的 **`XTRIM MINID`**；`MAXLEN` 仅作远超峰值的兜底。纯分析可丢的流才可用 `MAXLEN` | 静默删掉未落库数据，P3 | 02 |

## F · 冷档（[08](./08-cold-archive.md) 全篇都是硬约束，此处摘要）

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **F1** | 权威判定用 **fence 新鲜度**（`archive.fence_hwm` vs `user.fence`），⛔ 不是「谁存在」。平局判 LIVE | PITR 后删掉更新的 archive，静默回档 | 08 |
| **F2** | `COLD_DAYS`(90) >> `max(OUTBOX_RETENTION, APPLIED_RETENTION)`；冻结前置闸（无 status 0/2 的 outbox 行）**锁内复查**；`applied` 成员一并归档 | 二次发货 | 08 |
| **F3** | thaw 恢复必须**单条 Lua 原子**（⛔ 禁止 pipeline）；`fence_hwm` 同时写**计数器和 hash 字段** | 部分成功留「user 在 bag 空」→ 背包清空 / 僵尸写放行 | 08 |
| **F4** | `ABSENT` 时查 `accounts`：有号 = **数据丢失，告警 + 拒绝建空档**（`USER_DATA_LOST`）；无号才走建号。负缓存读点在 `EXISTS user` **之后**，建号成功立即失效 | 数据丢失被伪装成正常注册 | 08 |
| **F5** | `FREEZE_ENABLED` 按**内存水位**（`used_memory/maxmemory > 0.6`）启用，⛔ 不按注册数；速率 per-instance；PITR 恢复后**先停 worker 做 fence 对账** | 过早冻结纯负收益 / 恢复后批量误删 | 06/08 |

## S · Schema 演进

| # | 规则 | 违反后果 | 详见 |
|---|---|---|---|
| **S1** | Redis 玩法档 blob 带 `schemaVersion`；读侧强制兼容 **N 与 N-1**（双读）；写侧灰度期先写兼容格式；配懒迁移 worker | 滚动发布期新旧代码互相写坏存档 | 06 |
| **S2** | key 改名走 **expand → contract**（双写新旧 key 再收敛）；`BAG_SHARDS`/`BUCKETS` 改变即数据迁移，⛔ 不许随手改常量 | 静默丢数据 | 06/07 |

---

## PR 审查流程建议

1. 改动涉及**写路径** → 对照 A（真源对不对）→ I（幂等）→ L（锁与 fence）
2. 涉及 **Redis** → R 全查；涉及 **MySQL** → DB 全查
3. 涉及**钱 + 道具** → X 全查
4. 涉及**冷档/`ensureLive`/relayer** → F 全查 + 08 全文
5. 涉及**结算/排行/Stream** → K 全查
6. 新增常量/key/错误码 → 必须先更新 [07](./07-contracts-and-config.md)，⛔ 禁止散落在代码里
