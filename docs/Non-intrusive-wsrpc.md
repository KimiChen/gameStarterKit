# 非侵入式功能扩展改造方案

> 状态：**设计提案，尚未实施**。
>
> 本文说明为了让《Underground Idle》以及后续类似 Lobby 玩法尽量以“只新增 feature 文件”的方式接入，
> 框架本身需要进行的一次性改造。它不表示这些能力已经交付，也不改变
> [当前开放问题、实施状态与验收证据的唯一真相](../plan-v4.md)；plan-v3.md / plan-v2.md 为历史归档。
> 现有架构与约束仍分别以
> [技术总览](OVERVIEW.md)、[服务端开发](SERVER.md)、[客户端开发](CLIENT.md) 为准；
> 本文的直接需求来源是 [《Underground Idle》策划案](undergroundIdle/README.md)。
>
> 实时 Room 玩法方向的补充方案见 [Non-intrusive-room.md](Non-intrusive-room.md)；两份方案共享的生成器基础
> 设施 owner 与落地顺序以该文 **§4.1** 为准，本文 ⛔ 不引入第二真源。

## 1. 结论与改造口径

本次改造的目标不是让新增玩法在 Git 中“一个旧文件都不变化”，而是达到以下更有价值、也可验证的结果：

> **新增普通玩法时，不再手改既有人工维护的框架或业务源码；开发者只新增该玩法拥有的契约、服务端、
> 客户端、资源和测试文件。中央注册表、协议指纹、FGUI 清单和同步镜像可以产生确定性的机械变更。**

这是当前技术栈下“无侵入”的合理上限。Cocos Creator 需要在构建期看到**可静态分析、specifier 为字面量的
动态 import**，shared 需要同时给 TypeScript、Node 和 Cocos 提供确定的类型全集，协议与 FGUI 还需要提交版
锁文件。因此，至少会有生成注册表、指纹和镜像变化；消除这些变化反而会削弱静态类型、启动期 fail-fast 和
审查可见性。普通脚本仍禁止静态 import 具体 View/FairyGUI 模块。

本文首先承诺的是“新增已登录 Lobby 页面型 feature”的扩展边界。它不自动覆盖实时 Room 玩法、新增 GameRoom
C2S 消息、公共 FGUI 基础包改造或全局数据模型变化；这些仍属于有意的框架修改。

改造后的理想开发边界是：

```text
一次性修改框架
  → 建立 feature 描述符、生成注册表和通用运行时接缝
  → 迁移现有 user/mail/shop/guild、页面和 ballMove 入口
  → 验证生成物与现有行为一致

以后新增玩法
  → 只新增 feature/domain/endpoint/view/logic/test/art
  → 运行 codegen、FGUI 导出与 sync
  → 只审查玩法源码 + 确定性生成 diff
```

## 2. 为什么需要改造

### 2.1 当前扩展点仍有多个人工全集

现有框架已经具备目录分层、endpoint 自动扫描、动态 View 加载和双端 shared 契约，但普通 Lobby 玩法仍需跨越
多个中央登记点：

| 位置 | 当前扩展动作 | 带来的问题 |
| --- | --- | --- |
| `apps/shared/src/protocol/lobbyRpc/index.ts` | 手工增加 export、`LobbyRpcMap`、路由全集和 req/res validator | 同一领域分散登记；漏一处才在后续测试或启动时发现 |
| `apps/shared/src/protocol/lobbyRpc/envelope.ts` | 手工扩展全局错误码数组 | 领域错误与框架错误耦合，多个 feature 分支容易冲突 |
| `apps/shared/src/protocol/lobbyRpc/push.ts` | 手工扩展 push 常量、Map、switch validator | 第二阶段新增唤醒推送仍会修改中央文件 |
| `apps/shared/src/logic/index.ts` | 手工 re-export 新纯逻辑 | 玩法代码虽然是新增文件，公共入口仍要人工侵入 |
| `apps/server/src/websocket/rpc.ts` | endpoint 重复声明 schema 和 `idem: true` | shared 已有语义仍需服务端再次登记；剩余风险是手写两字段的机械重复（含 clientReqId 的路由漏开 idem 已是编译期错误） |
| `apps/server/src/core/errors.ts` | 为新异常维护中央 constructor→code 映射 | 领域错误必须侵入框架核心 |
| `apps/server/src/core/idem.ts` | 只有短期 pending/result 缓存 | 不绑定 payload，且没有受控状态查询，不能完整承载结果未知恢复 |
| `apps/client/src/view/pages.ts` | 手工组合页面、导航和会话恢复 | 新玩法会继续把分支堆进中央页面组合根 |
| `apps/client/src/view/viewRegistry.ts` | 每个 View 手工登记动态 import 和元数据 | View 文件与中央 registry 需要同步修改 |
| `apps/client/src/view/fguiContracts.ts` | 手工维护契约常量和全集 | XML、View AUTO、contract 和 registry 存在多个同步点 |
| `apps/client/src/view/HomeView.ts` | 固定 `btn_enter` 进入 ballMove | 每增加一个主入口都可能修改既有 Home 页面 |
| `apps/client/src/net/WebSocketClient.ts`、`net/session.ts` | **瞬态** drop/reconnect 只在 `WebSocketClient` 内部处理；**最终态**已有 `session.ts` 的 `onAuthInvalid` / `onConnLost` / `onBattleLost` 稳定订阅（`Main.ts` 消费），但没有 joining/ready/dropped/reconnected 这类瞬态事件 | feature 只能感知“已经完了”，无法响应短暂 drop、重连与结果未知 |
| 契约、View 与 inventory 测试 | 中央穷尽 fixture 或文件名假设 | 新领域必须修改旧测试表，feature 无法完全拥有自己的验收向量 |

这些修改本身不一定复杂，但会产生三个长期问题：

1. **冲突集中**：多个玩法分支会反复修改相同的 index、registry、Home 和测试 fixture。
2. **语义重复**：读写属性、幂等、validator、错误码和页面加载信息在不同层重复声明。
3. **漏登记风险**：类型系统只能覆盖部分关系，复制旧模板后漏开幂等、漏注册页面或漏加测试样例仍可能发生。

### 2.2 《Underground Idle》暴露的是框架共性，不是单一玩法特例

该玩法要求：

- Lobby WS-RPC 读写分路；
- 写请求 payload 绑定和稳定 `clientReqId`；
- `pending/applied/unknown` 结果恢复；
- 断线重连、应用回前台和页面重开后拉完整快照；
- 页面关闭后的迟到响应隔离；
- Home 中增加玩法入口；
- 多个 View、FGUI 包、契约和测试接入。

其中只有矿场、矿工、远征、公式和存档结构属于 Idle 领域。幂等 payload 绑定、连接生命周期、导航恢复、
feature 菜单、静态注册表生成以及 fixture 发现都是其他 Lobby 玩法同样需要的框架能力。若只在 `idle.*` 内部
解决，将来每个玩法都会复制一次，而且通用 dispatcher 在进入 handler 前就可能返回旧缓存，领域代码无法完整
补救。

### 2.3 为什么不能追求字面上的零旧文件 diff

以下变化应保留，而不是被隐藏：

- 客户端动态 import 集合必须静态可见，最稳妥的做法是生成 TypeScript registry；
- shared 协议增加路由后，协议指纹必须变化，review 应能看见；
- FGUI 新包需要编辑器导出 `.bin`、图集、图片和 `.meta`，Node codegen 不能代替编辑器；
- shared/client/Cocos 镜像必须随真源同步；
- 协议是否兼容、能力是否晋升 core、验收是否完成仍需要人工判断。

因此本文把“生成侵入”与“人工侵入”分开管理。

## 3. 目标、定义与非目标

### 3.1 术语定义

| 术语 | 定义 | 新增普通 feature 时是否允许 |
| --- | --- | --- |
| 人工侵入 | 开发者手改既有框架或其他领域拥有的源码、测试、页面或登记表 | 不允许 |
| 新增式改动 | 在新 feature/domain 目录增加由该 feature 拥有的文件 | 允许，也是目标形态 |
| 生成侵入 | codegen 根据 feature 源生成或刷新中央 registry、索引和锁文件 | 允许，必须确定且可检查 |
| 镜像变化 | `sync:shared`、`sync:client` 产生的客户端/Cocos 镜像变化 | 允许，禁止手改 |
| 框架变化 | 修改通用语义、默认入口、DB schema、依赖或运行时机制 | 仍需显式修改和评审 |

删除 feature 也不属于普通“新增式改动”。删除会涉及生成条目、资源、镜像和可能的存量数据兼容，必须走单独的
显式审核与删除保护，不能让生成器因为目录暂时缺失就静默批量删除。

### 3.2 可验收目标

一次性改造完成后，应满足：

1. 新增 Lobby RPC 领域不再手改 `lobbyRpc/index.ts`、`envelope.ts`、`rpc.ts`、`dispatcher.ts` 或
   `core/errors.ts`。
2. 新增 feature 页面不再手改 `pages.ts`、`viewRegistry.ts`、`fguiContracts.ts`、Home、`Main.ts` 或
   `WebSocketClient.ts`。
3. 路由的请求、响应、执行模式和幂等策略只有一个领域真源；全局错误码全集由 core + domain descriptor
   单源聚合。
4. 所有 idempotent write 自动获得 payload hash、唯一 lease 和短期结果缓存；只有显式声明 inspectable/
   operation group 的路由才能进入受控查询。
5. 所有 feature 通过统一的会话、连接和宿主生命周期接口恢复，不自行重建 Lobby 连接。
6. 新增 feature 只增加自己的测试向量；通用测试自动遍历并验证全集。
7. `--check` 在生成物陈旧、重复 id、路径越界或集合不齐时失败，且不修改工作区。
8. 提交 diff 能清楚区分手写 feature 文件、生成物、资源导出物和镜像。

### 3.3 非目标

本方案不做以下事情：

- 不实现运行时热插拔、远程插件下载或脚本热更新；
- 不把 feature 变成新的 npm workspace，也不要求把所有现有源码迁入一个巨型 vertical-slice 目录；
- 不在 shared 引入 Zod、Node API、DOM、`cc` 或完整 schema DSL；
- 不从 TypeScript interface 自动猜测运行时 validator；validator 仍由领域显式实现；
- 不让生成器自动 bump 语义版本、自动宣告功能完成或自动修改**当前计划文件**（写作时为 plan-v4.md）的验收
  结论；实施时以 `docs/inventory.json` 的 `routeOfTruth.corePlan` 为准，而不是本文写死的文件名；
- 不为单个挂机玩法提前抽象通用 MySQL/outbox/跨服编排；
- 不在本轮重写 GameRoom mode/C2S 消息架构。实时 Room 玩法仍遵守现有独立动线；本文主要解决
  Lobby WS-RPC + 页面型 feature。

## 4. 总体技术方案

### 4.1 新增 feature 描述符

建议增加一个只承载跨层登记信息的数据文件：

```text
features/
├── schema-v1.json
├── built-in/
│   └── feature.json
└── underground-idle/
    └── feature.json
```

`feature.json` 只描述：

- `schemaVersion`、feature id、类别和声明状态；
- 权威文档路径；
- shared RPC domain module、可选 push contribution 和纯逻辑公开模块；
- 服务端 endpoint 目录和测试向量路径；
- 客户端 runtime module、纯 route descriptor 路径、View metadata 路径和 Home 菜单 contribution；
- inventory capability fragment 和验证入口。

JSON 中不得放：

- TypeScript 类型或 validator 实现；
- handler、公式、领域 reducer；
- 完整玩法配置；
- 可执行回调；
- 测试通过结论或人工验收证据。

这样既能建立跨层索引，又不会把业务逻辑塞进一个难以类型检查的配置文件。

### 4.2 生成静态注册表，不依赖运行时扫描

建议新增 `scripts/feature-codegen.mjs` 或同等工具，扫描 feature 描述符和领域描述符，生成：

```text
apps/shared/src/features.generated.ts
apps/shared/src/protocol/lobbyRpc/registry.generated.ts
apps/shared/src/logic/features.generated.ts
apps/client/src/generated/features.generated.ts
apps/client/src/generated/routes.generated.ts
apps/client/src/generated/views.generated.ts
apps/client/src/generated/fguiContracts.generated.ts
apps/client/src/generated/fguiPackages.generated.ts
docs/features.generated.md
```

所有客户端 loader 必须是生成的静态字面量：

```ts
load: () => import("../features/undergroundIdle/index")
```

不得在 Creator 运行时依赖 `fs`、目录扫描或未经当前构建链验证的 `import.meta.glob`。生成器承担“发现文件”，
运行时只消费已生成、可类型检查的 registry。

### 4.3 feature 所有权

feature 必须拥有自己的：

- shared domain contract 和纯逻辑；
- server endpoint、core 领域模块及持久化收据；
- client Logic、View、route composition 和网络 port adapter；
- FairyGUI 独立包或明确声明的共享包依赖；
- 单测、集成测试和位于 `apps/server/test/lobbyRpcVectors/`（拟新增，当前不存在；`test/` 已整体在服务端
  tsconfig include 内）的 RPC 最小向量；
- 说明文档和 inventory fragment。

跨 feature 依赖必须在 manifest 中通过 `dependsOn` 或稳定 port 声明。禁止 feature 互相直接读取内部状态，生成器
应拒绝依赖环和重复公开 id。

## 5. Shared 契约改造

### 5.1 RPC 领域自描述

命名注意：仓内已有 Room 玩法 fixture `idle`（`GameplayModeId.Idle`、
`apps/server/src/rooms/modes/IdleGameMode.ts`、`apps/client/src/logic/rooms/idle/IdleGameplay.ts`），与
本文的 Lobby 域 `idle` **同名不同层**；实施时若保留该 fixture，需在文档与代码注释里区分二者，或对其中
一方改名。

新增稳定的零依赖 builder，例如：

```ts
export default defineLobbyRpcDomain({
  domain: "idle",
  errorCodes: [
    "STATE_CONFLICT",
    "OPERATION_RESULT_EXPIRED",
    "GAMEPLAY_NOT_READY",
    "GAMEPLAY_STATE_INVALID",
    "INSUFFICIENT_STAMINA",
  ] as const,
  routes: [
    defineRpcQuery("idle.getSnapshot", {
      request: validateGetSnapshotReq,
      response: validateGetSnapshotRes,
    }),
    defineRpcIdempotentWrite("idle.activate", {
      request: validateActivateReq,
      response: validateActivateRes,
      operationGroup: "idle",
      inspectable: true,
    }),
    defineRpcQuery("idle.queryOperation", {
      request: validateQueryOperationReq,
      response: validateQueryOperationRes,
      inspectsOperationGroup: "idle",
    }),
  ],
});
```

建议固定三种执行模式：

| 模式 | 含义 | 框架行为 |
| --- | --- | --- |
| `query` | 不产生领域写入 | 不进入幂等写状态机 |
| `natural-write` | 写入本身可安全重复，如目标状态赋值 | 不使用通用结果缓存；仍执行 validator、预算和 handler 自身的领域约束 |
| `idempotent-write` | 重复执行可能重复扣除、发奖或推进状态 | 请求必须含 `clientReqId`，自动进入通用幂等层 |

不得再通过“请求类型是否含 `clientReqId`”推断执行模式。`idle.queryOperation` 会携带原操作的请求 ID，但它仍是
query；显式 metadata 才能正确表达这种语义。

执行模式不替代并发控制。是否需要用户锁、UoW、UNIQUE 或 CAS 仍由领域写路径决定；`natural-write` 只描述重复
调用的业务效果，不等于 dispatcher 自动加锁，也不等于不存在竞态。

### 5.2 生成的 RPC 全集

`registry.generated.ts` 静态 import 每个 domain，并由 **AST 生成器逐条写死** route → req/res 映射与执行模式
归属，导出：

- `LobbyRpcType`；
- `LobbyRpcMap`；
- `RpcReq<T>` / `RpcRes<T>`；
- `LobbyRpcIdemType`；
- `ALL_LOBBY_RPC_TYPES`；
- request/response validator map；
- core + domain 错误码全集和 `isRpcErrCode`；
- 可查询 operation route 集合；
- 可选 push type、payload validator 和 push 全集。

⚠ 这里是**生成的显式字面量联合**，⛔ **不依赖 `typeof domain` 之类的类型推导**——routes 数组一旦被 widen，
route 与 mode 的字面量就丢了，§8.2 第 5 条的编译期负例也写不出来。这一点是硬要求：现有
`apps/server/src/websocket/rpc.ts` 的 `defineRpc` idem / 非 idem **双重载**依赖 `LobbyRpcIdemType` 是精确字面量
联合才能在编译期收窄；而且该类型必须**改由显式 mode metadata 产生**，⛔ 不再用今天的「req 结构里含
`clientReqId`」做推断（§5.1 已说明为什么结构推断不足以表达 `queryOperation` 这类路由）。

配套契约测试：descriptor 的**运行时值**（domain / route / mode / errorCodes）必须与 generated 表**双向相等**，
防止 AST 读取结果与运行时值成为两份真源。生成器只做**语法读取**，⛔ 不执行 domain 文件（见 §8.1）。

现有 `lobbyRpc/index.ts`、`envelope.ts` 和 `push.ts` 改成稳定 façade；以后只 re-export 类型、信封验证器和生成
registry，不再维护领域 switch 或数组。

core error descriptor 拥有鉴权、限流、非法载荷、未知路由、忙、处理中、操作冲突和内部错误等通用码；domain
descriptor 只贡献领域码。若未来要约束“某条 route 允许产出哪些领域错误”，应另加 route-level `errors`
metadata，不能把 domain 级错误集合误读为逐路由穷尽表。

### 5.3 validator 边界保持不变

自动化的是**聚合**，不是领域校验本身。每个 route 仍使用 shared 现有的 exact/range 积木手写 validator，继续
拒绝：

- 未知字段；
- NaN、Infinity 和非安全整数；
- 越界字符串、数组和对象；
- 非法枚举、重复 id 和不完整联合类型。

**`clientReqId` 需要一块专用积木。** 它今天走通用的 `requiredId`，只有长度界（1–64），**没有字符集约束**——
而它会作为最后一段进入 Redis key。应由 shared 侧唯一的积木校验：ASCII 安全字符集（建议
`^[A-Za-z0-9_-]+$`）、**长度上限保持现有 64**、字节长度 = 字符长度，禁控制字符与 key 分隔符。
所有 idempotent-write route 复用同一积木，⛔ 不再各自调通用 `requiredId`。
⚠ 收紧字符集会拒绝旧客户端可能发出的历史 ID，属于 **wire 收紧**，须与 §8.4 的协议身份分离一起走版本节奏，
⛔ 不能混进 §11 阶段 1 「现有 route、validator、endpoint 和行为不变」的机械迁移。
⛔ 不要顺手把长度下界从 1 提到 8——那会拒绝现有客户端的合法短 ID。

生产 contract 中不放测试 fixture，避免客户端包携带测试数据。测试向量放在 feature-owned sidecar。

### 5.4 shared 纯逻辑出口

`apps/shared/src/logic/index.ts` 一次性改为 re-export 一个生成 barrel，或允许 feature 使用稳定的 shared 子路径
export。后续新增 `logic/undergroundIdle/**` 时，不再手改中央 `logic/index.ts`。

## 6. 服务端改造

### 6.1 `defineRpc` 由 metadata 驱动

endpoint 的目标形态应收敛为：

```ts
export default defineRpc(IdleRpc.Activate, {
  handler: async (ctx, payload) => {
    // 只写领域行为
  },
});
```

`defineRpc` 根据 shared registry 自动取得：

- request validator；
- response validator；
- query/write 模式；
- 是否进入通用幂等；
- operation group。

endpoint 不再重复填写 `schema`、`idem: true` 或响应 validator。现有 user/mail/shop/guild endpoint 需要进行
一次机械迁移，确保生成 metadata 与原行为一致。

现有 `apps/server/src/websocket/loader.ts` 已经能扫描 `websocket/<domain>/<method>.ts` 并与 shared 全集做双向
校验，应继续保留。只需调整它接收的新定义形状，不必重新发明 endpoint 装载器。

该 loader 当前依赖 tsx 直跑和服务端运行时文件系统扫描；静态生成的 shared registry 不会自动让它变成
bundler-safe。若未来服务端改用打包产物部署，endpoint loader 仍需单独切换为构建期静态 manifest。

`websocket/<domain>/` 下的每个普通 `.ts` 仍会被 loader 当作 endpoint；helper、decoder 和领域服务必须放到
`core/<domain>/` 或未来显式支持的辅助目录，不能在 endpoint 目录随意增加 `index.ts`/工具文件。

改造只替换“validated payload → handler”这一段，不改变现有信封校验、鉴权、per-principal 限流、未知路由
处理和 timeout 外层边界。入站 request 违规仍映射为 `INVALID_PAYLOAD`；出站或缓存 response 契约违规必须包装成
服务端缺陷并映射为 `INTERNAL`，不能因为共用 shared validator 就误报成客户端输入错误。

### 6.2 payload 绑定幂等

dispatcher 必须在 handler 执行前按固定顺序处理 idempotent write：

1. 用 shared validator 校验并规范化 payload；
2. 在 handler 可能修改对象前计算 canonical payload hash；
3. 以 `(zone, route, uid, clientReqId)` 查询/获取幂等记录；
4. 相同 ID、不同 hash 返回通用 `OPERATION_CONFLICT`；
5. 相同 hash、pending 返回 `IN_PROGRESS`；
6. 相同 hash、done 重新校验缓存响应后重放；
7. 只有首次取得 lease 的请求才进入 handler。

建议固定摘要算法并版本化：

```text
SHA-256(
  "lobby-rpc-idem/v1\0" +
  routeType + "\0" +
  canonicalJson(normalizedBusinessPayload)
)
```

其中：

- 对象 key 使用仓库唯一参考实现规定的稳定顺序；
- 数组顺序保留；
- `clientReqId` 已作为 key 的**最后一段**进入 Redis key（现有 `kIdemUser(route, uid, clientReqId)` 的 `sub`
  分量），`(route, uid)` 固定时不同 ID 必得不同 key、编码单射，因此摘要可安全排除它。⛔ 改变 key 的分段顺序、
  或让 `clientReqId` 不再位于末段，会同时破坏这条推理与冲突检测——两者必须一起修改并补回归向量；
- route type 和算法版本必须进入 preimage；
- validator 必须先排除非 JSON 值和越界数据；
- hash 由框架注入 `ctx.operation`，领域收据直接复用，禁止领域再实现另一套 canonicalization；
- 记录中必须额外持久化该 route 的**契约版本**（由 route descriptor 声明的 `contractVersion`，随 request /
  response validator 的语义变更人工 bump）。⛔ **契约版本不进 preimage、也不进 key**——进 preimage 会把一次
  升级变成 `OPERATION_CONFLICT`，进 key 会让升级期同一 `clientReqId` 重新执行 handler，两者都比 fail-closed
  更糟；
- 读到契约版本不匹配的记录时按 **fail closed** 处理：pending 返回 `IN_PROGRESS`，done 返回
  `OPERATION_RESULT_EXPIRED`，⛔ 不重放、不重新执行。

**key 必须经 `keys.ts` 构造。** 第 3 步的 key 由 `apps/server/src/core/infra/keys.ts` 的
`kIdemUser(route, uid, clientReqId)` 生成（已带项目前缀、区前缀与 `{uid}` hash-tag），zone 分量来自
`zoneCtx` / `currentZoneId()`，**不接受客户端自报**；⛔ 禁止在 dispatcher 或领域代码里就地拼接（铁律 8）。
这与 [Non-intrusive-room.md](Non-intrusive-room.md) §8.2 对邀请码 key 的要求对称。

> **`IN_PROGRESS` ≠ 操作未完成。** 第 3–6 步的通用幂等记录是 §6.4 所说的 transient gate，`IN_PROGRESS` 只表示
> “通用闸当前被占用”，⛔ **不表示“操作尚未完成”**——孤儿 lease 下两者会不一致。客户端收到 `IN_PROGRESS` 后的
> 恢复路径是 §6.4 的查询路由，**不是**继续重试写路由。对**未**声明 `operationGroup + inspectable` 的路由
> （本阶段除 Idle 外全部），其 ResultUnknown 窗口以 pending TTL 为上界，窗口过后重试是安全的。

canonicalizer 必须有跨嵌套对象、Unicode key、数组、可选字段和 key 顺序变化的 golden vectors；其他语言或领域
代码不得自行解释“稳定排序”。构造摘要时从副本排除 `clientReqId`，不得修改随后传给 handler 的 validated
payload。该同步工作发生在 handler 预算外，必须依赖 transport `maxPayload`、validator 深度/长度上限，并为最大
合法 payload 增加 dispatcher 级耗时探针，防止 hash 成为新的事件循环阻塞点。

### 6.3 唯一 lease 与 CAS 完成

当前 holder 不能继续只用 sessionId。每次成功 acquisition 必须生成独立 `leaseId`，Redis 记录升级为有版本结构：

```ts
type StoredIdem =
  | { v: 2; state: "pending"; hash: string; leaseId: string; contractVersion: number }
  | { v: 2; state: "done"; hash: string; resultJson: string; contractVersion: number }
  | { v: 2; state: "done-oversize"; hash: string; contractVersion: number };
```

**生存期不变式（v2 继承 v1，⛔ 不得在升级中丢失）**：pending 写入带 pending TTL（现为 30s 量级的
`IDEM_PENDING_MS`）；done 写入带 result TTL（现为 60s 量级的 `IDEM_RESULT_MS`）。CAS complete 是「比对 pending
记录 + 覆写为 done + **重置** TTL 为 result TTL」的**单条 Lua**，⛔ 不得沿用 pending 的剩余 TTL，也 ⛔ 不得写成
无 TTL 的 SET；release 只删自己的 pending。启动期继续断言 `IDEM_PENDING_MS > HANDLER_TIMEOUT_MS`——引入
`leaseId` 后这条不变式**更强而非更弱**。

**结果大小上限**：done 记录有 `IDEM_RESULT_MAX_BYTES` 上限（新增 config，按现有响应 validator 的最大声明尺寸
取值）。超限时 ⛔ **不写入响应体**，改写 `done-oversize` 墓碑：重放该 `clientReqId` 与 `inspect` 都返回
`OPERATION_RESULT_EXPIRED`（既不重跑 handler，也不伪装成 `unknown`），客户端按领域收据查询恢复；超限事件计入
指标，用于发现「不该走通用结果缓存」的 route。

**每 uid 并发上限**：同一 uid 同时存在的 pending 记录数有上限，超限返回 `BUSY`。否则一个客户端可以用无限多个
不同 `clientReqId` 撑爆 key 空间。该计数与幂等 key 同槽（`{uid}` hash-tag），随 TTL 自然衰减。

`complete` 和 `release` 都必须通过 Lua/CAS 比对完整 pending 记录：

- 旧 handler 不得覆盖新 lease 的完成结果；
- 旧 handler 不得删除后来者的 pending；
- 只有响应契约校验通过后才能从 pending 提升为 done；
- 腐坏或未知版本记录必须 fail closed，不能当作“未执行”；
- **acquire 必须使用原子 Lua。** 原文的「或保留经过并发证明的有界 `SET NX + GET + retry`」在引入 `leaseId`
  后不再等价——`SET NX` 失败后的 `GET` 与后续判断之间存在过期窗口，两个请求可能各自认为自己拿到了 gate，
  而 v1 用 sessionId 当 holder 时这种重叠是无害的、v2 会产生两个都写 done 的 lease。⛔ 不保留该分支；
  跨过期窗口的双 acquisition 必须有集成测试；
- 升级默认采用 drain/维护窗口，除非逐路由证明混部兼容。直接复用旧 key 会让旧节点误读 v2 记录，换 namespace
  又可能让新旧节点同时取得 gate，不能只靠“换前缀”宣称安全。
  **drain 窗口的最小时长 = 最后一个旧节点写入之后再等 `IDEM_RESULT_MS` + `IDEM_PENDING_MS`**，否则旧 shape
  的 done 记录会跨过升级点存活。若使用新 namespace，还必须显式说明新旧 gate 并存期内如何避免双执行；
- v2 若使用新前缀，属于**新增 key 族**，必须先更新契约登记再进 `keys.ts`，新旧构造器并存到迁移完成为止。

响应契约重校验失败时按现有 dispatcher 语义返回 `INTERNAL` 且**不删除记录**，该 `clientReqId` 在剩余 TTL 内
不可用——这是**刻意的 fail-closed**，客户端应改由领域收据查询恢复，⛔ 不得为此把重校验失败降级为「当作未执行」。

handler 可能已经提交领域状态，但 complete CAS 因 lease 过期或换代而失败；此时不能回滚业务提交，也不能让旧
lease 覆盖新记录。durable receipt 才是权威，客户端进入结果未知并保留原 ID 查询或重试。
此时旧 lease 的 pending **归新持有者或归 TTL，⛔ 不归旧 handler**：旧 handler 既不能 complete、也不能
release，只能放弃；客户端在该窗口内看到的是 `IN_PROGRESS`，恢复路径按 §6.2 的衔接说明走查询路由。

⚠ **孤儿 lease 不能默认是罕见路径。** 仓库已有加载期不变量 `IDEM_PENDING_MS > HANDLER_TIMEOUT_MS`，但它
**不充分**——超时不取消 handler（`Promise.race`，见 §6.4 末段），handler 实际时长无上界。真正需要保持的是
`IDEM_PENDING_MS > handler 实测 p99`：每条幂等路由必须有执行时长埋点，p99 逼近 `IDEM_PENDING_MS` 的路由要么
拆分、要么单独放大租约；complete CAS 失败要打一条独立的孤儿 lease 指标。

### 6.4 受控 operation 查询

目标 idempotent route 通过 `operationGroup: "idle"` + `inspectable: true` 声明可查；查询 route 通过
`inspectsOperationGroup: "idle"` 声明自己被授权查询的组。dispatcher 只向该 query handler 注入已经绑定
uid、zone 和 operation group 的只读 capability：

```ts
ctx.operations.inspect(routeType, clientReqId)
```

返回：

```ts
type InspectResult<T extends LobbyRpcIdemType> =
  | { kind: "pending" }
  | { kind: "done"; data: RpcRes<T> }
  | { kind: "result-expired" }   // 含 §6.3 的 done-oversize 墓碑
  | { kind: "unknown" };
```

⚠ `done-oversize` 墓碑必须映射到 `result-expired`，⛔ **不得被归类为 `unknown`**——前者是「确定执行过、
结果不可得」，后者是「无法确定是否执行过」，客户端的恢复动作完全不同。

**`operationGroup` 的所有权规则（⛔ 它不是一个无主的全局字符串命名空间）**：

1. `operationGroup` 是受生成器管理的**受拥有 id**：每个 group 必须由且仅由一个 feature/domain 在 manifest
   顶层显式 `ownsOperationGroups: [...]` 声明，重复声明由 codegen 拒绝；
2. `inspectsOperationGroup` 默认只能引用**本 feature 自己拥有**的组。引用他人拥有的组必须同时满足：查询方
   `dependsOn` 被查询方，且被查询方显式 `exposesOperationGroupTo: [<featureId>]`。任一条缺失即 codegen
   fail closed——这与 §4.3「禁止 feature 互相直接读取内部状态」是同一条边界；
3. 同一条 route ⛔ 不得同时声明 `operationGroup` 与 `inspectsOperationGroup`；查询 route 必须是 `query` 模式；
4. §8.1 的重复 id 拒绝清单必须包含 `operationGroup`，双向所有权校验也必须覆盖 group 的 owner/consumer 关系。

其余约束如下：

- uid、区号从当前 `RpcCtx` 绑定，客户端不能传入或覆盖；
- dispatcher 同时校验调用方 query route 的 `inspectsOperationGroup` 与目标 route 的 `operationGroup`；
- `idle.queryOperation.operationType` 的 validator 只能接受生成的 Idle inspectable route 子集；
- done 结果必须再次通过对应 response validator；
- done 中的缓存 snapshot 可能陈旧，客户端仍按 `stateVersion` 守卫；
- 不暴露 Redis key、payload hash、leaseId 或 holder；
- 腐坏记录返回 `INTERNAL`，不能伪装成 `unknown`。

领域查询仍应先查 durable receipt，再查通用短期状态。对于 Idle：

1. 找到领域收据时返回 `applied`；
2. 没有完整收据但有合法 generic done 时，可在短窗内按版本守卫返回 `applied`；
3. 有 tombstone 但完整结果过期时返回 `OPERATION_RESULT_EXPIRED`；
4. generic pending 存在时返回 `pending`；
5. 以上都不存在才返回 `unknown`。

第 2 步的比较对象要写明：按 done 快照内嵌的 `stateVersion` 与当前聚合版本比较；**当前版本更新时只能返回
`applied`**（该操作已被更晚的操作覆盖），⛔ 不得据此判定冲突。

**查询是无锁读。** 下一段所说的「同一个序列化段」只约束**写**路径，⛔ **查询路径不得获取领域写锁**——客户端
轮询的目标往往正是那个持锁的在途写，查询去抢锁会把 UX 快闸变成阻塞源。作为无锁读的代价，返回 `unknown`
之前必须**复读一次领域收据**（收据是最先落地且此后不再消失的证据），关闭「第 1 步读收据早于提交点、
pending 又已被 TTL 抹掉」的双 miss 窗口。

通用幂等只是 30/60 秒量级的 UX 快闸，不是 exactly-once 真源。Idle 状态和收据仍必须在同一提交边界落地，
`unknown` 也不能被解释为安全失败。

**写路径**的“先查收据、后查 `expectedStateVersion`”必须位于同一个用户锁/UoW/CAS 序列化段：receipt read、
状态推进、版本检查、状态写入和 receipt insert 共同构成领域原子操作。只在锁外预读一次收据会出现双 miss。
同一成功操作携旧版本重试时，应回放第一次结果，而不是被误判为新的状态冲突。

完整 receipt 窗口、tombstone 窗口、最大条数和裁剪顺序必须由领域文档化；tombstone 至少保留 route、
clientReqId 和 payload hash。若奖励进入 MySQL、背包、outbox 或其他聚合，上述“同一提交边界”不再成立，必须
重新设计 intent、ledger 和补偿。

`Promise.race` 超时不会取消 handler；超时只结束客户端等待，迟到副作用仍必须依赖领域原子提交、收据、
UNIQUE 或 CAS 收敛。

本阶段只承诺 server-side inspector + `idle.queryOperation` 领域适配，不新增全局 `operation.query`。通用 route
无法替不同领域读取异构 durable receipt，也会扩大 `RpcRes<T>` 的 wire/data 暴露边界；未来若单独设计，它也
只能查询 transient gate，不能代替领域查询。

### 6.5 自描述错误

一次性引入带 runtime whitelist 的 `RpcFault` 或 `rpcFault(code)`：

```ts
throw new RpcFault("STATE_CONFLICT", "idle state version conflict");
```

dispatcher 安全读取 `rpcCode`，用生成的 `isRpcErrCode` 验证后返回；非白名单、恶意对象或未知异常统一落到
`INTERNAL`。现有 Busy、StaleFence 等异常可以保留子类名称，但不再依赖中央 constructor map。

普通对象即使伪造 `{ rpcCode: "STATE_CONFLICT" }` 也不能被信任；实现必须校验受控异常身份并防御 hostile
Proxy/跨边界属性读取异常。客户端继续只按 `code` 分支，不解析 `msg`。

下发的非 INTERNAL message 必须是有界、可公开文本，禁止包含 SQL、Redis key、完整 payload、内部路径、种子或
私有状态；不能证明安全时发送稳定通用文案。客户端不解析 msg 并不能自动防止服务端泄漏。

以后领域错误类和错误码都在 feature 新文件中定义，不再修改 `core/errors.ts`。

### 6.6 可选的玩家 JSON 聚合适配器

如果预期还有多个挂机、家园或单人养成 feature，可以在第二优先级增加 `definePlayerAggregate` 或
`VersionedJsonAggregate`，统一处理：

- 内嵌 `schemaVersion` 解码与迁移；
- 领域 `stateVersion` 校验；
- 多个 user hash 字段的一次一致读取；
- 有界 operation receipt；
- 一次 UoW/Lua 提交；
- read projection 与 write materialization；
- 可重试 callback 外的随机材料准备。

领域只提供 decoder、migration、`advanceTo` 和 reducer。该适配器只覆盖“有界的 Redis 玩家 JSON 聚合”，
不抽象 MySQL、Room、outbox 或跨服事务。若短期只有 Underground Idle，一个严谨的领域实现优先于过度通用化。

## 7. 客户端改造

### 7.1 生成式 Feature Catalog

生成器根据 `feature.json` 生成静态 catalog。每个 feature 至少声明：

- 唯一 id；
- runtime 安装入口；
- 纯 route descriptor module、View metadata path、限定 id 和鉴权要求；
- Home 菜单贡献；
- 页面组和 `keep-mounted | reopen | fallback | discard` 恢复策略；
- 可选的**已登记** gameplay 入口；
- 依赖的 FGUI package 和动态资源 URL。

route 和 View id 建议采用 `<featureId>/<localId>` 形式，生成期检查碰撞。manifest 是小型纯数据，feature runtime、
route 和 View 继续懒加载，不能因为引入 catalog 就把所有 `cc`/FairyGUI 模块静态打进普通脚本依赖图。

catalog 中的 feature/route/menu/View descriptor 是生成期确定的不可变数据，runtime install 不再动态注册这些
条目。route 参数 validator 位于不依赖 `cc`/FairyGUI 的纯 descriptor module：Navigator 先校验 route id 和
可 JSON 化外壳，再加载该纯模块校验参数，最后才 activate feature runtime 和打开 View。每个 View 的手写 metadata
唯一真源固定为**与 View 同目录**的 `*.view.json` sidecar（feature 的落在
`apps/client/src/features/<id>/view/`，gameplay 的落在自己的 View 目录，见
[Non-intrusive-room.md](Non-intrusive-room.md) §9.3），具体路径由拥有它的 feature 或 gameplay manifest 声明；
根 `feature.json` 只引用这些路径，不复制内容。每条 View metadata 带 `owner` 字段，生成期检查同一 View 只被
一个 manifest 拥有。

### 7.2 通用 AppRuntime 与导航

建议一次性增加：

```text
apps/client/src/app/
├── AppRuntime.ts
├── bootstrap.ts
├── FeatureRegistry.ts
├── FeatureHost.ts
├── NavigationService.ts
├── SessionCoordinator.ts
├── LifecycleBus.ts
├── CocosLifecycleBridge.ts
├── RefreshCoordinator.ts
├── PendingOperationJournal.ts
├── FrameScheduler.ts
└── ports.ts
```

职责边界：

- `AppRuntime`：构造小型稳定 port 并管理整体 dispose，不做 feature 分支。它同时定义 **app generation**——
  构造时递增、dispose 时冻结，对应一次 Cocos scene owner 生命周期，替代今天 `view/pages.ts` 里的
  page lifecycle generation（后者今天与 session generation **分开**校验，二者不可互相推导）；
- `FeatureRegistry`：消费 generated catalog，解析 feature、route 和 Home contribution；
- `FeatureHost`：只拥有 feature module 的 app/session scope、安装状态和 dispose，不拥有当前 route。
  **停用由 route refcount 决定**：NavigationService 关闭该 feature 的最后一个 route 时通知 FeatureHost 进入
  `disposing`；session 结束与 app dispose 是强制释放点。`keep-mounted` 策略的 route 显式豁免 refcount 归零
  释放，并必须在 manifest 里声明其常驻代价；
- `NavigationService`：唯一拥有业务 route stack、route handle 和当前 authenticated base route；
- `SessionCoordinator`：**独家**派生并发布所有带 session generation 的高层事件；独占 Lobby join/rejoin、
  GetInfo、回登录和鉴权恢复；final-loss 的“每代一次”由它的 generation gate 保证；
- `LifecycleBus`：**只做无状态转发与订阅管理**——转发 transport 原样事件和宿主 hide/show，
  ⛔ 不持有 session generation、⛔ 不做任何派生；
- `RefreshCoordinator`：合并 foreground、reconnect、reopen 等并发原因，只刷新当前 authenticated base
  feature/session controller；
- `ports.ts`：只暴露 navigation、lobbyRpc、session、clock、route-scoped ticker、lifecycle、views、launch 等
  必要能力。

这不是通用 DI 容器。feature 不应得到原始 SDK Room、Redis key 或任意服务定位器，只取得完成自身行为所需的
最小 port。

`pages.ts` 可先保留为登录/公告等旧页面的兼容 façade，但最终只能纯转发到 Navigator/SessionCoordinator；现有
模块级 session owner、reconciler、return-to-login listener、authenticated continuation 和 `closeLobby()` 页面
数组必须迁走，不能让旧接线和新 Coordinator 同时拥有恢复真相。最终新增 feature 不再向 `pages.ts` 添加
`openXxx`。

迁移期的“两套并存”必须有可执行规则，⛔ 不能只写目标态：

- **(a)** 阶段 3 的**第一个提交**就让 SessionCoordinator 成为 return-to-login / session reconciler 的唯一
  注册方，`pages.ts` 在**同一提交**里删掉自己的注册调用，只保留纯转发的 `openLogin` / `openConfirm`；
  ⛔ 不允许出现「两边都注册、靠顺序取胜」的中间态。
- **(b)** 现有 `net/session.ts` 的那两个注册点是**单槽覆盖式**（后注册者静默替换，先注册者的 disposer 因
  handler 身份比对失败退化为 no-op）。迁移后必须改为**重复注册即 fail-fast**，或至少有一条断言测试证明整个
  启动链路里各只注册一次。

FeatureHost 至少需要 `unloaded/loading/active/disposing/failed` 状态；并发加载同一 feature 必须合流为同一个
Promise。descriptor 非法在 codegen 期 fail closed；runtime install 失败只回滚 controller、订阅和 scoped
provider，不修改不可变 catalog；View/FGUI 加载失败保持可重试。dispose 必须幂等并按依赖逆序执行。

`failed` 的两条出路要写死：**经显式用户意图（再次 launch）回到 `loading`**，每个 app generation 的自动/连续
重试次数有上限；超限后置为 `disabled(app-generation)`，直到下一个 app generation 才复位。

这两个状态必须连回 Home：**FeatureHost 的运行时可用性是 catalog 之外的可变叠加层**。§7.4 的 Home composer
在渲染时把 `disabled` / `failed` 叠加到不可变 contribution 上，显示为不可点击 + 可手动重试的入口，
⛔ **绝不允许显示一个必然失败的正常入口**。
NavigationService 的稳定 API 至少包括 `open/replace/back/close/closeGroup`：Navigator 管业务路由栈和页面组，
ViewMgr 只管 View mount/cache/input lease，不拥有业务 route。每次 route open 都返回带 signal/generation 的
ownership handle；close/replace 即使发生在 feature、package、View 或 setup 的任一 await 中，也必须取消并回滚。

ResultUnknown 不能只保存在 route Logic。增加 feature-session scoped `PendingOperationJournal`，保存
`clientReqId + route + 完整规范化原 payload + expectedStateVersion + 状态`。route 关闭只断开渲染订阅，不删除
未决操作；只有 applied、结果过期、明确人工放弃或 session ended 才清理，重开后仍复用原 ID。本方案至少保证
同一 app session 内恢复；若要跨进程重启，还需另行设计安全持久化、隐私和版本迁移，本文不作承诺。

journal 的四条硬约束：

1. **write-ahead**：条目必须**写在 send 之前**——先落 `clientReqId + route + 规范化 payload +
   expectedStateVersion + 状态=inflight`，再调用 send。⛔ 不允许在收到响应或 `onDrop` 时才补写：drop 落在
   send 与 journal 写入之间会**永久丢失** `clientReqId`。`onDrop` 只做状态迁移（inflight → unknown），
   ⛔ 不产生新条目。
2. **上限与溢出**：journal 有 `maxEntries` 与单条 `maxPayloadBytes`（超限只保留
   `clientReqId + route + hash + expectedStateVersion`，恢复时按领域收据查询而非本地重放）。达到
   `maxEntries` 时 ⛔ **不得淘汰任何未决条目**——必须 fail closed，拒绝发起新的 idempotent write 并提示用户
   先等待既有操作收敛。可淘汰的只有已 applied / 已放弃的**终态**条目。（淘汰最旧条目丢掉的正是
   `clientReqId`，会把 ResultUnknown 升级为永久未知。）
3. **重发必须字节等同**：重发只能原样发送 journal 中已存的那份规范化 payload，⛔ 不得在重发时重新规范化。
   客户端与服务端共用 shared 里的同一个 canonicalizer 参考实现（§6.2 所指的“仓库唯一参考实现”）并共享同一组
   golden vectors，否则同 ID 重发会被误判为 `OPERATION_CONFLICT`。canonicalizer 放 shared 满足铁律 4
   （纯 TypeScript + ES 标准库），但 **SHA-256 摘要仍只在服务端计算**——客户端不需要也不应计算 hash。
4. **账号边界**：journal 是 feature-session scoped。主动登出与任何 uid 变化都必须**同步清空整个 journal**，
   `clientReqId` ⛔ 不得跨 uid 复用。

静态依赖门禁必须证明 feature logic/route 不导入 `WebSocketClient` singleton、Colyseus Room、`cc` 或
FairyGUI；View 目录是引擎依赖例外。Ticker/FrameScheduler 由 route scope 注入，Logic 只消费 monotonic Clock，
close/session change 自动解绑，避免 feature 再修改 Main。

### 7.3 连接与宿主生命周期

`WebSocketClient` 一次性增加只读订阅接口，例如：

```ts
subscribeConnection(listener): () => void
```

事件至少包含：

- `joining`；
- `ready`；
- `dropped`；
- `reconnected`；
- `closed`。

新 `subscribeConnection` 必须**吸收** `net/session.ts` 现有的 `onAuthInvalid` / `onConnLost` / `onBattleLost`
（由 LifecycleBus 转发、SessionCoordinator 派生，`Main.ts` 改订新出口），⛔ **不得与旧 fanout 并存两份连接
真相**；§10 保护清单里的 `net/session.ts` 指的是**迁移完成后**的稳定态。

低层 transport event 只携带 connection/slot generation、单调 sequence 和关闭原因，不反向依赖 session。
SessionCoordinator 再派生带 session generation 的高层事件（LifecycleBus 只转发，见 §7.2），并区分主动关闭、
短暂 drop 和最终 leave：

- `dropped`：当前 feature 立即禁用写操作；在途写进入 ResultUnknown；
- `reconnected`：只在发送闸重新建立后发布，随后**固定按“先对账、后拉快照”的顺序**执行——先按
  `PendingOperationJournal` 对账未决 operation（走 §6.4 的查询路由确定 applied / pending / unknown），
  **再**由 RefreshCoordinator 拉权威快照。这与下文 `EVENT_SHOW` 路径**同序**。⛔ 不允许先拉快照：那会渲染
  尚未包含未决写结果的视图，中间帧闪烁并诱导用户重复提交；
- `closed` 使用判别联合 `voluntary | auth-invalid | final-loss`；只有 final-loss 可以重进，auth-invalid 直接清理
  session，voluntary 不触发导航。
  **`auth-invalid` 的凭证清除必须与事件派生同步发生**：transport 在发布 `closed{auth-invalid}` 之前先关闭
  发送闸，SessionCoordinator 在派生该事件的**同一个同步栈**里清 token/userId 并 bump session generation，
  两者之间 ⛔ **不得插入任何 await**；订阅者只能观察到已经无凭证的状态。（这正是现有
  `net/session.ts` 先 `clearSession()` 再遍历订阅者的语义，迁移时必须原样保留。）
  journal 的处置也在此分叉：`auth-invalid` 视为 session ended，**必须清空 journal**（新会话无权查询旧 uid 的
  operation）；`final-loss` **保留** journal 并在重进成功后对账。⚠ 同 uid 重新登录**不恢复**上一 session 的
  journal；
- feature 不得自行调用 join/rejoin；
- SDK 离线发送队列继续保持禁用，不能借生命周期接口恢复不受控重放。

`onDrop` 的顺序固定为“关闭发送闸 → 在途**写**结算为 ResultUnknown、在途**只读**按可重试失败结算 →
清理 SDK 队列 → 发布 `dropped`”；`reconnected` 只能在发送闸恢复后发布。onLeave、replay guard 失败和 join 后物理死亡都必须汇入一个 generation-gated final-loss 出口，
每代只发布一次；强踢 close code/push 要先规约成 auth-invalid，绝不能触发重连。订阅接口还要提供当前不可变状态
snapshot，或在订阅时立即回放，确保 Lobby 已 ready 后才加载的 feature 不会永远错过 ready。

最终断线由 SessionCoordinator 重进并对账，成功后保留或恢复原 authenticated base route，失败才清空
authenticated history 并回 Login。临时 popup 默认 `discard`，只有显式声明且参数可重建时才 reopen。普通 popup
不是 refresh owner；它通过父 route ownership 关联到底层 feature controller。

**回登录 transition 必须包含用户可见提示**，⛔ 不能静默把人踢回登录页。固定次序是：关闭发送闸 → leave →
清空 authenticated route/页面组 → 打开并 **await** 一个 **session 作用域**（不是 route 作用域）的提示视图 →
重开 Login。该提示不属于任何 feature route，**不受 `discard` 策略影响**，也不是 refresh owner；它的关闭或
超时都必须让 transition 继续，⛔ 不得卡死。回登录原因 → 文案的映射由 SessionCoordinator 拥有（继承现有
`view/pages.ts` 里 AUTH_INVALID 子因 / CONN_LOST / BATTLE_LOST / BATTLE_JOIN_FAILED 的分支），feature 不参与。
每一步 await 之后都要重校验 app generation + session generation。

foreground、reconnect 和 route reopen 同时发生时，RefreshCoordinator 只合流**当前并发 flight**，key 包含
**app generation**、route-handle generation、session generation 和 connection/recovery epoch；flight settle
后允许下一次正常刷新。非活跃 feature 不得后台请求快照。

“flight 中再次变脏时最多补一次 trailing refresh”有三处语义留白，必须写死：

1. **dirty 位只能在实际发出请求的那一刻清除**——提前清会让本次 flight 冒领之后的变更，延后清会抹掉窗口内的
   变更，两者都是丢更新。
2. **“最多一次 trailing”是按 flight 计且递归的**：每个 flight（trailing 自身也算一个 flight）settle 时若
   dirty 仍置位，必须再排一次刷新；⛔ 不允许理解为「每个 dirty 周期至多一次」。
3. **刷新失败（超时、drop、错误）必须把 dirty 位重新置位**，由下一次 ready / foreground 触发重试；
   ⛔ 不允许静默丢弃——配合「非活跃 feature 不得后台请求快照」，静默丢弃会让该 feature 永久停在陈旧快照上。

另需**背压**：同一 key 的连续刷新有最小间隔与失败指数退避；退避期内的变脏只置 dirty、不新开 flight；
退避上限内仍失败则把该 feature 标记为 stale 并显示可手动重试的占位，⛔ 不得静默空转。

`Main.ts` 最终只负责 bootstrap、update 转发和 dispose，但现有启动不变量必须迁入 host 而不是删除。
⚠ **“都有回归测试”不准确**——逐条核实后，当前保护形态如下，迁移前必须按“迁移后形态”一列补齐：

| 启动不变量 | 当前保护形态 | 迁移后必须的形态 |
| --- | --- | --- |
| WeChat compat 早于首次 Colyseus 操作 | **无任何测试**（客户端测试里查不到该函数） | 迁移**之前**先补一条 bootstrap 顺序断言 |
| 750×1624 + `FIXED_WIDTH` | 对 `Main.ts` **源文本**的正则 pin | 对新 host 的行为断言 |
| portal / server 配置 | 只有对 `initPortal` 自身的行为测试，**没有**断言证明 host 在打开页面之前调用了 `initHttp/initPortal` | 补一条“先初始化后开页面”的顺序断言 |
| gameplay tick 转发 | 对 `Main.ts` **源文本**的正则 pin | 对新 host 的行为断言 |
| scene owner 销毁顺序 | 只 pin 了「存在 dispose 调用」，**没有 pin 顺序** | 升级为对 `AppRuntime.dispose` 的顺序行为断言 |

⛔ 这些源文本 pin 必须与掏空 `Main.ts` 的提交**同批**改写，不允许先删后补。

Cocos `EVENT_HIDE/EVENT_SHOW` 通过独立 bridge 进入 LifecycleBus：hide 只暂停本地 ticker、
禁止新意图，不把已发送写判失败，也不删除 PendingOperationJournal；show 时若 Lobby 未 ready 只标 dirty，ready 后
先恢复未决 operation，再刷新 snapshot。所有异步仍使用 route signal + session generation 双守卫。

### 7.4 Home 改为数据驱动入口

一次性把 Home 的单一 `btn_enter` 改为玩法入口列表或稳定 slot：

- 菜单数据来自 FeatureRegistry；
- 每个 contribution 声明稳定排序字段、标题文本或可用 LocalizePort 的 key、图标和 launch target；
- ballMove 也迁成 built-in contribution，不能保留 Home→Main 专属回调；
- 点击只调用统一 `LaunchPort.launch(target)`，不在 Home 分支 Navigation/gameplay；
- Idle 使用独立 FGUI 包，后续新增入口不再修改 Home XML。

gameplay 的**实现**仍走 GameRoom 动线（见 [Non-intrusive-room.md](Non-intrusive-room.md)），但它的 Home 入口
以**同一形状**的 menu contribution 登记——**菜单只有一个数据源**。排序固定为
`slot → order → featureId → entryId`。

⚠ 实施时必须明确写出：新玩法登记入口时**是否会碰** `features/built-in/feature.json`。若会碰，则
`Non-intrusive-room.md` §3.1 第 8 条与 §16 的「不再因玩法名修改中央清单」必须相应保留那条例外（该文已登记）；
若不会碰（contribution 的手写真源在玩法自己的 manifest 里），则那条例外可以删除。⛔ 不能默认它是零成本。

若图标来自跨包资源，manifest 必须声明 URL，由生成器计算 entry package dependency；Home route composer 在
render 前通过受控 package loader 按当前可见 entry 合流加载。**失败时显示明确占位**——占位有两种触发因素：
图标包加载失败，以及 §7.2 所说的 feature 已 `disabled` / `failed`。⛔ 不允许静默空白，也不允许显示一个必然
失败的正常入口。不得让 View 临时猜测或隐式加载包。

### 7.5 View/FGUI 注册表生成

`viewRegistry.ts` 和 `fguiContracts.ts` 一次性改为稳定 façade，消费 generated registry。唯一输入是 FGUI XML +
`.view.json` 手写 metadata（sidecar 与 View 同目录，见 §7.1）；同一生成步骤分别产生 View AUTO、generated
contract 和 registry，派生的 View AUTO 不能反过来成为 contract 真源。

> **客户端 View catalog / FGUI contract / FGUI 包闭包全仓只有一个 writer、一个输出文件、一套双向闭合测试。**
> 最终文件固定为本节的 `apps/client/src/generated/views.generated.ts` + `fguiContracts.generated.ts`；
> [Non-intrusive-room.md](Non-intrusive-room.md) 的 `codegen:gameplays` 只产出 gameplay 的 View contribution
> 中间产物，⛔ 不直接写客户端 View 产物（口径见该文 §4.1 表 1）。每条 View metadata 带 `owner` 字段
> （feature id 或 gameplay id），生成期检查同一 View 只被一个 manifest 拥有。
> **谁先落地谁拥有生成器与产物路径**，后落地方只新增输入类型与 `owner` 取值，⛔ 不得二次改写
> `viewRegistry` / `fguiContracts`；若 room 侧先落地，本文阶段 4 接管并在实施记录里注明接管点。

生成器负责：

- 从 XML 和同一 binding 规则产生 direct `required`；
- 生成 `defineView` 元数据和静态动态 import；
- 计算 FairyGUI package 传递依赖闭包；
- 把显式 `assetUrls` 所属包加入闭包；
- 校验 route composer/module/export 和 route→view 引用，以及 feature logic 目录的引擎依赖边界；
- 检查重复 qualified View id 和非法路径。package/component 允许通过显式 `aliasOf` 做迁移期兼容，除此之外
  重复引用必须失败。

仍需在 feature view metadata 中显式声明：

- layer、fullscreen、onlyOne、permanent、interactive；
- 无命名前缀的手写绑定；
- nested、list item、controller、relation 等业务依赖子集；
- 动态拼接或代码直接引用的资源 URL。

`fgui-codegen` 应支持 feature 输出目录，并且只写 View AUTO 区；完成后可以提示或运行 `npm run verify:features`
`--check`，但不得覆盖 registry/contracts，也不得自动执行 FGUI manifest `--write`。它不再要求开发者手改
`fguiContracts.ts` 和 `viewRegistry.ts`。generated view
manifest 给出精确源码路径，`fgui-manifest.mjs`、view registry test 和 contract test 统一消费它，不再各自扫描
目录猜测。现有 FGUI manifest 继续检查全局设计源/导出物闭包与新鲜度；per-view 预加载闭包仍由 View contract
测试负责，两者不能混为同一能力。

## 8. 生成器、测试与治理

### 8.1 `--write` 与 `--check` 分离

feature 生成器必须提供两种明确模式（writer `npm run codegen:features` / 只读闸 `npm run verify:features`）：

```text
--write  确定性刷新生成物
--check  只读重算并比较；有差异返回非零，不修改工作区
```

`--check` 不得创建目录、修改 mtime、运行 sync、重钉协议指纹或接受 FGUI 资源锁；CI/`verify:*` 只能调用只读
检查。`--write` 也只能覆盖文档列出的普通 generated output，不得修改 feature 业务源码、plan、SQL、package
或手写文档。协议与 FGUI 审计锁继续使用独立的显式接受动作。

生成器必须：

- 稳定排序，保证相同输入得到字节级相同输出；
- 用真实 JSON Schema 校验 manifest，`additionalProperties: false`，同时检查 schema version、必填字段、类型和
  路径形状；
- 拒绝重复 feature/domain/route/error/push/View/capability id；
- 按规范化大小写检查 id/path 冲突，文件系统发现顺序不得影响输出；
- 拒绝路径越出仓库、符号链接逃逸和不允许的扩展名；
- 拒绝跨 feature 依赖环；
- 拒绝 manifest 中 module reference 携带扩展名；源码 import 边界由独立 TypeScript/AST 门禁检查；
- 提供只读 `--root` fixture seam，便于在临时根测试而不触碰真实 checkout；
- `--check` 对 stale、missing 和不应存在的 extra generated output 都失败，并点名输入与目标；
- 先在内存完成全部校验，再逐文件通过临时文件原子替换；多输出无法成为一次文件系统原子事务，进程中断后的
  不完整集合必须由下一次 `--check` 全部发现；
- 生成文件带“禁止手改”和来源说明。

生成检查还必须双向验证所有权：manifest 引用的 domain/runtime/route/View/vector/art 必须存在；feature-owned 根下
存在的这些文件也必须被唯一 manifest 拥有，防止删除 manifest 后留下未引用源码和资源。普通 `--write` 不得
静默接受整个 feature 消失，删除必须使用显式 `--allow-delete <id>`、tombstone 或等价的基线批准。

codegen 不直接 import/执行 TypeScript descriptor。RPC descriptor 限定为可静态读取的 builder + object/string
literal 形态，生成器用 TypeScript compiler API 读取 domain、route、mode、error 和 module reference；computed
property、spread 或顶层副作用形态直接拒绝。validator 函数本身仍由生成 registry 在 typecheck/contract test 中
加载并验证。这样生成阶段既不依赖 tsx 副作用，也不复制一份 JSON 路由真源。

**生成器必须有确定的命令名**（全文其余位置一律引用它，⛔ 不再写“feature codegen”这类无法执行的代称）。
本文取 writer `npm run codegen:features`、只读闸 `npm run verify:features`。

新增根命令后，需要一次性接入现有四重守门：根 `package.json`、`scripts/verify-toolchain.mjs`、
`apps/client/test/toolchainContract.test.ts` 的承重钉（**仅当该命令被挂进 typecheck / verify:sync /
verify:core / verify:all 之一时**才必须同步钉）、`docs/inventory.json` 的验证依赖，同时更新根 `README.md` 与
`AGENTS.md` / `CLAUDE.md`（`verify-inventory` 对这三份常用命令表与根 scripts 做双向相等断言，AGENTS/CLAUDE
另需逐字一致）。还要有删除聚合命令的反例，证明 feature gate 不会静默退出 `verify:core`。之后普通 feature
只运行既有命令，不再新增专属根命令。

> 若最终决定**不**新增根命令（沿用 `codegen:state` / `codegen:http` 那样的 workspace 脚本 + 测试 freshness
> 形态），则上面这段改为：「本生成器不新增根命令，freshness 由 X 测试断言随 `verify:all` 生效；⛔ 只有真的
> 新增根命令时才需要接入四重守门。」两种形态二选一，实施前必须选定。

建议提交版产物的 provenance 固定如下：

| 产物 | 真源 | Writer | 只读检查 | 性质 |
| --- | --- | --- | --- | --- |
| `apps/shared/src/features.generated.ts` | feature manifest | `npm run codegen:features` | `npm run verify:features` | 普通机械生成 |
| `apps/shared/src/protocol/lobbyRpc/registry.generated.ts` | feature manifest + RPC domain descriptor AST | `npm run codegen:features` | `npm run verify:features` + contract test | 普通机械生成 |
| `apps/shared/src/logic/features.generated.ts` | manifest 中的 shared public modules | `npm run codegen:features` | `npm run verify:features` | 普通机械生成 |
| `apps/client/src/generated/features.generated.ts` | feature manifest | `npm run codegen:features` | `npm run verify:features` | 普通机械生成 |
| `apps/client/src/generated/routes.generated.ts` | route descriptor references | `npm run codegen:features` | `npm run verify:features` + route test | 普通机械生成 |
| `apps/client/src/generated/views.generated.ts` | `.view.json` + FGUI XML | `npm run codegen:features` | `npm run verify:features` + FGUI contract test | 普通机械生成 |
| `apps/client/src/generated/fguiContracts.generated.ts` | `.view.json` + FGUI XML | `npm run codegen:features` | `npm run verify:features` + FGUI contract test | 普通机械生成 |
| `apps/client/src/generated/fguiPackages.generated.ts` | art 引用图 + View/entry asset URLs | `npm run codegen:features` | `npm run verify:features` + FGUI contract test | 普通机械生成 |
| `apps/client/src/features/**/view/*View.ts` 的 AUTO 区 | FGUI XML + binding 规则 | `fgui-codegen` | AUTO freshness test | 局部机械生成 |
| `docs/features.generated.md` | feature manifest | `npm run codegen:features` | `npm run verify:features` | 普通机械生成 |
| `scripts/protocol.fingerprint` | shared protocol 真源 + 协议版本 | protocol fingerprint writer | fingerprint test | 显式协议审计锁 |
| `scripts/fgui.manifest.json` | art、FGUI 导出物和 View AUTO 区 | FGUI manifest writer | `verify:fgui` | 显式资源审计锁 |
| 保护路径规则（如 `scripts/protected-paths.json`） | 人工评审 | 人工（提交中显式声明） | 无侵入矩阵测试 | 显式治理锁 |
| `apps/client/src/shared/**` | `apps/shared/src/**` | `sync:shared` | `verify:sync` | 生成镜像 |
| `apps/Cocos/assets/src/**` | `apps/client/src/**` | `sync:client` | `verify:sync` | 生成镜像 |

### 8.2 测试向量由 feature 持有

⚠ 先厘清现状：当前只有中央 **request** 向量表（服务端契约测试里的 `validPayloads`，12 条）；**response 侧
只有 shared 的运行时 validator**（发送前调用），**没有任何测试向量**。因此本方案要求 sidecar 同时提供
request 与 response 最小合法向量时，存量 12 条路由的 **response 向量是新增工作，不是迁移**——⛔ 也不要据此
去删 shared 的 response validator，那是运行时闸，与测试向量是两回事。

现有的中央 request 表改为按 sidecar 发现，例如：

```text
apps/server/test/lobbyRpcVectors/idle.ts
```

该目录为拟新增路径，当前不存在；`test/` 已整体在服务端 tsconfig include 内，新建后常规 typecheck 即覆盖它。不得把 vectors 放进
shared/runtime descriptor 或同步到 Cocos。

每个 route 至少提供一个最小合法 request 和 response；sidecar 缺失、重复/未知 route、错误 export shape 都要
失败。通用测试自动验证：

1. route、endpoint、request vector、response vector 四个集合双向相等；
2. 所有合法向量通过 shared validator；
3. request 与 response 分别增加未知字段后都被拒绝；
4. `idempotent-write` 去掉 `clientReqId` 后被拒绝；
5. 编译期负例证明 `query` 即使含原操作 ID 也不会进入 `LobbyRpcIdemType`；
6. endpoint 无法覆盖本地 schema/mode/idem，故意添加这些字段时类型或生成检查失败；
7. malformed response 既不发送，也不写入 done cache；
8. generated manifest 保持新鲜。

NaN、版本冲突、远征未完成、满仓和奖励 exactly-once 等领域反例继续放在 feature 自己的测试中；生成器不尝试
从 validator 自动反演全部坏样例。

View 测试不再假设 `apps/client/src/view/<Name>View.ts` 顶层结构，而是遍历 generated manifest，继续验证：

- route composer/module/export 存在，feature logic 目录不导入引擎；
- AUTO 区块与 XML 同步；
- registry contract 与生成 contract 相同；
- package 依赖闭包完整；
- 代码中的 `ui://` URL 不越出允许包集合。

### 8.3 inventory 与文档索引

`docs/inventory.json` 保留框架和 core 基座，verifier 合并 `features/*/feature.json` 中的 capability fragment：

- 普通 feature fragment **只能**声明 `extra`，禁止修改 `defaultModules`、`defaultScene`、`routeOfTruth` 和
  `workspaceCommandScope`；
- category 为 `extra` 的 fragment **必须**在 `docs` 中包含 `docs/EXTRAFEATURES.md`；`core` 则**必须不含**
  （现有 verifier 已双向断言）；
- 声明了独立 `launch` 的能力**只能是 `extra`**，且 `launch` 必须能实际启动其 `defaultEntry`（verifier 另校验
  命令与入口的对应关系）；
- 晋升 core、改变默认入口或修改项目边界仍需显式修改中央 inventory 和计划；
- manifest 只记录 `planned/registered/source-present/enabled` 等结构状态，不使用 `implemented/verified` 冒充
  测试实跑或人工验收；
- 生成 `docs/features.generated.md` 作为能力索引，根文档只链接该索引，不在多处复制状态。

一次性迁移后，`EXTRAFEATURES.md` 保留额外能力的政策、边界和生成索引入口；具体 extra 条目由 manifest +
generated index 成为机器发现真相，verifier 不再要求人工在 `EXTRAFEATURES.md` 逐项复制。verification fragment
只能引用能实际发现该 feature 的固定聚合命令，防止登记一个存在但不覆盖 feature 的脚本而假绿。

⛔ 生成器不能自动写**当前计划文件**（写作时为 plan-v4.md）的验收结果。实跑证据、开放问题和“已完成”判断仍由
人工维护。实施时以 `docs/inventory.json` 的 `routeOfTruth.corePlan` 为准，而不是本文写死的文件名；并补一条
反例：把任一 `plan-*.md` 加进 writer 的允许输出集合后，生成器自检必须红。

### 8.4 协议身份与指纹

当前单一 `PROTOCOL_VERSION` 同时服务 Lobby 与 GameRoom，仓库级 fingerprint 又是对全部 protocol 原始字节的
审计锁，不适合作为运行时语义兼容身份。建议一次性明确拆分：

- `GAME_ROOM_PROTOCOL_VERSION` 与 `LOBBY_PROTOCOL_VERSION` 都是人工判定的兼容整数；
- GameRoom/Lobby join 分别只比较自己的版本；
- HTTP health 同时报告两类身份；
- 保留一个覆盖 `apps/shared/src/protocol/**` 原始字节的仓库级 fingerprint 审计锁，generated registry 若位于该
  目录也由该锁覆盖；
- `protocol-fingerprint.mjs` 改为互斥的显式 `--check/--write`，无隐式 writer；CI 只使用 `--check`；
- `--write` 只接受当前字节指纹，不自动 bump 任一兼容版本。

仓库级 fingerprint 对原始字节敏感，注释、排序和 generated registry 变化都可能改变它；它证明“协议目录经过
显式接受”，不证明这些变化在语义上不兼容。运行时 join 兼容只看对应的人工版本整数，二者职责不能混用。

不得为了追求无侵入而取消协议锁，也不得让 `--check` 自动重钉。若未来多个 feature 分支频繁冲突，再基于真实
冲突数据考虑按 domain/package 分片指纹；初期继续保留一个确定性的全局锁更简单。

> **本节是两份方案对协议身份的唯一口径。** [Non-intrusive-room.md](Non-intrusive-room.md) §5.3 的
> “framework protocol version”**就是**这里的 `GAME_ROOM_PROTOCOL_VERSION`，不是第三个整数；该文的 per-mode
> `modeVersion` 是第三层，由 `codegen:gameplays` 单独产出 digest、单独校验，⛔ **不进
> `protocol-fingerprint.mjs`**——仓库级字节锁保持唯一。两份方案若分别落地，以先落地者建立的常量为准。
>
> ⚠ 实施硬约束：`protocol-fingerprint.mjs` 的版本解析要求 `apps/shared/src/protocol/rooms.ts` **有且仅有
> 一个**顶层 `export const PROTOCOL_VERSION = <整数>;`，任何改名或拆分都会先 throw；锁文件当前是单行
> `v<version> <hash>`，改为两个整数后的新行格式必须在实施前定死，并同批更新
> `apps/client/test/protocolFingerprint.test.ts` 与版本矩阵测试。

### 8.5 同步与资源产物

正常新增 feature 后，机械变化必须来自 8.1 的唯一 provenance 表。路径分类可概括为：

```text
apps/shared/src/features.generated.ts
apps/shared/src/protocol/lobbyRpc/registry.generated.ts
apps/shared/src/logic/features.generated.ts
apps/client/src/generated/**
apps/client/src/shared/**
apps/Cocos/assets/src/**
scripts/protocol.fingerprint
scripts/fgui.manifest.json
apps/Cocos/assets/resources/ui/<该 feature 声明的新包>/**
该 feature 新资源对应的 .meta
```

codegen/sync 产物禁止手改；FGUI 二进制和图集由 FairyGUI 编辑器导出，再通过 manifest 接受和校验。整个
`resources/ui/**` 不是无条件白名单：普通 feature 只能新增自己声明的 package/output，修改或删除既有公共包仍是
真实侵入。

机械 diff 白名单必须有限且可机检：普通 generated text 可由 writer 覆盖；协议/FGUI lock 只能显式接受；镜像
只能由 sync 写入；新资源可以新增 `.meta`，但既有 `.meta` UUID 改变不能被归类为普通机械变化。白名单外的
既有文件出现修改、删除或重命名时，必须按真实框架侵入处理。

⚠ **手工场景 / 预制体资产不在白名单内。** `apps/Cocos/assets/scene.scene` 里序列化着 `Main` 的
`@property`（`serverUrl` / `portalUrl` / `gameplayId`）；把这些属性搬到 bootstrap 组件会改变组件序列化形状，
必须在 Creator 编辑器中重新序列化并**人工审查**该 diff，⛔ 只能由编辑器产生。（若 `Main` 保留这些
`@property` 并只转发给 `AppRuntime`，则不触发该 diff。）`gameplayId` 这个编辑器字段在 Home 数据驱动化之后
应被删除，删除本身同样会改变序列化形状。

## 9. 一次性侵入范围

下面是实施本方案时预期需要修改的既有文件。它们是为了消除今后的重复侵入，而不是每个 feature 都要修改。

| 层 | 一次性修改的主要现有位置 | 目的 |
| --- | --- | --- |
| Shared | `protocol/lobbyRpc/index.ts`、`envelope.ts`、`push.ts`、现有 user/mail/shop/guild 契约、`logic/index.ts` | 迁移为 domain descriptor + generated registry |
| 协议身份 | `protocol/rooms.ts`、Lobby/Game join validator、health 类型、协议指纹脚本与测试 | 分离 Lobby 与 GameRoom 协议身份 |
| Server RPC | `websocket/rpc.ts`、`dispatcher.ts`、`loader.ts`、现有 endpoint | metadata 驱动 schema、响应校验和执行模式 |
| Server idem | `core/idem.ts`、`core/infra/redisScripts.ts`、必要的 key/config | payload hash、唯一 lease、CAS 和 inspect |
| Server errors | `core/errors.ts` 及现有异常子类 | 自描述错误，移除领域中央映射 |
| Client host | `Main.ts`、`view/pages.ts`、`net/WebSocketClient.ts`、`net/session.ts` | 通用 feature、导航、会话和生命周期接缝 |
| Home | `HomeView.ts`、`HomeLogic.ts`、Home FGUI XML 与导出物 | 固定按钮改为数据驱动 feature menu |
| View/FGUI | `viewRegistry.ts`、`fguiContracts.ts`、`defineView.ts`、必要的 `ViewMgr.ts`、FGUI codegen/manifest | 生成静态 registry 与契约 |
| Tests | RPC contract/wire/idem 测试、View/FGUI 测试、相关生命周期测试 | 中央穷尽表改为 manifest/vector 遍历 |
| Governance | 根 `package.json`、工具链检查、inventory verifier、README、AGENTS/CLAUDE、OVERVIEW/CLIENT/SERVER、保护路径规则文件与无侵入矩阵测试 | 登记一次性命令、新开发动线与可机检的保护集合 |
| 场景资产 | `apps/Cocos/assets/scene.scene`（及其 `.meta`） | `Main` 的 `@property` 搬家时由 Creator 重新序列化并人工审查；⛔ 不属于机械 diff |

`scripts/fault-matrix.config.json` 是**人工审阅的中央故障矩阵登记**：新增普通 feature 只有在需要把自己的
故障点纳入矩阵时才动它；届时按“显式框架登记项”评审，**不计入“只新增文件”的承诺**，并在保护规则的
provenance 白名单里单列说明它是人工项。⛔ 不建议把它改成 generated 产物。

若分阶段实施，可通过 compatibility manifest 暂时指向现有 Login、Home、Confirm 等旧路径；不要求一次提交把所有
页面搬目录。但在完成现有功能迁移和双向集合测试之前，不能对外承诺“后续 feature 只新增文件”。

## 10. 改造后的 Underground Idle 文件形态

完成框架改造后，Underground Idle 的人工源码应只新增在自己的边界内：

```text
features/underground-idle/
└── feature.json

apps/shared/src/protocol/lobbyRpc/domains/idle.ts
apps/shared/src/logic/undergroundIdle/**

apps/server/src/websocket/idle/*.ts
apps/server/src/core/idle/**

apps/client/src/features/undergroundIdle/
├── index.ts
├── logic/**
├── net/**
├── routes/**
└── view/
    ├── *.view.json
    └── *View.ts

apps/art/fairygui/assets/<Idle独立包>/**

apps/server/test/idle*.test.ts
apps/server/test/int/idle*.test.ts
apps/server/test/lobbyRpcVectors/idle.ts
apps/client/test/undergroundIdle*.test.ts
```

推荐开发动线：

```text
1. 新增 feature.json、shared domain、RPC vectors、server/client 源码和 View metadata
2. FairyGUI 编辑并真实导出；fgui-codegen 生成 View AUTO 区
3. 运行 npm run codegen:features -- --write，审查普通 generated registry diff
4. 显式运行 protocol fingerprint --write 与 fgui manifest --write，审查两类 lock diff
5. 运行 npm run sync:shared（当前已包含 client→Cocos 同步，不再重复运行 sync:client）
6. 打开 Cocos Creator 一次，为 sync 新产生的 apps/Cocos/assets/src/** 文件与新目录生成 .meta，
   与源码同批提交（⚠ sync-client --check 的 .meta 断言只遍历 git ls-files：本地未 add 时不会红，
   提交或 CI 上必红——这一步不能省）
7. 运行 npm run verify:features、protocol/FGUI/sync/inventory check、typecheck 和 RPC/客户端/服务端测试
8. Creator 本地预览真实资源与生命周期
9. 分类审查手写 feature diff、generated diff、lock diff、资源 diff 和镜像 diff
```

在这条动线中，不应再修改：

```text
apps/shared/src/protocol/lobbyRpc/index.ts
apps/shared/src/protocol/lobbyRpc/envelope.ts
apps/shared/src/protocol/lobbyRpc/push.ts
apps/server/src/websocket/rpc.ts
apps/server/src/websocket/dispatcher.ts
apps/server/src/core/idem.ts
apps/server/src/core/errors.ts
apps/client/src/Main.ts
apps/client/src/view/pages.ts
apps/client/src/view/viewRegistry.ts
apps/client/src/view/fguiContracts.ts
apps/client/src/view/defineView.ts
apps/client/src/view/ViewMgr.ts
apps/client/src/view/HomeView.ts
apps/client/src/logic/page/HomeLogic.ts
apps/client/src/net/WebSocketClient.ts
apps/client/src/net/session.ts
apps/client/src/app/**
```

如果实现一个普通 feature 仍需手改其中任何文件，应视为框架扩展点缺失，先判断是本方案遗漏，还是该需求本质上
改变了全局框架语义。

正式实现时应把上述保护集合变成一份 canonical protected-path 规则文件（如 `scripts/protected-paths.json`）并由
无侵入矩阵机检；本文列表只解释边界，⛔ 不能成为随后悄悄漂移的第二真源。该规则文件已进 §8.1 的 provenance
表与 §9 的 Governance 行；矩阵必须把散文清单与规则文件做**双向比对**，两者不一致时红。
（先例：仓内 `verify-inventory` 已经在做「解析 Markdown 表 → 与 `package.json` 双向 deepEqual」。）

⚠ **适用范围**：本清单约束的是**普通 feature 的新增动线**（见本节首句“在这条动线中”）。
[Non-intrusive-room.md](Non-intrusive-room.md) 的框架阶段按 §12.3 属于**显式框架侵入**，不适用本清单；
实时 Room 玩法的对应约束见该文 §4.1 与 §11.5。若两份方案都落地，规则文件只有一份（§4.1 表 1 末行）。

## 11. 分阶段实施计划

### 11.0 阶段总表：风险、外部依赖与可回退性

| 阶段 | 风险等级与理由 | 外部依赖 | 可回退性 |
| --- | --- | --- | --- |
| 0 冻结口径与基线 | 低——只产出 manifest schema、基线记录与生成器 fixture | 无 | 可回退 |
| 1 RPC descriptor 与向量发现 | 中——机械迁移，但要同时保持 12 条存量路由行为不变并新增 response 向量 | 无 | 可回退 |
| 2 幂等 v2 与错误自描述 | 高——改 Redis 记录结构，**升级期是单向门** | 本地 Redis（`test:int` + 故障矩阵） | **单向门**：需 drain 窗口（≥ `IDEM_RESULT_MS + IDEM_PENDING_MS`）；回退同样需要一次 drain |
| 3 客户端 FeatureHost 与生命周期 | **最高**——12 个新模块 + `pages.ts` 状态机迁移；`Main.ts` 的源文本 pin 必须与掏空同批改写 | 无（Node 侧），但 Creator 预览是必要的人工证据 | 可回退，但迁移期 ⛔ 不允许「新旧都注册」的中间态，回退必须整批 |
| 4 Home 与 View/FGUI 生成登记 | 高——与 [Non-intrusive-room.md](Non-intrusive-room.md) 的 View catalog 有 owner 之争（§4.1 表 1） | FairyGUI 编辑器真实导出、Cocos Creator 预览 | 可回退；若 room 侧已先落地生成器，本阶段是**接管**而非新建 |
| 5 inventory、文档索引与协议身份 | 中——协议身份拆分会动指纹锁文件格式与版本矩阵测试 | 无 | 可回退（需同批回滚锁文件格式） |

> 阶段 3 是本方案的最重风险项，`pages.ts` 的状态机迁移尤其如此——迁移期两套恢复真相并存会产生难以复现的
> 缺陷。§7.2 的「(a)/(b) 两条可执行规则」正是为此写的，⛔ 不要跳过。

### 阶段 0：冻结口径与基线

工作：

- 确定“人工侵入/生成侵入/镜像变化”的分类；
- 固定 feature manifest v1 schema；
- 记录现有 RPC、错误码、push、View、Home 和测试全集；
- 为生成器建立 isolated fixture 和 `--check` 反例测试。

退出条件：同一输入字节级稳定；重复 id、路径越界和陈旧生成物均有判别力明确的失败测试。

### 阶段 1：RPC descriptor 与测试向量发现

工作：

- 建立 shared domain builder 和 registry codegen；
- 迁移 user/mail/shop/guild；
- `defineRpc` 改为 metadata 驱动；
- 中央 fixture 改为 feature/domain vector loader；
- 保留 endpoint loader 的全集校验。

本阶段还需为**存量 12 条路由补 response 向量**（见 §8.2：response 侧今天只有运行时 validator、没有测试向量）。
⚠ `clientReqId` 的字符集收紧属 **wire 收紧**，⛔ 不进本阶段——本阶段的口径是“行为不变”。

退出条件：现有 route、validator、endpoint 和行为不变；添加一个 fixture domain 只新增领域/endpoint/vector，
不修改人工中央源码。

### 阶段 2：幂等 v2 与错误自描述

工作：

- 引入 canonical payload hash、唯一 lease 和 CAS；
- 增加 operation inspect；
- 引入 `RpcFault` 和生成错误码 whitelist；
- 更新单测与 Redis 集成故障矩阵；
- 逐条审计现有 updateProfile/mail/shop/guild 写路由，决定 natural/idempotent 分类及 durable 兜底；
- 默认制定 drain/维护窗口升级 SOP；只有逐路由证明后才允许混部。

退出条件补三条：Lua 写入路径的 TTL 由集成测试断言（写入后 `PTTL` 落在预期区间），跨过期窗口的双 acquisition
用例同时断言 TTL 与 `leaseId`；`done-oversize` 墓碑既不重跑 handler 也不返回 `unknown`；每 uid pending 上限
超限返回 `BUSY`。

退出条件：同 lease/cache 窗口内相同 ID/相同 payload 不并发执行且缓存命中不重执行；相同 ID/不同 payload
稳定冲突；有 durable receipt/UNIQUE 的领域只产生一次权威转换；旧 lease 无法覆盖/释放新 lease；corrupt done
不重跑 handler；receipt/generic done/tombstone/pending/unknown、complete 失败后的 durable replay 和升级 SOP 均有
测试或运行证据。

### 阶段 3：客户端 FeatureHost 与生命周期

工作：

- 新增 AppRuntime、FeatureRegistry、Navigation、SessionCoordinator 和 LifecycleBus；
- WebSocketClient 暴露只读连接状态；
- Main 收敛为 bootstrap/update/dispose；
- 登录恢复不再固定打开 Home；
- foreground/reconnect/reopen 由 RefreshCoordinator 合并。

退出条件补三条：`Main.ts` / `pages.ts` 的**源文本 pin 已全部改写为对新 host 的行为断言，且改写与掏空 Main
在同一次提交**，⛔ 不允许先删后补；WeChat compat 的 bootstrap 顺序断言在迁移**之前**已补上；`auth-invalid`
事件发布后的**同一 tick 内** `getToken()` 已为空，且此后任何 feature 发起的 HTTP/RPC 都不携带旧 Bearer
（有反例测试）。

退出条件：fixture feature 在页面关闭、加载中取消、drop/reconnect、强踢、最终 leave、回前台和 session
generation 变化时均不会让旧响应回写；late subscriber 能立即读取连接状态；foreground+reconnect+reopen 只
合流当前 flight，下一次 foreground 仍能刷新；PendingOperationJournal 在 route close/reopen 后复用原 ID；app
destroy 后 connection/session/route/ticker 订阅归零；静态门禁证明 feature 无法直接访问原始 Lobby Room 或自行
重连，所有同步/异步 listener 异常都被观察。

### 阶段 4：Home 与 View/FGUI 生成登记

工作：

- Home 改为 feature menu，ballMove 迁入 contribution；
- view/contract/package registry 生成化；
- fgui-codegen 支持 feature 目录；
- View/FGUI 测试改为遍历 manifest。

退出条件：新增 fixture View/入口只新增 manifest、View metadata、composer/Logic 和 art；Home、registry、
contracts 无人工 diff；迁移期 alias 不产生重复所有权；Creator 中动态加载、取消回滚、输入租约和跨包资源正常。

### 阶段 5：inventory、文档索引与协议身份

工作：

- inventory 合并 feature fragment；
- 生成 feature 能力索引；
- 分离 Lobby/GameRoom 协议身份；
- 更新标准开发动线和工具链聚合命令。

退出条件：普通 extra feature 不修改中央 inventory；协议变更未接受时 check 失败；生成索引不冒充人工计划和验收
证据。

## 12. 最终效果

### 12.1 开发体验变化

| 维度 | 改造前 | 改造后 |
| --- | --- | --- |
| RPC 接入 | 领域文件 + 中央 export/map/validator/错误码 + endpoint schema | 领域 descriptor + endpoint；中央 registry 自动生成 |
| 幂等 | endpoint 手工 `idem:true`，短缓存不绑定 payload | route metadata 自动驱动，payload 绑定、唯一 lease；显式组可查询 |
| 错误 | 领域异常修改中央 `ERR_MAP` | 领域 `RpcFault` + 生成 whitelist |
| 客户端导航 | `pages.ts`/Main/Home 手工接线 | feature route/menu contribution + 通用 host |
| 断线/回前台 | feature 需要触碰网络或页面组合根 | 订阅统一 lifecycle，由 RefreshCoordinator 拉快照 |
| View | 手改 registry + contracts | manifest/XML/codegen 生成静态注册表 |
| 测试 | 修改中央穷尽 fixture | feature 新增自己的向量，通用测试遍历全集 |
| 能力清单 | 修改中央 inventory 和多份状态文档 | extra feature fragment + 生成索引；core 晋升仍人工 |
| 分支冲突 | 集中在多个中央文件 | 主要发生在 feature 自己目录；中央只有稳定生成 diff |

### 12.2 最终验收清单

框架只有在以下条件全部满足后，才能宣称支持本方案中的“非侵入式 feature”：

> **口径同 [Non-intrusive-room.md](Non-intrusive-room.md) §15**：机检项必须给出「判定方式」与「变异验证」
> （改哪一行 / 删哪个断言 → 哪条用例转红）。⛔ 机检项给不出变异验证的不得作为验收项。人工项写「人工证据」
> 并留存截图/录屏、设备与版本、日期、操作者、对应 commit。

| 验收项 | 判定方式 | 变异验证 |
| --- | --- | --- |
| 新增完整 fixture feature 时，既有人工源码零修改 | 无侵入矩阵（见下） | 让 fixture 必须手改一处中央源码 → 矩阵转红 |
| 只有 feature 新文件、generated registry、指纹、FGUI 产物和镜像发生变化 | 无侵入矩阵的 diff 分类器 | 往既有文件里加一行 → 分类器转红 |
| manifest 仍存在时，缺任一 descriptor、endpoint、vector、View metadata 或 composer 必然失败 | `npm run verify:features` | 逐个删除这五类引用 → 各转红一条 |
| 删除整个 feature 只能通过显式允许的删除流程 | `npm run verify:features` | 直接删目录后跑 writer → 必须拒绝而不是静默删生成物 |
| route mode 不再由字段结构推断 | 编译期负例 | 让 `LobbyRpcIdemType` 改回结构推断 → 负例转红 |
| 相同 ID 不同 payload 在 handler 前被拒绝 | 服务端幂等用例 | 去掉 payload hash 比较 → 转红 |
| `clientReqId` 的字符集/长度积木拒绝含 `:`、`{`、换行、超长与非 ASCII 的值 | shared 契约向量 | 换回通用 `requiredId` → 转红 |
| pending/done/done-oversize/unknown 与 durable receipt 的优先级有故障测试 | `test:int` + 故障矩阵 | 把 `done-oversize` 归类为 `unknown` → 转红 |
| 新 feature 仅声明 `inspectsOperationGroup: "idle"` 而未 `dependsOn`、也未获 idle 侧 expose 时，`verify:features` 必须失败 | `npm run verify:features` | 去掉 group 所有权校验 → 该反例转绿（即门禁失效） |
| drop/reconnect/foreground/close 后不会发生旧 View 回写或 SDK 队列重放 | 客户端生命周期用例 | 去掉 generation 守卫 → 转红 |
| `auth-invalid` 事件发布后的**同一 tick 内** `getToken()` 已为空，此后任何请求不携带旧 Bearer | 客户端用例 | 在清 token 与发布事件之间插入一个 await → 转红 |
| app dispose 后 connection/session/route/ticker/lifecycle 订阅计数**归零**，`PendingOperationJournal` 与 FeatureHost 实例全部释放 | 客户端 dispose 用例（计数断言） | 漏掉任一 disposer → 计数不归零，转红 |
| 反复 open/close 同一 feature route N 轮后，订阅数、ViewMgr 缓存条目和 uncached handle 回到基线 | 客户端用例 | 让 route close 不解绑订阅 → 转红 |
| Home 新入口不需要修改 Home 源码或 XML | 无侵入矩阵 | 让新入口必须改 Home XML → 转红 |
| 抬头状态行与 `docs/inventory.json` 的 `routeOfTruth` 指向一致 | `npm run verify:inventory` | 把抬头指向已降级的归档 → 转红 |
| §10 的散文保护清单与 canonical 规则文件**双向比对**一致 | 无侵入矩阵 | 从规则文件里删掉 `pages.ts` → 矩阵因散文清单对不上而转红 |
| `verify:all`、feature generator/vector gate、相关 server integration/fault 测试和同步检查全部通过 | 上述命令 | 不适用（聚合项） |
| FGUI 新包仍通过真实编辑器导出和 Creator 预览 | **人工证据** | 不适用（人工项） |

还应增加一条端到端“无侵入扩展矩阵”：在临时 checkout 中记录保护文件 hash，加入并 stage/intent-to-add 一个
带合成 FGUI 导出物的最小 `smoke-lobby-feature`；先证明全部 `--check` 因 stale/missing output 与 lock 失败，再运行
writer、显式 lock accept 和 sync，最后证明全部 check 通过。分类器断言人工文件只出现 feature-owned `A`，既有
`M` 只命中 provenance 白名单且没有 `D/R` 或既有 `.meta` UUID 变化；第二次 writer/sync 后第一次 patch 的字节/
hash 不再变化。FGUI 编辑器/Creator 的真实导出与预览另做专项验收，Node fixture 不冒充编辑器。

⚠ 镜像 TS 的 `.meta` **无法由 Node fixture 合成**——矩阵会显式 stage/intent-to-add，那恰好把文件变成已跟踪，
从而触发 `sync-client --check` 的 `.meta` 断言。矩阵要么另造合成 `.meta` 并说明 uuid 来源，要么**显式声明
本矩阵跳过 `sync-client --check` 的 `.meta` 段**、由单独的 Creator 人工验收项覆盖。⛔ 不能假装这一段被覆盖了。

删除 fixture 是第二个独立阶段，允许该 feature 自有文件和镜像出现预期 `D`，但必须通过显式删除授权，并确认
generated registry、Home entry、View、FGUI package/output、未引用源码和镜像均无残留。

### 12.3 仍然应当侵入框架的情况

以下需求本质上改变全局行为，不应为了形式上的无侵入而伪装成普通 feature：

- 修改 RPC 信封、通用错误语义或幂等算法；
- 修改鉴权、连接恢复、限流、网关预算或默认导航策略；
- 新增 npm 依赖、根命令或运行时环境要求；
- 修改玩家根 schema、SQL schema、跨存储事务或 outbox 语义；
- 修改 GameRoom 通用 C2S 消息、state root 或对局生命周期；
- 改变默认启用 feature、核心项目边界或生产承诺；
- 修改 FGUI 公共基础包的稳定组件契约。

这些改动仍应显式修改对应框架文件、文档和验收证据。非侵入式架构的目的，是消除重复登记和无关冲突，
不是绕过必要的全局评审。

## 13. 推荐决策

建议按以下优先级实施：

1. **最高优先级**：RPC domain descriptor、显式 route mode、生成 registry、feature-owned vectors。
2. **最高优先级**：幂等 payload 绑定、唯一 lease/CAS、operation inspect、自描述错误。
3. **高优先级**：客户端 FeatureHost、统一导航/会话/连接/前后台生命周期、数据驱动 Home。
4. **高优先级**：View/FGUI 生成登记和递归 manifest 测试。
5. **中优先级**：inventory fragment、生成文档索引、Lobby/GameRoom 协议身份拆分。
6. **按需求决定**：通用玩家 JSON 聚合适配器和分片协议/FGUI 锁。

不建议为了一个玩法先建设运行时插件系统、完整 DI 容器、跨端热加载或通用 schema 编译器。先消除已经被
Underground Idle 明确触发的人工登记点，并用一个最小 fixture feature 证明“只新增文件”的验收条件，再开始
完整玩法实现。
