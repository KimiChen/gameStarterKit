# Creator 3.8.8 预览人工证据 · 2026-09-05

> 对应 [plan-v5.md](../../../plan-v5.md) B 节「一次 Creator 会话的清单」与 E5 的 Creator 侧尾巴。
> 判定方式：**真实引擎桌面预览**（⛔ 不是 Node 无头测试）。证据 = 本目录截图 + 下表记录。

## 环境

| 项 | 值 |
| --- | --- |
| 编辑器 | Cocos Creator 3.8.8（`/Applications/Cocos/Creator/3.8.8`），工程 `apps/Cocos`，预览服务 `http://localhost:7456` |
| 驱动方式 | Chrome 152 + `--remote-debugging-port=9222`（CLAUDE.md 约定），CDP 脚本注入点击/输入/截图；预览页 `index.html` 写死 `settings.js?scene=current_scene`（= 编辑器当前打开的场景），编辑器未打开场景时预览是空场景，故用 Fetch 拦截把它改写为 `scene=33a6cd88-…`（`assets/scene.scene`） |
| 后端 | 本地栈 redis-durable 6401 / redis-cache 6402 / MySQL 3316（已在跑，`dev-stack.sh start` 因 owner 元数据不匹配拒绝接管，改走 `db:bootstrap → smoke:framework → dev:server-only`），游戏服 `http://localhost:2568`，`AUTH_PROVIDER=dev` |
| 代码基线 | 分支 `new`，兑换码插件 redeem@1.0.1 → 1.0.3（本次会话内两次经 `install --reinstall-from-tree` 迭代） |
| 操作者 | Claude（代用户执行；用户已打开 Creator） |

## 清单结果

| 清单项 | 结果 | 证据 |
| --- | --- | --- |
| 1-① 脚本合成的两个占位 `.meta`（`features.meta`、镜像 `domains/redeem.ts.meta`）被 Creator 重写、uuid 不变 | **Creator 未重写任何 `.meta`**：工程打开、多次重新聚焦触发资源刷新、预览编译后 `git status` 无 `.meta` 变化（mtime 仍是合成时刻）。合成占位的形态（`ver/importer/imported/uuid/files/subMetas/userData`）与 Creator 3.8.8 的落盘形态一致，不需要重写 | `git status` 空 |
| 1-② 随包 13 个 `.meta` 被 Creator 重排键序 → 锁红 | **未发生**：同上，`plugin -- check` 全程 ✔。E6 的「`.meta` 是否按语义比对」暂不需要 | `plugin -- check` |
| 1-③ 16 张重编码预览 PNG 重新导入 | 无报错、`.meta` 未变（Creator 只按 uuid 引用） | `git status` 空 |
| 2 桌面预览：登录 → 首屏 → 设置 → 兑换码 | ✅ 全链路走通（三条结果路径：成功 / 已使用 / 不存在）：dev 登录 → PromoHome → 设置面板「插件入口」出现「兑换码 · redeem」→ RedeemView：EditBox 可输入、输入即启用「兑换」→ `WELCOME2026` 兑换成功「+100 金币，余额 100」→ 再兑显示「这个兑换码你已经使用过了」→ 「关闭」回到设置面板。服务端 Redis：`gono_ft:redeem:claimed:{dev-…}` = {WELCOME2026}，`gono_ft:redeem:wallet:{dev-…}` = 100（二次兑换后不变） | `01`～`09` |
| 3 B4：动态加载/取消回滚/输入租约/跨包资源 | 本次只覆盖「动态加载」（route 形态入口经 FeatureHost 装载 redeem module 后打开 View，节点树读回 `RedeemView@375,-812`）；取消回滚/输入租约/跨包资源未做 | — |
| 3 B6：`.meta` uuid 集合 ↔ 场景序列化往返 | 未做 | — |

## 实测暴露并修复的缺陷

1. **CocosView 纯节点页只露右下四分之一**（`02-home-before-fix.jpg`）：层容器是 FGUI GComponent 节点，UITransform
   anchor (0,1)；CocosView 根节点 anchor (0.5,0.5) 放 (0,0) → 页面中心钉在容器左上角。修法：`mountToLayer` 按父锚
   居中（`e9e6900`）。修后 `03-home-after-fix.jpg`。无头测试的 FakeNode 没有锚点语义，从未暴露。
2. **行标签 / 提示语被面板左缘切掉一半**（`04-settings-before-label-fix.jpg`、`06/07`）：三个手搓页的 `label()` 一律
   中心锚，却把「左边缘坐标」当中心用。修法：`label(..., "left")` 用锚点 (0,0.5) + 左对齐。
3. **RedeemView 的 EditBox 文字出现在输入框左上外侧**（`06/07`）：代码创建的 EditBox 没有 prefab 里的 textLabel /
   placeholderLabel。修法：显式创建两个 Label（锚点 (0,1)、尺寸随输入框，`EditBox._resizeChildNodes` 的约定），左对齐
   垂直居中，并用一个略窄的内嵌节点做内边距；⚠ `addComponent(EditBox)` 在活动节点上会立刻跑 `_init` 自建
   `TEXT_LABEL`/`PLACEHOLDER_LABEL`（后者带 Label 缺省字符串 "label"），换引用后要把这两个孤儿节点删掉。
   RedeemView 是插件自有文件：改完 bump 1.0.2 → 1.0.3，各走一次 `install --reinstall-from-tree redeem`
   （E6 动线的真实使用）。

修复后的截图：`05-settings-after-fix.jpg`、`08-redeem-after-fix.jpg`（空态：占位文字在框内）、
`09-redeem-after-fix-invalid.jpg`（`NOSUCHCODE1` → 「兑换码不存在」，REDEEM_CODE_INVALID 路径）。成功/已使用两条路径
见 `06`/`07`（修复前截图，功能已通）；修复后又以 `SNAKE90`（+90，余额 190）与 `DEVTEST`（+1，余额 191）各兑换一次成功。

## 第二轮（同日下午晚些）：gameplay 形态插件「点数赛」plugins/tally

同一 Creator 会话、同一驱动方式（Chrome 重启过一次，仍经 9222），插件经 pack → 干净树 install 进仓后：

| 步骤 | 结果 | 证据 |
| --- | --- | --- |
| 设置面板插件入口出现「点数赛 · tally」（featureId 字母序第 4 行） | ✅ | `09b-settings-with-tally.jpg` |
| 「进入」→ FeatureHost 装载 → 加入 GameRoom（服务端日志：房间创建、玩家加入、首人即开局） → TallyView 挂载 | ✅ 「目标 10 次 · 你已点 0」，玩家列表标出自己 | — |
| 连点 TAP：本地计数随服务端状态回流实时更新 | ✅ 4 次后「你已点 4」 | `10-tally-match.jpg` |
| 点满 10 次：服务端判胜、房间 Settle；客户端「你赢了！」+ 倒计时 | ✅ | `11-tally-settle.jpg` |
| 倒计时结束经 `host.requestExit("settled")` 回大厅 | ❌ **整屏黑**（修复前，`12-tally-after-exit-before-fix.jpg`）→ ✅ 修复后回到首屏，首屏「已登记玩法 6」（`13-tally-back-home-after-fix.jpg`）；服务端日志：玩家主动离开、房间销毁 | `12`/`13` |

实测暴露并修复的第 4 处缺陷（框架级，所有玩法共用）：**玩法退出后没人恢复首屏**。`launchGameplay` 进战斗前
`closeGroup("authenticated")`，而 `closed{voluntary}` 按设计不触发导航、`RoomController.stop` 也不导航——
GameplayModule.ts 注释里所说的「controller.stop → 恢复已登录 Home 通用恢复路径」并不存在。snake 的结算退出走的是
同一条 `requestExit("settled")`，此前从未在真实引擎跑到这一步。修法：AppRuntime 的 controllerBridge.requestStop
在 stop 完成后（会话代未变、未 dispose、已登录且登记过 base）`navigation.restoreAuthenticatedBase({userId,user})`。

## 未闭合

- B4 的取消回滚 / 输入租约 / 跨包资源，B6 的 uuid 往返自检：仍归 plan-v5 B 表。
- 预览是 Chrome 桌面，⛔ 不是真机（C3）。
- 首次加载 `Init SubSystem` 约 77～125 s（预览按需编译 186 个 TS 文件），属编辑器预览特性，未计入证据。
