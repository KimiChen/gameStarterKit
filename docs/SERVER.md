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

角色登记的 `ready` marker 默认每 24 小时向 WebPlatform 做一次权威复核（`CHARACTER_REGISTRATION_RECHECK_MS`
以**毫秒**为单位，接受域 `1..2592000000`，即最小 1 毫秒、最大 30 天；配成极小值会让每次热档回访都退化成
一次 `hasCharacter` 外部调用，等于关闭快路径）。复核窗口内的热档回访仍走本地快路径；旧档缺少时间戳、
marker 过期或外部登记不存在时会重新登记并写入 durable repair/时间戳，避免本地 marker 永久掩盖外部删档。
复核探测本身失败（WebPlatform 不可用）会持久化 repair intent 并拒绝本次 join（与首次建档失败同码），
需等外部恢复后由 repair worker 收敛；因此「外部不可用时热档回访仍可进」只在复核窗口内成立。
该配置只控制复核频率，不改变首次 ready gate 的超时预算。

停止与查看本地栈：

```bash
npm --workspace @game/server run stack:stop
apps/server/tools/dev-stack.sh status
```

`stack:stop` 只会停止由本脚本登记且身份仍匹配的实例：它会核对持久化的 instance 标识、PID、进程启动时间、
二进制、监听端口和实际数据目录；端口被其他进程占用、owner 元数据缺失或身份不一致时会跳过并返回失败，
不会向未知 Redis/MySQL 发送停止指令。`status` 只打印三者的可达性和 instance 标识（当前没有对应的 npm
script）。多项目默认共用同一套 6401/6402/3316 实例，停止前请确认没有其他项目在用；首次升级前启动一次
`stack` 以生成 `$GAME_DEV_DATA/.game-dev-stack-id` 和各服务的 `.owner` 元数据。
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
| 玩家热档、背包、fence、applied marker/payload binding | durable Redis | hash/Lua/lock；不能被 cache 替代 |
| 余额缓存 | cache Redis | 可重建，失败不能改变 MySQL 权威结果 |
| Room state、进程内 Map、计时器 | 进程内临时状态 | 不作为持久真源 |

`schema.sql` 还包含若干非核心或未闭环表：`purchases` 属可选商业化参考；`user_archive` 属默认关闭的
实验模块；`user_snapshot_readonly` 目前只有 DDL，没有运行时代码；`singleton_lease` 服务于显式后台样例。
不要因表存在就推断对应业务能力已经交付。

按区数据必须显式传播区上下文：

- `user_currency`、`currency_ledger`、`mail`、`match_results`、`gameplay_outbox` 的按区查询与写入均携带
  `server_id`；`readBack`、relayer/replayDead 和邮件领取会把区谓词一路带到状态回读与标记更新。
  仅 `outboxStats` 与保留期清理是有意的全局聚合/清理操作。
- per-zone Redis key 只由 `core/infra/keys.ts` 构造，并在 `zoneCtx.run` 中解析区前缀。
- 派生幂等 ID 编入区号；GameRoom/LobbyRoom 同时核对 `sId`、本组配置与认证结果。
- `match_index` 与 `singleton_lease` 刻意是全局表；不能机械添加 `server_id`。
- `user_archive` 与 `user_snapshot_readonly` 当前没有 `server_id`，这是 archive 不能安全启用的原因之一。

持久写原则上应在请求完成前提交到真源，不依赖进程退出时 flush。Lobby 首角色初始化现在位于
`onJoin` 的 awaited ready 边界：超时或失败会拒绝本次 join，不会公开一个“已登录但角色为空”的 seat；
底层同一 `(uid,sId)` flight 仍会被观察并由 repair/下一次 join 收敛。当前仍有明确的 best-effort 例外：
GameRoom match evidence 和 ready 之后的在线工会索引是 detached 调用，失败只记录或留待样例补偿；使用方
不能把它们当作已确认完成的同步结果。

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
- 默认进程的监控、流消费者、repair worker、外部 HTTP agent、MySQL 与 Redis 通过
  `core/infra/lifecycle.ts` 的单一 registry 注册；Colyseus 只绑定一个 `onBeforeShutdown` 聚合器。
  释放按启动逆序、可等待且幂等，单个组件失败不会跳过其余组件。大厅按需启动的 mail wake 也注册到
  同一 registry，启动半失败会走相同 cleanup 路径。
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

- 当前已登记端点通过 `defineRpc` + `sharedRpcSchema` 使用 shared 的 exact/range validator，未知字段不会被
  静默剥离；loader 目前只校验路由全集，尚未在运行时阻止未来端点绕过该构造器自带一套 Zod schema。
- 通用幂等占位只按 `(type, uid, clientReqId)` 缓存结果，没有绑定 payload hash；相同 ID 携带不同 payload
  不会被识别为冲突。
- 未知路由现在先经过与已知路由相同的 per-principal 令牌桶，再返回低权重 `UNKNOWN_TYPE` 计数；它不会绕过
  限流，但仍不触发 flood 封禁。
- `Promise.race` 超时不会取消 handler；迟到副作用仍须依靠数据层幂等/CAS 收敛。
- `LobbyRoom` 的 rpc transport callback 现在在已观察的异步链内调用 shared `validateRpcEnvelope`；畸形信封会尽力
  返回带可用 id 的 `INVALID_PAYLOAD` reply，关闭中的 socket 只丢弃发送。dispatcher 仍会再次校验信封，因而
  直接调用 dispatcher 与真实 Lobby transport 共享同一边界。

## 5. GameRoom

`GameRoom` 是以 `ballMove` Schema/phase 为基线的实时房间 shell。生产 catalog 已登记默认 `ballMove` 与最小
`idle` mode；前者运行移动/技能 Demo，后者用于证明同一 transport/lifecycle 可选择第二个真实玩法。当前展示：

- WebPlatform strict session verify、协议版本与区号复核。
- `filterBy(["sId", "mode"])` 的撮合隔离及房内再次校验；Game join 的 `mode` 必填且由 shared 校验。
- Colyseus Schema 状态、服务端逻辑帧移动、技能公式、聊天和重连宽限。
- 两名玩家后进入 Playing；只有显式声明兼容通用 casual evidence 的 mode 才在收局后 best-effort 写证据，
  `idle` 不会污染 `ballMove` 战绩。
- onCreate 拒绝非法区号（WrongServer），同一 userId 禁止重复入座（AlreadyInRoom）。

它不是通用玩法层。当前 Demo 已收口以下边界：

- Ping/Move/CastSkill/Chat 先经过 strict C2S runtime schema（exact keys、finite/range/length）和每客户端
  消息预算；S2C payload 也在发送/广播前验证。非法值不会进入 Schema state 或玩法逻辑。
- phase 白名单只允许 Playing 接受移动/技能；Waiting/Settle 不推进正式模拟。唯一的 `startMatch()` 会在
  `lock()` 成功且参与者集合未变化后一次性复位 hp/alive/方向/cooldown/tick，并使用独立 admission/match RNG
  与 fixed-step 时钟。
- Waiting → Playing 的锁定是 awaited 的；失败会回滚状态并尝试 `unlock()`，连回滚也失败时关闭房间，不会
  留着一个已公开但未持锁的 Playing 房。
- mode 在 `onCreate` 验证 options 后才实例化；`onMatchStart`、`onLeave`、`onDispose` 可等待且失败被观察，
  admission 后开局失败会 exactly-once 归还该 client 的 mode 资源。
- session → user 双向索引在加入、离开和 Waiting 回滚路径统一维护；断线宽限成功不会提前记入死亡序。

仍有以下明确限制：

- `ballMove` evidence 的写入是受进程任务跟踪的 detached best-effort 操作；Redis 失败返回 `null`，不会阻止收局。
- accepted input 序列目前只保存在房间内存中，未随 match evidence 发出；现有 evidence 字段不足以宣称可
  确定性重放整局。

正式玩法扩展仍需在该 Demo 边界之上补齐 admission、phase、input validation、reset/settle 和 evidence
契约，再复用该房间模式；当前 Demo 的运行时闸不等于通用玩法层已经交付。

## 6. HTTP 开发边界

当前静态装配点是 `src/http/index.ts`：

| Method / path | 当前用途 | 契约状态 |
| --- | --- | --- |
| `GET /healthz` | 进程存活与协议版本 | `GameHttpContractMap.Health` 派生 path/method，并在响应序列化前做 exact validator；不检查 Redis/MySQL |
| `GET /version` | 服务名与协议版本 | `GameHttpContractMap.Version` 派生 path/method，并验证响应 shape |
| `GET /clock/now` | Demo 对时 | `GameHttpContractMap.ClockNow` 派生 path/method，并验证响应 shape |
| `GET /notice/list` | 静态公告 Demo | `GameHttpContractMap.NoticeList` 派生 path/method，并验证响应及公告项 shape |
| `POST /admin/kick` | 可选强制下线参考 | 见 [EXTRAFEATURES](EXTRAFEATURES.md#32-gm账号管理与强制下线参考) |
| `POST /pay/wx-notify` | 默认关闭的可选参考 | 见 [EXTRAFEATURES](EXTRAFEATURES.md#34-真实货币支付参考) |

`GameHttpContractMap` 现在登记全部六个游戏服 endpoint；`createGameEndpoint` 从 contract key 派生 path、
校验 method，并在 handler 返回值序列化前运行 shared response validator。请求 body 仍由 endpoint options 中的
strict Zod schema 交给 better-call 校验，当前 contract tests 会对关键字段的接受集合做 shared 对照；新增核心
endpoint 时仍应先补齐 shared request/response/path，再在 `http/index.ts` 登记。

当前 router 对带 body 的样例使用 strict Zod，但没有统一的应用层 body 大小上限。HTTP handler 不得泄漏原始
异常、SQL 或密钥，也不得绕过 player/core 写路径直接修改权威数据。
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
实现已由 shared effect envelope（`schemaVersion=1`）与零依赖 validator 统一约束 exact keys、整数范围、
数量上限和 `setField` 白名单；`APPLY_EFFECT` 在 Lua 内再做完整 validate pass，随后才批量写入。校验失败返回
稳定的 `err:EFFECT_*`，不会改动 user/bag/ver/applied。`applied:payload:{uid}` 绑定规范化 JSON，相同
`op_id` 仅在 payload 相同才返回 `dup`，缺绑定或 payload 不同均返回冲突并映射 `INVALID_PAYLOAD`。
冻结快照同时保存该绑定，避免冷档往返丢失幂等证据。

`setField` 是绝对值写，与 item/star 增量不同不可交换：旧 intent 被 relayer 迟到重放时会把旧值盖回。
`core/economy/outbox.ts` 的 `drainPendingFor` 是为此预留的前置吸干函数，但当前没有任何生产写路径调用它，
示例 SKU 也只使用 item 类 grant。新增含 `setField` 的写路径前必须先接线该约定，否则序反转不会被任何
机制拦住。

显式 `relayer` 以 singleton lease 严格单例、串行执行。每轮先在守卫短事务中选择 pending 行，提交后才做
Redis apply / `ensureLive`，再用新的守卫短事务 CAS 落 done 或失败状态；`trimApplied` 与死信日志也只在
提交后执行，因此 MySQL 行锁不跨外部 I/O。lease 交接窗口允许继任者重放同一 pending intent，由
`op_id + canonical payload` 的 Redis 幂等绑定收敛；当前不提供多 worker claim/分片语义。

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

池提供惰性 worker、排队/执行共用超时、worker 死亡替换和 `destroyPool`。`COMPUTE_QUEUE_CAPACITY`
对运行中与排队中的任务执行总 admission；达到上限时抛出稳定的 `ComputeOverloadedError`，由调用方
退避或转入独立批处理。测试覆盖 round-trip、并发、未知任务、worker 故障恢复，以及运行中与排队任务
共同达到容量上限时的稳定 overload 拒绝。
`[rpc-budget]` 与 loop monitor 只是本地诊断信号。

`[rpc-budget]` 的同步预算取 `RPC_SYNC_BUDGET_MS`（非生产 20ms、生产 100ms，env 可覆盖）；生产按
`RPC_BUDGET_PROD_SAMPLE`（默认 1%）采样，并按路由以 `RPC_BUDGET_WARN_INTERVAL_MS`（60s）节流告警，
开发环境全量且不节流。loop monitor 每 10s 窗口以事件循环最长冻结（max，非 p99）与 `EVENT_LOOP_ALERT_MS`
（默认 100ms）比较。两者都只是控制台诊断信号，不构成阈值契约。

## 12. 开发约束索引

以下 `09·XX` 编号为源码中的历史正确性标签，表达目标规则，不等于当前实现已经全部满足。代码与测试是
现状真源，已知偏差在本节末尾及 `plan-v2.md` 跟踪。

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

当前已确认的主要偏差是：relayer 在持锁事务内等待 Redis/`ensureLive`/清理查询、Game HTTP request schema
仍由 endpoint options 维护（shared request validator 目前通过接受集合测试对照而非直接注入）、K 的坏 match
entry 会被 ACK 丢弃、S1 的热档 reader 不看 schemaVersion。其中前两条在源码中没有对应编号标签，⛔ 不要用
09·X2 / 09·X3 指代它们。GameRoom C2S、Lobby RPC envelope、Public WebPlatform response 和未知路由限流
已分别有 runtime/contract 守门，不应继续列作当前偏差。不要用规则编号掩盖剩余事实。

## 13. 登记点

| 内容 | 当前真源 |
| --- | --- |
| Room 名、C2S/S2C、join options | `apps/shared/src/protocol/rooms.ts`、`messages.ts` |
| Lobby RPC 请求/响应/消息全集 | `apps/shared/src/protocol/lobbyRpc` |
| RPC 错误码 | `apps/shared/src/protocol/lobbyRpc/envelope.ts` 的 `RPC_ERR_CODES`（15 个）；异常→码映射在 `core/errors.ts` 的 `ERR_MAP`（覆盖 11 个，其余落 `INTERNAL` 兜底）。其中 `GRANTING` 当前没有任何产出点，`AUTH_EPOCH_STALE` 服务端已停产、只保留客户端分支，`ORDER_MISMATCH` 只由可选的 `http/pay/wxNotify.ts` 直接返回，不经 `ERR_MAP` |
| Colyseus state 纯数据镜像 | `apps/shared/src/protocol/state.ts`；运行时 Schema 在 `rooms/schema` |
| Redis key | `apps/server/src/core/infra/keys.ts` |
| Asset effect schema/validator | `apps/shared/src/protocol/lobbyRpc/economy.ts`；Lua 镜像在 `apps/server/src/core/infra/redisScripts.ts` |
| 跨模块服务端配置 | `apps/server/src/core/infra/config.ts`；少量模块私有常量仍在实现文件内 |
| Lua | `apps/server/src/core/infra/redisScripts.ts` 与模块专属 script 文件；认证组 sess fence 在 `core/auth/session.ts` 以 `defineScript` 登记，并统一经 `evalshaWithReload` 执行 |
| MySQL DDL | `apps/server/sql/schema.sql`；兼容升级逻辑在 `tools/db-bootstrap.ts` |
| RPC endpoint | `apps/server/src/websocket/<domain>/<method>.ts`；装载规则在 `loader.ts` |
| HTTP endpoint | `apps/server/src/http/<domain>/<method>.ts`；装配在 `http/index.ts` |
| 外部身份契约 | 锁定的 `@gono/webplatform-contract` 与 `apps/shared/src/generated/webplatform` |
| 协议指纹 | `scripts/protocol.fingerprint`；更新命令 `node scripts/protocol-fingerprint.mjs`。当前只覆盖 `apps/shared/src/protocol/**` 与 `PROTOCOL_VERSION`，由 `npm run test:client` 中的 `protocolFingerprint.test.ts` 校验；`constants/errors.ts` 的 `ErrorCode` 数值、`constants/game.ts` 的 `GamePhase` 与帧率等常量、`logic/battle.ts` 的技能表与伤害公式同为双端契约，但不在该闸内 |
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
