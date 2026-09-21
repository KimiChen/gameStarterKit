# MMO 整合设计基线：Nakama 定形、AzerothCore 定实、gameStarterKit 定则

> - 日期：2026-09-09（v1）；2026-09-19 按 [MMO-REVIEW.md](MMO-REVIEW.md) M01–M20 修订为 **v1.1**（用户逐条拍板），同日按 [MMO-PLAN.md](MMO-PLAN.md) §7 施工细化 P1–P7 与 PS0 进程形态拍板（D27）升 **v1.2**。本仓基线 `26da7e5`。状态：**整合设计基线 v1.2；MF0 / MF1 / MF3 / MF6a / MF7a / MF9 / MF2 / MF5a / MF4 / MF5b / MF7b / MF6b / MF8 / MF10 / MF11 已退出（§12，波 1–6 全部退出 = **框架段 MF0–MF11 完成，tag `mmo-framework-v1`**），§11.2 数字已冻结；**`mmo` kit MK0 骨架已于 2026-09-20 退出（§12，tag `mk0-exit`）；MK1 世界闭环 B1–B6 同日交付、退出待拍板（场景 B 100 人热点未达 kill criterion，§12 MK1 行）**，slg / lvr 无人在线结算可开工**；⛔ 尚无任何内容插件（MG 段），kit 段不改变既有承诺。
> - 来历：2026-09-08 四份并行草案经一轮对比合成本文；⚠ 五份材料**未入库**（工作树与 git 历史均无），自 v1.1 起正文不再引用它们的编号，全部结论自包含。审阅记录以 [MMO-REVIEW.md](MMO-REVIEW.md) 的 M 编号引用；2026-09-09 的 R 系列审阅原文同样未入库（见 §12）。
> - 定位：MMO 能力域的技术基线，与 [Non-intrusive.md](Non-intrusive.md) 之于 plugin / gameplay module 同一地位。
> - 治理：⛔ 不进 plan-v5；实施状态只在本文 §12 回写；开放项如被立项，去向登记遵循 EXTRAS §5.2。
> - 自包含：只引用 Nakama / AzerothCore 上游与本仓已入库文件；本轮对上游的描述来自公开文档与源码结构，MF1 建立带 commit 的引用锁并复核。
> - 用户给定四目标（2026-09-08）：① 补足本仓对 MMO 的支持；② 按 Non-intrusive 的做法**框架侧阶段先行、玩法后挂**；
>   ③ 产出一个 MMO kit 作为开发 MMO 的地基；④ 之后的具体游戏是 snake 级别的新增式改动，**只消费 kit 与框架**。
>   本文展开为三层交付：框架阶段 **MF0–MF11**（§5–§6；MF5 / MF7 各分 a / b 两半，§5.1）→ `mmo` kit **MK0–MK4**（§7–§8）→ 内容插件 **MG0–MG2**（§9）。

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
| 存档 | 无 | `PlayerSave.Interval` + 强制点 | 事件驱动落库；无周期快照 | **MF7b** |
| 运维 / 扩展 | Console；Enterprise 集群 | GM 命令；一进程一 realm | `/monitor`（非生产）；RedisDriver / Presence 探针已实测未启用 | **MF10** |

### 2.2 Nakama 对 MMO 的七处不足（以 AzerothCore 补）

| # | 缺什么 | AzerothCore 解法 | 本仓落点 |
| --- | --- | --- | --- |
| N1 | 无世界 / 实体 / 角色模型 | 三库分工 + 对象层级 + 模板表 | MF2 persona；kit `world` / `content` |
| N2 | 有子集广播原语，无空间索引与可见性算法 | Grid / Cell + 通知器 + 三种更新块 | MF5 兴趣集原语；kit 网格索引 |
| N3 | presence / party / chat 都有，但与世界无绑定（附近频道要自己算） | 附近 = 视野 | MF6b：附近聊天绑兴趣集 |
| N4 | 无跨 match 角色交接 | `TeleportTo` 三段式 | MF8 |
| N5 | match 状态不落盘 | 周期存档 + 强制点 | MF7b（角色级 + 分线级） |
| N6 | 无 AI / 战斗 / 掉落 / 副本 | 对应子系统 | kit 各面 |
| N7 | 模块只能注册 RPC / hook，不能向核心交数据内容 | `modules/` 随包 SQL 与脚本 | MF9 贡献点（⛔ 不给插件 SQL） |

### 2.3 不搬与保留

- **AzerothCore 不搬**：客户端权威移动；一 realm 一进程 + 线程池；裸 SQL 无幂等；WoW 协议 / 数据；**AGPL-3.0 代码零行、SQL 零条进仓，⛔ 不做「翻译成 TS」**。
- **Nakama 不搬**：依赖与代码；存储 / 钱包实现；集群。
- **本仓保留且更强**：幂等 v2（lease + CAS + inspect）、fence-on-write、outbox / relayer / 死信、kit 迁移账本、按区表登记、冷档契约、wire catalog 全链路闸、协议指纹、protected-paths 矩阵。MMO 每条持久写路径都落在其上，⛔ 不开例外。
- **授权登记**：实施期每次「参考了上游某文件」在提交信息写「设计对照：<仓>/<路径>@<commit>」（snake 素材台账同一纪律）。Knight Online 内容若做，是第三个内容插件，法律边界另立项，⛔ 不绑进框架与 kit 验收。

引用锚点（MF1 复核）：Nakama 官方文档 Authoritative Multiplayer / Streams / Storage / Parties / Chat / Server Framework（2026-09-08 访问）；
AzerothCore 固定 `a5e0e6b8f2bf878cb45cb1dc2251eb1448b9bbc3`（2026-09-08 master HEAD 快照，内容与所引文件无关）；**引用锁按文件 blob**（MF1，2026-09-19 经 GitHub contents API 复核，M19）：

| 文件 | blob |
| --- | --- |
| `src/server/game/Maps/Map.cpp` | `5a832625e93263a2f2e210c261b099dc508331fa` |
| `src/server/game/Maps/MapInstanced.cpp` | `cbe0a3a17ed46aa0748a246539e9a4d513b99547` |
| `src/server/game/Grids/Notifiers/GridNotifiers.cpp` | `e38c8030c9a40dc5f05da543ca1ba1181b205ba6` |
| `src/server/game/Entities/Player/PlayerStorage.cpp` | `39928eb6fa7fd086b3812cd0736b46a95fad3783` |
| `src/server/game/Handlers/MovementHandler.cpp` | `f21b8464de6f362c21cc2bdf0f4f30c1df483f33` |
| `src/server/game/Entities/Creature/Creature.cpp` | `8e0b7b11a3b5a340320d4a73e6fd21572650afc9` |
| `src/common/Utilities/EventMap.cpp` | `1b175a47ef1ae8763cff3ec05170905a344af39e` |

## 3. 本仓基线核对（2026-09-09 只读核验）

| 已有 | 缺口 |
| --- | --- |
| GameRoom 对局运行时：认证 / 区号复核、`filterBy`、join 信封、20 Hz fixed-step + catch-up、catch-all dispatcher（预算 → owner → exact validate → rateCost → phase）、重连宽限、drop-in / 私房 / ticket | 常驻房型不存在；GameRoom 2214 行且认证 / 调度 / 预算 / 对局语义同居一文件（MF3 抽取的动机），⛔ 不在其上叠 MMO 语义 |
| kit K0 全链（arena + arenaShop）：多 mode、多 api 面、`requires.kits` 正反向闸、`withKitTx`、`k_<id>_*` per-zone + `kit_migration` 账本 | KIT K1 未实施（客户端 / shared 侧 kit-api 导入边界、`.conn` 禁令、pending outbox 卸载闸）→ **MF0** |
| 身份与经济：外部契约、`user_currency` + ledger、幂等 v2、outbox、`singleton_lease` | 无 persona；资产主体只有 account |
| 同步：snake 分块 baseline + 有序 delta + checksum + cursor | 全房同视图；无兴趣集、enter / leave、背压 |
| **移动先例**：ballMove 客户端只发 `dirX/dirY ∈ [-1,1]`，服务端常量速度积分并 clamp（`apps/server/src/rooms/modes/ballMove/rules.ts:92-96`）；snake `SpatialGrid` 只产生碰撞候选（`modes/snake/world.ts:121-160`） | — （直接沿用） |
| **投递**：`websocket/push.ts` 每进程本地在线表；`pushToUser` / `pushToGuild` / `pushToAll` 都不跨节点；跨进程只有「每节点 XREAD 整条流 + 本地过滤」（`core/infra/streamConsumer.ts`，mailwake / kick） | 无区服级广播、无多 uid 定向投递；`pushToGuild` 多节点下静默丢 |
| **guild 先例**：成员 = 档字段 `guildId`；事件 `INCR seq` + 有界 `LPUSH`；push 只带 `{seq, guildId}`；客户端 `guild.getEvents` 自愈 | 无名册存储 |
| **房内 Chat**：100 字、rateCost 1、全房无条件广播（`GameRoom.ts:801-813`） | 不可跨房 |
| **StateView**：`@colyseus/schema` 4.0.27 / core 0.17.44 有 `client.view`；vendored 客户端 bundle（schema 4.0.13）含 `StateView` 类，手写 `.d.ts` 无 | 首版 per-session 统一走消息流；StateView 只作 MF1 对照实验 |
| **多进程探针** `apps/server/tools/m0/colyseus-redis-probe.ts`：RedisDriver / Presence 两节点跨进程撮合、定向建房、`kill -9` 后约 4 s 惰性清理 | 键不可前缀、必须独立 Redis 实例（`app.config.ts:74-79`）；无按房租约 |
| 租约：`singleton_lease`（MySQL，预置行只有 `outbox_relayer` / `freeze_worker` / `db_bootstrap`）、per-uid Redis 锁 + fence（`core/locks.ts`）；`roomEpochId` 只是身份令牌 | 世界房权威租约是新原语；kit worker 的租约守卫事务是新接缝（MF7a） |
| **`test:changed`**：按单条路径判认领，两包同改仍走快路径（`apps/server/tools/plugin/changed.ts:200-226`，`test/plugin-changed.test.ts:116-130`） | ⛔ 不是无侵入证明；验收用完整 diff 分类（§9.4） |

## 4. 目标形态

### 4.1 三层职责

| 层 | 交付 | ⛔ 不放入 |
| --- | --- | --- |
| 框架（MF0–MF11） | persona 与资产主体、WorldRoom / WorldRuntime、权威租约与控制权、兴趣集同步、presence / party / channel、检查点与世界事件、交接与凭据、贡献点 / fragment / 带参 launch、容量与运维 | 任何地图 / 职业 / 技能 / 物品 / 数值；格长、视野半径等参数 |
| `mmo` kit（MK0–MK4） | mode `mmoWorld` 与其 wire / state；`k_mmo_*` 表；九个 api 面；内容包 schema；编排运行器；客户端世界引擎与角色选择页；默认 HUD | 绕过框架的账本 / 身份 / 租约 / 在线表；任何一款游戏的内容与美术 |
| 内容插件（MG0–MG2） | `plugin.json`（`requires.kits.mmo` + `contributes.mmo`）；内容包；表现映射；编排模块；自有 Lobby RPC 域与页面；美术；测试 | SQL、wire、mode、对 kit 内部模块的 import |

### 4.1.1 两种世界形态（2026-09-09 SLG 已采纳；2026-09-19 登记 lvr 并按 MF5 / MF7 拆半更新）

| 世界形态 | 权威数据 | 房间职责 | 共用框架能力 | 消费方 |
| --- | --- | --- | --- | --- |
| 内存权威世界 | WorldRuntime 内存 + 检查点 | WorldRoom 常驻、租约、控制权、drain 与恢复 | MF2 / MF4 / MF5b / MF6 / MF7b / MF8 | `mmo` kit |
| SQL 权威 + 视图房 | `k_<id>_*` 表与耐久操作回执 | dropIn GameRoom 实时视图，无人销毁、重建从 SQL 拉取 | **MF5a** 观察者同步（GameRoom 路径 + D4 名册分离）；**MF7a** 通用 kit worker；MF6a 推送；MF9 贡献点 | `arena` 已有 SQL 样例；`slg` 大地图 / 行军阶段 1 / 2a 已验收，2b 等 MF5a，无人在线结算等 MF7a；**`lvr`**（[lvr.md](../lvr.md)，2026-09-18 规划 v1，未开工）：实时视图房 `lvrWorld` / 海战 / 波次 BOSS 等 MF5a，定时推进 / 排行定格 / 保留期清理等 MF7a（lvr.md §4.3 拍板 P4），联盟 / 聊天 / 援助推送用 MF6a，活动模块插件化等 MF9 |

SQL 视图房消费方不需要 persona、世界权威租约、交接或内存检查点——这正是 §5 把 MF5 / MF7 各拆成 a / b 两半的原因：a 半边只依赖 MF1（MF5a 另需 MF3 的共享层），⛔ 不等门①（MF2）与门③（MF4）。SLG 阶段 1 / 2a 不依赖房间，阶段 2b 等待 MF5a，kit 不自建 AOI 差分 / 投递内核。满员后 `joinOrCreate` 可开第二房，各房自持 SQL 日志游标，正确性由同事务变更日志与定期对账保证，Redis 仅提示；跨房恢复须单独验收。

SLG 正式名册不广播全房 id/name，只随视野内地块 / 军队提供必要归属，视口只在服务端会话表；MF5a 必须把 GameRoom 内部名册需求与客户端 Schema 投影分离（落地形态 = manifest `roster` 开关，见 MF5a 细表），不能把现有 `players` map 当作 D4 的默许例外。相关冻结决策见根 [slg.md](../slg.md) 第三、四轮拍板。本段是消费边界与待实施契约，不表示 MF5 / MF7 已交付。

两条对 SQL 权威消费方的边界说明（2026-09-19，M10）：

- **主体模型并存**：MF2 的资产主体 `AssetOwner` 缺省 `account(uid)`，SQL 权威 kit 继续以 `(uid, server_id)` 为主体键（lvr 已拍板不预留 persona），MF2 迁移对它们零变；⛔ 不要求 kit 表预留 `owner_id`。
- **MF8 ⛔ 不提供跨区**：MF8 是 persona 在**同一区服**的 WorldAddress 之间交接，`sId` 是账号 / 经济 / 冷档的隔离维度（§1），本文任何阶段都不提供跨 `sId` 能力。SQL 权威消费方的「跨服」诉求（如 lvr 的 GVG / 王城战）不是 MF8 的消费方，需另立项。

### 4.2 运行结构（目标形态，除「已有」外均需实现）

```text
┌──────────── 本地基础设施（已有）────────────────────────────────────────────┐
│ durable Redis（热档 / fence / 幂等 / outbox / presence）  coord Redis（kick / push 流） │
│ MySQL（框架表 + persona + world_instance + world_transfer + k_mmo_*）           │
└─────▲──────────────────────────────────────────────────▲──────────────────┘
      │ UoW / outbox / kitApi / withWorldTx（MF2/MF7b）       │ kit worker（MF7a 入口 + MF7b 事件）：世界事件消费、交接清理
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
│ Schema：全图公开的分线元数据 ｜ 消息流：按会话兴趣集裁剪的 baseline + delta + private（MF5b）        │
│ core 世界 token：c2s/s2c.world.chat（附近聊天，perSession，MF6b）                                   │
│ ┌──── WorldRuntime（无头，MF4）：kit `mmoWorld` mode：命令 → 移动积分 → 战斗 → AI 分桶 → 编排事件 → AOI 差集 → 出站 ┐ │
│ └──── 内容包 + 编排模块（插件经贡献点提供，MF9）                                                     ┘ │
└──────────────────────────────────────────────────────────────────────────────┘
      ▲ 竖屏 Cocos 客户端（已有壳）：Lobby 常驻 + 一条世界连接；kit 世界引擎（bitECS 实体池 + 插值 + 相机）+ FGUI HUD
```

进程形态（v1.2，D27）：lobby（LobbyRoom + 框架域 + 在线表 / push / kick / mailwake）、game（GameRoom 全部 match mode）、world（WorldRoom）**三个进程**，各自 `apps/server/src/entries/<name>.ts` + `<name>.config.ts` + 端口（`LOBBY_PORT` / `GAME_PORT` / `WORLD_PORT`，缺省都等于 `PORT`）；本地 `npm run dev` 缺省仍是合体入口（`index.ts` 合并三份 config），`dev:split` 起三进程；客户端从游戏 HTTP `/version` 取 `lobbyWs / gameWs / worldWs`（缺省回落目录的 `gameWsUrl`，⛔ 不动外部 WebPlatform 契约；反代按路径分流是部署选项）；lobby ↔ world 只经 coord Redis 流（§6.3 `kind=room`）与 MySQL 表互通，world 进程也跑 push 消费者但只处理 `kind=room`；`room.resolve` ⛔ 不再读 matchmaker 房间快照（入座结论由 GameRoom admission 给出）。Colyseus 的 matchmaker 是进程级单例，拆分单位只能是进程。施工批次见 MMO-PLAN.md §5（PS1–PS5）。

### 4.3 同步模型：三档可见性 + 兴趣集

| 档 | 内容 | 通道 | 谁决定 |
| --- | --- | --- | --- |
| 全图公开 | 分线元数据（tick / phase / mapId / line / authorityEpoch / 在线数 / 脚本状态 rev） | Colyseus Schema root（全房） | 框架 |
| 视野内 | 名片（名字 / 职业 / 等级 / 外观 / 阵营 / 队友位）+ 位置 + 战斗态 | `perSession` 的 `enter`（完整）/ `update`（变化）/ `leave`（id）+ 同 tick 有序事件，**单 seq 流** | 候选来自网格（kit），授权由 kit 可见性规则（隐身 / 阵营 / 位面）决定，投递由框架 |
| 本人私有 | 背包 / 冷却 / 任务 / 回执 / 脚本 prompt | `perSession` 的 `private` 流 | kit |

- ⛔ 名册不进 Schema：客户端不能枚举视野外玩家的身份（D4；GameRoom 路径的落地形态见 MF5a 的 `roster` 开关）。
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

空实例策略（manifest `world.emptyPolicy` / `emptyAfterMs`，MF1 冻结 2026-09-19）：

| 策略 | 语义 | 用途 |
| --- | --- | --- |
| `sleep`（缺省） | 最后一个会话离开 `emptyAfterMs`（冻结 120 s）后停固定步，保留内存与租约并继续续租；有人准入即续跑，⛔ 不重放 | 普通野外图：省 CPU、秒回 |
| `run` | 空实例照常推进（AI / 脚本 / 复活继续），周期检查点照写 | 有定时脚本或跨玩家世界事件的图（boss 刷新表） |
| `unload` | `emptyAfterMs` 后强制检查点 → Draining → Offline，释放租约；下次准入走 Recovering 从检查点重建 | 副本 / 活动图 |

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
| 编号 | `MF`（MMO-Framework）；⛔ 不复用 KIT.md 的 `K`、SERVER.md 的 `M`。**MF5 / MF7 各分 a / b 两半**（2026-09-19，M02）：a = 不需要 WorldRoom / persona / 检查点的通用半边（GameRoom 路径 / kit worker），b = WorldRoom 接入半边；裸写 MF5 / MF7 = 两半都退出（slg.md / lvr.md 的既有引用按此解释） |
| 单向门 ① | MF2：`schema.sql` 资产主体主键迁移 |
| 单向门 ② | MF3：GameRoom 共享层抽取的 writer 切换（抽取与消费同一提交，⛔ 无双份中间态） |
| 单向门 ③ | MF4：世界协议身份 `WORLD_ROOM_PROTOCOL_VERSION = 1`（Non-intrusive §4.8 拆分先例；⛔ 不 bump `GAME_ROOM_PROTOCOL_VERSION`）；世界 join 信封字段（`personaId` / `ticket` / `line` / `resumeSeq`）**一次定型** |
| 部署门 | MF10 生产启用 RedisDriver / Presence 后回退需 drain 全部世界房 |
| 门的互斥 | 门① 与门② **互不依赖、可并行**（M05）；③ 需要 ① 与 ② 都完成：① 完成并 drain pending outbox、② 回归绿。⛔ 不再要求 ① 先于 ② |
| 夹具 | 框架段只用中性夹具：`worldFixture`（入库的框架 world mode，`wireExposed:false`，同 `privateFixture` 先例）、`kitfix`（临时根物化的夹具 kit）、`kitfixContent`（临时根物化的夹具插件）、`aoi-probe`（`tools/world-bench/aoi-probe.ts`，MF1 对照实验，裸 Colyseus 房，⛔ 不是 gameplay 夹具）、`world-bench` 剧本。⛔ 框架段任何提交不得出现 `apps/kits/mmo/`、`k_mmo_*`、`mmo` 域名 |
| 共同动线 | codegen `--write` / `--check` 分离 → `sync:shared` → 协议真源变动时 `node scripts/protocol-fingerprint.mjs --write` → `scripts/protected-paths.json` 同批登记 → `verify:all` → 涉 Redis / MySQL 的段跑 `test:int`、故障段进 `scripts/fault-matrix.config.json` → 状态只向本文 §12 回写 |
| 验收纪律 | 机检项必须给变异验证（改哪一行 → 哪条用例转红）；给不出的移入人工证据（Non-intrusive §10）；`test:changed` ⛔ 不作无侵入证明 |

### 5.2 依赖图（2026-09-19 重排）

```text
MF0 KIT K1 前置 ─┐（与 MF1 可并行）
MF1 基准台 + AOI 载体实验 + 冻结数字表 ┤  ⛔ 任何框架编码不得早于 MF1 退出
                                      ▼  退出后并行开工：
    ├→ MF3 共享层抽取（门②）──→ MF5a 观察者同步·GameRoom 路径 + D4 名册分离 ──→ slg 2b / lvr 视图房可开工
    ├→ MF6a presence / 投递总线 / party / 世界频道（顺带修 guild 扇出、ServerNotice）
    ├→ MF7a kit worker（workers[] + 租约守卫 KitTx）──→ slg / lvr 无人在线结算可开工
    ├→ MF9 贡献点 / fragment / 带参 launch（只依赖 codegen；MF11 前必须完成）
    └→ MF2 persona / 资产主体（门①，只需先于 MF4）
MF2 + MF3 → MF4 WorldRoom / WorldRuntime / 租约 / 控制权（门③）→ MF5b WorldRoom 接入（需 MF5a）──→ MF6b 附近聊天
                                                             → MF7b 检查点 / 世界事件（需 MF7a）──→ MF8 交接与凭据（用 MF6a 的流做跨房唤醒）
MF10 容量 / 多进程 / 运维（依赖 MF4–MF8）→ MF11 收口审阅与冻结
```

重排说明：

- 交接（MF8）排在检查点（MF7b）之后——Committed 步骤要调用强制检查点，`sourceReleased` 只有在 persona 状态已耐久后才安全；合成 v1 时把草案里「交接先于检查点」的顺序反转即因此。
- 2026-09-19 重排（M02 / M05 / M06）：MF3 是行为等价抽取，与 persona / outbox 无交集，前置改 MF1；MF6a 全部以 uid 为主体，前置改 MF1；MF5 / MF7 各拆两半，a 半边不等 MF4；MF2 只需先于 MF4。单向门语义不变，只是门①不再是所有工作的前置。

### 5.3 阶段总表

| 阶段 | 交付要点 | 退出条件要点（机检） | 回退 | 依赖 | 借鉴 |
| --- | --- | --- | --- | --- | --- |
| **MF0** KIT K1 前置 | 客户端 / shared 侧 kit-api 路径级导入边界；`.conn` 禁令；uninstall 对 pending `kit:<id>:*` outbox 的闸 | 三类反例被拒；arena / arenaShop 回归绿 | 可回退 | 无 | KIT.md §9 K1 |
| **MF1** 基线与冻结 | 开门审阅已消化（MMO-REVIEW M01–M20，2026-09-19，本文 v1.1）；MF1 内再做：引用锁 / 回退窗口表 / 空实例策略表冻结；`tools/world-bench/`；AOI 载体实验；§11.2 冻结数字表拍板 | 基准可重复（偏差 <10%）；载体决定有数字；§11.2 全部由候选变冻结值 | 可回退 | 无 | KIT v1→v2 53 条先例；`tools/m0/` |
| **MF2** persona 与资产主体 | 框架 `persona` 表；`AssetOwner` 进钱包 / 流水 / outbox；`withKitTx` 主体化 + `assertControl`；会话撤销覆盖 persona | 两 persona 钱包隔离；旧路径 owner 全 account；旧 epoch 提交被谓词拒；锁序反例被消 | **门①** | MF1 | Nakama storage 所有权；AC auth / characters 分库 |
| **MF3** 共享层抽取 | `rooms/core/{RoomAuth, WireDispatcher, MessageBudget, ReconnectGrace, S2CPorts}`（进既有 `rooms/core/` 目录）；GameRoom 行为等价改消费 | GameRoom 不再含 auth / dispatcher / 预算实现（可数判据见细表）；全部房间回归 + 变异测试绿 | **门②** | MF1 | Non-intrusive 阶段 1 |
| **MF4** WorldRoom / WorldRuntime / 租约 / 控制权 | `RoomName.World`、世界信封、`WorldMode` 契约、无头 `WorldRuntime`、`WorldRoom` 壳、Redis 权威租约 + MySQL `world_instance.authority_epoch`、persona 控制 CAS、空实例策略、manifest `kind:"world"` | worldFixture 只新增文件即建房 / 准入 / tick / Draining；WorldRuntime 无连接可跑；双登只一个控制权；租约失效拒输入 | **门③** | MF2、MF3 | Nakama match（空 match 继续跑）；AC `MapInstanced` 创建 / 选择 / 加入分步 |
| **MF5a** 观察者同步·GameRoom 路径 | `defineS2C(..., { perSession, coalesceKey? })` + `GAME_WIRE_PER_SESSION`；`rooms/core/{InterestSet, ObserverSync, Baseline, OutboundQueue}`；S2CPorts 对 perSession fail-closed；GameRoom / GameMode 消费路径 + D4 名册分离（manifest `roster`）；kitfix 双房 SQL 视图房夹具；三档数据分级落地 | 超视距互不可见；跨格 enter / leave 各一次；私有字段零泄露；perSession 广播被拒；背压超限重同步；`roster:"hidden"` 根无 `players`；既有 mode 生成物字节不变 | 可回退 | MF1、MF3 | Nakama 子集广播；snake baseline / delta |
| **MF5b** 观察者同步·WorldRoom 接入 | WorldRoom 每 tick 排空出站、重连 / 兴趣集突变 baseline；worldFixture perSession token 全族；客户端 `WorldRoomTransport` reconcile 端口 | 同一矩阵在 worldFixture 上逐项通过 | 可回退 | MF4、MF5a | AC 三态更新块 |
| **MF6a** presence / 投递总线 / party / 世界频道 | `kPresence` + `NODE_ID`；`K_STREAM_PUSH` + `pushToUsers` / `pushToRealm`；party 五键 Lua + 域 `party` + push；域 `chat`（realm / party）+ push `chat.message` | 两节点各只送本节点在线；跨区隔离；seq 空洞自愈；并发入队不超员 | 可回退 | MF1 | Nakama presence / party / chat；本仓 mailwake / kick / guild events |
| **MF6b** 附近聊天 | core 世界 token `c2s/s2c.world.chat`（perSession）；`WorldMode.primaryEntityOf` | 只到兴趣集含说话者的会话；`broadcastS2C` 被拒 | 可回退 | MF5b | AC 视野即听域 |
| **MF7a** kit worker（通用 SQL） | `kit.json.workers[]` + `sql.tables[].role`（kit-schema v1 增量可选字段）→ bootstrap 预置 `singleton_lease` 行 → `workers/kitWorker.ts` 入口；租约守卫受限 KitTx `withKitWorkerTx`（同连接同事务首句 fence 校验）；uninstall 对 pending 事件行 / 持有中 worker 的闸；SQL worker 夹具 | 不启动 WorldRoom、不建 persona 的 kitfix worker 可跑；两 worker 争租只一个写；失租写被存储边界拒；未登记 worker 不起；有 pending 行时 uninstall 拒 | 可回退（排空 pending） | MF0 | 本仓 relayer / freezeWorker；`singleton_lease` 守卫首句；SLG S6 |
| **MF7b** 检查点 / 世界事件 | `CheckpointPort`（persona 级 + 分线级）；`withWorldTx`（authority_epoch fence CAS 首句）；`WorldEventPort` + 事件批与分线检查点的原子规则（§7.3） | 杀房重启：位置回退 ≤ 1 周期、货币 / 装备 0 回退；崩溃后事件不重复发奖；旧 owner 写被存储边界拒 | 可回退（排空 pending） | MF4、MF7a | AC `PlayerSave` 周期 + 强制点；本仓 outbox |
| **MF8** 交接与一次性凭据 | 框架 `world_transfer` 表 + 状态机 + 持久 CAS；`WorldTicket`（复用 `kRoomTicket` 形态）；准入固定时序；域 `world.enter` / `world.resolveTransfer`；客户端 `transfer` strategy；跨房唤醒经 `K_STREAM_PUSH kind=room`（best-effort） | 四注入下只激活一次、只扣一次费；旧房迟到写被拒；预留到期释放；凭据一次性 | 需清理在途 transfer | MF6a、MF7b | AC `TeleportTo` 三段式；本仓 access ticket 固定时序 |
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

#### MF1 · 基准台、AOI 载体实验、冻结数字表（开门审阅已于 v1.1 消化）

| 修改面 | 内容 |
| --- | --- |
| 本文 | 开门审阅已消化（[MMO-REVIEW.md](MMO-REVIEW.md) M01–M20 逐条落在正文，§12 有登记）；MF1 内再做：引用锁（按文件 blob）；**回退窗口表**（§7.3）与**空实例策略表**（`run` / `sleep(afterMs)` / `unload(afterMs)`）冻结；§11.2 冻结数字表由候选变冻结值；框架待修改路径清单 |
| `apps/server/tools/world-bench/`（新） | 证据生成器（⛔ 不进 `verify:core`，同 `tools/m0/`）：N 机器人 × M 脚本实体固定剧本，记录 tick p95 / p99、每会话出站字节、baseline 体积、内存；先对 snake 房出「当前基线」；输出 `docs/perf/world-bench/<date>-<scenario>.json`（已核：`scripts/verify-perf-baseline.mjs` 只读 `docs/perf/client-ballMove-baseline.json`，不 glob 该目录，v1.2 P6） |
| `apps/server/tools/world-bench/aoi-probe.ts`（新；**实际落点，偏离原计划的 GameRoom 夹具 `aoiProbeFixture`**） | 对照实验：两间裸 Colyseus 房共用同种子确定性模拟，变体 A = `@view()` + `client.view`（StateView），变体 B = 每会话消息级 delta；比较 sync / sim 耗时、进程 CPU、每会话真实出站字节、join / 重连首 500 ms 字节（结果见 §11.2 与 §12）。⛔ 未做成 gameplay 夹具：StateView 落到生成的 GameRoomState 需 codegen 支持 `@view()`，这本身就是「生成器改动面」的结论；客户端 `.d.ts` 缺口因此也无需本地增补 |

退出条件：基准同剧本两次主要指标偏差 <10%；AOI 载体有实验数字与决定（缺省消息级）；回退窗口与空实例策略冻结；§11.2 冻结数字表全部写成冻结值（2026-09-19 已全部冻结，kill criterion 见该表）。
变异验证：基准剧本种子改一位 → 结果文件 diff 非空（已验）；「私有字段塞进公共块 → 零泄露断言转红」⛔ 未随 aoi-probe 交付（它只比传输成本），归 MF5a 的 `InterestSet` / `ObserverSync` 单测。回滚：可回退。

#### MF2 · persona 与资产主体（门①）

| 修改面 | 内容 |
| --- | --- |
| `apps/server/sql/schema.sql` | 新表 `persona`（per-zone）：`(server_id, persona_id) PK`、`user_id`、`kit_id`、`slot`、`status`、`control_epoch`、`world_address NULL`、`session_generation`、时间戳；`UNIQUE(server_id, user_id, kit_id, slot)`。`user_currency` PK → `(user_id, server_id, owner_kind, owner_id, currency)`；`currency_ledger.uk_idem` 与 `gameplay_outbox` 加 `owner_kind TINYINT DEFAULT 0` / `owner_id VARCHAR(64) DEFAULT ''`（0 = account，存量无损） |
| `apps/server/tools/db-bootstrap.ts` | TS 迁移步（INFORMATION_SCHEMA 守卫先例）在 `singleton_lease('db_bootstrap')` 下一次性完成；已迁移即跳过 |
| `core/infra/zoneTables.ts` | `FRAMEWORK_PER_ZONE_TABLES += persona` |
| `core/economy/{currency,outbox,relayer}.ts` | `debitInTx` / `creditInTx` 加 `owner`（缺省 account）；intent 带 owner；relayer 对 persona 主体只落账本 |
| `core/infra/kitApi.ts` | `KitTx.debit/credit` 可选 `owner`；`tx.assertControl(personaId, controlEpoch)`（`UPDATE persona … WHERE control_epoch=?`，Rows matched 判定）；固定锁序：account uid → persona id 升序。**persona 门面（M03）**：`tx.createPersona(kitId, slot, meta) → personaId`（框架写 `persona` 行；`UNIQUE(server_id, user_id, kit_id, slot)` 冲突抛 `PersonaSlotTaken`；`slot ≥ PERSONA_MAX_SLOTS_HARD` 拒，§11.2）、`tx.deletePersona(personaId)`（仅 `status=inactive` 且 `world_address IS NULL`）、事务外只读 `listPersonas(uid, sId, kitId)`；表闸 `assertKitTableAccess` 对这三个门面豁免（kit 仍 ⛔ 不能直接 SQL 触碰 `persona`）；槽位上限的产品值归 kit（`mmo` 的 `MAX_CHARACTER_SLOTS`），框架只保证唯一与硬上限 |
| `core/infra/keys.ts` | `kCacheCurrency` 带 owner scope |
| `apps/shared/src/protocol/identity.ts`（新） | `AssetOwnerRef` / `PersonaRef` 类型与零依赖校验器 |
| `core/auth/{session,kickBus}.ts` | 撤销 / 踢下线抬高该 uid 全部 persona 的 `session_generation` |

退出条件：`test:int` 同账号两 persona 钱包 / 流水互不可见；shop / mail / redeem / arena / arenaShop / snake 回归绿且新 ledger 行 `owner_kind=0`；旧 `control_epoch` 提交 0 行；乱序锁反例被消；freeze / thaw 证明 persona 表不参与冷档；kitfix 在同一 `withKitTx` 内 `createPersona` + 自有角色行，任一失败整体回滚；超硬上限槽位被拒；kit 表的 `persona_id` ⛔ 无外键（KIT.md §2 禁指向非本 kit 表的 FK），孤儿 persona（有 persona 行无 kit 角色行）由 kit 只读对账标 `orphan` 后 `deletePersona` 清理，有用例。
变异验证：删 `assertControl` 的 `control_epoch=?` 谓词 → 「旧 epoch 延迟提交」转红；owner 缺省改 persona → arenaShop 回归转红；交换锁序 → 死锁用例转红；`createPersona` 忽略 UNIQUE 冲突 → 「同槽二建」转红。
回滚：**单向门**——发布前 drain 全部 pending outbox；回退需再迁一次。

#### MF3 · 共享层抽取（门②）

| 修改面 | 内容 |
| --- | --- |
| `apps/server/src/rooms/core/RoomAuth.ts`（新） | 自 `GameRoom.onAuth` 抽出：join options 校验 → 房型协议整数比对（注入常量）→ mode / modeVersion / profile → 区号复核 → token → session verify |
| `rooms/core/WireDispatcher.ts`（新） | 固定序：预算 → owner → exact validate → rateCost → phase（谓词注入）→ handler；catch-all `messages["_"]` 形态不变 |
| `rooms/core/{MessageBudget,ReconnectGrace,S2CPorts}.ts`（新） | 预算；重连宽限与 generation fence；`sendS2C` / `broadcastS2C` 的 token dir / owner / validate 闸 |
| `rooms/GameRoom.ts` | 同一提交改为消费者；对局语义留原处 |
| `scripts/protected-paths.json` | 把**既有**目录 `apps/server/src/rooms/core/**`（今已有 AccessPolicy / RoomProfile / StartPolicy；`tools/plugin/ownership.ts` 列为硬排除但 protected-paths 无此条，PLUGIN-REVIEW F03 遗留）整目录登进 gameplayFlow，新五件随之受保护；Non-intrusive §12.2 散文视图同批 |
| 测试 | 既有 dispatch / wire-contract / version-matrix / snake-room / private-room / drop-in / arena / fault-mutation 零改动全绿；新增 `rooms-core-import-ban.test.ts`（`rooms/core/**` ⛔ import `modes/`、`websocket/`） |

退出条件（可数，⛔ 不用行数）：`GameRoom.ts` 不再 import `core/auth/session`（会话校验只经 RoomAuth）；`GameRoom.ts` 中无 `validateC2SPayload(` 调用；`MessageBudget` 在 `GameRoom.ts` 只以类型出现，实现只在 `rooms/core/MessageBudget.ts` 一处；`GAME_ROOM_PROTOCOL_VERSION` 在 `GameRoom.ts` 出现 0 次（由 RoomAuth 注入）；全仓 auth / dispatcher / 预算实现各一处。
变异验证：owner 闸挪到 exact validate 之后 → snake owner 隔离用例转红；删 RoomAuth 版本比对 → `protocol-version-matrix` 转红；删重连 generation 比对 → 迟到重连用例转红。
回滚：**单向门**——抽取与消费切换同一提交；中止整批 revert。

#### MF4 · WorldRoom / WorldRuntime / 权威租约 / 控制权（门③）

| 修改面 | 内容 |
| --- | --- |
| `apps/shared/src/protocol/rooms.ts` | `RoomName.World`；`IWorldRoomJoinOptions { v, token, sId, mode, modeVersion, mapId, line?, personaId, ticket, resumeSeq? }`（一次定型）；`WORLD_ROOM_PROTOCOL_VERSION = 1`；`WorldPhase = Recovering \| Active \| Draining \| Offline` |
| `apps/shared/src/constants/errors.ts` | `WorldNotAuthoritative`、`ControlConflict`、`WorldTicketInvalid`、`WorldDraining` |
| `tools/gameplay-codegen/{gameplay-schema-v1.json,lib.ts}` | manifest 可选 `kind: "match" \| "world"`（缺省 match）；`world: { emptyPolicy, emptyAfterMs, checkpointMs }`；**world 根必填集 `{tick, phase:WorldPhase, instanceId, mapId, line, authorityEpoch}`，⛔ 禁止 `players` map**——经 MF5a 的 manifest `roster` 开关实现（`kind:"world"` ⇒ 恒 `hidden`）；`stateRenderer.ts` 的开关改动归先落地者（缺省 MF5a），另一方只消费，⛔ 不做两份；生成 `WORLD_MODE_IDS`，world mode 登进 `worldModeRegistry` |
| `rooms/WorldMode.ts`（新） | §4.5 契约（⛔ 不继承 `GameMode`） |
| `rooms/core/WorldRuntime.ts`（新） | 无头模拟宿主：注入时钟、固定步累积 + catch-up 上限（自 `GameRoom.stepFixed` / `update` 抽出）、命令队列、生命周期状态机；⛔ 不 import `colyseus`（机检） |
| `rooms/WorldRoom.ts`（新） | 传输壳：`autoDispose=false`；`onAuth` → RoomAuth（比 `WORLD_ROOM_PROTOCOL_VERSION`）；准入：ticket 占位 → 控制 CAS → `onAdmit`；会话表（容量按会话表，不按 state）；喂 C2S 进 WorldRuntime、按 tick 排空出站；租约失效 → Draining |
| `rooms/core/WorldProfile.ts`（新） | profile `"world"`：AccessPolicy `world-ticket`，无 StartPolicy（⛔ 不往 `StartPolicy` 加 always-on 变体）；`assertRoomProfilesConfigured` 跳过 `kind:"world"`；与 evidence / invite-code 互斥 |
| `rooms/core/WorldLease.ts`、`core/infra/{keys,redisScripts,config}.ts` | Redis 权威租约：`kWorldFence(sId, instanceId)` INCR 发号 + `kWorldLease` `SET NX PX WORLD_LEASE_TTL_MS`；续租 `CAS_RENEW` Lua（`renew*3 ≤ ttl` 加载期断言）；丢租 → Draining；⛔ 不逐 tick 碰 MySQL |
| `schema.sql`（只新增表） | `world_instance`（per-zone）：`(server_id, instance_id) PK`、`map_id`、`line`、`authority_epoch`、`holder`、`state`、`checkpoint_rev`、`write_seq`（MF7b `withWorldTx` 首句 CAS 用，建表时就带上，避免二次迁移，v1.2 P1）、`updated_at`；`UNIQUE(server_id, map_id, line)`；`zoneTables.ts` 登记 |
| `rooms/core/control.ts`（新） | `acquireAuthority(instance) → epoch`（MySQL CAS `authority_epoch+1`）；`acquireControl(persona, worldAddress) → controlEpoch`、`releaseControl`、`assertControl` |
| `rooms/core/WorldDirectory.ts`（新） | `(sId, mapId, line) → instance` 查找 / 建行；v1 进程内 + MySQL 行 |
| `entries/world.ts` + `world.config.ts`（D27：world 独立进程，PS4 已占位入口 + `WORLD_PORT`） | `[RoomName.World]: defineRoom(WorldRoom).filterBy(["sId","mode","profile","mapId","line"])` 登记在 world 进程的 config；合体入口 `index.ts` 合并三份 config 时一并带上；⛔ 不登记进 lobby / game 的 config |
| 客户端 `net/rooms/WorldRoomTransport.ts`（新）、`matchmaking.ts` | strategy `{kind:"world", mapId, line?}`；`RoomClient.ts` / `GameRoomTransport.ts` 零改动 |
| 夹具 `worldFixture` | `kind:"world"`、`profiles:["world"]`；wire `c2s.worldFixture.move {dirX,dirY,seq}`（意图；连续坐标、服务端常量速度积分）；两类实体（移动体 / 静态体），无内容 |
| 测试 | `world-runtime.test.ts`（假时钟、catch-up、Draining 拒新命令）、`world-room.test.ts`、`world-empty-policy.test.ts`、`rooms-core-headless-import.test.ts`；`test:int`：`world-lease.test.ts`（丢租 → Draining；同实例两房争抢只一个 Active）、`world-control.test.ts`（同 persona 两处 join 只一个控制权） |

退出条件：worldFixture 在干净树只新增文件即建房 / 准入 / 推进 / Draining；WorldRuntime 在无 Colyseus 进程内跑完剧本；双登只一个控制权；租约失效拒输入并 Draining；空实例三策略各一用例；`GAME_ROOM_PROTOCOL_VERSION` / `LOBBY_PROTOCOL_VERSION` 不变，`WORLD_ROOM_PROTOCOL_VERSION=1` 进版本矩阵。
变异验证：删 `acquireControl` 的 CAS 谓词 → 双登转红；续租改永不过期 → 「丢租 Draining」转红；`emptyAfterMs` 被忽略 → unload 转红；WorldRuntime 加 `import "colyseus"` → 无头导入闸转红；world 根加 `players` map → codegen 反例转红。
回滚：**单向门③**；代码在首个客户端发版前可 revert；`world_instance` 表回退需清空。

#### MF5a · 观察者同步原语·GameRoom / SQL 视图房路径 + D4 名册分离

| 修改面 | 内容 |
| --- | --- |
| `apps/shared/src/gameplays/defineGameplayWire.ts`、`tools/gameplay-codegen/{wireParser,lib}.ts` | `defineS2C(name, validate, { perSession: true, coalesceKey? })` → 生成 `GAME_WIRE_PER_SESSION`（今 `defineS2C` 只有 (type, validate) 两参） |
| `rooms/core/{InterestSet,ObserverSync,Baseline,OutboundQueue}.ts`（新） | 会话 → 实体集合；`diffAndEmit(session, prev, next)`；只含兴趣集的 baseline（分块 / checksum / cursor 自 `modes/snake/index.ts` 泛化，token 由 mode 注入）；每会话有界队列、按 key 合并（位置）与不可丢（回执）两类策略、超限重同步 |
| `rooms/core/S2CPorts.ts` | `broadcastS2C` 对 perSession token fail-closed（启动期 + 发送期）；今只有 per-client `sendS2C`，无「perSession 广播」概念 |
| `tools/gameplay-codegen/{manifestSchema.ts,gameplay-schema-v1.json,stateRenderer.ts}` + 客户端 stateRenderer 对应端（**M07**） | manifest 可选 `roster: "public" \| "hidden"`（缺省 `public`：既有 mode 生成物字节不变；`hidden`：根不生成 `players` map，`ROOT_LIFECYCLE_FIELDS` 的 `players` 项按 roster 条件化，名册留房内会话表，客户端投影同批）；`kind:"world"` ⇒ 恒 `hidden` |
| `rooms/schema/GameRoomState.ts`（生成物）、`rooms/GameRoom.ts` | `hidden` mode 的 root 无 `players`；GameRoom 内部名册改读会话表（RoomAuth 产出的 seat 表），⛔ 不再依赖 Schema 里的 `players` |
| `GameMode` / `GameRoom` 与客户端对应 adapter | 同一观察者原语接入 SQL 视图房；端口不强制要求 WorldAddress / personaId / authorityEpoch；SLG / lvr 仅消费公开接缝 |
| SQL 视图房夹具 | 用 kitfix 表而非真实 SLG 作为持久真源；两间 dropIn GameRoom 各自恢复投影与兴趣集，覆盖满员第二房、慢会话、断线 baseline、空房销毁重建；夹具 mode 声明 `roster:"hidden"` 并带一个「私有字段」 |
| 协议 | `roster` 缺省 `public` 保证既有 mode 的 Schema 与生成物不变 ⇒ 缺省 ⛔ 不 bump `GAME_ROOM_PROTOCOL_VERSION`；`hidden` 只对新 mode 生效。是否仍要 bump 作为人工决策项登记在 §11.2 |
| 测试 | `observer-sync.test.ts`、`outbound-queue.test.ts`、`visibility-leak.test.ts`（SQL 视图房夹具）、`roster-hidden.test.ts`（hidden 根无 `players`、public 生成物字节不变）、`world-bench` 场景「视野缩小 → 每会话字节下降」 |

退出条件：超视距两会话互不收到；跨格 enter / leave 各一次且顺序正确；重连 baseline 只含兴趣集且 checksum 通过；perSession 全房广播被拒；私有字段对他人零泄露；慢会话超限重同步且回执不丢；`roster:"hidden"` 房的真实 Schema patch 不含名册 / 视口；既有 mode 生成物字节不变。
**MF5a 退出 = slg 2b 开工条件**（slg.md 第四轮拍板与 §10.8：MF5 必须含 GameRoom 消费路径与名册策略验收）；SQL 提交后提示失败、晚提交、删除 / 结束、baseline 期间写入与跨房对账恢复由夹具和 SLG 2b 分别验证。
变异验证：删 leave 分支 → 跨格离开转红；删 perSession 闸 → 广播被拒转红；私有字段塞进 enter → 零泄露转红；删队列上界 → 背压转红；`hidden` 仍渲染 `players` → `roster-hidden` 转红。回滚：可回退。

#### MF5b · 观察者同步原语·WorldRoom 接入

| 修改面 | 内容 |
| --- | --- |
| `rooms/WorldRoom.ts` | 每 tick 排空出站；重连 / 兴趣集突变触发 baseline |
| 客户端 `WorldRoomTransport.ts` | enter / update / leave 与 baseline reconcile 端口 |
| 夹具 | worldFixture wire 加 `s2c.worldFixture.{enter,update,leave,private,baselineBegin,baselineChunk,baselineEnd}`（perSession）；实体带一个「私有字段」 |
| 测试 | `world-visibility-leak.test.ts`；MF5a 的矩阵在 worldFixture 上逐项重跑 |

退出条件：MF5a 的全部退出条件在 worldFixture 上逐项通过。⚠ WorldRoom 单一路径通过 ⛔ 不能作为 SLG 2b 的开工证据（那是 MF5a）。
变异验证：同 MF5a（在 worldFixture 上）。回滚：可回退。

#### MF6a / MF6b · 社交原语

细则见 §6；落点 `core/{presence,push,party,chat}/`、`websocket/{fanout,party,chat}/`、`apps/shared/src/protocol/lobbyRpc/domains/{party,chat}.ts`。
退出条件与变异验证见 §6.6。回滚：可回退（键带 TTL；流按 MINID 裁）。

#### MF7a · kit worker（通用 SQL：`workers[]` + 租约守卫受限 KitTx）

| 修改面 | 内容 |
| --- | --- |
| `tools/plugin/kit-schema-v1.json`、`kits/catalogTypes.ts`、`tools/db-bootstrap.ts` | `workers[]: { id, entry }` 与 `sql.tables[].role`（**kit-schema v1 增量可选字段**，沿 K0-2 `requires` 先例 ⛔ 不 bump schemaVersion；进锁抬头与身份摘要，KIT.md §3 同步，M11）；bootstrap 预置 `singleton_lease` 行 `kit:<id>:<worker>`（ODKU no-op） |
| `apps/server/src/workers/kitWorker.ts`（新） | `npm --workspace @game/server run worker -- <kit>:<worker>`：按登记加载、`tryAcquireLease` / 续租 / 串行 pass（relayer 形态）；未登记即拒；进程入口在 `apps/server/package.json`（框架 PR，lvr.md §4.2 已登记为此依赖） |
| `core/infra/kitApi.ts`：`withKitWorkerTx(kitId, workerId, sId, lease, fn)`（SLG S6） | 框架绑定 kit / worker / 区 / 持有代次，在**同一连接、同一事务**内首句 `UPDATE singleton_lease SET expires_at=… WHERE lease_name=? AND holder=? AND fence_token=?`（0 行抛 `LeaseLostError` 自动 ROLLBACK；首句直接复用既有 `core/infra/lease.ts` 的 `renewLeaseGuard(conn, lease)`，返回 false 即 0 行，⛔ 不另写 SQL，v1.2 P5），再向回调只暴露受限 KitTx；回调不得取原始连接或另开事务绕过守卫；kit ⛔ 不能直接触碰 `singleton_lease`。端口无需 WorldRoom、persona 或检查点；支持有界批次、失租停写、退出、失败重试与回执重放 |
| `tools/plugin/uninstall.ts` | `role:"world-event"` 表 `status=0` > 0 或该 kit 的 worker 租约仍被持有 → 拒 |
| 夹具 `kitfix` | `workers:[…]` + 普通 kitfix SQL 表，无 WorldRoom / persona |
| SQL worker 夹具 | 同进程两个独立 worker 争租，注入旧持有者暂停 / 恢复与事务前后失租，验证失效写拒绝、失败整体回滚、提交丢响应可重放、越表 / 原始连接旁路被拒，以及停止 / 卸载后不再提交 |
| 测试 | `kit-workers.test.ts`；`test:int/kit-worker-lease.test.ts`（争租 / 失租写拒） |

退出条件：不启动 WorldRoom、不创建 persona 的 kitfix worker 可跑；两 worker 争租只一个能写；失租后的写被存储边界拒；已提交结算幂等重放；未登记 worker 不起；有 pending 事件行或持有中租约时 uninstall 拒。跨进程争租证据列后续项（D7：设计按跨进程成立，首版同进程验收）。
变异验证：删 `withKitWorkerTx` 首句的 `fence_token=?` 谓词 → 「失租写成功」转红；worker 跳过登记检查 → 「未登记不起」转红；uninstall 忽略 pending 计数 → 「带 pending 卸载被拒」转红。回滚：可回退（先排空 pending）。

#### MF7b · 检查点 / 世界事件 outbox

| 修改面 | 内容 |
| --- | --- |
| `rooms/core/CheckpointPort.ts`（新） | `savePersona / loadPersona`、`saveInstance / loadInstance`；信封 `{ rev, eventOffset, authorityEpoch, controlEpoch?, schemaVersion, stateHash, snapshot }`；快照内容由 kit 定义，框架只校验信封与版本（不兼容 fail-closed 拒启） |
| `rooms/core/WorldTx.ts`（新） | `withWorldTx(kitId, sId, { instanceId, authorityEpoch, personas?: [{id, controlEpoch}] }, fn)`：RC 事务**首句** `UPDATE world_instance SET write_seq = write_seq + 1 WHERE instance_id=? AND authority_epoch=?`（0 行抛 `AuthorityLostError` 自动 ROLLBACK；⛔ 不碰 `checkpoint_rev`，它只在 `onCheckpoint` 落盘时推进，M18），再逐 persona `assertControl`；暴露 `KitTx` 门面 + `appendWorldEvent`——「存储边界拒旧 epoch」的唯一实现点 |
| `rooms/core/WorldEventPort.ts`（新） | 事件表形态由框架固定（`event_id`、`instance_id`、`seq`、`kind`、`payload`、`status 0/1/2/3`、`attempts`、`checkpoint_rev`），kit 选表名并以 `role:"world-event"` 声明（字段随 MF7a 进 schema）；**事件批与分线检查点的原子规则**见 §7.3（M09）：行带产生它的状态所对应的 `checkpoint_rev`，worker 只执行 `checkpoint_rev ≤` 已落库分线检查点 rev 的行，Recovering 把 `status=0 AND checkpoint_rev >` 恢复点 rev 的行标 `superseded(3)`；至少一次 + 回执去重；死信同 outbox 口径 |
| `WorldRuntime.ts`、`WorldRoom.ts` | 周期 `onCheckpoint`（manifest `checkpointMs`）+ 强制点（drain / leave / 交接 / `checkpointOnDeath` / `setVar durable`）；Recovering 顺序见 §4.5 |
| （卸载闸） | pending 事件行的闸已在 MF7a；`world_transfer` 在途交接的闸随 MF8 落地（表在 MF8 才建，v1.2 P2） |
| 夹具 `kitfix` | `k_kitfix_checkpoint`、`k_kitfix_world_event`（role 声明）；worldFixture 实现 `CheckpointPort` 走 kitfix 表；MF7a 的 worker 消费 kitfix 事件表 |
| 测试 | `world-checkpoint.test.ts`；`test:int/world-crash-restart.test.ts`（同进程两房 A / B，硬杀 A = 停续租 + 跳过 drain；A′ 从检查点恢复；位置回退 ≤ 1 周期、货币 0 回退、A 的迟到 `withWorldTx` 0 行）；`world-event-dedup.test.ts`（含「事件已落库、检查点未落」窗口下崩溃 → 恢复后 `superseded` + 重放只发一次） |

退出条件：上述断言；§7.3 回退窗口表逐行有用例（含新增的「脚本 durable 命令」行）。
变异验证：删检查点 `eventOffset` 关联 → 重启重复发奖转红；删 `withWorldTx` 首句 CAS → 旧 owner 写成功转红；worker 忽略 `checkpoint_rev` 门 → 「检查点未落即崩溃」双发转红。回滚：可回退（先排空 pending 事件）。

#### MF8 · 交接与一次性凭据

| 修改面 | 内容 |
| --- | --- |
| `schema.sql`（只新增表） | `world_transfer`（per-zone）：`(server_id, transfer_id) PK`、`persona_id`、`from_instance`、`to_map`、`to_line`、`to_instance`、`state`（Requested / Prepared / Committed / Activated / Finalized / Cancelled）、`control_epoch`、`ticket_sha256`、`reserve_expires_at`、`payload JSON`；`UNIQUE(server_id, persona_id, active_key)`（终态置 NULL ⇒ 一 persona 只一在途）。**框架自有表，⛔ 不依赖 kit 表** |
| `rooms/core/transfer.ts`（新） | 每步持久 CAS 推进；`transferId` 幂等重放同一结果；Committed 前可取消并释放预留；Committed 后 ⛔ 不回源；超时查持久状态；跨房唤醒经 `K_STREAM_PUSH kind=room`（best-effort，权威仍是表） |
| `rooms/core/WorldTicket.ts`、`keys.ts` | 复用 `kRoomTicket` 形态：一次性、短时、绑定 `(uid, personaId, worldAddress, controlEpoch)`；claim 为 Lua CAS；首次进世界与交接同一路径 |
| `rooms/WorldRoom.ts` | 准入固定时序（SERVER.md §5 邀请码同形）：同步公共拒绝 → 同步占位 → 异步 claim → 同步重验 → `acquireControl` → `onAdmit`；源房 Committed 后冻结该 persona 意图并回收实体 |
| `apps/shared/src/protocol/lobbyRpc/domains/world.ts`（新）、`websocket/world/` | 框架域 `world.enter { personaId, mapId } → { worldAddress, endpoint, ticket }`（`endpoint` = 承载该实例的 world 进程公开地址，来自 `WorldDirectory`，D27）；`world.resolveTransfer { transferId } → { worldAddress, endpoint, ticket }` |
| 客户端 `matchmaking.ts`、`WorldRoomTransport.ts` | strategy `{kind:"transfer", roomId?, ticket}`；退源房 → 带凭据 join → 收 baseline → 恢复输入 |
| 夹具 | worldFixture 两实例（map A / B）+ `c2s.worldFixture.portal` |
| `tools/plugin/uninstall.ts` | `world_transfer` 有该 kit 在途行 → 拒（自 MF7b 挪来，v1.2 P2） |
| 测试 | `world-transfer.test.ts`（注入点 `transfer-source-crash / -target-crash / -reply-lost / -client-drop` 进 `fault-matrix.config.json`）；`test:int/world-transfer.test.ts`；`world-ticket.test.ts` |

退出条件：四注入下只激活一次、只扣一次费；旧房迟到写被 MF7b 存储边界拒；预留随 `transferId` 到期释放；凭据二次使用被拒；重连凭 `transferId` 解析目标。
变异验证：删 Committed 后拒旧 epoch 谓词 → 双激活转红；允许凭据重放 → 转红；删预留 TTL → 泄漏转红。回滚：需数据清理——收敛全部在途 transfer。

#### MF9 · 贡献点 / fragment / 带参 launch（可并行）

| 修改面 | 内容 |
| --- | --- |
| `tools/plugin/{kit-schema-v1,plugin-schema-v2}.json` | `contributions: { <id>: { kind: "data" \| "module", end(s), export \| schema } }` 与 `fragments: [<name>]`（kit-schema **v1 增量可选字段**）；`contributes: { <kitId>: { <id>: <路径> } }`（plugin-schema v2 增量可选；路径必须 ⊆ 插件所有权集）；三者都沿 K0-2 `requires` 先例 ⛔ 不 bump schemaVersion，进锁抬头与身份摘要（KIT.md §3，M11）；`launch.payload` / `launch.profile`（EXTRAS X1） |
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
| `world.config.ts`、`config.ts` | `WORLD_MULTI_PROCESS=1` 只在**多个 world 进程之间**启用 RedisDriver / Presence（lobby / game 进程不需要：客户端不 `joinOrCreate` 世界房，由 `world.enter` 按 `WorldDirectory` 选节点后直连，D27）；`REDIS_COLYSEUS_URL` 必须 ≠ durable / coord（加载期断言）；`selectProcessIdToCreateRoom` 放置钩子；`WorldDirectory` 记录实例所在 world 进程的 publicAddress |
| `apps/server/src/http/`（非生产挂载） | 世界房 / 分线 / 在途交接 / 事件积压只读面 |
| `tools/world-bench/multi-process.ts` | 两进程剧本（`colyseus-redis-probe.ts` 形态）：节点退出 → 租约过期 → 新节点 Recovering 接管；**输出实验报告**（⛔ 非首版闸） |

退出条件（首版闸）：单进程分线用例绿；独立 Redis 断言红 / 绿；运维面读出积压；多进程报告存在并登记偏差。
变异验证：`WORLD_MAX_LINES_PER_MAP` 被忽略 → 上限转红；断言允许同 URL → 转红；（实验）租约 TTL 不过期 → 接管报告失败。回滚：可回退；生产启用为部署门。

#### MF11 · 收口审阅与冻结

交付：三视角对抗审阅并消化；`protocol-fingerprint --write` 重钉；`docs/inventory.json`、OVERVIEW / SERVER / CLIENT / KIT / PLUGIN、`protected-paths.json` 与 Non-intrusive §11.3 / §12.2 散文视图同批；`aoi-probe.ts` 去留（已在 `tools/world-bench/`，无生成物）；本文 §12 逐段登记。
「框架侧完成」矩阵（临时根，`scripts/lib/fixture-checkout.mjs` 先例）：记录保护文件 hash → 加入 worldFixture + kitfix + kitfixContent → 先证全部 `--check` 红 → writer / sync → 全绿 → 分类器断言人工文件只出现夹具自有 `A`、既有 `M` 只命中 provenance 白名单 → 第二次 writer 字节不变。
变异验证：向 `GameRoom.ts` 注入一行手改 → 矩阵分类器转红。回滚：可回退。

### 5.5 夹具清单

| 夹具 | 落点 | 引入 | 入库？ |
| --- | --- | --- | --- |
| `aoi-probe` | `apps/server/tools/world-bench/aoi-probe.ts`（裸 Colyseus 房，无 gameplay 生成物；原计划的 `aoiProbeFixture` 从未入库） | MF1 | 已入库（f1c19cde）；**MF11 拍板：留**——world-bench 证据生成器（§11.2 AOI 载体 / `ORCH_TICK_BUDGET_MS` 的数据来源），⛔ 进 verify:core、⛔ 迁成 gameplay 夹具（README 有段） |
| `worldFixture` | `apps/shared/schema/gameplays/worldFixture/` + `apps/shared/src/gameplays/worldFixture/wire.ts` + `rooms/modes/worldFixture/` + `apps/client/src/gameplay/modes/worldFixture/` | MF4（MF5b / 6b / 7b / 8 逐步加 token） | 入库（同 privateFixture） |
| `kitfix` | 临时根 `apps/kits/kitfix/`（sql / workers / contributions / fragments） | MF0、MF7a、MF7b、MF9 | 测试物化 |
| `kitfixContent` | 临时根 `apps/plugins/kitfixContent/` | MF0、MF9、MF11 | 测试物化 |
| `world-bench` 剧本 | `apps/server/tools/world-bench/scenarios/` | MF1 起 | 入库（证据生成器） |

kit 段开工条件按 §7.6 表逐阶段给出（M04）：MK0 ← MF0–MF4 + MF7（a + b）；MK1 ← MF5（a + b）、MF6、MF8；MK4 ← MF9、MF11；MF10 / MF11 可与 MK0–MK3 并行，MK4 验收前须 MF11 退出。

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
| TTL | `PRESENCE_TTL_S = 90`，心跳 `PRESENCE_HEARTBEAT_S = 30`；崩溃后 ≤ 90 s 自愈；presence 是提示语义 ⇒ 每个 presence 键必带 TTL（durable 只是 noeviction + AOF，⛔ 不是「所有键带 TTL」的规则） |
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
| 本地落地 | `pushToUsers(uids, type, data, sId)`、`pushToRealm(sId, type, data)`（新增本节点 `realmOnline: Map<sId, Set<uid>>`，与 `guildOnline` 同三处维护；`PUSH_ALL_CHUNK` 分片）、`pushToGuild` 改走 `kind=guild`、`signalRoom(instanceId)`（本进程 WorldRoom 登记表 → `onSignal`）；`setPushLocalHandlers` 在各进程入口（`entries/*.ts` 与合体 `index.ts`）注入（core ⛔ 反向依赖 websocket）；world 进程只挂 `signalRoom`（D27） |
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

形态：框架 core 世界 wire `defineC2S("c2s.world.chat", validate, { rateCost: 2 })` + `defineS2C("s2c.world.chat", validate, { perSession: true })`（声明落在 `apps/shared/src/protocol/messages.ts` 的 core 表——gameplay-codegen 从 `CORE_C2S` / `CORE_S2C` 读 core token——并配 `apps/server/test/wire-vectors/core.ts` 向量，v1.2 P4）；房收到 → `chatPolicy` → 对兴趣集含 `primaryEntityOf(sender)` 的每个会话 `sendS2C`（含发送者），载荷 `{ fromEntityId, text, at }`；kit 只把 `fromEntityId` 映射成角色名。限流用房内 `rateCost` 预算，不碰 Redis。

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
| 投递总线 | 队伍事件、世界 / 队伍聊天、交接唤醒 | **guild 事件扇出修复**（`pushToGuild` 今天只投本节点）；**`ServerNotice`**（`coreErrors.ts` 已声明、`pushToAll` 预留无调用方）→ 新 HTTP 端点 `/admin/notice`（shared `protocol/http.ts` 契约表手写 + `http/admin/notice.ts` + `codegen:http`，v1.2 P3）走 `pushToRealm`；**lvr** 联盟 / 聊天 / 援助推送（lvr.md §4.2，名册与事件落 kit 自有表） |
| party | 组队进图、经验分配 | **snake 私房整队入座**：队长 `room.prepareCreate` 得邀请码后发 `party.event{kind: roomInvite, data:{code}}`，成员各自 `room.resolve` |
| presence | `party.get` 标记、队友标记 | freezeWorker 的「此刻在线」判定（本阶段只登记）；`/admin/kick` 节点定位提示 |
| channel | 世界 / 附近聊天 | 队伍频道在 snake 大厅即可用；`ServerNotice` 是 realm 寻址第二用法 |
| MF5 兴趣集原语（非社交，一并登记） | mmo 的 entity 同步（MF5b） | `slg` kit 的 tile / army 兴趣集（MF5a，2b）；`lvr` 的 `lvrWorld` 视图房 / 海战 / 波次 BOSS（MF5a）；同一原语、不同 SQL 权威世界形态（§4.1.1），SLG 2b 等 MF5a 的 GameRoom 消费路径 + 名册策略验收 |
| MF7a kit worker（非社交，一并登记） | mmo 的世界事件 worker（MF7b 之上） | `slg` 无人在线的行军到达结算（slg.md §0.1 已登记 `workers[]` 依赖）；`lvr` 定时推进 / 排行定格 / 保留期清理（lvr.md §4.3 拍板 P4：等 MF7，落地后在 §12 回写） |

## 7. `mmo` kit 规格（MK0–MK4）

前置：按 §7.6 表逐阶段给出（MK0 ⛔ 不等 MF5 / MF6 / MF8 / MF9；M04）。沿用 KIT.md §4：一个 `mmo` kit、多个可分别版本化的 api 面、不做 kit-on-kit。

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

⭐（框架 PR 字段，落地后写入；三者都是 kit-schema v1 **增量可选字段**，沿 K0-2 `requires` 先例 ⛔ 不 bump schemaVersion，进锁抬头与身份摘要——M11）：

```jsonc
"sql": { "tables": [ "…", { "name": "k_mmo_world_event", "zone": "per-zone", "role": "world-event" } ] },   // ⭐ role：MF7a
"workers": [{ "id": "worldEvents", "entry": "apps/server/src/kits/mmo/workers/worldEvents.ts" }],          // ⭐ MF7a
"contributions": {                                                                                          // ⭐ MF9
  "content":       { "kind": "data",   "schema": "mmo/contentPack@1", "ends": ["server", "client"] },
  "presentation":  { "kind": "module", "end": "client", "export": "MMO_PRESENTATION" },
  "orchestration": { "kind": "module", "end": "server", "export": "MMO_ORCHESTRATION" }
}
```

- 命名闸：`mmoWorld` 与包 id `mmo` 大小写归一不等；三个域以 `mmo` 为边界前缀；插件 id `mmodemo` / `mmohold` 的 `mmo` 后接小写字母，不构成边界前缀匹配（`viewCatalog.ts:boundaryPrefixes` 已核）。
- 不声明 `effects`：经验在 `k_mmo_character`，货币在框架主账（persona owner）。
- `k_mmo_instance` 只存 kit 语义（`pack_id` / `pack_version` / 编排状态 rev），以框架 `world_instance.instance_id` 为键；⛔ 不建 `k_mmo_transfer`（交接表归框架）。

### 7.2 api 面（插件只 import `apps/{shared,server,client}/src/kits/mmo/api/<surface>/index.ts`）

| 面 | shared（零依赖） | server | client |
| --- | --- | --- | --- |
| `characters` | `ICharacterSummary`、`ClassId` / `FactionId`、命名校验、槽位上限 `MAX_CHARACTER_SLOTS` | `listCharacters`（读 `k_mmo_character` 并与框架 `listPersonas` 对账：只有 persona 行没有角色行的标 `orphan`，可 `deletePersona` 清理）、`createCharacter`（同一 `withKitTx` 内先 `tx.createPersona("mmo", slot)` 得 `personaId`，再插 `k_mmo_character`；槽位上限由本面判、框架只保证 `(user, kit, slot)` 唯一与硬上限——MF2 persona 门面，M03）、`characterWriteCap(characterId, controlEpoch)` | `fetchCharacters`、`createCharacter`、`enterWorld(characterId, mapId)`（带参 launch） |
| `world` | `WorldAddress`、`Vec2`、`EntityId`、`EntityKind`、三档可见性类型（`IInstanceMeta` / `IEntityCard` + `IEntityPose` + `ICombatState` / `IPrivateState`）、`IRegionDef`、delta / baseline 类型（wire 契约属本面） | `currentWorldAddress()`、`readInstanceMeta`、`listInstances`；⛔ 不暴露 spawn / despawn / schedule | `WorldClient`：实体表（只含兴趣集）、enter / update / leave、插值采样、相机跟随、`privateState` 订阅 |
| `movement` | `IMoveIntent = {seq, dir} \| {seq, target}`、`integrate(pos, dir, speedPerSec, dtMs)`（双端同源纯函数）、`clampToMap` | 权威积分器（模板速度为服务端常量；碰撞候选来自 `collision` 网格）；`teleportWithin`（内部 + 编排命令） | 摇杆 → `dir` 意图（限频合并）；点地 → `target`；本地预测 + 按 `seq` 和解；⛔ 不上报坐标 |
| `combat` | `ISpellTemplate`、冷却 / 施法 / 耗蓝纯函数、伤害公式族（扩展 `shared/logic/battle.ts`） | 施法管线（准备 → 施放 → 完成）、aura 表、仇恨表、有序战斗事件 | 目标选择、施法意图、冷却模型 |
| `ai` | 行为词汇（aggro / leash / patrol / respawn / flee） | 分桶调度器、行为解释器、`nav` 网格 A\*（可下沉 compute，结果带 `instanceEpoch` + `entityVersion`，迟到即丢） | — |
| `inventory` | `IItemTemplate`、槽位 / 堆叠、`ILootInstance` | `grantItem` / `moveItem` / `claimLoot`（全在 `withWorldTx` 内；回执写 `k_mmo_receipt`） | 背包视图模型 |
| `content` | 内容包 schema + validator + 引用 / 可达性检查 | 注册表（读 `contributions.generated`）：`packFor(mapId)`、`creature` / `item` / `region` | 表现映射注册表 + 客户端地图几何 |
| `social` | `IPartyView`（成员 characterId + WorldAddress） | `worldChannelId(sId)`、`partyOf(characterId)`（读框架 party）；附近聊天受众只由框架按 `WorldMode.primaryEntityOf` + 兴趣集计算（§6.5.1），kit 的可见性规则经 MF5 授权回调进入兴趣集，⛔ 不另算一份受众（M13） | `sayWorld` 直接用框架 chat 门面；队伍面板消费框架 `PartyLogic` |
| `orchestration` | 事件 / 命令 / 只读 API / 模块契约、`defineOrchestration()`、`MMO_ORCHESTRATION_VERSION = 1`、命令 validator | 运行器（内部）；对外 `readCheckpointedVars(addr, packId)`、`createOrchestrationHarness()` | `subscribeScriptState(packId)`、`onPrompt` |

契约归属：`mmo` 域 → `characters` / `world`；`mmoSocial` 域（v1 仅 `partyLocate`）→ `social`；`mmoAdmin` 不对插件开放；`mmoWorld` wire 按 §7.4「面」列归属，任一 token 变化 bump 该面 `version`。

### 7.3 SQL 与回退窗口

| 表 | 主键 / 唯一 | 关键列 |
| --- | --- | --- |
| `k_mmo_character` | `(server_id, character_id)`；`UNIQUE(server_id, name)` | `persona_id`（框架，⛔ 无外键）、`class_id`、`faction_id`、`level`、`exp`、`checkpoint_rev`（指向最新已落库的角色检查点）。⛔ 不放位置 / HP / MP / 冷却——它们的唯一真源是 `k_mmo_character_checkpoint`（M08）；选角页读最新检查点的 `snapshot.mapId` |
| `k_mmo_character_checkpoint` | `(server_id, character_id, rev)` | `snapshot JSON`（位置 / heading / HP / MP / 冷却 / mapId）、`instance_id`、`event_seq`、`state_hash` |
| `k_mmo_item_instance` | `(server_id, item_id)`；`UNIQUE(server_id, owner_character_id, location, slot)` | `template_id`、`location`（bag / equip / bank / escrow / mail）、`count`、`rev` |
| `k_mmo_receipt` | `(server_id, op_id)` | `character_id`、`kind`、`result JSON` |
| `k_mmo_instance` | `(server_id, instance_id)` | `pack_id`、`pack_version`、`script_rev`（以框架 `world_instance` 为键） |
| `k_mmo_instance_checkpoint` | `(server_id, instance_id, rev)` | `tick`、`rng_state`、`creatures JSON`（spawnId → alive / respawnDueTick / pos）、`loot JSON`、`script_vars JSON`、`timers JSON`、`regions JSON`、`event_seq`、`state_hash` |
| `k_mmo_world_event` | `(server_id, instance_id, seq)`；`UNIQUE(server_id, event_id)`；`KEY(server_id, status, created_at)`；`role:"world-event"`（⭐ MF7a 字段） | `kind`（grantItem / grantCurrency / lootClaim / custom）、`actor_character_id`、`pack_id`、`payload`、`status`（0 pending / 1 done / 2 dead / 3 superseded）、`attempts`、`checkpoint_rev`（产生该事件的分线状态所对应的下一个检查点 rev，见下） |

id 用服务端 uuid 字符串（⛔ 不用 64 位整数：shared 锁 ES2017）。静态模板 ⛔ 不进 SQL（v0）。同图不同分线 ⛔ 永不共享行。

**事件批与分线检查点的原子规则（M09）**：脚本 durable 命令（`grantItem` / `grantCurrency` / `lootClaimed` 派生的 `k_mmo_world_event` 行）⛔ 不能独立于产生它们的分线状态生效——否则「事件已落库、对应状态的检查点未落」的窗口内崩溃，恢复后的重放会用新的 `eventSeq` 再产生一份命令（op_id 不同）而双发。规则：① 每行带 `checkpoint_rev` = 产生它时**下一个将落盘**的分线检查点 rev；② worker 只执行 `checkpoint_rev ≤ k_mmo_instance_checkpoint` 已落库最大 rev 的行，其余保持 pending；③ Recovering 时把 `status=0 AND checkpoint_rev > 恢复点 rev` 的行标 `superseded`（它们属于已丢失的未来，重放会重新产生）；④ MF7b 可改选等价实现「事件批只随分线检查点同事务落库」，二选一（MF7b 已取 ④，①–③ 保留作纵深，§12）。代价是奖励最多延迟到下一个分线检查点，`checkpointOnDeath` / `setVar durable` 等强制点让 boss 奖励即时可执行。

回退窗口（逐类冻结；MF1 2026-09-19 复核并冻结：角色检查点 60 s、分线检查点 30 s）：

| 状态 | 恢复来源 | 允许回退 |
| --- | --- | --- |
| 已确认资产（物品 / 货币 / 掉落认领） | 主账本 + `k_mmo_item_instance` + `k_mmo_receipt` | **0**；重投由 `event_id` / `op_id` 去重 |
| 角色位置 / HP / MP / 冷却 | `k_mmo_character_checkpoint` | ≤ 1 个角色检查点周期（冻结 60 s）；登出 / 交接强制点 |
| NPC 存活 / 复活计时 / 未认领掉落 | `k_mmo_instance_checkpoint` | ≤ 1 个分线检查点周期（冻结 30 s）；boss 死亡强制点（`checkpointOnDeath`） |
| 脚本 vars / timers / 区域开关 | 同上 | 同上；timer 存 `dueTick`，恢复后按 tick 差重排 |
| 战斗热状态（aura / 仇恨 / 施法中） | 无 | 全丢：恢复后清零，战斗视为中断 |
| 世界事件 offset | 检查点原子关联 `event_seq` | 0；seq > 检查点的事件已 durable，只消费不重放进内存 |
| 脚本 durable 命令（grant* / lootClaim） | `k_mmo_world_event` + `checkpoint_rev` 门（上文原子规则） | **0 重复**；最多延迟到下一个分线检查点（强制点即时） |

### 7.4 mode `mmoWorld`（`apps/kits/mmo/gameplays/mmoWorld/`）

- `manifest.json`：`{ id: "mmoWorld", constantName: "MmoWorld", modeVersion: 1, maxPlayers: <MF1 基准冻结>, kind: "world", profiles: ["world"], world: { emptyPolicy, emptyAfterMs, checkpointMs } }`。
- `state.json` root `MmoWorldRoomState`（**只放全图公开的分线元数据**）：`tick`、`phase: WorldPhase`、`mapId` / `instanceId` / `line` / `packId` / `packVersion`、`authorityEpoch`、`population`（在线数，⛔ 不是名册）、`scriptStateRev`。
- `wire.ts` token（perSession token 由 MF5a 的 `defineS2C(..., { perSession: true })` 声明）：

| 方向 | token | 载荷要点 | phases / rateCost | 投递 | 面 |
| --- | --- | --- | --- | --- | --- |
| C2S | `c2s.mmoWorld.move` | `{ seq, dir:{x,y} } \| { seq, target:{x,y} }`（⛔ 无坐标上报） | Active / 1 | — | movement |
| C2S | `c2s.mmoWorld.target` | `{ entityId \| null }` | Active / 1 | — | combat |
| C2S | `c2s.mmoWorld.cast` | `{ seq, spellId, targetId? }` | Active / 2 | — | combat |
| C2S | `c2s.mmoWorld.interact` | `{ entityId, interactId? }` | Active / 2 | — | world |
| C2S | `c2s.mmoWorld.choose` | `{ promptId, choiceId }` | Active / 2 | — | orchestration |
| C2S | `c2s.mmoWorld.pickup` | `{ lootId, clientReqId }`（durable → 回执） | Active / 2 | — | inventory |
| C2S | `c2s.mmoWorld.transfer` | `{ portalId, clientReqId }` | Active / 4 | — | world |
| C2S | `c2s.mmoWorld.baselineRequest` | `{ authorityEpoch, afterSeq }`（世界身份是 `instanceId` / `authorityEpoch`，⛔ 不用 GameRoom 的 `roomEpochId`；重连走 join 信封 `resumeSeq`） | Active / 4 | — | world |
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
| `IPresentationMap`（client 模块） | `presentationId → { prefab, atlas, anim, icon, sfx, model? }`（`model` = 3D 预制，可选预留；世界视图首版 2D 公告板、接口 3D-ready，见 [3d.md](3d.md) SD9） |

codegen 期与启动期校验：引用完整性（spawn → template、loot → item、portal → map、region → map、`interactId` ↔ 编排模块声明）、可达性（出生点到每个传送点有 nav 路径）、数值域、包大小上限；任一失败 codegen 拒绝 / WorldRoom 拒启。原始数据 id 与 `presentationId` 分离。

### 7.6 落点与 kit 阶段

- server：`apps/server/src/kits/mmo/{world,aoi,movement,combat,ai,inventory,content,social,orchestration,persistence,workers}/**` + `api/<surface>/index.ts`；`rooms/modes/mmoWorld/index.ts`（登进 `worldModeRegistry`）；`websocket/{mmo,mmoSocial,mmoAdmin}/`；`core/compute/tasks/kits/mmo/pathfind.ts`。只 import `../../core/infra/kitApi`、框架 world 契约与自身。
- shared：`apps/shared/src/kits/mmo/api/<surface>/index.ts`；`apps/shared/src/gameplays/mmoWorld/wire.ts`；`domains/{mmo,mmoSocial,mmoAdmin}.ts`。
- client：`apps/client/src/kits/mmo/{index.ts,api/**,logic/**,view/MmoCharacterSelectView}`；mode 四件 `gameplay/modes/mmoWorld/`、`net/rooms/MmoWorldRoom.ts`、`logic/rooms/mmoWorld/`、`view/rooms/mmoWorld/MmoWorldView`（默认 HUD：摇杆 / 目标 / 技能轮盘 / 附近聊天 / 队伍；bitECS 实体池 + 插值 + 相机）。竖屏基线 750×1624 不变。世界视图形态按 [3d.md](3d.md) **SD9 = C**：首版 2D 公告板（`UIMeshRenderer` / Sprite），经 `WorldPresentation` 适配器接内容（`EntityPool` 键 = presentationId、相机数学投影无关、`IPresentationMap.model` 预留），MK1 前按 3D 轨道 SC3 / SC4 实测决定是否切 3D 实现。⚠ 默认 HUD 是 FGUI 而世界是 gameplay presentation 节点（同 snake 用全局 `input.on`），点 HUD 时世界也收到触摸——HUD 与世界的输入归属依赖 3d.md SC1-B9（gameplay 载体闸），退路是把 HUD 画在世界节点内（slg 形态）；MK0-B4 骨架 ⛔ 不等 3D 轨道，MK1 接 FGUI HUD 前需 SC1-B9 或退路。
- kit v1 自带灰盒内容包 `apps/kits/mmo/content/greybox/*.json`（一图一怪一技能），MK4 前可内置 import，MK4 改为经贡献点装载以证明通道。

| 阶段 | 交付 | 前置 | 验收（能力，非内容） |
| --- | --- | --- | --- |
| MK0 骨架（✅ 2026-09-20 退出，§12） | kit.json / README / SQL / `mmoWorld` 四件 / characters + world + content 面 / 灰盒内容包 | MF0–MF4、MF7（a + b） | 干净树 pack → install → codegen → bootstrap → check → `plugin -- test mmo`；一个角色进图、走路、看到怪 |
| MK1 世界闭环（✅ 2026-09-20 退出，§12；kill criterion 取 §11.2 v1 例外「热点互见 ≤ 50 人」） | movement 面、AOI 接入、两图交接、检查点恢复、附近 / 世界聊天与队伍包装、客户端基础适配 | MF5（a + b）、MF6、MF8 | 断线 / 重启 / 交接故障矩阵全过 ✅；基准台达 kill criterion（热点 50 人三次重跑 ✅；100 人 ❌ 记为 v1 例外） |
| MK2 模拟闭环（✅ 2026-09-20 退出，§12） | combat + ai 面、掉落 | — | 有序执行与预算上限；AI 分桶不挤占主 tick；可无头重放 |
| MK3 资产闭环（B1–B3 ✅ 2026-09-20 交付；退出待 24–72 h 长跑报告，§12） | inventory 面（唯一物品 / 容器 / 装备 / 掉落归属）、角色保存定稿 | — | 并发拾取 / 重复请求 / 重启重放不复制物品或奖励；币账仍在框架 |
| MK4 编排与验收 | orchestration 面 + 运行器 + harness；api 冻结、说明书；内置内容包改为经贡献点装载；容量证据；打 tag `mmo-kit-v1-frozen` | MF9、MF11 | 干净安装全链闭环；卸载 / 升级识别在途交接与 pending 事件；框架零追加手改 |

本表是 kit 开工门的唯一口径（§5.5 与 §7 抬头引用此表；D8：kit 每阶段只消费**已退出**的框架阶段）。

交易 / 任务 / 副本存档 / 脚本钩子之外的能力在 MK4 之后按同法立项，⛔ 不以首版替代品冒充。

## 8. 公开 API 编排模型（`orchestration` 面 v1）

### 8.1 总则

插件在运行时对世界的**全部**影响 = `handle(event, readApi) → commands[]`。kit 发事件、给只读快照、校验并执行命令；插件模块没有写端口、没有 IO、没有自己的状态存储（状态 = kit 托管的有界 `vars`）。

| 规则 | 形态 | 违反时 |
| --- | --- | --- |
| 确定性 | handler 同步纯函数；随机只经 `api.rng`（种子 = instanceId + tick + eventSeq）；时间只经 `api.tick`；⛔ `Math.random` / `Date` / `setTimeout` / import 非门面模块（`mmo-orchestration-boundary.test.ts` 扫描 `contributions.generated` 收录模块：import 集 ⊆ {kit shared api、自身目录} 且无禁用标识符） | 启动期断言失败 → 进程拒启 |
| 预算 | 每 tick 每 pack：wall ≤ `ORCH_TICK_BUDGET_MS`（冻结 2 ms，§11.2）、命令 ≤ 64、事件队列 ≤ 256、存活脚本 spawn ≤ `limits.maxSpawnsAlive`、vars ≤ 4 KB | **fail-closed**：本 tick 命令整批丢弃，该 pack 在该分线 `suspended`（timers 保留、不再收事件），写 `k_mmo_world_event kind=packSuspended`；`mmoAdmin.resumePack` 或分线重启恢复 |
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
| `grantResult` | `{ opId, ok, reason? }` | `grant*` durable 落账后回投（kit 内部按 `instanceEpoch` 过滤：旧 epoch 的回投丢弃，类型不暴露该字段） |
| `packSuspended` | `{ reason }` | 预算超限（只投一次） |

v1 ⛔ 不投递：`spellCast` / `damage`（高频，留 v2）、任何跨分线事件。

### 8.3 命令（插件 → kit；全部经零依赖 validator + 语义校验）

| op | 载荷 | kit 校验 / 落地 |
| --- | --- | --- |
| `spawn` | `{ templateId, pos, tag?, despawnAfterMs?, leashRegionId? }` | templateId ∈ 本 pack；pos 可行走；存活上限；落 kit 内部 spawn 端口，`managed:"orchestration"` |
| `despawn` | `{ entityId } \| { tag }` | 只能 despawn 本 pack 脚本 spawn 的实体 |
| `startTimer` / `cancelTimer` | `{ timerId, afterMs, tag?, repeat? }` | 每 pack ≤ 32 活动 timer；`afterMs ≥ 500`；随分线检查点持久 |
| `grantItem` | `{ toCharacterId, itemTemplateId, count, reason }` | 模板 ∈ pack；`count ≤ limits.maxGrantCount`；写 `k_mmo_world_event kind=grantItem`（op_id = uuidv5(instanceId, packId, eventSeq, idx)；行带 `checkpoint_rev`，按 §7.3 原子规则门控）→ worker `withWorldTx` → `inventory.grantItem` → `grantResult` |
| `grantCurrency` | `{ toCharacterId, amount, reason }` | `amount ≤ limits.maxCurrencyPerGrant`（kit 硬上限）；同上路径经 `creditInTx`（persona owner） |
| `sayNearby` | `{ anchorEntityId, text }` | anchor 属本分线；文本 / 频率限；经框架 `s2c.world.chat` 端口 |
| `sayWorld` | `{ text }` | 每 pack 每分钟 ≤ `ORCH_SAY_WORLD_PER_MIN`（§11.2 冻结数字表）；经框架 channel 发布到 `realm:<sId>` |
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
5. 每 step 固定序：命令处理 → 移动积分 → 战斗 → AI 分桶 → **编排事件分发**（按 eventSeq；命令校验后落内部端口）→ AOI 差集 → 出站。durable 命令进内存 outbox，随分线检查点同事务落库（或提前批写但带 `checkpoint_rev` 门，§7.3 原子规则），worker 执行后回投 `grantResult`。

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

数字已在 MF1 由基准台实测冻结（2026-09-19，全部在 §11.2 冻结数字表；场景 B 的「100 玩家 + 500 实体」是压力爬升上限，⛔ 不是 kill criterion 的通过阈值——阈值是 100 机器人 + 300 脚本实体，MK1 实测后只许收紧）；⛔ 不用空连接数、`maxClients` 配置或 C++ 参考项目规模替代实测。带宽量级只作说明（80 可见实体 × 40 B × 10 次/秒 ≈ 32 KB/s/客户端，未含协议 / 事件 / 重发）。

### 10.2 故障矩阵（全部进 `test:int` / `test:faults:int`）

| 故障 | 必须验证 | 阶段 |
| --- | --- | --- |
| 同 persona 跨房 / 跨进程双登 | 只有一个控制权；旧输入与写入不生效 | MF4 |
| DB 提交成功但响应丢失 | 重试回读回执；装备 / 钱不重复变化 | MF2 / MK3 |
| 源 / 目标在交接各阶段崩溃 | 查持久状态恢复；不丢角色、不双激活、不重复收费 | MF8 |
| 租约失效 / 节点停止 | 新 owner Recovering 接管；旧 owner 延迟结果被拒 | MF4 / MF10 |
| NPC 死亡后崩溃 | 奖励不重抽、不重复发（§7.3 原子规则：事件已落库而检查点未落 → `superseded`） | MF7b |
| 慢客户端、重复 / 乱序 seq | 队列有界；旧代次不覆盖新状态；可重同步 | MF5a（SQL 视图房夹具）/ MF5b（worldFixture） |
| 推送流积压 / 消费者卡顿 | 30 s 时间栅栏丢旧条目；party 靠 `getEvents` 自愈 | MF6a |
| worker 失租后旧 worker 恢复写入 | 写被 `withKitWorkerTx` 首句拒；已提交结算幂等重放 | MF7a |
| 编排预算超限 | pack suspend、命令整批丢弃、事件落账、可恢复 | MK4 |
| 同图两分线 | 检查点 / 事件 / 脚本 vars 互不可见；跨分线命令被拒 | MK1 |
| 手机后台 / 断网 / 杀进程 | 按离线规则结算；恢复身份、控制权与首帧 | MK1 |
| 24–72 h 长跑 | 内存 / 计时器 / 连接 / 积压无增长 | MK3 |

### 10.3 「框架侧完成」与「kit 已形成」判据

- 框架侧完成：worldFixture + kitfix + kitfixContent 在临时根**只新增文件**即可建常驻房、准入校验控制权、按会话裁剪同步、附近 / 世界聊天、组队、两房交接、周期与分线检查点、贡献点装载；每条有变异验证；`verify:all` / `test:int` / `test:faults:int` 绿（MF11 矩阵）。**MF11-B4 实证口径**（2026-09-20）：`npm run verify:mmo-fixture-matrix` 证「只新增文件 + 全部 check + 所有权分类 + 幂等 + 反向控制」（34 步）；建房 / 准入 / 裁剪 / 聊天 / 组队 / 交接 / 检查点 / 贡献点装载的运行时判据由 test/int 的 worldFixture / kitfix 用例逐条覆盖（各阶段 §12 行），矩阵本身不碰 Redis / MySQL。
- kit 已形成：① 干净宿主 pack → install → codegen → bootstrap（两遍，第二遍零 DDL）→ check → `plugin -- test mmo` 闭环，`uninstall` 在有依赖插件 / pending 事件 / 在途交接 / 运行中分线时拒绝；② 灰盒内容包 + 无头测试跑通建角、进图、意图移动、可见性（超视野零泄露）、打怪、掉落认领、装备、附近 / 世界聊天、组队进同分线、两图交接、检查点恢复满足 §7.3 窗口；③ 两个样本只消费冻结的九个面与三个贡献点，第二个接入不增加框架 / kit 条件分支；④ orchestration 事件 / 命令清单、预算数字写进 README 与 validator，harness 对两样本重放绿；⑤ 故障矩阵、容量数据、协议版本、内容包版本与面兼容边界均有记录。

## 11. 决策表

### 11.1 已拍板（D1–D19：2026-09-09；D20–D26：2026-09-19，按 MMO-REVIEW 采纳；D27：2026-09-19，PS0）

| # | 决策 | 结论 |
| --- | --- | --- |
| D1 | 首版世界与战斗关系 | 地图内实时战斗；客户端单一世界连接 |
| D2 | 插件扩展范围 | 内容 + 公开 API 编排（§8）；不带 mode / state / wire / SQL |
| D3 | 移动模型 | 连续坐标、服务端权威、客户端只发意图；网格只做候选 / 寻路 |
| D4 | 可见性分级 | 三档；名册 ⛔ 不进 Schema |
| D5 | 首版社交范围 | 组队 + 附近聊天 + 世界聊天（全区服） |
| D6 | 社交归属 | 框架原语（presence / party / channel）；kit 只封装 |
| D7 | 双进程接管 | 设计按跨进程成立；首版只验同进程 |
| D8 | 交付顺序 | 严格边界：框架段只用夹具；kit 每阶段只消费**已退出**的框架阶段（前置以 §7.6 表为唯一口径）；游戏等 kit 验收 |
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
| D19 | SQL 权威视图房与 SLG | SLG 只消费 MF5a 与 MF7a 通用 worker，不引入 persona / 内存检查点；正式名册不广播全房 id/name，必要归属随视野对象。MF5a / MF7a 本仓按 §5 独立实施；SLG 1/2a 先行，2b 等 MF5a 的 GameRoom 接线与名册验收 |
| D20 | 阶段重排（M02 / M05 / M06） | MF3、MF6a 前置改 MF1；MF5、MF7 各拆 a / b，a 半边不等 MF4；MF2 只需先于 MF4；门①②互不依赖 |
| D21 | lvr 登记（M10） | lvr 为 SQL 权威消费方（MF5a / MF6a / MF7a / MF9）；MF8 ⛔ 不提供跨区；主体模型并存（owner 缺省 account = uid，SQL 权威 kit 不预留 owner_id） |
| D22 | persona 门面（M03） | MF2 在 KitTx 上提供 `createPersona / deletePersona`，事务外 `listPersonas`；kit ⛔ 不直接触碰 `persona` 表；槽位产品上限归 kit，唯一与硬上限归框架 |
| D23 | D4 在 GameRoom 路径的落地（M07） | manifest `roster: "public" \| "hidden"`，缺省 public（既有 mode 零变）；`kind:"world"` 恒 hidden；开关实现归先落地者 |
| D24 | 角色热状态唯一真源（M08） | 位置 / HP / MP / 冷却只在 `k_mmo_character_checkpoint`；角色行只留身份成长 + `checkpoint_rev` |
| D25 | 事件批与检查点原子规则（M09） | 事件行带 `checkpoint_rev` 门控 + Recovering 标 `superseded`；或同事务落库，MF7b 二选一 → MF7b 取「同事务落库」，门控 + superseded 作纵深（§12） |
| D26 | kit-schema 新字段形态（M11） | `sql.tables[].role`、`workers[]`（MF7a）、`contributions` / `fragments`（MF9）均为 v1 增量可选字段，⛔ 不 bump schemaVersion |
| D27 | 进程形态（PS0，MMO-PLAN §5） | lobby / game / world 三进程，各自入口 + config + 端口；本地 dev 缺省合体入口，`dev:split` 另给；端点发现走游戏 HTTP `/version` 字段（反代路径为部署选项，⛔ 不动外部契约）；`room.resolve` 删 matchmaker 房间快照；world 入口先占位（入口 + `WORLD_PORT` + 空 config），房间等 MF4 |

### 11.2 冻结数字表（MF1 已于 2026-09-19 冻结；M15）

全部数字只登记在这一张表，正文其他地方只引用本表。MF1 冻结的依据是 `tools/world-bench/` 的四份实测报告（`docs/perf/world-bench/2026-09-19T*`）；再改 = 新一轮拍板并在 §12 登记。

| 项 | 冻结值 | 依据 |
| --- | --- | --- |
| AOI 载体 | **消息级 delta**（`perSession` token + baseline / checksum / cursor） | `aoi-probe`（50 观察者 / 300 实体 / 20 Hz，同种子）：StateView 字节 −40%（6.1 vs 10.1 KB/s/会话）但 CPU +65%（170 vs 103 ms/s）、sync +55%（3.9 vs 2.5 ms/tick）；delta 的字节差可由位置量化收回大半；StateView 还需 codegen 支持 `@view()`、客户端 bundle 4.0.13 无 `.d.ts`、失去消息级 checksum / cursor 治理。⛔ MF5 不再考虑 StateView |
| kill criterion | 单房 100 机器人 + 300 脚本实体：tick p99 < 25 ms（20 Hz）；每会话出站 p50 ≤ 100 KB/s（snake 现值） | `snake-baseline` 现值：40 机器人 / 5 房 tick p95 ≈ 13 ms、p99 ≈ 14 ms、出站 ≈ 100 KB/s/会话、baseline ≈ 91 KB/join，两次偏差最大 3.9%；`aoi-probe` 24 可见实体 ≈ 10 KB/s/会话 ⇒ 100 KB/s 有 10× 余量。MK1 场景 B 实测后只许收紧 |
| `maxPlayers`（`mmoWorld` manifest） | 100 | = kill criterion 的单房机器人数；MK1 实测后只许收紧 |
| **kill criterion 的 v1 例外（MK1 退出拍板，2026-09-20）** | 场景 B「热点」的**互见人数上限 = 50**（100 人在房、≥ 300 实体、tick p99 < 25 ms、出站 p50 ≤ 100 KB/s 的阈值数字不变）；热点 100 人 ❌（p99 55.2 ms / 125.8 KB/s）记为已知上限 | ⚠ 这是「冻结后」唯一一条放宽方向的明示例外：收窄的是场景定义（同时互见的玩家数），不是阈值；50 人三次重跑（种子 7 / 8 / 9，2026-09-20T1615*）tick p99 20.8 / 24.2 / 24.8 ms、出站 p50 69.1 / 68.8 / 68.5 KB/s/会话 ✅（`docs/perf/world-bench/2026-09-20T1615*-mmo-hotspot-hot50-mk1-exit-s{7,8,9}.json`）；口径仍是同进程机器人（独立进程基准台未建，服务端本体成本偏高估）；**内容插件的聚集玩法（帮战 / 城内集会 / boss 战）设计上限 = 50 人互见**，超过要靠分线 / 位面 / 视野分层，⛔ 靠放宽阈值；根因与候选收紧见 §12 MK1 行偏差 ⑧。**MK4 最终（2026-09-20，kit 0.1.15）**：50 人整窗 tick p99 37.2 / 25.1 / 32.6 ms ❌（稳态窗 ≤ 23.8 ms ✅，回归在预热段）——同日用户拍板**接受为 v1 已知回归、优化留 v1.x**（§12 MK4 行）；阈值与例外定义不变 |
| 空实例策略缺省 | `sleep`；`emptyAfterMs` = 120 s | §4.5 空实例策略表；三策略各一用例（MF4） |
| `checkpointMs` | 角色 60 s / 分线 30 s | §7.3 回退窗口表 |
| `WORLD_LEASE_TTL_MS` / 续租间隔 | 15 s / 5 s（`renew*3 ≤ ttl` 加载期断言） | MF4；`colyseus-redis-probe` 实测 `kill -9` 后约 4 s 惰性清理，15 s 足够 |
| `ORCH_TICK_BUDGET_MS` | 2 ms | `aoi-probe`：50 观察者的 delta sync 本身 p50 2.5 ms，编排另计 2 ms 仍远在 50 ms 步长内；MK4 实测只许收紧 |
| `ORCH_SAY_WORLD_PER_MIN` | 6 | §8.3；MK4 复核 |
| `PERSONA_MAX_SLOTS_HARD` | 16 | MF2 persona 门面（M03）；产品上限归 kit |
| `LOBBY_PROTOCOL_VERSION` 是否 bump | 规则：不 bump | 新增 party / chat / world 域缺省不 bump（arena 先例，EXTRAS X4 口径），破坏性才 bump；人工决策写入提交信息 |
| `GAME_ROOM_PROTOCOL_VERSION` 是否因 `roster` 开关 bump | 规则：不 bump | `roster` 缺省 public 保证既有 mode Schema 不变（MF5a，M07）；只对新 mode 生效 |
| `persona` 命名 | 保持 `persona` | 与 `player/character.ts` 的关系写在 MF2 文档；之后不再改 |
| 主体模型并存的书面口径 | 见 §4.1.1 | MF2 文档写明 owner 缺省 account 与 SQL 权威 kit 零变（M10） |
| `OBSERVER_SYNC_LIMITS`（baselineChunkItems / interestMaxEntities / outboundQueueMaxMessages） | 128 / 512 / 256（MF5a 候选值，构造期只许收紧） | 128 = snake `snapshotChunkItems` 先例；512 / 256 是 `view-r300` 实测（24 观察者 / 400 游走实体 / 视距 300：每会话 delta 887 条/s、出站 p50 55 KB/s 仍在 kill criterion 100 KB/s 内）之上留余量的上界；MK1 实测后只许收紧 |
| 视距对每会话字节的影响（MF5a-B6 剧本 `view-r100 / view-r300`） | 视距 300 → 100：出站 p50 55,331 → 9,488 B/s（−83%）、baseline B/join p50 7,928 → 1,368、tick p99 10.1 → 4.7 ms | `docs/perf/world-bench/2026-09-19T170610-view-r300-mf5a.json` / `2026-09-19T170623-view-r100-mf5a.json`（24 机器人 / 3 房 / 10 s / 种子 7，同机同进程，比较用不作绝对容量） |

## 12. 实施状态回写

> 未立项。每阶段完成在此登记一行（阶段 / 日期 / commit / 实际交付与基准结果 / 偏差）。⛔ 不向 plan-v5 回写。

- **MF0 KIT K1 前置**（2026-09-19，提交 6582d4ac / 1ce10d01 / 107f8e5a）：三批按 MMO-PLAN MF0-B1–B3 交付并各自变异验证——客户端边界夹具点名 8 处越界、服务端 / shared / `.conn` 夹具点名 6 + 6 + 3 处、outbox 闸假连接 7 例 + 真库 1 例；`plugin -- test arena` 33/33、`arenaShop` 9/9；服务端单测 769、客户端单测 592、`test:int` 186 全绿；typecheck 三端绿。偏差：`verify:all` 未整体绿，红项全部是本阶段之外的基线问题——UniFlex 作者态提交（2026-09-18）未同步 Cocos 镜像（`verify:sync` 168 处漂移 / 缺 .meta，需开 Creator 生成）、`test:uniflex-ui-contract` 4 例、`test:inventory` 的 docs/evidence 跟踪文件与 .gitignore 政策冲突；另提 4 个基线修复提交（vendor 锁重钉 eed92084、typecheck 断言类型 0bcda3aa、int 账本孤儿 107f8e5a 同批、根命令登记 d4794205）。KIT.md §9 K1 行已改 ✅。
- **MF1 基线与冻结**（2026-09-19，提交 3da785c7 / f1c19cde / 本行所在提交）：B1 `tools/world-bench/` 基准台（进程内真实 Colyseus + `@colyseus/sdk` 机器人，采样 `stepFixed` / `raw` 接缝），snake 现值 40 机器人 / 5 房：tick p95 12.9–13.1 ms、p99 13.9–14.4 ms、每会话出站 p50 ≈ 100 KB/s、baseline ≈ 91.5 KB/join、delta 10 条/s，两次主要指标最大偏差 3.9%（< 10%）；B2 `aoi-probe.ts` 同种子对照（50 观察者 / 300 实体 / 20 Hz）：StateView 字节 −40% 但 CPU +65%、sync +55% ⇒ 载体冻结为消息级 delta；B3 §2.3 引用锁按文件 blob、§4.5 空实例策略表、§7.3 回退窗口、§11.2 全表冻结。证据 `docs/perf/world-bench/2026-09-19T*.json` 四份。偏差：① AOI 实验未做成计划中的 GameRoom 夹具 `aoiProbeFixture`，改为裸 Colyseus 双房工具（StateView 落生成的 GameRoomState 需 codegen 支持 `@view()`，这正是「生成器改动面」的结论；§5.5 夹具清单已改）；② 「私有字段塞进公共块 → 零泄露断言转红」的变异验证未随 B2 交付，归 MF5a 的 `InterestSet` / `ObserverSync` 单测；③ 基准机器人与服务端同进程，数字只用于比较与阈值设定，⛔ 不代表线上绝对容量；④ 基准台用进程内 `Server` + 真实 WebSocket 传输而非 `@colyseus/testing`（要采样真实出站字节）。
- **MF3 共享层抽取（门②）**（2026-09-19，提交 61a0125e / dd3ec2fe / 本行所在提交）：B1 行为快照 12 例 + rooms/core 导入闸；B2 单提交抽出 `rooms/core/{RoomAuth,WireDispatcher,MessageBudget,ReconnectGrace,S2CPorts}.ts`，GameRoom 2214 → 2020 行改为消费者，可数判据全部成立（不 import `core/auth/session`、无 `validateC2SPayload(`、`MessageBudget` 只以类型出现、`GAME_ROOM_PROTOCOL_VERSION` 0 次）；`rooms/core/**` 整目录登进 protected-paths gameplayFlow（关 PLUGIN-REVIEW F03 的 RoomProfile 一半）；B1 与既有 dispatch / wire-contract / version-matrix / snake-room / private-room / drop-in 用例零改动全绿，新增 `rooms-core-units.test.ts`；服务端单测 790、客户端 592、test:faults 76 + 78、verify:protected-paths 绿；三处手工变异（owner 闸后移 / 删 generation fence / 删 S2C owner 闸）各转红。偏差：① 重连宽限**成功**分支补了 generation fence（抽取前只有到期分支短路 disposed，dispose 期间迟到的重连成功仍会跑 onConnectionChanged(true)）——行为收紧而非等价，按既有用例原意登记；② protocol-version-matrix 的源码钉随比较位点迁到 RoomAuth.ts（测试侧唯一改动）；③ `docs/inventory.json` 的 sourceOfTruth 是单字符串字段，保留 GameRoom.ts，共享层经 `rooms/README.md` 进 docs 列。tag `mf3-exit`。
- **MF6a presence / 投递总线 / party / 世界频道**（2026-09-19，提交 1f86f07f / 0e17fcd1 / e4f9f692 / 1280037e / 6e38095f）：B1 presence（`core/presence/presence.ts`：`kPresence(uid,sId)` + `NODE_ID` + Lua PRESENCE_CLEAR_IF_OWNER；LobbyRoom onJoin 在 seat 公开前写、final onLeave 本节点无连接才清、30 s 心跳 / 90 s TTL）；B2 投递总线（`core/push/pushBus.ts`：coord `stream:push`，kind users / realm / guild / room，uids ≤ 64 自动切片、data ≤ 2 KB、30 s 时间栅栏，每节点独立游标；`websocket/push.ts` 的 `realmOnline` 索引 + 本地落地端注入；发布方 ⛔ 不本地直投；`pushToGuild` 改走总线修复「只投本节点」）；B3 party（Lua ×7 五键同槽、档字段 `partyId` 先 Lua 后档 + 读侧自愈、域 `party` 9 路由 + 2 推送 + 7 错误码、客户端 `PartyLogic`）；B4 chat（域 `chat` natural-write、`core/chat/{send,policy}`、user 桶 3/0.5 + realm 桶 100/30、桶失败 CHAT_UNAVAILABLE、客户端 `ChatLogic`）；B5 `POST /admin/notice`（ServerNotice 经总线 realm 寻址）。验证：服务端单测 809、客户端 594、typecheck 双端绿；test:int lobby-zone / push-bus / party / chat / guild 全绿（真实 Redis Lua + 流 + 令牌桶；同进程真双消费者各恰一次）；每批手工变异各 2–5 处均转红（§6.6 表逐条）。`LOBBY_PROTOCOL_VERSION` 未 bump（新增域）。偏差 / 后置：① B5 的「snake 私房整队入座」按施工单允许后置，⛔ 未做；② 单测里的假 Redis 自实现 Lua 语义——Lua 变异只在 int 上钉（B1 已实证）；③ presence 键定义落在 `core/infra/keys.ts`（框架键单一登记点），不是施工单写的 `core/presence/keys.ts`；④ 投递总线消费者由进程入口显式起（index.ts，与 kick 同口径），⛔ 不在 LobbyRoom.onCreate 隐式起——int 测试进程按需 `startPushConsumer()`；⑤ 本轮 `sync:client` 顺带补齐了 2026-09-18 UniFlex 遗漏的 Cocos 镜像（单独提交 bab305f6），Cocos 新文件 `.meta` 仍待 Creator。tag `mf6a-exit`。
- **MF7a kit worker（通用 SQL）**（2026-09-19，提交 979a980d / fe18d127 / 3f978152 / bb2b0728 / ab11e6a0 / 本行所在提交）：B1 kit-schema v1 增量可选字段 `workers[]`（entry 固定落 `apps/server/src/kits/<id>/workers/`）与 `sql.tables[].role:"world-event"`（⛔ 未 bump schemaVersion），解释器 / 目录 / 锁抬头 / 身份摘要纳入，`verifyKitTableShapes` 对 role 表机检框架固定列集；B2 `db:bootstrap` 按目录预置 `singleton_lease('kit:<id>:<worker>')`（ODKU no-op、已有行零触碰，新增 / 已有分类按预置前读取 ⛔ 不按 affectedRows——mysql2 缺省连接带 CLIENT_FOUND_ROWS），孤儿行只告警；B3 `withKitWorkerTx`（首句 `renewLeaseGuard`，P5；0 行 ⇒ `LeaseLostError` 自动回滚零写入；无 `.conn`；AsyncLocalStorage 拒回调内另开事务；租约名 = `kit:<kitId>:<workerId>`）；B4 `src/workers/kitWorker.ts` + `npm run worker -- <kit>:<worker>`（登记闸先于 import、`KIT_WORKER_ZONES` 显式、逐区串行、`more` 同区再跑、空闲按 TTL/3 封顶续租、失租退出 1、SIGTERM 跑完当前事务停）+ `defineKitWorker`；B5 `tools/plugin/workerGate.ts`（pending 事件行 / 在役租约 ⇒ uninstall 拒，⛔ 无 bypass；check 告警 + 孤儿租约行）；B6 真库夹具 `test/int/kit-worker-lease.test.ts`（fixture kit kfix：普通表 + role 表 + worker tick）。验证：服务端单测 832、typecheck 绿；int `kit-migrations`（预置两遍零新行、在役租约不被重置）+ `kit-worker-lease`（两实例争租只一个写；旧持有者事务前 / 后失租与同 holder 旧 fence 的写全部被首句守卫拒、业务表零写入；重放认领 0 行零副作用；`runKitWorker` 真跑主循环消费完事件、停止后不再提交；卸载闸在役拒 / pending 拒 / 放行）全绿；每批手工变异均转红（B1 ×2、B2 ×2、B3 ×2、B4 ×1、B5 ×2）。偏差 / 取舍：① 施工单 B2 的机检落点写的 `db-bootstrap.test.ts`，实际单测在 `kit-worker-leases.test.ts`（假连接故意按 CLIENT_FOUND_ROWS 作答）、真库在 `test/int/kit-migrations.test.ts`；② B5 的闸落在 `tools/plugin/cli.ts`（与 outbox 闸同位）而非 `uninstall.ts`（后者是纯文件级操作，KIT.md §5 原则）；③ B6 的 kitfix 夹具没有物化成临时根目录文件，而是 int 测试内的 catalog 字面量 + SQL 文本（与 kit-migrations 夹具同形；MF11 夹具矩阵再物化）；④ 「事务中途失租」未单独夹具：守卫首句持有 `singleton_lease` 行锁到提交，顶替者的抢占 UPDATE 会等到提交之后，属 InnoDB 行锁保证；⑤ `tryAcquireLease` 加了可注入连接面第四参数（int 测试用临时库的池），缺省行为不变。tag `mf7a-exit`。
- **MF9 贡献点 / fragment / 带参 launch**（2026-09-19，提交 f6fad19f / 745f5ca6 / 2c528c69 / 944be274 / 本行所在提交）：B1 schema 增量可选字段——kit.json `contributions`（module 恰好一端带 export；data 带 schema，sha256 进锁 / 身份摘要）/ `fragments`，plugin.json `contributes`（贡献 = 依赖：须同时 requires.kits）与两份 schema 的 menu `launch.payload / profile`（⛔ 未 bump 两个 schemaVersion）；B2 `tools/plugin-codegen/contributions.ts` 三道校验（登记 / 所有权 ⊆ 插件推导集 / 内容：module 端与导出符号、data 按 schema）→ 每 kit × 端一份 `apps/<end>/src/kits/<kitId>/contributions.generated.ts`（恒生成、空列表、孤儿自动收回；protected-paths `*` 单段通配登记；K1 扫描对 `*.generated.ts` 豁免）+ pack 越界拒 / install 正向闸 / kit 反向闸（删贡献点或契约变化点名，`--break-dependents`）/ check；B3 kit fragment `apps/kits/<id>/fragments/<name>.state.json`（mode state.json `"<kit>:<name>"`，泛化 ownerReady / inviteRoom 通道，字节并入 contractDigest；未声明 / 缺文件 / 撞名 / 无发现根拒）；B4 带参 launch（显式框架侵入 AppRuntime / services / GameRoomTransport / RoomController / GameplayModule，lock 重钉）：`{ ...payload, profile? }` 经 `startRegistered` 到 `validateLaunch` exact 校验，`joinGameRoom` profile 覆盖，codegen 校验 profile ∈ manifest.profiles，ballMove 参考接线；B5 文档（KIT.md §3 / §4 / §9、PLUGIN.md §5、EXTRAS X1、SERVER.md §13、CLAUDE.md 铁律 2）。验证：server 单测 847、test:client 604、typecheck 两端绿、verify:protected-paths 绿、真仓 codegen:plugins / codegen:gameplays 零漂移；每批手工变异均转红（B1 ×3、B2 ×3、B3 ×1、B4 ×3）。偏差 / 取舍：① 夹具没有物化成临时根目录文件（施工单 `kitfix.contributions.content` / `kitfixContent`），而是各 codegen 单测内的临时根夹具（kfix / kfixShop / arena:spot / builtin ballMove 入口），MF11 夹具矩阵再物化；② kit fragment 的引用写在 mode 的 **state.json** `fragments`（既有内置 fragment 所在处），不是施工单字面的 manifest；③ `contributes` 强制与 `requires.kits` 耦合（贡献 = 依赖），纯内容插件也要声明一个 api 面版本——依赖边只写一处，PluginHost 装载顺序由它派生；④ module 贡献恰好一端（一条路径只能落在一棵源码树），多端要多条贡献点；⑤ generatedWriterOwned 新增 `*` 单段通配条目，ownership / changed / 客户端 protectedPaths 矩阵三处消费方同步支持，install 回滚根跳过通配条目；⑥ profile 在 launch 输入里是保留键（沿用 ballMove 既有 validateLaunch 形态），非独立参数。tag `mf9-exit`。
- **MF2 persona 与资产主体（门①）**（2026-09-19，提交 4008c6f2 / 2c4027ba / d8c1a6e9 / d1bbaa89 / 9369e654 / 本行所在提交；⚠ 本行、MMO-PLAN §9 的 MF2 勾选与 CLAUDE / AGENTS 的 MMO 行曾随 3D 轨道文档提交 7dc98304 先行入库，B6 的回归 + 门① SOP + 冷档证明在本行所在提交）：B1 shared `protocol/identity.ts`（`AssetOwnerRef` account / persona、`PersonaRef`、`PERSONA_MAX_SLOTS_HARD = 16`、零依赖校验器与 `(owner_kind, owner_id)` 列映射）+ 错误码 `PersonaSlotTaken 4001 / PersonaNotFound 4002 / ControlConflict 4003`（指纹重钉，additive）；B2 schema——`persona` 表（per-zone）、经济三表 `owner_kind / owner_id`、`user_currency` PK 与 `currency_ledger.uk_idem` 重建，`tools/db-bootstrap.ts` `ensureAssetOwnerShape`（INFORMATION_SCHEMA 守卫、`db_bootstrap` 租约下一次性、legacy / 目标两形态外 fail-closed，存量行无损并入 account）；B3 经济主体化（`debitInTx / creditInTx / getBalance / intent` 末位可选 owner 缺省 account，`kCacheCurrency` 随主体分键，relayer 对 persona 主体只落状态、不 redisApply / thaw / trim）；B4 KitTx 主体化 + persona 门面（`createPersona / assertControl / deactivatePersona / deletePersona` + 事务外 `listPersonas`，固定锁序 fail-closed，表闸对 `persona` 照拒）；B5 会话撤销覆盖 persona（`revokePersonaSessions`：顶号按区、封号 / 撤销全部区；`writeGroupSess` 先抬后踢、踢完再抛；`/admin/kick` 抬代失败 500 不踢；踢人流消费侧账号级抬后照踢；`persona.idx_persona_uid`）；B6 回归 + 门① 发布 SOP（SERVER.md §8.2）+ 冷档不碰 persona 的真库证明（int/archive）。退出条件逐条：同账号两 persona 钱包 / 流水互不可见 ✅（int/economy）；shop / mail / redeem / arena / arenaShop / snake 回归绿且旧路径 ledger 行 `owner_kind=0` ✅；旧 `control_epoch` 提交 0 行 ✅；乱序锁反例被消 ✅（触库前拒 + 两事务各自升序不互卡）；freeze / thaw 不碰 persona ✅（int/archive 真库 + 源码钉）；同一 `withKitTx` 内 createPersona + 自有写任一失败整体回滚 ✅；超硬上限槽位拒 ✅；`deletePersona` 前置（active / 在世界房拒）与 deactivate → delete 生命周期 ✅。基准：服务端单测 864、客户端单测 604、`test:int` 全绿（含新 persona-session / 扩的 gateway / db-bootstrap / archive）；`verify:all` 在基线红项 `verify:sync` 处停，其后各阶段逐条补跑全绿，仅三处基线红——`test:uniflex-ui-contract` 4 例、`test:sync-mirror-matrix` 8 例（与 verify:sync 同一根因：入库镜像缺入库 .meta，⚠ 本轨道 MF6a / MF2-B1 新增的 `logic/page/{Chat,Party}Logic.ts`、`shared/protocol/lobbyRpc/domains/{chat,party}.ts`、`shared/protocol/identity.ts` 镜像也在清单里，需开 Creator 生成后连同提交）、`test:inventory` 1 例（docs/evidence 跟踪文件政策，MF0 行已登记）；每批 ≥ 2 处手工变异并写进提交信息（B3 含「owner 缺省改 persona → 旧路径 owner_kind=0 用例转红」）。偏差：① arena 是已安装 kit，B4 给其测试假实现补门面桩触发锁不一致，按工具规则 bump `arena` 1.0.0 → 1.0.1 并 `install --reinstall-from-tree`（锁 source package → tree，catalog 生成物随之更新）；② B5 额外加 `persona.idx_persona_uid`（账号级撤销 `WHERE user_id = ?` 否则全表扫），`schema.sql` 受保护文件显式重钉、bootstrap 守卫对 B2 形态存量表补建；③ 签名与正文略异——`createPersona(uid, slot, meta?)`（kitId 取自事务句柄）、`listPersonas(kitId, uid, sId)`，并新增 `deactivatePersona`（正文只给了 delete 的 inactive 前置、没给置 inactive 的门面）；④ 会话代只在顶号 / 封号 / 撤销抬，⛔ 不在每次 `written` 抬（非 MMO 宿主的登录不多一次 MySQL 写；sess 过期后重登由世界侧 join 复核组 sess 兜）；⑤ 孤儿 persona 的对账属 kit 侧（mmo kit MK0-B3 characters 面），框架侧只证明 `deletePersona` 前置与生命周期；⑥ B4 机检行的「交换锁序 → 死锁用例转红」以「删升序判定 → 乱序锁用例转红」实现（锁序违规在触库前拒，⛔ 不等 InnoDB 死锁裁决，无死锁可复现）。
- **MF5a 观察者同步·GameRoom / SQL 视图房路径 + D4 名册分离**（2026-09-19，提交 9db63ceb / fc5dfd9f / 369cadb7 / 88391af8 / 9968cc6f / 本行所在提交）：B1 `defineS2C(type, validator, { perSession: true, coalesceKey? })` + 生成 `GAME_WIRE_PER_SESSION`（既有 token 字节不变，逐字节钉）；B2 `rooms/core/{InterestSet,ObserverSync,Baseline,OutboundQueue}.ts` + shared `protocol/observerSync.ts`（`wireChecksum` / `OBSERVER_SYNC_LIMITS` / `IObserverEnvelope`）；B3 S2CPorts 对 perSession 广播发送期拒 + 生成表 ⇄ 运行时 token 启动期断言；B4 manifest `roster: "public" \| "hidden"`（hidden 根不生成 players / 无 player 类，`ROOM_STATE_ROSTER` + catalog `roster`，GameRoom 名册改读服务端座位表、public 同步镜像到 Schema；夹具 `viewFixture`）；B5 `GameMode.observer` 能力 + `context.observers` 端口（interest / emitPerSession / requestBaseline / seq / nextSeq），GameRoom `stepFixed` = tick++ → prepare（首发 / 重连 / 超限 / 请求 ⇒ 只含兴趣集 baseline）→ onStep → flush（差分 + 按会话排空），客户端 `logic/rooms/observer/ObserverReconciler` + `bindObserverStream`，viewFixture 内存 / SQL（`k_kitfix_view` 临时库真栈）双源；B6 world-bench 剧本 `view-r100 / view-r300` + 文档。退出条件逐条：超视距两会话互不收到 ✅；跨格 enter / leave 各恰一次且顺序正确 ✅；重连 baseline 只含兴趣集且 checksum 通过 ✅；perSession 全房广播被拒 ✅；私有字段对他人零泄露 ✅（int + 单测 + 变异）；慢会话超限重同步且回执不丢 ✅；`roster:"hidden"` 房的真实 Schema 序列化不含名册 / 视口 ✅；既有 mode 生成物字节不变 ✅。基准：视距 300 → 100 每会话出站 p50 55,331 → 9,488 B/s（−83%，§11.2）；服务端单测 888、客户端 607、test:int 201 全绿；verify:all 在基线红项 verify:sync 处停、其后各阶段逐条补跑全绿，仅三处基线红——test:uniflex-ui-contract 4 例、test:inventory 1 例、test:sync-mirror-matrix 12 例（同一 .meta 根因，缺口随本阶段新增的 Cocos 镜像扩大：`shared/protocol/observerSync.ts`、`shared/gameplays/viewFixture/wire.ts`、`shared/gameplays/generated/state/viewFixture.ts`、`logic/rooms/observer/ObserverReconciler.ts`，需开 Creator 生成 .meta 后连同提交）；`GAME_ROOM_PROTOCOL_VERSION` 不 bump（§11.2 规则，写进各批提交信息）。偏差：① `ObserverSync.diffAndEmit(session, entities, tick)` 由框架记上一版视图（正文签名写作 `(session, prev, next)`）；② baseline 提前到 `mode.onStep` **之前**的 prepare 阶段，保证单 seq 流顺序 baseline → 私有 → 差分（正文只写「每 tick 排空」；首发 ⛔ 不靠 seq===0 判）；③ `OutboundQueue` 对不可丢类的上界是软的、重同步标记未清期间可合并类照丢（正文未细化）；④ 新增端口 `observers.nextSeq`（私有流与视野流共用单流的必要面）；⑤ 三个有界原语缺省 128 / 512 / 256 为 MF5a 候选值（§11.2，MK1 只许收紧）；⑥ 「客户端 stateRenderer 对应端」无需改动——shared 生成 validator 已按 descriptor 决定 players 有无，客户端只加 reconcile 端口；⑦ `viewFixture` 的 mode 实现落测试侧（`test/fixtures/viewFixtureMode.ts`，⛔ 不进生产 registry），world-bench 剧本从测试侧 import；⑧ B4 给 arena 以外的既有测试补了「预置座位走座位表 seam」（`state.players` 只是 public 镜像）。**MF5a 退出 = slg 2b 开工条件**（已通知 slg.md §10.8）。
- **MF4 WorldRoom / WorldRuntime / 租约 / 控制权（门③）**（2026-09-19，提交 c61dde16 / ce5b21aa / 39c19209 / 9705ba6f / ccde4349 / 05e9933a / 2c455fed / 9fe7118a / 本行所在提交）：B1 shared 世界协议一次定型（`RoomName.World`、`WORLD_ROOM_PROTOCOL_VERSION=1`、`IWorldRoomJoinOptions` exact 校验器、`WorldPhase`、错误码 4101–4103、矩阵 World 行）；B2 codegen `kind: match|world` + `world {emptyPolicy, emptyAfterMs, checkpointMs}`（缺省 = §11.2 冻结值）、world 根必填集 `{tick, phase:WorldPhase, instanceId, mapId, line, authorityEpoch}` ⛔ players、`WORLD_MODE_IDS` / `registerGeneratedWorldModes` 分表、聚合 `ROOM_STATE_KIND`；B3 MySQL `world_instance`（含 `write_seq`，P1）+ `rooms/core/control.ts`（`acquireAuthority` / `setInstanceState` / `acquireControl` / `releaseControl` / `assertControl` / `readPersonaOwner` 全部 Rows-matched CAS）；B4 Redis 权威租约 `rooms/core/WorldLease.ts`（`kWorldLease` SET NX PX + `kWorldFence` INCR 发号、续租 / 释放 CAS Lua、`WORLD_LEASE_TTL_MS=15 s / RENEW=5 s` 加载期断言 renew×3 ≤ ttl、丢租回调恰一次）；B5 `rooms/WorldMode.ts`（§4.5 十钩，⛔ 不继承 GameMode）+ 无头 `rooms/core/WorldRuntime.ts`（假时钟、固定步 catch-up 120、有序命令队列、Recovering → Active → Draining → Offline、空实例三策略、检查点节拍 + `ports.onCheckpoint` periodic / forced、⛔ import colyseus 机检）；B6 `rooms/WorldRoom.ts` 传输壳（autoDispose=false；`worldRoomAuth = createRoomAuth({ protocolVersion: WORLD_ROOM_PROTOCOL_VERSION, validateJoinOptions: validateWorldRoomJoinOptions })`；建房 = 目录 → 租约 → 权威 CAS → root → recover → active；准入固定时序 ①–⑩（persona 归属存储真源、ticket 端口、`acquireControl` CAS、本房同 persona 旧会话 lost-control + Replaced 关闭码）；C2S 经 WireDispatcher 喂 `runtime.enqueue`，出站按 tick 经 S2CPorts；租约 onLost / GM / mode.requestDrain ⇒ Draining ⇒ 强制检查点 → Offline（WITH_ERROR 关闭、归还控制权、释放租约、state offline、dispose））+ `rooms/core/WorldProfile.ts`（profile "world" = AccessPolicy world-ticket、⛔ 无 StartPolicy；RoomProfile 对 kind world 拒绝 / 跳过）+ `rooms/core/WorldDirectory.ts`（(sId, mapId, line) → 实例，id 缓存 + 行每次回读）+ `world.config.ts`（world 进程 rooms 表，合体入口 app.config.ts 合并）；B7 客户端 `net/rooms/WorldRoomTransport.ts`（RoomName.World 独立传输，⛔ RoomClient / GameRoomTransport 零改动）+ `matchmaking.ts` `WorldRoomMatchmakingStrategy { kind:"world", mapId, line? }`；B8 `test/int/world-room.test.ts` 真栈（真 Server + 真 Redis + 真 MySQL + SDK）。退出条件全部机检成立：worldFixture 只新增文件即建房 / 准入 / 推进 / Draining（真栈）；WorldRuntime 无 Colyseus 进程跑完剧本；双登只一个控制权（真库 CAS + 真栈顶号）；租约失效拒输入并 Draining（真 Redis DEL ⇒ lost）；空实例三策略各一例；`GAME_ROOM_PROTOCOL_VERSION` / `LOBBY_PROTOCOL_VERSION` 不动、`WORLD_ROOM_PROTOCOL_VERSION=1` 进矩阵（B1 源码钉 + B6 行为行）。变异验证逐批写在提交信息（B3 CAS 谓词 / B4 续租永不过期 / B5 import colyseus + catch-up + sleep + phase / B6 六条 / B7 三条 / B8 两条）。回归：服务端单测 921、客户端单测 611、`test:int` 206（全绿）；verify 各阶段绿，基线红项不变（`verify:sync` .meta、`test:sync-mirror-matrix` 8、`test:uniflex-ui-contract` 4、`test:inventory` 1）。偏差：① B5 只写检查点节拍，落点端口 `ports.onCheckpoint`（periodic / forced）随 B6 补入 WorldRuntime；② `entries/world.ts`（PS1 / PS4）未落地，B6 先做 `world.config.ts`（rooms 表 + `registerWorldRuntime`）由合体入口合并，拆分时原样搬；③ B8 的 shared / 夹具 mode 半边随 B6 提前落地（壳测试需要生成 world root 与生成 token），夹具 mode 住 `test/fixtures/worldFixtureMode.ts`（viewFixture 先例）而非 `rooms/modes/worldFixture/`，客户端不建 gameplay module（`wireExposed:false`）；④ ticket 端口是占位（`placeholderWorldTicketPort`：非生产接受合法 sha256、生产 fail-closed），MF8 换 WorldTicket；⑤ `rooms/core/RoomAuth.ts` 泛型化（`deps.validateJoinOptions` 注入）与 RoomProfile / GameRoom / app.config 改动是显式框架侵入（提交信息声明 + 锁重钉），GameRoom 路径逐字等价；⑥ world 玩法 C2S 的 phases 以 `GamePhase.Playing` 表示 `WorldPhase.Active`（dispatcher 共用 GamePhase 词表，非 Active 映射为 settle 只放 Ping）；⑦ worldFixture 的 `s2c.worldFixture.pos` 刻意非 perSession（MF5a「只有 viewFixture 声明 perSession」矩阵不动；MF5b-B3 加 perSession 族）；⑧ 同 persona 本房双登 = 顶号（新连接 CAS 赢），跨房的旧世界靠 MF7b `assertControl` / `withWorldTx` 发现，⛔ 本阶段不做周期 assertControl；⑨ `WORLD_DRAIN_GRACE_MS=5 s` 是候选数字（MF8 交接落地后进 §11.2），`DEFAULT_WORLD_LINE=0`（分线分配归 MF10）；⑩ `KICK_CLOSE_CODE[Replaced]`（4902）复用为世界失控制权关闭码、`WITH_ERROR`（4002）为世界 Offline 关闭码（客户端 `worldLeaveKindOf` 分类），⛔ 未新增 shared 关闭码常量。tag `mf4-exit`。
- **MF5b 观察者同步·WorldRoom 接入**（2026-09-20，提交 43b0c827 / 0d7e2adc / 本行所在提交）：B1 观察者运行时住进无头 `rooms/core/WorldRuntime.ts`（`WorldMode.observer` 能力 + `context.observers` 端口与 GameMode 同形；每会话 OutboundQueue 对所有 mode 存在；stepOnce = tick++ → prepareObservers（首发 / 重连归位 / 超限 / 玩法请求 ⇒ 只含兴趣集的 baseline，epochId = `<instanceId>#<authorityEpoch>`）→ onStep → flushObservers（差分进队列）；`markAway` 宽限中不差分 / 不 baseline，归位即 requestBaseline），`rooms/WorldRoom.ts` 每 tick 排空在线会话的 perSession 积压（宽限中 ⛔ 不排空）；worldFixture wire 加 `s2c.worldFixture.{enter,update(coalesce id),leave,private,baselineBegin,baselineChunk,baselineEnd}`（perSession）+ `c2s.worldFixture.resync`，实体带私有字段 `stamina`（modeVersion 1 → 2）；B2 客户端 `WorldRoomHandle.bindObserverStream(types, sink)`（与 GameRoomTransport 同形，接 ObserverReconciler；私有流走 onMessage 并喂 cursor）；B3 MF5a 矩阵在 worldFixture 上逐项重跑 `test/world-visibility-leak.test.ts`（超视距互不可见 / 私有字段零泄露 / perSession 广播被拒 / 跨格 enter-leave 各一次 + update 按 rev / 重连与 resync baseline + 宽限中不排空不重放 / 慢会话超限重同步 / roster hidden 根无 players + 离座即忘 seq 从 1）+ `gameplay-wire-per-session` 扩到两个夹具。变异验证：夹具把 stamina 塞进 enter 投影 →「零泄露」红；WorldRuntime 删 flushObservers →「跨格」红；WorldRoom 排空不跳过 away →「宽限中不排空」红；markAway(false) 不 requestBaseline →「重连 baseline」红；客户端漏绑 baselineChunk → 客户端用例红。⚠ WorldRoom 单一路径通过 ⛔ 不作 SLG 2b 开工证据（那是 MF5a）。偏差：① 差分 / baseline 住 WorldRuntime 而非 WorldRoom（模拟与传输分离 §4.6-5：无头可重放；GameRoom 路径不动）；② 世界房命令在下一固定步才被消费，`resync` 请求在再下一 tick 的 prepare 生效（GameRoom 是到达即执行）；③ `pos` 直发回执保持非 perSession，与观察者流并存；④ 兴趣集突变触发 baseline 由 mode 经 `observers.requestBaseline` 自决（夹具只演示 resync / 重连两条）。tag `mf5b-exit`。
- **MF7b 检查点 / 世界事件 outbox**（2026-09-20，提交 be50abf0 / 8f1da3cd / 2bb60051 / 32da36de / 0bd33abf / 本行所在提交）：B1 `rooms/core/CheckpointPort.ts`（信封 `{rev, eventOffset, authorityEpoch, controlEpoch?, schemaVersion, stateHash, snapshot}` + 端口 `saveInstance / loadInstance / savePersona / loadPersona`（save* 在框架给的世界事务句柄内写 kit 自己的表；快照内容归 kit）+ 版本窗口 `minSupported ≤ schemaVersion ≤ version` 不兼容 fail-closed + stateHash（wireChecksum）复算 + `MemoryCheckpointPort`）；B2 kit-api 第 7 条 `withKitWorldTx`（首句 `UPDATE world_instance SET write_seq = write_seq + 1 WHERE server_id = ? AND instance_id = ? AND authority_epoch = ?`，0 行 AuthorityLostError 自动 ROLLBACK；逐 persona `assertControl` 升序；受限句柄 `.conn` 不可达 + `writeSeq` + `appendWorldEvent` 只许本 kit role:"world-event" 表；`beforeCommit` 框架钩子）+ `rooms/core/WorldTx.ts` 再导出 + 真库 `test/int/world-tx.test.ts`；B3 `WorldEventPort`——worker / 世界事务的 `claimWorldEvents`（门 `checkpoint_rev ≤ world_instance.checkpoint_rev`、`attempts < WORLD_EVENT_MAX_ATTEMPTS=5`、`FOR UPDATE` + 逐行 CAS 0 → 1）/ `releaseWorldEvent`（达上限 ⇒ dead）/ `deadLetterWorldEvent`，`rooms/core/WorldEventPort.ts` `supersedeWorldEvents` / `worldEventStats`；原子规则（M09 / D25）实现取**选项 ④「事件批只随分线检查点同事务落库」**，①–③ 门 / superseded 保留作纵深；真库 `test/int/world-event-dedup.test.ts`（门 / opId 去重 / release / dead / supersede / worker 门面）；B4 `WorldMode.checkpoint` 能力（`{kitId, port, schema, eventTable?}`）+ `context.events.append(kind, payload)`（分线内单调 seq）/ `context.requestCheckpoint(reason)` + 准入 `session.checkpoint` 回灌；WorldRuntime 事件缓冲 / 检查点批（rev = max(已落库, 已发出) + 1、eventOffset = 最后 seq、事件批移出；commit 只前进、rollback 放回缓冲最前）；`rooms/core/WorldCheckpoint.ts` 编排（同一世界事务：分线快照 → 在座 persona 快照 → 事件行 checkpoint_rev = rev → beforeCommit `world_instance.checkpoint_rev = rev` 权威 CAS）；WorldRoom Recovering `loadInstance` + superseded → recover 回灌、准入 ⑦ `loadPersona`（损坏 / 不兼容 ⇒ BadRequest）、离座 / Offline 强制点、落盘串行链、AuthorityLostError ⇒ Draining；B5 夹具 kitfix 世界持久层 `test/fixtures/kitfixWorld.ts`（`k_kitfix_checkpoint` / `k_kitfix_world_event` role:"world-event"、`SqlCheckpointPort`、grant worker）+ 真库 `test/int/world-crash-restart.test.ts`（硬杀 A → A′ 从检查点恢复：位置回退 ≤ 1 周期、货币 0 回退、事件恰一次发奖、A 迟到写 0 行）；B6 §7.3 逐行用例 `test/world-rollback-windows.test.ts`（② / ⑤ 位置 ≤ 1 周期 + 登出强制点 0 回退 + 热状态清零、③ 强制点即时落盘、④ timer 存 dueTick 恢复后按 tick 差重排、⑥ offset 续号 ⛔ 重用、① / ⑦ 事件批原子 + 崩溃丢失重放重新产生 + 落盘失败放回缓冲）+ SERVER.md §8.3 世界事件 outbox 口径 + KIT.md §4 接法。退出条件全部机检成立：杀房重启位置回退 ≤ 1 周期、货币 / 装备 0 回退（真库 world-crash-restart）；崩溃后事件不重复发奖（同事务落库 + opId = eventId 去重，world-event-dedup）；旧 owner 写被存储边界拒（world-tx AuthorityLostError、crash-restart 迟到写 0 行）。变异验证逐批写在提交信息：B1 删 stateHash 复算 / 删版本窗口；B2 删首句 `AND authority_epoch = ?`；B3 认领 SQL 删门；B4 不 commit / 不落事件行 / 离座不取强制点 / Recovering 不 loadInstance；B5 不落 persona 快照 / 删首句谓词；B6 rollbackCheckpoint 不放回 → ① 红、fixture 不重排 timer → ④ 红、finalLeave 不取强制点 → ② 红、recover 不接 eventOffset → ⑥ 红。回归：服务端单测 954、`test:int` 全绿；verify 各阶段绿，基线红项不变。偏差：① 原子规则取选项 ④（同事务）——正常路径 superseded 恒 0 行，门与 superseded 成纵深；代价 = 奖励最多延迟到下一分线检查点（强制点即时）；② `WORLD_EVENT_MAX_ATTEMPTS=5`、claim 上限 32 / 256 是候选数字（未进 §11.2）；③ 夹具 kitfix 两表只在 int 内物化（⛔ 进 registry / 目录），夹具 mode 仍住 `test/fixtures/worldFixtureMode.ts`；④ 事件只随检查点批落库，⛔ 独立 outbox 表 / 独立落库路径；⑤ `beforeCommit` 是 `withKitWorldTx` 的 deps 钩子而非 kit 可见 API；⑥ 分线 tick 恢复后从 0 起（timer 按 dueTick 差重排是 kit 侧约定，夹具示范；HP / MP / 冷却等字段归 kit 快照，框架只校验信封）；`world_transfer` 在途闸随 MF8-B7；失败批的 rev 作废不复用（下一批取更大的号）。tag `mf7b-exit`。
- **MF6b 附近聊天**（2026-09-20，提交 74ef0369 / 本行所在提交）：B1 core 世界 token——shared `protocol/messages.ts` core 表加 `c2s.world.chat` / `s2c.world.chat` + 新增 core 选项表 `CORE_C2S_OPTIONS`（rateCost 2）/ `CORE_S2C_OPTIONS`（perSession）（字面量、gameplay-codegen 语法读取：c2s 只认 rateCost、s2c 只认 perSession / coalesceKey，未知键 / 未知消息名 fail-fast）⇒ 生成物 `GAME_WIRE_RATE_COST["c2s.world.chat"]=2`、`GAME_WIRE_PER_SESSION["s2c.world.chat"]=null`、`CORE_S2C_TOKENS.WorldChat = defineS2C(…, { perSession: true })`，S2CPorts 启动期 perSession 一致性断言纳入 core token；`WorldRuntime.sayNearby`（受众 = 兴趣集含 `primaryEntityOf(sender)` 的在座会话 ∪ 发送者，逐会话进观察者队列 = perSession 单 seq 流、与 enter / leave 同序，⛔ 广播 / ⛔ Redis）；WorldRoom 固定序：core phase 闸只在 Active 放行 → 在座 → `chatPolicy.canSend` → `transform`（结果再过 wire validator）→ sayNearby，任一步拒 ⇒ BadRequest；match 形态 GameRoom 对 WorldChat BadRequest；向量 `wire-vectors/core.ts`；B2 用例 `test/world-chat.test.ts`（生成表 / 视距外不收 + 视距内含发送者各收一次 + 载荷无 uid / perSession 广播被拒 / 策略 canSend·transform·ctx 频道 `nearby:<worldAddress>` / Draining 拒 + 离座拒 + 心跳照常）+ 文档（SERVER.md §5 / §13、KIT.md §4、rooms/README）。退出条件全部机检成立：视距外不收；视距内含发送者各收一次；`broadcastS2C(s2c.world.chat)` 被拒。变异验证：sayNearby 删兴趣集过滤 →「视距外」红；`isPerSessionToken` 恒 false →「广播被拒」红；corePhaseAllows 放行非 Active →「Draining 拒」红；codegen 忽略 CORE_S2C_OPTIONS →「生成表」+「广播被拒」红。回归：服务端单测 967、客户端 612、typecheck / 指纹 / 受保护路径绿，verify 各阶段绿、基线红项不变。偏差：① core token 选项落在 messages.ts 的两张**选项表**（`CORE_*_OPTIONS`）而非在 messages.ts 里直接 `defineC2S/defineS2C`（protocol/ ⛔ 反向依赖 gameplays/；codegen 仍只语法读字面量）；② 策略拒绝 / 未在座 / 非 Active 一律 BadRequest，⛔ 新增房间错误码（kit 侧按需在客户端映射）；③ `ChatPolicyContext.channel` 对附近聊天取 `nearby:<worldAddress>`（与 Lobby 频道字面不冲突）；④ GAME_ROOM / LOBBY 协议整数与 `WORLD_ROOM_PROTOCOL_VERSION=1` 均不 bump（world 专属 core token、首个客户端未发版）；⑤ 无 observer 能力的 mode 只有发送者自己收到（受众恒由兴趣集算，M13）。tag `mf6b-exit`。
- **MF8 交接与一次性凭据**（2026-09-20，提交 056096a3 / 162334f9 / 2bb25a8c / 73716dac / 0c6c596f / 356f003e / 本行所在提交）：B1 `schema.sql` `world_transfer`（per-zone，`(server_id, transfer_id)` PK、state requested → prepared → committed → activated → finalized | cancelled、control_epoch / ticket_sha256 / reserve_expires_at / payload、active_key 在途 '1' 终态 NULL ⇒ UNIQUE(server_id, persona_id, active_key) 一 persona 只一在途）+ zoneTables；B2 `rooms/core/transfer.ts`（每步持久 CAS；transferId 幂等重放 already；Committed 前可 cancel、之后 ⛔ 回源；rotateTransferTicket 只在 committed；activate 唯一一次；expireReservations 预留到期释放）+ `rooms/core/WorldTicket.ts`（kRoomTicket 形态：Redis STRING JSON、PX、键 = sha256、绑定 (sId, uid, personaId, worldAddress, controlEpoch) + transferId；issue SET NX / claim Lua CAS issued → pending(session) 同原子段校验绑定、同会话重放 ok、他会话 pending、seated 拒 / release / seat / revoke；MemoryWorldTicketPort 同语义）+ config WORLD_TICKET_TTL_MS=30 s / WORLD_TRANSFER_RESERVE_MS=30 s（候选）；B3 WorldRoom 准入固定时序（同步公共拒绝 → 同步占位 → 异步 claim → 同步重验 → 交接凭据先读持久状态（非 committed = 已消费，取控制权前拒 ⇒ ⛔ 顶掉已入座者）→ persona 检查点 + beforeAdmit → acquireControl → activate → onAdmit → seat → finalize；claim 后失败 release）+ 源房编排 `requestTransfer`（冻结 → Requested → 目标解析 → Prepared → 交接强制点 → 重验 → 凭据 → Committed；失败 cancel + 解冻）+ `completeTransfer`（mode 先发就绪 token → 排空 → "transferred" 离座）；WorldRuntime 冻结集 + `context.transfer`；worldFixture `c2s.worldFixture.portal` / `s2c.worldFixture.transfer`（modeVersion 3）；MF4 占位凭据端口删除；B4 框架域 `world`（`world.enter` / `world.resolveTransfer` query、push `world.transfer`、错误码 WORLD_PERSONA_INVALID / WORLD_TRANSFER_INVALID / WORLD_SERVICE_UNAVAILABLE；`core/world/enterRpc.ts`：Committed 交接 ⇒ 解析 + 凭据轮换、activated ⇒ 懒 finalize；config WORLD_PUBLIC_WS_URL 端点）；B5 客户端 transfer strategy `{ kind: "transfer", transferId, mapId, line? }` + `WorldRoomTransport.transfer()`（退源房 → 带凭据 join → endpoint 非空换 client → 句柄 transferId）；B6 跨房唤醒（WorldRoom Active 起登记本进程 room signal 表、Committed 后 `publishPush kind=room world.transfer` best-effort）；B7 `test/int/world-transfer-flow.test.ts` 真栈四注入（fault-matrix `world-transfer` 组：transfer-reply-lost / -client-drop / -source-crash / -target-crash）+ `tools/plugin/transferGate.ts` 卸载闸（该 kit persona 有在途 world_transfer 行 ⇒ 拒，⛔ bypass）+ 文档（SERVER.md §5 / §13、KIT.md §4、CLIENT.md §7、rooms/README）。退出条件全部机检成立：四注入下只激活一次（committed → activated 持久 CAS 恰一次，四段都收敛 finalized）、只扣一次费（kit 载荷随行落库一次）；旧房迟到写被 MF7b 存储边界拒（source-crash 段 releaseControl(旧 epoch) 0 行）；预留随 transferId 到期释放（expireReservations 只清 Committed 前过期行）；凭据二次使用被拒（seated / 轮换后旧凭据 missing）；重连凭 transferId 解析目标（resolveTransfer 轮换 / 已终态退化为目标分线普通凭据）。变异验证逐批写在提交信息：B2 六条（状态谓词 / 在途槽 / Lua 绑定 / seat）；B3 四条（已消费前置拒 / release / 冻结 / 离座）；B4 三条（归属 / 登记失败作废 / 懒 finalize）；B5 两条；B6 两条；B7 三条（旧凭据作废 / 懒 finalize / 卸载闸计数）。回归：服务端 / 客户端单测、typecheck、指纹、受保护路径、verify 各阶段、test:int 全量与 fault-matrix world-transfer 组全绿，基线红项不变。偏差：① 原子规则外的「交接就绪」通知由 mode 用自己的 token 发（框架只交回 WorldTransferReady），Lobby `world.resolveTransfer` 是第二条路（回复丢失 / 重连）；② `world.enter` 在 persona 有 Committed 交接时改为解析交接（⛔ 绕开交接去别的图）；③ 凭据绑定当前 controlEpoch，控制权 CAS 输后旧凭据随 epoch 作废（需重新 enter）；④ 端点来自 WORLD_PUBLIC_WS_URL（空 = 同区 gameWsUrl），WorldDirectory 记录节点 publicAddress 归 MF10 / PS4；⑤ 源房 Committed 后按 CONSENTED 关闭（⛔ 新增关闭码；客户端据就绪消息区分）；⑥ 状态机 / 凭据用例落 test/int（真 CAS / 真 Lua 才是被测物）；⑦ 新域不进 lobbyRpc/index.ts façade（MF6a 先例）；⑧ MF8-B7 的 int 文件名为 `world-transfer-flow`（`world-transfer.test.ts` 已被 B2 状态机用例占用）；⑨ 客户端只到传输层（退源房 → join → 句柄），Lobby 侧编排留给消费方 kit（MK1-B3）。tag `mf8-exit`。
- **MF10 容量 / 多进程 / 运维**（2026-09-20，提交 76ae49ff / a8211ff7 / b1898b14 / 本行所在提交）：B1 分线分配——`rooms/core/WorldRegistry.ts`（权威房把 seated / capacity / publicAddress / holder 写 coord HASH kWorldInfo，TTL = 租约、按续租节拍刷新、入座 / 离座立即刷新、Offline 撤销；Redis + Memory 两实现）+ `WorldDirectory.allocate(sId, mapId, { capacity })`（按 line 升序取第一条 seated < capacity 的分线，无登记 = 空实例；全满开第一条空缺线到 WORLD_MAX_LINES_PER_MAP=8，再满 ⇒ WorldLinesExhaustedError；resolve 指定 line ≥ 上限 ⇒ WorldLineLimitError）+ config WORLD_LINE_CAPACITY=100（缺省 = §11.2 maxPlayers）；`world.enter` 未指定 line 走分配、越界 / 全满 ⇒ 新错误码 WORLD_LINE_UNAVAILABLE（域 world contractVersion 2），endpoint 改取登记的节点地址；B2 多进程启用路径——`core/infra/worldMultiProcess.ts` 纯断言（WORLD_MULTI_PROCESS=1 ⇒ REDIS_COLYSEUS_URL 必须与 durable / coord 是不同 Redis **实例**，独立 db 不算，加载期拒启）+ `world.config.ts worldServerOptions()`（RedisDriver / RedisPresence / WORLD_PUBLIC_ADDRESS / 可注入放置钩子，缺省 Colyseus 最少房间策略）+ app.config.ts spread；B3 运维只读面——shared HTTP 契约 `POST /admin/world/{instances,transfers,events}`（密钥头；分线实例 ⊕ 登记 / 在途交接 / 各 kit world-event 表积压）+ `core/world/adminRead.ts` + `http/admin/world*.ts`；B4 实验——`tools/world-bench/multi-process.ts`（两 world 节点子进程，D27 形态不启用 RedisDriver：客户端经 world.enter 直连；kill -9 A → 租约 / 登记同期过期 → 再 enter 端点回落 → B Recovering 接管）；报告 `docs/perf/world-bench/2026-09-20T040342-multi-process.json`：租约 3 s 下 kill 后 2.44 s 过期、接管 2.56 s、权威 epoch 1 → 2、检查点 rev 2 回灌、位置回退 20（≤ 1 周期上限 80）。退出条件全部机检成立：单进程分线用例绿（world-directory：满员开新线 / 上限 / 越界 / TTL 自愈 / 房登记）；独立 Redis 断言红 / 绿（含子进程真加载 config.ts）；运维面读出积压（admin-world-read）；多进程报告存在并登记偏差。变异验证逐批写在提交信息：B1 四条（上限 / 封顶 / 满员判定 / 入座刷新）；B2 两条（同实例比较 / 未启用不装）；B3 两条（kit 收窄 / 登记合并）。回归：服务端 / 客户端单测、typecheck、指纹、受保护路径、verify 各阶段、test:int 全量绿，基线红项不变。偏差：① 满员阈值是配置 WORLD_LINE_CAPACITY（分配侧）而非 mode.capacity（房内硬上限仍是 mode.capacity）——`world.enter` 不知道 mode，按图定制留 kit / MF11；② 登记 TTL = 租约（⛔ 两倍）：B4 实测两倍会让客户端在 A 死后一个租约周期内仍被指向死节点；③ 放置钩子只给注入面，缺省交 Colyseus 最少房间策略（实验采 D27 形态，未启用 RedisDriver，放置策略留部署方）；④ 运维面「非生产挂载」落为密钥头保护 + 与既有 admin 端点同治理（生产置于已鉴权反向代理后），只读面走 POST + JSON body；⑤ publicAddress 两处（Colyseus WORLD_PUBLIC_ADDRESS host[:port] 与 world.enter 的 WORLD_PUBLIC_WS_URL wss origin）生产须指向同一节点；⑥ 单测 harness 缺省内存登记（缺省 Redis 端口会真连 coord ⇒ 单测进程不退出，本阶段发现）；⑦ 实验用 dev 身份提供者（AUTH_PROVIDER=dev）让编排进程签的会话跨进程可验；⑧ 单测曾见 `multi-mode-wire` 一次并发抖动（单跑 / 重跑绿），⛔ 与本阶段改动相关。tag `mf10-exit`。
- **MF11 收口审阅与冻结**（2026-09-20，提交 80234284 / f6eeb83b / 52db09d2 / b11bda7b / 本行所在提交）：B1 三视角对抗审阅 [MMO-REVIEW-2.md](MMO-REVIEW-2.md)（R2-01–R2-14：High 2 改代码——R2-01 陈旧 Committed 前交接行懒清 `transfer.cancelIfStale`（`world.enter` 与源房 `requestTransfer` 遇在途行先收敛再拒 / 放；本房已 activated 未 finalize 先 finalize；Committed 及之后 ⛔ 动）、R2-02 客户端交接退源房有界等待 3 s + 本地 abandon；Medium 6 改口径（R2-03 分配是提示 / R2-04 凭据随 epoch 作废 / R2-05 检查点表保留归 kit / R2-06 周期 INSERT 负载 MK1 实测 / R2-07 首帧前不收 / R2-08 harness 内存登记）；Low 6 核对通过；变异 4/4 转红）；B2 真相对齐（inventory 三项 core 能力 world-room-runtime / kit-worker / social-primitives；protected-paths `rooms/core/**` semantics + Non-intrusive §12.2 补 MF4–MF10 内核清单；OVERVIEW §6-9 / §7、SERVER §5 MF11 段、KIT §4、CLIENT §7、PLUGIN §5、core / websocket / rooms 三份 README；协议指纹一致 ⛔ 重钉）；B3 aoi-probe 拍板留（§5.5）；B4 「框架侧完成」矩阵 `npm run verify:mmo-fixture-matrix`（`apps/server/tools/mmo-fixture-matrix/`：一次性检出 + node_modules 符号链接（@game/* 指回检出）→ 物化 kitfix（kit：kitfixWorld = worldFixture 派生改名重挂到 kit 下、两表 SQL、检查点端口、grant worker、贡献点 grants、api default）+ kitfixContent（插件：requires + contributes data + 空客户端 module）→ 红证明（两个 codegen `--check` 转红并点名夹具）→ sync 镜像 + 合成 Creator .meta → `plugin -- pack` 两包 → git reset 回 pristine → `plugin -- install` 首装两包（所有权 / 依赖 / 贡献闸 + 写锁，只新增 24 项）→ writers → 绿证明（codegen ×2 / sync ×2 / plugin check / protected-paths / verify-inventory / 登记五处 / 两端 typecheck / K1 + gameplay-codegen + plugin-lock + 客户端 K1 / protectedPaths 用例）→ 分类（新增 22 全在夹具所有权推导集、修改 33 全在 writer 生成物家族 + 安装器锁、违规 0）→ 幂等（55 项 sha256 不变）→ 反向控制 a（GameRoom.ts 改一行 ⇒ 分类红 + protected-paths 红）/ b（worker 注入 K1 违规 import ⇒ 导入边界红 + plugin check 红）；34/34 步通过，报告 docs/evidence/mmo-fixture-matrix/（本机），⛔ 进 verify:core）；B5 本行 + 头部状态 + §10.3 注 + MMO-PLAN §9 勾选 + CLAUDE / AGENTS 行。回归：服务端单测 1002、客户端 614、typecheck 两端零错、指纹一致、受保护路径 76 文件未变、verify 各阶段绿（基线红项不变：verify:sync .meta、test:sync-mirror-matrix 8、test:uniflex-ui-contract 4、test:inventory 1 docs/evidence 政策）、test:int 全量 215 绿。偏差 / 发现：① 矩阵不碰 Redis / MySQL——§10.3 的运行时判据由 test/int 覆盖，矩阵只证「只新增文件 + 全部 check」（§10.3 已注）；② `gameplay-codegen.test` 两条用例（MF4-B2 / MF5a-B1）以「真仓无 canonical world mode」为前提，矩阵跳过它们——mmo kit 落地时须改成夹具根内断言；③ canonical（wireExposed）world mode 仍要求一份客户端 GameplayModule，而世界形态不经 GameRoom joiner 进入——夹具用「拒绝并说明入口」的占位 module，kit 的客户端入口流程归 MK1；④ 纯内容插件（只 contributes）仍须有客户端登记（entry），否则「两者皆无即拒绝」——夹具给空 install 的 module，是否放宽归 PLUGIN-REGISTRY；⑤ kit-api 未再导出 CheckpointPort / CheckpointEnvelope 类型，kit 目录（K1 规则 ①）无法直接实现端口——夹具把端口放在 `rooms/modes/<id>/`（规则 ② 允许）经 `WorldModeCheckpointCapability["port"]` 取型，建议 MK0 前在 kit-api 再导出；⑥ pack 要求客户端文件的 Cocos 镜像与 Creator `.meta` 随包（安装侧不合成）——矩阵按 tools/plugin/meta.ts 形态合成；⑦ 首装的所有权冲突闸要求推导集内不得已有文件——矩阵从物化树打包后 git reset 回 pristine 再装；⑧ 已安装锁 `scripts/packages/**` 刻意不在 readGeneratedWriterPaths，分类器显式记作安装器 provenance；⑨ `plugins.generated.ts` 只把有客户端 entry 的 kit 渲染为装载单元（kitfix 无 entry ⇒ 无依赖边）；⑩ 矩阵内用例文件串行跑（有的用例在树内临时物化包，并发会被 freshness 用例读到）；⑪ inventory 用例「apps/kits/ 缺席也绿」会扫登记文档的链接，KIT.md 链到 apps/kits/*/README.md ⇒ kit-worker 能力不登记 KIT.md 为文档（B5 修正）。tag `mmo-framework-v1`。
- **MK0 骨架**（2026-09-20，提交 a7b9ebf8 / 334db811 / b897745f / 09ce50bb / 本行所在提交）：B1 骨架——`apps/kits/mmo/kit.json`（api characters / world / content 三面 v1、modes mmoWorld、七张 `k_mmo_*` 表（`k_mmo_world_event` role:"world-event"）、workers worldEvents）、三份 SQL（角色行 ⛔ 位置 / HP，检查点表整份落框架信封）、`mmoWorld` manifest / state（生命周期六字段 + packId / packVersion / population / scriptStateRev）、`wire.ts` §7.4 全部 token（观察者六件取 MF5b 形态）+ 向量、worker（grantCurrency ⇒ 主账 credit persona 主体，其余死信）；B2 shared 三面（characters 闭合枚举 / 名字闸 / 摘要 / 槽位视图；world 地址 / `integrate` / `clampToMap` 双端同源；content §7.5 schema + `validateContentPack` fail-closed + 索引）+ 灰盒包；B3 server 三面 + WorldMode（撒怪 / onBeforeAdmit 预热角色 / onEnter 同图检查点回灌 / 常量速度积分 + 钳图 / 视野流 aoi.viewRadius / 私有流 / 检查点端口 `rooms/modes/mmoWorld/checkpoint.ts`）+ `mmo` 域（`mmo.characters` / `mmo.createCharacter`：同一 withKitTx 内 createPersona + 角色行 + 回执，重放回读）+ 真栈 `test/int/mmo-world.test.ts`（建角 → 进图 root packId / population → baseline 本人 + 三只 slime → 走路 update 单流 → private → baselineRequest → 离座强制点落角色检查点、列表 mapId 变 greybox → 再进图从检查点位置起）；B4 客户端（kit module resident + `MmoRuntime`；客户端三面；选角页 route `mmoCharacters` + 菜单「进入世界」；mode 四件：launch `{ characterId, mapId }` → `world.enter` 凭据 → `WorldRoomTransport.join`、`ObserverReconciler`（seq 断裂自动重同步）、2D 公告板视图 + 最小 HUD）；B5 灰盒内容包随 B2（TS 字面量单源）；B6 验收链——仓内 pack → 删树文件 → 首装（字节不变 + `scripts/packages/mmo.lock`）→ `plugin -- check` ✔ → `plugin -- test mmo --int` 8 文件 22 用例绿；干净树全链闭环 `npm run verify:kit-clean-install -- --kit mmo`（新根命令 `scripts/kit-clean-install.mjs`：仓树 pack → 一次性检出删干净该 kit（codegen `--allow-delete` kit / 域 / View / mode）并提交 → 首装 → codegen / sync / 指纹 → 临时库 `db:bootstrap` 两遍 → check → test → 两端 typecheck）：25 步通过——首装只新增；临时库首遍 kit 迁移 4 个 kit 6 文件（mmo 三文件 7 条语句）+ worker 租约行 1，第二遍新应用 0 / 租约新增 0；`plugin -- test mmo` 按锁 7 文件 21 用例绿；安装后 status 新增 101 / 修改 31 且修改全是 writer 生成物；world-bench 世界房剧本支持（`Scenario.world` 钩子 prepare / cleanup / cleanupAll、RoomName.World、采样接 `WorldRoom.advance`、跑完等房 dispose 再清）+ 剧本 `mmo-greybox`（§10.1 场景 A：40 机器人 / 192 只 idle slime / 20 s / 种子 7）首次数字：tick p50 10.0 / p95 11.4 / p99 12.7 / max 13.7 ms（396 步，fixedStep 50）、出站 p50 75.2 / p95 79.8 KB/s/会话（总 55.8 MB）、delta 650 条/s/会话、baseline 9.1 KB/join、事件循环 p99 22.4 ms、RSS 151 → 231 MB（报告 `docs/perf/world-bench/2026-09-20T100933-mmo-greybox-mk0.json`；⚠ 同机同进程，只作比较；kill criterion 100 KB/s 余量约 25%，MK1 视距 / 量化再收）。退出条件（§7.6）全部机检成立：干净树 pack → install → codegen → bootstrap → check → `plugin -- test mmo` 闭环；一个角色进图、走路、看到怪（int + 基准）。回归：服务端单测 1017、客户端 620、typecheck 两端零错、指纹重钉一致、受保护路径 76 文件未变、verify:inventory / plugin check / codegen ×2 fresh、test:int 全量 216 绿。偏差 / 发现：① 内容包是 TS 字面量单源（`apps/shared/src/kits/mmo/content/greybox.ts`）而非 §7.6 的 `apps/kits/mmo/content/greybox/*.json`——kit 服务端 K1 ⛔ node:fs、tsconfig 未开 resolveJsonModule；MK4 经贡献点（data 贡献 = JSON）装载时退役；② kit.json 只声明 MK0 三个面与 `mmo` 域（§7.1 草案的九面 / 三域随各阶段加入并各自 versioning；mmoSocial / mmoAdmin 无路由不声明——框架要求「shared 已声明必须有端点文件」同批）；③ 观察者流取框架六件分流，§7.4 单一 `delta` 草案作废；④ 检查点端口住 `rooms/modes/mmoWorld/checkpoint.ts`（K1 规则 ① 不许 kit 目录 import WorldMode 类型；MF11 偏差 ⑤ 的 kit-api 再导出仍待做）；⑤ 角色速度 / HP / MP 取灰盒常量（movement 面 MK1 改按职业模板）；⑥ 客户端 joiner 单 world 进程：`world.enter` 的 endpoint 非空时仍沿用当前 SDK client（多进程直连归 MK1 / PS）；重同步请求的 authorityEpoch 暂用 1（服务端 MK0 不校验，MK1 随句柄暴露根状态后改）；⑦ 建角 = 灰盒默认名 / 战士 / dawn（正式命名 UI 归内容插件）；⑧ 三条真仓快照用例改为按树派生（game-mode 精确同集拆 match / world、gameplay-wire-per-session、gameplay-codegen MF5a-B1 / MF4-B2），mmo-fixture-matrix 的跳过项可去——MF11 R2-15 收口；⑨ persona.status 0 = active / 1 = inactive（listCharacters 对账）；⑩ 基准发现：每次离座都强制一次**全员**检查点（40 人同时离座 ⇒ 40 次全表落盘，与清理竞态曾报 PersonaNotFound / AuthorityLost 噪音）——MK1-B4 检查点验收时把离座强制点收窄为该 persona 的快照（或合并），记 R2-06 同族；⑪ 37 份 Cocos `.meta` 按 tools/plugin/meta.ts 形态合成（未开 Creator；uuid 随机 v4，Creator 沿用）；MK0-B4 验收「Creator 预览证据一次」未做（要 Creator + Chrome + 本地栈人工触发），与 EXTRAS 编辑器待办同列；⑫ `verify:kit-clean-install` 是新根命令（CLAUDE / AGENTS / README 已登记），MK4-B6 冻结复用。tag `mk0-exit`。
- SLG 消费方准备阶段 1 / 2a（2026-09-09）：已完成并验收；10000×10000 SQL 稀疏地图、worldmap/march v1、七张表与桌面地图页；verify:all 通过、Creator 17 步/13 图/console 空、干净安装与独立空库包测试 35/35、重复 bootstrap 零新应用。证据见 [SLG 验收记录](evidence/creator-2026-09-09/slg/README.md)。这不构成 MF5 第二消费方接线完成，SLG 2b 仍待 MF5a。（本行是 2026-09-09 时点记录：地图尺寸随后于 2026-09-10 改为 1500×1500 并扩为五图，见 slg.md §9 / §10。）

2026-09-09 设计同步：已将 SLG 已采纳的两种世界形态、MF5 GameRoom 消费/名册验收、MF7 受租约保护 KitTx 契约补入正文。SLG 阶段 1 / 2a 的本轮实施与验收已完成；MF5、MF7 与 SLG 2b 尚未实施/验收，本次同步及 SLG 交付不登记为框架阶段完成。

2026-09-19 v1.1 修订：按 [MMO-REVIEW.md](MMO-REVIEW.md) M01–M20 修订正文（用户逐条拍板，M01 取「不入库草案、正文自包含」）——阶段重排 M02 / M05 / M06（MF5 / MF7 拆 a / b、MF3 / MF6a 前置 MF1、门①②解耦）、persona 门面 M03、kit 开工门统一 M04、`roster` 开关 M07、角色热状态唯一真源 M08、事件批与检查点原子规则 M09、lvr 登记与 MF8 边界 M10、kit-schema 增量字段 M11、其余 M12–M20 措辞与数字口径。⛔ 不构成任何阶段完成。**R 系列**：2026-09-09 曾有一轮对本文的审阅（slg.md §6 S4 / S6 引用的 R1 / R2 / R4），原文未入库；其结论已被 §4.1.1 两种世界形态、MF5a 的 GameRoom 消费路径 + D4 名册分离（R1 / R2）与 MF7a 的租约守卫受限 KitTx（R4）吸收，后续引用一律用 M 编号。

2026-09-19 v1.2：按 [MMO-PLAN.md](MMO-PLAN.md) §7 施工细化回写——P1 `world_instance.write_seq` 随 MF4 建表；P2 `world_transfer` 卸载闸挪到 MF8；P3 `/admin/notice` 是新 HTTP 端点（契约表 + codegen:http）；P4 附近聊天 core token 落 `protocol/messages.ts` + `wire-vectors/core.ts`；P5 `withKitWorkerTx` 首句复用 `renewLeaseGuard`；P6 `world-bench` 输出目录已核不受 `verify:perf` 影响；P7 进程形态拍板 D27（§4.2 新段、MF4 / MF8 / MF10 三处改口径、§6.3 注入点）。⛔ 不构成阶段完成。

2026-09-19 3D 轨道同步（[3d.md](3d.md) SD9–SD12 拍板）：mmo 世界视图首版 2D 公告板 + 接口 3D-ready（§7.5 `IPresentationMap.model?`、§7.6）；小游戏 / WebGL1 为首版目标（首发消费方 = lvr，mmo 不承担 SD10 门）；3D 资产每包一个 bundle。⛔ 不构成任何 MMO 阶段完成，不改 MF / MK 前置。3D-33（同日）：mmo FGUI HUD 与世界的输入归属依赖 3d.md SC1-B9（gameplay 载体闸）或退路（HUD 画在世界节点内），MK1 接 HUD 前须满足其一（§7.6）。

- **MK1 世界闭环**（2026-09-20，提交 8fe30a45 / b3e5ca51 / f9d3a8fc / e5980eb9 / 3a0e8c29 / 本行所在提交；**B1–B6 全部交付，退出待议**）：B1 movement 面——shared / server / client `api/movement`（normalizeDir / integrate / clampToMap / parseCollisionGrid / applyIntent / resolveMove 双端同源，`MMO_MOVE_STEP_MS = TICK_MS`）、content v2（`classes[]` 职业模板 = 速度 / HP / MP 真源、碰撞位图校验、出生 / 复活 / 刷新点 ⛔ 落墙）、直发 `s2c.mmoWorld.pos`（modeVersion 3）、客户端 MovementPredictor（回执按 seq 和解：位置以回执为准、方向 / 目标保持最新意图）；B2 AOI 接入——kit 内部 `aoi/{grid,visibility}.ts`（网格候选 → 精确视距 → 位面 / 隐身 × 阵营规则 → 最近优先截到 `MMO_INTEREST_MAX_ENTITIES = 256`，框架 InterestSet 超限即抛所以 kit 先收敛）、名片 `factionId`（world 面 v2、modeVersion 4）；B3 两图交接——灰盒 v3 东郊 + 一对门，portal → `c2s.mmoWorld.transfer` → 框架 MF8 → perSession `transferReady`（凭据只此一处出网），落点经 persona 快照 `arrival` 传到目标图，客户端 `transferReady` ⇒ 退出本局 → 带参重进（凭据在手 ⇒ transfer strategy 直进；无凭据 ⇒ `world.enter` 由框架解析在途交接），真栈 `int/mmo-transfer`（reply-lost 注入走 resolveTransfer；其余三注入归框架 world-transfer-flow）；B4 检查点——**显式框架侵入**：`WorldMode.onPersonaCheckpoint` / `WorldRuntime.forcePersonaCheckpoint`（预留分线 rev 号）/ `WorldCheckpointer.savePersona` / WorldRoom 离座与交接 prepare 先试 persona 级（MK0 偏差 ⑩ 收口，`world-persona-checkpoint.test.ts`），kit-api 再导出 CheckpointPort 三型（MF11 偏差 ⑤ 收口）⇒ 端口迁回 `kits/mmo/persistence/checkpoint.ts`，角色检查点 rev 按角色单调 + 004 `instance_rev`，快照 v2（cooldowns / loot / scriptVars / timers / regions，schema {2, minSupported 1}），真栈 `int/mmo-checkpoint`（周期分线点 → persona 级离座点只落该角色 → 硬杀 → 恢复：怪物 hp / 位置 ≤ 1 周期、epoch +1、僵尸迟到写被拒）；B5 社交包装——`social` 面（`worldChannelId` = realm 频道、`partyOf` 读框架 party（kit-api 新只读门面 `readPartyView`）→ 成员映射到角色 + worldAddress / mapId、附近聊天只映射 fromEntityId → 名字）、`mmoSocial` 域 `partyLocate` + 端点 + 向量、客户端 `sayWorld`（框架 chat 门面）/ `partyLocate` / `partyPanelRows`（队伍面板消费 PartyLogic）+ 世界房 `say` / `chat`，真栈 `int/mmo-social`；B6 基准——剧本 `mmo-hotspot`（§10.1 场景 B：500 只 slime 挤在出生点 ±300、机器人点地热点内随机点 + 每 ≈ 4 s 一句附近聊天、逐级 25 / 50 / 100）+ 生产节拍 `MMO_WORLD_TUNING`（角色位置每 2 步 = 10 Hz 进观察者流、相位按实体错开、停下补 bump、本人 pos 仍 20 Hz；兴趣集每 4 步 = 200 ms 按会话相位重算）+ 场景 A 回归。数字（20 s / 种子 7 / ⚠ 机器人与服务端同进程）：A 40 人 192 只：tick p50 9.3 / p95 12.2 / p99 16.2 / max 18.5 ms、出站 p50 40.2 KB/s/会话（MK0 逐步节拍 75.2 → −47%）、delta 340/s、baseline 8.8 KB/join；B 25 人 500 只：p99 15.9 ms / 40.5 KB/s ✅；B 50 人：p50 13.1 / p95 15.2 / p99 24.9 / max 26.8 ms、68.5 KB/s、delta 624/s ✅（p99 贴线）；B 100 人：p50 26.7 / p95 29.2 / p99 55.2 / max 62.1 ms、125.8 KB/s、delta 1118/s、事件循环 p99 71 ms、RSS 139 → 273 MB ❌（报告 `docs/perf/world-bench/2026-09-20T14*-{mmo-greybox-mk1-exit,mmo-hotspot-hot25|50|100-exit}.json`；逐步节拍 / 未错相位的中间数字见同目录 `*-tuned` / `*-final`）。退出条件（§7.6）：故障矩阵（断线 / 重启 / 交接）——kit 真栈 mmo-transfer + mmo-checkpoint + 框架 world-transfer-flow 四注入 / world-crash-restart 照常绿 ✅；**kill criterion（§11.2：100 机器人 + ≥ 300 实体、tick p99 < 25 ms、出站 p50 ≤ 100 KB/s）在热点 100 人未达（p99 55 ms / 126 KB/s），50 人贴线达标** ⇒ 曾 ⛔ 未 tag；**2026-09-20 用户拍板选项 ③「接受 50 人热点为 v1 上限」**：50 人三次重跑（种子 7 / 8 / 9，2026-09-20T1615*）tick p99 20.8 / 24.2 / 24.8 ms、出站 p50 69.1 / 68.8 / 68.5 KB/s/会话（全部 < 25 ms / ≤ 100 KB/s；种子 9 有一次 108 ms 的单 tick 尖峰，p99 仍在线内），§11.2 登记为明示例外（收窄的是场景 B 的互见人数定义，阈值数字不变；口径仍是同进程机器人）⇒ tag `mk1-exit`。回归：服务端单测 / 客户端单测 / int mmo-world・mmo-transfer・mmo-checkpoint・mmo-social 绿、typecheck 三端零错、指纹重钉一致、受保护路径锁重钉一致、plugin check / test mmo 绿。偏差 / 发现：① shared `tsc --noEmit` 自 MK0-B2 起一直红（content mapDef exactOptionalPropertyTypes），MK0 各批只跑了 server / client typecheck——B1 修，之后每批三端都跑；② 预测器「回执后重放在途意图」是空操作（意图已折叠进本地状态）——变异不红即删掉重放；③ 角色检查点 rev 直接用分线信封 rev 会在跨分线后相撞（1062 被当幂等吞掉 ⇒ 选角页读到旧图）——B3 真栈首跑即暴露，B4 收口为按角色单调 + `instance_rev`；④ int 用例监听必须 join 一回来就挂（已 Active 的房下一 tick 就发 baseline）；⑤ 单测里房不 dispose 或交接 Committed 的跨房唤醒走真 coord Redis 会让 `node --test` 进程不退出、整套件挂死——harness `publish` 置空，本地单文件跑加 `--test-force-exit`；⑥ `db:bootstrap` 读已安装锁的 sql.files（新迁移要先重装锁才应用）；⑦ kit 身份变更（新增域）重装要 `--allow-identity-change`；⑧ **热点上限的本质 = 互见人数 × 更新率的 O(N²) 扇出**（100 人互见 ⇒ 每会话每秒 ≈ 1100 条 delta、全房 ≈ 11 万条 / s 编码），且同进程机器人把 100 个 SDK 客户端的解码算进事件循环（p99 71 ms）——需要 bots 独立进程的基准台才能分离服务端本体成本；候选收紧（§11.2「只许收紧」）：分距离分层节拍、角色可见上限（< 256）、位置量化、附近聊天限频；⑨ 客户端 joiner 单 world 进程（endpoint 忽略）、重同步 authorityEpoch 仍用 1（MK0 偏差 ⑥ 未动）；⑩ Creator 预览证据仍未做；⑪ Cocos `.meta` 又合成 9 份（movement / social 目录 + 文件 + mmoSocial 域）；⑫ 施法 / 拾取归 MK2 / MK3，场景 B 以聊天 + 点地代替「聚集施法 / 拾取」。
- **MK2 模拟闭环**（2026-09-20，提交 5f384abe / d822103a / 本行所在提交；**B1–B3 全部交付并退出，tag `mk2-exit`**；⛔ 不依赖 MK1 退出拍板——§7.6 表 MK2 无前置）：B1 combat 面——shared `api/combat` 双端同源纯函数（ticksOf / effectiveStats（aura 加攻减防 ≥ 0）/ damageOf（框架 `shared/logic/battle.ts` 新增公式族 `calcDamageWithDefense` = max(1, power + 0.5·atk − 0.3·def) × 等级成长，同 roll 同结果）/ healOf / auraOf / cooldownReadyTick / checkCast 十种拒绝序 / threatOf）；wire private 流 `cooldowns`（集合变化才发 ⛔ 每 tick 倒计时）/ `casting`（modeVersion 5）；服务端施法管线（`target` / `cast` ⇒ checkCast ⇒ 读条（移动打断）或瞬发 ⇒ 到点二次校验 ⇒ 扣蓝 / 冷却 / 施效（直伤按公式 + 分线随机流、记仇恨 / 治疗 / aura）⇒ opResult）、死亡（清热状态、怪离开视野、按 respawnSec / `MMO_PLAYER_RESPAWN_MS` 5 s 复活、checkpointOnDeath ⇒ 强制点）；战斗步在移动之后按实体插入序结算 ⇒ 同命令序 + 同种子同轨迹；客户端 CooldownModel / pickHostileTarget / 技能栏 HUD；灰盒 v4 五技能。B2 ai 面——shared `api/ai`（`decide(perception)` 纯决策：出拴绳 evade / 射程内 cast / leash 0 只还手 / chase / aggro 候选 acquire / return 回家 / patrol 换点；`bucketOf` / `shouldThink`；`./nav` 网格 A*：直线直达短路、八邻域不穿角、确定性 tie-break、展开上限 fail-closed、共线去点）；服务端 `api/ai` `PathfinderPort`（**回执可同步**：缺省进程内同 tick 生效 ⇒ 无头重放确定性；Promise 走收件箱下一步按 instanceEpoch / entityVersion 消费，迟到即丢）+ compute 任务形态 `core/compute/tasks/kits/mmo/pathfind.ts`（组合根经 runInPool 接线，kit ⛔ import compute）；kit 内部 `ai/scheduler.ts` AiScheduler（每 tick 只 tick % buckets 那桶 + wall 预算内思考、超预算顺延下一 tick 优先、轮转不饿死；时钟可注入）；mode 怪物脑（感知 = 仇恨最高活目标 / aggro 内最近可见角色 / 就绪技能射程 / 距出生位；动作 acquire / chase 沿路径点地 / cast 走同一施法管线 / evade 清仇恨回满血回家 / patrol；怪物每 tick 同一 resolveMove）；生产 `MMO_AI_BUCKETS = 4`、`MMO_AI_TICK_BUDGET_MS = 2`（候选）；灰盒 v5 野猪（aggro 150 / 拴绳 400）+ 田鼠（三点巡逻）。B3 掉落——shared `api/inventory` v1 掉落半边（`rollLoot` 按权重 + 数量域只经分线随机流、`nearestLoot`、`lootClaimed` 载荷闸；候选数字 `MMO_LOOT_EXPIRE_MS` 60 s / `MMO_PICKUP_RADIUS` 48 / `MMO_LOOT_MAX_PER_INSTANCE` 512）；wire `IMmoEntityWire.count?`（modeVersion 6）；mode：怪死按 `lootTableId` 掷骰落在尸体位置 ⇒ kind loot 实体（AOI 网格 ⇒ 兴趣集 enter）、拾取 = 活着 + 存在 + 半径内 + 有 `checkpoint.eventTable` ⇒ `context.events.append("lootClaimed")`（随下一个分线检查点同事务落 `k_mmo_world_event`，§7.3 ④）+ 离开视野 + ok、到期消失 / 超上限淘汰、分线快照 `loot[] / lootSeq`（expiresTick 重排、id 续号）；worker `lootClaimed` ⇒ `persistence/items.ts` `grantItemInTx`（bag 下一空槽 + `k_mmo_receipt` op_id = eventId，重放只回读回执 ⇒ 0 重复）；客户端拾取输入 / HUD / 表现映射；灰盒 v6 三物品两掉落表。退出条件（§7.6）逐条机检：**有序执行与预算上限** ✅（战斗步 / AI 步按实体插入序；AiScheduler 预算用例 + 编排预算数字沿用 `ORCH_TICK_BUDGET_MS` 口径）；**AI 分桶不挤占主 tick** ✅（假时钟 300 只挤一桶每 tick 只思考 2 只、160 步人人都思考过且相差 ≤ 149；生产 4 桶 / 2 ms 下 int mmo-world・transfer・checkpoint・social・loot 照常绿）；**可无头重放** ✅（同种子同命令序 ⇒ 同 hp 轨迹（B1）/ 同掉落（B3）；进程内找路同步回执消除了「回执落在哪一 tick」的不确定性）。回归：服务端单测 / 客户端单测 / 五份 kit 真栈 int / plugin check・test mmo / 指纹（wire 不在 protocol/）/ 受保护路径 76 文件未变 / verify:inventory 绿、verify:sync 仅基线红项。偏差 / 发现：① 进程内找路若走 Promise，同步驱动的单测（连续 advance 不让出微任务）永远收不到回执、生产也白等一 tick ⇒ 端口改为「可同步回执」；② MK2-B1 战斗用例改用 slime 无技能的木桩内容（还手归 ai 用例）；③ compute 池接线留给组合根（本批只交任务形态）；④ 仇恨只记直伤（治疗 / 增益不计）；⑤ inventory 面只落掉落半边 v1（掉落归属 / 堆叠合并 / 背包槽上限归 MK3-B1，届时 bump）；⑥ 认领奖励延迟 ≤ 一个分线检查点周期（⛔ 拾取强制点，§7.3 代价条款）；⑦ int 用例曾误删预铺的 worker 租约行（`tryAcquireLease` 只 UPDATE 过期行）——归还改为置 expires_at 过期，⛔ DELETE；⑧ `.meta` 合成累计 +11（combat 4 / ai 3 / inventory 4）；⑨ 客户端 joiner endpoint 忽略 / authorityEpoch 1 未动（MK0 偏差 ⑥）、Creator 预览证据仍未做；⑩ MK1 退出仍待拍板（MK2 退出不以它为前置）。
- **MK3 资产闭环**（2026-09-20，提交 042044fa / 本行所在提交；**B1–B3 交付，退出待 24–72 h 长跑报告**）：B1 inventory 面物品半边（v2）——shared 背包 wire `IMmoBagWire`（bag 24 / equip 3 / mail 64；私有流 `bag?` ⇒ modeVersion 7）、`equipSlotOf` / `checkEquip` / `planGrant`（先并入堆叠 → 空格 → 邮箱，都满 null）/ `bagAttrs` / `bagSignature`、掉落归属 `MMO_LOOT_OWNER_MS` 15 s；存储 `ItemStore`（按 rev CAS 的 update / remove）+ `sqlItemStore`（交换经 tmp 三步同事务）；服务端 `grantItem` / `moveItem`（装备规则、合并 / 交换、conflict）/ `claimLoot`（worker，opId = 事件 id）/ `readBag` / 账号级 `bagOf` / `moveItemFor`；域 `mmo` 加 `mmo.bag` / `mmo.moveItem`（contractVersion 2）；mode 掉落归属（击杀者 = 仇恨最高的角色，独占期他人 owned）+ 私有流 bag（准入预热、装备属性进攻防、拾取后轮询 loadBag 变了才发）；客户端 bag 模型 / HUD 摘要 / runtime `bag` / `moveItem`；真栈 `int/mmo-inventory`（并发同一件恰一个 conflict、重放零写入）+ `int/mmo-loot` ⑥（拾取后私有流带上落库背包）。B2 角色保存定稿——`k_mmo_character` 列集冻结（身份 + 成长 + checkpoint_rev），角色快照 v2 内容 fail-closed（`validatePersonaSnapshot`，坏快照 ⇒ 出生点 + 日志），选角页 mapId 取最新检查点（既有），保留策略 `MMO_INSTANCE_CHECKPOINT_KEEP 32` / `MMO_CHARACTER_CHECKPOINT_KEEP 16`（同事务删旧行）。B3 长跑——`world-bench --sample-every`（等长采样：tick / 出站 / 事件循环 / 内存 / 活动资源按类型 / 机器人 / 错误 / 世界探针）+ 最小二乘每小时增长 + 检查点表有界 + `SOAK_TOLERANCE` 判定；冒烟 `mmo-greybox --bots 20 --seconds 240 --sample-every 30`：8 样本，RSS 139 → 126 MB（斜率 −482 MB/h = GC 回落）、heap 55 → 56 MB、活动资源恒 68、tick p99 7.9 → 4.4 ms、事件积压 0、分线检查点行 7 ≤ 1 × 32、角色检查点行 140 ≤ 20 × 16、机器人 20 不掉线 errors 0 ⇒ **stable**（报告 `docs/perf/world-bench/2026-09-20T170039-mmo-greybox-soak-smoke.json`）。验收：并发拾取 / 重复请求 / 重启重放不复制物品或奖励 ✅（机检）、币账仍在框架 ✅（未动）；**24–72 h 长跑（§10.2）未跑 ⇒ ⛔ 未 tag `mk3-exit`**，命令 `npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --scenario mmo-hotspot --bots 50 --seconds 86400 --sample-every 300 --label soak-24h`，报告回写本行后补 tag。回归：服务端 / 客户端单测、六份 kit 真栈 int、plugin check・test mmo、指纹重钉一致、受保护路径未变。偏差：① moveItem 经 Lobby RPC 走 withKitTx（无分线作用域；withWorldTx 形态留给世界内编排 grantItem，MK4）；② 背包变更无推送（kit-api 无 push 门面）——拾取后轮询 + `mmo.bag` 查询；③ 队伍分配 / 拾取权转让归内容 / MK4，背包页 UI 归内容插件；④ 长跑冒烟只有 4 分钟（8 样本），RSS 斜率为负是 GC 回落，24 h 的判定要看正式跑；⑤ 长跑口径仍是同进程机器人（独立进程基准台未建）；⑥ `k_mmo_instance_checkpoint` 保留策略以 rev 差删行（`rev <= new − KEEP`），Recovering 的 superseded 标记不受影响（只看 pending 行）。
- **MK4 编排与验收**（2026-09-20，提交 eb01651a / 67465049 / f0c70d85 / e6d3eec9 / 本行所在提交；**B1–B5 交付，B6 冻结 tag 待两项拍板**）：B1 orchestration 面——shared `api/orchestration`（§8.5 契约：事件 15 种 kind / 命令 15 种 op / `OrchestrationReadApi` / `OrchestrationModule`；`defineOrchestration` 形状校验 + freeze、`validateOrchestrationCommand` exact keys、`effectiveLimits` 与硬上限取小、`digestOf` FNV-1a；ORCH_* 数字：tick 预算 2 ms / 命令 ≤ 64 / 队列 ≤ 256 / vars ≤ 4 KB / timers ≤ 32・≥ 500 ms / prompt ≤ 6 / publish ≤ 16 键 / sayWorld 6 / sayNearby 30 每分钟 / tickEvery 10..1200 缺省 20 / 环形 64 / durable setVar ≥ 30 s）+ kit 内部运行器（本地命令暂存、超预算 / 超命令 / 坏命令 / handler 抛 / 超限 ⇒ 整批作废 + suspend、`packSuspended` 只投一次、快照 timers 按 tick 差重排、rng 种子 = instanceId + tick + eventSeq + stream + 调用序）+ 注册表 + 服务端 `createOrchestrationHarness`（emit / advance / replay 同种子逐条比对）/ `readCheckpointedVars` / `pollGrantResults` + mode 全链（事件源 15 种、命令落地 15 种、编排步在背包轮询之后出站之前、快照 `orchestration` 槽 + 脚本怪）+ worker `grantItem`（回执 op_id = `orch:<packId>:<eventSeq>:<idx>` ⇒ 跨重启零写入）/ `packSuspended` + 边界机检（TS AST）；B2 贡献点装载——kit.json `contributions` content（data，server + client，schema = 包顶层形状）/ presentation（module，client）/ orchestration（module，server）⇒ `contributions.generated.ts` 两端；服务端内容注册表多包（贡献优先、内置灰盒兜底、**一图一包**）+ mode 按 `contentFor(mapId)` 解析 + 编排注册表收录贡献模块 + 启动期 packId 交叉核对；客户端内容 / 表现 / 物品模板改经贡献包；发现并修 reinstall-from-tree 推导集冲突闸把 writer 生成物当混入（`plugin-reinstall-generated.test.ts`）；B3 卸载 / 升级闸——`tools/plugin/instanceGate.ts` 运行中分线闸（`world_instance` 候选行 × coord Redis 权威租约键存在 ∧ 登记 `kWorldInfo.mode ∈ kit modes` ⇒ 拒；在租缺 mode 也拒；⛔ 不按 state / updated_at；无 bypass；`check` 告警）= 第五道闸，**显式框架侵入**：WorldRegistry 登记加 `mode`、WorldRoom 发布 modeId（锁重钉）；api 冻结 `apps/kits/mmo/api-freeze.json` + `mmo-api-freeze.test.ts`（九面 version / minSupported：characters 1/1、world 2/1、movement 1/1、content 2/2、social 1/1、combat 1/1、ai 1/1、inventory 2/1、orchestration 1/1 + 三端导出符号集；新增 ⇒ version+1、删改 ⇒ 抬 minSupported）+ 真栈 `int/kit-instance-gate`；B4 说明书——kit README「一、说明书」九节（身份与边界 / 九面 / 三贡献点 / mmoWorld 与 wire / 编排清单与预算 / 数字表 / 数据・事件・回退窗口 / 运维 / 验证）+「二、施工记录」；B5 容量证据——最终数字与故障矩阵全表见下两表（kit 0.1.15 / f0c70d85，20 s / 同机同进程机器人）。**退出条件（§7.6）**：干净安装全链闭环 ✅（`verify:kit-clean-install` 25 步，B2）；卸载 / 升级识别在途交接与 pending 事件 ✅ + 运行中分线 ✅（B3）；框架零追加手改 ❌→ 记为**两处显式侵入**（MK1-B4 persona 级检查点、MK4-B3 登记 mode，均随 protected-paths 锁重钉、可 revert）。**拍板项（B6 前）**：① MK3 退出（24–72 h 长跑报告）；② **场景 B 50 人整窗 tick p99 回归**：MK1 退出 20.8 / 24.2 / 24.8 ms ✅ → MK4 最终 37.2 / 25.1 / 32.6 ms（种子 7 / 8 / 9，静机）❌；分窗（5 s）看首窗 34.4（50 人入座 + baseline + JIT 预热）、其后 14.7 / 21.4 / 23.8 ✅ ⇒ 回归集中在预热段（MK2–MK4 新增的入座路径每人一次 DB 读：loadBag / readPartyView / 编排 playerEntered、以及新代码 JIT），稳态贴线在线内——**2026-09-20 用户拍板：接受该数据为 v1 已知回归，优化留 v1.x**（候选：入座路径每人一次的 DB 读合并 / 预热；基准台加 `--warmup` 按稳态窗判定作为口径可选项）；B6 只剩 ①。偏差：① 内置灰盒仍 TS 字面量兜底、贡献包 = 通道证明（首个真实填充归 MG0）；② sayWorld 走分线 notice（kit-api 无 channel 门面）；③ grantResult 靠轮询；④ mmoAdmin.resumePack 未做（probe + 重启恢复）；⑤ 升级闸只冻结 kit 自身面（依赖插件区间闸沿用 install / check）；⑥ 分线闸只连 MYSQL_URL / REDIS_COORD_URL 单区；⑦ 故障矩阵首跑 `world-transfer` 组红 = 用例竞态（client-drop 段立即断言归还控制权，归还是离座后的异步任务）⇒ 改条件等待后绿，⛔ 产品缺陷；⑧ 场景 B 25 人首跑 p99 49.0（max 144.9 单次尖峰）静机重跑 23.3 ✅，记录不作数字。
**MK4-B5 容量证据**（2026-09-20，kit 0.1.15 / f0c70d85；20 s / 种子 7（另注）/ 同机同进程机器人，⚠ 只作比较与阈值判定；报告 `docs/perf/world-bench/2026-09-20T18*-mmo-*-mk4-final*.json`）：

| 场景 | MK1 退出（kit 0.1.6） | MK4 最终（kit 0.1.15） | 判定（kill criterion：tick p99 < 25 ms、出站 p50 ≤ 100 KB/s/会话） |
| --- | --- | --- | --- |
| A `mmo-greybox` 40 人 / 192 只 | p99 16.2 ms、出站 p50 40.2 KB/s | p99 18.5（种子 7）/ 13.9（种子 8）ms、p50 7.1 / 7.6 ms、出站 p50 40.1 / 39.8 KB/s、RSS ≤ 188 MB、errors 0 | ✅ |
| B `mmo-hotspot` 25 人 / 500 只 | p99 15.9 ms、40.5 KB/s | 首跑 p99 49.0 ms（max 144.9，单次尖峰）→ 静机重跑 p99 23.3 ms、p50 7.2 ms、出站 40.4 KB/s | ✅（尖峰记偏差 ⑧） |
| B 50 人 / 500 只 | p99 20.8 / 24.2 / 24.8 ms（种子 7 / 8 / 9）、69 KB/s | 首跑 30.2；静机 p99 **37.2 / 25.1 / 32.6 ms**（种子 7 / 8 / 9）、p50 12.1 / 12.8 / 12.3 ms、出站 p50 68.8 / 68.7 / 69.1 KB/s、RSS ≤ 187 MB、errors 0；分窗（`--sample-every 5`）p99 34.4 → 14.7 → 21.4 → 23.8 ms | ❌ 整窗 p99（2/3 超线、1/3 贴线）；稳态窗 ✅ —— 拍板项 ② |
| B 100 人 / 500 只 | p99 55.2 ms、125.8 KB/s ❌ | p99 66.0 ms、p50 29.2 ms、出站 125.2 KB/s、RSS 251 MB | ❌（已知上限，§11.2 v1 例外：互见 ≤ 50） |

**MK4-B5 故障矩阵全表**（§10.2 逐行 → 证据；`npm run test:faults` 单元 2 组 ✅、`npm run test:faults:int` 集成 3 组 ✅（`world-transfer` 首跑因用例竞态红 ⇒ 修用例后单组重跑 ✅，偏差 ⑦）；int 用例各自在 `test:int` 单文件串行绿）：

| §10.2 故障 | 证据（测试） | 状态 |
| --- | --- | --- |
| 同 persona 跨房 / 跨进程双登 | `int/world-control`（同 persona 两处 join 只一个控制权、旧 epoch 写拒）、`int/world-room`（双登只一个控制权） | ✅ |
| DB 提交成功但响应丢失 | `int/mmo-inventory`（回执重放零写入、并发恰一个 conflict）、`int/mmo-loot`（至少一次 + 回执去重）、`int/kit-persona`（createPersona 幂等）、`int/world-event-dedup` | ✅ |
| 源 / 目标在交接各阶段崩溃 | fault group `world-transfer` 四注入（reply-lost / client-drop / source-crash / target-crash）、`int/mmo-transfer`（kit 载荷 + reply-lost 走 resolveTransfer） | ✅ |
| 租约失效 / 节点停止 | `int/world-lease`（Lua 语义）、`int/world-room`（租约失效 ⇒ Draining → Offline）、`int/world-crash-restart`（硬杀 A → A′ 从检查点恢复、旧 owner 迟到写 0 行）、`int/mmo-checkpoint`（kit 硬杀恢复 ≤ 1 周期） | ✅ |
| NPC 死亡后崩溃 | `int/world-event-dedup`（checkpoint_rev 门、Recovering superseded、至少一次 + 回执去重）、`int/world-crash-restart`（发奖恰一次）、`int/mmo-loot`（掉落认领随检查点落库门内） | ✅ |
| 慢客户端、重复 / 乱序 seq | 单元 `outbound-queue`（队列有界）、`world-visibility-leak` / `visibility-leak`、`world-runtime`（seq 断裂重同步）、`mmoWorld-mode`（意图 seq / 回执） | ✅ |
| 推送流积压 / 消费者卡顿 | `int/push-bus`（真双消费者各恰一次、admin notice）、`int/party` / `int/chat` / `int/guild` | ✅ |
| worker 失租后旧 worker 恢复写入 | `int/kit-worker-lease`（失租写被首句守卫拒、重放零副作用、停止后不再提交、卸载闸） | ✅ |
| 编排预算超限 | 单元 `mmo-orchestration`（65 条 ⇒ suspend 整批丢弃、假时钟超预算、handler 抛、坏命令）、`mmoWorld-mode`（suspend ⇒ packSuspended 审计行 + 不进队 ⇒ resume） | ✅（单元 + 无头；无 int） |
| 同图两分线 | 框架 `int/world-control`（`(server_id, map_id, line)` 唯一 / 权威 CAS）、`int/world-tx`（首句 CAS 按 instance）；kit 检查点 / 事件行按 instance_id（`int/mmo-checkpoint`、`int/world-event-dedup`） | ⚠ 间接（无「同图两条分线同时在线互不可见」专门用例，登记 MG 段补） |
| 手机后台 / 断网 / 杀进程 | `int/world-room`（非主动断线进宽限、重连归位、到期清理）、`int/persona-session`（会话代）、`int/mmo-checkpoint`（离座 = persona 级强制点 = 离线结算） | ✅ |
| 24–72 h 长跑 | MK3-B3 4 分钟冒烟 stable（`2026-09-20T170039-mmo-greybox-soak-smoke.json`）；正式 24 h 待跑 | ⏳（MK3 退出项） |

**2026-09-21 最近一周提交审阅修复**（kit `0.1.19`，本行所在提交；R01–R11 为本轮问题编号，不复用设计审阅 M01–M20）：

| 编号 | 实施修复 |
| --- | --- |
| R01 检查点后继批漏事件 | `WorldRuntime` 事件日志保留到提交，预捕获后批包含全部未提交前缀；串行执行前过滤已经提交的前缀，前批失败只作废该批，后批仍可完整持久化状态与事件 |
| R02 CAS 冲突提交半份奖励 | `worldEvents` 对库存 `conflict` 抛出，整个事务回滚后重试；不把已经写入前序堆叠的事件死信并提交 |
| R03 跨房失控制权阻断旧房保存 | 检查点捕获 `ControlConflictError` 后踢出对应旧会话，旧房停止全部脏写并 Offline，重建从最后有效检查点恢复，其余玩家重新进入；不删除失败 persona 守卫后保存未耐久世界状态。`MemoryCheckpointPort` 角色新旧改按 `(controlEpoch, rev)` 比较 |
| R04 强制检查点失败仍交接 | 后台串行链与本批原始结果分开，交接等待本次强制点结果；落盘失败传回调用者，不继续 commit transfer |
| R05 客户端本人身份污染 | `selfCharacterId` 绑定本次 join 返回的房间句柄，gameplay 与交接沿用该身份，清除提前捕获与跨 join 共享 pending 状态的依赖 |
| R06 编排奖励跨实例误去重 | 新 opId 以区 / instanceId / packId / 事件序 / 命令序稳定派生固定长度 `orch:<uuid>`；worker 继续按旧载荷原键读取已有回执，避免升级后重发 |
| R07 贡献包物品不可发放 / 装备 | shared `mergeItemTemplates` 在双端装载时保证全区同 itemId 同语义（相同模板可复用，异义拒绝）；server `itemCatalog` 汇总全部包，默认库存 / worker 及跨图装备属性使用该目录，兼容无 packId 的既有持久事件 |
| R08 复活位置与旧预测意图 | 服务端复活立即发 pos；客户端死亡时清旧预测，复活按权威位置重建，覆盖单帧多模拟步导致 pos / HP 更新交错的顺序 |
| R09 队列溢出漏暂停通知 | enqueue / schedule 的溢出交由 dispatch 报告一次暂停，审计与 `packSuspended` 通知走同一路径 |
| R10 暂停被错误恢复 | 重新初始化回灌业务状态时不恢复上一进程的 suspended，快照字段只供诊断；本次初始化若再次触发暂停仍生效 |
| R11 delta 丢名片元数据 | 客户端 delta 合并保留未携带的 `factionId` / `count` 等字段 |

版本与兼容：`world` / `content` / `inventory` 的 version 均升到 3，minSupported 仍为 1 / 2 / 1；SQL、wire 载荷与已存回执不改形态。
历史上已经因跨实例键冲突被吞掉的奖励无法由新键推断补发，需按历史事件另行核对。当前消费说明见 `apps/kits/mmo/README.md` §10（安装该 kit 后可用），按批次施工记录保留原文。

已完成定向验证：客户端 19 条、world 126 条、服务端 worker / inventory / contributions 17 条、库存 MySQL 2 条通过；
独立 `PROJECT_ID=mmo_review_0921_world` 真栈的 `mmo-checkpoint` / `mmo-transfer` / `mmo-loot` / `world-crash-restart` / `world-event-dedup` 五文件通过。
完整校验：`verify:all` 已执行；类型检查、生成物 / 镜像 / 保护锁检查、FGUI 与 inventory 校验通过，聚合链在 `test:inventory` 的历史基线断言停止（`docs/evidence` 已被旧提交跟踪，而用例要求夹具中不存在）。本轮新增文档曾使「kit 缺席」夹具产生坏链，已改为可选路径说明并定向重跑通过。后续项目另行补跑：服务端全测 1188 / 客户端 689 通过（同步现有 `new` 后，完整 typecheck、客户端全测以及受该同步影响的服务端 42 条定向回归再次通过），launcher / npm-reference / aggregate-chain / sync-mirror / toolchain-runtime 五个矩阵及 perf 通过；UniFlex UI contract 为 59/60，剩余失败是既有 `BackpackItemCard` 注释含 `Restored` 被文本断言误判（与本轮 MMO 改动无关）。`verify:kit-clean-install -- --kit mmo` 的 25 步通过；本轮同时补齐 README 中已有 `ui:verify-fgui-dom` 命令登记，保护锁 writer 也刷新了此前已修改的 Main.ts 哈希（源码未再改）。本次修复不改变 MK3 长跑待办、MK4-B6 冻结前置、既有容量例外或 MG 段的实施状态。

下一动作：**框架段 MF0–MF11 全部退出（tag `mmo-framework-v1`）；`mmo` kit MK0 已退出（tag `mk0-exit`）；MK1 世界闭环 B1–B6 已于 2026-09-20 交付、同日用户拍板选项 ③ 退出（tag `mk1-exit`；§11.2 v1 例外「热点互见 ≤ 50 人」）；MK2 模拟闭环 B1–B3 已于 2026-09-20 退出（tag `mk2-exit`）；MK3 资产闭环 B1–B3 已于 2026-09-20 交付、退出待 24–72 h 长跑报告（§12 MK3 行）**——热点 100 人的根因（互见 × 更新率 O(N²) 扇出 + 同进程机器人污染）与候选收紧（分层节拍 / 角色可见上限 / 位置量化 / 聊天限频）留在 §12 MK1 行偏差 ⑧，独立进程基准台与收紧留作 v1.x 的可选项（⛔ 阻塞 MK3）；MK3 待长跑报告补 tag `mk3-exit`（用户择时跑 24 h）；MK4 编排与验收 B1–B5 已于 2026-09-20 交付（§12 MK4 行），B6 冻结 tag `mmo-kit-v1-frozen` 只待 ① MK3 长跑报告（② 场景 B 50 人整窗 tick p99 回归 37.2 / 25.1 / 32.6 ms 已于 2026-09-20 用户拍板接受为 v1 已知回归、优化留 v1.x）；下一阶段 MG0 内容插件（`mmodemo` / `mmohold`，MMO-PLAN §4）可开工；PS1 + PS4 入口拆分可随时落地；**MF5a 已退出 ⇒ slg 2b 与 lvr 视图房可开工**（已通知 slg.md §10.8，接法见 KIT.md §4 / SERVER.md §5）；门① 已过，线上部署方按 SERVER.md §8.2 SOP 执行迁移；MF7a 已退出 ⇒ slg / lvr 无人在线结算可开工（已通知 slg.md §0.1 / lvr.md §4.3），各自落地后在此回写一行；门③ 已过：`WORLD_ROOM_PROTOCOL_VERSION=1` 一次定型，首个客户端发版前仍可 revert。MF0 行登记的基线红项（Creator 镜像 `.meta` 同步——现连带 `test:sync-mirror-matrix` 8 例、`docs/evidence` 跟踪文件政策）仍待处置，⛔ 不算 MMO 阶段偏差。
