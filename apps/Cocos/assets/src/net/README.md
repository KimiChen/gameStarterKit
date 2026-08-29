# net/ —— 通道面（两端映射表）

| 服务端 | 客户端通道 | 客户端逻辑 |
|---|---|---|
| `rooms/GameRoom` | `RoomClient.ts` + `rooms/GameRoomTransport.ts` + mode adapter | `gameplay/catalog.ts` → `logic/rooms/<mode>/` |
| `websocket/<域>/<接口>` | `WebSocketClient.ts`（rpc / rpcIdem / onPush） | 调用方在 page / rooms 皆可 |
| 外部 WebPlatform Public HTTP | `http/account.ts`（开发登录）/ `http/area.ts`（选服） | `logic/page/` |
| 游戏服 HTTP | `http/notice.ts`（公告） | `logic/page/` |
| （无，纯客户端状态） | `serverSession.ts`（当前选中区服、列表与目录响应） | 页面写入，Lobby/GameRoom 读取 `gameWsUrl` |
| （无，纯客户端状态） | `session.ts`（登录态 identity、角色快照与 authInvalid/connLost/battleLost 事件枢纽；Lobby 最终断线先对账，失败才进入统一 returnToLogin） | 编排层订阅 |

注意：RoomClient 与 WebSocketClient 都走 websocket 协议——按「有无状态同步」区分，不按协议区分。
XHR 底座与 token 在 `core/http.ts`；Lobby 写接口应使用 `rpcIdem`（`clientReqId` 生成一次、重试复用）。
Lobby join 禁止 `mode`；Game join 必须显式携带 shared canonical `mode`。通用 transport 只持有物理 room
ownership，并要求 mode adapter 注入生成 state 类型对应的 raw exact validator、C2S allowlist 与可选
reconcile；通用层在 join、每次 state change 和 reconnect 恢复前验证原始 reflected Schema，不先白名单投影
洗掉未知 wire 字段。玩法只拿到不含原始 SDK room/send 的 typed facade；首个真实 `ROOM_STATE` 前以及每次
reconnect 的下一帧前发送闸保持关闭，SDK 自带离线消息队列固定为 0 并清空，不能绕过 validator/allowlist
自动重放。各 adapter 再暴露自己的消息、状态和输入能力，默认登记集中在 `gameplay/catalog.ts`。ballMove
独占 Move reconcile，idle 的 join/reconnect 不构造 Move。
LobbyRoom 对 SDK 可重试的 transport drop 保留 10 秒窗口；WebSocketClient 在窗口内保留 room/ownership/listener，
拒绝全部新 RPC 而不让 SDK 排队，当前 generation 的 onReconnect 恢复后续 RPC。主动 leave、停服与强踢不进宽限。
Lobby 最终 `onLeave` 会在 transport 清理后触发客户端对账层：复用当前内存 token，以显式 ownership 重进所选区 Lobby，
再用 `user.getInfo` 原子刷新当前 generation 的角色快照。join 有 15 秒超时且随页面 scope 取消；失败才走
既有 `returnToLogin`，旧 generation 只能释放自己的 ownership，不能覆盖新快照或关闭新登录连接。

区服 = 独立实例：目录返回的 `gameWsUrl` 是 Colyseus Client 的明确连接端点（SDK 会由它派生
matchmaking HTTP URL），`gameHttpUrl` 仍只用于 Portal/游戏 HTTP 请求。目录响应中的 `hash` 只属于
目录缓存/诊断，不作为 join 准入字段；列表刷新采用 `serverSession` 的整体快照，成功时保留仍存在的
当前区，失败时不抹掉旧快照。不要从旧字段或宿主地址猜测区服端点。
