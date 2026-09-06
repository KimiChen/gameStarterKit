# Creator 真机预览逐包实证（2026-09-06）

把仓内**每一个 kit / plugin 的每一个入口**在 Cocos Creator 3.8.8 桌面预览（真实引擎）里挨个走一遍，
经 Chrome DevTools Protocol（`--remote-debugging-port=9222`）驱动，一次会话跑完 13 个场景、61 步；
修复前后各跑一遍（`replay-all/` 与 `replay-fixed/`），两份 `report.json` 是判据真源。生成器与用法见 [tools/creator-preview/README.md](../../../tools/creator-preview/README.md)；
⛔ 本目录是人工触发的证据，不进 `verify:core` / `verify:all`。

| 目录 | 内容 |
| --- | --- |
| `replay-all/` | **修复前**的全量重放（`run.mjs all --code DEVTEST`），ok=true、console 零 error；下面三条问题就是在它里面暴露的 |
| `replay-fixed/` | **修复后**的全量重放（同一套场景，13 场景 61 步 40 图），ok=true、console 零 error：snake 首击不再需要重试（`retried: false`）、ballMove 有「离开」按钮并回首屏、衣柜可翻页 |
| `replay-arenashop-insufficient/` | 补充对照：dev 账号 0 金时买加固 → 「金币不足」（`tx.debit` 经主账本拒绝） |
| `replay-wardrobe-merged/` | **衣柜并入 snake 之后**的复验（`snake/` 与 `cosmetic/` 两次重放，ok=true、console 零 error）：设置面板只剩 8 个入口（「衣柜」已撤），结算页「返回主页」(786,587) 与「我的衣柜」(906,587) **同排**（Δy=0），从结算页进衣柜 → 6 行皮肤 + 四个筛选 → 「关闭」回结算页 → 「返回主页」回首屏。⚠ 本轮 equip/craft 记 skip 并非回归，见下方 F13 |
| `replay-snake-plugin/` | **snake 迁插件标准之后**的复验（`run.mjs snake`，7 步 7 图）：ok=true、console 零 error、`retried: false`——玩法单源搬进 `apps/plugins/snake/gameplay/`、三个冻结数据表改名之后，真引擎里的 snake 一路照旧 |

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
| builtin | menu `ballMove`（gameplay） | 加入 GameRoom、`BallMoveView` 挂载（画布演示无文本）；修复后左上角有「离开」，点它回首屏 | ✅ `ballMove` |
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

## 暴露的问题与处置

真问题 3 条，**都已修复并在真机复验**（`replay-fixed/`）；另有 2 条是我当轮的误判，已撤回并写明依据。

| # | 问题 | 根因 | 修复 | 复验 |
| --- | --- | --- | --- | --- |
| 1 | **snake 结算确认框首击被吞**：点「结束本次」后框关了、局没结束，要再点一次才生效 | 服务端对 `runId` 不匹配或已 `Finalized` 的 `c2s.snake.endRun` **静默丢弃**（`apps/server/src/rooms/modes/snake/index.ts` SnakeEndRun 分支），客户端却已乐观关框 | 客户端加结束请求看门狗（`SnakeGameplay`）：1.5 s 内没进终局就用**当前** runId 重发一次；两次都没生效就把确认框还给玩家，⛔ 不再静默。单测钉住重发/兜底/终局收摊三条路径 | `replay-fixed/` 里 `retried: false`（首击即生效） |
| 2 | **衣柜只渲染前 6 行、没有翻页**：16 件皮肤里 10 件在 UI 上够不着 | `WardrobeView` 的 `VISIBLE_ROWS = 6` 而 `scrollTop` 恒 0，没有任何翻页控件 | 加「上一页 / 下一页」（到头置灰），换筛选时回到第一页 | 真机翻页实测：`1-6 / 16` → `7-12 / 16` → `11-16 / 16`，401/403/411/701 都能到达 |
| 3 | **ballMove 演示没有退出 UI**：进去就只能重载页面 | 该演示的 `BallMoveGameplay` 根本没有 host / `requestExit` 通道 | 输入加 `leave`、gameplay 接 `GameplayInstanceHost`（与 tally / arena 同形）、模块装配传 host、视图左上角加「离开」；单测钉住「只请求一次」 | `replay-fixed/` 的 ballMove 场景：`hasExitButton: true`，点「离开」回首屏 |

### 2026-09-06 追加：衣柜并入 snake 时实测到的 F13（未修，已登记）

给 dev 档种 `ownedSkinIds=[1,2]` → **只打一局、全程没开衣柜** → 键变回 `[1]`。根因是 `applyRunRewards`
同步读进程内 profile（只由 `snakeCosmetic.*` 三个 RPC 的 `hydrate` 回灌），没开过衣柜时它就是默认档，
随后那条六字段 `HSET` 把默认档盖回 Redis。⛔ 不是本次合并引入的（合并前「先打一局再开衣柜」同样会丢），
但衣柜入口改到结算页后每次进衣柜都必然先打一局，于是必然先触发——所以本轮 `cosmetic` 重放的
equip / craft 两步都记 skip（「已拥有」筛选下只剩默认皮肤）。详情与修复前置见
[apps/plugins/snake/README.md §8.2 F13](../../../apps/plugins/snake/README.md)。

撤回的两条（当轮误判，留档以免再犯）：

- ~~衣柜筛选状态跨次打开保留~~：`WardrobeLogic` 每次 `onOpen` 新建、`filter` 缺省 `all`，实测「切到可合成 → 关闭 → 重开」
  回到 `1-6 / 16`。我当时看到的「保留」其实是**面板压根没关**（上一次重放失败后停在那儿）。
- ~~碎片皮肤 `fragmentItemId: unavailable` 是断链~~：`skinBusinessCatalog.ts` 明确把 `ownershipItemId` /
  `fragmentItemId` / `price` 列为**尚未拍板、填值即拒**的三项（fail-closed 机检），而合成本来就按 per-skin 的
  `fragmentBalances` 结算——本轮 401 合成成功正是设计内行为，不是数据断链。
