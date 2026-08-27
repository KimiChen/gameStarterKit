# websocket/ —— Lobby RPC 与主动推送

这里承载 LobbyRoom 上无 Schema 状态同步的一问一答 RPC，以及 Lobby 在线连接的主动推送；实时玩法状态
同步位于 `../rooms/`。

根层职责：

- `LobbyRoom.ts`：连接级 strict auth、每消息 session cache 复核、`zoneCtx` 和响应发送。
- `loader.ts`：运行时扫描 `<domain>/<method>.ts`，校验路径名和 shared endpoint 全集后注册。
- `rpc.ts`：`defineRpc` 类型胶水与本地同步阻塞预算探针。
- `dispatcher.ts`：路由查找 → 令牌桶 → Zod parse → 可选幂等占位 → handler timeout/error mapping。
- `push.ts`：只登记 Lobby 在线连接，提供 user/guild/all push 与 mailwake consumer。

新增 RPC：先在 shared `protocol/lobbyRpc` 增加请求、响应和消息名，运行 `npm run sync:shared`，再创建
`<domain>/<method>.ts` 并用 `defineRpc` 默认导出。路由名必须等于路径；全集不一致时服务端拒绝启动。

loader 依赖 tsx 直接运行、文件系统扫描和动态 import；它不是打包器的静态 manifest。dispatcher 不负责
连接认证或 per-user 写串行化，后者由 LobbyRoom 和 handler/core 分别承担。

当前已知边界：

- Zod 类型对齐不能证明 shared 与 schema 的 exact 字段集合；普通 object 会剥离未知字段。
- 未知 route 在 rate check 前返回；未知消息尚未受同一 token bucket 约束。
- 通用 idem key 没有 payload hash，相同 `clientReqId` 携带不同 payload 不会报冲突。
- handler timeout 是不可取消的 `Promise.race`，迟到写入必须由数据层收敛。
- 信封校验发生在 dispatcher 之前：`LobbyRoom` 用 Colyseus `validate(rpcEnvelopeSchema, ...)` 注册 `rpc`
  消息，`id`/`type` 必须是 1–64 字符字符串。信封不合法时 Colyseus 直接以 `WITH_ERROR` 关闭该连接，不会
  返回带错误码的 reply，该连接上在途 RPC 的配对全部落空。

完整流程和正确性规则见
[`docs/SERVER.md §4`](../../../../docs/SERVER.md#4-lobby-rpc)。
