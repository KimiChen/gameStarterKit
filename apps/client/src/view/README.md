# view/ —— 视图层

依赖 cc / fairygui-cc，只做「取组件 + 搬数据」，不写业务行为（行为归 `logic/`）。

## 新页面接入动线（阶段 6：注册表/契约生成化）

1. 在 FairyGUI 编辑器修改 `apps/art/fairygui`，把 `.bin` 与图集导出到
   `apps/Cocos/assets/resources/ui`，再打开 Creator 生成或复用 `.meta`。
2. 运行 `npm run codegen:fgui -- <Pkg> <Comp>` 生成/更新 `XxxView.ts` 的四个 AUTO 区块
   （只写 AUTO 区，⛔ 不再手改 `fguiContracts.ts` / `viewRegistry.ts`——两者已是
   generated 产物的稳定 façade）。
3. 同目录写 `XxxView.view.json` sidecar（owner/kind/layer/fullscreen/onlyOne/permanent/
   inputMode（interactive 兼容别名）/logic/sharedPkgs + 手写契约段 manualRequired/nested/listItems/controllers/
   relations/assetUrls），并把 sidecar 路径登记进 `apps/plugins/<id>/plugin.json` 的 `views`
   （需要路由时同步登记 `routes`，group/restore 写在 sidecar）。
4. 在 sidecar.logic 指向的 `logic/.../XxxLogic.ts` 写行为与无头测试。
5. 运行 `npm --workspace @game/server run codegen:plugins` 刷新
   `src/generated/{fguiContracts,views,plugins}.generated.ts`（只读校验 `-- --check`）。
6. 页面打开经 plugin route/NavigationService；登录/公告等旧页面的组合根在
   `app/loginFlow.ts`（`view/pages.ts` 是零状态转发 façade，最终新增 plugin ⛔ 不再加 openXxx）。
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

## inputMode 与世界输入

`inputMode` 为 `modal / overlay / passive`，缺省沿用 `interactive`（true = modal，false = passive）；
均省略时为 passive。矛盾声明和非 FGUI overlay 由 codegen / defineView 拒绝。
modal 建立最高输入边界；overlay 控件可点、空白穿透且下层世界保持活动；passive FGUI 不参与命中。
overlay 的根和槽由框架设 `opaque:false`，内部空白容器与装饰的命中由页面作者配置。

sidecar 的选择与限制如下；它是手写真源，运行 `codegen:plugins` 生成 metadata 后再 `sync:client`：

| 页面 | sidecar 字段 | 限制 |
| --- | --- | --- |
| Cocos 世界页 | `kind:"cocos", inputMode:"passive"` | 仍受上层 modal 遮挡；世界输入走 raw-input 端口 |
| 非模态 HUD | `kind:"fgui", inputMode:"overlay"` | 不与 `interactive` 并用；空白容器 `opaque:false`，装饰 `touchable:false` |
| 模态页 | `inputMode:"modal"` | Cocos 模态页自行提供全屏输入屏障 |
| 兼容旧页 | 省略 `inputMode` | `interactive:true` → modal，其余 → passive；两个字段均省略也是 passive |

同时声明 inputMode / interactive 只接受 modal / true 或 passive / false；overlay 与任一布尔别名均矛盾。
未知 inputMode、非 FGUI overlay 在生成期和运行时均拒绝。3D 页沿用 cocos，没有 `kind:"3d"`。

Cocos 世界页用 `subscribeRawInput(context, subscriber)`；gameplay 通过 services 注入同一 `RawInputPort`，
以 `GameplayInstanceHost` 为 owner，mount 订阅、unmount 释放。取消回调须清空拖拽 / 摇杆 / 持续动作。
GRoot 适配器归框架所有，页面不自行安装。完整规则见[客户端文档](../../../../docs/CLIENT.md#inputmode-与原始输入)
及[input/README](input/README.md)。

## 3D 页面先例（SC1）

`Stage3dFixtureView.ts` 的 setup 接收实际 `ports.stage3d`，以本次打开的 context 取得舞台并把内容挂到
`lease.root`，关闭归还租约；相机、灯、视口和全局参数只经租约修改。gameplay 从 `services.stage3d`
取得同一实例，owner 随玩法世代。`stage3d.quality` 提供只读档位与能力，细节内容依这些字段选择。

夹具的 `FixturePrefabLoader` / 同步 retainer 是 SC1 内部验收实现；kit 不复制它，完整异步 AssetLease
与细节层 / 激活队列留 SC3。GLB 资源取已登记的 Prefab 子路径；释放先撤节点与渲染引用，再释放资产。
独立 `stage3d-dev.scene` 供资产 / 画质预览，不进构建。租约、画质、资源目录与检查步骤见
[CLIENT.md §3](../../../../docs/CLIENT.md#3-view-与-logic-分层)。

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
