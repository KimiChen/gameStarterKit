# platform/ —— 外部服务接缝

本目录只保留游戏服到独立 WebPlatform 的 Internal HTTP 接缝：

| 文件 | 职责 |
|---|---|
| `webPlatformClient.ts` | strict session verify、角色登记与角色存在性查询；服务鉴权、超时、有限重试、熔断和响应校验 |

硬约束：

- 不存在 in-process 实现或运行期模式开关。
- 不导入 WebPlatform 业务源码，不持有账号库 DSN。
- token 是不透明句柄；身份只信 verify 返回的 `userId`。
- HTTP 401/403、超时、5xx 和非法响应均属于服务/基础设施故障，不能伪装成玩家 token 无效。
- 每消息鉴权只查游戏组 Redis session cache；只有建连 strict auth 回源 WebPlatform。
