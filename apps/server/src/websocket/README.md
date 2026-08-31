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

- 已登记 route 通过 `defineRpc` + shared validator 做 exact/range 校验；loader 仍只校验路由全集，未来端点
  若绕过该构造器仍可能自带一套 schema。
- 未知 route 现在先经过与已知 route 相同的 per-principal token bucket，再返回低权重 `UNKNOWN_TYPE`；
  它不会触发 flood 封禁。
- 通用 idem 自阶段 4 起是 v2（payload hash 绑定 + 唯一 leaseId + 单条 Lua CAS，见
  `docs/SERVER.md §8.1`）：相同 `clientReqId` 携带不同 payload 稳定返回 `OPERATION_CONFLICT`；
  它仍只是 UX 快闸，exactly-once 依旧靠数据层。
- handler timeout 是不可取消的 `Promise.race`，迟到写入必须由数据层收敛。
- `LobbyRoom` transport callback 与 dispatcher 共用 `validateRpcEnvelope`；畸形信封会尽力返回带可用 id 的
  `INVALID_PAYLOAD` reply，关闭中的 socket 只丢弃发送。dispatcher 仍会再次校验信封。

完整流程和正确性规则见
[`docs/SERVER.md §4`](../../../../docs/SERVER.md#4-lobby-rpc)。
