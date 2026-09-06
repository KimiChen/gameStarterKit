# Creator 真机预览逐包实证（2026-09-06）

把仓内**每一个 kit / plugin 的每一个入口**在 Cocos Creator 3.8.8 桌面预览（真实引擎）里挨个走一遍，
经 Chrome DevTools Protocol（`--remote-debugging-port=9222`）驱动，一次会话跑完 13 个场景、61 步、39 张截图，
`replay-all/report.json` 是判据真源。生成器与用法见 [tools/creator-preview/README.md](../../../tools/creator-preview/README.md)；
⛔ 本目录是人工触发的证据，不进 `verify:core` / `verify:all`。

| 目录 | 内容 |
| --- | --- |
| `replay-all/` | 一次会话跑完的全量重放（`run.mjs all --code DEVTEST`），**ok=true、页面 console 零 error** |
| `replay-arenashop-insufficient/` | 补充对照：dev 账号 0 金时买加固 → 「金币不足」（`tx.debit` 经主账本拒绝） |

## 环境

| 项 | 取值 |
| --- | --- |
| 引擎 | Cocos Creator 3.8.8 桌面预览 `http://localhost:7456`（CDP 改写 `scene=` 指向 `assets/scene.scene`） |
| 浏览器 | Chrome 152.0.7977.76，`127.0.0.1:9222`，窗口可见 |
| 服务端 | 本地栈（Redis 6401/6402、MySQL 3316）+ 游戏服 `http://localhost:2568`，`AUTH_PROVIDER=dev` |
| 账号 | dev 身份 `dev-63bfdde39b49cc16` |
| 代码 | `new` 分支 K0 全量（kit 机制 + `arena` / `arenaShop` 样本已安装） |

## 覆盖矩阵：7 个包的全部 route / menu 入口

| 包（类别） | 登记面 | 场景与判据 | 结果 |
| --- | --- | --- | --- |
| builtin（宿主自有） | route `login` | FGUI `btn_login` → 点击 → 进首屏 | ✅ `home` |
| builtin | route `areaList` | 登录页 `btn_server` → 区服列表（`lst_server`）读到「推荐 / 我的角色 / 全部区服 / 本地开发服」→ `btn_close` | ✅ `areaList` |
| builtin | route `loginNotice` | 登录页 `btn_notice` → 公告（`tge_tip`）读到「开服狂欢 / 版本更新 / 例行维护」→ 关闭 | ✅ `loginNotice` |
| builtin | route `promoHome` | `PromoHomeView` 挂载、卡片含「协议 game v8 · lobby v7 · 已登记玩法 8」 | ✅ `home` |
| builtin | route `settings` | 设置面板列出**全部 9 个入口**（竞技场 / 占领赛 / 决斗 / 竞技场商店 / 进入战斗 / 兑换码 / 贪吃蛇大作战 / 衣柜 / 点数赛） | ✅ `settings` |
| builtin | menu `ballMove`（gameplay） | 加入 GameRoom、`BallMoveView` 挂载（该演示无文本、无退出 UI，退出靠重载页） | ✅ `ballMove` |
| builtin | route `confirm` | 只在错误分支弹（区服/公告加载失败等）；本轮两个弹窗都成功打开，故未触发 | ⚪ 未覆盖（无错误可造） |
| builtin | route `home` | 旧版首屏；`loginFlow` 的 authenticated base 已固定为 `promoHome`，代码路径不可达 | ⚪ 不可达（留存视图） |
| snake（宿主自有 gameplay） | menu `snake` | `SnakeWorld` HUD → 「结束本次」→ 确认框 → 结算页「本次游玩结束 / 原因：explicitExit …」→「返回主页」 | ✅ `snake` |
| snakeCosmetic（宿主自有） | route `snakeCosmetic` | 衣柜挂载读到 6 行皮肤 + 四个筛选；**「装备」切换皮肤**（`snakeCosmetic.equip`，服务端 `equippedSkinId` 随之改） | ✅ `cosmetic` |
| snakeCosmetic | 域 `snakeCosmetic.unlock` | 「可合成」筛选：本轮碎片已在前一次合成中耗尽（`ownedSkinIds` 已含 401、`fragmentBalances.401` 10→0），故本轮记为 skip | ✅ 已单独验证（见下） |
| redeem 1.0.8 | route `redeem` + 域 `redeem.claim` | 输入 `DEVTEST` → **兑换成功** → 关闭回设置面板 | ✅ `redeem` |
| tally 1.0.8 | menu `tally`（gameplay） | 加入 GameRoom → 连点 TAP 10 次判胜 → 结算后回首屏 | ✅ `tally` |
| **arena 1.0.0（kit）** | route `arena` + 域 `arena.board` / `arena.capture` | 棋盘 16 格 + 奖杯行；占 D1 →「D1 已占领 · 守备 1 · 奖杯 4」；「刷新」重读；**再点自己的 A1 = 加固：守备 13 → 14 且奖杯不变** | ✅ `arena` |
| **arena（kit）** | mode `arenaCapture` | 开局「目标 5 格」→ 连点「占领」5 次判胜 → 回首屏 | ✅ `arenaCapture` |
| **arena（kit）** | mode `arenaDuel` | 开局「HP 3」→ 连点「出击」3 次判胜 → 回首屏 | ✅ `arenaDuel` |
| **arenaShop 1.0.0（建在 kit 上）** | route `arenaShop` + 域 `arenaShop.buyBoost` | 经 kit 的 `board` 面读到自有格；买加固「A1 我方 14 → 守备 19，余额 70」；「刷新」重读三行自有格 | ✅ `arenaShop` |
| arenaShop | 余额不足分支 | 0 金时买加固 →「金币不足」（`INSUFFICIENT_BALANCE` 由 `tx.debit` 经主账本产生并穿到客户端） | ✅ `replay-arenashop-insufficient/` |

## 跨层实据（预览之外直接查库查键）

| 面 | 命令 | 结果 |
| --- | --- | --- |
| kit 迁移账本 | `SELECT kit_id, file, statement_count, applied_statements FROM kit_migration` | `arena / sql/001-init.sql / 2 / 2`（`db:bootstrap` 第二遍跳过 1） |
| kit per-zone 表 | `SELECT tile, power FROM k_arena_board ORDER BY tile` | `0=19, 1=1, 2=1, 3=1`（占领 + 加固 + 商店三次 boost 的累计） |
| kit effect `kit:arena:trophy` | `HGET gono_kt:arena:stats:{dev-…} trophies` | `4`（四次首次占领各 +1，加固不发） |
| 经济主账本 | `SELECT COUNT(*) FROM currency_ledger WHERE reason='arena.boost'`、`user_currency.balance` | `3` 笔、余额 `70`（100 → 90 → 80 → 70） |
| snakeCosmetic 档 | `HMGET gono_gp:snake:user:{dev-…} equippedSkinId ownedSkinIds` | `1`、`[1,2,401]`（equip 与 unlock 都真正落键） |

⚠ **开发库种子（⛔ 不是产品行为，只为够着两条需要前置资源的路径）**：
① 给 dev 账号种 100 金（框架唯一入账路径是充值回调，dev 账号默认 0 金）；
② 给 snake 档种 `ownedSkinIds=[1,2]` 与 `fragmentBalances.401=10`（皮肤解锁本来要靠玩法产出）。
两者都只动开发库/开发 Redis，⛔ 未改任何产品代码。种完 ② 需重启游戏服——`cosmeticProfile` 每进程只按 uid 从 Redis
hydrate 一次（`hydrated` Set），否则内存档会盖过种子。

## 本轮暴露的问题（都已如实登记，⛔ 未改产品代码）

1. **snake 结算确认框的首击会被吞**：确认框刚出现就点「结束本次」，框关了但局没结束。生成器改成等一拍再点、
   仍无结算就重开重点一次并把 `retried` 写进报告——本轮 `retried: true`，即真机下这一击确实需要重试。
2. **衣柜只渲染前 6 行且没有翻页/滚动控件**（`VISIBLE_ROWS = 6`、`scrollTop` 恒 0，见
   `apps/client/src/plugins/snakeCosmetic/view/WardrobeView.ts`）：16 件皮肤里排在 6 行之后的（含全部碎片合成皮肤
   401/403/411）在「全部」筛选下够不着，只能靠「可合成 / 未拥有」筛选绕过。
3. **衣柜的筛选状态跨次打开保留**：上次停在「可合成」，下次打开还停在那儿（可能一行都没有），
   容易被误判成「面板空了」。生成器已在挂载后先切回「全部」再断言。
4. **碎片合成类皮肤的业务数据仍是草稿**：`skinBusinessCatalog.generated.ts` 里 401/403/411 的
   `fragmentItemId` 是 `unavailable`，`acquisition` 却是 `fragmentCraft` —— 碎片余额够时仍能合成（本轮实测 401
   合成成功、碎片 10 → 0），但「碎片来源」这条链在业务数据上是断的。
5. **ballMove 演示没有退出 UI**：只能验「入口能进 + 房间加入 + 视图挂载」，退出靠重载预览页。
