# 10 · 实现步骤（交接执行计划）

> 给接手实现的服务端同事：**从这篇开始读**。
> 每个里程碑给出：依赖、任务清单、**验收标准（DoD）**、对应设计文档。写代码时对照 [09 · 开发约束](./09-dev-constraints.md)（引用格式「09·DB2」= 09 的 MySQL 规则 DB2，与本篇里程碑编号 M0–M10 是两套编号）。
>
> 现状基线（已核对过代码）：`apps/server` 是 Colyseus 0.17 + `node:sqlite` 单机版，`saveStore` 的 token 鉴权可用但身份来源是 deviceId 占位，无 `ioredis`/`mysql2`，无网关，无 `matchId`。详见 [README · 现状→目标](./README.md#现状--目标)。

---

## 依赖图与并行度

```
M0 前置验证 ──► M1 基础设施 ──► M2 核心原语 ──┬─► M3 鉴权 ──► M5 网关 ──► M6 货币+outbox+充值+邮件附件 ──► M8 结算接线
（三个硬闸）                                  │                    ▲
                                              ├─► M7 排行 ─────────┴──►（M8 需要 M6+M7）
                                              ├─► M4 存量迁移（准备可并行；⚠ cutover 需 M3+M6）
                                              └─► M9 冷档（需 M2+M6；代码先就绪，水位启用）
M10 运维与监控：核心告警随 M6/M9 各自交付，全量看板上线前收口
```

**两人分工建议**（单人则按 M 序号串行）：

- **开发 A（正确性主线）**：M2 原语 → M6 outbox → M9 冷档。这条线全是锁/fence/幂等，最好一个人从头负责到底。
  ⚠ A 的 M6 以 B 的 M5 完成为前提——等待期先做 `economy/currency.ts` 的纯 MySQL 部分（事务/ledger/幂等，不依赖网关）。
- **开发 B（功能主线）**：M3 鉴权 → M5 网关（含邮件收件箱）→ M7 排行。
- M4 迁移：谁先空谁做（依赖 `@fable5/shared` 的 `PlayerSave` 字段映射，需与客户端确认）。

---

## M0 · 前置验证与拍板

### 硬闸（⛔ 三项不过关不要写业务代码）

| 任务 | 产出 |
|---|---|
| 实测 Colyseus 0.17 能否「在指定节点建房」；同时实测 `RedisDriver`/`RedisPresence` | 结论文档：支持 → 按现设计；不支持 → 自建 RemoteRoomCall 或 seat-aware proxy |
| 压测货币同步事务：目标 QPS 下 `BEGIN; INSERT ledger; UPDATE balance; INSERT outbox; COMMIT` 的 p99 | **一个数字**。必须 < `LOCK_TTL_MS`(5s)，理想 < 100ms |
| 填 [07 · 验收阈值表](./07-contracts-and-config.md#验收阈值开工前填空)（目标 CCU/QPS/RPO/RTO），运维 SLA 签字（[06](./06-capacity-and-ops.md#运维必须签字的-sla)） | 阈值表无空格 |

### 限期拍板（不阻塞开工，但各有实际阻塞点——给截止日，不给闸门）

| 决策 | 实际阻塞什么 | 建议截止 |
|---|---|---|
| Sentinel vs Cluster | 09·R3 的跨用户操作写法、M7 取榜 hydrate 实现 | M5 开始前 |
| 多端登录（互踢 vs 多端） | M3 的 `sess:{uid}` 结构 | M3 开始前 |
| rating 算法（Elo vs Glicko-2） | M7 发奖 + `rank_award`/`rank_snapshot` 建表（榜本身不阻塞）。**延后即触发裁剪表的 M7/M8 降级路径** | M7 发奖前 |
| 退款/对账（微信账单 T+1 vs 主动查单；退款联动回收） | M6 充值链路的 `refunded` 分支（充值主流程不阻塞） | M6 完成前 |

**DoD**：三个硬闸有书面结论 + 阈值表无空格；限期拍板各有 owner 和截止日。

---

## M1 · 基础设施与地基

依赖：M0 硬闸。设计：[05](./05-mysql8-schema.md) / [06](./06-capacity-and-ops.md) / [07](./07-contracts-and-config.md)

- [ ] MySQL ≥ 8.0.19 实例；`binlog_format=ROW`；执行 05 的**全部 DDL**（含 `seq` 预置行）
- [ ] `singleton_lease` 预置**三行**：`outbox_relayer` / `freeze_worker` / `season_rotation`
- [ ] Redis durable（`noeviction` + AOF `everysec`）与 cache（`allkeys-lru`）**两个物理实例**；`activedefrag yes`
- [ ] `redis-route.yaml` 桶路由表 + `infra/redisRoute.ts`（`clientFor(uid)` / `indexClientFor(bucket)` 两套寻址）
- [ ] 依赖引入：`ioredis@^5`、`mysql2@^3`（promise）、`uuid@^11`、crc32
- [ ] `infra/config.ts`：07 的全部常量，⛔ 禁止散落
- [ ] `infra/redisScripts.ts`：Lua 注册 + `evalshaWithReload`（NOSCRIPT 兜底，09·R7）
- [ ] `core/errors.ts`：异常类型 + `ERR_MAP`（07 错误码表）

**DoD**：`npm run typecheck` 过；连通性冒烟脚本（连两个 Redis + MySQL、`SHOW TABLES` 齐全、`EVALSHA` 走通 NOSCRIPT 重载路径）。

---

## M2 · 核心原语（正确性地基，最重要的里程碑）

依赖：M1。设计：[03](./03-gateway-data-layer.md) / [07](./07-contracts-and-config.md)

- [ ] `core/locks.ts`：`localMutex`（async 队列，09·L5）→ `acquireLease`（`INCR fence:{uid}` + `SET NX PX`，有界重试）→ `withUserLock`（**看门狗为可选参数、默认关**；仅 freeze/thaw 在 M9 传 `LOCK_RENEW_MS` 启用，09·L6）→ `casDel` Lua 释放
- [ ] 四条 Lua（07 清单）：`casHset`（EXISTS 前置 + fence CAS）、`applyEffect`（EXISTS + `op_id` 去重，**无 fence**）、`casDel`、`tokenBucket`（`redis.call('TIME')`）
- [ ] `core/uow.ts`：`UnitOfWork`（每 RPC 作用域脏表，09·R8）+ `withUser`
- [ ] `core/idem.ts`：pending 10s / done 60s 两态占位（09·I1）
- [ ] `gameplay/userStore.ts`：`readUser` / `readUserReadonly` / `loadFields`（HMGET zip，09·R9）

**DoD**（全部用真实 Redis 跑，不 mock）：

- [ ] 并发 100 个同 uid 写 → 串行执行、脏字段不串号
- [ ] 双实例（两个进程）并发同 uid → 跨实例串行
- [ ] **锁过期 + 竞争写**：持锁方 A sleep 超 TTL；另一进程 B 抢锁（拿到更高 fence）并 `casHset` 成功；A 醒来用旧 fence `casHset` → 返回 `stale` 被拒（⚠ 只 sleep 不引入 B 的写，A 会返回 `ok`——那是正确行为，不是 bug，见 09·L6）
- [ ] `casHset`/`applyEffect` 对不存在的 uid → 返回 `cold`，**未创建任何 key**
- [ ] 同一 `op_id` 重放 `applyEffect` → 第二次 `dup`，背包数量不变
- [ ] kill -9 持锁进程 → 锁 5s 后自然过期，下一个请求正常

---

## M3 · 鉴权（HTTPS wx-login + token + 存量账号绑定）

依赖：M1 + M2 + M0 多端拍板。设计：[02·P1](./02-failure-patterns.md) / [05·accounts](./05-mysql8-schema.md) / [07](./07-contracts-and-config.md)

- [ ] `auth/wxLogin.ts`：`code2session`（超时/熔断/错误码映射）→ 建号（`seq` 发 `user_id`，09·DB2 同连接纪律）→ 签发不透明 token（`randomBytes`，存 sha256）→ 写 `sess:{uid}`
- [ ] **签发前 `SELECT status`**（09·G7）；出参⛔禁含 `openid`/`unionid`/`session_key`（09·G8）
- [ ] `token_epoch`：签发时把 epoch 写进 **`sess:{uid}.tokenEpoch` 与服务端 token 记录**（⚠ token 是不透明随机串，**没有「载荷」**，别做成 JWT——那是被否掉的方案）；校验 `sess.tokenEpoch < accounts.token_epoch` 即 `AUTH_EPOCH_STALE`
- [ ] **⚠ 存量账号绑定协议**（M4 cutover 的前提，评审 critical 项）：
  过渡期客户端登录时**同时带旧 token（deviceId 体系）与 wx code**；服务端用 `saveStore.verify` 验明旧 `user_id` → 把 `code2session` 得到的 openid 回填 `UPDATE accounts SET openid=? WHERE user_id=?`。此后该用户凭 openid 即可找回原档。旧 `token_hash` 随 cutover 作废（`accounts` **无** `token_hash` 列，不迁移）
- [ ] 登录成功后 `ZADD active:lru:{bucket}`（冷档候选索引从此积累，[08](./08-cold-archive.md)）
- [ ] 登录限流（独立严格档）+ `login_audit`（revoke/ban 同步写）

**DoD**：封号后 ① 存量 token 立即失效 ② 重新 wx-login 被 403 拒；**老账号（仅 deviceId）经绑定流程后，换设备用 wx-login 找回原 `user_id`**；并发登录不互撤（按 M0 多端拍板）。

---

## M4 · 存量迁移（SQLite → MySQL + Redis）

依赖：M1（ETL 准备可与 M2–M5 并行）；**cutover 需 M3（绑定协议）+ M6（货币写路径）完成**——双写期「货币 MySQL 权威」需要有人往 MySQL 落账，M6 之前权威是空的。设计：[05 · 迁移 runbook](./05-mysql8-schema.md#存量迁移-runbook-sqlite--mysql--redis)

- [ ] 与客户端确认 `PlayerSave`（`@fable5/shared`）→ 逐字段映射表：货币列 → `user_currency`；标量/大对象 → `user:{uid}` 字段；道具 → `bag:{uid}:{shard}`。（⚠ 旧 `token_hash` 不迁移，见 M3 绑定协议）
- [ ] ETL 脚本：`JSON.parse` 校验（坏行单独记录人工处理）+ 回填 + `schemaVersion=1, fence=0, ver=0`
- [ ] 双写期：**货币 MySQL 权威、玩法 Redis 权威、SQLite 只写不读**（⛔ 权威必须单一，09·A3）；影子读抽样比对
- [ ] cutover 门槛：**存量活跃用户的 openid 绑定完成率达标**（阈值与产品定，建议 ≥95% 的 30 日活跃）+ 48h 回滚预案（保留 SQLite 快照）

**DoD**：测试环境全量演练一次（含回滚）；抽样 100 个账号字段级比对零差异；**老账号经 wx-login 找回原 `user_id`** 的端到端用例通过。

---

## M5 · 网关（LobbyRoom + RPC dispatcher + 邮件收件箱）

依赖：M2、M3。设计：[03](./03-gateway-data-layer.md) / [07](./07-contracts-and-config.md)

- [ ] `gateway/LobbyRoom.ts` + `dispatcher.ts`：`{id,type,payload}→{id,ok,data,err}` 信封；中间件链 鉴权→限流→zod→幂等
- [ ] transport 层 `maxPayload`（09·G4）；匿名 key 不塌缩（09·G5）；未知 type 不封禁（09·G6）
- [ ] `withUser` commit 尾部接线 `ZADD active:lru:{bucket}` + 更新 `lastActiveAt` 字段（与 M3 登录点一起构成完整活跃索引）
- [ ] 首批 `handlers/user.ts`：`user.getInfo`（只读无锁，09·G2）、`user.getProfile`（readonly）、一个走 `withUser` 的写 handler 作为写路径样板
- [ ] `handlers/mail.ts`：收件箱列表 / 标记已读（MySQL `mail.read_at` 权威，09·A6）；**领附件放 M6**（要走 outbox）
- [ ] 服务端主动推送通道（per-user）雏形 + mail 唤醒流（09·K6：可靠流禁 MAXLEN）

**DoD**：客户端联调错误码——**限 M5 时点可达的子集**：`AUTH_REQUIRED` / `AUTH_EPOCH_STALE` / `ACCOUNT_BANNED` / `RATE_LIMITED` / `INVALID_PAYLOAD` / `UNKNOWN_TYPE` / `BUSY` / `STALE_FENCE` / `IN_PROGRESS` / `INTERNAL`（`GRANTING`/`INSUFFICIENT_BALANCE` 归 M6，`THAWING`/`USER_DATA_LOST` 归 M9）；`user.getInfo` 压测不产生任何 `lock:{uid}`。

---

## M6 · 货币 + outbox + 充值 + 邮件附件

依赖：M2、M5（A 可提前做纯 MySQL 部分）。设计：[04](./04-cross-store-outbox.md) / [05](./05-mysql8-schema.md)

- [ ] `economy/currency.ts`：MySQL 事务（ledger ODKU 去重 + 余额守卫 UPDATE + fence 守卫，会话切 RC，09·DB5）；`cache:currency:{uid}` 回填
- [ ] `economy/outbox.ts` + `handlers/shop.ts`：`purchase`（04 三阶段协议）+ `shop.queryOp`
- [ ] **充值链路**：微信支付回调 handler → `purchases` 状态机（created→paid→delivered）→ paid 后**同事务**插 `currency_ledger` 正向 delta + `deliver_op_id` 发货（`refunded` 分支等 M0 退款拍板）
- [ ] **邮件领附件**：`mail.claimAttach` 走 outbox（`attach_op_id`，09·A6）
- [ ] `economy/relayer.ts` **独立进程**：`singleton_lease` 抢占/续租（09·X7）→ `SKIP LOCKED` 取行 → `redisApply`（`cold` → M9 前 stub 成告警 + 跳过，M9 接真 `ensureLive`）→ 死信
- [ ] `applied:{uid}` 定期裁剪任务（09·I5）
- [ ] **核心告警随本里程碑交付**：outbox pending 深度 / 最老 pending 年龄 / 死信行数

**DoD**（kill 测试全用真实进程）：

- [ ] 并发双发同 `clientReqId` → 只扣一次钱、只发一次货
- [ ] 阶段 1 提交后 kill -9 → relayer 补发，道具到账
- [ ] 阶段 2 后 kill → relayer 重放判 `dup` 不重复发
- [ ] 余额不足 → 干净失败，Redis 未动、无 outbox 行；触发 `INSUFFICIENT_BALANCE` 与 `GRANTING` 两个错误码联调
- [ ] **充值回调重放**：同 `wx_txn_id` 回调两次 → 只发一次币
- [ ] **领附件并发双击** → 只发一次货
- [ ] 僵尸 relayer（SIGSTOP 超租约再 SIGCONT）→ 守卫 UPDATE 0 行自杀，未写业务表

---

## M7 · 排行

依赖：M2（打分 Lua / `score.ts`）；取榜 handler 另需 M5；发奖另需 M6 + M0 rating 拍板。设计：[03 · 排行榜](./03-gateway-data-layer.md#排行榜)

- [ ] `rank/score.ts`：`encodeScore`/`decodeScore`（09·K1）+ 边界单测（赛季首尾/同分先后/1e12 精度）
- [ ] 更新分：单条 Lua `ZSCORE→重算→ZADD` + `rank_sub` 写入；去重键 `lb:dedup:{matchId}:{uid}`（09·K2）。**matchId 在 M8 才接线——本里程碑用合成 matchId 跑单测/集成测**，真实结算端到端归 M8
- [ ] `handlers/rank/*.ts`（每接口一文件 + shared lobbyRpc 契约，见 03 · handler 组织）：两段式取榜 + 补自己（Cluster 形态按 M0 结论决定 hydrate 写法）
- [ ] 赛季轮换任务：key 内嵌 `seasonId`，换季写新 key、旧 key 设 TTL；**走 `singleton_lease`（`season_rotation` 行，09·X7）**
- [ ] `rank_snapshot` 定期 top-N 快照进 MySQL（可延后，但归属本里程碑）
- [ ] 发奖（需 rating 拍板 + M6）：`rank_award UNIQUE(season,uid)` + 走 outbox 发放（09·K3：100% 校验）

**DoD**：同分两人先达者靠前；`ZINCRBY` 全仓 grep 为零；合成 matchId 下一局两名玩家各自更新成功。

---

## M8 · 对局结算接线

依赖：M6（休闲局只需 M6）、M7（ranked 发奖需 M7 发奖完成）。设计：[02·P7](./02-failure-patterns.md) / [05](./05-mysql8-schema.md)

拆两个可独立验收的子项：

**M8a · 休闲局结算**（仅需 M6）
- [ ] `VersusRoom`：**新增 `matchId`**（`startMatch` 生成一次写进 state，09·K4）
- [ ] 结算：`match_index` 幂等闸 → `match_results`（分区表）→ `stream:match` 证据链（key 见 07 全表；09·K6：`XTRIM MINID` 按落库位点裁，裁剪 owner = 证据链消费者）
- [ ] 休闲局乐观即时结算

**M8b · ranked 发奖闸**（需 M7 发奖；rating 未拍板则本子项顺延，见裁剪表）
- [ ] 发奖延迟到 `verifierGateway` 重放通过（现 `console.warn` 升级为 pending→commit）；证据链含 `InjectWave`/`loadout`/`mapIndex`（09·K5）
- [ ] `suspect` 走 clawback（新 `op_id` 反向 outbox，负数下溢守卫 09·X8）

**DoD**：同一局重复结算不产生第二行 `match_results`、不重复发奖；伪造高 `round` 的上报在 ranked 拿不到奖励（M8b）。

---

## M9 · 冷档冻结层

依赖：M2、M6（outbox 互锁）。设计：[08](./08-cold-archive.md) 全文——**约束最密的模块，实现前通读 08 两遍**

- [ ] `archive/thaw.ts`：`resolve`（fence 新鲜度，09·F1）+ `ensureLive`（singleFlight + `withUserLock` + `thawRestore` Lua + 负缓存 + `USER_DATA_LOST` 区分，09·F4）+ **`lazyMigrateSchema` 挂接点（首版为恒等函数，09·S1）**
- [ ] 把 M6 relayer 的 `cold` stub 换成真 `ensureLive`
- [ ] `archive/freezeWorker.ts` 单例（`freeze_worker` lease 行）：`active:lru` 候选 + 幽灵项清理 → 锁内双检（含 outbox 前置闸，09·F2）→ 快照（鲸鱼 `HSCAN`）→ MySQL upsert → `freezeCommit` Lua；**此路径的 `withUserLock` 开看门狗（`LOCK_RENEW_MS`，09·L6）**
- [ ] `archive/janitor.ts` 清理任务：**持锁** + `resolve` 判定（含 `ARCHIVE_NEWER` 修复路径）
- [ ] `FREEZE_ENABLED` 配置开关（默认关，内存水位启用，09·F5）
- [ ] **核心告警随本里程碑交付**：`USER_DATA_LOST`（≡0）、解冻/冻结比、`freezeCommit` `lost`/`changed` 比例

**DoD**：08 的「崩溃 / 锁过期分析」与「崩溃分析」**两张表每一格**都有对应测试；额外必测：freeze 与玩法写并发（锁内 ver 变化 → `changed` 放弃）；thaw 后旧 fence `casHset` → `stale`；`applied` 归档恢复后旧 `op_id` 重放 → `dup`；`THAWING` / `USER_DATA_LOST` 错误码联调。

---

## M10 · 运维收口（核心告警已随 M6/M9 交付，本里程碑收尾）

依赖：贯穿。设计：[06](./06-capacity-and-ops.md) / [08 · 监控](./08-cold-archive.md#监控)

- [ ] 全量看板：06 + 08 两张监控表剩余项（`used_memory` 水位、复制延迟、`stream:match` PEL、慢查询里的 `HGETALL`、大 key 分布）
- [ ] **例行运维任务**：`match_results` 分区滚动（`REORGANIZE`/`DROP PARTITION` 月度）、`user_archive` 死号分批 `DELETE` 清退、rank 旧 key TTL 巡检——runbook + 定时任务已配置
- [ ] DR 演练：真拿备份恢复一次 + **PITR runbook**（先停 worker → fence 对账 → 放开，09·F5）
- [ ] BI/GM 只读导出通道（09·A5）
- [ ] 压测：07 验收阈值表逐项打勾

**DoD**：07 的[最小验收测试清单](./07-contracts-and-config.md#最小验收测试清单)全绿；SLA 数字有运维签字。

---

## 建议代码结构

```
apps/server/src/
├── infra/        redisRoute.ts · redisScripts.ts · mysql.ts · config.ts     (M1)
├── core/         locks.ts · uow.ts · idem.ts · errors.ts                    (M2)
├── auth/         wxLogin.ts · session.ts · legacyBind.ts(存量绑定)          (M3)
├── gateway/      LobbyRoom.ts · dispatcher.ts · rpc.ts · handlers/loader.ts · handlers/<域>/<接口>.ts  (M5–M7)
├── economy/      currency.ts · outbox.ts · purchases.ts(充值) · relayer.ts(独立进程) (M6)
├── gameplay/     userStore.ts · bag.ts                                      (M2/M6)
├── rank/         score.ts · rankService.ts · seasonRotation.ts              (M7)
├── archive/      thaw.ts · freezeWorker.ts(独立进程,含 janitor) · lazyMigrate.ts (M9)
├── rooms/        VersusRoom.ts(改造:matchId+结算)                            (M8)
└── services/     saveStore.ts(过渡期保留,M4 后移除) · db.ts(迁移后转只读)     (M4)
```

独立进程入口：网关节点、游戏节点、`relayer`、`freezeWorker`。

---

## 范围裁剪指引（如果排期紧）

| 可以晚 | 不能晚 |
|---|---|
| M9 冷档启用（水位没到 0.6 前不启用，但 **`ensureLive`/`cold` 返回值从 M2 就要在**——后补要改所有 Lua 和调用方） | M2 原语（一切正确性建立在它上） |
| M7 发奖 + M8b（rating 未拍板可先做榜和休闲结算；**顺延即接受 ranked 只打不发奖的降级形态**） | M6 outbox + 充值（有商店/充值就必须有） |
| `rank_snapshot`、BI 导出、`user_snapshot_readonly` | M0 三个硬闸 |
| 懒迁移 worker（**第一次 schema 变更前必须就绪**，09·S1） | `matchId`（M8a，后补要迁移历史数据） |
| 全服邮件批量发道具（基础邮件系统在 M5/M6，**不可裁**） | M3 存量账号绑定（cutover 硬前提） |

---

## 交接检查清单（给交接会用）

- [ ] 同事已读：README → 01 → 02 → 09（约束）→ 本篇；03–08 按里程碑进度阅读
- [ ] M0 三个硬闸有 owner 和截止日；四个限期拍板各有 owner 和截止日
- [ ] **WX_APPID / WX_SECRET 与 KMS/Secret 管理通道已开通**（owner：运维/负责人）——不到位 M3 整条线卡死
- [ ] **产品已填 07 阈值表的目标 CCU / 充值 QPS 两行**——不填 M0 压测没有及格线
- [ ] 客户端同事已确认：`PlayerSave` 字段映射（M4）、RPC 信封与错误码（M5）、`clientReqId` 复用规则与「发放中」轮询（M6）、**过渡期登录同时带旧 token + wx code**（M3 绑定协议）
- [ ] 运维同事已拿到：[06 SLA 清单](./06-capacity-and-ops.md#运维必须签字的-sla) + 两实例配置 + PITR runbook
- [ ] **M4 cutover 窗口与回滚决策人已定**（含绑定完成率达标线）
- [ ] `_archive/` 已知悉为废弃材料，不作实现依据
