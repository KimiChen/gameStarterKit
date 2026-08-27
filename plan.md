# gameStarterKit 当前代码审阅与改进计划

> 审阅日期：2026-08-27
> 审阅基线：分支 `new`，提交 `ff5a328`
> 文档性质：项目改进计划，已纳入 Git
> 评估范围：开发期游戏基础框架的正确性、可测试性、可扩展性和本地开发体验

## 1. 计划说明

本计划只评估游戏开发基础框架的核心正确性、可测试性、可扩展性和本地开发体验。仓库中已有或可能提供的
额外功能统一记录在 `docs/EXTRAFEATURES.md`；它们不纳入本计划的优先级判断，也不构成核心框架的承诺或约束。

## 2. 总体结论

当前仓库已经不是空壳：shared 单源契约、源码镜像同步、第三方源码锁定、View/Logic 分层、RPC 登记、
lock/fence/idempotency/outbox 等基础结构比较扎实，现有本地测试也全部通过。

但按“可复用的游戏开发基础框架”衡量，目前仍有两类关键不足：

1. **若干正确性问题会在异常和并发下暴露。** 资产 effect 可能部分写入、登录/入房/重连存在竞态、
   Waiting 状态可能把死亡状态带入正式对局、角色首次创建与 `GetInfo` 存在时序竞争、证据和 relayer
   的故障路径不够可靠。
2. **框架接缝还没有真正稳定。** `Main.ts` 承担过多职责，View 生命周期不完整，HTTP/C2S 边界缺少
   统一运行时 schema，配置和资源生成缺少“产物新鲜度”检查，测试源码本身没有被严格类型检查。

因此，当前项目适合作为受控 Demo 骨架继续演进，但在完成 P0 前，不宜把网络、资产、对局结算和页面生命周期
视为已经稳定的框架能力。

## 3. 已验证的当前基线

| 验证项 | 当前结果 | 结论与未覆盖面 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | shared/server/client 真源及同步关系通过；未覆盖所有 View/Main/test 源码 |
| `npm --workspace @game/server run test` | 46/46 通过 | 单元测试稳定；未覆盖完整 Redis/MySQL 故障组合 |
| `npm run test:fgui` | 91/91 通过 | 客户端、同步和 FGUI 契约测试通过；命令名已不能准确表达实际范围 |
| `npm run verify:ecs` | 12/12 通过 | bitECS 锁定源码未漂移 |
| `npm --prefix apps/website test` | 构建通过，3/3 通过 | website 自身可本地构建和测试，但不在 root workspace 中 |
| `npm run config:excel-to-json:check` | 通过 | 只检查工作簿合法性，没有核对生成 JSON 是否存在或与源一致 |
| 补充严格 test 编译探针 | 失败 | `webSocketClient.test.ts` 仍使用旧字段 `token/isNew`，实际类型为 `accessToken/isNewAccount` |

额外事实：当前工作树在审阅前无跟踪改动；本轮审阅后，`plan.md` 已按要求纳入 Git。

## 4. 已具备且应保留的设计

1. **shared 单源**：消息名、协议类型、错误码和公式集中在 `apps/shared`。
2. **两级同步**：`shared → client → Cocos` 对漂移、孤儿文件、删除和 `.meta` 有验证。
3. **第三方锁定**：bitECS、Colyseus client 和 FairyGUI 有明确版本/内容完整性约束。
4. **客户端分层方向正确**：Logic 保持引擎无关，View 负责 Cocos/FGUI 绑定。
5. **Room ownership/generation 防护**：旧连接回调不能轻易污染新连接。
6. **RPC 登记机制**：路由集合、文件集合、schema 和错误码已有本地一致性检查。
7. **服务端一致性原语**：per-user 串行、lock、fence、UoW、ledger、outbox、applied 已有骨架。
8. **区服上下文显式化**：Redis key、MySQL `server_id` 和 op-id 能携带区号。
9. **外部身份边界**：服务端通过精确锁定契约消费外部服务，不导入其业务源码。
10. **服务端外部响应校验**：内部 WebPlatform client 已有运行时校验，后续应复用这个方向，而不是推倒重来。
11. **依赖维护方式清楚**：普通开发直接使用入库版本，显式抓取脚本只服务于维护团队人工升级。

后续改动应以强化这些约束为主，不重新制造第二套协议、镜像、网络入口或资源入口。

## 5. P0：继续扩展玩法前必须处理

### P0-01 保证资产 effect 全量校验和原子应用

**现状证据**

`apps/server/src/core/infra/redisScripts.ts` 的 `APPLY_EFFECT` 在遍历 grant 时立即修改 Redis，最后才写
applied marker。Lua 在运行时错误时不会回滚之前的写入，因此“前一条合法、后一条非法”可能留下部分结果。
此外，未知 kind 会被忽略，`setField` 可写任意字段，`IGrant` 只有 TypeScript 类型而没有版本化运行时 schema。

**改进**

1. effect 增加 `schemaVersion` 和 shared 零依赖 runtime validator。
2. 所有 grant 在 Lua 第一遍完成 kind、字段白名单、整数、安全范围、数组长度和总增量校验；第二遍才写入。
3. 明确禁止覆盖 uid/serverId/version/fence/applied 等保留字段。
4. 未知 kind、未知版本和额外字段一律稳定失败，不能静默跳过。
5. 所有资产入口复用同一 validator；测试覆盖 Lua 中途错误、重复 op-id、越界和恶意字段。

**验收**

- “第一条合法、第二条非法”时用户任何字段、ledger 和 applied marker 都不变化。
- 相同 op-id 并发和重复执行只生效一次。
- 校验失败返回稳定、可断言的领域错误；不会退化为部分成功或 INTERNAL。

### P0-02 收口登录、入房、导航与重连竞态

**现状证据**

- `RoomClient.doJoin` 和 `WebSocketClient.doJoin` 的 `joinOrCreate` 没有 deadline/cancel。
- `LoginLogic.inflight` 只保护开发登录 HTTP 请求；`setSession → join Lobby → GetInfo → 导航` 不在同一事务中。
- 掉线期间 `Main.sendDir` 直接丢弃 stop/方向变化，恢复后也不重放当前期望方向，服务端可能继续旧输入。
- `authInvalid`、`battleLost`、`connLost` 使用彼此独立的异步 IIFE，可能重复弹窗、清理和导航。

**改进**

1. 给全部 join 增加统一 timeout、AbortSignal/generation 和失败回滚。
2. 将“点击登录到 Home 可用”纳入一个顶层串行事务；按钮禁用只是 UI 表现，状态机才是唯一互斥源。
3. 输入层保存 desired state 和递增序号；断线时仍更新 desired state，恢复连接后先重放或显式发送 stop。
4. 将所有 session/room 失效原因送入单一 `returnToLogin(reason)` 队列，保证幂等清理和一次导航。
5. 统一 Lobby/Battle ownership 的 enter/leave/cancel 规则，禁止半完成 join 暴露给上层。

**验收**

- 在每个 await 边界重复点击，只产生一个 session、一个 Lobby 和一次页面迁移。
- 黑洞连接在 deadline 后可重试，不残留 `joining/inBattle` 或无主 room。
- 移动中断线并在断线期间松手，恢复后服务端不会延续旧方向。
- auth、battle、connection 三类事件同时发生时，只执行一次清理和一次最终导航。

### P0-03 修复 GameRoom 状态转换和消息边界

**现状证据**

- Waiting 阶段仍可能执行技能伤害/死亡；转入 Playing 时清理了部分记录，却没有统一重置 hp/alive/dir/cooldown。
- GameRoom 的 C2S handler 依赖 TypeScript 类型，缺少对 NaN、Infinity、错类型、未知字段和超长值的运行时拒绝。
- 对局开始后的 `lock()` 是 detached promise；失败时房间已经进入 Playing，却可能继续留在匹配列表。
- 默认 seed 使用 `Date.now() >>> 0`，同毫秒创建的房间可能碰撞。

**改进**

1. 明确 Waiting 可接受的消息集合；不属于等待态的战斗输入直接拒绝。
2. 通过单一 `startMatch()` initializer 初始化全部玩家状态、逻辑帧、冷却、死亡序和 seed。
3. 为每个 C2S 定义 exact runtime schema，拒绝额外字段和非有限数值，并限制字符串/数组大小。
4. 把 lock 纳入可等待的开始事务；失败则回滚到 Waiting 或关闭房间，不能保持半开始状态。
5. seed 从稳定 match identity 与受控随机源生成，并允许测试显式注入。

**验收**

- Waiting 中的恶意战斗消息不会改变玩家状态。
- 任何等待期历史都不会污染正式开始后的 hp/alive/dir/cooldown。
- lock 失败有唯一、可测试的终态。
- 同一 seed/input/frame 得到逐帧一致结果；畸形 C2S 不进入玩法逻辑。

### P0-04 消除角色首次创建与 GetInfo 的就绪竞争

**现状证据**

`LobbyRoom.onJoin` 以 `void ensureCharacter(...).then(...)` 启动角色初始化。客户端 join 成功后立即调用
`GetInfo`，首次登录时可能在角色创建/缓存登记完成前读到 `user: null`。

**改进**

1. 为 Lobby session 建立显式 `initializing/ready/failed` 状态和共享 ready promise。
2. 在允许依赖角色的 RPC 前等待同一个有界 initializer；初始化失败返回稳定错误并关闭不完整 session。
3. `ensureCharacter` 保持幂等，MySQL 创建、Redis live cache 和 room session 只暴露一个最终结果。
4. 客户端在 ready 前不进入 Home，失败时清理 session 并允许重新登录。

**验收**

- 空库并发首登、重复 join、初始化超时和 Redis/MySQL 单点故障都有确定结果。
- join 后立即 `GetInfo` 不再随机返回空用户。
- 初始化失败不会留下“客户端已登录、服务端角色未就绪”的半状态。

### P0-05 让对局结算证据具有可恢复的开发期语义

**现状证据**

- `settle()` 使用 fire-and-forget 方式发送 match evidence；写 stream 失败后只记录日志，房间内原始信息可能丢失。
- consumer 遇到无法 normalize 的 payload 会 ACK 后丢弃，无法复现坏数据原因。

**改进**

1. 定义稳定 match ID 和 `started/settling/settled/aborted` 状态机。
2. 结算先记录幂等 durable intent，再由 consumer 生成结果；房间关闭前必须得到明确的“已记录/明确失败”状态。
3. malformed payload 进入本地隔离集合，保存原始 entry、失败原因和 schema version；不得静默 ACK 丢弃。
4. 使用 fault injection 覆盖 intent 前后、stream 写入、消费、重复消费和提交确认等异常点。

**验收**

- 每个已开始 match 最终只有一个 settled 或 aborted 终态。
- 任意故障点重试均收敛，不重复发奖、不丢失可诊断原始证据。
- 本项验收聚焦本地数据算法、可诊断性和故障收敛。

### P0-06 缩短 relayer 事务并证明幂等收敛

**现状证据**

`relayerTick` 在 `withLeaseTx` 的 MySQL 事务内执行 Redis `redisApply`、`ensureLive` 和裁剪等外部工作，
与 `docs/SERVER.md` 的“事务内不等待 Redis/网络”约束冲突。事务持续时间、锁占用和失败语义因此被外部延迟放大。

**改进**

1. 短事务 claim 一批 rows，写 owner/lease/version 后提交。
2. 事务外执行幂等 effect 和必要的 cache 工作。
3. 再用短事务按 owner/version CAS 标记 done 或记录 retryable/permanent error。
4. 只有已证明幂等的事务才使用 contention retry，并加入总 deadline，而不是逐步无限续时。
5. 明确 applied marker 裁剪与未完成 intent 的关系，不能裁掉仍可能重放的去重依据。

**验收**

- Redis 延迟/断开不会延长持锁事务。
- 两个 relayer 竞争、lease 过期接管和进程中断时不重复应用，也不会永久丢行。
- fake clock 能稳定验证退避、接管、CAS 失败和最终收敛。

### P0-07 统一本地服务生命周期和关闭流程

**现状证据**

- `apps/server/src/index.ts` 连续调用两次 `app.onBeforeShutdown(...)`。
- 当前 Colyseus `Server.onBeforeShutdown` 是单回调槽，后一次注册会覆盖前一次，因此
  `stopCharacterRepairWorker` 实际可能不执行。
- `startInfraMonitors`、stream depth alert 等启动函数没有统一 stop handle；kick/mailwake 虽有 stop，
  也没有集中纳入默认进程关闭。

**改进**

1. 建立单一 lifecycle registry；每个本地启动组件返回幂等 `dispose()`。
2. Colyseus 只注册一个 shutdown aggregator，按依赖顺序停止接流量、timer/consumer/worker、连接池。
3. aggregator 汇总全部失败，不能因第一个异常跳过后续清理。
4. 启动函数必须可重复调用或明确拒绝重复启动，测试使用 fake timers/handles 证明没有残留任务。

**验收**

- 每个启动组件在正常关闭和启动中途失败时都恰好 dispose 一次。
- 本地测试多次 start/stop 后无残留 timer、consumer 或数据库/Redis handle。
- 关闭错误可诊断，但不会阻止其他组件执行清理。

## 6. P1：把现有 Demo 骨架收敛为可复用框架

### P1-01 引入 App/Session/Scene/Room 状态机

`apps/client/src/Main.ts` 约 400 余行，同时负责启动、HTTP、session 事件、Lobby/Battle ownership、
ballMove ECS、输入、Graphics 和渲染。应把 Main 降为 Cocos 组件壳：

```text
Main(Cocos shell)
  └─ AppController
       ├─ SessionController
       ├─ NavigationController
       └─ RoomController
            └─ GameplayPlugin
```

每层提供显式 `enter/exit/cancel/dispose`，跨层只发送 typed event，不直接修改其他模块的全局状态。
迁移顺序先 session/room，再 gameplay/render；每次迁移保持现有 Demo 可运行。

**完成标准**：新增第二个页面流或玩法插件时不改 Main、通用网络层和现有玩法实现。

### P1-02 分离客户端 GameplayPlugin 与服务端 GameMode

客户端插件建议生命周期：

```text
create → preload → bindRoom → activate → update → suspend → dispose
```

服务端模式建议接口：

```text
validateJoin → createState → acceptInput → tick → finish/buildEvidence → abort
```

把 ballMove 完整迁入第一个实现；通用房间只持有协议、时钟、连接和模式实例。玩法逻辑使用可注入 clock、seed
和 input stream，Creator 渲染只消费 snapshot/event。

**完成标准**：增加一个最小第二模式时，不复制 GameRoom/RoomClient，也不改通用入口。

### P1-03 完整定义 View 生命周期与页面接线规则

现有 `ViewMgr` 已具备 inflight 去重、generation 取消和 onlyOne 基础，不应重写；缺口在页面 handle 复用后的
`setup()` 重复接线和缺少关闭语义。Login/Home/AreaList 等 View 多次 setup 会重复注册监听，晚到异步结果也
缺少一致的 generation guard。

改进：

1. 定义 `onCreate/onOpen/onClose/dispose`，只有 `onCreate` 允许永久接线。
2. `onOpen` 接收本次 presenter/model；`onClose` 取消订阅、请求和 timer。
3. onlyOne 并发 open 复用实例时，不重复绑定按钮。
4. 将 Main 和全部 View 纳入 headless TypeScript 编译；提供最小 FGUI/Cocos test stub。
5. `LoginView.setProgress` 应真实更新 ratio；已生成但没有行为的控件要么实现本地开发语义，要么从必需绑定删除。

**完成标准**：同一页面开关 100 次，按钮每次只触发一个 action，关闭后无监听和晚到回调。

### P1-04 建立完整的 Game HTTP 运行时契约

`apps/shared/src/protocol/http.ts` 只有部分 path 单源；version/clock/notice 仍在 client/server 使用字符串。
客户端 `core/http.ts` 直接把 `JSON.parse` 断言为泛型，开发登录、区服列表和公告响应没有运行时校验。

建议引入 `GameHttpContractMap`，为每个 endpoint 描述 method、path、request、response、auth class 和
runtime validator；client wrapper 与 server route 都从 contract key 派生。外部 WebPlatform 契约只在消费
facade 中暴露本项目所需接口。

**完成标准**：path/method/shape/鉴权分类任一侧漂移时，本地契约测试失败；畸形 2xx 响应不能进入 session。

### P1-05 逐步推进 schema-first 协议生成

目前 interface、Zod、Colyseus Schema、validator 和 handler contract 存在重复；RPC loader 已能检查路由集合，
应在其基础上增量收敛，而不是一次性重写。

优先顺序：

1. HTTP/C2S exact runtime schemas。
2. 由 schema 生成 TypeScript type 和 fixtures。
3. 生成 RPC/HTTP contract map 与 fingerprint 输入。
4. 最后评估 Colyseus state 镜像生成。

**完成标准**：增删字段只改一个真源；额外字段、漏字段和错误枚举均有 fixture 证明会失败。

### P1-06 补齐 FGUI 资源闭包和生命周期验证

现有 codegen 能检查 XML→TS 合约和依赖闭包，但没有证明设计源与发布的 `.bin`/atlas 是同一版本；
`FguiView.ensurePackages` 对缺失依赖只 warning 后继续，也没有卸载/引用计数。

改进：

1. 为源 XML、发布 `.bin`、atlas、生成绑定建立 manifest/hash。
2. 区分 required/optional package；required 缺失必须显示可重试的开发错误。
3. 为共享包与页面包建立引用计数，关闭页面后释放非共享资源和监听。
4. 加入反复进入/退出、资源缺失、加载中关闭、依赖循环/缺失的测试。

**完成标准**：修改 FGUI 源但未重新发布时本地检查失败；页面循环开关后资源计数回到基线。

### P1-07 让 Excel 配置管线真正验证产物新鲜度

当前 `config:excel-to-json:check` 只验证工作簿，仓库中未发现预期的
`apps/server/data/items.config.json` 与 `apps/Cocos/assets/resources/config/items.json`，代码也没有实际消费方。

改进：

1. 把 Excel 解析/归一化/校验/序列化拆成纯函数。
2. 明确配置表是框架正式样例还是研究样例；正式样例必须有双端 loader 和最小消费测试。
3. `--check` 在内存生成并与应入库产物逐字节比较，缺失或过期都失败。
4. shared schema 校验 schemaVersion、content hash、重复 ID、悬空引用和数值范围。
5. 生成操作必须是确定性的，不依赖当前时间、机器路径或不稳定对象顺序。

**完成标准**：修改 Excel 未生成、手改 JSON、漏任一端产物都会被本地检查发现。

### P1-08 收紧服务端输入、配置和任务背压

1. 用统一 schema parser 替换宽松 `parseInt/parseFloat`，拒绝尾随垃圾、NaN、负数和越界组合。
2. `core/compute` 增加队列容量和 admission policy；仅有执行 timeout 不能阻止突发请求无限排队。
3. dispatcher 在 handler 提前完成后清除 timeout timer，并把 cancel/generation 传递到可取消工作。
4. user store 读取数字字段时执行 finite/range/default/migration 校验，不能把 `Number(v)` 的 NaN 传播到领域层。
5. `retryOnContention` 要么只接入已证明幂等且有总预算的事务，要么删除未使用实现和对应文档承诺。

**完成标准**：错误配置在监听端口前失败；任务饱和时快速返回稳定错误；测试结束后没有悬挂 timeout。

### P1-09 明确连接恢复语义并清理无效字段

当前 area 同时保存 `gameHttpUrl`、`gameWsUrl`，SDK 实际从 HTTP URL 派生连接；`listHash` 被保存但没有
用于校验。模糊字段会让后续开发者误以为已有切换/一致性语义。

改进：

1. 对 `gameWsUrl`、`listHash` 做二选一决策：真正纳入连接/版本校验，或从活跃契约删除。
2. 连接恢复后不只恢复 transport，还要按领域逐项 reconcile：session、角色快照、房间状态和输入 desired state。
3. 明确哪些消息可重放、哪些只拉快照，避免把网络重连等同于业务恢复。

**完成标准**：契约中没有“保留但未使用”的核心字段；重连测试验证客户端和服务端状态重新收敛。

### P1-10 提供宿主无关的客户端基础服务

按实际玩法需要逐步提供：

- `InputAction`：触摸、键鼠和测试回放 adapter；不让 Logic 依赖 Cocos 事件。
- `AudioService`：BGM/SFX、音量/静音和资源释放，默认使用本地实现。
- `Localization`：message key、fallback、参数格式化和伪本地化测试。
- `SafeArea`：四边 inset、横竖屏和多分辨率策略；现有实现只有顶部 inset。
- `Clock/Random`：玩法和测试可注入，避免散落 `Date.now/Math.random`。

**完成标准**：Logic 层可在 Node 中测试；替换输入/音频/时钟实现不改页面和玩法规则。

### P1-11 统一本地工具依赖和验证入口

**现状问题**

- root 脚本直接使用 `tsx`/`tsc`，但依赖来自 server workspace hoist，所有权不明确。
- `test:fgui` 实际运行全部客户端测试，命令名容易误导。
- 客户端 test 未纳入严格编译，已经出现旧字段仍能随测试通过的实例。
- `apps/server/loadtest/bot.ts` 只携带 `{v}` 入房，与当前严格 token/sId 鉴权不一致。
- website 有独立 lock/install/test，但 root package inventory 没有明确声明其管理方式。
- Node 只声明 `>=22`，缺少推荐的精确本地 22.x 版本文件。

**改进**

1. 把共享开发工具放到 root devDependencies 或专用 tools workspace，不依赖偶然 hoist。
2. 新增本地 `verify` 聚合命令，串联 typecheck、test、sync/vendor/config checks。
3. 将 `test:fgui` 拆为准确的 `test:client` 和 FGUI 专项入口，测试源码进入 `tsc --noEmit`。
4. 修复 loadtest 的本地开发身份准备和入房参数，或明确移到 experiments；不能保留不可运行脚本。
5. 明确 website 是 root inventory 中的独立 app 还是单独维护目录，并给出唯一的本地安装/验证说明。
6. 提供 `.node-version` 或等价文件，固定推荐的 Node 22.x 开发版本。

**完成标准**：干净 checkout 按 README 的本地命令即可验证；改坏测试类型或 loadtest 参数会立即失败。

### P1-12 隔离实验模块并保持文档与代码一致

`archive` 等模块已有“unsafe/disabled”硬门槛，说明算法还不能作为通用能力。将这类代码统一放入
`experiments/` 或显式实验 workspace，不被默认入口、公共 barrel 和基础文档引用；若保留则必须有最小正确性
测试和清晰限制。

同时建立“能力—代码入口—测试—文档”清单：每个对外宣称的框架能力必须能定位到活跃实现和测试；
每个默认活跃模块也必须在 OVERVIEW/就近 README 中说明。检查只服务于本地一致性，不涉及发布或运行体系。

**完成标准**：默认框架不导出半成品实验能力；文档不描述不存在的功能，活跃代码也不隐藏未声明能力。

## 7. P2：P0/P1 稳定后的增强项

### P2-01 建立可测的性能基线

- 缓存 ECS query/self eid，避免 `getSelfPlayer` 每次扫描。
- 避免 `Main.draw` 每帧 clear 后全量重建 Graphics。
- 为 100/500 entity 的无头模拟记录 tick 时间、临时分配和结果稳定性。
- 先定义可重复的本地预算和基线，再针对数据优化。

### P2-02 风险加权的变异与故障测试

优先针对 effect 原子性、auth contract、C2S parser、View lifecycle、evidence consumer 和 relayer 做少量
mutation/fault samples，证明关键测试能够捕获故意引入的缺陷。目标不是追求全局覆盖率数字，而是保护最危险的
不变量。

### P2-03 Unity 研究 spike

`apps/Unity` 当前只是占位。用最小工程验证 shared 协议/公式和一个 ballMove system 的 C# 等价实现，记录
可共享与不可共享边界；如果不能形成可维护闭环，就明确保留为研究结论，不让占位目录暗示已支持双引擎。

### P2-04 Starter 初始化与示例瘦身

在核心接口稳定后提供幂等 `init:project`：替换项目名、包名、显示名、示例品牌和可选 Demo；初始化后执行
本地 verify。补齐项目 LICENSE、第三方源码/素材来源和生成区说明。

## 8. 建议实施顺序

```text
阶段 A：正确性止血
  P0-01 effect 原子性
  P0-02 客户端竞态
  P0-03 对局状态/C2S

阶段 B：数据链路收敛
  P0-04 角色 ready
  P0-05 match evidence
  P0-06 relayer
  P0-07 lifecycle

阶段 C：稳定框架接缝
  P1-01/P1-02 状态机与玩法接口
  P1-03/P1-06 View 与资源生命周期
  P1-04/P1-05 HTTP 与 schema-first
  P1-07/P1-08 配置、输入与背压

阶段 D：开发体验与增强
  P1-09 至 P1-12
  P2 项目
```

依赖关系：先修数据原子性和状态竞态再抽象玩法；先定义生命周期再做资源释放；
先让当前测试源码被严格检查，再用聚合命令作为后续重构的本地护栏。

## 9. 第一批可直接执行的任务

1. 重写 `APPLY_EFFECT` 为 validate-then-apply 两阶段 Lua，并补恶意输入测试。
2. 为 join 增加 deadline/cancel，建立登录到 Home 的单事务状态机。
3. 增加 reconnect 输入重放和统一 `returnToLogin` 队列测试。
4. 给 GameRoom 全部 C2S 增加 exact runtime schema。
5. 把 Waiting→Playing 初始化与 room lock 收敛为一个可回滚事务。
6. 给 Lobby 建立 character-ready gate，并覆盖空库首登竞态。
7. 为 match evidence 增加 stable match ID、intent 状态和坏数据隔离。
8. 将 relayer 改成“短事务 claim → 事务外 apply → 短事务 CAS”。
9. 建立单一 shutdown aggregator，给所有默认本地组件补 dispose handle。
10. 把 client tests 纳入严格类型检查，修复旧字段测试，并新增准确的 `test:client`/本地 `verify` 入口。

这 10 项完成后再开始 Main/GameMode 抽象，可避免把当前竞态固化成新接口。

## 10. 每个条目的统一完成定义

每个改进项合入前至少满足：

1. 真源、生成镜像、登记表和就近文档一致；不手改生成目录。
2. 新边界有运行时失败测试，竞态有可控 deferred promise/fake clock 测试。
3. 测试验证最终领域状态和不变量，不只验证“调用过某函数”。
4. 所有 timer/listener/room/worker/request 都有 ownership、cancel 和 dispose 语义。
5. 本地 `typecheck`、client/server tests、sync/vendor/config checks 全部通过。
6. 若新增配置、协议或资源产物，必须能由确定性命令重建，并能检查陈旧或缺失。

## 11. 完成后的目标形态

完成 P0/P1 后，项目应表现为一个边界清晰的开发期游戏框架：

- shared 统一描述协议、公式和运行时边界。
- client shell、session、navigation、room、gameplay 和 View 生命周期各自可替换、可取消、可测试。
- server 的房间模式、数据 effect、evidence 和 outbox 在本地故障测试下仍保持不变量。
- FGUI、Excel、镜像和第三方锁定产物都能判断“是否为当前真源生成”。
- 新增玩法主要扩展 GameMode/GameplayPlugin 和登记点，不修改框架接缝。
- 核心框架与额外功能的责任边界清楚，额外功能不会改变核心计划的优先级和完成标准。
