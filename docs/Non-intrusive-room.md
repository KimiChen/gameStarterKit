# 邀请码房间与竖版贪吃蛇的低侵入式接入方案

> 状态：**设计提案，尚未实施**。
>
> 本文说明为了把外部旧档案（`/Users/kimi/work/tanchishe/wegameVersion`，**仓外、机器本地路径**，其他复核者
> 无法直接打开）中的贪吃蛇玩法改造成竖版、最多四人的邀请码房间 Demo，并让后续实时玩法尽量以“只新增玩法
> 文件”的方式接入，框架本身需要进行哪些一次性改造。它不表示这些能力已经交付，也不改变
> [当前开放问题、实施状态与验收证据的唯一真相](../plan-v4.md)；plan-v3.md / plan-v2.md 为历史归档。
> 当前架构与约束仍以 [技术总览](OVERVIEW.md)、[服务端开发](SERVER.md) 和 [客户端开发](CLIENT.md) 为准。
>
> 产品侧需求来源是 [《Snake Off》竖版贪吃蛇开房玩法策划案](snakeoff/README.md)。本文只负责通用房间框架；
> 玩法规则、数值、竖版表现与素材授权以该目录为准（素材台账见
> [08 · 来源与素材借鉴台账](snakeoff/08-source-and-asset-provenance.md)）。该目录已四处反链本文，本段是补上的
> 反向指针。
>
> [非侵入式 Lobby WS-RPC 方案](Non-intrusive-wsrpc.md) 主要解决已登录 Lobby 页面型 feature，并明确不覆盖
> 实时 Room、GameRoom C2S 和对局生命周期；本文是它在**实时房间玩法**方向的补充。两份方案共享的生成器
> 基础设施、owner 归属与落地顺序以本文 **§4.1** 为唯一口径，⛔ 不能把两种运行时模型混成一个巨型插件。

## 1. 结论与改造口径

本次不应直接在现有 `GameRoom`、`RoomClient` 和 `pages.ts` 中继续增加 Snake 分支。应先把当前“部分插件化”
升级为**编译期玩法模块系统**，再以 Snake 作为验收该系统的第一个完整房间玩法。

改造后的目标是：

> **新增普通实时玩法时，开发者只新增该玩法拥有的 manifest、wire、state、服务端 mode、客户端模块、View、
> 资源和测试；不再手改 `GameRoom.ts`、`RoomClient.ts`、`Main.ts`、`pages.ts` 及中央消息/页面清单。已有文件只
> 允许出现确定性的 codegen、协议指纹、资源清单和同步镜像差异。**

“一个旧文件都没有 Git diff”并不是合理目标。Cocos Creator、TypeScript 和 Node 都需要构建期可见的静态
模块全集，shared 协议还需要可审查的版本与指纹。因此应消除的是**人工维护的中央分支和重复登记**，而不是
隐藏必要的生成变化。

### 1.1 本需求的确定口径

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

## 2. 为什么需要先改框架

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

## 3. 目标、范围与非目标

### 3.1 可验收目标

一次性框架改造完成后，应满足：

1. 认证玩家能在当前区创建 Snake 私房，得到保留前导零的六位数字码。
2. 其他玩家能输入六码，经 Lobby resolve 后定向 `joinById`，不会因输错码而误创建新房。
3. 房间最多 4 人；达到该玩法 `minPlayers` 且当前成员全部 Ready 后，只有房主能启动。
4. 创建、入座、Ready、Start、锁房、重连、房主转移、结算和退出都有服务端权威状态与稳定错误。
5. Snake 运行服务端权威 fixed-step 模拟，客户端只发送输入，并用 `tick/seq` 对账。
6. Snake 使用现有 750×1624 竖版基线，房间 UI、世界区、操控区和安全区互不争抢输入。
7. 新玩法消息、state root、服务端/客户端 catalog 和 View contribution 由玩法文件 + codegen 接入。
8. 增加一个测试 fixture mode 时，不修改 `GameRoom.ts`、`RoomClient.ts`、`Main.ts`、`pages.ts` 或手写中央清单。
   ⚠ **唯一例外**：若新玩法要在 Home 出现可见入口，它需要往菜单 contribution 集合登记一条——该集合按
   §4.1 表 1 归 wsrpc §7.4 拥有。「登记一条 contribution」属于生成侵入还是人工侵入，取决于 wsrpc 最终把
   contribution 的手写真源放在哪里；实施时必须明确，⛔ 不能默认它是零成本。

### 3.2 非目标

本方案不承诺：

- 运行时热插拔、远程插件下载、脚本热更或运行时文件系统扫描；
- 原样迁移旧项目的微信插件、账号、好友关系、匹配服务、协议栈、排位、商业化和活动系统；
- 因“邀请好友”四个字自动获得微信/通讯录分享能力；首期只是显示、复制或由宿主分享六位码；
- 首期复制旧游戏全部皮肤、复活、AI、道具和玩法变体；
- 仅凭 Redis 邀请码租约就获得生产级跨节点 Room 能力；当前 RedisDriver/RedisPresence 的部署边界仍以
  `SERVER.md` 为准；
- 为 Snake 强行复用 ballMove 的证据格式，或在玩法规则未冻结时先承诺可信战绩链；
- 为一个玩法提前发明万能 Schema DSL、跨运行时巨型 plugin 或统一所有网络同步模型。

## 4. 目标架构与所有权边界

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

### 4.1 与 Non-intrusive-wsrpc.md 的共享基础设施边界

本文与 [Non-intrusive-wsrpc.md](Non-intrusive-wsrpc.md) 是同一个仓库的两个并行改造方案，各自独立设计了若干
**同名不同源**的机制。本节是两者共享部分的**唯一口径**；两文的其余章节遇到冲突一律以本节为准。

#### 表 1 · 共享设施的唯一 owner

| 共享设施 | owner 文档 | 另一方的消费方式 | 顺序颠倒时的降级路径 |
| --- | --- | --- | --- |
| 客户端 View catalog / FGUI contract / FGUI 包闭包 | **wsrpc §7.5**（最终文件 `apps/client/src/generated/views.generated.ts` + `fguiContracts.generated.ts`） | 本文 §5.2 的 `codegen:gameplays` 只产出 gameplay 的 View contribution（中间产物），由最终 View 生成器汇总 | 谁先落地谁拥有生成器与产物路径；后落地方只新增输入类型与 `owner` 取值，⛔ 不得二次改写 `viewRegistry` / `fguiContracts`。若本文先落地，wsrpc 阶段 4 接管并在文档里注明接管点 |
| View metadata 的手写格式 | **wsrpc §7.1** 的 `*.view.json` sidecar | 本文的 gameplay View 把 sidecar 放在自己的 View 同目录，⛔ 不定义第二种格式 | 无（格式先行，与落地顺序无关） |
| Home 菜单数据源 | **wsrpc §7.4** 的 menu contribution | 本文 §9.3 的 gameplay 入口编译成**相同形状**的 contribution，菜单只有一个数据源 | 若本文先落地，先建最小 contribution 形状并在 wsrpc 阶段 4 合并，⛔ 不建第二张菜单表 |
| 协议兼容版本与指纹锁 | **wsrpc §8.4** | 本文 §5.3 的 framework protocol version **就是** `GAME_ROOM_PROTOCOL_VERSION`；保留单一仓库级字节锁 | 以先落地者建立的常量为准，⛔ 不允许各自新增一个 Game join 版本闸 |
| Redis Lua 装载与 key 构造 | 仓内既有 `core/infra/redisScripts.ts` + `keys.ts` | 两文都只**复用**装载器与 key 构造器，⛔ 不另建第二套 | 无 |
| `pages.ts` 的终局形态与状态所有权 | **wsrpc §7.2**（NavigationService / SessionCoordinator / LaunchPort） | 本文 §9.3 保留的三个函数只能是零状态纯转发 | 若本文先落地，三个函数临时持有接线，但必须在 wsrpc 阶段 3 迁走（见 §14 阶段 4 的迁移债） |
| 生成器根命令与四重守门 | 各自独立登记 | 两条命令各自接线、各自在 `docs/inventory.json` 登记一条 | ⛔ 不合并成单一 `npm run codegen -- --all` 前端——与仓内 `codegen:fgui` / `codegen:http` / `codegen:state` 三条并存、逐条登记的惯例冲突 |
| 生成器执行顺序 | 本节 | 若 gameplay 的 View/menu contribution 成为最终 View 生成器的输入，则 `codegen:gameplays --write` 必须在 wsrpc 的 `npm run codegen:features -- --write` **之前**运行，只读闸同序 | 顺序写进 §15.5 的命令块 |
| Lobby RPC 错误域 | **wsrpc §5.2 / §6.5** 的 generated domain error + `RpcFault` | 见下方“表 2 · 错误域两路顺序” | 见下 |
| 受保护路径规则 | 本文 §11.5 与 wsrpc §10 共用**同一份** canonical 规则文件 | 先落地方建立文件，后落地方往同一份追加条目 | 若两者独立推进，各自持有一份并在合并时归一，⛔ 不长期并存两份 |
| 幂等原语 vs 邀请码租约 | 两者**不共用记录结构** | `StoredIdem` 是「请求 → 结果」的幂等记录（key 含 `clientReqId`，30/60 秒量级 UX 快闸）；邀请码租约是「六位码 → 房间」的占位记录（生命周期是房间 Waiting 期，需 renew 与绝对 deadline） | 共用的只有 Lua 装载器与 key 构造器 |

#### 表 2 · 落地顺序

| 顺序关系 | 理由 | 顺序颠倒时的降级动作 |
| --- | --- | --- |
| wsrpc 阶段 1–2（RPC descriptor / registry codegen / 幂等 v2 / `RpcFault`）**先于** 本文阶段 3（`room.prepareCreate` / `room.resolve`） | 两条 core Lobby RPC 若在旧架构下新增，会触碰中央 RPC 全集与 `core/errors.ts` | **顺序 A（wsrpc 先，推荐）**：本文只新增 `domains/room.ts` 的 `errorCodes`，零中央侵入。**顺序 B（本文先）**：按 §6.4 / §11.2 显式改 `envelope.ts` 与 `core/errors.ts`，并同时把 wsrpc §11 阶段 1 的迁移清单改成「user/mail/shop/guild/**room**」、阶段 2 的审计清单补 `room.prepareCreate` |
| wsrpc 阶段 3–4（AppRuntime / Navigation / Home / View 生成）**先于** 本文阶段 4（客户端 module 与 View contribution） | 否则本文阶段 4 会先建一套菜单与 View 登记，随后被 wsrpc 阶段 4 二次改写 | 本文阶段 4 只建**最小**的 gameplay contribution 形状，并在 §14 阶段 4 登记迁移债 |
| 本文阶段 0–2（规则冻结 / 拆 ballMove / wire token 与分片 state）**与 wsrpc 无耦合** | 只动 GameRoom 侧与 gameplay codegen | 可并行 |

> **默认入口归属已拍板（2026-08-31，记录于 plan-v3 §27.3）：snakeoff 优先替代 ballMove 入口**，wsrpc 的
> undergroundIdle 迁移入口路线次之，落地顺序按此执行。该决定写在已降级的归档里、当前计划文件未承接，
> 因此在此登记，⛔ 不让批准来源再次只存在于会话指令。

#### 表 3 · 两份「一次性侵入」表的重叠文件

| 文件 | 本文要求 | wsrpc 要求 | 合并后目标形态 |
| --- | --- | --- | --- |
| `apps/client/src/view/pages.ts` | 收敛为通用 gameplay lobby / launch / 登录后 Home 恢复 | 迁走 session owner、reconciler、return-to-login、页面数组，最终纯转发 | 状态归 wsrpc 的三个 host 模块；本文保留的三个函数是零状态纯转发 |
| `viewRegistry.ts` / `fguiContracts.ts` / `ViewMgr.ts` | generated 静态 catalog + 可注入只读 lookup | 稳定 façade 消费 generated registry | 同一 writer、同一产物路径（表 1 第 1 行） |
| `HomeView.ts` / `HomeLogic.ts` / Home FGUI 设计源 | 玩法入口列表 | 数据驱动 feature menu | 同一 menu contribution 形状（表 1 第 3 行） |
| `core/errors.ts`、`lobbyRpc/envelope.ts` | 通用房间错误归 core，三类错误域分离 | generated domain error + `RpcFault` | 按表 2 的顺序 A / B |
| `core/infra/keys.ts` | 新增邀请码 lease/ticket key 构造器 | idem key 继续经 `kIdemUser` | 同一文件，各自新增构造器并按铁律 8 先登记 |
| `apps/Cocos/assets/scene.scene`（手工场景资产） | Main 的 `@property` 搬家会改变组件序列化 | 同 | ⛔ 不在机械 diff 白名单内，只能由 Creator 编辑器产生并人工审查 |
| 根 `README.md` / `AGENTS.md` / `CLAUDE.md` / OVERVIEW / SERVER / CLIENT / inventory | 新玩法动线 | 新 feature 动线 | 各自增补，⛔ 不互相覆盖 |

#### 术语对照

| 统一说法 | 本文旧称 | wsrpc 旧称 | 说明 |
| --- | --- | --- | --- |
| **gameplay module** | gameplay module / mode | —— | 实时 Room 玩法，运行在 GameRoom 内 |
| **feature** | —— | feature | 已登录 Lobby 页面型能力，不进 GameRoom |

⚠ **feature 与 gameplay module 是两种不同实体**，⛔ 不得互相冒充，也不得合并成一个巨型插件模型。
两个方案各自的 `schema-v1.json` 必须改名区分（`features/feature-schema-v1.json` 与
`tools/gameplay-codegen/gameplay-schema-v1.json`），避免同基名文件在检索与工具链里互相顶替。
`manifest` / `descriptor` / `catalog` / `registry` 的用词各自文档内保持一致即可，⛔ 不做全仓重命名——
仓内 `GameplayRegistry` / `viewRegistry` / `VIEW_REGISTRY` 已把 registry 用于多种含义。

## 5. 编译期玩法模块与 codegen

### 5.1 每玩法单源目录

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

### 5.2 生成物

新增拟议命令 `npm run codegen:gameplays`，生成：

```text
apps/shared/src/gameplays/catalog.generated.ts
apps/shared/src/protocol/generated/wire-catalog.generated.ts
apps/shared/src/protocol/generated/state/<id>.ts
apps/server/src/rooms/schema/generated/<id>.ts
apps/server/src/rooms/modes/catalog.generated.ts
apps/client/src/gameplay/catalog.generated.ts
apps/client/src/view/view-catalog.generated.ts
```

> ⚠ 上表最后一行 `apps/client/src/view/view-catalog.generated.ts` 按 §4.1 的裁定改为：
> `codegen:gameplays` **只产出 gameplay 的 View contribution（中间产物）**，由最终 View 生成器汇总；
> ⛔ 不直接写客户端 View 产物。客户端 View catalog / FGUI contract 全仓只有一个 writer，见 §4.1 表 1。

客户端和服务端 catalog 都应是显式、排序稳定的静态 import。客户端具体 Cocos/FairyGUI presentation 仍由
玩法 entry 内部使用字面量动态 import，避免进入普通脚本静态依赖图。不要使用副作用式自注册、`fs` 运行时扫描
或未经当前构建链验证的 `import.meta.glob`。

**生成器的通用约束不在本文重复。** gameplay 生成器**继承** [Non-intrusive-wsrpc.md](Non-intrusive-wsrpc.md)
§8.1 的全部生成器通用约束：`--check` 副作用禁令、先在内存完成全部校验再逐文件原子替换、stale/missing/extra
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
读取的 builder + object/string literal 形态，computed property、spread 或顶层副作用直接拒绝——与 wsrpc §8.1
同口径。

**生成代码的编译边界**（生成器必须自检，否则产物过不了既有 typecheck）：

- 生成的 **client** 代码只能使用 ES2017 运行时 API（⛔ 禁 `Object.fromEntries` / `Array.prototype.flat` /
  `Promise.allSettled` / `String.prototype.matchAll`；`apps/client/tsconfig.json` 的 target/lib 钉死 ES2017，
  且已有用例专门断言前两者必须报错），并且必须过 `noUnusedLocals`；
- 生成的 **shared** 代码额外满足铁律 4 与 shared 侧的加严选项：`exactOptionalPropertyTypes`（可选字段
  ⛔ 禁显式赋 `undefined`）、`verbatimModuleSyntax`（类型导入一律 `import type`）、`isolatedModules`
  （类型再导出用 `export type`）；相对导入不带扩展名。

**生成物路径与协议字节锁的关系（二选一，本文取 (a)）**：

- **(a)（本文采用）** per-mode 生成物移出协议目录，落到 `apps/shared/src/gameplays/generated/**`（wire catalog
  与 state descriptor 一起搬）；`apps/shared/src/protocol/` 只保留稳定 join envelope 与 core wire。这样新增
  玩法不会每次都改变仓库级协议指纹。
- **(b)** 保留 `protocol/generated/**` 原路径，则必须明写：**每次新增/修改玩法都会改变仓库级协议指纹并需要
  显式重钉**——这是有意的 review 可见性，与 §5.3 的语义隔离目标不冲突（字节锁只证明协议目录经过显式接受，
  不证明语义兼容），并在 §12 的“生成侵入”清单与 §15.5 的显式接受段各加一行重钉步骤。

**命令形态（二选一，实施前必须选定，本文推荐方案 A）**：

- **方案 A（推荐，不新增根命令）**：沿用仓内 `codegen:state` / `codegen:http` 的先例——writer 作为
  workspace 脚本，freshness 由测试断言（先例：`apps/server/test/room-state-codegen.test.ts` 对已入库产物做
  freshness 断言），随 `npm --workspace @game/server run test` → `verify:all` 生效。不触发下面的多重守门。
- **方案 B（新增根命令 `codegen:gameplays`）**：必须**逐条**接入仓内既有的四重守门，⛔ 漏一条就是静默失闸：
  1. 根 `package.json` 的 scripts；
  2. `scripts/verify-toolchain.mjs` 的命令/链声明表；
  3. `apps/client/test/toolchainContract.test.ts` 的承重钉（**仅当该命令被挂进 typecheck / verify:sync /
     verify:core / verify:all 之一时**才必须同步钉）；
  4. `docs/inventory.json` 对应 capability 的验证依赖；
  5. `scripts/verify-inventory.mjs` 对根 `README.md`、`AGENTS.md`、`CLAUDE.md` **三份**常用命令表与根 scripts
     的双向相等断言（AGENTS/CLAUDE 另需逐字一致）。

  并按 wsrpc §8.1 末段补一条**删除该聚合命令的反例**，证明 gameplay gate 不会静默退出 `verify:core`。

**CLI 与测试形状**沿用既有 `--check` + `--root=<dir>` 约定与 mkdtemp 临时根测试形态（先例同上），
⛔ 不要写 `--repositoryRoot`——那只是 options 字段名、不是 flag。生成器自身的 `.ts` 必须确实落进某条
typecheck 程序：要么按 `tools/fgui-codegen` 先例写进客户端 test tsconfig 的 include，要么由一个已在 include
内的测试值导入（`tools/client-perf-baseline.ts` 正是靠一条测试的值导入被 tsc 传递纳入）。**实施时必须点明
选了哪一种。**

### 5.3 版本边界

继续保留当前 wire 的 `v` 字段，但把它明确为 framework protocol version；另增加每玩法独立的
`modeVersion`。公共认证、join envelope 或生命周期语义变化才升级 `v`，只改 Snake wire 时只升级 Snake 的
`modeVersion`。这样 Snake 的演进不会无条件使 ballMove/idle 客户端全部失配。

这不是只改 `rooms.ts`：当前 `PROTOCOL_VERSION`（`apps/shared/src/protocol/rooms.ts`，写作时取值 7）被
Lobby join（`LobbyRoom.ts:252`）、Game join（`GameRoom.ts:114/658/878`）、`/version`（`http/misc/version.ts`）、
`/healthz`（`http/misc/healthz.ts`）、客户端 join options（`WebSocketClient.ts:402`、`RoomClient.ts:654`）
与 `scripts/protocol-fingerprint.mjs` 共同读取。⛔ **客户端目前没有任何 HTTP 启动探测**；本方案若要新增，须
显式登记为新增能力，不能当作既有事实。per-mode digest 只覆盖该 mode 的 wire/state/modeData 契约，不把服务端
实现、UI 或资源变化误判为 wire bump。

**跨文对齐（口径以 [Non-intrusive-wsrpc.md](Non-intrusive-wsrpc.md) §8.4 为准）**：

- 最终只有**两个**人工兼容整数：`LOBBY_PROTOCOL_VERSION` 与 `GAME_ROOM_PROTOCOL_VERSION`。本文所说的
  framework protocol version **就是** `GAME_ROOM_PROTOCOL_VERSION`，§6.1 信封字段 `v` 携带的正是它，
  **不是第三个整数**；“bump framework version”即 bump 该常量。`/version` 与 `/healthz` 同时报告两类身份。
- 三层分工固定为：`GAME_ROOM_PROTOCOL_VERSION` 管信封与 core wire 兼容；`modeVersion` 管单玩法契约兼容；
  仓库级 protocol fingerprint **只做字节审计锁，⛔ 不参与运行时 join 判定**。
- 因此**保留单一仓库级字节锁**，⛔ 不把 `protocol-fingerprint.mjs` 拆成 framework 指纹 + per-mode digest；
  per-mode digest 由 `codegen:gameplays` 单独产出、单独校验，不进指纹脚本。
- 两份方案若分别落地，以先落地者建立的常量为准，⛔ 不允许各自新增一个 Game join 版本闸。
- **parser 硬约束**：`protocol-fingerprint.mjs` 的版本解析要求 `rooms.ts` **有且仅有一个**顶层
  `export const PROTOCOL_VERSION = <整数>;`，任何改名或拆分都会先 throw；锁文件当前是单行
  `v<version> <hash>`，改为两个整数后的新行格式必须在实施前定死，并同批更新
  `apps/client/test/protocolFingerprint.test.ts` 与版本矩阵测试。

## 6. Shared wire 与 state 改造

### 6.1 稳定 join envelope

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

### 6.2 玩法自带 message token

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

### 6.3 分片 state descriptor

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

### 6.4 错误域不能再次变成中央侵入点

错误至少分成三类，不合并为一个万能 enum：

- Game join refusal：版本、准入、容量、ticket 等建连失败；
- 房内 core control error：Ready/Start/owner/phase 等通用控制错误；
- Lobby RPC error：`prepareCreate/resolve` 的信封与领域错误。

Ready/Start/invite 的通用错误一次性进入 core room error contract。后续玩法自有错误由 gameplay manifest 贡献到
generated error catalog，或用该玩法自己的 S2C token 表达；不得再手改全局玩法错误 switch。

Lobby RPC 错误的两路顺序见 **§4.1 表 2**：顺序 A（wsrpc 先，推荐）下本文只新增 `domains/room.ts` 的
`errorCodes`，零中央侵入；顺序 B（本文先）下必须显式修改 `lobbyRpc/envelope.ts` 与服务端 `core/errors.ts`，
并同步扩充 wsrpc 阶段 1 的迁移清单与阶段 2 的审计清单。⛔ 不能把这部分侵入遗漏在计划之外。

## 7. GameRoom core 改造

### 7.1 删除 ballMove 默认语义

第一步必须是行为等价地把 ballMove 从 `GameRoom` 公共壳中拔出：

- Move、CastSkill、出生/复位、fixed-step、死亡、settle、replay/evidence 全部迁入
  `apps/server/src/rooms/modes/ballMove/**`；
- 删除 `usesDefaultBallMoveRules`；
- 删除找不到 mode 时回退 ballMove 的行为，未登记 mode 必须 fail-fast；
- 测试专用 `injectInput()` 下沉到 ballMove harness，不要求每个玩法实现 ballMove 输入形状；
- replay/evidence 变成可选 mode capability，Snake 未声明时明确不产出 ballMove 证据。

只有完成这一步，后续 registry/policy 才是真正的玩法无关，而不是把特判藏到接口后面。

### 7.2 通用 policy

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

**人数只有一个真源。** `min` / `max` / `autoStart` 都来自 manifest（今天已落地为 `GameMode.roster`，见 §2），
`StartPolicy` ⛔ **不重复声明任何人数**——两份声明必然漂移。这也是为什么 `auto` 分支不带 `minPlayers`：
自动开局人数用 manifest 的 `autoStart`，它与 `min` 是两个字段（现仓 `assertGameModeRoster` 校验
`min ≤ autoStart ≤ max`），只写一个 `minPlayers` 会丢掉“min=2 但 3 人才自动开”的表达力。

因此本节的 min/max/autoStart **不是新发明**，而是把已落地的 `GameModeRoster` 从 mode 对象搬到
profile/manifest。迁移时 `assertGameModeRoster` 及其 ballMove 证据耦合断言（声明 `ballMove@1` ruleset 时
`min` 与 `autoStart` 必须都等于该 ruleset 的固定人数）要一并迁到 codegen / 启动期，⛔ 不能留成第二道与
manifest 打架的闸。

硬容量同理不在 `StartPolicy` 重复声明，只从 manifest 的 `maxPlayers` 生成。启动时必须断言 generated state
上限、admission cap 和 Colyseus `maxClients` 完全相等。`AccessPolicy.invite-code` 的四个时间/配额参数的
不等式约束见 §8.2 第 6 条，同样在启动期断言。`RoomProfile` 允许同一 Snake 规则以后同时组合为私房 Ready 或
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
  `joinOrCreate` 撮合选中；⛔ 不要把 `persist = false` 复制到 `onCreate` 之外（详见 §8.3 的说明）。private
  只控制 listing 可见性，不替代 access ticket 与 admission；
- Playing 后 lock、关闭邀请码并拒绝中途入座。

高频 command handler、玩法 `onAdmission` 与 `onStep` 必须同步、确定且有预算；异步 ticket/lease 验证属于 core
access transaction，不能泛化成任意 mode 异步 admission。其他异步 I/O 只允许出现在 initialize、start、
settle/dispose 等明确 lifecycle 边界，重计算继续遵守 `SERVER.md` 的 compute task 约束。

### 7.3 开局必须是可回滚事务

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

**Starting 必须对客户端可见（二选一，实施前必须选定，本文推荐路线 A）**：

- **路线 A（推荐）**：§6.3 的 `OwnerReady` fragment 增加低频控制字段 `starting: boolean`。它在第一个 await
  之前置位，rollback 或发布 Playing 时清除；置位期间 `Ready` 的 core handler 以 §13.2 的“Start 在途”稳定
  错误拒绝，客户端据此禁用按钮。此时 Start 在途只需对 join / 最终 leave / drop / dispose 做重验。
- **路线 B**：保留“Unready 使 Start 失效”的语义，但必须写明“成员可否决开局是**刻意**设计”，给出重试上限与
  退避，并且**仍要**把 `starting` 暴露给客户端用于禁用按钮。

⛔ 不允许维持“phase 仍是 Waiting、Ready 合法、其他客户端 state 无任何变化”的三不管窗口——那个窗口最长可达
一个 lock 超时周期。

还必须保留当前已有的 late-lock 防护：`lockWithDeadline + lifecycle abort` 超时后继续观察底层 lock 的最终结果；
若它晚到成功，立即释放 stale lock；在晚到结果收敛前以 retry fence 拒绝第二次 Start。普通“catch 后 unlock”
无法处理 Promise 已超时但底层稍后改成 locked 的情况。

retry fence 的观察必须有**绝对上限**（建议 ≥ 一个 lock 超时周期，且 ≤ 该 profile 的 `waitingDeadlineMs`）。
超过上限仍未收敛，房间必须 fail-closed——释放邀请码 lease、下发不可恢复错误并 dispose。invite-code profile
可由 `waitingDeadlineMs` 兜底，但必须在实施时显式关联；`matchmaking` profile 没有 deadline，**必须自带这一
上限**。⛔ 不允许留下“看起来在 Waiting、却永远开不了局”的僵尸房。

## 8. 六位邀请码与定向加入

### 8.1 码与内部房间分离

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

### 8.2 租约实现

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
   §7.2 的 lock 超时一起在**启动期断言**（与「generated state 上限 / admission cap / `maxClients` 三者相等」
   同形），⛔ 不允许留到运行时才暴露。§17 第 3 条只冻结**数值**，不替代这里的**不等式**；
7. Start 成功和 room dispose 都把码从 active 转入**隔离态**：对同一 Redis key 写入 tombstone value、
   `PX = codeCooldownMs`，⛔ **不是 `DEL`**。隔离期内 `resolve` 一律返回与“码不存在”完全相同的折叠错误；
   分配器的 `SET NX` 因 key 仍存在而不会重用该码；隔离期满由 TTL 自然回收。进程崩溃由短 TTL 回收，
   崩溃场景没有隔离期是刻意的取舍（崩溃后不存在仍持旧码的客户端会话可被误导）。
   > 被否决的替代方案：「码持有到 dispose 为止（Start 后只置 inactive），dispose 之后再冷却」。两者取其一，
   > **实施前必须明写取哪个**；本文取 tombstone 方案，因为它与第 2 条的 `SET NX` 分配器天然兼容，不引入新依赖。
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
key；CAS 比对使用恒定时间比较。（§6.1 的 token 禁令只覆盖客户端 join options，服务端侧需要本条。）

所有 key 必须通过 `apps/server/src/core/infra/keys.ts` 新增的专用构造器生成，且 **`sId` 作为显式参数逐层
传递**，⛔ 不依赖 `zoneCtx` AsyncLocalStorage：GameRoom 不在任何 `zoneCtx.run` 作用域内（区是房级常量），
而 `prepareCreate` / `resolve` 跑在 LobbyRoom 的 `zoneCtx.run({sId})` 里；create 与 renew/release 若一侧读
ALS、一侧读房级 `sId`，就会打到不同 key。`sId` 取 GameRoom 已有的房级值（onAuth 权威区号），随 lease value
存入并在 CAS 时比对。

### 8.3 prepare/resolve 与 access ticket

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
  [Non-intrusive-wsrpc.md](Non-intrusive-wsrpc.md) §8.2 拟新增的 `apps/server/test/lobbyRpcVectors/room.ts`），
  并进 §15.2 验收清单。

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
- **对外错误分两类**，避免把 resolve 变成存在性预言机：
  - **折叠类**——`码不存在`、`处于隔离期`、`已过期`、`mode/profile 不匹配`、`区不匹配`，统一返回同一稳定码
    （例如 `ROOM_CODE_UNAVAILABLE`），响应体不带 detail、不回显 code；
  - **保留类**——`房已满`、`房已开始` 保留独立码（持码者本就是被邀请方，客户端需据此给出重试 / 返回引导）；
    `码格式非法` 单独返回 `INVALID_PAYLOAD`。

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
5. **同步**调用 `mode.onAdmission`；
6. 落座，并把 ticket CAS 到 `seated`。

第 2–5 步任一失败都属于下文所说的“入座前的安全失败”，必须释放 pendingSeat 并把 ticket 在原 `exp` 内退回
`issued`；只有第 6 步成功之后 ticket 才不可回退。⛔ **不允许把 `mode.onAdmission` 排在 ticket claim 之前**
——那会让玩法资源分配先于权威准入。

静态 envelope/auth 只校验身份和 ticket 形状，`roomId` / lease generation 绑定必须由目标 room instance 重验，
不能让一个可重放的 ticket 串直接等于 admission。

### 8.4 用户流程

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

## 9. 客户端模块、页面与生命周期

### 9.1 `GameplayModule`

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

### 9.2 generation-fenced presentation

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

`rematch` 按 §13.1 属于**未定义语义**，⛔ 落地前不进入 host 稳定 API；将来加入时必须同时定义新一轮
roster / ready / 邀请码状态，以及它究竟是 exit 还是 launch。退出原因到既有词汇表的映射也要写死：
`user-exit` 映射到既有的“主动退出”；`settled` 要么同样映射到主动退出，要么在既有 stop 原因枚举里新增
`settled` 并说明为何需与主动退出区分。`cancelled` / `disposed` / `room-lost` / `plugin-error` ⛔ 不由玩法侧
发起，只能由 host 内部产生（现仓即如此接线）。

`dispatchInput` 和 `requestExit` 都要校验 generation。旧 View、迟到 join、迟到 RPC 或上一局的 async callback
无权操作后来创建的 room。**gameplay generation 与页面 / route 所有权的关系必须显式定义**——推荐由
wsrpc §7.2 的 route ownership handle 派生（route close/replace 立即使其失效），或明确采用「route signal +
gameplay generation」双守卫并写清两者失效的先后；`dispatchInput` / `requestExit` 的守卫对象据此确定。

正常结算和主动退出都由通用恢复路径执行 `controller.stop → 恢复已登录 Home`，玩法不能自行重建登录页或房间
单例。引擎 `Node`/mount 由 `gameplay/` 与 `view/` 之间的 presentation adapter 注入，不进入 `logic/` 契约，
继续遵守 Logic 禁止依赖 `cc` / FairyGUI 的边界。

### 9.3 Lobby/View contribution

页面登记改成 contribution：

- codegen 生成不可变、静态 import 的 View catalog；`ViewMgr` 从注入的只读 catalog 查询 `ViewMeta`，不再读取
  手写的 `VIEW_REGISTRY` 全集。**writer 只有一个**：最终产物固定为 wsrpc §7.5 的
  `apps/client/src/generated/views.generated.ts` + `fguiContracts.generated.ts`（见 §4.1 表 1），
  `codegen:gameplays` 只产出 gameplay 的 View contribution 中间产物。每条 View metadata 带 `owner` 字段
  （feature id 或 gameplay id），生成期检查同一 View 只被一个 manifest 拥有；
- View metadata 的**手写唯一真源**沿用 wsrpc §7.1 的 `*.view.json` sidecar 格式与字段集（layer / fullscreen /
  onlyOne / permanent / interactive、无前缀的手写绑定、动态资源 URL，并**必须包含 `sharedPkgs` 传递闭包**）；
  gameplay 拥有的 View 把 sidecar 放在自己的 View 同目录，`codegen:gameplays` 只校验 gameplay View 集合与
  manifest 一致，⛔ 不定义第二种 metadata 格式；
- Login / Home / Confirm 等核心 View 由 wsrpc 的 built-in feature 拥有；**gameplay 只贡献自己的** Lobby、
  等待、HUD、结算 View；
- FGUI contract 直接放入 `ViewMeta.contract`，测试遍历 generated catalog，不再维护第二份 `FGUI_CONTRACTS` 全集；
- 生成的 catalog 必须同时产出 **`sharedPkgs` 传递依赖闭包**（含代码里 `ui://` 直引、无法由 art XML 推导的包）
  ——FairyGUI **不自动加载依赖包**，漏一个包按钮就空白（现仓 `viewRegistry.ts` 的条目已逐条声明）。沿用现有
  `viewRegistry` 测试的「`sharedPkgs ⊇ 依赖闭包`」断言，catalog 生成化后改为遍历 generated 条目；§11.4 的
  `PrivateRoomLobby` 模板包与 Snake 自有包的闭包如何合并也要一并写明。图标包闭包沿用同一套计算，
  ⛔ `codegen:gameplays` 不自行实现第二套；
- Home 一次性改为渲染 generated lobby contributions，以后新增玩法只增加 contribution。gameplay 的 Home 入口
  编译成与 wsrpc §7.4 **相同形状**的 menu contribution（`slot` / `order` / owner id / entryId、标题
  LocalizePort key、图标 URL 与 launch target），菜单只有一个数据源，排序沿用 `slot → order → featureId →
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

玩法启动与返回**统一由 wsrpc §7.2 的 `NavigationService` + `LaunchPort` + `SessionCoordinator` 拥有**。
`pages.ts` 若保留 `openGameplayLobby` / `submitGameplayLaunch` / `restoreAuthenticatedHome`，只能是**零状态
的纯转发**（分别转发到 navigation 的 route open、`LaunchPort.launch(target)`、SessionCoordinator 的已登录
base route 恢复），⛔ 不得在 `pages.ts` 内持有 session、reconciler 或页面数组，也不增加 `openSnakeRoom`、
`openFishingRoom` 等玩法名函数。这三个函数属于一次性框架能力，与 wsrpc §10「新增 feature 不得再往 `pages.ts`
加 `openXxx`」并不冲突——真正的约束是**状态所有权**，不是函数名。

### 9.4 宿主前后台与本地时钟

实时玩法在切后台 / 回前台时的行为，本文与 wsrpc 此前都未认领（wsrpc §3.3 明确不覆盖实时 Room），是一个空洞。
固定如下：

1. `hide` 时**暂停本地 tick 与预测 / 插值**，⛔ 不关闭 room、⛔ 不把已发出的输入判失败；
2. `hide` 期间禁止产生新的输入意图，输入 `seq` ⛔ 不因暂停而跳变；
3. `show` 时先判连接状态——仍 ready 则**请求一次权威快照后再恢复输入**；处于 drop 宽限则等 reconnect；
   已 final-loss 则走既有恢复路径；
4. §15.4 的「重连后的完整快照到达前不能恢复输入」**同样适用于 `show` 路径**；
5. 若 wsrpc 的 `LifecycleBus` / `CocosLifecycleBridge` 已落地，本文直接复用同一 bridge，
   ⛔ 不另起第二套 `EVENT_HIDE` / `EVENT_SHOW` 监听；未落地时本文自建，并在 wsrpc 阶段 3 合并。

## 10. Snake 的权威模拟与竖版实现

### 10.1 迁移原则

旧目录只作为行为参考和素材来源清单：

- 重新提炼规则、常量、碰撞和表现，不 import 旧构建产物；
- 不迁移微信 adapter、远程 bundle loader、旧账号/匹配/网络代码和旧 Cocos runtime；
- 资源只有在权利明确时才复用，并重新导入 Cocos/FairyGUI 生成本项目自己的 `.meta`；
- 先冻结首期规则：地图边界、自撞/蛇撞蛇、死亡、复活、时限、胜负、加速消耗和食物生成；未冻结部分不能
  伪装成已确认需求。

### 10.2 推荐同步模型

首期建议采用服务端权威、客户端轻预测：

- 服务端以 20Hz fixed-step 推进世界（**沿用现有 shared `TICK_RATE = 20` / `TICK_MS = 50`，不新增数值，也不为
  Snake 改 fixed-step 归一化**）；所有方向、加速、碰撞、食物、成长、死亡和胜负以服务端为准；
- 客户端发送归一化方向、加速状态和单调 `seq`，非 Playing、错误 mode、倒退 seq、NaN/Infinity 或超频输入
  一律 fail-closed；
- 服务端以有界频率（例如 10Hz，最终以带宽测试确定）广播 `tick/ackSeq`、蛇身折线、食物和事件快照。
  Snake root 若按 §6.3 只保留低频摘要字段，还应**显式决定该房的 `patchRate`**（现仓默认 50ms / 20Hz），
  避免 Schema patch 与 10Hz S2C 快照对同一批数据重复计费；
- 客户端只预测自己的蛇头，远端蛇插值显示，收到 `ackSeq` 后校正；Room `send()` 成功只代表通过本地发送闸，
  不代表服务端已收到；
- 对食物数、每蛇身体点数、单快照字节数、输入速率、快照频率和对局时长设置硬上限；
- 重连后先取得一份完整权威 state/snapshot，再重新开放输入，不依赖 SDK 离线队列补发旧方向。

这些数值是技术建议，不替代玩法调参。fixed-step 与快照频率应分别做确定性和带宽基线。

### 10.3 竖版布局

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

## 11. 一次性侵入性修改位置

以下是为了建立扩展边界而必须评审的一次性手写真源改动。行号会随实现变化，以职责和符号为准。

### 11.1 Shared 与生成器

| 文件/目录 | 修改原因 | 目标修改 |
| --- | --- | --- |
| `apps/shared/src/protocol/rooms.ts` | 当前只有全局版本与集中 mode/join 形状 | 稳定 join envelope，拆分 framework/mode version，接入生成 mode catalog |
| `apps/shared/src/protocol/messages.ts` | 中央维护所有玩法消息和 validator | 只保留 core/builder façade，玩法 wire 由 generated registry 聚合 |
| `apps/shared/src/constants/errors.ts`、`protocol/lobbyRpc/envelope.ts` | Game/Lobby 错误仍由中央集合验证 | 通用房间错误一次性归 core；玩法/RPC 领域错误改为 generated contribution，保持三种错误域分离 |
| `apps/shared/src/constants/game.ts` | `MAX_PLAYERS` 已**不是**运行时权威容量（权威是 `GameMode.roster.max`）。它现在承担三件事：(a) 生成 state validator 的 players map 上界（manifest 的 `maxSizeConstant`）、(b) onCreate 选定 mode 前的 `maxClients` 兜底、(c) `assertGameModeRoster` 对 `roster.max` 的天花板 | 三种职责分别下沉：(a) 归 per-mode state descriptor、(b) 保留为 shell 兜底默认值、(c) 随 roster 断言迁到 codegen/启动期 |
| `apps/shared/schema/game-room-state.json` | 单文件是所有 mode 的中央冲突点 | 迁移到 `schema/gameplays/<id>/state.json`；旧文件最终删除或仅作迁移入口 |
| `apps/server/tools/room-state-codegen.ts` | 只生成一组集中 state | 收敛为服务端 Schema renderer/迁移适配；跨 shared/server/client 的总生成器放根 `tools/gameplay-codegen/` |
| `apps/shared/src/protocol/http.ts`、`apps/server/src/http/misc/version.ts`、`healthz.ts` | `/version` 和健康检查仍引用单一全局协议版本（客户端**没有**启动探测在读它） | 同时报告 Lobby 与 GameRoom 两类身份；per-mode 兼容在 gameplay catalog/join 中校验 |
| `scripts/protocol-fingerprint.mjs`、`apps/client/test/protocolFingerprint.test.ts` | 指纹脚本从 `rooms.ts` 读取唯一版本并覆盖整个 protocol；当前**无 argv 解析**，运行即重钉 | 口径以 `Non-intrusive-wsrpc.md` §8.4 为准（互斥 `--check/--write`、**保留单一全局字节锁**），⛔ 两文档不得对同一脚本给出不同拆法；per-mode digest 归 `codegen:gameplays`；补 Lobby/Game join 和版本矩阵测试 |
| 根 `package.json`、验证脚本与 inventory | 尚无 `codegen:gameplays` 和 freshness 守门 | 增加生成、`--check`、digest/version、三端集合与删除保护 |
| `apps/shared/src/protocol/lobbyRpc/**` | 新增 `room.prepareCreate/resolve` 在当前架构仍会触碰中央 RPC 全集 | 若先实施 `Non-intrusive-wsrpc.md`，通过 domain 文件 + codegen 接入；否则本次显式增加两条 core route 契约 |
| 根 `README.md`、`AGENTS.md` / `CLAUDE.md`（两者在仓库根字节等同）、`docs/OVERVIEW.md`、`SERVER.md`、`CLIENT.md` 与相关 README | 当前铁律精确写死单一 state manifest/生成路径和旧扩展动线 | 框架落地时同步更新真源、生成物、禁手改范围和新玩法动线；完成证据最后回写**当前计划文件**（以 `docs/inventory.json` 的 `routeOfTruth.corePlan` 为准），⛔ 不向已降级的历史归档回写 |

### 11.2 服务端

| 文件/目录 | 修改原因 | 目标修改 |
| --- | --- | --- |
| `apps/server/src/rooms/GameRoom.ts` | 混有 ballMove、逐条消息登记、两人自动开始和集中 evidence | 只保留安全不变量、catch-all dispatch、policy、start transaction 和受限 mode lifecycle |
| `apps/server/src/rooms/GameMode.ts` | `usesDefaultBallMoveRules` 让公共接口以 ballMove 为默认 | 改为 typed `GamePlugin + RoomProfile + policy + capability` 契约；未登记 fail-fast |
| `apps/server/src/rooms/ballMoveRules.ts` | 当前由 GameRoom 直接消费 | 移入 `rooms/modes/ballMove/**`，成为 ballMove 私有实现 |
| `apps/server/src/rooms/modes/catalog.ts` | 手工只登记 idle；ballMove 由 `GameMode.ts` 的**模块顶层副作用** `gameModeRegistry.register(...)` 隐式成为默认——正是 §5.2 明令禁止的自注册形态 | 改为 generated catalog 的稳定 façade，显式登记全部 mode |
| `apps/server/src/app.config.ts` | 进程根手工调用 mode catalog，普通撮合只按 `sId/mode` 隔离 | 一次性切换 generated bootstrap；仍只注册一个 `RoomName.Game`，多 profile 后按 `sId/mode/profile` 隔离 |
| `apps/server/src/core/infra/keys.ts`、相关 config/Redis script | 没有邀请码租约 key、TTL 和 CAS | 增加按项目/区隔离的 key、配置校验、lease renew/release Lua |
| `apps/server/src/core/errors.ts` | Lobby domain 异常仍映射到中央错误表 | 若 WS-RPC generated error 尚未落地，本次显式增加 prepare/resolve 映射并安排后续迁移 |
| `apps/server/src/websocket/room/prepareCreate.ts`、`resolve.ts`（新增） | 需要可信创建者声明和定向加入入口 | 使用现有 `zoneCtx/currentZoneId()`，实现认证、专用限流桶、creation/join ticket；保持 handler 轻量。⚠ `websocket/room/` 下每个非 `.test.ts` 的 `.ts` 都会被 loader 当作 endpoint，路由名必须等于 `room.<文件名>`，端点全集与 `ALL_LOBBY_RPC_TYPES` 双向相等（启动期 throw）；helper / decoder 必须放 `core/` |
| `apps/server/src/core/match/matchEvidence.ts`、`matchReplay.ts`、`matchConsumer.ts`（可选） | 当前可信证据是 ballMove ruleset | 需要多玩法可信战绩时再改为 ruleset registry；首期 Snake 明确 `evidence: none` 可暂不扩展消费者 |
| 服务端现有 GameRoom/mode/wire/replay 测试 | 测试夹具绑定 ballMove 默认分支和两人自动开局 | 迁移为 core policy 测试、ballMove 私有 harness 和自动遍历的 mode contract 测试 |

两个 room RPC 文件本身是新增式改动，但要让它们成为今后不再侵入中央 RPC 的稳定能力，仍需要上述 shared
RPC/error/codegen 的一次性框架改造，不能把“新增 endpoint 文件”误写成整个邀请码能力都是零侵入。

### 11.3 客户端与 View

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
| `apps/Cocos/assets/scene.scene`（及其 `.meta`） | `Main` 的 `@property`（`serverUrl` / `portalUrl` / `gameplayId`）序列化在**手工场景资产**里 | 属性搬到 bootstrap 组件时必须在 Creator 编辑器中重新序列化并人工审查该 diff；⛔ 该文件**不在**机械 diff 白名单内。若 Main 保留这些 `@property` 并只转发给新 host，则本行不触发。`gameplayId` 在 Home 数据驱动化之后应被删除，删除本身会改变组件序列化形状 |
| 客户端 lifecycle/wire/view/FGUI 测试 | 两类：(a) fixture 穷举现有玩法和页面；(b) 对 `Main.ts` / `pages.ts` 的**源文本正则 pin**（如 `ResolutionPolicy.FIXED_WIDTH`、`controller.tick(dt)`、`this.disposePages?.()`） | (a) 改成自动遍历 registry，并增加旧 generation、迟到 RPC 和不同 join strategy 反例；(b) 源文本 pin 改写为对新 host 的**行为断言**，且必须与掏空 `Main.ts` 的提交**同批**改写，⛔ 不允许删除了事。另：客户端 typecheck 配置测试硬编码了一组必含路径哨兵（`src/Main.ts`、`src/view/pages.ts`、`src/view/LoginView.ts`、`src/view/HomeView.ts`、`src/view/ConfirmView.ts` 等），把这些 core View 搬进 feature/玩法目录时必须同批更新该哨兵列表；**include 本身是递归 `src/**/*.ts`，新增目录会自动覆盖，不必改 tsconfig** |

以下位置不应因“竖版 Snake”而修改：

- `apps/client/src/designSpec.ts` 的 750×1624 基线，除非另有全项目设计变更；
- `apps/client/src/lib/bitecs/` 的 12 个锁定文件；
- `apps/client/src/shared/**` 和 `apps/Cocos/assets/src/**` 生成镜像；
- `apps/shared/src/protocol/state.ts` 与服务端生成 Schema，必须由 codegen 刷新，禁止手改。

### 11.4 一次性新增的框架文件

这些文件虽然是新增文件，仍属于本轮**框架改造**，不是 Snake 业务文件：

```text
apps/shared/src/gameplays/defineGameplayWire.ts
tools/gameplay-codegen/schema-v1.json
tools/gameplay-codegen/cli.ts
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

`tools/gameplay-codegen/**/*.ts` 必须确实落进某条 typecheck 程序（见 §5.2 末段），⛔ 不允许长期游离在
类型检查之外。

### 11.5 受保护路径与无侵入矩阵

§11.1–§11.3 与 §16 的散文清单**只解释边界**，⛔ **不是第二真源**。保护集合必须是一份**可机检的 canonical
规则文件**（例如 `scripts/protected-paths.json`），并由无侵入矩阵测试与散文清单**双向比对**——两者不一致时
必须红。

provenance：真源 = 该规则文件；writer = 人工评审并在提交中显式声明；checker = 无侵入矩阵测试；
红在 `verify:core` 链里。

与 wsrpc 的关系见 §4.1 表 1 末行：wsrpc §10 末段有同类要求。**若任一方先落地，另一方往同一份规则文件追加
条目，⛔ 不产生第二份**；两者独立推进时各自持有一份，并在合并时归一。

先例：仓内 `verify-inventory` 已经在做「解析 Markdown 表 → 与 `package.json` 双向 deepEqual」，本规则的
双向比对可以照此形态实现。

## 12. 框架改造后 Snake 的新增式文件

完成一次性框架改造后，Snake 的手写业务改动应主要是新增以下目录；具体文件可合并，但所有权不能回流到公共壳：

```text
apps/shared/schema/gameplays/snake/
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

## 13. 关键状态机与异常语义

### 13.1 房间状态机

```text
create private room
  → Waiting / owner seated / code active
  → members join by ticket / Ready independently
  → owner presses Start
  → Starting（内部事务态；⛔ 不作为长期 wire phase，但按 §7.3 必须以 `starting: boolean`
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
- 按 §7.3 路线 A，`starting` 置位期间 `Ready` 已被 core handler 拒绝，因此 Start 在途只需对 join / 最终
  leave / drop / dispose 做重验；若改取路线 B，则 Ready 变更同样使在途 Start 失效；
- 可重试 transport close 进入当前 10 秒宽限，seat/owner/Ready 保留，但 connected=false 并增加
  `connectionRevision`；离线成员存在时不能 Start，Start 在途遇到 drop 立即失效；
- reconnect 恢复 connected 并再次增加 revision；主动离开、强踢或宽限失败才是最终 leave；
- renew 失败（§8.2 第 5 条的 `lost`）使当前 `roomCode` **立即失效**；wire 上的 `roomCode` 只是尽力展示值，
  唯一权威绑定由 resolve 侧的 lease generation 校验承担；
- owner 最终 leave 后才转移 owner；如果转移后剩余成员已全部 Ready，新 owner 仍需再次点击 Start；
- Playing 中掉线按 Snake 规则决定蛇暂停、继续或淘汰，这属于 mode，不属于 core；
- Settle 后首期返回 Home；是否 rematch 应另定义新一轮 roster/ready/code 语义，不能复用未清空状态。

### 13.2 稳定错误与恢复

**内部原因枚举**（日志 / 指标 + 客户端文案分类的上游，⛔ 不等于对外错误码）：非法码、码不存在 / 过期 /
处于隔离期、房已满、房已开始、ticket 非法 / 过期、不是房主、有人未 Ready、人数不足、Start 在途 / 失效、
玩法版本不匹配。

**对外稳定错误码**按 §8.3 的两类口径收敛（折叠类 / 保留类），并且必须**双端单源定义**。日志和指标保留不含
token / ticket 的内部原因。

**第三类：暂时不可用 / 结果未知。** 协调 Redis 或撮合层不可达时，`resolve`、`prepareCreate` 与 Start 必须
返回**可重试**的 `SERVICE_UNAVAILABLE` / `RESULT_UNKNOWN`，⛔ **绝不允许降级为「码不存在」「房已开始」这类
确定性结论**——那会把一次基础设施抖动变成用户可见的错误事实。客户端对该类错误只做退避重试、不做导航；
口径与 [Non-intrusive-wsrpc.md](Non-intrusive-wsrpc.md) §6.3 / §7.3 的 ResultUnknown 保持一致。

房间类预期失败不能清除有效登录态。只有明确的会话失效错误才回登录；邀请码、满员、Ready 和 Start 错误都回到
Snake Lobby/Waiting 页面并允许重试。

## 14. 分阶段实施计划

### 14.0 阶段总表：风险、外部依赖与可回退性

| 阶段 | 风险等级与理由 | 外部依赖 | 可回退性 |
| --- | --- | --- | --- |
| 0 冻结规则与基线 | 低——只产出文档与基线记录 | 旧构建档案（仓外）、素材授权确认 | 可回退 |
| 1 拆出 ballMove | 中——纯重构但触及结算与 evidence，行为等价性靠回归与变异测试证明 | 无 | 可回退（revert 单提交） |
| 2 wire token、分片 state、静态 catalog | **高，且是单向门** | 无 | **单向门**：state codegen 的 writer 切换必须在**同一个提交内**完成，⛔ 不允许 `codegen:state` 与 `codegen:gameplays` 同时能写服务端 Schema。中止需回滚整批生成物与 manifest |
| 3 private-room 与 owner-ready policy | 高——新增 Redis 租约、ticket 状态机与开局事务 | 本地 Redis（`test:int` 与故障矩阵） | 需数据清理：回退前释放全部在途 lease 与 ticket key |
| 4 客户端 module / View contribution / 恢复路径 | 高——与 wsrpc 阶段 3–4 有顺序依赖（§4.1 表 2） | 无（Node 侧） | 可回退，但若 wsrpc 已接管 View 生成器则需协调 |
| 5 Snake 服务端与竖版客户端 | 高——**唯一依赖真机与真实多客户端联调的阶段** | FairyGUI 编辑器真实导出、Cocos Creator 预览、真机、2–4 个真实客户端、外部 WebPlatform（完整登录链） | 可回退 |
| 6 切换默认 Demo 与清理决策 | 中——改变默认可见入口，属 §12.3 的显式评审项 | 无 | 可回退 |

### 阶段 0：冻结规则与基线

- 从旧构建档案提炼首期 Snake 规则、资源授权清单和竖版线框；
- 确认 `minPlayers`（建议 2；允许单人则为 1）、死亡/复活、时限和胜负；
- 记录现有 ballMove/idle wire、state、lifecycle 和测试基线。

退出条件：产品规则没有会改变 state/wire 主形状的未决项；基线测试可重复通过。§8.2 的三个时间参数与
§8.3 的限流数值同期冻结（不等式约束本身见 §8.2 第 6 条，⛔ 不由本阶段决定）。

回滚策略：可回退——本阶段无代码产物。

### 阶段 1：行为等价拆出 ballMove

- 将 ballMove 全部规则、模拟、settlement 和 evidence producer 下沉到其 mode；
- 删除 `usesDefaultBallMoveRules` 和隐式 fallback；
- 保持现有外部 wire 与 ballMove/idle 行为不变。

退出条件（可数）：全仓 `usesDefaultBallMoveRules` 出现次数为 **0**；`GameRoom.ts` 不再 import
`BALL_MOVE_GAME_MODE_ID`、不再读取 ballMove 专属字段；ballMove/idle 回归与变异测试通过。

回滚策略：可回退（revert 单提交），无持久化数据变更。

### 阶段 2：wire token、分片 state 与静态 catalog

- 引入玩法 wire builder、catch-all dispatcher、typed send/broadcast；
- 拆分 state descriptor，生成三端 catalog 和 per-mode artifact；
- 增加 `codegen:gameplays --check`、digest/version 和集合一致性门禁。
- 同步更新根 `README.md`、`AGENTS.md` 与 `CLAUDE.md`（后两者在仓库根字节等同）、OVERVIEW/SERVER/CLIENT、
  就近 README 和 inventory；完成后再向**当前计划文件**回写证据，⛔ 不向已降级的历史归档回写。实施时以
  `docs/inventory.json` 的 `routeOfTruth.corePlan` 为准，而不是本文写死的文件名。

退出条件：新增一个只有新文件的 fixture mode/message/state 后，通用房间能收发且无需改中央清单。

回滚策略：**单向门**。state codegen 的 writer 切换必须在同一个提交内完成——⛔ 不允许 `codegen:state` 与
`codegen:gameplays` 同时能写服务端 Schema。中止时必须整批回滚 manifest、生成物与三端镜像；⛔ 不允许留下
「两套生成器都能写同一个文件」的中间态。

### 阶段 3：通用 private-room 与 owner-ready policy

- 实现邀请码 lease、`prepareCreate/resolve`、creation/join ticket、create/joinById；
- 实现 owner/Ready/Start、revision-fenced start 和房主最终离开转移；
- **落实 §6.1 的稳定 join envelope**：`profile` 变必填并 bump framework version（`GAME_ROOM_PROTOCOL_VERSION`）。
  必填切换必须与客户端在**同一个提交**内完成，或先发一版只读容忍缺省的过渡版本；⛔ 不做「缺省时随便匹配」；
- 保留 public matchmaking/auto-start policy 供现有 mode 兼容迁移。

退出条件：1～4 人容量矩阵、选定的最小开局人数、并发 Start、lease/ticket 和重连故障用例通过；
join envelope 的版本矩阵（旧客户端被明确拒绝）通过。

回滚策略：需数据清理——回退前必须释放全部在途邀请码 lease 与 ticket key（它们带 TTL，但回退窗口内会让
旧码指向已不存在的房间）。framework version bump 一旦发布即为**单向门**，回退需要再 bump 一次。

### 阶段 4：客户端 module、View contribution 与恢复路径

- `GameplayModule`、通用 launch strategy、generation-fenced host；
- generated 静态 View catalog、Home contribution、通用 lobby/exit/restore；
- 迁移 ballMove/idle 到新接口，不改变现有行为。

退出条件：增加 fixture module/view 不修改 Main/RoomClient/pages/Home；旧 generation 和迟到异步不能污染新房间。

回滚策略：可回退。⚠ **迁移债**：本阶段临时加在 `pages.ts` 的
`openGameplayLobby` / `submitGameplayLaunch` / `restoreAuthenticatedHome` 三个函数，必须在 wsrpc 阶段 3 迁入
`NavigationService` / `LaunchPort` 之后从 `pages.ts` 删除或降为纯转发（见 §4.1 表 3）。若 wsrpc 阶段 3–4 先
落地，本阶段直接消费其 host，⛔ 不建第二套。

### 阶段 5：Snake 服务端与竖版客户端

- 新增 Snake contract、simulation、snapshot、adapter、prediction/interpolation、View 和资源；
- 完成 2/3/4 人真实客户端联调；若 `minPlayers=1`，另补单人流程；
- 做快照带宽、固定步确定性、长局内存和目标设备性能测试。

退出条件：完整创建、输码、Ready、房主 Start、游玩、掉线重连、结算和退出链路通过。

回滚策略：可回退。本阶段是唯一依赖真机与真实多客户端联调的阶段，人工验收证据不可由 Node 无头测试冒充。

### 阶段 6：切换默认 Demo 与清理决策

- 默认 Home contribution 指向 Snake 私房 Demo（该归属已于 2026-08-31 拍板，见 §4.1 表 2 下的登记）；
- ballMove 仍作为**已登记 GameMode** 保留（供回归与 fixture 遍历），但**不贡献 Home menu contribution**；
  “隐藏回归 mode”指的正是这个状态，⛔ 不是菜单里的隐藏条目。只有确需「已登记但不可见的菜单条目」时，才在
  wsrpc §7.4 的字段清单里补显式 `visibility` 字段——那不改变 §12.3「改变默认启用 feature 仍需显式评审」；
- Snake 稳定后另立清理任务，评估 ballMove evidence/replay、性能基线、文档和测试是否删除或归档。

退出条件：默认入口无 ballMove 特判；删除/保留 ballMove 都不会改变通用框架接口。

回滚策略：可回退（改回默认 contribution 即可）。

## 15. 验收清单

> **口径**：机检项必须给出「判定方式」（具体命令或用例文件）与「变异验证」（改哪一行 / 删哪个断言 →
> 哪条用例转红）。⛔ **机检项给不出变异验证的不得作为验收项**——要么补上，要么移入人工验收证据。
> 这与仓内当前计划文件「每条实现都要给变异验证」的惯例一致。
> 人工项的判定方式统一写「人工证据」，并必须留存：截图 / 录屏、设备型号与系统版本、Creator 版本、日期、
> 操作者、对应 commit。Creator / 真机预览**必须单列，⛔ 不能由 Node 无头测试冒充**。

### 15.1 契约与生成

| 验收项 | 判定方式 | 变异验证 |
| --- | --- | --- |
| 六位码 validator 接受 `000001`，拒绝 number、5/7 位、空白、符号和未知字段 | shared 契约用例 | 把 validator 改成接受 `number` → 转红 |
| Ready/Start/SnakeInput/Snapshot payload 均 exact、finite、有范围和尺寸上限 | shared 契约用例 | 去掉任一 exact-keys 断言 → 转红 |
| framework version 与 per-mode version 分工明确；digest 变化未 bump `modeVersion` 必须失败 | `codegen:gameplays --check` | 改一字节 wire 而**不动** `modeVersion` → `--check` 转红 |
| Game join 只比较**一个**整数，且该整数与 wsrpc §8.4 的命名一致；`modeVersion` 只影响单玩法拒绝，不影响 core 信封 | 版本矩阵用例 | 让 `modeVersion` 参与 join 拒绝 → 矩阵转红 |
| `/version`、`/healthz`、framework fingerprint 与 per-mode digest 的范围一致 | 协议指纹用例 + HTTP 契约用例 | 让指纹覆盖面漏掉 protocol 下任一文件 → 转红 |
| per-mode state、server Schema 和三端 catalog 由同一 manifest 集合生成且新鲜 | `codegen:gameplays --check` | 手改任一生成物 → `--check` 转红 |
| manifest `maxPlayers` 派生 per-mode state 上限、root map 上界、admission cap 与 `maxClients`，**四处不允许独立配置** | 启动期断言 + 服务端用例 | 手改其中任一处使之与 manifest 不等 → 启动期断言转红 |
| 未知/畸形 C2S 在昂贵 validator 前已计基础预算，合法大 payload 再计附加成本 | 服务端 dispatcher 用例 | 把基础预算挪到 validator 之后 → 转红 |
| 房间只注册 catch-all，⛔ 无任何残留具名 `onMessage` | 服务端用例 | 加一条具名 `onMessage` → 转红 |
| 新增 fixture gameplay 只增加新文件 + generated diff，不修改手写中央清单 | §15.6 的无侵入矩阵 | 让 fixture 必须手改一处中央清单 → 矩阵转红 |
| shared/client/Cocos 镜像一致，生成区没有手改 | `npm run verify:sync` | 手改镜像任一字节 → 转红 |

### 15.2 邀请码与准入

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

### 15.3 房主、Ready 与 Start

| 验收项 | 判定方式 | 变异验证 |
| --- | --- | --- |
| 新玩家默认未 Ready；Ready 只在 Waiting 修改，房主也必须 Ready | 服务端用例 | 让房主免 Ready → 转红 |
| 2、3、4 人全部 Ready 均能由房主开局；低于该 mode 的 `roster.min` 被拒 | 服务端容量矩阵 | 把下界检查去掉 → 转红 |
| 非房主 Start、有人未 Ready、重复 Start 和第五人入座都有稳定拒绝 | 服务端用例 | 去掉 owner 校验 → 转红 |
| Start await 期间 join / final-leave / drop / reconnect / owner-change / dispose 会使本次启动失效 | 服务端用例（在每个 await 边界注入事件） | 只比较 fence 元组中的一项 → 转红 |
| `starting` 对客户端可见；置位期间 Ready 被稳定错误拒绝（路线 A）或 Start 被判失效（路线 B） | 服务端用例 + state 断言 | 不把 `starting` 写进 state → 转红 |
| 离线但仍在重连宽限的成员保留 seat/Ready，却会阻止 Start，直至 reconnect 或最终 leave | 服务端用例 | 让离线成员不阻止 Start → 转红 |
| `owner-ready` 下 Start 失败后**房主仍在座且仍是 owner**；rollback 保留 Ready | 服务端用例 | 让 rollback 清空 Ready 或转移 owner → 转红 |
| lock 失败能回滚；rollback/unlock 失败时 fail-closed，不公开错误 Playing roster | 服务端用例 | 让 rollback 失败后仍发布 Playing → 转红 |
| lock 超时后晚到成功会释放 stale lock；晚到结果**永不到达**时 fence 在绝对上限后触发 fail-closed dispose | 服务端用例（永不 settle 的 lock 桩） | 去掉 retry fence 的绝对上限 → 用例挂住 / 转红 |
| 可重连宽限内 owner/Ready/seat 保留，最终离开才转移或删除 | 服务端用例 | 让宽限内即转移 owner → 转红 |
| Playing 后邀请码失效、房间锁定、不能中途加入 | 服务端用例 | 去掉 Playing 后的码失效 → 转红 |

### 15.4 Snake 服务端与客户端

| 验收项 | 判定方式 | 变异验证 |
| --- | --- | --- |
| 固定 seed + 固定 input tape 产生稳定 world checksum | 服务端确定性用例 | 引入一处 `Math.random()` → 转红 |
| 输入归一化、转向约束、加速、成长、墙体/身体/食物碰撞均有边界测试 | 服务端用例 | 去掉反向转向约束 → 转红 |
| 非 Playing、错误 mode、超频、倒退 seq、NaN/Infinity 输入 fail-closed | 服务端用例 | 去掉 seq 单调检查 → 转红 |
| 食物数、每蛇身体点、输入队列、快照字节、广播频率和对局时长均有硬上限 | 服务端用例 | 去掉任一上限 → 转红 |
| `tick/ackSeq` 单调；重连后的完整快照到达前不能恢复输入 | 客户端 + 服务端用例 | 让重连后立刻放开输入 → 转红 |
| `hide → show` 往返后 `seq` 单调、无重复输入、无旧快照回写（§9.4） | 客户端用例 | 让 `hide` 期间继续产生输入意图 → 转红 |
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

### 15.5 回归命令

命令分两段，⛔ **不得混为一谈**：A 段是会写盘的显式接受动作，不构成回归证据；B 段才是 CI 判绿的只读闸。

**A 段 · 显式接受动作（人工执行，产生 lock diff）**

```bash
npm run codegen:gameplays -- --write       # 拟新增；落地前不存在
node scripts/protocol-fingerprint.mjs      # ⚠ 见下方说明：这是 writer，不是检查
node scripts/fgui-manifest.mjs --write     # FGUI 资源审计锁
```

> ⚠ `scripts/protocol-fingerprint.mjs` **当前没有 argv 解析**，运行即重钉 `scripts/protocol.fingerprint`。
> 它**仅在 `apps/shared/src/protocol/**` 真源确有改动时**才该执行。协议指纹的**检查**由 `test:client` 里的
> 指纹用例承担。未来若按 [Non-intrusive-wsrpc.md](Non-intrusive-wsrpc.md) §8.4 落地互斥的 `--check/--write`，
> 本行才改为 `--check`；⛔ **现在写 `--check` 会被忽略、脚本照样重钉**。

**B 段 · 只读回归（CI 判绿）**

```bash
npm run sync:shared                        # 已包含 client→Cocos 同步，⛔ 不再单列 sync:client
# ← 此处打开一次 Cocos Creator，为 sync 新产生的 apps/Cocos/assets/src/** 文件与新目录生成 .meta
npm run codegen:gameplays -- --check       # 拟新增
npm run verify:sync
npm run verify:all                         # 已覆盖 verify:core / typecheck / test:client / test:fgui / verify:project
npm --workspace @game/server run test:int  # 需先 npm --workspace @game/server run stack
```

> `sync-client --check` 的 `.meta` 断言只遍历 `git ls-files`，本地未 `add` 时不会红，**提交或 CI 上必红**——
> 所以那一步 Creator 不能省。
> `verify:all` 已覆盖上述子链，单列它们只为定位失败，⛔ 不必在回归记录里逐条重复。
> `codegen:gameplays --check` 最终应进 `verify:core`，⛔ 不长期单列（命令形态见 §5.2）。
> 若 gameplay 的 View/menu contribution 是最终 View 生成器的输入，则 `codegen:gameplays` 必须在 feature
> codegen **之前**运行（§4.1 表 1「生成器执行顺序」）。

涉及邀请码 Redis lease 时还要启动本地 stack 并运行相应 `test:int` 和故障矩阵。完整登录链依赖匹配的外部
WebPlatform；Creator/真机预览必须单列，不能由 Node 无头测试冒充。

### 15.6 fixture gameplay 无侵入矩阵

端到端步骤**完全引用** [Non-intrusive-wsrpc.md](Non-intrusive-wsrpc.md) §12.2 的无侵入扩展矩阵（临时 checkout
记录保护文件 hash → 加入并 stage/intent-to-add 最小 fixture → 先证明全部 `--check` 因 stale/missing 与 lock
失败 → 运行 writer、显式 lock accept 与 sync → 证明全部 check 通过 → 分类器断言人工文件只出现 fixture 自有
`A`、既有 `M` 只命中 provenance 白名单且无 `D/R` 或既有 `.meta` uuid 变化 → 第二次 writer/sync 后字节不再变化），
⛔ 不在本文重写。

本节只列 gameplay 增量断言：

- [ ] fixture mode 的 per-mode state、服务端 Schema、三端 catalog 各**恰好出现一次**且互相引用闭合；
- [ ] contract digest 改动而未 bump `modeVersion` 时 `--check` 必红（**先证红，再修复**）；
- [ ] fixture mode **不出现**在默认 Home contribution 与默认撮合池；
- [ ] 删除 fixture 走显式删除模式，generated catalog/state/Schema/镜像**无残留**；
- [ ] 矩阵跑在临时根，复用既有 `--root` fixture seam（先例：仓内 state codegen 测试的 mkdtemp 临时根与
      「`--check` 未改盘」的字节断言）。

⚠ 镜像 TS 的 `.meta` **无法由 Node fixture 合成**（矩阵会显式 stage/intent-to-add，正好把文件变成已跟踪）。
矩阵要么另造合成 `.meta` 并说明 uuid 来源，要么**显式声明本矩阵跳过 `sync-client --check` 的 `.meta` 段**、
由单独的 Creator 人工验收项覆盖。

## 16. 最终效果

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

两条边界要一起记住：**本清单约束的是「新增普通玩法」的动线**，本文 §14 的框架阶段本身属于**显式框架侵入**，
不适用本清单；而「Home 可见入口」的登记按 §3.1 第 8 条是唯一例外。保护集合的机检真源见 §11.5，
⛔ 本节散文不是第二真源。

## 17. 实施前仍需确认的产品项

以下决定不阻塞框架接口设计，但必须在 Snake state/wire 定稿前冻结：

1. Snake 是否允许房主 1 人开局；本文建议默认 `roster.min = 2`，框架已支持改为 1（`GameMode.roster` 已落地）。
2. 地图边界、自撞、蛇撞蛇、死亡后复活/观战、时限和胜负规则。
3. Waiting absolute deadline、短 lease TTL、`renewIntervalMs`、`codeCooldownMs`、`maxConcurrentRoomsPerUid`、
   creation/join ticket TTL 与 resolve 专用桶的具体**数值**，以及房主离开后是否继续保留原码。
   ⚠ 只冻结数值——它们之间的**不等式约束**由 §8.2 第 6 条规定并在启动期断言，⛔ 不是产品可选项。
4. §7.3 的 Starting 可见性取路线 A（Ready 被拒）还是路线 B（Unready 使 Start 失效）；§8.2 第 7 条的码回收取
   tombstone 冷却还是「持有到 dispose」。两者都必须在阶段 0 定死，⛔ 不能留到实现时随手选。
5. 首期是否需要可信战绩/evidence；若不需要，应显式声明 `evidence: none`。
6. 旧构建档案中哪些代码、音频、图片和动画已获授权复用；未确认资源不得进入本仓
   （台账见 [snakeoff/08](snakeoff/08-source-and-asset-provenance.md)）。
