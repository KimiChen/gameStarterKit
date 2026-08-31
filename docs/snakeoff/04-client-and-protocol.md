# 04 · 客户端与协议

> [返回总目录](README.md) · [上一篇：蛇规则与数值基线](03-snake-rules-and-balance.md) · [下一篇：数据、服务端与改动面](05-data-and-server.md)

## 1. 客户端页面结构

### 1.1 页面与职责

| 页面/层 | 技术边界 | 职责 |
| --- | --- | --- |
| Home | 现有 FairyGUI + generated lobby contribution | 展示 Snake Off 入口；不直接 `joinOrCreate` |
| PrivateRoomLobby / Entry 状态 | 一次性新增的通用 FairyGUI 模板 + 纯 Logic | 按 capability 创建房间、输入六位码、显示 RPC 错误 |
| PrivateRoomLobby / Waiting 状态 | 同一通用模板 | 房间码、1～4 席位、房主、Ready、Start、退出；Snake 仅提供标题/图标/launch 参数 |
| SnakeWorldView | 新 Cocos View + 纯 gameplay Logic | 世界渲染、摇杆、加速、插值、重连遮罩 |
| SnakeHudView | 建议 Cocos 非交互节点 | 倒计时、排名、网络状态；不抢玩法触摸 |
| SnakeResultView | Snake 自有 FairyGUI 或 Cocos 结算层 | 排名、得分、返回 Home；首期不提供 rematch |

### 1.2 为什么不能沿用“点击 Home 后直接进 GameRoom”

当前 `Main.enterBattle()` 会关闭大厅页，然后由玩法 joiner 直接 `joinOrCreate(RoomName.Game)`。私人房需要先准备可信
创建上下文，或解析六位码取得精确 roomId，再以对应 strategy 加入。因此 Snake 的目标流程是：

```text
Home click
  → generated contribution 打开 PrivateRoomLobby
  → 创建：room.prepareCreate → RoomClient.create("game", creation ticket)
    或加入：room.resolve → RoomClient.joinById(roomId, join ticket)
  → 冻结完整 launch/join target（strategy、mode/version/profile、sId、access）
  → RoomController 通过 generated GameplayModule 启动 snake plugin
  → PrivateRoomLobby / Waiting
  → Playing 时关闭交互式 FGUI，挂载 SnakeWorldView
```

通用 `RoomClient` 负责三种 strategy：`join-or-create`、`create`、`join-by-id`；Snake module 只声明 launch schema、
profile 与 presentation contribution。`RoomController` 仍只拥有一次精确 room capability，不从全局查询“当前房”。

## 2. 房间入口页

### 2.1 信息层级

```text
┌──────────────────────────────┐
│          SNAKE OFF           │
│                              │
│       [ 创建房间 ]           │
│                              │
│  输入六位房间码              │
│  [ 0 ][ 1 ][ 2 ][ 3 ][ 4 ][5]│
│       [ 加入房间 ]           │
│                              │
│  错误/加载状态               │
│                    [ 返回 ]  │
└──────────────────────────────┘
```

### 2.2 输入行为

- Logic 保存字符串，不保存 number。
- 粘贴时只接受六个 ASCII 数字；是否过滤其他字符由表现决定，提交前必须 exact validate。
- `012345` 的首位零要完整显示和上传。
- 创建、解析在途时禁用重复提交；取消页面会终止本次 UI ownership，creation/join ticket 依靠 JTI、expiry 与原子 claim 收敛。
- RPC 错误只更新当前 View generation；页面关闭后的迟到结果不得重新打开旧页。

### 2.3 错误文案

| 语义 | 建议文案 |
| --- | --- |
| INVALID_ROOM_CODE | “请输入 6 位数字房间码” |
| ROOM_CODE_UNAVAILABLE | “房间不存在、已失效或已经开始” |
| ROOM_FULL | “房间已满” |
| RATE_LIMITED | “操作太频繁，请稍后再试” |
| CONN_LOST | “连接已断开，请重试” |

房间码错误不等于 token 过期，不能触发全局回登录。

## 3. Waiting 页面

### 3.1 必须显示

- 六位 roomCode，按等宽数字或分组显示。
- 复制按钮；首版“邀请好友”即通过注入的 ClipboardPort 复制数字码，不承诺平台好友 SDK。复制失败时保留可选择、
  可口述的六格文本和明确反馈。
- 四个固定席位：昵称、房主标识、Ready 状态、离线恢复状态。
- 自己的 Ready/取消准备按钮。
- 房主专属 Start 按钮及禁用原因。
- 当前人数与最大人数，例如 `2/4`。
- 退出房间按钮。

### 3.2 Start 按钮状态

`selfId` 明确定义为当前 `room.sessionId`；公开 `player.id` 与 `ownerId` 也都是 sessionId。账号 uid 只在服务端用于
认证、ticket 与同账号去重，不进入客户端房主判断。

客户端派生：

```text
visible = selfId == ownerId
enabled = phase == Waiting
          && playerCount >= displayedMinStartPlayers
          && every(players, ready)
          && every(players, connected)
          && !startPending
```

按钮可见/可用不构成授权。收到 Schema 变化后立即重算；服务端拒绝时显示稳定原因，并以最新状态为准。

### 3.3 成员变化

- 新成员加入时做轻量入座反馈，随后按权威 `player.ready=false` 渲染。
- 新成员加入、成员最终离开或房主转移都保留其他成员的 Ready；仅按权威 state 更新 roster/revision。
- 临时重连中保留席位和 Ready，显示“重连中”，并让 Start 按钮因 `connected=false` 禁用。
- Start 在途时显示“正在开始”，但保留服务端取消后回 Waiting 的路径。
- phase 变为 Playing 后再切战斗层，不能以点击 Start 的本地时刻提前开始。

## 4. 竖版战斗输入与表现

### 4.1 输入层分工

现有 FairyGUI 全屏交互页会取得全局 InputProcessor 租约，可能挡住玩法触摸。因此建议：

1. Playing 前关闭或解除 PrivateRoomLobby / Waiting 状态的交互租约。
2. 摇杆与加速使用 Cocos 输入层，归 `SnakeWorldView` 所有。
3. HUD 用不参与触摸的 Cocos 节点；若使用 FairyGUI，只挂非交互表现层并验证不会吞事件。
4. Settle 时先释放 Cocos 输入，再打开结算交互层。

### 4.2 摇杆

- 左下区域接受按下、拖动、释放。
- 死区内不产生新方向；离开死区后归一化向量。
- 释放摇杆时不让蛇停下，保持最后方向。
- 方向变化超过角度阈值或心跳间隔到达时发送；上行频率仍受 20Hz 限制。
- 屏幕旋转、View unmount、触摸取消时清理 pointer ownership，不能让旧触摸影响下一局。

### 4.3 加速

- 右下按住为 `boost=true`，释放/取消为 false。
- 多点触控下摇杆与加速分别绑定各自 touch id。
- View 失焦、重连中、phase 非 Playing 或客户端 generation 变化时立即清除本地 boost 意图。
- 服务端是否接受加速取决于 alive、长度和规则，按钮按下不保证 `boostAccepted=true`。

### 4.4 插值与本地预测

推荐首版：

- 远端蛇以两个合法 snapshot 之间插值，渲染时间落后权威约 100ms。
- 本地蛇头可按最后已发送输入做轻量视觉预测；收到权威 head 后在短窗口平滑校正。
- 蛇身根据权威路径点渲染，不让客户端预测增减逻辑长度。
- 食物消失、死亡和排名以权威 snapshot/state 为准。
- 客户端预测永远不回写服务端，也不产生本地得分。

## 5. Lobby RPC 契约

以下名称是提案，实施时应成为 shared core Lobby RPC 单源并加入 exact runtime validator。若先落地
[Non-intrusive.md](../Non-intrusive.md) §4.1，由 domain 文件与 codegen 接入；否则必须显式修改现有中央 RPC/error contract。

### 5.1 `room.prepareCreate`

请求：

```ts
interface IRoomPrepareCreateReq {
  mode: "snake";
  modeVersion: number;
  profile: "snake.private";
}
```

响应：

```ts
interface IRoomPrepareCreateRes {
  creationTicket: string;
  expiresAt: number;
}
```

creation ticket 绑定认证 `uid + sId + mode + modeVersion + profile + purpose=create + jti + exp`。客户端随后调用
`RoomClient.create(RoomName.Game, joinOptions)`；GameRoom 原子 claim ticket，并由 ticket 固定可信
`expectedOwnerUid`。roomCode 在创建者成功入座后从权威房间 state 获取。

### 5.2 `room.resolve`

请求：

```ts
interface IRoomResolveReq {
  code: string;
}
```

响应：

```ts
interface IRoomResolveRes {
  roomId: string;
  mode: "snake";
  modeVersion: number;
  profile: "snake.private";
  joinTicket: string;
  expiresAt: number;
}
```

响应不返回房内成员详情。成员信息只在真正加入并通过 GameRoom auth/admission 后由 Schema 下发。

### 5.3 稳定 Game join envelope

一次性框架改造后，所有玩法使用同一顶层 join envelope：

```ts
interface IGameRoomJoinOptions {
  v: number;                  // framework version
  mode: string;
  modeVersion: number;
  profile: string;
  token?: string;
  sId?: number;
  access?: {
    kind: "create" | "join";
    ticket: string;
  };
  modeData?: unknown;
}
```

`access.kind` 的 create/join purpose 不可互换；`modeData` 只容纳玩法自有 exact-validated 参数。ticket 只参与内存
校验和 ownership key，禁止写入 state、日志、指标标签或错误文本。`access` 只因公共 matchmaking profile 才在顶层
结构上可选；`snake.private` 的 create/join 两条路径都必须携带与 strategy 匹配的 access ticket。

### 5.4 安全边界

- 两个 RPC 都要求已认证 Lobby 会话和当前 sId。
- resolve 对 uid 和/或连接限流。
- 响应不返回 Redis key、leaseToken/generation 或其他租约内部值。
- roomId 长度与字符域 exact validate。
- resolve 必须签发一次性、短期、绑定 uid/roomId/mode/version/profile/lease generation 的 join ticket；裸 roomId
  和六位码都不是准入凭证。
- GameRoom 在异步 ticket/lease 校验前同步占用 pending seat，并在最终入座前重验 phase、starting、容量与 lease。

## 6. GameRoom C2S/S2C 契约

### 6.1 Core control 与 Snake wire

| 消息名提案 | Payload | phase | 权威行为 |
| --- | --- | --- | --- |
| core `RoomReady` token | `{ ready: boolean }` | Waiting | owner-ready policy 设置自己的 `player.ready` |
| core `RoomStart` token | `{}` | Waiting | 仅房主触发 revision-fenced Start 事务 |
| `c2s.snake.input` | `{ dirX, dirY, boost, seq }` | Playing | 更新最新合法输入 |
| `c2s.snake.snapshotRequest` | `{ afterTick }` | Playing/恢复窗口 | 请求一份不旧于已知 tick 的完整快照 |

Start 使用严格空对象，未知字段拒绝。Ready/Start 是通用 core policy token；Snake 消息在自己的 `wire.ts` 里用
`defineC2S/defineS2C` 声明 validator、phase 和 rate cost。codegen 生成 registry，GameRoom 通过一次性 catch-all dispatcher
路由；新增 Snake 消息不再手改中央 `C2S/S2C`、schema map 或 `phaseAllows`。

### 6.2 新 S2C

| 消息名提案 | Payload | 用途 |
| --- | --- | --- |
| `s2c.snake.snapshot` | 有界完整/增量世界快照 | 蛇身、食物、掉落、权威 tick |
| core `RoomControlError` token | 通用稳定错误信封 | Ready/Start 的拒绝 |
| Snake 自有 command error token（若需要） | gameplay manifest 贡献的稳定错误 | 输入类可恢复拒绝；不扩中央玩法 enum |

若增量快照会显著增加恢复复杂度，首版优先 10Hz 有界完整快照；四人和对象上限已经可控。测得包预算不足后再加 baseTick/delta，不提前实现半套增量协议。

### 6.3 世界快照提案

```ts
interface ISnakeWorldSnapshot {
  matchId: string;
  tick: number;
  seq: number;
  snakes: Array<{
    id: string;
    alive: boolean;
    points: Array<{ x: number; y: number }>;
  }>;
  foods: Array<{ id: number; kind: number; x: number; y: number }>;
  wrecks: Array<{ id: number; ownerId: string; value: number; x: number; y: number }>;
}
```

实际 wire 可以量化为整数和扁平数组降低体积，但 shared validator 必须恢复为有界、可读的领域值。每层数组都要
限制长度，拒绝重复 snake/food/wreck id、非有限坐标、越界坐标和过长 matchId。

快照接受条件：

```text
snapshot.matchId == currentState.matchId
&& snapshot.tick >= lastAppliedSnapshotTick
&& snapshot.seq > lastAppliedSnapshotSeq
&& snapshot.tick <= latestObservedStateTick + allowedLead
```

迟到旧快照直接丢弃，不回退画面时钟。

## 7. Snake Schema 摘要

高频、长数组不进入 Schema root。Snake 的 per-mode state descriptor 组合 `RoomBase`、`PlayerBase`、`OwnerReady` 和
`InviteRoom` 公共 fragment，再增加玩法摘要：

```text
SnakeRoomState
├── tick
├── phase
├── matchId
├── roomCode
├── ownerId
├── rosterRevision / readyRevision / connectionRevision
├── endTick
├── winnerId
├── snapshotSeq
└── players: Map<SnakePlayerState>
    ├── id / name
    ├── joinOrdinal
    ├── ready
    ├── connected
    ├── alive
    ├── score / length / deathCount
    ├── headX / headY / direction
    ├── boost
    └── ackSeq
```

说明：

- Waiting 依赖 `ownerId`、`roomCode`、`player.ready` 和 joinOrdinal。
- Playing 的 head/score/length 提供轻量摘要与 HUD 更新。
- 完整 body、foods、wrecks 属于服务端私有 SnakeWorld，通过 S2C snapshot 下发。
- 一次性 `codegen:gameplays` 从每玩法 manifest/state descriptor 生成三端 state/catalog；不要为了蛇身把 DSL 扩成任意
  深度数组和巨型 MapSchema。
- roomCode 是否在 Playing 后保留展示由产品决定；即使展示也不代表仍可加入。

## 8. joinById 与 RoomClient

### 8.1 新能力

当前 `RoomClient` 的物理 join 固定调用 `joinOrCreate(RoomName.Game, options)`。一次性改为显式 strategy 联合：

```ts
type GameRoomMatchmakingStrategy =
  | { kind: "join-or-create"; roomName: string }
  | { kind: "create"; roomName: string }
  | { kind: "join-by-id"; roomId: string };
```

connection key 必须包含 endpoint、strategy、roomName/roomId 和完整 join options。两个不同 roomId 或 access ticket
绝不能合流到同一 slot；ticket 参与内存比较但不得打印。

### 8.2 状态屏障

沿用现有安全边界：

- SDK 第一份真实 ROOM_STATE 经 Snake exact validator 通过前，不开放 C2S。
- drop 后立即关闭发送并清空 SDK 离线队列。
- reconnect 后先通过新的 state 和世界 snapshot，读取权威 `ackSeq`，再以严格大于 ack 的新 seq 重发当前方向；
  boost 先保持 false，旧 seq 不重放，本地 seq 也不能归零。
- ownership/generation 变化后，所有旧 View、room callback 和 snapshot callback no-op。

## 9. 客户端状态机

```text
Home
  → RoomEntryIdle
  → PreparingCreate → CreatingGameRoom ┐
  → Resolving → JoiningById            ├→ WaitingRoom
  → StartPending
  → LoadingWorldSnapshot
  → Playing
  → Reconnecting ↔ Playing
  → Settle
  → Home
```

关键限制：

- `StartPending` 只是本地反馈，权威 phase 仍是 Waiting。
- 收到 Playing state 但尚无同 matchId 的世界快照时，显示加载遮罩且不发送输入。
- 收到 Settle 后先停输入，再展示结算。
- 任何阶段收到 session/token 类错误才走登录恢复；房间业务错误回 RoomEntry/Home。

## 10. 竖版适配

- 设计宽固定 750，高度随设备在约 1334～1730 浮动。
- 顶部 HUD 使用 `FguiView.safeTopInset()` 或 Cocos 对应安全区，不贴进刘海。
- 摇杆和加速离底部 home indicator 留安全距离。
- 触摸区域至少大于可见按钮，左右手区域不重叠。
- 超长屏增加战场可视高度或留白，不能纵向拉伸圆形按钮和蛇身。
- 窄短屏优先保证摇杆、加速、倒计时和自己排名可用，次要排名可折叠。

详细线框见 [07 · 竖版美术方向](07-art-direction.md)。

## 11. 协议版本与兼容

稳定 join envelope、profile、core Ready/Start 与 generated catalog 属于 framework 协议不兼容变更，实施时必须提升
framework version。Snake 自有 wire/state 由 `modeVersion` 和 per-mode contract digest 管理；以后仅新增/升级 Snake
不能迫使所有无关玩法共享一个全局版本号。文档不预占任何最终号码。

升级顺序：

```text
shared gameplay manifest / wire / state descriptors
  → codegen:gameplays
  → sync:shared
  → generated server/client catalogs
  → server plugin / client GameplayModule / contributions
  → framework + per-mode fingerprint/version checks
  → sync:client
```

不能让旧客户端以 ballMove state validator 加入 Snake 房，也不能让新客户端在服务端尚无 Snake handler 时静默发包。

## 12. 客户端与协议验收

- `012345` 从输入、RPC、state 到显示全程保持六位字符串。
- prepareCreate/resolve/create/joinById 在途取消不会让迟到结果更新旧页面。
- RoomClient slot key 区分 strategy、roomName/roomId、端点和完整 options；日志中不出现 token/ticket。
- creation ticket 绑定可信 owner；join ticket 的 purpose、uid、room/version/profile/lease generation 都不可串用。
- 首份合法 state 和 world snapshot 前无 SnakeInput 穿过。
- Waiting FGUI 关闭后不再吞战斗触摸。
- 两指同时控制方向与加速，取消任一触点不会污染另一触点。
- drop/reconnect 不由 SDK 自动重放旧 SnakeInput。
- snapshot exact validator 拒绝超长数组、重复 id、越界/非有限坐标和错误 matchId。
- 迟到旧 tick/seq 快照不回退客户端世界。
- 750×1624、短屏、长屏和安全区设备均可操作。
- 错误码进入正确恢复路径，房间码错误不退出登录。

---

> [返回总目录](README.md) · [上一篇：蛇规则与数值基线](03-snake-rules-and-balance.md) · [下一篇：数据、服务端与改动面](05-data-and-server.md)
