# websocket/ —— ws 单次请求（HTTP 式语义，走 Colyseus 压缩）

判据：**无状态同步的一问一答**放这里；有状态同步的实时玩法房 → `../rooms/`（虽然两者都走 ws）。

- 根层 = 机械件：`LobbyRoom`（传输壳）· `dispatcher`（鉴权→限流→zod→幂等中间件链）·
  `rpc.ts`（defineRpc 类型胶水）· `loader.ts`（启动扫描注册）· `push.ts`（服务端主动推送消费侧）
- 子目录 = 端点域：`<域>/<接口>.ts`，default 导出 `defineRpc(...)`，路由名必须 = `<域>.<文件名>`
- 新增接口三步：shared `protocol/lobbyRpc/<域>.ts` 加契约 → `npm run sync:shared` → 建端点文件。
  ⛔ 不改 LobbyRoom/dispatcher。全集与 shared 不一致时服务端拒绝启动。
