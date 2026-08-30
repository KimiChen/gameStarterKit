# 邀请码房间与竖版贪吃蛇的低侵入式接入方案

> 状态：**设计提案，尚未实施**。
>
> 本文说明为了把 `/Users/kimi/work/tanchishe/wegameVersion` 中的贪吃蛇玩法改造成竖版、最多四人的
> 邀请码房间 Demo，并让后续实时玩法尽量以“只新增玩法文件”的方式接入，框架本身需要进行哪些一次性改造。
> 它不表示这些能力已经交付，也不改变 [当前实施状态与验收真相](../plan-v3.md)。当前架构与约束仍以
> [技术总览](OVERVIEW.md)、[服务端开发](SERVER.md) 和 [客户端开发](CLIENT.md) 为准。
>
> [非侵入式 Lobby WS-RPC 方案](Non-intrusive-wsrpc.md) 主要解决已登录 Lobby 页面型 feature，并明确不覆盖
> 实时 Room、GameRoom C2S 和对局生命周期；本文是它在**实时房间玩法**方向的补充。两份方案可以复用生成器
> 基础设施和“人工侵入 / 生成侵入”的口径，但不能把两种运行时模型混成一个巨型插件。

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
- `minPlayers` 必须成为玩法配置，不能继续由 `GameRoom` 硬编码。本文建议 Snake 默认最少 2 人；若产品允许
  房主单人演示，只把 Snake 的 `minPlayers` 改为 1，不修改框架。
- Start 成功后锁房并关闭邀请码，Playing 中不允许中途加入。
- 六位数字码是用户可见的房间定位码，不替代 Colyseus 的内部 `roomId`，也不是身份凭证。
- Snake 成为新的开房间演示入口。迁移期先保留 ballMove 作为隐藏回归 mode，稳定后再单独决定是否删除。
- 当前客户端设计基线已经是 750×1624、`FIXED_WIDTH` 的竖版。要改的是 Snake 的玩法布局、相机和输入，
  不是再次翻转整个项目的设计方向。

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
| `apps/server/src/rooms/GameRoom.ts` | ballMove 的 Move、技能、fixed-step、离场、结算、evidence/replay 仍由公共房间直接处理，本文件 10 处 `usesDefaultBallMoveRules` 特判（全仓含 GameMode/README 共 16 处） | Snake 会继续向公共房间增加条件分支，第三个玩法再重复一次 |
| `apps/server/src/rooms/GameRoom.ts` | 第二名玩家加入时自动开局，开局人数和相位规则由房间壳硬编码 | 无法准确表达“无需等满、全员 Ready、房主手动 Start” |
| `apps/server/src/rooms/GameRoom.ts` | 每个 C2S 都要同时登记 schema、handler 和 `phaseAllows` | 新增 SnakeInput/Ready/Start 时必须多处修改，漏一处可能静默丢弃或拒绝 |
| `apps/server/src/rooms/GameMode.ts` | mode 只有 lifecycle hooks，并以 `usesDefaultBallMoveRules` 决定是否借用 ballMove | 公共接口仍以 ballMove 为默认语义；fallback 虽不绕过正常 onCreate/onAuth 的未知 mode 拒绝，仍污染内部直调、测试和未完整初始化路径 |
| `apps/shared/schema/game-room-state.json` | 所有 mode 共用一个中央 state manifest | 新玩法会重写整份生成状态，冲突面和审查噪声不断扩大 |
| `apps/shared/src/protocol/messages.ts` | C2S/S2C 名称、payload map 和 validator 由中央全集维护 | 每条玩法消息都侵入 shared 公共文件 |
| `apps/client/src/net/RoomClient.ts` | 另有一份本地 S2C payload map；加入流程只落在当前 `joinOrCreate` 形态 | 新消息和 `create` / `joinById` 会继续侵入通用 transport |
| `apps/client/src/gameplay/catalog.ts` | context 显式列出 ballMove/idle joiner 与 adapter | 每增加一个 mode 都要扩充中央 context 和测试替身 |
| `apps/client/src/view/pages.ts`、`viewRegistry.ts`、`fguiContracts.ts` | 页面组合、动态加载、FGUI 契约各有中央登记点 | 新房间页、等待页和结算页需要修改多个旧文件 |
| `apps/client/src/Main.ts`、Home | 默认入口和失败恢复仍由应用根编排 | Snake 名称和页面分支会泄漏到应用框架 |

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

客户端和服务端 catalog 都应是显式、排序稳定的静态 import。客户端具体 Cocos/FairyGUI presentation 仍由
玩法 entry 内部使用字面量动态 import，避免进入普通脚本静态依赖图。不要使用副作用式自注册、`fs` 运行时扫描
或未经当前构建链验证的 `import.meta.glob`。

生成器必须 fail-fast 检查：

- 目录名、manifest id、wire contract id、state root 和模块导出的 id 完全一致；
- mode id、wire type 和生成类型名全局唯一，wire type 满足玩法命名空间规则；
- shared/server/client 三端 module 集合完全相等；
- 输出按 id 排序、重复生成无 diff，`--check` 只检查不修改；
- 每玩法 contract digest 发生变化但 `modeVersion` 未增加时失败；
- manifest 路径不能越界，缺文件、重复 entry 或陈旧生成物直接失败；
- 删除玩法必须走显式删除模式，不能因目录临时缺失静默批量删除生成物。

### 5.3 版本边界

继续保留当前 wire 的 `v` 字段，但把它明确为 framework protocol version；另增加每玩法独立的
`modeVersion`。公共认证、join envelope 或生命周期语义变化才升级 `v`，只改 Snake wire 时只升级 Snake 的
`modeVersion`。这样 Snake 的演进不会无条件使 ballMove/idle 客户端全部失配。

这不是只改 `rooms.ts`：当前 `/version`、Lobby/Game join、客户端启动探测和协议指纹都读取同一个
`PROTOCOL_VERSION`。改造后 `/version.protocol` 继续表示 framework version；per-mode digest 只覆盖该 mode 的
wire/state/modeData 契约，不把服务端实现、UI 或资源变化误判为 wire bump。`protocol-fingerprint.mjs` 需要拆出
framework 指纹与 generated per-mode digest，相关 HTTP contract/handler、启动探测和测试同步迁移。

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

`GameModeContext.send/broadcast` 同样接收 message token 并在发送前验证。客户端删除本地 S2C map，直接消费
shared token 和 generated validator。完成后新增消息不再修改 `C2S/S2C` 中央对象、`GAME_ROOM_C2S_SCHEMAS`、
`GameRoom.messages`、`phaseAllows` 或 `RoomClient`。

### 6.3 分片 state descriptor

把当前单一 `apps/shared/schema/game-room-state.json` 迁移为每玩法 state descriptor，并由生成器提供可组合的
公共 fragment：

- `RoomBase`：`tick / phase / matchId`；
- `PlayerBase`：公共身份字段；
- `OwnerReady`：`ownerId / player.ready / player.connected / rosterRevision / readyRevision / connectionRevision`；
- `InviteRoom`：可展示的 `roomCode` 及等待期信息。

生成器可以最终扁平输出独立 Colyseus Schema，不要求 Schema 继承。`GameRoom` 只能访问公共 fragment 保证存在的
字段；玩法专属字段只能在对应 mode 内访问。容量上限只来自 per-mode manifest，不能让所有 mode 永远
受单一 `MAX_PLAYERS` 语义约束。

Snake 的完整身体点和食物是高频、有界数据，首期不要为了它把当前 state DSL 扩成任意深度数组并依赖每帧
Schema patch。推荐 Schema 只放房间控制、玩家摘要、alive/score/length/head/ackSeq 等低频或小体量状态；完整
蛇身、食物和世界快照走有明确元素数、字节数和频率上限的 S2C snapshot。

### 6.4 错误域不能再次变成中央侵入点

错误至少分成三类，不合并为一个万能 enum：

- Game join refusal：版本、准入、容量、ticket 等建连失败；
- 房内 core control error：Ready/Start/owner/phase 等通用控制错误；
- Lobby RPC error：`prepareCreate/resolve` 的信封与领域错误。

Ready/Start/invite 的通用错误一次性进入 core room error contract。后续玩法自有错误由 gameplay manifest 贡献到
generated error catalog，或用该玩法自己的 S2C token 表达；不得再手改全局玩法错误 switch。Lobby RPC 错误优先
复用 `Non-intrusive-wsrpc.md` 的 generated domain error 方案；若该方案尚未落地，本次必须明确修改现有
`lobbyRpc/envelope.ts` 和服务端 `core/errors.ts`，不能把这部分侵入遗漏在计划之外。

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
  | { readonly kind: "auto"; readonly minPlayers: number }
  | {
      readonly kind: "owner-ready";
      readonly minPlayers: number;
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
    };
```

硬容量不在 `StartPolicy` 重复声明，只从 manifest 的 `maxPlayers` 生成。启动时必须断言 generated state 上限、
admission cap 和 Colyseus `maxClients` 完全相等。`RoomProfile` 允许同一 Snake 规则以后同时组合为私房 Ready 或
公共自动匹配，而不复制 mode；profile 自己也进入 join validation 和普通撮合隔离。

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
- invite-code 房间创建时调用 Colyseus `setPrivate(true, false)`，避免被普通 `joinOrCreate` 撮合选中；private
  只控制 listing 可见性，不替代 access ticket 与 admission；
- Playing 后 lock、关闭邀请码并拒绝中途入座。

高频 command handler、玩法 `onAdmission` 与 `onStep` 必须同步、确定且有预算；异步 ticket/lease 验证属于 core
access transaction，不能泛化成任意 mode 异步 admission。其他异步 I/O 只允许出现在 initialize、start、
settle/dispose 等明确 lifecycle 边界，重计算继续遵守 `SERVER.md` 的 compute task 约束。

### 7.3 开局必须是可回滚事务

“检查一次 allReady 后 await lock”仍有竞态。Start 应采用 generation/revision fencing：

```text
收到 Start
  → 校验 caller/phase/minPlayers/allReady/allConnected
  → 同步标记 starting + admission fence，阻止重复 Start 和新 seat
  → 记录 owner + 精确 session 集合
    + rosterRevision + readyRevision + connectionRevision
  → await bounded room.lock
  → 重验 generation/owner/roster/ready/connected
  → await mode.initialize
  → 再次重验
  → await mode.start
  → 最终重验并发布 Playing
```

任何 await 边界发生 join、最终 leave、Unready、owner change、dispose 或 generation 变化，都必须使本次启动失效并
走统一 rollback。lock 失败应恢复 Waiting；若 unlock/rollback 也失败，则沿用当前 fail-closed 语义关闭房间，
不能公开一个 roster 错误但已 Playing 的对局。lock 成功前不得发生客户端可见的 mode state mutation；需要昂贵
预计算时只能增加无副作用、结果可丢弃的 `prepare`，不能冒充 initialize。

还必须保留当前已有的 late-lock 防护：`lockWithDeadline + lifecycle abort` 超时后继续观察底层 lock 的最终结果；
若它晚到成功，立即释放 stale lock；在晚到结果收敛前以 retry fence 拒绝第二次 Start。普通“catch 后 unlock”
无法处理 Promise 已超时但底层稍后改成 locked 的情况。

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

### 8.2 租约实现

通用 InviteRoom 服务应使用 coordination Redis accessor（开发环境可能与 durable Redis 共用实例，不能使用
可淘汰 cache Redis）：

1. 用 Node `crypto.randomInt(0, 1_000_000)` 生成并 `padStart(6, "0")`；
2. 以 `SET key value NX PX ttl` 有界重试碰撞；
3. value 携带 `roomId/mode/modeVersion/profile/sId/leaseToken/generation`，不存玩家 token；
4. renew/release 使用 Lua/CAS 校验 owner `leaseToken`，旧房不得续租或删除后来重用同一码的新租约；
5. 短 `leaseTtlMs` 负责崩溃回收，`renewIntervalMs` 负责健康房续租，另设不可续的绝对
   `waitingDeadlineMs`；达到 deadline 后关闭并 dispose，不能只释放 code 留下永久不可加入的 Waiting 房；
6. Start 成功和 room dispose 都释放 lease；进程崩溃由短 TTL 回收；
7. Redis 故障 fail-closed，不创建一个没有可解析邀请码的“半成功私房”。

所有 key 必须通过 `apps/server/src/core/infra/keys.ts` 构造，并显式携带区上下文。

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

`prepareCreate` 签发短期、绑定 `uid + sId + mode + modeVersion + profile + purpose=create + jti + exp` 的
creation ticket。GameRoom `onCreate` 必须先验证/原子占有该 claim，由 claim 固定 `expectedOwnerUid`，并在 listing
公开前执行 `setPrivate(true, false)`；创建者 `onJoin` 再把 `client.auth.userId` 与 expected owner 比对。禁止用
“第一个入座者”、客户端自报 `kind=create` 或 `players.size===0` 推断房主。

`resolve` 需要：

- 对认证主体做限流和枚举防护；
- 权威校验 code、区和 lease generation 仍有效；
- phase、starting、reserved seats 和容量只能作为最佳努力 UX 快照，不得宣称 resolve 已预留座位；
- 对不存在、过期、已开局、已满等情况返回稳定但不过度泄漏枚举信息的错误；
- 签发短期、绑定
  `uid + sId + roomId + mode + modeVersion + profile + lease generation + purpose=join + jti + exp` 的 join ticket；
- 由 GameRoom 在 `joinById` 时原子 claim ticket，并最终检查 auth、mode/profile、容量、phase、starting 和 lease。

裸 `roomId` 不是完整授权。resolve 时的“有空位”也不是预留座位，真正入座仍以 GameRoom 的原子 admission 结果
为准。creation/join ticket 都必须使用安全随机 `jti` 和有界状态机，至少保证同一 uid/room 至多一个 pending
admission：`issued → pending(session) → seated` 通过 CAS 推进；安全的入座前失败可在原 expiry 内恢复为
issued，同 ticket 并发或 seated 后重放必须拒绝。重连使用 Colyseus reconnection token，不重复消费 access
ticket。

异步 ticket/lease 检查前，room instance 先同步占用 `pendingSession/pendingUid/pendingSeat`，容量计算包含 pending；
成功转成 active seat，任何失败统一释放。静态 envelope/auth 只校验身份和 ticket 形状，roomId/lease generation
绑定必须由目标 room instance 重验，不能让一个可重放的签名字符串直接等于 admission。

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
interface GameplayModule<TLaunch> {
  readonly id: string;
  validateLaunch(input: unknown): TLaunch;
  readonly joiner: GameplayRoomJoiner<TLaunch>;
  createPlugin(host: GameplayInstanceHost): GameplayPlugin;
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
  requestExit(reason: "user-exit" | "settled" | "rematch"): Promise<void>;
}
```

`dispatchInput` 和 `requestExit` 都要校验 generation。旧 View、迟到 join、迟到 RPC 或上一局的 async callback
无权操作后来创建的 room。正常结算和主动退出都由 Main 的通用恢复路径执行
`controller.stop → restoreAuthenticatedHome`，玩法不能自行重建登录页或房间单例。
引擎 `Node`/mount 由 `gameplay/` 与 `view/` 之间的 presentation adapter 注入，不进入 `logic/` 契约，继续遵守
Logic 禁止依赖 `cc` / FairyGUI 的边界。

### 9.3 Lobby/View contribution

页面登记改成 contribution：

- codegen 生成不可变、静态 import 的 View catalog；`ViewMgr` 从注入的只读 catalog 查询 `ViewMeta`，不再读取
  手写的 `VIEW_REGISTRY` 全集；
- core 登录/Home/Confirm 与各 gameplay 的 Lobby、等待、HUD、结算 View 都贡献 metadata，由生成器聚合；
- FGUI contract 直接放入 `ViewMeta.contract`，测试遍历 generated catalog，不再维护第二份 `FGUI_CONTRACTS` 全集；
- Home 一次性改为渲染 generated lobby contributions，以后新增玩法只增加 contribution；
- 具体 View 保持动态 import，Logic 继续禁止 import `cc` / `fairygui-cc`。

本文不做运行时热卸载，因此不引入复杂的 View unregister/disposer 语义。测试需要替换 catalog 时使用独立注入的
registry，不修改生产 catalog；将来确有热卸载需求时，再单独定义 pending open、permanent cache 和已挂载 View
的事务语义。

框架应一次性提供一个小而明确的 `PrivateRoomLobby` 模板，负责“创建/输码、房间码、成员列表、Ready、房主
Start、错误重试”，数据只来自 `AccessPolicy + StartPolicy` 的公共 state/capability。玩法 contribution 可以直接
声明使用该模板并提供标题、图标和 launch 参数；只有确实需要不同交互时才新增玩法自有 Lobby View。不要把它
扩展成能描述任意 UI 的 DSL。

`pages.ts` 最终只保留通用能力，例如 `openGameplayLobby`、`submitGameplayLaunch` 和
`restoreAuthenticatedHome`，不增加 `openSnakeRoom`、`openFishingRoom` 等玩法名函数。

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

- 服务端以 20Hz fixed-step 推进世界；所有方向、加速、碰撞、食物、成长、死亡和胜负以服务端为准；
- 客户端发送归一化方向、加速状态和单调 `seq`，非 Playing、错误 mode、倒退 seq、NaN/Infinity 或超频输入
  一律 fail-closed；
- 服务端以有界频率（例如 10Hz，最终以带宽测试确定）广播 `tick/ackSeq`、蛇身折线、食物和事件快照；
- 客户端只预测自己的蛇头，远端蛇插值显示，收到 `ackSeq` 后校正；Room `send()` 成功只代表通过本地发送闸，
  不代表服务端已收到；
- 对食物数、每蛇身体点数、单快照字节数、输入速率、快照频率和对局时长设置硬上限；
- 重连后先取得一份完整权威 state/snapshot，再重新开放输入，不依赖 SDK 离线队列补发旧方向。

这些数值是技术建议，不替代玩法调参。fixed-step 与快照频率应分别做确定性和带宽基线。

### 10.3 竖版布局

保持全局 `designSpec.ts` 的 750×1624 / `FIXED_WIDTH`：

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
| `apps/shared/src/constants/game.ts` | `MAX_PLAYERS` 目前被当作所有 mode 的统一容量 | 保留兼容常量或下沉为默认值，权威容量改由 per-mode manifest 生成 |
| `apps/shared/schema/game-room-state.json` | 单文件是所有 mode 的中央冲突点 | 迁移到 `schema/gameplays/<id>/state.json`；旧文件最终删除或仅作迁移入口 |
| `apps/server/tools/room-state-codegen.ts` | 只生成一组集中 state | 收敛为服务端 Schema renderer/迁移适配；跨 shared/server/client 的总生成器放根 `tools/gameplay-codegen/` |
| `apps/shared/src/protocol/http.ts`、`apps/server/src/http/misc/version.ts`、`healthz.ts` 与客户端启动探测 | `/version` 和健康检查仍引用单一全局协议版本 | 明确其返回 framework version；per-mode 兼容在 gameplay catalog/join 中校验 |
| `scripts/protocol-fingerprint.mjs`、`apps/client/test/protocolFingerprint.test.ts` | 指纹脚本从 `rooms.ts` 读取唯一版本并覆盖整个 protocol | 拆分 framework 指纹与 per-mode contract digest，补 Lobby/Game join 和版本矩阵测试 |
| 根 `package.json`、验证脚本与 inventory | 尚无 `codegen:gameplays` 和 freshness 守门 | 增加生成、`--check`、digest/version、三端集合与删除保护 |
| `apps/shared/src/protocol/lobbyRpc/**` | 新增 `room.prepareCreate/resolve` 在当前架构仍会触碰中央 RPC 全集 | 若先实施 `Non-intrusive-wsrpc.md`，通过 domain 文件 + codegen 接入；否则本次显式增加两条 core route 契约 |
| 根 `AGENTS.md`、`docs/OVERVIEW.md`、`SERVER.md`、`CLIENT.md` 与相关 README | 当前铁律精确写死单一 state manifest/生成路径和旧扩展动线 | 框架落地时同步更新真源、生成物、禁手改范围和新玩法动线；完成证据最后回写 `plan-v3.md` |

### 11.2 服务端

| 文件/目录 | 修改原因 | 目标修改 |
| --- | --- | --- |
| `apps/server/src/rooms/GameRoom.ts` | 混有 ballMove、逐条消息登记、两人自动开始和集中 evidence | 只保留安全不变量、catch-all dispatch、policy、start transaction 和受限 mode lifecycle |
| `apps/server/src/rooms/GameMode.ts` | `usesDefaultBallMoveRules` 让公共接口以 ballMove 为默认 | 改为 typed `GamePlugin + RoomProfile + policy + capability` 契约；未登记 fail-fast |
| `apps/server/src/rooms/ballMoveRules.ts` | 当前由 GameRoom 直接消费 | 移入 `rooms/modes/ballMove/**`，成为 ballMove 私有实现 |
| `apps/server/src/rooms/modes/catalog.ts` | 手工只登记 idle，ballMove 在别处隐式默认 | 改为 generated catalog 的稳定 façade，显式登记全部 mode |
| `apps/server/src/app.config.ts` | 进程根手工调用 mode catalog，普通撮合只按 `sId/mode` 隔离 | 一次性切换 generated bootstrap；仍只注册一个 `RoomName.Game`，多 profile 后按 `sId/mode/profile` 隔离 |
| `apps/server/src/core/infra/keys.ts`、相关 config/Redis script | 没有邀请码租约 key、TTL 和 CAS | 增加按项目/区隔离的 key、配置校验、lease renew/release Lua |
| `apps/server/src/core/errors.ts` | Lobby domain 异常仍映射到中央错误表 | 若 WS-RPC generated error 尚未落地，本次显式增加 prepare/resolve 映射并安排后续迁移 |
| `apps/server/src/websocket/room/prepareCreate.ts`、`resolve.ts`（新增） | 需要可信创建者声明和定向加入入口 | 使用现有 `zoneCtx/currentZoneId()`，实现认证、限流、creation/join ticket；保持 handler 轻量 |
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
| 客户端 lifecycle/wire/view/FGUI 测试 | fixture 穷举现有玩法和页面 | 改成自动遍历 registry，并增加旧 generation、迟到 RPC 和不同 join strategy 反例 |

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
  → Starting（内部事务态，不必公开为长期 wire phase）
  → freeze roster + initialize + lock + recheck
  → Playing / code inactive
  → Settle
  → exit or dispose
```

异常规则：

- Waiting 新入座者默认未 Ready；其他人的 Ready 可以保留，新成员自然使 `allReady=false`；
- Ready 变更或最终 leave 都增加 roster/ready revision；Start 在途看到 revision 变化即回滚；
- 可重试 transport close 进入当前 10 秒宽限，seat/owner/Ready 保留，但 connected=false 并增加
  `connectionRevision`；离线成员存在时不能 Start，Start 在途遇到 drop 立即失效；
- reconnect 恢复 connected 并再次增加 revision；主动离开、强踢或宽限失败才是最终 leave；
- owner 最终 leave 后才转移 owner；如果转移后剩余成员已全部 Ready，新 owner 仍需再次点击 Start；
- Playing 中掉线按 Snake 规则决定蛇暂停、继续或淘汰，这属于 mode，不属于 core；
- Settle 后首期返回 Home；是否 rematch 应另定义新一轮 roster/ready/code 语义，不能复用未清空状态。

### 13.2 稳定错误与恢复

至少需要区分并双端单源定义：非法码、码不存在/过期、房已满、房已开始、ticket 非法/过期、不是房主、有人未
Ready、人数不足、Start 在途/失效、玩法版本不匹配。对外可以把部分邀请码错误折叠为较少的稳定码以减少枚举
信息，但日志和指标仍应有不含 token/ticket 的内部原因。

房间类预期失败不能清除有效登录态。只有明确的会话失效错误才回登录；邀请码、满员、Ready 和 Start 错误都回到
Snake Lobby/Waiting 页面并允许重试。

## 14. 分阶段实施计划

### 阶段 0：冻结规则与基线

- 从旧构建档案提炼首期 Snake 规则、资源授权清单和竖版线框；
- 确认 `minPlayers`（建议 2；允许单人则为 1）、死亡/复活、时限和胜负；
- 记录现有 ballMove/idle wire、state、lifecycle 和测试基线。

退出条件：产品规则没有会改变 state/wire 主形状的未决项；基线测试可重复通过。

### 阶段 1：行为等价拆出 ballMove

- 将 ballMove 全部规则、模拟、settlement 和 evidence producer 下沉到其 mode；
- 删除 `usesDefaultBallMoveRules` 和隐式 fallback；
- 保持现有外部 wire 与 ballMove/idle 行为不变。

退出条件：`GameRoom.ts` 不再读取 ballMove 专属字段，ballMove/idle 回归与变异测试通过。

### 阶段 2：wire token、分片 state 与静态 catalog

- 引入玩法 wire builder、catch-all dispatcher、typed send/broadcast；
- 拆分 state descriptor，生成三端 catalog 和 per-mode artifact；
- 增加 `codegen:gameplays --check`、digest/version 和集合一致性门禁。
- 同步更新根 `AGENTS.md`、OVERVIEW/SERVER/CLIENT、就近 README 和 inventory；完成后再向 `plan-v3.md` 回写证据。

退出条件：新增一个只有新文件的 fixture mode/message/state 后，通用房间能收发且无需改中央清单。

### 阶段 3：通用 private-room 与 owner-ready policy

- 实现邀请码 lease、`prepareCreate/resolve`、creation/join ticket、create/joinById；
- 实现 owner/Ready/Start、revision-fenced start 和房主最终离开转移；
- 保留 public matchmaking/auto-start policy 供现有 mode 兼容迁移。

退出条件：1～4 人容量矩阵、选定 `minPlayers`、并发 Start、lease/ticket 和重连故障用例通过。

### 阶段 4：客户端 module、View contribution 与恢复路径

- `GameplayModule`、通用 launch strategy、generation-fenced host；
- generated 静态 View catalog、Home contribution、通用 lobby/exit/restore；
- 迁移 ballMove/idle 到新接口，不改变现有行为。

退出条件：增加 fixture module/view 不修改 Main/RoomClient/pages/Home；旧 generation 和迟到异步不能污染新房间。

### 阶段 5：Snake 服务端与竖版客户端

- 新增 Snake contract、simulation、snapshot、adapter、prediction/interpolation、View 和资源；
- 完成 2/3/4 人真实客户端联调；若 `minPlayers=1`，另补单人流程；
- 做快照带宽、固定步确定性、长局内存和目标设备性能测试。

退出条件：完整创建、输码、Ready、房主 Start、游玩、掉线重连、结算和退出链路通过。

### 阶段 6：切换默认 Demo 与清理决策

- 默认 Home contribution 指向 Snake 私房 Demo；
- ballMove 先保留为隐藏回归 mode；
- Snake 稳定后另立清理任务，评估 ballMove evidence/replay、性能基线、文档和测试是否删除或归档。

退出条件：默认入口无 ballMove 特判；删除/保留 ballMove 都不会改变通用框架接口。

## 15. 验收清单

### 15.1 契约与生成

- [ ] 六位码 validator 接受 `000001`，拒绝 number、5/7 位、空白、符号和未知字段。
- [ ] Ready/Start/SnakeInput/Snapshot payload 均 exact、finite、有范围和尺寸上限。
- [ ] framework version 与 per-mode version 分工明确；digest 变化未 bump modeVersion 会失败。
- [ ] `/version`、启动探测、framework fingerprint 与 per-mode digest 的范围一致。
- [ ] per-mode state、server Schema 和三端 catalog 由同一 manifest 集合生成且新鲜。
- [ ] manifest `maxPlayers` 生成 state 上限、admission cap 与 `maxClients`，三者不允许独立配置。
- [ ] 未知/畸形 C2S 在昂贵 validator 前已计基础预算，合法大 payload 再计附加成本。
- [ ] 新增 fixture gameplay 只增加新文件 + generated diff，不修改手写中央清单。
- [ ] shared/client/Cocos 镜像一致，生成区没有手改。

### 15.2 邀请码与准入

- [ ] 同一 `(sId, code)` 并发创建只有一个 lease 成功，不同区复用语义与文档一致。
- [ ] 碰撞重试有上限，Redis 故障 fail-closed；旧 lease 不能 renew/release 新 lease。
- [ ] 短 lease TTL/renew 与绝对 Waiting deadline 分离；deadline、Start 和 dispose 关闭码/房间，崩溃由 TTL 回收。
- [ ] resolve 有认证主体限流和暴力枚举测试，不记录 code/ticket/token 敏感组合。
- [ ] `prepareCreate` 的 creation ticket 绑定权威 owner；“第一个进空房”不能成为房主。
- [ ] creation/join ticket 的 `jti` 并发、重放、失败重试和 expiry 状态机有 CAS 测试。
- [ ] pending uid/session/seat 在异步 ticket 检查前占位，计入容量，失败无泄漏。
- [ ] 无有效 join ticket 的直接 `joinById` 不能借“空房”绕过准入。
- [ ] resolve 的 phase/capacity 只作 UX 快照，最终 admission 权威；重连不重复消费 access ticket。
- [ ] invite-code 房间不会被普通 `joinOrCreate` 选中；切为 private 不会被误当成准入授权。
- [ ] 输错码不会误创建房间或清除登录态。

### 15.3 房主、Ready 与 Start

- [ ] 新玩家默认未 Ready；Ready 只在 Waiting 修改，房主也必须 Ready。
- [ ] 2、3、4 人全部 Ready 均能由房主开局；低于最终选定 `minPlayers` 被拒。
- [ ] 非房主 Start、有人未 Ready、重复 Start 和第五人入座都有稳定拒绝。
- [ ] Start await 期间 join/final-leave/unready/drop/reconnect/owner-change/dispose 会使本次启动失效。
- [ ] 离线但仍在重连宽限的成员保留 seat/Ready，却会阻止 Start，直至 reconnect 或最终 leave。
- [ ] lock 失败能回滚；rollback/unlock 失败时 fail-closed，不公开错误 Playing roster。
- [ ] lock 超时后晚到成功会释放 stale lock；结果收敛前 retry fence 阻止第二次 Start。
- [ ] 可重连宽限内 owner/Ready/seat 保留，最终离开才转移或删除。
- [ ] Playing 后邀请码失效、房间锁定、不能中途加入。

### 15.4 Snake 服务端与客户端

- [ ] 固定 seed + 固定 input tape 产生稳定 world checksum。
- [ ] 输入归一化、转向约束、加速、成长、墙体/身体/食物碰撞均有边界测试。
- [ ] 非 Playing、错误 mode、超频、倒退 seq、NaN/Infinity 输入 fail-closed。
- [ ] 食物数、每蛇身体点、输入队列、快照字节、广播频率和对局时长均有硬上限。
- [ ] `tick/ackSeq` 单调；重连后的完整快照到达前不能恢复输入。
- [ ] create/joinById、profile、roomId 和完整 join options 都进入 ownership key，key/错误不打印 token/ticket。
- [ ] 首个真实 ROOM_STATE 前不能发送 Ready/Start/SnakeInput；drop/reconnect 期间 SDK 离线队列保持 0。
- [ ] 取消、页面关闭、迟到 RPC/join 和旧 generation 都无权覆盖新房间或触发 input/exit。
- [ ] Snake 未声明 evidence 时绝不进入 `ballMove@1` replay/consumer。
- [ ] FGUI 房间/HUD 不与 Cocos 摇杆、加速和世界触摸争抢输入。
- [ ] 750×1624、常见长屏、安全区、前后台切换和意外旋转完成 Creator/真机预览。
- [ ] 2、3、4 个真实客户端走通创建、输码、Ready、房主 Start、游玩、重连、结算和退出。

### 15.5 回归命令

实现后至少执行并记录：

```bash
npm run codegen:gameplays -- --check       # 拟新增；落地前不存在
npm run sync:shared
node scripts/protocol-fingerprint.mjs
npm run sync:client
npm run typecheck
npm --workspace @game/server run test
npm run test:client
npm run test:fgui
npm run verify:sync
npm run verify:project
npm run verify:core
npm run verify:all
```

涉及邀请码 Redis lease 时还要启动本地 stack 并运行相应 `test:int` 和故障矩阵。完整登录链依赖匹配的外部
WebPlatform；Creator/真机预览必须单列，不能由 Node 无头测试冒充。

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

## 17. 实施前仍需确认的产品项

以下决定不阻塞框架接口设计，但必须在 Snake state/wire 定稿前冻结：

1. Snake 是否允许房主 1 人开局；本文建议默认 `minPlayers=2`，框架支持改为 1。
2. 地图边界、自撞、蛇撞蛇、死亡后复活/观战、时限和胜负规则。
3. Waiting absolute deadline、短 lease TTL、creation/join ticket TTL，以及房主离开后是否继续保留原码。
4. 首期是否需要可信战绩/evidence；若不需要，应显式声明 `evidence: none`。
5. 旧构建档案中哪些代码、音频、图片和动画已获授权复用；未确认资源不得进入本仓。
