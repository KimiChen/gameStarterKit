# rooms/ —— 实时状态同步 Demo

需要 Colyseus Schema 状态同步和服务器逻辑帧的玩法房放在这里；Lobby 的请求/响应通道位于
`../websocket/`。

- `GameRoom.ts`：当前 `ballMove` + 技能伤害 Demo。服务端按 `TICK_MS` 积分移动，Schema patch rate
  为 50ms，并使用 shared 技能公式。
- `GameMode.ts`：服务端玩法登记点。`GameRoom` 继续拥有 transport、auth、房间锁和生命周期；玩法通过
  `onAdmission`、`onMessage`、`onMatchStart`、`onStep`、`onLeave`、`onFinish` 扩展规则。默认
  `ballMove` mode 保持现有行为；新增 mode 只需在自己的模块登记 factory，不改通用房间接缝。
- `schema/GameRoomState.ts`：运行时 Schema。字段增删时同步更新 shared `protocol/state.ts` 纯数据镜像，
  并运行协议指纹更新与相关测试。

GameRoom 当前包含 strict auth、协议/区号复核、撮合区隔离、聊天、重连宽限和 best-effort match evidence。
C2S/S2C payload 已经过 strict runtime schema，phase gate、全量开局 reset、fixed-step 时钟和 awaited
`lock()` 也有对应测试；Waiting 离开会同步清理双向身份索引。它仍不是通用玩法层，match evidence 不记录
完整 accepted input，且 evidence 写失败不阻止收局。

新增玩法前先阅读 [`docs/SERVER.md §5`](../../../../docs/SERVER.md#5-gameroom)，不要把 Demo 的相位、
重连、结算或证据 shape 当作框架承诺。
