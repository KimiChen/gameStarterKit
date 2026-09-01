# view/ —— 视图层

依赖 cc / fairygui-cc，只做「取组件 + 搬数据」，不写业务行为（行为归 `logic/`）。

## 新页面接入动线（阶段 6：注册表/契约生成化）

1. 在 FairyGUI 编辑器修改 `apps/art/fairygui`，把 `.bin` 与图集导出到
   `apps/Cocos/assets/resources/ui`，再打开 Creator 生成或复用 `.meta`。
2. 运行 `npm run codegen:fgui -- <Pkg> <Comp>` 生成/更新 `XxxView.ts` 的四个 AUTO 区块
   （只写 AUTO 区，⛔ 不再手改 `fguiContracts.ts` / `viewRegistry.ts`——两者已是
   generated 产物的稳定 façade）。
3. 同目录写 `XxxView.view.json` sidecar（owner/kind/layer/fullscreen/onlyOne/permanent/
   interactive/logic/sharedPkgs + 手写契约段 manualRequired/nested/listItems/controllers/
   relations/assetUrls），并把 sidecar 路径登记进 `features/<id>/feature.json` 的 `views`
   （需要路由时同步登记 `routes`，group/restore 写在 sidecar）。
4. 在 sidecar.logic 指向的 `logic/.../XxxLogic.ts` 写行为与无头测试。
5. 运行 `npm --workspace @game/server run codegen:features` 刷新
   `src/generated/{fguiContracts,views,features}.generated.ts`（只读校验 `-- --check`）。
6. 页面打开经 feature route/NavigationService；登录/公告等旧页面的组合根在
   `app/loginFlow.ts`（`view/pages.ts` 是零状态转发 façade，最终新增 feature ⛔ 不再加 openXxx）。
7. 新 View 会由 `apps/client/tsconfig.test.json` 的 `src/**/*.ts` glob 自动纳入 Node strict 探针；若
   使用新的引擎 API，先补齐 `client-test-stubs.d.ts`，再由 Creator 工程验证真实类型和资源。
8. 运行 `npm run sync:client`，再运行 `npm run typecheck:client`、`npm run typecheck:client:legacy`、`npm run test:client`、
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
`test/viewRegistry.test.ts` 遍历 generated view manifest 检查「manifest 目录递归发现的
*View.ts ⇔ 登记条目」、逐条 logic 路径、AUTO 区块、包依赖闭包（独立重算）和
`XxxView.ts` 内的 `ui://<Pkg>` 字面量（`areaPresentation.ts` 等非 View 文件不在扫描内）；
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
- 纯数据与全部 View 绑定由 `tsconfig.test.json` 的 Node strict 探针检查（依赖 fairygui 的文件使用
  `client-test-stubs.d.ts`），同时由 `apps/client/tsconfig.json` 的递归 `src/**/*.ts` include 以 ES2017
  `cc-stub.d.ts` 做运行时下限检查；真实引擎侧仍需验证；
- fairygui 不得进任何常规脚本的静态依赖图（铁律 10）：页面加载只走 viewRegistry 的
  load 动态 import 闭包。
- 当前 Node strict 与 legacy 类型检查都覆盖 `ViewMgr`、`viewRegistry`、`pages` 与具体 View；两套覆盖守门
  测试位于 `apps/client/test/clientTypecheckConfig.test.ts`。
