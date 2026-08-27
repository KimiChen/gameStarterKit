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

`fetch:colyseus` 和 `fetch:fgui` 只用于显式更新依赖，不是首次打开步骤。

本地预览需要：

1. 场景中存在挂载 `Main` 的节点。
2. FairyGUI 扩展已由工程加载。
3. `portalUrl` 指向与当前契约匹配的本地开发服务。
4. shared/client 镜像保持新鲜。

## 2. 源码与工程壳

```text
apps/client/src/
├── Main.ts             Cocos 组件入口与 Demo 编排
├── core/               ViewMgr、HTTP 底座、宿主环境桥
├── lib/                锁定的第三方技术依赖
├── logic/              引擎无关页面与玩法行为
├── net/                Room、RPC 与 HTTP 适配
├── shared/             apps/shared 的生成镜像
└── view/               Cocos/FairyGUI 视图绑定

apps/Cocos/
├── assets/src/         apps/client/src 的生成镜像
├── assets/resources/   场景与本地资源
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

页面开发应遵守：

- onlyOne 页面只创建一个实例。
- 事件接线应幂等，关闭时释放监听和异步上下文。
- 数据刷新与第一次 setup 分离。
- detached Promise 必须显式处理错误。
- 关闭页面后，迟到的 HTTP/RPC 结果不得继续更新 View。

### `interactive` 的含义

- `interactive: true`：根组件参与命中测试，适合模态页和整屏页面。
- `interactive: false`：根组件不阻挡背后的输入，适合纯展示层。

这不是视觉属性。选择错误会导致点击穿透或玩法输入被整屏 UI 吞掉。

## 5. FairyGUI codegen

命令：

```bash
npm run codegen:fgui -- <Package> <Component>
```

生成器只改 View 中的四个 AUTO 区块：

- import
- 字段
- bind
- apply

AUTO 区块外是手写区。重复执行应得到稳定结果。

命名元素必须先进入 `view/fguiContracts.ts`。跨包组件依赖通过 `viewRegistry.sharedPkgs` 声明，
不要在页面中临时加载隐式依赖。

常见约束：

- `GLoader` 使用 `url`，不是引擎 Sprite API。
- Controller 切页使用约定的 page name。
- 列表 item、loader URL、relation 和命名元素都属于结构契约。
- FGUI 自身包是 required；加载失败应返回可见的开发错误，而不是继续生成半空页面。

## 6. 设计分辨率与资源导出

设计分辨率在三处保持一致：

- shared 常量。
- Cocos 项目设置。
- FairyGUI 工程设置。

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

复用判据必须包含 endpoint 和完整 join options；旧连接的迟到事件无权修改新 slot。

### WebSocketClient

负责 Lobby RPC：

- `rpc` / `rpcIdem`。
- timeout 与 pending 清理。
- push 分发。
- session 错误归类。

写请求的 `clientReqId` 只生成一次，重试复用同一个 ID。

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

- `typecheck` 检查 shared/server/client 与镜像。
- `verify:sync` 检查漂移、孤儿和 `.meta`。
- `test:fgui` 检查 FGUI 结构、registry、Logic purity 和客户端无头行为。
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

现有场景、开发账号、兼容代码和演示页面只用于本地开发；完整项目边界见根 README。
