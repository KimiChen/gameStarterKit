# gameStarterKit 开发收口计划

> **本文件是当前开放问题、实施状态与验收证据的唯一真相。** [plan-v2.md](plan-v2.md) 与
> [plan.md](plan.md) 均为历史归档：新结论不得回写其中，也不得从历史完成标记推导本轮状态。
>
> 本轮逐项处理下列问题。每个 `[不阻塞·待补齐]` 或 `[条件阻塞]` 问题必须在独立 commit 中同时完成实现、
> 按风险验证和本条证据回写；代码或门禁问题须有**能失败的**定向测试（补测试时先做变异推演：删掉被守护的
> 生产代码，该用例是否变红），纯文档问题至少通过 inventory 链接检查并人工核对 diff。
> `[不阻塞·有意保留]` 是已经接受的外部前提或范围边界，不属于待开发项。
>
> **阻塞性标签**（每条一个）：
> `[不阻塞·有意保留]` 已评估过的取舍或范围限制，不打算改；
> `[不阻塞·待补齐]` 认可的缺口，补齐前不影响当前限定范围的核心验收；
> `[条件阻塞·<触发条件>]` 平时不阻塞，但触发条件成立前必须处理。
>
> **溯源口径**：本文条目溯源到 `plan-v2.md` 的**小节名**（如「plan-v2 §4 P1-06」），不沿用其行号——
> 归档文件仍会因文档修正而变化。指向仓内源码的 `file:line` 为**写入时快照**，复核时应重新定位。
>
> **计数口径**：每条验收证据中的测试计数为**写入该条时的 HEAD 快照**；同一命令在不同条目出现不同计数时，
> 以最后写入的一条为准。
>
> **上一轮结论**：plan-v2 的 28 条 `[已完成]` 经本轮 6 组并行 + 对抗式独立复核，**全部成立、无一条被证伪**
> （58 条裁决，0 条 claim-false）。本文只承接其中「证据弱于主张」的部分、仍然有效的保留边界，以及本轮
> 新发现的开放项。已闭合内容不再重复登记，需要查证时见 plan-v2 §1–§7。
>
> **无开放项因而不设小节的条目**：P0-01、P0-03（历次复核均无开放项）与 P1-04（schema-first 范围已随
> 本轮 manifest 化全部闭合，无保留边界）。不设小节表示「本轮复核未发现开放项」，不表示未复核。

## 0. 本轮验证基线

在 HEAD `a10f2f7` 实测：`verify:core` 与 `verify:all` 通过；服务端单测 290/290、客户端 245/245、
FGUI 50/50、集成 153/153；故障矩阵 unit 2 组 131/131、integration 4 组 158/158，13 个 fault point
全部实际执行；`verify:inventory` 14 项能力 / 5 个默认入口、`test:inventory` 25/25、`verify:perf` 2 cases、
`typecheck:client:legacy` 0 error；`PROTOCOL_VERSION = 7`。

## 1. 对局证据、重放与存储边界

### 1.1 待补齐

- `[不阻塞·待补齐]` 重放的「死亡即冻结坐标」路径（`core/match/matchReplay.ts:162-170` 的 cast 前
  `resolveBallMovePlayerAtTick`）没有定向用例：现有用例中被 cast 击杀的玩家方向恒为 0，删掉该段不会让任何
  用例变红。该分支一旦损坏，真实对局中「移动中被技能击杀」的证据会在 producer 侧 replay 失败 →
  `emitMatchEvidence` 吞错返回 null → 整局证据静默丢失。补一条用例：目标玩家先发一次非零 Move、推进若干
  tick 后再被致命 cast 击杀，断言 replay 通过且 finalState 中该玩家坐标等于死亡 tick 的解析值。
- `[不阻塞·待补齐]` accepted input 容量 fail-closed 的 **cast 分支**无定向用例：`game-room.test.ts` 是全仓
  唯一的 `maxAcceptedInputs` 覆写用例且只走 Move。删掉 `GameRoom.ts:1607-1610` 的 cast 容量闸、或把它挪到
  `applyBallMoveCast` 之后（会造成「冷却与伤害已生效但输入未入链」的证据不完整），没有任何用例会变红。
  补 cast 版本：`maxAcceptedInputs=1` 先占满，再发第二次合法 cast，断言输入不增长、目标 hp 未变、
  `lastCastTick` 未写入且回 `BadRequest`。
- `[不阻塞·待补齐]` `c6043f0` 收紧的 v2 evidence 接受域（`core/match/matchConsumer.ts:131-136` 的 `-0` 判定、
  `:155` 同名判定、`:196-198` casual/ranked 分支）在 HEAD 已无任何定向用例——原用例随 `47244c2` 删除 v2
  producer 时一并移除。这三处仍可达且有意义（`JSON.parse('{"sId":-0}')` 确实产出 `-0`，而 `-0 !== 0` 为
  false 会让 binding 检查放行并被静默重写成 0 落库）。补 `int/settlement.test.ts` 的 v2 隔离用例；同时评估
  删除 `matchConsumer.ts:157-162` 的数组 accessor descriptor 分支（唯一调用点只处理 `JSON.parse` 产物，
  该分支已不可达）。

### 1.2 保留边界

- `[不阻塞·有意保留]` relayer 的 pending 行选择已不再使用 `FOR UPDATE SKIP LOCKED`（行锁不能跨事务外 I/O）。
  行级排他完全由 `singleton_lease('outbox_relayer')` 的续租守卫提供，重叠窗口内的重复投递由
  `op_id + canonical payload` 幂等收敛。⛔ 因此禁止并行启动第二个 relayer 实例；多 worker claim/分片仍不承诺。
  依据：`core/economy/relayer.ts:129-135`、`core/infra/lease.ts:27-41`；全仓 `skip locked` 零命中。
- `[不阻塞·有意保留]` `archive_zone_usage` 是每区单行 O(1) ledger，freeze 与 thaw/janitor 的删除都在事务
  首句 `FOR UPDATE` 锁住它，freeze 更会把该行锁持有到整份快照 blob 写入提交为止。因此同区内的冷档写路径
  完全串行，开启 `FREEZE_ENABLED` 后用户面 thaw 的残留行删除可能排队等待后台 freeze；这是为让 ledger 与
  authority 同事务收敛而接受的取舍，不承诺分片或按区拆分 ledger。
- `[不阻塞·有意保留]` `match_results.payload` 混存 legacy（仅 sId 规范化、无 shape 校验）、v2（冻结的 8 字段
  旧契约）与 v3（16 字段可重放契约）三种形状，且列内无版本标记（顶层只有 mode/server_id）、无 v2→v3 迁移、
  无统一读取契约；v3 的「输入可重放核对」只对 `schemaVersion=3` 的行成立。接入任何战绩读取方或 verifier 前，
  必须先定义按行分辨版本的读取契约（或补 `schema_version` 列），不得假设 payload 形状一致。
- `[不阻塞·有意保留]` `emitMatchEvidence`（`core/match/matchConsumer.ts:262-284`）把 producer 侧自检失败
  （exact validate / 确定性 replay 不通过 = GameRoom 内部一致性缺陷）与外部 Redis XADD 故障吞进同一个
  catch，均只 `console.error` 并返回 null，运行期不可区分、无独立计数或告警。接入生产观测前须为这两类根因
  拆分稳定原因码与指标，否则「证据静默丢失」只能靠人工翻日志发现。

## 2. 验证基线的外部前提

`verify:core` / `verify:all` 的全部「通过」结果都建立在以下前提之上，这些前提本身不构成通过证据：

- `[不阻塞·有意保留]` 端到端 `smoke` 仍需要外部 WebPlatform 与一个正在运行的游戏服；本轮**未**把它写成
  已通过证据，基线的任何「通过」都不包含 smoke。
- `[不阻塞·有意保留]` 真实 Creator 预览与目标设备性能采样同为人工边界，同样不在任何自动化通过声明内。
- `[不阻塞·有意保留]` 默认进程的真实启动依赖这些本地/外部服务，因此 Node/本地栈测试全绿不等于生产拓扑
  或第三方服务可用性承诺。

## 3. P0 保留问题

### P0-02 玩法规则留白

- `[不阻塞·有意保留]` 对局时长上限属于规则设计决策，被明确排除在内存有界性缺陷之外（accepted input 上限
  已由生产常量 `MAX_ACCEPTED_INPUTS = 16_384` 收口）。此处仅作为规则层留白登记，不是未闭合的 P0 缺陷。

### P0-04 ready marker

- `[不阻塞·有意保留]` `characterRegistrationCheckedAt` 是复核窗口的新鲜度闸门；若被客户端刷新，可能永久走
  ready 快路径、绕过权威复核。**该字段与 `characterRegistration` 已加入 `EFFECT_RESERVED_FIELDS`**
  （plan-v2 §3 P0-04 已闭合），此处只保留语义说明。
- `[不阻塞·有意保留]` ready marker 只在有限复核窗口（默认 24 小时）内作为快路径；窗口过期的热档与全部
  解冻冷档在下次 join 时必打一次 `hasCharacter`。
- `[不阻塞·有意保留]` WebPlatform 不可用时该次 join 被拒（与首次建档失败同码），重试仍会被拒，只留 durable
  repair intent 待外部恢复后收敛。默认窗口下故障期每小时约有 1/24 的回访热档用户受影响；冷档解冻后
  `characterRegistrationCheckedAt` 必为旧值，解冻用户在故障期一律受影响。
- `[不阻塞·有意保留]` `CHARACTER_REGISTRATION_RECHECK_MS` 是模块级常量，只在进程加载时读取；调整需要重启，
  当前没有运行时降级或宽限开关。

### P0-05 生命周期证据

- `[不阻塞·有意保留]` 完整外部 Redis/MySQL/WebPlatform smoke、真实 Creator 预览和目标设备采样不在 Node
  证据内。停服排空证据使用的是裸 `Room` 探针而非真实 `GameRoom`（plan-v2 §3 P0-05 已如实标注）。

## 4. P1 保留问题

### P1-01 多玩法边界

- `[不阻塞·待补齐]` 客户端 C2S allowlist（`apps/client/src/net/RoomClient.ts:1106-1109`）没有能失败的定向
  测试：删除该闸后客户端 245 个用例与服务端双 mode wire 用例全部保持绿。typed room 的 `send` 在编译期已被
  `TOutbound` 约束，因此这条运行时闸真正守护的是 `RoomClient` 上与 mode 无关的公共 send API 与 `as any`
  路径。需补一条 idle slot 下调用 `castSkill()/chat()` 必须返回 false 且不产生 `room.send` 的反例；同时评估
  直接删除这些与 mode 无关的公共方法（仓内已无生产调用方），把发送面完全收进 typed facade。
- `[不阻塞·待补齐]` `GameRoom` 的 player factory 非 Schema 守卫（`apps/server/src/rooms/GameRoom.ts:566-568`）
  只有与 `MapSchema.set` 内建 `assertInstanceType` 结果不可区分的用例：`createModePlayer` 与 `players.set`
  被同一个 try/catch 收敛（`GameRoom.ts:950-958`），删除守卫后底层 `EncodeSchemaError` 会产生同样的
  `BadRequest` 与 `players.size===0`。二选一：拆成两个 catch 并给出可区分诊断再断言；或承认它是
  defense-in-depth 并标注「非 Schema 拒绝由 `@colyseus/schema` 兜底」。同条中「被篡改的公共身份」那一半
  （`:569-572`）是真正变异敏感的，无需补。
- `[不阻塞·有意保留]` `idle` 只是无 presentation 的最小 multi-mode 证明，不代表完整第二玩法 UI 已交付。
- `[不阻塞·有意保留]` 两个 root 仍各自复制 tick/phase/matchId/players 的生命周期字段并共享同一套约定；
  Waiting/Playing/Settle 相位白名单（`GameRoom.ts:743-757`）、两人开局与 `MAX_PLAYERS` 上限
  （`:1089`、`:916`）、以及 initialize/rollback 中的 ballMove 复位分支（`:1254-1280`、`:1309-1341`，
  硬编码 `usesDefaultBallMoveRules === true`）仍是通用 shell 的基线，mode 只能在其后追加 hook，
  不能声明自己的开局人数或相位机。
- `[不阻塞·有意保留]` 真实 Creator 资源导入和目标设备行为仍需编辑器预览。

### P1-02 View/Logic 真实引擎边界

- `[不阻塞·有意保留]` 当前完成的是 Node 可测试边界；真实 Creator 引擎行为仍未验证。
- `[不阻塞·有意保留]` 真实 Creator 输入、资源行为和编辑器生命周期仍由预览确认。

### P1-03 HTTP contract

- `[不阻塞·待补齐]` `http-route-contract.test.ts` 的 uid/amountFen 向量在 request schema 单源化后已退化为
  自洽恒等式（route schema 就是 shared validator 的包装），`assert.equal(Boolean(route.issues), !shared)`
  恒真；uid 1..128、amountFen 1..MAX_SAFE_INTEGER 的绝对接受域不被任何断言钉住，放宽 shared validator
  不会让任何用例变红。向量表改为 `[label, value, expectedAccepted]` 三元组直接断言绝对期望，保留
  `requestSchema` 同一性断言作为注入证据。
- `[不阻塞·待补齐]` `createGameEndpoint` 的类型级 body 禁令（`apps/server/src/http/contract.ts:52` 的
  `body?: never`）没有能失败的证据：唯一反例用 `as never` 绕过类型只测运行时抛错，把 `:52` 改回
  `EndpointOptions` 后 typecheck 与全部服务端单测仍全绿。补一处 `// @ts-expect-error` 编译期反例。
- `[不阻塞·待补齐]` GET 路由不安装 Standard Schema（`contract.ts:277`），其请求侧唯一校验是 `:310` 的
  `validateGameHttpRequest`（对 GET 即 shared 的 `validateNoBody`），但没有任何用例给 GET endpoint 传非空
  body；删掉 `:310` 后 POST/PUT 由注入的 schema 兜住，GET 则静默接受任意 body，无断言会红。
- `[不阻塞·待补齐]` `http-endpoint-manifest.test.ts` 的漏文件反例用默认参数调用 `assertGameHttpRoutes()`，
  作用于仓内真实 `gameRouteDefinitions` 而非 fixture 目录，因此无法证明「旧的已登记 route 集合断言仍会
  误绿」——该对照断言恒绿。要么改成对 fixture 作用域的定义集调用，要么删除该行并同步修正措辞。
  freshness 门禁本身真实且能失败，主结论不受影响。
- `[不阻塞·有意保留]` WebPlatform consumer map 另登记了仓内未调用的 `Livez`/`Readyz` 两个契约
  （属 consumer 子集而非生成全集，不经 `defineGameHttpContract`、不进 `manifest.generated.ts`，当前无
  实际暴露面）。

### P1-05 FairyGUI/Creator 资源验证

- `[不阻塞·有意保留]` FairyGUI 编辑器导出、资源导入和运行时 `autoClearItems` 等行为仍需 Creator 编辑器预览。
- `[不阻塞·有意保留]` Node 门禁只验证资源/生成物闭包与编排契约，不能替代真实引擎和目标设备验证。

### P1-06 任务、存储和冷档边界

- `[不阻塞·有意保留]` freeze worker 默认关闭（`FREEZE_ENABLED`），默认配置下不会触发；启用时必须显式配置
  非空、无重复的 `ARCHIVE_ZONES`。freeze sweep 与 janitor 都只遍历 `ARCHIVE_ZONES`，因此配置清单外的区若
  存在历史 archive 行，只能由该区的 thaw/`ensureLive` 收敛，不会被 janitor 主动扫描。
- `[不阻塞·有意保留]` dispatcher 的 timeout 仍不取消 handler，迟到副作用只能由数据层幂等收敛。

### P1-07 大厅重连

- `[不阻塞·待补齐]` `sessionReconcile.test.ts` 的旧世代竞态用例里 `releasedOwners.has(newOwner)` 是恒真
  断言（`newOwner` 全文无写入方，唯一 ownership 工厂的 `leave` 只写 `oldOwner`），不能守护「旧 continuation
  不得释放新登录 ownership」：把 `SessionReconcileLogic.ts` 的 `finally` 改成调用任何全局 leave，该断言也
  不会变红。应让该用例为新登录世代也构造一个真实可释放的 ownership。
- `[不阻塞·待补齐]` Lobby 宽限窗口的措辞（「只对 SDK 可自动重试的异常关闭码开放 10 秒窗口」，另见
  `docs/CLIENT.md`）应补上实现里的第五个分支：`apps/server/src/websocket/LobbyRoom.ts:97-103` 的
  `isReconnectableDrop` 除四个 SDK 可重试关闭码（1001/1005/1006/4010）外，对 `code === undefined`
  同样 fail-open 开放 10 秒宽限，会多占 10 秒 seat / online registration，且该分支无定向用例。
  要么改措辞为「四个可重试关闭码 + 无关闭码兜底」并补用例，要么收紧为 fail-closed。
- `[不阻塞·有意保留]` Game transport 自动重连只在下一份 mode state 通过 exact 校验后运行 adapter 的可选
  reconcile；当前 ballMove 只对账 desired input，idle 不对账业务状态，两者都不等同于完整业务恢复。
- `[不阻塞·有意保留]` `apps/client/src/net/session.ts` 的角色快照（`commitSessionProfile` /
  `getSessionProfile`）当前只有写入方和测试读取方，生产 View 仍从对账/登录流程的返回值直接取 `IUserView`。
  该快照是为后续统一读源预留的权威槽位，不代表现在已是唯一读源；新增消费方必须改从 `getSessionProfile()`
  读取，而不是再增加一条并行传参链。当前两条链不分叉只是因为 `commitProfile` 返回 false 时登录/对账事务
  整体回滚（隐式耦合，非显式契约）。

### P1-08 本地验证边界

- `[不阻塞·待补齐]` `config:excel-to-json:check` 的「只读、不静默修复产物」性质缺少能失败的用例：canonical
  正例在断言「不改写」时，磁盘内容与 checker 构造的期望内容本就完全相同，恒真；把 check 分支改成「先比较、
  再照写一遍」，五个用例无一变红。需补反例：把产物写成陈旧内容后跑 `--check`，断言退出码非 0 **且**文件
  仍保持陈旧字节。实现本身确实没有写，这是证据缺口而非缺陷。
- `[不阻塞·有意保留]` Excel 生成物新鲜度检查是独立的按需命令，未纳入 `verify:core` 或任何自动门禁；改
  xlsx 后不重新生成即提交陈旧产物不会被自动拦截。该边界与「Excel 示例链尚无运行时消费方、属额外功能」的
  既有取舍一致，接入真实消费方前不打算升级为强制门禁。
- `[不阻塞·有意保留]` 失效的 loadtest、尚无运行时消费方的 Excel 示例链和真实 Creator 预览仍被归为额外或
  人工验证边界。
- `[不阻塞·有意保留]` legacy probe 使用本地引擎声明桩，不能替代真实 Creator 引擎、资源导入、运行时交互和
  目标设备验证。
- `[不阻塞·有意保留]` 客户端 strict 编译探针（`apps/client/tsconfig.test.json`，覆盖 Main、全部 View、
  `pages.ts`/ViewMgr 与客户端 tests）同样只在 Node 最小 cc/FairyGUI 桩下运行，其「通过」只证明
  TypeScript/API 形状，真实 Creator 类型与资源仍需编辑器验证。
- `[不阻塞·有意保留]` `test:int` / `test:faults:int` 依赖本地 Redis/MySQL 与当前 Node/Colyseus 运行时；
  环境中触发的既有 schema decorator 兼容错误按约定记录为环境边界，不得误写成新回归。

### P1-09 登记和文档覆盖

- `[不阻塞·待补齐]` 命令表完整性闸只以根 `package.json.scripts` 为权威集合，其解析正则不匹配
  `npm --workspace ... run ...`，因此 `@game/server` 的 16 个 workspace 脚本无同类机检——根文档实际只登记
  其中 6 条。本轮新增的 `codegen:state` 仅见于 `apps/server/src/rooms/README.md`，未进 `docs/SERVER.md`
  与 `docs/OVERVIEW.md` 的动线。待补齐：(a) 把 `codegen:state` 补入 SERVER.md 与 OVERVIEW 动线，并提示
  新增 http endpoint 需跑 `codegen:http`；(b) 评估是否把 workspace 脚本纳入同一完整性闸，或显式登记为
  有意保留的作用域边界。
- `[不阻塞·有意保留]` inventory 与 Markdown 链接检查只覆盖登记表内文档和就近 README，不扫描任意根目录
  Markdown；`plan-v3.md` 已通过 `routeOfTruth.corePlan`、`plan-v2.md` 与 `todo-godogen.md` 已通过
  `referenceDocs` 纳入检查。本轮由复核者独立对 `git ls-files "*.md"` 全量（52 个 tracked `.md`）做了相对
  链接与标题锚点解析，结果为 0 处破损；但该覆盖面仍无机检，结论不可外推到后续提交。
- `[不阻塞·有意保留]` 组合根发现不构建完整 TypeScript import graph，scene 发现不扫描动态 prefab；
  Markdown 检查只守住登记链接和锚点，不是通用语法解析。

## 5. P2 验证和性能边界

### P2-01 性能基线

- `[不阻塞·有意保留]` 当前基线比较固定输入、渲染命令和 checksum，也记录分配估算。
- `[不阻塞·有意保留]` 计时分布、heap delta、Cocos/GPU 和目标设备性能阈值不构成门禁，真实阈值仍需本地预览
  和目标设备采样。

### P2-02 故障和变异测试

- `[不阻塞·有意保留]` 当前是定向故障/变异矩阵，不是自动源码 mutation，也不是全局覆盖率指标。
- `[不阻塞·有意保留]` 集成组需要本地 Redis/MySQL；WebPlatform 故障使用契约兼容的本地测试替身，不要求
  外部进程在线。

### P2-03 Starter 范围边界

- `[不阻塞·有意保留]` `init:project` 的必选项不包含 Unity、托管、渠道与商业化；这些始终留在额外功能范围，
  不构成 Starter 初始化的完成门槛。

## 6. 额外未实现项

- `[不阻塞·有意保留]` [todo-godogen.md](todo-godogen.md) 中的 T1–T7（三条 P1、四条 P2）仍未完成；它是对
  外部项目的对照吸收计划，不是本仓承诺、不与核心优先级竞争，也不构成核心完成门槛（其自述为「不进入
  `verify:core` 的既有门禁口径」）。机检深度止于「入口存在性 + 登记点 + 链接锚点」，T1–T7 的完成状态不受
  机检约束。
- `[不阻塞·有意保留]` 原列首位的「产物往返自检」已迁入
  [`docs/EXTRAFEATURES.md` §3.10](docs/EXTRAFEATURES.md#310-产物往返自检导出物反序列化校验)，
  当前状态仍为未实现；它用于发现导出过程静默丢内容，现有 manifest/hash 检查不能覆盖这一失败形态。

## 7. 文档自身的问题

- `[不阻塞·待补齐]` 生成物登记点与铁律 2 未随 manifest 化更新：`docs/SERVER.md` §13 仍把
  `apps/shared/src/protocol/state.ts` 记为「Colyseus state 纯数据镜像」的真源（该文件与
  `apps/server/src/rooms/schema/GameRoomState.ts` 首行均已是 room-state-codegen 的 AUTO-GENERATED 标记），
  且全文未出现 `apps/shared/schema/game-room-state.json`、`codegen:state`、`room-state-codegen`；
  HTTP endpoint 登记行仍只写「装配在 `http/index.ts`」，未指向 `manifest.generated.ts`。
  需把 state 真源改为 manifest 并注明生成命令、HTTP endpoint 行补 `manifest.generated.ts` + `codegen:http`。
  ⚠ 该漂移无门禁依据：命令表校验只覆盖根 `package.json` 的 script，workspace 级 `codegen:*` 不在闸内；
  `verify:core` 也不含服务端单测，按旧口径手改生成物后只有 `verify:all` 才会红。
- `[不阻塞·待补齐]` `AGENTS.md`/`CLAUDE.md` 铁律 2「生成镜像禁手改」只列三项 sync 镜像，未列入四项生成物：
  `apps/shared/src/protocol/state.ts` 与 `apps/server/src/rooms/schema/GameRoomState.ts`（真源
  `apps/shared/schema/game-room-state.json`，`npm --workspace @game/server run codegen:state` 刷新）、
  `apps/server/src/http/manifest.generated.ts`（`codegen:http`）、`apps/shared/src/project.ts`（真源
  `project.metadata.json`，`npm run init:project`）。铁律 2 恰是 `verify-inventory.mjs` 的
  `assistantRequirements` 强制要求存在的关键指令之一，但只校验字符串在场、不校验清单完整性。
  待补齐：补列四项与对应重生成命令，并给 assistantRequirements 增加断言 + 反例，使清单完整性与命令表一样
  受机检约束。现有缓和：四个文件首行均带 Do not edit banner，freshness 反例与只读比对会拦住手改——
  这是文档可发现性问题而非防护缺口。
- `[不阻塞·待补齐]` `docs/OVERVIEW.md` §4.2 的结论句「新增玩法通过登记点扩展，不在通用 transport 中增加
  玩法分支」只对客户端成立。服务端新增自带 C2S 输入的玩法，仍必须改通用 `apps/server/src/rooms/GameRoom.ts`
  三处：`GAME_ROOM_C2S_SCHEMAS`（`[K in C2SType]` 映射，漏写 typecheck 失败）、无类型约束的 `messages`
  handler 表（漏写即静默丢消息）、`phaseAllows` switch（default 为 false，漏写即静默拒绝）。`a10f2f7`
  自己加 `c2s.idle.pulse` 时正是这么做的。应在动线图补上「server GameRoom 消息表 / phaseAllows 登记该消息」
  一步并收窄结论句；或把 C2S→mode 的路由改成由 mode 声明其消息集合、由通用 shell 按声明分发。
- `[不阻塞·待补齐]` 历史归档 `plan.md` 的 P1-09 正文仍写着「`plan.md` 是核心优先级真相」，与其文首归档头、
  `docs/inventory.json.routeOfTruth.corePlan` 与 verifier 的硬拒绝互相矛盾；`verify:inventory` 只检查链接和
  锚点，发现不了这类语义冲突。应改为指向本文件，并复查归档内其余「本文件是唯一真相」式表述。
- `[不阻塞·待补齐]` plan-v2 对同一文件/命令给出过两个计数（`relayer-boundary.test.ts` 7 vs HEAD 8；
  `int/archive.test.ts` 44 vs 51；`test:inventory` 20 vs 25）。本文文首已统一计数口径，后续回写须遵守；
  归档中的旧计数不再追改。
