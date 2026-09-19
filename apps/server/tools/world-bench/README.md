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

新增剧本：在 `scenarios/<id>.ts` 实现 `Scenario`（`register` / `joinOptions` / `attach`）并登进 `run.ts` 的 `SCENARIOS`。机器人行为只能用 `attach` 收到的种子 RNG（`seededRng`），⛔ 不用 `Math.random`——种子改一位结果文件必须变（MF1 变异验证）。

## 边界

- 机器人与服务端同进程：适合比较（同机同配置两次跑、改动前后），⛔ 不代表线上绝对容量；多进程接管实验是 MF10 的 `multi-process.ts`。
- 服务端 AI 与撮合不受种子控制，tick 分位数有自然抖动；比对用 `--threshold`，主要指标默认 10%。
- 会话签发复用 `test/int/helpers.ts` 的内存 WebPlatform 替身（与 int 测试同口径），uid 带运行期前缀，跑完 UNLINK 清理。
