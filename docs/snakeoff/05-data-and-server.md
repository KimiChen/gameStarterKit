# 05 · 数据、服务端与改动面

> [返回总目录](README.md) · [上一篇：客户端与协议](04-client-and-protocol.md) · [下一篇：测试与实施路线](06-testing-and-roadmap.md)

本章回答两个实现问题：哪些既有真源必须做一次性侵入改造，以及完成这层扩展边界后，Snake 能以哪些新增目录接入。
通用架构以 [Non-intrusive-room.md](../Non-intrusive-room.md) 为准；这里给出 Snake 的落地视图，不另立一套房间模型。

## 1. 权威边界

| 数据 | 权威位置 | 持久性 | 说明 |
| --- | --- | --- | --- |
| uid、token、sId | 现有认证会话 | 既有契约 | Snake 不绕过 WebPlatform HTTP 契约 |
| creation/join ticket claim | 通用 access service / coord Redis | 短期 | 绑定 owner、用途、房间、玩法版本和 lease generation |
| 六位码 → roomId | 通用 InviteCodeLease / coord Redis | 短 lease + 绝对 Waiting deadline | 只负责 Waiting 入房寻址，不是安全凭证 |
| owner、Ready、connected、phase、roster revisions | `GameRoom` core state fragments | 房间生命周期 | 属于 profile policy，不归 Snake 私有逻辑 |
| 蛇身、食物、掉落、碰撞 | 房间进程内 `SnakeWorld` | 单局临时 | 服务端唯一权威，不把完整世界塞进 Schema |
| tick、head、score、length、alive | Snake per-mode state 摘要 | 房间生命周期 | HUD 与轻量状态同步 |
| 完整世界快照 | Snake typed S2C token | 网络临时 | 初始、周期和重连恢复；元素数与字节数有硬上限 |
| 永久战绩、经济、奖励 | 首版无 | 无 | 不调用 ballMove evidence/发奖链 |

## 2. 目标房间模型

### 2.1 只保留一个 GameRoom

不新增 `InviteGameRoom`、`SnakeRoom` 子类或第二个 Colyseus room name。仍只注册 `RoomName.Game`，通过 generated
gameplay manifest 与 profile 组合行为：

```text
mode = snake
modeVersion = <manifest version>
profile = snake.private
maxPlayers = 4

snake.private
├── accessPolicy = invite-code
└── startPolicy = owner-ready
    ├── minPlayers = SNAKE-OPEN-01 最终值（首版建议 2）
    ├── requireAllReady = true
    └── requireConnected = true
```

邀请码房在创建时 `setPrivate(true, false)`，不进入普通 `joinOrCreate` 撮合候选；普通撮合按
`sId/mode/profile` 隔离。private listing 只是可见性控制，不能替代 ticket 和最终 admission。

### 2.2 GameRoom core 与 Snake plugin

| GameRoom core 拥有 | Snake plugin 拥有 |
| --- | --- |
| auth、区服、mode/version/profile 复核 | Snake 玩家玩法摘要与出生参数 |
| creation/join ticket、pending seat、四人准入 | 输入合法化后的玩法意图 |
| owner、Ready、connected、房主转移 | 蛇移动、转向、加速消耗 |
| profile policy 与 revision-fenced Start | 食物、掉落、成长和碰撞 |
| lock/unlock、late-lock、reconnect、dispose | 对局结束、排名与 Snake 结算摘要 |
| typed dispatcher、消息预算、fixed-step 调度 | 有界世界快照和重连后的世界恢复 |

Ready、Start 和邀请码是可复用 core policy，不放进 `SnakeGameMode`。Snake handler map 只处理自己 `wire.ts` 声明的
token。mode context 只暴露受限 `ConnectionRef`、typed `send/broadcast` 和生命周期能力，不把原始 Colyseus
`Client`/`Room` 交给玩法绕过 validator、预算或 generation fence。

### 2.3 SnakeWorld

`SnakeWorld` 是纯 TypeScript、无 Colyseus/Cocos/Redis 依赖的确定性模拟核心：

```text
SnakeWorld
├── config + rulesetVersion
├── tick + seed / RNG streams
├── snakes: Map<playerId, SnakeRuntime>
├── foods / wrecks
├── spatial grid
├── latest inputs / ack seq
└── step() / snapshot() / restore() / rank()
```

它不发送网络消息、不读取系统时间、不查全局 room。测试注入 seed、初始 roster 和逐 tick 输入序列，验证同输入得到
同 checksum。

## 3. 邀请码与准入数据

### 3.1 Redis lease

所有 key 由 `apps/server/src/core/infra/keys.ts` 构造，并携带项目与区上下文；业务代码不得手拼。lease 与 ticket claim
必须走 non-evictable coordination accessor `coordClient()`，不得放入可淘汰 cache Redis；开发环境 URL 相同时由既有
路由层安全复用 durable client。逻辑映射为：

```text
(project, sId, roomCode)
  → roomId + mode + modeVersion + profile + leaseToken + generation
```

value 不保存账号 token 或 access ticket。生命周期为：

| 操作 | Redis 语义 | 失败处理 |
| --- | --- | --- |
| allocate | 安全随机六码；`SET NX PX` 有界重试 | Redis 故障 fail-closed，关闭未发布房间 |
| resolve | `GET` + exact parse | 对外折叠为稳定不可用错误 |
| renew | Lua/CAS 校验 leaseToken 与 generation | 失去所有权后停止发布并关闭房间 |
| release | Lua/CAS 删除精确 lease | 失败告警并等 TTL；禁止裸 `DEL` |
| crash recovery | 短 TTL | 不依赖进程 finally |
| product lifetime | 不可续 `waitingDeadlineMs` | 到期关闭并 dispose，不能只删码留下幽灵 Waiting 房 |

`leaseTtlMs`、`renewIntervalMs` 和 `waitingDeadlineMs` 分开配置并校验上下限；具体数值仍由 SNAKE-OPEN-07 决定。

### 3.2 Creation/join ticket 与 pending seat

- `room.prepareCreate` 签发 creation ticket，绑定认证 uid、sId、mode/version/profile、`purpose=create`、JTI 和 expiry。
- GameRoom `onCreate` 原子占有 claim 并固定 `expectedOwnerUid`；创建者 `onJoin` 再复核认证 uid。
- `room.resolve` 校验 lease 后签发 join ticket，绑定 uid、roomId、mode/version/profile、lease generation、
  `purpose=join`、JTI 和 expiry。
- GameRoom 在 `joinById` 时 claim ticket，并最终复核 phase、starting、容量和 lease；resolve 的空位提示不算预留。
- 异步校验前同步登记 pending uid/session/seat，pending 计入四人上限；成功转 seated，失败释放。
- 同 ticket 并发使用、seated 后重放、跨 uid/房间/profile/purpose 使用都拒绝。重连只使用 Colyseus reconnection token。

ticket 和 token 禁止写 state、日志、指标标签或玩家可见错误。需要关联故障时只记录不可逆的短 JTI 摘要或内部原因码。

## 4. State、快照与重连

### 4.1 分片 state descriptor

Snake state descriptor 组合通用 fragment：

- `RoomBase`：tick、phase、matchId。
- `PlayerBase`：公共身份字段。
- `OwnerReady`：ownerId、player.ready、player.connected、roster/ready/connection revisions。
- `InviteRoom`：可展示的 roomCode 和 Waiting 信息。
- Snake 摘要：alive、score、length、head、direction、boost、ackSeq、winner/endTick。

完整 body、foods、wrecks 走有界 S2C snapshot。不要为蛇身把 Schema DSL 扩成任意深度数组，也不要让每个路径点成为
高频 Schema child。

### 4.2 Ready/Start revision fence

Start 同步冻结 owner、精确 session 集合、rosterRevision、readyRevision、connectionRevision 和 lifecycle generation。
每个 await 边界后都重验；加入、最终离开、Unready、drop、reconnect、owner change、dispose 或 generation 变化都会让旧
Start 失败并回滚。回滚保留当前权威 Ready，不盲目清空。

### 4.3 重连

- Waiting drop 保留 seat、owner 和 Ready，但 `connected=false` 会阻止 Start；重连再次改变 connection revision。
- Playing drop 先关闭 boost，宽限内保留最后合法方向；最终超时按 Snake 规则处理一次。
- 重连后先通过新 ROOM_STATE 和完整 world snapshot，再开放输入；不依赖 SDK 离线队列重放旧输入。
- dispose 先失效 generation、停止 tick/快照/lease renew，再释放世界与租约。

## 5. 当前框架基线

截至本策划编写时，代码事实是：

- `MAX_PLAYERS` 当前值已是 4，但它被当作全局常量；目标权威容量应来自 per-mode manifest。
- `GameRoom.onJoin` 在第二人加入后自动开局，没有 owner、Ready、connected 或房主 Start。
- `GameRoom`/`GameMode` 仍隐含 ballMove 默认规则和集中消息登记；mode 未完全模块化。
- 当前 mode 只有 `ballMove`、`idle`，没有 Snake wire/state/server/client module。
- `RoomClient` 只走现有 `joinOrCreate` 形态，没有通用 `create`/`joinById` strategy。
- state generator 面向单一集中 manifest；当前不适合让新增玩法只提交自己的 descriptor。
- 只有 `ballMove@1` 有现有可信 evidence；Snake 首版必须明确 `evidence: none`。
- 默认 Local Driver/Presence 只支持本机开发演示；不能据此宣称多节点已交付。
- `/Users/kimi/work/tanchishe/wegameVersion` 是只读参考档案，不是编译依赖。

## 6. 一次性侵入性的既有文件改动

“侵入性”指修改当前已存在的手写真源或框架接缝。目标不是把 Snake 分支塞进这些文件，而是一次性建立 generated
模块/profile 边界，使 Snake 以及后续玩法不再逐项改中央全集。

### 6.1 Shared、生成器与验证链

| 既有文件/目录 | 必要改动 | 原因 |
| --- | --- | --- |
| `apps/shared/src/protocol/rooms.ts` | 稳定 Game join envelope，引入 framework/mode version、profile、access、modeData | 当前只有全局版本和 mode |
| `apps/shared/src/protocol/messages.ts` | 收敛为 core/builder façade，由 generated registry 聚合玩法 token | 当前所有玩法消息集中登记 |
| `apps/shared/src/constants/errors.ts`、`protocol/lobbyRpc/envelope.ts` | 拆分 join/core control/Lobby RPC 错误域；core 加 Ready/Start/ticket 稳定错误 | 避免 Snake 错误再次成为中央 switch |
| `apps/shared/src/constants/game.ts` | 全局 `MAX_PLAYERS` 仅保留兼容默认；权威容量下沉 manifest | 不同玩法容量不能永远绑定 |
| `apps/shared/schema/game-room-state.json` | 迁移为 per-mode descriptor 入口，最终删除或仅作迁移兼容 | 当前是单一中央冲突点 |
| `apps/server/tools/room-state-codegen.ts` | 收敛为 renderer/迁移适配，接入根 gameplay codegen | 当前只生成一组 state |
| `apps/shared/src/protocol/lobbyRpc/**` | 接入 `room.prepareCreate/resolve` exact contract | 若 WS-RPC codegen 未落地，此处仍是显式侵入 |
| `apps/shared/src/protocol/http.ts`、服务端 `http/misc/version.ts`、`healthz.ts` | `/version` 明确为 framework version，mode 兼容另校验 | 当前引用单一全局版本 |
| `scripts/protocol-fingerprint.mjs`、`apps/client/test/protocolFingerprint.test.ts` | 分开 framework fingerprint 与 per-mode digest | 当前一枚指纹覆盖全部玩法 |
| 根 `package.json`、`README.md` | 增加并说明 `codegen:gameplays`、`--check` 命令 | 新开发动线必须可发现 |
| `docs/inventory.json`、`scripts/verify-inventory.mjs`、`scripts/verify-inventory.test.mjs` | 登记 generator、descriptor、generated catalog 与删除/freshness 规则 | 新文件必须进入 inventory 守门 |
| `scripts/verify-toolchain.mjs`、`apps/client/test/toolchainContract.test.ts`、`scripts/aggregate-chain-matrix.test.mjs`、`scripts/sync-mirror-matrix.test.mjs` | 按最终接链方式加入 codegen/同步工具链集合与顺序验证 | 新命令不能只存在于 package script |

### 6.2 服务端既有文件

| 既有文件/目录 | 必要改动 | 原因 |
| --- | --- | --- |
| `apps/server/src/rooms/GameRoom.ts` | 移出 ballMove；保留 core invariant、catch-all dispatcher、policy、access、Start transaction、lifecycle | 当前硬编码两人自动开始和逐消息处理 |
| `apps/server/src/rooms/GameMode.ts` | 删除 `usesDefaultBallMoveRules`，改 typed `GamePlugin + RoomProfile + capability` | 未登记玩法应 fail-fast |
| `apps/server/src/rooms/ballMoveRules.ts` | 迁入 `rooms/modes/ballMove/**` | ballMove 不再是公共默认语义 |
| `apps/server/src/rooms/modes/catalog.ts` | 改为 generated catalog 的稳定 façade，显式登记现有玩法 | 当前 catalog 与默认分支分裂 |
| `apps/server/src/app.config.ts` | 切 generated bootstrap；仍只注册 `RoomName.Game`；filter 加 profile | 禁止另造 InviteGameRoom |
| `apps/server/src/core/infra/keys.ts` | 增加邀请码 lease/ticket claim key | 禁止业务手拼 key |
| `apps/server/src/core/infra/redisRoute.ts` | 扩展 coord Redis 职责/诊断，明确 lease/claim 走 non-evictable accessor | 当前说明把 coord 收窄为 kick stream |
| `apps/server/src/core/infra/config.ts`、`apps/server/test/config-guard.test.ts` | 增加 lease TTL、renew、Waiting deadline、ticket TTL 的范围与交叉校验 | 错误时序配置必须启动 fail-fast |
| `scripts/devenv-gen.mjs`、环境配置说明 | 生成/记录新增开发配置，不打印 secret | 本地 stack 与实现默认值需要一致 |
| 相关 Redis Lua/CAS 登记与测试 | 原子 allocate/renew/release/claim，旧 generation 不能操作新值 | 禁止裸删和竞态重放 |
| `apps/server/src/core/errors.ts` | 接入 prepare/resolve 和 core room 错误映射 | 当前 Lobby 错误仍中央映射 |
| `apps/server/src/core/match/matchEvidence.ts`、`matchReplay.ts`、`matchConsumer.ts` | 首期可不改；未来多玩法可信战绩时才做 ruleset registry | Snake 首期声明无 evidence |
| `apps/server/test/{game-room,game-room-wire-contract,game-mode,idle-game-mode,multi-mode-wire,room-state-codegen,match-replay}.test.ts` | 拆为 core policy、ballMove 私有 harness、自动 mode contract 测试 | 现有 fixture 绑定 ballMove/自动开局 |

### 6.3 客户端与 View 既有文件

| 既有文件/目录 | 必要改动 | 原因 |
| --- | --- | --- |
| `apps/client/src/logic/gameplay/GameplayPlugin.ts` | 增加 generation-fenced input/exit host | 正常结算统一回 Home |
| `apps/client/src/logic/gameplay/GameplayRegistry.ts` | 消费完整 `GameplayModule` generated catalog | 不再逐玩法注入 factory/joiner |
| `apps/client/src/logic/gameplay/RoomController.ts` | 接收经 module 校验的 launch，统一 start/stop/restore | 防迟到 join/RPC 操作新 generation |
| `apps/client/src/net/RoomClient.ts` | 消费 shared token；支持 join-or-create/create/join-by-id；扩 ownership key | 当前只支持固定 join 形态 |
| `apps/client/src/net/rooms/GameRoomTransport.ts` | 只保留通用 transport，玩法 adapter 回各自目录 | 当前组合点混入玩法 adapter |
| `apps/client/src/gameplay/catalog.ts` | 改为 generated catalog façade和稳定 service context | 新玩法不再手改 context |
| `apps/client/src/Main.ts` | 编排 framework compatibility probe；只认识通用 launch/stop/restore，不出现 Snake 或 ballMove View 名 | 当前默认玩法/presentation 位于应用根 |
| `apps/client/src/view/pages.ts` | 收敛为 openGameplayLobby/submitLaunch/restoreHome | 不逐玩法增加 `openXxx` |
| `apps/client/src/view/viewRegistry.ts`、`ViewMgr.ts` | 改用 generated 静态 View catalog + 可注入只读 lookup | 当前是手写全集 |
| `apps/client/src/view/fguiContracts.ts` | contract 随 ViewMeta contribution，由 generated catalog 派生测试全集 | 当前有第二份中央全集 |
| `apps/client/src/view/HomeView.ts`、`logic/page/HomeLogic.ts`、`apps/art/fairygui/assets/View_Home_Home/Home.xml`、`apps/art/fairygui/assets/View_Home_Home/package.xml` | 一次性改为玩法入口 contribution 列表，Snake 可成为默认入口 | 现有入口固定 `btn_enter` |
| `apps/client/test/{mainGameplay,gameplayLifecycle,roomClientOwnership,wireTransport,viewRegistry,fguiContract}.test.ts` | 自动遍历 registry，补 strategy/ticket/旧 generation 反例 | 现有 fixture 穷举固定玩法/页面 |

### 6.4 文档与仓库契约

| 既有文件 | 必要改动 |
| --- | --- |
| 根 `AGENTS.md`、`CLAUDE.md` | 同步更新真源、生成物禁手改路径与新玩法标准动线，并保持语义一致性 |
| `docs/OVERVIEW.md`、`docs/SERVER.md`、`docs/CLIENT.md` 和相关 README | 记录 generated gameplay module、profile、ticket、View contribution 边界 |
| `plan-v3.md` | 只在实现和验收证据真实完成后回写状态 |

## 7. 一次性新增的通用框架文件

这些是新增路径，但属于框架改造，不应伪装成 Snake 的“零侵入业务文件”：

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
apps/server/src/websocket/room/prepareCreate.ts
apps/server/src/websocket/room/resolve.ts
apps/client/src/logic/gameplay/GameplayModule.ts
apps/client/src/net/http/FrameworkVersionProbe.ts   # 拟新增；最终路径可调整
apps/client/src/net/rooms/matchmaking.ts
apps/client/src/net/rooms/PrivateRoomService.ts
apps/client/src/core/ClipboardPort.ts
apps/client/src/view/platform/ClipboardAdapter.ts    # Web/小游戏宿主实现，失败可回退手动口述
apps/client/src/view/viewContributions.ts
apps/client/src/logic/page/PrivateRoomLobbyLogic.ts
apps/client/src/view/PrivateRoomLobbyView.ts
apps/art/fairygui/assets/<PrivateRoomLobby-package>/**
```

具体文件可以合并或改名，但职责必须留在通用层，不能先放进 Snake 再让 ballMove/后续玩法反向依赖。

## 8. 框架完成后 Snake 的无侵入式新增

“无侵入式”表示 Snake 手写业务主要新增独立目录，由 manifest/codegen 自动贡献 catalog、wire、state 和 View；它仍会
产生生成物 diff，但不应再手改 `GameRoom.ts`、`Main.ts`、中央消息表或 View 全集。

```text
apps/shared/schema/gameplays/snake/
├── manifest.json
└── state.json

apps/shared/src/gameplays/snake/
├── wire.ts
├── config.ts
└── rules.ts

apps/server/src/rooms/modes/snake/
├── index.ts
├── SnakeGameMode.ts
├── SnakeWorld.ts
├── SnakeBodyDeque.ts
├── SnakeSimulation.ts
├── SnakeCollision.ts
├── SnakeFood.ts
├── SnakeSnapshot.ts
└── SnakeSettlement.ts

apps/client/src/gameplay/modes/snake/
└── index.ts

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
└── SnakeLobbyView.ts        # 可选；默认复用 PrivateRoomLobby

apps/art/fairygui/assets/<Snake-owned-packages>/**
apps/Cocos/assets/resources/<snake-owned-assets>/**

apps/server/test/snake-*.test.ts
apps/server/test/int/snake-room-*.test.ts
apps/client/test/snake-*.test.ts
apps/client/test/clipboard-*.test.ts
```

shared 纯规则/validator 的测试可由现有 server/client 测试导入真源执行；仓库当前没有独立 `apps/shared/test` runner，
所以不能只新增该目录就声称测试已纳入命令。

## 9. 生成物与镜像

下列路径会变化，但必须由工具生成，禁止手改：

| 路径 | 来源 |
| --- | --- |
| generated gameplay mode/wire/state/View catalogs | `npm run codegen:gameplays`（提案，落地后加入 `--check`） |
| `apps/shared/src/protocol/state.ts` | gameplay/state codegen |
| `apps/server/src/rooms/schema/**` | gameplay/state codegen |
| `apps/client/src/shared/**` | `npm run sync:shared` |
| `apps/Cocos/assets/src/**` | `npm run sync:client` |
| `apps/Cocos/assets/resources/ui/**` | FairyGUI 编辑器发布 |

FairyGUI XML 必须在编辑器内维护；已发布 `.bin`/图集和 Creator `.meta` 不手工伪造。

## 10. 明确保持不动

- `apps/client/src/designSpec.ts` 的 750×1624 / `FIXED_WIDTH` 基线，竖版 Snake 直接复用。
- `apps/client/src/lib/bitecs/` 12 个锁定文件。
- `apps/client/src/lib/colyseus/` vendor 文件；只用 SDK 公开 API。
- `apps/client/src/shared/**`、`apps/Cocos/assets/src/**` 生成镜像。
- 外部 WebPlatform 契约和业务源码。
- `/Users/kimi/work/tanchishe/wegameVersion` 参考目录本身；不把旧 bundle 当子模块、依赖或可直接编译源码。
- ballMove/idle 不得删除或改变玩法行为；join envelope/framework version 会按明确迁移方案升级。阶段 1 允许为移出
  公共壳而做必要的目录迁移与测试 harness 重构。

## 11. 默认玩法替换策略

### 11.1 第一阶段：并存

- 先把 ballMove 行为等价抽离公共 `GameRoom`，为其生成 auto/default profile，并保持现有玩法与自动开局回归行为。
- 注册 Snake module/profile，Home 默认 contribution 指向 Snake 私房入口。
- 开发/测试仍能显式选择 ballMove 和 idle。
- Snake 首期结算返回 Home，不接入 ballMove evidence。

### 11.2 第二阶段：可选清理

Snake 达到 [Definition of Done](06-testing-and-roadmap.md#7-definition-of-done) 后另开变更，决定只隐藏 ballMove，还是
物理删除其 mode/state/client/art/evidence。删除会影响 per-mode catalog、digest 和测试，不与首次移植混成一个提交。

## 12. 多节点边界

首版本地演示可继续使用 Local Driver/Presence，但不能宣称多节点已交付。横向扩展前至少完成 RedisDriver、
RedisPresence、publicAddress、跨节点 create/joinById 路由、项目隔离、节点崩溃后的 lease/ticket 回收与真实故障测试。
不要把六码设成物理 roomId 来绕过协调；这会错误耦合可复用短码与房间身份。

---

> [返回总目录](README.md) · [上一篇：客户端与协议](04-client-and-protocol.md) · [下一篇：测试与实施路线](06-testing-and-roadmap.md)
