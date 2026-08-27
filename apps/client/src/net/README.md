# net/ —— 通道面（两端映射表）

| 服务端 | 客户端通道 | 客户端逻辑 |
|---|---|---|
| `rooms/GameRoom` | `RoomClient.ts`（join / 输入上行 / 状态同步） | `logic/rooms/ballMove/` |
| `websocket/<域>/<接口>` | `WebSocketClient.ts`（rpc / rpcIdem / onPush） | 调用方在 page / rooms 皆可 |
| 外部 WebPlatform Public HTTP | `http/account.ts`（开发登录）/ `http/area.ts`（选服） | `logic/page/` |
| 游戏服 HTTP | `http/notice.ts`（公告） | `logic/page/` |
| （无，纯客户端状态） | `serverSession.ts`（当前选中区服、列表、`isOps` 与哈希） | 页面写入，Lobby/GameRoom 读取 `gameHttpUrl` |
| （无，纯客户端状态） | `session.ts`（登录态 token/userId 与 authInvalid/connLost/battleLost 事件枢纽；只有 authInvalid 在未登录时幂等吞掉迟到上报，connLost/battleLost 不判断登录态） | 编排层订阅 |

注意：RoomClient 与 WebSocketClient 都走 websocket 协议——按「有无状态同步」区分，不按协议区分。
XHR 底座与 token 在 `core/http.ts`；Lobby 写接口应使用 `rpcIdem`（`clientReqId` 生成一次、重试复用）。

区服 = 独立实例：当前代码把 `serverSession.getCurrentServer().gameHttpUrl` 传给 Colyseus Client，SDK
自行派生 websocket 地址，不再从旧 `wsUrl` 猜 HTTP 地址。目录返回的 `gameWsUrl` 与列表 hash 会保存在
会话中，但当前连接路径没有直接消费 `gameWsUrl`，也没有用 hash 做列表新鲜度校验，不能把“已保存”描述成
“已验证/已使用”。已知连接与选服状态缺口见根 `plan.md`。
