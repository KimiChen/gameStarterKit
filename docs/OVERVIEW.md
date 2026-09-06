# 技术总览

> 本文只描述 gono 在**开发阶段**提供的代码结构、契约和本地验证方式；完整范围见
> [根 README](../README.md#项目边界)，非核心参考实现见
> [额外功能与参考实现](EXTRAS.md)。

## 1. 定位

gono 是客户端、服务端和 shared 共同演进的 TypeScript 游戏开发骨架：

- Cocos Creator 工程负责编辑器、场景和资源。
- `apps/client` 负责客户端游戏代码。
- `apps/server` 负责 Colyseus 房间、RPC 和示例数据逻辑。
- `apps/shared` 负责两端共同使用的协议、错误码、公式和常量。
- `apps/art` 负责 FairyGUI 设计源。
- 外部身份服务只通过锁定的 HTTP 契约参与本地示例链路。

当前 `snake`（Snake Off 竖版贪吃蛇：drop-in 自由加入 + 服务端权威 + AI 填充）是默认演示玩法；
`ballMove` 保留为可选入口与内部回归样例，`idle` 是复用真实房间 transport/lifecycle、但使用
独立 `IdleRoomState` 与 pulse 结算规则的最小第二 mode 证明。它不包含完整 UI；框架的可复用部分是目录
边界、同步工具、契约、网络接缝、视图组织和服务端一致性原语。

## 2. 目录与源码真相

| 路径 | 角色 | 修改方式 |
| --- | --- | --- |
| `apps/shared/src` | shared 源码真相 | 直接修改后运行 `sync:shared` |
| `apps/client/src` | 客户端源码真相 | 直接修改后运行 `sync:client` |
| `apps/client/src/shared` | shared 的客户端镜像 | 禁止手改 |
| `apps/Cocos/assets/src` | client 的 Cocos 镜像 | 禁止手改 |
| `apps/Cocos/assets/resources` | Cocos 本地资源 | 由编辑器或资源工具生成 |
| `apps/art/fairygui` | FairyGUI 设计源 | 在 FairyGUI 编辑器中修改并导出 |
| `apps/server/src` | 服务端源码 | 按目录登记点扩展 |

两级同步链：

```text
apps/shared/src
  → apps/client/src/shared
  → apps/Cocos/assets/src/shared

apps/client/src
  → apps/Cocos/assets/src
```

同步脚本检查漂移、孤儿、`.meta` 和异常大批删除。镜像存在的目的，是让纯 TypeScript 代码可无头
验证，同时让 Cocos 工程持有稳定 UUID。

## 3. 设计原则

### 3.1 单一真源

- 消息名、请求/响应类型、状态镜像、错误码和公式进入 shared。
- 服务端与客户端从 shared import，不复制字符串或接口。
- 外部身份 HTTP 类型来自锁定的 `@gono/webplatform-contract` 生成物。
- Colyseus state 的 mode→root、字段和值域只修改 `apps/shared/schema/gameplays/<id>/`（manifest.json +
  state.json）；玩法房内消息只修改该玩法手写的 `apps/shared/src/gameplays/<id>/wire.ts`
  （defineC2S/defineS2C token：消息名、payload validator、phases、rateCost）。`codegen:gameplays`
  同时产出 shared per-mode interface/validator 与 catalog、wire catalog（`C2S`/`S2C` 等公共名的全集
  聚合 + owner/phases/rateCost 表）、服务端 Schema 构造器映射和客户端 catalog。生成物落在
  `apps/shared/src/gameplays/`，不进协议指纹目录；per-mode 契约身份由 catalog 的
  contractDigest（= sha256(manifest + state + wire.ts)）+ manifest.modeVersion 承担。
- Lobby RPC 面与页面/入口登记也是单源生成：各域 descriptor 在
  `apps/shared/src/protocol/lobbyRpc/domains/<domain>.ts`（core 错误码与推送在 `coreErrors.ts`），
  plugin/View/路由/Home 入口的手写真源是 `apps/plugins/<id>/plugin.json` + View 同目录
  `<Name>View.view.json` sidecar + FGUI XML。`npm --workspace @game/server run codegen:plugins`
  据此生成 `lobbyRpc/registry.generated.ts`、客户端
  `generated/{views,fguiContracts,plugins}.generated.ts` 与 `docs/plugins.generated.md`；
  `lobbyRpc/index.ts`、`envelope.ts`、`push.ts` 与客户端 `view/viewRegistry.ts`、
  `view/fguiContracts.ts`、`view/pages.ts` 均为稳定 façade，普通 plugin ⛔ 不再手改
  （保护集合的机检真源是 `scripts/protected-paths.json`，随 `test:client` 的无侵入矩阵校验）。

### 3.2 约束可执行

| 约束 | 本地检查 |
| --- | --- |
| shared/client/Cocos 镜像一致 | `npm run verify:sync` |
| shared 零依赖与客户端 Logic 纯净 | `npm run typecheck`、相关单测 |
| bitECS 源码保持锁定 | `npm run verify:ecs` |
| 项目身份、生成区和第三方来源登记 | `npm run verify:project` |
| 客户端源码/测试 strict 类型探针（Node/ES2022 桩） | `npm run typecheck:client` |
| 客户端 ES2017 运行时下限探针（Creator legacy 配置） | `npm run typecheck:client:legacy` |
| 工具链版本与聚合命令图 | `npm run verify:core` 首闸（`scripts/verify-toolchain.mjs`） |
| FGUI 设计源、导出物和 registry/codegen 契约 | `npm run verify:fgui`、`npm run test:fgui` |
| 受保护手写路径未被静默改动 | `npm run verify:protected-paths` |
| 能力清单与默认入口登记 | `npm run verify:inventory`、`npm run test:inventory` |
| 门禁判定 vs 真实行为矩阵（启动器 / npm 引用 / 聚合链 / 同步镜像 / 运行时） | `npm run test:launcher-matrix` 等 5 个 `test:*-matrix` |
| 服务端路由、协议与一致性规则 | `npm --workspace @game/server run test` |
| 客户端无头行为、wire 与生命周期 | `npm run test:client` |
| vendored runtime 内容与文件集合锁 | `npm run verify:vendor`、`npm run test:vendor` |
| 客户端性能基线（结构门禁） | `npm run verify:perf` |
| 定向故障矩阵 fail-closed | `npm run test:faults`（集成组 `test:faults:int`） |
| 外部身份契约版本与生成物一致 | `npm run verify:webplatform-contract` |

`npm run verify:core` / `verify:all` 是上述检查的聚合入口，改动合入前至少应通过 `verify:core`。

这些命令是本地开发验证入口，不表示所有真实边界都已覆盖。客户端 `typecheck:client` 通过
`apps/client/tsconfig.test.json` 和最小引擎桩严格编译全部 `src/**/*.ts` 与 `test/**/*.ts`；
`typecheck:client:legacy` 再以 `apps/client/tsconfig.json` 的 ES2017 lib 和本地引擎桩递归检查全部
`src/**/*.ts`（包括 Main、View 和 gameplay），防止现代 API 越过运行时下限。Creator 真实引擎类型、资源
导入和完整 View 生命周期仍需编辑器预览。
`test:fgui` 侧重 codegen/registry 行为，
设计源到已导出 `.bin` 的新鲜度由 `verify:fgui` 的 manifest 检查与 `fgui-roundtrip` 的产物往返自检；
已知边界见 [plan-v5.md](../plan-v5.md)。

### 3.3 视图与行为分离

客户端分成：

- `view/`：允许依赖 `cc` 和 `fairygui-cc`，只做节点绑定、事件转发和数据搬运。
- `app/`：AppRuntime 宿主与横切协调件（NavigationService、SessionCoordinator、PluginHost、
  RefreshCoordinator、loginFlow 等）；`Main.ts` 只保留 @property 与转发。
- `gameplay/`：每个玩法一个 `modes/<id>/index.ts` 模块（导出 `createGameplayModule(services)`：
  validateLaunch + joiner + createPlugin），由生成的 `catalog.generated.ts` 静态聚合登记；
  `services.ts` 是稳定服务注入面，`catalog.ts` 是废弃零状态 façade。
- `logic/`：不依赖引擎/UI，承载页面行为和玩法规则，便于无头测试。
- `net/`：房间、RPC 和 HTTP 的传输适配。
- `core/`：HTTP 底座、生成的本地开发配置和宿主环境兼容桥。
- `generated/`：`codegen:plugins` 的 View/契约/plugin 注册表产物，禁手改。
- `view/ViewMgr.ts`：页面加载、分层、缓存和交互输入生命周期。

新增页面通过 `.view.json` sidecar + `apps/plugins/<id>/plugin.json` 登记，经 `codegen:plugins`
进入生成 catalog，打开走 plugin route / NavigationService；不向通用入口堆静态 import
（`ViewMgr.open` 只允许 view/ 内部或动态 import 闭包调用）。

### 3.4 数据正确性优先

服务端代码以这些不变量为目标：

- MySQL 与 Redis 的权威边界明确。
- 同一用户写入串行化，并使用 lock/fence 防止过期持有者提交。
- 可重试写入使用稳定幂等 ID。
- 跨存储修改使用 outbox/补偿接缝，避免裸双写。
- Redis key 与 MySQL 查询显式携带区上下文。
- 大规模同步计算不放在网关 handler 中。

这些是开发实现应保持的不变量，不是对当前所有路径已经完成证明的声明。完成状态、剩余缺口和保留边界
统一以 [plan-v5.md](../plan-v5.md) 为准（保留边界的原始记录在历史归档 [plan-v3.md](../plan-v3.md)）。异构第二玩法现由生成的 mode→root 契约、玩法专属结算和客户端
state adapter 约束；`ballMove@1` 的服务端内部 v3 evidence 已按 seed/fixed-step/有序事件重算初末状态与
participants；热档/冷档 schema 迁移、asset effect 原子性与经济操作的跨区回读也已按对应条目收口。

## 4. 标准开发动线

### 4.1 双端功能

```text
1. 在 apps/shared/src 定义协议、错误码或公式
2. npm run sync:shared
3. 若改动落在 apps/shared/src/protocol/**，运行 node scripts/protocol-fingerprint.mjs --write 重钉
   协议指纹（--check 只读比对，CI/审计用，⛔ 无隐式重钉；不重钉则 npm run test:client 中的
   protocolFingerprint 测试失败），并确认是否需要人工 bump 对应的协议身份整数——
   GAME_ROOM_PROTOCOL_VERSION 管 join 信封与 core wire 兼容（Game join 只比较它）、
   LOBBY_PROTOCOL_VERSION 管 Lobby RPC 面（Lobby join 只比较它）；指纹只做字节审计锁，
   ⛔ 不参与运行时 join 判定。指纹脚本对每个常量都只接受 `rooms.ts` 中唯一的顶层 export
   声明，并会忽略注释，避免文档示例中的旧版本误导版本闸。
4. 若改动落在 apps/shared/schema/gameplays/<id>/（manifest.json / state.json）或玩法手写的
   apps/shared/src/gameplays/<id>/wire.ts，运行
   npm --workspace @game/server run codegen:gameplays 重新生成 apps/shared/src/gameplays/
   （catalog/index/generated，含 wire catalog）、
   apps/server/src/rooms/schema/GameRoomState.ts 与 schema/generated/、
   apps/client/src/gameplay/catalog.generated.ts（都是生成物，禁手改；契约 digest 变化必须同批
   bump 该 mode 的 manifest.modeVersion），再重新 sync:shared
5. 在 apps/server/src/websocket 或 http 增加 endpoint。新增 Lobby RPC 时先在
   apps/shared/src/protocol/lobbyRpc/domains/<domain>.ts 声明 descriptor，运行
   npm --workspace @game/server run codegen:plugins 刷新 lobbyRpc/registry.generated.ts，
   endpoint 只写 defineRpc(type, { handler })；新增 http endpoint 后运行
   npm --workspace @game/server run codegen:http 重新生成 apps/server/src/http/manifest.generated.ts
6. 更新服务端登记点、key/config 与测试
7. 在 apps/client/src/logic 增加行为
8. 需要页面时经 npm run codegen:fgui 生成 View AUTO 区，写 <Name>View.view.json sidecar 并登记进
   apps/plugins/<id>/plugin.json（路由/入口同表），再运行
   npm --workspace @game/server run codegen:plugins 刷新生成注册表
   （viewRegistry/fguiContracts/pages 是稳定 façade，⛔ 不手改）
9. npm run sync:client
10. 运行本地类型检查和相关测试
```

### 4.2 新玩法

```text
shared 登记 canonical mode id + 新建 apps/shared/schema/gameplays/<id>/{manifest.json,state.json}
  → 玩法自带消息时：手写 apps/shared/src/gameplays/<id>/wire.ts，用 defineC2S/defineS2C 声明
    消息名、payload validator、允许 phases 与 rateCost（准入随 token 声明走，⛔ 不改任何中央表）
  → npm --workspace @game/server run codegen:gameplays 生成 mode→root constructor / validator 映射、
    三端 catalog 与 wire catalog（C2S/S2C 全集聚合 + owner/phases/rateCost 表）
  → server modes/<id>/index.ts（导出 register<Constant>GameMode）：mode 的 commands（typed handler map，
    键 = 本玩法 wire token）消费消息；⛔ 不改 GameRoom——它只有一个 catch-all dispatcher，按 wire catalog
    分发；⛔ 也不改 modes/catalog.ts——它是 codegen:gameplays 生成的 modes/catalog.generated.ts 的稳定 façade
  → client logic/rooms/<mode> + net/rooms/<Mode>Room.ts
  → client mode adapter 注入 raw exact validator / reconcile
  → client gameplay/modes/<id>/index.ts 导出 createGameplayModule(services)（装配层：
    validateLaunch + joiner + createPlugin；presentation 用字面量动态 import），再跑一次
    codegen:gameplays 让双端 catalog.generated.ts 同批收录（客户端 GAMEPLAY_MODULES + 服务端
    registerGeneratedGameModes；两个 catalog.ts 都是 façade，⛔ 不手改）
  → sync:shared / sync:client + 双端 mode/lifecycle 测试
```

`GameplayRegistry` 让 factory 与 mode-owned joiner 同属一个 registration；`RoomController` 只接管一次启动的
精确 room capability。服务端 `GameRoom` 按已验证的 `mode` 延迟创建对应 `GameMode`，并在首次 handshake 前
从生成映射选择且冻结 root；撮合同时按 `sId` 和 `mode` 隔离。客户端 `RoomClient` 不假定 root shape，状态
raw exact validator 与重连 reconcile 由玩法 adapter 注入；校验先看 reflected Schema 的真实 wire shape，
不先白名单重建状态。玩法只取得不含原始 SDK room/send 的 typed facade；只有真实 `ROOM_STATE` 校验通过才
开放发送，SDK 离线队列不能绕过该闸。客户端新增玩法通过登记点扩展，不在通用 transport 中增加玩法分支；
服务端玩法自带新消息时，**不再修改通用 `apps/server/src/rooms/GameRoom.ts`**：消息由该玩法自己的
`apps/shared/src/gameplays/<id>/wire.ts` 声明（defineC2S/defineS2C token：消息名、validator、phases、
rateCost），`codegen:gameplays` 把它聚合进 wire catalog（`C2S`/`S2C` 等公共名以同名继续从 shared 导出），
GameRoom 只注册一个 catch-all（键 `"_"`；⚠ Colyseus 0.17 在 `Room.__init()` 里消费 `this.messages` 并
delete 该键，所以它必须是实例字段初始化器、⛔ 不得共享模块级常量，也 ⛔ 不得再注册任何具名 handler
——分派具名优先，残留具名注册就是绕过预算/exact validate/owner/phase 全部 gate 的暗道）。dispatcher
按 wire catalog 做 owner 独占分发：core 消息（Ping/Chat）归 shell，玩法消息交当前 mode 的 `commands`
typed handler map（键 = 本玩法 wire token 的消息名，建实例时校验）；phase 白名单随 token 声明走，
通用 shell 不再认识任何具体玩法的消息名。

### 4.3 FairyGUI 页面

```text
FairyGUI 编辑设计源
  → 导出 .bin 与图集到 Cocos resources
  → codegen View AUTO 区块
  → 编写 Logic 和手写绑定区
  → 本地契约测试与 Creator 预览
```

### 4.4 外部身份契约

```text
更新精确锁定的契约依赖
  → npm run sync:webplatform-contract
  → 检查生成物 diff
  → 更新本仓 HTTP 消费代码和本地测试
```

外部契约的生成和服务实现不属于本仓。

## 5. Colyseus 0.17 约定

- 客户端使用 `@colyseus/sdk` UMD 全局 `Colyseus`，不得 import 服务端包。
- 服务端使用 Colyseus 0.17 与 `moduleResolution: Bundler`。
- 两端 Colyseus major.minor 保持一致。
- Room 用于状态同步；Lobby websocket endpoint 用于显式 RPC。
- 客户端连接复用必须同时核对 endpoint、区号、token 和完整 join options。
- 相对 import 不带 `.ts` / `.js` 扩展名。

`@colyseus/sdk` 是通用游戏网络库。

## 6. 开发边界速查

1. bitECS 锁定目录不修改。
2. shared/client/Cocos 生成镜像不手改。
3. shared 不依赖 Node、DOM、引擎或宿主平台对象。
4. 消息、类型、公式和错误码来自 shared。
5. View/Logic 保持分层。
6. FairyGUI 只通过动态 import 进入页面打开链。
7. 服务端写路径遵守 lock/fence/idempotency/outbox 约束。
8. 外部身份服务只通过 HTTP 契约消费，不导入业务源码。

## 7. 当前状态

- 本仓包含用于本地验证的 Lobby、GameRoom、ballMove、技能结算、页面和数据读写示例。
- 通用 private-room 能力（profile `"private"`：六位邀请码租约 + access ticket + owner-ready 开局
  事务；客户端 matchmaking strategy 与 `PrivateRoomService`）已落地，由 fixture gameplay
  `privateFixture` 驱动测试；生产玩法当前只声明 `"default"`（auto + matchmaking），
  `PrivateRoomLobby` 页面视觉属 FGUI 编辑器待办（见 [plan-v5.md](../plan-v5.md)）。
- 本地开发账号通过外部服务的 dev session 契约创建。
- Unity 目录只是研究占位。
- 所有演示 endpoint、配置和页面只用于开发与验证。
- `apps/shared/src/logic` 的体力（stamina）、自然日（time）与命名 RNG 子流（`SeededRandom.stream`）当前
  只有单测覆盖，没有服务端或客户端调用点；被实际消费的是 logic 中的 math 工具与技能表/伤害公式，以及
  constants 中的 join 错误码工具。
- 核心改进状态以 [plan-v5.md](../plan-v5.md) 为准；可选模块的准确状态见
  [额外功能与参考实现](EXTRAS.md)。
- 完整项目边界以根 README 为准。
