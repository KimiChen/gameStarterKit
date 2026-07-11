# 服务端架构设计（公司标准框架）

> 面向服务端的实现级文档。技术栈：**Node.js + TypeScript + Colyseus 0.17 + Redis + MySQL 8.0**（微信小游戏）。
>
> 同步自 Arthur 项目（2026-07-11，commit 1aa2607）；本 starter kit 已按 10 的里程碑落地
> **M0–M9 框架实现**（`apps/server/src/{infra,core,auth,gateway,economy,rank,archive,gameplay}`），
> M4 存量迁移 ETL 与存量账号绑定为 Arthur 专属、未移植。文中个别游戏字段示例（如 PlayerSave）
> 沿用 Arthur 命名，规则本身通用。

> **🤝 接手实现的同事从这两篇开始：**
> **[10 · 实现步骤](./10-implementation-plan.md)**（里程碑 + 每步验收标准）＋ **[09 · 开发约束](./09-dev-constraints.md)**（PR 审查清单，规则带编号可引用）。
> 其余各篇是规则的推导过程，按里程碑进度对照着读。

---

## 一分钟摘要

三段式：**HTTPS 授权 → WebSocket 网关（取用户数据/排位）→ Colyseus 房间对战**。

数据持久化的**核心裁决**是两个权威源：

| 数据 | 真源 | 为什么 |
|---|---|---|
| 货币 / 账号 / 订单 | **MySQL 8.0** | 已 ack 即不可丢，RPO=0 |
| 玩法状态（背包/进度/战力） | **Redis** | 高频读写，接受 AOF `everysec` 的 ≤1s RPO<sup>†</sup> |

<sup>†</sup> 这是**单机 fsync** 窗口。**failover 时还要叠加主从复制延迟**，高写入下实际可达数秒。见 [P1](./02-failure-patterns.md) 与 [06](./06-capacity-and-ops.md#运维必须签字的-sla)。

> ⚠️ **热用户的玩法状态不落 MySQL。** Redis 是唯一真源，重建源是 Redis 自身备份（RDB/AOF/主从），不是 MySQL。
> 这条决定删掉了整条 write-behind 落库管道，也带来了容量与 RPO 的新约束。详见 [01](./01-architecture.md) 与 [06](./06-capacity-and-ops.md)。
>
> **唯一例外**：**冷档**（N 天未登录）会被冻结进 MySQL `user_archive`，其权威转移到 MySQL。见 [08](./08-cold-archive.md)。

---

## 阅读顺序

按这个顺序读，每篇都依赖前一篇的结论：

| # | 文档 | 内容 | 谁必读 |
|---|---|---|---|
| 01 | [架构总览](./01-architecture.md) | 拓扑、连接生命周期、数据分级、组件职责 | 全员 |
| 02 | [七个失效模式](./02-failure-patterns.md) | P1–P7：评审挖出的反复出现的坑 + 现行修法 | 全员 |
| 03 | [网关数据层](./03-gateway-data-layer.md) | `withUser` 工作单元、Redis key、读写分路、排行榜 | 网关/玩法 |
| 04 | [跨存储 outbox 协议](./04-cross-store-outbox.md) | 扣钱(MySQL) + 发道具(Redis) 如何不出错 | 玩法/支付 |
| 05 | [MySQL 8.0 表与写法](./05-mysql8-schema.md) | DDL、ODKU、skip-locked、分区陷阱、**存量迁移 runbook** | DBA/后端 |
| 06 | [容量、分片与运维](./06-capacity-and-ops.md) | 内存模型、桶路由、**运维 SLA 清单**、DR | 后端/SRE |
| 07 | [接口契约与配置](./07-contracts-and-config.md) | **函数签名、Lua 脚本、错误码表、常量/env、验收阈值** | 全员（写代码时查） |
| 08 | [冷档冻结层](./08-cold-archive.md) | 冷用户整档冻结进 MySQL、懒解冻、**fence 新鲜度不变量** | 后端（10 万注册前就绪，按内存水位启用） |
| **09** | [开发约束](./09-dev-constraints.md) | **全部硬规则收敛成带编号的 PR 审查清单** | 全员（code review 必备） |
| **10** | [实现步骤](./10-implementation-plan.md) | **里程碑 M0–M10、依赖图、每步 DoD、代码结构、交接检查清单** | 实现者（从这篇开始） |

配套：[`server-design.html`](./server-design.html) 是同一套内容的可视化导览版（浏览器打开即可，含拓扑图）。

决策**之前**的原始评审材料（已过时）留在 Arthur 仓库的 `docs/server/_archive/`，未同步到本仓库。

---

## 已拍板的决策

这些不用再讨论，直接按此实现：

1. **热用户玩法状态真源 = Redis**，MySQL 非权威。**冷档例外**（见 5）。
2. **重建源 = Redis 自身备份**（RDB/AOF/主从/快照），与 MySQL 无关。
3. **RPO 按字段分级**：贵重效果（付费抽卡出金、购买道具、赛季奖励）走 MySQL `gameplay_outbox` intent 兜底（RPO=0）；普通进度接受 AOF `everysec` 的 ≤1s。
4. **存储用开源 Redis**（非 Dragonfly / 非 Enterprise）。容量：**纯 RAM + 16384 桶分片**起步。
5. **冷档冻结层**：N 天未登录整档冻进 MySQL `user_archive`，权威随之转移。代码 day-1 就绪（10 万注册前），但**按内存水位 `used_memory/maxmemory > 0.6` 启用**，不是按注册数。→ [08](./08-cold-archive.md)
6. 货币/账号/订单以 **MySQL 8.0** 为权威（同步事务 + `currency_ledger` UNIQUE 幂等）。
7. 鉴权 token 用**不透明串存 Redis**（可即时撤销），优于 JWT。
8. WS 网关用**共享 LobbyRoom + RPC dispatcher**，`type → handler` 路由到独立 ts 文件。
9. 落库层已瘦身：删除脏集合 / `RENAME` 快照 / `user_snapshot` / flush worker 定时通道 / 玩法侧 version 对账。

---

## ⛔ 开工前必须先做的两件事

这两条不过关，拓扑和货币方案都要改。**别先写业务代码。**

### 1. 实测 Colyseus 0.17 能否「在指定节点建房」

整套跨节点匹配路由建立在「dispatcher 选目标节点 → 在该节点 `matchMaker.createRoom`」之上，但 **0.17 没有把房间钉到指定 `processId` 的公开 API**（多数版本不支持）。

- 若不支持 → 需自建 `RemoteRoomCall`（经 presence），或改用 seat-aware proxy 由 `roomcaches` 决定落点。
- 同时实测 `RedisDriver` + `RedisPresence` 在目标 Redis 形态（Sentinel / Cluster）下的兼容性。

### 2. 压测货币同步 write-through 的延迟

确认目标充值/结算 QPS 下，MySQL 同步事务（`UPDATE balance + INSERT outbox` 同事务）的延迟可接受。不可接受就要重新设计货币路径——**但不允许开异步后门**（见 [P1](./02-failure-patterns.md)）。

---

## 仍待拍板

| 决策 | 说明 |
|---|---|
| **Redis 形态：Sentinel vs Cluster** | ⚠️ 最紧急。Cluster 下跨用户多键操作全废：排行两段式 hydrate、全服邮件批量发道具、公会战力汇总都是 `CROSSSLOT`。玩法真源进 Redis 后影响面放大。无论选哪个，键都要预留 `{uid}` hash-tag。 |
| **事务隔离级别** | MySQL 默认 `REPEATABLE READ` + 间隙锁，死锁面比 PG 的 RC 大。倾向：货币/outbox/转账走 `READ COMMITTED`（需 `binlog_format=ROW`），其余默认 RR。 |
| SQLite → MySQL 8.0 **迁移排期** | 迁移步骤、字段映射、双写期权威归属**已在 [05 runbook](./05-mysql8-schema.md#存量迁移-runbook-sqlite--mysql--redis) 定稿**；待定的只是**排期**。 |
| 多端登录 | 单端互踢（需**原子换发协议**防双方互撤，协议待写）vs 允许多端。影响 `sess:{uid}` 是单值还是多会话。 |
| rating 算法 | Elo vs Glicko-2（后者需存 RD/volatility）。**阻塞 `rank_award` / `rank_snapshot` 建表**。 |
| 退款/对账 | 接微信账单文件（T+1）vs 主动查单；退款联动货币回收 + 排行扣分 + 连带奖励回收。 |

**验收阈值（目标 QPS、p99 延迟、RPO/RTO 数字）还没填** —— 见 [07 · 验收阈值](./07-contracts-and-config.md#验收阈值开工前填空)。没有数字，下面两个前置门就无法判定通过与否。

---

## 现状 → 目标

当前 `apps/server` 的实际情况，以及每块要改成什么：

> 以下「现状」列是**实际读代码核对过的**，不是猜测。

| 组件 | 现状 | 目标 |
|---|---|---|
| 持久层 | `src/services/db.ts` — `node:sqlite`，`users(user_id, token_hash, save TEXT JSON blob, updated_at)` | MySQL 8.0（货币/账号）+ Redis（玩法档） |
| 鉴权 | `saveStore.ts` — **已是可用的加密 token 鉴权**：`randomBytes(24)` 生成 token、库里只存 `sha256(token)`、`verify` 用 `timingSafeEqual` 防时序、每次登录轮换。**仅「身份来源」是占位**（`deviceId → userId`，无 `code2session`） | HTTPS `/auth/wx-login`（`code2session`）→ 不透明 token 存 Redis + `token_epoch` 撤销 |
| `onAuth` | `VersusRoom.onAuth` 接收客户端传的 `userId` + `token`，用 `saveStore.verify` 做 hash 配对校验，**伪造 userId 而无对应 token 会被拒**（不是无条件信任）。不传者为游客。`BattleRoom`/`AttackRoom` 只做协议版本闸门，不绑账号 | `userId` 一律**从 token 反查**，禁止客户端传 `userId` |
| 网关 | 无（只有房间） | 共享 `LobbyRoom` + RPC dispatcher + `handlers/*.ts` |
| Redis | `redisCodeStore.ts` 有雏形；`app.ts` 里 presence/driver 是注释预留 | durable / cache **两个物理隔离实例** + presence/driver |
| 房间 | `VersusRoom` 裁判模型（各打各的、同 `matchSeed`、先守不住者负）。**全仓无 `matchId`**，只有 `state.seed` 与 `state.code`（房码） | **新增 `matchId`**（开局生成，写进 state），作为 P7 幂等与 `stream:match` 证据链的键；结算加本地兜底 |
| 反作弊 | `verifierGateway.ts` 无头重放；`verifyOne` 在 `verdict === false` 时**仅 `console.warn`**，不落任何列/表 | ranked 发奖**延迟到重放校验通过**，异常走 clawback |
| 依赖 | 无 `ioredis` / `mysql2` | 新增 `ioredis` + `mysql2` + `uuid`（见 [07](./07-contracts-and-config.md#依赖)） |

---

## 关键提醒（写代码前请读）

> **Redis「物理不丢」≠「Redis 里的值是对的」。**
>
> 持久性可以外包给运维（备份、AOF、主从），**一致性不行**。下面几条是应用层责任，运维的承诺一条也堵不住：
>
> - 幂等必须**执行前原子占位**（短租约），不是「成功后 SET」——并发双发会双双执行（[P4](./02-failure-patterns.md)）。
> - fence token 必须**守到业务写**，不只守租约行（[P6](./02-failure-patterns.md)）。
> - **禁止 `HGETALL` 全量 load 大 Hash**——Redis 单线程，一个重度玩家的背包能阻塞整个实例几十毫秒。一律 `HMGET` 按需取字段，背包拆独立 key。
> - 玩法 schema 演进**没有 `ALTER`**：blob 带 `schemaVersion`，读侧强制兼容 N 与 N-1，配懒迁移 worker。
> - 进程内**绝不用 module 级全局脏表**：Node 单 event loop 上 async handler 在 `await` 点交错，会把 A 玩家的改动 flush 进 B。脏追踪必须是**每 RPC 作用域**的（[03](./03-gateway-data-layer.md)）。

---

## 这份文档怎么来的

- 7 个子系统各一个深化设计 agent + 一个对抗性评审 agent（14 agent），挖出 31 个上线阻断级 + 67 个 major 问题。
- PostgreSQL → MySQL 8.0 转换经 convert + verify 两轮校验。
- 网关数据层借鉴生产项目 `aisanguo-server`（PHP/Swoole，~9100 文件）：6 维度并行探查 + 对抗性可移植性评审，所有机制带 `文件:行号` 证据。
- 「玩法真源 = Redis」的连锁后果经后果推导 / 对抗性攻击 / 容量分片 三路分析。

评审的逐条原始发现（含每个问题的完整触发场景）在 Arthur 仓库的 `docs/server/_archive/` 里，**但其数据层方案已被后续决策推翻**。
