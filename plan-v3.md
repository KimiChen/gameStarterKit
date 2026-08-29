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
> **本轮回写快照**（§8 审计登记的 6 条逐条独立收口后同一工作树实测）：`verify:core`、`verify:all`、
> `typecheck`、`verify:sync`、`verify:inventory` 全绿；服务端单测 297/297、客户端 **248/248**、
> `test:fgui` 50/50、`test:int` 154/154、`test:inventory` **40/40**、`test:faults:int` 四组
> 72/**63**/12/15 全绿。
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
  `commandInvokesEntry` 要求 segment 首 token 属 `node|npm|npx|tsx|sh|bash` 或就是入口路径本身。
  正则本身一行未改。（落地时踩到一个 TDZ：启动器表若写成模块级 `const`，会因驱动段先于该声明执行而
  `Cannot access before initialization`，故内联在函数内。）
  **验收口径收窄**（不假装解决了不可解的问题）：新判定只证明调用处于**可执行位置**（不是 `echo` 参数、注释、
  引号内），**不证明运行时可达**。
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
- `[条件阻塞·用户批准历史例外]` **每个问题独立 commit 的流程契约未满足**：本文文首要求每条问题在同一独立 commit 中
  完成实现、验证和证据回写，但 `a10f2f7..8a76d29` 的变更将多个问题合并：`6b77ebe` 同时处理 4 条，
  `a83467d` 同时处理 4 条，`28cd900` 同时处理 3 条，`e54ad71` 处理 1 条，`08f6c5c` 同时处理 P1-09
  与 §7 的多条文档/门禁问题；`8a76d29` 又集中回写全部条目证据，故实现/验证与证据并未保持同 commit。
  这是已发生的历史流程偏差，不建议为重写历史而强行拆 commit；应明确记录为经批准的例外，或从下一条开放项起
  严格执行「一条问题 = 一个实现、验证、证据 commit」，并在对应条目写入 commit id。
  **复核更正（HEAD `54e1941`）**：`git show --numstat` 显示本轮六个收口提交都改动了 `plan-v3.md`：
  `509cb4e=13/1`、`8cb6fc4=20/1`、`37851b5=14/1`、`1ad756c=21/1`、`80c86be=18/3`、
  `54e1941=37/5`（插入/删除行数）。因此本轮「证据同 commit」维度为 **6/6**；这并不改变历史
  `a10f2f7..8a76d29` 的多问题合并仍未满足「一条问题一个 commit」。
  **不 rebase**，理由不采用「会摧毁 §7 迁移条目的溯源」那条——复核指出 `8d0ec91..bc02794` 按 git 范围记法
  **不含** `8d0ec91`，该 commit 是改写基点、hash 不变，相关引用不会失效。真实理由是：需要 force-push 覆盖
  已发布历史；要诚实写出每个 commit 的计数快照就得在约 13 个中间 commit 上逐个重跑门禁；而 `08f6c5c` 的
  两个闸 + 5 条反例 + 它当场查出的 `loadtest` 文档补齐是一个因果整体，机械拆开必然产生红灯中间 commit。
  **从本轮起严格执行**，本轮 6 条各自独立 commit（实现 + 变异验证 + 本条证据回写同 commit）：
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

- `[条件阻塞·SDK guard 失败时]` **P2**：`apps/client/src/net/WebSocketClient.ts:618-623` 的
  `onReconnect` 调用 `abandonOnReplayGuardLoss`；失败路径 `:778-783` 先标记 slot 并用 `void closeSlot()`
  异步启动物理关闭，而 `:680-698` 的实际 `leave` 在 Promise 微任务中开始。SDK
  `apps/client/src/lib/colyseus/colyseus.js:8863` 在回调返回后，于 `:8870-8875` 同步 flush
  `enqueuedMessages`。向 `maxEnqueuedMessages` 注入抛错并预置一条旧队列消息，可观察
  `staleFlushed: 1`：关闭完成前旧 RPC 已被 flush。需让 guard 失败路径在回调返回前同步中和队列/阻止 flush，
  并补该反例的能失败测试。

### 9.2 Lobby guard 失败后的迟到 onLeave

- `[条件阻塞·迟到 onLeave]` **P2**：`:781` 先置 `slot.cancelled = true`，迟到 `onLeave` 在
  `WebSocketClient.ts:624-628` 的 `current()` 检查处直接返回；因此不会执行 `:634-639` 的显式 owner
  清理和 `notifyConnLost()`，也不会进入 `apps/client/src/net/session.ts:306-317` 的 session reconciliation。
  注入不可控 `reconnection` 后触发 drop 的结果为 `slotCurrent:null, cancelled:true, owners:1,
  ownerActive:true, connLost:0`。需保证 guard 失败仍精确释放所有 owner，并发出一次最终连接死亡通知，或
  明确记录由其他同步路径承担这些职责。

### 9.3 closed socket 下的 RoomClient 返回值

- `[条件阻塞·boolean 语义未决]` **P2**：`apps/client/src/net/RoomClient.ts:1130-1137` 只把同步
  throw 判为失败；SDK `apps/client/src/lib/colyseus/colyseus.js:8771-8773` 在 socket 关闭时静默入队并
  返回。将 `maxEnqueuedMessages` 设为 `0` 后，closed send 可观察 `result:true, sent:0, queue:0`，
  `apps/client/src/net/rooms/GameRoomTransport.ts:98-103` 因而可能把未实际发送的 Move 记入
  `lastSentSeq`。若 boolean 仅表示“通过本地闸并调用 SDK”，应收窄 P1-01 的契约文字；若表示已发送/已接受，
  则需修复实现并补 closed-socket 反例。

### 9.4 Lobby replay 的 exactly-once 证据

- `[不阻塞·待补齐]` **P2**：`apps/client/test/webSocketClient.test.ts:667-696` 的 replay 用例只调用
  只读 `UserRpc.GetUserId`，没有写 RPC 的副作用计数、`clientReqId` 或服务端效果断言，也没有独立验证
  bind 前已存在的非空 SDK 队列。因此它证明了“消息不留在当前 fake 队列”，不能证明
  `UserRpc.UpdateProfile`、`GuildRpc.Join`、`ShopRpc.Purchase` 等写路径在重连/重试下 exactly once。
  应补写路由 fixture、效果计数和同一 `clientReqId` 的重连序列，并以删除清理闸的变异使测试失败。

### 9.5 inventory shell 语法解析不足

- `[条件阻塞·shell 语法覆盖]` **P2**：`scripts/verify-inventory.mjs:685-707` 的
  `executableSegments()` 只按 `&&`、`||`、`;`、`|` 和换行切段，并不解析引号、转义、注释、命令替换或
  参数语义；因此它不能兑现本文件 :400-401 所称的“不是引号内、注释”。在隔离副本中，以下代表性伪调用
  均可令 `verify-inventory --root` 返回 0：
  `echo "ignored; npm --workspace @game/server run start"`、
  `npm run verify:project # npm --workspace @game/server run test`、
  `npm run verify:project "$(echo npm run verify:vendor)"`、
  `sh -c 'echo path; true'`、`node -e noop path`、`node --check path`。
  需采用受限且明确的 shell 解析器/白名单并为每种语法补反例，或把计划主张收窄为仅支持当前明确语法。

### 9.6 npx 白名单与文档口径冲突

- `[条件阻塞·npx 策略未决]` **P2**：`scripts/verify-inventory.mjs:704-706` 把 `npx` 列入
  `commandInvokesEntry` 启动器白名单，但本文件 :408-410 原先声称 `npx` 应被判为未覆盖、失败关闭。
  隔离副本中 `npx tsx src/core/economy/relayer.ts` 与 `npx echo src/core/economy/relayer.ts` 均可通过，
  后者甚至不需要真实入口执行。需统一策略：移除 `npx` 并保持 fail-closed，或明确接受它并补充外部包解析/下载
  的范围说明与测试；在决策前不能把该边界写成已闭合。

### 9.7 documentedIn 与助手命令表的全文伪登记

- `[不阻塞·待补齐]` **P2**：`scripts/verify-inventory.mjs:165-175` 和 `:243-255` 只对助手文档/指定
  `documentedIn` 做全文正则匹配，不限制 Markdown 文档、命令代码块、目录或有效登记位置。隔离副本中把
  `npm --workspace @game/server run fixture:worker` 放进 shell 注释，或把 `documentedIn` 指向
  `apps/server/package.json` 并把命令文本写进 description，均可通过。该闸只能证明出现了字符串，不能证明
  真实文档登记；应收紧路径/区块解析，或明确把全文匹配降级为非强保证。

### 9.8 verification.requires 的自引用和循环

- `[条件阻塞·verification.requires 无环]` **P2**：`scripts/verify-inventory.mjs:743-750` 的
  `commandCovers()` 对同 key 直接返回 `true`，`checkCommand()` 在 `:779-785` 遇到循环只静默 return。
  在隔离副本中把 root/workspace requirement 改成自身，或让两个命令互相 `requires`，均仍返回 0；若后续
  按登记执行，脚本还可能进入无限递归。应在发现重复 key 时 fail-closed，并补自引用和两节点循环反例。

### 9.9 命令存在性被原型链属性绕过

- `[条件阻塞·脚本存在性校验]` **P2**：`scripts/verify-inventory.mjs:654-660`、`:730-738` 和
  `:753-766` 通过普通属性索引与 truthiness 判断脚本存在，没有 own-property 或字符串类型校验。将验证项改成
  `root:toString`、`root:constructor`，或 workspace `@game/server#toString`，可在隔离副本中通过
  `verify-inventory`，但这些都不是实际脚本。应使用 `Object.hasOwn`（或等价检查）并要求 script 值为字符串。

### 9.10 历史提交粒度例外

- `[条件阻塞·历史例外待批准]` **P2**：§7 已记录历史 `a10f2f7..8a76d29` 将多个问题合并，仍不满足
  原始“一条问题一个 commit”要求；本轮六个收口提交虽已逐条拆分，但不能 retroactively 修复历史。当前不
  重写已发布历史的决定需由用户明确接受为例外；在此之前，§7 不应使用无条件 `[已完成]`。

本次再审计实际执行并通过：`npm run verify:inventory`、`npm run test:inventory`（40/40）、
`npm run test:client`（248/248）、`npm run typecheck`、`npm run verify:all`（服务端 297/297、FGUI 50/50）
及 `git diff --check`。这些绿灯只证明当前正向路径，不能抵销上述隔离副本中的反例和证据缺口。
