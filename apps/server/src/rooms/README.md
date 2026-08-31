# rooms/ —— 实时状态同步 Demo

需要 Colyseus Schema 状态同步和服务器逻辑帧的玩法房放在这里；Lobby 的请求/响应通道位于
`../websocket/`。

- `GameRoom.ts`：通用 transport/admission/lifecycle shell。它在 `onCreate` 按生成映射选择一次 mode root，
  之后禁止替换；默认 ballMove 按 `TICK_MS` 积分移动，Schema patch rate 为 50ms，并使用 shared 技能公式。
- `GameMode.ts`：服务端玩法登记点。`GameRoom` 继续拥有 transport、auth、房间锁和生命周期；玩法通过
  `createPlayer` 提供精确 player Schema，并必须用 `usesDefaultBallMoveRules: boolean` 显式声明是否委托
  ballMove fallback，用 `roster{min,max,autoStart}` 声明人数事实——⛔ shell 里不再有人数字面量，
  `maxClients`、满员闸、自动开局阈值、开局下限与开局边界重验五处全部读它。`roster.max` 不得超过 shared 的
  `MAX_PLAYERS`（root players map 的容量由生成 validator 按它烧死），`min ≤ autoStart ≤ max`；声明了
  `ballMove@1` 证据的 mode 其 `min`/`autoStart` 必须都等于 `BALL_MOVE_ROSTER_SIZE`，因为该证据把
  `initialRoster` 冻结成恰好 2 条。上述校验在登记期与注入期各跑一次（注入式 mode 不经过 registry，
  ⛔ 不能只在 registry 里校验）。玩法输入同样声明化：`inputs{accepts,phases?}` 决定 shell 的准入，
  `phaseAllows` 只保留 Ping/Chat 两条公共传输能力，⛔ 通用 shell 不再穷举任何具体玩法的消息名。
  未声明 `phases` 的输入默认只在 Playing 开放。`onAdmission`、`onMessage`、`onMatchInitialize`、`onMatchStart`、`onMatchRollback`、
  `onStep`、`onPlayerLeaving`、`shouldSettle`、`onLeave`、`onFinish`、`onDispose` 扩展玩法生命周期；
  `matchEvidenceRuleset` 必须显式声明受支持的 exact replay 契约，当前只有 `ballMove@1`。registry 会在
  创建 mode 时校验必填能力，漏配即 fail-closed；root 只来自 manifest 生成映射，不由 mode factory 手写。
- `modes/catalog.ts` / `modes/IdleGameMode.ts`：生产 mode catalog 与最小第二玩法。Idle 使用独立
  `IdleRoomState`、strict `IdlePulse` 和 pulse/真实离场结算，不执行 ballMove 输入规则，也不写 ballMove
  casual evidence。
- `schema/GameRoomState.ts`：由 shared `schema/game-room-state.json` 生成的多 root 运行时 Schema 及
  mode→root 构造器映射；同一 manifest 也生成 shared `protocol/state.ts` 的纯数据接口、mode→validator 映射。
  root/字段增删只修改 manifest，再运行
  `npm --workspace @game/server run codegen:state`、协议指纹更新与相关测试；两份生成文件禁止手改。

GameRoom 当前包含 strict auth、协议/区号/mode 复核、按 `sId + mode` 撮合隔离、异构 state、聊天、重连宽限
和显式 opt-in 的 best-effort match evidence。
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
