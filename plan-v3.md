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
> `[已完成]` 已有仓内实现、能失败的定向测试和本条验收证据；
> `[条件阻塞·<触发条件>]` 平时不阻塞，但触发条件成立前必须处理。
>
> **溯源口径**：本文条目溯源到 `plan-v2.md` 的**小节名**（如「plan-v2 §4 P1-06」），不沿用其行号——
> 归档文件仍会因文档修正而变化。指向仓内源码的 `file:line` 为**写入时快照**，复核时应重新定位。
>
> **计数口径**：每条验收证据中的测试计数为**写入该条时的 HEAD 快照**；同一命令在不同条目出现不同计数时，
> 以最后写入的一条为准。
>
> **前次回写快照**（`8a76d29`，全部当时的 `[已完成]` 条目落盘后同一工作树实测）：`verify:core`、`verify:all`、`typecheck`、
> `verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、客户端 246/246、`test:fgui` 50/50、
> `test:int` 154/154、`test:inventory` 33/33、`test:faults:int` 四组 72/61/12/15 全绿。
>
> **上一轮回写快照**（§8 审计登记的 6 条逐条独立收口后同一工作树实测）：`verify:core`、`verify:all`、
> `typecheck`、`verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、客户端 **248/248**、
> `test:fgui` 50/50、`test:int` 154/154、`test:inventory` **40/40**、`test:faults:int` 四组
> 72/**63**/12/15 全绿。
>
> **上一轮回写快照**（§9 十条逐条收口后同一工作树实测）：`verify:core`、`verify:all`、`typecheck`、
> `verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、客户端 **254/254**、`test:fgui` 50/50、
> `test:int` 154/154、`test:inventory` **60/60**、`test:faults:int` 四组 72/**67**/12/15 全绿。
>
> **上一轮回写快照**（§11 五条门禁缺陷收口后同一工作树实测）：`verify:core`、`verify:all`、`typecheck`、
> `verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、客户端 254/254、`test:fgui` 50/50、
> `test:int` 154/154、`test:inventory` **68/68**、`test:faults:int` 四组 72/67/12/15 全绿。
>
> **上一轮回写快照**（§13 两条门禁缺陷收口后同一工作树实测）：`verify:core`、`verify:all`、`typecheck`、
> `verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、客户端 254/254、`test:fgui` 50/50、
> `test:int` 154/154、`test:inventory` **80/80**、`test:faults:int` 四组 72/67/12/15 全绿。
>
> **上一轮回写快照**（§15 一条门禁缺陷收口后同一工作树实测）：`verify:core`、`verify:all`、`typecheck`、
> `verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、客户端 254/254、`test:fgui` 50/50、
> `test:int` 154/154、`test:inventory` **86/86**、`test:faults:int` 四组 72/67/12/15 全绿。
>
> **上一轮回写快照**（§17 矩阵工具化 + 白名单修复后同一工作树实测）：`verify:core`、`verify:all`、
> `typecheck`、`verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、客户端 254/254、
> `test:fgui` 50/50、`test:int` 154/154、`test:inventory` **94/94**、新增
> `test:launcher-matrix` **3/3（70 种形态零背离）**、`test:faults:int` 四组 72/67/12/15 全绿。
>
> **上一轮回写快照**（§18 第二张矩阵 + 后缀 workspace 修复后同一工作树实测）：`verify:core`、
> `verify:all`、`typecheck`、`verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、
> 客户端 254/254、`test:fgui` 50/50、`test:int` 154/154、`test:inventory` 94/94、
> `test:launcher-matrix` 3/3（70 形态零背离）、新增 `test:npm-reference-matrix`
> **2/2（15 形态零背离）**、`test:faults:int` 四组 72/67/12/15 全绿。
>
> **上一轮回写快照**（§19 第三、四张矩阵落地后同一工作树实测）：`verify:core`、`verify:all`、
> `typecheck`、`verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、客户端 254/254、
> `test:fgui` 50/50、`test:int` 154/154、`test:inventory` 94/94；四张矩阵
> `test:launcher-matrix` 3/3、`test:npm-reference-matrix` 2/2、新增
> `test:aggregate-chain-matrix` **4/4**、`test:sync-mirror-matrix` **3/3（13 场景）**；
> `test:faults:int` 四组 72/67/12/15 全绿。
>
> **上一轮回写快照**（§20 第五张矩阵落地、且把本机 `@types/node` 复原到 22.20.1 之后实测）：
> `verify:core`、`verify:all`、`typecheck`、`verify:sync`、`verify:inventory` 全绿；
> 服务端单测 297/297、客户端 254/254、`test:fgui` 50/50、`test:int` 154/154、
> `test:inventory` 94/94；五张矩阵 3/3、2/2、4/4、3/3、**3/3**；
> `test:faults:int` 四组 72/67/12/15 全绿。
>
> **上一轮回写快照**（§22 四条修复落地后同一工作树实测）：`verify:core`、`verify:all`、
> `typecheck` 全绿；服务端单测 297/297、客户端 258/258、`test:int` 154/154、
> `test:inventory` 95/95；五张矩阵 3/3（**75 形态**）、2/2、4/4、3/3（**9 场景**）、3/3；
> `test:faults:int` 四组 72/67/12/15 全绿。
>
> **上一轮回写快照**（§24 承重钉推广到四条链后同一工作树实测）：`verify:core`、`verify:all`、
> `typecheck` 全绿；服务端单测 297/297、客户端 258/258、`test:int` 154/154、
> `test:inventory` **96/96**；五张矩阵 3/3、2/2、4/4、3/3、3/3；
> `test:faults:int` 四组 72/67/12/15 全绿。
>
> **上一轮回写快照**（§26 三条修复落地后同一工作树串行实测）：`verify:core`、`verify:all`、
> `typecheck` 全绿；服务端单测 297/297、客户端 **261/261**、`test:int` 154/154、
> `test:inventory` 96/96；五张矩阵 3/3、2/2、**5/5**、**4/4**、3/3；
> `test:faults:int` 四组 72/67/12/15 全绿。
>
> **本轮回写快照**（§28 两条边界关闭后同一工作树串行实测）：`verify:core`、`verify:all`、
> `typecheck` 全绿；服务端单测 297/297、客户端 **262/262**、`test:int` 154/154、
> `test:inventory` 96/96；五张矩阵 3/3、2/2、5/5、4/4、3/3；
> `test:faults:int` 四组 72/67/12/15 全绿。
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

- `[已完成]` 重放的「死亡即冻结坐标」路径（`core/match/matchReplay.ts:162-170` 的 cast 前
  `resolveBallMovePlayerAtTick`）没有定向用例：现有用例中被 cast 击杀的玩家方向恒为 0，删掉该段不会让任何
  用例变红。该分支一旦损坏，真实对局中「移动中被技能击杀」的证据会在 producer 侧 replay 失败 →
  `emitMatchEvidence` 吞错返回 null → 整局证据静默丢失。补一条用例：目标玩家先发一次非零 Move、推进若干
  tick 后再被致命 cast 击杀，断言 replay 通过且 finalState 中该玩家坐标等于死亡 tick 的解析值。
  **已补齐**：`apps/server/test/match-replay.test.ts` 新增 `makeLethalCastEvidence()` 与用例
  `v3 replay freezes a moving victim at the tick the lethal cast lands`——目标先发一次 `dirX=-1` 的非零 Move，
  两发不致命旋风斩后由第三发击杀；期望坐标以「锚点 + 方向 × `PLAYER_MOVE_SPEED` × 时长」独立算出，并先断言
  它落在地图内部（非 clamp 边界）且 ≠ 锚点，避免恒真。变异推演：删掉 `matchReplay.ts` cast 前的
  `resolveBallMovePlayerAtTick` 整段 → 该用例变红（`MatchReplayError code=FINAL_STATE`，7 例中仅此 1 例红）。
- `[已完成]` accepted input 容量 fail-closed 的 **cast 分支**无定向用例：`game-room.test.ts` 是全仓
  唯一的 `maxAcceptedInputs` 覆写用例且只走 Move。删掉 `GameRoom.ts:1607-1610` 的 cast 容量闸、或把它挪到
  `applyBallMoveCast` 之后（会造成「冷却与伤害已生效但输入未入链」的证据不完整），没有任何用例会变红。
  补 cast 版本：`maxAcceptedInputs=1` 先占满，再发第二次合法 cast，断言输入不增长、目标 hp 未变、
  `lastCastTick` 未写入且回 `BadRequest`。
  **已补齐**：`apps/server/test/game-room.test.ts` 新增
  `cast 达到 accepted input 上限时在冷却与伤害之前 fail-closed`——`maxAcceptedInputs=1` 由 a 占满（并断言其
  确实落伤害、写冷却），再由**从未施法**的 b 发第二次全合法 cast，使容量闸成为唯一可能的拒绝理由。变异推演
  两种，均变红：删除容量闸；把容量闸挪到 `applyBallMoveCast` 之后（被 a 的 hp 与 b 的 `lastCastTick` 断言
  抓住，证明断言非恒真）。
- `[已完成]` `c6043f0` 收紧的 v2 evidence 接受域（`core/match/matchConsumer.ts:131-136` 的 `-0` 判定、
  `:155` 同名判定、`:196-198` casual/ranked 分支）在 HEAD 已无任何定向用例——原用例随 `47244c2` 删除 v2
  producer 时一并移除。这三处仍可达且有意义（`JSON.parse('{"sId":-0}')` 确实产出 `-0`，而 `-0 !== 0` 为
  false 会让 binding 检查放行并被静默重写成 0 落库）。补 `int/settlement.test.ts` 的 v2 隔离用例；同时评估
  删除 `matchConsumer.ts:157-162` 的数组 accessor descriptor 分支（唯一调用点只处理 `JSON.parse` 产物，
  该分支已不可达）。
  **已补齐**：`apps/server/test/int/settlement.test.ts` 新增
  `v2 接受域：payload 负零与 casual/ranked loadout 违规一律隔离且不落库`，直接 XADD 四条到 `stream:match:v2`：
  `"sId":-0`（`JSON.stringify` 永远写出 `0`，故靠替换原始字节注入，并先断言 `Object.is(JSON.parse(...).sId, -0)`
  防夹具失效）、casual + `loadout:{}`、ranked + `loadout:{"roll":-0}`，以及对照组 ranked + `loadout:{"roll":0}`
  正常落 `match_results`——对照组与负零组逐字节只差一个负号，因此三条拒绝的唯一可能原因就是被收紧的接受域。
  变异推演三处均变红：去掉 `evidenceInt` 的 `!Object.is(value,-0)`；把 `isCanonicalJsonValue` 的 number 分支
  退化为只 `Number.isFinite`；塌缩 casual/ranked 三元分支。
  数组 accessor descriptor 分支的评估结论是**保留而非删除**：该分支确实不可达（实测 `JSON.parse` 产物的自有
  属性恒为 enumerable 数据属性），但要删它必须改成 `value[index]` 直取，会把一个**不触发 getter** 的审计
  校验器变成会执行任意 getter 的校验器，与本仓其它 validator（`matchEvidence` 的 `DATA_PROPERTY`、wire
  validator 的 hostile getter 用例）姿态相悖；且对象分支同构，只删一半会造成不一致。已在 `matchConsumer.ts`
  的 `isCanonicalJsonValue` 上方就地注释标注「当前不可达、无可失败用例、不得改写成直取」及其理由。

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

- `[已完成]` 客户端 C2S allowlist（`apps/client/src/net/RoomClient.ts:1106-1109`）没有能失败的定向
  测试：删除该闸后客户端 245 个用例与服务端双 mode wire 用例全部保持绿。typed room 的 `send` 在编译期已被
  `TOutbound` 约束，因此这条运行时闸真正守护的是 `RoomClient` 上与 mode 无关的公共 send API 与 `as any`
  路径。
  **已补齐**：`apps/client/test/wireTransport.test.ts` 在 idle slot 下验证 `ping()/castSkill()/chat()` 被
  allowlist 拒绝且不产生 `room.send`，并对内部 `sendFromSlot` 的拒绝结果断言为 `false`。变异推演：删除
  `RoomClient` 的 allowlist 闸 → 客户端 246 例中仅该例变红（**245 pass / 1 fail**，与本条原记录「删闸后
  245 例全绿」精确吻合）。
  「直接删除与 mode 无关的公共方法」一项评估后**保留**：生产唯一调用点 `BallMoveGameplay.ts:260` 的
  `context.room.ping()` 走的是 `net/rooms/BallMoveRoom.ts` typed facade（`room.send(C2S.Ping, …)`），并非
  `RoomClient.ping()`；但删除这些方法会迫使重写不在本条范围内的 `roomClientOwnership.test.ts` 写屏障用例，
  故选择「保留 + 补反例」把发送面的运行时闸钉死。
- `[已完成]` **公共 API 返回值契约未兑现**：本文此前要求 idle slot 下
  `RoomClient.castSkill()/chat()` 返回 `false`，但当前实现（`apps/client/src/net/RoomClient.ts:1081-1088`）
  将两者声明为 `void`，调用结果实际为 `undefined`。现有
  `apps/client/test/wireTransport.test.ts:197-200` 只断言没有 `room.send`，`false` 的断言在
  `:207-210` 针对的是私有 `sendFromSlot`，不能证明公共方法契约。需在「返回值是契约」与「fire-and-forget、只
  要拒绝且不发包」之间作出明确选择；前者应把公共方法改为返回 `boolean` 并补直接断言，后者则应删去计划中
  的 `返回 false` 主张并将该条收窄为「被拒且不产生 `room.send`」。
  **已补齐**：选了「返回值是契约」。理由是该发送面其余出口本来就是 boolean 且返回值被真实消费——
  `RoomClient.ts:74` 的 `TypedGameRoom.send` 声明 `: boolean`，`net/rooms/GameRoomTransport.ts:101` 用
  `if (room.send(C2S.Move, …))` 闸住 seq 记账；收窄措辞等于承认同一发送面上有两套语义，并让验收对象长期停在
  可随时重命名的私有 `sendFromSlot` 上。`ping()/castSkill()/chat()` 改为 `: boolean` 并 `return
  this.sendCurrent(...)`，闸本身一行未动；`wireTransport.test.ts` 把语句位调用换成对**公共方法**的直接断言。
  同时在 `roomClientOwnership.test.ts` 的 state 屏障用例补上**两极**断言（屏障前恒 `false`、放开后恒 `true`）
  ——只断 false 的话，一个恒返回 false 的退化实现也能全绿。
  变异推演两条，各只杀一例：`ping()` 保留 `: boolean` 但改成「调用后 `return true`」（仍不发包）→
  `wireTransport.test.ts` 8 例中 1 例红；`sendCurrent` 仍转调 `sendFromSlot` 但恒 `return false` →
  `roomClientOwnership.test.ts` 37 例中 1 例红。两条互不搭便车，分别钉住「返回值反映闸门结果」的两个方向。
  `npm run sync:client` 已刷新 `apps/Cocos/assets/src` 镜像；`typecheck:client`、`typecheck:client:legacy`
  各 0 error，`test:client` 246/246，`verify:sync` 镜像一致。
  **再审计保留项（HEAD `54e1941`）**：测试只覆盖本地 slot/state 闸；SDK 在 closed socket 上会静默入队并
  返回，不会同步 throw，故 `sendC2S()` 仍可能对“未实际发送”的消息返回 `true`。若 boolean 语义是
  “已通过本地闸并调用 SDK”可收窄主张，否则需补 closed-socket 反例并修正实现。详见 §9.3。
- `[已完成]` `GameRoom` 的 player factory 非 Schema 守卫（`apps/server/src/rooms/GameRoom.ts:566-568`）
  只有与 `MapSchema.set` 内建 `assertInstanceType` 结果不可区分的用例：`createModePlayer` 与 `players.set`
  被同一个 try/catch 收敛（`GameRoom.ts:950-958`），删除守卫后底层 `EncodeSchemaError` 会产生同样的
  `BadRequest` 与 `players.size===0`。二选一：拆成两个 catch 并给出可区分诊断再断言；或承认它是
  defense-in-depth 并标注「非 Schema 拒绝由 `@colyseus/schema` 兜底」。同条中「被篡改的公共身份」那一半
  （`:569-572`）是真正变异敏感的，无需补。
  **已补齐**：选了拆分路径。`GameRoom.ts` 把 `createModePlayer` 与 `players.set` 拆成两个 try/catch，统一走新的
  `refuseModePlayer(client, mode, reason, error)`（回滚 player 槽位 + 释放 mode 入场资源 + 按 reason 告警 +
  返回同一个 `BadRequest`），新增导出常量 `MODE_PLAYER_FACTORY_REASON` / `MODE_PLAYER_REGISTER_REASON`。
  对外错误语义完全不变（仍是 `joinRefused(ErrorCode.BadRequest)`、`players.size === 0`、admission 已释放），
  只有内部日志的 `reason=` 变得可区分。`apps/server/test/idle-game-mode.test.ts` 新增
  `player factory 守卫与 schema 注册兜底必须给出可区分的入座诊断`：用例一 `createPlayer` 返回普通对象 →
  `reason=mode-player-factory`；用例二返回合法 Schema 但非本 root childType 的 `PlayerState` → 由
  `MapSchema.set` 的 `assertInstanceType` 兜底 → `reason=mode-player-register`。变异推演两种均变红：
  删除 `instanceof Schema` 守卫（普通对象改由库兜底，reason 塌缩成 `register`）；把两个 catch 合并回单一
  catch（register 用例得到 `factory`）。
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

- `[已完成]` `http-route-contract.test.ts` 的 uid/amountFen 向量在 request schema 单源化后已退化为
  自洽恒等式（route schema 就是 shared validator 的包装），`assert.equal(Boolean(route.issues), !shared)`
  恒真；uid 1..128、amountFen 1..MAX_SAFE_INTEGER 的绝对接受域不被任何断言钉住，放宽 shared validator
  不会让任何用例变红。向量表改为 `[label, value, expectedAccepted]` 三元组直接断言绝对期望，保留
  `requestSchema` 同一性断言作为注入证据。
  **已补齐**：向量表改为 `[label, value, expectedAccepted]` 三元组，新助手 `assertRequestDomain` 对每条**同时**
  断言 route schema 结果与 shared validator 结果等于写死的期望（不再互相推导），`requestSchema` 同一性断言
  保留为注入证据。uid：1 收 / 128 收 / 129 拒 / 空串拒 / 非字符串拒；amountFen：1 收 / `MAX_SAFE_INTEGER` 收 /
  0 拒 / 1.5 拒 / `MAX_SAFE_INTEGER+1` 拒 / Infinity 拒。变异推演两处均变红：把 shared `boundedString` 的 uid
  上界 128 放宽到 1024；把 `finiteInteger` 的 amountFen 下界 1 放宽到 0。
- `[已完成]` `createGameEndpoint` 的类型级 body 禁令（`apps/server/src/http/contract.ts:52` 的
  `body?: never`）没有能失败的证据：唯一反例用 `as never` 绕过类型只测运行时抛错，把 `:52` 改回
  `EndpointOptions` 后 typecheck 与全部服务端单测仍全绿。补一处 `// @ts-expect-error` 编译期反例。
  **已补齐**：`http-response-contract.test.ts` 新增 `HTTP endpoint 类型级禁止 endpoint options 另带 body schema`，
  在 options 字面量的 `body:` **属性行**（不是实参行——放实参行会同时触发 `TS2578` 与 `TS2322`）加
  `// @ts-expect-error`，原 `as never` 运行时反例保留。变异推演：把 `contract.ts:52` 改回
  `type GameEndpointOptions = EndpointOptions;` → 服务端 typecheck 变红，且**唯一**错误就是
  `TS2578: Unused '@ts-expect-error' directive`，说明证据精确锚定在该类型上。
- `[已完成]` GET 路由不安装 Standard Schema（`contract.ts:277`），其请求侧唯一校验是 `:310` 的
  `validateGameHttpRequest`（对 GET 即 shared 的 `validateNoBody`），但没有任何用例给 GET endpoint 传非空
  body；删掉 `:310` 后 POST/PUT 由注入的 schema 兜住，GET 则静默接受任意 body，无断言会红。
  **已补齐**：新增 `HTTP endpoint 对 GET 也执行 shared 请求契约：非空 body 必须在 handler 前被拒`——对 `Health`
  （GET）先断言 `endpoint.options.body === undefined`（确认确实没装 Standard Schema），再以
  `endpoint({ body: { x: 1 } })` 断言 rejects `/WIRE_KEYS at request/` 且 handler 未被调用，正例 `endpoint({})`
  仍通过。变异推演：删掉 `contract.ts:310` 的 `validateGameHttpRequest` 调用 → 该用例变红，且同文件其余 9 例
  仍全绿，证明这确是此前唯一缺口。
- `[已完成]` `http-endpoint-manifest.test.ts` 的漏文件反例用默认参数调用 `assertGameHttpRoutes()`，
  作用于仓内真实 `gameRouteDefinitions` 而非 fixture 目录，因此无法证明「旧的已登记 route 集合断言仍会
  误绿」——该对照断言恒绿。要么改成对 fixture 作用域的定义集调用，要么删除该行并同步修正措辞。
  freshness 门禁本身真实且能失败，主结论不受影响。
  **已补齐**：查证后发现 (a)「改成对 fixture 作用域调用」在**漏文件**场景上无法成立——`assertGameHttpRoutes` 的
  key 集合固定对齐整张 `GameHttpContractMap`，缺 key 必抛，该场景本就不存在误绿。因此拆成两个用例：新增
  `file discovery catches an endpoint file move that the registered-route set cannot see`（fixture 覆盖全部 6 个
  contractKey，把 `misc/Version.ts` 搬到 `deploy/Version.ts`，key 与 method/path 均不变、只有路径漂移），对照
  断言改为对 **fixture 作用域**的定义集调用并补 `assert.throws(/route key 不一致：缺少=\[Version\]/)` 证明其
  有判别力而非恒绿，freshness 则断言 `/manifest 缺失或陈旧.*Version:deploy\/Version\.ts/`；原「漏文件」用例
  按 (b) 删掉那行恒绿对照、改名为 `manifest freshness catches a newly added endpoint file` 并删除误导性注释。
  变异推演：让 `tools/http-endpoint-manifest.ts` 的比较忽略 `import endpoint…` 行 → 搬家反例变红。
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

- `[已完成]` `sessionReconcile.test.ts` 的旧世代竞态用例里 `releasedOwners.has(newOwner)` 是恒真
  断言（`newOwner` 全文无写入方，唯一 ownership 工厂的 `leave` 只写 `oldOwner`），不能守护「旧 continuation
  不得释放新登录 ownership」：把 `SessionReconcileLogic.ts` 的 `finally` 改成调用任何全局 leave，该断言也
  不会变红。应让该用例为新登录世代也构造一个真实可释放的 ownership。
  **已补齐**：`sessionReconcile.test.ts` 让新登录世代也构造一个真实可释放的 ownership。变异推演：把
  `SessionReconcileLogic.ts` 的 `finally` 改成释放「当前」ownership → 该用例变红（命中「旧 continuation 无权
  调用新登录 owner」）。交叉验证：保留同一变异、把测试文件还原成 HEAD 旧版 → **5/5 全绿**，直接坐实旧断言
  `releasedOwners.has(newOwner)` 确为恒真。
- `[已完成]` Lobby 宽限窗口的措辞（「只对 SDK 可自动重试的异常关闭码开放 10 秒窗口」，另见
  `docs/CLIENT.md`）应补上实现里的第五个分支：`apps/server/src/websocket/LobbyRoom.ts:97-103` 的
  `isReconnectableDrop` 除四个 SDK 可重试关闭码（1001/1005/1006/4010）外，对 `code === undefined`
  同样 fail-open 开放 10 秒宽限，会多占 10 秒 seat / online registration，且该分支无定向用例。
  要么改措辞为「四个可重试关闭码 + 无关闭码兜底」并补用例，要么收紧为 fail-closed。
  **已补齐**：选了「改措辞 + 补用例」而非收紧为 fail-closed（`code === undefined` 的 fail-open 是有意的保守
  兜底）。`docs/CLIENT.md` 与 `LobbyRoom.ts` 就地注释改为「四个 SDK 可重试关闭码 + 无关闭码兜底」，并补上
  `code === undefined` 分支的定向用例。变异推演：把 `isReconnectableDrop` 的 undefined 分支收紧为 fail-closed
  → 该用例变红（18 例中仅此 1 例）。
- `[已完成]` **Lobby RPC 存在 SDK 离线队列竞态**：`apps/client/src/net/WebSocketClient.ts:574-578`
  的 `onDrop` 只标记 `slot.dropping` 并拒绝本地 pending，没有清理 Colyseus SDK 的
  `reconnection.enqueuedMessages`。在底层 socket 已关闭而 `onDrop` 尚未回调的间隙，`:660-690` 仍可能调用
  `room.send()`；SDK `Room.ts:282-285` 会把消息入队，重连 JOIN_ROOM 后 `Room.ts:400-406` 自动 flush。于是调用方
  已收到 `CONN_LOST` 的写 RPC 仍可能迟到执行，与用户重试形成重复副作用。现有
  `disableSdkOutboundReplay`（`apps/client/src/net/RoomClient.ts:361-378`）只由游戏 transport 调用，
  `WebSocketClient` 没有同等保护；`webSocketClient.test.ts` 的 fake room 也没有模拟 SDK 队列，因此当前
  `test:client` 246/246 不能覆盖该路径。需补 Lobby 专用 reconnection-queue fixture，覆盖 close→onDrop 间隙、
  `onDrop` 后清队列以及重连前不 flush 旧 RPC；删除清理/发送闸的变异必须使该用例失败。`docs/CLIENT.md:268`
  当前「不会进入 SDK 消息队列」的表述也须随实现或范围说明一起修正。
  **已补齐**：`WebSocketClient.ts` 新增模块级 `disableSdkOutboundReplay(room)`（与 `RoomClient.ts:361` 同形，
  刻意不跨文件抽取以免扩大改动面并牵动生成镜像），在 **bindRoom、onDrop、onReconnect 三处**装闸；装闸失败
  一律 fail-closed——bindRoom 阶段抛错让 join 失败（由既有 catch 兜底），掉线/重连阶段走新增的
  `abandonOnReplayGuardLoss`：摘除 slot、把在途 RPC 判 `CONN_LOST`、后台 `closeSlot`。**不碰**
  `reconnection.enabled`，避免打破 `webSocketClient.test.ts` 中「主动 leave 后 enabled === false」的既有断言。
  锁定 SDK 侧核对（`apps/client/src/lib/colyseus/colyseus.js`）：`:8771` socket 关闭时 `send()` 静默入队**不抛**
  （所以 `rpc()` 的 try/catch 永远接不到这条路径）、`:8988-8990` push 后超限 shift（故 `maxEnqueuedMessages = 0`
  使入队成为空操作）、`:8863` `onReconnect.invoke()` 早于 `:8870-8875` 的 flush（故必须在 handler 内**同步**装闸）、
  `:8653` `reconnection` 只在构造函数赋值一次。
  两条新用例配忠实的 SDK 队列 fixture（flush 用 `enqueuedMessages = []` 整体赋值，与 `:8875` 一致，
  而非原地截断）：一条覆盖 close→onDrop 间隙不入队且重连不 flush，一条覆盖 bind 之后 `reconnection` 变成
  不可控形状时 drop/reconnect 两个阶段都必须失败关闭。变异推演四条，各自独立变红（25 例基线）：
  删 bindRoom 装闸 → 2 例红；删 onDrop 处调用 → 1 例红；删 onReconnect 处调用 → 1 例红；
  把 `abandonOnReplayGuardLoss` 降级为空操作 → 1 例红。
  `docs/CLIENT.md` 的「不会进入 SDK 消息队列」改写为点名该间隙、三处装闸与 fail-closed 行为。
  `test:client` 248/248、`typecheck:client` 0 error、`verify:sync` 镜像一致。
  严重性口径（不夸大）：这是**潜在缺陷 + 证据缺口**而非在跑的 bug——仓内 Lobby RPC 的生产调用方目前只有
  只读的 `user.getInfo`，`rpcIdem` 无生产调用方，且服务端 dispatcher 对 `idem` 路由按
  `(type, uid, clientReqId)` 去重、SDK 还有 `minUptime` 5s 闸；但这些都依赖调用方守约，闸本身该关。
  **再审计保留项（HEAD `54e1941`）**：上述装闸覆盖的是可控 SDK 形状的正常路径；若 guard 在
  `onReconnect` 中失败，`abandonOnReplayGuardLoss` 的 `void closeSlot()` 仍把物理关闭推迟到微任务，而 SDK
  会在回调返回后同步 flush，且提前置 `slot.cancelled` 会让迟到 `onLeave` 跳过显式 owner 清理和
  `notifyConnLost()`。详见 §9.1、§9.2。
- `[不阻塞·有意保留]` Game transport 自动重连只在下一份 mode state 通过 exact 校验后运行 adapter 的可选
  reconcile；当前 ballMove 只对账 desired input，idle 不对账业务状态，两者都不等同于完整业务恢复。
- `[不阻塞·有意保留]` `apps/client/src/net/session.ts` 的角色快照（`commitSessionProfile` /
  `getSessionProfile`）当前只有写入方和测试读取方，生产 View 仍从对账/登录流程的返回值直接取 `IUserView`。
  该快照是为后续统一读源预留的权威槽位，不代表现在已是唯一读源；新增消费方必须改从 `getSessionProfile()`
  读取，而不是再增加一条并行传参链。当前两条链不分叉只是因为 `commitProfile` 返回 false 时登录/对账事务
  整体回滚（隐式耦合，非显式契约）。

### P1-08 本地验证边界

- `[已完成]` `config:excel-to-json:check` 的「只读、不静默修复产物」性质缺少能失败的用例：canonical
  正例在断言「不改写」时，磁盘内容与 checker 构造的期望内容本就完全相同，恒真；把 check 分支改成「先比较、
  再照写一遍」，五个用例无一变红。需补反例：把产物写成陈旧内容后跑 `--check`，断言退出码非 0 **且**文件
  仍保持陈旧字节。实现本身确实没有写，这是证据缺口而非缺陷。
  **已补齐**：`tools/excel-to-json.test.mjs` 新增反例——把产物写成陈旧内容后跑 `--check`，断言退出码非 0
  **且**文件仍保持陈旧字节。变异推演：把 check 分支改成「先比较、再照写一遍」 → 该用例变红（原 5 例全绿，
  印证本条原判断）。
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

- `[已完成]` 命令表完整性闸只以根 `package.json.scripts` 为权威集合，其解析正则不匹配
  `npm --workspace ... run ...`，因此 `@game/server` 的 16 个 workspace 脚本无同类机检——根文档实际只登记
  其中 6 条。本轮新增的 `codegen:state` 仅见于 `apps/server/src/rooms/README.md`，未进 `docs/SERVER.md`
  与 `docs/OVERVIEW.md` 的动线。待补齐：(a) 把 `codegen:state` 补入 SERVER.md 与 OVERVIEW 动线，并提示
  新增 http endpoint 需跑 `codegen:http`；(b) 评估是否把 workspace 脚本纳入同一完整性闸，或显式登记为
  有意保留的作用域边界。
  **已补齐**：(a) `codegen:state` 已进 `docs/SERVER.md` 与 `docs/OVERVIEW.md` 动线，并提示新增 http endpoint 需跑
  `codegen:http`。(b) 选了「纳入同一完整性闸」而非登记为作用域边界：`verify-inventory.mjs` 新增
  `checkWorkspaceCommandScope`，要求**每个** workspace 脚本（`@game/server` 16 个 + `@game/shared` 1 个）
  要么出现在助手文档的「常用本地命令」块，要么在 `docs/inventory.json.workspaceCommandScope` 中带**机检**
  理由登记——`supersededBy` 用既有 `commandCovers` 证明某根脚本确实转调它，`documentedIn` 要求该文档写出
  命令原文；并拒绝重复登记、拒绝与命令表双登记、拒绝指向已不存在的脚本。另加 `checkWorkspaceCommandLiterals`：
  三份根文档里写出的 workspace 命令必须解析到真实脚本，防止改名后留下可复制但已失效的指令。落地时该闸立刻
  查出 `loadtest` 是唯一没有任何文档写出命令原文的脚本，已在 `docs/EXTRAFEATURES.md` 补上。
  `scripts/verify-inventory.test.mjs` 新增 5 条反例（新增未登记 workspace 脚本、`supersededBy` 的根脚本不再
  转调、`documentedIn` 文档删掉命令原文、与命令表重复登记、根文档引用不存在的 workspace 命令）。变异推演
  两处：删掉 `checkWorkspaceCommandScope` 调用 → 4 条变红；删掉字面量存在性断言 → 第 5 条变红。上述
  5 条只覆盖正常登记路径，不覆盖下面两种绕过。
- `[已完成]` **workspace 覆盖门禁允许 self-reference**：
  `scripts/verify-inventory.mjs:227-230` 未限制 `supersededBy.kind` 必须为 `root`，而
  `commandCovers`（`:706-714`）在 command key 相同时直接返回 `true`。因此任意 workspace 脚本可以把自己登记为
  `supersededBy`，无需证明任何根命令实际调用它即可通过 `verify:inventory`。需补 fixture 反例，断言
  `supersededBy` 只能指向根命令（或明确禁止同 key），并以 self-reference 变异证明门禁确实失败。
  **已补齐**：实证先确认了两种绕过在 HEAD 都能过闸（在 `git archive` 出的一次性副本上跑 `--root`）：
  `@game/server#relayer` 自指 → exit 0；新增互相调用的 `fx:a`/`fx:b` 并互为 `supersededBy` → exit 0。
  修复没有采用「只能指向根命令」，因为那会**误伤**一类正当登记：锚点若是**已写在助手命令表里**的 workspace
  命令（例如 `@game/server#smoke`），其文档保证与 root 锚点等价——root 的保证本就来自
  `checkRootCommandTable` 强制它出现在文档里。实际判定改为「锚点必须是 root，**或**自己已在助手命令表中」，
  由 `documented` 集合直接判定；`:216-218` 已保证登记项自身的 key 绝不可能在 `documented` 里（在里面就直接
  fail），因此自指永远拿不到放行。**不动 `commandCovers`**：它被 `checkCommand` 的 `verification.requires`
  判定复用，改短路语义会波及既有覆盖判定，超出本条范围。
  三条反例：A 自指、B 互相 supersede、C **正当 workspace 锚点必须仍放行**（反向锁）。变异推演三条：
  删掉锚点闸 → A、B 两条红；退化成「只禁自指」（`anchorKey === key`）→ **只有 B 红**，证明 A 不能替代 B；
  收紧成「只认 root」→ **只有 C 红**，锁住不误伤方向。`test:inventory` 33→36，`verify:inventory` 仍绿。
  残余风险另立条目：锚点闸只把橡皮图章从「零成本自证」抬高到「需要在锚点脚本文本里写一段能匹配正则的调用」，
  并未建立真实可达性——文本伪调用见下一条。
- `[已完成]` **workspace 覆盖门禁把文本伪调用当成真实执行**：
  `scripts/verify-inventory.mjs:676-690` 的 `commandReferences` 只对 package script 文本做正则扫描，
  `echo npm --workspace ... run ...`、注释以及永不执行的 shell 分支也会被当作覆盖；现有
  `scripts/verify-inventory.test.mjs` 的 5 条反例没有这些形态。需补伪调用 fixture，要求只有实际可执行的
  workspace 调用才能满足 `supersededBy`，并以删除/放宽执行性判断的变异证明反例会失败。
  **已补齐**，且范围比原登记更大：同一缺陷波及**三个**登记性断言，不止 `supersededBy`——`commandReferences`
  喂给 `commandCovers` 的边被 `checkWorkspaceCommandScope` 与**既有的** `checkCommand`（`verification.requires`）
  共同消费，`commandInvokesEntry`（`launch.defaultEntry`）也是同一种整段正则匹配。只修 `supersededBy` 会让
  `verify:core` 的 requires 继续是软的。
  新增 `executableSegments(script)`（按 `&&` `||` `;` `|` 换行切段）与 `segmentLeadsWith(segment, binaries)`
  （trim 后首 token 严格相等）；`commandReferences` 只在首 token 为 `npm` 的 segment 内匹配，
  `commandInvokesEntry` 要求 segment 首 token 属启动器白名单（本段写入时为 `node|npm|npx|tsx|sh|bash`；
  `npx` 后由 §9.6/`86aa214` 移除）或就是入口路径本身。
  正则本身一行未改。（落地时踩到一个 TDZ：启动器表若写成模块级 `const`，会因驱动段先于该声明执行而
  `Cannot access before initialization`，故内联在函数内。）
  **验收口径收窄**（不假装解决了不可解的问题）：新判定只证明调用出现在**引号外、注释外、非命令替换内、
  非 heredoc 内**的可执行段中，且该调用**就是这一段的命令头**（`commandReferences`），或**不落在
  `-e/--eval/-p/--print/-c/--check` 这类不执行入口的 flag 之后**（`commandInvokesEntry`）。
  **不保证**：运行时可达（`false && …`、`exit` 后死代码）、变量展开（`$CMD run x`）、
  `eval`/`source`/`xargs`/别名/任意 wrapper、`sh -c` 内联脚本的内层语义、以及启动器**参数位**里出现的
  入口路径（`npm exec cowsay <entry>`）。真 shell 解析器 + 运行时语义才能判定这些，静态不可判。
  四条反例：`echo` 伪调用、`#` 注释伪调用（与 echo 分开写，否则后人只给 echo 加特判就会以为修好了）、
  `verify:core` 链路里 echo 掉 `verify:vendor`（守既有消费点）、echo 掉 relayer 的 launch 入口。
  变异推演三条：撤回 `commandReferences` 的可执行位判定 → 3 例红；把分隔符退化成「只切换行」→ 2 例红
  （含既有基线正例——`verify:core` 首 token 是 `node`，退化后 10 条 npm 引用全丢，正例是这个变异的唯一杀手）；
  撤回 `commandInvokesEntry` 那一刀 → 只有 launch 那条红，证明两刀口互相独立。
  `test:inventory` 36→40，`verify:inventory` 仍绿（51 条 script 的引用集合逐条比对无丢失）。
- `[不阻塞·有意保留]` shell 可达性静态不可判定：短路操作符右侧（`false && npm run x`）与 `exit` 之后的死代码
  仍会被算作覆盖。`FOO=1 npm …` 与子 shell `( … )` 等形态仓内今天不存在，被判为**未覆盖**（失败关闭），
  新增此类形态时必须显式决策而不是静默放行；`npx` 的实际启动器白名单行为与这里的旧口径不一致，另见 §9.6。
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

- `[已完成]` 生成物登记点与铁律 2 未随 manifest 化更新：`docs/SERVER.md` §13 仍把
  `apps/shared/src/protocol/state.ts` 记为「Colyseus state 纯数据镜像」的真源（该文件与
  `apps/server/src/rooms/schema/GameRoomState.ts` 首行均已是 room-state-codegen 的 AUTO-GENERATED 标记），
  且全文未出现 `apps/shared/schema/game-room-state.json`、`codegen:state`、`room-state-codegen`；
  HTTP endpoint 登记行仍只写「装配在 `http/index.ts`」，未指向 `manifest.generated.ts`。
  需把 state 真源改为 manifest 并注明生成命令、HTTP endpoint 行补 `manifest.generated.ts` + `codegen:http`。
  ⚠ 该漂移无门禁依据：命令表校验只覆盖根 `package.json` 的 script，workspace 级 `codegen:*` 不在闸内；
  `verify:core` 也不含服务端单测，按旧口径手改生成物后只有 `verify:all` 才会红。
  **已补齐**：`docs/SERVER.md` §13 的 state 真源改为 `apps/shared/schema/game-room-state.json` 并注明
  `room-state-codegen` 与 `codegen:state`，HTTP endpoint 登记行补上 `manifest.generated.ts` 与 `codegen:http`。
  本条末尾标注的「workspace 级 `codegen:*` 不在闸内」这一门禁空白，已由同轮 P1-09 的
  `checkWorkspaceCommandScope` 消除。
- `[已完成]` `AGENTS.md`/`CLAUDE.md` 铁律 2「生成镜像禁手改」只列三项 sync 镜像，未列入四项生成物：
  `apps/shared/src/protocol/state.ts` 与 `apps/server/src/rooms/schema/GameRoomState.ts`（真源
  `apps/shared/schema/game-room-state.json`，`npm --workspace @game/server run codegen:state` 刷新）、
  `apps/server/src/http/manifest.generated.ts`（`codegen:http`）、`apps/shared/src/project.ts`（真源
  `project.metadata.json`，`npm run init:project`）。铁律 2 恰是 `verify-inventory.mjs` 的
  `assistantRequirements` 强制要求存在的关键指令之一，但只校验字符串在场、不校验清单完整性。
  待补齐：补列四项与对应重生成命令，并给 assistantRequirements 增加断言 + 反例，使清单完整性与命令表一样
  受机检约束。现有缓和：四个文件首行均带 Do not edit banner，freshness 反例与只读比对会拦住手改——
  这是文档可发现性问题而非防护缺口。
  **已补齐**：`AGENTS.md`/`CLAUDE.md` 铁律 2 补列四项生成物与各自重生成命令，并给 `verify-inventory.mjs` 的
  `assistantRequirements` 增加 state 生成物登记 / state 重生成命令 / HTTP manifest 生成物登记 / HTTP manifest
  重生成命令 / 项目元数据生成物登记五条断言，使清单完整性与命令表一样受机检约束。变异推演：从真实
  `AGENTS.md`/`CLAUDE.md` 删掉 HTTP manifest bullet → `verify:inventory` 退出码 1 并报出 2 条缺失。
- `[已完成]` `docs/OVERVIEW.md` §4.2 的结论句「新增玩法通过登记点扩展，不在通用 transport 中增加
  玩法分支」只对客户端成立。服务端新增自带 C2S 输入的玩法，仍必须改通用 `apps/server/src/rooms/GameRoom.ts`
  三处：`GAME_ROOM_C2S_SCHEMAS`（`[K in C2SType]` 映射，漏写 typecheck 失败）、无类型约束的 `messages`
  handler 表（漏写即静默丢消息）、`phaseAllows` switch（default 为 false，漏写即静默拒绝）。`a10f2f7`
  自己加 `c2s.idle.pulse` 时正是这么做的。应在动线图补上「server GameRoom 消息表 / phaseAllows 登记该消息」
  一步并收窄结论句；或把 C2S→mode 的路由改成由 mode 声明其消息集合、由通用 shell 按声明分发。
  **已补齐**：选了「补动线 + 收窄结论句」。`docs/OVERVIEW.md` §4.2 的结论句收窄为只对客户端成立，标准开发
  动线补上「server GameRoom 消息表 / `phaseAllows` 登记该消息」一步，并点名 `GAME_ROOM_C2S_SCHEMAS`、
  `messages` handler 表与 `phaseAllows` switch 三处必改点及各自的失败形态（typecheck 失败 / 静默丢消息 /
  静默拒绝）。「由 mode 声明消息集合、通用 shell 按声明分发」的改造范围远超本条，未采纳。
- `[已完成]` 历史归档 `plan.md` 的 P1-09 正文仍写着「`plan.md` 是核心优先级真相」，与其文首归档头、
  `docs/inventory.json.routeOfTruth.corePlan` 与 verifier 的硬拒绝互相矛盾；`verify:inventory` 只检查链接和
  锚点，发现不了这类语义冲突。应改为指向本文件，并复查归档内其余「本文件是唯一真相」式表述。
  **已完成于 `8d0ec91`**（本文件建档提交）：`plan.md:682` 已改为「当前核心优先级真相为
  [plan-v3.md](plan-v3.md)」，`plan.md:3` 归档头同时指向本文件。
  ⚠ 更正（本轮复核发现）：当时那句「`plan-v2.md` 已无此类残留」是**按短语**（`唯一真相`）复查得出的，
  而 `plan.md` 侧是**按语义**修的，两侧口径不对称。实际 `plan-v2.md:296` 与 `:359` 仍以现在时自称
  `routeOfTruth.corePlan`，与 `docs/inventory.json` 和 verifier 的硬拒绝矛盾。两处已改写为「当轮」时态
  并加归档补注。这是「证据弱于主张」的典型，记录在此以免同类复查再次逃逸。
- `[已完成]` plan-v2 对同一文件/命令给出过两个计数（`relayer-boundary.test.ts` 7 vs HEAD 8；
  `int/archive.test.ts` 44 vs 51；`test:inventory` 20 vs 25）。本文文首已统一计数口径，后续回写须遵守；
  归档中的旧计数不再追改。
  **已完成于 `8d0ec91`**：本文文首「计数口径」段已统一为「写入该条时的 HEAD 快照，同一命令以最后写入的一条
  为准」；归档旧计数按该口径不再追改，本条自此闭合。
- `[已完成]` **plan-v2 → plan-v3 的唯一真相迁移缺少可追溯批准**：`8d0ec91` 已把
  `docs/inventory.json:171`、`AGENTS.md:12`、`CLAUDE.md:12`、`README.md:21` 以及
  `scripts/verify-inventory.mjs:536` 切换为 `plan-v3.md`，并把 `plan-v2.md` 降级为历史归档；但仓内没有找到
  「同意改变核心计划真相」的批准记录，而本任务此前明确要求以 `plan-v2.md` 为唯一真相。本次回写指令确认了
  回写目标文件，却不能自动补齐该历史授权证据。若该指令即代表批准迁移，应在本条记录批准来源后转为
  `[已完成]`；否则在批准前不得把迁移视为无条件闭合。
  **已完成 —— 批准来源：用户会话指令。** 该迁移不是自作主张：用户当轮的原话是「我同事已经按照 plan-v2.md
  修复问题并提交 commit，你再审阅一下代码，并**新建 plan-v3.md ，将 plan-v2.md 修改为 历史记录**」。
  批准存在，只是它存在于会话指令而非仓内文件，所以只读仓库的复核者查不到——这正是本条被登记的原因，
  记录于此即闭合。
  迁移自洽性另行逐点复核（与授权分开判断）：`8d0ec91` 实际改 19 个文件，条目列举的 5 个 anchor 全部准确
  但不穷尽——还包括 `verify-inventory.mjs` 的另 4 处计划相关硬断言（含**新增**的
  「`referenceDocs` 必须登记历史 plan-v2.md」）、`verify-inventory.test.mjs` 的 4 处 fixture 断言、
  `docs/inventory.json` 的 12 处 `capabilities[].docs`、以及 `plan.md:3` 与 `plan-v2.md` 的归档头。
  内容承接完整（plan-v2 33 条标签条目 → plan-v3 39 条，无丢失），`verify:inventory` 与 `test:inventory` 均绿。
  唯一实质残留是上面已更正的 `plan-v2.md:296/:359`，属 §7 上一条的口径问题，已一并修掉。
  未新增针对该类自称的机检：可行的实现只能是短语正则（`已通过|已登记为` + `corePlan|唯一真相`），
  写成「本文件即当前 corePlan」即可绕过，收益低于其脆性与维护面。
- `[已完成]` **每个问题独立 commit 的流程契约未满足**：本文文首要求每条问题在同一独立 commit 中
  完成实现、验证和证据回写，但 `a10f2f7..8a76d29` 的变更将多个问题合并：`6b77ebe` 同时处理 4 条，
  `a83467d` 同时处理 4 条，`28cd900` 同时处理 3 条，`e54ad71` 处理 1 条，`08f6c5c` 同时处理 P1-09
  与 §7 的多条文档/门禁问题；`8a76d29` 又集中回写全部条目证据，故实现/验证与证据并未保持同 commit。
  这是已发生的历史流程偏差，不建议为重写历史而强行拆 commit；应明确记录为经批准的例外，或从下一条开放项起
  严格执行「一条问题 = 一个实现、验证、证据 commit」，并在对应条目写入 commit id。
  **计数经独立复核逐个 commit 核对全部准确**（`08f6c5c` 的「多条」精确为 4 条：P1-09 1 条 + §7 3 条）；
  最硬的一条是**历史轮** `a10f2f7..8a76d29` 的 5 个实现 commit（`6b77ebe`/`a83467d`/`28cd900`/`e54ad71`/
  `08f6c5c`）对 `plan-v3.md` 的改动行数**全为 0**（`git show --numstat --format= <c> -- plan-v3.md`
  输出为空），即「实现/验证与证据同 commit」这一维度在历史轮 0/5 合规，无从辩护。
  ⚠ 此处曾被一次「复核更正」删除：该复核测的是 `509cb4e..54e1941`（**上一轮收口**，`13/1`、`20/1`、
  `14/1`、`21/1`、`18/3`、`37/5`，确为 6/6），而被删那句说的是**历史轮**。两组数字都对，但它们不是同一
  批 commit，因此那不是更正而是误读，并且删掉了本条目赖以成立的全部硬依据。两句现在并存。
  **不 rebase**，理由不采用「会摧毁 §7 迁移条目的溯源」那条——复核指出 `8d0ec91..bc02794` 按 git 范围记法
  **不含** `8d0ec91`，该 commit 是改写基点、hash 不变，相关引用不会失效。真实理由是：需要 force-push 覆盖
  已发布历史；要诚实写出每个 commit 的计数快照就得在约 13 个中间 commit 上逐个重跑门禁；而 `08f6c5c` 的
  两个闸 + 5 条反例 + 它当场查出的 `loadtest` 文档补齐是一个因果整体，机械拆开必然产生红灯中间 commit。
  **已批准（用户会话决定）**：用户明确选择「接受为例外，不重写历史」，历史轮的粒度偏差据此正式登记为
  经批准的例外，已发布历史不再改写。
  **从本轮起严格执行**，上一轮 6 条各自独立 commit（实现 + 变异验证 + 本条证据回写同 commit）：
  P1-01 返回值契约 `509cb4e`、P1-07 SDK 重放队列 `8cb6fc4`、P1-09 锚点闸 `37851b5`、
  P1-09 可执行位判定 `1ad756c`、§7 真相迁移批准 `80c86be`、本条即当前 commit。
  口径更正（避免把上一轮说得比实情好）：上一轮 `a5340ad..a10f2f7` 的 22 个 commit **全部**在同 commit 内
  改了 `plan-v2.md`（证据同 commit 维度 22/22 合规），但「一条问题一个 commit」并非全合规——按新增
  `[已完成]` 条数分布为 1 条×14、2 条×6、4 条×1、0 条×1。所以本轮相对上一轮是在**证据同 commit** 这一维度
  倒退，而不是两个维度都倒退。

## 8. 本次独立审计快照

审计范围为 `a10f2f7..8a76d29`（审计时 HEAD `8a76d29`），针对同事新增的实现、测试、门禁和 plan-v3 回写逐项
复核。结论为 3 条 P1 风险（Lobby SDK 队列、真相迁移授权、提交粒度）和 3 条 P2 风险（公共 API 返回值、
workspace self-reference、workspace 文本伪调用）；它们已分别在 P1-01、P1-07、P1-09 和本节上方的 §7 登记，
在完成补证或取得明确决策前不得继续写成无条件「全部已完成」。

**该 6 条已于 `bc02794..` 逐条独立收口**（每条一个 commit，含实现、变异推演与本条证据回写）。收口前先做了
一轮对抗式复核：6 条各配一名核查者与一名反驳者独立重跑证据，结论是 6 条**全部成立**，但同事的定性有两处
需要修正——Lobby SDK 队列是**潜在缺陷 + 证据缺口**而非在跑的 bug（生产 Lobby RPC 调用方目前只有只读的
`user.getInfo`，`rpcIdem` 无生产调用方，服务端对 `idem` 路由按 `(type, uid, clientReqId)` 去重，SDK 还有
`minUptime` 5s 闸），真相迁移的授权**确实存在**（用户会话指令，只是不在仓内）。复核同时发现两处同事漏登记
的更一般形态：self-reference 之外还有「两个互相调用、谁都没进命令表的脚本互证」，文本伪调用不止波及
`supersededBy`、还波及既有的 `verification.requires` 与 `launch.defaultEntry`。两者都已一并修掉。

⚠ 流程教训（本轮实测）：并发 agent 在**同一 worktree** 里做变异实验会互相污染——一次复核跑出的
「2 例失败」实为兄弟 agent 在途的变异所致。因此本轮 6 条的实现与变异推演全部**串行**执行，任何
「全绿/变红」结论都与 `git status --porcelain` 同步取证。

审计当时执行并通过：`npm run verify:inventory`（14 项能力 / 5 个默认入口）、`npm run test:inventory`
（33/33）、`npm run test:client`（246/246）、`npm --workspace @game/server run test`（297/297）和
`git diff --check`。当时已正确指出这些绿灯只证明现有路径——fake room 没有覆盖 Lobby 的 close→`onDrop`
队列间隙，也没有覆盖公共 `void` 返回值、self-reference 或文本伪调用。收口后这四条路径均已有能失败的
定向用例：`test:client` 246→248、`test:inventory` 33→40。

## 9. 本轮再审计开放项

审计基线为 HEAD `54e1941`。本节复核的是上一节所述六个收口提交后的**残余主张和反例**，不是对原条目
实现的回滚；代码与测试在本轮均未修改。每条均按隔离 `git archive` 副本或现有测试 fixture 重跑，状态标签
表示当前计划是否仍需处理。原条目的 `[已完成]` 只在其原登记范围内成立，不能覆盖本节列出的更一般形态。

### 9.1 Lobby guard 失败后的重放时序

- `[已完成]` **P2**：`apps/client/src/net/WebSocketClient.ts:618-623` 的
  `onReconnect` 调用 `abandonOnReplayGuardLoss`；失败路径 `:778-783` 先标记 slot 并用 `void closeSlot()`
  异步启动物理关闭，而 `:680-698` 的实际 `leave` 在 Promise 微任务中开始。SDK
  `apps/client/src/lib/colyseus/colyseus.js:8863` 在回调返回后，于 `:8870-8875` 同步 flush
  `enqueuedMessages`。向 `maxEnqueuedMessages` 注入抛错并预置一条旧队列消息，可观察
  `staleFlushed: 1`：关闭完成前旧 RPC 已被 flush。需让 guard 失败路径在回调返回前同步中和队列/阻止 flush，
  并补该反例的能失败测试。
  **已补齐（`204821c`）**：机制与时序属实。`disableSdkOutboundReplay` 过去三步中和共用一个 try，且把最不
  重要的 `maxEnqueuedMessages = 0` 放在最前——写上限抛错会直接吞掉后面的清队列，而清队列才是唯一能阻止
  SDK 同步 flush 的动作（flush 走 `connection.send`，不经 `room.send`，所以废掉 send 面无效）。改为
  清队列优先 + 三步各自 try。同事只报了 `WebSocketClient`，`RoomClient.ts` 上有一份逐字相同的实现与同形的
  失败路径，本轮一并修掉。
  **定级更正：不是 P2，是防御性收口。** 锁定 SDK 的 `reconnection` 是构造函数里的普通对象字面量
  （`colyseus.js:8653-8665`），从不被替换/冻结/改描述符，全 SDK 只有 4 处写它；`colyseus.js` 又被
  `scripts/vendor-lock.mjs` 按哈希锁定；`bindRoom` 已前置 fail-closed。因此这条失败分支在真实 SDK 下
  **不可达**，且即便可达队列也必为空（`max=0` 让 `enqueueMessage` 的 push-then-shift 恒为空）。
  两条新用例。变异推演：恢复「单 try + 上限在前」的原始形态 → 用例变红（冻结数组需**非空**才有
  判别力——空的冻结数组本身就是已中和状态，清理步骤根本不会尝试写入）。注意：在三步各自 try 的
  当前形态下，孤立地把「设上限」与「清队列」对调顺序并不变红（上限抛错被自身 try 接住、清队列照常
  执行），判别力来自与单 try 的耦合，故不按「两条独立变异各自变红」声称。

### 9.2 Lobby guard 失败后的迟到 onLeave

- `[已完成]` **P2**：`:781` 先置 `slot.cancelled = true`，迟到 `onLeave` 在
  `WebSocketClient.ts:624-628` 的 `current()` 检查处直接返回；因此不会执行 `:634-639` 的显式 owner
  清理和 `notifyConnLost()`，也不会进入 `apps/client/src/net/session.ts:306-317` 的 session reconciliation。
  注入不可控 `reconnection` 后触发 drop 的结果为 `slotCurrent:null, cancelled:true, owners:1,
  ownerActive:true, connLost:0`。需保证 guard 失败仍精确释放所有 owner，并发出一次最终连接死亡通知，或
  明确记录由其他同步路径承担这些职责。
  **已补齐（`204821c`）**：这条是上一轮我引入的真实回归。`abandonOnReplayGuardLoss` 先置 `slot.cancelled`
  会让迟到的 `onLeave` 在 `current()` 处直接返回，于是 owner 永远停在 `active`、`disposeControl` 不被调用，
  页面组合根也收不到 `connLost` 而无法进入 session 对账。改为在该函数内显式释放 owner 并上报一次最终断线，
  「只做一次」由 `cancelled` 保证（两个调用点先后触发时第二次已在守卫成功处 return）。
  `closeSlot` 不是可复用的释放点——它的四个调用者各自释放 owner，语义刻意不同。
  一条新用例覆盖 drop / reconnect 两个相位，并断言迟到 `onLeave` 不得二次上报；两条变异各自变红：
  删 owner 释放、删 `notifyConnLost`。可达性与 9.1 同源（锁定 SDK 下不可达，属纵深防御分支）。

### 9.3 closed socket 下的 RoomClient 返回值

- `[已完成]` **P2**：`apps/client/src/net/RoomClient.ts:1130-1137` 只把同步
  throw 判为失败；SDK `apps/client/src/lib/colyseus/colyseus.js:8771-8773` 在 socket 关闭时静默入队并
  返回。将 `maxEnqueuedMessages` 设为 `0` 后，closed send 可观察 `result:true, sent:0, queue:0`，
  `apps/client/src/net/rooms/GameRoomTransport.ts:98-103` 因而可能把未实际发送的 Move 记入
  `lastSentSeq`。若 boolean 仅表示“通过本地闸并调用 SDK”，应收窄 P1-01 的契约文字；若表示已发送/已接受，
  则需修复实现并补 closed-socket 反例。
  **已补齐（`39eaca7`）**：选了修实现而非收窄措辞——收窄会迫使 `GameRoomTransport.ts` 的 seq 记账另找依据，
  且与 P1-01 已作的决定自相矛盾。新增 `sdkSocketOpen`（失败关闭：读不到或非 true 一律当已关闭），紧贴
  `room.send` 判定，把 TOCTOU 压进同一个同步块；另加 `sdkSocketProbeReady` 升级绊线装在 join 站点——socket
  判定挂在 SDK 未声明的内部字段上，一旦它不再是 boolean，宁可让 join 大声失败，也不能让全部上行发送静默
  变成 no-op 而测试还全绿。两处 fake room 补 `connection` double。
  **归因更正**：这不是上一轮把三个公共方法改成 boolean 时引入的——`a10f2f7` 起 `sendC2S` 与
  `TypedGameRoom.send` 就已经是 boolean，上一轮只是把它暴露到了公共面。
  两条反例、两条变异各自变红：删 socket 判定；删升级绊线。
  **诚实边界**：`isOpen` 到 `connection.send` 之间仍有同一同步块内的 TOCTOU，浏览器 `ws.send()` 在
  CLOSING/CLOSED 上按规范也不抛，所以 `true` 的含义上界是「交给了一个当时处于 OPEN 的 socket」，
  不是「服务端已收到」——GameRoom 的 Move 没有应用层 ack。运行时后果为 P4：窗口内 socket 已不可逆关闭，
  Move 本来就出不去，且 reconcile 或 `notifyBattleLost` 两条出口都不留残留状态。

### 9.4 Lobby replay 的 exactly-once 证据

- `[已完成]` **P2**：`apps/client/test/webSocketClient.test.ts:667-696` 的 replay 用例只调用
  只读 `UserRpc.GetUserId`，没有写 RPC 的副作用计数、`clientReqId` 或服务端效果断言，也没有独立验证
  bind 前已存在的非空 SDK 队列。因此它证明了“消息不留在当前 fake 队列”，不能证明
  `UserRpc.UpdateProfile`、`GuildRpc.Join`、`ShopRpc.Purchase` 等写路径在重连/重试下 exactly once。
  应补写路由 fixture、效果计数和同一 `clientReqId` 的重连序列，并以删除清理闸的变异使测试失败。
  **已补齐（`bfb7630`）**，但**定级下调为 P3 并更正框架**：客户端 fixture 能证明的上界是 transport 层
  **at-most-once**，不是 exactly-once；exactly-once 的权威证据在服务端 dispatcher 的
  `(type, uid, clientReqId)` 去重与其集成测试，不该由客户端 fake room 冒充。同事点名的
  `UserRpc.UpdateProfile` / `GuildRpc.Join` / `ShopRpc.Purchase` 在仓内**确实存在**（均为 `idem: true` 路由），
  不是虚构的例子。
  实际动作两条：replay 用例从只读 `UserRpc.GetUserId` 改为真实写路由
  `rpcIdem(GuildRpc.Join, …, "cr-gap")`，让用例名副其实；新增「bind 前 SDK 队列已非空」反例，这是
  `max=0` 之外的第二道闸，此前无任何用例覆盖。
  变异推演如实记录：去掉返回值的 `length === 0` 子句 → **3 例红**，分别是
  `bind 前已存在的 SDK 出站队列必须被清空`、`清队列失败也不得吞掉设上限：三步中和必须各自独立`、
  `闸失效放弃连接：释放全部 owner 并只上报一次最终断线`。
  （`985d03d` 曾把这条收窄为「至少 1 例」，理由是复核时只定位到 1 例；本轮连跑两次均稳定复现 3 例并列出
  用例名，故恢复精确计数——那次收窄是复现失败导致的**去精度**，不是更正。）
  **把原地清空改成 no-op 不会变红**——
  9.1 拆分三步后整体替换那步本就是它的兜底，两者按设计冗余，不假称该行被独立覆盖。
  未加 `serverEffects` / `clientReqId` 计数：零杀伤力，且会让读者误以为客户端 fixture 在证 exactly-once。

### 9.5 inventory shell 语法解析不足

- `[已完成]` **P2**：`scripts/verify-inventory.mjs:685-707` 的
  `executableSegments()` 只按 `&&`、`||`、`;`、`|` 和换行切段，并不解析引号、转义、注释、命令替换或
  参数语义；因此它不能兑现本文件「**验收口径收窄**」一段所称的「引号外、注释外」
  （该行号已三次因前文加段而漂移，改用锚句关键词定位，不再给裸行号）。在隔离副本中，以下代表性伪调用
  均可令 `verify-inventory --root` 返回 0：
  `echo "ignored; npm --workspace @game/server run start"`、
  `npm run verify:project # npm --workspace @game/server run test`、
  `npm run verify:project "$(echo npm run verify:vendor)"`、
  `sh -c 'echo path; true'`、`node -e noop path`、`node --check path`。
  需采用受限且明确的 shell 解析器/白名单并为每种语法补反例，或把计划主张收窄为仅支持当前明确语法。
  **已补齐（`fd35273`）**：6 种伪调用经隔离副本逐条实证成立，复核另找到 3 种同事没写的。六条规则各配一条
  **只杀它**的反例：R1 引号与转义整体折叠成哨兵；R2 引号外的 `#` 截断整段；R3 反引号 / `$(` 命令替换整段
  失败关闭；R4 heredoc（`<<`）整段失败关闭；R5 `commandReferences` 的匹配必须在段首（参数位的
  `-- npm run x` 不是被执行的命令）；R6 `commandInvokesEntry` 用 token 相等判入口，并对
  `-e/--eval/-p/--print/-c/--check` 这类不执行入口的 flag 判「未启动」。
  R6 **刻意不采用**「第一个非 flag token 才是入口」的位置纪律——那会把 `node -r tsx/cjs <entry>`、
  `node --env-file .env <entry>` 这类合法启动误判成未启动（对只有一个数据点的闸，假红比假绿更伤信任），
  已加正例反向锁住这个方向。
  零漂移实证：51 条 script 的新旧分段结果逐条比对 **segment-differences = 0**；`verify:inventory` 仍绿。
  设计反例时踩到一个坑值得记：最初为 R2/R3 写的两条反例其实分别被 R5 和「首 token 不是启动器」提前捕获，
  变异 R2/R3 时并不变红；改成 `bash tools/dev-stack.sh # <entry>` 与 `node $(echo --check) <entry>`
  这两种段首仍是白名单启动器的形态后，六条规则才各自独立可失败。

### 9.6 npx 白名单与文档口径冲突

- `[已完成]` **P2**：`scripts/verify-inventory.mjs:704-706` 把 `npx` 列入
  `commandInvokesEntry` 启动器白名单，但本文件 :408-410 原先声称 `npx` 应被判为未覆盖、失败关闭。
  隔离副本中 `npx tsx src/core/economy/relayer.ts` 与 `npx echo src/core/economy/relayer.ts` 均可通过，
  后者甚至不需要真实入口执行。需统一策略：移除 `npx` 并保持 fail-closed，或明确接受它并补充外部包解析/下载
  的范围说明与测试；在决策前不能把该边界写成已闭合。
  **已补齐（`86aa214`）**，**定位更正**：真正活着的矛盾不在 plan-v3 正文（同事已在 `c2bf0d2` 自行修掉那一半），
  而在 `scripts/verify-inventory.mjs` 的源码注释——它声称 `npx` 判为未覆盖、失败关闭，24 行之后的白名单
  却放行它。这是一条至今为假的承诺。统一为「移除 `npx`，保持 fail-closed」：接受它就得判 `npx <pkg>` 的
  `<pkg>` 是不是解释器（`npx tsx` 是、`npx echo` 不是），那意味着引入 registry/下载语义，与本仓
  「依赖必须入库并按哈希校验」的路线冲突；仓内 0 处 `npx`，唯一 launch 用 `tsx`，代价为零。
  一条反例用 `npx tsx <entry>` 而非 `npx echo`：被启动物是真解释器，红绿只可能由 `npx` 这一个 token 决定，
  杜绝后人「给 echo 再加个特判」的误修。两条变异：加回 `npx` → 该条红；连 `tsx` 一起移除 → 两条正例反向锁红。
  注释同时补上收窄：白名单只判 segment 首 token，不判启动器参数语义与其后的注释文本。定级 P3。

### 9.7 documentedIn 与助手命令表的全文伪登记

- `[已完成]` **P2**：`scripts/verify-inventory.mjs:165-175` 和 `:243-255` 只对助手文档/指定
  `documentedIn` 做全文正则匹配，不限制 Markdown 文档、命令代码块、目录或有效登记位置。隔离副本中把
  `npm --workspace @game/server run fixture:worker` 放进 shell 注释，或把 `documentedIn` 指向
  `apps/server/package.json` 并把命令文本写进 description，均可通过。该闸只能证明出现了字符串，不能证明
  真实文档登记；应收紧路径/区块解析，或明确把全文匹配降级为非强保证。
  **已补齐（`6cbd515`）**，**机制描述需更正**：`assistantWorkspaceCommands` 并**不是**全文正则——它先取
  「常用本地命令」小节、再取该小节内唯一一个 fenced block，只在块内逐行解析。真正的缺口是块内**逐行**解析用的
  `workspaceCommandFromText` 没有行首锚点，于是块里一行注释或 `echo "…"` 也被当成登记；而
  `rootScriptFromCommand` 早就有 `^`，两个平行解析器口径不一致。`checkWorkspaceCommandLiterals` 的全文扫描
  是**有意**的反陈旧检查，不该加锚点。
  两处外科改动：块内解析加行首锚点；`documentedIn` 限定为 `README.md` 或 `docs/` 下的 `.md` 并补 `isFile()`。
  `README.md` 纳入白名单（它在本验证器里已是一等命令文档面），历史归档 `plan*.md` 排除。
  五条反例、三条变异各自变红：去行首锚点 → 注释/echo 两条红；去位置守卫 → 越界文档与归档 plan 两条红；
  去 `isFile()` → 目录那条红（否则是 EISDIR 崩溃而非干净 fail）。现有 11 条登记全部存活。

### 9.8 verification.requires 的自引用和循环

- `[已完成]` **P2**：`scripts/verify-inventory.mjs:743-750` 的
  `commandCovers()` 对同 key 直接返回 `true`，`checkCommand()` 在 `:779-785` 遇到循环只静默 return。
  在隔离副本中把 root/workspace requirement 改成自身，或让两个命令互相 `requires`，均仍返回 0；若后续
  按登记执行，脚本还可能进入无限递归。应在发现重复 key 时 fail-closed，并补自引用和两节点循环反例。
  **已补齐（`b1eb997`）**：与上一轮 `supersededBy` 锚点闸同一根因（`commandCovers` 的同 key 短路），
  `requires` 侧一直没有对应闸，还多一个问题——遇到重复 key 只静默 `return`，等于把该节点以下整棵子树的断言
  跳过，把一条已被反例守住的失败多包一层自身 key 就能漂白。改为环检测失败关闭，且判定上移到
  `requires === undefined` 的叶子早退之前。
  三条反例（自引用、二节点互调、自包装漂白一条真实断链）、两条变异：回归静默 `return` → 3 条红；
  环闸放回早退之后 → 2 条红。
  **口径更正**：原文「若按登记执行还可能无限递归」不成立——`checkCommand` 递归的是有限 JSON 树，
  `commandCovers` 有 `seen` 集合，且仓内根本不存在「按登记执行」的执行器。npm 脚本层的真环今天确实无闸，
  但那与 `requires` 登记无关，不并入本条。

### 9.9 命令存在性被原型链属性绕过

- `[已完成]` **P2**：`scripts/verify-inventory.mjs:654-660`、`:730-738` 和
  `:753-766` 通过普通属性索引与 truthiness 判断脚本存在，没有 own-property 或字符串类型校验。将验证项改成
  `root:toString`、`root:constructor`，或 workspace `@game/server#toString`，可在隔离副本中通过
  `verify-inventory`，但这些都不是实际脚本。应使用 `Object.hasOwn`（或等价检查）并要求 script 值为字符串。
  **已补齐（`8050cc1`）**，**范围比原登记多一处**：除 `verification` 裸存在性与文档原文 gate 外，
  `workspaceCommandScope` 的 stale 检查也走同一张表，否则 phantom 登记永远没有回归保护。六个查表点统一走
  新的 `scriptEntry`（`Object.hasOwn` + `typeof === "string"`）。
  四条反例（root 原型属性、workspace 原型属性、phantom scope 登记、非字符串脚本值）。
  变异推演如实记录：去掉 `typeof` 字符串校验 → 1 条红；**去掉 `Object.hasOwn` 并不会变红**——
  `Object.prototype` 上的继承属性全是函数，字符串校验已经把它们挡住了。`hasOwn` 是纵深防御
  （挡住将来值为字符串的继承属性），本轮没有能失败的用例守它，不假称已被覆盖。
  **定级下调为 P3**：无运行时影响，要触发得有人把脚本命名成 `toString`；三条覆盖判定链
  （`supersededBy` / `launch` / `requires`）本来就因 `typeof` 守卫而 fail-closed。

### 9.10 历史提交粒度例外

- `[已完成]` **P3**：§7 已记录历史 `a10f2f7..8a76d29` 将多个问题合并，仍不满足
  原始“一条问题一个 commit”要求；本轮六个收口提交虽已逐条拆分，但不能 retroactively 修复历史。当前不
  重写已发布历史的决定需由用户明确接受为例外；在此之前，§7 不应使用无条件 `[已完成]`。
  **本轮进展与待决点分离**：`c2bf0d2..` 的十条收口严格执行了「一条问题 = 一个实现 commit」
  （§9.1+§9.2 合为 `204821c` 一个 commit：它们是同一条 guard 失败路径，且两个测试共用同一处 fixture
  扩展，拆开会产生红灯中间态——这是显式记录的例外，不是默默合并）。**但「证据回写同 commit」未达成**：
  逐 commit 以 `git show --numstat -- plan-v3.md` 复核，8 个实现 commit 中 7 个对本文件零改动，
  十条「已补齐」证据块均由 `0d94f5f` 一次性批量回写；缓解事实是各实现 commit message 内联了变异推演与
  计数，且 `0d94f5f` 为纯文档 commit，不存在「先写结论后补实现」的窗口。该维度登记为本轮已发生的
  粒度偏差；后续条目的证据回写应随实现 commit 同包，或显式记录偏离理由。
  仍待决的只有一件事：**是否把历史轮的粒度偏差正式接受为例外**。不重写已发布历史的理由已在上面列全
  （force-push 覆盖已发布历史；诚实写每个 commit 的计数快照需在约 13 个中间 commit 上逐个重跑门禁；
  `08f6c5c` 的两个闸 + 5 条反例 + 当场查出的 `loadtest` 文档补齐是一个因果整体）。
  ⚠ 复核订正一条反 rebase 理由：`8d0ec91..bc02794` 按 git 范围记法**不含** `8d0ec91`，它是改写基点、
  hash 不变，所以「rebase 会摧毁 §7 迁移条目的溯源」不成立——真正会失效的只有本条目自身正文里的
  commit hash 与文首快照行。这不改变「不 rebase」的结论，只是把理由换成站得住的那几条。
  **已批准（用户会话决定）**：用户在本轮明确选择「接受为例外，不重写历史」。据此，历史轮
  `a10f2f7..8a76d29` 的粒度偏差正式登记为**经批准的例外**，已发布历史不再改写；「一条问题 = 一个实现、
  验证、证据 commit」自 `c2bf0d2..` 起严格执行，本条与 §7 同步转 `[已完成]`。

本次再审计实际执行并通过（审计基线 `54e1941` 时点）：`npm run verify:inventory`、`npm run test:inventory`（40/40）、
`npm run test:client`（248/248）、`npm run typecheck`、`npm run verify:all`（服务端 297/297、FGUI 50/50）
及 `git diff --check`。这些绿灯只证明当前正向路径，不能抵销上述隔离副本中的反例和证据缺口。

## 10. 本轮完整审计记录（2026-08-30）

审计范围：`ca8251c..0d94f5f` 全部新提交 + plan-v2 → plan-v3 承接完整性。四路独立核查（客户端网络、
inventory 门禁、服务端证据链、文档承接）+ 全部基线实测。

**实测复现**（HEAD `0d94f5f` 工作树）：`verify:all` 通过（服务端 297/297、客户端 254/254）、
`test:fgui` 50/50、`test:int` 154/154（本地 Redis/MySQL 栈实测）、`test:inventory` 60/60、
`test:faults:int` 四组全绿且 13 个 fault point 全部实测执行——与文首「本轮回写快照」一致。

**结论**：未发现任何「标已完成而实际未做」的条目（本轮独立复核另抽样 7 条逐一做变异推演，全部复现，
无一被证伪）；plan-v2 的 61 条标签条目在本文零丢失、零定性漂移——
⚠ 计数口径澄清（本轮复核）：这里的 61 = 33 条 `[不阻塞·有意保留]` + 28 条 `[已完成]`；其中 **33 条保留边界
逐条对位承接**（v3 对应 40 条 = 33 承接 + 7 新增），而 28 条 `[已完成]` 由文首政策句整体处理
（「已闭合内容不再重复登记」）而非逐条搬运。§7 写的「33 → 39」说的是保留边界，与此处的 61 是两个总体，
同一个词「标签条目」指两件事容易误导下一轮复核。
迁移登记链五个登记面（inventory `routeOfTruth` / README / AGENTS / CLAUDE / `plan.md` 归档头）一致。
⚠ 更正（本轮复核）：其中只有**前四处**由 verifier 硬断言机检，`plan.md` 归档头仅有存在性与链接锚点检查、
**内容不受机检约束**——隔离副本里把该归档头反转成「本文件是当前唯一真相」，`verify-inventory --root` 仍
exit 0。这正是 §7 那条「`plan.md` 正文自称核心真相」缺陷的同类形态，当时的结论就是「verifier 发现不了
这类语义冲突」，因此不能统计成「机检通过」。

**本轮修正**（各自独立 commit）：

1. §9.10「证据回写同 commit」表述更正为实际形态（`a1052b8`），登记为本轮已发生的粒度偏差。
2. §9.1 变异措辞收窄：孤立的顺序对调无判别力，判别力来自与单 try 的耦合（`0e1c4cd`）。
3. §9.4「3 例红」收窄为可复算口径（`985d03d`）。
4. `scripts/verify-inventory.mjs` 头部注释删除与 R6 矛盾的「仍会放行」举例（`277b9b4`，代码注释对齐
   已被反例锁定的行为，无行为变更）。
5. P1-09 可执行位段启动器白名单补时态标注（`10bf034`）。
6. §9 末段实测清单补基线时点标注（`a343b52`）。
7. §9.5 自引行号修正（`5883c50`）。

**行号快照提示**（供下一轮复核定位）：§1.1/§9 各条引用的 `GameRoom.ts`、`matchConsumer.ts`、
`verify-inventory.mjs` 行号多为修复前快照（符合文首「写入时快照」口径）。当前位置：cast 容量闸
`GameRoom.ts:1642-1645`、v2 casual/ranked 分支 `matchConsumer.ts:205-207`、accessor 分支
`:171-183`、`emitMatchEvidence` `:271-293`、`scriptEntry` `verify-inventory.mjs:651-656`。

## 11. 第四轮复核（2026-08-30）

复核对象：`0d94f5f..abc2081`（同事第三轮的 1 个代码注释修复 + 6 个措辞/行号更正 + 新增 §10）。
方法同前：四路独立核查 + 每路配一名对抗性反驳者，全部变异只在 `git archive` 一次性副本中进行。

### 11.1 对同事第三轮的判定

- `277b9b4`（注释与 R6 矛盾）**成立且必要**。隔离副本实测：`node --check <entry>` 与
  `bash -c 'true' # <entry>` 都已是 exit 1（旧注释说「仍会放行」为假），`npm exec cowsay <entry>` 仍 exit 0
  （新注释说得准）。纯注释改动，剥掉块注释后两版 md5 相同，`test:inventory` 不变。
  一处归因补正：`bash -c 'true' # <entry>` 被拒的真实机制是 R2 的注释截断（入口 token 随注释消失），
  不是 commit message 说的 R6 flag 黑名单。
- `a1052b8`（证据同 commit）**成立，是对我的有效纠正**：本轮 8 个实现 commit 中 7 个对 `plan-v3.md`
  零改动（仅 `fd35273` 为 6/2），十条证据由 `0d94f5f` 一次性批量回写。我在上一轮写下「自 `c2bf0d2..` 起
  严格执行」，实际未在证据维度做到。已按其登记为本轮粒度偏差。
- `985d03d`（§9.4「3 例红」→「至少 1 例」）**不成立，已回退**：本轮连跑两次稳定复现 **3 例红**并列出
  用例名。那是复现失败导致的去精度，不是更正。
- `5883c50`（§9.5 自引行号 `:400-401` → `:404-406`）**方向对但仍错 1 行**：目标句实际位于 `:405-407`，
  已改正。
- `0e1c4cd`、`10bf034`、`a343b52` 三条措辞/时态标注**成立**，无异议。

### 11.2 §10 的两处收紧

- 「迁移登记链五处一致且**机检通过**」→ 机检实际只覆盖 4/5，`plan.md` 归档头是纯人工约定（实证见 §10）。
- 「plan-v2 的 61 条标签条目零丢失」→ 61 与 §7 的 33 是两个总体，已在 §10 就地澄清。

### 11.3 本轮新发现并修掉的门禁缺陷（同事与我此前都未发现）

五处，全部是我上一轮写的判定逻辑，均在隔离副本实证后逐条独立 commit：

1. `[已完成]` **`npm run X --workspace Y` 冒充 root 命令**（`bfb4303`）：后缀式 workspace 选择器执行的是
   workspace 脚本，段内正则却记成 `root:X`，一条从未被执行的根命令被盖绿章。改为按 token 解析、未知形态
   失败关闭。`-w=Y`、`--prefix Z` 一并堵死。
2. `[已完成]` **单个 `&` 未被当作命令分隔符**（`9c0e47e`）：`tsx smoke.ts & echo <entry>` 里真正被启动的是
   `smoke.ts`，入口只在 `echo` 参数位却判为已启动。排除 `2>&1` 这类重定向。
3. `[已完成]` **heredoc 判定误伤**（`9c0e47e`）：`script.includes("<<")` 是入口处的整串预检，注释里写一句
   `<< EOF` 就会让整条脚本失败关闭。判定移进扫描（引号外、注释外）。
4. `[已完成]` **flag 黑名单漏判**（`13ed37e`）：循环遇第一个非 `-` token 即停，
   `node --import tsx --check <entry>` 因 `--import` 的取值而逃逸。改为扫描入口之前的全部 token。
5. `[已完成]` **`documentedIn` 路径穿越**（`4709711`）：模式判定直接测原始字符串，`docs/../plan-v2.md`
   字面以 `docs/` 开头即放行。改为经 `repoPath` 归一化后再判定。

每条各配反例与只杀它的变异；另加三条正例反向锁（前缀式 `npm --workspace Y run X`、重定向
`tsx <entry> > log 2>&1`、注释内 heredoc），防止收紧过头产生假红。`test:inventory` 60→68。

- `[不阻塞·有意保留]` `>&` / `<&` 的重定向排除**没有**能失败的用例——去掉它之后重定向正例仍绿
  （切出的首段依旧以启动器开头且含入口 token）。它是语义正确性上的防御，不假称已被覆盖。

## 12. 第五轮复核（2026-08-30）

复核对象：`abc2081..df28ef7`（第四轮的 4 个门禁 commit 与 §11 回写）。方法：对抗式独立核查
（含每路反驳者）+ `git archive` 隔离副本实证 + 主树亲手变异推演。

### 12.1 对第四轮的判定

- 四个门禁 commit（`bfb4303`/`9c0e47e`/`13ed37e`/`4709711`）全部成立：声称堵住的形态经隔离副本
  实证全拦，声称放行的形态不误伤，新增 8 条反例无恒真断言，变异杀伤力抽样实证成立。
- §11.1 对第三轮的判定复核：`277b9b4`/`a1052b8`/`0e1c4cd`/`10bf034`/`a343b52` 的更正成立；
  `985d03d` 的回退正确——本轮在主树亲手变异（删 `WebSocketClient.ts:293` 的 `length === 0` 子句），
  恰好 3 例红（含共享 `inst` 级联的两例）。第三轮「仅能定位 1 例」是复核深度不足导致的去精度，
  同事的恢复有理。
- §11.1 对 `5883c50` 的再改正（`:404-406` → `:405-407`）本身仍差 2 行：目标句当前位于 `:409-411`，
  本轮已改正（`20c64b2`）。该行号三改三漂移，根因是文首/前文加段——后续引用文中位置时
  宜同时给出锚句关键词，避免再靠裸行号。
- §11.2 对 §10 的两处就地澄清核实无误（机检覆盖 4/5、61=33+28 口径）；§11.3 末段保留项已改为
  列表项形态（`31e46c6`）。

### 12.2 本轮新发现并修掉的残余假绿（隔离副本逐一实证后修复）

三类，均为「静态分词 vs 真实 shell/node 语义」的系统性残差，各配反例与变异推演、独立 commit：

1. `[已完成]` **CR/Unicode 空白假绿**（`7bec187`）：JS `\s` 是 shell IFS 的真超集，
   `npm run verify:vendor\r`（真实 npm 报 Missing script）与 NBSP 整词（真实 shell 报
   command not found）此前均放行。段尾 trim 与分词改为只认空格/制表符，让异常空白粘附在 token 上
   使命名失配（失败关闭）。两条反例；变异退回 `\s+` → 恰好 2 条红。
2. `[已完成]` **不执行 flag 的粘连形式漏判**（`499129e`）：`node --eval=1 <entry>`、`node -e1 <entry>`
   此前放行。`isNonExecutingFlag` 增加长 flag 的 `=` 粘连与短 flag 的 glued 形式判定。两条反例 +
   一条正例反向锁（`--import tsx` 带取值 flag 不得误伤）；变异退回精确匹配 → 恰好 2 条红。
   实现注记：flag 表必须内联在函数内（模块级 const 会因驱动段先行执行而 TDZ，与启动器表同一约束）。
3. `[已完成]` **重定向目标位伪启动**（`2e4c7cf`）：`tsx smoke.ts >& <entry>` 真正执行的是 smoke.ts，
   入口只是被写文件。`commandInvokesEntry` 增加重定向边界，入口 token 必须在首个重定向算子之前。
   一条反例 + 一条正例反向锁（`tsx <entry> > log`）；变异删掉边界 → 该反例红。

### 12.3 登记的已知边界（不打算修）

- `[不阻塞·有意保留]` 未知 flag 无法静态判定：`node --bogus <entry>` 让 node 拒绝执行但 verifier
  放行；封堵需要一张 node flag 语义表，收益低于维护面。
- `[不阻塞·有意保留]` `npm run -s X`（run 与脚本名之间的中性 flag）真实 npm 会执行 X 而 verifier
  判未覆盖——失败关闭方向，与「宁可红灯不误盖绿章」一致；仓内无此形态，出现时需显式决策。
- §11.3 末的 `>&`/`<&` 排除无反例守卫的声明维持不变（语义正确性防御，不假称被覆盖）。

实测：`test:inventory` 68→75、`verify:inventory` 全绿、`verify:all` 通过（服务端 297/297、
FGUI 50/50）。

## 13. 第六轮复核（2026-08-30）

复核对象：`df28ef7..1e57030`（第五轮的三个门禁修复 + §12 回写）。方法同前：三路独立核查 +
每路配对抗性反驳者，全部变异只在 `git archive` 一次性副本中进行；关键语义一律用**真实 npm /
真实 bash** 实测而非静态推断。

### 13.1 对第五轮的判定

- `7bec187`（token 切分只认 IFS 空白）**方向正确、实现正确、反例非恒真、变异精确**。
  我最初怀疑它会误伤 CRLF 风格的多行 script，实测推翻了这个怀疑：真实 npm 拿到
  `npm run target\r` 报 `Missing script`，多行 CRLF script 整条 exit 0 **却根本没执行那一行**——
  这是最恶劣的一种假绿，门禁判红恰好复现了真实语义。仓内 51 条 script 无一含非空格/制表符空白。
- `499129e`（粘连 flag）**净收益为正但引入一族假红**，见 13.2 第 2 条。
- `2e4c7cf`（重定向边界）**方向正确但覆盖不完整**，见 13.2 第 1 条。
- `20c64b2`（§9.5 自引行号 `:405-407` → `:409-411`）**结论对但归因不准**：我上一轮写下 `:405-407`
  时它确实位于 405-407，是 §12 加段后才漂到 409-411，属文首「写入时快照」口径之内，不是「写错了」。
  该行号已三次漂移，本轮改用**锚句关键词**定位、不再给裸行号，从根上消除漂移。

### 13.2 本轮新发现并修掉的缺陷

1. `[已完成]` **noclobber 与 fd 分配重定向后的入口假绿**（`fe38de4`）：`>|` 是覆盖重定向算子而非管道，
   切段时把 `|` 无条件当管道会让 `>` 留在上一段末尾、重定向目标升格为新段段首，被
   `segmentLeadsWith` 当成「入口自己就是启动器」；`{fd}>` 不以数字开头，逐形态枚举也挡不住。
   `>|` `2>|` `>>|` `{fd}>` 此前全部 exit 0。两处修复缺一不可（实测只改一处都关不掉另一个）。
2. `[已完成]` **sh/bash 短 option 成簇被判未启动（假红）**（`912c311`）：那张 flag 表是纯 node CLI
   语义，被无差别套到 `sh`/`bash` 上。真实 bash 实测 `-ex` / `-eu` / `-e` 都照常执行入口，只有含 `c`
   的簇才把随后的 token 当命令字符串。改为按启动器族分派语义。顺带修掉 `bash -e`/`bash -v`/`sh -h`/
   `sh -p` 这族**精确匹配时代就存在**的同类假红——不是 `499129e` 引入的。
   ⚠ 更正（第七轮）：「只有含 `c` 的簇才把随后的 token 当命令字符串」本身没错，但它暗示的完备性
   不成立——含 `s` 的簇读 stdin（入口退化为位置参数）、以 `o`/`O` 结尾的簇把入口吃成选项值，
   两类入口同样不执行（真实 bash 实测）。已由 `438b852` 补判并配反例与变异推演。

### 13.3 查出但**决定不改**的一处

- `[不阻塞·有意保留]` `executableSegments` 里注释起始判定仍用 JS `\s`，与同文件的 IFS 口径不一致。
  这是真残差，但**方向是假红（失败关闭）且仓内触发面为 0**；而「顺手对齐」成 `/[ \t]$/` 会**制造假绿**——
  实测 `node smoke.ts <NBSP># <entry>` 由正确的红翻成绿，因为 `<NBSP>#` 变成普通 token 后入口落进
  「入口出现在参数位仍放行」这条已登记边界。已在代码就地写明「刻意宽于 IFS、不要对齐」及其实测依据；
  真要对齐必须先收紧参数位判定。

### 13.4 仍登记的已知边界

- `[不阻塞·有意保留]` 重定向**前置**于入口的 `tsx > log <entry>`、`tsx 2>/dev/null <entry>` 判未启动
  （真误伤，失败关闭方向）；`echo a \>| tsx <entry>` 因守卫读原始字符而判红，与既有 `&` 守卫同源同形。
- `[不阻塞·有意保留]` 未知 flag（`node --bogus <entry>`）无法静态判定语义；`npm run -s X` 判未覆盖
  （真实 npm 会执行 X），均为失败关闭方向。
- §11.3 的 `>&`/`<&` 排除无反例守卫、§12.3 各条维持不变。

实测：`test:inventory` 75→80、`verify:inventory` 全绿。

## 14. 第七轮复核（2026-08-30）

复核对象：`1e57030..505283d`（第六轮的 2 个门禁 commit 与 §13 回写）。方法同前：对抗式独立核查 +
隔离副本实证 + 真实 bash 实测。

### 14.1 对第六轮的判定

- `fe38de4`（noclobber + fd 分配重定向）**成立**：四处形态在父 commit 副本实证全 exit 0、HEAD 全红；
  两半修复缺一不可的声称经变异实证。残留一族语法错误型假绿（`>&|`、`> |`），本轮修掉（`9aa7cca`）。
- `912c311`（启动器族分派）**方向正确但分派表不完备**：修掉的 sh/bash 假红属实；但簇含 `s`（读 stdin，
  exit 0 静默假绿）与簇以 `o`/`O` 结尾吃入口当选项值两类漏判，本轮修掉（`438b852`）。§13.2 第 2 条的
  过度概括已就更正。
- `505283d`（§13 回写 + 注释刻意不对齐的就地锁）**成立**：NBSP# 声称经变异实证；快照数字与实测一致；
  第五轮三类修复无回归。§13.4 的已知边界清单不完整（缺本轮两族），由本节承接。

### 14.2 本轮新发现并修掉的缺陷

1. `[已完成]` **shell 簇的 -s/-o/-O 漏判**（`438b852`）：见 §13.2 第 2 条更正。两条反例
   （`bash -s`、`bash -o` 吃入口）+ 正例反向锁（`bash -euo pipefail`）；变异三条各自精确杀死对应用例。
2. `[已完成]` **`|` 切段守卫只看紧邻前字符**（`9aa7cca`）：`>&|` 与 `> |`（带空格）在真实 bash 均为
   语法错误、入口不执行，此前被当管道切段使入口升格为段首而假绿。改为看前一个非 IFS 空白字符，
   属于 `>`/`<`/`&` 即不切段。两条反例；变异退回旧守卫 → 恰好 2 条红。

### 14.3 仍登记的已知边界

- `[不阻塞·有意保留]` §13.4 各条维持不变；`node --bogus <entry>` 等未知 flag 仍无法静态判定。
- ⚠ 更正（第八轮）：「新增边界为零 / 已构造的绕过形态无一残留」不成立——`-o`/`-O` 出现在簇的
  **中间**（`bash -oe <entry>`）当轮仍是假绿，见 §15.2。该结论应表述为「已构造的**这批**形态无残留」，
  而不是全域无残留。

实测：`test:inventory` 80→85、`verify:inventory` 全绿、`verify:all` 通过。

## 15. 第八轮复核（2026-08-30）

复核对象：`505283d..45fd1b3`（第七轮的 2 个门禁 commit + §14 回写）。

### 15.1 对第七轮的判定

- `9aa7cca`（`|` 切段守卫看前一个非 IFS 空白字符）**成立**。我用真实 bash 逐条验证了它的前提：
  `echo a > | cat`、`< | cat`、`2> | cat`、`echo a & | cat` **全部是语法错误**；而
  `echo a > x | cat`、`echo a >| x`、`echo a | cat` 正常。守卫只在 `|` 前的非空白字符恰为
  `>`/`<`/`&` 时抑制切段，真实管道不受影响——已实测 `tsx <entry> | tee log` 仍放行。
- `438b852`（shell 族补 `-s`/`-o`/`-O`）**方向正确但规则不完备**，见 §15.2。
- `56e2ecb`（更正 §13.2「只有含 `c` 的簇」的过度概括）**成立**，我接受：那句话确实暗示了不存在的完备性。

### 15.2 本轮新发现并修掉的缺陷

1. `[已完成]` **`-o`/`-O` 在簇中间时漏判**（本轮 commit）：`438b852` 只判「簇以 `o`/`O` 结尾」，
   于是 `bash -oe <entry>` 放行。真实 bash 实测 `-oe` / `-eo` / `-xo` / `-ox` **一律**报
   `invalid option name <entry>`——`-o` 无论出现在簇的哪个位置都吃掉下一个 token 当选项值，
   入口从未执行。改为簇内任意位置命中；`-o errexit <entry>` 因选项值另有其词、`nextIsEntry` 为 false
   而不受影响。一条反例，两条变异（回退成「以 o 结尾」→ 新反例红；去掉 `nextIsEntry` → 既有
   `-o errexit` 正例反向锁红）。

### 15.3 全矩阵一致性实测（本轮方法升级）

不再只构造「我想得到的绕过」，而是把每种形态**同时**打给门禁与真实解释器，逐条比对两者是否一致：

- **bash 21 种形态**（`-s -es -o -O -oe -eo -xo -ox -c -ce -ex -eu -e -v -h -x`、`-o errexit`、
  `-O expand_aliases`、`--help`、`--version`、裸调用）：**零背离**。
- **node 17 种形态**（裸调用、`--check`、`-c`、`--eval=1`、`-e1`、`-p1`、`--print=1`、`-v`、
  `--version`、`-h`、`--help`、`--import tsx`、`--enable-source-maps`、`-r tsx/cjs`、
  `--env-file=.env`、`--import tsx --check`、`-C production`）：**零背离**。
  过程记录：`--import tsx` / `-r tsx/cjs` / `--env-file=.env` 三条初测显示「门禁放行、真实未执行」，
  复查发现是探针临时目录缺 `tsx` 与 `.env` 所致的**环境假象**；在依赖齐备的目录下三者均真实执行入口，
  门禁放行正确。这条弯路值得记：判定「门禁错了」之前必须先排除探针自身的环境缺陷。

### 15.4 仍登记的已知边界

- `[不阻塞·有意保留]` §13.4 与 §14.3 各条维持不变（更正后的表述见 §14.3）。
- `[不阻塞·有意保留]` 「零背离」只覆盖上述 38 种**已构造**形态，不是全域证明；shell/node 的 flag 语义
  没有可枚举的完备边界，真解析器才能根除。后续新增启动器或 flag 形态时必须重跑该矩阵。

## 16. 第九轮复核（2026-08-30）

复核对象：`45fd1b3..44aa0f3`（第八轮的 1 个门禁 commit 与 §15 回写）。方法：对抗式独立核查 +
隔离副本实证 + **真实 bash marker 矩阵**（26 个放行形态逐一验证 EXEC、14 个拒绝形态逐一验证 NOEX）。

### 16.1 对第八轮的判定

- `deb9ec0`（`-o`/`-O` 簇内任意位置吃掉入口）**成立**：真实 bash 逐条复测成立（`-oe`/`-eo`/`-xo`/`-ox`
  一律 `invalid option name`；`-o errexit`/`-euo pipefail`/`-O expand_aliases` 正例不误伤；粘连形
  `-oerrexit` 在 bash 3.2 也是吃下一个 argv）。两条变异声称经隔离副本抽样实证。环境 caveat：
  只实证到 bash 3.2 族（本机无 bash 5.x/dash），但与作者实测环境相同。
- `44aa0f3`（§15 回写 + §14.3 全域主张更正）**成立且克制**，我接受对第七轮「无一残留」全域表述的
  更正；§15.3 的「同时打给门禁与真实解释器逐条比对」方法升级与本章复查弯路记录均属实。
- §15.4 的「未知 flag 无法静态判定」**框定不准**：本轮新找到的三族（`-s`/`-n`/`-D` 系）全是语义
  **已知**但没进表的 flag，不是无法判定。该措辞掩盖了真实残余面；白名单化（§16.2）后此框定自然失效。

### 16.2 本轮新发现并修掉的缺陷

1. `[已完成]` **sh/bash 黑名单打地鼠残余三族静默假绿**（`a4738ea`）：`+s` 簇（读 stdin）、`-n`
   （noexec）、`-D`/`--dump-strings`/`--dump-po-strings`（dump 隐含 noexec）、`-t`（执行一条即退）
   均为 rc=0 静默假绿，严重级高于第八轮修的响亮自爆族。改为白名单失败关闭（机制与实证矩阵见
   `a4738ea` commit message；原 `[csntD]` 显式规则经变异证明被白名单兜底覆盖，已简化并如实记录）。
   反例五条 + 正例锁三条；变异四组各自杀死对应用例。

### 16.3 仍登记的已知边界

- `[不阻塞·有意保留]` 白名单外的**合法** flag（如 `-E`/`-P` 已在表内，将来新增 shell flag）一律
  判未启动——失败关闭方向，出现时需显式加入白名单并配正例锁。node/tsx 族保持黑名单+粘连判定不动
  （§15.3 的 17 形态零背离矩阵仍成立，本轮无回归）。
- 重定向前置、`--bogus` 等既登记各条维持不变；语法错误型输入（`>&|`、`> |`）已由 `9aa7cca` 收口。

### 16.4 仓库卫生

- 根目录有一个未跟踪的 2 字节文件 `x`（内容 `a`，17:41 创建，系第八轮重定向实验的残留物）；
  未入库、无影响，未代为删除，由作者自行清理。

实测：`test:inventory` 86→94、`verify:inventory` 全绿、`verify:all` 通过。

## 17. 第十轮复核（2026-08-30）

复核对象：`44aa0f3..9e89c3d`（第九轮的白名单化改造 + §16 回写）。
本轮同时按用户指示把复核**方法本身**固化成工具，不再每轮手工跑矩阵。

### 17.1 对第九轮的判定

- `a4738ea`（sh/bash 从黑名单改白名单失败关闭）**方向正确，是这条判定线上最该做的一次改造**。
  黑名单打地鼠追不上 `+s` / `-n` / `-D` / `-t` 这类 rc=0 静默假绿，白名单把默认姿态反了过来。
  我逐字符实测了白名单全部 20 项（`exuvfabmhirlEP` 14 个短选项 + 6 个长选项），**无一误列**。
- §16.3 已正确预判了白名单化的代价：「白名单外的**合法** flag 一律判未启动——失败关闭方向，
  出现时需显式加入白名单并配正例锁」。本轮查出的正是这条边界的具体实例，见 17.2。

### 17.2 工具当场查出的假红

`SAFE_SHORT` 过窄，三族**合法且会执行入口**的形态被判未启动（逐条经真实 bash marker 实测）：

1. `[已完成]` 短选项 `-k -p -B -C -H -T` 六者不在白名单，实测全部照常执行入口。
2. `[已完成]` `+` 簇被一律拒绝，但 `+` 是**关闭**该选项：`+e` / `+x` / `+u` / `+ex` 都执行入口，
   只有 `+s` 走 stdin。改为沿用同一张白名单判定。
3. `[已完成]` `+o errexit` 与 `-o errexit` 同样只是吃掉选项值，应放行。

修复后 **70 种形态（bash 56 + node 14）零背离**（拆分系回写时笔误，总数 70 不变；
第十四轮 `bd1c481` 又增 1 个 shell 诱饵形态，当前为 71 = bash 57 + node 14）。

### 17.3 方法固化：`test:launcher-matrix`

新增 `scripts/launcher-matrix.test.mjs` 与根命令 `npm run test:launcher-matrix`，并入 `verify:core`。

对每种形态**同时**问两边：门禁怎么说（写进 fixture 的 `scripts.relayer` 跑 `verify-inventory --root`）
vs 真实解释器怎么做（同样的 flag 跑只打 marker 的入口）。两者不一致即失败，并报出是假绿还是假红。
新增启动器或 flag 形态时往 `CASES` 加一行即可。

两个设计点值得记：
- **marker 放在入口第二行**，衡量的是「入口被跑完」而不是「跑了第一条命令」。`bash -t` 只执行第一条
  就退出，按这个口径如实记为未启动，与门禁一致——口径写进用例的 `note`，不靠读者猜。
- **两条判别力用例**：分别证明「门禁侧」与「探针侧」都不是恒真，否则主用例会退化成空跑。
  这正是前几轮反复踩到的坑（第八轮那次「三条假绿」实为探针缺依赖的环境假象）。

变异推演用矩阵自身度量：回退 `SAFE_SHORT` → 6 种背离；`+` 簇一律拒绝 → 5 种；簇判定全放行 → 7 种。

### 17.4 登记链的自证

新命令按仓内既有闸逐层登记：`verify-inventory` 要求它进 AGENTS/CLAUDE/README 命令表；
`verify-toolchain` 要求 `verify:core` 的聚合命令必须登记且脚本正文精确匹配。后者在我漏登记时
**当场把 `test:client` 打红**——这是前几轮建的那套登记机器正常工作的直接证据，如实记录。

### 17.5 仍登记的已知边界

- `[不阻塞·有意保留]` §16.3 各条维持不变：白名单外的新增 shell flag 仍一律判未启动，需显式入表并配锁。
- `[不阻塞·有意保留]` 矩阵覆盖的是 `CASES` 里**已构造**的 70 种形态，不是全域证明。它把「想不到的形态」
  从**盲区**变成了**已登记的空白**——加一行就能覆盖，但没加的仍然没覆盖。
- ~~`commandReferences` 尚无同类「vs 真实 npm」矩阵~~ —— 已于第十一轮补上，见 §18。

## 18. 第十一轮：`commandReferences` vs 真实 npm 矩阵（2026-08-30）

§17.5 把这条列为「下一个可固化的方向」，本轮做掉。两张矩阵现在分守判定链的两端：
`launcher-matrix` 守 `commandInvokesEntry`（launch 判定），`npm-reference-matrix` 守
`commandReferences`——后者经 `commandCovers` 喂给 `supersededBy` 与 `verification.requires`
两个登记性断言，判错的后果是**给一条从未被执行的命令盖绿章**。

### 18.1 机制

- **真实侧**：一个最小 npm workspace 探针，root 与 workspace 各有一个**同名**目标脚本，
  靠 marker 区分究竟哪一个被执行。同名是关键——`npm run X --workspace Y` 与
  `npm --workspace Y run X` 的区别只在「跑了哪一个 X」，不同名就测不出来。
- **门禁侧**：借用仓内两处真实登记分别探两条判定——`verify:core` requires `root:verify:vendor`
  探 root 引用，`start:server` supersedes `@game/server#start` 探 workspace 引用。
- 判定三态（root / workspace / none）而不是布尔：只判「有没有引用」会漏掉**记错目标**这一类，
  而那正是本轮查出的缺陷所在。

### 18.2 工具当场查出的假红

`[已完成]` **后缀 workspace 选择器被整条丢弃**：`npm run X --workspace Y`（以及 `-w Y`、`-w=Y`）
真实 npm 跑的是 **workspace** 脚本，门禁却既不算 root 调用也不算 workspace 调用。
根因是第四轮把正则捞取改成 token 解析时，我对 `run` 之后的未知 flag 一律失败关闭，把后缀选择器
一并丢了。当时的判断「后缀式写法挡不住，一律失败关闭」只对了一半：**挡不住的是 `--prefix` 这类
语义不可静态判定的形态，而 workspace 选择器的语义是明确的**，实测两种写法等价，应当解析出来。
`--prefix Z` 仍然失败关闭。

### 18.3 有意背离的钉法

两类已登记背离用 `failClosed` / `staticBlind` **显式钉在表里**，而不是从表里删掉：
`npm run -s X` 真实执行但门禁判未覆盖（失败关闭）；`false && npm run X` 真实不执行但门禁仍算
覆盖（shell 可达性静态不可判定）。矩阵对这两类断言的是「背离仍然存在且方向不变」——将来谁把它们
「修好」了这里会红，提醒同步更新边界登记。这比把它们从表里删掉强：删掉就没人记得还有这回事。

### 18.4 一条如实记录的未覆盖变异

把 `npmRunReference` 的 `tokens[0] !== "npm"` 段首锚点放宽成 `tokens.includes("npm")`，矩阵**不红**。
原因是扫描循环的「未知 token 即失败关闭」已经把它 subsume 了：任何非 npm 开头的形态都会在
`run` 之前撞上未知 token 而返回 null。该锚点是纵深防御而非独立判定，不假称被覆盖。

### 18.5 边界

- `[不阻塞·有意保留]` 覆盖 `CASES` 里已构造的 15 种形态，不是全域证明——与 §17.5 同一口径。
- `[不阻塞·有意保留]` 探针不跑 `npm install`：`npm run` 解析 workspaces 不需要先安装依赖，
  但因此**只能测脚本解析语义**，测不到依赖安装后才出现的行为差异。
- ~~两张矩阵都只覆盖 `verify-inventory` 这一条链~~ —— `verify-toolchain` 的聚合链与 `sync-*` 的
  镜像判定已于第十二轮补上同类矩阵，见 §19。

## 19. 第十二轮：给 verify-toolchain 与 sync 补同类矩阵（2026-08-30）

§18.5 把这两条列为「还没有同类矩阵」的边界，本轮做掉。四张矩阵现在的分工：

| 矩阵 | 守的判定 | 地面真相 |
|---|---|---|
| `test:launcher-matrix` | `commandInvokesEntry`（launch） | 真实 bash / node 是否执行入口 |
| `test:npm-reference-matrix` | `commandReferences`（覆盖判定） | 真实 npm 跑的是 root 还是 workspace 脚本 |
| `test:aggregate-chain-matrix` | `verify-toolchain` 的四张聚合链声明表 | 真实 npm 的**执行序列** |
| `test:sync-mirror-matrix` | `sync-*.mjs --check` | 真的跑一次同步，**镜像树变没变** |

### 19.1 聚合链矩阵

`verify-toolchain` 按 `&&` 切分 script 文本与声明表做集合与顺序比对——守的是「文本长得像声明」，
不是「跑起来真的会执行」。矩阵把链条文本**原样**搬进探针 workspace，把它引用的每条子命令换成只打
marker 的桩，真的 `npm run`，按顺序收集 marker，与从 `verify-toolchain.mjs` **解析出来**的声明表
逐项比对（顺序也算——短路会让后半截 marker 消失）。声明表直接读源文件而不复制一份，避免两边各自漂移。

两个实现细节值得记：桩必须全部 exit 0（`&&` 短路会把「后面没跑」误报成声明不符）；inline 桩要把
marker 拆开拼接，因为 npm 执行前会**回显命令行**，marker 字面量出现在命令行里会被数两次。

**一条自己发现并补上的缺口**：探针替所有子命令生成桩，因此它证明不了「这些命令在真实仓库里存在」。
实测把 `scripts.verify:ecs` 删掉后，链条文本不变，**主用例与 `verify-toolchain` 双双放行**。
补了独立用例，校验声明表每条命令在真实 `package.json` / workspace / 文件系统中可解析。

### 19.2 sync 镜像矩阵

`--check` 只读判定、不带参数真的同步。`verify:sync` 消费前者，而开发者相信的是
「红灯 ⟺ 我需要去跑一次 sync」——这条等价关系此前无人守着，`--check` 可以在任意方向上说谎。

地面真相刻意**不是**再实现一遍判定逻辑（那只是拿判定验判定），而是文件系统的可观测效果：
镜像树的「路径 → 内容哈希」快照 → 真的跑一次同步 → 再快照 → 看树变没变。默认断言
「`--check` 红 ⟺ 同步会改动镜像」，并额外断言**收敛性**：同步之后 `--check` 必须转绿，
否则「跑一次 sync 就好」这句话就是假的。

13 个场景（shared 6 + client 7）：原样、镜像文件被改坏 / 被删、孤儿文件、源目录新增未同步、
警示 README 被改，以及 client 侧的 `.meta` 场景。

两处踩坑写进了注释：夹具必须 `git init`（`sync-client --check` 用 `git ls-files` 判 `.meta`，
非 git 目录直接抛错而不是给判定）；`.meta` 规则判的是 **git index** 而不是工作树——从磁盘删掉
`.meta` 不触发它，真正的失效形态是「文件入库了但 `.meta` 没入库」，要用 `git rm --cached` 构造。
我第一版就写错成删磁盘文件，矩阵当场把它报成「判定=绿 期望=红」。

### 19.3 有意背离的钉法（与 §18.3 同一姿态）

`.meta` 由 Cocos 编辑器生成，同步脚本补不了，于是 `--check` 红而同步无改动。这条登记在
`syncCannotFix` 里而不是从场景表里删掉：将来谁让同步能补 `.meta` 了，矩阵会红并提醒同步更新登记。

### 19.4 边界

- `[不阻塞·有意保留]` 四张矩阵覆盖的都是各自 `CASES` / `SCENARIOS` 里**已构造**的形态，
  不是全域证明——与 §17.5 同一口径。
- `[不阻塞·有意保留]` 聚合链矩阵的桩是**叶子**：`verify:core` 引用的 `npm run typecheck` 只打一个
  marker、不再展开，因为声明表描述的就是直接子命令。跨层的执行关系不在覆盖范围内。
- ~~sync 矩阵的夹具排除 `.env*`，因此 `sync-client` 的 `devEnv.ts` 生成走的是
  无 `.env.development` 的默认分支；`.env` 变体下的行为差异未覆盖~~ —— 已于第十四轮修掉
  （`9eca872`：夹具只排除含密钥的 `.env` 本体，`.env.development` 随夹具带走，并新增
  「PORT 改值后 .env 与两端生成物一致」场景）。注意原措辞还低估了风险：那不是「未覆盖」，
  而是合法改 PORT 会被假红。
- ~~`verify-toolchain` 的非链条检查没有「vs 真实运行时」矩阵~~ —— 已于第十三轮补上，见 §20。

## 20. 第十三轮：给 verify-toolchain 的非链条检查补矩阵（2026-08-30）

§19.4 最后一条边界。补完之后，`verify-inventory` / `verify-toolchain` / `sync-*` 三条门禁的
主要判定面都有了各自的「vs 真实行为」矩阵：

| 矩阵 | 守的判定 | 地面真相 |
|---|---|---|
| `test:launcher-matrix` | `commandInvokesEntry` | 真实 bash / node 是否执行入口 |
| `test:npm-reference-matrix` | `commandReferences` | 真实 npm 跑的是 root 还是 workspace |
| `test:aggregate-chain-matrix` | `verify-toolchain` 四张聚合链表 | 真实 npm 的执行序列 |
| `test:sync-mirror-matrix` | `sync-*.mjs --check` | 真跑一次同步，镜像树变没变 |
| `test:toolchain-runtime-matrix` | `verify-toolchain` 的非链条检查 | 正在跑的 Node + 实际安装的依赖版本 |

### 20.1 这条为什么值得单独守

`verify-toolchain` 的非链条部分全是**声明之间互相比对**：读 `package.json`、`.node-version`、
`package-lock.json`，从不看正在跑的 Node，也从不看 `node_modules` 里真正装着什么。
「声明自洽」与「装出来的东西符合声明」是两件事——前者绿不代表后者成立。

### 20.2 它当场查出的真实漂移

落地当天矩阵就报红：本机 root `node_modules/@types/node` 装的是 **26.1.1**，而 lockfile 与
声明范围都是 **22.x**（`npm ls` 自己标 `invalid: "^22.13.14" from the root project`），
`apps/server` 的嵌套副本才是 22.20.1。`verify-toolchain` 全绿——它只比对声明，看不见安装态。

后果不是抽象的：客户端那条 typecheck 走 root 提升的 `@types/node`，也就是**一直在按 Node 26
的类型面校验一个声明目标为 Node 22 的仓库**，Node 22 上不存在的 API 不会被拦住。
`npm ci` 复原到 22.20.1 后全门禁复跑仍然全绿——说明这次漂移尚未掩盖任何真实破损，但它确实是
这条门禁本该拦住的那一类。

**一条弯路记在这里**：我第一次在临时目录跑 `npm ci` 验证 lockfile 是否自洽时失败了，
错误指向一个不存在的 temp 路径下的 `vendor/*.tgz`。差点据此判定「lockfile 钉了机器相关的绝对
路径」——实际是**我的探针只拷了 package.json 系列文件、没拷 `vendor/`**，而 lockfile 里那条
`file:vendor/…tgz` 是**相对路径**且 tgz 已入库。补拷 `vendor/` 后 `npm ci` 一次通过。
与第八轮那次「三条假绿实为探针缺依赖」同一类错误：判定「仓库错了」之前必须先排除探针自身缺陷。

### 20.3 设计取舍

- **semver 判定独立实现**，不复用 `verify-toolchain.mjs` 的——拿被验对象自己的判定去验它自己
  是同义反复。只支持仓内实际出现的 `>=X` 与 `^X.Y.Z` 两种形态，遇到没见过的形态**抛错**
  而不是静默放行（配了专门的用例锁这条）。
- **判定写成纯函数** `divergences(inputs)`：既用真实值跑（应为空），也用构造值跑五种背离
  （应精确命中）。否则「真实恰好全绿」会让用例变成空跑——这是前几轮反复踩的坑。
- **刻意不断言「正在跑的 Node 主版本 == `.node-version`」**：契约是 `engines.node`（`>=22`），
  `.node-version` 只是给版本管理器的钉子。本机跑 Node 25 满足契约却不等于 22，断言相等会让
  任何没精确切到 22 的开发机变红。登记为边界而非失败。

### 20.4 边界

- `[不阻塞·有意保留]` 只覆盖 `ROOT_TOOL_DEPENDENCIES` 三项（`@types/node` / `tsx` / `typescript`）
  的安装态，不校验整棵依赖树；`npm ls` 级别的完整性仍无矩阵。
- `[不阻塞·有意保留]` 只看 root `node_modules` 的提升结果，不逐 workspace 校验嵌套副本——
  本轮漂移恰好是「root 与 apps/server 装了不同版本」，矩阵是靠 root 侧违反声明范围抓到的，
  不是靠比对两个副本。嵌套副本一致性未覆盖。
- `[不阻塞·有意保留]` 运行时侧只断言满足 `engines.node`，不断言等于 `.node-version`（见 20.3）。

## 21. 第十四轮复核（2026-08-30）

复核对象：`9e89c3d..9eba002`（「判定 vs 真实解释器」矩阵的固化：5 个测试套件入 `verify:core`、
四轮回写）。方法：三路对抗式独立核查（矩阵工具、工具链/同步矩阵、登记一致性）+ 全量基线实测。

### 21.1 对第十至十三轮的判定

- `78bfd1c`/`55f3b2c`/`05f872d`/`90cadd6`/`1385c23` **全部成立**：矩阵以黑盒进程调用生产脚本
  （无第二真源）、反恒真用例在位、夹具 mkdtemp 卫生无残留、无网络依赖；声称的两个修复
  （白名单假红、后缀 workspace 假红）经真实 bash/npm 复测成立。`verify:all` 全链实测
  1m42s（矩阵约占 25s），可接受。
- §17/§18/§19/§20 回写与代码现状一致，唯一笔误是 §17.2 的形态拆分（bash 54+node 16 → 实为
  56+14），已更正（`a773756`）。

### 21.2 本轮新发现并修掉的缺陷（各自独立 commit）

1. `[已完成]` **toolchainContract 的第三份复制件已实际漂移**（`5648579`）：缺 5 条矩阵命令，
   「逐条删除必红」用例对 verify:core 段失去判别力；verify-toolchain 声明表全部 export、
   测试一律 import。顺带修掉夹具缺 5 条精确脚本致反例空转（补 `assertFixtureGreen` 基线钉）
   与 macOS tmpdir 符号链接使补丁副本空转（`writePatchedVerifier` 改写驱动调用）两个未申报问题。
2. `[已完成]` **运行时矩阵的 `TOOL_DEPENDENCIES` 复制件**（`9177d21`）：改 import 单源；
   变异（加第 4 个工具依赖）三处同步变红。
3. `[已完成]` **npm pre/post 生命周期钩子对链条门禁与矩阵双双隐身**（`551b8c1`）：被闸命令的
   `pre*`/`post*` 变体出现即拒；三形态反例 + 变异。
4. `[已完成]` **shell 入口前的位置参数假绿**（`bd1c481`）：`bash decoy.sh <entry>` 真实执行的是
   decoy。白名单分支先拒入口前操作数；单测反例 + launcher 矩阵 decoy 形态，变异双红。
5. `[已完成]` **sync 矩阵夹具排除 `.env*` 导致 PORT 假红**（`9eca872`）：只排除含密钥的 `.env`
   本体，新增 PORT 一致场景；§19.4 原措辞「变体未覆盖」低估了风险（实为假红），已就地更正。
6. `[已完成]` **npm 引用矩阵探针污染环境**（`7ee54e8`）：cache/userconfig 隔离进临时目录。
7. `[已完成]` **OVERVIEW §3.2 机检表缺五张矩阵行**（`26bf8c9`）。

### 21.3 仍登记的已知边界

- `[不阻塞·有意保留]` node/tsx 同族操作数缺口：`node decoy.mjs <entry>` 同样假绿，但 node 取值
  flag 元数表更大（`--import`/`-r`/`--env-file` 等），本轮不修，出现真实需求时先建元数表再判。
- `[不阻塞·有意保留]` 失败关闭方向的假红：`bash --debugger <entry>`、`npm run --workspace Y X`
  （选择器在 run 与脚本名之间）、双 `--workspace` 写法。
- `[不阻塞·有意保留]` staticBlind 只钉了 `false &&` 一族；`exit 0; npm run x` 同类未入矩阵。
- `[不阻塞·有意保留]` 聚合链矩阵的桩是叶子（全成功路径前提）；钩子检查只覆盖根 package.json，
  workspace 级钩子不在内；launcher 矩阵每次全量拷贝 node_modules（约 9s），日后变胖再改单夹具复用。

实测：`verify:all` 通过（服务端 297/297、客户端 258/258、FGUI 50/50、五矩阵 3/2/4/3/3）、
`test:inventory` 95/95、`test:int` 154/154（本地栈）。

## 22. 第十五轮复核（2026-08-30）

复核对象：`9eba002..5b75b3d`（第十四轮的七个修复 + §21 回写）。方法同前：三路独立核查 +
每路配对抗性反驳者，全部变异只在 `git archive` 隔离副本里进行。

### 22.1 对第十四轮的判定

七个修复**全部成立**，其中三条我逐条实证复现了它们声称的缺陷：

- `5648579`（消除第三份复制件）**是本轮最有价值的一条**。我实证 `5648579^` 里
  `toolchainContract.test.ts` 的那份 `VERIFY_CORE_COMMANDS` 副本对五条矩阵命令**一条都没有**
  （`grep -c` = 0），而它正是「逐条删除 :core 命令必红」用例的输入——判别力名存实亡。
  这条复制件是我在前六轮里陆续加进 5 条矩阵命令时**从未注意到**的。
- `551b8c1`（pre/post 钩子）前提属实：真实 npm 实测 `pretarget → target → posttarget` 依次执行，
  钩子既不在 `&&` 链文本里、也不被聚合矩阵覆盖，两边都看不见。
- `bd1c481`（shell 操作数）前提属实：`bash decoy.sh <entry>` 实测只跑 decoy。
- `9eca872` 纳入 `.env.development` 的安全性我逐行核过：34 行里**生效行恰好 1 条**
  （`PROJECT_ID=gono`，非密钥），三条像密钥的行全部是注释；`.env`（未入库）仍双重排除。
- `a773756` 的计数更正正确：我实算当前 `CASES` 为 shell 57 + node 14 = 71，与其 §21 注一致；
  我原来写的「bash 54 + node 16」确实是错的。

### 22.2 本轮查出并修掉的四条

1. `[已完成]` **`--` 之后的操作数假绿**（`c2d714b`）：`bd1c481` 的操作数判定只挡不以 `-`/`+`
   开头的 token，于是 `bash -- -x <entry>`、`bash -- -- <entry>` 漏网——`--` 之后的第一个操作数
   **就是**脚本名，这条对以 `-` 开头的操作数同样成立。同族的 `node -- decoy.mjs <entry>` 与
   `node decoy.mjs <entry>` 一并修掉。`--` 判定提到循环体开头两族共用。
   node 侧只判 `i === 1` 这个零元数位置；更靠后的位置需要 node 的取值 flag 元数表（60+ 项且
   随版本漂移），登记为已知边界。§21 的「node 同族整体不修」据此收窄。
2. `[已完成]` **承重钉只钉了 6/16**（`4d656a7`）：其余 10 条（含铁律 1 的唯一守门命令
   `npm run verify:ecs`）仍可被声明表与链合谋同删而全仓全绿。补齐 16 条并改双向 `deepEqual`。
   **注释里写死了「这份清单是刻意保留的第二份副本、禁止改成 import」**——否则下一轮复核会把它
   当成刚被 `5648579` 清掉的那种复制件再删一次。单源化解决的是「无人比对的副本」，
   不是「所有副本」；这份靠双向相等守着，是有守门的第二锚点。
3. `[已完成]` **PORT 正例对新鲜度检查恒真**（`6caead9`）：`9eca872` 新增的正例锁的是
   「合法同步状态不得假红」，这个价值成立，但删掉 devEnv 新鲜度检查它照样绿——即正例对
   生产侧检查无判别力（⚠ 十六轮更正：原句「原 commit 声称的变异是循环论证」定性过重——
   9eca872 的变异（回退排除行→新场景因夹具缺文件而红）对它自己的夹具改动是有效的，
   只是证明不了正例对生产检查的判别力）。补一条负例，端口值从夹具里**已生成的** `devEnv.ts`
   读出当前生效值再取不同值（读可观测产物，不是拿 `devenv-gen` 验 `devenv-gen`），且用
   **prepend**——`.env` 的语义是「同名键第一条声明生效」，append 在已设 `PORT` 的开发机上
   会让负例失去判别力（矩阵报「判定=绿 期望=红」的误导性背离，而非负例想测的真实漂移）。
4. `[已完成]` **小写 `npm_config_userconfig` 残余通道**（`891207c`）：`7ee54e8` 只写了大写，
   压不住环境里已存在的小写键（外层 `npm run` 会把用户 npmrc 的值再导出成 `npm_config_*`）。
   实证未闭合时该环境变量会让矩阵 2 条全红。失败方向是失败关闭的假红而非假绿，定级低，
   但闭合成本一行。

### 22.3 边界更新

- `[不阻塞·有意保留]` node/tsx 的取值 flag 元数表未抄进门禁：`node --require ./decoy.cjs decoy.mjs
  <entry>` 这类「入口在取值 flag 之后的更靠后位置」仍是假绿。§21 原登记的「node 同族整体不修」
  收窄为这一条。
- `[不阻塞·有意保留]` 引号/转义折叠后的 token 一律失败关闭：`bash "-x" <entry>` 实测入口会执行
  却判红（假红）。爆炸半径为零（仓内 package.json 无引号 flag），且同一次折叠把对称的假绿
  （`bash "decoy.sh" <entry>`）关掉了，方向正确。
- `[不阻塞·有意保留]` `551b8c1` 的钩子规则只覆盖**根** `package.json`；workspace 级钩子
  （`apps/server` 的 `pretest`）仍不受检——§21 已登记，本轮实证复现确认。
- ~~承重钉只覆盖 `verify:core` 一条链，另三条零兜底~~ —— 已于第十七轮把承重钉推广到全部四条链，
  见 §24.2。

## 23. 第十六轮复核（2026-08-30）

复核对象：`5b75b3d..ffba44f`（同事第十五轮的 4 个修复 commit + §22 回写，以及同事对第十四轮
各修复的五条实证验证）。方法：对抗式独立核查 + 真实 bash/node/npm 实测 + 隔离副本变异实证。

### 23.1 对第十五轮的判定

- 同事的 4 个修复 commit **全部成立**：`c2d714b`（`--` 后操作数与 node 紧跟操作数）语义经真实
  bash/node 逐条复测、隔离副本证实父 commit 假绿/HEAD 红、两条变异各精确杀死对应形态；
  `4d656a7`（承重钉 16 条双向相等）合谋同删 verify:ecs/verify:perf 各恰好 1 红实证成立，
  「刻意保留第二份副本、禁止改 import」的注释立论成立；`6caead9`（PORT 负例）的 prepend
  必要性与「读可观测产物而非拿生成器验生成器」成立；`891207c`（小写 userconfig）的
  npm 键优先级实证成立。
- 同事对第十四轮修复的五条验证（5648579 旧复制件 grep=0、551b8c1 钩子实测、bd1c481 decoy 实测、
  .env.development 安全性逐行核、a773756 计数复算）**全部属实**。
- §22.3 的「三条链仍只有 inventory 交叉锚定这一层兜底」**不实**：这三条链实为零兜底（requires
  空或未登记），已更正。§22.2 两处定性偏重（「循环论证」「空跑」）已按实证收窄。

### 23.2 本轮新发现并修掉的缺陷（各自独立 commit）

1. `[已完成]` **`node - <entry>`（stdin 脚本）假绿**（`ddacb69`）：裸 `-` 以 `-` 开头逃过 i===1
   的非 flag 判定。第一人称实测纠正族间差异：bash 的 `-` 是选项终止符（入口照常执行），
   只在 node/tsx 分支补判。矩阵 +3 形态（75→78），变异双红。
2. `[已完成]` **`npm_config_globalconfig` 同形通道未闭合**（`3de949b`）：与 userconfig 同形，
   环境已存在时会污染探针（假红方向）。补大小写两键；踩到 npm 的 double-loading 拒跑
   （userconfig 与 globalconfig 不得同文件），隔离为两个空文件。攻击环境实测 2/2 绿。
3. `[已完成]` **矩阵未钉三条合法 node 形态**（同 `ddacb69`）：`node -- <entry>` 与
   `node --import tsx <entry>` 现在判定正确但无回归覆盖，已入 CASES。
4. `[已完成]` **toolchainContract 文件头 blanket 声明与承重钉例外并存矛盾**（文档 commit）：
   头部已注明唯一例外及其守门机制。

### 23.3 边界更新

- 无新增实质边界；`bash - <entry>` 实测为 EXEC（选项终止符），保持放行且不入反例。
- §22.3 各条维持；三条链零兜底的现状已如实登记（§22.3 末条），补兜底与否属下一轮决策。

实测：`verify:all` 通过（服务端 297/297、客户端 258/258、FGUI 50/50、矩阵 3/2/4/3/3）、
`test:inventory` 96/96、`test:int` 154/154（本地栈）。

## 24. 第十七轮复核（2026-08-31）

复核对象：`ffba44f..6b49b03`（第十六轮的两个门禁修复 + 两处文档更正 + §23 回写）。

### 24.1 对第十六轮的判定

五个 commit **全部成立**，两条关键前提我第一人称实测复现：

- `ddacb69`（`node -` stdin 脚本）：实测 `node - entry.mjs` **入口不执行**（node 从 stdin 读脚本），
  而 `bash - entry.sh` **入口照常执行**（`-` 在 bash 里是选项终止符）。父提交对两者都放行，
  HEAD 只拒 node 侧、bash 侧保持放行——**族间差异的判断正确**，共用判定会造出 bash 侧假红。
  这条补的正是我上一轮 `c2d714b` 留下的口子：裸 `-` 以 `-` 开头，逃过了 `i === 1` 的非 flag 判定。
- `3de949b`（globalconfig 通道）：大小写两键实测均已闭合（各 2/2 绿）。
  「globalconfig 与 userconfig 不得同文件、否则 npm 判 double-loading 拒跑」这个细节
  在注释里写明了，是踩过才知道的坑。
- `7f879d1` 对我 §22 的**两处更正我都接受**：
  - 「三条链仍有一层兜底」→ **零兜底**。我实算确认：`docs/inventory.json` 里只有 `verify:core`
    的 verification 带 `requires`（4 条），`typecheck` / `verify:sync` 登记了但 requires 为空，
    `verify:all` 根本未登记——「未实际覆盖」检查对空列表不产生任何断言。我原来的表述高估了覆盖。
  - 「循环论证」定性过重、「空跑」措辞不准。`9eca872` 的变异对它**自己的夹具改动**是有效的，
    真正的缺口是正例对**生产侧检查**无判别力；append 的后果是矩阵报一条误导性背离，
    不是完全不执行。两处改写都比我原文精确。

### 24.2 本轮修掉的一条

`[已完成]` **承重钉只钉了四条链中的一条**（本轮 commit）：既然 §22.3 已被更正为「零兜底」，
那条边界就不该停在登记——它是可关的。把 `VERIFY_CORE_LOAD_BEARING` 推广为
`CHAIN_LOAD_BEARING`（四条链逐条覆盖），断言对每条链做双向 `deepEqual`。

变异推演三条，每条恰好 1 红，且三者在打钉之前实测全绿：
合谋同删 `typecheck` 的 `npm run typecheck:client`、`verify:sync` 的
`node scripts/sync-client.mjs --check`、`verify:all` 的 `npm --workspace @game/server run test`。

### 24.3 一个反复出现的模式，记在这里

「承重钉」这类**刻意的第二份副本**与「无人比对的复制件」在代码里长得几乎一样，
差别只在**有没有被断言与真源相等**。这一轮里两种形态同时在场：
`5648579` 清掉的是后者（漂移掉 5 条矩阵命令而无人知），`4d656a7`/本轮扩写的是前者
（靠双向 `deepEqual` 守门）。因此文件头与钉子注释里都写死了「禁止改成 import」——
否则下一轮复核很容易把有守门的第二锚点当成刚清掉的那种复制件再删一次。
判断标准建议固定为一句话：**副本是否有一条断言把它和真源钉在一起**——有则是锚点，无则是负债。

### 24.4 边界

- `[不阻塞·有意保留]` 承重钉守的是「链条成员集合」与八条精确脚本文本（第十八轮 `06bc422` 已补
  `EXACT_LOAD_BEARING` 双向相等）；仍不守链成员引用的**叶子脚本正文**（如 `verify:ecs` 的脚本实现）
  ——被改坏只由各自的实现测试兜底。
- `[不阻塞·有意保留]` 合谋者连测试文件一起改/删时无守门（verify-toolchain 只查测试文件存在、
  不校验内容）：三方同删（声明表 + 链 + 钉）后全绿；verify:core 的第四锚点（inventory 交叉断言）
  只盖其 requires 的 4/16 条。这是仓内门禁的自指极限，最终兜底是 review 与（目前不存在的）CI。
- `[不阻塞·有意保留]` §23 登记的各条维持不变（node 取值 flag 元数表、引号折叠假红、
  workspace 级钩子、`etc/npmrc` 组织级配置通道）。

## 25. 第十八轮复核（2026-08-31）

复核对象：`6b49b03..39838db`（同事第十七轮的承重钉四链推广 `b9052b6` + §24 回写 `bd28e3b` +
新设计文档 `39838db`），及同事对第十六轮三条修复的验证。方法：对抗式独立核查（隔离副本 +
真实 bash/npm/node 实测）+ 文档事实性抽查。

### 25.1 对第十七轮的判定

- `b9052b6`（承重钉推广到四条链）**成立**：双向 deepEqual 实现正确，四张清单与声明表逐条对应；
  三条变异（合谋同删 typecheck/verify:sync/verify:all 各一条）经隔离副本实测——打钉前全绿、
  打钉后各恰好 1 红，声称精确。同事对第十六轮三条修复（`ddacb69`/`3de949b`/`7f879d1`）的
  验证与复核全部属实。
- `bd28e3b`（§24 回写）**成立**：§24.3 的「复制件判断标准」（有断言钉在真源上＝锚点，无＝负债）
  准确反映代码现实；§24.2 与 `b9052b6` 一致。
- `39838db`（当前路径 `docs/Non-intrusive-wsrpc.md`，1066 行设计提案）**事实准确率 18/21、无铁律冲突、定位克制**，
  但有四类欠账：未按惯例登记（五处入口均无，链接处于机检盲区）；`lobbyRpcVectors` 目录以现在时
  陈述不存在的事物；`rpc.ts` 行的幂等风险描述已过时（漏开 idem 已是编译期错误）；本文 Lobby 域
  `idle` 与既有 Room 玩法 fixture `idle`（`GameplayModeId.Idle`）同名不同层未披露。均已修正
  （`b29d973`）并登记（`9d830e0`）。

### 25.2 本轮新发现并修掉的缺陷

1. `[已完成]` **承重钉体系的三个残留形态**（`06bc422`，一次机制修复）：
   - R3 新增链无定向报错：测试文件本地重建的 4-key 映射按 §24.3 自己的标准就是「无断言副本」。
     ⚠ 更正（第二十轮复核）：§25.2 原写「静默无钉」不准确——实测父提交加第五条链会红 4 条，
     但全是别的闸在报（新根脚本未登记进命令表等），没有一条点名「该链未打钉」；「静默」应改为
     「无定向报错」。
     `verify-toolchain` 导出 `CHAIN_SCRIPTS`/`EXACT_SCRIPTS`（映射表也单源），钉表与声明表的
     链 key 集合做双向相等断言；
   - R2 八条精确脚本文本（含测试 glob/路径）无钉、双侧同改实测全绿：新增 `EXACT_LOAD_BEARING`
     承重钉（同型刻意副本）+ 双向 deepEqual；
   - 变异三组：源表新增无钉链 → key 集合断言红；双侧收窄 `test:client` glob → 精确钉红；
     钉表删 key → 红。恢复后 `test:client` 259/259。
   - R1（合谋者连测试文件一起改/删）无法由仓内门禁收敛——自指极限，已登记 §24.4。
2. `[已完成]` **Non-intrusive-wsrpc.md 三处事实修正 + 登记**（`b29d973`、`9d830e0`）：见 §25.1。
3. `[已完成]` **§24.4 边界更新**（`a353751`）：精确文本钉已补、三方同删自指极限与第四锚点
  4/16 覆盖面如实登记。

### 25.3 仍登记的已知边界

- §24.4 各条维持（叶子脚本正文、三方同删自指极限、node 取值 flag 元数表等）。
- Non-intrusive-wsrpc.md 的客户端 host 层（11 个新模块 + pages.ts 状态机迁移）是该提案最重风险，
  其实施与退出条件评估不在本轮范围；该文档已标注「设计提案，未实施」。

实测：`verify:all` 通过（服务端 297/297、客户端 259/259、FGUI 50/50、五矩阵 3/2/4/3/3）、
`test:inventory` 96/96、`test:int` 154/154（本地栈）。

## 26. 第十九轮复核（2026-08-31）

复核对象：`bd28e3b..e901262`（第十八轮的 `06bc422` 钉体系加固 + 登记/重命名/§25 回写）。

### 26.1 对第十八轮的判定

`06bc422` **成立且方向正确**——它是把 §24.3 的标准（副本有没有断言钉住真源）**递归应用到钉体系
自身**的结果，这正是该标准该有的用法。两条实证：

- **R2 属实且危害不低**：`06bc422^` 上双侧同改 `test:client` 的测试 glob（把
  `../client/test/*.test.ts` 收窄成 `net*.test.ts`）**实测全绿**，HEAD 上 1 红。
  精确脚本文本里含测试 glob，改窄它等于悄悄缩小覆盖面，此前无人拦。
- **R3 需要一处措辞更正**：commit message 说「新增链**静默**无钉」。我实测在 `06bc422^` 上
  往源表加第五条链会红 **4 条**——但那 4 条红全是别的闸（新根脚本未登记进命令表等）在报，
  **没有一条**是在说「这条链没打钉」。所以结构性判断成立（测试本地重建 key 集合 ⇒ 新链拿不到钉），
  「静默」二字不准确。两条新 key 集合断言我各自隔离实测，均恰好 1 红。

`e901262` 的重命名（`Non-intrusive.md` → `Non-intrusive-wsrpc.md`）在 `referenceDocs`、
策划案回链、plan-v3 引用四处同步，`verify:inventory` 绿，无悬挂链接。

### 26.2 本轮修掉的三条

1. `[已完成]` **workspace 生命周期钩子是真洞，不只是登记边界**（`5f5c79e`）：`551b8c1` 只查根
   `package.json`，而链里有三条 workspace 命令。实测这条路完全走得通——给 `apps/server` 加
   `pretest`，再按命令表要求登记进 AGENTS/CLAUDE/README（一串看起来完全正当的操作），
   `verify-toolchain` 与 `verify-inventory` **双双 exit 0**，而真实 npm 确实会在
   `npm --workspace @game/server run test` 之前跑那个钩子。
   从 `CHAIN_SCRIPTS` 派生 workspace 闸表逐个 manifest 再查一遍；`workspaces` 缺席时**静默
   no-op**——夹具根 package.json 没有 workspaces，硬查会让 `toolchainContract` 每条反例假红。
   同时把钩子用例从硬编码 3 例改为**全量派生**（实测 32 次迭代 / 29 个唯一钩子：chain keys 的
   pre + exact keys 的 post + 链成员根脚本名的 pre，跨源重复去重 3 个；§26 原写「21 例」，
   系回写时计数错误）：那 3 例恰好全落在 CHAIN/EXACT 的 key 上，
   永远碰不到「链成员引用的根脚本名」那段派生逻辑——删掉那段实测全绿。
2. `[已完成]` **聚合链矩阵的 `CHAINS` 无断言**（`b7d1662`）：往源表加第五条链并同步打钉后，
   本矩阵仍 4/4 全绿、一眼没看它。加 key 集合双向相等。
3. `[已完成]` **sync 矩阵的 `TARGETS` 已漂移**（`951b553`）：`package.json` 有三条
   `sync-*.mjs --check`，`TARGETS` 只有两条。**没有**把 `sync-webplatform-contract` 硬塞进去——
   实测它会在三个场景上崩或造假红（源在 node_modules 而夹具不含、该镜像无 README、
   `expectedFiles()` 固定三条使「源新增未同步」成为真假红）；更根本的是本矩阵的立论
   「`--check` 是第二套判定实现、可能撒谎」对它不成立（`--check` 与真同步共用同一个
   `expectedFiles()`）。改为登记显式豁免 + 集合双向钉。

### 26.3 判断标准的一条补充

§24.3 说「副本有断言钉住真源则是锚点，无则是负债」。本轮补一句**该往哪个方向投**：
剩余的无断言副本分两类——
- **覆盖面副本**（`CHAINS`、`TARGETS`、钩子用例的样例表）：钉住它们是在扩大门禁**看得见的范围**，
  收益实在，本轮三条都属此类；
- **同形第三份副本**（再给承重钉加一份钉）：合谋者改 3 处和改 2 处成本没有量级差别，
  纯维护负债，不该加。
分界线是「这份副本决定了**门禁会不会去看某个东西**，还是只是重复了门禁已经在看的东西」。

### 26.4 边界

- `[不阻塞·有意保留]` 三方同删（合谋者连测试文件一起改）仍是仓内门禁的自指极限，无法收敛——
  §24.4 已登记，本轮不变。
- `[不阻塞·有意保留]` `sync-webplatform-contract` 的镜像判定仍无「vs 真实同步效果」矩阵，
  理由见 26.2 第 3 条，已登记为显式豁免。
- `[不阻塞·有意保留]` `aggregate-chain-matrix` 的 `CHAINS[].constant` 名仍是人工映射；
  该方向由 `declaredChain` 读不到常量时抛错兜住。
- ⚠ 流程提醒：本轮五张矩阵在**与复核 agent 并发**时出现过 3 张红，单独串行重跑全绿。
  矩阵会在真实仓库上跑 `git ls-files` 建夹具，并发 agent 留下的临时文件会污染夹具——
  与第八轮「探针缺依赖」同类，**判定门禁坏了之前先串行复跑一次**。

## 27. 第二十轮复核（2026-08-31）

复核对象：`9c6f2c9..9cd31c7`（同事第十九轮的三个修复 commit `5f5c79e`/`b7d1662`/`951b553` +
§26 回写 `15f5b49` + 两份新设计文档 `4986932`/`9cd31c7`），及同事对第十八轮 `06bc422` 的验证。
方法：对抗式独立核查（隔离副本 + 真实 npm 实测）+ 文档事实性抽查。

### 27.1 对第十九轮的判定

- 三个修复 commit **全部成立**：`5f5c79e` 的 workspace 钩子洞实证成立（父提交下两门禁 exit 0 而
  真实 npm 先跑钩子；HEAD 点名 `scripts.pretest` 拒绝），派生用例三来源覆盖正确；`b7d1662` 的
  父提交「加第五条链+打钉后矩阵仍 4/4 全绿」实证成立，HEAD 双向钉恰 1 红；`951b553` 的
  TARGETS 漂移与「sync-webplatform-contract 不入矩阵」三理由逐条成立（源在 node_modules、
  无 README、--check 与真同步共用 expectedFiles() 结构上无法背离）。
- §26.3 的「覆盖面副本 vs 同形第三份副本」分界与实际改动一致；§26.4 并发污染提醒属实
  （launcher/npm-reference/sync-mirror 三张矩阵用 `git ls-files --others` 在真实仓库建夹具，
  并发 agent 的临时文件会污染夹具——判定门禁坏了之前先串行复跑）。
- 同事对 `06bc422` 的验证成立；其指出的 R3「静默无钉」措辞不准（父提交会红 4 条但全是别的闸
  在报，无一点名未打钉）已收窄为「无定向报错」。
- **唯一数字失实**：「全量派生 21 例」实为 32 次迭代 / 29 个唯一钩子（跨源去重 3 个），已更正。

### 27.2 本轮新发现并修掉的缺陷

1. `[已完成]` plan-v3 两处复核表述更正（数字 21→32/29、「静默」→「无定向报错」）。
2. `[已完成]` `docs/Non-intrusive-room.md` 的「约 20 处 `usesDefaultBallMoveRules` 特判」夸大，
   修正为本文件 10 处（全仓含 GameMode/README 共 16 处）。
3. `[已完成]` `docs/snakeoff/02` 内部事务态 `Locking` 与 `Non-intrusive-room.md` §13.1 的
   `Starting` 不统一，已统一为 `Starting` 并注明同源。
4. `[已完成]` 两份新设计文档零登记：README/AGENTS/CLAUDE 各加两行入口；
   `docs/Non-intrusive-room.md` 进 `referenceDocs`；snakeoff 仿 undergroundIdle 在
   EXTRAFEATURES 新增 §3.11。

### 27.3 仍登记的已知边界

- ~~workspace 闸表只认前缀式~~ / ~~覆盖面正则只认 `sync-*` 裸形态~~ —— 两条已于第二十一轮关掉，
  见 §28.2；剩余的路径形态（`npm --prefix apps/server run test`）与豁免表条目本身仍靠评审。
- 两份新文档互为配套的「框架能力 vs 首版产品」分层（撮合预留 vs 首版不做公开匹配）与
  「默认入口归属」（snakeoff 替代 ballMove 入口 vs wsrpc 迁移入口）尚无仲裁顺序，落地时需先拍板。

实测：`verify:all` 通过（服务端 297/297、客户端 261/261、FGUI 50/50、五矩阵 3/2/5/4/3）、
`test:inventory` 96/96、`test:int` 154/154（本地栈）。

## 28. 第二十一轮复核（2026-08-31）

复核对象：`15f5b49..f53c8cc`（第二十轮的两处表述更正、两份新设计文档的事实修正与登记、§27 回写）。
本轮无新增代码 commit 需要审，重点是把 §27.3 自己登记的两条边界从「登记」推进到「关闭」。

### 28.1 对第二十轮的判定

- `705417a` 的两处更正**都成立，且第一条是对我的有效纠正**：我在 §26 写的「全量派生 21 例」
  是错的。实算为 **4 + 8 + 20 = 32 次迭代 / 29 个唯一钩子**，跨源重复 3 个
  （`preverify:sync`、`pretypecheck`、`preverify:core`——这三条链名同时又是别的链的成员）。
  「静默无钉」→「无定向报错」的收窄也准确。
- `28d8c0d` 的登记闭合了上一轮 `Non-intrusive-wsrpc` 的同类欠账，且这次是**主动**兜住的。
  `verify:inventory` 绿、无悬挂链接。
- 文档本体的三处事实修正不在本轮代码审范围内。

### 28.2 把 §27.3 的两条边界关掉

§27.3 把它们登记为「属自指边界 / 靠评审」，后经复核确认两条都值得关（按纵深防御成立）：
⚠ 更正（第二十二轮复核）：「不需要合谋就能触发」不准确——改写链形态必须动声明表，而声明表
被 `CHAIN_LOAD_BEARING` 双向钉守门（会红）；干净逃逸需要声明表+链+钉三处同改，即 §27.3 原文
「属自指边界」的判断才是准确的。

1. `[已完成]` **workspace 闸表只认前缀式**（`f31d874`）：`npm --workspace Y run X` 与
   `npm run X --workspace Y` 是**等价**写法（§18 已实测），换个写法就让该 workspace 静默失闸——
   实测把链改成后缀式后给 `apps/server` 加 `pretest`，`verify-toolchain` 放行。闸表改为两种形态
   （含 `-w` 与 `=` 变体）都认。
   **回归用例踩了个坑，值得记**：闸表从**声明表**派生、不是从夹具 `package.json` 派生，
   所以第一版只改夹具的用例是**空转**——变异后照样绿。改用 `writePatchedVerifier` 打补丁改
   声明表本身才真正生效。这与第十九轮「先串行复跑再判定」同属一类：**写完反例先做一次变异，
   确认它真的会红**。
2. `[已完成]` **覆盖面正则只认 `sync-*` 裸形态**（`5663de4`）：真正的问题不是空白容忍度而是
   **扫描面**。`package.json` 里还有三个「有写模式 + 有 `--check` 模式」的同形脚本
   （`vendor-lock`、`fgui-manifest`、`excel-to-json`），本矩阵的立论对它们同样适用，
   只认 `sync-` 前缀等于把它们留在扫描面之外。扫描面改为任何
   `(node|tsx) (scripts|tools)/*.mjs --check`；豁免表从字符串数组改为「脚本 → 理由」并断言
   理由非空，四条豁免各自写明依据（webplatform-contract 的三条实测理由 + 其余三条各自指向
   已有的反例套件）。

### 28.3 边界

- `[不阻塞·有意保留]` workspace 调用形态的兜底已改为「不可归类即拒」（`25d5404`）：前后缀命名式、
  `--prefix <dir>`、`-w <dir>` 均可闸；`npm run -w Y X`、`--workspaces` 等未归类形态直接报错。
  ⚠ 更正（第二十二轮复核）：本条原写「仍不认路径形态」与「`--prefix` 真出现时链条覆盖判定会先红」
  均不实——前者已由 `25d5404` 收口；后者在声明表+链+钉三处同改后**双闸全绿**（`commandReferences`
  的失败关闭只在有 requires 锚点时触发，而 `verify:all` 的 workspace 调用没有锚），当时唯一兜底
  就是承重钉本身。
- `[不阻塞·有意保留]` 豁免表的**条目本身**靠评审：写一条假理由把新脚本豁免掉仍然可行。
  这属于 §24.3 说的自指极限——再加一层钉只是同形第三份副本。
- `[不阻塞·有意保留]` §27.3 第三条（snakeoff 与 wsrpc 两条路线对 Home 默认入口的归属无仲裁
  顺序）是**产品决策**而非门禁问题，落地前需要拍板，本轮不动。
