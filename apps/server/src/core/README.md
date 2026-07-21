# core/ —— 服务端底座（源自 Arthur M0–M9，已停止回流、独立演进）

端点层（websocket/ http/ rooms/）调用这里；日常开发**不修改**本目录的逻辑，
但以下**登记式追加**是进 core 的合法理由（改逻辑前先读 docs/SERVER.md §12 规则）：

| 要做的事 | 登记点 |
|---|---|
| 加常量 / 环境变量 | `infra/config.ts`（先进 docs/SERVER.md §13 表，铁律 8） |
| 加 Redis key | `infra/keys.ts`（同上） |
| 加错误码 | `errors.ts` + shared `RPC_ERR_CODES`（先进 07 错误码表） |
| 加商店 SKU | `economy/catalog.ts`（将来由 Excel 导表取代） |
| 玩家档字段跨版本迁移 | `archive/lazyMigrate.ts`（字段本身在 ../player/userStore.ts） |
| 卸载重计算任务（铁律 11） | `compute/tasks/<任务>.ts`（default 导出纯函数；判据见 compute/README.md） |

- 根层 = 横切原语：`locks`（两层锁+fence）· `uow`（UnitOfWork/withUser）· `idem`（幂等占位）·
  `errors`（错误码）· `userRecord`（建号/活跃索引/按需取字段）
- 子目录 = 模块：`infra`（双 Redis 路由/MySQL/Lua/租约/loopMonitor 心电图）· `auth`（wx 登录/token）·
  `economy`（outbox 三阶段/充值/邮件/relayer）·
  `archive`（冷档 freeze/thaw）· `match`（结算证据链消费）· `guild`（工会事件存取：seq+近窗）·
  `compute`（worker_threads 计算池，铁律 11 卸载点）
