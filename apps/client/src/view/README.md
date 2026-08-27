# view/ —— 视图层

依赖 cc / fairygui-cc，只做「取组件 + 搬数据」，不写业务行为（行为归 `logic/`）。

## 新页面接入动线

1. 在 FairyGUI 编辑器修改 `apps/art/fairygui`，把 `.bin` 与图集导出到
   `apps/Cocos/assets/resources/ui`，再打开 Creator 生成或复用 `.meta`。
2. 运行 `npm run codegen:fgui -- <Pkg> <Comp>` 生成/更新 `XxxView.ts` 的四个 AUTO 区块，并把契约
   条目加入 `fguiContracts.FGUI_CONTRACTS`。
3. 在 `logic/page/XxxLogic.ts` 写行为与无头测试，以同名前缀配对。
4. 在 `viewRegistry.ts` 添加 `defineView`（layer/fullscreen/onlyOne/permanent/interactive/load/sharedPkgs）。
5. 当前新 View 仍需加入 `apps/client/tsconfig.json` 的显式排除清单；这是待收口的类型盲区，不是目标架构。
6. 运行 `npm run sync:client`，再运行 `npm run test:fgui`、`npm run verify:sync` 并在 Creator 本地预览。

打开 = `ViewMgr.open("Xxx")`（返回句柄）；关闭 = `handle.close()` 或 `ViewMgr.close("Xxx")`，
⛔ 不直调 `view.dispose()`——交互输入的恢复挂在关闭路径上，直调会永久吞掉游戏触摸。
ensurePackages/挂载/分层/单例/常驻/交互输入全部由注册表元数据接管。
`test/viewRegistry.test.ts` 会检查 View/registry/Logic/契约集合、AUTO 区块、包依赖闭包和源码中的
`ui://<Pkg>` 引用；它不会检查设计源是否已重新导出为 `.bin`、relation 或列表 item 配置。

> ⚠ **调用方约束**：ViewMgr 静态依赖 fairygui——`ViewMgr.open` 只允许在 view/ 内部
> 或动态 import 闭包（`const { ViewMgr } = await import("./view/ViewMgr")`）里调用；
> logic/ ⛔ 禁止（logic-purity 机检），cc 场景组件也不许静态 import ViewMgr（会把
> fairygui 拉进 root 脚本静态依赖图，扩展没挂时连锁炸掉整个启动）。

## interactive 语义（引擎现实，选错必出事）

fairygui 只有一个全局 InputProcessor：**启用 = 全屏捕获（页面可点击，但背后游戏触摸被挡）；
禁用 = 整棵 FGUI 树无输入**。`meta.interactive` 是输入租约而非单页隔离；只要任一交互页打开，
全局处理器仍启用。所以判据是「页面上有没有可点的东西」：
- 有按钮/输入 → `interactive: true`（想“不挡游戏”是做不到的，这是引擎约束而非配置问题）；
- 纯展示 HUD、要与战斗拖拽共存 → `interactive: false`（单独显示时页面自身也收不到点击）。

## AUTO 区块纪律（docs/CLIENT.md §5）

`// #region AUTO <IMPORT|REQUIRED|FIELD|BIND> DONT CHANGE` … `// #endregion AUTO <KIND>`：
区块内 = codegen 领地（`.fui` 变更后 `npm run codegen:fgui` 幂等重写，⛔ 手改）；
区块外 = 业务代码领地（重写一字不动）。手改生成区或忘跑 codegen → 守门测试恒等断言红。

## 其他约定

- 机械件：`FguiView.ts`（挂载/包管理原语）· `ViewMgr.ts`（生命周期）——日常不动；
- 纯数据（无头 typecheck 在检）：`fguiContracts.ts` · `defineView.ts` · `layers.ts`；
  依赖 fairygui 的文件（FguiView/ViewMgr/viewRegistry/各 XxxView）在 apps/client/tsconfig.json
  排除清单里，Creator 侧验证；
- fairygui 不得进任何常规脚本的静态依赖图（铁律 10）：页面加载只走 viewRegistry 的
  load 动态 import 闭包。
- 当前严格类型检查排除 `ViewMgr`、`viewRegistry`、`pages` 与具体 View；准确范围和收口任务见
  根 `docs/CLIENT.md` 的“本地检查”一节及根 `plan.md`。
