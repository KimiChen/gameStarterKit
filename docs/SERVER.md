# 服务端开发

> 本文按当前代码说明 `apps/server` 的开发结构、契约入口、数据正确性约束与已知缺口。项目只提供
> 本地开发骨架和示例实现；可选后台处理、冷档、支付、GM、多区拓扑等内容统一见
> [额外功能与参考实现](EXTRAFEATURES.md)，不构成核心能力承诺。

## 1. 本地开始

```bash
npm install
npm --workspace @game/server run stack
npm --workspace @game/server run db:bootstrap
npm run dev
```

本地配置真源是仓库根的 `.env.development`（已入库，唯一 env 文件；`infra/config.ts` 只填 `process.env` 中
没有的键，显式环境变量优先）。其中两项在模块加载期严格校验、非法即拒绝启动：

- `PROJECT_ID`（缺省 `gono`，须匹配 `^[a-z][a-z0-9_]{0,31}$`）：同时用作 Redis 键前缀 `<PROJECT_ID>_`
  与 MySQL 库名 `game_<PROJECT_ID>`，是多项目共用同一套本地栈时的命名空间。
- `PORT`（缺省 2568，须为 1–65535 纯整数；文件中当前为注释状态，取缺省值）：服务端口；`sync:client`
  由同一真源生成客户端 `core/devEnv.ts`，两侧使用同一规则以免端口静默脑裂，显式环境变量覆盖时
  config.ts 会打印分叉告警。

停止与查看本地栈：

```bash
npm --workspace @game/server run stack:stop
apps/server/tools/dev-stack.sh status
```

`stack:stop` 会对配置端口上的两个 Redis 与 MySQL 发停止指令；`status` 只打印三者的可达性（当前没有对应的
npm script）。多项目默认共用同一套 6401/6402/3316 实例，停止前请确认没有其他项目在用。
另：`npm run dev` 是 watch 模式；不需要 watch 时可用 `npm run start:server`（等价于 `@game/server`
的 `start`）。

仓库现有 `stack` 脚本直接使用 Homebrew 的 Redis 与 `mysql@8.4`，因此它是 macOS 本地开发便利脚本，
不是跨平台环境交付方案。默认启动两个物理 Redis 和一个 MySQL：

- durable Redis：玩家热档、锁、幂等标记和 stream；`noeviction` + AOF。
- cache Redis：可重建余额缓存；`allkeys-lru`。
- MySQL：本地示例的货币、ledger、outbox、邮件与对局结果等表。

coord/kick 通过独立 accessor 和 key 表达协调语义，但本地默认 URL 指向 durable Redis；同 URL 会复用
同一个 ioredis client。不能把“语义分开”误写成“开发环境一定有第三个 Redis”。

验证命令的前置条件不同：

| 命令 | 当前用途与前置 |
| --- | --- |
| `npm --workspace @game/server run test` | 无头单元测试；不代表 Redis/MySQL/外部 HTTP 已联通 |
| `npm --workspace @game/server run smoke:framework` | 已启动并 bootstrap 的本地 Redis/MySQL 连通性检查 |
| `npm --workspace @game/server run test:int` | 已启动并 bootstrap 的本地 Redis/MySQL 集成测试 |
| `npm --workspace @game/server run smoke` | 运行中的游戏服、外部 WebPlatform Public/Internal 与本地数据库的完整示例链路；Admin secret 只影响可选 kick 分支 |

`NODE_ENV !== "production"` 时，`app.config.ts` 自动挂载 `/` playground 与 `/monitor`。它们是本地开发
界面，不是本项目提供的管理或监控系统。

## 2. 目录

```text
apps/server/
├── sql/schema.sql       MySQL DDL 真源
├── tools/               本地栈、建库、framework smoke 与 m0/ 一次性压测探针
├── test/                单元、完整 smoke 与集成测试
└── src/
    ├── app.config.ts    Colyseus 房间、HTTP router、transport 与开发界面装配
    ├── index.ts         开发进程入口及默认本地后台循环
    ├── core/            锁、UoW、幂等、数据访问、outbox、计算等原语
    ├── http/            游戏服 HTTP endpoint
    ├── platform/        外部 WebPlatform Internal HTTP 适配
    ├── player/          玩家档案视图、建角与登记修复
    ├── rooms/           GameRoom 与 Schema 状态
    └── websocket/       LobbyRoom、dispatcher、loader 与逐文件 RPC endpoint
```

普通业务通过就近登记点扩展。`LobbyRoom.ts`、`dispatcher.ts`、`loader.ts` 和 `rpc.ts` 是协议接缝，修改
前应先确认现有扩展点确实无法表达需求。

## 3. 数据边界

| 数据 | 当前真源 | 说明 |
| --- | --- | --- |
| 开发账号、会话、角色存在性 | 外部 WebPlatform | 本仓只通过锁定的 HTTP 契约验证或登记 |
| 货币、ledger、outbox、邮件、对局结果 | MySQL | 事务、唯一键和显式状态约束 |
| 玩家热档、背包、fence、applied marker | durable Redis | hash/Lua/lock；不能被 cache 替代 |
| 余额缓存 | cache Redis | 可重建，失败不能改变 MySQL 权威结果 |
| Room state、进程内 Map、计时器 | 进程内临时状态 | 不作为持久真源 |

`schema.sql` 还包含若干非核心或未闭环表：`purchases` 属可选商业化参考；`user_archive` 属默认关闭的
实验模块；`user_snapshot_readonly` 目前只有 DDL，没有运行时代码；`singleton_lease` 服务于显式后台样例。
不要因表存在就推断对应业务能力已经交付。

按区数据必须显式传播区上下文：

- `user_currency`、`currency_ledger`、`mail`、`match_results` 的按区查询携带 `server_id`；
  `gameplay_outbox` 创建时会写区号，但 `readBack` 目前仍只按 `op_id + user_id` 查询，属于
  [核心计划 P0-03](../plan.md) 的已知隔离缺口。
- per-zone Redis key 只由 `core/infra/keys.ts` 构造，并在 `zoneCtx.run` 中解析区前缀。
- 派生幂等 ID 编入区号；GameRoom/LobbyRoom 同时核对 `sId`、本组配置与认证结果。
- `match_index` 与 `singleton_lease` 刻意是全局表；不能机械添加 `server_id`。
- `user_archive` 与 `user_snapshot_readonly` 当前没有 `server_id`，这是 archive 不能安全启用的原因之一。

持久写原则上应在请求完成前提交到真源，不依赖进程退出时 flush。当前仍有明确的 best-effort 例外：
Lobby `ensureCharacter` 和 GameRoom evidence 都是 detached 调用，失败只记录或留待样例补偿；使用方不能把
它们当作已确认完成的同步结果。

## 4. Lobby RPC

实际结构：

```text
websocket/
├── LobbyRoom.ts
├── dispatcher.ts
├── loader.ts
├── rpc.ts
├── push.ts
└── <domain>/<method>.ts
```

不存在统一 `handlers.ts`。启动时 `loader.ts` 扫描每个域目录下的 `.ts` endpoint，校验路由名必须等于
`<domain>.<method>`，并要求 endpoint 全集与 shared 的 `ALL_LOBBY_RPC_TYPES` 完全相等。该 loader 依赖
tsx 直接执行和运行时文件系统扫描，不是打包产物装载器。

职责边界：

- `LobbyRoom`：连接级 strict auth、每消息 session cache 复验、区上下文与回复发送；`onJoin` 会等待同一
  `(uid,sId)` 的有界首角色 initializer，只有角色档与 WebPlatform 登记 ready 后才公开 seat。初始化失败
  以 `CharCreateFailed` 结束本次 join，不能进入“已登录但 `GetInfo.user=null`”的半状态；迟到的底层幂等
  操作仍由 repair/下一次 join 收敛。
  Lobby 当前是 `autoDispose = false`、`maxClients = 5000` 的共享房，且注册时没有 `filterBy(["sId"])`：
  不同区的连接可能落在同一间房，区隔离依赖 `auth.sId` 与 `zoneCtx`，不依赖撮合。客户端用
  `joinOrCreate`，满员后由 matchmaker 另开一间大厅房；多节点分摊连接的形态尚未确定。
- `loader` / `rpc.ts`：路径登记、shared 类型绑定和启动期全集校验；`index.ts` 在 `listen` 前
  `await registerAllRoutes()`，契约不齐时进程直接退出。
- `dispatcher`：路由查找、令牌桶、Zod 解析、可选幂等占位、超时 race 与错误码规约；
  `NODE_ENV=production` 时 INTERNAL 错误的 message 被替换为固定串，不向客户端泄漏内部细节。
- handler 与 core：通过 `withUser`、MySQL 事务或具体领域原语实现写入串行化；dispatcher 本身不提供
  全局 per-user 串行化。

新增 RPC：

1. 在 `apps/shared/src/protocol/lobbyRpc` 定义消息名、请求、响应和错误码。
2. 运行 `npm run sync:shared`。
3. 新建 `websocket/<domain>/<method>.ts`，用 `defineRpc` 导出 schema、handler 与幂等属性。
4. 增加合法、非法、重复、错误映射及需要的数据库测试。

读写分路：纯读使用 `readUser` / `readUserReadonly` / `loadFields`；单用户热档写使用 `withUser` 和 UoW；
MySQL 权威写使用领域事务。`core/compute` 只适合请求触发、可序列化、无 IO 的纯 CPU 计算；“跨用户写”
或“批处理”本身不是进入计算池的理由。

当前边界仍有缺口：

- `z.object(...)` 默认会剥离未知字段，类型绑定也不能证明 schema 与 shared 的字段集合完全相等。
- 通用幂等占位只按 `(type, uid, clientReqId)` 缓存结果，没有绑定 payload hash；相同 ID 携带不同 payload
  不会被识别为冲突。
- 未知路由在令牌桶之前返回 `UNKNOWN_TYPE`，因此“未知消息也被同一限流约束”目前不成立。
- `Promise.race` 超时不会取消 handler；迟到副作用仍须依靠数据层幂等/CAS 收敛。
- 信封校验发生在 dispatcher 之前：`LobbyRoom` 用 Colyseus `validate(rpcEnvelopeSchema, ...)` 注册 `rpc`
  消息，`id`/`type` 必须是 1–64 字符字符串。信封不合法时 Colyseus 直接以 `WITH_ERROR` 关闭该连接，
  不会返回带错误码的 reply，该连接上在途 RPC 的配对全部落空；dispatcher 的错误码规约只覆盖信封合法
  之后的路径。

## 5. GameRoom

`GameRoom` 是 `ballMove` + 技能伤害的开发 Demo，当前展示：

- WebPlatform strict session verify、协议版本与区号复核。
- `filterBy(["sId"])` 的撮合隔离及房内再次校验。
- Colyseus Schema 状态、服务端逻辑帧移动、技能公式、聊天和重连宽限。
- 两名玩家后进入 Playing、收局后 best-effort 写 match evidence。
- onCreate 拒绝非法区号（WrongServer），同一 userId 禁止重复入座（AlreadyInRoom）。

它不是通用玩法层，且有以下当前限制：

- Ping/Move/CastSkill/Chat 只使用 TypeScript 类型与局部兜底，没有 C2S runtime schema。
- Waiting 阶段允许释放技能以服务单人 smoke；开局只清死亡顺序，没有复位已改变的 HP、alive、方向和
  cooldown，因此等待期状态可能污染正式 Playing。
- `lock()` 失败只记录日志，房间已经进入 Playing，仍可能留在撮合池。
- evidence 的写入是 fire-and-forget；Redis 失败返回 `null`，不会阻止收局。
- evidence 没有记录移动与技能输入序列，不能据现有字段宣称可确定性重放整局。

正式玩法应先补齐 admission、phase、input validation、reset/settle 和 evidence 契约，再复用该房间模式。

## 6. HTTP 开发边界

当前静态装配点是 `src/http/index.ts`：

| Method / path | 当前用途 | 契约状态 |
| --- | --- | --- |
| `GET /healthz` | 进程存活与协议版本 | shared 有匹配 path/response，但 endpoint 仍重复路径字面量；不检查 Redis/MySQL |
| `GET /version` | 服务名与协议版本 | response 在 shared，path 仍是 endpoint 字面量 |
| `GET /clock/now` | Demo 对时 | response 在 shared，path 仍是 endpoint 字面量 |
| `GET /notice/list` | 静态公告 Demo | response 在 shared，path 仍是 endpoint 字面量 |
| `POST /admin/kick` | 可选强制下线参考 | 见 [EXTRAFEATURES](EXTRAFEATURES.md#32-gm账号管理与强制下线参考) |
| `POST /pay/wx-notify` | 默认关闭的可选参考 | 见 [EXTRAFEATURES](EXTRAFEATURES.md#34-真实货币支付参考) |

因此“所有 method/path/请求/响应都来自 shared”不是当前事实：`ApiPath` 目前只登记 `/healthz`，其余路径
由 endpoint 文件和装配表共同决定。新增核心 HTTP endpoint 时应先补齐 shared 契约和 path 真源，再在
`http/index.ts` 登记。

当前 router 对带 body 的样例使用 Zod，但没有统一的应用层 body 大小上限，且普通 `z.object` 不是 exact-key
校验。HTTP handler 不得泄漏原始异常、SQL 或密钥，也不得绕过 player/core 写路径直接修改权威数据。
外部身份请求只能经 `platform/webPlatformClient.ts`。

## 7. 玩家档案

当前入口：

- `player/userStore.ts` 的 `readUser` / `readUserReadonly`：自档与他档只读视图。
- `core/userRecord.ts` 的 `loadFields`、`createUser`、`touchActive`：字段读取、建档和活跃索引原语。
- `core/uow.ts` 的 `withUser` / `UnitOfWork`：本地 mutex、分布式锁、fence、dirty commit。
- `core/archive/thaw.ts` 的 `ensureLive`：已接入常规写路径的实验性冷档恢复接缝。

原则：

1. `withUser` callback 在极端 cold 重试中可能再次执行；UoW 之外的副作用必须幂等或后置。
2. Redis lock 只提供互斥窗口，提交时的 fence 才阻止过期持有者写入；但 fence 校验发生在写入时刻，
   锁过期后、新持有者尚未发生第一次业务写之前，旧持有者的写仍会被接受。当前缓解是 `LOCK_TTL_MS`
   （5s）远大于业务 p99，且抢锁必然消耗 fence 号，使新持有者的号恒更高——这不是消除窗口，触发需要
   超过 TTL 的停顿叠加跨实例换主。
3. 按需 `HMGET` 并只写 dirty 字段；禁止 `HGETALL` 后整档覆盖。
4. `schemaVersion` 当前由建档和 thaw 写入，但热档 `readUser` 只以 `ver` 判断存在，没有校验或迁移
   `schemaVersion`；文档不能宣称热读已完成 N/N-1 兼容。

## 8. 幂等与 outbox

示例 shop 写链为：MySQL 事务扣款并写 ledger/outbox → Redis Lua 应用 effect → 标记 outbox done；失败时
由显式 relayer 命令重试。稳定的 `clientReqId` / `op_id` 必须在调用方重试中复用。

目标不变量是“effect 在任何写入前完整校验，再由单个 Lua 原子应用；未知 kind/version 不得成功”。当前
实现尚未达到这个目标：`APPLY_EFFECT` 在遍历时直接写、未知 `kind` 被忽略、`setField` 可写任意字段，且
applied marker 最后才写；Lua 运行时错误也不会自动回滚此前 Redis 写入。不能把现有实现描述成已完成的
通用 effect 执行器。

`setField` 是绝对值写，与 item/star 增量不同不可交换：旧 intent 被 relayer 迟到重放时会把旧值盖回。
`core/economy/outbox.ts` 的 `drainPendingFor` 是为此预留的前置吸干函数，但当前没有任何生产写路径调用它，
示例 SKU 也只使用 item 类 grant。新增含 `setField` 的写路径前必须先接线该约定，否则序反转不会被任何
机制拦住。

显式 `relayer` 当前在持有 `FOR UPDATE` 行锁的 MySQL 事务内等待 Redis、`ensureLive` 和部分清理查询，
与“事务内不等待外部 I/O”的目标约束不一致。该后台样例及其成熟度见 EXTRAFEATURES；是否修复及其
优先级由实际采用方决定，不进入核心 `plan.md`。

relayer 重试超过 `OUTBOX_MAX_ATTEMPTS` 后会把 intent 行标记为 dead（status=2）。dead 行既不会被保留期
清理删除，也会让对应 `applied` 标记永远跳过裁剪。当前仓库只提供 `core/economy/outbox.ts` 的
`replayDead(opId)` 实现，没有调用它的命令、HTTP endpoint 或后台任务，因此死信处置需要采用方自行接入
入口。

## 9. 实验性冷档模块

`core/archive` 展示 freeze/thaw、archive fence 与 lazy migrate。`ensureLive`/thaw 已被部分热档路径引用，
但 freeze worker 默认关闭；设置 `FREEZE_ENABLED=1` 会在加载期失败，除非再显式使用命名为 unsafe 的
s0-only escape hatch（`FREEZE_UNSAFE_S0_ONLY`）。当前问题包括 archive 表无 `server_id`、active LRU
全局化和 worker 缺区上下文。

它不能作为容量、备份或长期存储方案。完整分类见
[EXTRAFEATURES §3.6](EXTRAFEATURES.md#36-多区分片扩展与冷档参考)。

## 10. 广播与事件

当前事件接口服务于 mail wake 与 guild push：

- MySQL mail 是权威，`stream:mailwake` 只唤醒在线连接重新 pull。
- Guild 事件保留 seq 与有限近窗；窗口外由调用方做完整刷新。
- Guild 事件的 seq 由 `INCR` 单独发号，事件体在随后的 `LPUSH` 才写入；读取端也是先取 seq 再 `LRANGE`。
  两者之间存在交错窗口：已发号但尚未入表的事件会以 `latestSeq` 形式返回，客户端按 `latestSeq` 抬水位后
  不会再拉到该条，跳号刷新也不会触发。事件流只作尽力通知，权威状态必须能靠全量刷新自愈，⛔ 不能当作
  不丢的增量通道。
- 在线表只登记 Lobby 连接，并按区维护 guild 索引。
- mailwake/kick 的通用 consumer 使用每节点独立 XREAD 游标；match settle 使用 consumer group，不能把
  两种消费语义混写成同一种。
- match evidence 为 legacy+v2 双流转制：v2 key 把完整 legacy key 编入 hash-tag 保证同槽，consumer
  一次 XREADGROUP 双读两条流；v2 条目强制 `schemaVersion=2` 并做顶层与 payload 交叉校验。

这些是本地事件接缝，不是外部消息系统或送达承诺。

## 11. 计算任务

`core/compute` 当前只有 `battleSim` 示例和单元测试，没有默认业务调用点。它面向请求触发、输入输出可
structured-clone、无 IO、无副作用的纯 CPU 工作。周期任务、批处理和跨用户写由其他进程或领域编排，
不进入请求计算池。

池提供惰性 worker、排队/执行共用超时、worker 死亡替换和 `destroyPool`。当前 queue 没有容量上限或
admission/backpressure；测试覆盖 round-trip、并发和未知任务，但没有覆盖队列饱和。`[rpc-budget]` 与
loop monitor 只是本地诊断信号。

`[rpc-budget]` 的同步预算取 `RPC_SYNC_BUDGET_MS`（非生产 20ms、生产 100ms，env 可覆盖）；生产按
`RPC_BUDGET_PROD_SAMPLE`（默认 1%）采样，并按路由以 `RPC_BUDGET_WARN_INTERVAL_MS`（60s）节流告警，
开发环境全量且不节流。loop monitor 每 10s 窗口以事件循环最长冻结（max，非 p99）与 `EVENT_LOOP_ALERT_MS`
（默认 100ms）比较。两者都只是控制台诊断信号，不构成阈值契约。

## 12. 开发约束索引

以下 `09·XX` 编号为源码中的历史正确性标签，表达目标规则，不等于当前实现已经全部满足。代码与测试是
现状真源，已知偏差在本节末尾及 `plan.md` 跟踪。

### A — 数据权威

- **09·A1–A5**：同一字段只有一个权威；禁止裸双写；进程内状态不是持久真源；缓存失败不改变权威
  结果；事件只作唤醒。

### L — 锁与 fence

- **09·L1–L6**：共享写使用同一语义锁；fence 单调且提交时校验；锁过期、续租和重试必须有界并可测试。

### I — 幂等

- **09·I1–I5**：调用方复用稳定 ID；key 含项目/区/用户/业务域；业务唯一键、占位和 applied marker
  共同收敛；相同 ID 不得承载不同 payload；裁剪不能早于未完成 intent。

### X — 跨存储

- **09·X1–X8**：MySQL 权威事务先落 intent（X1）；只改 Redis 的请求不引入 outbox（X2）；已提交 intent
  的 apply 无 fence CAS，以 op_id 幂等收敛（X3）；outbox status 全代码用数字（X4）；后台重放不走
  `withUser`，冷档先 `ensureLive`（X5）；死信须走 `replayDead` 重放（X6）；单例 lease 守卫与业务写同
  事务（X7）；数值下溢回补并上报（X8）。“持锁事务内不等待外部 I/O”“effect 先验证再原子应用”是 §8
  正文的目标规则，源码内没有对应的 09·X 编号。

### R — Redis

- **09·R1–R9**：key 只由 `keys.ts` 构造；按需字段读；相关 Lua key 同槽；durable/cache 语义隔离；
  scan/stream 有界；脚本用 SHA 并处理 `NOSCRIPT`。

### DB — MySQL

- **09·DB1–DB8**：按区表查询带 `server_id`；经济写有 ledger 唯一键；事务短小且不夹外部 I/O；
  分区键、重试、严格错误和 JSON shape 显式处理。

### G — 网关与协议

- **09·G1–G9**：身份来自认证结果；消息、类型与错误码来自 shared；外部 payload 做 runtime validation；
  未知消息有界；重计算离开 handler；超时不等于取消。

### K — 对局与 stream

- **09·K4–K6**：match ID 与 schema version 稳定；证据输入边界明确；消费幂等、坏条目可追踪，裁剪
  不越过未处理位点。

### F/S — 档案与 schema

- **09·F1–F5 / S1–S2**：freeze/thaw 核对 fence；写路径不绕过在线保护；角色存在性不靠猜；
  reader/migrator/version 与需迁移常量的边界显式化。

当前已确认的主要偏差是：I4 未做 payload hash、relayer 在持锁事务内等待 Redis/`ensureLive`/清理查询、
effect 未在写入前预验证、G4 在 GameRoom C2S 和客户端 Public HTTP 上不完整、G5 的未知路由在限流前返回、
K 的坏 match entry 会被 ACK 丢弃、S1 的热档 reader 不看 schemaVersion。其中前两条在源码中没有对应编号
标签，⛔ 不要用 09·X2 / 09·X3 指代它们。不要用规则编号掩盖这些事实。

R7/R9 的 SHA + `NOSCRIPT` 兜底覆盖除登录外的全部 Lua：`core/auth/session.ts` 的组 sess 写入栅栏脚本仍用
裸 `EVAL` 内联下发，未登记到 `redisScripts.ts`。

## 13. 登记点

| 内容 | 当前真源 |
| --- | --- |
| Room 名、C2S/S2C、join options | `apps/shared/src/protocol/rooms.ts`、`messages.ts` |
| Lobby RPC 请求/响应/消息全集 | `apps/shared/src/protocol/lobbyRpc` |
| RPC 错误码 | `apps/shared/src/protocol/lobbyRpc/envelope.ts` 的 `RPC_ERR_CODES`（15 个）；异常→码映射在 `core/errors.ts` 的 `ERR_MAP`（覆盖 11 个，其余落 `INTERNAL` 兜底）。其中 `GRANTING` 当前没有任何产出点，`AUTH_EPOCH_STALE` 服务端已停产、只保留客户端分支，`ORDER_MISMATCH` 只由可选的 `http/pay/wxNotify.ts` 直接返回，不经 `ERR_MAP` |
| Colyseus state 纯数据镜像 | `apps/shared/src/protocol/state.ts`；运行时 Schema 在 `rooms/schema` |
| Redis key | `apps/server/src/core/infra/keys.ts` |
| 跨模块服务端配置 | `apps/server/src/core/infra/config.ts`；少量模块私有常量仍在实现文件内 |
| Lua | `apps/server/src/core/infra/redisScripts.ts` 与模块专属 script 文件；`core/auth/session.ts` 的 `SESS_FENCE_LUA` 目前是例外，未经 `defineScript` 登记 |
| MySQL DDL | `apps/server/sql/schema.sql`；兼容升级逻辑在 `tools/db-bootstrap.ts` |
| RPC endpoint | `apps/server/src/websocket/<domain>/<method>.ts`；装载规则在 `loader.ts` |
| HTTP endpoint | `apps/server/src/http/<domain>/<method>.ts`；装配在 `http/index.ts` |
| 外部身份契约 | 锁定的 `@gono/webplatform-contract` 与 `apps/shared/src/generated/webplatform` |
| 协议指纹 | `scripts/protocol.fingerprint`；更新命令 `node scripts/protocol-fingerprint.mjs`。当前只覆盖 `apps/shared/src/protocol/**` 与 `PROTOCOL_VERSION`，由 `npm run test:fgui` 中的 `protocolFingerprint.test.ts` 校验；`constants/errors.ts` 的 `ErrorCode` 数值、`constants/game.ts` 的 `GamePhase` 与帧率等常量、`logic/battle.ts` 的技能表与伤害公式同为双端契约，但不在该闸内 |
| 计算任务 | `apps/server/src/core/compute/tasks` |
| 本地环境变量与项目命名空间 | 根 `.env.development`；加载与校验在 `apps/server/src/core/infra/config.ts`（`PROJECT_ID` / `PORT` 加载期 fail-fast） |

新增能力时先更新契约和登记点，再实现调用方；不要依赖历史“07 表”等已不存在的文档作为真源。

## 14. 本地验证建议

纯代码修改至少运行：

```bash
npm run typecheck
npm --workspace @game/server run test
```

涉及 Redis/MySQL、锁、outbox、stream 或 archive 时，先启动本地栈并 bootstrap，再运行相关集成测试。
涉及完整登录/选服链路时，另行启动与锁定契约匹配的外部 WebPlatform，再运行 `smoke`。

按改动覆盖重复请求、锁过期与 fence、依赖超时、事务中断、非法 payload、未知版本和同 uid 跨区隔离。
当前 `loadtest/bot.ts` 缺少严格鉴权所需 token/sId，不能作为可用验证入口；其状态见 EXTRAFEATURES。

`apps/server/tools/m0/` 保留两个一次性探测脚本，不进入常规验证命令：`currency-txn-bench.ts` 测货币同步
事务 p99（`core/infra/config.ts` 的 `LOCK_TTL_MS = 5000` 必须罩住该值），`colyseus-redis-probe.ts` 实测
RedisDriver/RedisPresence 下的跨进程建房与定向建房。它们没有 npm 入口，运行时会占用额外端口、写 Redis
db 9 或向 MySQL 写压测行；是当时定数用的本地实验，不是可复用的性能基线工具，文件头注释里的历史章节号
（如“04 · 阶段 1”）已失效；重新调整锁 TTL 或启用 Redis 驱动前应重跑并自行复核结论。仓库未保存基线结果。

## 15. 范围

服务端只作为开发骨架与 Demo。额外后台、商业化、渠道、部署和运行体系的存在或缺失都不属于核心承诺；
准确分类见 [EXTRAFEATURES](EXTRAFEATURES.md)，总体边界见[根 README](../README.md#项目边界)。
