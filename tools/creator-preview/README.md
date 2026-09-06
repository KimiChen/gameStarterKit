# tools/creator-preview — Creator 预览证据生成器

把 Cocos Creator 3.8.8 的**桌面预览**（真实引擎，⛔ 不是 Node 无头测试）当被测对象，经 Chrome DevTools
Protocol 重放「登录 → 首屏 → 设置面板 → 插件入口（route 形态 redeem / gameplay 形态 tally）」，落盘编号截图
与 `report.json`（每一步的判据、读到的文本、点击坐标、页面 console 的 error/uncaught）。
首次样本见 [docs/evidence/creator-2026-09-05/replay/](../../docs/evidence/creator-2026-09-05/replay/)。

⛔ **不进 `verify:core` / `verify:all`**：它依赖四个外部进程（下表），是人工触发的证据动线，不是门禁。
进门禁的只有纯函数钉 `apps/server/test/creator-preview-tool.test.ts`（参数解析、`scene=` 改写、坐标换算、
注入脚本自包含）。

## 前置

| 进程 | 要求 | 检测方式 |
| --- | --- | --- |
| Cocos Creator 3.8.8 | 已打开 `apps/Cocos`，预览服务在 `http://localhost:7456` | `Page.navigate` 失败即报错 |
| Chrome | 按 CLAUDE.md 约定以 `--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir="$HOME/Desktop/chrome_profile"` 启动，**窗口可见** | `GET http://127.0.0.1:9222/json` 不通即报错 |
| 本地栈 + 游戏服 | `npm run dev`（redis 6401/6402、MySQL 3316、游戏服 2568、`AUTH_PROVIDER=dev`） | 登录步骤超时即失败 |
| 场景 | 默认读 `apps/Cocos/assets/scene.scene.meta` 的 uuid；`--scene <uuid>` 可换 | — |

## 用法

```bash
node tools/creator-preview/run.mjs all --out docs/evidence/creator-<日期>/replay
node tools/creator-preview/run.mjs redeem --code SNAKE90 --out /tmp/redeem-run
node tools/creator-preview/run.mjs tally --reuse            # 复用已打开的预览页（已在首屏时跳过登录）
node tools/creator-preview/run.mjs home --format png --step-timeout 30000
```

| 场景 | 步骤与判据 |
| --- | --- |
| `home` | 登录页 FGUI 对象 `btn_login` 可见 → 点击 → `PromoHomeView` 挂载且卡片含「协议 …」行 |
| `settings` | 点首屏「设置」→ `SettingsView` 出现 → 读出「插件入口」全部行（label + pluginId） |
| `redeem` | 同行「进入」→ `RedeemView` + EditBox 出现 → 输入 `--code`（默认 `WELCOME2026`）→「兑换」→ 结果文案归类 `success` / `already-claimed` / `invalid` / `other` →「关闭」回设置面板 |
| `tally` | 同行「进入」→「目标 N 次」出现 → 连点 `TAP` 直到「你赢了」→ 结算倒计时后 `PromoHomeView` 回来且结算文案消失 |
| `all` | 依次 home → settings → redeem → tally |

退出码：0 全部通过；1 有步骤失败（失败现场也会截图 `NN-failed-<step>.jpg`，报告仍落盘）；2 参数/连接错误。
`report.json` 的 `ok`、`steps[].ok/detail/error/screenshots`、`console[]` 是复核依据；截图只是佐证。

## 工作原理与已知坑（2026-09-05 实测）

- **场景改写**：预览页 `index.html` 写死 `settings.js?scene=current_scene`（= 编辑器当前打开的场景），编辑器没开场景时预览是空场景。
  脚本用 CDP `Fetch` 域把该请求的 `scene=` 改写为目标 uuid，再轮询到场景里出现 `Canvas` 且渲染 >30 帧。
  首次加载会按需编译全部 TS（实测 77～125 s，`--boot-timeout` 默认 5 分钟）；之后一次完整 `all` 约 35 s。
- **定位不靠坐标**：每一步先注入 `pageWalkSource` 遍历激活节点，读 `cc.Label` / `cc.EditBox` 字符串与 FGUI
  对象（`node.$gobj`）的 `text`/`title`，用 `UITransform.convertToWorldSpaceAR` 算中心并换算成页面 CSS 像素后点击；
  多枚同名按钮（设置面板的「进入」）按锚点文本所在行消歧。唯一的坐标兜底是登录按钮（FGUI 图片标题、无文本），
  且只在 `btn_login` 找不到时使用并在报告里标注 `design-fallback`。
- **页面必须可见**：`document.hidden` 时没有 rAF，Cocos 不启动——不要用应用内隐藏的浏览器面板，脚本会 `Page.bringToFront`。
- **编辑器重编译**：Creator 只在应用激活时重编译脚本，改了源码先激活一次 Creator（`osascript -e 'tell application "CocosCreator" to activate'`）再跑，否则预览拿的是旧 chunk。
- **兑换码是一次性的**：同一 dev 账号重跑 `redeem` 得到 `already-claimed`，属预期；要走成功路径换 `--code`（服务端码表见 `apps/plugins/redeem`）。

## 文件

- `lib.mjs`：纯函数（`parseArgs`、`sceneUuidFromMeta`、`rewriteSceneQuery`、`worldToPage`、`selectNodes`、`nearestByRow`）+ 最小 CDP 客户端 + `openScene`；⛔ 零 npm 依赖（Node 22+ 自带 `WebSocket`/`fetch`）。
- `run.mjs`：场景与报告。
- 钉：`apps/server/test/creator-preview-tool.test.ts`。
