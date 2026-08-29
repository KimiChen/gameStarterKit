# 客户端开发

> 本文只描述 Cocos 客户端在开发阶段的源码组织、页面接入、本地预览和测试方式；完整范围见
> [根 README](../README.md#项目边界)。

## 1. 首次打开

在仓库根目录执行：

```bash
npm install
npm run sync:shared
```

随后使用 Cocos Dashboard 3.8.8 打开 `apps/Cocos`，等待资源导入完成。游戏代码来自
`apps/client/src`，由 `sync:client` 复制到 `apps/Cocos/assets/src`。

第三方技术依赖已经锁定并入库：

- `apps/client/src/lib/colyseus/colyseus.js`
- `apps/Cocos/extensions/fairygui-cc/runtime/`
- `apps/client/src/lib/bitecs/`

上述依赖已随仓库锁定并入库，首次打开或普通开发不需要抓取。`fetch:colyseus` 和
`fetch:fgui` 仍保留为框架维护团队在需要显式升级对应依赖时使用的工具；它们会校验下载内容并更新
仓库内的运行时镜像。若运行时存在针对 Cocos 3.8 的社区补丁，升级后必须重新应用补丁并重算
`scripts/vendor.sha256`，不能把裸抓取结果直接视为最终版本。bitECS 没有自动抓取命令，其
`apps/client/src/lib/bitecs/` 下的 12 个锁定源文件及 `scripts/bitecs.sha256` 由维护团队按上游版本
手动更新，保留项目补丁后运行 `npm run sync:client`、`npm run verify:ecs` 和 `npm run verify:sync`。
普通开发者直接使用已入库版本，并运行校验命令确认依赖未漂移。

本地预览需要：

1. 场景中存在挂载 `Main` 的节点。
2. FairyGUI 扩展已由工程加载。
3. `portalUrl` 指向与当前契约匹配的本地开发服务。
4. shared/client 镜像保持新鲜。

`Main` 组件另有一个可留空的 `serverUrl`：留空时使用 `sync:client` 生成的 `core/devEnv.ts`（跟随根
`.env.development` 的 `PORT`，默认 `http://localhost:2568`），填写即覆盖。它只是区服目录加载前的默认
游戏服 HTTP 地址——登录页拉到目录后会用所选区的 `gameHttpUrl` 重新初始化 HTTP 底座。`portalUrl` 留空或不是 http(s) 绝对地址时（见
[外部身份服务开发边界](WEBPLATFORM.md) §5）`Main.start()` 直接抛错，后续的会话事件订阅与登录页都不会执行。

目录中的 `gameHttpUrl` 与 `gameWsUrl` 是两个独立、不可互相推导的端点：前者用于游戏 HTTP 请求，后者
直接传给 Colyseus `Client`。Lobby join 只允许 `v/token/sId`；Game join 还必须携带 shared 定义的 canonical
`mode`，用于撮合隔离和玩法选择。目录响应中的 `hash` 不会被伪装成服务端准入校验。
目录刷新成功后保留仍存在的当前 `serverId`；当前区消失才按默认规则回退，刷新失败则保留完整旧快照。

## 2. 源码与工程壳

```text
apps/client/src/
├── Main.ts             Cocos 组件入口与 Demo 编排
├── designSpec.ts       设计分辨率数值真源（750×1624）
├── core/               HTTP 底座、生成的开发配置与宿主环境桥
├── gameplay/           默认玩法 catalog 与组合登记
├── lib/                锁定的第三方技术依赖
├── logic/              引擎无关页面与玩法行为
├── net/                Room、RPC 与 HTTP 适配
├── shared/             apps/shared 的生成镜像
└── view/               Cocos/FairyGUI 视图绑定与 ViewMgr

apps/Cocos/
├── assets/src/         apps/client/src 的生成镜像
├── assets/resources/   FGUI 导出物等本地资源
├── assets/scene.scene  启动场景
├── extensions/         Cocos 编辑器扩展
└── settings/           工程设置
```

修改规则：

- `apps/client/src` 是源码真相。
- `apps/client/src/shared` 禁止手改；改 `apps/shared/src`。
- `apps/Cocos/assets/src` 整体禁止手改；运行 `npm run sync:client`。
- `.meta` 与镜像一起提交，保持 UUID 稳定。

## 3. View 与 Logic 分层

### Logic

`logic/` 只能依赖 TypeScript、ES 标准库、shared 和显式注入的 port：

- 不 import `cc`。
- 不 import `fairygui-cc`。
- 不直接读写节点。
- 不自行创建网络单例。

页面行为通过依赖注入连接 HTTP/RPC/View port，因此可在 Node 环境无头测试。

玩法通过 `logic/gameplay/GameplayRegistry` 登记 factory 与该玩法自己的 room joiner，
`RoomController.startRegistered` 取得同一 registration 的快照后接管精确 room capability。默认组合点是
`gameplay/catalog.ts`：`ballMove` 带 Cocos presentation，`idle` 是无 presentation、但拥有独立 state 与
pulse 输入的最小真实玩法。每个登记项注入自己的 raw state exact validator、允许发送的消息集合和
可选 reconnect reconcile；新增玩法扩展自己的 logic、room adapter 和 catalog 登记，不修改通用
`RoomClient`、`RoomController` 或 `Main` 的启动流程。

### View

`view/` 允许依赖 Cocos 与 FairyGUI，但职责受限：

- 查找命名元素。
- 绑定点击和列表回调。
- 把展示数据搬进组件。
- 把用户动作转发给 Logic。

业务判定、排序、时间规则、错误分支和网络编排不进入 View。

## 4. 页面定义与生命周期

页面由三部分组成：

1. `fguiContracts.ts`：登记命名元素契约。
2. `view/XxxView.ts`：结构绑定与手写接线。
3. `viewRegistry.ts`：动态加载入口、包名、组件名、共享依赖和实例策略。

页面的对外入口在 `view/pages.ts`：`openXxx` 负责组合 ViewMgr、Logic、net 依赖与导航接线，`Main` 通过
动态 import 调用它。

打开页面：

```ts
const handle = await ViewMgr.open("Home");
await handle.run((_view, context) => {
  // pages.ts 在这里注入 view.setup(...)，并把 context.signal 传给异步 Logic。
});
```

`ViewMgr.open` 接受页面名和可选的 setup 回调，不把业务参数塞进 registry。返回句柄带有本次打开的
`signal` 与 `generation`；页面数据、回调和异步首拉应在 `handle.run(...)` 内注入。setup/render 或
`onCreate/onOpen` 失败会自动走同一条关闭、交互租约回收和实例销毁路径。

不要从普通脚本静态 import `fairygui-cc` 或具体 View。所有 View 都通过 registry 的动态 import
进入加载链，避免编辑器扩展尚未就绪时污染根脚本。

ViewMgr 的生命周期语义：onlyOne/permanent 页面的在途 open 会合流到同一个加载 Promise；所有页面（包括
多实例 Confirm）的在途 open 都可通过句柄/按名关闭取消，并在 mount 前拦截。场景/root generation 变化时
旧 pending 会失效；mount、setup 或渲染失败统一回滚。permanent 页面只运行一次 `onCreate`，每次重开
生成新的 `signal/generation` 并运行 `onOpen`；关闭会使旧异步上下文失效。FguiView 在首个视图挂载时才
懒建 GRoot 且默认关闭全局输入（避免全屏 InputProcessor 吞掉玩法触摸），包加载按全进程在途合流防重复加载。

页面开发应遵守：

- onlyOne 页面只创建一个实例。
- 事件接线应幂等，关闭时释放监听和异步上下文。
- 数据刷新与第一次 setup 分离。
- detached Promise 必须显式处理错误。
- 关闭页面后，迟到的 HTTP/RPC 结果不得继续更新 View。

### `interactive` 的含义

FairyGUI 在当前 Cocos 运行时只有一个全局 InputProcessor，`interactive` 因此是全局输入租约，不是单个
根组件的命中测试属性：

- `interactive: true`：页面打开期间增加租约并启用整棵 FGUI 树输入；页面可点击，但背后的玩法触摸会被挡住。
- `interactive: false`：页面本身不增加租约；没有其他交互页时整棵 FGUI 树都收不到输入，适合纯展示 HUD。

只要还有任一交互页打开，全局处理器就保持启用，`interactive: false` 页面也不是独立的输入隔离区。
关闭必须走 open 返回的 `ViewHandle.close()`；onlyOne/permanent 页也可用 `ViewMgr.close(name)`——它会
取消该名字下的在途 open，但对已挂载的多实例实例是空操作。直调 `view.dispose()` 会让 `interactive`
租约无法恢复。

## 5. FairyGUI codegen

命令：

```bash
npm run codegen:fgui -- <Package> <Component>
```

生成器只改 View 中的四个 AUTO 区块：

- `IMPORT`：FairyGUI 类型导入。
- `REQUIRED`：包名、组件名和契约常量。
- `FIELD`：字段声明。
- `BIND`：`getChild` 绑定。

AUTO 区块外是手写区。重复执行应得到稳定结果。

命名元素必须先进入 `view/fguiContracts.ts`。跨包组件依赖通过 `viewRegistry.sharedPkgs` 声明，
不要在页面中临时加载隐式依赖。

常见约束：

- `GLoader` 使用 `url`，不是引擎 Sprite API。
- Controller 切页使用约定的 page name。
- XML parser 保留 `displayList` 直接元素作为 AUTO 绑定真源，同时递归记录嵌套组件/list item 的
  `children`/`nestedElements`、`path`、`defaultItem`/模板数量、relation、controller 和 `ui://` 资源引用；
  手写嵌套 `getChild` 契约必须显式声明 `path`，避免同名元素误匹配。`fguiContracts.ts` 中的
  `required` 只由 codegen 维护；未加前缀的手写字段使用 `manualRequired`，外部组件和列表模板分别使用
  `nested`/`listItems`，并由无头测试按 `ui://` 资源实际解析后校验字段、controller 与 `defaultItem`。
- `scripts/fgui-manifest.mjs --check`（`npm run verify:fgui`）钉住每个 package 的 XML/资源声明与哈希、
  `ui://` 包及资源 ID 闭包、Cocos `.bin`/图集/Spine 等导出物和 View 四个 AUTO 区块哈希；设计源或
  package 导出物变化后必须重新导出并执行 `--write`，否则本地闸失败。
- 测试还会检查导出组件、页面包依赖闭包、registry/Logic 配对，以及 `view/<Pkg>View.ts` 内的
  `ui://<Pkg>` 字面量；`view/` 下其他文件（如集中状态图标 URL 的 `areaPresentation.ts`）不在该扫描
  范围内，那里的包名写错不会被本地测试发现。
- 页面自身包和 `sharedPkgs` 都必须在创建前成功加载；失败不会降级为空占位，而会抛出
  `FguiPackageLoadError`（`code=FGUI_PACKAGE_MISSING`，`retryable=true`）。FairyGUI 的底层回调没有取消
  API，因此关闭页面或场景/root 世代变化时只取消当前等待者；迟到回调会被观察，成功共享包仍留在进程缓存中。
- 包加载使用统一 deadline，默认 `15000ms`，可由宿主调用 `FguiView.configurePackageLoading({ deadlineMs })`
  调整；超时抛 `FGUI_PACKAGE_TIMEOUT`（可重试）。`ViewMgr` 会把每次 open 的 `AbortSignal` 传给共享包和
  页面包加载，关闭/场景重载不会让旧 Promise 在之后挂载页面。

## 6. 设计分辨率与资源导出

当前竖屏设计基线为 750×1624 / `FIXED_WIDTH`，对应位置是：

- 代码数值真源：`apps/client/src/designSpec.ts`。
- 运行时适配策略：`apps/client/src/Main.ts`。
- Cocos 设置：`apps/Cocos/settings/v2/packages/project.json`。
- FairyGUI 设置：`apps/art/fairygui/settings/Adaptation.json`。

现有测试会核对代码常量、Main 策略和 FairyGUI 设置，但尚未读取 Cocos `project.json`；四处当前一致，
仍可能在以后发生未被测试发现的漂移，收口项见 [plan-v3.md](../plan-v3.md)。

资源动线：

```text
apps/art/fairygui 中修改设计源
  → 在 FairyGUI 编辑器中导出 .bin 与图集
  → 输出到 apps/Cocos/assets/resources/ui
  → 打开 Cocos 生成或复用 .meta
  → 运行 codegen 和本地契约测试
```

“导出”在本文中只指把设计源转换为本地开发资源。

## 7. 网络层

GameRoom 的通用 join/leave ownership 与 mode adapter 契约位于 `net/rooms/GameRoomTransport.ts`；
`BallMoveRoom.ts`、`IdleRoom.ts` 只把一个已捕获的物理 room 适配成各玩法能力。`Main.gameplayId` 选择 catalog
中的玩法，adapter 必须把对应 `mode`、生成的 state 类型/validator 和允许的 C2S 集合传给 Game join，不能
依赖服务端默认值。ballMove adapter 独占 Move reconcile；idle 没有该 hook，join/reconnect 都不会构造 Move。

### RoomClient

负责有状态房间：

- join 与连接复用。
- ownership/generation 守卫。
- 只通过不含原始 SDK room/send 的 typed facade 暴露玩法能力。
- 按 adapter allowlist 校验并发送输入；首个真实 `ROOM_STATE` 前和 reconnect 下一帧前 `stateReady` 保持关闭。
- 经 adapter raw exact validator 守卫的初始 root、异构 Schema state change 与 reconnect 恢复；JOIN handshake
  产生的默认 root 不作为首帧证据。
- SDK 离线消息队列固定为 0，并在 drop/reconnect 清空，防止其先于下一份 state 自动 flush。
- drop/reconnect/leave 事件。

复用判据必须包含 endpoint 和完整 join options；旧连接的迟到事件无权修改新 slot。ballMove gameplay
插件每 5 秒发一次 ping 测算 RTT，掉线窗口内暂停发送；网络层只负责发送与回调边界。

### WebSocketClient

负责 Lobby RPC：

- `rpc` / `rpcIdem`。
- timeout 与 pending 清理。
- push 分发。
- session 错误归类。

写请求的 `clientReqId` 只生成一次，重试复用同一个 ID。join 复用判据包含 endpoint、区号、token 和完整
options，不符即抛错而非静默复用；本次 `client`/`endpoint`/options/generation 会在 join 开始时冻结，
`init()` 换端点不会污染在途连接。join 的 deadline/cancel 契约由 `net/joinControl.ts` 定义，RoomClient
与 WebSocketClient 共用；timeout 或 AbortSignal 会立即结束本地 ownership，SDK 迟到的 room 仍在后台释放。
LobbyRoom 只为四个 SDK 会自动重试的 transport close code（1001/1005/1006/4010）**加上「框架未给关闭码」
的兜底分支**保留 10 秒重连窗口（`code === undefined` 时无从判定是否可重试，fail-open 最多多占 10 秒
seat / online registration）；主动退出、停服和 49xx 强踢直接最终清理。客户端 onDrop 会立即把全部在途
RPC 判为 CONN_LOST，掉线窗口内的新 RPC 也 fail-fast，不会进入 SDK 消息队列；当前 generation 的
onReconnect 只恢复发送能力，room、ownership 与 push listener 继续存活。只有最终 onLeave 才进入下述
session/profile 对账。
`net/session.ts` 是登录态与 authInvalid/connLost/battleLost 三类 transport 事件的枢纽；authInvalid 在
未登录时幂等吞掉迟到上报。Lobby 最终 `onLeave` 后，页面组合根先复用当前内存 token，以显式 ownership
重进所选区 Lobby，再拉 `user.getInfo`；只有完整 identity 仍匹配的结果才能原子替换角色快照并恢复 Home。
join 使用 15 秒显式超时并随页面 scope 取消，失败才进入统一 `returnToLogin` 清旧 bearer。重复最终断线
在同一 generation 内合流；旧 continuation 只能释放自己的 ownership，不能覆盖新快照或关闭后来登录。
authInvalid、battleLost、对账失败与 Main 的进房失败（BATTLE_JOIN_FAILED）仍由 `returnToLogin` 串行编排。

### HTTP

HTTP 底座在 `core/http.ts`，业务调用在 `net/http/`。外部返回值必须在边界校验，不能把
`JSON.parse(...) as T` 当成数据可信证明。

外部身份示例只使用开发契约。

## 8. 本地检查

```bash
npm run typecheck
npm run typecheck:client
npm run typecheck:client:legacy
npm run test:client
npm run test:fgui
npm run verify:sync
npm run verify:ecs
npm run verify:perf
```

### 8.1 客户端性能基线

`npm run perf:client` 在 Node 无头环境运行固定 seed 和 Float64 输入 tape，默认覆盖 100 与 500 个
玩家，分别记录输入同步、ECS tick、self entity 查找、快照分配探针、渲染命令探针以及组合帧的
`p50/p95/p99/max/mean`。这是开发期比较工具，不是 Cocos/GPU 性能承诺：

- `render` 使用 `GraphicsSink` 调用与 `BallMoveView.render` 相同的 `renderBallMoveWorld`，覆盖
  `clear + 边框 + 每玩家圆形/血条` 的样式、命令与几何；sink 以唯一 opcode 和固定小端 Float64
  参数流摘要颜色、线宽与完整命令顺序。它不会加载 Cocos，也不测真实 GPU、批次或材质。
- `snapshot` 是显式的临时对象数组分配探针；当前 `BallMoveView.render` 直接遍历 ECS，因此该指标用于评估
  是否值得引入缓存快照，而不是声称当前帧已经分配了这些对象。
- `snapshotBytesEstimatePerFrame` 是按 `(entityCount + 1) * 64` 的比较用估算，`heapDeltaBytes` 受
  V8 垃圾回收和宿主进程影响；有条件时可用 `NODE_OPTIONS=--expose-gc` 重跑，但不要把 heap 数值当作
  稳定阈值。
- 计时样本先经过 warmup；`frame` 样本把输入同步计入计时，其余单项把输入同步放在计时外。固定
  seed/input checksum、渲染命令数、独立 `renderChecksum` / `frameRenderChecksum` 和分配估算由无头
  测试锁定，timing 只用于同机趋势比较。

保存 JSON 结果（文件不含时间戳，便于版本间 diff）：

```bash
npm run --silent perf:client -- --json --output /tmp/client-baseline.json
```

仓库入库的结构基线位于 `docs/perf/client-ballMove-baseline.json`。运行
`npm run verify:perf` 会按该文件的 seed、帧数和实体数重跑探针，并校验输入 checksum、渲染命令数、
快照分配估算、单项/组合帧渲染 checksum 与带标签的聚合 sink checksum；计时、堆占用和 Node/平台信息
只作观察，不参与门禁。需要生成或更新
结构投影时使用 `--deterministic`：

```bash
npm run --silent perf:client -- --json --deterministic --output docs/perf/client-ballMove-baseline.json
```

可用 `--seed`、`--frames`、`--warmup` 和 `--entities 100,500` 调整工作负载；比较时应保持 Node
版本、平台、实体数和帧数一致，并同时查看 `input.checksum` 与 `sinkChecksum` 确认 tape/几何路径未漂移。

- `typecheck` 先校验外部身份契约，再检查 shared、server、客户端无头 strict probe 和 ES2017 legacy probe，
  并校验镜像；`apps/client/test/clientTypecheckConfig.test.ts` 分别守门两套配置的文件集合，防止新增源码或
  测试脱离 include。legacy 配置以递归 `src/**/*.ts` 覆盖 Main、全部 View 和 gameplay，并另外守住 Creator
  运行时的 ES2017 API 下限。
- `verify:sync` 检查漂移、孤儿和 `.meta`。
- `test:client` 运行全部客户端无头行为测试；`test:fgui` 只运行 codegen/registry/结构契约专项测试，
  两者都通过 `tsx` 执行。
- `verify:ecs` 检查 vendored bitECS 文件。

Creator 编辑器预览用于补充验证引擎绑定、资源导入和页面交互；它仍然是开发活动。

## 9. 新页面开发清单

1. 在 FairyGUI 编辑器中修改并导出组件。
2. 更新 `fguiContracts.ts`。
3. 运行 `codegen:fgui`。
4. 在 View 手写区接入必要事件。
5. 在 Logic 中实现行为并注入依赖。
6. 登记 viewRegistry 与共享包依赖。
7. 在 `view/pages.ts` 增加 `openXxx` 组合根：打开页面、构造 Logic、注入 net 依赖与导航回调（`Main`
   与业务层只调这里，不直接调 ViewMgr）。
8. 增加无头测试。
9. 运行 `sync:client`。
10. 在 Cocos 中本地预览。

## 10. 范围

现有场景、开发账号和演示页面只用于本地开发。微信小游戏兼容层等渠道接缝属于
[额外功能与参考实现](EXTRAFEATURES.md)，不构成核心能力承诺；完整项目边界见根 README，已知客户端
缺口见 [plan-v3.md](../plan-v3.md)。
