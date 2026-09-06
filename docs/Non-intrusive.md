# 非侵入式框架改造方案

> 状态：**框架侧已实施**——§9 的阶段 0–9 全部落地（commit `37ed8b2`…`5fa943b`，逐阶段 commit、
> 测试数字与变异锚点回写在已删除的历史归档 `plan-v4.md`「Non-intrusive 阶段 0–9 实施证据」一节，见 Git 历史）。
> 阶段 10：snakeoff 首版**已实现**并成为默认入口 `snake`（V2 无尽专项与养成阶段的状态见
> [Snake 玩法文档](../apps/plugins/snake/README.md) 与 plan-v5 C1）；undergroundIdle 按既定范围**未实现**。阶段 11 的默认入口
> 切换已随 snake 落地，`ballMove` 退为可选入口。FGUI 编辑器 / Creator / 真机侧的遗留待办（Home GList 视觉、
> PrivateRoomLobby 包与视图、Creator 预览人工证据、合成 `.meta` 确认）见 plan-v4.md 同节。
>
> 后续说明（2026-09）：snakeoff 房型方向已改为**自由加入（drop-in）**——StartPolicy 第三变体已实施，语义与验收见 [SERVER.md「StartPolicy 三变体」](SERVER.md)与已删除的 `plan-v4.md` 对应轮次登记（见 Git 历史）；本文正文不改。
>
> ⚠ 正文写于实施前：各节对「现状」的描述是**写作时快照**（§2.2 脚注已声明快照性质），实施后的
> 架构现状以 [技术总览](OVERVIEW.md)、[服务端开发](SERVER.md)、[客户端开发](CLIENT.md) 为准；
> 保护集合的机检真源已按 §8.5 落地为 `scripts/protected-paths.json`（checker =
> `apps/client/test/protectedPaths.test.ts` 无侵入矩阵）。
>
> 本文说明为了让后续玩法尽量以“只新增玩法文件”的方式接入，框架本身需要进行哪些一次性改造。它不改变
> [当前开放问题、实施状态与验收证据的唯一真相](plan-v5.md)。
> 历史归档 `plan-v4.md` / `plan-v3.md` / `plan-v2.md` / `plan.md` 四份已于 2026-09-06 删除，正文在 Git 历史。
>
> 本文覆盖**两类扩展实体**（边界见 §3.1，⛔ 不得互相冒充）：
>
> - **plugin** —— 已登录 Lobby 页面型能力，不进 GameRoom。直接需求来源是
>   [《Underground Idle》策划案](undergroundIdle/README.md)。
> - **gameplay module** —— 实时 Room 玩法，运行在 GameRoom 内。直接需求来源是
>   Snake 玩法（⚠ 原「开房/邀请码房间」提案已废弃；素材授权台账见
>   [Snake 玩法文档 §2](../apps/plugins/snake/README.md)）。
>
> 两个策划案目录只负责各自的产品规则、数值与表现，**通用框架以本文为唯一技术基线**。两类实体的改造共享
> 生成器、协议身份、View/FGUI 登记与保护路径等基础设施，因此放在同一份文档、同一条时间线里推进（§9）
> ——⛔ 分开描述会让共享部分漂移。

## 1. 结论与改造口径

本次改造的目标不是让新增玩法在 Git 中“一个旧文件都不变化”，而是达到以下更有价值、也可验证的结果：

> **新增普通玩法时，不再手改既有人工维护的框架或业务源码；开发者只新增该玩法拥有的契约、服务端、
> 客户端、资源和测试文件。中央注册表、协议指纹、FGUI 清单和同步镜像可以产生确定性的机械变更。**

这是当前技术栈下“无侵入”的合理上限。Cocos Creator 需要在构建期看到**可静态分析、specifier 为字面量的
动态 import**，shared 需要同时给 TypeScript、Node 和 Cocos 提供确定的类型全集，协议与 FGUI 还需要提交版
锁文件。因此，至少会有生成注册表、指纹和镜像变化；消除这些变化反而会削弱静态类型、启动期 fail-fast 和
审查可见性。普通脚本仍禁止静态 import 具体 View/FairyGUI 模块。

本文首先承诺的是“新增已登录 Lobby 页面型 plugin”的扩展边界。它不自动覆盖实时 Room 玩法、新增 GameRoom
C2S 消息、公共 FGUI 基础包改造或全局数据模型变化；这些仍属于有意的框架修改。

改造后的理想开发边界是：

```text
一次性修改框架
  → 建立 plugin 描述符、生成注册表和通用运行时接缝
  → 迁移现有 user/mail/shop/guild、页面和 ballMove 入口
  → 验证生成物与现有行为一致

以后新增玩法
  → 只新增 plugin/domain/endpoint/view/logic/test/art
  → 运行 codegen、FGUI 导出与 sync
  → 只审查玩法源码 + 确定性生成 diff
```

本次不应直接在现有 `GameRoom`、`RoomClient` 和 `pages.ts` 中继续增加 Snake 分支。应先把当前“部分插件化”
升级为**编译期玩法模块系统**，再以 Snake 作为验收该系统的第一个完整房间玩法。

改造后的目标是：

> **新增普通实时玩法时，开发者只新增该玩法拥有的 manifest、wire、state、服务端 mode、客户端模块、View、
> 资源和测试；不再手改 `GameRoom.ts`、`RoomClient.ts`、`Main.ts`、`pages.ts` 及中央消息/页面清单。已有文件只
> 允许出现确定性的 codegen、协议指纹、资源清单和同步镜像差异。**

“一个旧文件都没有 Git diff”并不是合理目标。Cocos Creator、TypeScript 和 Node 都需要构建期可见的静态
模块全集，shared 协议还需要可审查的版本与指纹。因此应消除的是**人工维护的中央分支和重复登记**，而不是
隐藏必要的生成变化。


### 1.1 房间玩法侧的确定口径

- 房间容量上限是 4；当前仓库的 `MAX_PLAYERS` 已经是 4，不需要把全局常量“改成 4”。
- 不要求等满 4 人。房内当前玩家全部 Ready（包括房主）后，只能由房主显式点击 Start。
- 最少开局人数**已经**是玩法配置：`GameMode.roster.min`（plan-v4 条目 4 阶段一已落地）。Snake 只需声明自己的
  值；本文建议默认 2 人，若产品允许房主单人演示就把 Snake 的 `roster.min` 改为 1，不修改框架。
- Start 成功后锁房并关闭邀请码，Playing 中不允许中途加入。
- 六位数字码是用户可见的房间定位码，不替代 Colyseus 的内部 `roomId`，也不是身份凭证。
- Snake 成为新的开房间演示入口。迁移期先保留 ballMove 作为隐藏回归 mode，稳定后再单独决定是否删除。
- 当前客户端设计基线已经是竖版：`designSpec.ts` 的 750×1624，配合 `Main.ts:52` 的
  `ResolutionPolicy.FIXED_WIDTH`。要改的是 Snake 的玩法布局、相机和输入，不是再次翻转整个项目的设计方向。


### 1.2 改动分类

| 分类 | 含义 | 后续新增普通玩法时是否允许 |
| --- | --- | --- |
| 人工侵入 | 手改既有框架或其他玩法拥有的源码、测试、页面或清单 | 不允许 |
| 新增式改动 | 在新玩法目录增加由该玩法拥有的文件 | 允许，目标形态 |
| 生成侵入 | codegen 刷新静态 catalog、类型聚合、版本摘要或锁文件 | 允许，必须确定且可检查 |
| 镜像变化 | `sync:shared` / `sync:client` 刷新客户端与 Cocos 镜像 | 允许，禁止手改 |
| 框架变化 | 改认证、生命周期、公共 wire、生成器或运行时机制 | 需要显式设计和评审 |


## 2. 为什么必须先改框架


### 2.1 Lobby 侧：扩展点仍是多个人工全集

现有框架已经具备目录分层、endpoint 自动扫描、动态 View 加载和双端 shared 契约，但普通 Lobby 玩法仍需跨越
多个中央登记点：

| 位置 | 当前扩展动作 | 带来的问题 |
| --- | --- | --- |
| `apps/shared/src/protocol/lobbyRpc/index.ts` | 手工增加 export、`LobbyRpcMap`、路由全集和 req/res validator | 同一领域分散登记；漏一处才在后续测试或启动时发现 |
| `apps/shared/src/protocol/lobbyRpc/envelope.ts` | 手工扩展全局错误码数组 | 领域错误与框架错误耦合，多个 plugin 分支容易冲突 |
| `apps/shared/src/protocol/lobbyRpc/push.ts` | 手工扩展 push 常量、Map、switch validator | 第二阶段新增唤醒推送仍会修改中央文件 |
| `apps/shared/src/logic/index.ts` | 手工 re-export 新纯逻辑 | 玩法代码虽然是新增文件，公共入口仍要人工侵入 |
| `apps/server/src/websocket/rpc.ts` | endpoint 重复声明 schema 和 `idem: true` | shared 已有语义仍需服务端再次登记；剩余风险是手写两字段的机械重复（含 clientReqId 的路由漏开 idem 已是编译期错误） |
| `apps/server/src/core/errors.ts` | 为新异常维护中央 constructor→code 映射 | 领域错误必须侵入框架核心 |
| `apps/server/src/core/idem.ts` | 只有短期 pending/result 缓存 | 不绑定 payload，且没有受控状态查询，不能完整承载结果未知恢复 |
| `apps/client/src/view/pages.ts` | 手工组合页面、导航和会话恢复 | 新玩法会继续把分支堆进中央页面组合根 |
| `apps/client/src/view/viewRegistry.ts` | 每个 View 手工登记动态 import 和元数据 | View 文件与中央 registry 需要同步修改 |
| `apps/client/src/view/fguiContracts.ts` | 手工维护契约常量和全集 | XML、View AUTO、contract 和 registry 存在多个同步点 |
| `apps/client/src/view/HomeView.ts` | 固定 `btn_enter` 进入 ballMove | 每增加一个主入口都可能修改既有 Home 页面 |
| `apps/client/src/net/WebSocketClient.ts`、`net/session.ts` | **瞬态** drop/reconnect 只在 `WebSocketClient` 内部处理；**最终态**已有 `session.ts` 的 `onAuthInvalid` / `onConnLost` / `onBattleLost` 稳定订阅（`Main.ts` 消费），但没有 joining/ready/dropped/reconnected 这类瞬态事件 | plugin 只能感知“已经完了”，无法响应短暂 drop、重连与结果未知 |
| 契约、View 与 inventory 测试 | 中央穷尽 fixture 或文件名假设 | 新领域必须修改旧测试表，plugin 无法完全拥有自己的验收向量 |

这些修改本身不一定复杂，但会产生三个长期问题：

1. **冲突集中**：多个玩法分支会反复修改相同的 index、registry、Home 和测试 fixture。
2. **语义重复**：读写属性、幂等、validator、错误码和页面加载信息在不同层重复声明。
3. **漏登记风险**：类型系统只能覆盖部分关系，复制旧模板后漏开幂等、漏注册页面或漏加测试样例仍可能发生。


### 2.2 GameRoom 侧：玩法与房间壳仍未分离

当前仓库已经有 `GameModeRegistry`、ballMove/idle 两个 mode 和客户端 gameplay catalog，但可扩展性只完成了一半。

| 当前位置 | 当前事实 | 直接接 Snake 的后果 |
| --- | --- | --- |
| `apps/server/src/rooms/GameRoom.ts` | ballMove 的 Move、技能、fixed-step、离场、结算、evidence/replay 仍由公共房间直接处理：本文件 10 处 `usesDefaultBallMoveRules` 代码特判（另 3 处注释），服务端源码合计 18 处（`GameMode.ts` 4、`modes/IdleGameMode.ts` 1），加 `rooms/README.md` 2 处共 20 处 | Snake 会继续向公共房间增加条件分支，第三个玩法再重复一次 |
| `apps/server/src/rooms/GameRoom.ts` | **人数与相位事实已下沉**：`GameMode.roster{min,max,autoStart}`（commit `1755bb2`）与 `GameMode.inputs.phases`（`47af72c`）已是 mode 声明，`maxClients` 取自 `mode.roster.max`，shell 内已无人数/玩法相位字面量。**仍缺的是开局策略形态**——Waiting 中「人数达到 `roster.autoStart` 即自动开局」是唯一策略，没有 owner / Ready / 手动 Start 的策略位 | 拦路的不再是人数硬编码，而是缺 `StartPolicy` 抽象，因此仍无法表达“无需等满、全员 Ready、房主手动 Start” |
| `apps/server/src/rooms/GameRoom.ts` | 新增一条玩法 C2S 仍要改两张静态表：`GAME_ROOM_C2S_SCHEMAS` 与逐条 `onMessage` 注册；`phaseAllows` 只在新增 **shell 公共**消息（Ping/Chat）时才动——玩法输入的 phase 已由 `mode.inputs.phases` 声明 | 仍有两处必改且漏一处会静默丢弃；且因 `Room.__init()` 早于 `onCreate()`，这两张表只能是全 C2S 联合的静态表，⛔ 不能按 mode 构建 |
| `apps/server/src/rooms/GameMode.ts` | 已是“声明式事实 + hooks”的混合契约：`roster` / `inputs` 由 `assertGameModeRoster` / `assertGameModeInputs` 在**登记期与注入期各 fail-closed 校验一次**（导出这两个断言正是为了让 `GameRoomRuntimeOptions.mode` 注入路径不成为后门）。剩余的 ballMove 默认语义是 `usesDefaultBallMoveRules` 与 `requireMode` 的 ballMove 兜底 | 公共接口仍以 ballMove 为默认语义；fallback 虽不绕过正常 onCreate/onAuth 的未知 mode 拒绝，仍污染内部直调、测试和未完整初始化路径 |
| `apps/shared/schema/game-room-state.json` | 单文件中央 manifest，但已是**按 mode 选 root 的多 root 形态**（`formatVersion: 2`，roots = ballMove/idle），且 root 生命周期字段已 manifest 化、shell 只依赖生成的 `RoomStateLifecycle`（`a6ce634`） | 新玩法不再重写他人生成物，但仍与所有 mode 共享同一个冲突文件与同一份生成输出，且缺可复用的公共 fragment（`OwnerReady` / `InviteRoom`） |
| `apps/shared/src/protocol/messages.ts` | C2S/S2C 名称、payload map 和 validator 由中央全集维护 | 每条玩法消息都侵入 shared 公共文件 |
| `apps/client/src/net/RoomClient.ts` | 另有一份本地 S2C payload map；加入流程只落在当前 `joinOrCreate` 形态 | 新消息和 `create` / `joinById` 会继续侵入通用 transport |
| `apps/client/src/gameplay/catalog.ts` | context 显式列出 ballMove/idle joiner 与 adapter | 每增加一个 mode 都要扩充中央 context 和测试替身 |
| `apps/client/src/view/pages.ts`、`viewRegistry.ts`、`fguiContracts.ts` | 页面组合、动态加载、FGUI 契约各有中央登记点 | 新房间页、等待页和结算页需要修改多个旧文件 |
| `apps/client/src/Main.ts`、Home | 默认入口和失败恢复仍由应用根编排 | Snake 名称和页面分支会泄漏到应用框架 |

> 上表的**处数与符号名是写入时的快照**（对齐 plan-v4 条目 4 三阶段落地后的 HEAD）。复核时以
> `grep -c usesDefaultBallMoveRules <file>` 重新计数为准，⛔ 不要把本表当成长期有效的行号真源。

如果只为了本次 Demo 做一个 `InviteGameRoom extends GameRoom`，也不能真正做到无侵入：现有 admission、start、
lock、rollback、message dispatch 和 dispose 大量是 `private`，子类只能复制整份房间逻辑或继续修改父类。正确
方向是一次性把这些共性收敛为可组合的 core policy，而不是复制第二个房间壳。

此外，`/Users/kimi/work/tanchishe/wegameVersion` 是旧版 Cocos/微信小游戏的解包重建档案，不是可直接编译进
Cocos Creator 3.8.8 的 TypeScript 源工程。它适合用于梳理玩法规则、手感、表现和已获授权的素材，不适合把
旧平台适配、网络、构建产物或资源元数据原样搬入本仓。


### 2.3 两个玩法暴露的是框架共性，不是特例

该玩法要求：

- Lobby WS-RPC 读写分路；
- 写请求 payload 绑定和稳定 `clientReqId`；
- `pending/applied/unknown` 结果恢复；
- 断线重连、应用回前台和页面重开后拉完整快照；
- 页面关闭后的迟到响应隔离；
- Home 中增加玩法入口；
- 多个 View、FGUI 包、契约和测试接入。

其中只有矿场、矿工、远征、公式和存档结构属于 undergroundIdle 领域。幂等 payload 绑定、连接生命周期、
导航恢复、plugin 菜单、静态注册表生成以及 fixture 发现都是其他 Lobby 玩法同样需要的框架能力。若只在
`undergroundIdle.*` 内部
解决，将来每个玩法都会复制一次，而且通用 dispatcher 在进入 handler 前就可能返回旧缓存，领域代码无法完整
补救。


### 2.4 为什么不能追求字面上的零旧文件 diff

以下变化应保留，而不是被隐藏：

- 客户端动态 import 集合必须静态可见，最稳妥的做法是生成 TypeScript registry；
- shared 协议增加路由后，协议指纹必须变化，review 应能看见；
- FGUI 新包需要编辑器导出 `.bin`、图集、图片和 `.meta`，Node codegen 不能代替编辑器；
- shared/client/Cocos 镜像必须随真源同步；
- 协议是否兼容、能力是否晋升 core、验收是否完成仍需要人工判断。

因此本文把“生成侵入”与“人工侵入”分开管理。


## 3. 两种扩展实体、目标与所有权

本章先钉死 **plugin** 与 **gameplay module** 的边界。后续所有共享设施（生成器、协议身份、View 登记、
保护路径）都按这条边界划分归属，⛔ 不得把两者合并成一个巨型插件模型。

### 3.1 术语与实体边界

本文覆盖两类扩展实体，它们**运行时模型不同、归属不同、生成器不同**：

| 实体 | 运行位置 | 典型能力 | 生成器 | 单源目录 |
| --- | --- | --- | --- | --- |
| **plugin** | 已登录 Lobby，页面型 | 挂机、邮件、商店、公会 | `codegen:plugins` | `apps/client/src/plugins/<id>/` + shared domain |
| **gameplay module** | GameRoom 内，实时对局 | ballMove、Snake | `codegen:gameplays` | `apps/shared/gameplays/<id>/` + 三端模块 |

**命名规则**：两类实体的 id **不得同名**。目前唯一一处需要区分的是 `idle`——
它归既有 gameplay module（`GameplayModeId.Idle`），因此 Lobby 侧的挂机能力一律用准确名
`undergroundIdle`。风格统一为 **camelCase**，⛔ 不用 kebab-case。该规则约束：plugin id、RPC domain 名与
路由前缀、`operationGroup`、服务端 endpoint 与 core 目录、shared domain 文件、测试与向量文件名、领域配置
表 id。

该规则**同样覆盖 FGUI 资源层**：包名、stableKey、组件名与资源目录都用同一个前缀
（undergroundIdle 的形态是 `UndergroundIdle` 包 / `UndergroundIdleMain` 组件 / `undergroundIdle.*` stableKey /
`apps/art/fairygui/assets/UndergroundIdle/`）。

⚠ 三类**不受**此约束、⛔ 不得机械改名的东西：外部专有名词（如竞品名 `Melvor_Idle`）、通用美术术语
（如动画状态 `Idle` / `Work`）、以及实体**内部**的领域字段与函数名（如 `idleState`、`advanceIdleTo`）
——后者是标识符而非命名空间前缀，目录归属已足够表明所有权。

⚠ **plugin 与 gameplay module 是两种不同实体**，⛔ 不得互相冒充，也 ⛔ 不得合并成一个巨型插件模型。
两者各自的 manifest schema 必须改名区分（`apps/server/tools/plugin/plugin-schema-v2.json` 与
`apps/server/tools/gameplay-codegen/gameplay-schema-v1.json`），避免同基名文件在检索与工具链里互相顶替。
`manifest` / `descriptor` / `catalog` / `registry` 的用词在本文内保持一致即可，⛔ 不做全仓重命名——
仓内 `GameplayRegistry` / `viewRegistry` / `VIEW_REGISTRY` 已把 registry 用于多种含义。

**唯一的交汇点有五处**，各自只有一个 owner，⛔ 不得出现第二份：

| 共享设施 | 唯一 owner | 另一方的消费方式 |
| --- | --- | --- |
| 客户端 View catalog / FGUI contract / FGUI 包闭包 | §7.5（`views.generated.ts` + `fguiContracts.generated.ts`） | `codegen:gameplays` 只产出 gameplay 的 View contribution（中间产物），由最终 View 生成器汇总 |
| Home 菜单数据源 | §7.4 的 menu contribution | gameplay 入口编译成**相同形状**的 contribution |
| 协议兼容版本与仓库级指纹锁 | §4.8 | 两类实体共用 `GAME_ROOM_PROTOCOL_VERSION` / `LOBBY_PROTOCOL_VERSION`，⛔ 不各自新增版本闸 |
| Redis Lua 装载与 key 构造 | 仓内既有 `core/infra/redisScripts.ts` + `keys.ts` | 两侧都只**复用**，⛔ 不另建第二套（但 ⛔ 不共用记录结构，见 §6 导语） |
| 生成器执行顺序 | 本节 | 当 gameplay 的 View/menu contribution 成为最终 View 生成器的输入时，`codegen:gameplays` 必须在 `codegen:plugins` **之前**运行；两者的 freshness 断言互不依赖顺序。⛔ 不合并成单一 `codegen -- --all` 前端——与仓内 `codegen:fgui` / `codegen:http` / `codegen:state` 三条并存、逐条登记的惯例冲突 |

下面是各自的术语定义：

| 术语 | 定义 | 新增普通 plugin 时是否允许 |
| --- | --- | --- |
| 人工侵入 | 开发者手改既有框架或其他领域拥有的源码、测试、页面或登记表 | 不允许 |
| 新增式改动 | 在新 plugin/domain 目录增加由该 plugin 拥有的文件 | 允许，也是目标形态 |
| 生成侵入 | codegen 根据 plugin 源生成或刷新中央 registry、索引和锁文件 | 允许，必须确定且可检查 |
| 镜像变化 | `sync:shared`、`sync:client` 产生的客户端/Cocos 镜像变化 | 允许，禁止手改 |
| 框架变化 | 修改通用语义、默认入口、DB schema、依赖或运行时机制 | 仍需显式修改和评审 |

删除 plugin 也不属于普通“新增式改动”。删除会涉及生成条目、资源、镜像和可能的存量数据兼容，必须走单独的
显式审核与删除保护，不能让生成器因为目录暂时缺失就静默批量删除。


### 3.2 可验收目标

**plugin 侧**——一次性改造完成后，应满足：

1. 新增 Lobby RPC 领域不再手改 `lobbyRpc/index.ts`、`envelope.ts`、`rpc.ts`、`dispatcher.ts` 或
   `core/errors.ts`。
2. 新增 plugin 页面不再手改 `pages.ts`、`viewRegistry.ts`、`fguiContracts.ts`、Home、`Main.ts` 或
   `WebSocketClient.ts`。
3. 路由的请求、响应、执行模式和幂等策略只有一个领域真源；全局错误码全集由 core + domain descriptor
   单源聚合。
4. 所有 idempotent write 自动获得 payload hash、唯一 lease 和短期结果缓存；只有显式声明 inspectable/
   operation group 的路由才能进入受控查询。
5. 所有 plugin 通过统一的会话、连接和宿主生命周期接口恢复，不自行重建 Lobby 连接。
6. 新增 plugin 只增加自己的测试向量；通用测试自动遍历并验证全集。
7. `--check` 在生成物陈旧、重复 id、路径越界或集合不齐时失败，且不修改工作区。
8. 提交 diff 能清楚区分手写 plugin 文件、生成物、资源导出物和镜像。

**gameplay module 侧**——一次性改造完成后，应满足：

1. 认证玩家能在当前区创建实时玩法私房，得到保留前导零的六位数字码。
2. 其他玩家能输入六码，经 Lobby resolve 后定向 `joinById`，不会因输错码而误创建新房。
3. 房间最多 4 人；达到该玩法 `minPlayers` 且当前成员全部 Ready 后，只有房主能启动。
4. 创建、入座、Ready、Start、锁房、重连、房主转移、结算和退出都有服务端权威状态与稳定错误。
5. Snake 运行服务端权威 fixed-step 模拟，客户端只发送输入，并用 `tick/seq` 对账。
6. Snake 使用现有 750×1624 竖版基线，房间 UI、世界区、操控区和安全区互不争抢输入。
7. 新玩法消息、state root、服务端/客户端 catalog 和 View contribution 由玩法文件 + codegen 接入。
8. 增加一个测试 fixture mode 时，不修改 `GameRoom.ts`、`RoomClient.ts`、`Main.ts`、`pages.ts` 或手写中央清单。
   ⚠ **唯一例外**：若新玩法要在 Home 出现可见入口，它需要往菜单 contribution 集合登记一条——该集合按
   §3.1 交汇点表归 §7.4 拥有。「登记一条 contribution」属于生成侵入还是人工侵入，取决于 §7.4 最终把
   contribution 的手写真源放在哪里；实施时必须明确，⛔ 不能默认它是零成本。
   > 注记（2026-09-04，已关闭）：`apps/plugins/snake/plugin.json` 落地后，玩法自持 views/owners/menu
   > contribution，登记入口只写自己的 manifest，⛔ 不再碰 `apps/plugins/builtin/plugin.json`——本例外不再需要。
   > 上面的正文保留为历史设计记录（当时确实未定），闭合断言见 `apps/client/test/homeMenu.test.ts` 的
   > 「contribution 归属」用例：玩法只要有自己的 plugin，入口搬回 built-in 即红。


### 3.3 非目标

**两侧共同**——本方案不做以下事情：

- 不实现运行时热插拔、远程插件下载或脚本热更新；
- 不把 plugin 变成新的 npm workspace，也不要求把所有现有源码迁入一个巨型 vertical-slice 目录；
- 不在 shared 引入 Zod、Node API、DOM、`cc` 或完整 schema DSL；
- 不从 TypeScript interface 自动猜测运行时 validator；validator 仍由领域显式实现；
- 不让生成器自动 bump 语义版本、自动宣告功能完成或自动修改**当前计划文件**（写作时为 plan-v4.md）的验收
  结论；实施时以 `docs/inventory.json` 的 `routeOfTruth.corePlan` 为准，而不是本文写死的文件名；
- 不为单个玩法提前抽象通用 MySQL/outbox/跨服编排，也不提前发明万能 Schema DSL、跨运行时巨型 plugin
  或统一所有网络同步模型。

**gameplay module 侧**——本方案另外不承诺：

- 原样迁移旧项目的微信插件、账号、好友关系、匹配服务、协议栈、排位、商业化和活动系统；
- 因“邀请好友”四个字自动获得微信/通讯录分享能力；首期只是显示、复制或由宿主分享六位码；
- 首期复制旧游戏全部皮肤、复活、AI、道具和玩法变体；
- 仅凭 Redis 邀请码租约就获得生产级跨节点 Room 能力；当前 RedisDriver/RedisPresence 的部署边界仍以
  `SERVER.md` 为准；
- 为实时玩法强行复用 ballMove 的证据格式，或在玩法规则未冻结时先承诺可信战绩链。


### 3.4 所有权边界

目标是“一个 Room core + 多个编译期 gameplay module”，而不是“每个玩法复制一个 Room”。

```text
apps/shared/schema/gameplays/<id>/manifest.json + state.json
apps/shared/src/gameplays/<id>/wire.ts
                           │
                           ▼
                 codegen:gameplays
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
        shared catalog  server catalog  client catalog
             │             │             │
             │       GameRoom core       │
             │   ┌─────────┴─────────┐   │
             │   │ access/start/wire │   │
             │   │ lifecycle/budget  │   │
             │   └─────────┬─────────┘   │
             │             │             │
             └──── mode contract ────────┘
                           │
                    snake-owned files
```

| 归属 | 永久负责 | 明确不负责 |
| --- | --- | --- |
| GameRoom core | auth、区服与 mode 复核、成员与重连、房主、Ready/Start、容量、phase、消息预算、fixed-step 调度、lock/start transaction、dispose、邀请码准入 | 蛇移动、食物、碰撞、成长、相机、分数和 Snake 结算规则 |
| Gameplay server mode | 玩家/世界状态、玩法命令、每个 fixed-step 的规则推进、胜负、可选 evidence capability | 原始 token、Redis client、Colyseus `Room` 和任意未受控 send |
| Shared gameplay contract | mode id/version、exact wire validator、state descriptor、跨端纯数据 | Node、DOM、Cocos、FairyGUI 或 npm 依赖 |
| Client gameplay module | launch 参数校验、room adapter、玩法 Logic、presentation、Lobby/View contribution | 全局登录态所有权、裸 SDK Room、其他玩法页面 |
| 生成器 | 发现固定目录、生成静态 imports/类型聚合、检查三端集合和版本摘要 | 猜业务规则、自动 bump 语义版本、自动宣告完成 |

服务端 mode 只应取得受限 context，例如有类型的 `send/broadcast`、当前 state、tick、只读成员视图和受控
`settle()`；不得取得原始 `Room`、`Client`、token 或 Redis client。admission、command 和 leaving hook 只拿
不可发送的 `ConnectionRef { sessionId, userId }`；定向发送必须调用
`context.send(ref, s2cToken, payload)`。发送层还要确认 token 方向为 S2C 且 owner 是 core/当前 mode，不能只
验证 payload。这样玩法无法通过 `client.send()` 绕过 core 的验证、预算与生命周期。

plugin 必须拥有自己的：

- shared domain contract 和纯逻辑；
- server endpoint、core 领域模块及持久化收据；
- client Logic、View、route composition 和网络 port adapter；
- FairyGUI 独立包或明确声明的共享包依赖；
- 单测、集成测试和位于 `apps/server/test/lobbyRpcVectors/`（拟新增，当前不存在；`test/` 已整体在服务端
  tsconfig include 内）的 RPC 最小向量；
- 说明文档和 inventory fragment。

跨 plugin 依赖必须在 manifest 中通过 `dependsOn` 或稳定 port 声明。禁止 plugin 互相直接读取内部状态，生成器
应拒绝依赖环和重复公开 id。


## 4. Shared 契约改造

shared 是双端唯一契约真源，也是两类实体交汇点中最核心的一处（交汇点全集见 §3.1，共五处）。本章按「先 Lobby RPC、后 GameRoom wire」的顺序
给出契约改造，最后统一协议身份（§4.8）——那是两类实体共用的版本闸。

### 4.1 RPC 领域自描述

> **命名边界**：仓内已有 Room 玩法 `idle`——它是一个 **gameplay module**
> （`GameplayModeId.Idle = "idle"`、`apps/server/src/rooms/modes/IdleGameMode.ts`、
> `apps/client/src/logic/rooms/idle/IdleGameplay.ts`、`c2s.idle.pulse`、`IdleRoomState`）。
> 本文的 Lobby 能力是一个 **plugin**，两者按 §3.1 是**不同实体**，⛔ 不得同名。
>
> **`idle` 归既有 gameplay module；Lobby plugin 一律用准确名 `undergroundIdle`。**
> 方向如此选择的原因是成本不对称：`idle` 已进 join envelope、state manifest 的 root 选择、生成物与三端
> 镜像，且 `PROTOCOL_VERSION` 的版本注释明确记录了 v7 新增 `c2s.idle.pulse`——给它改名要动协议并 bump
> 版本；而 undergroundIdle plugin 尚无任何代码，改名零成本。
>
> 风格统一为 **camelCase**（与 `docs/undergroundIdle/` 及仓内 `logic/rooms/idle/` 等目录惯例一致），
> ⛔ 不使用 kebab-case 的 `underground-idle`。这条同时约束：plugin id、RPC domain 名与路由前缀、
> `operationGroup`、服务端 endpoint 与 core 目录、shared domain 文件、测试与向量文件名。

新增稳定的零依赖 builder，例如：

```ts
export default defineLobbyRpcDomain({
  domain: "undergroundIdle",
  errorCodes: [
    "STATE_CONFLICT",
    "OPERATION_RESULT_EXPIRED",
    "GAMEPLAY_NOT_READY",
    "GAMEPLAY_STATE_INVALID",
    "INSUFFICIENT_STAMINA",
  ] as const,
  routes: [
    defineRpcQuery("undergroundIdle.getSnapshot", {
      request: validateGetSnapshotReq,
      response: validateGetSnapshotRes,
    }),
    defineRpcIdempotentWrite("undergroundIdle.activate", {
      request: validateActivateReq,
      response: validateActivateRes,
      operationGroup: "undergroundIdle",
      inspectable: true,
    }),
    defineRpcQuery("undergroundIdle.queryOperation", {
      request: validateQueryOperationReq,
      response: validateQueryOperationRes,
      inspectsOperationGroup: "undergroundIdle",
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

不得再通过“请求类型是否含 `clientReqId`”推断执行模式。`undergroundIdle.queryOperation` 会携带原操作的请求 ID，
但它仍是
query；显式 metadata 才能正确表达这种语义。

执行模式不替代并发控制。是否需要用户锁、UoW、UNIQUE 或 CAS 仍由领域写路径决定；`natural-write` 只描述重复
调用的业务效果，不等于 dispatcher 自动加锁，也不等于不存在竞态。


### 4.2 生成的 RPC 全集

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
route 与 mode 的字面量就丢了，§5.6 第 5 条的编译期负例也写不出来。这一点是硬要求：现有
`apps/server/src/websocket/rpc.ts` 的 `defineRpc` idem / 非 idem **双重载**依赖 `LobbyRpcIdemType` 是精确字面量
联合才能在编译期收窄；而且该类型必须**改由显式 mode metadata 产生**，⛔ 不再用今天的「req 结构里含
`clientReqId`」做推断（§4.1 已说明为什么结构推断不足以表达 `queryOperation` 这类路由）。

配套契约测试：descriptor 的**运行时值**（domain / route / mode / errorCodes）必须与 generated 表**双向相等**，
防止 AST 读取结果与运行时值成为两份真源。生成器只做**语法读取**，⛔ 不执行 domain 文件（见 §5.5）。

现有 `lobbyRpc/index.ts`、`envelope.ts` 和 `push.ts` 改成稳定 façade；以后只 re-export 类型、信封验证器和生成
registry，不再维护领域 switch 或数组。

core error descriptor 拥有鉴权、限流、非法载荷、未知路由、忙、处理中、操作冲突和内部错误等通用码；domain
descriptor 只贡献领域码。若未来要约束“某条 route 允许产出哪些领域错误”，应另加 route-level `errors`
metadata，不能把 domain 级错误集合误读为逐路由穷尽表。


### 4.3 validator 边界保持不变

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
⚠ 收紧字符集会拒绝旧客户端可能发出的历史 ID，属于 **wire 收紧**，须与 §4.8 的协议身份分离一起走版本节奏，
⛔ 不能混进 §9 阶段 3 「现有 route、validator、endpoint 和行为不变」的机械迁移。
⛔ 不要顺手把长度下界从 1 提到 8——那会拒绝现有客户端的合法短 ID。

生产 contract 中不放测试 fixture，避免客户端包携带测试数据。测试向量放在 plugin-owned sidecar。

`apps/shared/src/logic/index.ts` 一次性改为 re-export 一个生成 barrel，或允许 plugin 使用稳定的 shared 子路径
export。后续新增 `logic/undergroundIdle/**` 时，不再手改中央 `logic/index.ts`。


### 4.4 稳定 join envelope

GameRoom join options 应收敛为稳定公共信封：

```ts
interface IGameRoomJoinOptions {
  readonly v: number;
  readonly mode: string;
  readonly modeVersion: number;
  readonly profile: string;
  readonly token?: string;
  readonly sId?: number;
  readonly access?: {
    readonly kind: "create" | "join";
    readonly ticket: string;
  };
  readonly modeData?: unknown;
}
```

> `token?` / `sId?` / `access?` / `modeData?` 在 shared 的 `exactOptionalPropertyTypes` 下必须用**条件展开**
> 构造，⛔ 不得赋 `undefined`。

- `profile` 选择由 generated catalog 声明的房间组合，例如 `snake.private`；同一玩法以后增加公共撮合形态时不必
  复制一套 Snake 规则或另造 mode id。
- `access.ticket` 是 core 私房准入能力，`create` 与 `join` purpose 不可互换，禁止写入 state、日志或错误文本。
- `modeData` 只放玩法自有参数，并由对应玩法 exact-validate；以后不再向顶层加入 Snake 专用字段。
- 客户端采用哪种 SDK 方法不属于 wire，应留在本地 launch request 中。

`profile` 在新 framework version 中是必填，ballMove/idle 也要各自获得 generated 默认 profile。迁移通过 bump
framework version 明确拒绝缺 profile 的旧 Game join，不做“缺省时随便匹配”的兼容；服务端 admission 仍要在
matchmaker filter 之外再次拒绝缺失、未知或不属于该 mode 的 profile。

客户端通用 matchmaking strategy 建议固定为：

```ts
type GameRoomMatchmakingStrategy =
  | { readonly kind: "join-or-create"; readonly roomName: string }
  | { readonly kind: "create"; readonly roomName: string }
  | { readonly kind: "join-by-id"; readonly roomId: string };
```

endpoint、strategy、roomName/roomId 和完整 join options 都必须进入 `RoomClient` 的 connection ownership key；
任何 token/ticket 只能参与内存比较，不能被打印。


### 4.5 玩法自带 message token

每个玩法在自己的 `wire.ts` 中声明消息、方向、validator、允许 phase 和预算成本：

```ts
export const SnakeInput = defineC2S("c2s.snake.input", validateSnakeInput, {
  phases: [GamePhase.Playing],
  rateCost: 1,
});

export const SnakeSnapshot = defineS2C("s2c.snake.snapshot", validateSnakeSnapshot);
```

生成 wire registry，建立：

```text
message type
  → owner mode / core
  → C2S 或 S2C
  → exact runtime validator
  → allowed phases
  → rate cost / contract version
```

`GameRoom.messages` 一次性改成 Colyseus 0.17 的 catch-all 入口。通用 dispatcher 固定执行：

1. 安全读取 type；非字符串/未知 type 也进入低成本 flood 计数后拒绝；
2. 查询 generated wire registry，并确认消息属于 core 或当前 mode；
3. 在执行可能较贵的 payload validator 前先消耗至少一个基础连接级/房间级 cost；
4. exact validate payload；成功解析后才能按 descriptor 或有界 payload 大小追加成本；
5. 校验 phase 和 core policy；
6. core 消息交给 core handler，玩法消息交给当前 mode 的 typed handler map。

**落地约束（Colyseus 0.17 具体行为，⛔ 不可想当然）**：

1. 在 `messages` 映射形态里，catch-all 的键是 **`"_"`**（等价于 `onMessage("*")`），不是 `"*"`。
2. `messages` 必须是**实例字段初始化器**产生的每实例对象（现仓即是），⛔ 不得赋模块级共享常量——
   `Room.__init()` 读到 catch-all 键后会 `delete` 掉它，共享常量会让第一间房之后的所有房间**永久没有
   catch-all**。
3. `__init()` 跑在 `onCreate()` **之前**，而生产房的 mode 直到 `onCreate` 才选定：因此 handler 表只能是
   **全 C2S 联合的静态表 + 运行时按 mode 准入**，⛔ 不能按 mode 换表。（该结论已登记在 `GameMode.ts` 的
   注释里，本文引用而非重推。）
4. 改造后 GameRoom **不得再注册任何具名 `onMessage(type, …)`**，并要加一条测试断言房间只注册了 catch-all：
   Colyseus 的分派是「具名优先、catch-all 兜底」，任何残留的具名 handler 就是一条绕过全部 gate（预算、
   exact validator、phase、owner）的暗道。
5. 第 4 步的 exact validator 必须显式拒绝非普通对象（含 `Uint8Array` / `ArrayBufferView`）：二进制帧分支走
   同一 fallback 且 emit 的是**未加前缀的原 messageType**，两条帧路径在 handler 内不可区分。

**cost 预算必须与既有两层限流对齐**，三层次序是：transport 层条数硬闸（**强制断连**，Colyseus 行为、当前
`maxMessagesPerSecond = 60`，且发生在分派之前）→ 房级条数软拒（`sendError`，同为 60/s）→ 新的 per-message
cost 预算。cost 预算的**等效条数上限不得高于 `maxMessagesPerSecond`**，高于的部分永远先被强断、软拒不可达。
实施时还要决定 `maxMessagesPerSecond` 是否随 `mode.inputs` 一起声明化——Snake 20Hz 输入 + Ready/Start/Ping
的实际条数下界必须落在该数值内。

`GameModeContext.send/broadcast` 同样接收 message token 并在发送前验证。客户端删除本地重复的**类型映射**
`S2CPayloadMap`，改为消费 shared token 推导出的类型；运行时校验本来就已单源于 shared 的 S2C validator，
迁移时只替换类型来源，⛔ **不改校验路径**。完成后新增消息不再修改 `C2S/S2C` 中央对象、
`GAME_ROOM_C2S_SCHEMAS`、`GameRoom.messages`、`phaseAllows` 或 `RoomClient`。

wire token 的 `phases` **取代** 已落地的 `GameModeInputs.phases`，后者在阶段 2 完成后删除，⛔ 不允许两份并存。


### 4.6 分片 state descriptor

本节是在**已有多 root 基础上继续分片**，⛔ 不是从零发明 `RoomBase`：`RoomBase` / `PlayerBase` 对应的只读
视图已由 codegen 产出为 `RoomStateLifecycle` / `RoomStatePlayerLifecycle`（plan-v4 条目 4 阶段三）。本次要做的是
把当前单一 `apps/shared/schema/game-room-state.json` 迁移为每玩法 state descriptor，并把既有那两个生成视图扩成
可组合的公共 fragment、另新增两个：

- `RoomBase`：`tick / phase / matchId`——**沿用已生成的 `RoomStateLifecycle`**；
- `PlayerBase`：公共身份字段——**沿用已生成的 `RoomStatePlayerLifecycle`**；
- `OwnerReady`：`ownerId / player.ready / player.connected / rosterRevision / readyRevision / connectionRevision`；
- `InviteRoom`：可展示的 `roomCode` 及等待期信息。

生成器可以最终扁平输出独立 Colyseus Schema，不要求 Schema 继承。`GameRoom` 只能访问公共 fragment 保证存在的
字段；玩法专属字段只能在对应 mode 内访问。

容量上限采用**两级口径**：per-mode manifest 的 `maxPlayers` 是该 mode 的权威容量；但**只要 root state 仍共享，
就保留「`maxPlayers ≤ root players map 容量`」的登记期断言**（今天由 `assertGameModeRoster` 对 `MAX_PLAYERS`
执行）。state 真正分片后，该上界改由该 mode 自己的 state descriptor 提供——⛔ 不是直接删掉这条闸。

客户端不需要按 mode 编译 root 类：0.17 SDK 在 JOIN_ROOM 握手时通过 schema 反射取得结构，类型与运行时校验由
生成的 per-mode state 类型 + adapter 注入的 exact validator 承担（ballMove/idle 两个 root 已是先例，通用
`RoomClient` 本就不假定 root Schema）。

Snake 的完整身体点和食物是高频、有界数据，首期不要为了它把当前 state DSL 扩成任意深度数组并依赖每帧
Schema patch。推荐 Schema 只放房间控制、玩家摘要、alive/score/length/head/ackSeq 等低频或小体量状态；完整
蛇身、食物和世界快照走有明确元素数、字节数和频率上限的 S2C snapshot。


### 4.7 三类错误域

错误至少分成三类，不合并为一个万能 enum：

- Game join refusal：版本、准入、容量、ticket 等建连失败；
- 房内 core control error：Ready/Start/owner/phase 等通用控制错误；
- Lobby RPC error：`prepareCreate/resolve` 的信封与领域错误。

Ready/Start/invite 的通用错误一次性进入 core room error contract。后续玩法自有错误由 gameplay manifest 贡献到
generated error catalog，或用该玩法自己的 S2C token 表达；不得再手改全局玩法错误 switch。

因为 §9 已把 RPC descriptor（阶段 3）排在 private-room（阶段 8）之前，邀请码的两条 Lobby RPC 只需新增
`domains/room.ts` 的 `errorCodes`，**零中央侵入**——⛔ 不需要再改 `lobbyRpc/envelope.ts` 与服务端
`core/errors.ts`。这正是该顺序要换取的收益之一；若实施时倒排顺序，就必须把这两处中央修改显式加回计划。

一次性引入带 runtime whitelist 的 `RpcFault` 或 `rpcFault(code)`：

```ts
throw new RpcFault("STATE_CONFLICT", "undergroundIdle state version conflict");
```

dispatcher 安全读取 `rpcCode`，用生成的 `isRpcErrCode` 验证后返回；非白名单、恶意对象或未知异常统一落到
`INTERNAL`。现有 Busy、StaleFence 等异常可以保留子类名称，但不再依赖中央 constructor map。

普通对象即使伪造 `{ rpcCode: "STATE_CONFLICT" }` 也不能被信任；实现必须校验受控异常身份并防御 hostile
Proxy/跨边界属性读取异常。客户端继续只按 `code` 分支，不解析 `msg`。

下发的非 INTERNAL message 必须是有界、可公开文本，禁止包含 SQL、Redis key、完整 payload、内部路径、种子或
私有状态；不能证明安全时发送稳定通用文案。客户端不解析 msg 并不能自动防止服务端泄漏。

以后领域错误类和错误码都在 plugin 新文件中定义，不再修改 `core/errors.ts`。


### 4.8 协议身份与版本边界

继续保留当前 wire 的 `v` 字段，但把它明确为 framework protocol version；另增加每玩法独立的
`modeVersion`。公共认证、join envelope 或生命周期语义变化才升级 `v`，只改 Snake wire 时只升级 Snake 的
`modeVersion`。这样 Snake 的演进不会无条件使 ballMove/idle 客户端全部失配。

这不是只改 `rooms.ts`：当前 `PROTOCOL_VERSION`（`apps/shared/src/protocol/rooms.ts`，写作时取值 7）被
Lobby join（`LobbyRoom.ts:252`）、Game join（`GameRoom.ts:115/706/926`）、`/version`（`http/misc/version.ts`）、
`/healthz`（`http/misc/healthz.ts`）、客户端 join options（`WebSocketClient.ts:402`、`RoomClient.ts:654`）
与 `scripts/protocol-fingerprint.mjs` 共同读取。⛔ **客户端目前没有任何 HTTP 启动探测**；本方案若要新增，须
显式登记为新增能力，不能当作既有事实。per-mode digest 只覆盖该 mode 的 wire/state/modeData 契约，不把服务端
实现、UI 或资源变化误判为 wire bump。

**跨文对齐（口径以 §4.8 为准）**：

- 最终只有**两个**人工兼容整数：`LOBBY_PROTOCOL_VERSION` 与 `GAME_ROOM_PROTOCOL_VERSION`。本文所说的
  framework protocol version **就是** `GAME_ROOM_PROTOCOL_VERSION`，§4.4 信封字段 `v` 携带的正是它，
  **不是第三个整数**；“bump framework version”即 bump 该常量。`/version` 与 `/healthz` 同时报告两类身份。
- 三层分工固定为：`GAME_ROOM_PROTOCOL_VERSION` 管信封与 core wire 兼容；`modeVersion` 管单玩法契约兼容；
  仓库级 protocol fingerprint **只做字节审计锁，⛔ 不参与运行时 join 判定**。
- 因此**保留单一仓库级字节锁**，⛔ 不把 `protocol-fingerprint.mjs` 拆成 framework 指纹 + per-mode digest；
  per-mode digest 由 `codegen:gameplays` 单独产出、单独校验，不进指纹脚本。
- 两类实体共用这两个整数，⛔ 不允许各自新增一个 Game join 版本闸；建立时机见 §9 阶段 7。
- **parser 硬约束**：`protocol-fingerprint.mjs` 的版本解析要求 `rooms.ts` **有且仅有一个**顶层
  `export const PROTOCOL_VERSION = <整数>;`，任何改名或拆分都会先 throw；锁文件当前是单行
  `v<version> <hash>`，改为两个整数后的新行格式必须在实施前定死，并同批更新
  `apps/client/test/protocolFingerprint.test.ts` 与版本矩阵测试。

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

不得为了追求无侵入而取消协议锁，也不得让 `--check` 自动重钉。若未来多个 plugin 分支频繁冲突，再基于真实
冲突数据考虑按 domain/package 分片指纹；初期继续保留一个确定性的全局锁更简单。

> **本节是全文对协议身份的唯一口径。** 上文所说的 “framework protocol version”**就是**
> `GAME_ROOM_PROTOCOL_VERSION`，不是第三个整数；per-mode `modeVersion` 是第三层，由 `codegen:gameplays`
> 单独产出 digest、单独校验，⛔ **不进 `protocol-fingerprint.mjs`**——仓库级字节锁保持唯一。
>
> ⚠ 实施硬约束：`protocol-fingerprint.mjs` 的版本解析要求 `apps/shared/src/protocol/rooms.ts` **有且仅有
> 一个**顶层 `export const PROTOCOL_VERSION = <整数>;`，任何改名或拆分都会先 throw；锁文件当前是单行
> `v<version> <hash>`，改为两个整数后的新行格式必须在实施前定死，并同批更新
> `apps/client/test/protocolFingerprint.test.ts` 与版本矩阵测试。


## 5. 单源目录、生成器与治理

两类实体各有自己的单源目录与生成器，但**生成器的通用约束只写一份**（§5.5），两个生成器都继承它。
命令形态也已统一：两者都是 workspace 脚本 + freshness 测试断言，⛔ 都不新增根命令。

### 5.1 plugin 描述符

建议增加一个只承载跨层登记信息的数据文件：

```text
plugins/
├── plugin-schema-v2.json
├── built-in/
│   └── plugin.json
└── undergroundIdle/
    └── plugin.json
```

`plugin.json` 只描述：

- `schemaVersion`、plugin id、类别和声明状态；
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


### 5.2 每玩法单源目录

建议约定以下固定目录，禁止 manifest 自定义路径跳出目录：

```text
apps/shared/schema/gameplays/<id>/manifest.json
apps/shared/schema/gameplays/<id>/state.json
apps/shared/src/gameplays/<id>/wire.ts

apps/server/src/rooms/modes/<id>/index.ts
apps/client/src/gameplay/modes/<id>/index.ts
```

最小 manifest 只放跨端身份和版本信息，例如：

```json
{
  "schemaVersion": 1,
  "id": "snake",
  "constantName": "Snake",
  "modeVersion": 1,
  "maxPlayers": 4,
  "profiles": ["private"]
}
```

`maxPlayers` 是跨端硬容量的唯一真源，codegen 用它同时生成 state validator 上限、服务端 admission cap 和
`maxClients` 设置。`profiles` 只声明该玩法允许的房间组合标识；具体 handler、validator、TTL 和 View loader 都
留在 TypeScript/config 中，不塞进 JSON。


### 5.3 生成静态注册表，不依赖运行时扫描

建议新增 `scripts/plugin-codegen.mjs` 或同等工具，扫描 plugin 描述符和领域描述符，生成：

```text
apps/shared/src/plugins.generated.ts
apps/shared/src/protocol/lobbyRpc/registry.generated.ts
apps/shared/src/logic/plugins.generated.ts
apps/client/src/generated/plugins.generated.ts
apps/client/src/generated/routes.generated.ts
apps/client/src/generated/views.generated.ts
apps/client/src/generated/fguiContracts.generated.ts
apps/client/src/generated/fguiPackages.generated.ts
docs/plugins.generated.md
```

所有客户端 loader 必须是生成的静态字面量：

```ts
load: () => import("../plugins/undergroundIdle/index")
```

不得在 Creator 运行时依赖 `fs`、目录扫描或未经当前构建链验证的 `import.meta.glob`。生成器承担“发现文件”，
运行时只消费已生成、可类型检查的 registry。


### 5.4 生成物清单与 gameplay 专有约束

新增 workspace 脚本 `npm --workspace @game/server run codegen:gameplays`（命令形态见本节末），
生成：

```text
apps/shared/src/gameplays/catalog.generated.ts
apps/shared/src/gameplays/generated/wire-catalog.generated.ts
apps/shared/src/gameplays/generated/state/<id>.ts
apps/server/src/rooms/schema/generated/<id>.ts
apps/server/src/rooms/modes/catalog.generated.ts
apps/client/src/gameplay/catalog.generated.ts
apps/client/src/view/view-catalog.generated.ts
```

> ⚠ 上表最后一行 `apps/client/src/view/view-catalog.generated.ts` 是**中间产物**：
> `codegen:gameplays` 只产出 gameplay 的 View contribution，由最终 View 生成器汇总，
> ⛔ 不直接写客户端 View 产物。客户端 View catalog / FGUI contract 全仓只有一个 writer，见 §3.1 交汇点表。

客户端和服务端 catalog 都应是显式、排序稳定的静态 import。客户端具体 Cocos/FairyGUI presentation 仍由
玩法 entry 内部使用字面量动态 import，避免进入普通脚本静态依赖图。不要使用副作用式自注册、`fs` 运行时扫描
或未经当前构建链验证的 `import.meta.glob`。

**生成器的通用约束不在本文重复。** gameplay 生成器**继承** §5.5 的全部生成器通用约束：`--check` 副作用禁令、先在内存完成全部校验再逐文件原子替换、stale/missing/extra
三态失败、双向所有权校验、按规范化大小写检查 id/path 冲突、路径越界与符号链接逃逸拒绝、依赖环拒绝、
只读 `--root` fixture seam、生成文件带“禁止手改”抬头、显式 `--allow-delete`。⛔ 不在本文复制第二份。

本文只规定 gameplay 专有增量，生成器必须 fail-fast 检查：

- 目录名、manifest id、wire contract id、state root 和模块导出的 id 完全一致；
- mode id、wire type 和生成类型名全局唯一，wire type 满足玩法命名空间规则；
- shared/server/client 三端 module 集合完全相等；
- 每玩法 contract digest 发生变化但 `modeVersion` 未增加时失败。

**读取口径**：`manifest.json` / `state.json` 走真实 JSON Schema 校验（`additionalProperties: false`）；
`wire.ts` 走 **TypeScript compiler API 语法读取**（先例：`scripts/protocol-fingerprint.mjs` 已 `import ts from
"typescript"`，`typescript` 是根 devDependency），⛔ **禁止 import 执行**。因此 `wire.ts` 必须限定为可静态
读取的 builder + object/string literal 形态，computed property、spread 或顶层副作用直接拒绝——与 §5.5
同口径。

**生成代码的编译边界**（生成器必须自检，否则产物过不了既有 typecheck）：

- 生成的 **client** 代码只能使用 ES2017 运行时 API（⛔ 禁 `Object.fromEntries` / `Array.prototype.flat` /
  `Promise.allSettled` / `String.prototype.matchAll`；`apps/client/tsconfig.json` 的 target/lib 钉死 ES2017，
  且已有用例专门断言 `Object.fromEntries` 与 `Promise.allSettled` 必须报错），并且必须过 `noUnusedLocals`；
- 生成的 **shared** 代码额外满足铁律 4 与 shared 侧的加严选项：`exactOptionalPropertyTypes`（可选字段
  ⛔ 禁显式赋 `undefined`）、`verbatimModuleSyntax`（类型导入一律 `import type`）、`isolatedModules`
  （类型再导出用 `export type`）；相对导入不带扩展名。

**生成物路径与协议字节锁的关系**：per-mode 生成物移出协议目录。

per-mode 生成物落到 `apps/shared/src/gameplays/generated/**`（wire catalog 与 state descriptor 一起搬），
`apps/shared/src/protocol/` 只保留稳定 join envelope 与 core wire。**因此新增或修改玩法不会改变仓库级协议
指纹，也不需要重钉**——玩法迭代期不产生 lock diff，`scripts/protocol.fingerprint` 只在真正动到 core 协议时
才变。

> 被否决的替代方案：保留 `protocol/generated/**` 原路径，把「每次新增玩法都重钉指纹」当作有意的 review
> 可见性。否决理由是玩法迭代期会持续产生 lock diff，而字节锁本来就只证明“协议目录经过显式接受”、不证明
> 语义兼容（§4.8），用它来换玩法可见性性价比不高——玩法契约的可见性已由 per-mode digest + `modeVersion`
> 承担。
>
> ⚠ 该结论的前提是 `protocol-fingerprint.mjs` 覆盖的是 `apps/shared/src/protocol/**`。若实施时发现它的覆盖
> 面更宽（例如整个 `apps/shared/src`），则移出目录并不能免除重钉，必须回到被否决方案并按它补 §11.2 与 §10.6
> 的重钉步骤。**实施前先跑一次确认覆盖面。**

**命令形态：不新增根命令。**

沿用仓内 `codegen:state` / `codegen:http` 的先例：

- **writer** 是 workspace 脚本 `npm --workspace @game/server run codegen:gameplays`，源码放
  `apps/server/tools/gameplay-codegen/`；
- **只读闸不是独立命令**，而是 `apps/server/test/` 下的 freshness 断言（先例：
  `apps/server/test/room-state-codegen.test.ts` 对已入库产物做 freshness 断言），随
  `npm --workspace @game/server run test` → `verify:all` 生效；
- 生成器自身的 `.ts` 因此**由该测试值导入**而被 tsc 传递纳入（先例：`tools/client-perf-baseline.ts` 正是
  靠一条测试的值导入被纳入），⛔ 不需要改任何 tsconfig 的 include。

这样**不触发**根命令的四重守门——`scripts/verify-inventory.mjs` 的 `checkRootCommandTable` 只对根
`package.json` 的 scripts 与 README/AGENTS/CLAUDE 三份命令表做双向相等，workspace 脚本不在其覆盖内
（仅当它被用作 inventory 的 `supersededBy` 锚点时才要求自己进助手命令表）。

> ⚠ 两处必须如实登记的偏差：
> 1. 该生成器住在 `@game/server`，却要写 `apps/client/src/gameplay/catalog.generated.ts`。
>    `codegen:state` 只跨写 shared + server，**不写 client**；写客户端产物的既有先例（`codegen:fgui`）
>    恰恰是根命令。本方案有意不沿用后者，代价是 server workspace 的职责边界被撑宽一点，实施时必须在
>    `apps/server/tools/` 的就近 README 里写明这一点。
> 2. `apps/client` 不是 npm workspace，所以客户端产物的 freshness 只能由 server 侧测试断言，
>    或另由 `apps/client/test/` 增补一条只读比对。**实施时必须点明选了哪一种。**
>
> 被否决的替代方案：新增根命令 `codegen:gameplays`。它命令可直接执行、动线更直观，但必须逐条接入根
> `package.json`、`scripts/verify-toolchain.mjs` 的命令/链声明表、`apps/client/test/toolchainContract.test.ts`
> 的承重钉、`docs/inventory.json` 的验证依赖，以及上述三份命令表的双向相等断言——漏一条就是静默失闸。

**CLI 与测试形状**沿用既有 `--check` + `--root=<dir>` 约定与 mkdtemp 临时根测试形态（先例同上），
⛔ 不要写 `--repositoryRoot`——那只是 options 字段名、不是 flag。


### 5.5 `--write` 与 `--check` 分离（生成器通用约束）

plugin 生成器必须提供两种明确模式（writer = workspace 脚本 `codegen:plugins`；只读闸 = freshness 测试断言）：

```text
--write  确定性刷新生成物
--check  只读重算并比较；有差异返回非零，不修改工作区
```

`--check` 不得创建目录、修改 mtime、运行 sync、重钉协议指纹或接受 FGUI 资源锁；CI/`verify:*` 只能调用只读
检查。`--write` 也只能覆盖文档列出的普通 generated output，不得修改 plugin 业务源码、plan、SQL、package
或手写文档。协议与 FGUI 审计锁继续使用独立的显式接受动作。

生成器必须：

- 稳定排序，保证相同输入得到字节级相同输出；
- 用真实 JSON Schema 校验 manifest，`additionalProperties: false`，同时检查 schema version、必填字段、类型和
  路径形状；
- 拒绝重复 plugin/domain/route/error/push/View/capability id；
- 按规范化大小写检查 id/path 冲突，文件系统发现顺序不得影响输出；
- 拒绝路径越出仓库、符号链接逃逸和不允许的扩展名；
- 拒绝跨 plugin 依赖环；
- 拒绝 manifest 中 module reference 携带扩展名；源码 import 边界由独立 TypeScript/AST 门禁检查；
- 提供只读 `--root` fixture seam，便于在临时根测试而不触碰真实 checkout；
- `--check` 对 stale、missing 和不应存在的 extra generated output 都失败，并点名输入与目标；
- 先在内存完成全部校验，再逐文件通过临时文件原子替换；多输出无法成为一次文件系统原子事务，进程中断后的
  不完整集合必须由下一次 `--check` 全部发现；
- 生成文件带“禁止手改”和来源说明。

生成检查还必须双向验证所有权：manifest 引用的 domain/runtime/route/View/vector/art 必须存在；plugin-owned 根下
存在的这些文件也必须被唯一 manifest 拥有，防止删除 manifest 后留下未引用源码和资源。普通 `--write` 不得
静默接受整个 plugin 消失，删除必须使用显式 `--allow-delete <id>`、tombstone 或等价的基线批准。

codegen 不直接 import/执行 TypeScript descriptor。RPC descriptor 限定为可静态读取的 builder + object/string
literal 形态，生成器用 TypeScript compiler API 读取 domain、route、mode、error 和 module reference；computed
property、spread 或顶层副作用形态直接拒绝。validator 函数本身仍由生成 registry 在 typecheck/contract test 中
加载并验证。这样生成阶段既不依赖 tsx 副作用，也不复制一份 JSON 路由真源。

**生成器必须有确定的命令名**（全文其余位置一律引用它，⛔ 不再写“plugin codegen”这类无法执行的代称）。

**命令形态：不新增根命令**，与 §5.4 的 gameplay 生成器
同形（见 §3.1 交汇点表）：

- **writer** 是 workspace 脚本 `codegen:plugins`；
- **只读闸不是独立命令**，而是 freshness 测试断言，随 `verify:all` 生效；
- 生成器自身的 `.ts` 由该 freshness 测试**值导入**而被 tsc 传递纳入，⛔ 不需要改 tsconfig 的 include。

因此**不接入根命令的四重守门**——`scripts/verify-inventory.mjs` 的 `checkRootCommandTable` 只对根
`package.json` 的 scripts 与 README/AGENTS/CLAUDE 三份命令表做双向相等，workspace 脚本不在其覆盖内。

> ⚠ 落点必须在实施时定死并如实登记：本生成器的产物主要落在 `apps/shared/**` 与 `apps/client/**`，
> 而 **`apps/client` 不是 npm workspace**、`apps/shared` 目前只有 `typecheck` 脚本、没有 `tools/` 与
> `test/` 基础设施。现成的落点只有 `@game/server`（那里已有 `tools/` 与 `test/`，且 `codegen:state` 已有
> 跨写 `apps/shared` 的先例），代价是 server workspace 的职责边界被撑宽。若改为给 `apps/shared` 或
> `apps/client` 补齐 workspace 基础设施，属于**额外的一次性框架改造**，必须单独评审。
>
> 被否决的替代方案：新增根命令 `codegen:plugins` / `verify:plugins`。命令可直接执行、动线更直观，
> 但必须逐条接入根 `package.json`、`scripts/verify-toolchain.mjs`、
> `apps/client/test/toolchainContract.test.ts` 的承重钉（仅当被挂进 typecheck / verify:sync / verify:core /
> verify:all 之一时）、`docs/inventory.json` 的验证依赖，以及上述三份命令表的双向相等断言——漏一条就是静默
> 失闸。仍需保留的是那条**反例**：无论哪种形态，都要证明 plugin gate 不会静默退出 `verify:core`。

之后普通 plugin 只运行既有命令，不再新增专属命令。

建议提交版产物的 provenance 固定如下：

| 产物 | 真源 | Writer | 只读检查 | 性质 |
| --- | --- | --- | --- | --- |
| `apps/shared/src/plugins.generated.ts` | plugin manifest | workspace 脚本 `codegen:plugins` | freshness 断言 | 普通机械生成 |
| `apps/shared/src/protocol/lobbyRpc/registry.generated.ts` | plugin manifest + RPC domain descriptor AST | workspace 脚本 `codegen:plugins` | freshness 断言 + contract test | 普通机械生成 |
| `apps/shared/src/logic/plugins.generated.ts` | manifest 中的 shared public modules | workspace 脚本 `codegen:plugins` | freshness 断言 | 普通机械生成 |
| `apps/client/src/generated/plugins.generated.ts` | plugin manifest | workspace 脚本 `codegen:plugins` | freshness 断言 | 普通机械生成 |
| `apps/client/src/generated/routes.generated.ts` | route descriptor references | workspace 脚本 `codegen:plugins` | freshness 断言 + route test | 普通机械生成 |
| `apps/client/src/generated/views.generated.ts` | `.view.json` + FGUI XML | workspace 脚本 `codegen:plugins` | freshness 断言 + FGUI contract test | 普通机械生成 |
| `apps/client/src/generated/fguiContracts.generated.ts` | `.view.json` + FGUI XML | workspace 脚本 `codegen:plugins` | freshness 断言 + FGUI contract test | 普通机械生成 |
| `apps/client/src/generated/fguiPackages.generated.ts` | art 引用图 + View/entry asset URLs | workspace 脚本 `codegen:plugins` | freshness 断言 + FGUI contract test | 普通机械生成 |
| `apps/client/src/plugins/**/view/*View.ts` 的 AUTO 区 | FGUI XML + binding 规则 | `fgui-codegen` | AUTO freshness test | 局部机械生成 |
| `docs/plugins.generated.md` | plugin manifest | workspace 脚本 `codegen:plugins` | freshness 断言 | 普通机械生成 |
| `scripts/protocol.fingerprint` | shared protocol 真源 + 协议版本 | protocol fingerprint writer | fingerprint test | 显式协议审计锁 |
| `scripts/fgui.manifest.json` | art、FGUI 导出物和 View AUTO 区 | FGUI manifest writer | `verify:fgui` | 显式资源审计锁 |
| 保护路径规则（如 `scripts/protected-paths.json`） | 人工评审 | 人工（提交中显式声明） | 无侵入矩阵测试 | 显式治理锁 |
| `scripts/protected-paths.lock` | 两组手写保护路径的当前字节 | protected-paths lock writer | `verify:protected-paths` | 显式治理锁的执行力（改受保护文件必留 diff） |
| `apps/client/src/shared/**` | `apps/shared/src/**` | `sync:shared` | `verify:sync` | 生成镜像 |
| `apps/Cocos/assets/src/**` | `apps/client/src/**` | `sync:client` | `verify:sync` | 生成镜像 |


### 5.6 测试向量由 plugin 持有

⚠ 先厘清现状：中央 request 向量表有两张（服务端契约测试的 `validPayloads` 与 wire contract 测试的
`requestFixtures`，各 12 条）；response 侧除发送前调用的 shared 运行时 validator 外，也已有中央向量表
（wire contract 测试的 `responseFixtures`，12 条，逐路由做正反向断言）。因此本方案要求 sidecar 同时提供
request 与 response 最小合法向量时，存量 12 条路由的 request/response 向量都是**从中央表迁移，不是新增**
——⛔ 也不要据此去删 shared 的 response validator，那是运行时闸，与测试向量是两回事。

现有的中央向量表改为按 sidecar 发现，例如：

```text
apps/server/test/lobbyRpcVectors/undergroundIdle.ts
```

> 注记（2026-09-05）：sidecar 发现已落地为生成物——`codegen:plugins` 按 domain 集合发现
> `lobbyRpcVectors/<域>.ts` 并渲染 `lobbyRpcVectors/index.generated.ts`（domain ⇔ sidecar 双向对齐），
> `lobby-rpc-vectors.test.ts` / `lobby-rpc-contract.test.ts` 只消费该表；此前两份测试各手写一张登记表的
> 形态（PLUGIN-REVIEW F06）已删除。

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

NaN、版本冲突、远征未完成、满仓和奖励 exactly-once 等领域反例继续放在 plugin 自己的测试中；生成器不尝试
从 validator 自动反演全部坏样例。

View 测试不再假设 `apps/client/src/view/<Name>View.ts` 顶层结构，而是遍历 generated manifest，继续验证：

- route composer/module/export 存在，plugin logic 目录不导入引擎；
- AUTO 区块与 XML 同步；
- registry contract 与生成 contract 相同；
- package 依赖闭包完整；
- 代码中的 `ui://` URL 不越出允许包集合。


### 5.7 inventory 与文档索引

`docs/inventory.json` 保留框架和 core 基座，verifier 合并 `apps/plugins/*/plugin.json` 中的 capability fragment：

- 普通 plugin fragment **只能**声明 `extra`，禁止修改 `defaultModules`、`defaultScene`、`routeOfTruth` 和
  `workspaceCommandScope`；
- category 为 `extra` 的 fragment **必须**在 `docs` 中包含 `docs/EXTRAS.md`；`core` 则**必须不含**
  （现有 verifier 已双向断言）；
- 声明了独立 `launch` 的能力**只能是 `extra`**，且 `launch` 必须能实际启动其 `defaultEntry`（verifier 另校验
  命令与入口的对应关系）；
- 晋升 core、改变默认入口或修改项目边界仍需显式修改中央 inventory 和计划；
- manifest 只记录 `planned/registered/source-present/enabled` 等结构状态，不使用 `implemented/verified` 冒充
  测试实跑或人工验收；
- 生成 `docs/plugins.generated.md` 作为能力索引，根文档只链接该索引，不在多处复制状态。

一次性迁移后，`EXTRAS.md` 保留额外能力的政策、边界和生成索引入口；具体 extra 条目由 manifest +
generated index 成为机器发现真相，verifier 不再要求人工在 `EXTRAS.md` 逐项复制。verification fragment
只能引用能实际发现该 plugin 的固定聚合命令，防止登记一个存在但不覆盖 plugin 的脚本而假绿。

⛔ 生成器不能自动写**当前计划文件**（写作时为 plan-v4.md）的验收结果。实跑证据、开放问题和“已完成”判断仍由
人工维护。实施时以 `docs/inventory.json` 的 `routeOfTruth.corePlan` 为准，而不是本文写死的文件名；并补一条
反例：把任一 `plan-*.md` 加进 writer 的允许输出集合后，生成器自检必须红。


### 5.8 同步与资源产物

正常新增 plugin 后，机械变化必须来自 §5.5 的唯一 provenance 表。路径分类可概括为：

```text
apps/shared/src/plugins.generated.ts
apps/shared/src/protocol/lobbyRpc/registry.generated.ts
apps/shared/src/logic/plugins.generated.ts
apps/client/src/generated/**
apps/client/src/shared/**
apps/Cocos/assets/src/**
scripts/protocol.fingerprint
scripts/fgui.manifest.json
apps/Cocos/assets/resources/ui/<该 plugin 声明的新包>/**
该 plugin 新资源对应的 .meta
```

codegen/sync 产物禁止手改；FGUI 二进制和图集由 FairyGUI 编辑器导出，再通过 manifest 接受和校验。整个
`resources/ui/**` 不是无条件白名单：普通 plugin 只能新增自己声明的 package/output，修改或删除既有公共包仍是
真实侵入。

机械 diff 白名单必须有限且可机检：普通 generated text 可由 writer 覆盖；协议/FGUI lock 只能显式接受；镜像
只能由 sync 写入；新资源可以新增 `.meta`，但既有 `.meta` UUID 改变不能被归类为普通机械变化。白名单外的
既有文件出现修改、删除或重命名时，必须按真实框架侵入处理。

⚠ **手工场景 / 预制体资产不在白名单内。** `apps/Cocos/assets/scene.scene` 里序列化着 `Main` 的
`@property`（`serverUrl` / `portalUrl`；`gameplayId` 未被序列化，仅是 `Main.ts` 的类默认值）；把这些属性
搬到 bootstrap 组件会改变组件序列化形状，必须在 Creator 编辑器中重新序列化并**人工审查**该 diff，⛔ 只能
由编辑器产生。（若 `Main` 保留这些 `@property` 并只转发给 `AppRuntime`，则不触发该 diff。）`gameplayId`
这个编辑器字段在 Home 数据驱动化之后应从 `Main.ts` 删除；它不在 scene.scene 里，删除不产生场景资产 diff。


## 6. 服务端改造

前半章（§6.1–§6.9）是 GameRoom 侧：拆掉 ballMove 默认语义、通用 policy、可回滚开局事务、房间状态机与
邀请码。后半章（§6.10–§6.14）是 Lobby RPC 侧：metadata 驱动的 `defineRpc`、幂等 v2 与受控 operation 查询。
两者共用 `core/infra/` 的 Redis Lua 装载器与 `keys.ts` 的 key 构造器，但 ⛔ **不共用记录结构**——
`StoredIdem` 是「请求 → 结果」的幂等记录（30/60 秒量级 UX 快闸），邀请码租约是「六位码 → 房间」的占位
记录（生命周期是房间 Waiting 期，需 renew 与绝对 deadline）。

### 6.1 删除 ballMove 默认语义

第一步必须是行为等价地把 ballMove 从 `GameRoom` 公共壳中拔出：

- Move、CastSkill、出生/复位、fixed-step、死亡、settle、replay/evidence 全部迁入
  `apps/server/src/rooms/modes/ballMove/**`；
- 删除 `usesDefaultBallMoveRules`；
- 删除找不到 mode 时回退 ballMove 的行为，未登记 mode 必须 fail-fast；
- 测试专用 `injectInput()` 下沉到 ballMove harness，不要求每个玩法实现 ballMove 输入形状；
- replay/evidence 变成可选 mode capability，Snake 未声明时明确不产出 ballMove 证据。

只有完成这一步，后续 registry/policy 才是真正的玩法无关，而不是把特判藏到接口后面。


### 6.2 通用 policy

建议把玩法规则与房间组合拆开：

```ts
interface GamePlugin<
  TState extends Schema & RoomBase,
  TPlayer extends Schema & PlayerBase,
  TContract extends GameplayWireContract,
> {
  readonly id: string;
  readonly contract: TContract;
  readonly commands: GameplayHandlers<TContract["c2s"]>;
  createPlayer(context: PlayerFactoryContext): TPlayer;
  readonly lifecycle?: GameplayLifecycle;
  readonly evidence?: GameplayEvidenceCapability;
}

interface RoomProfile {
  readonly id: string;
  readonly mode: string;
  readonly startPolicy: StartPolicy;
  readonly accessPolicy: AccessPolicy;
}

type StartPolicy =
  | { readonly kind: "auto" }
  | {
      readonly kind: "owner-ready";
      readonly requireAllReady: true;
      readonly requireConnected: true;
    };

type AccessPolicy =
  | { readonly kind: "matchmaking" }
  | {
      readonly kind: "invite-code";
      readonly leaseTtlMs: number;
      readonly renewIntervalMs: number;
      readonly waitingDeadlineMs: number;
      readonly codeCooldownMs: number;
      readonly maxConcurrentRoomsPerUid: number;
    };
```

**人数只有一个真源。** `min` / `max` / `autoStart` 都来自 manifest（今天已落地为 `GameMode.roster`，见 §2.2），
`StartPolicy` ⛔ **不重复声明任何人数**——两份声明必然漂移。这也是为什么 `auto` 分支不带 `minPlayers`：
自动开局人数用 manifest 的 `autoStart`，它与 `min` 是两个字段（现仓 `assertGameModeRoster` 校验
`min ≤ autoStart ≤ max`），只写一个 `minPlayers` 会丢掉“min=2 但 3 人才自动开”的表达力。

因此本节的 min/max/autoStart **不是新发明**，而是把已落地的 `GameModeRoster` 从 mode 对象搬到
profile/manifest。迁移时 `assertGameModeRoster` 及其 ballMove 证据耦合断言（声明 `ballMove@1` ruleset 时
`min` 与 `autoStart` 必须都等于该 ruleset 的固定人数）要一并迁到 codegen / 启动期，⛔ 不能留成第二道与
manifest 打架的闸。

硬容量同理不在 `StartPolicy` 重复声明，只从 manifest 的 `maxPlayers` 生成。启动时必须断言 generated state
上限、admission cap 和 Colyseus `maxClients` 完全相等。`AccessPolicy.invite-code` 的四个时间/配额参数的
不等式约束见 §6.7 第 6 条，同样在启动期断言。`RoomProfile` 允许同一 Snake 规则以后同时组合为私房 Ready 或
公共自动匹配，而不复制 mode；profile 自己也进入 join validation 和普通撮合隔离。

**两种 `startPolicy` 的失败归属不同，必须分别规定**：`auto` 由新玩家 onJoin 触发，开局失败沿用当前语义
——回滚 roster 并以 join 拒绝回给**触发者**；`owner-ready` 由房主的 C2S Start 触发，开局失败**只能**回滚到
Waiting 并向房主返回可重试的稳定错误，⛔ **绝不允许移除房主或触发 owner 转移**。

registry 仍需在运行时确认 `createPlayer()` 返回正确 Colyseus `Schema`，且公共 `id/name` 未被篡改；启用
owner-ready/invite profile 时，codegen 与启动期都必须确认相应 state fragment 存在。玩法 handler map 的 key
必须从自己的 shared C2S contract 派生，不能退化为任意字符串 map。

Ready/Start 和六码不是 Snake 特判，而是可复用的 core policy：

- `Ready` 只能在 Waiting 修改，玩家入座默认未 Ready，房主也必须 Ready；
- `Start` 只能由当前 owner 发起；
- 当前人数必须在 `[minPlayers, maxPlayers]` 内，且精确 roster 全员 Ready；
- 当前 roster 必须全部在线；drop/reconnect 增加 `connectionRevision`，掉线会使在途 Start 失效；
- 第五人由 admission 和 `maxClients` 双重拒绝；
- owner 仅在最终离开后转移，当前 10 秒可重连宽限内不转移 seat、owner 或 Ready；
- owner 最终离开后按确定规则转移，例如最早仍在房成员；无人时销毁房间；
- invite-code 房间**在 `onCreate` 体内、listing 首次持久化之前**调用 Colyseus `setPrivate(true)`，避免被普通
  `joinOrCreate` 撮合选中；⛔ 不要把 `persist = false` 复制到 `onCreate` 之外（详见 §6.8 的说明）。private
  只控制 listing 可见性，不替代 access ticket 与 admission；
- Playing 后 lock、关闭邀请码并拒绝中途入座。

高频 command handler、玩法 `onAdmission` 与 `onStep` 必须同步、确定且有预算；异步 ticket/lease 验证属于 core
access transaction，不能泛化成任意 mode 异步 admission。其他异步 I/O 只允许出现在 initialize、start、
settle/dispose 等明确 lifecycle 边界，重计算继续遵守 `SERVER.md` 的 compute task 约束。


### 6.3 开局必须是可回滚事务

“检查一次 allReady 后 await lock”仍有竞态。Start 应采用 generation/revision fencing：

```text
收到 Start
  → 校验 caller/phase/人数下界/allReady/allConnected
  → 同步标记 starting + admission fence，阻止重复 Start 和新 seat
  → 同一同步段内一次性快照 fence 元组
    { owner, sessions, rosterRevision, readyRevision, connectionRevision }
  → await bounded room.lock
  → 按整个元组重验
  → await mode.initialize
  → 再次重验
  → await mode.start
  → 最终重验并发布 Playing
```

fence 元组必须在**同一个同步段**内一次性快照为不可变值，每个 await 边界后按**整个元组**比较，⛔ 禁止分次
读取或只比其中一项。分工是：session 集合负责成员身份（join / 最终 leave 由它覆盖），三个 revision 负责成员
身份之外的属性变化（Ready、connected、owner）。

任何 await 边界发生 join、最终 leave、Unready、owner change、dispose 或元组变化，都必须使本次启动失效并
走统一 rollback。lock 失败应恢复 Waiting；若 unlock/rollback 也失败，则沿用当前 fail-closed 语义关闭房间，
不能公开一个 roster 错误但已 Playing 的对局。rollback ⛔ 不改变 roster 与 owner，只清除 start fence 与
starting 标记；**Ready 状态是否保留必须显式规定**——本文取“保留”，否则每次 lock 抖动都要求全房重新 Ready。
lock 成功前不得发生客户端可见的 mode state mutation；需要昂贵预计算时只能增加无副作用、结果可丢弃的
`prepare`，不能冒充 initialize。

**Starting 必须对客户端可见，且 Ready 在 Start 在途期间被拒。**

§4.6 的 `OwnerReady` fragment 增加低频控制字段 `starting: boolean`。它在第一个 await 之前置位，rollback 或
发布 Playing 时清除；置位期间 `Ready` / `Unready` 的 core handler 一律以 §6.5 的“Start 在途”稳定错误拒绝，
客户端据此禁用按钮。因此 Start 在途只需对 join / 最终 leave / drop / dispose 做重验，⛔ 不需要观察
readyRevision。

产品语义因此是：**成员点下 Ready 即为承诺，房主按下 Start 之后成员无权反悔。** 掉线仍然会使开局失效
（那不是意图，是事实），但主动 Unready 不会。

> 被否决的替代方案：保留“Unready 使 Start 失效”，即成员可否决开局。否决理由是它必须额外定义重试上限与
> 退避——否则单个成员（手抖或恶意）可以无限阻止开局；而四人私房 Demo 里房主已经是权威角色，让成员在 Start
> 在途期间否决只会制造“Start 按钮点不动”的困惑。若将来产品要改回该语义，必须同时补齐重试上限与退避，
> 并把 §6.4 的推进点表恢复对 readyRevision 的观察。

⛔ 无论如何都不允许维持“phase 仍是 Waiting、Ready 合法、其他客户端 state 无任何变化”的三不管窗口——那个
窗口最长可达一个 lock 超时周期。

还必须保留当前已有的 late-lock 防护：`lockWithDeadline + lifecycle abort` 超时后继续观察底层 lock 的最终结果；
若它晚到成功，立即释放 stale lock；在晚到结果收敛前以 retry fence 拒绝第二次 Start。普通“catch 后 unlock”
无法处理 Promise 已超时但底层稍后改成 locked 的情况。

retry fence 的观察必须有**绝对上限**（建议 ≥ 一个 lock 超时周期，且 ≤ 该 profile 的 `waitingDeadlineMs`）。
超过上限仍未收敛，房间必须 fail-closed——释放邀请码 lease、下发不可恢复错误并 dispose。invite-code profile
可由 `waitingDeadlineMs` 兜底，但必须在实施时显式关联；`matchmaking` profile 没有 deadline，**必须自带这一
上限**。⛔ 不允许留下“看起来在 Waiting、却永远开不了局”的僵尸房。


### 6.4 房间状态机

```text
create private room
  → Waiting / owner seated / code active
  → members join by ticket / Ready independently
  → owner presses Start
  → Starting（内部事务态；⛔ 不作为长期 wire phase，但按 §6.3 必须以 `starting: boolean`
              暴露给客户端用于禁用按钮）
  → freeze roster + initialize + lock + recheck
  → Playing / code inactive
  → Settle
  → exit or dispose
```

**revision 推进点表**（⛔ 新增 Start 前置条件时必须同步扩展本表）：

| 事件 | rosterRevision | readyRevision | connectionRevision | 精确 session 集合 |
| --- | --- | --- | --- | --- |
| join（落座） | +1 | — | — | 变 |
| 最终 leave | +1 | — | — | 变 |
| Ready 置位 | — | +1 | — | 不变 |
| Ready 清除 | — | +1 | — | 不变 |
| drop 进入宽限 | — | — | +1 | 不变（seat 保留） |
| reconnect | — | — | +1 | 不变 |
| owner 转移 | +1 | — | — | 不变 |

闭合规则：**任何会改变 Start 前置条件的状态变更，必须至少推进三个 revision 之一，或改变精确 session 集合。**

异常规则：

- Waiting 新入座者默认未 Ready；其他人的 Ready 可以保留，新成员自然使 `allReady=false`；
- 按 §6.3，`starting` 置位期间 `Ready` / `Unready` 已被 core handler 拒绝，因此 Start 在途只需对 join /
  最终 leave / drop / dispose 做重验；
- 可重试 transport close 进入当前 10 秒宽限，seat/owner/Ready 保留，但 connected=false 并增加
  `connectionRevision`；离线成员存在时不能 Start，Start 在途遇到 drop 立即失效；
- reconnect 恢复 connected 并再次增加 revision；主动离开、强踢或宽限失败才是最终 leave；
- renew 失败（§6.7 第 5 条的 `lost`）使当前 `roomCode` **立即失效**；wire 上的 `roomCode` 只是尽力展示值，
  唯一权威绑定由 resolve 侧的 lease generation 校验承担；
- owner 最终 leave 后才转移 owner；如果转移后剩余成员已全部 Ready，新 owner 仍需再次点击 Start；
- Playing 中掉线按 Snake 规则决定蛇暂停、继续或淘汰，这属于 mode，不属于 core；
- Settle 后首期返回 Home；是否 rematch 应另定义新一轮 roster/ready/code 语义，不能复用未清空状态。


### 6.5 稳定错误与恢复

**内部原因枚举**（日志 / 指标 + 客户端文案分类的上游，⛔ 不等于对外错误码）：非法码、码不存在 / 过期 /
处于隔离期、房已满、房已开始、ticket 非法 / 过期、不是房主、有人未 Ready、人数不足、Start 在途 / 失效、
玩法版本不匹配。其中 `房已开始` 按 §6.8 只作为**内部**原因存在，对外已折叠进 `ROOM_CODE_UNAVAILABLE`。

**对外稳定错误码**按 §6.8 的两类口径收敛（折叠类 / 保留类），并且必须**双端单源定义**。日志和指标保留不含
token / ticket 的内部原因。

**第三类：暂时不可用 / 结果未知。** 协调 Redis 或撮合层不可达时，`resolve`、`prepareCreate` 与 Start 必须
返回**可重试**的 `SERVICE_UNAVAILABLE` / `RESULT_UNKNOWN`，⛔ **绝不允许降级为「码不存在」「房已开始」这类
确定性结论**——那会把一次基础设施抖动变成用户可见的错误事实。客户端对该类错误只做退避重试、不做导航；
口径与 §6.12 / §6.3 的 ResultUnknown 保持一致。

房间类预期失败不能清除有效登录态。只有明确的会话失效错误才回登录；邀请码、满员、Ready 和 Start 错误都回到
Snake Lobby/Waiting 页面并允许重试。


### 6.6 六位邀请码：码与内部房间分离

`roomCode` 必须是字符串并严格匹配 `^\d{6}$`，因此 `000001` 合法，数字 `1` 不合法。它只在当前区服范围内
定位房间：

```text
(project, sId, roomCode) → opaque Colyseus roomId + mode/profile + lease generation
```

不要把六位码自定义成 Colyseus `roomId`，也不要依赖 `filterBy(roomCode)` 做准入。公共撮合仍可使用现有
`filterBy(["sId", "mode"])` 的原则，并一次性扩为 `filterBy(["sId", "mode", "profile"])`；
邀请码房在创建期标记为 private，不进入普通撮合候选。好友先 resolve，再定向 `joinById`，最终权威检查仍在
GameRoom auth/admission。

同样 ⛔ **禁止把 `roomCode` 写入 listing metadata 或任何 `filterBy` 字段**：`setPrivate` 只影响公共撮合的
`private:false` 过滤，不影响 driver listing 的全量列举，开发环境的 `/monitor` 与 playground 会连同 metadata
一起展示私有房。房内的 `roomCode` 只通过已鉴权的 room state 下发给已入座成员。


### 6.7 邀请码租约实现

通用 InviteRoom 服务应使用 coordination Redis accessor（开发环境可能与 durable Redis 共用实例，不能使用
可淘汰 cache Redis）：

1. 用 Node `crypto.randomInt(0, 1_000_000)` 生成并 `padStart(6, "0")`；
2. 以 `SET key value NX PX ttl` 有界重试碰撞。**耗尽分支**：有界重试全部失败视为码池拥塞，fail-closed 返回
   稳定错误并计入告警指标，⛔ 不得扩大重试次数，也不得降级为更长的码；
3. value 携带 `roomId/mode/modeVersion/profile/sId/leaseToken/generation`，不存玩家 token；
4. renew/release 使用 Lua/CAS 校验 owner `leaseToken`，旧房不得续租或删除后来重用同一码的新租约；
5. **renew 必须返回 `renewed | lost | unknown` 三态，并规定失败后的行为**：
   - `lost`（CAS 明确不匹配）表示该房已**永久**失去该码，必须在同一个同步段内 (a) 立即清空 state 的
     `roomCode` 并广播稳定的“邀请码已失效”S2C；(b) 按 `generation + 1` 重新 `SET NX` 申请**一个新码**，
     或按不可恢复处理并 dispose。⛔ 禁止继续展示旧码；⛔ 禁止重新 `SET NX` 抢回同一个码——那会踩到新持有
     者的租约；
   - `unknown`（I/O / 超时）走有界重试；累计 unknown 时长一旦超过 `leaseTtlMs`，必须按 `lost` 处理——此时
     已无法证明自己仍持有该码；
6. 三个时间参数必须满足 `renewIntervalMs ≤ leaseTtlMs / 3`（允许连续漏两次 renew 仍不失租）且
   `leaseTtlMs < waitingDeadlineMs`。短 `leaseTtlMs` 负责崩溃回收，`renewIntervalMs` 负责健康房续租，
   不可续的绝对 `waitingDeadlineMs` 负责关闭僵尸房；达到 deadline 后关闭并 dispose，不能只释放 code 留下
   永久不可加入的 Waiting 房。`waitingDeadlineMs` **只在 `starting === false` 时求值**；一旦 start fence
   置位，deadline 推迟到本次 Start 收敛之后再判定，⛔ 不允许 deadline dispose 与在途 Start 抢跑。三者与
   §6.3 的 lock 超时一起在**启动期断言**（与「generated state 上限 / admission cap / `maxClients` 三者相等」
   同形），⛔ 不允许留到运行时才暴露。§12.4 第 3 条只冻结**数值**，不替代这里的**不等式**；
7. Start 成功和 room dispose 都把码从 active 转入**隔离态**：对同一 Redis key 写入 tombstone value、
   `PX = codeCooldownMs`，⛔ **不是 `DEL`**。隔离期内 `resolve` 一律返回与“码不存在”完全相同的折叠错误；
   分配器的 `SET NX` 因 key 仍存在而不会重用该码；隔离期满由 TTL 自然回收。进程崩溃由短 TTL 回收，
   崩溃场景没有隔离期是刻意的取舍（崩溃后不存在仍持旧码的客户端会话可被误导）。
   > **本文取 tombstone**：它与第 2 条的 `SET NX` 分配器天然兼容、不引入新依赖，且 Start 后码立即可回收、
   > 码池压力最小。
   > 被否决的替代方案：「码持有到 dispose 为止（Start 后只置 inactive），dispose 之后再冷却」。它的唯一优势
   > 是能让 Playing 期间的 resolve 返回准确的“房已开始”；本方案接受失去这一区分（见 §6.8），
   > 换取实现简单性与码回收速度。
8. Redis 故障 fail-closed，不创建一个没有可解析邀请码的“半成功私房”；**创建成功之后**才发生的故障按第 5 条
   的 `unknown → lost` 收敛，⛔ 不允许房间在无法证明持码的情况下继续对外展示邀请码。

`generation` 是 per-`(sId, code)` 的**单调递增分配代号**：独立于 lease value 存放（单独的 `INCR` 计数器 key，
永不重置、永不随 lease 释放而删除），每次成功分配该码时 +1，lease value 内嵌当次的快照。它让任何在途
ticket 或异步回调能识别出“我引用的是上一代分配”。⚠ generation 只保护**在途引用**，不保护**人工重新输入**
——旧六位码在冷却期后仍会被 resolve 按新一代签出合法 ticket，因此码回收的安全性依赖 `codeCooldownMs`，
不依赖 generation。⚠ 本文至少有三个不同层的 generation（Start 事务 revision、presentation host generation、
lease generation），⛔ 不是同一个量。

`leaseToken` 是该码的续租/释放**能力凭证**：CSPRNG ≥128 bit，每次分配重新生成，除服务端进程内存与 Redis
value 外不得出现——⛔ 不进 resolve 响应、不进 room state、不进日志与指标标签、不进 `RoomClient` 的 ownership
key；CAS 比对使用恒定时间比较。（§4.4 的 token 禁令只覆盖客户端 join options，服务端侧需要本条。）

所有 key 必须通过 `apps/server/src/core/infra/keys.ts` 新增的专用构造器生成，且 **`sId` 作为显式参数逐层
传递**，⛔ 不依赖 `zoneCtx` AsyncLocalStorage：GameRoom 不在任何 `zoneCtx.run` 作用域内（区是房级常量），
而 `prepareCreate` / `resolve` 跑在 LobbyRoom 的 `zoneCtx.run({sId})` 里；create 与 renew/release 若一侧读
ALS、一侧读房级 `sId`，就会打到不同 key。`sId` 取 GameRoom 已有的房级值（onAuth 权威区号），随 lease value
存入并在 CAS 时比对。


### 6.8 prepare/resolve 与 access ticket

新增两个稳定 core Lobby RPC：

```text
room.prepareCreate({ mode, modeVersion, profile })
  → { creationTicket, expiresAt }

room.resolve({ code })
  → { roomId, mode, modeVersion, profile, joinTicket, expiresAt }
```

两个 handler 都在现有 `LobbyRoom` 建立的 `zoneCtx.run({sId})` 中执行，通过 `currentZoneId()` 读取权威区号，
不接受客户端自报 `sId`；邀请码本身不要求为此修改 `RpcCtx`。

**执行模式与向量（必须在实施前定死）**：

- `room.resolve` 归 **`query`**（不产生领域写入）。
- `room.prepareCreate` 归 **`idempotent-write`**，请求携带 `clientReqId` 并进入通用幂等层，其 creation ticket
  的 `jti` 状态机建立在通用版本化记录之上而**不另起一套**。若要改归 `natural-write`，必须显式论证
  “重复调用只产生可丢弃的额外 ticket，且 ticket 过期前不会造成多房 / 多租约泄漏”的收敛性，⛔ 不能默认。
- 两条路由必须各提供 request / response 最小合法向量 sidecar（对应
  §5.6 拟新增的 `apps/server/test/lobbyRpcVectors/room.ts`），
  并进 §10.2 验收清单。

**ticket 形态（唯一形态，⛔ 不并存第二种）**：creation / join ticket 一律是 CSPRNG 生成的**不透明串**
（≥128 bit，`crypto.randomBytes` + base64url），串本身**不携带任何自描述声明**。全部绑定字段
（`uid / sId / roomId / mode / modeVersion / profile / lease generation / purpose / jti / exp`）与
`issued → pending(session) → seated` 状态一起存放在 coordination Redis 的 ticket 记录里，key 经 `keys.ts`
构造并带项目 / 区前缀、`PX = exp`；claim 就是对该记录的 Lua CAS 状态推进。服务端只存 ticket 的 sha256，
比对沿用既有会话凭证的 sha256 + `timingSafeEqual` 范式。⛔ **本方案不引入自包含签名 token，也不引入任何新的
签名密钥**——仓内当前没有 HMAC/JWT 设施，引入密钥管理属于独立议题。

`prepareCreate` 签发短期、绑定 `uid + sId + mode + modeVersion + profile + purpose=create + jti + exp` 的
creation ticket。签发前必须**原子检查该 uid 当前活跃 invite room 与未消费 creation ticket 的总数**，超过
`maxConcurrentRoomsPerUid` 直接拒绝；未消费 ticket 计入配额并随 `exp` 自然回收。

GameRoom `onCreate` 必须先验证 / 原子占有该 claim，由 claim 固定 `expectedOwnerUid`，并**在 `onCreate` 体内、
listing 首次持久化之前**调用 `setPrivate(true)`；创建者 `onJoin` 再把 `client.auth.userId` 与 expected owner
比对。禁止用“第一个入座者”、客户端自报 `kind=create` 或 `players.size===0` 推断房主。

> `setPrivate` 在 Colyseus 0.17 的签名是 `setPrivate(bool?, persist?): Promise<void>`。MatchMaker 在
> `await onCreate()` **之后**才把房间置为 `CREATED` 并统一 `driver.persist(listing)`，因此在 `onCreate` 体内
> 调用时房间尚未 `CREATED`，`persist` 参数无影响，private 标记随后随那次统一持久化落库——房间**从不曾**以
> public 身份出现在 listing 里。
> ⛔ **禁止把 `persist = false` 复制到 `onCreate` 之外**（ticket 校验的异步回调、`onJoin`、运维“切私有”路径）：
> 那只改本进程内存 listing，跨进程 driver 里仍是 public，房间照样会被 `joinOrCreate` 选中。运行期切私有必须
> 用 `setPrivate(true)`。private 只控制 listing 可见性，⛔ 不替代 access ticket 与 admission。

`resolve` 需要：

- **专用速率预算**。resolve 命中即签发准入凭证，因此枚举预算按**准入强度**而非查询强度设定；六位码空间只有
  10^6，是可被横扫的。必须使用**独立于 dispatcher 通用 RPC 桶**的专用桶：至少区分 per-uid **失败**预算与
  per-uid **成功**预算，并另设全区失败速率上限对抗多账号横扫；桶 key 经 `keys.ts` 的 `kRl` 构造并按铁律 8
  先登记。⛔ **复用通用 RPC 预算不算满足本条。** 具体数值在阶段 0 与产品一起冻结并写进 config；
- 权威校验 code、区和 lease generation 仍有效；
- phase、starting、reserved seats 和容量只能作为最佳努力 UX 快照，不得宣称 resolve 已预留座位；
- **对外错误分三类**，避免把 resolve 变成存在性预言机：
  - **折叠类**——`码不存在`、`处于隔离期`、`已过期`、`mode/profile 不匹配`、`区不匹配`，统一返回同一稳定码
    （例如 `ROOM_CODE_UNAVAILABLE`），响应体不带 detail、不回显 code；
  - **保留类**——`房已满` 保留独立码（持码者本就是被邀请方，客户端需据此给出返回引导）；
    `码格式非法` 单独返回 `INVALID_PAYLOAD`；
  - **可重试类**——`Start 在途`。§6.7 第 7 条取 tombstone 之后，码在 Start **成功**的瞬间即进隔离期，
    因此 resolve 能命中的“已开局”窗口只剩 start fence 已置位、Playing 尚未发布的那一小段；该段返回可重试的
    “Start 在途”（§6.5），客户端退避后重试即可得到确定结论。

  > ⚠ **连带影响**：`房已开始` **不属于**保留类，它在 tombstone 方案下已不可达——Playing 之后码已进隔离期，
  > resolve 只会得到折叠类的 `ROOM_CODE_UNAVAILABLE`。这是 §6.7 取 tombstone 的**已知代价**：好友在对局
  > 进行中输码，只能看到“码不可用”，分不清是输错还是已开局。若产品认为该区分必要，必须回到 §6.7 的
  > 「持有到 dispose」方案，⛔ 不能只在这里单独恢复一个不可达的错误码。

  真实原因只进服务端日志与指标，且 ⛔ 不与 code / ticket 同行记录；
- 签发短期、绑定
  `uid + sId + roomId + mode + modeVersion + profile + lease generation + purpose=join + jti + exp` 的 join ticket；
- 由 GameRoom 在 `joinById` 时原子 claim ticket，并最终检查 auth、mode/profile、容量、phase、starting 和 lease。

裸 `roomId` 不是完整授权。resolve 时的“有空位”也不是预留座位，真正入座仍以 GameRoom 的原子 admission 结果
为准。creation/join ticket 都必须使用安全随机 `jti` 和有界状态机，至少保证同一 uid/room 至多一个 pending
admission：`issued → pending(session) → seated` 通过 CAS 推进；安全的入座前失败可在原 expiry 内恢复为
issued，同 ticket 并发或 seated 后重放必须拒绝。重连使用 Colyseus reconnection token，不重复消费 access
ticket。

**准入时序（固定，⛔ 不得重排）**：

1. 同步校验 start / admission fence 与 phase；
2. 同步占用 `pendingSession / pendingUid / pendingSeat`，容量计算包含 pending；
3. **异步** claim access ticket（`issued → pending(session)` CAS），并校验 `roomId / mode / profile /
   lease generation`；
4. await 返回后**同步重验** fence、phase、roster 与容量；
4.5. **异步** `mode.onBeforeAdmission`（唯一允许 await 的玩法钩子；只做持久档预热，⛔ 不分配房间资源；
   reject = 拒绝入房）；
5. **同步**调用 `mode.onAdmission`；
6. 落座，并把 ticket CAS 到 `seated`。

第 2–5 步任一失败都属于下文所说的“入座前的安全失败”，必须释放 pendingSeat 并把 ticket 在原 `exp` 内退回
`issued`；只有第 6 步成功之后 ticket 才不可回退。⛔ **不允许把 `mode.onAdmission` 排在 ticket claim 之前**
——那会让玩法资源分配先于权威准入。

静态 envelope/auth 只校验身份和 ticket 形状，`roomId` / lease generation 绑定必须由目标 room instance 重验，
不能让一个可重放的 ticket 串直接等于 admission。


### 6.9 邀请码用户流程

```text
房主点击“创建房间”
  → Lobby room.prepareCreate(snake.private)
  → RoomClient.create("game", snake join options + creationTicket)
  → GameRoom 验证 expected owner、设为 private、创建邀请码 lease
  → 房主入座并看到 roomCode

好友输入六位码
  → Lobby room.resolve(code)
  → 得到 roomId + joinTicket + mode/profile
  → RoomClient.joinById(roomId, exact join options + joinTicket)
  → GameRoom 再次验证 ticket/区/mode/phase/capacity
  → 入座，默认 Ready=false
```

输错码必须停留在房间页并显示可重试错误，不能退化为 `joinOrCreate` 后创建新房，也不能清除仍然有效的登录态。


### 6.10 `defineRpc` 由 metadata 驱动

endpoint 的目标形态应收敛为：

```ts
export default defineRpc(UndergroundIdleRpc.Activate, {
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


### 6.11 payload 绑定幂等

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
这与 §6.7 对邀请码 key 的要求对称。

> **`IN_PROGRESS` ≠ 操作未完成。** 第 3–6 步的通用幂等记录是 §6.13 所说的 transient gate，`IN_PROGRESS` 只表示
> “通用闸当前被占用”，⛔ **不表示“操作尚未完成”**——孤儿 lease 下两者会不一致。客户端收到 `IN_PROGRESS` 后的
> 恢复路径是 §6.13 的查询路由，**不是**继续重试写路由。对**未**声明 `operationGroup + inspectable` 的路由
> （本阶段除 undergroundIdle 外全部），其 ResultUnknown 窗口以 pending TTL 为上界，窗口过后重试是安全的。

canonicalizer 必须有跨嵌套对象、Unicode key、数组、可选字段和 key 顺序变化的 golden vectors；其他语言或领域
代码不得自行解释“稳定排序”。构造摘要时从副本排除 `clientReqId`，不得修改随后传给 handler 的 validated
payload。该同步工作发生在 handler 预算外，必须依赖 transport `maxPayload`、validator 深度/长度上限，并为最大
合法 payload 增加 dispatcher 级耗时探针，防止 hash 成为新的事件循环阻塞点。


### 6.12 唯一 lease 与 CAS 完成

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
release，只能放弃；客户端在该窗口内看到的是 `IN_PROGRESS`，恢复路径按 §6.11 的衔接说明走查询路由。

⚠ **孤儿 lease 不能默认是罕见路径。** 仓库已有加载期不变量 `IDEM_PENDING_MS > HANDLER_TIMEOUT_MS`，但它
**不充分**——超时不取消 handler（`Promise.race`，见 §6.13 末段），handler 实际时长无上界。真正需要保持的是
`IDEM_PENDING_MS > handler 实测 p99`：每条幂等路由必须有执行时长埋点，p99 逼近 `IDEM_PENDING_MS` 的路由要么
拆分、要么单独放大租约；complete CAS 失败要打一条独立的孤儿 lease 指标。


### 6.13 受控 operation 查询

目标 idempotent route 通过 `operationGroup: "undergroundIdle"` + `inspectable: true` 声明可查；查询 route
通过 `inspectsOperationGroup: "undergroundIdle"` 声明自己被授权查询的组。dispatcher 只向该 query handler 注入已经绑定
uid、zone 和 operation group 的只读 capability：

```ts
ctx.operations.inspect(routeType, clientReqId)
```

返回：

```ts
type InspectResult<T extends LobbyRpcIdemType> =
  | { kind: "pending" }
  | { kind: "done"; data: RpcRes<T> }
  | { kind: "result-expired" }   // 含 §6.12 的 done-oversize 墓碑
  | { kind: "unknown" };
```

⚠ `done-oversize` 墓碑必须映射到 `result-expired`，⛔ **不得被归类为 `unknown`**——前者是「确定执行过、
结果不可得」，后者是「无法确定是否执行过」，客户端的恢复动作完全不同。

**`operationGroup` 的所有权规则（⛔ 它不是一个无主的全局字符串命名空间）**：

1. `operationGroup` 是受生成器管理的**受拥有 id**：每个 group 必须由且仅由一个 plugin/domain 在 manifest
   顶层显式 `ownsOperationGroups: [...]` 声明，重复声明由 codegen 拒绝；
2. `inspectsOperationGroup` 默认只能引用**本 plugin 自己拥有**的组。引用他人拥有的组必须同时满足：查询方
   `dependsOn` 被查询方，且被查询方显式 `exposesOperationGroupTo: [<pluginId>]`。任一条缺失即 codegen
   fail closed——这与 §3.4「禁止 plugin 互相直接读取内部状态」是同一条边界；
3. 同一条 route ⛔ 不得同时声明 `operationGroup` 与 `inspectsOperationGroup`；查询 route 必须是 `query` 模式；
4. §5.5 的重复 id 拒绝清单必须包含 `operationGroup`，双向所有权校验也必须覆盖 group 的 owner/consumer 关系。

其余约束如下：

- uid、区号从当前 `RpcCtx` 绑定，客户端不能传入或覆盖；
- dispatcher 同时校验调用方 query route 的 `inspectsOperationGroup` 与目标 route 的 `operationGroup`；
- `undergroundIdle.queryOperation.operationType` 的 validator 只能接受生成的 undergroundIdle inspectable
  route 子集；
- done 结果必须再次通过对应 response validator；
- done 中的缓存 snapshot 可能陈旧，客户端仍按 `stateVersion` 守卫；
- 不暴露 Redis key、payload hash、leaseId 或 holder；
- 腐坏记录返回 `INTERNAL`，不能伪装成 `unknown`。

领域查询仍应先查 durable receipt，再查通用短期状态。对于 undergroundIdle：

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

通用幂等只是 30/60 秒量级的 UX 快闸，不是 exactly-once 真源。undergroundIdle 状态和收据仍必须在同一提交
边界落地，
`unknown` 也不能被解释为安全失败。

**写路径**的“先查收据、后查 `expectedStateVersion`”必须位于同一个用户锁/UoW/CAS 序列化段：receipt read、
状态推进、版本检查、状态写入和 receipt insert 共同构成领域原子操作。只在锁外预读一次收据会出现双 miss。
同一成功操作携旧版本重试时，应回放第一次结果，而不是被误判为新的状态冲突。

完整 receipt 窗口、tombstone 窗口、最大条数和裁剪顺序必须由领域文档化；tombstone 至少保留 route、
clientReqId 和 payload hash。若奖励进入 MySQL、背包、outbox 或其他聚合，上述“同一提交边界”不再成立，必须
重新设计 intent、ledger 和补偿。

`Promise.race` 超时不会取消 handler；超时只结束客户端等待，迟到副作用仍必须依赖领域原子提交、收据、
UNIQUE 或 CAS 收敛。

本阶段只承诺 server-side inspector + `undergroundIdle.queryOperation` 领域适配，不新增全局
`operation.query`。通用 route
无法替不同领域读取异构 durable receipt，也会扩大 `RpcRes<T>` 的 wire/data 暴露边界；未来若单独设计，它也
只能查询 transient gate，不能代替领域查询。


### 6.14 可选的玩家 JSON 聚合适配器

如果预期还有多个挂机、家园或单人养成 plugin，可以在第二优先级增加 `definePlayerAggregate` 或
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

客户端是两类实体耦合最紧的一层：AppRuntime、NavigationService、SessionCoordinator 由 plugin 侧建立，
gameplay module 直接消费同一套 host；View catalog / FGUI contract / Home 菜单**全仓只有一个 writer、一个
产物路径、一套双向闭合测试**（§7.5）。

### 7.1 生成式 Plugin Catalog

生成器根据 `plugin.json` 生成静态 catalog。每个 plugin 至少声明：

- 唯一 id；
- runtime 安装入口；
- 纯 route descriptor module、View metadata path、限定 id 和鉴权要求；
- Home 菜单贡献；
- 页面组和 `keep-mounted | reopen | fallback | discard` 恢复策略；
- 可选的**已登记** gameplay 入口；
- 依赖的 FGUI package 和动态资源 URL。

route 和 View id 建议采用 `<pluginId>/<localId>` 形式，生成期检查碰撞。manifest 是小型纯数据，plugin runtime、
route 和 View 继续懒加载，不能因为引入 catalog 就把所有 `cc`/FairyGUI 模块静态打进普通脚本依赖图。

catalog 中的 plugin/route/menu/View descriptor 是生成期确定的不可变数据，runtime install 不再动态注册这些
条目。route 参数 validator 位于不依赖 `cc`/FairyGUI 的纯 descriptor module：Navigator 先校验 route id 和
可 JSON 化外壳，再加载该纯模块校验参数，最后才 activate plugin runtime 和打开 View。每个 View 的手写 metadata
唯一真源固定为**与 View 同目录**的 `*.view.json` sidecar（plugin 的落在
`apps/client/src/plugins/<id>/view/`，gameplay 的落在自己的 View 目录，见
§7.5），具体路径由拥有它的 plugin 或 gameplay manifest 声明；
根 `plugin.json` 只引用这些路径，不复制内容。每条 View metadata 带 `owner` 字段，生成期检查同一 View 只被
一个 manifest 拥有。


### 7.2 通用 AppRuntime 与导航

建议一次性增加：

```text
apps/client/src/app/
├── AppRuntime.ts
├── bootstrap.ts
├── PluginRegistry.ts
├── PluginHost.ts
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

- `AppRuntime`：构造小型稳定 port 并管理整体 dispose，不做 plugin 分支。它同时定义 **app generation**——
  构造时递增、dispose 时冻结，对应一次 Cocos scene owner 生命周期，替代今天 `view/pages.ts` 里的
  page lifecycle generation（后者今天与 session generation **分开**校验，二者不可互相推导）；
- `PluginRegistry`：消费 generated catalog，解析 plugin、route 和 Home contribution；
- `PluginHost`：只拥有 plugin module 的 app/session scope、安装状态和 dispose，不拥有当前 route。
  **停用由 route refcount 决定**：NavigationService 关闭该 plugin 的最后一个 route 时通知 PluginHost 进入
  `disposing`；session 结束与 app dispose 是强制释放点。`keep-mounted` 策略的 route 显式豁免 refcount 归零
  释放，并必须在 manifest 里声明其常驻代价；
- `NavigationService`：唯一拥有业务 route stack、route handle 和当前 authenticated base route；
- `SessionCoordinator`：**独家**派生并发布所有带 session generation 的高层事件；独占 Lobby join/rejoin、
  GetInfo、回登录和鉴权恢复；final-loss 的“每代一次”由它的 generation gate 保证；
- `LifecycleBus`：**只做无状态转发与订阅管理**——转发 transport 原样事件和宿主 hide/show，
  ⛔ 不持有 session generation、⛔ 不做任何派生；
- `RefreshCoordinator`：合并 foreground、reconnect、reopen 等并发原因，只刷新当前 authenticated base
  plugin/session controller；
- `ports.ts`：只暴露 navigation、lobbyRpc、session、clock、route-scoped ticker、lifecycle、views、launch 等
  必要能力。

这不是通用 DI 容器。plugin 不应得到原始 SDK Room、Redis key 或任意服务定位器，只取得完成自身行为所需的
最小 port。

`pages.ts` 可先保留为登录/公告等旧页面的兼容 façade，但最终只能纯转发到 Navigator/SessionCoordinator；现有
模块级 session owner、reconciler、return-to-login listener、authenticated continuation 和 `closeLobby()` 页面
数组必须迁走，不能让旧接线和新 Coordinator 同时拥有恢复真相。最终新增 plugin 不再向 `pages.ts` 添加
`openXxx`。

迁移期的“两套并存”必须有可执行规则，⛔ 不能只写目标态：

- **(a)** 阶段 5 的**第一个提交**就让 SessionCoordinator 成为 return-to-login / session reconciler 的唯一
  注册方，`pages.ts` 在**同一提交**里删掉自己的注册调用，只保留纯转发的 `openLogin` / `openConfirm`；
  ⛔ 不允许出现「两边都注册、靠顺序取胜」的中间态。
- **(b)** 现有 `net/session.ts` 的那两个注册点是**单槽覆盖式**（后注册者静默替换，先注册者的 disposer 因
  handler 身份比对失败退化为 no-op）。迁移后必须改为**重复注册即 fail-fast**，或至少有一条断言测试证明整个
  启动链路里各只注册一次。

PluginHost 至少需要 `unloaded/loading/active/disposing/failed` 状态；并发加载同一 plugin 必须合流为同一个
Promise。descriptor 非法在 codegen 期 fail closed；runtime install 失败只回滚 controller、订阅和 scoped
provider，不修改不可变 catalog；View/FGUI 加载失败保持可重试。dispose 必须幂等并按依赖逆序执行。

`failed` 的两条出路要写死：**经显式用户意图（再次 launch）回到 `loading`**，每个 app generation 的自动/连续
重试次数有上限；超限后置为 `disabled(app-generation)`，直到下一个 app generation 才复位。

这两个状态必须连回 Home：**PluginHost 的运行时可用性是 catalog 之外的可变叠加层**。§7.4 的 Home composer
在渲染时把 `disabled` / `failed` 叠加到不可变 contribution 上，显示为不可点击 + 可手动重试的入口，
⛔ **绝不允许显示一个必然失败的正常入口**。
NavigationService 的稳定 API 至少包括 `open/replace/back/close/closeGroup`：Navigator 管业务路由栈和页面组，
ViewMgr 只管 View mount/cache/input lease，不拥有业务 route。每次 route open 都返回带 signal/generation 的
ownership handle；close/replace 即使发生在 plugin、package、View 或 setup 的任一 await 中，也必须取消并回滚。

ResultUnknown 不能只保存在 route Logic。增加 plugin-session scoped `PendingOperationJournal`，保存
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
   客户端与服务端共用 shared 里的同一个 canonicalizer 参考实现（§6.11 所指的“仓库唯一参考实现”）并共享同一组
   golden vectors，否则同 ID 重发会被误判为 `OPERATION_CONFLICT`。canonicalizer 放 shared 满足铁律 4
   （纯 TypeScript + ES 标准库），但 **SHA-256 摘要仍只在服务端计算**——客户端不需要也不应计算 hash。
4. **账号边界**：journal 是 plugin-session scoped。主动登出与任何 uid 变化都必须**同步清空整个 journal**，
   `clientReqId` ⛔ 不得跨 uid 复用。

静态依赖门禁必须证明 plugin logic/route 不导入 `WebSocketClient` singleton、Colyseus Room、`cc` 或
FairyGUI；View 目录是引擎依赖例外。Ticker/FrameScheduler 由 route scope 注入，Logic 只消费 monotonic Clock，
close/session change 自动解绑，避免 plugin 再修改 Main。


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
真相**；§11.3 保护清单里的 `net/session.ts` 指的是**迁移完成后**的稳定态。

低层 transport event 只携带 connection/slot generation、单调 sequence 和关闭原因，不反向依赖 session。
SessionCoordinator 再派生带 session generation 的高层事件（LifecycleBus 只转发，见 §7.2），并区分主动关闭、
短暂 drop 和最终 leave：

- `dropped`：当前 plugin 立即禁用写操作；在途写进入 ResultUnknown；
- `reconnected`：只在发送闸重新建立后发布，随后**固定按“先对账、后拉快照”的顺序**执行——先按
  `PendingOperationJournal` 对账未决 operation（走 §6.13 的查询路由确定 applied / pending / unknown），
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
- plugin 不得自行调用 join/rejoin；
- SDK 离线发送队列继续保持禁用，不能借生命周期接口恢复不受控重放。

`onDrop` 的顺序固定为“关闭发送闸 → 在途**写**结算为 ResultUnknown、在途**只读**按可重试失败结算 →
清理 SDK 队列 → 发布 `dropped`”；`reconnected` 只能在发送闸恢复后发布。onLeave、replay guard 失败和 join 后物理死亡都必须汇入一个 generation-gated final-loss 出口，
每代只发布一次；强踢 close code/push 要先规约成 auth-invalid，绝不能触发重连。订阅接口还要提供当前不可变状态
snapshot，或在订阅时立即回放，确保 Lobby 已 ready 后才加载的 plugin 不会永远错过 ready。

最终断线由 SessionCoordinator 重进并对账，成功后保留或恢复原 authenticated base route，失败才清空
authenticated history 并回 Login。临时 popup 默认 `discard`，只有显式声明且参数可重建时才 reopen。普通 popup
不是 refresh owner；它通过父 route ownership 关联到底层 plugin controller。

**回登录 transition 必须包含用户可见提示**，⛔ 不能静默把人踢回登录页。固定次序是：关闭发送闸 → leave →
清空 authenticated route/页面组 → 打开并 **await** 一个 **session 作用域**（不是 route 作用域）的提示视图 →
重开 Login。该提示不属于任何 plugin route，**不受 `discard` 策略影响**，也不是 refresh owner；它的关闭或
超时都必须让 transition 继续，⛔ 不得卡死。回登录原因 → 文案的映射由 SessionCoordinator 拥有（继承现有
`view/pages.ts` 里 AUTH_INVALID 子因 / CONN_LOST / BATTLE_LOST / BATTLE_JOIN_FAILED 的分支），plugin 不参与。
每一步 await 之后都要重校验 app generation + session generation。

foreground、reconnect 和 route reopen 同时发生时，RefreshCoordinator 只合流**当前并发 flight**，key 包含
**app generation**、route-handle generation、session generation 和 connection/recovery epoch；flight settle
后允许下一次正常刷新。非活跃 plugin 不得后台请求快照。

“flight 中再次变脏时最多补一次 trailing refresh”有三处语义留白，必须写死：

1. **dirty 位只能在实际发出请求的那一刻清除**——提前清会让本次 flight 冒领之后的变更，延后清会抹掉窗口内的
   变更，两者都是丢更新。
2. **“最多一次 trailing”是按 flight 计且递归的**：每个 flight（trailing 自身也算一个 flight）settle 时若
   dirty 仍置位，必须再排一次刷新；⛔ 不允许理解为「每个 dirty 周期至多一次」。
3. **刷新失败（超时、drop、错误）必须把 dirty 位重新置位**，由下一次 ready / foreground 触发重试；
   ⛔ 不允许静默丢弃——配合「非活跃 plugin 不得后台请求快照」，静默丢弃会让该 plugin 永久停在陈旧快照上。

另需**背压**：同一 key 的连续刷新有最小间隔与失败指数退避；退避期内的变脏只置 dirty、不新开 flight；
退避上限内仍失败则把该 plugin 标记为 stale 并显示可手动重试的占位，⛔ 不得静默空转。

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

- 菜单数据来自 PluginRegistry；
- 每个 contribution 声明稳定排序字段、标题文本或可用 LocalizePort 的 key、图标和 launch target；
- ballMove 也迁成 built-in contribution，不能保留 Home→Main 专属回调；
- 点击只调用统一 `LaunchPort.launch(target)`，不在 Home 分支 Navigation/gameplay；
- undergroundIdle 使用独立 FGUI 包，后续新增入口不再修改 Home XML。

gameplay 的**实现**仍走 GameRoom 动线（见 §6），但它的 Home 入口
以**同一形状**的 menu contribution 登记——**菜单只有一个数据源**。排序固定为
`slot → order → pluginId → entryId`。

> 注记（2026-09-05，排序字段已退役）：contribution 不再声明 `slot/order`（docs/PLUGIN.md §6
> 「插件只声明身份、位置归宿主」）。全量列表排序改为 `pluginId → entryId`；首屏顺序与默认玩法由宿主
> `apps/plugins/host.json` 声明并生成为 `GENERATED_HOST`；launch 增 `route` 形态（纯 plugin 入口）；
> codegen 另闸 entryId 全仓唯一与一 gameplayId 一贡献者。上文 `slot → order` 表述保留为历史设计记录。

⚠ 实施时必须明确写出：新玩法登记入口时**是否会碰** `apps/plugins/builtin/plugin.json`。若会碰，则
§3.2 第 8 条与 §12.2 的「不再因玩法名修改中央清单」必须相应保留那条例外（已登记）；
若不会碰（contribution 的手写真源在玩法自己的 manifest 里），则那条例外可以删除。⛔ 不能默认它是零成本。

> 注记（2026-09-04，本问句已答）：答案是**不会碰**——contribution 的手写真源就在玩法自己的
> `apps/plugins/<id>/plugin.json`（snake 已落地）；生成器把各 manifest 的 menu 汇总排序进
> `GENERATED_MENU_CONTRIBUTIONS`，Home 与默认 launch target 都只读这一份汇总值。
> 因此 §3.2 第 8 条与 §12.2 的那条例外**已关闭**（两处均就地加了注记，正文作为历史设计记录保留）。
> 代价如实登记：不是零成本，成本 = 新增一个 `apps/plugins/<id>/` 目录 + 一次 `codegen:plugins`
> + 客户端 generated 与 Cocos 镜像 diff；⛔ 但它不再是**中央清单**的手改。

若图标来自跨包资源，manifest 必须声明 URL，由生成器计算 entry package dependency；Home route composer 在
render 前通过受控 package loader 按当前可见 entry 合流加载。**失败时显示明确占位**——占位有两种触发因素：
图标包加载失败，以及 §7.2 所说的 plugin 已 `disabled` / `failed`。⛔ 不允许静默空白，也不允许显示一个必然
失败的正常入口。不得让 View 临时猜测或隐式加载包。


### 7.5 View/FGUI 注册表生成

`viewRegistry.ts` 和 `fguiContracts.ts` 一次性改为稳定 façade，消费 generated registry。唯一输入是 FGUI XML +
`.view.json` 手写 metadata（sidecar 与 View 同目录，见 §7.1）；同一生成步骤分别产生 View AUTO、generated
contract 和 registry，派生的 View AUTO 不能反过来成为 contract 真源。

> **客户端 View catalog / FGUI contract / FGUI 包闭包全仓只有一个 writer、一个输出文件、一套双向闭合测试。**
> 最终文件固定为本节的 `apps/client/src/generated/views.generated.ts` + `fguiContracts.generated.ts`；
> `codegen:gameplays` 只产出 gameplay 的 View contribution
> 中间产物，⛔ 不直接写客户端 View 产物（口径见 §3.1 交汇点表）。每条 View metadata 带 `owner` 字段
> （plugin id 或 gameplay id），生成期检查同一 View 只被一个 manifest 拥有。
> §9 已把本节（阶段 6）排在 gameplay 客户端 module（阶段 9）之前，因此**本生成器与产物路径从一开始就是
> 终态**——gameplay 侧只新增输入类型与 `owner` 取值，⛔ 不存在「先建一套再接管」的过渡期。

生成器负责：

- 从 XML 和同一 binding 规则产生 direct `required`；
- 生成 `defineView` 元数据和静态动态 import；
- 计算 FairyGUI package 传递依赖闭包；
- 把显式 `assetUrls` 所属包加入闭包；
- 校验 route composer/module/export 和 route→view 引用，以及 plugin logic 目录的引擎依赖边界；
- 检查重复 qualified View id 和非法路径。package/component 允许通过显式 `aliasOf` 做迁移期兼容，除此之外
  重复引用必须失败。

仍需在 plugin view metadata 中显式声明：

- layer、fullscreen、onlyOne、permanent、interactive；
- 无命名前缀的手写绑定；
- nested、list item、controller、relation 等业务依赖子集；
- 动态拼接或代码直接引用的资源 URL。

`fgui-codegen` 应支持 plugin 输出目录，并且只写 View AUTO 区；完成后可以提示或运行 plugin 生成器
`--check`，但不得覆盖 registry/contracts，也不得自动执行 FGUI manifest `--write`。它不再要求开发者手改
`fguiContracts.ts` 和 `viewRegistry.ts`。generated view
manifest 给出精确源码路径，`fgui-manifest.mjs`、view registry test 和 contract test 统一消费它，不再各自扫描
目录猜测。现有 FGUI manifest 继续检查全局设计源/导出物闭包与新鲜度；per-view 预加载闭包仍由 View contract
测试负责，两者不能混为同一能力。

页面登记改成 contribution：

- codegen 生成不可变、静态 import 的 View catalog；`ViewMgr` 从注入的只读 catalog 查询 `ViewMeta`，不再读取
  手写的 `VIEW_REGISTRY` 全集。**writer 只有一个**：最终产物固定为 §7.5 的
  `apps/client/src/generated/views.generated.ts` + `fguiContracts.generated.ts`（见 §3.1 交汇点表），
  `codegen:gameplays` 只产出 gameplay 的 View contribution 中间产物。每条 View metadata 带 `owner` 字段
  （plugin id 或 gameplay id），生成期检查同一 View 只被一个 manifest 拥有；
- View metadata 的**手写唯一真源**沿用 §7.1 的 `*.view.json` sidecar 格式与字段集（layer / fullscreen /
  onlyOne / permanent / interactive、无前缀的手写绑定、动态资源 URL，并**必须包含 `sharedPkgs` 传递闭包**）；
  gameplay 拥有的 View 把 sidecar 放在自己的 View 同目录，`codegen:gameplays` 只校验 gameplay View 集合与
  manifest 一致，⛔ 不定义第二种 metadata 格式；
- Login / Home / Confirm 等核心 View 由 built-in plugin 拥有（§7.1）；**gameplay 只贡献自己的** Lobby、
  等待、HUD、结算 View；
- FGUI contract 直接放入 `ViewMeta.contract`，测试遍历 generated catalog，不再维护第二份 `FGUI_CONTRACTS` 全集；
- 生成的 catalog 必须同时产出 **`sharedPkgs` 传递依赖闭包**（含代码里 `ui://` 直引、无法由 art XML 推导的包）
  ——FairyGUI **不自动加载依赖包**，漏一个包按钮就空白（现仓 `viewRegistry.ts` 的条目已逐条声明）。沿用现有
  `viewRegistry` 测试的「`sharedPkgs ⊇ 依赖闭包`」断言，catalog 生成化后改为遍历 generated 条目；§8.4 的
  `PrivateRoomLobby` 模板包与 Snake 自有包的闭包如何合并也要一并写明。图标包闭包沿用同一套计算，
  ⛔ `codegen:gameplays` 不自行实现第二套；
- Home 一次性改为渲染 generated lobby contributions，以后新增玩法只增加 contribution。gameplay 的 Home 入口
  编译成与 §7.4 **相同形状**的 menu contribution（`slot` / `order` / owner id / entryId、标题
  LocalizePort key、图标 URL 与 launch target），菜单只有一个数据源，排序沿用 `slot → order → pluginId →
  entryId`；
- 具体 View 保持动态 import，Logic 继续禁止 import `cc` / `fairygui-cc`。

**必须随 catalog 一起 manifest 化的三条现有守门**（今天都硬编码了目录形状，改布局后会静默失效）：

1. **View 文件集合 ⇔ catalog 键**：现有 `viewRegistry` 测试用**非递归**的 `readdirSync(src/view)` 比对，
   必须改为按 manifest 声明的每个 view 目录递归比对，未登记的 `*View.ts` 必须红。
   ⚠ 注意 `view/rooms/ballMove/BallMoveView.ts` 今天**不在** `VIEW_REGISTRY` 里——让 gameplay View 贡献
   metadata 是一次**范围扩张**，实施时必须显式说明。
2. **View ↔ Logic 配对**：现有测试断言 `logic/page/<Name>Logic.ts` 存在，新布局下不成立；改为 manifest 的
   每个 view 条目显式声明 `logic` 路径，生成器校验其存在且位于该玩法自有目录。
3. **logic 引擎纯度**：现有 `logic-purity` 测试的扫描根硬编码为 `src/logic`，新玩法 logic 目录完全不在覆盖内。
   ⚠ **⛔ 不能简单把扫描根扩到 `src/gameplay`**——现有 BANNED 正则会把 `import type { Node } from "cc"`
   判违规，而 `gameplay/catalog.ts` 今天就这么写。规则应写成**第二条门禁**：「禁止对 `cc` / `fairygui-cc` /
   `db://` 的**值**导入，只允许 `import type` 与字面量动态 import」，覆盖 `apps/client/src/gameplay/**`
   （含 generated catalog），形态参考仓内已有的全 `src` 递归扫描式导入禁令。

本文不做运行时热卸载，因此不引入复杂的 View unregister/disposer 语义。测试需要替换 catalog 时使用独立注入的
registry，不修改生产 catalog；将来确有热卸载需求时，再单独定义 pending open、permanent cache 和已挂载 View
的事务语义。

框架应一次性提供一个小而明确的 `PrivateRoomLobby` 模板，负责“创建/输码、房间码、成员列表、Ready、房主
Start、错误重试”，数据只来自 `AccessPolicy + StartPolicy` 的公共 state/capability。玩法 contribution 可以直接
声明使用该模板并提供标题、图标和 launch 参数；只有确实需要不同交互时才新增玩法自有 Lobby View。不要把它
扩展成能描述任意 UI 的 DSL。

玩法启动与返回**统一由 §7.2 的 `NavigationService` + `LaunchPort` + `SessionCoordinator` 拥有**。
`pages.ts` 若保留 `openGameplayLobby` / `submitGameplayLaunch` / `restoreAuthenticatedHome`，只能是**零状态
的纯转发**（分别转发到 navigation 的 route open、`LaunchPort.launch(target)`、SessionCoordinator 的已登录
base route 恢复），⛔ 不得在 `pages.ts` 内持有 session、reconciler 或页面数组，也不增加 `openSnakeRoom`、
`openFishingRoom` 等玩法名函数。这三个函数属于一次性框架能力，与 §8.3「新增 plugin 不得再往 `pages.ts`
加 `openXxx`」并不冲突——真正的约束是**状态所有权**，不是函数名。


### 7.6 `GameplayModule`

客户端将当前 factory/joiner/presentation 的散装登记收敛为一个玩法拥有的模块：

```ts
interface GameplayModule<TLaunch, TInput> {
  readonly id: string;
  validateLaunch(input: unknown): TLaunch;
  readonly joiner: GameplayRoomJoiner<TLaunch>;
  createPlugin(host: GameplayInstanceHost<TInput>): GameplayPlugin;
  readonly lobby?: GameplayLobbyContribution<TLaunch>;
}
```

generated client catalog 只给模块注入稳定服务：`RoomClient`、session/server 读取 port、presentation host 和通用
导航能力。不得再把 `ballMoveJoiner/idleJoiner/snakeJoiner` 逐个加到 catalog context。

`RoomController` 接收通用 launch request，`RoomClient` 一次性支持 `joinOrCreate/create/joinById`。玩法 adapter
声明自己的 wire contract、outbound/inbound allowlist、exact state validator 和可选 reconnect reconcile；
通用 transport 不出现 Snake 分支。


### 7.7 generation-fenced presentation

每次玩法启动应分配独立 generation，presentation host 至少提供：

```ts
interface GameplayInstanceHost<TInput> {
  readonly generation: number;
  isActive(): boolean;
  dispatchInput(input: TInput): Promise<boolean>;
  requestExit(reason: "user-exit" | "settled"): Promise<void>;
}
```

> 本接口是现有 `logic/gameplay/GameplayPlugin.ts` 的 context 与 `logic/gameplay/RoomController.ts` 的**面向
> 引擎投影**，落点是 `Main.ts` 现有的 presentation host 字面量。`generation` 必须**直接是** `RoomController`
> 已有的那个计数器，⛔ 不得新增第二个；`dispatchInput` 转发 `RoomController` 的输入入口，`requestExit`
> 转发它的 stop。本节真正新增的只有 presentation adapter 这一层注入边界。

`rematch` 按 §6.4 属于**未定义语义**，⛔ 落地前不进入 host 稳定 API；将来加入时必须同时定义新一轮
roster / ready / 邀请码状态，以及它究竟是 exit 还是 launch。退出原因到既有词汇表的映射也要写死：
`user-exit` 映射到既有的“主动退出”；`settled` 要么同样映射到主动退出，要么在既有 stop 原因枚举里新增
`settled` 并说明为何需与主动退出区分。`cancelled` / `disposed` / `room-lost` / `plugin-error` ⛔ 不由玩法侧
发起，只能由 host 内部产生（现仓即如此接线）。

`dispatchInput` 和 `requestExit` 都要校验 generation。旧 View、迟到 join、迟到 RPC 或上一局的 async callback
无权操作后来创建的 room。**gameplay generation 与页面 / route 所有权的关系必须显式定义**——推荐由
§7.2 的 route ownership handle 派生（route close/replace 立即使其失效），或明确采用「route signal +
gameplay generation」双守卫并写清两者失效的先后；`dispatchInput` / `requestExit` 的守卫对象据此确定。

正常结算和主动退出都由通用恢复路径执行 `controller.stop → 恢复已登录 Home`，玩法不能自行重建登录页或房间
单例。引擎 `Node`/mount 由 `gameplay/` 与 `view/` 之间的 presentation adapter 注入，不进入 `logic/` 契约，
继续遵守 Logic 禁止依赖 `cc` / FairyGUI 的边界。


### 7.8 宿主前后台与本地时钟

实时玩法在切后台 / 回前台时的行为容易被两侧都当成对方的职责而落空，因此在此固定：

1. `hide` 时**暂停本地 tick 与预测 / 插值**，⛔ 不关闭 room、⛔ 不把已发出的输入判失败；
2. `hide` 期间禁止产生新的输入意图，输入 `seq` ⛔ 不因暂停而跳变；
3. `show` 时先判连接状态——仍 ready 则**请求一次权威快照后再恢复输入**；处于 drop 宽限则等 reconnect；
   已 final-loss 则走既有恢复路径；
4. §10.4 的「重连后的完整快照到达前不能恢复输入」**同样适用于 `show` 路径**；
5. 直接复用 §7.3 的 `LifecycleBus` / `CocosLifecycleBridge`（§9 已把它排在阶段 5、早于 gameplay 客户端
   module 的阶段 9），⛔ 不另起第二套 `EVENT_HIDE` / `EVENT_SHOW` 监听。


## 8. 一次性侵入范围

下面是实施本方案时预期需要修改的既有文件。它们是为了消除今后的重复侵入，而不是每个 plugin 都要修改。

| 层 | 一次性修改的主要现有位置 | 目的 |
| --- | --- | --- |
| Shared | `protocol/lobbyRpc/index.ts`、`envelope.ts`、`push.ts`、现有 user/mail/shop/guild 契约、`logic/index.ts` | 迁移为 domain descriptor + generated registry |
| 协议身份 | `protocol/rooms.ts`、Lobby/Game join validator、health 类型、协议指纹脚本与测试 | 分离 Lobby 与 GameRoom 协议身份 |
| Server RPC | `websocket/rpc.ts`、`dispatcher.ts`、`loader.ts`、现有 endpoint | metadata 驱动 schema、响应校验和执行模式 |
| Server idem | `core/idem.ts`、`core/infra/redisScripts.ts`、必要的 key/config | payload hash、唯一 lease、CAS 和 inspect |
| Server errors | `core/errors.ts` 及现有异常子类 | 自描述错误，移除领域中央映射 |
| Client host | `Main.ts`、`view/pages.ts`、`net/WebSocketClient.ts`、`net/session.ts` | 通用 plugin、导航、会话和生命周期接缝 |
| Home | `HomeView.ts`、`HomeLogic.ts`、Home FGUI XML 与导出物 | 固定按钮改为数据驱动 plugin menu |
| View/FGUI | `viewRegistry.ts`、`fguiContracts.ts`、`defineView.ts`、必要的 `ViewMgr.ts`、FGUI codegen/manifest | 生成静态 registry 与契约 |
| Tests | RPC contract/wire/idem 测试、View/FGUI 测试、相关生命周期测试 | 中央穷尽表改为 manifest/vector 遍历 |
| Governance | 根 `package.json`、工具链检查、inventory verifier、README、AGENTS/CLAUDE、OVERVIEW/CLIENT/SERVER、保护路径规则文件与无侵入矩阵测试 | 登记一次性命令、新开发动线与可机检的保护集合 |
| 场景资产 | `apps/Cocos/assets/scene.scene`（及其 `.meta`） | `Main` 的 `@property` 搬家时由 Creator 重新序列化并人工审查；⛔ 不属于机械 diff |

`scripts/fault-matrix.config.json` 是**人工审阅的中央故障矩阵登记**：新增普通 plugin 只有在需要把自己的
故障点纳入矩阵时才动它；届时按“显式框架登记项”评审，**不计入“只新增文件”的承诺**，并在保护规则的
provenance 白名单里单列说明它是人工项。⛔ 不建议把它改成 generated 产物。

若分阶段实施，可通过 compatibility manifest 暂时指向现有 Login、Home、Confirm 等旧路径；不要求一次提交把所有
页面搬目录。但在完成现有功能迁移和双向集合测试之前，不能对外承诺“后续 plugin 只新增文件”。


### 8.1 Shared 与生成器

| 文件/目录 | 修改原因 | 目标修改 |
| --- | --- | --- |
| `apps/shared/src/protocol/rooms.ts` | 当前只有全局版本与集中 mode/join 形状 | 稳定 join envelope，拆分 framework/mode version，接入生成 mode catalog |
| `apps/shared/src/protocol/messages.ts` | 中央维护所有玩法消息和 validator | 只保留 core/builder façade，玩法 wire 由 generated registry 聚合 |
| `apps/shared/src/constants/errors.ts`、`protocol/lobbyRpc/envelope.ts` | Game/Lobby 错误仍由中央集合验证 | 通用房间错误一次性归 core；玩法/RPC 领域错误改为 generated contribution，保持三种错误域分离 |
| `apps/shared/src/constants/game.ts` | `MAX_PLAYERS` 已**不是**运行时权威容量（权威是 `GameMode.roster.max`）。它现在承担三件事：(a) 生成 state validator 的 players map 上界（manifest 的 `maxSizeConstant`）、(b) onCreate 选定 mode 前的 `maxClients` 兜底、(c) `assertGameModeRoster` 对 `roster.max` 的天花板 | 三种职责分别下沉：(a) 归 per-mode state descriptor、(b) 保留为 shell 兜底默认值、(c) 随 roster 断言迁到 codegen/启动期 |
| `apps/shared/schema/game-room-state.json` | 单文件是所有 mode 的中央冲突点 | 迁移到 `schema/gameplays/<id>/state.json`；旧文件最终删除或仅作迁移入口 |
| `apps/server/tools/room-state-codegen.ts` | 只生成一组集中 state | 收敛为服务端 Schema renderer/迁移适配；跨 shared/server/client 的总生成器放 `apps/server/tools/gameplay-codegen/`（与 writer 同 workspace，见 §5.4） |
| `apps/shared/src/protocol/http.ts`、`apps/server/src/http/misc/version.ts`、`healthz.ts` | `/version` 和健康检查仍引用单一全局协议版本（客户端**没有**启动探测在读它） | 同时报告 Lobby 与 GameRoom 两类身份；per-mode 兼容在 gameplay catalog/join 中校验 |
| `scripts/protocol-fingerprint.mjs`、`apps/client/test/protocolFingerprint.test.ts` | 指纹脚本从 `rooms.ts` 读取唯一版本并覆盖整个 protocol；当前**无 argv 解析**，运行即重钉 | 口径以 §4.8 为准（互斥 `--check/--write`、**保留单一全局字节锁**），⛔ 两文档不得对同一脚本给出不同拆法；per-mode digest 归 `codegen:gameplays`；补 Lobby/Game join 和版本矩阵测试 |
| `apps/server/package.json`、`apps/server/tools/gameplay-codegen/**`、`apps/server/test/` | 尚无 gameplay 生成器与 freshness 守门 | 新增 workspace 脚本 `codegen:gameplays` 与 freshness 断言（⛔ 不新增根命令，见 §5.4）；覆盖 digest/version、三端集合与删除保护 |
| `apps/shared/src/protocol/lobbyRpc/**` | 新增 `room.prepareCreate/resolve` 在当前架构会触碰中央 RPC 全集 | 按 §9 的顺序，RPC descriptor 与 domain codegen 已在阶段 3 落地，这两条路由只需新增 `domains/room.ts`，⛔ 不触碰中央全集 |
| 根 `README.md`、`AGENTS.md` / `CLAUDE.md`（两者在仓库根字节等同）、`docs/OVERVIEW.md`、`SERVER.md`、`CLIENT.md` 与相关 README | 当前铁律精确写死单一 state manifest/生成路径和旧扩展动线 | 框架落地时同步更新真源、生成物、禁手改范围和新玩法动线；完成证据最后回写**当前计划文件**（以 `docs/inventory.json` 的 `routeOfTruth.corePlan` 为准），⛔ 不向已降级的历史归档回写 |


### 8.2 服务端

| 文件/目录 | 修改原因 | 目标修改 |
| --- | --- | --- |
| `apps/server/src/rooms/GameRoom.ts` | 混有 ballMove、逐条消息登记、两人自动开始和集中 evidence | 只保留安全不变量、catch-all dispatch、policy、start transaction 和受限 mode lifecycle |
| `apps/server/src/rooms/GameMode.ts` | `usesDefaultBallMoveRules` 让公共接口以 ballMove 为默认 | 改为 typed `GamePlugin + RoomProfile + policy + capability` 契约；未登记 fail-fast |
| `apps/server/src/rooms/ballMoveRules.ts` | 当前由 GameRoom 直接消费 | 移入 `rooms/modes/ballMove/**`，成为 ballMove 私有实现 |
| `apps/server/src/rooms/modes/catalog.ts` | 手工只登记 idle；ballMove 由 `GameMode.ts` 的**模块顶层副作用** `gameModeRegistry.register(...)` 隐式成为默认——正是 §5.4 明令禁止的自注册形态 | 改为 generated catalog 的稳定 façade，显式登记全部 mode（✅ 2026-09-05 已实施：`codegen:gameplays` 按 manifest.wireExposed 发现 `modes/<id>/index.ts` 的 `register<Constant>GameMode` 生成 `modes/catalog.generated.ts`，`catalog.ts` 只 re-export；`catalog.ts` 与 `app.config.ts` 同批进 §12.2 保护清单） |
| `apps/server/src/app.config.ts` | 进程根手工调用 mode catalog，普通撮合只按 `sId/mode` 隔离 | 一次性切换 generated bootstrap；仍只注册一个 `RoomName.Game`，多 profile 后按 `sId/mode/profile` 隔离 |
| `apps/server/src/core/infra/keys.ts`、相关 config/Redis script | 没有邀请码租约 key、TTL 和 CAS | 增加按项目/区隔离的 key、配置校验、lease renew/release Lua |
| `apps/server/src/core/errors.ts` | Lobby domain 异常仍映射到中央错误表 | 按 §9 的顺序，generated error 已在阶段 3 落地，邀请码只贡献 `domains/room.ts` 的 `errorCodes`，本文件 ⛔ 不需要再改 |
| `apps/server/src/websocket/room/prepareCreate.ts`、`resolve.ts`（新增） | 需要可信创建者声明和定向加入入口 | 使用现有 `zoneCtx/currentZoneId()`，实现认证、专用限流桶、creation/join ticket；保持 handler 轻量。⚠ `websocket/room/` 下每个非 `.test.ts` 的 `.ts` 都会被 loader 当作 endpoint，路由名必须等于 `room.<文件名>`，端点全集与 `ALL_LOBBY_RPC_TYPES` 双向相等（启动期 throw）；helper / decoder 必须放 `core/` |
| `apps/server/src/core/match/matchEvidence.ts`、`matchReplay.ts`、`matchConsumer.ts`（可选） | 当前可信证据是 ballMove ruleset | 需要多玩法可信战绩时再改为 ruleset registry；首期 Snake 明确 `evidence: none` 可暂不扩展消费者 |
| 服务端现有 GameRoom/mode/wire/replay 测试 | 测试夹具绑定 ballMove 默认分支和两人自动开局 | 迁移为 core policy 测试、ballMove 私有 harness 和自动遍历的 mode contract 测试 |

两个 room RPC 文件本身是新增式改动，但要让它们成为今后不再侵入中央 RPC 的稳定能力，仍需要上述 shared
RPC/error/codegen 的一次性框架改造，不能把“新增 endpoint 文件”误写成整个邀请码能力都是零侵入。


### 8.3 客户端与 View

| 文件/目录 | 修改原因 | 目标修改 |
| --- | --- | --- |
| `apps/client/src/logic/gameplay/GameplayPlugin.ts` | plugin host 缺少通用退出/结算能力 | 增加 generation-fenced input/exit host |
| `apps/client/src/logic/gameplay/GameplayRegistry.ts` | 分散登记 factory/joiner，catalog context 玩法化 | 消费完整 `GameplayModule` 的 generated catalog；测试替换走注入 registry |
| `apps/client/src/logic/gameplay/RoomController.ts` | joiner 不接通用 launch request，host generation 边界不完整 | 接收经过 module 校验的 launch，统一 start/stop/restore |
| `apps/client/src/net/RoomClient.ts` | 本地复制 S2C map，只支持现有 join 形态 | 使用 shared token，支持 `create/joinById`，扩展 connection key 和 state/reconnect 屏障 |
| `apps/client/src/net/rooms/GameRoomTransport.ts` | 当前组合点同时放了 ballMove 与 idle adapter | 只保留通用 transport；各玩法 adapter 回到自己的目录 |
| `apps/client/src/gameplay/catalog.ts` | 手工注入 ballMove/idle 服务 | 改为 generated catalog façade和稳定 services context |
| `apps/client/src/Main.ts` | 默认玩法、presentation 和失败恢复仍在应用根组合 | 只认识通用 launch/stop/restore，不出现 Snake/ballMove View 名 |
| `apps/client/src/view/pages.ts` | 每页手工增加 `openXxx` | 收敛为通用 gameplay lobby、launch 和登录后 Home 恢复 |
| `apps/client/src/view/viewRegistry.ts`、`ViewMgr.ts` | `VIEW_REGISTRY` 是手写静态全集（类型只读，但运行时并未 `Object.freeze`） | 改为 generated 静态 catalog + 可注入只读 lookup，不引入运行时注销 |
| `apps/client/src/view/fguiContracts.ts` | contract 和 ViewMeta 两份全集 | contract 随 ViewMeta contribution，测试从 generated catalog 派生全集 |
| `apps/client/src/view/HomeView.ts`、`logic/page/HomeLogic.ts`、Home FGUI 设计源 | 入口固定为 `btn_enter` | 一次性改为玩法入口列表，数据来自 lobby contributions |
| `apps/Cocos/assets/scene.scene`（及其 `.meta`） | `Main` 的 `@property`（`serverUrl` / `portalUrl`）序列化在**手工场景资产**里（`gameplayId` 未被序列化，仅是类默认值） | 属性搬到 bootstrap 组件时必须在 Creator 编辑器中重新序列化并人工审查该 diff；⛔ 该文件**不在**机械 diff 白名单内。若 Main 保留这些 `@property` 并只转发给新 host，则本行不触发。`gameplayId` 在 Home 数据驱动化之后应从 `Main.ts` 删除；它不在该场景资产里，删除不产生 scene.scene diff |
| 客户端 lifecycle/wire/view/FGUI 测试 | 两类：(a) fixture 穷举现有玩法和页面；(b) 对 `Main.ts` / `pages.ts` 的**源文本正则 pin**（如 `ResolutionPolicy.FIXED_WIDTH`、`controller.tick(dt)`、`this.disposePages?.()`） | (a) 改成自动遍历 registry，并增加旧 generation、迟到 RPC 和不同 join strategy 反例；(b) 源文本 pin 改写为对新 host 的**行为断言**，且必须与掏空 `Main.ts` 的提交**同批**改写，⛔ 不允许删除了事。另：客户端 typecheck 配置测试硬编码了一组必含路径哨兵（`src/Main.ts`、`src/view/pages.ts`、`src/view/LoginView.ts`、`src/view/HomeView.ts`、`src/view/ConfirmView.ts` 等），把这些 core View 搬进 plugin/玩法目录时必须同批更新该哨兵列表；**include 本身是递归 `src/**/*.ts`，新增目录会自动覆盖，不必改 tsconfig** |

以下位置不应因“竖版 Snake”而修改：

- `apps/client/src/designSpec.ts` 的 750×1624 基线，除非另有全项目设计变更；
- `apps/client/src/lib/bitecs/` 的 12 个锁定文件；
- `apps/client/src/shared/**` 和 `apps/Cocos/assets/src/**` 生成镜像；
- `apps/shared/src/protocol/state.ts` 与服务端生成 Schema，必须由 codegen 刷新，禁止手改。


### 8.4 一次性新增的框架文件

这些文件虽然是新增文件，仍属于本轮**框架改造**，不是 Snake 业务文件：

```text
apps/shared/src/gameplays/defineGameplayWire.ts
apps/server/tools/gameplay-codegen/gameplay-schema-v1.json
apps/server/tools/gameplay-codegen/cli.ts
apps/server/src/rooms/core/GameplayDispatcher.ts
apps/server/src/rooms/core/StartPolicy.ts
apps/server/src/rooms/core/AccessPolicy.ts
apps/server/src/core/rooms/invite/InviteCodeLease.ts
apps/server/src/core/rooms/invite/AccessTicket.ts
apps/server/src/core/rooms/invite/redisScripts.ts
apps/client/src/logic/gameplay/GameplayModule.ts
apps/client/src/net/rooms/matchmaking.ts
apps/client/src/net/rooms/PrivateRoomService.ts
apps/client/src/view/viewContributions.ts
apps/client/src/logic/page/PrivateRoomLobbyLogic.ts
apps/client/src/view/PrivateRoomLobbyView.ts
apps/art/fairygui/assets/<PrivateRoomLobby-package>/**
```

具体文件可以合并或改名，但这些职责必须由通用层拥有，不能放进 Snake 后再被其他玩法反向依赖。

两点与既有 infra 的边界：

- `core/rooms/invite/redisScripts.ts` 只**复用**既有 `core/infra/redisScripts.ts` 的脚本装载与 NOSCRIPT
  重载机制（可以在 invite 目录里只导出脚本常量），⛔ 不另建第二套装载器；
- `InviteCodeLease.ts` 与 `core/infra/lease.ts` 的 MySQL `singleton_lease`（fence_token）**无关，勿混用**；
  必要时改名为 `InviteCodeReservation.ts` 以免同词不同义。

`apps/server/tools/gameplay-codegen/**/*.ts` 按 §5.4，**由 `apps/server/test/` 下的 freshness 测试
值导入**而被 tsc 传递纳入，⛔ 不允许长期游离在类型检查之外。


### 8.5 受保护路径与无侵入矩阵

§8.1–§8.3 与 §12.2 的散文清单**只解释边界**，⛔ **不是第二真源**。保护集合必须是一份**可机检的 canonical
规则文件**（例如 `scripts/protected-paths.json`），并由无侵入矩阵测试与散文清单**双向比对**——两者不一致时
必须红。

provenance：真源 = 该规则文件；writer = 人工评审并在提交中显式声明；checker = 无侵入矩阵测试；
红在 `verify:core` 链里。

**全仓只有一份规则文件**（登记见 §5.5 的 provenance 表与 §8 的 Governance 行）：plugin 与 gameplay
module 的保护条目都追加进同一份，⛔ 不产生第二份。§11.3 的保护清单是它的散文视图，两者必须双向比对。

先例：仓内 `verify-inventory` 已经在做「解析 Markdown 表 → 与 `package.json` 双向 deepEqual」，本规则的
双向比对可以照此形态实现。


## 9. 分阶段实施计划

两类实体的改造是**一条时间线**，不是两条并行线。顺序由依赖方向决定：让每一处「谁先做谁少付代价」的软
依赖都朝**被依赖方先行**的方向，从而把迁移债全部消掉。

### 9.1 顺序依据

| 依赖 | 为什么 |
| --- | --- |
| Lobby RPC descriptor + 幂等 v2 **先于** private-room（§6.6–§6.9） | 否则 `room.prepareCreate` / `room.resolve` 要显式改 `lobbyRpc/envelope.ts` 与 `core/errors.ts`，多付一笔中央侵入 |
| 协议身份拆分（§4.8）**先于** private-room | 阶段 8 要 bump `GAME_ROOM_PROTOCOL_VERSION`，而该常量由协议身份拆分建立 |
| AppRuntime / Navigation / Home / View 生成 **先于** gameplay 客户端 module | 否则 gameplay 侧要先建一套最小 contribution 与 `pages.ts` 临时接线，随后被二次改写 |
| 拆 ballMove + gameplay wire/state（阶段 1–2）**与 Lobby 侧无耦合** | 只动 GameRoom、shared gameplay 契约与 gameplay 生成器 |

把「拆 ballMove + gameplay wire/state」排在最前，而不是跟着 private-room 一起做，理由是它清的是**既有技术
债**（`usesDefaultBallMoveRules` 是 plan-v4 条目 4 的尾巴），与两个新玩法都无关；而且阶段 2 建立的 wire
token、catch-all dispatcher 与分片 state 是 GameRoom 地基，越早建立，后面所有 GameRoom 相关工作越干净。
代价只是多一次上下文切换。

**两个单向门（阶段 2 与阶段 5）被阶段 3–4 天然隔开**，⛔ 不允许同时开两个单向门。

### 9.2 阶段总表

| 阶段 | 内容 | 风险等级与理由 | 外部依赖 | 可回退性 |
| --- | --- | --- | --- | --- |
| 0 | 冻结口径与基线 | 低——只产出 manifest schema、基线记录与生成器 fixture | 无 | 可回退 |
| 1 | 行为等价拆出 ballMove | 中——纯重构但触及结算与 evidence，行为等价性靠回归与变异测试证明 | 无 | 可回退（revert 单提交） |
| 2 | gameplay wire token、分片 state、静态 catalog | **高，且是单向门** | 无 | **单向门**：state codegen 的 writer 切换必须在同一提交内完成 |
| 3 | RPC descriptor 与测试向量发现 | 中——机械迁移，但要保持 12 条存量路由行为不变并把中央 request/response 向量迁入 sidecar | 无 | 可回退 |
| 4 | 幂等 v2 与错误自描述 | **高，且是单向门** | 本地 Redis（`test:int` + 故障矩阵） | **单向门**：需 drain 窗口（≥ `IDEM_RESULT_MS + IDEM_PENDING_MS`），回退同样需要一次 drain |
| 5 | 客户端 PluginHost 与生命周期 | **最高**——12 个新模块 + `pages.ts` 状态机迁移；`Main.ts` 源文本 pin 必须与掏空同批改写 | Creator 预览（人工证据） | 可回退，但迁移期 ⛔ 不允许「新旧都注册」的中间态，回退必须整批 |
| 6 | Home 与 View/FGUI 生成登记 | 高——建立全仓唯一的 View writer 与产物路径 | FairyGUI 编辑器真实导出、Creator 预览 | 可回退 |
| 7 | inventory、文档索引与协议身份 | 中——协议身份拆分会动指纹锁文件格式与版本矩阵测试 | 无 | 可回退（需同批回滚锁文件格式） |
| 8 | 通用 private-room 与 owner-ready policy | 高——新增 Redis 租约、ticket 状态机与开局事务 | 本地 Redis | 需数据清理：回退前释放全部在途 lease 与 ticket key |
| 9 | gameplay 客户端 module 与 View contribution | 中——直接消费阶段 5–6 的 host 与 View 生成器，**零迁移债** | 无 | 可回退 |
| 10 | 两个玩法的实现 | 高——**唯一依赖真机与真实多客户端联调的阶段** | 真机、2–4 个真实客户端、外部 WebPlatform 完整登录链 | 可回退 |
| 11 | 切换默认入口与清理决策 | 中——改变默认可见入口，属 §12.3 的显式评审项 | 无 | 可回退 |

> **默认入口归属**：阶段 11 的默认 Home 入口取 snakeoff，undergroundIdle 的入口路线次之。
> 这只决定阶段 11 取谁，**⛔ 不改变上面的实施顺序**——两个玩法都要等框架（阶段 0–9）完成后才开始实现。

### 阶段 0：冻结口径与基线

工作：

- 确定“人工侵入/生成侵入/镜像变化”的分类；
- 固定 plugin manifest v1 schema；
- 记录现有 RPC、错误码、push、View、Home 和测试全集；
- 为生成器建立 isolated fixture 和 `--check` 反例测试。

退出条件：同一输入字节级稳定；重复 id、路径越界和陈旧生成物均有判别力明确的失败测试。

同期冻结 gameplay 侧：从旧构建档案提炼首期玩法规则、资源授权清单与竖版线框；确认最小开局人数
（建议 `roster.min = 2`；允许单人则为 1）、死亡/复活、时限与胜负；记录现有 ballMove/idle 的 wire、state、
lifecycle 与测试基线。§6.7 的三个时间参数与 §6.8 的限流数值也在本阶段与产品一起冻结**数值**——它们之间的
**不等式约束**由 §6.7 规定并在启动期断言，⛔ 不是产品可选项。

退出条件（gameplay 侧）：产品规则没有会改变 state/wire 主形状的未决项；基线测试可重复通过。

回滚策略：可回退——本阶段无代码产物。

### 阶段 1：行为等价拆出 ballMove

- 将 ballMove 全部规则、模拟、settlement 和 evidence producer 下沉到其 mode；
- 删除 `usesDefaultBallMoveRules` 和隐式 fallback；
- 保持现有外部 wire 与 ballMove/idle 行为不变。

退出条件（可数）：全仓 `usesDefaultBallMoveRules` 出现次数为 **0**；`GameRoom.ts` 不再 import
`BALL_MOVE_GAME_MODE_ID`、不再读取 ballMove 专属字段；ballMove/idle 回归与变异测试通过。

回滚策略：可回退（revert 单提交），无持久化数据变更。

### 阶段 2：gameplay wire token、分片 state 与静态 catalog

- 引入玩法 wire builder、catch-all dispatcher、typed send/broadcast；
- 拆分 state descriptor，生成三端 catalog 和 per-mode artifact；
- 增加 gameplay 生成器的 freshness 断言、digest/version 和集合一致性门禁（workspace 脚本形态，见 §5.4）。
- 同步更新根 `README.md`、`AGENTS.md` 与 `CLAUDE.md`（后两者在仓库根字节等同）、OVERVIEW/SERVER/CLIENT、
  就近 README 和 inventory；完成后再向**当前计划文件**回写证据，⛔ 不向已降级的历史归档回写。实施时以
  `docs/inventory.json` 的 `routeOfTruth.corePlan` 为准，而不是本文写死的文件名。

退出条件：新增一个只有新文件的 fixture mode/message/state 后，通用房间能收发且无需改中央清单。

回滚策略：**单向门**。state codegen 的 writer 切换必须在同一个提交内完成——⛔ 不允许 `codegen:state` 与
`codegen:gameplays` 同时能写服务端 Schema。中止时必须整批回滚 manifest、生成物与三端镜像；⛔ 不允许留下
「两套生成器都能写同一个文件」的中间态。

### 阶段 3：RPC descriptor 与测试向量发现

工作：

- 建立 shared domain builder 和 registry codegen；
- 迁移 user/mail/shop/guild；
- `defineRpc` 改为 metadata 驱动；
- 中央 fixture 改为 plugin/domain vector loader；
- 保留 endpoint loader 的全集校验。

本阶段把存量 12 条路由的 request/response 向量**从中央表迁入 sidecar**（现状见 §5.6：request/response
中央向量表均已存在，属迁移而非新增）。
⚠ `clientReqId` 的字符集收紧属 **wire 收紧**，⛔ 不进本阶段——本阶段的口径是“行为不变”。

退出条件：现有 route、validator、endpoint 和行为不变；添加一个 fixture domain 只新增领域/endpoint/vector，
不修改人工中央源码。

### 阶段 4：幂等 v2 与错误自描述

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

### 阶段 5：客户端 PluginHost 与生命周期

工作：

- 新增 AppRuntime、PluginRegistry、Navigation、SessionCoordinator 和 LifecycleBus；
- WebSocketClient 暴露只读连接状态；
- Main 收敛为 bootstrap/update/dispose；
- 登录恢复不再固定打开 Home；
- foreground/reconnect/reopen 由 RefreshCoordinator 合并。

退出条件补三条：`Main.ts` / `pages.ts` 的**源文本 pin 已全部改写为对新 host 的行为断言，且改写与掏空 Main
在同一次提交**，⛔ 不允许先删后补；WeChat compat 的 bootstrap 顺序断言在迁移**之前**已补上；`auth-invalid`
事件发布后的**同一 tick 内** `getToken()` 已为空，且此后任何 plugin 发起的 HTTP/RPC 都不携带旧 Bearer
（有反例测试）。

退出条件：fixture plugin 在页面关闭、加载中取消、drop/reconnect、强踢、最终 leave、回前台和 session
generation 变化时均不会让旧响应回写；late subscriber 能立即读取连接状态；foreground+reconnect+reopen 只
合流当前 flight，下一次 foreground 仍能刷新；PendingOperationJournal 在 route close/reopen 后复用原 ID；app
destroy 后 connection/session/route/ticker 订阅归零；静态门禁证明 plugin 无法直接访问原始 Lobby Room 或自行
重连，所有同步/异步 listener 异常都被观察。

### 阶段 6：Home 与 View/FGUI 生成登记

工作：

- Home 改为 plugin menu，ballMove 迁入 contribution；
- view/contract/package registry 生成化；
- fgui-codegen 支持 plugin 目录；
- View/FGUI 测试改为遍历 manifest。

退出条件：新增 fixture View/入口只新增 manifest、View metadata、composer/Logic 和 art；Home、registry、
contracts 无人工 diff；迁移期 alias 不产生重复所有权；Creator 中动态加载、取消回滚、输入租约和跨包资源正常。

### 阶段 7：inventory、文档索引与协议身份

工作：

- inventory 合并 plugin fragment；
- 生成 plugin 能力索引；
- 分离 Lobby/GameRoom 协议身份；
- 更新标准开发动线和工具链聚合命令。

退出条件：普通 extra plugin 不修改中央 inventory；协议变更未接受时 check 失败；生成索引不冒充人工计划和验收
证据。

### 阶段 8：通用 private-room 与 owner-ready policy

- 实现邀请码 lease、`prepareCreate/resolve`、creation/join ticket、create/joinById；
- 实现 owner/Ready/Start、revision-fenced start 和房主最终离开转移；
- **落实 §4.4 的稳定 join envelope**：`profile` 变必填并 bump framework version（`GAME_ROOM_PROTOCOL_VERSION`）。
  必填切换必须与客户端在**同一个提交**内完成，或先发一版只读容忍缺省的过渡版本；⛔ 不做「缺省时随便匹配」；
- 保留 public matchmaking/auto-start policy 供现有 mode 兼容迁移。

退出条件：1～4 人容量矩阵、选定的最小开局人数、并发 Start、lease/ticket 和重连故障用例通过；
join envelope 的版本矩阵（旧客户端被明确拒绝）通过。

回滚策略：需数据清理——回退前必须释放全部在途邀请码 lease 与 ticket key（它们带 TTL，但回退窗口内会让
旧码指向已不存在的房间）。framework version bump 一旦发布即为**单向门**，回退需要再 bump 一次。

### 阶段 9：gameplay 客户端 module 与 View contribution

- `GameplayModule`、通用 launch strategy、generation-fenced host；
- generated 静态 View catalog、Home contribution、通用 lobby/exit/restore；
- 迁移 ballMove/idle 到新接口，不改变现有行为。

退出条件：增加 fixture module/view 不修改 Main/RoomClient/pages/Home；旧 generation 和迟到异步不能污染新房间。

回滚策略：可回退。**本阶段零迁移债**——阶段 5–6 已经建立 `AppRuntime` / `NavigationService` / `LaunchPort`
与 View 生成器，gameplay 侧直接消费，⛔ 不建第二套、也不往 `pages.ts` 加临时接线。`pages.ts` 若保留
`openGameplayLobby` / `submitGameplayLaunch` / `restoreAuthenticatedHome`，从第一天起就只能是零状态纯转发
（见 §7.5 末段）。

### 阶段 10：两个玩法的实现

- 新增 Snake contract、simulation、snapshot、adapter、prediction/interpolation、View 和资源；
- 完成 2/3/4 人真实客户端联调；若 `minPlayers=1`，另补单人流程；
- 做快照带宽、固定步确定性、长局内存和目标设备性能测试。

退出条件：完整创建、输码、Ready、房主 Start、游玩、掉线重连、结算和退出链路通过。

回滚策略：可回退。本阶段是唯一依赖真机与真实多客户端联调的阶段，人工验收证据不可由 Node 无头测试冒充。

undergroundIdle 在本阶段并行实现：它只新增 plugin 文件，不再触碰框架（这正是阶段 3–7 要证明的结论）。

⚠ 本阶段是唯一依赖真机与真实多客户端联调的阶段，人工验收证据 ⛔ 不可由 Node 无头测试冒充。

### 阶段 11：切换默认入口与清理决策

- 默认 Home contribution 指向 Snake 私房 Demo（归属见 §9.2）；
- ballMove 仍作为**已登记 GameMode** 保留（供回归与 fixture 遍历），但**不贡献 Home menu contribution**；
  “隐藏回归 mode”指的正是这个状态，⛔ 不是菜单里的隐藏条目。只有确需「已登记但不可见的菜单条目」时，才在
  §7.4 的字段清单里补显式 `visibility` 字段——那不改变 §12.3「改变默认启用 plugin 仍需显式评审」；
- Snake 稳定后另立清理任务，评估 ballMove evidence/replay、性能基线、文档和测试是否删除或归档。

退出条件：默认入口无 ballMove 特判；删除/保留 ballMove 都不会改变通用框架接口。

回滚策略：可回退（改回默认 contribution 即可）。

## 10. 验收清单

> **口径**：机检项必须给出「判定方式」（具体命令或用例文件）与「变异验证」（改哪一行 / 删哪个断言 →
> 哪条用例转红）。⛔ **机检项给不出变异验证的不得作为验收项**——要么补上，要么移入人工验收证据。
> 这与仓内当前计划文件「每条实现都要给变异验证」的惯例一致。
> 人工项的判定方式统一写「人工证据」，并必须留存：截图 / 录屏、设备型号与系统版本、Creator 版本、日期、
> 操作者、对应 commit。Creator / 真机预览**必须单列，⛔ 不能由 Node 无头测试冒充**。


### 10.1 契约与生成

| 验收项 | 判定方式 | 变异验证 |
| --- | --- | --- |
| 六位码 validator 接受 `000001`，拒绝 number、5/7 位、空白、符号和未知字段 | shared 契约用例 | 把 validator 改成接受 `number` → 转红 |
| Ready/Start/SnakeInput/Snapshot payload 均 exact、finite、有范围和尺寸上限 | shared 契约用例 | 去掉任一 exact-keys 断言 → 转红 |
| framework version 与 per-mode version 分工明确；digest 变化未 bump `modeVersion` 必须失败 | `npm --workspace @game/server run test`（freshness 断言） | 改一字节 wire 而**不动** `modeVersion` → 断言转红 |
| Game join 只比较**一个**整数，且该整数与 §4.8 的命名一致；`modeVersion` 只影响单玩法拒绝，不影响 core 信封 | 版本矩阵用例 | 让 `modeVersion` 参与 join 拒绝 → 矩阵转红 |
| `/version`、`/healthz`、framework fingerprint 与 per-mode digest 的范围一致 | 协议指纹用例 + HTTP 契约用例 | 让指纹覆盖面漏掉 protocol 下任一文件 → 转红 |
| per-mode state、server Schema 和三端 catalog 由同一 manifest 集合生成且新鲜 | `npm --workspace @game/server run test`（freshness 断言） | 手改任一生成物 → 断言转红 |
| manifest `maxPlayers` 派生 per-mode state 上限、root map 上界、admission cap 与 `maxClients`，**四处不允许独立配置** | 启动期断言 + 服务端用例 | 手改其中任一处使之与 manifest 不等 → 启动期断言转红 |
| 未知/畸形 C2S 在昂贵 validator 前已计基础预算，合法大 payload 再计附加成本 | 服务端 dispatcher 用例 | 把基础预算挪到 validator 之后 → 转红 |
| 房间只注册 catch-all，⛔ 无任何残留具名 `onMessage` | 服务端用例 | 加一条具名 `onMessage` → 转红 |
| 新增 fixture gameplay 只增加新文件 + generated diff，不修改手写中央清单 | §10.7 的无侵入矩阵 | 让 fixture 必须手改一处中央清单 → 矩阵转红 |
| shared/client/Cocos 镜像一致，生成区没有手改 | `npm run verify:sync` | 手改镜像任一字节 → 转红 |


### 10.2 邀请码与准入

| 验收项 | 判定方式 | 变异验证 |
| --- | --- | --- |
| 同一 `(sId, code)` 并发创建只有一个 lease 成功；不同区复用语义与文档一致 | `test:int`（真 Redis） | 把 `SET NX` 改成 `SET` → 转红 |
| 碰撞重试有上限；重试耗尽 fail-closed 且不降级为长码 | `test:int` | 去掉重试上限 → 转红 |
| Redis 故障 fail-closed；**创建成功之后**的故障按 `unknown → lost` 收敛 | 故障矩阵 | 把 `unknown` 当作 `renewed` → 转红 |
| 旧 lease 不能 renew/release 新 lease | `test:int`（Lua CAS） | 去掉 CAS 的 `leaseToken` 比对 → 转红 |
| renew 返回 `lost` 后旧房**停止展示旧码**，且不会把好友导向新占码的房间 | `test:int`（强制使 renew 迟到至 lease 过期） | 让 `lost` 后继续展示旧码 → 转红 |
| `renewIntervalMs ≤ leaseTtlMs/3` 且 `leaseTtlMs < waitingDeadlineMs` 在**启动期**断言 | 启动期断言用例 | 配一组违反不等式的值 → 启动失败 |
| 短 lease TTL/renew 与绝对 Waiting deadline 分离；deadline、Start 和 dispose 关闭码/房间，崩溃由 TTL 回收 | `test:int` | 让 deadline 只释放码不 dispose → 转红 |
| `waitingDeadlineMs` 在 start fence 置位期间**不求值**，⛔ 不与在途 Start 抢跑 | 服务端用例 | 去掉 fence 判断 → 转红 |
| 释放/开局后的码在 `codeCooldownMs` 内既不能被 resolve 命中，也不能被新房间分配；用旧码 resolve 得不到任何 joinTicket | `test:int` | 把 tombstone 改回 `DEL` → 转红 |
| resolve 使用**专用**速率桶（失败/成功预算分开 + 全区失败上限），⛔ 复用通用 RPC 预算不算通过 | 服务端用例 + 枚举压测 | 把 resolve 改回通用 RPC 桶 → 转红 |
| resolve 的折叠类错误对「不存在 / 隔离期 / 过期 / mode 不匹配 / 区不匹配」返回**完全相同**的响应 | 服务端用例（逐对比较响应字节） | 让任一类返回不同 detail → 转红 |
| 日志与指标不记录 code/ticket/token 敏感组合；`leaseToken` 不出现在响应、state、日志、ownership key | 日志断言用例 | 往任一处打印 `leaseToken` → 转红 |
| `prepareCreate` 的 creation ticket 绑定权威 owner；“第一个进空房”不能成为房主 | 服务端用例 | 改用 `players.size===0` 推断房主 → 转红 |
| creation/join ticket 的 `jti` 并发、重放、失败重试和 expiry 状态机有 CAS 测试 | `test:int` | 去掉 `seated` 后的重放拒绝 → 转红 |
| ticket 是**不透明串 + 服务端记录**，⛔ 不是自包含签名 token | 静态门禁 + 用例 | 让 ticket 自带可解析声明 → 转红 |
| 单账号超过 `maxConcurrentRoomsPerUid` 后无法再创建私房；未消费 ticket 计入配额 | 服务端用例 | 去掉配额检查 → 转红 |
| 准入时序固定为「同步 fence → 同步占位 → 异步 claim → 同步重验 → `onAdmission` → 落座」 | 服务端用例 | 把 `onAdmission` 提到 ticket claim 之前 → 转红 |
| pending uid/session/seat 在异步 ticket 检查前占位，计入容量，失败无泄漏 | 服务端用例 | 去掉 pending 占位 → 并发入座超员，转红 |
| 无有效 join ticket 的直接 `joinById` 不能借“空房”绕过准入 | 服务端用例 | 去掉 room instance 侧重验 → 转红 |
| resolve 的 phase/capacity 只作 UX 快照，最终 admission 权威；重连不重复消费 access ticket | 服务端用例 | 让重连消费 ticket → 转红 |
| invite-code 房间不会被普通 `joinOrCreate` 选中；`onCreate` 返回后从 matchmaker driver 回查 listing，`private === true` | `test:int`（回查 driver） | 把 `setPrivate` 挪到 `onCreate` 之外并用 `persist=false` → 转红 |
| 输错码不会误创建房间或清除登录态 | 客户端用例 | 让输错码回退到 `joinOrCreate` → 转红 |


### 10.3 房主、Ready 与 Start

| 验收项 | 判定方式 | 变异验证 |
| --- | --- | --- |
| 新玩家默认未 Ready；Ready 只在 Waiting 修改，房主也必须 Ready | 服务端用例 | 让房主免 Ready → 转红 |
| 2、3、4 人全部 Ready 均能由房主开局；低于该 mode 的 `roster.min` 被拒 | 服务端容量矩阵 | 把下界检查去掉 → 转红 |
| 非房主 Start、有人未 Ready、重复 Start 和第五人入座都有稳定拒绝 | 服务端用例 | 去掉 owner 校验 → 转红 |
| Start await 期间 join / final-leave / drop / reconnect / owner-change / dispose 会使本次启动失效 | 服务端用例（在每个 await 边界注入事件） | 只比较 fence 元组中的一项 → 转红 |
| `starting` 对客户端可见；置位期间 `Ready` / `Unready` 均被稳定错误拒绝 | 服务端用例 + state 断言 | 不把 `starting` 写进 state → 转红；让 `starting` 期间的 Unready 通过 → 转红 |
| 离线但仍在重连宽限的成员保留 seat/Ready，却会阻止 Start，直至 reconnect 或最终 leave | 服务端用例 | 让离线成员不阻止 Start → 转红 |
| `owner-ready` 下 Start 失败后**房主仍在座且仍是 owner**；rollback 保留 Ready | 服务端用例 | 让 rollback 清空 Ready 或转移 owner → 转红 |
| lock 失败能回滚；rollback/unlock 失败时 fail-closed，不公开错误 Playing roster | 服务端用例 | 让 rollback 失败后仍发布 Playing → 转红 |
| lock 超时后晚到成功会释放 stale lock；晚到结果**永不到达**时 fence 在绝对上限后触发 fail-closed dispose | 服务端用例（永不 settle 的 lock 桩） | 去掉 retry fence 的绝对上限 → 用例挂住 / 转红 |
| 可重连宽限内 owner/Ready/seat 保留，最终离开才转移或删除 | 服务端用例 | 让宽限内即转移 owner → 转红 |
| Playing 后邀请码失效、房间锁定、不能中途加入 | 服务端用例 | 去掉 Playing 后的码失效 → 转红 |


### 10.4 实时玩法服务端与客户端

| 验收项 | 判定方式 | 变异验证 |
| --- | --- | --- |
| 固定 seed + 固定 input tape 产生稳定 world checksum | 服务端确定性用例 | 引入一处 `Math.random()` → 转红 |
| 输入归一化、转向约束、加速、成长、墙体/身体/食物碰撞均有边界测试 | 服务端用例 | 去掉反向转向约束 → 转红 |
| 非 Playing、错误 mode、超频、倒退 seq、NaN/Infinity 输入 fail-closed | 服务端用例 | 去掉 seq 单调检查 → 转红 |
| 食物数、每蛇身体点、输入队列、快照字节、广播频率和对局时长均有硬上限 | 服务端用例 | 去掉任一上限 → 转红 |
| `tick/ackSeq` 单调；重连后的完整快照到达前不能恢复输入 | 客户端 + 服务端用例 | 让重连后立刻放开输入 → 转红 |
| `hide → show` 往返后 `seq` 单调、无重复输入、无旧快照回写（§7.8） | 客户端用例 | 让 `hide` 期间继续产生输入意图 → 转红 |
| create/joinById、profile、roomId 和完整 join options 都进入 ownership key；key / 错误 ⛔ 不打印 token/ticket | 客户端 ownership 用例 | 从 key 里去掉 `profile` → 转红 |
| 首个真实 ROOM_STATE 前不能发送 Ready/Start/SnakeInput；drop/reconnect 期间 SDK 离线队列保持 0 | 客户端用例 | 允许 SDK 队列缓冲 → 转红 |
| 取消、页面关闭、迟到 RPC/join 和旧 generation 都无权覆盖新房间或触发 input/exit | 客户端用例 | 去掉 `dispatchInput` 的 generation 校验 → 转红 |
| 反复进入 / 退出房间 N 轮后，RoomClient 槽位、ECS world、presentation adapter、输入监听与 ViewMgr handle 均回到基线，无累积增长 | 客户端 dispose 用例（计数断言） | 漏掉任一 disposer → 计数不归零，转红 |
| Snake 未声明 evidence 时绝不进入 `ballMove@1` replay/consumer | 服务端用例 | 让未声明 evidence 的 mode 也产出证据 → 转红 |
| FGUI 房间/HUD 不与 Cocos 摇杆、加速和世界触摸争抢输入 | **人工证据**（Creator + 真机） | 不适用（人工项） |
| 750×1624、常见长屏、安全区、前后台切换和意外旋转 | **人工证据**（Creator + 真机预览） | 不适用（人工项） |
| 2、3、4 个真实客户端走通创建、输码、Ready、房主 Start、游玩、重连、结算和退出 | **人工证据**（真实多客户端联调，依赖外部 WebPlatform 完整登录链） | 不适用（人工项） |

> ⚠ FairyGUI 包在本仓**只有加载路径、没有卸载路径**（包加载器无任何 remove/unload 导出），因此 per-玩法的
> 包闭包是 app session 内的**常驻内存**。本方案不引入包卸载；需要时应作为独立议题设计，并把包闭包大小
> 纳入目标机型预算。上表的 dispose 验收项据此**不包含** FGUI 包本身的释放。


### 10.5 plugin 侧最终验收

框架只有在以下条件全部满足后，才能宣称支持本方案中的“非侵入式 plugin”：

> **口径同 §10 导语**：机检项必须给出「判定方式」与「变异验证」
> （改哪一行 / 删哪个断言 → 哪条用例转红）。⛔ 机检项给不出变异验证的不得作为验收项。人工项写「人工证据」
> 并留存截图/录屏、设备与版本、日期、操作者、对应 commit。

| 验收项 | 判定方式 | 变异验证 |
| --- | --- | --- |
| 新增完整 fixture plugin 时，既有人工源码零修改 | 无侵入矩阵（见下） | 让 fixture 必须手改一处中央源码 → 矩阵转红 |
| 只有 plugin 新文件、generated registry、指纹、FGUI 产物和镜像发生变化 | 无侵入矩阵的 diff 分类器 | 往既有文件里加一行 → 分类器转红 |
| manifest 仍存在时，缺任一 descriptor、endpoint、vector、View metadata 或 composer 必然失败 | plugin freshness 断言（随 `verify:all`） | 逐个删除这五类引用 → 各转红一条 |
| 删除整个 plugin 只能通过显式允许的删除流程 | plugin freshness 断言（随 `verify:all`） | 直接删目录后跑 writer → 必须拒绝而不是静默删生成物 |
| route mode 不再由字段结构推断 | 编译期负例 | 让 `LobbyRpcIdemType` 改回结构推断 → 负例转红 |
| 相同 ID 不同 payload 在 handler 前被拒绝 | 服务端幂等用例 | 去掉 payload hash 比较 → 转红 |
| `clientReqId` 的字符集/长度积木拒绝含 `:`、`{`、换行、超长与非 ASCII 的值 | shared 契约向量 | 换回通用 `requiredId` → 转红 |
| pending/done/done-oversize/unknown 与 durable receipt 的优先级有故障测试 | `test:int` + 故障矩阵 | 把 `done-oversize` 归类为 `unknown` → 转红 |
| 新 plugin 仅声明 `inspectsOperationGroup: "undergroundIdle"` 而未 `dependsOn`、也未获 undergroundIdle 侧 expose 时必须失败 | plugin freshness 断言（随 `verify:all`） | 去掉 group 所有权校验 → 该反例转绿（即门禁失效） |
| drop/reconnect/foreground/close 后不会发生旧 View 回写或 SDK 队列重放 | 客户端生命周期用例 | 去掉 generation 守卫 → 转红 |
| `auth-invalid` 事件发布后的**同一 tick 内** `getToken()` 已为空，此后任何请求不携带旧 Bearer | 客户端用例 | 在清 token 与发布事件之间插入一个 await → 转红 |
| app dispose 后 connection/session/route/ticker/lifecycle 订阅计数**归零**，`PendingOperationJournal` 与 PluginHost 实例全部释放 | 客户端 dispose 用例（计数断言） | 漏掉任一 disposer → 计数不归零，转红 |
| 反复 open/close 同一 plugin route N 轮后，订阅数、ViewMgr 缓存条目和 uncached handle 回到基线 | 客户端用例 | 让 route close 不解绑订阅 → 转红 |
| Home 新入口不需要修改 Home 源码或 XML | 无侵入矩阵 | 让新入口必须改 Home XML → 转红 |
| 抬头状态行与 `docs/inventory.json` 的 `routeOfTruth` 指向一致 | `npm run verify:inventory` | 把抬头指向已降级的归档 → 转红 |
| §11.3 的散文保护清单与 canonical 规则文件**双向比对**一致 | 无侵入矩阵 | 从规则文件里删掉 `pages.ts` → 矩阵因散文清单对不上而转红 |
| `verify:all`、plugin generator/vector gate、相关 server integration/fault 测试和同步检查全部通过 | 上述命令 | 不适用（聚合项） |
| FGUI 新包仍通过真实编辑器导出和 Creator 预览 | **人工证据** | 不适用（人工项） |

还应增加一条端到端“无侵入扩展矩阵”：在临时 checkout 中记录保护文件 hash，加入并 stage/intent-to-add 一个
带合成 FGUI 导出物的最小 `smoke-lobby-plugin`；先证明全部 `--check` 因 stale/missing output 与 lock 失败，再运行
writer、显式 lock accept 和 sync，最后证明全部 check 通过。分类器断言人工文件只出现 plugin-owned `A`，既有
`M` 只命中 provenance 白名单且没有 `D/R` 或既有 `.meta` UUID 变化；第二次 writer/sync 后第一次 patch 的字节/
hash 不再变化。FGUI 编辑器/Creator 的真实导出与预览另做专项验收，Node fixture 不冒充编辑器。

⚠ 镜像 TS 的 `.meta` **无法由 Node fixture 合成**——矩阵会显式 stage/intent-to-add，那恰好把文件变成已跟踪，
从而触发 `sync-client --check` 的 `.meta` 断言。矩阵要么另造合成 `.meta` 并说明 uuid 来源，要么**显式声明
本矩阵跳过 `sync-client --check` 的 `.meta` 段**、由单独的 Creator 人工验收项覆盖。⛔ 不能假装这一段被覆盖了。

删除 fixture 是第二个独立阶段，允许该 plugin 自有文件和镜像出现预期 `D`，但必须通过显式删除授权，并确认
generated registry、Home entry、View、FGUI package/output、未引用源码和镜像均无残留。


### 10.6 回归命令

命令分两段，⛔ **不得混为一谈**：A 段是会写盘的显式接受动作，不构成回归证据；B 段才是 CI 判绿的只读闸。

**A 段 · 显式接受动作（人工执行，产生 lock diff）**

```bash
npm --workspace @game/server run codegen:gameplays   # 拟新增；落地前不存在
node scripts/protocol-fingerprint.mjs      # ⚠ 见下方说明：这是 writer，不是检查
node scripts/fgui-manifest.mjs --write     # FGUI 资源审计锁
```

> ⚠ `scripts/protocol-fingerprint.mjs` **当前没有 argv 解析**，运行即重钉 `scripts/protocol.fingerprint`。
> 它**仅在 `apps/shared/src/protocol/**` 真源确有改动时**才该执行。协议指纹的**检查**由 `test:client` 里的
> 指纹用例承担。未来若按 §4.8 落地互斥的 `--check/--write`，
> 本行才改为 `--check`；⛔ **现在写 `--check` 会被忽略、脚本照样重钉**。

**B 段 · 只读回归（CI 判绿）**

```bash
npm run sync:shared                        # 已包含 client→Cocos 同步，⛔ 不再单列 sync:client
# ← 此处打开一次 Cocos Creator，为 sync 新产生的 apps/Cocos/assets/src/** 文件与新目录生成 .meta
# gameplay 生成物的 freshness 由下面 verify:all 链里的服务端测试断言，⛔ 无独立 --check 命令
npm run verify:sync
npm run verify:all                         # 已覆盖 verify:core / typecheck / test:client / test:fgui / verify:project
npm --workspace @game/server run test:int  # 需先 npm --workspace @game/server run stack
```

> `sync-client --check` 的 `.meta` 断言只遍历 `git ls-files`，本地未 `add` 时不会红，**提交或 CI 上必红**——
> 所以那一步 Creator 不能省。
> `verify:all` 已覆盖上述子链，单列它们只为定位失败，⛔ 不必在回归记录里逐条重复。
> gameplay 生成物的 freshness 断言随 `npm --workspace @game/server run test` 进入 `verify:all`，
> ⛔ 不新增独立根命令、也不单列（命令形态见 §5.4）。
> 若 gameplay 的 View/menu contribution 是最终 View 生成器的输入，则 `codegen:gameplays` 必须在
> `codegen:plugins` **之前**运行（§3.1 交汇点表）。

涉及邀请码 Redis lease 时还要启动本地 stack 并运行相应 `test:int` 和故障矩阵。完整登录链依赖匹配的外部
WebPlatform；Creator/真机预览必须单列，不能由 Node 无头测试冒充。


### 10.7 fixture 无侵入矩阵

端到端步骤**完全引用** §10.5 的无侵入扩展矩阵（临时 checkout
记录保护文件 hash → 加入并 stage/intent-to-add 最小 fixture → 先证明全部 `--check` 因 stale/missing 与 lock
失败 → 运行 writer、显式 lock accept 与 sync → 证明全部 check 通过 → 分类器断言人工文件只出现 fixture 自有
`A`、既有 `M` 只命中 provenance 白名单且无 `D/R` 或既有 `.meta` uuid 变化 → 第二次 writer/sync 后字节不再变化），
⛔ 不在本文重写。

本节只列 gameplay 增量断言：

- [ ] fixture mode 的 per-mode state、服务端 Schema、三端 catalog 各**恰好出现一次**且互相引用闭合；
- [ ] contract digest 改动而未 bump `modeVersion` 时 freshness 断言必红（**先证红，再修复**）；
- [ ] fixture mode **不出现**在默认 Home contribution 与默认撮合池；
- [ ] 删除 fixture 走显式删除模式，generated catalog/state/Schema/镜像**无残留**；
- [ ] 矩阵跑在临时根，复用既有 `--root` fixture seam（先例：仓内 state codegen 测试的 mkdtemp 临时根与
      「`--check` 未改盘」的字节断言）。

⚠ 镜像 TS 的 `.meta` **无法由 Node fixture 合成**（矩阵会显式 stage/intent-to-add，正好把文件变成已跟踪）。
矩阵要么另造合成 `.meta` 并说明 uuid 来源，要么**显式声明本矩阵跳过 `sync-client --check` 的 `.meta` 段**、
由单独的 Creator 人工验收项覆盖。


## 11. 两个玩法的落地形态

本章是框架能力的**示例应用**，用来验证「只新增文件」的承诺。产品规则、数值与表现的真相在
[Snake 玩法](../apps/plugins/snake/README.md) 与 [undergroundIdle](undergroundIdle/README.md)，⛔ 本章不与它们竞争。

### 11.1 实时玩法的权威模拟与竖版实现

#### 迁移原则

旧目录只作为行为参考和素材来源清单：

- 重新提炼规则、常量、碰撞和表现，不 import 旧构建产物；
- 不迁移微信 adapter、远程 bundle loader、旧账号/匹配/网络代码和旧 Cocos runtime；
- 资源只有在权利明确时才复用，并重新导入 Cocos/FairyGUI 生成本项目自己的 `.meta`；
- 先冻结首期规则：地图边界、自撞/蛇撞蛇、死亡、复活、时限、胜负、加速消耗和食物生成；未冻结部分不能
  伪装成已确认需求。

#### 推荐同步模型

首期建议采用服务端权威、客户端轻预测：

- 服务端以 20Hz fixed-step 推进世界（**沿用现有 shared `TICK_RATE = 20` / `TICK_MS = 50`，不新增数值，也不为
  Snake 改 fixed-step 归一化**）；所有方向、加速、碰撞、食物、成长、死亡和胜负以服务端为准；
- 客户端发送归一化方向、加速状态和单调 `seq`，非 Playing、错误 mode、倒退 seq、NaN/Infinity 或超频输入
  一律 fail-closed；
- 服务端以有界频率（例如 10Hz，最终以带宽测试确定）广播 `tick/ackSeq`、蛇身折线、食物和事件快照。
  Snake root 若按 §4.6 只保留低频摘要字段，还应**显式决定该房的 `patchRate`**（现仓默认 50ms / 20Hz），
  避免 Schema patch 与 10Hz S2C 快照对同一批数据重复计费；
- 客户端只预测自己的蛇头，远端蛇插值显示，收到 `ackSeq` 后校正；Room `send()` 成功只代表通过本地发送闸，
  不代表服务端已收到；
- 对食物数、每蛇身体点数、单快照字节数、输入速率、快照频率和对局时长设置硬上限；
- 重连后先取得一份完整权威 state/snapshot，再重新开放输入，不依赖 SDK 离线队列补发旧方向。

这些数值是技术建议，不替代玩法调参。fixed-step 与快照频率应分别做确定性和带宽基线。

#### 竖版布局

保持 `designSpec.ts` 的 750×1624 基线与 `Main.ts:52` 的 `ResolutionPolicy.FIXED_WIDTH`（GRoot 宽恒 750、
高随机型在约 1334~1730 浮动）；第三处一致性来源是 `apps/Cocos/settings/v2/packages/project.json` 的
`designResolution` + `fitWidth`。三处必须同时一致：

```text
┌──────────────────────────┐
│ 房间码 / 人数 / 排名 / RTT │  顶部 HUD
├──────────────────────────┤
│                          │
│       Snake 世界区        │  逻辑世界与设计像素分离
│                          │
├──────────────────────────┤
│  方向摇杆          加速键  │  底部操控与安全区
└──────────────────────────┘
```

房间/Ready 页面适合使用 FGUI。高频世界、蛇身绘制和触摸操控建议使用 Cocos View/节点；不要让一个
`interactive: true` 的全屏 FGUI HUD 长期持有全局输入租约并挡住摇杆。必须在 Creator 和真机检查刘海、安全区、
常见长屏比例、切后台/回前台和意外横屏恢复。


### 11.2 snakeoff 的新增式文件

完成一次性框架改造后，Snake 的手写业务改动应主要是新增以下目录；具体文件可合并，但所有权不能回流到公共壳：

```text
apps/plugins/snake/gameplay/
├── manifest.json
└── state.json

apps/shared/src/gameplays/snake/
├── wire.ts
├── config.ts
└── rules.ts                    # 仅跨端纯数据/纯公式，保持 shared 零依赖

apps/server/src/rooms/modes/snake/
├── index.ts
├── SnakeGameMode.ts
├── SnakeWorld.ts
├── SnakeSimulation.ts
├── SnakeCollision.ts
├── SnakeSnapshot.ts
└── SnakeSettlement.ts

apps/client/src/gameplay/modes/snake/
└── index.ts                    # module + 动态 presentation/lobby loader

apps/client/src/logic/rooms/snake/
├── SnakeGameplay.ts
├── SnakePrediction.ts
├── SnakeInterpolation.ts
└── SnakeRoomLogic.ts

apps/client/src/net/rooms/snake/
├── SnakeRoom.ts
└── SnakeRoomAdapter.ts

apps/client/src/view/rooms/snake/
├── SnakeHudView.ts
├── SnakeWorldView.ts
├── SnakeResultView.ts
└── SnakeLobbyView.ts            # 可选；默认复用框架 PrivateRoomLobby

apps/art/fairygui/assets/<Snake-owned-packages>/**
apps/Cocos/assets/resources/<snake-owned-assets>/**

apps/server/test/snake-*.test.ts
apps/server/test/int/snake-room-*.test.ts
apps/client/test/snake-*.test.ts
```

此外会产生 generated catalog/state、FGUI manifest 和 shared/client/Cocos 镜像 diff。这些属于生成侵入，必须由
命令产生并接受 freshness 检查，不能由开发者手改。


### 11.3 undergroundIdle 的新增式文件

完成框架改造后，Underground Idle 的人工源码应只新增在自己的边界内：

```text
plugins/undergroundIdle/
└── plugin.json

apps/shared/src/protocol/lobbyRpc/domains/undergroundIdle.ts
apps/shared/src/logic/undergroundIdle/**

apps/server/src/websocket/undergroundIdle/*.ts
apps/server/src/core/undergroundIdle/**

apps/client/src/plugins/undergroundIdle/
├── index.ts
├── logic/**
├── net/**
├── routes/**
└── view/
    ├── *.view.json
    └── *View.ts

apps/art/fairygui/assets/<undergroundIdle 独立包>/**

apps/server/test/undergroundIdle*.test.ts
apps/server/test/int/undergroundIdle*.test.ts
apps/server/test/lobbyRpcVectors/undergroundIdle.ts
apps/client/test/undergroundIdle*.test.ts
```

推荐开发动线：

```text
1. 新增 plugin.json、shared domain、RPC vectors、server/client 源码和 View metadata
2. FairyGUI 编辑并真实导出；fgui-codegen 生成 View AUTO 区
3. 运行 plugin 生成器 writer（workspace 脚本 codegen:plugins），审查普通 generated registry diff
4. 显式运行 protocol fingerprint --write 与 fgui manifest --write，审查两类 lock diff
5. 运行 npm run sync:shared（当前已包含 client→Cocos 同步，不再重复运行 sync:client）
6. 打开 Cocos Creator 一次，为 sync 新产生的 apps/Cocos/assets/src/** 文件与新目录生成 .meta，
   与源码同批提交（⚠ sync-client --check 的 .meta 断言只遍历 git ls-files：本地未 add 时不会红，
   提交或 CI 上必红——这一步不能省）
7. 运行 protocol/FGUI/sync/inventory check、typecheck 和 RPC/客户端/服务端测试（plugin 生成物的 freshness
   断言就在这批测试里，⛔ 无独立 --check 命令）
8. Creator 本地预览真实资源与生命周期
9. 分类审查手写 plugin diff、generated diff、lock diff、资源 diff 和镜像 diff
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

如果实现一个普通 plugin 仍需手改其中任何文件，应视为框架扩展点缺失，先判断是本方案遗漏，还是该需求本质上
改变了全局框架语义。

正式实现时应把上述保护集合变成一份 canonical protected-path 规则文件（如 `scripts/protected-paths.json`）并由
无侵入矩阵机检；本文列表只解释边界，⛔ 不能成为随后悄悄漂移的第二真源。该规则文件已进 §5.5 的 provenance
表与 §8 的 Governance 行；矩阵必须把散文清单与规则文件做**双向比对**，两者不一致时红。
（先例：仓内 `verify-inventory` 已经在做「解析 Markdown 表 → 与 `package.json` 双向 deepEqual」。）

⚠ **适用范围**：本清单约束的是**普通 plugin 与 gameplay module 的新增动线**（见本节首句“在这条动线中”）。
§9 的框架改造阶段本身按 §12.3 属于**显式框架侵入**，不适用本清单。保护集合的机检真源见 §8.5，
**全仓只有一份规则文件**（登记见 §5.5 provenance 表与 §8 Governance 行），⛔ 本节散文不是第二真源。


## 12. 最终效果与遗留决策

### 12.1 开发体验变化

| 维度 | 改造前 | 改造后 |
| --- | --- | --- |
| RPC 接入 | 领域文件 + 中央 export/map/validator/错误码 + endpoint schema | 领域 descriptor + endpoint；中央 registry 自动生成 |
| 幂等 | endpoint 手工 `idem:true`，短缓存不绑定 payload | route metadata 自动驱动，payload 绑定、唯一 lease；显式组可查询 |
| 错误 | 领域异常修改中央 `ERR_MAP` | 领域 `RpcFault` + 生成 whitelist |
| 客户端导航 | `pages.ts`/Main/Home 手工接线 | plugin route/menu contribution + 通用 host |
| 断线/回前台 | plugin 需要触碰网络或页面组合根 | 订阅统一 lifecycle，由 RefreshCoordinator 拉快照 |
| View | 手改 registry + contracts | manifest/XML/codegen 生成静态注册表 |
| 测试 | 修改中央穷尽 fixture | plugin 新增自己的向量，通用测试遍历全集 |
| 能力清单 | 修改中央 inventory 和多份状态文档 | extra plugin fragment + 生成索引；core 晋升仍人工 |
| 分支冲突 | 集中在多个中央文件 | 主要发生在 plugin 自己目录；中央只有稳定生成 diff |


### 12.2 最终效果

从用户角度，最终流程是：登录并选区后进入“贪吃蛇房间”，房主创建房间并得到六位码；好友输入六码入座；
房内最多四人，不必等满；当前所有成员 Ready 后，由房主点击开始；随后进入 750×1624 竖版 Snake，对局结束或
主动退出后回到已登录 Home。可重试掉线在宽限内保留 seat，重连完成并取得权威快照后继续。

从开发角度，最终新增另一个实时玩法时只需：

```text
新增 shared manifest/state/wire
  → 新增 server mode
  → 新增 client gameplay/logic/net/view
  → 新增 art 与测试
  → 运行 codegen + sync + verify
```

`GameRoom.ts`、`RoomClient.ts`、`Main.ts`、`pages.ts`、Home 和手写中央消息/页面表不再因玩法名发生修改。必要变化
只剩可预测的 generated catalog、协议指纹、FGUI 清单和镜像；这就是本项目在静态 TypeScript + Cocos 技术栈下
可验证、可维护的“更多无侵入性”。

新增普通玩法的动线中，不应再修改：

```text
apps/shared/src/protocol/messages.ts
apps/server/src/rooms/GameRoom.ts
apps/server/src/rooms/GameMode.ts
apps/client/src/net/RoomClient.ts
apps/client/src/net/rooms/GameRoomTransport.ts
apps/client/src/gameplay/catalog.ts
apps/client/src/gameplay/services.ts
apps/client/src/logic/gameplay/**
apps/server/src/rooms/modes/catalog.ts
apps/server/src/app.config.ts
apps/server/sql/schema.sql
```

⚠ 本块是 `scripts/protected-paths.json` 的 `gameplayFlow.paths` 的散文视图，由无侵入矩阵做**双向
deepEqual**——任一侧单方面增删即红（⛔ 堵住「先从规则文件删条目、再重钉 `protected-paths.lock`」
这条绕过路径）。§12.2 点名的 `Main.ts` / `pages.ts` / Home 属 plugin 动线，列在 §11.3 的清单里，
此处不重复。


两条边界要一起记住：**本清单约束的是「新增普通玩法 / plugin」的动线**，§9 的框架改造阶段本身属于**显式框架侵入**，
不适用本清单；而「Home 可见入口」的登记按 §3.2 第 8 条是唯一例外。保护集合的机检真源见 §8.5，
⛔ 本节散文不是第二真源。

> 注记（2026-09-04，例外已关闭）：snake 的 views/owners/menu 已搬进 `apps/plugins/snake/plugin.json`，
> Home 可见入口不再需要手改中央 `apps/plugins/builtin/plugin.json`；本段「唯一例外」的表述保留为历史
> 设计记录。⚠ 例外关闭只覆盖**菜单入口登记**这一格，本节其余「不再因玩法名发生修改」的边界不变。


### 12.3 仍然应当侵入框架的情况

以下需求本质上改变全局行为，不应为了形式上的无侵入而伪装成普通 plugin：

- 修改 RPC 信封、通用错误语义或幂等算法；
- 修改鉴权、连接恢复、限流、网关预算或默认导航策略；
- 新增 npm 依赖、根命令或运行时环境要求；
- 修改玩家根 schema、SQL schema、跨存储事务或 outbox 语义；
- 修改 GameRoom 通用 C2S 消息、state root 或对局生命周期；
- 改变默认启用 plugin、核心项目边界或生产承诺；
- 修改 FGUI 公共基础包的稳定组件契约。

这些改动仍应显式修改对应框架文件、文档和验收证据。非侵入式架构的目的，是消除重复登记和无关冲突，
不是绕过必要的全局评审。


### 12.4 实施前仍需确认的产品项

**产品项**——以下决定不阻塞框架接口设计，但必须在实时玩法 state/wire 定稿前冻结（§9 阶段 0）：

1. Snake 是否允许房主 1 人开局；本文建议默认 `roster.min = 2`，框架已支持改为 1（`GameMode.roster` 已落地）。
2. 地图边界、自撞、蛇撞蛇、死亡后复活/观战、时限和胜负规则。
3. Waiting absolute deadline、短 lease TTL、`renewIntervalMs`、`codeCooldownMs`、`maxConcurrentRoomsPerUid`、
   creation/join ticket TTL 与 resolve 专用桶的具体**数值**，以及房主离开后是否继续保留原码。
   ⚠ 只冻结数值——它们之间的**不等式约束**由 §6.7 第 6 条规定并在启动期断言，⛔ 不是产品可选项。
4. 好友在对局进行中输码时只能看到“码不可用”（§6.8 的已知代价）是否可接受。若不可接受，唯一出路是把 §6.7
   第 7 条改回「持有到 dispose」，⛔ 不能只恢复一个不可达的错误码。
5. 首期是否需要可信战绩/evidence；若不需要，应显式声明 `evidence: none`。
6. 旧构建档案中哪些代码、音频、图片和动画已获授权复用；未确认资源不得进入本仓
   （台账见 [Snake 玩法文档 §2](../apps/plugins/snake/README.md)）。

命名（含 FGUI 包、组件、stableKey 与资源目录）不在此列——它由 §3.1 的命名规则直接确定，⛔ 不是产品可选项。

**实施优先级**——§9 的阶段顺序已由依赖方向定死，下面是各项工作的**价值排序**，用于在阶段内部取舍：

1. **最高优先级**：RPC domain descriptor、显式 route mode、生成 registry、plugin-owned vectors。
2. **最高优先级**：幂等 payload 绑定、唯一 lease/CAS、operation inspect、自描述错误。
3. **高优先级**：客户端 PluginHost、统一导航/会话/连接/前后台生命周期、数据驱动 Home。
4. **高优先级**：View/FGUI 生成登记和递归 manifest 测试。
5. **中优先级**：inventory fragment、生成文档索引、Lobby/GameRoom 协议身份拆分。
6. **按需求决定**：通用玩家 JSON 聚合适配器和分片协议/FGUI 锁。

不建议为了一个玩法先建设运行时插件系统、完整 DI 容器、跨端热加载或通用 schema 编译器。先消除已经被两个
策划案明确触发的人工登记点，并用最小 fixture（plugin 与 gameplay module 各一个）证明“只新增文件”的验收
条件，再开始完整玩法实现——这正是 §9 把两个玩法的实现排在阶段 10、全部框架阶段之后的原因。

