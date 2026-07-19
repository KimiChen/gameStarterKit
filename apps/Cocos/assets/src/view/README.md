# view/ —— 视图层

依赖 cc / fairygui-cc，只做「取组件 + 搬数据」，不写业务行为（行为归 `logic/`）。

## 新页面四步动线

1. FairyGUI 编辑器出图（`apps/art/fairygui`），发布 bin 到 `assets/resources/ui`
2. `npm run codegen:fgui -- <Pkg> <Comp>` 生成 `XxxView.ts`（四个 AUTO 区块）；
   契约条目加进 `fguiContracts.FGUI_CONTRACTS`；新 View 文件加进 apps/client/tsconfig.json 排除清单
3. `logic/page/XxxLogic.ts` 写行为（同名前缀配对，无头单测）
4. `viewRegistry.ts` 加一条 defineView（layer/fullscreen/onlyOne/permanent/interactive + load 闭包）

打开 = `ViewMgr.open("Xxx")`（返回句柄）；关闭 = `handle.close()` 或 `ViewMgr.close("Xxx")`，
⛔ 不直调 `view.dispose()`——交互输入的恢复挂在关闭路径上，直调会永久吞掉游戏触摸。
ensurePackages/挂载/分层/单例/常驻/交互输入全部由注册表元数据接管。
漏步骤 1/2/4 或 Logic 配对文件 = `test/viewRegistry.test.ts` 红。

> ⚠ **调用方约束**：ViewMgr 静态依赖 fairygui——`ViewMgr.open` 只允许在 view/ 内部
> 或动态 import 闭包（`const { ViewMgr } = await import("./view/ViewMgr")`）里调用；
> logic/ ⛔ 禁止（logic-purity 机检），cc 场景组件也不许静态 import ViewMgr（会把
> fairygui 拉进 root 脚本静态依赖图，扩展没挂时连锁炸掉整个启动）。

## interactive 语义（引擎现实，选错必出事）

fairygui 只有一个全局 InputProcessor：**启用 = 全屏捕获（页面可点击，但背后游戏触摸被挡）；
禁用 = 整棵 FGUI 树无输入**。所以 meta.interactive 的判据是「页面上有没有可点的东西」：
- 有按钮/输入 → `interactive: true`（想「不挡游戏」是做不到的，这是引擎约束不是配置问题）；
- 纯展示 HUD、要与战斗拖拽共存 → `interactive: false`（页面自身也收不到点击）。

## AUTO 区块纪律（docs/CLIENT.md 方案 2）

`// #region AUTO <IMPORT|REQUIRED|FIELD|BIND> DONT CHANGE` … `// #endregion AUTO <KIND>`：
区块内 = codegen 领地（`.fui` 变更后 `npm run codegen:fgui` 幂等重写，⛔ 手改）；
区块外 = 业务代码领地（重写一字不动）。手改生成区或忘跑 codegen → 守门测试恒等断言红。

## 其他约定

- 机械件：`FguiView.ts`（挂载/包管理原语）· `ViewMgr.ts`（生命周期）——日常不动；
- 纯数据（无头 typecheck 在检）：`fguiContracts.ts` · `defineView.ts` · `layers.ts`；
  依赖 fairygui 的文件（FguiView/ViewMgr/viewRegistry/各 XxxView）在 apps/client/tsconfig.json
  排除清单里，Creator 侧验证；
- fairygui 不得进任何常规脚本的静态依赖图（铁律 10）：页面加载只走 viewRegistry 的
  load 动态 import 闭包（它同时是将来分包的加载点，docs/CLIENT.md 方案 4）。
