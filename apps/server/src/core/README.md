# core/ —— 服务端数据与并发原语

`websocket/`、`http/` 和 `rooms/` 通过本目录访问锁、档案、Redis/MySQL、幂等与领域数据。它不是不可修改
的 vendor 目录；新增框架原语或修复正确性问题时应在这里改，但普通 endpoint 优先复用现有入口，避免绕过
锁、fence、事务和登记点。

常见修改入口：

| 要做的事 | 当前真源 |
| --- | --- |
| 增加跨模块配置或环境变量 | `infra/config.ts`；同时更新 `docs/SERVER.md` 的登记点与本地配置说明 |
| 增加 Redis key | `infra/keys.ts`；明确 global/per-zone、实例与 hash-tag |
| 增加 RPC 错误码 | 先改 shared `protocol/lobbyRpc/envelope.ts` 的 `RPC_ERR_CODES`，再改 `errors.ts` 映射 |
| 修改 Demo 商品或资产配置 | `economy/catalog.ts`；它目前是手工 TypeScript 配置，没有接入 Excel 产物 |
| 修改 Demo guild 目录 | `guild/catalog.ts` |
| 增加玩家档字段 | shared 视图类型 + `../player/userStore.ts` 字段读取；需要跨版本时再设计 reader/migration |
| 增加请求触发的纯 CPU 任务 | `compute/tasks/<task>.ts`；适用边界见 `compute/README.md` |

目录概览：

- 根层：`locks`（本地 mutex + Redis lock/fence）、`uow`（dirty commit）、`idem`（RPC 占位/结果缓存）、
  `errors`、`userRecord`。
- `infra/`：配置、key、Redis 路由/Lua、MySQL、lease、stream consumer 与本地 loop monitor。
- `auth/`：游戏组 session cache 和 best-effort kick 接缝；账号权威仍在外部 WebPlatform。
- `economy/`：软货币、ledger、shop/outbox 与显式 relayer 样例。
- `guild/`：Demo 目录与事件近窗。
- `match/`：match evidence stream 的生产/消费样例。
- `compute/`：worker_threads 纯计算池。
- `archive/`：已接入 thaw、但 freeze 默认关闭的实验模块。

额外后台、冷档和商业化参考的准确状态见
[`docs/EXTRAFEATURES.md`](../../../../docs/EXTRAFEATURES.md)。热档/冷档 schema 的 registry、原子只读与
写前迁移契约见 [`docs/SERVER.md`](../../../../docs/SERVER.md#7-玩家档案)；不要用历史里程碑或已不存在的
“07 表”替代当前源码与测试。
