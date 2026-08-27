# rooms/ —— 实时状态同步 Demo

需要 Colyseus Schema 状态同步和服务器逻辑帧的玩法房放在这里；Lobby 的请求/响应通道位于
`../websocket/`。

- `GameRoom.ts`：当前 `ballMove` + 技能伤害 Demo。服务端按 `TICK_MS` 积分移动，Schema patch rate
  为 50ms，并使用 shared 技能公式。
- `schema/GameRoomState.ts`：运行时 Schema。字段增删时同步更新 shared `protocol/state.ts` 纯数据镜像，
  并运行协议指纹更新与相关测试。

GameRoom 当前包含 strict auth、协议/区号复核、撮合区隔离、聊天、重连宽限和 best-effort match evidence。
它不是通用玩法层，且明确存在：C2S payload 无 runtime schema、Waiting 技能状态可能污染开局、异步
`lock()` 失败只记日志、evidence 不记录完整输入且写失败不阻止收局等限制。

新增玩法前先阅读 [`docs/SERVER.md §5`](../../../../docs/SERVER.md#5-gameroom)，不要把 Demo 的相位、
重连、结算或证据 shape 当作框架承诺。
