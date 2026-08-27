# 服务端开发

> 本文描述 `apps/server` 的开发结构、数据正确性约束和本地验证方式；完整范围见
> [根 README](../README.md#项目边界)。

## 1. 本地开始

```bash
npm install
npm --workspace @game/server run stack
npm --workspace @game/server run db:bootstrap
npm run dev
```

本地依赖示例包含两个 Redis 和一个 MySQL：

- durable Redis：示例玩家热档、锁、幂等 marker 和 stream。
- cache Redis：可丢弃缓存与开发期协调数据。
- MySQL：示例货币、ledger、outbox、邮件和对局结果。

测试：

```bash
npm --workspace @game/server run test
npm --workspace @game/server run smoke
npm --workspace @game/server run test:int
```

这些命令只用于本地开发和功能验证。`/` 与 `/monitor` 若在开发配置中启用，也只是本地调试界面。

## 2. 目录

```text
apps/server/src/
├── app.config.ts       Colyseus 开发配置与房间登记
├── index.ts            开发进程入口
├── core/               数据、锁、幂等、outbox、计算任务
├── http/               开发期 HTTP endpoint
├── platform/           外部开发契约适配
├── player/             玩家档案读写入口
├── rooms/              GameRoom 等有状态房间
└── websocket/          LobbyRoom 与逐文件 RPC handler
```

日常功能优先通过登记点追加，不修改 dispatcher/loader 的通用机制。

## 3. 数据边界

当前示例把数据分成三类：

| 数据 | 示例真源 | 说明 |
| --- | --- | --- |
| 账号、开发会话、角色存在性 | 外部身份服务 | 本仓只通过 HTTP 契约读取或登记 |
| 货币、ledger、outbox、邮件、对局结果 | MySQL | 使用事务和唯一键约束 |
| 玩家热档、背包、fence、幂等 marker | durable Redis | 使用 hash/Lua/lock 维护 |
| 可重建余额缓存等 | cache Redis | 失败时应能回到真源 |

进程内 Map、Room state 和计时器都不是权威存储。请求结束前应把需要保留的变化提交到对应真源；
不能依赖进程退出时 flush。

区上下文必须显式传播：

- MySQL 查询携带 `server_id`。
- Redis key 通过 `zoneCtx` 前缀化。
- 幂等 ID 编入区号。
- 房间对 join options 与认证结果进行一致性核对。

## 4. Lobby RPC

结构：

```text
websocket/
├── LobbyRoom.ts
├── rpc.ts
├── handlers.ts
└── <domain>/<method>.ts
```

新增 RPC：

1. 在 shared 定义消息名、请求、响应和错误码。
2. 运行 `npm run sync:shared`。
3. 新建 `websocket/<domain>/<method>.ts`。
4. 导出 handler、schema 和幂等属性。
5. 增加权限、错误分支和重试测试。

dispatcher 负责：

- schema 校验。
- handler 定位。
- RPC error 映射。
- per-user 串行化。
- 可重试写的幂等包装。
- 本地 handler 预算诊断。

客户端错误按 shared error code 分支，不能依赖服务端原始异常文本。

### 读写分路

- 纯读可以直接调用只读 loader。
- 单用户档案写通过 `withUser` / UoW。
- MySQL 权威写通过事务与 ledger/outbox。
- 跨用户或大规模计算进入 `core/compute/tasks`，不要阻塞房间消息循环。

## 5. GameRoom

GameRoom 是 ballMove 演示房，展示：

- join options 与协议检查。
- Colyseus Schema 状态同步。
- 输入消息与服务器侧模拟。
- reconnect/leave 的基本生命周期。
- 对局结束时生成示例 evidence。

它不是通用玩法层。正式玩法开发前应把 transport、admission、simulation、input 和 evidence 接缝拆成
可替换模式，并为所有 C2S payload 增加运行时校验。

## 6. HTTP 开发边界

`src/http` 只承载开发期 utility、公告和契约示例。endpoint 仍须遵守：

- method/path/请求与响应从 shared 契约登记。
- body 在边界做大小、类型和字段校验。
- 不向调用方返回原始异常、SQL 或密钥。
- 外部身份只通过 `platform/webPlatformClient.ts` 的 HTTP 契约访问。
- HTTP handler 不绕过 player/core 写路径直接修改权威数据。

## 7. 玩家档案

核心入口：

- `loadUser`：读取热档。
- `withUser`：在用户锁与 fence 下执行读改写。
- `ensureLive`：实验性冷档模块中的加载接缝。
- UoW：记录 dirty 字段并集中提交。

原则：

1. callback 可能因冲突重试，副作用必须放在提交之后或具备幂等性。
2. Redis lock 只提供互斥窗口；真正防止过期持有者写入的是 fence。
3. 不使用 `HGETALL` 加全量覆盖保存，避免未知字段被旧代码抹掉。
4. 档案字段演进通过 `schemaVersion` 和迁移函数显式处理。

## 8. 幂等与 outbox

### 幂等

稳定的 `clientReqId` / `op_id` 应贯穿：

```text
请求
  → 幂等占位
  → MySQL ledger/outbox
  → Redis applied marker
  → 响应缓存
```

同一个业务操作只能使用一个稳定 ID。重试不能重新生成 ID，也不能用随机值掩盖重复提交。

### Outbox

当前示例使用：

1. MySQL 事务写权威行与 outbox intent。
2. 尝试应用 Redis effect。
3. 成功后标记 outbox done；失败保留 intent 供本地后台处理样例重试。

effect 必须在任何写入前完成全量校验，并通过单个 Lua 原子应用；未知 kind/version 不得静默成功。
本文描述的是开发实现应维持的不变量，不构成对外部环境的 exactly-once 服务承诺。

## 9. 实验性冷档模块

`core/archive` 展示 freeze/thaw、archive fence 和 lazy migrate 的代码结构。该模块当前属于开发实验：

- 不能把它当成容量或长期存储方案。
- 未完成区隔离与一致性测试前保持关闭。
- `user_archive` 与热档 fence 必须单调。
- thaw/freeze 的并发故障窗由本地集成测试覆盖。

## 10. 广播与事件

当前事件接口用于本地示例中的 mail wake 与 guild push：

- 广播只表达“有变化”，接收方重新 pull 权威数据。
- 不把完整权威对象塞进 push。
- 在线索引按区隔离。
- handler 注册与 payload shape 由测试约束。

## 11. 计算任务

Node 网关消息循环内禁止大规模同步计算。开发期默认用较小预算暴露问题：

- 小型校验和状态变更留在 handler。
- 结算模拟、全量重算、批量处理、离线补算等放到 `core/compute/tasks`。
- worker task 输入输出必须可序列化。
- 队列、超时和失败通过本地测试验证。

`[rpc-budget]` 与 loop monitor 是本地诊断信息。

## 12. 开发约束索引

以下编号与源码中的 `09·XX` 注释对应，表达代码正确性。

### A — 数据权威

- **09·A1**：同一字段只有一个权威真源。
- **09·A2**：跨存储禁止裸双写。
- **09·A3**：进程内状态不作为持久真源。
- **09·A4**：缓存失败不能改变权威业务结果。
- **09·A5**：事件只作唤醒，消费方回读真源。

### L — 锁与 fence

- **09·L1**：共享写必须有分布式互斥。
- **09·L2**：不同语义的 fence/版本号不能共用计数器。
- **09·L3**：提交时校验 fence，过期持有者不得写入。
- **09·L4**：锁 TTL、续租和请求预算必须在本地故障测试中覆盖。

### I — 幂等

- **09·I1**：请求级幂等 ID 由调用方生成一次并在重试中复用。
- **09·I2**：幂等 key 包含项目、区、用户与业务域。
- **09·I3**：占位、结果缓存和业务唯一键相互补充。
- **09·I4**：相同 ID 不得承载不同 payload。
- **09·I5**：applied marker 的保留与裁剪不能破坏未完成 intent。

### X — 跨存储

- **09·X1**：MySQL 事务内写 ledger 与 outbox。
- **09·X2**：网络或 Redis 操作不放在持行锁事务内。
- **09·X3**：effect 全量验证后再原子执行。
- **09·X4**：重复消费依靠业务唯一键和 applied marker 收敛。
- **09·X5**：损坏 payload 返回可判别错误，不能标成功。

### R — Redis

- **09·R1**：key 必须由 `keys.ts` 构造并携带区上下文。
- **09·R2**：禁止业务代码直接 `HGETALL` 后整档覆盖。
- **09·R3**：相关 key 的 Lua 操作保持同槽。
- **09·R4**：cache 与 durable 客户端语义分离。
- **09·R5**：scan/stream 处理必须有界。
- **09·R6**：删除示例数据优先使用非阻塞命令。
- **09·R7**：Lua 使用 SHA 缓存并处理 `NOSCRIPT`。

### DB — MySQL

- **09·DB1**：表与查询显式携带 `server_id`。
- **09·DB2**：经济变更写 ledger 唯一键。
- **09·DB3**：事务函数保持短小，不夹外部 I/O。
- **09·DB4**：分区表的唯一键包含分区列，修改前验证谓词。
- **09·DB5**：只对明确幂等事务做有总预算的竞争重试。
- **09·DB6**：不要用 `INSERT IGNORE` 吞掉 shape 或约束错误。

### G — 网关与协议

- **09·G1**：消息名与协议类型来自 shared。
- **09·G2**：读写路径分开。
- **09·G3**：错误使用稳定 code，不泄露原始异常。
- **09·G4**：所有外部 payload 先做运行时校验。
- **09·G5**：未知消息也经过有界处理。
- **09·G6**：重计算离开网关 handler。
- **09·G7 / G7b / G8**：编号保留，当前开发文档不展开。

### K — 对局与后台处理样例

- **09·K1**：对局证据包含稳定 match ID、模式、区号和 schema version。
- **09·K2**：消费者按 match ID 幂等。
- **09·K3**：损坏条目不能静默丢弃。
- **09·K4**：处理中的 lease/claim 行为需要故障测试。
- **09·K5**：混合 schema fixture 明确兼容边界。

### F/S — 档案与 schema

- **09·F1**：freeze/thaw 始终核对 archive fence。
- **09·F2**：任一写路径都不能绕过在线保护。
- **09·F3**：冷档 callback 的执行次数与失败语义有测试。
- **09·F4**：外部角色登记不可达时不猜测不存在。
- **09·F5**：编号保留，当前开发文档不展开。
- **09·S1**：schema version、reader 和 migrator 的边界显式化。

## 13. 登记点

| 内容 | 真源 |
| --- | --- |
| RPC 消息与错误码 | `apps/shared/src/protocol` |
| Colyseus state 镜像 | `apps/shared/src/protocol/state.ts` |
| Redis key | `apps/server/src/core/infra/keys.ts` |
| 服务端配置 | `apps/server/src/core/infra/config.ts` |
| Lua | `apps/server/src/core/infra/redisScripts.ts` |
| RPC endpoint | `apps/server/src/websocket/<domain>/<method>.ts` |
| HTTP endpoint | `apps/server/src/http/<domain>/<method>.ts` |
| 计算任务 | `apps/server/src/core/compute/tasks` |

新增能力时先更新契约和登记点，再编写调用方。

## 14. 本地验证建议

最小检查：

```bash
npm run typecheck
npm --workspace @game/server run test
```

涉及 Redis/MySQL、锁、outbox、归档或 stream 时，再运行本地集成测试。测试应覆盖：

- 重复请求。
- 锁过期与 fence 冲突。
- 外部依赖超时。
- 事务中断和重试。
- 非法 payload、NaN、超长数组和未知版本。
- 同 uid 跨区隔离。

## 15. 范围

服务端代码只作为开发骨架和示例实现；完整项目边界见根 README。
