# M0 · 前置验证实测结论

> [10 · M0 硬闸](./10-implementation-plan.md#m0--前置验证与拍板)的两个实测项的书面结论。
> 实测脚本在 `apps/server/tools/m0/`，可重复运行、自清理。
>
> ⚠ **本机数字仅验证 harness 与量级**：实测环境是 macOS 笔记本（Apple M1 / 8 核 / 16GB / macOS 26.5.2，
> Node v25.9.0，MySQL 8.4.10 @ 3316，Redis 8.8.0 @ 6401，全部本机回环、无网络延迟、无生产负载）。
> **生产阈值必须在生产规格机器 + 真实网络拓扑下复测**，本篇数字不可直接写进 SLA。

---

## 硬闸 ① · Colyseus 0.17 定向建房 + RedisDriver/RedisPresence

### 运行方式

```bash
# 前置：dev-stack 已起（tools/dev-stack.sh start）；依赖已装（@colyseus/redis-driver@0.17.7 / redis-presence@0.17.7）
npm --workspace @game/server exec tsx -- tools/m0/colyseus-redis-probe.ts
```

脚本 spawn 两个真实 Colyseus server 子进程（A=3701 / B=3702，各自独立 processId），
均配 `RedisDriver + RedisPresence` 连 durable Redis 的 **db 9**（业务在 db 0，探针结束 SCAN+UNLINK 清空）。

### 结论：**支持定向建房** → 按现设计走，不需要自建 RemoteRoomCall / seat-aware proxy

机制（已核对 `node_modules/@colyseus/core@0.17.7` 源码，非文档推断）：

1. **`ServerOptions.selectProcessIdToCreateRoom`**（`src/Server.ts` L49）：`createRoom` 时回调
   `(roomName, clientOptions) => Promise<processId>`，返回哪个 processId 房间就建在哪个进程
   （`src/MatchMaker.ts` L461-465）。缺省实现按「最少房数」均衡（数据源 = presence hash `roomcount`）。
2. **跨进程建房经 IPC**：选中的 processId 非本进程时，经 presence pub/sub 频道 `p:{processId}` 发
   `requestFromIPC`，目标进程执行 `handleCreateRoom`（`MatchMaker.ts` L489-497）。IPC 超时（默认 2s，
   `COLYSEUS_PRESENCE_SHORT_TIMEOUT` 可调）则触发健康检查并**回落本进程建房**。
3. **客户端直连目标进程**：每进程配 `publicAddress`，seat reservation 带回目标进程地址，
   SDK 拿到后直接 ws 连目标进程（`@colyseus/sdk` `Client.buildEndpoint`）——匹配入口进程只做撮合，不中转流量。

### 本机实测（2026-07-10，探针全绿，重复运行两次均通过）

| # | 实测项 | 结果 |
|---|---|---|
| (a) | 跨进程房间列表：A 建房，B 经 `matchMaker.query`（RedisDriver 共享 hash `roomcaches`）可见 | ✅ |
| (a) | 跨进程匹配：真实 SDK 客户端经 **B** 的 matchmake 入口 `joinOrCreate` → 命中 **A** 上已有的房（跨进程 seat reservation + 按 `publicAddress` 直连 A） | ✅ |
| (b) | **定向建房**：SDK 客户端经 **A** 的 matchmake 入口 `create`，`selectProcessIdToCreateRoom` 指定 B → 房间实例落在 **B** 进程内存（`getLocalRoomById` 双向验证：B=true / A=false），客户端成功入座 | ✅ |
| (c) | kill -9 B 后：B 的房**仍残留**在 `roomcaches`（无进程主动清） | ✅（符合源码预期） |
| (c) | 对死进程的房 `joinById` → 2s IPC 超时 + 2s 健康检查超时（实测 4013ms）→ `SeatReservationError` 拒绝，同时 `stats.excludeProcess` + `driver.cleanup` 把 B 的房与统计**全部清除** | ✅ |

### 对设计的影响

- **按现设计**（03 网关 / 06 容量）：多节点 + RedisDriver/RedisPresence + `selectProcessIdToCreateRoom` 直接可用。
  M8 结算、M5 网关不需要为「跨节点建房」引入任何自建协议。
- **`targetProcessId` 必须服务端注入**：探针为了测试把它放进 clientOptions；生产上该值由服务端匹配逻辑决定
  （节点负载/机房亲和），⛔ 不能信客户端传的目标节点（09·G1 精神）。回调里应把客户端传入的同名字段剥掉。
- **崩溃清理是懒触发，不是定时任务**：进程猝死后房间残留在 `roomcaches`，直到 ① 下一次涉及该进程的 IPC
  失败触发健康检查，或 ② 任一新进程启动时 `healthCheckAllProcesses` 兜底。窗口期内客户端会拿到
  「幽灵房」并在 reservation 阶段失败（SDK 侧表现为匹配报错，可重试收敛）。**M10 监控应加
  「roomcaches 行数 vs 各进程存活」对账项**；游戏节点崩溃拉起本身会触发 ②，可接受。
- **matchmaking Redis 的 key 名固定**（`roomcaches` / `roomcount` / 频道 `p:*`、`$roomId`，不可加前缀）：
  生产上 matchmaking 状态**不与业务 durable 混 db**。探针用 db 9 演示了 db 隔离可行；
  ⚠ Redis pub/sub 不分 db，若未来业务用到同名频道会串——建议生产直接给 matchmaking 独立小实例
  （它是纯协调数据，掉了各进程重启自愈，不需要 AOF），形态写进 06/07 时再拍板。
- IPC 超时 2s（`COLYSEUS_PRESENCE_SHORT_TIMEOUT`）：跨机房部署时需按真实 RTT 复核。

---

## 硬闸 ② · 货币同步事务压测

### 运行方式

```bash
# 事务体 = 04 阶段 1 原样：BEGIN(RC); INSERT ledger(ODKU id=id); UPDATE balance(余额+fence 守卫); INSERT outbox; COMMIT
npm --workspace @game/server exec tsx -- tools/m0/currency-txn-bench.ts \
  [--workers 8] [--txns 2000] [--users 1000]
```

数据用 `bench_` 前缀 user_id（1000 个用户、seed 余额充足），跑完自动 DELETE 清理
（实测清理后 ledger/outbox/user_currency 的 bench 行均为 0）。1213/1205 有界退避重试（09·DB5）计入延迟。

### 本机实测（2026-07-10，MySQL 8.4.10 @ 127.0.0.1:3316，连接池 20）

| 并发 | 总事务 | 总耗时 | QPS | p50 | p90 | **p99** | max | dup / 重试 |
|---|---|---|---|---|---|---|---|---|
| 8 workers × 2000 | 16 000 | 7.59s | **2109** | 3.58ms | 5.03ms | **6.83ms** | 18.32ms | 0 / 0 |
| 16 workers × 2000 | 32 000 | 15.93s | **2009** | 7.57ms | 9.53ms | **18.45ms** | 82.34ms | 0 / 0 |

### 结论

- **硬闸通过**：p99（6.83ms @ 8 并发 / 18.45ms @ 16 并发）≪ `LOCK_TTL_MS` 5000ms，且低于 100ms 理想线两个数量级。
- **`LOCK_TTL_MS = 5000` 维持现值**（09·L6：锁 TTL 必须罩住货币事务 p99）——本机余量约 270×；
  除非生产复测出现数量级劣化，否则不动。
- 16 并发时 QPS 持平、延迟翻倍 → 本机瓶颈在单机 MySQL 的组提交/刷盘，符合预期；
  量级上单实例扛 2000 QPS 货币事务，远超小游戏充值/结算需求，**04 的同步事务设计不需要改**。
- 说明：`balance_after` 按 04 示例插 0 占位（真实实现 M6 同事务回读补齐），对压测的锁/索引路径无影响。

---

## 07 验收阈值表 · 待产品/运维填写行（owner 待定）

后端两行已由本篇实测填上；下列行**没有数字就无法判定 M0 DoD 达成**，需要指派 owner + 截止日：

| 项 | 目标值 | 谁负责 | 状态 |
|---|---|---|---|
| 目标峰值 CCU | ______ | **产品（owner 待定）** | ⬜ |
| 目标充值 / 结算 QPS | ______ | **产品（owner 待定）** | ⬜ |
| 货币事务 p99 延迟上限 | 本机 6.83ms（8 并发）；上限建议 100ms，**生产复测后定稿** | 后端 | ◐（本机已测） |
| `LOCK_TTL_MS` 是否 > 上一行 | 是（5000ms ≫ 6.83ms，生产复测后复核） | 后端 | ◐ |
| Colyseus 0.17 能否定向建房 | **支持**（本篇硬闸 ①） | 后端 | ✅ |
| Redis failover RPO 上界 | ______ s | **运维（owner 待定）** | ⬜ |
| Redis 冷启动 RTO 上界 | ______ min | **运维（owner 待定）** | ⬜ |
| 单档平均大小（决定容量） | ______ KB（待 M4 迁移 ETL 抽样） | 后端 | ⬜ |
| DR 演练：真的恢复过一次 | 是 / 否 | **运维（owner 待定）** | ⬜ |
| [06 SLA 清单](./06-capacity-and-ops.md#运维必须签字的-sla)签字 | —— | **运维（owner 待定）** | ⬜ |
