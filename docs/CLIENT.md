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

## 2. 源码与工程壳

```text
apps/client/src/
├── Main.ts             Cocos 组件入口与 Demo 编排
├── designSpec.ts       设计分辨率数值真源（750×1624）
├── core/               HTTP 底座、生成的开发配置与宿主环境桥
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

打开页面：

```ts
await ViewMgr.open("Home", params);
```

不要从普通脚本静态 import `fairygui-cc` 或具体 View。所有 View 都通过 registry 的动态 import
进入加载链，避免编辑器扩展尚未就绪时污染根脚本。

ViewMgr 已有的生命周期语义：同一 onlyOne 页面的在途 open 会合流到同一个加载 Promise；加载期间 close
会打取消标记并在 mount 前拦截；场景重载时经 layerRoots 探针整体重建并清零输入租约计数。FguiView 在
首个视图挂载时才懒建 GRoot 且默认关闭全局输入（避免全屏 InputProcessor 吞掉玩法触摸），包加载按
全进程在途合流防重复加载。

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
关闭必须走 `ViewHandle.close()` 或 `ViewMgr.close()`，否则租约无法恢复。

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
- 当前 XML parser 只读取组件 `displayList` 中有名字的直接子元素；列表 item、relation 和设计源到
  已导出 `.bin` 的新鲜度不在现有结构契约覆盖内。
- 测试还会检查导出组件、页面包依赖闭包、registry/Logic 配对及源码中的 `ui://<Pkg>` 引用。
- 页面自身包加载失败会直接抛错；`sharedPkgs` 由 `ensurePackages` 预载，但当前共享包失败路径只记录警告
  后继续。不要把两种失败语义描述成同一个强保证。

## 6. 设计分辨率与资源导出

当前竖屏设计基线为 750×1624 / `FIXED_WIDTH`，对应位置是：

- 代码数值真源：`apps/client/src/designSpec.ts`。
- 运行时适配策略：`apps/client/src/Main.ts`。
- Cocos 设置：`apps/Cocos/settings/v2/packages/project.json`。
- FairyGUI 设置：`apps/art/fairygui/settings/Adaptation.json`。

现有测试会核对代码常量、Main 策略和 FairyGUI 设置，但尚未读取 Cocos `project.json`；四处当前一致，
仍可能在以后发生未被测试发现的漂移，收口项见 [plan.md](../plan.md)。

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

### RoomClient

负责有状态房间：

- join 与连接复用。
- ownership/generation 守卫。
- 输入发送。
- Schema 状态监听。
- drop/reconnect/leave 事件。

复用判据必须包含 endpoint 和完整 join options；旧连接的迟到事件无权修改新 slot。战斗房另有应用层
心跳：`Main` 每 5 秒发一次 ping 测算 RTT，掉线窗口内暂停发送。

### WebSocketClient

负责 Lobby RPC：

- `rpc` / `rpcIdem`。
- timeout 与 pending 清理。
- push 分发。
- session 错误归类。

写请求的 `clientReqId` 只生成一次，重试复用同一个 ID。join 复用判据包含 endpoint、区号与 token，
不符即抛错而非静默复用；onDrop 会立即把全部在途 RPC 判为 CONN_LOST，room 实例与监听在 SDK 自动重连后
继续存活。`net/session.ts` 是登录态与 authInvalid/connLost/battleLost 三类会话事件的枢纽，未登录态的
迟到失效事件被幂等忽略。

### HTTP

HTTP 底座在 `core/http.ts`，业务调用在 `net/http/`。外部返回值必须在边界校验，不能把
`JSON.parse(...) as T` 当成数据可信证明。

外部身份示例只使用开发契约。

## 8. 本地检查

```bash
npm run typecheck
npm run verify:sync
npm run test:fgui
npm run verify:ecs
```

- `typecheck` 先校验外部身份契约，再检查 shared、server、client tsconfig 已纳入的源码与镜像；客户端
  tsconfig 排除了 `Main.ts` 与 `view/` 下 9 个文件（5 个页面 View 及 ViewMgr/FguiView/viewRegistry/pages
  装配件），`apps/client/test` 也不在任何 tsconfig 的 include 内——两者当前都不被严格类型检查覆盖。
- `verify:sync` 检查漂移、孤儿和 `.meta`。
- `test:fgui` 实际运行 codegen 测试和全部客户端无头测试，检查 FGUI 源码结构、registry、Logic purity
  与客户端无头行为；它通过 `tsx` 运行测试，不补足上述严格类型检查盲区。
- `verify:ecs` 检查 vendored bitECS 文件。

Creator 编辑器预览用于补充验证引擎绑定、资源导入和页面交互；它仍然是开发活动。

## 9. 新页面开发清单

1. 在 FairyGUI 编辑器中修改并导出组件。
2. 更新 `fguiContracts.ts`。
3. 运行 `codegen:fgui`。
4. 在 View 手写区接入必要事件。
5. 在 Logic 中实现行为并注入依赖。
6. 登记 viewRegistry 与共享包依赖。
7. 增加无头测试。
8. 运行 `sync:client`。
9. 在 Cocos 中本地预览。

## 10. 范围

现有场景、开发账号和演示页面只用于本地开发。微信小游戏兼容层等渠道接缝属于
[额外功能与参考实现](EXTRAFEATURES.md)，不构成核心能力承诺；完整项目边界见根 README，已知客户端
缺口见 [plan.md](../plan.md)。
