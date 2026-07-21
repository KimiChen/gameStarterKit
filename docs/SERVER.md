# 服务端

Colyseus **0.17** + 公司服务端框架（源自 Arthur M0–M9，已停止回流、独立演进）。Node ≥ 22，
tsx 直跑 TS。整体设计意图见 [OVERVIEW.md](OVERVIEW.md)；客户端见 [CLIENT.md](CLIENT.md)。

> **本文含两份「代码引用的活字典」，删改前务必知道**：
> - [§12 开发约束 61 条规则目录](#12-开发约束61-条规则目录)——服务端 200+ 处 `09·XX` 注释锚定这里；
> - [§13 契约与配置表](#13-契约与配置redis-key--字段--错误码--常量)——新增 key/错误码/常量先进这里再进代码。

---

## 快速开始

```bash
npm install                 # 根目录，装 shared + server
npm run dev                 # tsx watch 启动，http://localhost:2568（热重载）
```

起来后三个网页入口：`/` Playground 调试台、`/monitor` 房间监控、`/mock/*` HTTP 假数据。
**纯 mock 链路不需要任何数据库**——房间玩法、mock HTTP 接口开箱即用。

### 本地开发栈

真实玩法链路（wx 登录、工会、充值、冷档）需要本地 Redis×2 + MySQL：

```bash
npm --workspace @game/server run stack           # 起 redis-durable(6401)+redis-cache(6402)+MySQL(3316)
npm --workspace @game/server run db:bootstrap    # 建 game_<PROJECT_ID> 库 + 全量 DDL + 预置行
npm --workspace @game/server run smoke:framework # 框架连通性冒烟（Redis 形态/表齐全/Lua 重载）
npm --workspace @game/server run test            # 单测
npm --workspace @game/server run test:int        # 集成测试（真实 Redis+MySQL 含故障注入）
```

- 本地栈脚本 `tools/dev-stack.sh` 依赖 brew 的 `redis` 与 `mysql@8.4`；数据目录默认 `~/.game-dev`
  （`GAME_DEV_DATA` 可改）。默认端口 6401/6402/3316 与 Arthur 项目约定一致。
- **多项目并行（同机多个本框架项目共用这一套栈）**：隔离靠**根目录 `.env.development` 的
  `PROJECT_ID`**（缺省 `gono`）——Redis 全部键带 `<PROJECT_ID>_` 前缀（`infra/keys.ts` 唯一拼接点）、
  MySQL 库名 `game_<PROJECT_ID>`（`db:bootstrap` 自动建）。第二个项目只需在**同一个文件**里
  改 `PROJECT_ID` + `PORT` 两个值（两个 dev server 不能同端口）。
  ⚠ **前缀只覆盖业务键**：启用横向扩展（RedisDriver/RedisPresence）后 Colyseus 用固定键名
  `roomcaches`/`roomcount`（不可加前缀，`tools/m0/colyseus-redis-probe.ts` 实测），届时各项目
  须用独立 Redis db 或独立实例承载 driver/presence（pub/sub 不分 db，频道名也需留意）。
  进阶（真要物理分栈）：`dev-stack.sh` 会从根 `.env.development` 的三个连接 URL 派生栈端口、
  数据目录随 MySQL 端口自动分家，通常用不到。
- **跑 `test:int` 前先停 dev server**：集成测会 `boot(server)` 真实监听 2568，dev server 占端口会
  EADDRINUSE 且卡死 test runner。根脚本 `npm run dev` 起的是 tsx watch——kill 要 kill 整棵 watch 进程树。
- 开发端口默认 **2568**（`config.ts` 的 `PORT` 常量，与 `PROJECT_ID` 同机制——根
  `.env.development` 的 `PORT` 可覆盖）：Colyseus 默认 2567 常被占用。
  改端口需同步场景里 Main 组件 `serverUrl` 与 smoke 的 `SERVER_URL`。

---

## 2. 目录导览（`src/` 根 = 6 目录 + 入口两文件，每个目录有 README）

**端点层按传输方式分**：有 Schema 状态同步的实时玩法 → `rooms/`；无状态单次请求-响应 →
`websocket/`（两者都走 ws，按「有无状态同步」分，不按协议分）。

| 目录 | 职责 |
|---|---|
| `rooms/` | 实时玩法房（GameRoom + Schema）。当前 demo：移动积分 20fps、技能结算用 shared 公式 |
| `websocket/` | ws-RPC：LobbyRoom（房间 `lobby`）+ dispatcher 中间件链 + 每接口一文件端点 + 集合广播/推送 |
| `http/` | 真实 HTTP 端点（仅 auth/支付/utility）：`<域>/<接口>.ts` + `index.ts` 静态 spread 装配 |
| `mock/` | **常驻**假数据（供客户端无栈调试）：`api/<接口>.ts`，`/mock/` 前缀，扫描自动挂载 |
| `player/` | 玩家数据日常主战场：`userStore`（readUser/readUserReadonly；加档字段起点） |
| `core/` | 服务端底座（横切原语 + infra/auth/economy/archive/match/guild/compute 子模块） |
| `index.ts` | 进程入口：启动期先 `registerAllRoutes()` 契约校验 + `startInfraMonitors()` 再 `listen` |
| `app.config.ts` | `defineServer({ rooms, routes, transport, express })` |

---

## 3. 持久化范式：进程不持有任何权威状态

> **进程只是无状态执行器**（借鉴生产项目 aisanguo，但反转其持久化定位）。

三根支柱做到「重启不丢」：

1. **数据落点固定**——一个用户 = 一个 Redis Hash（`user:{uid}`）。进程内存里的对象只是投影，
   重启即清空，下次 `load(uid)` 冷加载恢复。
2. **写入边界 = 每个业务请求**（不是定时快照）——`lock → load → mutate → commit/rollback`
   是单一提交边界。
3. **停服不做「最后落库」**——SIGTERM 只排空在途请求就退出（反证了写在每次请求时已落）。

**崩溃最多丢「当前那一条尚未 commit 的请求」**，已提交的全在 Redis / MySQL。

**权威分野（关键，A2/A3/A4）**：
- **货币 / 账号 / 订单 → MySQL 同步事务**（真源）。Redis 侧只有只读 `cache:currency:{uid}`
  （cache 实例、TTL 5m、miss 回源）。⛔ 禁 Redis 对货币做权威增量。
- **玩法热档 → Redis**（真源，不落 MySQL）。⛔ 禁 write-behind / dirty flush / user_snapshot 回写。
- **冷档例外 → MySQL `user_archive`**（N 天未登录）。访问冷 uid 必须先 `ensureLive()`。

### 失败模式（P 系列，来自 02，一句话）

| P | 教训 |
|---|---|
| P1 | 货币/token_epoch 撤销走权威同步 MySQL 事务，**先写 MySQL 再删 Redis session** |
| P4 | 幂等下沉到 `currency_ledger` 的 `UNIQUE(user_id, idem_key)` |
| P5 | 跨存储重放用**绝对值覆写不重加 delta**；单存储内 op_id 去重 + HINCRBY 本身幂等 |
| P6 | 续租守卫 `UPDATE(holder+fence_token)` 与业务批写同事务，0 行立即 ROLLBACK 自杀 |
| P7 | matchId 幂等依赖**非分区** `match_index` 单独唯一（分区表 PK 被迫含 created_at 破坏唯一性） |

---

## 4. ws-RPC：LobbyRoom + dispatcher + 每接口一文件

客户端 join 房间 `lobby` 后，所有取数/邮件/工会请求走**单一 `rpc` 消息通道**。Colyseus 的
send/onMessage 无请求配对，信封里的 `id` 做 correlation：

```
C2S: { id, type, payload }  →  S2C: { id, ok, data?, err? }
```

**中间件链**（`websocket/dispatcher.ts`，dispatchRpc 永不 throw，一切异常规约成 `{ok:false,err:{code}}`）：
`鉴权（onAuth token→uid + 每消息快路径复验）→ 限流（per-uid 令牌桶）→ zod 校验 → 幂等占位 → handler（Promise.race 超时兜底）`。

**每接口一文件**：`websocket/<域>/<接口>.ts`，default 导出 `defineRpc(...)`（`websocket/rpc.ts` 的
类型胶水，把 shared 契约钉到 handler 上）。`websocket/loader.ts` 启动扫描注册——**路由名必须 =
`<域目录名>.<文件名>` 且与 shared `ALL_LOBBY_RPC_TYPES` 集合相等，否则拒绝启动**。

`defineRpc` 的编译期保障：schema 与 shared Req 不符不过编译、handler 返回值与 Res 不符不过编译、
`idem: true` 强制 Req 含 `clientReqId`（09·I2）。

### 新增接口三步

```
① shared/protocol/lobbyRpc/<域>.ts  加路由名 + Req/Res 接口 + Map 条目
② npm run sync:shared
③ 建 websocket/<域>/<接口>.ts（defineRpc；只读无 idem，写路径 idem:true + clientReqId）
```

⛔ 不改 dispatcher/LobbyRoom。契约测试 `test/lobby-rpc-contract.test.ts` 在 CI 先兜住漏登记。

客户端走 `net/WebSocketClient.ts`（`rpc`/`rpcIdem`/`onPush`）——写接口一律 `rpcIdem`
（clientReqId 生成一次、重试复用）。

### 读写分路（G2，重要）

- **只读 handler**（`readUser`/`readUserReadonly`）**不取分布式锁、不进脏表**；读别人的档必须
  用 readonly 冻结对象（防赋值 flush 别人的档）。
- **写 handler** 走 `withUser(uid, uow => …)`：进程内 per-uid mutex → 跨实例 Redis 锁 + fence →
  UnitOfWork 单一提交边界。样板见 `websocket/user/updateProfile.ts`。

---

## 5. HTTP 与 mock

- **HTTP（`http/`）**：真实端点，Colyseus 0.17 typed router（`createEndpoint`，zod 校验 body）。
  仅限 auth / 支付 / utility（通道分工）：`POST /account/wx-login`（wx 登录、不透明 token、
  token_epoch 撤销）、`POST /pay/wx-notify`、`GET /version`、`GET /clock/now`、
  `POST /area/list`（选服列表 `{al,ul,isOps,h}`，登录前展示，token 可选回填最近登录区服）、
  `GET /notice/list`（公告列表，按 at 倒序）。选服/公告是 **config 驱动无 DB**（`http/<域>/catalog.ts`
  demo 数据，无栈即可联调；真实实现从配置表/CMS 读）。客户端 token 走 body 传，服务端 `verifyBearer`
  反查（⛔ 不信客户端传的 userId，G1）。
  - **区服 = 独立实例**：`IAreaServer.wsUrl` 是**每区服游戏服的连接地址**（`ws(s)://host:port`），客户端
    选服后连它（Main 把 `ws→http` 传给 Colyseus Client）。demo 全部指向同一 dev server（env
    `AREA_WS_URL` 覆盖）；真实实现由中心服/调度按 `sId` 返回各实例地址（改 `area/catalog.ts` 接配置表即可）。
  - `h` = serverList 一致性哈希（`areaListHash()` djb2），进服/踢人校验用（对应原项目 `serverList.h`）。
  - `ul` = 该用户最近登录区服（`getUserRecentServers`，喂「我的角色」页签）。token 反查出 uid 才回填；
    demo 因走 mock 登录（token 过不了 `verifyBearer`），`AREA_DEMO_UL`（默认开）回落给一条最近服，
    让「我的」页签有内容——真实部署置 `AREA_DEMO_UL=0` 只走 token 反查。
- **mock（`mock/`）**：常驻假数据，`api/<接口>.ts` 的 `defineMock({method,path,handler})` 扫描
  自动挂载；路径一律 `/mock/` 前缀（与真实接口隔离，启动断言）。**真实实现落地后 ⛔ 不删 mock**——
  在文件头标记「⚠ 已替换 → <路径>」；req/res 类型必须 import shared 契约（差异只允许假数据、不允许假协议）。

---

## 6. player：玩家数据

`player/userStore.ts` 是加玩家档字段的日常主战场。**加字段流程**：

```
shared IUserView（protocol/lobbyRpc/user.ts，类型真源）
  → userStore.readUser 字段列表
  → §13 字段表登记
跨版本演进另需 core/archive/lazyMigrate.ts 写迁移步骤
```

`readUser`（自档）/ `readUserReadonly`（他档冻结视图）/ `loadFields`（HMGET 按需，⛔ 禁 HGETALL R1）。
建号/活跃索引等框架原语在 `core/userRecord.ts`。

---

## 7. core：服务端底座（日常只做登记式追加）

端点层调用它，**日常不改逻辑**，但以下**登记式追加**是进 core 的合法理由（清单见 `core/README.md`）：

| 要做的事 | 登记点 |
|---|---|
| 加常量 / 环境变量 | `infra/config.ts`（先进 §13 常量表） |
| 加 Redis key | `infra/keys.ts`（先进 §13 key 全表） |
| 加错误码 | shared `RPC_ERR_CODES` + `errors.ts` 的 ERR_MAP（先进 §13 错误码表） |
| 加商店 SKU | `economy/catalog.ts`（将来由 Excel 导表取代） |
| 玩家档字段跨版本迁移 | `archive/lazyMigrate.ts` |
| 卸载重计算任务（铁律 11） | `compute/tasks/<任务>.ts`（纯函数） |

**根层横切原语**：`locks`（两层锁 + fence + 看门狗）· `uow`（UnitOfWork / withUser）·
`idem`（幂等占位）· `errors`（错误码）· `userRecord`（建号/活跃索引/loadFields）。

**子模块**：
- `infra`：双 Redis 桶路由（durable/cache 物理分实例，16384 桶）/ MySQL 池（⚠ 已关
  CLIENT_FOUND_ROWS，affectedRows=changed 语义）/ Lua 注册 + NOSCRIPT 自动重载 / `loopMonitor`
  事件循环「心电图」（index.ts 启动）
- `auth`：wx 登录 / 不透明 token / token_epoch
- `economy`：三阶段 outbox / 充值状态机 / relayer 单例进程 / mailer 邮件附件 / catalog
- `archive`：冷档 freeze/thaw/lazyMigrate/janitor
- `match`：M8a 结算证据链消费（一局一条 XADD → 幂等闸落库；GameRoom 带框架 token 才绑账号，
  mock token/游客全程不碰 Redis）
- `guild`：工会事件存取（seq + 近窗 list，见 §10）
- `compute`：worker_threads 计算池（铁律 11 卸载点，见 §11）

**类型单源**：信封/错误码/经济结果/档视图的真源都在 shared `protocol/lobbyRpc/`，服务端别名引用，无镜像。

---

## 8. 跨存储 outbox：三阶段协议 + exactly-once 双层

货币在 MySQL、玩法在 Redis，无 XA/2PC——**MySQL 作协调者 + outbox intent，Redis 作幂等下游，
靠崩溃重放收敛**。两条不变式：

| 不变式 | 靠什么 |
|---|---|
| 永不「扣了钱没发货」 | intent 与扣钱**同一个 MySQL 事务**落盘；relayer 必定补发 |
| 永不「发了货没扣钱」 | Redis apply **严格在扣钱提交之后** |

最坏只是延迟，绝不丢/不双花。买入类（扣钱 + 发道具）**强制货币先行**（X1）。

**三阶段**（`economy/outbox.ts` + `websocket/shop/purchase.ts`）：
1. **MySQL 事务**：`INSERT ledger`（ODKU 去重）+ 余额守卫 UPDATE + `INSERT gameplay_outbox` intent，原子。
2. **Redis apply**（`applyEffect` Lua）：EXISTS 前置 + op_id 去重，**无 fence CAS**（exactly-once 靠 op_id，
   返回只有 ok/dup/cold，X3）→ `markOutboxDone`。
3. **relayer 独立进程**：`singleton_lease` 抢占/续租 → `SKIP LOCKED` 取 pending → redisApply →
   死信；遇 cold → `ensureLive` 重试（X5）。

**exactly-once 双层同一个 id**（I3）：`currency_ledger.idem_key` = `gameplay_outbox.op_id` =
`applied:{uid}` member。op_id 服务端派生 `uuidv5(uid:type:clientReqId)`（I2）。幂等唯一键是
`UNIQUE(user_id, idem_key)` 不是全局（I4）。

`gameplay_outbox.status` 是 TINYINT 数字常量 `PENDING=0/DONE=1/DEAD=2`（X4/DB6）；done 行 relayer
周期裁剪、pending/dead 不删（I5：`APPLIED_RETENTION ≥ 2×OUTBOX_RETENTION`）；死信人工处置必走重放，
⛔ 禁手改 status=done（X6）。

---

## 9. 冷档冻结层（内存兜底，按水位启用）

开源 Redis 无 tiering，冷档让 **MySQL `user_archive` 成为冷用户权威**，内存随活跃用户增长而非累计注册。
货币不在冻结范围（真源 MySQL）。默认关，`FREEZE_ENABLED` 按内存水位（used_memory/maxmemory > 0.6）
启用（F5）。

**核心不变量：fence 新鲜度，不是「谁存在」**（F1）。在 `lock:{uid}` 下 `resolve(uid)` 比较
`archive.fence_hwm` vs `redis.user.fence`：

| live? | archive? | 判定 | 处理 |
|---|---|---|---|
| ✓ | ✗ | LIVE | 有 archive 行则删 |
| ✗ | ✓ | FROZEN | thaw |
| ✓ | ✓ 且 `hwm > redis.fence` | ARCHIVE_NEWER | UNLINK 陈旧 Redis 档，从 archive 恢复（PITR 场景） |
| ✓ | ✓ 且 `hwm <= redis.fence` | LIVE | 平局判 LIVE（freeze/thaw 中断残留，删 archive 行） |
| ✗ | ✗ | ABSENT | 查 accounts：有号⇒数据丢失告警拒建空档（USER_DATA_LOST）；无号⇒建号 |

为什么比 fence 不比存在：Redis 从 2h 前 RDB 恢复，这期间冻结的用户 archive 才最新，按「谁存在」会
删 archive → 静默回档无报错。

**根本纪律**（L1/L4/F3）：freeze/thaw/玩法写/清理对同一 uid **全走同一把 `lock:{uid}`**；破坏性
操作（UNLINK / 批量恢复 HSET）必须在**同一条 Lua 内先复检锁归属**（`GET lock == myFence`）再执行，
返回 lost 即放弃——这是正确性的唯一依靠，看门狗（L6，仅 freeze/thaw 启用）只减少无用功。thaw 恢复
必须单条 Lua 原子（⛔ 禁 pipeline，否则「有 user 无 bag」部分成功被清理任务判 LIVE 删 archive → 背包永久清空）。

**没有任何写路径可隐式创建 `user:{uid}`**（R2）：casHset/applyEffect 前置 `EXISTS`，缺失返回 cold →
调用方 `ensureLive` 重试。只有「建号」和「thaw」能创建。

**活跃索引**（怎么找冷用户）：`active:lru:{bucket}` ZSET（member=uid, score=lastActiveMs，
bucket = crc32(uid) % 256）。⚠ hash-tag 是 `{bucket}` 不是 `{uid}`——两次寻址：`indexClientFor(bucket)`
写索引 / `clientFor(uid)` 读用户。⛔ 不 SCAN 百万 key。

**janitor** 清理任务**必须持 lock:{uid}**（早期不持锁撞上 freeze 正常中间态会删光整档）。⛔ Redis PITR
后先暂停 janitor 与 freeze worker，做完 fence 对账再放开（F5）。

---

## 10. 广播 / 事件系统（工会为例）

区服单实例（一个 Node 进程一个区服），进程内在线注册表即可高效群发：

- **在线索引**（`websocket/push.ts`）：`online: uid→sink` + 工会索引 `guildOf`/`guildOnline`，
  **三个维护点**：onJoin 挂载（异步读档 guildId）/ onLeave 清理 / 换会端点更新。guildId 冗余进
  在线态 → **广播路径零 DB/Redis IO**。
- **`pushToGuild(gid, type, data)`**：工会在线成员几十人，直推；**`pushToAll`**：全服级，每
  `PUSH_ALL_CHUNK` 个连接 `setImmediate` 让出事件循环（单线程版「丢给 task 进程」）。
- **推送语义一律「唤醒式」**：事件只推 seq（+ guildId），**权威落库**（`core/guild/events.ts`：
  INCR seq + capped list），客户端发现 seq 不连续 → 调 `guild.getEvents` 拉增量。**丢推送 / 断线重连 /
  离线上线走同一条自愈路径**，因此广播端不需要任何送达保证。
- ⚠ seq 是**工会内命名空间**：推送和 getEvents 响应都带 guildId，客户端换会即重置本地水位
  （否则高 seq 会 → 低 seq 会后事件流静默失聪）。
- **跨服预留**（本项目单区服，暂不实施）：跨服事件 `XADD` Redis Stream，每区服进程照 mail 唤醒流
  起消费循环，消费侧调本节点 `pushToGuild/pushToAll`——两个广播函数就是跨服广播的本地落地端。

⛔ **不为工会通知开 per-guild Colyseus Room**（每 join 一房 = 一条独立 ws 连接）：判据是
「有 Schema 状态同步的实时玩法才开房」，通知走 lobby 连接的 push 通道即可。

---

## 11. 事件循环防阻塞（铁律 11）

单线程模型的死穴：**IO 等待不阻塞任何人**（await Redis/MySQL 时事件循环空闲，别的玩家照常），
**但同步 CPU 计算会全服冻结**（比多 worker 死一个严重）。三件套：

1. **`[rpc-budget]` 探针**（`websocket/rpc.ts`）：defineRpc 内 4ms 定时器心跳链测 handler 生命周期内
   「事件循环最长单次阻塞」，超同步预算（开发 20ms / 生产 100ms 采样）即 console.warn 带路由名 + 指路。
   （⚠ 不用 ELU：实测同步块 + 同 tick 测量下 `eventLoopUtilization` 差值为 0。）
2. **`[loop-monitor]`**（`core/infra/loopMonitor.ts`，index.ts 启动）：`monitorEventLoopDelay` 告警看
   **窗口 max 不看 p99**（p99 对稀发严重冻结失明：实测 3×300ms 冻结 p99 仍 ~21ms）+ MySQL 池 enqueue 计数。
3. **`core/compute/` 计算池**：worker_threads 池，重计算卸载到 `compute/tasks/<任务>.ts`（default 导出
   纯函数，输入输出可序列化，⛔ 无 IO 无副作用——超时终止 worker 弃车换新）；端点里一行
   `await runInPool("battleSim", input)`。周期/批量重活走独立进程（relayer 先例）。

**判据**：循环上界是单玩家资产级（背包/阵容/建筑，有配置上限）→ 可内联；全服/全会员/全榜级 → 一律卸载；
说不清 → 按卸载处理。四类高危关键词：**结算模拟、全量重算、批量发放、离线补算**（登录路径同样受限）。

---

## 12. 开发约束：61 条规则目录

> 服务端写路径的 PR 审查清单（01–08 设计的规则收敛），**代码里 `09·XX` 注释锚定这里**。
> 前缀图例：**A** 数据权威 · **L** 锁与 fence · **I** 幂等 · **X** 跨存储 outbox · **R** Redis 纪律 ·
> **DB** MySQL 纪律 · **G** 网关与协议 · **K** 结算与流 · **F** 冷档 · **S** Schema 演进。
> PR 审查顺序：写路径 → A（真源）→ I（幂等）→ L（锁/fence）；涉 Redis 查 R 全组、涉 MySQL 查 DB 全组；
> 钱 + 道具查 X 全组；冷档查 F 全组；结算/流查 K 全组；新增常量/key/错误码先更新 §13。

### 最容易犯的十个错（新人先背）

1. 货币写进 Redis 当权威 → 违反 **A2**，钱会蒸发
2. 幂等写成「成功后 SET」→ 违反 **I1**，并发双发会双双执行
3. `INSERT IGNORE` 去重 → 违反 **DB1**，静默吞掉截断/NOT NULL 错误
4. `HGETALL` 读整档 → 违反 **R1**，阻塞整个 Redis 实例
5. module 级全局脏表 → 违反 **R8**，A 玩家改动 flush 进 B
6. `TINYINT status` 列插字符串 → 违反 **DB6**，严格模式每次购买报 1366
7. 不存在的 `user:{uid}` 上直接 `HINCRBY` → 违反 **R2**，凭空造残档
8. outbox apply 加 fence CAS → 违反 **X3**，锁过期后道具永远发不出去
9. UNLINK/批量恢复不在 Lua 里复检锁归属 → 违反 **L4**，盲删别人刚写的新档
10. 客户端传 `userId` 就信 → 违反 **G1**

### A — 数据权威与分级

- **A1** 写字段前先查数据分级定真源与写路径，口径「掉了会不会有人投诉/退款」。
- **A2** 货币/账号/订单真源 = MySQL 同步事务；⛔ 禁 Redis 对货币做权威增量，Redis 只有只读 `cache:currency:{uid}`（TTL 5m miss 回源）。
- **A3** 玩法热档真源 = Redis，⛔ 不落 MySQL；禁 dirty 集合/flush worker/user_snapshot 任何 write-behind。
- **A4** 冷档例外——N 天未登录档权威在 MySQL `user_archive`；访问冷 uid 必须先 `ensureLive()`。
- **A5** `user_snapshot_readonly`/数仓导出 = 非权威、不回写、不参与恢复；GM 改档必走 `withUser`，⛔ 禁旁路直改 Hash。
- **A6** 邮件投递状态以 MySQL `mail.read_at`/`claimed_at` 为唯一权威，Redis Stream 仅实时唤醒；客户端按 `mail_id` 去重；附件领取走 `attach_op_id`→outbox。

### L — 锁与 fence

- **L1** 同一 uid 的玩法写/freeze/thaw/清理全走同一把 `lock:{uid}`（`withUserLock`）；⛔ `thaw:{uid}` 已废弃，禁第二把 per-uid 锁。
- **L2** 三个 fence 概念禁混用：① per-uid 锁 fence（`fence:{uid}` 计数器 / `user:{uid}.fence` 字段 / `user_currency.last_fence`）② `singleton_lease.fence_token` ③ `token_epoch`（仅封号/踢人递增）。
- **L3** fence 必须守业务写——MySQL `WHERE last_fence <= :f`，Redis 在 casHset Lua 内 CAS；⛔ 只守租约行不算。
- **L4** UNLINK/批量恢复 HSET 等不受 fence 守卫的破坏性操作，必须同一条 Lua 内先复检锁归属（`GET lock == myFence`）再执行，返回 lost 即放弃。
- **L5** 进程内 per-uid 排队用 async mutex（await 队列）；⛔ 禁 `sleep()` 轮询抢锁；跨实例锁有界重试禁无限递归。
- **L6** `LOCK_TTL_MS`(5s) 必须 > 货币事务 p99；看门狗续租（`LOCK_RENEW_MS`）仅 freeze/thaw 慢操作启用，⛔ 不给普通写路径加。

### I — 幂等

- **I1** 幂等 = 执行前原子占位（SET NX PX，pending 短租约 10s）+ 数据层 UNIQUE 兜底；⛔ 禁「成功后 SET」、禁 pending 长 TTL。
- **I2** op_id 服务端派生 `uuidv5(uid:type:clientReqId)`；客户端只提供 clientReqId，重试复用同一个。
- **I3** 三处同一 id——`currency_ledger.idem_key` = `gameplay_outbox.op_id` = `applied:{uid}` member。
- **I4** 幂等唯一键是 `UNIQUE(user_id, idem_key)`，⛔ 不是全局 `UNIQUE(idem_key)`（跨用户串号）。
- **I5** `APPLIED_RETENTION ≥ 2×OUTBOX_RETENTION`；`applied:{uid}` 裁剪用 ZREMRANGEBYSCORE，窗口严格大于 outbox 保留窗口。

### X — 跨存储 outbox

- **X1** 同碰钱(MySQL)+道具(Redis) 必走 outbox：MySQL 事务(ledger+扣款+intent 原子)→redisApply→markOutboxDone，货币先行。
- **X2** 只改 Redis 不碰钱直接 `withUser`+casHset，⛔ 不引入 outbox。
- **X3** outbox apply 不做 fence CAS——exactly-once 靠 op_id；返回值只有 ok/dup/cold，⛔ 没有 stale。
- **X4** `gameplay_outbox.status` 是 TINYINT，用数字常量 `PENDING=0/DONE=1/DEAD=2`，⛔ 禁字符串。
- **X5** relayer 遇 cold → `ensureLive(uid)` → 重试；relayer 不走 withUser 但 apply 前必须处理冷档。
- **X6** dead 行人工处置必走重放（redisApply，applied 去重），⛔ 禁手改 status=done。
- **X7** relayer/freeze worker 等后台单例——`singleton_lease`+fence_token，续租 UPDATE 与业务批写同一 MySQL 事务、守卫作第一句、0 行即 ROLLBACK 自杀；⛔ 禁 GET_LOCK 替代。
- **X8** clawback 扣道具注意负数下溢——Lua 里 HINCRBY 后 <0 则回补到 0 并记录异常。

### R — Redis 纪律

- **R1** ⛔ 禁 HGETALL 大 Hash，读用 HMGET 按需；背包拆 `bag:{uid}:{0..3}`；唯一例外 freeze worker（限速+低峰+鲸鱼档 HSCAN）。
- **R2** 任何写路径不得隐式创建 `user:{uid}`——casHset/applyEffect 前置 EXISTS，缺失返回 cold；只有建号和 thaw 能创建。
- **R3** per-user key 一律 `{uid}` hash-tag 同槽；⛔ 跨用户 key（active:lru:{bucket}、stream:match）不进同一条 Lua。
- **R4** durable(noeviction) 与 cache(allkeys-lru) 物理分实例；⛔「逻辑库 SELECT n 隔离」是技术错误。
- **R5** 权威 key（user/bag/fence/applied）无 TTL；协调 key（lock 5s/idem 10s·60s/sess 3d）按 §13 设 TTL；新增 key 必先进 §13。
- **R6** 删大 key 一律 UNLINK，⛔ 禁同步 DEL。
- **R7** 所有 Lua 走 EVALSHA + NOSCRIPT 自动 SCRIPT LOAD；时钟敏感判定（限流 tokenBucket）在 Lua 内用 `redis.call('TIME')`，⛔ 禁 app 传时钟做判定。
- **R8** 脏追踪必须每 RPC 作用域（UnitOfWork 实例）；⛔ 禁 module 级全局脏表、禁 Proxy 魔术拦截。
- **R9** `ioredis.hmget` 返回与字段顺序对齐的数组（缺失为 null）不是对象，自己 zip。

### DB — MySQL 纪律

- **DB1** 去重用 `INSERT ... ON DUPLICATE KEY UPDATE id=id`（affectedRows 插入=1/重复=0）；⛔ 禁 INSERT IGNORE。
- **DB2** 无 RETURNING——自增用 `result.insertId`，CAS 用 affectedRows，要新值同事务内 SELECT；`LAST_INSERT_ID()` 连接局部，seq 表二语句形须同一根连接。
- **DB3** id/token/hash/idem_key 列一律 `CHARACTER SET ascii COLLATE ascii_bin`。
- **DB4** 分区键须进 PK → 单列唯一被破坏；match_results 用非分区 `match_index` 做幂等闸；`user_archive` 禁按时间列 RANGE 分区，`PRIMARY KEY(user_id)` 是正确性要求。
- **DB5** 货币/outbox/转账会话切 READ COMMITTED（前提 binlog_format=ROW），写路径主键等值定位，捕获 1213/1205 指数退避重试。
- **DB6** TINYINT 状态列全用数字常量；默认 sql_mode 含 STRICT_TRANS_TABLES，保持严格模式。
- **DB7** 多步 DDL 不是一个事务；大表 ALTER 走 gh-ost/pt-osc，小改 ALGORITHM=INSTANT，每步幂等可重入。
- **DB8** mysql2 自动把 JSON 列解析成对象——传 Lua 前必须 `JSON.stringify`（统一在 redisApply 内做）；鲸鱼档 snapshot < `max_allowed_packet`(16MB)。

### G — 网关与协议

- **G1** userId 一律从 token 反查，⛔ 禁信任客户端传的 userId。
- **G2** 读写分路——只读 handler 不取分布式锁、不进脏表；读别人档必须 readonly 冻结对象。
- **G3** 错误码按 §13 错误码表，客户端按 code 分支，⛔ 禁解析 msg；新增错误码必先加表。
- **G4** 大包防护在 ws transport 层设 maxPayload（超限断帧不解码），dispatcher 校验只是兜底。
- **G5** 匿名/optional-auth 的限流与幂等 key 用 sessionId/真实 IP，⛔ 禁 userId=null 塌缩成共享 key。
- **G6** 未知 type 只回 UNKNOWN_TYPE + 低权重计数，⛔ 不计 flood 不封禁。
- **G7** 封号/踢人 = MySQL `token_epoch+1`（先写 MySQL）+ 删 `sess:{uid}`；⛔ 绝不删 `user:{uid}`；wx-login 签发前必须 SELECT status。
- **G8** session_key 仅服务端持有绝不下发；wx-login 出参 ⛔ 禁含 openid/unionid/session_key。
- **G9** handler 超时用 Promise.race 无法真正取消——关键写副作用必须数据层幂等/CAS（I1/L3），⛔ 不依赖应用层取消。

### K — 结算与流

> K1–K3 原为排行榜规则，已随排行榜演示一并移除；**编号保留不复用**（代码注释 `09·KX` 锚点不重排）。

- **K4** matchId 在 startMatch 生成一次写进 state，结算复用；落库前过 `match_index` 幂等闸。
- **K5** 回放校验输入必须完整——InjectWave 注入序列（含 nonce/tick）、loadout、mapIndex 都入证据链。
- **K6** 可靠流（stream:match、mail 唤醒流）⛔ 禁 MAXLEN 裁剪，用基于已落库位点的 `XTRIM MINID`；MAXLEN 仅兜底/纯分析可丢的流。

### F — 冷档

- **F1** 权威判定用 fence 新鲜度（archive.fence_hwm vs user.fence），⛔ 不是「谁存在」；平局判 LIVE。
- **F2** `COLD_DAYS(90) >> max(OUTBOX_RETENTION, APPLIED_RETENTION)`；冻结前置闸（无 status 0/2 的 outbox 行）锁内复查；applied 成员一并归档。
- **F3** thaw 恢复必须单条 Lua 原子（⛔ 禁 pipeline）；fence_hwm 同时写计数器和 hash 字段。
- **F4** ABSENT 时查 accounts——有号 = 数据丢失告警 + 拒建空档（USER_DATA_LOST）；无号才建号；负缓存读点在 EXISTS user 之后，建号成功立即失效。
- **F5** FREEZE_ENABLED 按内存水位（>0.6）启用，⛔ 不按注册数；速率 per-instance；PITR 恢复后先停 worker 做 fence 对账。

### S — Schema 演进

- **S1** Redis 玩法档 blob 带 `schemaVersion`，读侧强制兼容 N 与 N-1（双读），写侧灰度先写兼容格式，配懒迁移 worker。
- **S2** key 改名走 expand→contract（双写新旧再收敛）；`BAG_SHARDS`/`BUCKETS`/`ACTIVE_LRU_BUCKETS` 改变即数据迁移，⛔ 不许随手改。

---

## 13. 契约与配置（Redis key / 字段 / 错误码 / 常量）

> 新增 key/错误码/常量**先进本节表**再进代码（铁律 8）。错误码的代码家在 shared
> `protocol/lobbyRpc/envelope.ts` 的 `RPC_ERR_CODES`（双端单源），本节是文档源。

### 三个 fence 概念（禁共用同一计数器，L2）

| 概念 | Redis | MySQL | TS |
|---|---|---|---|
| per-uid 并发写 fence | `fence:{uid}` 计数器 + `user:{uid}.fence` 字段 | `user_currency.last_fence` | `uow.fence` |
| 单例任务领导权 fence | — | `singleton_lease.fence_token` | `lease.fenceToken` |
| 账号撤销 epoch | `sess:{uid}.tokenEpoch` | `accounts.token_epoch` | — |

### Redis key（durable 实例：noeviction + AOF）

> 下表为**逻辑键名**；实际存储一律带 `<PROJECT_ID>_` 运行时前缀（`infra/keys.ts` 唯一拼接点，
> 多项目共用实例隔离，缺省 `gono_`）。cache 实例同。

| key | 类型 | TTL | 用途 |
|---|---|---|---|
| `user:{uid}` | HASH | 无 | 玩法热档真源（含 fence/ver/schemaVersion 字段） |
| `bag:{uid}:{0..3}` | HASH | 无 | 背包分片（R1 拆片避免大 Hash） |
| `fence:{uid}` | STRING | 无 | per-uid 锁 fence 发号计数器 |
| `applied:{uid}` | ZSET | 无 | 幂等已 apply 集合（member=op_id, score=applyMs，I5 裁剪） |
| `lock:{uid}` | STRING | 5s | 跨实例用户锁（值=fence，SET NX PX） |
| `idem:{type}:{uid}:{clientReqId}` | STRING | pending 10s / done 60s | 幂等占位（I1） |
| `sess:{uid}` | HASH | 3d | 会话（含 tokenEpoch，封号删它 token 立即失效） |
| `guild:evt:seq:{gid}` | STRING | 无 | 工会事件 seq（INCR，§10） |
| `guild:evt:log:{gid}` | LIST | 无（LTRIM 上限） | 工会事件近窗 |
| `active:lru:{bucket}` | ZSET | 无 | 活跃索引（找冷用户，bucket 非 uid hash-tag） |
| `stream:match` | STREAM | 无（XTRIM MINID，K6） | 结算证据链 |
| mail 唤醒流 | STREAM | 无（XTRIM MINID） | 邮件实时唤醒（权威在 MySQL mail 表，A6） |

### Redis key（cache 实例：allkeys-lru，物理独立）

| key | 类型 | TTL | 用途 |
|---|---|---|---|
| `cache:currency:{uid}` | HASH | 5m | 货币只读缓存（真源 MySQL，miss 回源） |

### user:{uid} 字段（建号基线 + 追加）

建号基线：`star / maxRound / wins / losses / stamina / ver / fence / schemaVersion`。追加字段：

| 字段 | 说明 |
|---|---|
| `musicOn` / `sfxOn` | 音频偏好；**缺失即默认开**（`"1"`），存量档零迁移，⛔ 不回填 |
| `lastStaminaRecoverAt` | 体力恢复计时起点(ms)；`0`=满/未开始。公式在 shared `logic/stamina.ts` |
| `guildId` | 所属工会 id；缺失/`0`=无工会。写点 `guild.join/leave`，冗余进网关在线索引（§10） |
| `nickname` / `avatarId` / `province` | 资料字段（他档公开视图 readUserReadonly 暴露） |

### 错误码表（shared `RPC_ERR_CODES`；客户端按 code 分支，G3）

| code | 触发 | 客户端处置 |
|---|---|---|
| `AUTH_REQUIRED` | 无 token / token 无效 | 重新登录 |
| `AUTH_EPOCH_STALE` | 被踢/封号后旧会话 | 重新登录 |
| `ACCOUNT_BANNED` | accounts.status=1 | 提示封号 |
| `RATE_LIMITED` | 令牌桶耗尽 | 退避重试 |
| `INVALID_PAYLOAD` | zod 校验失败 | 修参（bug） |
| `UNKNOWN_TYPE` | 路由表无此 type | 灰度期忽略，⛔ 不封禁（G6） |
| `INSUFFICIENT_BALANCE` | 余额不足 | 引导充值 |
| `BUSY` | 抢 `lock:{uid}` 失败 | 同 clientReqId 自动重试 |
| `STALE_FENCE` | fence 被更高值超越 | 同 clientReqId 自动重试 |
| `IN_PROGRESS` | 幂等 pending 命中 | 短轮询 |
| `GRANTING` | 发放中（outbox 三阶段） | `shop.queryOp` 轮询，⛔ 不「超时即失败」 |
| `THAWING` | 冷档解冻中/限流 | 比 IN_PROGRESS 更长退避 |
| `USER_DATA_LOST` | 有号但热/冷档全无（F4） | 报错告警，⛔ 不建空档 |
| `ORDER_MISMATCH` | 支付回调金额/订单不符 | 400 |
| `INTERNAL` | 未映射异常 | 通用错误 |

### Lua 脚本（R7：EVALSHA + NOSCRIPT 重载）

`casHset`（EXISTS 前置 + fence CAS + bump ver）· `applyEffect`（EXISTS + op_id 去重，无 fence）·
`casDel`（值匹配才 DEL 释放锁）· `tokenBucket`（时钟在 Lua 内 `TIME`）· freeze/thaw 恢复复检锁 Lua。

### 关键常量与环境变量（`core/infra/config.ts`）

| 常量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 2568(.env) | Colyseus 默认 2567 常被占用 |
| `LOCK_TTL_MS` | 5000 | 用户锁 TTL，必须 > 货币事务 p99（L6） |
| `LOCK_RENEW_MS` | 2000 | 看门狗续租周期（仅 freeze/thaw） |
| `HANDLER_TIMEOUT_MS` | 10000 | handler 超时 race（⚠ 不取消副作用，G9） |
| `RPC_RATE_CAPACITY / _REFILL_PER_S` | 20 / 10 | per-uid 令牌桶 |
| `RPC_SYNC_BUDGET_MS` | 生产 100 / 开发 20 | handler 同步预算（rpc-budget，铁律 11） |
| `EVENT_LOOP_ALERT_MS` | 100 | 事件循环最长冻结告警（loopMonitor 窗口 max） |
| `COMPUTE_POOL_SIZE / _TASK_TIMEOUT_MS` | 2 / 30000 | 计算池大小 / 单任务超时 |
| `GUILD_EVT_LOG_MAX` | 100 | 工会事件近窗长度 |
| `PUSH_ALL_CHUNK` | 500 | 全服广播分片（片间 setImmediate 让出） |
| `COLD_DAYS` | 90 | 冷档阈值，>> max(OUTBOX/APPLIED)（F2） |
| `ACTIVE_LRU_BUCKETS / BUCKETS / BAG_SHARDS` | 256 / 16384 / 4 | 分片数，改即迁移（S2） |
| `SCHEMA_VERSION` | 1 | 玩法档 schema 版本（S1 懒迁移） |
| `PROJECT_ID / REDIS_KEY_PREFIX` | 根 .env 的 PROJECT_ID（缺省 gono）/ `<PROJECT_ID>_` | 多项目共用栈的命名空间：Redis 键前缀 + MySQL 库名 `game_<PROJECT_ID>`；校验 `^[a-z][a-z0-9_]{0,31}$`，非法即拒绝启动（config-guard.test 机检） |
| `PORT` | 2568（根 .env 可覆盖） | 开发端口，`index.ts` 显式传 `listen(app, PORT)`；多项目并行时各项目错开 |
| `WX_APPID / WX_SECRET` | env | 微信凭证（KMS 注入，不进代码库） |

---

## 14. 里程碑地图 M0–M10

框架按里程碑推进。依赖：`M0 前置(三硬闸) → M1 基础设施 → M2 核心原语 →{ M3 鉴权→M5 网关→M6
货币/outbox/充值/邮件附件→M8 结算 ; M9 冷档(需 M2+M6,水位启用) } ; M10 运维贯穿`。

| M | 一句话 |
|---|---|
| M0 前置验证 | 三硬闸：Colyseus 0.17 指定节点建房 + RedisDriver/Presence；货币事务 p99 < LOCK_TTL；填验收阈值表 |
| M1 基础设施 | 双 Redis + MySQL(binlog_format=ROW) + 全 DDL；桶路由；Lua 注册；singleton_lease 预置三行 |
| M2 核心原语 | locks（两层锁+fence+看门狗）/ 四条 Lua / uow+withUser / idem / userStore（**最重要**） |
| M3 鉴权 | wx-login → 建号 → 不透明 token → sess；token_epoch 撤销；登录限流 |
| M4 存量迁移 | ⚠ **Arthur 专属，本项目 N/A**（无旧账号体系，无 SQLite 存量） |
| M5 网关 | LobbyRoom + dispatcher 信封/中间件链；user.getInfo/getProfile + 写样板；邮件收件箱；推送雏形 |
| M6 货币+outbox+充值+邮件附件 | currency 事务 / 三阶段 outbox / 充值状态机 / relayer 独立进程 / claimAttach |
| M7 排行 | ⚠ **已随排行榜演示移除**（编号保留；需要排行的项目自行实现，或参考 Arthur 源实现） |
| M8 对局结算 | M8a 休闲（matchId + match_index 幂等闸 + stream:match 证据链） |
| M9 冷档冻结层 | resolve(fence 新鲜度) + ensureLive + freezeWorker + janitor；relayer cold stub 换真 ensureLive |
| M10 运维收口 | 看板 / 例行任务（分区维护、死号清退）/ DR + PITR runbook |

**排期裁剪**：可晚——M9 冷档启用（但 ensureLive/cold 返回值 M2 就要在）、M7 发奖 + M8b（rating 未拍板
先做榜 + 休闲）。**不能晚**——M2 原语、M6 outbox+充值、M0 三硬闸、matchId(M8a)。

---

## 15. Colyseus 0.17 服务端要点

- 入口 `defineServer({ rooms, routes, transport, express })` + `defineRoom(RoomClass)`；
  `initializeGameServer`/`gameServer.define()` 是 0.16 已废弃。
- Room 状态用类属性 `state = new MyState()`；`onLeave(client, code)` 第二参是数字关闭码。
- 消息处理用 `messages = { [C2S.Xxx]: (client, msg) => {} }`。
- schema v4 用传统 `@type` 装饰器：tsconfig 必须 `experimentalDecorators: true` 且
  **`useDefineForClassFields: false`**（否则装饰字段静默失效、状态不同步且无报错）。
- 服务端因无扩展名相对导入用 `moduleResolution: Bundler` + tsx（不是官方模板的 NodeNext）。
- 大包防护在 ws transport 层 `maxPayload`（G4，`app.config.ts` 配置）。

改 core 前先跑 `npm --workspace @game/server run test && test:int`；改端点/mock 后先跑 `smoke`（12 项）。
