# view/ —— 视图层

依赖 cc / fairygui-cc，只做「取组件 + 搬数据」，不写业务行为（行为归 `logic/`）。

## 新页面接入动线

1. 在 FairyGUI 编辑器修改 `apps/art/fairygui`，把 `.bin` 与图集导出到
   `apps/Cocos/assets/resources/ui`，再打开 Creator 生成或复用 `.meta`。
2. 运行 `npm run codegen:fgui -- <Pkg> <Comp>` 生成/更新 `XxxView.ts` 的四个 AUTO 区块，并把契约
   条目加入 `fguiContracts.FGUI_CONTRACTS`。
3. 在 `logic/page/XxxLogic.ts` 写行为与无头测试，以同名前缀配对。
4. 在 `viewRegistry.ts` 添加 `defineView`（layer/fullscreen/onlyOne/permanent/interactive/load/sharedPkgs）。
5. 在 `view/pages.ts` 增加 `openXxx` 组合根：打开页面、构造 Logic、注入 net 依赖与导航回调
   （Main 与业务层只调这里，不直接调 `ViewMgr`）。
6. 新 View 会由 `apps/client/tsconfig.test.json` 的 `src/**/*.ts` glob 自动纳入 Node strict 探针；若
   使用新的引擎 API，先补齐 `client-test-stubs.d.ts`，再由 Creator 工程验证真实类型和资源。
7. 运行 `npm run sync:client`，再运行 `npm run typecheck:client`、`npm run typecheck:client:legacy`、`npm run test:client`、
   `npm run test:fgui`、`npm run verify:sync` 并在 Creator 本地预览。

打开 = `ViewMgr.open("Xxx")`（只接受页面名，返回句柄；数据与回调在 `pages.ts` 经 `view.setup(...)` 注入）；
关闭 = `handle.close()`，onlyOne/permanent 页也可用 `ViewMgr.close("Xxx")`——⚠ 对多实例页
（`onlyOne=false` 且 `permanent=false`，当前只有 Confirm）该调用是空操作，只能用句柄关。
⛔ 不直调 `view.dispose()`——交互输入的恢复挂在关闭路径上，直调会永久吞掉游戏触摸。
ensurePackages/挂载/分层/单例/常驻/交互输入全部由注册表元数据接管。
`ensurePackages` 与页面自身包均经统一可测 loader：缺失/超时抛 `FguiPackageLoadError`（缺失与超时
`retryable=true`），不会继续创建空占位。默认 deadline 为 15 秒，可在宿主通过
`FguiView.configurePackageLoading({ deadlineMs })` 调整；`ViewMgr` 贯通 open 的 `AbortSignal`，关闭或
场景/root 世代切换会取消当前等待。FairyGUI 无法取消底层请求，迟到回调会被观察；成功共享包保持常驻，
页面关闭只释放组件树。
`test/viewRegistry.test.ts` 会检查 View/registry/Logic/契约集合、AUTO 区块、包依赖闭包和
`XxxView.ts` 内的 `ui://<Pkg>` 字面量（`areaPresentation.ts` 等其他 view/ 文件不在扫描内）；
它不会检查设计源是否已重新导出为 `.bin`、relation 或列表 item 配置。

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
- 纯数据与全部 View 绑定均由 `tsconfig.test.json` 的 Node strict 探针检查（依赖 fairygui 的文件使用
  `client-test-stubs.d.ts`）；`apps/client/tsconfig.json` 的排除清单仅属于 Creator 兼容 legacy 配置，
  真实引擎侧仍需验证；
- fairygui 不得进任何常规脚本的静态依赖图（铁律 10）：页面加载只走 viewRegistry 的
  load 动态 import 闭包。
- 当前 Node strict 类型检查覆盖 `ViewMgr`、`viewRegistry`、`pages` 与具体 View；覆盖守门测试位于
  `apps/client/test/clientTypecheckConfig.test.ts`。Creator 兼容 legacy 配置的排除清单不代表 CI 探针盲区。
