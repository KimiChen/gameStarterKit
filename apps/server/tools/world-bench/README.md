# tools/world-bench —— 世界 / 房间基准台（证据生成器）

docs/MMO.md MF1「基准台」的落点（施工批次 docs/MMO-PLAN.md MF1-B1）。它在**本进程**起一个真实 Colyseus server（`GameRoom` + 剧本登记的 mode），
用 `@colyseus/sdk` 起 N 个机器人经真实 WebSocket 加入房间并按种子随机行为发消息，采样窗口内记录：

| 指标 | 采样点 | 说明 |
| --- | --- | --- |
| `tick` p50 / p95 / p99 / max（ms） | 包一层 `GameRoom.prototype.stepFixed`（只记 Playing 中的固定步） | 全部房间的固定步合在一起统计；`fixedStepMs` 一并记录 |
| `outbound.bytesPerSessionPerSec` | 包一层 `@colyseus/ws-transport` `WebSocketClient.prototype.raw` | 每个机器人会话的**真实出站字节**（含 Schema patch、core 消息） |
| `baseline.bytesPerJoin` | 剧本在客户端按 `JSON.stringify(payload).length` 累加首个完整 baseline 的分块 | JSON 长度只是代理量（线上是 msgpack），用于比较不用于绝对值 |
| `clientSide.delta*` | 同上，逐条 delta 的 JSON 长度与条数 | 同上 |
| `eventLoop` p50 / p99 / max（ms） | `perf_hooks.monitorEventLoopDelay` | ⚠ 机器人 SDK 与服务端同进程，延迟包含机器人自身开销（偏保守） |
| `memory.rss*` | `process.memoryUsage().rss` | 同上，含机器人侧 |

⛔ 不进 `verify:core`（同 `tools/m0/`）；结果落 `docs/perf/world-bench/<时间戳>-<剧本>[-<标签>].json`，作为 MMO.md §11.2 冻结数字的证据入库。

## 用法

```bash
# 前置：本地栈已起（会话签发与 snake 档水合走真实 Redis）
npm --workspace @game/server run stack
# 跑一次剧本（缺省 40 机器人 / 20 s / 种子 7 / 0 区），写报告
npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --scenario snake-baseline --bots 40 --seconds 20 --seed 7 --label runA
# 只看数字不落盘
npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --scenario snake-baseline --no-write
# MF1 退出条件：同剧本两次主要指标偏差 < 10%
npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --compare docs/perf/world-bench/<a>.json docs/perf/world-bench/<b>.json --threshold 0.10
```

主要指标集（`report.ts` 的 `KEY_METRICS`）：tick p50 / p95 / p99、每会话出站 B/s p50 / p95、baseline B/join p50、事件循环 p99。

## 剧本

| 剧本 | 内容 |
| --- | --- |
| `snake-baseline` | 机器人进 snake dropIn 房（每房 8 真人 + AI 补到 17 蛇），每 150 ms 按种子随机方向发 `c2s.snake.input`（10% 加速），复活一律接受以维持负载；记录 delta / baseline 字节 |

| `view-r100` / `view-r300` | MMO MF5a-B6：机器人进 viewFixture dropIn 房（SQL 视图房夹具，内存真源；每房 8 人），400 个实体按种子随机游走（服务端定时器改真源，mode 逐 tick 轮询），机器人每 500 ms 视口随机漂移；两剧本只差视距（100 / 300）⇒ 比较「视野缩小 → 每会话字节下降」。enter / update / leave / private 记作 delta、baseline 三件记作 baseline |

2026-09-19 实测（24 机器人 / 3 房 / 400 游走实体 / 10 s / 种子 7 / 同机同进程）：视距 300 → 100 每会话出站 p50 55,331 → 9,488 B/s（−83%）、
p95 98,524 → 14,539；baseline B/join p50 7,928 → 1,368；delta 条/s/会话 887 → 151；tick p99 10.1 → 4.7 ms。报告：
`docs/perf/world-bench/2026-09-19T170610-view-r300-mf5a.json`、`2026-09-19T170623-view-r100-mf5a.json`（比较用，不作绝对容量；已写回 MMO.md §11.2）。

新增剧本：在 `scenarios/<id>.ts` 实现 `Scenario`（`register` / `joinOptions` / `attach`）并登进 `run.ts` 的 `SCENARIOS`。机器人行为只能用 `attach` 收到的种子 RNG（`seededRng`），⛔ 不用 `Math.random`——种子改一位结果文件必须变（MF1 变异验证）。

## 边界

- 机器人与服务端同进程：适合比较（同机同配置两次跑、改动前后），⛔ 不代表线上绝对容量；多进程接管实验是 MF10 的 `multi-process.ts`。
- 服务端 AI 与撮合不受种子控制，tick 分位数有自然抖动；比对用 `--threshold`，主要指标默认 10%。
- 会话签发复用 `test/int/helpers.ts` 的内存 WebPlatform 替身（与 int 测试同口径），uid 带运行期前缀，跑完 UNLINK 清理。

## AOI 载体实验（`aoi-probe.ts`，MF1-B2）

两间**裸 Colyseus 房**共用同一份确定性模拟（同种子 ⇒ 同兴趣集），只换同步层：A = `@view()` + `client.view`（StateView），
B = 每会话一条 `d` 消息 `{ seq, tick, enter[], update[], leave[] }`。⚠ 都不走 GameRoom 壳：StateView 落到生成的 GameRoomState
需要 codegen 支持 `@view()`，这本身就是「生成器改动面」这一比较项的结论。

```bash
npm --workspace @game/server exec tsx -- tools/world-bench/aoi-probe.ts --variant delta --bots 50 --entities 300 --seconds 15 --seed 7
npm --workspace @game/server exec tsx -- tools/world-bench/aoi-probe.ts --variant view  --bots 50 --entities 300 --seconds 15 --seed 7
```

2026-09-19 实测（50 观察者 / 300 实体 / 半径 300 / 世界 2000² / 20 Hz / 15 s；兴趣集 p50 24 / max 41 可见实体；同机同进程）：

| 指标 | A StateView | B 消息级 delta |
| --- | --- | --- |
| sync ms / tick p50 / p95 | 3.94 / 4.69 | 2.52 / 3.12 |
| sim ms / tick p50（含 Schema 字段写） | 0.75 | 0.014 |
| 进程 CPU ms/s | 170 | 103 |
| 每会话出站 B/s p50 / p95 | 6134 / 8061 | 10107 / 13078 |
| join 首 500 ms 字节 p50 / 重连 | 4379 / 2010 | 5816 / 2507 |

结论（已写回 docs/MMO.md §11.2）：StateView 少约 40% 字节，但多约 65% CPU、sync 多约 55%；delta 的字节差可由位置量化（int16）收回大半；
StateView 还要 codegen 支持 `@view()`、客户端 bundle 4.0.13 无 `.d.ts`、并丢掉消息级 checksum / cursor 治理 ⇒ **冻结为消息级 delta**。
报告：`docs/perf/world-bench/2026-09-19T113148-aoi-delta.json`、`2026-09-19T113207-aoi-view.json`。

