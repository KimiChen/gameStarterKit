# net/ —— 通道面（两端映射表）

| 服务端 | 客户端通道 | 客户端逻辑 |
|---|---|---|
| `rooms/GameRoom` | `RoomClient.ts`（join / 输入上行 / 状态同步） | `logic/rooms/ballMove/` |
| `websocket/<域>/<接口>` | `WebSocketClient.ts`（rpc / rpcIdem / onPush） | 调用方在 page / rooms 皆可 |
| 外部 WebPlatform Public HTTP | `http/account.ts`（开发登录）/ `http/area.ts`（选服） | `logic/page/` |
| 游戏服 HTTP | `http/notice.ts`（公告） | `logic/page/` |
| （无，纯客户端状态） | `serverSession.ts`（当前选中区服、列表与目录响应） | 页面写入，Lobby/GameRoom 读取 `gameWsUrl` |
| （无，纯客户端状态） | `session.ts`（登录态 token/userId 与 authInvalid/connLost/battleLost 事件枢纽；authInvalid 在未登录时幂等吞掉迟到上报；connLost/battleLost 由统一 returnToLogin 出口编排回登录并清理 bearer） | 编排层订阅 |

注意：RoomClient 与 WebSocketClient 都走 websocket 协议——按「有无状态同步」区分，不按协议区分。
XHR 底座与 token 在 `core/http.ts`；Lobby 写接口应使用 `rpcIdem`（`clientReqId` 生成一次、重试复用）。

区服 = 独立实例：目录返回的 `gameWsUrl` 是 Colyseus Client 的明确连接端点（SDK 会由它派生
matchmaking HTTP URL），`gameHttpUrl` 仍只用于 Portal/游戏 HTTP 请求。目录响应中的 `hash` 只属于
目录缓存/诊断，不作为 join 准入字段；列表刷新采用 `serverSession` 的整体快照，成功时保留仍存在的
当前区，失败时不抹掉旧快照。不要从旧字段或宿主地址猜测区服端点。
