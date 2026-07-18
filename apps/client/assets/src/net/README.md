# net/ —— 通道面（两端映射表）

| 服务端 | 客户端通道 | 客户端逻辑 |
|---|---|---|
| `rooms/GameRoom` | `RoomClient.ts`（join / 输入上行 / 状态同步） | `logic/rooms/ballMove/` |
| `websocket/<域>/<接口>` | `WebSocketClient.ts`（rpc / rpcIdem / onPush） | 调用方在 page / rooms 皆可 |
| `http/<域>` | `http/<域>.ts`（真实 HTTP：`area.ts` 选服 / `notice.ts` 公告） | `logic/page/` |
| `mock/api/<接口>` | `mock/<接口>.ts`（`/mock/` 前缀 = 假数据） | — |
| （无，纯客户端状态） | `serverSession.ts`（当前选中区服 + 列表 + 哈希） | 大厅写、Main 进房读 `wsUrl` |

注意：RoomClient 与 WebSocketClient 都走 websocket 协议——按「有无状态同步」区分，不按协议区分。
XHR 底座与 token 在 `core/http.ts`；写接口一律 `rpcIdem`（clientReqId 生成一次、重试复用）。
区服 = 独立实例：进房连 `serverSession.getCurrentServer().wsUrl`（`ws→http` 传 Colyseus Client），非固定 serverUrl。
