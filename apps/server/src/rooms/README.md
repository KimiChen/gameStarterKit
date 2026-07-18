# rooms/ —— 实时玩法房（有状态同步）

判据：需要 **Schema 状态同步 / 逐帧广播** 的实时玩法放这里；无状态的一问一答 → `../websocket/`。

- `GameRoom.ts`：主玩法房（当前为 mock 玩法：20fps 移动积分、技能结算用 shared 共享公式）
- `schema/`：Colyseus Schema 状态树——字段增删必须同步 shared `protocol/state.ts` 镜像（铁律 6）
- 大厅房 LobbyRoom 不在这里——它是 ws-RPC 的传输壳，归 `../websocket/`
