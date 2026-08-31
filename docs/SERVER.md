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
复核探测本身失败（WebPlatform 不可用）默认会持久化 repair intent 并拒绝本次 join（与首次建档失败同码），
需等外部恢复后由 repair worker 收敛；因此「外部不可用时热档回访仍可进」默认只在复核窗口内成立。
该配置只控制复核频率，不改变首次 ready gate 的超时预算。

`CHARACTER_REGISTRATION_GRACE_MS` 是外部不可用时的**有界宽限**（默认 `0` = 关闭，行为同上；
接受域 `0..2592000000`）。**生产部署建议显式设为 7d**——脚手架默认保持关闭，是为了不单方面改变既有
安全姿态，选择权留给部署方。⚠ **它必须严格大于 `CHARACTER_REGISTRATION_RECHECK_MS`**，否则宽限是个
静默的空操作：只有 marker 过了复核窗（`stale >= recheck`）才会去探测外部，而宽限又要求
`stale < grace`，两者在 `grace <= recheck` 时不可能同时成立。所以「recheck=7d + grace=7d」这组看起来
很合理的配置实际什么也不做，连一条 warn 都不会打。⛔ 这一条不只写在文档里——`config.ts` 在加载期
交叉校验并拒绝启动（同 `WEBPLATFORM_CONNECT_TIMEOUT_MS` / `CHARACTER_REPAIR_BACKOFF_*` 两组配对旋钮）。开启后，只有同时满足「本地确有热档」「曾通过权威复核（marker 为 ready
且有时间戳）」「陈旧未超上限」「错误是 `WebPlatformUnavailableError`（含熔断器开启）」「durable repair
intent 已写入」时才放行；⛔ 宽限分支**绝不刷新 marker 时间戳**，否则宽限会自我续期成永久信任。
契约错误与服务身份错误（`WebPlatformContractError` / `WebPlatformServiceError`）一律不宽限——
它们代表配置事故，fail-open 会掩盖部署问题。

安全取舍：`hasCharacter` 的返回值**本来就不是准入判据**（健康路径下 `true` 放行、`false` 补 PUT 后
也放行），它是修复触发器而非授权检查，所以宽限放行与健康路径的最终状态语义等价、只是补 PUT 变成异步。
宽限**不覆盖**新号、`pending` 残留档、无 marker 的 legacy 档、`thaw` 的 F4 独立探测路径，
以及封号/注销（那条链在 session verify 与 `/admin/kick` 上，宽限完全不触碰）。唯一新增风险是把 PUT
推迟到 repair 收敛前，该窗口内该区 durable 成员标记可能缺失——这与今天已存在的崩溃窗同类，只是被拉长。
⚠ 该窗口的上界**不是** `CHARACTER_REPAIR_BACKOFF_MAX_MS`（那是重试**间隔**的上限，不是窗口长度）：
repair 要等外部恢复才能成功，而宽限期间玩家会持续被放行，所以窗口实际由外部不可用的持续时间决定，
上界是 `CHARACTER_REGISTRATION_GRACE_MS` 本身（建议值 7d，接受域上限 30d）——比重试间隔大若干个数量级。
把 grace 设多大，就是接受多长的成员标记缺失窗口。

WebPlatform 客户端的熔断器**按路由族隔离**（`session` / `character` 各一个）。共用一个实例时，
character 路由故障会推开同一个熔断器并连带拒掉 session verify，把故障面从「回访角色复核」放大成
「所有人无法登录」；隔离后两族的可用性互不影响。

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
| 玩家冷档（实验模块） | MySQL `user_archive` | 以 `(user_id,server_id)` 为身份；仅在显式 freeze 后成为权威 |
| 余额缓存 | cache Redis | 可重建，失败不能改变 MySQL 权威结果 |
| Room state、进程内 Map、计时器 | 进程内临时状态 | 不作为持久真源 |

`schema.sql` 还包含若干非核心或未闭环表：`purchases` 属可选商业化参考；`user_archive` 与其派生容量
ledger `archive_zone_usage` 属默认关闭的实验模块；`user_snapshot_readonly` 目前只有 DDL，没有运行时代码；
`singleton_lease` 服务于显式后台样例。不要因表存在就推断对应业务能力已经交付。

按区数据必须显式传播区上下文：

- `user_currency`、`currency_ledger`、`mail`、`match_results`、`gameplay_outbox` 的按区查询与写入均携带
  `server_id`；`readBack`、relayer/replayDead 和邮件领取会把区谓词一路带到状态回读与标记更新。
  仅 `outboxStats` 与保留期清理是有意的全局聚合/清理操作。
- per-zone Redis key 只由 `core/infra/keys.ts` 构造，并在 `zoneCtx.run` 中解析区前缀。
- 派生幂等 ID 编入区号；GameRoom/LobbyRoom 同时核对 `sId`、本组配置与认证结果。
- `user_archive` 与 `user_snapshot_readonly` 的身份键是 `(user_id,server_id)`；归档查询、恢复、清理和
  `active:lru` 候选均携带区号。`archive_zone_usage` 是按区派生的 admission ledger，不是新权威。
- `match_index` 与 `singleton_lease` 刻意是全局表；不能机械添加 `server_id`。

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

`GameRoom` 是共享 transport/admission/lifecycle 的实时房间 shell。生产 catalog 已登记默认 `ballMove` 与
最小 `idle` mode；前者使用 `GameRoomState` 运行移动/技能 Demo，后者使用独立 `IdleRoomState` 和 pulse
胜利条件。两套 root 都由 state manifest 生成的 mode 映射选择。当前展示：

- WebPlatform strict session verify、协议版本与区号复核。
- `filterBy(["sId", "mode"])` 的撮合隔离及房内再次校验；Game join 的 `mode` 必填且由 shared 校验。
- `onCreate` 在首次 handshake 前按 mode 选择一次 root；公共入口之后禁止替换 root。两种状态只共享
  tick/phase/matchId/players 生命周期语义，不共享 player 字段或结算判定。
- `ballMove` 的服务端逻辑帧移动/技能公式与 `idle` 的严格空对象 `IdlePulse`；聊天和重连宽限仍属公共能力。
- 两名玩家后进入 Playing；Idle 达到 pulseGoal（默认 3）获胜，Playing 中对手真实离开时剩余玩家获胜。
  只有显式声明受支持 `matchEvidenceRuleset` 的 mode 才生成对应证据。当前仅
  `ballMove@1` 生产 v3，`idle` 不会污染 `ballMove` 战绩。
- onCreate 拒绝非法区号（WrongServer），同一 userId 禁止重复入座（AlreadyInRoom）。

它不是通用玩法层。当前 Demo 已收口以下边界：

- Ping/Move/IdlePulse/CastSkill/Chat 先经过 strict C2S runtime schema（exact keys、finite/range/length）和
  每客户端消息预算；玩法不支持的消息 fail-closed，S2C payload 也在发送/广播前验证。非法值不会进入
  Schema state 或玩法逻辑。
- phase 白名单只允许 Playing 接受移动/技能；Waiting/Settle 不推进正式模拟。唯一的 `startMatch()` 会在
  `lock()` 成功且参与者集合未变化后一次性复位 hp/alive/方向/cooldown/tick，并使用独立 admission/match RNG
  与 fixed-step 时钟。
- Waiting → Playing 的锁定是 awaited 的；失败会回滚状态并尝试 `unlock()`，连回滚也失败时关闭房间，不会
  留着一个已公开但未持锁的 Playing 房。
- mode 在 `onCreate` 验证 options 后才实例化；`onMatchInitialize`、`onMatchStart`、`onMatchRollback`、`onLeave`、
  `onDispose` 可等待且失败被观察。每个开局 await 后重验 generation、Waiting phase 和精确 roster；dispose
  先使 generation 失效并中断 lock 等待，再等进行中的 initialize/start/rollback settle，最后执行 mode dispose
  与公共清理。admission 后开局失败会 exactly-once 归还该 client 的 mode 资源。
- mode 契约显式提供 player factory、默认 ballMove 规则开关、开局/回滚、真实离场和结算 hook；异构 mode
  不会读取 hp/alive/deathOrder，也不会进入 ballMove input/evidence 路径。
- session → user 双向索引在加入、离开和 Waiting 回滚路径统一维护；断线宽限成功不会提前记入死亡序。
- `ballMove@1` 正式开局冻结有序 roster 与 canonical initial state；v3 记录 schema/ruleset、seed/fixed step、
  map/loadout、按接受顺序排列且带权威 `acceptedTick` 的 move/cast/leave、final state 与 participants。致胜 cast
  在 settle 前入链，Playing leave 在死亡簿记和删除前入链，并在任何可等待 leave hook 前同步冻结终态。
- accepted gameplay input 上限为 16,384；达到上限后先拒绝后续 move/cast 及其玩法副作用，leave 使用固定
  roster 余量，避免产生缺输入却看似完整的证据。

仍有以下明确限制：

- `ballMove` evidence 的写入是受进程任务跟踪的 detached best-effort 操作；Redis 失败返回 `null`，不会阻止收局。
- v3 在生产和消费两侧都 exact validate，并以 `ballMove@1` 重算 initial/final state 与 participants；motion
  anchor 直接解析 tick gap，复杂度为 `O(events + players)`，不会按 final tick 逐帧循环。权威时间轴与冷却
  使用 tick；`elapsedMs = finalTick * fixedStepMs` 只是确定性派生值。该 exact ruleset 不代表通用玩法 evidence。
- v3 只能证明仓内输入重放与结果核对，不提供防篡改、防作弊、producer 必达或 exactly-once 送达保证。

正式玩法扩展仍需在该 Demo 边界之上声明 state root、admission、phase、input validation、reset/settle 和
可选 evidence 契约，再复用该房间模式；当前两种规则的运行时闸不等于通用玩法层已经交付。

改 state 形状或新增 C2S 消息：

1. 改 `apps/shared/schema/gameplays/<id>/state.json`（该 mode state 形状的唯一真源；容量来自同目录
   manifest.json 的 `maxPlayers`），或在 `apps/shared/src/protocol/messages.ts` 登记消息名与 payload。
2. 运行 `npm --workspace @game/server run codegen:gameplays` 重新生成 `apps/shared/src/gameplays/`
   （per-mode state + catalog/index）、`apps/server/src/rooms/schema/GameRoomState.ts` 与
   `apps/server/src/rooms/schema/generated/`、`apps/client/src/gameplay/catalog.generated.ts`
   （都是生成物，禁手改；契约 digest 变化必须同批 bump manifest.modeVersion），再运行 `npm run sync:shared`。
   ⚠ 新增 root 时，它**必须**声明 `tick`/`phase`/`matchId`/`players`，其 player 类型必须声明 `id`/`name`
   ——通用 GameRoom shell 只读这些，漏声明在 codegen 期失败而不是运行期读到 undefined。`GameRoom.state`
   的类型是据此生成的 `RoomStateLifecycle`，⛔ 不是任何具体 root；shell 读 ball 专属字段必须显式走
   `ballState`，且只在 `usesDefaultBallMoveRules === true` 的路径上。
3. 新增 C2S 消息时，通用 `rooms/GameRoom.ts` 必须登记**两处**：`GAME_ROOM_C2S_SCHEMAS`（`[K in C2SType]`
   映射，漏写 typecheck 失败）与 `messages` handler 表（漏写即静默丢消息）。⚠ handler 表**不能**按 mode
   构建：Colyseus 0.17 在 `Room.__init()` 里消费 `this.messages`，而 `__init()` 早于 `onCreate()`，生产房的
   mode 那时还没选定。
4. **准入写在玩法里，不写在 shell 里**：在该玩法的 `inputs.accepts` 声明这条消息，需要 Playing 之外的
   phase 时再加 `inputs.phases`。`phaseAllows` 只保留 Ping/Chat 两条 shell 公共能力，其余查 mode 声明；
   漏声明即被拒（fail-closed），⛔ 不要为了让消息通过而把它加回 shell 的 switch。
   建 mode 实例时（`GameModeRegistry.create`，即建房那一刻）会校验：未知 C2S、重复声明、
   声明 Ping/Chat、为未接受的输入配 phases 都直接抛。⚠ 不是 `register()` 时——非法 mode
   能被成功注册，到第一次建房才炸。
5. 补齐合法/非法 payload、phase 越界与 mode 隔离测试。

## 6. HTTP 开发边界

`src/http/index.ts` 运行时只消费生成的静态 `manifest.generated.ts`：

| Method / path | 当前用途 | 契约状态 |
| --- | --- | --- |
| `GET /healthz` | 进程存活与协议版本 | `GameHttpContractMap.Health` 派生 path/method，并在响应序列化前做 exact validator；不检查 Redis/MySQL |
| `GET /version` | 服务名与协议版本 | `GameHttpContractMap.Version` 派生 path/method，并验证响应 shape |
| `GET /clock/now` | Demo 对时 | `GameHttpContractMap.ClockNow` 派生 path/method，并验证响应 shape |
| `GET /notice/list` | 静态公告 Demo | `GameHttpContractMap.NoticeList` 派生 path/method，并验证响应及公告项 shape |
| `POST /admin/kick` | 可选强制下线参考 | 见 [EXTRAFEATURES](EXTRAFEATURES.md#32-gm账号管理与强制下线参考) |
| `POST /pay/wx-notify` | 默认关闭的可选参考 | 见 [EXTRAFEATURES](EXTRAFEATURES.md#34-真实货币支付参考) |

`GameHttpContractMap` 现在登记全部六个游戏服 endpoint；每个 request validator 在 shared 定义处直接生成
Standard Schema。`createGameEndpoint` 从 contract key 派生 path、校验 method，给带 body 的路由安装该 schema，
禁止 endpoint options 另带本地 body schema，并在 handler 返回值序列化前运行 shared response validator。
新增核心 endpoint 时先补齐 shared request/response/path，再新增 `<domain>/<method>.ts` 并运行
`npm --workspace @game/server run codegen:http`。生成器以 TypeScript AST 发现每个 domain 文件，要求从
`../contract` 导入 factory、以字符串字面量直接 default export，并拒绝缺失、未知或重复 contract key；
服务端测试会只读比较生成 manifest，漏跑 codegen 不能通过。named-export helper 只能放在显式排除的
`src/http/_support/`，运行时不扫描文件系统。

当前 router 没有统一的应用层 body 大小上限。HTTP handler 不得泄漏原始异常、SQL 或密钥，也不得绕过
player/core 写路径直接修改权威数据。
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
4. `loadFields` 用单条只读 Lua 原子取得 `schemaVersion/ver/fence/createdAt/characterRegistrationCheckedAt`
   与请求字段；纯读接受 N/N-1 并深校验但绝不回写，future、过旧、WRONGTYPE 或畸形元数据 fail-closed。
5. `ensureLive` 的纯热档快路径识别 N/N-1；N-1 经 single-flight 与 `lock:{uid}` 后按
   `core/userSchema.ts` 的连续 registry 原子迁到 N。`withUser`、ready marker、applied trim、freeze 与
   janitor 在各自业务锁内、首个业务 callback/写之前再次迁移/校验；relayer 在无 fence apply 前先走
   `ensureLive`。因此锁外快检与实际写之间的滚动发布竞态不能让旧进程越过 future schema 执行业务。
6. 当前 `SCHEMA_VERSION=2`：v1 缺失 `characterRegistrationCheckedAt` 时补规范字符串 `"0"`，合法旧值
   原样保留，显式畸形值拒绝；每个迁移步骤 bump `ver`。新档直接写 v2 与 checkedAt `"0"`，建角专用
   入口另原子写 `characterRegistration=pending`。普通 UoW/CAS 禁写 `schemaVersion`、`ver`、`fence`、
   `createdAt`、`characterRegistration` 与 `characterRegistrationCheckedAt`。

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
但 freeze worker 仍默认关闭。启用时必须同时提供非空、无重复的 `ARCHIVE_ZONES`；worker 只轮询该清单，
在每个区的 `zoneCtx` 中读取独立 `active:lru`，并以 `(user_id,server_id)` 读写冷档。s0 保留旧物理 LRU
key，s1+ 使用区前缀。旧版全局 LRU 的成员不携带区号，不能安全拆分；存量部署首次启用前必须从权威的
每区用户清单有界枚举 `user.lastActiveAt`，分别重建所有配置区的 LRU，不能把旧成员复制到各区。
`active:lru` 的 score 不是纯业务时间：永久 skip 或单次错误会以 `ZADD XX GT` 将它提升到当轮 cold
cutoff，作为有界扫描的调度退避边界，同时保留并发登录写入的更大 score。因此它等于真实活跃时间与
调度退避边界的较大值；`user.lastActiveAt` 才是索引丢失后可重建的真实活跃来源。

双存态不按 fence 数字猜先后：MySQL 行记录随机 `freeze_id` 与
`LEGACY / PREPARED / COMMITTED` phase，Redis 同槽 proof HASH 只按当前行 `freeze_id` 的精确 membership
证明同源。`LEGACY` 双存态或无法证明同源的 phase/proof 组合会保留两侧并报冲突；`fence_hwm` 只作为
thaw 后的 fence floor 阻断僵尸 writer，不参与 live/archive 权威排序。

候选扫描用跨 `zone × bucket` 的轮转游标，`FREEZE_SWEEP_BUDGET` 同时约束候选数和空桶探测数。janitor
只访问配置区，为每区保存 `(frozen_at,user_id)` keyset 游标并轮转区；空区探测同样消耗单轮预算，进程
重启后从头扫描仍保持幂等。Redis 只有在 `used_memory / maxmemory` 达到
`FREEZE_REDIS_HIGH_WATERMARK` 时才允许冻结；INFO 缺失、重复、畸形、请求失败或 `maxmemory=0` 都会
fail-closed，保留热档。

单档先用 UTF-8 序列化字节数做早期上限检查，最终 admission 一律采用 MySQL
`JSON_STORAGE_SIZE(snapshot)`。freeze 在 singleton lease 守卫的同一事务中锁定每区
`archive_zone_usage` 和目标冷档行，按新增/替换增量更新；只有投影超限时才精确重算该区 ledger，以便
识别人工删除释放的容量。thaw 与 janitor 删除冷档时也在删除事务内扣减 ledger。容量超限只拒绝新
freeze，不会为腾空间删除仍是唯一权威的冷档。

这些上限是 admission guard，不是表空间或磁盘容量保证；模块也不提供备份、分片迁移、自动冷档淘汰或
通用长期存储方案。热档与冷档现共用 `core/userSchema.ts` 的深校验和迁移 registry：freeze 只写当前版本，
lazy thaw 在任何 Redis/MySQL identity 改动前完成不可变迁移，future/损坏快照保持两侧零部分写。schema
闭环不改变 archive 默认关闭的实验性质，配置满足也仍只能按实验模块评估。
完整分类见
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
- match evidence 处于 legacy/v2 排空、v3 持续生产的三流迁移期：v2/v3 key 都把完整 legacy key 编入
  hash-tag，三条来源流物理隔离但同槽；生产只写 `schemaVersion=3` 的 v3，一次 XREADGROUP 等待三流
  新条目。consumer 对三流分别处理 PEL、`XAUTOCLAIM`、safe `XTRIM MINID` 和 backlog probe；legacy/v2
  只保留历史兼容读取。

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
现状真源，已知偏差在本节末尾及 `plan-v4.md` 跟踪。

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

match consumer 不再把结构、版本或 replay 损坏的条目直接 ACK 丢弃。legacy/v2/v3 来源流与
`K_STREAM_MATCH_QUARANTINE` 固定同槽；Lua 先把 `sourceStream`、`sourceId`、`sourceKind`、group、稳定原因码
和原始 fields 数组写入 quarantine，再 ACK 来源 PEL。v2 只按冻结的历史 exact shape/值域校验排空，尚无
业务 schema 的 ranked `loadout` 也必须是 canonical JSON；legacy 保留历史 sId 规范化接受域。v3 另校验
24 MiB parse budget、canonical JSON、完整 exact contract，并实际重放核对初态、终态与 participants；producer
也在 XADD 前执行同一 validate + replay。三条通道都要求顶层 `matchId`/`mode` 与 payload 内的同名字段一致
（legacy 只在 payload **确实带了**该字段时要求，真 c8 旧消息两者都不带），发散条目按
`LEGACY_MATCH_ID_MISMATCH` / `LEGACY_MODE_MISMATCH` / `V2_PAYLOAD_BINDING` / `V3_PAYLOAD_BINDING` 隔离——
否则 `match_results` 的顶层两列不能当可信索引。三条来源流各自维护 PEL/claim/trim/depth，consumer owner 含
hostname 与 PID，同主机多 worker 不共享 PEL owner，崩溃残留由 `XAUTOCLAIM` 接管。
quarantine 不属于自动 `XTRIM` 范围，非空或 key 类型/权限异常时由默认深度探针独立告警。

隔离流里有**两类**条目，按 `sourceKind` 分流，⛔ 处置方式不同：

- `sourceKind ∈ {legacy, v2, v3}`（消费侧，Lua 写入）：带 `sourceStream`/`sourceId`/`sourceGroup`/
  `sourceIdentity`，`rawFields` 是原始 fields **数组**的 JSON。处置时先根据 `rawFields` 修复并
  XADD 回正确来源流，确认 settle worker 已写入 `match_results` 或命中 `match_index` 幂等闸后，
  才可 XDEL 对应条目；不得直接清空隔离流。
- `sourceKind = producer`（生产侧自检失败）：`sourceStream`/`sourceId` 为空串，不带
  `sourceGroup`/`sourceIdentity`（生产侧没有 PEL），带 `matchId`，`rawFields` 是证据 **payload**
  的 JSON。⛔ **没有来源流可回**——它代表 GameRoom 自身的状态与它产出的证据矛盾，修的是代码不是
  条目；核查（并按需修复代码）后直接 XDEL。⚠ 对它跑上面那条「XADD 回来源流」的流程会把一份
  已知不自洽的证据塞进正式流。

两类的时间戳字段同名（`quarantinedAtMs`），可统一按它做保留期判断。

⚠ **容量**：producer 自检失败会**每次收局各写一条**，而这条流永不自动裁剪。一次系统性的自检回归
（例如某个 mode 的证据构造改坏）会按对局速率持续写入，撑爆与来源流同槽的共享 Redis。深度探针的
告警是唯一的早期信号，⛔ 不要把它调成只在很高水位才响。

`match_results.payload` 同表混存三种形状，判别键是 `schema_version` 列：`0` = 未知/legacy（任意 JSON
object，无 shape 校验）、`2` = 冻结的 v2（8 键）、`3` = 可重放的 v3（16 键）。读取方必须先看这一列再决定
拿哪套 verifier——直接用 v3 verifier 读 v2/legacy 行会在 `exactRecord` 抛 `KEYS`。⛔ 不要用 `mode` 列反推
形状：v3 的 `mode` 恒 0，与 legacy/v2 的玩法值取值域重叠。该列由 `db:bootstrap` 以 `ALGORITHM=INSTANT`
加列、`DEFAULT 0` 收敛存量行；⛔ 不得把存量行 backfill 成 2 或 3：一条恰好 8 键形状的 legacy 行与真 v2 行
逐字节相同，无法区分。quarantine 修复流程允许把条目 XADD 回任意来源流，所以 `schema_version` 标的是
**payload 长什么样**，不是它从哪条流来。

### F/S — 档案与 schema

- **09·F1–F5 / S1–S2**：freeze/thaw 用 phase、当前 `freeze_id` 的 exact proof membership 判权；
  `fence_hwm` 只阻断 thaw 后的僵尸 writer，不参与权威排序；无法证明同源时保留双存态并 fail-closed；
  写路径不绕过在线保护；角色存在性不靠猜；热档只读原子接受 N/N-1，写前锁内迁移，冷档 lazy thaw
  共用同一 registry/deep validator；future、WRONGTYPE 与损坏数据均在首写前失败。

Game HTTP request schema 已由 shared validator 同源生成并直接注入带 body 的路由；该边界在源码中没有
对应编号标签，⛔ 不要用 09·X2 / 09·X3 指代。热档 schema、relayer 外部 I/O 事务边界、坏 match entry
隔离、GameRoom C2S、Lobby RPC envelope、Public WebPlatform response 和未知路由限流均已有对应守门，
不应继续列作当前偏差。不要用规则编号掩盖剩余事实。

## 13. 登记点

| 内容 | 当前真源 |
| --- | --- |
| Room 名、C2S/S2C、join options | `apps/shared/src/protocol/rooms.ts`、`messages.ts` |
| Lobby RPC 请求/响应/消息全集 | `apps/shared/src/protocol/lobbyRpc` |
| RPC 错误码 | `apps/shared/src/protocol/lobbyRpc/envelope.ts` 的 `RPC_ERR_CODES`（15 个）；异常→码映射在 `core/errors.ts` 的 `ERR_MAP`（覆盖 11 个，其余落 `INTERNAL` 兜底）。其中 `GRANTING` 当前没有任何产出点，`AUTH_EPOCH_STALE` 服务端已停产、只保留客户端分支，`ORDER_MISMATCH` 只由可选的 `http/pay/wxNotify.ts` 直接返回，不经 `ERR_MAP` |
| Colyseus state 形状 | `apps/shared/schema/gameplays/<id>/{manifest.json,state.json}`；纯数据镜像 `apps/shared/src/gameplays/generated/state/<id>.ts` + catalog、运行时 Schema `apps/server/src/rooms/schema/generated/<id>.ts` 与聚合器 `GameRoomState.ts` 都是 `apps/server/tools/gameplay-codegen/` 的生成物（首行带 AUTO-GENERATED 标记，禁手改），改单源后运行 `npm --workspace @game/server run codegen:gameplays` |
| `ballMove` v3 evidence schema/validator/replay | `apps/server/src/core/match/matchEvidence.ts`、`matchReplay.ts`；流生产消费在 `matchConsumer.ts` |
| Redis key | `apps/server/src/core/infra/keys.ts` |
| Asset effect schema/validator | `apps/shared/src/protocol/lobbyRpc/economy.ts`；Lua 镜像在 `apps/server/src/core/infra/redisScripts.ts` |
| 跨模块服务端配置 | `apps/server/src/core/infra/config.ts`；少量模块私有常量仍在实现文件内 |
| Lua | `apps/server/src/core/infra/redisScripts.ts` 与模块专属 script 文件；认证组 sess fence 在 `core/auth/session.ts` 以 `defineScript` 登记，并统一经 `evalshaWithReload` 执行 |
| MySQL DDL | `apps/server/sql/schema.sql`；兼容升级逻辑在 `tools/db-bootstrap.ts` |
| RPC endpoint | `apps/server/src/websocket/<domain>/<method>.ts`；装载规则在 `loader.ts` |
| HTTP endpoint | `apps/server/src/http/<domain>/<method>.ts`；装配表是生成物 `apps/server/src/http/manifest.generated.ts`（禁手改），新增后运行 `npm --workspace @game/server run codegen:http`，`http/index.ts` 只消费该 manifest |
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
