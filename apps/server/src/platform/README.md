# platform/ —— 外部服务 HTTP 接缝

本目录当前只有游戏服到独立 WebPlatform 的 Internal HTTP adapter：

| 文件 | 当前职责 |
| --- | --- |
| `webPlatformClient.ts` | strict session verify、角色登记与存在性查询；服务鉴权、keep-alive、超时、响应上限、一次有限重试、熔断和 exact-key 响应校验 |

硬边界：

- 普通运行默认只委托 HTTP 实现；没有 in-process 账号实现或运行期模式开关。
- 不导入 WebPlatform 业务源码，不持有账号库 DSN；token 是不透明句柄，身份只信 verify 的 `userId`。
- HTTP 401/403、其他调用错误、超时、5xx 和非法响应都不能伪装成玩家 token 无效。
- Lobby/GameRoom 建连做 strict HTTP verify；Lobby 每消息只读游戏组 Redis session cache。
- Room/handler 不直接拼 Internal path、header 或响应 shape。

`installWebPlatformClientForTests` 是明确的测试 seam：只替换 `verify/registerCharacter/hasCharacter` delegate，
要求逆序恢复，并在 `NODE_ENV=production` 时拒绝。它可以用于无头测试，但不得成为业务 fallback 或模式开关。

`closeWebPlatformClient` 用于销毁 keep-alive agent。角色登记失败的 durable intent 与 repair loop 在
`../player/characterRepair.ts`；它们是本地补偿样例，不改变账号数据所有权。外部生成契约中的可选
operation 不属于本 adapter 的运行时职责。

契约字段、Public/Internal 分工和测试现状见
[`docs/WEBPLATFORM.md`](../../../../docs/WEBPLATFORM.md)。
