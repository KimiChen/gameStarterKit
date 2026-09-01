# rooms/ —— 实时状态同步 Demo

需要 Colyseus Schema 状态同步和服务器逻辑帧的玩法房放在这里；Lobby 的请求/响应通道位于
`../websocket/`。

- `GameRoom.ts`：通用 transport/admission/lifecycle shell。它在 `onCreate` 按生成映射选择一次 mode root，
  之后禁止替换；shell 自身不含任何玩法规则，也没有默认玩法——未登记/未注入 mode 的房间在
  `requireMode()` 直接 fail-fast（⛔ 不回退 ballMove）。Schema patch rate 为 50ms，fixed-step 时钟、
  出站 S2C 校验、消息预算与开局事务都归 shell。
- `GameMode.ts`：服务端玩法契约与 registry。`GameRoom` 继续拥有 transport、auth、房间锁和生命周期；玩法通过
  `createPlayer` 提供精确 player Schema，用 `roster{min,max,autoStart}` 声明人数事实——⛔ shell 里没有人数字面量，
  `maxClients`、满员闸、自动开局阈值、开局下限与开局边界重验五处全部读它。`roster.max` 不得超过 shared 的
  `MAX_PLAYERS`（root players map 的容量由生成 validator 按它烧死），`min ≤ autoStart ≤ max`。上述校验在
  **建 mode 实例时**（`GameModeRegistry.create`，即建房那一刻）与注入期各跑一次
  ——⚠ 不是 `register()`，register 只收 factory 不调用它，非法 mode 能成功注册、到第一次建房才炸；
  （注入式 mode 不经过 registry，⛔ 不能只在 registry 里校验）。玩法输入完全 token 化（阶段 2b）：
  消息名、payload validator、phase 白名单与 rateCost 由该玩法 `apps/shared/src/gameplays/<id>/wire.ts`
  的 defineC2S/defineS2C token 声明并经 codegen 聚合进 wire catalog；`GameRoom.messages` 只注册一个
  catch-all（键 `"_"`），dispatcher 固定序 = 基础预算（未知/畸形 type 也计费）→ owner 闸（core 或当前
  mode）→ exact validate（非普通对象含 Uint8Array 一律拒）→ rateCost 追加消耗 → phase 闸 → core
  handler / mode `commands[type]`。mode 用 `commands`（typed handler map，键必须属于本玩法 wire token
  集合，create/注入两路径校验）消费玩法消息，⛔ 通用 shell 不再穷举任何具体玩法的消息名，Ping/Chat
  的 phase 规则仍归 shell（Ping：Waiting/Playing/Settle；Chat：Waiting/Playing）。
  `onAdmission`、`onMatchInitialize`、`onMatchStart`、`onMatchRollback`、`onBeforeStep`
  （tick++ 之前，可同步 settle）、`onStep`、`onPlayerLeaving`、`shouldSettle`、`onLeave`、`onFinish`、
  `onDispose` 扩展玩法生命周期；结算谓词完全归 mode 的 `shouldSettle`，shell 无默认结算规则。
  出站 S2C 走 token：`context.sendS2C(client, token, payload)`/`broadcastS2C(token, payload)` 发送前验
  token 的 dir/owner（core token 见生成的 `CORE_S2C_TOKENS`），payload 过 token.validate。
  可选的 `evidence: GameModeEvidenceCapability`（`assertRosterCompatible`/`captureInitialState`/`build`）
  声明该玩法的可重放收局证据：create/注入两路径都在 roster/commands 闸后调用 `assertRosterCompatible`，
  开局边界（phase=Playing 之前）调用 `captureInitialState` 冻结初始快照，settle 时先 `build()` 冻结证据
  再跑 `onFinish`；未声明该能力的 mode（如 idle）settle 时明确不产出任何证据。registry 会在创建 mode 时
  校验必填能力，漏配即 fail-closed；root 只来自 manifest 生成映射，不由 mode factory 手写。
  ⚠ 本文件不注册任何具体玩法：登记发生在组合根 `modes/catalog.ts`。
- `modes/ballMove/`：默认演示玩法的完整实现（阶段 1 从 GameRoom 壳中行为等价拆出）：
  - `rules.ts`：纯函数化的模拟规则（运动锚点、施法、复位），live 与 replay 共用同一组表达式；
  - `harness.ts`：测试/回放注入边界（`GameRoomInput` 形状与敌意输入快照），⛔ 不是通用玩法契约；
  - `evidence.ts`：v3 证据的房内录入与组装（accepted 输入序列、容量闸、初始快照、build），
    证据**格式**所有权仍在 `core/match/matchEvidence.ts`；
  - `index.ts`：`createBallMoveGameMode(options?)` 返回 GameMode + harness API
    （`injectInput`/`setInputSource`/`getAcceptedInputs`）的 mode 句柄，`registerBallMoveGameMode`
    供组合根登记。
- `modes/catalog.ts` / `modes/IdleGameMode.ts`：生产 mode catalog（ballMove 与 idle 都在此登记）与最小
  第二玩法。Idle 使用独立 `IdleRoomState`、strict `IdlePulse` 和 pulse/真实离场结算，不声明 evidence
  capability，也不写任何收局证据。
- `core/`（阶段 8a，Non-intrusive §6.2）：房间组合 policy 层——`StartPolicy.ts`（auto / owner-ready
  判别联合，⛔ 不重复声明任何人数：min/max/autoStart 唯一真源仍是 roster/manifest）、`AccessPolicy.ts`
  （matchmaking / invite-code，四个时间/配额参数取自 config，不等式在加载期断言）、`RoomProfile.ts`
  （`(mode, profileId) → policy` 注册表：校验 id ∈ generated catalog.profiles、owner-ready/invite
  所需 state fragment 存在；`assertRoomProfilesConfigured` 在组合根启动期全量断言）。"default" =
  auto+matchmaking（ballMove/idle 现状零变）；"private" = owner-ready+invite-code（由 fixture gameplay
  `privateFixture` 驱动测试，⛔ 不进生产 registry）。owner-ready 的 Ready/Start core wire、fence 元组
  开局事务、邀请码 lease 生命周期与 access ticket 准入时序见 `GameRoom.ts` 与
  `../core/rooms/`（invite lease/ticket 的 Redis 层 + prepareCreate/resolve 领域逻辑）。
- `schema/GameRoomState.ts` 与 `schema/generated/<id>.ts`：由每玩法单源
  `apps/shared/schema/gameplays/<id>/{manifest.json,state.json}` 经
  `apps/server/tools/gameplay-codegen/` 生成——`generated/<id>.ts` 是该 mode 的运行时 Schema 类，
  `GameRoomState.ts` 是聚合器（re-export 各 mode 类 + `RoomStateLifecycle` 视图 + mode→root 构造器映射）；
  同一单源也生成 shared `gameplays/generated/state/<id>.ts` 的纯数据接口、`gameplays/catalog.generated.ts`
  的 mode→validator 映射与 `GAMEPLAY_CATALOG`（id/modeVersion/maxPlayers/contractDigest），以及客户端
  `gameplay/catalog.generated.ts` 镜像（跨 workspace 直写是 docs/Non-intrusive.md §5.4 登记的职责偏差，
  freshness 由 `test/gameplay-codegen.test.ts` 守门）。players map 容量来自 manifest 的 `maxPlayers`；
  契约 digest 变化必须同批 bump 该 mode 的 `modeVersion`，删除玩法必须显式 `--allow-delete <id>`。
  ⚠ 每个 root **必须**声明 shell 依赖的生命周期字段 `tick`/`phase`/`matchId`/`players`，其 player 类型
  必须声明 `id`/`name`；漏声明在 codegen 期直接失败。`phase` 还必须是 `GamePhase`/`GamePhaseType`
  **本身**并声明 `Waiting`/`Playing`/`Settle` 三个成员——⛔「是个 enum」不够：换一个枚举会让
  `state.phase !== GamePhase.Waiting` 恒真（房间永久不可进），少一个成员会让生成的 wire validator
  拒掉 shell 无条件写入的那个值（该 mode 全部客户端在结算时解不出状态）。据此生成的 `RoomStateLifecycle` 是 `GameRoom.state`
  的类型——⛔ 它不是任何具体 root 的别名：曾经的 `declare readonly state: GameRoomState` 让 shell 在类型上
  拥有 ballMove 的全部字段，「玩法无关」只剩口头约定。玩法专属字段只在 mode 自己的 hook 里按其精确
  root 类型读写。root/字段增删只修改该 mode 的单源目录，再运行
  `npm --workspace @game/server run codegen:gameplays` 与相关测试；全部生成文件禁止手改。

GameRoom 当前包含 strict auth、协议/区号/mode 复核、按 `sId + mode` 撮合隔离、异构 state、聊天、重连宽限
和显式 opt-in 的 best-effort match evidence 发射通道。
C2S/S2C payload 已经过 strict runtime schema，phase gate、全量开局 reset、fixed-step 时钟和 awaited
`lock()` 也有对应测试；等待型 `onMatchInitialize/onMatchStart/onMatchRollback/onLeave/onDispose` hook 会被观察，
每个开局 await 后重验 generation/phase/roster；dispose 会先失效 generation，再等待进行中的开局/回滚 hook，
最后执行 mode dispose 与公共清理。开局回滚归还 mode admission，重复 dispose 合流。Waiting 离开会同步清理
双向身份索引。`ballMove` v3 evidence 冻结有序开局 roster/state，
记录带 `acceptedTick` 的 accepted move/cast 与 Playing leave，并在 producer/consumer 重放核对 final state 与
participants；16,384 输入容量耗尽后拒绝后续玩法副作用。权威时间使用 tick，`elapsedMs` 只由 final tick
派生。它仍不是通用玩法层；evidence 写入保持 detached best-effort，失败不阻止收局，也不构成防篡改或
送达保证。

新增玩法前先阅读 [`docs/SERVER.md §5`](../../../../docs/SERVER.md#5-gameroom)，不要把 Demo 的相位、
重连、结算或证据 shape 当作框架承诺。
