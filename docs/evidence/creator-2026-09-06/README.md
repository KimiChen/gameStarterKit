# Creator 真机预览逐包实证（2026-09-06）

把当前仓内**每一个 kit 与 plugin 的入口**在 Cocos Creator 3.8.8 桌面预览（真实引擎）里挨个走一遍，
经 Chrome DevTools Protocol（`--remote-debugging-port=9222`）驱动，落盘编号截图与 `report.json`。
生成器与用法见 [tools/creator-preview/README.md](../../../tools/creator-preview/README.md)；⛔ 本目录是人工触发的证据，不进 `verify:core` / `verify:all`。

## 环境

| 项 | 本次取值 |
| --- | --- |
| 引擎 | Cocos Creator 3.8.8 桌面预览 `http://localhost:7456`（改写 `scene=` 指向 `assets/scene.scene`） |
| 浏览器 | Chrome 152.0.7977.76，`127.0.0.1:9222`，窗口可见 |
| 服务端 | `npm run dev`（Redis 6401/6402、MySQL 3316、游戏服 `http://localhost:2568`、`AUTH_PROVIDER=dev`） |
| 账号 | dev 身份 `dev-63bfdde39b49cc16`（首次登录即建档） |
| 代码 | `new` 分支 K0 全量（kit 机制 + `arena` / `arenaShop` 样本已安装） |

## 结果：9 个入口 / 12 次重放全绿，页面 console 零 error

| 包（类别） | 入口（形态） | 场景 | 判据与读到的实据 |
| --- | --- | --- | --- |
| builtin（宿主自有 plugin） | 登录 → 首屏（route） | `home` | FGUI `btn_login` → `PromoHomeView` 挂载，卡片含「协议 …」行 |
| builtin | 设置面板（route） | `settings` | 面板列出**全部 9 个入口**：竞技场 / 占领赛 / 决斗（arena）、竞技场商店（arenaShop）、进入战斗（builtin）、兑换码（redeem）、贪吃蛇大作战（snake）、衣柜（snakeCosmetic）、点数赛（tally） |
| builtin | 进入战斗（gameplay，ballMove 演示） | `ballMove` | 加入 GameRoom、`BallMoveView` / `PlayersLayer` 挂载（该演示无退出 UI，退出靠重载页面） |
| snake（宿主自有 gameplay plugin） | 贪吃蛇大作战（gameplay） | `snake` | `SnakeWorld` HUD 出现 → 「结束本次」→ 确认框 → 结算页读到「本次游玩结束 / 原因：explicitExit / 本局：0 秒 · 0 分 · 0 击杀 / 本局不计奖励…」→「返回主页」回首屏 |
| snakeCosmetic（宿主自有 plugin） | 衣柜（route） | `cosmetic` | `WardrobeView` 挂载并读到皮肤行 → 「关闭」回设置面板 |
| redeem 1.0.8（plugin） | 兑换码（route） | `redeem` | PluginHost 动态装载 → 输入 `WELCOME2026` → **兑换成功** → 「关闭」回设置面板 |
| tally 1.0.8（plugin） | 点数赛（gameplay） | `tally` | 加入 GameRoom → 连点 TAP 到「你赢了！」→ 结算倒计时后回首屏 |
| **arena 1.0.0（kit）** | 竞技场（route，kit 的客户端 entry） | `arena` | 棋盘 16 格（A1…D4）+「奖杯 N」行；点 A1 → `arena.capture` → 提示「A1 已占领 · 守备 1 · 奖杯 1」，排行行「1. ▶ 我 · 1 格 · 守备 1」（`ranking` 面） |
| **arena（kit）** | 占领赛（gameplay mode 1） | `arenaCapture` | `ArenaCaptureView` 开局「目标 5 格」→ 连点「占领」到「你赢了！」→ 回首屏 |
| **arena（kit）** | 决斗（gameplay mode 2） | `arenaDuel` | `ArenaDuelView` 开局「HP 3」→ 连点「出击」到「你赢了！」→ 回首屏 |
| **arenaShop 1.0.0（建在 kit 上的 plugin）** | 竞技场商店（route） | `arenaShop` | 经 kit 的 `board` 面读到自有格「A1 我方 1」；余额 0 时买加固 → **「金币不足」**（`tx.debit` 经框架账本拒绝，错误码 `INSUFFICIENT_BALANCE` 穿到客户端） |
| **arenaShop** | 竞技场商店（route，充值后） | `arenaShop-paid` | 种 100 金后再买 → **「A1 我方 1 → 守备 6，余额 90」** |

## 跨层实据（预览之外的落库/落键复核）

| 面 | 命令 | 结果 |
| --- | --- | --- |
| kit 迁移账本 | `SELECT kit_id, file, statement_count, applied_statements FROM kit_migration` | `arena / sql/001-init.sql / 2 / 2`（`db:bootstrap` 跑两遍第二遍跳过 1） |
| kit 的 per-zone 表 | `SELECT server_id, tile, owner_uid, power FROM k_arena_board` | `0 / 0 / dev-63bfdde39b49cc16 / 1` → 买加固后 `power = 6` |
| kit effect（`kit:arena:trophy`） | `redis-cli --scan --pattern "*kt:arena*"` | `gono_kt:arena:stats:{dev-63bfdde39b49cc16}`，页面奖杯 0 → 1 |
| 经济主账本（插件经 kit 的 `boostTile` → `tx.debit`） | `SELECT reason, delta, balance_after FROM currency_ledger ORDER BY id DESC LIMIT 1` | `arena.boost / -10 / 90` |

⚠ 为走通商店的成功路径，本次在**开发库**里直接给 dev 账号种了 100 金
（`INSERT INTO user_currency … ON DUPLICATE KEY UPDATE balance = 100` + 清 `cache:currency` 键）——
框架里唯一的入账路径是充值回调（`purchases.ts` 的 `creditInTx`），dev 账号默认 0 金；⛔ 这只是证据种子，不是产品行为。

## 本次暴露的两个小问题（已处理 / 已登记）

1. **snake 结算确认框的首击会被吞**：确认框刚出现就点「结束本次」，框关了但局没结束（重放实测）。
   生成器改成「等一拍再点，仍无结算就重开重点一次并把 `retried` 写进报告」；本次报告里 `retried: true`，
   即真实引擎下这一击确实需要重试——属 View 层输入时序，⛔ 未改玩法代码，留给 snake 专项决定是否加闸。
2. **ballMove 演示没有退出 UI**：只能验「入口能进 + 房间加入 + 视图挂载」，退出靠重载预览页（已写进场景说明）。
