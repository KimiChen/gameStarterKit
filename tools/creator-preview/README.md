# tools/creator-preview — Creator 预览证据生成器

把 Cocos Creator 3.8.8 的**桌面预览**（真实引擎，⛔ 不是 Node 无头测试）当被测对象，经 Chrome DevTools
Protocol 重放「登录 → 首屏 → 设置面板 → 插件入口（route 形态 redeem / gameplay 形态 tally）」，落盘编号截图
与 `report.json`（每一步的判据、读到的文本、点击坐标、页面 console 的 error/uncaught）。
首次样本见 docs/evidence/creator-2026-09-05/replay/；
逐包全量样本（一次会话 13 场景 / 61 步，覆盖 7 个包的全部 route 与 menu 入口）见
docs/evidence/creator-2026-09-06/（预览证据目录按 .gitignore 政策不入库，均为本地产物，下同）。

⛔ **不进 `verify:core` / `verify:all`**：它依赖四个外部进程（下表），是人工触发的证据动线，不是门禁。
进门禁的只有纯函数钉 `apps/server/test/creator-preview-tool.test.ts`（参数解析、`scene=` 改写、坐标换算、
注入脚本自包含）。

⚠ **页面一旦报过错，预览页会弹出 DOM 浮层 `#error`，它盖在画布之上、会把 CDP 的鼠标事件整个吃掉**
（实测：登录页 Spine 骨骼版本不匹配 ⇒ 之后一步都点不动）。`runner.tap()` 每次点击前会先关掉它，
并把出现过这件事记进 `report.json` 的 `overlayDismissals` —— ⛔ 这不是掩盖错误，
console 的 error/uncaught 仍由 consoleHook 全量记录。

## 前置

| 进程 | 要求 | 检测方式 |
| --- | --- | --- |
| Cocos Creator 3.8.8 | 已打开 `apps/Cocos`，预览服务在 `http://localhost:7456` | `Page.navigate` 失败即报错 |
| Chrome | 按 CLAUDE.md 约定以 `--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir="$HOME/Desktop/chrome_profile"` 启动，**窗口可见** | `GET http://127.0.0.1:9222/json` 不通即报错 |
| 本地栈 + 游戏服 | `npm run dev`（redis 6401/6402、MySQL 3316、游戏服 2568、`AUTH_PROVIDER=dev`） | 登录步骤超时即失败 |
| 场景 | 默认读 `apps/Cocos/assets/scene.scene.meta` 的 uuid；`--scene <uuid>` 可换 | — |

## 用法

```bash
node tools/creator-preview/run.mjs all --out docs/evidence/creator-<日期>/replay      # 逐包全量（13 个场景）
node tools/creator-preview/run.mjs arena --reuse --out /tmp/arena-run                # 单个 kit 入口
node tools/creator-preview/run.mjs redeem --code SNAKE90 --out /tmp/redeem-run
node tools/creator-preview/run.mjs tally --reuse            # 复用已打开的预览页（已在首屏时跳过登录）
node tools/creator-preview/run.mjs home --format png --step-timeout 30000
node tools/creator-preview/run.mjs sgzzmap --reuse --out /tmp/sgzzmap-run          # 三战式大地图（sgzzmap kit）
node tools/creator-preview/run.mjs mapOriginal --out /tmp/maporiginal-run          # 三战原版大地图（mapOriginal kit）
node tools/creator-preview/run.mjs slg --out /tmp/slg-preview --format png         # SLG 地图独立验收
node tools/creator-preview/run.mjs mmohold --out /tmp/mmohold-preview --format png # MG2 据点争夺独立验收
node tools/creator-preview/capture-uniflex-golden.mjs --screen backpack --out /tmp/gameStarterKit-cocos-backpack.png
```

`capture-uniflex-golden.mjs` 用真实 Cocos RenderTexture 直接读取契约画布（默认从
`design.json.canvas` 读取），不会使用带 Creator 工具栏的浏览器截图，也不会做非等比缩放。
运行前需要 Creator 3.8.8 打开 `apps/Cocos` 并启动预览服务 `7456`，Chrome 需要开启本机
`9222` 调试端口。输出 PNG 可直接作为 `ui:verify --cocos-image` 的 Cocos 证据。

| 场景 | 步骤与判据 |
| --- | --- |
| `home` | 登录页 FGUI 对象 `btn_login` 可见 → 点击 → `PromoHomeView` 挂载且卡片含「协议 …」行 |
| `settings` | 点首屏「设置」→ `SettingsView` 出现 → 确认上方「系统设置」和下方「玩法入口」，读取双列卡片标题与稳定 entryId；已在「通用设置」详情时先点返回箭头 |
| `redeem` | 点「兑换码」整卡（必要时自动滚入视口）→ `RedeemView` + EditBox 出现 → 输入 `--code`（默认 `WELCOME2026`）→「兑换」→ 结果文案归类 `success` / `already-claimed` / `invalid` / `other` →「关闭」回设置面板 |
| `tally` | 点「点数赛」整卡（必要时自动滚入视口）→「目标 N 次」出现 → 连点 `TAP` 直到「你赢了」→ 结算倒计时后 `PromoHomeView` 回来且结算文案消失 |
| `cosmetic` | ⚠ 2026-09-06 起衣柜并入 snake，**设置面板没有「衣柜」条目**：先跑一局 snake 到结算页 → 点「我的衣柜」→ 先切回「全部」筛选（重放之间可能停在别的筛选上）→ 读皮肤行 → 切「已拥有」→ 点某行「装备」并等**那一行**变「已装备」（`snakeCosmetic.equip`；⛔ 不能数「装备」标签总数：换装是互换，总数不变）→ 切「可合成」试「合成」（`snakeCosmetic.unlock`，没有可合成皮肤时记 skip）→「关闭」回结算页 →「返回主页」 |
| `snake` | 点「贪吃蛇大作战」整卡 → `SnakeWorld.Hud` 出现 →「结束本次」→ 确认框 → 确认 → 结算页读行 + 钉住「返回主页」与「我的衣柜」**同排**（Δy ≤ 4）→「返回主页」回首屏。⚠ 确认框首击会被吞，脚本等一拍再点、必要时重开重点一次并把 `retried` 写进报告 |
| `ballMove` | 点「进入战斗」整卡 → `PlayersLayer` 挂载（画布演示无文本）→ 点左上角「离开」回首屏（2026-09-06 前该入口没有退出 UI） |
| `arena` | 点「竞技场」整卡 → `EntryGroupView` →「竞技场 · arena」同行「进入」（**kit** 的 route 形态）→ `ArenaBoardView` 16 格 +「奖杯 N」→ 点一格 → `arena.capture` 结果归类 `captured` / `refused` → 点「刷新」重读 → 再点自己的格 = 加固（断言守备 +1 且奖杯不变；⚠ 必须等**与上一条不同**的提示，旧提示还挂在面板上）→「关闭」 |
| `slg` | 设置中的「大地图」整卡（`map`）→ `SlgMapView` 贴图地表与透明装饰 → 点选可见无主格 → 免费占领（我方守备 1、奖杯 +1）→ 刷新后读回同格 → 中央鼠标拖动 → 中央滚轮逐档验证 LOD 1–4，并断言后台设置滚动偏移不变 → 总览实地图与当前位置框 → 山河绘卷展示、点击不改变位置 → 实地图点击命名地标定位 → 返回保留位置 → 关闭、重新进入验证资源恢复，再关闭。无主格在可见范围内择取，没有目标时明确失败。独立触发，未纳入既有 `all` 的 13 场景基线 |
| `arenaCapture` | 「占领赛 · arena」（kit 的 gameplay mode）→「目标 N 格」→ 连点「占领」到「你赢了！」→ 回首屏 |
| `arenaDuel` | 「决斗 · arena」（kit 的第二个 mode）→「HP N」→ 连点「出击」到「你赢了！」→ 回首屏 |
| `arenaShop` | 「竞技场商店 · arenaShop」（建在 kit 上的 plugin）→ 经 kit 的 `board` 面读自有格（没有就先跑 `arena` 占一格）→ 取最上面一行的「+守备」（自有格可能多块）→ 结果归类 `bought` / `insufficient-balance` / `not-owned` → 点「刷新」重读 |
| `mmoWorld` | 设置中的「进入世界」整卡（`enter`，**mmo kit** 的 route 形态）→ 选角页（没有角色先「建角」）→「进入」→ `MmoWorldLayer`（状态条 HP、摇杆 `joystick`/`knob`、轮盘 `wheel`、停 / 拾取 / 传送 / 离开）→ 摇杆按住向右拖 1.2 s 松手 ⇒ 地面相对左移 ≥ 4 px（本人向 +x 走）+ 旋钮回中 → 轻点非本人实体方块（优先行商）⇒ 状态条「目标 <名>」+ `target-ring` → 点轮盘第一槽 ⇒ 施法反馈（提示或槽上冷却秒数）→「离开」回首屏。MG1-B1 证据；不在 `all` 里（要 mmo kit 与世界房）。 |
| `mapOriginal` | 设置中的「原版大地图」整卡（`originalWorld`，**mapOriginal kit** 的 route 形态）→ `MapOriginalWorldView` 标题「原版大地图 · LOD n/5」+ `mapo-ground` 地表底就位 → 点选一格（判据含**选中框必须落在点击处**，容差 2 格）→ **逐格摆件 + 多格地形区域件**都就位（判据含「摆件/可视格 ≥ 25%」与「区域件 > 0」）→ 画面设置**只剩画质一行**（⭐ 否定判据：面板出现「沙盘模式 / 2D 沙盘 / 3D 沙盘 / 镜头视角 / 鸟瞰 / 色彩模式 / 标准 / 鲜艳 / 低饱和」任一字样即红 —— 这四项都是原版 3D 侧，归 `mapOriginal3d`；⛔ 别按旧文照实现出一个「永远选不动的 3D 档位」，那正是脚本明令禁止的写法）→ 滚轮拉远到 LOD ≥ 3 且 `mapo-plate-4/5` 就位（远档地名 = **大区名**）→ 点缩略图确认镜头位移 → 推回近档 → **缩略图跳洛阳 (661,543)**：`mapo-city` 在树上、状态行 **城 N > 0**、且近档地名档的城名「**洛阳**」在屏（⚠ 图心初始视口内本来没有城，城的验收必须跳过去做；掉到 0 说明 cities.bin / city-atlas 没到位）。地名三档分带：LOD 0–1 城名 / 2 郡名 / ≥3 大区名，⛔ 不混画。⚠ 本 kit **无服务端**，所以 ⛔ 没有占领/行军这类写操作可重放。独立触发，不加入 `all`。 |
| `mmohold` | 设置中的 `card-standings` → 自有比分页（无角色时建曙光角色）→ 选 active 角色入 `holdRidge` → `MmoHoldHudView` / `hold-scoreboard` / `hold-owners` / 两阵营分数与操作节点到位 →「前往 A」后 A 归属与同轮比分增长 →「前往 B」后 B 归属、活守卫严格 4 名且 A/B 各 2（公开名片 HP > 0；横坐标经地面宽度和内容包据点中心还原；尸体另记）→ 离开 → 同角色重进，本人实体出现后 1.5 s 内收到即时据点快照、活守卫仍为 4 且每点 2 → 再离开，比分页刷新得到非零检查点 rev / tick。MG2 证据；独立触发，不加入 `all`。 |
| `areaList` | 登录页 FGUI `btn_server` → 区服列表（判据：子件 `lst_server`）→ `btn_close` 关闭回登录页 |
| `loginNotice` | 登录页 FGUI `btn_notice` → 公告（判据：子件 `tge_tip`）→ 关闭。⚠ FGUI 视图挂在 `GRoot/…/layer_popup/…/GComponent` 下、节点名不是类名，只能按**独有子件名**判定；外部服务不在时会落到 ConfirmView（子件 `yesBtn`），脚本如实记 `outcome: error-confirm` |
| `all` | 依次 areaList → loginNotice → home → settings → redeem → tally → cosmetic → arena → arenaCapture → arenaDuel → arenaShop → snake → ballMove（两个登录页场景排最前：它们会重载页面回登录态） |

设置面板用纯 Cocos 代码绘制双列卡片：标题只有玩家可读的 label，不显示包 id，也没有独立「进入」按钮。
重放按 `SettingsView/panel/viewport/content/card-<entryId>` 定位整卡，稳定 entryId 为
`arenaHub` / `ballMove` / `map` / `redeem` / `snake` / `tally`；报告记录 entryId 与卡片标题。
上方系统卡片「通用设置」为 `btn-general`，详情返回箭头为 `btn-back`，右上角 X 为 `btn-关闭`（无「关闭」文字）。

`EntryGroupView` 的成员仍使用 `${label}  ·  ${包 id}` 行文本和独立「进入」按钮。竞技场的四条入口都经
`arenaHub` 卡片进入分组页；组内按**整行文本**（`^label\s+·\s+id$`）消歧，不能只按包 id。
`arenaCapture` / `arenaDuel` 结算后回分组页；route 页面关闭后再关分组页回设置。

SLG 的地图打开与各 LOD 截图在标题到位后继续等待：至少观察 2.4 秒，且 chunk 集合与地图位置持续 1.2 秒稳定；遇到可见限流重试提示会重新计时，失败提示直接失败。报告记录 `settling.elapsedMs/stableMs/chunkCount`，避免缩放刚结束时把尚未补齐的地图网格当作最终画面。此项只观察公开引擎节点，不读取内部请求队列。

中央拖动的每段移动、每次滚轮和 LOD 稳定后，还通过 `SettingsView/panel/viewport` 的公开 `ScrollView.getScrollOffset()` 检查后台偏移。偏移变化超过 0.1 或组件不可观测均失败，结果写入步骤的 `settingsScroll`；这样可识别后台滚动容器先吞掉地图输入的回归。

贴图检查读取已渲染 MeshRenderer 的共享材质 `mainTexture` 与绘卷 Sprite 的纹理尺寸，不主动加载图片。地标预期坐标由总览公开节点位置换算，点击标签后与局部详情坐标比对。总览显示期间局部世界处于隐藏状态，因此绘卷的「位置不变」在关闭面板后通过公开世界节点位置、LOD 与选格共同验证。2026-09-10 的美术接入样本为 23 步、19 张截图，见 docs/evidence/creator-2026-09-10/slg-art/。

退出码：0 全部通过；1 有步骤失败（失败现场也会截图 `NN-failed-<step>.jpg`，报告仍落盘）；2 参数/连接错误。
`report.json` 的 `ok`、`steps[].ok/detail/error/screenshots`、`console[]` 是复核依据；截图只是佐证。

## 工作原理与已知坑（2026-09-05 实测）

- **场景改写**：预览页 `index.html` 写死 `settings.js?scene=current_scene`（= 编辑器当前打开的场景），编辑器没开场景时预览是空场景。
  脚本用 CDP `Fetch` 域把该请求的 `scene=` 改写为目标 uuid，再轮询到场景里出现 `Canvas` 且渲染 >30 帧。
  首次加载会按需编译全部 TS（实测 77～125 s，`--boot-timeout` 默认 5 分钟）；之后一次完整 `all` 约 35 s。
- **定位不靠硬编码坐标**：每一步先注入 `pageWalkSource` 遍历激活节点，读 `cc.Label` / `cc.EditBox` 字符串与 FGUI
  对象（`node.$gobj`）的 `text`/`title`，用 `UITransform.convertToWorldSpaceAR` 算中心并换算成页面 CSS 像素后点击；
  多枚同名按钮（分组页的「进入」）按锚点文本所在行消歧。唯一的坐标兜底是登录按钮（FGUI 图片标题、无文本），
  且只在 `btn_login` 找不到时使用并在报告里标注 `design-fallback`。
- **设置卡片先滚后点**：遍历包含 Mask 裁剪外的激活节点，不能直接用首次读到的中心点击。脚本读取
  `SettingsView/panel/viewport` 的 `cc.ScrollView`，按顶锚 content 中卡片的位置调用 `scrollToOffset`；
  卡片完整可见时保持当前偏移，否则尽量居中并约束到最大偏移。滚动后重新遍历、确认点击中心在视口内，
  最后通过 CDP 发真实鼠标点击；不直接调用 SettingsLogic 或入口回调。
- **页面必须可见**：`document.hidden` 时没有 rAF，Cocos 不启动——不要用应用内隐藏的浏览器面板，脚本会 `Page.bringToFront`。
- **编辑器重编译**：Creator 只在应用激活时重编译脚本，改了源码先激活一次 Creator（`osascript -e 'tell application "CocosCreator" to activate'`）再跑，否则预览拿的是旧 chunk。
  ⚠ 光等「出现新 chunk」不够 —— 改了**资源**（图集 PNG 等）时 Creator 会先重导资源再重编脚本，中途跑重放会拿到半成品 bundle（实测症状：整页挂不上、连标题都没有，而 console **0 条**，极难查）。
  判据要改成**等静默**：`apps/Cocos/temp/programming/packer-driver/targets/preview` 与 `apps/Cocos/temp/asset-db` 连续 20 秒无文件变动再跑。
- **有些路径要先有资源**：皮肤装备/合成要求账号已拥有第二件皮肤或够数的碎片（种完 `gp:snake:user` 的
  `ownedSkinIds` / `fragmentBalances` 后**必须重启游戏服**——`cosmeticProfile` 每进程按 uid 只 hydrate 一次）；
  arenaShop 的成功路径要有金币。
- **arenaShop 的成功路径要有金币**：框架里唯一的入账路径是充值回调，dev 账号默认 0 金，直接买加固会得到
  「金币不足」（这本身就是 `tx.debit` 经主账本拒绝的实据）。要看成功路径就在开发库里种一次：
  `INSERT INTO user_currency (user_id, server_id, currency, balance) VALUES ('<uid>', 0, 1, 100)
  ON DUPLICATE KEY UPDATE balance = 100`，再清掉 `*cache:currency*` 键。
- **兑换码是一次性的**：同一 dev 账号重跑 `redeem` 得到 `already-claimed`，属预期；要走成功路径换 `--code`（服务端码表见 `apps/plugins/redeem`）。

## 文件

- `lib.mjs`：纯函数（`parseArgs`、`sceneUuidFromMeta`、`rewriteSceneQuery`、`worldToPage`、`selectNodes`、`nearestByRow`）+ 最小 CDP 客户端 + `openScene`；⛔ 零 npm 依赖（Node 22+ 自带 `WebSocket`/`fetch`）。
- `run.mjs`：场景与报告。
- `slg.mjs`：SLG 地图场景与公开 UI 证据解析。只遍历渲染节点/文本、发送普通 CDP 点击/拖动/滚轮，不访问页面 Logic、RPC 端口或私有相机字段；场景只验证阶段 1，行军面板和房间 AOI 不在本轮范围。
- 钉：`apps/server/test/creator-preview-tool.test.ts`。

## SC0 Stage3D 独立探针

`probe-stage3d.mjs` 使用隔离 Creator 预览 `7457`；Chrome CDP 默认 `9222`，可通过
`--devtools http://127.0.0.1:9224` 或 `9225` 指向已启动的独立浏览器。脚本不启动 Creator、Chrome 或游戏服。

**启动前必须将该 Creator 的原生预览设备选为 `WebpageFullScreen`，并关闭 Rotate。**
在已有预览页的原生工具栏点击设备选择器（例如 Design Resolution），选择「Webpage Full Screen / 网页全屏」，
再新建正式验收页面。核对 HTTP 返回的新预览 HTML 中 `#view-select` 的 `value` 为 `WebpageFullScreen`，
随后由探针验证真实运行时选项与尺寸。2026-09-22 隔离实例实测：通过
`Editor.Profile.setConfig('preview', 'device', 'WebpageFullScreen', 'local')` 写入配置并重启仍不足以使 HTTP 设备
选项生效；实际原生菜单选择后才生效。因此配置文件、Profile 读值或重启均不能代替上述验证，也不依赖
未经验证的设备 URL 参数。

探针在新页面启动前设置 **375×812 CSS 窗口、DPR 2、桌面 UA 与 touch emulation**；原生网页全屏模式负责
隐藏 Creator 工具栏并确定游戏容器尺寸。报告分别记录请求窗口、实际窗口、原生设备/旋转/工具栏、
canvas 的 CSS 位置与尺寸、backbuffer、Cocos visible/design/screen 尺寸。验收要求 canvas 位于 `(0,0)`、
CSS 为 `375×812`、backbuffer 为 `750×1624`、Cocos visible 为 `750×1624`。这些仍是桌面 GPU 证据。
`Default` 设备下工具栏参与 flex 布局，观察到的 47px 不是固定高度；不能用任意增加窗口高度替代上述验证。
探针不注入 CSS、不在启动后修改容器或引擎布局；旧失败报告保留。

```bash
node tools/creator-preview/probe-stage3d.mjs --mode fixture --devtools http://127.0.0.1:9224 --expect-webgl 2 --out docs/evidence/creator-<日期>/stage3d-fixture-webgl2
node tools/creator-preview/probe-stage3d.mjs --mode snake --reuse --tab <精确页面ID> --devtools http://127.0.0.1:9225 --out docs/evidence/creator-<日期>/stage3d-snake-webgl1
```

Snake 模式需要已在对应浏览器中启动、可操控的真实 Snake 会话。`--reuse --tab ID` 只接受该 CDP 地址
返回的 page 目标，且 URL 必须匹配指定 preview 的 origin/path；缺失、worker、其他端口或路径均拒绝。
省略 ID 时必须恰有一个匹配页面，多页时拒绝猜测。复用时只读检查既有布局，尺寸或原生设备不匹配记
pending，不重载页面或隐式改变 metrics。`--tab` 不允许用于新建 fixture。

本地临时辅助脚本 `.cache/stage3d/boot-snake.mjs`（ignored，非分发工具）接受 `--devtools`、`--preview`、
`--out`，并要求显式 `--expect-webgl 1|2`；例如 `node .cache/stage3d/boot-snake.mjs --devtools http://127.0.0.1:9225 --expect-webgl 1`。
它新建页面并通过真实 Login → Settings → Snake 进入每次独立的 `sc0_input_<run>` 开发账号，要求游戏服已启动；
独立账号避免前次已关闭页面留下的对局重连保留态。进入后立即接正式探针，避免静止角色在等待时死亡。
默认产物在 `.cache/stage3d/snake-cdp-<端口>/`，`snake-tab.json` 同时记录 `id`、`devtools`、`preview`；
将这些原值传给正式探针的 `--reuse --tab` 交接，不输出 token，也不自动结束或重新登录已有 Snake 页面。
helper 在 Cocos 启动前安装 console 记录与带 exact tab、预期 WebGL、`performance.timeOrigin` 的来源标记，
再记录真实引擎启动完成时间与 device/pipeline。探针复验相同页面、上下文和未加载夹具的状态；
只有此前缀启动窗口内的精确 WebGL2→WebGL1 回退诊断能被分类，原 console 不清除。
旧 helper 页面缺少来源标记时，WebGL1 Snake 留 pending，须使用新 helper 重启一次获得最终证据。

原始截图、DOM 事件和完整报告仅保留在 ignored evidence 目录；`--summary` 指定的数字摘要包含帧间隔、
分位数、资源基线、蒙皮纹理/Pass 分组及转换等实测结果，并以报告路径和 SHA256 关联原始证据。
输入验证结束后，探针先关闭并重新打开夹具，恢复固定初始相机，再采集 60 个 warmup 与 240 个帧间隔。
采样前后检查 500 个 cube 的真实 `model.worldBounds` 全部八角经 `Camera.worldToScreen` 投影均位于
`750×1624` 舞台范围及有效深度内，并读取舞台相机实际裁剪结果、对应材质/网格的实例批次与上传实例数。
报告记录完整构图检查、可见网格数量、相机姿态及提交计数；仅节点存在不能通过。此项证明几何进入绘制提交，
不保证每个像素都未被其他物体遮挡，画面仍需人工复核。
蒙皮检查还将同一个 CrossAtlas 临时切为实时模式：先安装 `USE_INSTANCING=false` 的独立材质，
验证实际 `SkinningModel`、`batchingScheme=0`、舞台普通绘制队列、slot 3 关节 UBO 绑定与矩阵随动画推进，
再恢复 baked 模型及原共享纹理/Pass；另外 99 个实例必须保持 baked。20 轮资源检查交替在实时状态与恢复后关闭，
旧实例批次仍在使用时延到后续 `AFTER_DRAW` 释放，不能提前通过引用归零。这是 SC0 受控样本，SC4 正式回退接口另行实现。
截图人工复核、另一种纹理格式或设备验收缺失时明确记 pending；成功运行不代表 SC0 退出。
离线回归在 `apps/server/test/stage3d-probe.test.ts`，不操作浏览器。

## sgzzmap 场景（三战式大地图）

```bash
node tools/creator-preview/run.mjs sgzzmap --reuse --out /tmp/sgzzmap-run
```

七步，覆盖 P6 的四件事：

| 步 | 判据 | 截图 |
| --- | --- | --- |
| 进入 route | 按 **entryId=`world`** 点设置卡片 —— ⚠ sgzzmap 与 slg 的卡片标签都是「大地图」，⛔ 不能按文本定位 | — |
| 近档就位 | 标题 `大地图 · LOD n/5` + `sgzz-terrain` 网格在 | `sgzzmap-opened` |
| 点选地块 | 详情解出 `(row, col) 地形 · 归属`；会连点几处直到找到**可通行的无主格** | `sgzzmap-selected` |
| 占领 | 同一格转我方，且 `sgzz-territory` 叠色 + `sgzz-border` 描边网格建起来 | `sgzzmap-occupied` |
| 拉远 | 连发滚轮到 LOD ≥ 3：`sgzz-plate-4/5` 底图或 `sgzz-birdview` 色块在，且 `sgzz-terrain` 已撤 | `sgzzmap-far` |
| 缩略图跳转 | 点右上角 `sgzz-minimap`，`sgzz-world` 的中心真的位移了 | `sgzzmap-minimap-locate` |
| 推回近档 | LOD ≤ 2、逐格网格回来、底图撤走 | `sgzzmap-back-near` |

行军线（`sgzz-march`）在解析器里有判据，但本场景不派遣行军（要先有金币与相邻地块），
需要时手工派一支再看 `sgzzmap-far` / `sgzzmap-opened` 里的 `march` 字段。

⚠ **首次在 Creator 里打开本仓时**：`apps/Cocos/assets/resources/kits/sgzzmap/**` 的 `.meta`
是脚本按「相对路径 sha1」确定性铸的（`tools/sgzzmap-maps/install-to-kit.py`），**不是 Creator 导入出来的**。
Creator 打开后会正式导入这些图并可能改写 uuid / 补 library 条目 —— 那是正常的，
**把 Creator 改动后的 `.meta` 一并提交**即可。在 Creator 真正导入之前，
`resources.load` 很可能找不到底图与缩略图贴图：此时远档只有鸟瞰色块、缩略图只有可点底板（都有兜底，⛔ 不崩）。

## SC1-B9 原始输入验收

`node tools/creator-preview/probe-stage3d.mjs --input-only --mode fixture --preview http://localhost:7456 --expect-webgl 2 --out <dir> --summary <file>`
复用真实 ViewMgr 世界页 / FGUI HUD / Confirm，执行双向跨界、双指、wheel、模态取消、关闭重挂与根重建。
`--input-only --mode snake --reuse --tab <id>` 对已经登录并运行的 Snake 做同一套检查；脚本不代为启动服务或对局。
WebGL1 使用引擎实际选择的 WebGLDevice 并传 `--expect-webgl 1`，保持触摸能力在页面启动前启用。
复用已有 9222 进程时，新的 fixture 页面可再加 `--force-webgl1`：只在自有页面启动前拒绝 webgl2 context，
不屏蔽浮点或其它扩展；报告断言实际 WebGL 1.0 并保留精确启动回退日志。该参数拒绝复用页面；SC1-B4 起也可用于完整 fixture 验收。
Snake 的 WebGL1 冷启动沿用 `stage3d-boot.mjs` 的前置标记与完成记录，避免把旧页面追认为冷启动。
这是 SC1-B9 输入接缝证据；省去 SC0 的性能 / 蒙皮 / 20 次资源循环和其它阶段 pending，不据此宣布 SC1-B4 或 SC1 退出。
原 SC0 命令不带该参数时的证据范围保持不变。


## SC1-B4 正式舞台夹具

```bash
node tools/creator-preview/run.mjs stage3d --preview http://127.0.0.1:7457 --new-window --expect-webgl 2 --out .cache/stage3d/sc1-b4/webgl2
node tools/creator-preview/run.mjs stage3d --preview http://127.0.0.1:7457 --new-window --expect-webgl 1 --force-webgl1 --out .cache/stage3d/sc1-b4/webgl1
```

复用已有 Chrome 9222；`--new-window` 在同一进程建立独立可见窗口，避免另一任务切标签时使采样失效。
须先在该预览 origin 的原生设备选择器选「网页全屏」（WebpageFullScreen），关闭 Rotate。
新隔离工程先 `npm ci`、`npm run build:uniflex-ui`、`npm run sync:client`，再启动 Creator，
否则未入库的 UniFlex 生成文件缺失会被脚本编译器缓存为解析失败；生成后仍报旧错时重新导入消费脚本，
必要时关闭该隔离 Creator，把其 `temp/programming` 缓存移走后重启，保留失败日志。
Creator 运行期间切换 / rebase 后，若预览入口仍引用已删除脚本，先让资源数据库刷新整个
`db://assets/src` 并等待脚本编译完成；单独重导入 HUD 不会清掉其它旧入口。检查实际编译产物及新预览，不能只凭磁盘源码认定热更新已生效。

夹具由真实 `ViewMgr.open("Stage3dFixture", (view, context) => view.setup(ports, context))` 注入当前
Main 所属 AppRuntime 的 ports；探针核对它与 gameplay services 的 stage3d 是同一实例。
页面以生命周期 context 取得正式租约，相机 / 灯 / 根节点均归舞台；FGUI overlay 保留顶部控件并加底部按钮。
每次持有五份 Prefab：四份灰盒子资源与独立 `stage3d/P_Stage3d_Baked`，不读取作者场景节点或 lightmap 数组。
固定 500 cube / 100 biped / 1 particle 用于保留 SC0 回归，不是当前设备 quality 档位的容量承诺。
另有独立 4×4 `Billboard`；3.8.8 的组件只在 disable 时脱离场景，框架捕获其独占 model / mesh / material，
在节点销毁后的 AFTER_DRAW 归还模型池并销毁资产，不释放它借用的纹理。

剧本复验真实输入、相机 / 层位、烘焙纹理、蒙皮切换、原始帧间隔和预热后的 20 次开关。
另用真实资源回调故障注入验证普通加载失败、在途关闭与迟到成功：所有业务引用归零，节点与 GFX 不超过预热基线。
资源退休等待所有替换前 model 的独立 instancing 缓冲退出 AFTER_DRAW，禁止释放外来 owner、源 mesh 缓冲或全局池。
`fixtureSession` 只提供 DEV 观测；页面与 HUD 捕获各自世代，旧回调不得写入新开页面的状态。

完整剧本保留原 SC0 的人工复核 pending（exit 2 表示已执行检查通过但仍需按阶段审阅）；
SC1-B4 摘要须同时引用两上下文的原报告、截图与逐项接受理由，不能把历史 SC0、B9 或 SC4 的范围混为本批交付。
