# MMO 整合设计基线：Nakama 定形、AzerothCore 定实、gameStarterKit 定则

> - 日期：2026-09-09。本仓基线 `26da7e5`。状态：**整合设计基线 v1，待 MF1 对抗审阅**；⛔ 未实施任何 MMO 能力，不改变既有承诺。
> - 来历：四份并行草案（[mmo-chatgpt.md](mmo-chatgpt.md) / [mmo-claude.md](mmo-claude.md) / [mmo-kimi.md](mmo-kimi.md) /
>   [mmo-zcode.md](mmo-zcode.md)）经 [mmo1.md](mmo1.md) 的第一轮对比与整合规则合成本文；四稿与 mmo1 保留为讨论材料，
>   ⛔ 不再各自维护阶段表。引用四稿编号一律带稿名前缀（如「kimi E3」）。
> - 定位：MMO 能力域的技术基线，与 [Non-intrusive.md](Non-intrusive.md) 之于 plugin / gameplay module 同一地位。
> - 治理：⛔ 不进 plan-v5；实施状态只在本文 §12 回写；开放项如被立项，去向登记遵循 EXTRAS §5.2。
> - 自包含：只引用 Nakama / AzerothCore 上游与本仓已入库文件；本轮对上游的描述来自公开文档与源码结构，MF1 建立带 commit 的引用锁并复核。
> - 用户给定四目标（2026-09-08）：① 补足本仓对 MMO 的支持；② 按 Non-intrusive 的做法**框架侧阶段先行、玩法后挂**；
>   ③ 产出一个 MMO kit 作为开发 MMO 的地基；④ 之后的具体游戏是 snake 级别的新增式改动，**只消费 kit 与框架**。
>   本文展开为三层交付：框架阶段 **MF0–MF11**（§5–§6）→ `mmo` kit **MK0–MK4**（§7–§8）→ 内容插件 **MG0–MG2**（§9）。

---

## 0. 原则与结论

**Nakama 定形、AzerothCore 定实、gameStarterKit 定则。**

| 来源 | 借什么 | 不借什么 |
| --- | --- | --- |
| Nakama（Apache-2.0，Go） | 后端的形：账号 / 会话 / 存储 / 钱包 / 匹配 / 组队 / presence / 频道的分层，权威 match 的钩子形状（init → joinAttempt → join → loop → leave → terminate → signal），按 presence 子集广播，运行时模块的注册面 | 任何代码；存储引擎与钱包实现；Enterprise 集群；它没有的东西（§2.2） |
| AzerothCore（AGPL-3.0，C++） | 世界的实：auth / characters / world 三库分工，Map → Grid → Cell 的可见性与按客户端更新块，`CreatureAI` / `SmartAI` / `MotionMaster` 的数据驱动 AI，`Spell` / `Aura` / `ThreatMgr` 的战斗骨架，周期存档，跨图传送三段式，`InstanceMap`，`modules/` 随包挂载的模块系统 | 任何代码与 SQL；WoW 协议 / DBC / 数据；客户端权威移动；一 realm 一进程 |
| gameStarterKit（本仓） | 规则：shared 单源与 codegen、铁律、幂等 v2 / fence / outbox / 单例 lease、kit 的 SQL 账本与 api 面、新增式动线、protected-paths 与 verify 链 | 把「小房间短对局」的假设当成 MMO 的前提 |

结论：缺口集中在**角色主体、常驻房型、逐观察者同步、社交原语、交接、检查点、贡献点**七处，每处都落在框架保护面
（`rooms/`、`schema.sql`、`websocket/push.ts`、codegen、`protected-paths.json`），kit 的所有权推导集带不进来。顺序只能是框架 → kit → 玩法。

三个不变判据（贯穿全部阶段，任一被破坏即回退）：

1. **插件只能消费不能定义**（PLUGIN.md §1）：内容插件带进仓的只有内容包、表现映射、编排模块、自有 Lobby RPC 域与页面；⛔ 不定义 mode / state / wire / SQL。
2. **每种数据一个持久真源**（SERVER.md 09·A1–A5）：⛔ 不为 MMO 建第二套货币账本、第二份物品权威、第二份在线表。
3. **新增普通 MMO 玩法不再手改框架与 kit**：允许确定性的 codegen / 指纹 / 镜像 diff（Non-intrusive §1）。

## 1. 术语（先钉死双义词）

| 术语 | 符号 | 含义 | Nakama | AzerothCore |
| --- | --- | --- | --- | --- |
| 区服 realm | `sId` | 本仓既有「zone / 区」：账号 / 经济 / 冷档的隔离维度（per-zone 表）。⛔ 不是地图 | 无 | realm |
| 地图 map | `mapId` | 一张有界地图的静态定义（内容包） | 无 | `Map` |
| 分线 line / 实例 | `line`、`instanceId` | 同一地图的第 N 份运行实例 = 一间 Colyseus 房；`instanceId` 是框架分配的稳定身份 | match 实例 | `InstanceMap` |
| 世界地址 | `WorldAddress` | `(sId, mapId, instanceId)` | matchId | `(mapId, instanceId)` |
| 世界房 WorldRoom | — | 新框架房型：Colyseus 传输 / 生命周期外壳，承载一个 WorldAddress，常驻 | authoritative match | `WorldSession` 集合 |
| 世界运行时 WorldRuntime | — | 无连接、无头可测的模拟宿主（固定步、命令队列、生命周期）；WorldRoom 只是它的传输壳 | match handler | `Map::Update` |
| 账号 | `uid` | 外部身份契约的账号 | user | `auth.account` |
| persona | `personaId` | **框架**的角色身份与控制权主体（一 uid 一区 N 个）。⚠ 不叫 `character`：本仓 `player/character.ts` 与 `K_CHARACTER_REPAIR_*` 已占该词（首进区建档）。kit 对外仍叫 `characterId` | 无 | `characters.characters` |
| 资产主体 | `AssetOwner` | `account(uid)` \| `persona(personaId)`；主账 ledger 带 owner scope | wallet 只挂 user | 挂 character |
| 控制权 | `controlEpoch` | 一个 persona 在哪个 WorldAddress 被权威模拟；持久、单调 | 无 | 玩家挂唯一 Map |
| 权威租约 | `authorityEpoch` | 一间 WorldRoom 对其 WorldAddress 的单主租约 | match 钉节点 | 单进程隐含 |
| 兴趣集 | InterestSet | 会话 → 可见实体集合；网格只产生候选，可见性授权是独立判断 | presence 子集 | `m_clientGUIDs` |
| 内容包 | content pack | 地图 / 生物 / 技能 / 物品 / 刷新点 / 区域等静态模板，插件提供、kit 校验装载 | 无 | world 库模板 |
| 贡献点 | contribution | 框架机制：kit 声明「插件可以交什么」，codegen 生成静态目录 | `InitModule` | `modules/` |

## 2. 参考对账

### 2.1 能力域对照

| 能力域 | Nakama（形） | AzerothCore（实） | 本仓现状（2026-09-09 核验） | 落点 |
| --- | --- | --- | --- | --- |
| 认证 / 会话 | JWT session | authserver + session key | WebPlatform HTTP 契约 + strict verify（已有） | 不动 |
| 账号 → 角色 | user 一层 | `account` ↔ `characters`（1:N） | uid + sId 一份档，无多角色 | **MF2** |
| 存储 | collection / key / OCC version | 类型化表 | durable Redis 热档 + freeze/thaw + kit SQL 账本（已有，更强） | kit 表；MF2 owner scope |
| 钱包 | wallet + ledger | `money` 字段 | `user_currency` + `currency_ledger`（已有） | **MF2** owner scope |
| 权威容器 | match handler 七钩子、tick rate、opCode | `Map` / `InstanceMap` + 50 ms 主循环 + `WorldSession` | `GameRoom`（对局语义）+ `GameMode` 钩子 + wire catalog dispatcher | **MF3/MF4** |
| 向子集广播 | `broadcastMessage(…, presences)`——有原语无空间索引 | Grid / Cell + `GridNotifier` + 按客户端 create / values / out-of-range | `sendS2C` / `broadcastS2C`；snake 分块 baseline + delta + checksum + cursor（全房同视图） | **MF5** |
| presence / 组队 / 频道 | presence、party、chat channels（room / group / direct）、notifications | group、channel、whisper | 每进程本地在线表；guild 事件 seq + 唤醒 push；房内 core Chat 全房广播 | **MF6** |
| 匹配 | matchmaker | LFG | Colyseus `filterBy`（已有） | 加 `mapId` / `line` |
| 扩展 | `InitModule` 注册 RPC / hook / match | `ScriptMgr` 钩子 + `modules/mod-*`（sql + conf + src） | plugin / kit + codegen；无「插件向 kit 交内容」通道 | **MF9** |
| 事件 / 流 | streams | 进程内 | Redis stream：outbox / mailwake / kick（已有） | **MF6a / MF7** |
| 世界静态内容 | 无 | `*_template` / `smart_scripts` | `excel-to-json` demo；snake 冻结数据表先例 | kit `content` 面 + 贡献点 |
| 实体 / 移动 | 无 | `WorldObject → Unit → Player / Creature`；客户端上报 + 校验；MMAPs | ballMove / snake：意图 + 服务端常量速度积分，网格只做候选 | kit `world` / `movement` |
| 战斗 | 无 | `Spell` / `Aura` / `ThreatMgr` | `shared/logic/battle.ts` + `compute/battleSim` 先例 | kit `combat` |
| NPC AI | 无 | `CreatureAI` / `SmartAI` / `MotionMaster` | snake AI 与真人同意图通道 | kit `ai` |
| 物品 / 掉落 | 无 | `item_instance` / loot 模板 | 示例背包（账号维度）；arena SQL 回执幂等 | kit `inventory` |
| 跨图 | 无 | `TeleportTo` 三段式 | 邀请码 lease + access ticket 固定准入时序 | **MF8** |
| 存档 | 无 | `PlayerSave.Interval` + 强制点 | 事件驱动落库；无周期快照 | **MF7** |
| 运维 / 扩展 | Console；Enterprise 集群 | GM 命令；一进程一 realm | `/monitor`（非生产）；RedisDriver / Presence 探针已实测未启用 | **MF10** |

### 2.2 Nakama 对 MMO 的七处不足（以 AzerothCore 补）

| # | 缺什么 | AzerothCore 解法 | 本仓落点 |
| --- | --- | --- | --- |
| N1 | 无世界 / 实体 / 角色模型 | 三库分工 + 对象层级 + 模板表 | MF2 persona；kit `world` / `content` |
| N2 | 有子集广播原语，无空间索引与可见性算法 | Grid / Cell + 通知器 + 三种更新块 | MF5 兴趣集原语；kit 网格索引 |
| N3 | presence / party / chat 都有，但与世界无绑定（附近频道要自己算） | 附近 = 视野 | MF6b：附近聊天绑兴趣集 |
| N4 | 无跨 match 角色交接 | `TeleportTo` 三段式 | MF8 |
| N5 | match 状态不落盘 | 周期存档 + 强制点 | MF7（角色级 + 分线级） |
| N6 | 无 AI / 战斗 / 掉落 / 副本 | 对应子系统 | kit 各面 |
| N7 | 模块只能注册 RPC / hook，不能向核心交数据内容 | `modules/` 随包 SQL 与脚本 | MF9 贡献点（⛔ 不给插件 SQL） |

### 2.3 不搬与保留

- **AzerothCore 不搬**：客户端权威移动；一 realm 一进程 + 线程池；裸 SQL 无幂等；WoW 协议 / 数据；**AGPL-3.0 代码零行、SQL 零条进仓，⛔ 不做「翻译成 TS」**。
- **Nakama 不搬**：依赖与代码；存储 / 钱包实现；集群。
- **本仓保留且更强**：幂等 v2（lease + CAS + inspect）、fence-on-write、outbox / relayer / 死信、kit 迁移账本、按区表登记、冷档契约、wire catalog 全链路闸、协议指纹、protected-paths 矩阵。MMO 每条持久写路径都落在其上，⛔ 不开例外。
- **授权登记**：实施期每次「参考了上游某文件」在提交信息写「设计对照：<仓>/<路径>@<commit>」（snake 素材台账同一纪律）。Knight Online 内容若做，是第三个内容插件，法律边界另立项，⛔ 不绑进框架与 kit 验收。

引用锚点（MF1 复核）：Nakama 官方文档 Authoritative Multiplayer / Streams / Storage / Parties / Chat / Server Framework（2026-09-08 访问）；
AzerothCore 固定 `a5e0e6b8f2bf878cb45cb1dc2251eb1448b9bbc3`：`src/server/game/Maps/{Map,MapInstanced}.cpp`、`Grids/Notifiers/GridNotifiers.cpp`、
`Entities/Player/PlayerStorage.cpp`、`Handlers/MovementHandler.cpp`、`Entities/Creature/Creature.cpp`、`common/Utilities/EventMap.cpp`。

## 3. 本仓基线核对（2026-09-09 只读核验）

| 已有 | 缺口 |
| --- | --- |
| GameRoom 对局运行时：认证 / 区号复核、`filterBy`、join 信封、20 Hz fixed-step + catch-up、catch-all dispatcher（预算 → owner → exact validate → rateCost → phase）、重连宽限、drop-in / 私房 / ticket | 常驻房型不存在；GameRoom 2214 行且 EXTRAS §5.3 自认 god-object，⛔ 不在其上叠 MMO 语义 |
| kit K0 全链（arena + arenaShop）：多 mode、多 api 面、`requires.kits` 正反向闸、`withKitTx`、`k_<id>_*` per-zone + `kit_migration` 账本 | KIT K1 未实施（客户端 / shared 侧 kit-api 导入边界、`.conn` 禁令、pending outbox 卸载闸）→ **MF0** |
| 身份与经济：外部契约、`user_currency` + ledger、幂等 v2、outbox、`singleton_lease` | 无 persona；资产主体只有 account |
| 同步：snake 分块 baseline + 有序 delta + checksum + cursor | 全房同视图；无兴趣集、enter / leave、背压 |
| **移动先例**：ballMove 客户端只发 `dirX/dirY ∈ [-1,1]`，服务端常量速度积分并 clamp（`apps/server/src/rooms/modes/ballMove/rules.ts:92-96`）；snake `SpatialGrid` 只产生碰撞候选（`modes/snake/world.ts:121-160`） | — （直接沿用） |
| **投递**：`websocket/push.ts` 每进程本地在线表；`pushToUser` / `pushToGuild` / `pushToAll` 都不跨节点；跨进程只有「每节点 XREAD 整条流 + 本地过滤」（`core/infra/streamConsumer.ts`，mailwake / kick） | 无区服级广播、无多 uid 定向投递；`pushToGuild` 多节点下静默丢 |
| **guild 先例**：成员 = 档字段 `guildId`；事件 `INCR seq` + 有界 `LPUSH`；push 只带 `{seq, guildId}`；客户端 `guild.getEvents` 自愈 | 无名册存储 |
| **房内 Chat**：100 字、rateCost 1、全房无条件广播（`GameRoom.ts:801-813`） | 不可跨房 |
| **StateView**：`@colyseus/schema` 4.0.27 / core 0.17.44 有 `client.view`；vendored 客户端 bundle（schema 4.0.13）含 `StateView` 类，手写 `.d.ts` 无 | 首版 per-session 统一走消息流；StateView 只作 MF1 对照实验 |
| **多进程探针** `apps/server/tools/m0/colyseus-redis-probe.ts`：RedisDriver / Presence 两节点跨进程撮合、定向建房、`kill -9` 后约 4 s 惰性清理 | 键不可前缀、必须独立 Redis 实例（`app.config.ts:74-79`）；无按房租约 |
| 租约：`singleton_lease`（MySQL，只有 relayer / freezeWorker）、per-uid Redis 锁 + fence（`core/locks.ts`）；`roomEpochId` 只是身份令牌 | 世界房权威租约是新原语 |
| **`test:changed`**：按单条路径判认领，两包同改仍走快路径（`apps/server/tools/plugin/changed.ts:200-226`，`test/plugin-changed.test.ts:116-130`） | ⛔ 不是无侵入证明；验收用完整 diff 分类（§9.4） |

## 4. 目标形态

### 4.1 三层职责

| 层 | 交付 | ⛔ 不放入 |
| --- | --- | --- |
| 框架（MF0–MF11） | persona 与资产主体、WorldRoom / WorldRuntime、权威租约与控制权、兴趣集同步、presence / party / channel、检查点与世界事件、交接与凭据、贡献点 / fragment / 带参 launch、容量与运维 | 任何地图 / 职业 / 技能 / 物品 / 数值；格长、视野半径等参数 |
| `mmo` kit（MK0–MK4） | mode `mmoWorld` 与其 wire / state；`k_mmo_*` 表；九个 api 面；内容包 schema；编排运行器；客户端世界引擎与角色选择页；默认 HUD | 绕过框架的账本 / 身份 / 租约 / 在线表；任何一款游戏的内容与美术 |
| 内容插件（MG0–MG2） | `plugin.json`（`requires.kits.mmo` + `contributes.mmo`）；内容包；表现映射；编排模块；自有 Lobby RPC 域与页面；美术；测试 | SQL、wire、mode、对 kit 内部模块的 import |

### 4.1.1 两种世界形态（2026-09-09 补，由 slg kit 的审核引出）

| 形态 | 权威在哪 | 房间是什么 | 用到的框架阶段 | 例 |
| --- | --- | --- | --- | --- |
| 内存权威世界 | WorldRuntime 内存 + 检查点 | WorldRoom：常驻、租约、控制权、Draining | MF2 / MF4 / MF5 / MF6 / MF7 / MF8 全用 | `mmo` kit |
| SQL 权威 + 视图房 | `k_<id>_*` 表（Lobby RPC 幂等写） | dropIn GameRoom 上的实时视图：无人即销毁、重建从 SQL 拉、崩溃不丢状态 | **只共用 MF5**（按会话裁剪同步）与 **MF7 的 `kit.json.workers[]`**（离线周期结算）；⛔ 不需要 MF2 / MF4 / MF8 与检查点 | `arena`（已有）、`slg` kit（大地图 + 行军） |

视图房形态的约束：⛔ 不得在 kit 内自建第二套兴趣集差分 / 投递（AOI 只用 MF5 原语，在 MF5 落地前该 kit 的房间阶段不开工）；名册 / 视口是否进 Schema 仍按 D4 缺省（不进）；满员 `joinOrCreate` 开第二房时正确性靠 SQL 权威，验收须含跨房互见。

### 4.2 运行结构（目标形态，除「已有」外均需实现）

```text
┌──────────── 本地基础设施（已有）────────────────────────────────────────────┐
│ durable Redis（热档 / fence / 幂等 / outbox / presence）  coord Redis（kick / push 流） │
│ MySQL（框架表 + persona + world_instance + world_transfer + k_mmo_*）           │
└─────▲──────────────────────────────────────────────────▲──────────────────┘
      │ UoW / outbox / kitApi / withWorldTx（MF2/MF7）        │ kit worker（MF7）：世界事件消费、交接清理
┌─────┴──────────────────────────┐   ┌─────────────────────┴────────────────┐
│ LobbyRoom（已有）+ 框架域          │   │ 每节点 XREAD stream:push 本地过滤（MF6a）│
│ party / chat / world RPC        │   │ pushToUsers / pushToRealm            │
│ world.enter → WorldAddress+凭据 │   └──────────────────────────────────────┘
└─────┬──────────────────────────┘
      │ join(RoomName.World, {sId, mode:"mmoWorld", profile:"world", mapId, line, personaId, ticket})
      ▼
┌──────────── WorldRoom（MF4 传输壳）──────────────────────────────────────────┐
│ 共享接缝（自 GameRoom 抽出，MF3）：RoomAuth / WireDispatcher / MessageBudget / ReconnectGrace / S2CPorts │
│ 生命周期 Recovering → Active → Draining → Offline；Redis 权威租约；控制权 CAS                     │
│ Schema：全图公开的分线元数据 ｜ 消息流：按会话兴趣集裁剪的 baseline + delta + private（MF5）         │
│ core 世界 token：c2s/s2c.world.chat（附近聊天，perSession，MF6b）                                   │
│ ┌──── WorldRuntime（无头，MF4）：kit `mmoWorld` mode：命令 → 移动积分 → 战斗 → AI 分桶 → 编排事件 → AOI 差集 → 出站 ┐ │
│ └──── 内容包 + 编排模块（插件经贡献点提供，MF9）                                                     ┘ │
└──────────────────────────────────────────────────────────────────────────────┘
      ▲ 竖屏 Cocos 客户端（已有壳）：Lobby 常驻 + 一条世界连接；kit 世界引擎（bitECS 实体池 + 插值 + 相机）+ FGUI HUD
```

### 4.3 同步模型：三档可见性 + 兴趣集

| 档 | 内容 | 通道 | 谁决定 |
| --- | --- | --- | --- |
| 全图公开 | 分线元数据（tick / phase / mapId / line / authorityEpoch / 在线数 / 脚本状态 rev） | Colyseus Schema root（全房） | 框架 |
| 视野内 | 名片（名字 / 职业 / 等级 / 外观 / 阵营 / 队友位）+ 位置 + 战斗态 | `perSession` 的 `enter`（完整）/ `update`（变化）/ `leave`（id）+ 同 tick 有序事件，**单 seq 流** | 候选来自网格（kit），授权由 kit 可见性规则（隐身 / 阵营 / 位面）决定，投递由框架 |
| 本人私有 | 背包 / 冷却 / 任务 / 回执 / 脚本 prompt | `perSession` 的 `private` 流 | kit |

- ⛔ 名册不进 Schema：客户端不能枚举视野外玩家的身份（mmo1 §4.2）。
- baseline（进房 / 重连 / 兴趣集突变）复用 snake 的分块 + checksum + per-session cursor，但只含兴趣集。
- 带外静态层：地形 / 碰撞 / 刷新点 / 传送点 / 区域 = 内容包 + 客户端资源，双端同源生成，不走实时同步。
- 载体：首版 per-session 统一**消息级 delta**（token / validator / checksum / cursor 治理现成）；StateView 只作 MF1 对照实验。

### 4.4 数据真源

| 数据 | 权威 | 写入要求 |
| --- | --- | --- |
| 账号身份 | 外部 WebPlatform 契约 | ⛔ 不访问其业务源码与数据库 |
| 钱包 / 流水 | 框架主账（owner scope） | 显式 `AssetOwner`；只经事务内 debit / credit |
| persona 身份 / 控制权 / 分线登记 / 交接 | 框架 `persona` / `world_instance` / `world_transfer` + Redis 租约 | 持久 CAS + 单调 epoch |
| 在线状态 | `kPresence`（TTL 提示） | ⛔ 不是投递权威；投递不查 presence |
| 队伍 / 频道 | 框架 party Redis 键 + 档字段 `partyId`；频道无 history | Lua CAS；事件 seq + 唤醒 + 自愈 |
| 角色内容 / 物品 / 回执 / 检查点 / 世界事件 | `k_mmo_*` per-zone | 版本 + 归属 + epoch 校验；回执表幂等 |
| 移动 / 即时战斗 / NPC 活动态 | 当前 WorldRuntime 内存 | 检查点 + durable 事件；⛔ 不逐 tick 写 SQL |
| AOI 索引 / 分线路由 / 余额缓存 | 可重建 | 从权威恢复，⛔ 不成第二真源 |

### 4.5 WorldRoom 生命周期与 WorldMode 钩子（Nakama 钩子形 × AC Map 实）

| 阶段 | 语义 |
| --- | --- |
| Recovering | 取权威租约（`acquireAuthority` → `authorityEpoch+1`）→ 装载内容包 → `loadInstance` 检查点 → 重放 offset 之后的世界事件 → `onRestore` → 开放准入 |
| Active | 固定步推进；准入校验 persona 控制权 + 凭据；周期检查点；空实例按 manifest 策略 run / sleep / unload |
| Draining | 停收准入；在途交接完成；强制检查点；会话按规则离线 |
| Offline | 释放租约、销毁 |

```text
onWorldInit(ctx, { mapId, line, instanceId, recovered })   ← matchInit / Map 装载
onRestore(ctx, snapshot)                                    ← 分线级检查点回灌
onAdmit(ctx, { client, personaId, controlEpoch, ticket })   ← matchJoinAttempt（同步、无副作用；异步预热 onBeforeAdmit）
onEnter / onLeave(ctx, session)                             ← matchJoin / matchLeave
onStep(ctx, { tick, commands })                             ← matchLoop：本 tick 已过 dispatcher 闸的有序命令
onCheckpoint(ctx) → { persona[], instance }                 ← 周期 / 强制存档点
onDrain(ctx, { reason, graceMs })                           ← matchTerminate
onSignal(ctx, { kind, payload })                            ← matchSignal：交接 prepare / GM / 关图
primaryEntityOf(sessionId) → entityId | null                ← 附近聊天 / 兴趣集锚点
```

⛔ 不继承 `GameMode`；`commands` / `sendS2C` / `random` 等接缝抽成两者共用的 `rooms/core/`（MF3）。

### 4.6 运行时不变量

1. 单主：每个 WorldAddress 同时只有一个可提交的模拟 owner；每个 persona 同时只有一个有效控制。旧 epoch 的延迟提交被**存储边界**拒绝（`withWorldTx` 首句 CAS），只在内存比 epoch 不够。
2. 迁图是可恢复事务：`Requested → Prepared → Committed → Activated → Finalized`（+ Cancelled），`transferId` 全程不变且幂等；Committed 前可取消，之后 ⛔ 不回源；超时查持久状态再决策。
3. 持久与高频分离：已确认资产 0 回退、重放不重复发奖；热状态按 §7.3 回退窗口逐类冻结；⛔ 不承诺「任意崩溃零丢失」。
4. 可见性是服务端计算：不可见的私有数据不出站；空间网格只产生候选。
5. 模拟与传输分离：WorldRuntime 不持 client 引用、不 import `colyseus`（机检）；AI 意图与真人走同一命令通道；全部规则可无头重放。
6. 移动：客户端只发意图（方向 / 目标点），坐标由服务端按常量速度积分；⛔ 客户端不上报坐标。

## 5. 框架阶段 MF0–MF11

### 5.1 编号、单向门与夹具规则

| 项 | 结论 |
| --- | --- |
| 编号 | `MF`（MMO-Framework）；⛔ 不复用 chatgpt 的 `F`（内容不一一对应）、KIT.md 的 `K`、SERVER.md 的 `M` |
| 单向门 ① | MF2：`schema.sql` 资产主体主键迁移 |
| 单向门 ② | MF3：GameRoom 共享层抽取的 writer 切换（抽取与消费同一提交，⛔ 无双份中间态） |
| 单向门 ③ | MF4：世界协议身份 `WORLD_ROOM_PROTOCOL_VERSION = 1`（Non-intrusive §4.8 拆分先例；⛔ 不 bump `GAME_ROOM_PROTOCOL_VERSION`）；世界 join 信封字段（`personaId` / `ticket` / `line` / `resumeSeq`）**一次定型** |
| 部署门 | MF10 生产启用 RedisDriver / Presence 后回退需 drain 全部世界房 |
| 门的互斥 | ① → ② → ③ 串行；① 完成并 drain pending outbox 后才进 ②；② 回归绿后才进 ③ |
| 夹具 | 框架段只用中性夹具：`worldFixture`（入库的框架 world mode，`wireExposed:false`，同 `privateFixture` 先例）、`kitfix`（临时根物化的夹具 kit）、`kitfixContent`（临时根物化的夹具插件）、`aoiProbeFixture`（MF1 对照实验）、`world-bench` 剧本。⛔ 框架段任何提交不得出现 `apps/kits/mmo/`、`k_mmo_*`、`mmo` 域名 |
| 共同动线 | codegen `--write` / `--check` 分离 → `sync:shared` → 协议真源变动时 `node scripts/protocol-fingerprint.mjs --write` → `scripts/protected-paths.json` 同批登记 → `verify:all` → 涉 Redis / MySQL 的段跑 `test:int`、故障段进 `scripts/fault-matrix.config.json` → 状态只向本文 §12 回写 |
| 验收纪律 | 机检项必须给变异验证（改哪一行 → 哪条用例转红）；给不出的移入人工证据（Non-intrusive §10）；`test:changed` ⛔ 不作无侵入证明 |

### 5.2 依赖图

```text
MF0 KIT K1 前置 ─┐（与 MF1 可并行）
MF1 审阅 + 基准台 + AOI 载体实验 ┤  ⛔ MF2 起任何编码不得早于 MF1 退出
                                ▼
MF2 persona / 资产主体（门①）→ MF3 共享层抽取（门②）→ MF4 WorldRoom / WorldRuntime / 租约 / 控制权（门③）
        │                                                      ├→ MF5 观察者同步 ──→ MF6b 附近聊天
        └→ MF6a presence / 投递总线 / party / 世界频道（只依赖 Lobby + 流，可并行）      │
                                                               └→ MF7 检查点 / 世界事件 / worker ──→ MF8 交接与凭据（用 MF6a 的流做跨房唤醒）
MF9 贡献点 / fragment / 带参 launch：只依赖 codegen，可自 MF1 后并行；MF11 前必须完成
MF10 容量 / 多进程 / 运维（依赖 MF4–MF8）→ MF11 收口审阅与冻结
```

重排说明：交接（MF8）排在检查点（MF7）之后——Committed 步骤要调用强制检查点，`sourceReleased` 只有在 persona 状态已耐久后才安全（claude W4→W5 / kimi E5→E6 反转）。

### 5.3 阶段总表

| 阶段 | 交付要点 | 退出条件要点（机检） | 回退 | 依赖 | 借鉴 |
| --- | --- | --- | --- | --- | --- |
| **MF0** KIT K1 前置 | 客户端 / shared 侧 kit-api 路径级导入边界；`.conn` 禁令；uninstall 对 pending `kit:<id>:*` outbox 的闸 | 三类反例被拒；arena / arenaShop 回归绿 | 可回退 | 无 | KIT.md §9 K1 |
| **MF1** 开门审阅与基线 | 本文对抗审阅消化；术语 / 引用锁 / 回退窗口表 / 空实例策略表 / kill criterion；`tools/world-bench/`；AOI 载体实验；决策表 §11 待定项拍板 | 审阅发现全消化；基准可重复（偏差 <10%）；载体决定有数字 | 可回退 | 无 | KIT v1→v2 53 条先例；`tools/m0/` |
| **MF2** persona 与资产主体 | 框架 `persona` 表；`AssetOwner` 进钱包 / 流水 / outbox；`withKitTx` 主体化 + `assertControl`；会话撤销覆盖 persona | 两 persona 钱包隔离；旧路径 owner 全 account；旧 epoch 提交被谓词拒；锁序反例被消 | **门①** | MF1 | Nakama storage 所有权；AC auth / characters 分库 |
| **MF3** 共享层抽取 | `rooms/core/{RoomAuth, WireDispatcher, MessageBudget, ReconnectGrace, S2CPorts}`；GameRoom 行为等价改消费 | GameRoom 不再含 auth / dispatcher / 预算实现（符号计数 = 0）；全部房间回归 + 变异测试绿 | **门②** | MF2 完成并 drain | Non-intrusive 阶段 1 |
| **MF4** WorldRoom / WorldRuntime / 租约 / 控制权 | `RoomName.World`、世界信封、`WorldMode` 契约、无头 `WorldRuntime`、`WorldRoom` 壳、Redis 权威租约 + MySQL `world_instance.authority_epoch`、persona 控制 CAS、空实例策略、manifest `kind:"world"` | worldFixture 只新增文件即建房 / 准入 / tick / Draining；WorldRuntime 无连接可跑；双登只一个控制权；租约失效拒输入 | **门③** | MF3 | Nakama match（空 match 继续跑）；AC `MapInstanced` 创建 / 选择 / 加入分步 |
| **MF5** 观察者同步原语 | `InterestSet` / `diffAndEmit` / 只含兴趣集 baseline / `perSession` token / 有界出站队列与重同步；三档数据分级落地 | 超视距互不可见；跨格 enter / leave 各一次；私有字段零泄露；perSession 广播被拒；背压超限重同步 | 可回退 | MF4 | Nakama 子集广播；AC 三态更新块；snake baseline / delta |
| **MF6a** presence / 投递总线 / party / 世界频道 | `kPresence` + `NODE_ID`；`K_STREAM_PUSH` + `pushToUsers` / `pushToRealm`；party 五键 Lua + 域 `party` + push；域 `chat`（realm / party）+ push `chat.message` | 两节点各只送本节点在线；跨区隔离；seq 空洞自愈；并发入队不超员 | 可回退 | MF2 | Nakama presence / party / chat；本仓 mailwake / kick / guild events |
| **MF6b** 附近聊天 | core 世界 token `c2s/s2c.world.chat`（perSession）；`WorldMode.primaryEntityOf` | 只到兴趣集含说话者的会话；`broadcastS2C` 被拒 | 可回退 | MF5 | AC 视野即听域 |
| **MF7** 检查点 / 世界事件 / kit worker | `CheckpointPort`（persona 级 + 分线级）；`withWorldTx`（authority_epoch CAS 首句）；`WorldEventPort`；`kit.json.workers[]` → bootstrap 预置 lease → worker 入口；uninstall 闸扩展 | 杀房重启：位置回退 ≤ 1 周期、货币 / 装备 0 回退；崩溃后事件不重复发奖；旧 owner 写被存储边界拒；未登记 worker 不起 | 可回退（排空 pending） | MF4 | AC `PlayerSave` 周期 + 强制点；本仓 outbox / `singleton_lease` 守卫首句 |
| **MF8** 交接与一次性凭据 | 框架 `world_transfer` 表 + 状态机 + 持久 CAS；`WorldTicket`（复用 `kRoomTicket` 形态）；准入固定时序；域 `world.enter` / `world.resolveTransfer`；客户端 `transfer` strategy；跨房唤醒经 `K_STREAM_PUSH kind=room`（best-effort） | 四注入下只激活一次、只扣一次费；旧房迟到写被拒；预留到期释放；凭据一次性 | 需清理在途 transfer | MF6a、MF7 | AC `TeleportTo` 三段式；本仓 access ticket 固定时序 |
| **MF9** 贡献点 / fragment / 带参 launch | `kit.json.contributions`（kind data \| module）+ `plugin.json.contributes` + 三端 `contributions.generated.ts`；kit state / wire fragment 泛化；`launch.payload` → `validateLaunch`（EXTRAS X1） | 夹具插件只新增一个文件即被收录；越界贡献 pack 拒；kit 删 id 反向闸点名；未知 launch 字段被拒 | 可回退 | codegen（可并行） | AC `modules/` 随包内容；Nakama `InitModule`；本仓 `requires.kits` 闸 |
| **MF10** 容量 / 多进程 / 运维 | 分线分配与上限；RedisDriver / Presence 启用路径（独立实例断言）；`selectProcessIdToCreateRoom` 放置钩子；非生产运维面；多进程接管**实验报告** | 单进程分线用例绿；独立 Redis 断言；运维面读出积压；多进程报告存在（⛔ 非首版闸） | 可回退（生产启用为部署门） | MF4–MF8 | 本仓 `colyseus-redis-probe.ts` |
| **MF11** 收口审阅与冻结 | 三视角对抗审阅；协议指纹重钉；protected-paths / inventory / 文档回写；「框架侧完成」夹具矩阵 | 审阅发现清零；矩阵：worldFixture + kitfix + kitfixContent 在临时根只新增文件通过全部 check | 可回退 | MF0–MF10 | KIT v2 审阅；Non-intrusive §10.7 夹具矩阵 |

### 5.4 各阶段细表

#### MF0 · KIT K1 前置

| 修改面 | 内容 |
| --- | --- |
| `apps/client/test/kitImportBoundary.test.ts`（新） | 客户端路径级闸（先例 `serverImportBan.test.ts`）：`apps/client/src/plugins/<id>/**` 解析后只允许 `apps/client/src/kits/<kit>/api/**`（kit ∈ 该插件 `requires.kits`）、自身目录、框架 plugin-api 门面 |
| `apps/server/test/kit-import-boundary.test.ts`（扩） | shared 侧规则；`.conn` 禁令（AST 级，⛔ 裸正则） |
| `apps/server/tools/plugin/uninstall.ts`、`check.ts` | uninstall 前置：`gameplay_outbox` 中 `status=0` 且 kind 属本 kit 的行 > 0 即拒（fail-closed；`--allow-pending-outbox` 仅非生产）；连不上库即拒并点名 |

退出条件：三类反例夹具各有红用例；`plugin -- test arena` / `arenaShop` 与 `verify:all` 绿。
变异验证：删 judge 里的 `.conn` 分支 → `.conn` 反例转红；uninstall 的 pending 计数改常量 0 → 「带 pending 卸载被拒」转红。回滚：可回退。

#### MF1 · 开门审阅、基准台、AOI 载体实验

| 修改面 | 内容 |
| --- | --- |
| 本文 | 审阅记录（接缝 / 数据 / 负载三视角逐条处置）；引用锁；**回退窗口表**（§7.3）与**空实例策略表**（`run` / `sleep(afterMs)` / `unload(afterMs)`）冻结；kill criterion 数字；框架待修改路径清单 |
| `apps/server/tools/world-bench/`（新） | 证据生成器（⛔ 不进 `verify:core`，同 `tools/m0/`）：N 机器人 × M 脚本实体固定剧本，记录 tick p95 / p99、每会话出站字节、baseline 体积、内存；先对 snake 房出「当前基线」；输出 `docs/perf/world-bench/<date>.json` |
| `apps/shared/schema/gameplays/aoiProbeFixture/` + wire + `rooms/modes/aoiProbeFixture/` | GameRoom 上的对照夹具（`wireExposed:false`）：变体 A = StateView（⚠ 客户端 bundle schema 4.0.13 ↔ 服务端 4.0.27 先验兼容；两份手写 `.d.ts` 实验期本地增补，⛔ 不入库）；变体 B = perSession 消息 delta。比较编码 CPU、字节、重连基线重建、生成器改动面 |

退出条件：审阅发现全部处置并计数；基准同剧本两次主要指标偏差 <10%；AOI 载体有实验数字与决定（缺省消息级）；回退窗口与空实例策略冻结；kill criterion 写成数字（候选：单房 100 机器人 + 300 实体，tick p99 < 25 ms，每会话出站 < snake 现值；先测再定）。
变异验证：基准剧本种子改一位 → 结果文件 diff 非空；aoiProbeFixture 把「私有字段」放进公共块 → 零泄露断言转红。回滚：可回退。

#### MF2 · persona 与资产主体（门①）

| 修改面 | 内容 |
| --- | --- |
| `apps/server/sql/schema.sql` | 新表 `persona`（per-zone）：`(server_id, persona_id) PK`、`user_id`、`kit_id`、`slot`、`status`、`control_epoch`、`world_address NULL`、`session_generation`、时间戳；`UNIQUE(server_id, user_id, kit_id, slot)`。`user_currency` PK → `(user_id, server_id, owner_kind, owner_id, currency)`；`currency_ledger.uk_idem` 与 `gameplay_outbox` 加 `owner_kind TINYINT DEFAULT 0` / `owner_id VARCHAR(64) DEFAULT ''`（0 = account，存量无损） |
| `apps/server/tools/db-bootstrap.ts` | TS 迁移步（INFORMATION_SCHEMA 守卫先例）在 `singleton_lease('db_bootstrap')` 下一次性完成；已迁移即跳过 |
| `core/infra/zoneTables.ts` | `FRAMEWORK_PER_ZONE_TABLES += persona` |
| `core/economy/{currency,outbox,relayer}.ts` | `debitInTx` / `creditInTx` 加 `owner`（缺省 account）；intent 带 owner；relayer 对 persona 主体只落账本 |
| `core/infra/kitApi.ts` | `KitTx.debit/credit` 可选 `owner`；`tx.assertControl(personaId, controlEpoch)`（`UPDATE persona … WHERE control_epoch=?`，Rows matched 判定）；固定锁序：account uid → persona id 升序 |
| `core/infra/keys.ts` | `kCacheCurrency` 带 owner scope |
| `apps/shared/src/protocol/identity.ts`（新） | `AssetOwnerRef` / `PersonaRef` 类型与零依赖校验器 |
| `core/auth/{session,kickBus}.ts` | 撤销 / 踢下线抬高该 uid 全部 persona 的 `session_generation` |

退出条件：`test:int` 同账号两 persona 钱包 / 流水互不可见；shop / mail / redeem / arena / arenaShop / snake 回归绿且新 ledger 行 `owner_kind=0`；旧 `control_epoch` 提交 0 行；乱序锁反例被消；freeze / thaw 证明 persona 表不参与冷档。
变异验证：删 `assertControl` 的 `control_epoch=?` 谓词 → 「旧 epoch 延迟提交」转红；owner 缺省改 persona → arenaShop 回归转红；交换锁序 → 死锁用例转红。
回滚：**单向门**——发布前 drain 全部 pending outbox；回退需再迁一次。

#### MF3 · 共享层抽取（门②）

| 修改面 | 内容 |
| --- | --- |
| `apps/server/src/rooms/core/RoomAuth.ts`（新） | 自 `GameRoom.onAuth` 抽出：join options 校验 → 房型协议整数比对（注入常量）→ mode / modeVersion / profile → 区号复核 → token → session verify |
| `rooms/core/WireDispatcher.ts`（新） | 固定序：预算 → owner → exact validate → rateCost → phase（谓词注入）→ handler；catch-all `messages["_"]` 形态不变 |
| `rooms/core/{MessageBudget,ReconnectGrace,S2CPorts}.ts`（新） | 预算；重连宽限与 generation fence；`sendS2C` / `broadcastS2C` 的 token dir / owner / validate 闸 |
| `rooms/GameRoom.ts` | 同一提交改为消费者；对局语义留原处 |
| `scripts/protected-paths.json` | gameplayFlow 加 `apps/server/src/rooms/core/**`；Non-intrusive §12.2 散文视图同批 |
| 测试 | 既有 dispatch / wire-contract / version-matrix / snake-room / private-room / drop-in / arena / fault-mutation 零改动全绿；新增 `rooms-core-import-ban.test.ts`（`rooms/core/**` ⛔ import `modes/`、`websocket/`） |

退出条件（可数，⛔ 不用行数）：`GameRoom.ts` 中 `verifyAndCacheWebPlatformSession`、`validateC2SPayload`、`messageBudget` 出现次数 = 0；全仓三者实现各一处；`GAME_ROOM_PROTOCOL_VERSION` 在 GameRoom.ts 出现 0 次（注入 RoomAuth）。
变异验证：owner 闸挪到 exact validate 之后 → snake owner 隔离用例转红；删 RoomAuth 版本比对 → `protocol-version-matrix` 转红；删重连 generation 比对 → 迟到重连用例转红。
回滚：**单向门**——抽取与消费切换同一提交；中止整批 revert。

#### MF4 · WorldRoom / WorldRuntime / 权威租约 / 控制权（门③）

| 修改面 | 内容 |
| --- | --- |
| `apps/shared/src/protocol/rooms.ts` | `RoomName.World`；`IWorldRoomJoinOptions { v, token, sId, mode, modeVersion, mapId, line?, personaId, ticket, resumeSeq? }`（一次定型）；`WORLD_ROOM_PROTOCOL_VERSION = 1`；`WorldPhase = Recovering \| Active \| Draining \| Offline` |
| `apps/shared/src/constants/errors.ts` | `WorldNotAuthoritative`、`ControlConflict`、`WorldTicketInvalid`、`WorldDraining` |
| `tools/gameplay-codegen/{gameplay-schema-v1.json,lib.ts}` | manifest 可选 `kind: "match" \| "world"`（缺省 match）；`world: { emptyPolicy, emptyAfterMs, checkpointMs }`；**world 根必填集 `{tick, phase:WorldPhase, instanceId, mapId, line, authorityEpoch}`，⛔ 禁止 `players` map**；生成 `WORLD_MODE_IDS`，world mode 登进 `worldModeRegistry` |
| `rooms/WorldMode.ts`（新） | §4.5 契约（⛔ 不继承 `GameMode`） |
| `rooms/core/WorldRuntime.ts`（新） | 无头模拟宿主：注入时钟、固定步累积 + catch-up 上限（自 `GameRoom.stepFixed` / `update` 抽出）、命令队列、生命周期状态机；⛔ 不 import `colyseus`（机检） |
| `rooms/WorldRoom.ts`（新） | 传输壳：`autoDispose=false`；`onAuth` → RoomAuth（比 `WORLD_ROOM_PROTOCOL_VERSION`）；准入：ticket 占位 → 控制 CAS → `onAdmit`；会话表（容量按会话表，不按 state）；喂 C2S 进 WorldRuntime、按 tick 排空出站；租约失效 → Draining |
| `rooms/core/WorldProfile.ts`（新） | profile `"world"`：AccessPolicy `world-ticket`，无 StartPolicy（⛔ 不往 `StartPolicy` 加 always-on 变体）；`assertRoomProfilesConfigured` 跳过 `kind:"world"`；与 evidence / invite-code 互斥 |
| `rooms/core/WorldLease.ts`、`core/infra/{keys,redisScripts,config}.ts` | Redis 权威租约：`kWorldFence(sId, instanceId)` INCR 发号 + `kWorldLease` `SET NX PX WORLD_LEASE_TTL_MS`；续租 `CAS_RENEW` Lua（`renew*3 ≤ ttl` 加载期断言）；丢租 → Draining；⛔ 不逐 tick 碰 MySQL |
| `schema.sql`（只新增表） | `world_instance`（per-zone）：`(server_id, instance_id) PK`、`map_id`、`line`、`authority_epoch`、`holder`、`state`、`checkpoint_rev`、`updated_at`；`UNIQUE(server_id, map_id, line)`；`zoneTables.ts` 登记 |
| `rooms/core/control.ts`（新） | `acquireAuthority(instance) → epoch`（MySQL CAS `authority_epoch+1`）；`acquireControl(persona, worldAddress) → controlEpoch`、`releaseControl`、`assertControl` |
| `rooms/core/WorldDirectory.ts`（新） | `(sId, mapId, line) → instance` 查找 / 建行；v1 进程内 + MySQL 行 |
| `app.config.ts` | `[RoomName.World]: defineRoom(WorldRoom).filterBy(["sId","mode","profile","mapId","line"])` |
| 客户端 `net/rooms/WorldRoomTransport.ts`（新）、`matchmaking.ts` | strategy `{kind:"world", mapId, line?}`；`RoomClient.ts` / `GameRoomTransport.ts` 零改动 |
| 夹具 `worldFixture` | `kind:"world"`、`profiles:["world"]`；wire `c2s.worldFixture.move {dirX,dirY,seq}`（意图；连续坐标、服务端常量速度积分）；两类实体（移动体 / 静态体），无内容 |
| 测试 | `world-runtime.test.ts`（假时钟、catch-up、Draining 拒新命令）、`world-room.test.ts`、`world-empty-policy.test.ts`、`rooms-core-headless-import.test.ts`；`test:int`：`world-lease.test.ts`（丢租 → Draining；同实例两房争抢只一个 Active）、`world-control.test.ts`（同 persona 两处 join 只一个控制权） |

退出条件：worldFixture 在干净树只新增文件即建房 / 准入 / 推进 / Draining；WorldRuntime 在无 Colyseus 进程内跑完剧本；双登只一个控制权；租约失效拒输入并 Draining；空实例三策略各一用例；`GAME_ROOM_PROTOCOL_VERSION` / `LOBBY_PROTOCOL_VERSION` 不变，`WORLD_ROOM_PROTOCOL_VERSION=1` 进版本矩阵。
变异验证：删 `acquireControl` 的 CAS 谓词 → 双登转红；续租改永不过期 → 「丢租 Draining」转红；`emptyAfterMs` 被忽略 → unload 转红；WorldRuntime 加 `import "colyseus"` → 无头导入闸转红；world 根加 `players` map → codegen 反例转红。
回滚：**单向门③**；代码在首个客户端发版前可 revert；`world_instance` 表回退需清空。

#### MF5 · 观察者同步原语

| 修改面 | 内容 |
| --- | --- |
| `rooms/core/{InterestSet,ObserverSync,Baseline,OutboundQueue}.ts`（新） | 会话 → 实体集合；`diffAndEmit(session, prev, next)`；只含兴趣集的 baseline（分块 / checksum / cursor 自 `modes/snake/index.ts` 泛化，token 由 mode 注入）；每会话有界队列、按 key 合并（位置）与不可丢（回执）两类策略、超限重同步 |
| `apps/shared/src/gameplays/defineGameplayWire.ts`、`tools/gameplay-codegen/{wireParser,lib}.ts` | `defineS2C(name, validate, { perSession: true, coalesceKey? })` → 生成 `GAME_WIRE_PER_SESSION` |
| `rooms/core/S2CPorts.ts` | `broadcastS2C` 对 perSession token fail-closed（启动期 + 发送期） |
| `rooms/WorldRoom.ts` | 每 tick 排空出站；重连 / 兴趣集突变触发 baseline |
| 客户端 `WorldRoomTransport.ts` | enter / update / leave 与 baseline reconcile 端口 |
| 夹具 | worldFixture wire 加 `s2c.worldFixture.{enter,update,leave,private,baselineBegin,baselineChunk,baselineEnd}`（perSession）；实体带一个「私有字段」 |
| 测试 | `observer-sync.test.ts`、`outbound-queue.test.ts`、`world-visibility-leak.test.ts`、`world-bench` 场景「视野缩小 → 每会话字节下降」 |

退出条件：超视距两会话互不收到；跨格 enter / leave 各一次且顺序正确；重连 baseline 只含兴趣集且 checksum 通过；perSession 全房广播被拒；私有字段对他人零泄露；慢会话超限重同步且回执不丢。
变异验证：删 leave 分支 → 跨格离开转红；删 perSession 闸 → 广播被拒转红；私有字段塞进 enter → 零泄露转红；删队列上界 → 背压转红。回滚：可回退。

#### MF6a / MF6b · 社交原语

细则见 §6；落点 `core/{presence,push,party,chat}/`、`websocket/{fanout,party,chat}/`、`apps/shared/src/protocol/lobbyRpc/domains/{party,chat}.ts`。
退出条件与变异验证见 §6.6。回滚：可回退（键带 TTL；流按 MINID 裁）。

#### MF7 · 检查点 / 世界事件 outbox / kit worker

| 修改面 | 内容 |
| --- | --- |
| `rooms/core/CheckpointPort.ts`（新） | `savePersona / loadPersona`、`saveInstance / loadInstance`；信封 `{ rev, eventOffset, authorityEpoch, controlEpoch?, schemaVersion, stateHash, snapshot }`；快照内容由 kit 定义，框架只校验信封与版本（不兼容 fail-closed 拒启） |
| `rooms/core/WorldTx.ts`（新） | `withWorldTx(kitId, sId, { instanceId, authorityEpoch, personas?: [{id, controlEpoch}] }, fn)`：RC 事务**首句** `UPDATE world_instance SET checkpoint_rev=… WHERE instance_id=? AND authority_epoch=?`（0 行抛 `AuthorityLostError` 自动 ROLLBACK），再逐 persona `assertControl`；暴露 `KitTx` 门面 + `appendWorldEvent`——「存储边界拒旧 epoch」的唯一实现点 |
| `rooms/core/WorldEventPort.ts`（新） | 事件表形态由框架固定（`event_id`、`instance_id`、`seq`、`kind`、`payload`、`status 0/1/2`、`attempts`），kit 选表名并在 `kit.json.sql.tables[].role:"world-event"` 声明；至少一次 + 回执去重；死信同 outbox 口径 |
| `WorldRuntime.ts`、`WorldRoom.ts` | 周期 `onCheckpoint`（manifest `checkpointMs`）+ 强制点（drain / leave / 交接）；Recovering 顺序见 §4.5 |
| `tools/plugin/kit-schema-v1.json`、`kits/catalogTypes.ts`、`tools/db-bootstrap.ts` | `workers[]: { id, entry }`；bootstrap 预置 `singleton_lease` 行 `kit:<id>:<worker>`（ODKU no-op） |
| `apps/server/src/workers/kitWorker.ts`（新） | `npm --workspace @game/server run worker -- <kit>:<worker>`：按登记加载、`tryAcquireLease` / `withLeaseTx` 串行 pass（relayer 形态）；未登记即拒 |
| `tools/plugin/uninstall.ts` | `role:"world-event"` 表 `status=0` > 0 或 `world_transfer` 有该 kit 在途行 → 拒 |
| 夹具 `kitfix` | `k_kitfix_checkpoint`、`k_kitfix_world_event`（role 声明）、`workers:[…]`；worldFixture 实现 `CheckpointPort` 走 kitfix 表 |
| 测试 | `world-checkpoint.test.ts`；`test:int/world-crash-restart.test.ts`（同进程两房 A / B，硬杀 A = 停续租 + 跳过 drain；A′ 从检查点恢复；位置回退 ≤ 1 周期、货币 0 回退、A 的迟到 `withWorldTx` 0 行）；`world-event-dedup.test.ts`；`kit-workers.test.ts` |

退出条件：上述断言 + 未登记 worker 不起 + 有 pending 事件时 uninstall 拒；§7.3 回退窗口表逐行有用例。
变异验证：删检查点 `eventOffset` 关联 → 重启重复发奖转红；删 `withWorldTx` 首句 CAS → 旧 owner 写成功转红；worker 跳过登记检查 → 「未登记不起」转红。回滚：可回退（先排空 pending 事件）。

#### MF8 · 交接与一次性凭据

| 修改面 | 内容 |
| --- | --- |
| `schema.sql`（只新增表） | `world_transfer`（per-zone）：`(server_id, transfer_id) PK`、`persona_id`、`from_instance`、`to_map`、`to_line`、`to_instance`、`state`（Requested / Prepared / Committed / Activated / Finalized / Cancelled）、`control_epoch`、`ticket_sha256`、`reserve_expires_at`、`payload JSON`；`UNIQUE(server_id, persona_id, active_key)`（终态置 NULL ⇒ 一 persona 只一在途）。**框架自有表，⛔ 不依赖 kit 表** |
| `rooms/core/transfer.ts`（新） | 每步持久 CAS 推进；`transferId` 幂等重放同一结果；Committed 前可取消并释放预留；Committed 后 ⛔ 不回源；超时查持久状态；跨房唤醒经 `K_STREAM_PUSH kind=room`（best-effort，权威仍是表） |
| `rooms/core/WorldTicket.ts`、`keys.ts` | 复用 `kRoomTicket` 形态：一次性、短时、绑定 `(uid, personaId, worldAddress, controlEpoch)`；claim 为 Lua CAS；首次进世界与交接同一路径 |
| `rooms/WorldRoom.ts` | 准入固定时序（SERVER.md §5 邀请码同形）：同步公共拒绝 → 同步占位 → 异步 claim → 同步重验 → `acquireControl` → `onAdmit`；源房 Committed 后冻结该 persona 意图并回收实体 |
| `apps/shared/src/protocol/lobbyRpc/domains/world.ts`（新）、`websocket/world/` | 框架域 `world.enter { personaId, mapId } → { worldAddress, ticket }`；`world.resolveTransfer { transferId }` |
| 客户端 `matchmaking.ts`、`WorldRoomTransport.ts` | strategy `{kind:"transfer", roomId?, ticket}`；退源房 → 带凭据 join → 收 baseline → 恢复输入 |
| 夹具 | worldFixture 两实例（map A / B）+ `c2s.worldFixture.portal` |
| 测试 | `world-transfer.test.ts`（注入点 `transfer-source-crash / -target-crash / -reply-lost / -client-drop` 进 `fault-matrix.config.json`）；`test:int/world-transfer.test.ts`；`world-ticket.test.ts` |

退出条件：四注入下只激活一次、只扣一次费；旧房迟到写被 MF7 存储边界拒；预留随 `transferId` 到期释放；凭据二次使用被拒；重连凭 `transferId` 解析目标。
变异验证：删 Committed 后拒旧 epoch 谓词 → 双激活转红；允许凭据重放 → 转红；删预留 TTL → 泄漏转红。回滚：需数据清理——收敛全部在途 transfer。

#### MF9 · 贡献点 / fragment / 带参 launch（可并行）

| 修改面 | 内容 |
| --- | --- |
| `tools/plugin/{kit-schema-v1,plugin-schema-v2}.json` | `contributions: { <id>: { kind: "data" \| "module", end(s), export \| schema } }`；`fragments: [<name>]`；`contributes: { <kitId>: { <id>: <路径> } }`（v2 增量可选，⛔ 不 bump schemaVersion；路径必须 ⊆ 插件所有权集）；`launch.payload` / `launch.profile`（EXTRAS X1） |
| `tools/plugin-codegen/lib.ts`、`tools/plugin/{install,check,uninstall,pack}.ts` | 生成 `apps/{server,client,shared}/src/kits/<kitId>/contributions.generated.ts`（模块 = 静态字面量 import；data = 校验后同源生成到两端）；越界贡献 pack 拒；正向闸（kit 已装且 id 存在）/ 反向闸（kit 删 id 点名插件） |
| `tools/gameplay-codegen/lib.ts` | kit fragment：`apps/kits/<id>/fragments/<name>.state.json`，mode `fragments:["<kit>:<name>"]` 合并（泛化 ownerReady / inviteRoom） |
| `scripts/protected-paths.json` | `generatedWriterOwned` 加 contributions.generated |
| `apps/client/src/app/AppRuntime.ts`（受保护，显式框架侵入）、`gameplay/services.ts` | `LaunchPort.launch(target)` 透传 payload → `GameplayModule.validateLaunch(payload)` exact 校验 |
| 夹具 | `kitfix.contributions.content`、`kitfixContent.contributes.kitfix.content`（临时根） |

退出条件：夹具插件只新增一个文件即被收录；越界贡献 pack 拒；kit 删 id 反向闸点名；未知 launch 字段被拒；fragment 合并后 state 生成物各恰一次。
变异验证：codegen 跳过 `contributes` 所有权检查 → 越界被拒转红；fragment 合并跳过 → state 用例转红；`validateLaunch` 放行未知键 → 转红。回滚：可回退。

#### MF10 · 容量 / 多进程 / 运维

| 修改面 | 内容 |
| --- | --- |
| `rooms/core/WorldDirectory.ts`、`config.ts` | 分线分配：`(sId, mapId)` 满员开新 `line`；指定 `line`；`WORLD_MAX_LINES_PER_MAP` |
| `app.config.ts`、`config.ts` | `WORLD_MULTI_PROCESS=1` 启用 RedisDriver / Presence；`REDIS_COLYSEUS_URL` 必须 ≠ durable / coord（加载期断言）；`selectProcessIdToCreateRoom` 放置钩子 |
| `apps/server/src/http/`（非生产挂载） | 世界房 / 分线 / 在途交接 / 事件积压只读面 |
| `tools/world-bench/multi-process.ts` | 两进程剧本（`colyseus-redis-probe.ts` 形态）：节点退出 → 租约过期 → 新节点 Recovering 接管；**输出实验报告**（⛔ 非首版闸） |

退出条件（首版闸）：单进程分线用例绿；独立 Redis 断言红 / 绿；运维面读出积压；多进程报告存在并登记偏差。
变异验证：`WORLD_MAX_LINES_PER_MAP` 被忽略 → 上限转红；断言允许同 URL → 转红；（实验）租约 TTL 不过期 → 接管报告失败。回滚：可回退；生产启用为部署门。

#### MF11 · 收口审阅与冻结

交付：三视角对抗审阅并消化；`protocol-fingerprint --write` 重钉；`docs/inventory.json`、OVERVIEW / SERVER / CLIENT / KIT / PLUGIN、`protected-paths.json` 与 Non-intrusive §11.3 / §12.2 散文视图同批；`aoiProbeFixture` 删除或转基准夹具；本文 §12 逐段登记。
「框架侧完成」矩阵（临时根，`scripts/lib/fixture-checkout.mjs` 先例）：记录保护文件 hash → 加入 worldFixture + kitfix + kitfixContent → 先证全部 `--check` 红 → writer / sync → 全绿 → 分类器断言人工文件只出现夹具自有 `A`、既有 `M` 只命中 provenance 白名单 → 第二次 writer 字节不变。
变异验证：向 `GameRoom.ts` 注入一行手改 → 矩阵分类器转红。回滚：可回退。

### 5.5 夹具清单

| 夹具 | 落点 | 引入 | 入库？ |
| --- | --- | --- | --- |
| `aoiProbeFixture` | `apps/shared/schema/gameplays/aoiProbeFixture/` + wire + `rooms/modes/aoiProbeFixture/` | MF1 | 入库，MF11 处置 |
| `worldFixture` | `apps/shared/schema/gameplays/worldFixture/` + `apps/shared/src/gameplays/worldFixture/wire.ts` + `rooms/modes/worldFixture/` + `apps/client/src/gameplay/modes/worldFixture/` | MF4（MF5 / 6b / 7 / 8 逐步加 token） | 入库（同 privateFixture） |
| `kitfix` | 临时根 `apps/kits/kitfix/`（sql / workers / contributions / fragments） | MF0、MF7、MF9 | 测试物化 |
| `kitfixContent` | 临时根 `apps/plugins/kitfixContent/` | MF0、MF9、MF11 | 测试物化 |
| `world-bench` 剧本 | `apps/server/tools/world-bench/scenarios/` | MF1 起 | 入库（证据生成器） |

kit 段开工条件：MF0–MF8 退出 + MF9 退出；MF10 / MF11 可与 MK0 并行，但 MK 验收前须 MF11 退出。

## 6. 社交原语：presence / party / channel（框架原语，kit 只封装）

### 6.1 边界一览

| 原语 | 权威 | 传输 | 落点 | 首版消费方 |
| --- | --- | --- | --- | --- |
| presence | `kPresence(uid, sId)`（TTL 提示，⛔ 非投递权威） | 查询面 | `core/presence/` | `party.get` 的在线 / 地图标记；kit 队友标记 |
| 投递总线 | 各节点本地在线表（`websocket/push.ts`） | coord Redis `K_STREAM_PUSH`，每节点独立游标 | `core/push/pushBus.ts` + `websocket/push.ts` | party 唤醒、世界 / 队伍聊天、guild 扇出修复、`ServerNotice` |
| party | per-zone durable `party:*:{p<pid>}` + 档字段 `partyId` | 域 `party` + push `party.event` / `party.invited` | `core/party/` + `websocket/party/` | mmo kit；snake 私房整队入座 |
| channel | 无（无 history） | realm / party → 总线；nearby → WorldRoom perSession | `core/chat/` + `websocket/chat/`；nearby 在 `rooms/core/` | mmo kit；`ServerNotice` 全区公告 |

### 6.2 presence

| 项 | 决定 |
| --- | --- |
| 键 | `kPresence(uid, sId)` = `${G}presence:{${uid}}:s${sId}`（全局前缀、`sId` 显式；与 `kSess` 同形，读者不在 `zoneCtx` 内）；durable，`clientFor(uid)` |
| 字段 | `lobby`（承载大厅连接的 `NODE_ID`）、`lobbyAt`、`world`（`NODE_ID`）、`mapId` / `instanceId` / `characterId`（字符串，框架不解释）、`worldAt` |
| TTL | `PRESENCE_TTL_S = 90`，心跳 `PRESENCE_HEARTBEAT_S = 30`；崩溃后 ≤ 90 s 自愈；durable noeviction ⇒ 每键必有 TTL |
| 写入 | Lobby onJoin：`registerOnline` 后、seat 公开前写；final onLeave：本节点该 (uid, sId) 无连接时 `PRESENCE_CLEAR_IF_OWNER` Lua（`HGET lobby == NODE_ID` 才 HDEL——顶号跨节点时旧节点 ⛔ 不抹新连接）；WorldRoom admit / leave 同理写 world 字段 |
| `NODE_ID` | 新增 `config.NODE_ID`（缺省 `${hostname}:${PORT}`）；本仓首个需要节点身份的读点 |
| 查询 | `readPresence(uid, sId)`、`readPresenceMany(uids, sId)`（pipeline，≤ `PARTY_MAX_SIZE`）、`isOnline` |
| 刻意不放 | 附近玩家列表（来自兴趣集）；全区在线索引（投递不需要）；好友 / last-seen（插件 `kPluginUser`）；presence 变更事件流（消费方都是拉取）；复用 `kSess.gwNode`（会话 ≠ 连接） |

### 6.3 跨进程投递总线

| 项 | 决定 |
| --- | --- |
| 键 / 实例 | `K_STREAM_PUSH` = `${G}stream:push`，**coord**（同 `stream:kick`：控制 / 扇出语义、组内独占 ⇒ 扇出半径 = 能持有该区连接的节点集、不碰 durable） |
| 消费 | `startStreamConsumer("push", coordClient, K_STREAM_PUSH, onEntry, { trimMs: PUSH_STREAM_TRIM_MS })`，每节点独立 `$` 游标、⛔ 无 group；`XTRIM MINID`，10 min |
| 单一路径 | 发布方 ⛔ 不本地直投，本节点命中也经流回读 ⇒ 无自投重复、单进程测试即覆盖跨进程路径 |
| 条目 | `kind: users \| realm \| guild \| room`；`sId` 必带（消费侧只投 `conn.sId === sId`）；`uids`（≤ 64，超出切多条）；`gid` / `instanceId`；`type ∈ LobbyPushMap`；`data` JSON ≤ 2 KB（consumer 先过 `PUSH_RUNTIME_VALIDATORS[type]` 一次再分发）；`issuedAt`（> 30 s 丢弃，时间栅栏）；`origin`（诊断） |
| 本地落地 | `pushToUsers(uids, type, data, sId)`、`pushToRealm(sId, type, data)`（新增本节点 `realmOnline: Map<sId, Set<uid>>`，与 `guildOnline` 同三处维护；`PUSH_ALL_CHUNK` 分片）、`pushToGuild` 改走 `kind=guild`、`signalRoom(instanceId)`（本进程 WorldRoom 登记表 → `onSignal`）；`setPushLocalHandlers` 在 `index.ts` 注入（core ⛔ 反向依赖 websocket） |
| 可靠性 | best-effort（XADD 失败只记日志）；party 靠 seq 自愈，聊天本就尽力，交接权威在表 |
| 限流 | 总线不限流；限在产生消息的 RPC（§6.5） |

### 6.4 party

| 键（per-zone `P()`，hash-tag `{p<pid>}` 同槽） | 类型 | 内容 | TTL |
| --- | --- | --- | --- |
| `kParty(pid)` = `party:{p<pid>}` | HASH | `leader, maxSize, ver, createdAt, updatedAt` | `PARTY_IDLE_TTL_S = 86_400`，每次变更 PEXPIRE 全族 |
| `kPartyMembers(pid)` | ZSET | member = uid, score = joinedAt | 同上 |
| `kPartyInvites(pid)` | HASH | invitee → `{by, at, expAt}` | 同上 |
| `kPartyEvtSeq(pid)` / `kPartyEvtLog(pid)` | STRING / LIST | INCR 发号 + `LPUSH/LTRIM PARTY_EVT_LOG_MAX=100`（guild 同形） | 同上 |
| `kPartyIdSeq()` | STRING | 区内 INCR 发 pid | 无 |
| 档字段 `partyId` | 档 HASH | 成员指针，`withUser` / `uow.set`（同 `guildId`） | 随档 |

- Lua（KEYS 五键同槽）：`PARTY_CREATE / INVITE / ACCEPT / DECLINE / LEAVE / KICK / TRANSFER`；每条校验 → 变更 → `HINCRBY ver` → 事件 → PEXPIRE（或最后一人离开 DEL 全族）；队长离开由 ZSET 最早成员接任（确定性）。
- 顺序：先 Lua 后档；读侧自愈（`partyId` 指向不存在 / 名册无我 ⇒ 视为不在队并清字段）。
- 域 `party`（`domains/party.ts`）：`party.create` / `invite` / `accept` / `decline` / `leave` / `kick` / `transferLeader`（idempotent-write，`withUser(me)` 内改档字段；⛔ 不跨 uid 取锁）、`party.get`（query：`IPartyView` + presence 标记）、`party.getEvents(sinceSeq)`（同 guild：`partyId` 必带，换队重置水位）。
- push：`party.event {seq, partyId}`（只唤醒）、`party.invited {partyId, by, expAt}`（带内容：被邀请者无法拉）。
- 错误码：`PARTY_NOT_FOUND / PARTY_FULL / PARTY_NOT_MEMBER / PARTY_NOT_LEADER / PARTY_ALREADY_IN_PARTY / PARTY_INVITE_INVALID / PARTY_TARGET_OFFLINE`。
- 一致性：party 只在 Redis，与 WorldRoom 无关（WorldRoom 只读 `partyId` 做标记）；断线不自动踢（presence 标 offline）；队长断线不自动转让（产品策略留 kit / 插件）；冷档随档冻结 / 解冻后自愈。
- 客户端 `PartyLogic` 逐字照 `GuildLogic`（水位 / 跳号全量刷新 / 换队重置）。

### 6.5 channel

| `channel` | 授权 | 投递 |
| --- | --- | --- |
| `realm:<sId>`（`<sId>` 必须 = `auth.sId`，否则 `CHAT_CHANNEL_FORBIDDEN`） | 本区任何在线者 | `pushToRealm(sId, chat.message, msg)` |
| `party:<pid>` | 发送者 ∈ `kPartyMembers`（ZSCORE） | `pushToUsers(members, chat.message, msg, sId)` |
| 附近 | 不是 Lobby 频道；⛔ 不出现在 `chat.send` 联合里 | §6.5.1 |

- 域 `chat`（natural-write，⛔ 不走幂等 v2）：`chat.send { channel, text }`（exact keys；1..`CHAT_TEXT_MAX=200`、trim 非空、无控制字符）→ `{ msgId, at }`；push `chat.message { channel, msgId, from:{uid, name}, text, at }`，`from` 服务端盖章（请求 validator 无 `from` 键）。
- 限流：handler 内 `TOKEN_BUCKET`（与 `room.resolve` 同做法）：`kRl("chat:send:<uid>")` cap 3 / refill 0.5 每秒；realm 另加 `kRl("chat:realm:s<sId>")` cap 100 / refill 30 每秒；桶基础设施失败 → `CHAT_UNAVAILABLE`（fail-closed）。
- 回显：发送者也经总线收到自己的 `chat.message`。禁言 / 过滤单一注入点 `setChatPolicy({ canSend, transform })`（`core/chat/policy.ts`，与 `setKickHandler` 同形）；UI / 词库 / 封禁表留插件。history：**无**。

#### 6.5.1 附近聊天为什么 ⛔ 不走 Lobby push

受众只有 WorldRoom 知道（兴趣集索引在房内存）；气泡必须与实体 enter / leave 同序（perSession 单 seq 流）；视距外不该收到（可见性 = 权限）；高密度同屏时每行 × 视野人数会拖垮 realm 单流；一条分线 = 一个进程，无跨进程需求。

形态：框架 core 世界 wire `defineC2S("c2s.world.chat", validate, { rateCost: 2 })` + `defineS2C("s2c.world.chat", validate, { perSession: true })`；房收到 → `chatPolicy` → 对兴趣集含 `primaryEntityOf(sender)` 的每个会话 `sendS2C`（含发送者），载荷 `{ fromEntityId, text, at }`；kit 只把 `fromEntityId` 映射成角色名。限流用房内 `rateCost` 预算，不碰 Redis。

### 6.6 退出条件与变异验证

| 原语 | 机检退出条件 | 变异验证（改哪一行 → 哪条用例转红） |
| --- | --- | --- |
| presence | onJoin 后 `isOnline` 真且 seat 公开前已写；final onLeave 后假；节点 b 持新连接时节点 a 下线不清 `lobby`；伪时钟 90 s 无心跳 ⇒ null | 删 `PRESENCE_CLEAR_IF_OWNER` 的 owner 比较 → 「顶号跨节点」转红；删 EXPIRE → 「崩溃自愈」转红 |
| 投递总线 | `pushToUsers` 到达 b 节点在线 uid、不到达同 uid 的 s2 连接；`pushToRealm(s1)` 只到 s1；65 uid 切两条；`data` 2049 B 拒发；`issuedAt` 早于 30 s 丢弃；未知 `type` 丢弃；两节点各恰一次 | 删 `conn.sId === sId` → 「串区」转红；删 max-age → 「积压不投递」转红；删切片 → 「65 uid」转红；发布方本地直投 → 「恰一次」转红 |
| party | 第 6 人 accept 得 `PARTY_FULL`；过期邀请 `PARTY_INVITE_INVALID`；非队长 kick `PARTY_NOT_LEADER`；队长 leave 后最早成员成队长；最后一人 leave 后五键全无；`getEvents` 跳号触发全量刷新；同 `clientReqId` 重放 create 不建第二队；蒸发队伍 `party.get` 返回 null 并清字段 | 删 ZCARD 判断 → 「PARTY_FULL」转红；删 expAt → 「过期邀请」转红；删自动转让 → 「有队长」转红；push 去掉 `partyId` → 换队水位转红；删 DEL 分支 → 「五键全无」转红 |
| chat | 非成员发 `party:<pid>` 得 `CHAT_CHANNEL_FORBIDDEN`；`realm:<他区>` 同上；请求含 `from` 得 `INVALID_PAYLOAD`；第 4 条连发 `RATE_LIMITED`；桶失败得 `CHAT_UNAVAILABLE`；接收方 `from.uid` = 发送者 | 删 ZSCORE 校验 → 「非成员」转红；删 realm sId 比较 → 「跨区」转红；桶失败改放行 → 转红 |
| nearby（MF6b） | 视距外不收；视距内含发送者各收一次；`broadcastS2C(s2c.world.chat)` 被拒 | 删兴趣集过滤 → 「视距外」转红；删 perSession 闸 → 「广播被拒」转红 |

夹具：`startPushConsumer` 与 `setPushLocalHandlers` 可注入 ⇒ 测试里起两个消费者各挂一张假在线表（`NODE_ID` a / b），⛔ 不需要第二个进程（真双进程进 `test:int` 末项）；向量 `apps/server/test/lobbyRpcVectors/{party,chat}.ts`；客户端 `PartyLogic` 无头单测。

### 6.7 消费方先于升格（每个原语的第二个非 MMO 消费方）

| 原语 | MMO 消费方 | 第二消费方（仓内既有缺口） |
| --- | --- | --- |
| 投递总线 | 队伍事件、世界 / 队伍聊天、交接唤醒 | **guild 事件扇出修复**（`pushToGuild` 今天只投本节点）；**`ServerNotice`**（`coreErrors.ts` 已声明、`pushToAll` 预留无调用方）→ `/admin/notice` 走 `pushToRealm` |
| party | 组队进图、经验分配 | **snake 私房整队入座**：队长 `room.prepareCreate` 得邀请码后发 `party.event{kind: roomInvite, data:{code}}`，成员各自 `room.resolve` |
| presence | `party.get` 标记、队友标记 | freezeWorker 的「此刻在线」判定（本阶段只登记）；`/admin/kick` 节点定位提示 |
| channel | 世界 / 附近聊天 | 队伍频道在 snake 大厅即可用；`ServerNotice` 是 realm 寻址第二用法 |
| MF5 兴趣集原语（非社交，一并登记） | mmo kit 的 entity 同步 | **`slg` kit 的 tile / army 兴趣集**：同一 `InterestSet` / `perSession` 原语、不同实体模型与世界形态（SQL 权威视图房，§4.1.1），验证原语通用性 |

## 7. `mmo` kit 规格（MK0–MK4）

前置：MF0–MF9 退出。沿用 KIT.md §4：一个 `mmo` kit、多个可分别版本化的 api 面、不做 kit-on-kit。

### 7.1 `kit.json` 草案（只写现 schema 认识的字段；⭐ 为框架 PR 字段）

```json
{
  "schemaVersion": 1,
  "id": "mmo",
  "version": "0.1.0",
  "description": "MMO 地基：常驻分线世界（mmoWorld）+ 角色/世界/移动/战斗/AI/物品/内容/社交/编排 api 面",
  "api": {
    "characters": { "version": 1, "minSupported": 1 }, "world": { "version": 1, "minSupported": 1 },
    "movement": { "version": 1, "minSupported": 1 },   "combat": { "version": 1, "minSupported": 1 },
    "ai": { "version": 1, "minSupported": 1 },         "inventory": { "version": 1, "minSupported": 1 },
    "content": { "version": 1, "minSupported": 1 },    "social": { "version": 1, "minSupported": 1 },
    "orchestration": { "version": 1, "minSupported": 1 }
  },
  "domains": ["mmo", "mmoSocial", "mmoAdmin"],
  "modes": [{ "id": "mmoWorld", "constantName": "MmoWorld" }],
  "sql": {
    "files": ["sql/001-characters.sql", "sql/002-items.sql", "sql/003-world.sql"],
    "tables": [
      { "name": "k_mmo_character",            "zone": "per-zone" },
      { "name": "k_mmo_character_checkpoint", "zone": "per-zone" },
      { "name": "k_mmo_item_instance",        "zone": "per-zone" },
      { "name": "k_mmo_receipt",              "zone": "per-zone" },
      { "name": "k_mmo_instance",             "zone": "per-zone" },
      { "name": "k_mmo_instance_checkpoint",  "zone": "per-zone" },
      { "name": "k_mmo_world_event",          "zone": "per-zone" }
    ]
  },
  "userKeys": ["profile"],
  "category": "extra", "docs": ["apps/kits/mmo/README.md"], "resident": true,
  "entry": "apps/client/src/kits/mmo/index.ts",
  "viewDirs": ["apps/client/src/kits/mmo/view", "apps/client/src/view/rooms/mmoWorld"],
  "views": ["apps/client/src/kits/mmo/view/MmoCharacterSelectView.view.json", "apps/client/src/view/rooms/mmoWorld/MmoWorldView.view.json"],
  "owners": [{ "id": "mmo", "logicDir": "apps/client/src/kits/mmo/logic" }, { "id": "mmoWorld", "logicDir": "apps/client/src/logic/rooms/mmoWorld" }],
  "routes": [{ "id": "mmoCharacters", "view": "MmoCharacterSelect" }],
  "menu": [{ "entryId": "enter", "label": "进入世界", "labelKey": "menu.mmo.enter", "launch": { "kind": "route", "routeId": "mmoCharacters" } }]
}
```

⭐（MF7 / MF9 落地后写入）：

```json
"contributions": {
  "content":       { "kind": "data",   "schema": "mmo/contentPack@1", "ends": ["server", "client"] },
  "presentation":  { "kind": "module", "end": "client", "export": "MMO_PRESENTATION" },
  "orchestration": { "kind": "module", "end": "server", "export": "MMO_ORCHESTRATION" }
},
"workers": [{ "id": "worldEvents", "entry": "apps/server/src/kits/mmo/workers/worldEvents.ts" }]
```

- 命名闸：`mmoWorld` 与包 id `mmo` 大小写归一不等；三个域以 `mmo` 为边界前缀；插件 id `mmodemo` / `mmohold` 的 `mmo` 后接小写字母，不构成边界前缀匹配（`viewCatalog.ts:boundaryPrefixes` 已核）。
- 不声明 `effects`：经验在 `k_mmo_character`，货币在框架主账（persona owner）。
- `k_mmo_instance` 只存 kit 语义（`pack_id` / `pack_version` / 编排状态 rev），以框架 `world_instance.instance_id` 为键；⛔ 不建 `k_mmo_transfer`（交接表归框架）。

### 7.2 api 面（插件只 import `apps/{shared,server,client}/src/kits/mmo/api/<surface>/index.ts`）

| 面 | shared（零依赖） | server | client |
| --- | --- | --- | --- |
| `characters` | `ICharacterSummary`、`ClassId` / `FactionId`、命名校验、槽位上限 | `listCharacters`、`createCharacter`（框架 `persona` 行 + `k_mmo_character` 同事务）、`characterWriteCap(characterId, controlEpoch)` | `fetchCharacters`、`createCharacter`、`enterWorld(characterId, mapId)`（带参 launch） |
| `world` | `WorldAddress`、`Vec2`、`EntityId`、`EntityKind`、三档可见性类型（`IInstanceMeta` / `IEntityCard` + `IEntityPose` + `ICombatState` / `IPrivateState`）、`IRegionDef`、delta / baseline 类型（wire 契约属本面） | `currentWorldAddress()`、`readInstanceMeta`、`listInstances`；⛔ 不暴露 spawn / despawn / schedule | `WorldClient`：实体表（只含兴趣集）、enter / update / leave、插值采样、相机跟随、`privateState` 订阅 |
| `movement` | `IMoveIntent = {seq, dir} \| {seq, target}`、`integrate(pos, dir, speedPerSec, dtMs)`（双端同源纯函数）、`clampToMap` | 权威积分器（模板速度为服务端常量；碰撞候选来自 `collision` 网格）；`teleportWithin`（内部 + 编排命令） | 摇杆 → `dir` 意图（限频合并）；点地 → `target`；本地预测 + 按 `seq` 和解；⛔ 不上报坐标 |
| `combat` | `ISpellTemplate`、冷却 / 施法 / 耗蓝纯函数、伤害公式族（扩展 `shared/logic/battle.ts`） | 施法管线（准备 → 施放 → 完成）、aura 表、仇恨表、有序战斗事件 | 目标选择、施法意图、冷却模型 |
| `ai` | 行为词汇（aggro / leash / patrol / respawn / flee） | 分桶调度器、行为解释器、`nav` 网格 A\*（可下沉 compute，结果带 `instanceEpoch` + `entityVersion`，迟到即丢） | — |
| `inventory` | `IItemTemplate`、槽位 / 堆叠、`ILootInstance` | `grantItem` / `moveItem` / `claimLoot`（全在 `withWorldTx` 内；回执写 `k_mmo_receipt`） | 背包视图模型 |
| `content` | 内容包 schema + validator + 引用 / 可达性检查 | 注册表（读 `contributions.generated`）：`packFor(mapId)`、`creature` / `item` / `region` | 表现映射注册表 + 客户端地图几何 |
| `social` | `IPartyView`（成员 characterId + WorldAddress） | `worldChannelId(sId)`、`nearbyRecipients(speakerEntityId)`（= 兴趣集 ∩ 可见性）、`partyOf(characterId)`（读框架 party） | `sayWorld` 直接用框架 chat 门面；队伍面板消费框架 `PartyLogic` |
| `orchestration` | 事件 / 命令 / 只读 API / 模块契约、`defineOrchestration()`、`MMO_ORCHESTRATION_VERSION = 1`、命令 validator | 运行器（内部）；对外 `readCheckpointedVars(addr, packId)`、`createOrchestrationHarness()` | `subscribeScriptState(packId)`、`onPrompt` |

契约归属：`mmo` 域 → `characters` / `world`；`mmoSocial` 域（v1 仅 `partyLocate`）→ `social`；`mmoAdmin` 不对插件开放；`mmoWorld` wire 按 §7.4「面」列归属，任一 token 变化 bump 该面 `version`。

### 7.3 SQL 与回退窗口

| 表 | 主键 / 唯一 | 关键列 |
| --- | --- | --- |
| `k_mmo_character` | `(server_id, character_id)`；`UNIQUE(server_id, name)` | `persona_id`（框架）、`class_id`、`faction_id`、`level`、`exp`、`hp`、`mp`、`map_id`、`pos_x`、`pos_y`（连续坐标）、`heading`、`checkpoint_rev` |
| `k_mmo_character_checkpoint` | `(server_id, character_id, rev)` | `snapshot JSON`、`instance_id`、`event_seq`、`state_hash` |
| `k_mmo_item_instance` | `(server_id, item_id)`；`UNIQUE(server_id, owner_character_id, location, slot)` | `template_id`、`location`（bag / equip / bank / escrow / mail）、`count`、`rev` |
| `k_mmo_receipt` | `(server_id, op_id)` | `character_id`、`kind`、`result JSON` |
| `k_mmo_instance` | `(server_id, instance_id)` | `pack_id`、`pack_version`、`script_rev`（以框架 `world_instance` 为键） |
| `k_mmo_instance_checkpoint` | `(server_id, instance_id, rev)` | `tick`、`rng_state`、`creatures JSON`（spawnId → alive / respawnDueTick / pos）、`loot JSON`、`script_vars JSON`、`timers JSON`、`regions JSON`、`event_seq`、`state_hash` |
| `k_mmo_world_event` | `(server_id, instance_id, seq)`；`UNIQUE(server_id, event_id)`；`KEY(server_id, status, created_at)`；`role:"world-event"` | `kind`（grantItem / grantCurrency / lootClaim / custom）、`actor_character_id`、`pack_id`、`payload`、`status`、`attempts`、`checkpoint_rev` |

id 用服务端 uuid 字符串（⛔ 不用 64 位整数：shared 锁 ES2017）。静态模板 ⛔ 不进 SQL（v0）。同图不同分线 ⛔ 永不共享行。

回退窗口（逐类冻结；MF1 复核数字）：

| 状态 | 恢复来源 | 允许回退 |
| --- | --- | --- |
| 已确认资产（物品 / 货币 / 掉落认领） | 主账本 + `k_mmo_item_instance` + `k_mmo_receipt` | **0**；重投由 `event_id` / `op_id` 去重 |
| 角色位置 / HP / MP / 冷却 | `k_mmo_character_checkpoint` | ≤ 1 个角色检查点周期（候选 60 s）；登出 / 交接强制点 |
| NPC 存活 / 复活计时 / 未认领掉落 | `k_mmo_instance_checkpoint` | ≤ 1 个分线检查点周期（候选 30 s）；boss 死亡强制点（`checkpointOnDeath`） |
| 脚本 vars / timers / 区域开关 | 同上 | 同上；timer 存 `dueTick`，恢复后按 tick 差重排 |
| 战斗热状态（aura / 仇恨 / 施法中） | 无 | 全丢：恢复后清零，战斗视为中断 |
| 世界事件 offset | 检查点原子关联 `event_seq` | 0；seq > 检查点的事件已 durable，只消费不重放进内存 |

### 7.4 mode `mmoWorld`（`apps/kits/mmo/gameplays/mmoWorld/`）

- `manifest.json`：`{ id: "mmoWorld", constantName: "MmoWorld", modeVersion: 1, maxPlayers: <MF1 基准冻结>, kind: "world", profiles: ["world"], world: { emptyPolicy, emptyAfterMs, checkpointMs } }`。
- `state.json` root `MmoWorldRoomState`（**只放全图公开的分线元数据**）：`tick`、`phase: WorldPhase`、`mapId` / `instanceId` / `line` / `packId` / `packVersion`、`authorityEpoch`、`population`（在线数，⛔ 不是名册）、`scriptStateRev`。
- `wire.ts` token（perSession token 由 MF5 的 `defineS2C(..., { perSession: true })` 声明）：

| 方向 | token | 载荷要点 | phases / rateCost | 投递 | 面 |
| --- | --- | --- | --- | --- | --- |
| C2S | `c2s.mmoWorld.move` | `{ seq, dir:{x,y} } \| { seq, target:{x,y} }`（⛔ 无坐标上报） | Active / 1 | — | movement |
| C2S | `c2s.mmoWorld.target` | `{ entityId \| null }` | Active / 1 | — | combat |
| C2S | `c2s.mmoWorld.cast` | `{ seq, spellId, targetId? }` | Active / 2 | — | combat |
| C2S | `c2s.mmoWorld.interact` | `{ entityId, interactId? }` | Active / 2 | — | world |
| C2S | `c2s.mmoWorld.choose` | `{ promptId, choiceId }` | Active / 2 | — | orchestration |
| C2S | `c2s.mmoWorld.pickup` | `{ lootId, clientReqId }`（durable → 回执） | Active / 2 | — | inventory |
| C2S | `c2s.mmoWorld.transfer` | `{ portalId, clientReqId }` | Active / 4 | — | world |
| C2S | `c2s.mmoWorld.baselineRequest` | `{ roomEpochId, afterSeq }` | Active / 4 | — | world |
| S2C | `s2c.mmoWorld.baselineBegin / Chunk / End` | 只含兴趣集；分块 + checksum | — | perSession | world |
| S2C | `s2c.mmoWorld.delta` | `{ seq, tick, enter[], update[], leave[], events[] }` 单流单 seq | — | perSession | world |
| S2C | `s2c.mmoWorld.private` | `{ seq, bag?, cooldowns?, quest?, vars? }` | — | perSession | inventory / combat |
| S2C | `s2c.mmoWorld.opResult` | `{ clientReqId, result }` | — | perSession | world |
| S2C | `s2c.mmoWorld.transferReady` | `{ transferId, worldAddress, ticket }` | — | perSession | world |
| S2C | `s2c.mmoWorld.prompt` | `{ promptId, packId, choices[] }` | — | perSession | orchestration |
| S2C | `s2c.mmoWorld.scriptState` | `{ packId, rev, state }`（≤ 16 键标量） | — | 分线广播 | orchestration |
| S2C | `s2c.mmoWorld.notice` | `{ text, level }` | — | 分线广播 | orchestration |

⚠ 聊天 ⛔ 不是 `mmoWorld` token：附近聊天是框架 core 世界 token `c2s/s2c.world.chat`（§6.5.1），世界聊天是框架 channel 原语在 `realm:<sId>` 上的 Lobby push。

### 7.5 内容包 schema（`content` 面，零依赖 validator，fail-closed）

顶层 `IContentPack { packId, version, maps[], regions[], creatures[], spawns[], spells[], items[], lootTables[], npcs[] }`。

| 模板 | 字段要点 |
| --- | --- |
| `IMapDef` | `mapId`、`size`（世界单位）、`collision:{ cellSize, bitmap }`、`nav:{ cellSize }`、`aoi:{ cellSize, viewRadius }`（三个 cellSize 互不绑定；`viewRadius` 用世界单位）、`spawnPoints[]`、`portals[]`、`respawnPoints[]` |
| `IRegionDef` | `regionId`、`mapId`、`shape`（circle / rect）、`enabledByDefault`、`tags[]` |
| `ICreatureTemplate` | 属性、`speedPerSec`（服务端常量）、`behavior`（`ai` 面词汇）、`spells[]`、`lootTableId`、`respawnSec`、`tier`（normal / elite / boss）、`checkpointOnDeath`、`interacts[]` |
| `ISpawnDef` | `spawnId`、`mapId`、`templateId`、`pos`、`count`、`waypoints[]`、`managed:"kit" \| "orchestration"` |
| `ISpellTemplate` | 类型（直伤 / 治疗 / 增益 / 减益；⛔ v1 无召唤）、施法时间、冷却、耗蓝、射程、效果参数 |
| `IItemTemplate` / `ILootTable` / `INpcDef` | 槽位、堆叠、属性、职业限制、价格 / 掉落权重 / 商人与交互表 |
| `IPresentationMap`（client 模块） | `presentationId → { prefab, atlas, anim, icon, sfx }` |

codegen 期与启动期校验：引用完整性（spawn → template、loot → item、portal → map、region → map、`interactId` ↔ 编排模块声明）、可达性（出生点到每个传送点有 nav 路径）、数值域、包大小上限；任一失败 codegen 拒绝 / WorldRoom 拒启。原始数据 id 与 `presentationId` 分离。

### 7.6 落点与 kit 阶段

- server：`apps/server/src/kits/mmo/{world,aoi,movement,combat,ai,inventory,content,social,orchestration,persistence,workers}/**` + `api/<surface>/index.ts`；`rooms/modes/mmoWorld/index.ts`（登进 `worldModeRegistry`）；`websocket/{mmo,mmoSocial,mmoAdmin}/`；`core/compute/tasks/kits/mmo/pathfind.ts`。只 import `../../core/infra/kitApi`、框架 world 契约与自身。
- shared：`apps/shared/src/kits/mmo/api/<surface>/index.ts`；`apps/shared/src/gameplays/mmoWorld/wire.ts`；`domains/{mmo,mmoSocial,mmoAdmin}.ts`。
- client：`apps/client/src/kits/mmo/{index.ts,api/**,logic/**,view/MmoCharacterSelectView}`；mode 四件 `gameplay/modes/mmoWorld/`、`net/rooms/MmoWorldRoom.ts`、`logic/rooms/mmoWorld/`、`view/rooms/mmoWorld/MmoWorldView`（默认 HUD：摇杆 / 目标 / 技能轮盘 / 附近聊天 / 队伍；bitECS 实体池 + 插值 + 相机）。竖屏基线 750×1624 不变。
- kit v1 自带灰盒内容包 `apps/kits/mmo/content/greybox/*.json`（一图一怪一技能），MK4 前可内置 import，MK4 改为经贡献点装载以证明通道。

| 阶段 | 交付 | 前置 | 验收（能力，非内容） |
| --- | --- | --- | --- |
| MK0 骨架 | kit.json / README / SQL / `mmoWorld` 四件 / characters + world + content 面 / 灰盒内容包 | MF0–MF4、MF7 | 干净树 pack → install → codegen → bootstrap → check → `plugin -- test mmo`；一个角色进图、走路、看到怪 |
| MK1 世界闭环 | movement 面、AOI 接入、两图交接、检查点恢复、附近 / 世界聊天与队伍包装、客户端基础适配 | MF5、MF6、MF8 | 断线 / 重启 / 交接故障矩阵全过；基准台达 kill criterion |
| MK2 模拟闭环 | combat + ai 面、掉落 | — | 有序执行与预算上限；AI 分桶不挤占主 tick；可无头重放 |
| MK3 资产闭环 | inventory 面（唯一物品 / 容器 / 装备 / 掉落归属）、角色保存定稿 | — | 并发拾取 / 重复请求 / 重启重放不复制物品或奖励；币账仍在框架 |
| MK4 编排与验收 | orchestration 面 + 运行器 + harness；api 冻结、说明书；内置内容包改为经贡献点装载；容量证据；打 tag `mmo-kit-v1-frozen` | MF9、MF11 | 干净安装全链闭环；卸载 / 升级识别在途交接与 pending 事件；框架零追加手改 |

交易 / 任务 / 副本存档 / 脚本钩子之外的能力在 MK4 之后按同法立项，⛔ 不以首版替代品冒充。

## 8. 公开 API 编排模型（`orchestration` 面 v1）

### 8.1 总则

插件在运行时对世界的**全部**影响 = `handle(event, readApi) → commands[]`。kit 发事件、给只读快照、校验并执行命令；插件模块没有写端口、没有 IO、没有自己的状态存储（状态 = kit 托管的有界 `vars`）。

| 规则 | 形态 | 违反时 |
| --- | --- | --- |
| 确定性 | handler 同步纯函数；随机只经 `api.rng`（种子 = instanceId + tick + eventSeq）；时间只经 `api.tick`；⛔ `Math.random` / `Date` / `setTimeout` / import 非门面模块（`mmo-orchestration-boundary.test.ts` 扫描 `contributions.generated` 收录模块：import 集 ⊆ {kit shared api、自身目录} 且无禁用标识符） | 启动期断言失败 → 进程拒启 |
| 预算 | 每 tick 每 pack：wall ≤ `ORCH_TICK_BUDGET_MS`（候选 2 ms）、命令 ≤ 64、事件队列 ≤ 256、存活脚本 spawn ≤ `limits.maxSpawnsAlive`、vars ≤ 4 KB | **fail-closed**：本 tick 命令整批丢弃，该 pack 在该分线 `suspended`（timers 保留、不再收事件），写 `k_mmo_world_event kind=packSuspended`；`mmoAdmin.resumePack` 或分线重启恢复 |
| 可重放 | 只读 API 是事件时刻的一致快照；kit 记录 `(eventSeq, eventDigest, commandDigest)` 环形日志并随分线检查点落 `state_hash`；`createOrchestrationHarness()` 重放并断言命令逐条相等 | 重放不等 = 插件测试红 |
| 版本化 | 模块声明 `orchestrationVersion` 与 `subscribes[]`；未订阅 / 未知事件不投递；未知 `op` → validator 拒 → 整批丢弃 + suspend | 新事件 / 新命令 = kit 升级（bump `version`；破坏性抬 `minSupported`，反向闸点名插件） |

### 8.2 受控事件（kit → 插件）

| kind | 载荷 | 触发 |
| --- | --- | --- |
| `instanceStarted` | `{ recovered, checkpointRev }` | Recovering → Active 后一次 |
| `tick` | `{ tick, bucket }` | 每 `tickEvery` tick（10 ≤ n ≤ 1200；缺省 20 = 1 Hz）；bucket = hash(packId, instanceId) 错峰 |
| `timer` | `{ timerId, tag }` | `startTimer` 到期 |
| `playerEntered` / `playerLeft` | `{ entityId, characterId, factionId }` | 准入完成 / 离图 |
| `regionEntered` / `regionLeft` | `{ regionId, entityId, entityKind }` | 实体跨越已启用区域边界（含 creature） |
| `creatureSpawned` / `creatureDied` | `{ entityId, templateId, spawnId?, tag?, killerEntityId?, pos }` | 含 kit 管理与脚本 spawn |
| `playerDied` | `{ entityId, killerEntityId? }` | |
| `interact` | `{ actorEntityId, targetEntityId, interactId }` | `c2s.mmoWorld.interact` 命中模板 `interacts[]` 中 `handler:"orchestration"` 的 interactId |
| `choice` | `{ actorEntityId, promptId, choiceId }` | `c2s.mmoWorld.choose` |
| `lootClaimed` | `{ actorEntityId, lootId, itemTemplateId, count }` | 认领 durable 后 |
| `grantResult` | `{ opId, ok, reason? }` | `grant*` durable 落账后回投（带 `instanceEpoch`，旧 epoch 丢弃） |
| `packSuspended` | `{ reason }` | 预算超限（只投一次） |

v1 ⛔ 不投递：`spellCast` / `damage`（高频，留 v2）、任何跨分线事件。

### 8.3 命令（插件 → kit；全部经零依赖 validator + 语义校验）

| op | 载荷 | kit 校验 / 落地 |
| --- | --- | --- |
| `spawn` | `{ templateId, pos, tag?, despawnAfterMs?, leashRegionId? }` | templateId ∈ 本 pack；pos 可行走；存活上限；落 kit 内部 spawn 端口，`managed:"orchestration"` |
| `despawn` | `{ entityId } \| { tag }` | 只能 despawn 本 pack 脚本 spawn 的实体 |
| `startTimer` / `cancelTimer` | `{ timerId, afterMs, tag?, repeat? }` | 每 pack ≤ 32 活动 timer；`afterMs ≥ 500`；随分线检查点持久 |
| `grantItem` | `{ toCharacterId, itemTemplateId, count, reason }` | 模板 ∈ pack；`count ≤ limits.maxGrantCount`；写 `k_mmo_world_event kind=grantItem`（op_id = uuidv5(instanceId, packId, eventSeq, idx)）→ worker `withWorldTx` → `inventory.grantItem` → `grantResult` |
| `grantCurrency` | `{ toCharacterId, amount, reason }` | `amount ≤ limits.maxCurrencyPerGrant`（kit 硬上限）；同上路径经 `creditInTx`（persona owner） |
| `sayNearby` | `{ anchorEntityId, text }` | anchor 属本分线；文本 / 频率限；经框架 `s2c.world.chat` 端口 |
| `sayWorld` | `{ text }` | 每 pack 每分钟 ≤ N；经框架 channel 发布到 `realm:<sId>` |
| `notice` | `{ text, level }` | 分线广播 `s2c.mmoWorld.notice` |
| `setVar` | `{ key, value, durable? }` | vars ≤ 4 KB；`durable:true` 触发强制分线检查点（每 pack 限频） |
| `publishState` | `{ key, value }` | 进 `s2c.mmoWorld.scriptState`（≤ 16 键、标量）；rev 自增 |
| `prompt` | `{ toEntityId, promptId, choices[] }` | ≤ 6 项；perSession |
| `teleportWithin` | `{ entityId, pos }` | 同图；pos 可行走 |
| `transfer` | `{ characterId, toMapId, toPortalId }` | 走框架交接状态机（与玩家走传送门同一路径） |
| `setRegionEnabled` | `{ regionId, enabled }` | region ∈ 本 pack 图 |

不存在的命令（= 需要 kit 升级）：修改属性 / 伤害公式、定义新 aura、直接写 SQL / Redis、向任意会话发任意 token、跨分线操作、创建队伍 / 频道。

### 8.4 扩展点

| 扩展点 | 声明处 | 运行时 |
| --- | --- | --- |
| 自定义交互 | 内容包 `interacts[]` 里 `handler:"orchestration"`；模块 `interacts: Record<interactId, { targets }>` | `interact` 事件 → `prompt` / `grantItem` / `notice` |
| 区域触发 | 内容包 `IRegionDef` + 模块 `subscribes` 含 `regionEntered` | kit 每 step 用 `aoi` 网格候选 + 精确形状判定 |
| 遭遇脚本 | `timer` / `tick` / `creatureDied` 组合 | vars + timers 构成脚本状态机，随分线检查点恢复 |
| HUD 状态 | `publishState` + 客户端 `subscribeScriptState` | 插件自有 View 替换 kit 默认 HUD |

### 8.5 契约签名（`apps/shared/src/kits/mmo/api/orchestration/index.ts`，零依赖）

```ts
export const MMO_ORCHESTRATION_VERSION = 1 as const;
export type ScriptScalar = number | string | boolean;

export type OrchestrationEvent =
  | { kind: "instanceStarted"; recovered: boolean; checkpointRev: number }
  | { kind: "tick"; tick: number; bucket: number }
  | { kind: "timer"; timerId: string; tag: string }
  | { kind: "playerEntered" | "playerLeft"; entityId: EntityId; characterId: string; factionId: number }
  | { kind: "regionEntered" | "regionLeft"; regionId: string; entityId: EntityId; entityKind: EntityKind }
  | { kind: "creatureSpawned" | "creatureDied"; entityId: EntityId; templateId: string; spawnId?: string; tag?: string; killerEntityId?: EntityId; pos: Vec2 }
  | { kind: "playerDied"; entityId: EntityId; killerEntityId?: EntityId }
  | { kind: "interact"; actorEntityId: EntityId; targetEntityId: EntityId; interactId: string }
  | { kind: "choice"; actorEntityId: EntityId; promptId: string; choiceId: string }
  | { kind: "lootClaimed"; actorEntityId: EntityId; lootId: string; itemTemplateId: string; count: number }
  | { kind: "grantResult"; opId: string; ok: boolean; reason?: string }
  | { kind: "packSuspended"; reason: string };

export type OrchestrationCommand =
  | { op: "spawn"; templateId: string; pos: Vec2; tag?: string; despawnAfterMs?: number; leashRegionId?: string }
  | { op: "despawn"; entityId: EntityId } | { op: "despawn"; tag: string }
  | { op: "startTimer"; timerId: string; afterMs: number; tag?: string; repeat?: boolean }
  | { op: "cancelTimer"; timerId: string }
  | { op: "grantItem"; toCharacterId: string; itemTemplateId: string; count: number; reason: string }
  | { op: "grantCurrency"; toCharacterId: string; amount: number; reason: string }
  | { op: "sayNearby"; anchorEntityId: EntityId; text: string }
  | { op: "sayWorld"; text: string }
  | { op: "notice"; text: string; level: "info" | "warn" }
  | { op: "setVar"; key: string; value: ScriptScalar; durable?: boolean }
  | { op: "publishState"; key: string; value: ScriptScalar }
  | { op: "prompt"; toEntityId: EntityId; promptId: string; choices: readonly { id: string; label: string }[] }
  | { op: "teleportWithin"; entityId: EntityId; pos: Vec2 }
  | { op: "transfer"; characterId: string; toMapId: string; toPortalId: string }
  | { op: "setRegionEnabled"; regionId: string; enabled: boolean };

/** 事件时刻的一致快照；全部同步、只读、无 IO。 */
export interface OrchestrationReadApi {
  readonly address: WorldAddress; readonly tick: number; readonly packId: string;
  rng(stream: string): number;
  vars: { get(key: string): ScriptScalar | undefined; keys(): readonly string[] };
  world: {
    entity(id: EntityId): IEntityView | null;
    entitiesInRegion(regionId: string, filter?: { kind?: EntityKind; tag?: string; factionId?: number }): readonly EntityId[];
    playersInInstance(): readonly EntityId[];
    isWalkable(pos: Vec2): boolean;
    region(regionId: string): IRegionDef | null;
  };
  content: { creature(id: string): ICreatureTemplate | null; item(id: string): IItemTemplate | null };
  party: { membersInInstance(entityId: EntityId): readonly EntityId[] };
}

export interface OrchestrationModule {
  readonly orchestrationVersion: typeof MMO_ORCHESTRATION_VERSION;
  readonly packId: string;
  readonly subscribes: readonly OrchestrationEvent["kind"][];
  readonly tickEvery?: number;
  readonly interacts?: Readonly<Record<string, { readonly targets: readonly string[] }>>;
  readonly limits?: { readonly maxSpawnsAlive?: number; readonly maxGrantCount?: number; readonly maxCurrencyPerGrant?: number };
  readonly handle: (event: OrchestrationEvent, api: OrchestrationReadApi) => readonly OrchestrationCommand[];
}
export function defineOrchestration(module: OrchestrationModule): OrchestrationModule;   // 形状校验 + freeze，顶层无副作用
export function validateOrchestrationCommand(input: unknown, path?: string): OrchestrationCommand;
```

server 面对插件只导出 `readCheckpointedVars(addr, packId)` 与 `createOrchestrationHarness({ module, pack, mapId, seed })`（`emit` / `vars` / `replay`）。

### 8.6 交付方式与判据

1. `plugin.json`：`requires.kits.mmo = { content:1, world:1, characters:1, orchestration:1, … }`；`contributes.mmo = { content: "apps/plugins/<id>/content", presentation: "apps/client/src/plugins/<id>/mmoPresentation.ts", orchestration: "apps/server/src/core/<id>/mmoOrchestration.ts" }`（三条都在既有所有权 dir 规则内）。
2. `codegen:plugins` 生成 `apps/server/src/kits/mmo/contributions.generated.ts`（`MMO_ORCHESTRATIONS` / `MMO_CONTENT_PACKS`）与客户端同名文件（`MMO_PRESENTATIONS` + 客户端所需内容子集）。
3. kit 启动期：逐个 `defineOrchestration` 形状断言、`packId` 对应已收录内容包、`interacts` 交叉核对——失败进程拒启。
4. 分线 Recovering：按 `k_mmo_instance.pack_id` 选模块（一图一包，v1 ⛔ 不做多包叠加）；恢复 vars / timers；投 `instanceStarted`。
5. 每 step 固定序：命令处理 → 移动积分 → 战斗 → AI 分桶 → **编排事件分发**（按 eventSeq；命令校验后落内部端口）→ AOI 差集 → 出站。durable 命令进内存 outbox，随分线检查点或每 ≤ 1 s 批写 `k_mmo_world_event`，worker 执行后回投 `grantResult`。

| 「只消费不定义」判据 | 对应 |
| --- | --- |
| 不定义 wire | `prompt / choose / scriptState / notice` 是 kit 通用 token；插件只填内容 |
| 不定义 state | vars / timers 是 kit 托管、有界、随分线检查点持久；Schema root 无插件字段 |
| 不定义 SQL | `grant*` 经 `k_mmo_world_event` → `withWorldTx` → `inventory` 面；插件无表、无 Redis 键 |
| 不定义 mode / 生命周期 | 世界运行时唯一 = `mmoWorld`；插件只收 kit 转译后的事件 |
| 命令语义归 kit | 效果、上限、幂等 op_id 形态由 kit 固定；新语义 = bump `api.orchestration.version` |

## 9. 内容插件样本（MG0–MG2）

### 9.1 判据

比 snake **更轻**：⛔ 不自带 mode / wire / state / SQL——世界运行时是 kit 的 `mmoWorld`，样本只交**内容包 + 表现映射 + 编排模块 + 自有页面与 RPC 域**。
「snake 级别」衡量的是修改归属与依赖方向，⛔ 不承诺文件数、代码量、美术量或工期（snake 锁文件 230 个、手写约 1.5 万行，过半是冻结表现数据；内容插件的对应物是内容包）。

### 9.2 样本 1：`mmodemo`（原创，id 随 MG0 拍板）

| 项 | 内容 |
| --- | --- |
| 内容包 `demoVale` | 1 图（灰盒地形 + 碰撞位图）；怪 `wolf`（aggro 近战）/ `boar`（被动）；技能 `strike` / `fireball` / `heal` / `dash`；物品 10；区域 `den`（boss 巢）/ `ambush`；boss `alphaWolf`（`checkpointOnDeath`）；NPC 商人（`interact` → `prompt`） |
| 编排 | ① 定时 boss：`instanceStarted` → `startTimer("bossSpawn", 10 min, repeat)`；`timer` → `spawn alphaWolf@den` + `notice` + `sayWorld`；`creatureDied(tag=boss)` → 对 `party.membersInInstance(killer)` 逐个 `grantItem` + `setVar("bossKills", durable)`。② 区域伏击：`regionEntered(ambush, player)` 且冷却过 → `spawn wolf ×3 (tag ambush, despawnAfterMs 120 s)` + `setVar` 冷却 |
| 表现 | 占位胶囊 + 灰盒贴图；kit 默认 HUD |
| 自有域（可选） | `mmodemo.bossBoard` query：读 `readCheckpointedVars` 的 `bossKills` |

```text
apps/plugins/mmodemo/plugin.json                       requires.kits.mmo + contributes.mmo {content, presentation, orchestration}
apps/plugins/mmodemo/README.md
apps/plugins/mmodemo/content/{pack,maps,regions,creatures,spawns,spells,items,loot}.json
apps/server/src/core/mmodemo/mmoOrchestration.ts       defineOrchestration({ packId:"demoVale", subscribes, handle })
apps/server/src/core/mmodemo/encounters/{bossTimer,ambush}.ts
apps/client/src/plugins/mmodemo/{index.ts,mmoPresentation.ts}
apps/client/src/plugins/mmodemo/logic/MmoDemoBoardLogic.ts + view/MmoDemoBoardView.ts + .view.json   （可选域页面）
apps/shared/src/protocol/lobbyRpc/domains/mmodemo.ts + apps/server/src/websocket/mmodemo/bossBoard.ts + test/lobbyRpcVectors/mmodemo.ts
apps/Cocos/assets/resources/plugins/mmodemo/**         美术（.meta 随 Creator）
apps/server/test/mmodemo-{content,orchestration}.test.ts   内容包 validator / 引用 / 可达性；harness 重放（boss 周期、伏击冷却、奖励只发同队在场者、预算内）
apps/client/test/mmodemo-logic.test.ts
```

### 9.3 样本 2：`mmohold`（不同遭遇编排：据点争夺 + 阵营计分）

| 项 | 内容 |
| --- | --- |
| 内容包 `holdRidge` | 另一张图；区域 `pointA` / `pointB`；守卫 `sentinel`（`managed:"orchestration"`）；奖励物品 3 |
| 编排（与样本 1 不重叠的 API 子集） | `tick`（`tickEvery = 20`）→ 对每据点 `entitiesInRegion(point, {kind:"player"})` 按 `factionId` 计数 → 多数方 `setVar("owner:pointA")` / `setVar("score:<faction>")` → `publishState`（HUD）；易主 → `spawn sentinel ×2` + `despawn(tag 旧守卫)` + `notice`；`score ≥ 100` → 对该阵营在场者 `grantItem` + `grantCurrency` + `sayWorld`，`setRegionEnabled(point,false)` + `startTimer("reopen", 60 s)` → 重开并 `setVar` 清零（`durable`） |
| 表现 / HUD | 自有 `MmoHoldHudView` 替换 kit 默认 HUD：`subscribeScriptState("holdRidge")` 显示归属与比分 |
| 自有域 | `mmohold.standings` query |

文件清单与样本 1 同形（`apps/plugins/mmohold/**`、`core/mmohold/{mmoOrchestration.ts,capture/*.ts}`、`plugins/mmohold/{index,mmoPresentation,logic/MmoHoldHudLogic,view/MmoHoldHudView}`、`domains/mmohold.ts`、`websocket/mmohold/standings.ts`、向量、资源、测试）。两样本合起来覆盖 §8.2 / §8.3 全部事件与命令，且样本 2 的 HUD、域、内容、脚本状态机与样本 1 无一复用。

### 9.4 动线与验收（⛔ 不用 `test:changed` 快路径）

动线：写 `content/*.json` → `mmoOrchestration.ts` → `mmoPresentation.ts` / View → `npm --workspace @game/server run codegen:plugins` → `sync:shared` / `sync:client` → `plugin -- check` → `plugin -- test <id>` → `verify:all`。

前置：kit 验收时打 tag `mmo-kit-v1-frozen`（含 `scripts/packages/mmo.lock`）。

| # | 项 | 命令 / 判据 |
| --- | --- | --- |
| 1 | 全量 diff | `git diff --name-status mmo-kit-v1-frozen..HEAD`，逐行分四类：手写 / 生成物 / 锁与指纹 / 宿主 placement |
| 2 | 手写 ⊂ 插件所有权集 | `plugin -- changed --base mmo-kit-v1-frozen --dry-run` 只借用其分类输出：要求 `foreign = []` **且** `packages` 恰为 `[<pluginId>]`（快路径判定本身无意义）；再用 `plugin -- pack <id>` 的 `files.lock` 与手写行逐条对账 |
| 3 | 框架 / kit 冻结基线零变 | `git diff --stat mmo-kit-v1-frozen..HEAD -- apps/kits/mmo apps/shared/src/kits/mmo apps/server/src/kits/mmo apps/client/src/kits/mmo apps/shared/src/gameplays/mmoWorld apps/server/src/rooms apps/client/src/{gameplay/modes,logic/rooms,view/rooms}/mmoWorld apps/client/src/net apps/server/sql scripts/protected-paths.json apps/server/tools ':!*.generated.*'` 为空；`scripts/packages/mmo.lock` 字节不变；`git grep -n "<pluginId>" -- apps/kits apps/server/src/kits apps/shared/src/kits apps/client/src/kits apps/server/src/rooms` 只命中 `*.generated.*` |
| 4 | 生成物来源 | 每条生成路径 ∈ `generatedWriterOwned`；依次跑 writer 后 `git status --porcelain` 为空；`codegen:* --check` 绿 |
| 5 | 锁与指纹 | `scripts/packages/<pluginId>.lock` 新增；`LOBBY_PROTOCOL_VERSION` 只在人工决定时 bump 并写入提交信息；`GAME_ROOM_PROTOCOL_VERSION` / `WORLD_ROOM_PROTOCOL_VERSION` 不变 |
| 6 | 宿主 placement | `apps/plugins/host.json` 改动仅限分组 / 入口位置，逐条列在提交信息 |
| 7 | 干净安装 | `git worktree add /tmp/w mmo-kit-v1-frozen`：`plugin -- install <id>.zip` → codegen → `db:bootstrap`（`kit_migration` 行数不变 = 插件零 DDL）→ `check` → `plugin -- test <id>` → `verify:all` → 无头起一个分线用 harness 事件序列跑通 → `uninstall` 后 `check` ✔ |
| 8 | 第二样本无条件分支 | 样本 2 合入后对两样本重复 #3；若为样本 2 需要改 kit，回 MK 阶段 bump 面版本并重做 #1–#7 |
| 9 | 沙箱 | `mmo-orchestration-boundary.test.ts` 绿；预算超限注入（handler 返回 65 条命令）→ `packSuspended`；重放命令逐条相等 |

### 9.5 样本阶段

| 阶段 | 内容 | 前置 |
| --- | --- | --- |
| MG0 | 拍板样本名与范围；内容包 + 表现映射 + 编排（占位胶囊 + 灰盒地形）；接入贡献点 | MK4 |
| MG1 | 竖屏操作模型（摇杆 + 目标选择 + 技能轮盘）；Creator 预览证据（`tools/creator-preview/` 加 step） | MG0 |
| MG2 | 第二样本 `mmohold` 走同一动线；两者只使用冻结 api；§9.4 全部通过 | MG0 |

## 10. 验收与容量

### 10.1 承载基准（实验计划，不是承诺）

| 场景 | 负载 | 记录 | 挂在 |
| --- | --- | --- | --- |
| A 灰盒 | 1 图；30–50 机器人；100–200 脚本实体；走路 / 打怪 / 拾取 / 交接 | tick p95 / p99、每会话出站字节、DB 写耗时 | MK0 → MK1 |
| B 热点 | 单图逐级到 100 玩家 + 500 实体，聚集施法 / 拾取 / 附近聊天 | AOI 编码 CPU、队列积压、GC、推送流深度 | MK1（kill criterion） |
| C 多图多进程 | 逐级到 1000 在线分布多进程多图 | 分配均衡、租约正确性、交接成功率、节点退出恢复 | MF10（实验报告） |

数字在 MF1 由基准台实测冻结；⛔ 不用空连接数、`maxClients` 配置或 C++ 参考项目规模替代实测。带宽量级只作说明（80 可见实体 × 40 B × 10 次/秒 ≈ 32 KB/s/客户端，未含协议 / 事件 / 重发）。

### 10.2 故障矩阵（全部进 `test:int` / `test:faults:int`）

| 故障 | 必须验证 | 阶段 |
| --- | --- | --- |
| 同 persona 跨房 / 跨进程双登 | 只有一个控制权；旧输入与写入不生效 | MF4 |
| DB 提交成功但响应丢失 | 重试回读回执；装备 / 钱不重复变化 | MF2 / MK3 |
| 源 / 目标在交接各阶段崩溃 | 查持久状态恢复；不丢角色、不双激活、不重复收费 | MF8 |
| 租约失效 / 节点停止 | 新 owner Recovering 接管；旧 owner 延迟结果被拒 | MF4 / MF10 |
| NPC 死亡后崩溃 | 奖励不重抽、不重复发 | MF7 |
| 慢客户端、重复 / 乱序 seq | 队列有界；旧代次不覆盖新状态；可重同步 | MF5 |
| 推送流积压 / 消费者卡顿 | 30 s 时间栅栏丢旧条目；party 靠 `getEvents` 自愈 | MF6a |
| 编排预算超限 | pack suspend、命令整批丢弃、事件落账、可恢复 | MK4 |
| 同图两分线 | 检查点 / 事件 / 脚本 vars 互不可见；跨分线命令被拒 | MK1 |
| 手机后台 / 断网 / 杀进程 | 按离线规则结算；恢复身份、控制权与首帧 | MK1 |
| 24–72 h 长跑 | 内存 / 计时器 / 连接 / 积压无增长 | MK3 |

### 10.3 「框架侧完成」与「kit 已形成」判据

- 框架侧完成：worldFixture + kitfix + kitfixContent 在临时根**只新增文件**即可建常驻房、准入校验控制权、按会话裁剪同步、附近 / 世界聊天、组队、两房交接、周期与分线检查点、贡献点装载；每条有变异验证；`verify:all` / `test:int` / `test:faults:int` 绿（MF11 矩阵）。
- kit 已形成：① 干净宿主 pack → install → codegen → bootstrap（两遍，第二遍零 DDL）→ check → `plugin -- test mmo` 闭环，`uninstall` 在有依赖插件 / pending 事件 / 在途交接 / 运行中分线时拒绝；② 灰盒内容包 + 无头测试跑通建角、进图、意图移动、可见性（超视野零泄露）、打怪、掉落认领、装备、附近 / 世界聊天、组队进同分线、两图交接、检查点恢复满足 §7.3 窗口；③ 两个样本只消费冻结的九个面与三个贡献点，第二个接入不增加框架 / kit 条件分支；④ orchestration 事件 / 命令清单、预算数字写进 README 与 validator，harness 对两样本重放绿；⑤ 故障矩阵、容量数据、协议版本、内容包版本与面兼容边界均有记录。

## 11. 决策表

### 11.1 已拍板（2026-09-09）

| # | 决策 | 结论 |
| --- | --- | --- |
| D1 | 首版世界与战斗关系 | 地图内实时战斗；客户端单一世界连接 |
| D2 | 插件扩展范围 | 内容 + 公开 API 编排（§8）；不带 mode / state / wire / SQL |
| D3 | 移动模型 | 连续坐标、服务端权威、客户端只发意图；网格只做候选 / 寻路 |
| D4 | 可见性分级 | 三档；名册 ⛔ 不进 Schema |
| D5 | 首版社交范围 | 组队 + 附近聊天 + 世界聊天（全区服） |
| D6 | 社交归属 | 框架原语（presence / party / channel）；kit 只封装 |
| D7 | 双进程接管 | 设计按跨进程成立；首版只验同进程 |
| D8 | 交付顺序 | 严格边界：框架段只用夹具；kit 等框架验收；游戏等 kit 验收 |
| D9 | 治理前置 | KIT K1 为 MF0；开工前对抗审阅为 MF1 |
| D10 | 模拟 / 传输分离 | WorldRuntime 无头；首版同进程 |
| D11 | 恢复 | 角色 + 分线两级检查点；事件按 instanceId 序号；回退窗口逐类冻结 |
| D12 | 落点 | `docs/MMO.md`；进 CLAUDE.md / AGENTS.md 索引 |
| D13 | WorldRoom 形态 | 另立 + 抽共享层（⛔ 不在 GameRoom 上叠） |
| D14 | 框架身份表名 | `persona`（避开 `player/character.ts`）；kit 对外 `characterId` |
| D15 | 交接 / 分线登记表 | 框架自有 `world_instance` / `world_transfer`；kit 不建 `k_mmo_transfer` |
| D16 | 附近聊天 | 框架 core 世界 token `c2s/s2c.world.chat` |
| D17 | 贡献点形态 | `contributions.<id> = { kind: data \| module, … }`；三贡献点 content / presentation / orchestration |
| D18 | 第二样本 | `mmohold`（据点争夺）；⛔ 不预绑 Knight Online |
| D19 | SQL 权威视图房形态 | 可跑在 GameRoom dropIn 上，不需要 MF2 / MF4 / MF8；AOI 只用 MF5 原语，⛔ kit 内不自建；`slg` kit 登记为 MF5 第二消费方（§4.1.1 / §6.7，2026-09-09 由 slg.md 审核引出） |

### 11.2 待 MF1 决定

| 项 | 说明 |
| --- | --- |
| AOI 载体 | 实验数据后定（缺省消息级；StateView 只在明显占优且版本差 / `.d.ts` 解决时改选） |
| `LOBBY_PROTOCOL_VERSION` 是否 bump | 新增 party / chat / world 域缺省不 bump（arena 先例，EXTRAS X4 口径），破坏性才 bump；人工决策写入提交信息 |
| kill criterion 数字 | 基准台实测后冻结 |
| `persona` 命名复核 | 与 `player/character.ts` 的关系在 MF2 文档里写清；如同事更倾向别的词在 MF1 改，之后不再改 |
| 空实例策略缺省 | `run` / `sleep` / `unload` 的缺省与 `emptyAfterMs` 候选值 |

## 12. 实施状态回写

> 未立项。每阶段完成在此登记一行（阶段 / 日期 / commit / 实际交付与基准结果 / 偏差）。⛔ 不向 plan-v5 回写。

- （无记录）

下一动作：同事按 mmo1 §4 四条对照本文 §4 / §7 / §9 做第二轮审阅 → MF0 与 MF1 并行开工（MF1 = 本文对抗审阅 + 基准台 + AOI 实验）。
