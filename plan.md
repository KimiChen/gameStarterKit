# gameStarterKit 当前代码审阅与改进计划

> 审阅日期：2026-08-27
>
> 代码基线：分支 `new`，HEAD `b5757ad`（在 `09909b2` 之上做全面文档校准；源码改动仅限注释/文案，
> 并删除已被本文件取代的 `todo.md` 与素材进度记录 `pic.md`）；逻辑源码与 `ff5a328` 相同
>
> 文档状态：`plan.md` 已纳入 Git，本文件是核心改进优先级的唯一真相
>
> 评估范围：开发期游戏基础框架的正确性、可测试性、可替换性和本地开发体验
>
> 复核记录：2026-08-27 已完成一轮逐条「文档 vs 代码」一致性核查（服务端/客户端/工具链约 60 条声明），
> 剩余漂移已修；§3 基线数字（服务端 46、客户端侧 91）当日重跑复现

## 1. 计划边界

本计划只给核心框架排优先级。托管、真实支付、渠道、GM、运行辅助、冷档、多区拓扑、Unity、配表和
项目特定业务样例的现状统一记录在 [docs/EXTRAFEATURES.md](docs/EXTRAFEATURES.md)。额外功能不构成
核心完成门槛；但已经进入默认入口的可选代码仍必须可停止、可隔离，不能破坏核心构建和本地调试。

P0 表示继续扩展核心玩法前应先修复的确定性问题；P1 表示把现有 Demo 接缝收敛为可复用框架；P2 表示
在正确性稳定后再做的增强。本文记录的是审阅结论，不表示条目已经实现。

## 2. 总体结论

项目已经具备有价值的框架骨架：shared 单源、两级源码镜像、第三方锁定、客户端 Logic 纯净守门、
GameRoom ownership、Lobby RPC 登记、外部身份 HTTP 边界，以及 lock/fence/UoW/outbox 等服务端原语。
现有本地单元测试整体稳定。

当前最需要解决的不是继续堆功能，而是把几个真实竞态和边界漏洞收口：

1. 登录、Lobby、GameRoom、页面和输入恢复还不是同一个可取消状态机；Lobby join 已能复现端点身份错记。
2. GameRoom 接受未经运行时校验的 C2S，Waiting 历史会污染 Playing，开始事务与房间 lock 不一致。
3. asset effect 可能部分写入，类型只在 TypeScript 层成立，跨区回读也缺少完整谓词。
4. 首角色初始化、默认后台组件和关闭流程没有确定的 ready/dispose 语义。
5. 文档、测试类型检查、FGUI/Excel 产物和工具依赖仍存在“检查通过但真实边界未覆盖”的空洞。

因此，当前代码适合作为受控 Demo 骨架继续演进，但不能把客户端会话状态机、通用玩法层、资产 effect
原子性或完整 View 生命周期描述成已经稳定的框架能力。

## 3. 本轮验证基线

| 验证项 | 结果 | 实际覆盖与限制 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 覆盖 shared/server/client 子集及镜像；客户端 tsconfig 排除 `Main.ts` 与 `view/` 下 9 个文件（含装配件），client tests 不在任何 tsconfig include 内 |
| `npm --workspace @game/server run test` | 46/46 通过 | 服务端单元测试；不等于 Redis/MySQL/WebPlatform 集成链已验证 |
| `npm run test:fgui` | 91/91 通过 | 实际运行 codegen 测试和全部客户端无头测试，命令名已不能准确表达范围 |
| `npm run verify:ecs` | 12/12 通过 | 当前 hash 清单中的 bitECS 文件通过；尚未核对应锁文件集合是否完整 |
| `npm run config:excel-to-json:check` | 通过 | 读取并校验 3 条 item；不会比较缺失或陈旧的生成 JSON |
| `npm --prefix apps/website test` | build 通过，3/3 通过 | 说明站独立安装域；属于额外功能，不阻塞核心 |
| `npm --prefix apps/website run lint` | 通过 | 只覆盖说明站 |
| client tests 严格编译探针 | 失败 | `webSocketClient.test.ts:153` 仍使用旧 `token/isNew`，实际字段为 `accessToken/isNewAccount`；同时暴露 View/FGUI/cc 类型盲区 |

本轮未启动本地 Redis/MySQL 与外部 WebPlatform，因此没有把 `test:int` 或端到端 smoke 写成已通过证据。

## 4. 已具备且应保留的设计

1. `apps/shared` 作为协议、错误码、公式和外部契约生成物的零依赖真源。
2. `shared → client → Cocos` 的按字节同步、孤儿检查、删除保护和 `.meta` 管理。
3. bitECS、Colyseus UMD、FairyGUI runtime 的版本与内容锁定机制。
4. Logic 禁止依赖 `cc`/`fairygui-cc`，客户端禁止导入服务端 Colyseus 的守门测试。
5. `RoomClient` 的 slot/ownership、完整 join-options key 和旧 room 回调身份守卫。
6. `ViewMgr` 已有 registry、动态 import、onlyOne 在途合流、close-during-load 取消和 handle 身份/交互计数基础。
7. Lobby RPC 的文件路由登记、pending 配对、幂等 request ID 和稳定错误码方向。
8. 服务端 strict auth、区号复核、session 栅栏和外部 WebPlatform Internal 响应校验。
9. per-user 串行、lock/fence、UoW、ledger/outbox/applied marker 等一致性原语。
10. Redis durable/cache/coord 语义分层、路由校验、Lua SHA 与 `NOSCRIPT` 恢复。

后续应补齐这些接缝的缺口，而不是建立第二套网络、协议、镜像或页面入口。

## 5. P0：核心正确性

### P0-01 收口客户端会话、连接、导航与输入竞态

**证据**

- `LoginLogic.inflight` 只包住 dev-login HTTP；`setSession → Lobby join → GetInfo → 导航` 位于锁外。
- `RoomClient` 与 `WebSocketClient` 的 `joinOrCreate` 均没有 deadline/cancel，`leave()` 还会先等待在途 join。
- `WebSocketClient.doJoin` 没有冻结本次 `client/endpoint`：join(A) 等待期间 `init(B)`，物理 A 可被记录为 B，
  后续请求错误复用 A；该交错已用探针复现。
- `WebSocketClient.leaving` 是跨 room 的布尔值，leave timeout 成功后也不清 timer。
- authInvalid、battleLost、connLost 和 `Main.abortBattle` 是四套 detached 回登录路径，可能重复弹窗、清理和导航。
- 掉线时 `Main.sendDir` 在记录 desired state 前返回；断线期间松手后重连不会发送 stop，服务端可延续旧方向。

**改进**

1. 建立单一 `SessionTransition`，完整覆盖登录、setSession、Lobby、character ready、首页导航与失败回滚。
2. join 固化 client、endpoint、完整 options 和 generation，增加统一 deadline、取消和迟到结果释放。
3. Lobby 连接也使用 per-slot ownership；leave 的 timer 必须在先完成分支清理，主动离开状态按精确 room 归属。
4. 所有失效事件进入一个可等待、幂等的 `returnToLogin(reason)` 队列，不再使用散落 IIFE。
5. 输入保存 desired direction + monotonic seq/lease；断线仍更新 desired，恢复后先 reconcile 并重放或发送 stop。

**验收**

- join(A) 期间 init(B) 不会错记或复用物理 A；黑洞 join 到期后没有无主连接。
- 任一 await 边界重复点击只产生一个 session、一个 Lobby 和一次最终导航。
- 三类失效事件同时到达只执行一次清理，所有 Promise rejection 都被观察。
- 移动中断线并松手，重连后的第一条有效输入为 stop 或更新后的 desired state。

### P0-02 修复 GameRoom 的运行时边界和状态转换

**证据**

- C2S handler 直接把 wire value 当成 TypeScript 类型；NaN/Infinity、错类型、未知字段和超长内容没有统一拒绝。
- Move 在非 Playing 阶段也能改变方向，update 在 Waiting/Settle 仍推进；Waiting 明确允许技能伤害和死亡。
- 开始比赛只清部分记录，没有统一重置 hp/alive/dir/cooldown/tick；Waiting 历史会进入正式局。
- `lock()` 在 phase 已切 Playing 后 detached 执行，失败只记录日志。
- Waiting 玩家离开时删除 state，却没有同步清 `sessionUserId`；同用户可能无法重新加入仍存活的房间。
- seed 使用 `Date.now() >>> 0`，Waiting join 已消费 RNG，模拟又依赖 wall clock/dt，无法稳定重放。

**改进**

1. 为每个 C2S 建立 exact runtime schema、finite/range/length 校验和每客户端消息预算。
2. 由 phase 明确消息白名单；只有 Playing 接受模拟输入并推进玩法状态。
3. 单一 `startMatch()` 初始化所有状态、fixed-step clock、seed/RNG、死亡序和输入序列。
4. 等待 room lock 成功后再公开 Playing；失败回滚或关闭房间，只有一个可测试终态。
5. 玩家加入/离开同步维护所有双向索引；seed、clock 和 accepted input 可在测试中注入。

**验收**

- 畸形 C2S 不进入玩法逻辑，也不会把 NaN 写入 Schema state。
- Waiting/Settle 输入不改变正式模拟；任意等待历史后开局状态完全一致。
- lock 失败、Waiting 离开再加入和同毫秒建房均有确定结果。
- 相同 seed、初始状态、fixed-step 与 accepted inputs 得到相同输出。

### P0-03 保证 asset effect 原子性与区级数据隔离

**证据**

- `APPLY_EFFECT` 在循环中立即 `HINCRBY/HSET`，applied marker 最后才写；Lua 后续运行时错误不会回滚前面的写。
- unknown kind 被静默跳过，`setField` 可写任意字段，effect 没有版本化运行时 schema。
- 如果非法 effect 已先写入 MySQL ledger/outbox，之后仅让 Redis 失败也不能撤销 durable intent。
- `outbox.readBack(uid,sId,opId)` 查询缺 `server_id` 条件，可把另一区的 operation 结果与本区余额拼接。

**改进**

1. 在写 ledger/outbox 前使用 shared 零依赖 validator 检查 schemaVersion、exact keys、kind、整数范围、
   数量上限与字段 allowlist。
2. Lua 分为完整 validate pass 和 apply pass；禁止修改 uid/serverId/version/fence/applied 等保留字段。
3. unknown kind/version/field 返回稳定领域错误，失败时 Redis 字段和 applied marker 均不变化。
4. 所有区级 MySQL read/write predicate 带 `server_id`，并以跨区同 uid/op fixture 验证。

**验收**

- “第一条合法、第二条非法”时 Redis、applied、ledger/outbox 都没有新增的业务结果。
- 相同 op-id 并发或重试只生效一次；同 ID 不同 payload 可判别冲突。
- s1 的 operation 不能从 s2 查询或影响响应。

### P0-04 明确 Lobby 首角色 ready 契约

**证据**

`LobbyRoom.onJoin` detached 启动 `ensureCharacter`；join 已成功时初始化可能仍在进行或已经失败。
shared 的 `GetInfo` 当前允许 `user: null`，因此代码与客户端需要共同决定：null 是合法 initializing 状态，
还是 Lobby ready 后必须有角色。现有测试大多预建角色或轮询，没有覆盖空库首次 join 后立即 GetInfo。

**改进**

1. 在契约层明确二选一：推荐 Lobby 有 `initializing/ready/failed` gate，依赖角色的 RPC 等待同一个有界 initializer。
2. 若保留 nullable 语义，增加显式 initializing 状态、重试间隔和终止条件，客户端不得把 null 当随机成功。
3. 初始化失败关闭不完整 session 或返回稳定错误；MySQL、Redis live cache 和外部角色登记只暴露一个最终结果。

**验收**

- 空库首登、并发重复 join、外部登记超时、Redis/MySQL 单点故障均有确定结果。
- 客户端不会进入“已登录但角色永久未就绪”的半状态。

### P0-05 统一本地默认进程的生命周期

**证据**

- `src/index.ts` 连续注册两次 `app.onBeforeShutdown`；当前 Colyseus 实现只有单回调槽，后一次覆盖前一次
  ——实际被覆盖丢失的是 `stopCharacterRepairWorker`，停服时 repair worker 没有停止入口。
- 默认启动 loop monitor、stream-depth timer、kick consumer、character repair；Lobby 创建还启动 mail wake。
  多个组件没有统一 stop handle，`StreamConsumer.stop()` 也不等待阻塞 read 完成。
- 因为这些额外样例进入默认进程，它们的残留 handle 会影响核心本地启停，即使其业务完整度不属于核心承诺。

**改进**

1. 建立单一 lifecycle registry；每个默认组件返回幂等、可等待的 `dispose()`。
2. Colyseus 只注册一个 shutdown aggregator，按依赖顺序停止接收、timer/consumer/worker、外部 client、连接池。
3. 启动中途失败也执行已经登记的 cleanup；汇总错误但不跳过后续释放。

**验收**

- 正常关闭、重复关闭和启动半失败时，每个资源恰好释放一次。
- 连续 start/stop 后没有 timer、XREAD、worker、端口或数据库/Redis handle 残留。

## 6. P1：稳定框架接缝

### P1-01 拆分 App/Session/Scene/Room/Gameplay 生命周期

`Main.ts` 约 439 行，同时负责启动、session、导航、Lobby/Battle、ballMove ECS、输入和 Graphics。
建议把 Main 收缩为 Cocos shell，由 `AppController` 组合 `SessionController`、`NavigationController`、
`RoomController` 和 `GameplayPlugin`。所有 transition 返回 Promise/typed outcome，并支持 cancel/dispose。

服务端把 transport/admission/tick/finish 从 GameRoom 拆到 `GameMode`。客户端玩法实例持有精确 room
capability，不通过全局“当前房”发送。`GameECS.addPlayer` 必须对重复 collection key 幂等：当前重复 add
会覆盖 Map 但遗留 bitECS entity，`clear()` 后仍有幽灵实体。

**完成标准**：增加第二个最小游戏模式不改 Main、RoomClient 或通用 loader；重复 add 后 clear 的 world entity 为 0。

### P1-02 补齐 View、Logic 和异步页面生命周期

保留 ViewMgr 现有 registry/onlyOne/close-during-load 基础，补齐：

1. `onCreate/onOpen/onClose/dispose`，永久接线只能执行一次。
2. 每次打开持有 AbortSignal/generation；Area/Notice HTTP、Guild pull 等迟到结果在 close/stop 后不得回调。
3. 场景/root generation 变化时取消旧 pending load；mount 失败时回滚并 dispose 已创建实例。
4. Login/Home/AreaList/Notice 的重复 `setup()` 不得追加相同监听。
5. `LoginView.setProgress` 实际更新 ratio；Login 契约中一批 required 控件当前无任何接线
   （`btn_test`、`btn_clearDataCache`、`btn_account`、`btn_copy`、`btn_ageTip`、`btn_musicon`/`btn_musicoff`、
   `ld3_testAnim`、`txt_privacy`），未使用控件应明确为展示占位或从 required contract 移除。
6. 事件入口必须观察 async 错误，不留下 `void openLogin(...)` 的 unhandled rejection。

**完成标准**：页面开关 100 次只触发一次 action；关闭后 deferred 完成产生 0 次 UI/Logic 回调。

### P1-03 建立完整 wire runtime contract

当前客户端 HTTP 仅检查状态和 JSON 语法，再以 `as T` 信任内容；Lobby reply/push、Game S2C 也直接 cast。
`ApiPath` 只覆盖少量 endpoint，version/clock/notice 等仍散落字符串；URL parser 也不足以证明安全 origin。

建立 `GameHttpContractMap` 与 shared 零依赖 validators，覆盖 method、path、request、response、auth class、
exact keys、枚举、finite number 和 URL/origin。服务端 route 与客户端 wrapper 从 contract key 派生。
外部 WebPlatform 通过 consumer facade 只暴露本项目实际调用的 DevLogin/ListAreas/Verify/Register/Has，
避免生成契约全集被误认为本仓能力。

**完成标准**：畸形 2xx/RPC/S2C、未知字段和非法 endpoint 在状态写入或连接前失败；任一侧 path/shape 漂移本地测试失败。

### P1-04 渐进推进 schema-first 协议

在现有 RPC loader 和协议 fingerprint 上增量收敛 TS interface、runtime validator、Zod、Colyseus Schema
镜像与 fixtures。优先 exact C2S/HTTP/RPC envelope，再生成类型和 contract map，最后评估 state 镜像生成。

同时收紧 `IGameRoomState.phase`、RPC reply 判别联合、ErrorCode→message 的穷尽映射和协议 golden vectors。
协议修改流程要显式运行 `node scripts/protocol-fingerprint.mjs`，不能只改类型后手写版本。

### P1-05 补齐 FairyGUI 结构和资源闭包

当前 codegen 只解析组件 XML 的 displayList 直接命名子项；手写 `getChild`、列表 item 内字段、relation、
controller、loader URL 并未全部进入契约。源 XML 与导出的 `.bin`/atlas 之间也没有 freshness 证明。

1. 把运行时必需的嵌套/list-item/manual binding 纳入递归或显式子契约。
2. 四个 AUTO 区保持 `IMPORT/REQUIRED/FIELD/BIND` 单源。
3. required package 缺失应给出可重试开发错误；load 有 deadline/scene generation。
4. 为 XML、`.bin`、atlas、生成绑定建立 manifest/hash，并按实际需要补 package 引用释放。

**完成标准**：设计源变更未重新导出、嵌套字段改名、加载中关闭或 required 包缺失都被本地检查稳定捕获。

### P1-06 收紧服务端配置、任务和存储防腐层

1. 用完整数字 parser 替换宽松 `parseInt/parseFloat`，拒绝尾随垃圾、NaN、负值和越界组合。
2. compute pool 增加队列容量、admission policy 和稳定 overload 错误；当前 runtime 仅有 battleSim/test，
   不把周期批任务混入请求池。
3. dispatcher 成功时清理/unref timeout；明确 timeout 不会取消 handler，并让幂等 pending lease 显著覆盖
   最大执行窗口，或引入 owner token/cancellation，避免迟到写与立即重试并发。
4. Redis/MySQL 数字读取统一做 finite/integer/range/schema 校验，坏值不能以 NaN 进入领域和协议。
5. Zod object 对需要 exact 的边界使用 strict 语义；unknown message 也先经过有界限流。

### P1-07 收敛区目录和跨端确定性语义

- `openAreaList` 刷新到的新目录只进入 `AreaListLogic.data`，不回写 `serverSession`；后者是三个分步写入的
  模块变量，新选择会与旧 `isOps/hash/servers` 混用。成功刷新应原子替换 list/hash/selection，失败保持完整
  旧快照。
- `gameWsUrl` 被保存但 Colyseus 实际消费 `gameHttpUrl`，`listHash` 未用于一致性判断；通过 consumer facade
  明确消费或删除死字段，不能让字段名暗示不存在的语义。
- shared `logic/time.ts` 使用宿主本地时区计算自然日；改为显式 reset offset/timezone 或 UTC+配置偏移，
  增加跨 TZ golden tests。
- 连接恢复后按 session、角色快照、房间和 desired input 分层 reconcile，不把 transport reconnect 等同于业务恢复。

### P1-08 闭合本地验证与依赖锁

1. 增加独立 client-test tsconfig（Node 22 lib + 最小 cc/FGUI stubs），修复旧字段并编译 Main/View/tests。
2. 将 `test:fgui` 拆成准确的 `test:client` 与 FGUI 专项命令；新增分层 `verify:core`/`verify:all`。
3. root 显式拥有 `tsx/tsc` 等脚本依赖，不依赖 server workspace 偶然 hoist；固定推荐 Node 22.x 文件。
4. bitECS/vendor lock 校验“实际文件集合 = 应锁集合”，并校验 vendored WebPlatform tgz 自身 integrity。
5. `dev-stack.sh` 通过 PID/实例标识/数据目录确认所有权，不能对同端口任意 Redis/MySQL 发 shutdown；
   `smoke.ts` 不对共享实例无条件 `SCRIPT FLUSH`。
6. 当前失效的 loadtest 与未闭合的 Excel 生成链继续归额外功能；只有完成身份准备、consumer 和产物 freshness
   后才可提升为核心验证入口。

### P1-09 建立能力—代码—测试—文档清单

每个核心能力必须能定位到活跃入口、真源、运行时边界和测试；每个默认活跃模块也必须在 OVERVIEW/就近
README 标明。`plan.md` 是核心优先级真相，`docs/EXTRAFEATURES.md` 是额外能力真相，不再维护第二套路线图。

本轮审阅已经同步修正 AGENTS/CLAUDE、CLIENT/SERVER/WEBPLATFORM、第三方依赖域、说明站能力文案和
失效链接。剩余工作是把这些人工结论固化为可检查的 inventory：至少登记能力归类、默认入口、真源、
wire/runtime 边界、验证命令和权威文档，并检查默认活跃模块未漏记、命令/链接仍存在、两份助手指令一致，
以及核心计划与额外功能没有重新分叉。根 LICENSE 缺失作为项目元数据问题保留在 P2-03。

## 7. P2：正确性稳定后的增强

### P2-01 建立可重复的性能基线

bitECS 本身已缓存 query；真正需要测的是每帧 terms/hash/commit、self entity 查找、临时数组，以及
`Main.draw()` 的 clear+全量 Graphics 重建。以 100/500 entity 的固定 seed/input 基准记录 tick、分配和渲染
成本，再决定缓存 snapshot、增量绘制或替换 renderer。

### P2-02 风险加权的故障与变异测试

优先保护 session transition、C2S parser、effect 原子性、View close/deferred、character ready 和 lifecycle。
用 deferred promise、fake clock、worker crash、Redis/MySQL fault points 证明测试能抓住不变量破坏，而不是追求
全局覆盖率数字。

### P2-03 Starter 初始化与项目元数据

核心接口稳定后再提供幂等 `init:project`，替换项目名、包名、显示名和 Demo 品牌，并执行 core verify。
同时补齐项目自身 LICENSE、生成区标识和第三方素材来源。Unity、托管、渠道与商业化不进入该命令的必选项。

## 8. 建议实施顺序

```text
阶段 A：正确性止血
  P0-01 客户端会话/连接
  P0-02 GameRoom 边界/状态
  P0-03 effect/区隔离
  P0-04 character ready
  P0-05 默认生命周期

阶段 B：稳定框架接缝
  P1-01/P1-02 App、玩法与 View 生命周期
  P1-03/P1-04 wire contract 与 schema-first
  P1-05/P1-06 FGUI、配置、任务与存储防腐

阶段 C：开发体验收口
  P1-07 区目录与确定性
  P1-08 验证与锁定
  P1-09 文档真相
  P2 增强项
```

依赖原则：先修竞态和数据原子性，再抽象状态机/玩法接口；先定义生命周期，再做资源释放；先让测试源码
进入严格类型检查，再把聚合 verify 当作重构护栏。

## 9. 第一批可直接执行的任务

1. 增加 `WebSocketClient` join(A)→init(B) 回归测试，按 RoomClient slot 模式修复身份冻结。
2. 为两类 join 增加 deadline/cancel，并覆盖黑洞连接和迟到成功释放。
3. 把登录至 Home 与三类失效事件收敛成单一 transition 测试。
4. 增加掉线期间松手→重连 stop/desired replay 测试。
5. 给 GameRoom C2S 增加 exact validator、phase gate 和 Waiting→Playing 全量初始化。
6. 重写 effect 为 validate-then-apply，并在 durable intent 前校验；补跨区 readBack 测试。
7. 明确 Lobby ready/null 契约并覆盖空库首次 GetInfo。
8. 建立一个 shutdown aggregator，为默认启动组件补可等待 dispose。
9. 新增 client-test tsconfig，修复旧登录字段并把 Main/View 纳入最小类型桩。
10. 修复 View 重复 setup、Guild stop 后迟到 callback 和 GameECS duplicate-add 幽灵实体。

## 10. 统一完成定义

每个核心条目合入前至少满足：

1. 真源、生成镜像、登记表和就近文档一致，不手改生成目录。
2. 外部/wire 边界有 malformed、extra-key、NaN、timeout 和过大输入测试。
3. 竞态由 deferred promise/fake clock 稳定复现，并断言最终领域状态而非仅调用次数。
4. timer/listener/room/worker/request 都有明确 ownership、cancel 和 dispose 语义。
5. `typecheck`、client/server tests、sync/vendor/config checks 按变更范围通过。
6. 新增生成物能确定性重建，并能检查缺失、陈旧和集合漂移。
7. 若功能属于额外范围，不把其完整度升级为核心验收项；若进入默认入口，只验失败隔离和生命周期。

## 11. 目标形态

完成 P0/P1 后，项目应表现为一个边界清晰的开发期游戏框架：

- shared 同时描述静态类型和关键 wire runtime 边界；
- client shell、session、navigation、room、gameplay 与 View 生命周期可取消、可替换、可无头测试；
- GameRoom 和数据原语在坏输入、并发与故障测试下保持明确不变量；
- FGUI、镜像与锁定依赖能判断“是否来自当前真源”；
- 新增玩法主要扩展 GameMode/GameplayPlugin 和登记点，不修改通用接缝；
- 核心计划与额外功能各有唯一文档，不再互相制造隐含承诺。
