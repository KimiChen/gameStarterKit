# mmo kit（apps/kits/mmo）—— MMO 地基（说明书 v1）

`mmo` 是 [docs/MMO.md](../../../docs/MMO.md) §7 定义的 **MMO 地基 kit**：常驻分线世界玩法 `mmoWorld`（`kind:"world"`，跑在框架
`WorldRoom` / `WorldRuntime` 上）+ 按面 versioning 的 api（MK0：`characters` / `world` / `content`；MK1-B1 加 `movement`、`content` 升 v2；
MK1–MK4 依次再加 `combat` / `ai` / `inventory` / `social` / `orchestration`）+ 七张 `k_mmo_*` 表 + `worldEvents` worker。内容插件（MG 段样本
`mmodemo` / `mmohold`）只消费冻结的面与贡献点，⛔ 不 import kit 内部模块。实施状态只在 MMO.md §12 回写（施工单 MMO-PLAN.md §3）。

## 状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| MK0 骨架 | kit.json / SQL / `mmoWorld` 单源 + wire / characters + world + content 面 / 灰盒内容包 / 客户端选角页 + 世界视图 / 验收链 | ✅ 2026-09-20 退出（MMO.md §12 MK0 行；tag `mk0-exit`） |
| MK1 世界闭环 | movement 面、AOI 接入、两图交接、检查点验收、社交包装、基准 | ✅ 2026-09-20 退出（B1–B6，kit 0.1.6；kill criterion 取 §11.2 v1 例外「热点互见 ≤ 50 人」，50 人三次重跑 ✅；MMO.md §12 MK1 行；tag `mk1-exit`） |
| MK2 模拟闭环 | combat + ai 面、掉落 | ✅ 2026-09-20 退出（B1 combat / B2 ai / B3 掉落，kit 0.1.9；MMO.md §12 MK2 行；tag `mk2-exit`） |
| MK3 资产闭环 | inventory 面、角色保存定稿、长跑 | B1 inventory 面物品半边 ✅、B2 角色保存定稿 ✅、B3 长跑基准台 + 4 分钟冒烟 ✅ 2026-09-20（kit 0.1.12）；**✅ 2026-09-22 退出**：24 h 长跑 stable（officenvidia，见基准段；MMO.md §12 MK3 行；tag `mk3-exit`） |
| MK4 编排与验收 | orchestration 面 + 运行器 + harness、贡献点装载、卸载 / 升级闸、说明书、容量证据、冻结 `mmo-kit-v1-frozen` | B1 orchestration 面 ✅、B2 贡献点装载 ✅、B3 卸载 / 升级闸 ✅、B4 说明书 ✅（本 README「一、说明书」）、B5 容量证据 ✅ 2026-09-20、**B6 冻结 ✅ 2026-09-22 退出**（tag `mmo-kit-v1-frozen` 含 mmo.lock，kit 0.1.22；MMO.md §12 MK4 行；50 人整窗 p99 回归已拍板接受、优化留 v1.x） |

## 一、说明书（MK4-B4；消费方视角——内容插件怎么用这个 kit）

本节是 `mmo` kit v1 的正式说明书：只写**冻结的对外面**（九个 api 面、三个贡献点、玩法 wire、编排事件 / 命令、预算数字、数据与回退窗口、运维）。
机器真源：`kit.json`（面版本 / 贡献点 / 表 / worker）、`api-freeze.json`（三端导出符号集，`mmo-api-freeze.test.ts` 逐面钉）、
`apps/shared/src/kits/mmo/api/orchestration/index.ts`（事件 / 命令 validator 与 ORCH_* 数字）、`gameplays/mmoWorld/{manifest,state}.json` 与
`apps/shared/src/gameplays/mmoWorld/wire.ts`（token）。本节与真源不一致以真源为准并回修本节。按批次的施工记录（含每批用例 / 变异 / 偏差）在「二、施工记录」。

### 1. 身份与边界

| 项 | 内容 |
| --- | --- |
| 身份 | `kit.json`：id `mmo`、class kit、modes `[mmoWorld]`、api 九面、`contributions` 三个、七张 `k_mmo_*` 表（`sql/001–004`，全部 per-zone）、worker `worldEvents`、域 `mmo` / `mmoSocial` |
| 消费方能碰什么 | ① 三端门面 `apps/{shared,server,client}/src/kits/mmo/api/<face>/index.ts`（§2）；② 三个贡献点（§3）；③ `mmoWorld` 的 wire token 与 launch 参数（§4）；④ `mmo` / `mmoSocial` 两个 Lobby RPC 域；⑤ 世界事件表 `k_mmo_world_event` 的 kind 契约（§7）。插件 `plugin.json` 须 `requires.kits.mmo`（声明落在各面 `[minSupported, version]` 内） |
| ⛔ 不能碰什么 | kit 内部目录：`apps/server/src/kits/mmo/{aoi,ai,orchestration,persistence,content,workers}/`、`apps/server/src/rooms/modes/mmoWorld/`、内置灰盒包 `apps/shared/src/kits/mmo/content/greybox.ts`、框架内核 `rooms/core/**`；机检 = K1 导入边界（`kit-import-boundary.test.ts` / 客户端 `kitImportBoundary.test.ts`）+ 编排模块边界（`mmo-orchestration-boundary.test.ts`：import ⊆ `@game/shared/kits/mmo/api/**` + 自身目录、无 Math.random / Date / 计时器 / process / require / fetch、顶层无副作用） |
| 版本规则（KIT.md §4） | 每面独立 `version / minSupported`；新增导出 ⇒ `version + 1`；删 / 改名 / 改 kind ⇒ `minSupported` 抬到新 version（依赖插件区间外即被 `install` / `check` 拒，`--break-dependents` 才放行）；改动同时更新 `mmo-api-freeze.test.ts` 冻结表并重钉 `api-freeze.json`（§8） |
| 两个消费样本（MG 段） | `mmodemo`（内容包 + 表现 + 编排三贡献点全用）/ `mmohold`（只用 content + presentation）；第二个接入 ⛔ 增加 kit 条件分支（MMO.md §10.3 ③） |

### 2. 九个 api 面（v1 冻结；导出全集见 `api-freeze.json`）

| 面 | version / minSupported | shared（双端同源纯函数 / 类型 / validator） | server（经 kit-api 事务） | client | 附带域 / token |
| --- | --- | --- | --- | --- | --- |
| `characters` | 1 / 1 | 常量（`MAX_CHARACTER_SLOTS` 4、名字 2–16、`MMO_CHARACTER_LEVEL_MAX` 60、`MMO_CLASS_IDS` fighter・caster、`MMO_FACTION_IDS` dawn・dusk）、`ICharacterSummary` / `IOrphanPersona`、validator（名字 / 槽位 / 摘要 / 孤儿 persona / classId / factionId）、`characterSlots` | `listCharacters` / `createCharacter`（同一 withKitTx：createPersona + 角色行 + 回执）/ `characterOfPersona` / `summaryOf`；错误类 NameTaken / SlotTaken / SlotsFull / Input；`defaultCharactersDeps` | `fetchCharacters` / `createCharacter` / `describeCharacter` / `defaultCharacterName` + 常量再导出 | 域 `mmo.characters`（query）/ `mmo.createCharacter`（idempotent-write；MMO_NAME_TAKEN / MMO_SLOT_TAKEN / MMO_SLOTS_FULL） |
| `world` | 3 / 1 | `worldAddressOf` / `parseWorldAddress` / `isMapId` / `distanceSq` / `withinRadius`、`IInstanceMeta`、名片 `IEntityCard`、观察者六件 + private / pos / opResult / transferReady 的类型、`MMO_WORLD_MAX_LINE`；再导出 `clampToMap` / `integrate` / `MMO_WORLD_COORD_MAX` | `readInstanceMeta`、`MMO_WORLD_MODE_ID` | `enterWorld`（框架 `world.enter` 凭据）、`createMmoWorldReconciler` + `MMO_WORLD_STREAM_TYPES` / `MMO_WORLD_RECONCILER_CODEC`、`MmoPrivateState` | v2 = 名片 `factionId?`；v3 修复 delta 合并保留 `factionId` / `count` 等未携带字段（向后兼容） |
| `content` | 3 / 2 | `validateContentPack`（结构 / 数值域 / 引用完整性 / 几何在图内 / 碰撞位图 / 出生・复活・刷新点不落墙）/ `indexContentPack` / `mergeItemTemplates`（全区同 itemId 同语义，歧义拒绝）、`IContentPack` 全家（map / region / class / creature / spawn / spell / item / lootTable / npc / portal）、`MMO_CONTENT_LIMITS` / `MMO_CONTENT_SCHEMA_VERSION`、`ContentPackError` | `contentPacks` / `packForMap` / `contentIndex`（内置）/ `itemCatalog`（全区物品）/ `mapDefOf` / `creatureOf` / `spellOf` / `itemOf`（默认全区） | `contentPacks` / `packForMap` / `defaultMapId` / `mapDefOf` / `classOf` / `itemTemplateOf`（全区同义物品）/ `presentationMap` / `presentationOf`、`IPresentationMap`（2D 公告板颜色 / 尺寸，`model?` 3D 预留）、`BUILTIN_PRESENTATION` / `FALLBACK_PRESENTATION` | minSupported 2：v2 起 `classes[]` 是速度 / HP / MP 真源（v1 消费方不兼容）；v3 增量物品聚合 |
| `movement` | 1 / 1 | `normalizeDir` / `integrate` / `clampToMap` / `parseCollisionGrid` / `collisionGridDims` / `applyIntent` / `resolveMove`（一个固定步：点地到达、撞墙轴向滑动、阻挡即停）、`MMO_MOVE_STEP_MS` = TICK_MS、`MMO_ARRIVE_EPSILON` 0.5 | 再导出 + `teleportWithin`（钳图、落阻挡格 ⇒ null） | `MovementPredictor`（预测 + 按 seq 和解）/ `IntentThrottle` / `dirFromJoystick`（死区 0.15、同向 100 ms 合并） | token `c2s.mmoWorld.move` / `s2c.mmoWorld.pos` |
| `social` | 1 / 1 | `worldChannelId(sId)` = `realm:<sId>`、`IMmoPartyLocate` / `IMmoPartyMember` + validator、`nearbyChatLineOf` / `appendChatLine`（`NEARBY_CHAT_LOG_MAX` 50）、`MMO_PARTY_LOCATE_MAX_MEMBERS` 64 | `partyOf`（框架 party 名册 → 本 kit 角色 + worldAddress）、`MmoSocialForbiddenError` | `sayWorld`（框架 chat 门面投 realm 频道）/ `partyLocate` / `partyPanelRows`、`WorldChatPort` | 域 `mmoSocial.partyLocate`；附近聊天 = 框架 core token `c2s/s2c.world.chat` |
| `combat` | 1 / 1 | `ticksOf` / `effectiveStats` / `damageOf`（框架 `calcDamageWithDefense`：max(1, power + 0.5·atk − 0.3·def) × 成长 × ±10%）/ `healOf` / `auraOf` / `cooldownReadyTick` / `checkCast`（拒绝顺序 unknown-spell → not-learned → dead → casting → cooldown → mp → no-target → self-target → target-dead → range）/ `needsHostileTarget` / `threatOf` / `castReqIdOf` | —（结算住 mode 内部） | `CooldownModel` / `pickHostileTarget` + 再导出 | token `c2s.mmoWorld.target` / `cast`；private 流 `cooldowns` / `casting` |
| `ai` | 1 / 1 | `decide(perception)`（idle / patrol / chase / attack / return 状态机）/ `bucketOf` / `shouldThink`、`AiPerception` / `AiDecision`、`AI_ARRIVE_RADIUS` 8；`./nav`：`findPath`（网格 A*，`NAV_DEFAULT_MAX_EXPANSIONS` 4096 fail-closed）/ `lineClear` | `PathfinderPort`（请求带 instanceEpoch + entityVersion）/ `createInProcessPathfinder` / `isStalePathResult` / `isDeferredPathResult`（组合根可换 compute 池实现） | — | 内容包 `behavior` idle / patrol / aggro |
| `inventory` | 3 / 1 | 掉落半边：`rollLoot` / `nearestLoot` / `lootClaimedPayloadOf` + 数字（§6）；物品半边（v2）：`IMmoBagWire`、`planGrant`（堆叠 → 空格 → 邮箱）/ `checkEquip` / `equipSlotOf` / `capacityOf` / `freeSlots` / `sortBagItems` / `bagAttrs` / `equippedTemplates` / `bagSignature` | `grantItem` / `moveItem` / `claimLoot` / `readBag` / 账号级 `bagOf` / `moveItemFor` / 世界房 `bagOfCharacter`、`MmoInventoryError(code)`；v3 默认模板来自全区 `itemCatalog`，既有单包参数兼容 | `fetchBag` / `moveItem` / `bagRows` / `equippedOf` / `describeBag` + 再导出 | 域 `mmo.bag` / `mmo.moveItem`（contractVersion 2）；token `c2s.mmoWorld.pickup`；private 流 `bag` |
| `orchestration` | 1 / 1 | 契约类型（`OrchestrationEvent` / `OrchestrationCommand` / `OrchestrationReadApi` / `OrchestrationModule` / `IEntityView`）、`defineOrchestration`（形状校验 + freeze）/ `validateOrchestrationCommand` / `effectiveLimits` / `digestOf` / `stableStringify` / `varsBytesOf`、`ORCHESTRATION_EVENT_KINDS`、ORCH_* 数字（§5） | `createOrchestrationHarness`（无头：emit / advance / vars / publish / ring / replay）/ `readCheckpointedVars` / `pollGrantResults` / `regionContains` | — | 贡献点 `orchestration`；token `s2c.mmoWorld.prompt` / `scriptState` / `notice`、`c2s.mmoWorld.interact` / `choose` |

### 3. 三个贡献点（kit.json `contributions`；KIT.md §4 / MMO.md §8.6）

| 贡献点 | kind / ends | 插件怎么交（`plugin.json`，须同时 `requires.kits.mmo`） | kit 怎么消费 |
| --- | --- | --- | --- |
| `content` | data · server + client；schema = 内容包顶层形状（schemaVersion 1 / packId / version ≥ 1 / 十个数组），细校验在装载期 `validateContentPack` | `contributes.mmo.content = "apps/plugins/<id>/content/pack.json"` | 服务端 `content/registry.ts`：贡献包（按插件 id 序）在前、内置灰盒兜底，逐包校验 + 索引，跨包 packId / mapId 重复 ⇒ 拒启（**一图一包**）；world mode 按 `contentFor(context.mapId)` 解析图级缓存（map / grid / aoi / pathfinder）；客户端 `contentPacks / packForMap` 同规则 |
| `presentation` | module · client · export `presentation`（`IPresentationMap`） | `contributes.mmo.presentation = "apps/client/src/plugins/<id>/mmoPresentation.ts"` | `presentationMap()`：插件映射按 id 顺序盖在内置之上；`presentationOf` 缺省用它 |
| `orchestration` | module · server · export `orchestration`（`defineOrchestration({...})`） | `contributes.mmo.orchestration = "apps/server/src/core/<id>/mmoOrchestration.ts"` | `orchestration/registry.ts` 逐个形状断言登记（一包一模块）；`registerMmoWorldWorldMode` 启动期 `assertOrchestrationsResolvable`（模块 packId ∈ 已收录包）⇒ 失败拒启；边界机检扫描生成物的 import |

生成物：`apps/{server,client}/src/kits/mmo/contributions.generated.ts`（`KIT_CONTRIBUTIONS`，`codegen:plugins` 刷新；无插件填充时空列表）。

库存、wire 与既有持久事件只保存 `itemId`，因此它是全区物品身份。双端装载均调用 `mergeItemTemplates`：同 ID 同模板可跨包复用，
同 ID 的属性、槽位、堆叠、职业限制或其他模板含义不同则拒绝装载，不能以插件顺序覆盖资产。发奖、装备和跨图装备属性都使用这一目录；
既有不含 `packId` 的 `lootClaimed` 事件与库存无需迁移。

### 4. 玩法 `mmoWorld` 与 wire（`gameplays/mmoWorld/`，modeVersion 7）

| 项 | 内容 |
| --- | --- |
| manifest | `kind:"world"`、`maxPlayers` 100（§11.2）、`profiles ["world"]`、空实例 `sleep` / `emptyAfterMs` 120 s / `checkpointMs` 30 s；root `MmoWorldRoomState` 只放分线元数据（tick / phase / instanceId / mapId / line / authorityEpoch / packId / packVersion / population / scriptStateRev），⛔ 名册 |
| launch | 客户端 `gameplay/modes/mmoWorld/` launch 参数 exact `{ characterId, mapId, transfer? }`（characterId → personaId 经角色列表；凭据在手走 `{ kind: "transfer" }` strategy 直进，否则框架 `world.enter`）；本人身份绑定本次房间句柄 `selfCharacterId`，交接沿用该身份，⛔ 从视野首个角色或其他 join 的临时状态猜测 |
| C2S（8） | `move {seq, dir? \| target?}`（rateCost 1）/ `target {entityId \| null}`（1）/ `cast {spellId, targetId?, clientReqId}`（2）/ `interact {targetEntityId, interactId, clientReqId}`（2）/ `choose {promptId, choiceId}`（2）/ `pickup {lootId, clientReqId}`（2）/ `transfer {portalId, clientReqId}`（4）/ `baselineRequest`（重同步） |
| S2C perSession（10） | 观察者六件 `enter` / `update`（coalesceKey id）/ `leave` / `baselineBegin` / `baselineChunk`（`MMO_BASELINE_CHUNK_ITEMS` 32）/ `baselineEnd`；`private {hp, mp, cooldowns, casting, bag?}`；`opResult {clientReqId, ok, reason?}`；`transferReady {transferId, worldAddress, ticket, expiresAt}`（凭据只此一处出网）；`prompt {promptId, choices}` |
| S2C 直发 / 广播（3） | `pos {seq, tick, x, y}`（本人权威位置，20 Hz）；分线广播 `scriptState {rev, entries}`（编排 publishState）/ `notice {text, level}` |
| 观察者裁剪 | AOI 网格候选 → `canSee`（本人 / 位面 / 隐身 × 阵营）→ 最近优先截到 `MMO_INTEREST_MAX_ENTITIES` 256；角色位置每 2 步进流、兴趣集每 4 步重算（`MMO_WORLD_TUNING`，相位错开）；超视野零泄露（含 baseline） |
| 步序（每固定步） | 命令 → 角色移动（`resolveMove`）→ AI（分桶 + 预算）→ 战斗结算 → 背包轮询 → 编排步（§5）→ 观察者出站；同命令序 + 同种子 ⇒ 同轨迹（无头重放） |

### 5. 编排：事件 / 命令清单与预算（`orchestration` 面 v1；MMO.md §8）

模块 = `defineOrchestration({ version: 1, packId, subscribes[], tickEvery?, interacts?, limits?, handle(event, api) → commands[] })`；一图一包一运行器；`handle` 必须纯（边界机检）。

事件（`ORCHESTRATION_EVENT_KINDS`，未订阅不投递）：

| 事件 | 载荷 | 来源 |
| --- | --- | --- |
| `instanceStarted` | `recovered, checkpointRev` | 撒怪后进队（首建 / 恢复各一次） |
| `tick` | `tick, bucket` | 按 `tickEvery`（10..1200，缺省 20）节拍，相位 `hash(packId, instanceId) % tickEvery` 错峰 |
| `timer` | `timerId, tag` | `startTimer` 到期（repeat 重排） |
| `playerEntered` / `playerLeft` | `entityId, characterId, factionId` | 准入 / 离座 |
| `regionEntered` / `regionLeft` | `regionId, entityId, entityKind` | 只在订阅时算（逐步 diff 区域成员） |
| `creatureSpawned` / `creatureDied` | `entityId, templateId, spawnId?, tag?, killerEntityId?` | 刷新点 / 脚本 spawn / 恢复共用；killer = 仇恨最高实体 |
| `playerDied` | `entityId, killerEntityId?` | hp ≤ 0 |
| `interact` | `actorEntityId, targetEntityId, interactId` | `c2s.mmoWorld.interact`：半径 `MMO_INTERACT_RADIUS` 80、模块 `interacts` × 内容包模板 `interacts` 交叉核对 |
| `choice` | `actorEntityId, promptId, choiceId` | `c2s.mmoWorld.choose`：只认未答复的 prompt、一次 |
| `lootClaimed` | `actorEntityId, lootId, itemTemplateId, count` | 拾取成功 |
| `grantResult` | `opId, ok, reason?` | worker 落地回投（按节拍轮询世界事件表 done / dead 行，水位随快照） |
| `packSuspended` | `reason` | suspend 后只投一次，其命令不生效 |

命令（`validateOrchestrationCommand` exact keys；未知 op / 坏字段 ⇒ 整批作废）：

| 命令 | 字段 | 落地 |
| --- | --- | --- |
| `spawn` | `templateId, pos, tag?, despawnAfterMs?, leashRegionId?` | 模板存在・可行走・存活脚本怪 ≤ `limits.maxSpawnsAlive`；spawnId `orch:<packId>:<n>`；到期收回，死后 5 s 收回不复活 |
| `despawn` | `entityId` 或 `tag` | 只对脚本怪 |
| `startTimer` / `cancelTimer` | `timerId, afterMs ≥ 500, tag?, repeat?` / `timerId` | 本地暂存；≤ `ORCH_MAX_TIMERS` 32；快照往返按 tick 差重排 |
| `grantItem` / `grantCurrency` | `toCharacterId, itemTemplateId, count ≤ maxGrantCount, reason` / `toCharacterId, amount ≤ maxCurrencyPerGrant, reason` | durable 世界事件行（新 opId `orch:<uuid>` 稳定派生自区 / 实例 / 包 / 事件序 / 命令序；旧键保留兼容 ⇒ 跨重启重放零写入）；角色不在分线 ⇒ 语义拒绝只记日志 |
| `sayNearby` / `sayWorld` | `anchorEntityId, text` / `text` | 附近 = core 世界聊天 perSession（视距内会话），30/min；世界 = 分线 notice 广播（偏差：kit-api 无 channel 门面），`ORCH_SAY_WORLD_PER_MIN` 6 |
| `notice` | `text, level: info \| warn` | 分线广播 `s2c.mmoWorld.notice` |
| `setVar` | `key, value, durable?` | 本地 vars（≤ 4 KB 序列化）；durable ⇒ 强制检查点（≥ 30 s 一次） |
| `publishState` | `key, value` | ≤ 16 键；变了才广播 `scriptState`（rev +1） |
| `prompt` | `toEntityId, promptId, choices[≤ 6]` | perSession `s2c.mmoWorld.prompt` |
| `teleportWithin` | `entityId, pos` | 钳图 + 可行走 + `pos` 回执 |
| `transfer` | `characterId, toMapId, toPortalId` | 走门的同一交接状态机（不要求门半径） |
| `setRegionEnabled` | `regionId, enabled` | 区域开关随快照 |

预算与 fail-closed（数字冻结 §11.2 / validator 同源）：每次 dispatch wall ≤ `ORCH_TICK_BUDGET_MS` 2 ms、命令 ≤ 64、事件队列 ≤ 256（满 ⇒ suspend）、vars ≤ 4096 B、timers ≤ 32 且 ≥ 500 ms、prompt 选项 ≤ 6、publishState ≤ 16 键、文本 ≤ 200 / tag ≤ 32、`ORCH_DEFAULT_LIMITS { maxSpawnsAlive 64, maxGrantCount 99, maxCurrencyPerGrant 10000 }`（模块 `limits` 只许收紧）；超预算 / 超命令数 / 坏命令 / handler 抛 / 超限 ⇒ **整批作废 + suspend** ⇒ `packSuspended` 审计行（worker 认领即 done）+ 事件只投一次；`__probe.resumePack` / 分线重启恢复。确定性：`api.rng(stream)` 种子 = instanceId + tick + eventSeq + stream + 调用序；环形日志 `ORCH_RING_SIZE` 64 条 `(seq, eventDigest, commandDigest)`；harness `replay` 同种子重跑逐条比对摘要。

`enqueue` / `schedule` 阶段触发的溢出也由下一次 dispatch 报告一次暂停，走相同的审计与通知路径。暂停是当前运行期状态：
快照中的 `suspended` 只供诊断，重启回灌业务状态时不会恢复上一进程的暂停；新初始化过程中若再次溢出，仍暂停并报告。
新编排奖励的 opId 由区、`instanceId`、包、事件序与命令序稳定派生（固定长度 `orch:<uuid>`），跨分线不会互相去重；worker 原样消费
旧载荷中的 opId，使已有回执继续生效。历史上已被错误去重的奖励不能靠改键推断补发，需要针对历史事件核对。

### 6. 数字表（kit 侧；框架侧数字只引用 MMO.md §11.2）

| 组 | 数字 | 真源 |
| --- | --- | --- |
| 世界 | `maxPlayers` 100；空实例 sleep 120 s；分线检查点 30 s / 角色 60 s；租约 15 s / 续租 5 s；**热点互见 ≤ 50 人（v1 例外）** | manifest / §11.2 |
| 观察者 | `MMO_INTEREST_MAX_ENTITIES` 256；`MMO_BASELINE_CHUNK_ITEMS` 32；`MMO_WORLD_TUNING` 角色位置每 2 步 / 兴趣集每 4 步；视距按图（灰盒 400） | `rooms/modes/mmoWorld/index.ts` |
| 移动 | `MMO_MOVE_STEP_MS` = TICK_MS 50；`MMO_ARRIVE_EPSILON` 0.5；`MMO_SPAWN_JITTER` 40 | movement 面 / mode |
| 战斗 | 浮动 ±10%（`MMO_COMBAT_FLUCTUATION`）；最小效果 1；治疗系数 0.2；角色复活 `MMO_PLAYER_RESPAWN_MS` 5 s；怪物按模板 respawnSec | combat 面 |
| AI | `MMO_AI_BUCKETS` 4；`MMO_AI_TICK_BUDGET_MS` 2；`AI_ARRIVE_RADIUS` 8；A* `NAV_DEFAULT_MAX_EXPANSIONS` 4096 | ai 面 / mode |
| 掉落 | 到期 60 s；拾取半径 48；每分线 ≤ 512；堆叠 ≤ 9999；击杀者独占 15 s | inventory 面 |
| 背包 | bag 24 / equip 3（weapon 0 / armor 1 / trinket 2）/ mail 64；wire ≤ `MMO_BAG_MAX_ITEMS` 91 件；拾取后轮询 20 步 × 1200 步 | inventory 面 / wire / mode |
| 交互 | `MMO_INTERACT_RADIUS` 80 | mode |
| 角色 | 槽位 4；名字 2–16；等级 ≤ 60；职业 fighter / caster；阵营 dawn / dusk | characters 面 |
| 社交 | 队伍定位 ≤ 64 人；附近聊天日志 50 行 | social 面 |
| 检查点保留 | 分线 `MMO_INSTANCE_CHECKPOINT_KEEP` 32 / 角色 `MMO_CHARACTER_CHECKPOINT_KEEP` 16 | persistence/checkpoint.ts |
| 编排 | §5 全部 ORCH_* | orchestration 面 |

### 7. 数据、事件与回退窗口

七张表（全部 per-zone，`db:bootstrap` 经 `kit_migration` 账本应用；卸载保留，`--drop-data` 才 drop）：

| 表 | 内容 | 幂等 / 一致性 |
| --- | --- | --- |
| `k_mmo_character` | 身份 + 成长（persona_id / user_id / slot / name / class_id / faction_id / level / exp / checkpoint_rev）；⛔ 位置 / HP / MP | 列集由 `mmo-sql.test.ts` 冻结 |
| `k_mmo_character_checkpoint` | 角色检查点信封（快照 v2 `{ mapId, x, y, hp, mp, cooldowns?, arrival? }`，`instance_rev`） | rev 按角色单调；(instance_id, instance_rev, state_hash) 去重；内容 fail-closed |
| `k_mmo_item_instance` / `k_mmo_receipt` | 物品实例（location bag / equip / mail / tmp，rev CAS）/ 回执（op_id 幂等） | 同 opId 重放零写入 |
| `k_mmo_instance` / `k_mmo_instance_checkpoint` | 分线语义（pack_id / pack_version / script_rev）/ 分线检查点信封（creatures / loot / scriptVars / timers / regions / orchestration） | 随框架世界事务（首句权威 CAS） |
| `k_mmo_world_event`（role world-event） | kind `grantCurrency { personaId, userId, amount }` / `lootClaimed` / `grantItem { opId, toCharacterId, itemTemplateId, count, reason, packId }` / `packSuspended { reason }`；未知 kind 死信 | worker 只执行 `checkpoint_rev ≤ 分线 checkpoint_rev` 的行（§7.3 原子规则） |

回退窗口（§7.3，MF1 冻结）：

| 状态 | 恢复来源 | 允许回退 |
| --- | --- | --- |
| 已确认资产 | 主账本 + `k_mmo_item_instance` + `k_mmo_receipt` | 0（`event_id` / `op_id` 去重） |
| 角色位置 / HP / MP / 冷却 | `k_mmo_character_checkpoint` | ≤ 1 个角色检查点周期 |
| NPC 存活 / 复活 / 未认领掉落 / 脚本 vars / timers / regions | `k_mmo_instance_checkpoint` | ≤ 1 个分线检查点周期（30 s） |
| 脚本 durable 命令 | `k_mmo_world_event` + checkpoint_rev 门 | 0 重复；最多延迟到下一个分线检查点 |

框架事件日志保留到 SQL 提交确认：前批尚未提交时捕获的后批包含全部未提交事件前缀，串行执行前再过滤已提交前缀；失败不移走事件。
worker 发奖遇 `conflict` 必须抛出并回滚整轮（包括已更新的堆叠），由后续轮次重试；非法模板 / 邮箱满等永久拒绝才死信。
交接等待本次强制检查点的原始结果，落盘失败不能继续 commit transfer。若检查点发现 `ControlConflictError`（某 persona 的控制代已在别处抬高），只踢出该陈旧会话（lost-control，不归还控制权、不再落其快照），
把它剔除后重试同一批，其余座位与事件日志保留；persona 级强制点冲突同样踢出并让本次交接取消。⛔ 因一个 persona 让整条分线 Offline（2026-09-22 复审改法）。

### 8. 运维

| 动作 | 命令 / 规则 |
| --- | --- |
| 安装动线 | 作者侧 `plugin -- pack mmo` → 干净树 `plugin -- install` → `codegen:plugins` / `codegen:gameplays` → `db:bootstrap`（两遍，第二遍零 DDL）→ `plugin -- check` → `plugin -- test mmo [--int]` → `verify:all`；一键复现 `npm run verify:kit-clean-install -- --kit mmo`（25 步） |
| 树内改动 | bump `kit.json.version` → `plugin -- install --reinstall-from-tree mmo --no-git --no-postinstall`（新域 / 新贡献点 ⇒ `--allow-identity-change`）→ 两个 codegen → `sync:shared` / `sync:client` |
| 升级闸 | 改 api 面导出 ⇒ 按 §1 版本规则改 kit.json + `mmo-api-freeze.test.ts` 冻结表 ⇒ `cd apps/server && MMO_API_FREEZE_WRITE=1 node --import tsx --test test/mmo-api-freeze.test.ts` 重钉 `api-freeze.json` |
| 卸载闸（五道，fail-closed，⛔ bypass） | 依赖插件 / pending outbox / worker（pending 事件行・在役租约）/ 在途交接 / **运行中分线**（`world_instance` × coord Redis 权威租约 × 登记 mode）；`plugin -- check` 同读只告警；细节见「二、施工记录 · 卸载 / 升级闸」 |
| worker | `KIT_WORKER_ZONES=<区> npm --workspace @game/server run worker -- mmo:worldEvents`（租约 `kit:mmo:worldEvents`，每轮 ≤ 16 行） |
| 基准 | `npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --scenario mmo-greybox --bots 40 --seconds 20 --seed 7`（场景 A）/ `--scenario mmo-hotspot --bots 25\|50\|100`（场景 B）；报告 `docs/perf/world-bench/`，只作比较与阈值判定 |
| 长跑 | `… --scenario mmo-hotspot --bots 50 --seconds 86400 --sample-every 300 --label soak-24h`（`judgeSoak` stable / growing；72 h 改 259200） |
| 运维只读面 | 框架 MF10-B3：`admin/worldInstances`（world_instance ⊕ 登记 seated / capacity / publicAddress / mode）/ `admin/worldTransfers` / `admin/worldEvents`（各 kit world-event 表 pending / done / dead / superseded） |

### 9. 验证与容量证据（0.1.18 及以前基线；本轮修复见 §10）

- 机检闭环：`plugin -- test mmo`（22 文件 / 99 用例）+ `--int`（mmo-world / transfer / checkpoint / social / loot / inventory）+ `verify:kit-clean-install`；每批手工变异写进提交信息。
- 容量数字（20 s / 同机同进程机器人；⚠ 只作比较与阈值判定；全表与故障矩阵在 MMO.md §12 MK4 行）：**MK4 最终（kit 0.1.15）**——A 40 人 192 只 tick p99 18.5 / 13.9 ms（种子 7 / 8）、出站 p50 ≈ 40 KB/s/会话 ✅；B 热点 500 只 slime：25 人 p99 23.3 ms ✅、**50 人整窗 p99 37.2 / 25.1 / 32.6 ms（种子 7 / 8 / 9）❌ vs MK1 退出 20.8 / 24.2 / 24.8**——分窗看首窗（入座 + baseline + JIT 预热）34.4、其后 14.7 / 21.4 / 23.8 ✅，回归集中在预热段（MK2–MK4 新增入座路径每人一次 DB 读 + 新代码 JIT），稳态贴线在线内 ⇒ 2026-09-20 拍板接受为 v1 已知回归（优化留 v1.x：入座路径每人一次 DB 读合并 / 预热、基准台 `--warmup` 稳态口径）；100 人 p99 66.0 ms ❌（已知上限，v1 例外互见 ≤ 50）。
- 故障矩阵（§10.2 十二行）：`npm run test:faults`（单元 2 组）+ `npm run test:faults:int`（集成 3 组）全绿；`world-transfer` 组首跑红 = 用例竞态（client-drop 段归还控制权是离座后的异步任务，立即断言 ⇒ 改条件等待），⛔ 产品缺陷；「同图两分线」只有间接证据（框架唯一键 / CAS + kit 按 instance_id），专门用例登记 MG 段补；「24–72 h 长跑」待 MK3 正式报告。

### 10. 0.1.19 审阅修复（2026-09-21）

本次修复对应最近一周提交审阅的 R01–R11（仅为本轮编号，不是 MMO.md 设计审阅的 M01–M20）。当前面版本为
`world 3/1`、`content 3/2`、`inventory 3/1`（version / minSupported）；阶段退出与容量结论不随本次修复改变。

| 编号 | 修复后的行为 |
| --- | --- |
| R01 检查点事件缺口 | 未提交事件留在日志，预捕获后批带全部未提交前缀；执行前过滤已经提交的部分，前批失败不再使后批漏事件 |
| R02 worker 半份奖励 | 后续堆叠 CAS 冲突抛出，整轮事务回滚；重试重新规划发奖，回执仍恰好一份 |
| R03 跨房控制权丢失 | 检查点捕获旧控制代后只踢出该陈旧会话（lost-control），剔除后重试同一批，其余座位与事件日志保留（**2026-09-22 复审改法**：原「整线 Offline」会让一人双登重置整条分线并打红 MF8 交接四注入 `int/world-transfer-flow`）；内存检查点端口按 `(controlEpoch, rev)` 比较角色新旧，接受新控制代较小的分线 rev |
| R04 交接强制点失败 | 后台串行链与强制点结果分开；失败传回交接调用者，不继续 commit transfer |
| R05 客户端本人身份 | join 返回的房间句柄携带 `selfCharacterId`，gameplay 与后续交接读取本次句柄身份，避免提前捕获或并行 join 相互污染 |
| R06 奖励幂等隔离 | 新编排 opId 包含实例作用域的稳定派生值，旧事件 / 旧回执继续按原键消费 |
| R07 贡献包物品 | 双端合并全区物品模板并拒绝同 ID 异义；worker、默认库存操作及跨图装备属性均能解析贡献包物品 |
| R08 复活位置与预测 | 服务端复活立即发权威 pos；客户端死亡时停止并清除旧预测意图，HP 恢复后以复活位置重建预测，覆盖一个渲染帧内多模拟步的 pos / HP 到达顺序 |
| R09 队列溢出通知 | enqueue / schedule 溢出也向 dispatch 交付一次暂停原因，审计与 `packSuspended` 通知不遗漏 |
| R10 重启解除暂停 | 回灌 vars / timers / publish 等业务状态，不恢复上一进程的暂停；初始化再次触发的暂停照常生效 |
| R11 观察者名片保留 | delta 合并保留未携带的 `factionId` / `count` 等字段，位置变化不再抹掉阵营或掉落数量 |

已完成定向验证：客户端 19 条、world 126 条、服务端 worker / inventory / contributions 17 条、库存 MySQL 2 条全部通过。
完整校验及其余真栈结果见 [MMO.md §12 本次修复记录](../../../docs/MMO.md#12-实施状态回写)；本节不替代 MK3 的 24–72 h 长跑报告，也不提前发布 `mmo-kit-v1-frozen`。

## 二、施工记录（按批次；每批的用例 / 变异 / 偏差原文保留，⛔ 不作说明书）

### MG0 反馈修复（2026-09-22；kit 0.1.24 → 0.1.25）

首个真实内容插件 `mmodemo`（[apps/plugins/mmodemo/README.md](../../plugins/mmodemo/README.md)）暴露三处：① kit 测试假设贡献点为空（服务端 `mmo-contributions` / 客户端 `mmo-content`、`mmo-character-select-logic`）⇒ 改为与填充无关；② `MmoWorldGameplay` 用 `classOf(classId)`（贡献包优先）取职业模板，多包并存时进灰盒图会拿到别的包的战士 ⇒ 改按当前图所在包解析（`packForMap(room.mapId).classById`，与服务端准入同源；`classOf` 面签名不动）；③ 框架 `plugin-codegen.test.ts` 隔离根不拷插件贡献文件 ⇒ 补拷。`mmo-kit-v1-frozen` 重打到修复提交；插件侧 diff 相对该 tag 只含插件文件与生成物（§9.4 #1–#3）。

### 定义了什么（MK0-B1）

| 面 | 内容 |
| --- | --- |
| 玩法 `mmoWorld` | `gameplays/mmoWorld/{manifest,state}.json`：`kind:"world"`、`maxPlayers` 100（§11.2）、空实例 `sleep` 120 s、分线检查点 30 s；root `MmoWorldRoomState` 只放全图公开的分线元数据（tick / phase / instanceId / mapId / line / authorityEpoch + packId / packVersion / population / scriptStateRev），⛔ 名册 |
| wire | `apps/shared/src/gameplays/mmoWorld/wire.ts`（§7.4 全部 token：8 个 C2S 意图 + 10 个 perSession S2C + 2 个分线广播；观察者六件取框架 MF5b 形态，⛔ 单一 delta）；向量 `apps/server/test/wire-vectors/mmoWorld.ts` |
| SQL | `sql/001-characters.sql`（`k_mmo_character` / `k_mmo_character_checkpoint`）、`002-items.sql`（`k_mmo_item_instance` / `k_mmo_receipt`）、`003-world.sql`（`k_mmo_instance` / `k_mmo_instance_checkpoint` / `k_mmo_world_event` role:"world-event"）、`004-character-checkpoint-instance-rev.sql`（MK1-B4：角色检查点表加 `instance_rev` 列 + 索引，只追加）；全部 per-zone；检查点表整份落框架信封（`envelope JSON`，snapshot 在其内） |
| worker | `workers/worldEvents.ts`：认领门内 `k_mmo_world_event`，`grantCurrency` ⇒ 主账 credit（persona 主体，opId = eventId）；`lootClaimed`（MK2-B3）⇒ `persistence/items.ts` `grantItemInTx`（bag 下一空槽 + `k_mmo_receipt` op_id = eventId，重放只回读回执）；其余死信；**MK4-B1**：`grantItem { opId, toCharacterId, itemTemplateId, count, reason, packId }` ⇒ inventory grantItem（回执 op_id = 载荷 opId = `orch:<packId>:<eventSeq>:<idx>`，跨重启同命令同 opId ⇒ 重放零写入）、`packSuspended` 审计行认领即 done |
| 域 `mmo` | `mmo.characters`（query：角色 + 孤儿 persona + 槽位上限）、`mmo.createCharacter`（idempotent-write：同一 withKitTx 内 createPersona + 角色行 + 回执；errorCodes MMO_NAME_TAKEN / MMO_SLOT_TAKEN / MMO_SLOTS_FULL）；进世界走框架 `world.enter`；**MK3-B1**：`mmo.bag { characterId }`（query → `{ bag }`）、`mmo.moveItem { clientReqId, characterId, itemInstanceId, location: bag \| equip, slot }`（idempotent-write → `{ bag }`；errorCodes MMO_INVENTORY_FORBIDDEN / MMO_INVENTORY_REJECTED(message 带 code)；contractVersion 2） |
| 域 `mmoSocial`（MK1-B5） | `mmoSocial.partyLocate { characterId }`（query）→ `{ party: IMmoPartyLocate \| null }`：框架 party 成员 → 本 kit 角色 + worldAddress / mapId；errorCodes MMO_SOCIAL_CHARACTER_FORBIDDEN；世界 / 附近聊天 ⛔ 不在本域 |
| 服务端 api 面 | `characters`（listCharacters / createCharacter / characterOfPersona）、`world`（readInstanceMeta）、`content`（contentIndex / packForMap / mapDefOf / creatureOf / spellOf / itemOf；内置灰盒包启动期 validateContentPack fail-closed）、`movement`（MK1-B1：resolveMove / applyIntent / parseCollisionGrid 再导出 + teleportWithin） |
| WorldMode | `rooms/modes/mmoWorld/index.ts`：撒怪 / 准入预热（职业模板不在内容包 ⇒ 拒）/ 检查点回灌 / 权威积分（movement 面 `resolveMove` + 内容包碰撞网格）/ 本人 `s2c.mmoWorld.pos` 直发回执 / 视野流（AOI 网格候选 + 规则 + 上限）/ 私有流 / 检查点（全批 `onCheckpoint` + persona 级 `onPersonaCheckpoint`）；检查点端口住 kit 目录 `kits/mmo/persistence/checkpoint.ts`（MK1-B4 迁回：kit-api 再导出 CheckpointPort / CheckpointEnvelope / CheckpointSchema） |

### 客户端（MK0-B4）

| 件 | 内容 |
| --- | --- |
| kit module | `apps/client/src/kits/mmo/index.ts`（resident）：install 组装 `MmoRuntime`（角色列表 / 建角 / 框架 `world.enter` / 带参 launch `mmoWorld` / 关闭 route） |
| 客户端 api 面 | `characters`（fetchCharacters / createCharacter / describeCharacter / 槽位视图）、`world`（enterWorld、观察者六件 token 集 + reconciler codec、integrate / clampToMap 再导出）、`content`（客户端地图几何 + `classOf` 职业模板 + `IPresentationMap` 表现映射：2D 公告板颜色 / 尺寸，`model` 3D 预留）、`movement`（MK1-B1：dirFromJoystick / IntentThrottle / MovementPredictor） |
| 选角页 | route `mmoCharacters`（View `MmoCharacterSelect`，纯节点手搓版）+ 菜单「进入世界」；逻辑 `logic/MmoCharacterSelectLogic.ts` |
| mode 四件 | `gameplay/modes/mmoWorld/`（launch exact `{ characterId, mapId }`，characterId → personaId 经角色列表解析）、`net/rooms/MmoWorldRoom.ts`（world.enter → WorldRoomTransport.join；seq 递增意图；观察者流 → ObserverReconciler；seq 断裂自动重同步）、`logic/rooms/mmoWorld/MmoWorldGameplay.ts`、`view/rooms/mmoWorld/MmoWorldView.ts`（相机跟随的 2D 方块 + 最小 HUD；HUD 画在世界节点内 = 3d.md SC1-B9 退路） |

### movement 面（MK1-B1）

| 层 | 内容 |
| --- | --- |
| shared `api/movement` | 双端同源纯函数：`normalizeDir`（钳 [-1,1] + 超单位圆归一）/ `integrate` / `clampToMap`（自 world 面迁入，world 面再导出）/ `parseCollisionGrid`（内容包 `collision {cellSize, bitmap}` → 格查询，cols × rows 按 ceil，形态不合 RangeError）/ `applyIntent`（dir 清目标、target 钳图清方向）/ `resolveMove`（一个固定步：点地 reach + 0.5 内到达、撞墙先试轴向滑动、仍阻挡原地并清目标 ⛔ 空转）；`MMO_MOVE_STEP_MS = TICK_MS` |
| content v2 | `classes[]` 职业模板（classId / hpMax / mpMax / attack / defense / speedPerSec / spells）= 角色速度 / HP / MP 的真源（MK0 常量退役）；碰撞位图校验（长度 = cols × rows、'0'/'1'）；出生点 / 复活点 / 刷新点 ⛔ 落阻挡格；`indexContentPack().classById` |
| wire | 新增直发 S2C `s2c.mmoWorld.pos {seq, tick, x, y}`（本人权威位置 + 它反映到的意图 seq；⛔ 观察者单流）⇒ `mmoWorld` modeVersion 3 |
| 服务端 | mode 每固定步 `resolveMove`（碰撞网格随图解析一次）；收到意图那步或真动了都回 `pos`；准入拒职业不在包的角色；`api/movement` 再导出 + `teleportWithin`（钳图、落阻挡格 ⇒ null） |
| 客户端 | `MmoWorldRoom.move / moveTo / stop` 返回 seq（拒发 null）；`MovementPredictor`（意图立即施加、按 `MMO_MOVE_STEP_MS` 用同一 `resolveMove` 推进、回执按 seq 和解：位置以回执为准、方向 / 目标保持最新意图（在途意图已折叠进本地状态）、丢弃 ≤ seq 的在途意图；旧回执忽略）；`dirFromJoystick` 死区 0.15；`IntentThrottle` 同向 100 ms 合并、变向 / 停立即发；`MmoWorldGameplay` 本人位置取预测（速度取 `classOf(templateId)`、网格取 `mapDefOf`），他人取视野流 |
| 用例 | 服务端 `mmo-movement.test.ts`（纯函数 + content v2 坏包点名路径）、`mmoWorld-mode.test.ts`（caster 5.5 / 步、pos 回执 seq、停下静默、撞墙、职业不在包拒）、int `mmo-world`（真栈 pos 回执）；客户端 `mmo-movement-predictor.test.ts`（与服务端参考回放逐步一致、迟到回执重放、撞墙）、`mmoWorld-gameplay.test.ts`（预测 + 和解） |

### AOI 接入（MK1-B2）

| 层 | 内容 |
| --- | --- |
| kit 内部 `apps/server/src/kits/mmo/aoi/` | `grid.ts` AoiGrid：格长 = 图的 `aoi.cellSize`（与 collision / nav 的 cellSize 互不绑定），insert / move（跨格才搬桶）/ remove / clear，`candidates(center, radius)` = 视距圆外接矩形覆盖的格子里的全部 id（**只是候选**，确定性：格序 + 插入序）；`visibility.ts`：`canSee`（本人永远可见 → 位面相同 → 隐身只对同阵营可见，无阵营观察者看不见）+ `pickInterest`（精确欧氏视距 → 规则 → 最近优先（距离再 id）→ 截到 cap）。⛔ 不是 api 面（MMO.md §7.6 内部目录），插件不 import |
| mode | 实体新增 `factionId`（角色 = 建角阵营；怪物 null）/ `plane`（缺省 0）/ `stealth`；撒怪 / 进图 / 离座 / 移动 / 回灌同步网格；`visibleEntities` = 网格候选 → `pickInterest`（cap `MMO_INTEREST_MAX_ENTITIES = 256`，`limits.interestMaxEntities` 同值报给框架；框架 InterestSet 超限即抛，所以 kit 先收敛）；`__probe.setVisibility(id, {plane?, stealth?})` 是 MK2 aura / MK4 编排接入前的直接写口 |
| wire / world 面 | 名片 `IMmoEntityWire` 新增可选 `factionId`（怪物省略，exact keys）⇒ `world` 面 v2（minSupported 1）、`mmoWorld` modeVersion 4；客户端 `MmoWorldEntityView.factionId`（无阵营 null） |
| 验收（`mmoWorld-mode.test.ts`） | 超视野零泄露（900 单位外的角色 id 不出现在对方任何出站，含 baseline）；走进视距（第 84 步）enter 恰一次；隐身：异阵营 leave / 同阵营不变 / 本人不变，解除 ⇒ enter；位面：双向 leave，回位面 ⇒ enter；300 只 slime 挤在出生点：baseline = 256 条、本人必在、没选上的都不比选上的近、继续走不抛 |

### 两图交接（MK1-B3）

| 层 | 内容 |
| --- | --- |
| 内容 | 灰盒 v3：主图 `gate-east`（(1000,700) 半径 60）↔ 东郊 `greybox-east`（1000×1000，slime ×2）`gate-west`（(500,800)）；落点各自的 `gate` 出生点在门外（半径外，⛔ 落地即再触发） |
| 服务端 mode | `c2s.mmoWorld.transfer { portalId, clientReqId }`：portal 不存在 / 不在半径内 / 在途 ⇒ opResult rejected；否则**落点先写进实体**（`arrival = { toMapId, toSpawnPointId }`，停下）⇒ `context.transfer.request(session, { toMap, payload: { portalId, toSpawnPointId } })`（框架 MF8：prepare → 强制点 → 凭据 → commit）⇒ Committed ⇒ perSession `s2c.mmoWorld.transferReady { transferId, worldAddress, ticket, expiresAt }`（凭据只此一处出网，不可丢类）⇒ 壳以 "transferred" 离座；端口失败 ⇒ rejected + 落点清 + 可重试。落点经 persona 快照 `arrival`（框架 prepare 后强制点落库）传到目标图：onEnter 同图检查点优先，否则 `arrival.mapId` 等于本图 ⇒ 该出生点，否则首个出生点；HP / MP 随快照随身 |
| 客户端 | HUD「传送」⇒ `{ type: "transfer" }` ⇒ 本人（预测位置）在某个传送门半径内才发 `room.transfer(portalId)`（clientReqId `t<n>`）；`transferReady` ⇒ 记下凭据 + 请求退出，本局 stop 时交给 `onTransfer` ⇒ mode 模块下一拍 `runtime.launchWorld(characterId, 目标 mapId, 凭据)`（launch `{ characterId, mapId, transfer? }` exact 校验，凭据 worldAddress 必须与 mapId 一致）⇒ joiner 凭据在手 ⇒ 跳过 world.enter、`{ kind: "transfer" }` strategy 直进；无凭据（重连 / 回复丢失）⇒ world.enter 由框架解析在途交接 ⇒ transferId 非 null 时同样 transfer strategy |
| 验收 | 无头 `mmoWorld-mode.test.ts`（拒绝三态 / 端口目标 + 载荷 / 在途快照带落点 / 失败清落点 / Committed perSession 出网；目标图落位 / 异图 / 未知落点 / 同图优先）；真栈 `test/int/mmo-transfer.test.ts`（门外拒 → 门内交接 → 源房 CONSENTED → **reply-lost 注入**走 resolveTransfer 轮换 → 东郊落点 + 2 slime + 职业 HP / MP → finalized + 载荷落库 → 离座检查点 mapId 东郊 → 再进从检查点起）；其余三个注入（client-drop / source-crash / target-crash）是框架状态机性质，由 MF8-B7 `world-transfer-flow` 覆盖，kit ⛔ 复制 |

### combat 面（MK2-B1）

| 层 | 内容 |
| --- | --- |
| shared `api/combat` | 双端同源纯函数：`ticksOf` / `effectiveStats`（buff 加攻、debuff 减防 ≥ 0、过期忽略）/ `damageOf`（框架 `shared/logic/battle.ts` 新增公式族 `calcDamageWithDefense`：max(1, power + 0.5·atk − 0.3·def) × 等级成长，× ±10% 浮动，最小 1）/ `healOf` / `auraOf` / `cooldownReadyTick` / `checkCast`（拒绝顺序 unknown-spell → not-learned → dead → casting → cooldown → mp → no-target → self-target → target-dead → range；治疗 / 增益缺目标落到本人）/ `threatOf` / `castReqIdOf`（回执 `cast:<seq>`） |
| 内容 | 灰盒 v4：技能族 strike（瞬发直伤）/ guard（自增防御 buff）/ fireball（读条直伤）/ mend（读条治疗）/ weaken（减防 debuff）；战士 [strike, guard]、法师 [fireball, mend, weaken]；slime 学 strike（AI 随 B2） |
| 服务端 mode | 实体加 attack / defense / spells / auras / threat / casting / targetId / alive / respawnDueTick / origin；`c2s.mmoWorld.target` 选目标；`c2s.mmoWorld.cast` ⇒ checkCast ⇒ 读条（castMs > 0，移动即打断 ⇒ rejected moved）或瞬发 ⇒ 到点二次校验 ⇒ 扣蓝 / 记冷却 / 施效（直伤按公式 + 分线随机流浮动、记仇恨；治疗；aura）⇒ opResult ok；hp ≤ 0 ⇒ 死亡（清热状态、怪物离开视野、按 respawnSec / `MMO_PLAYER_RESPAWN_MS` 5 s 复活、`checkpointOnDeath` ⇒ 强制点）；private 流加 `cooldowns`（spellId → 剩余 ms，只在集合变化时发 ⛔ 每 tick 倒计时）与 `casting` ⇒ modeVersion 5；战斗步在移动之后、出站之前按实体插入序结算（同命令序 + 同种子 ⇒ 同轨迹） |
| 客户端 | `api/combat`：`CooldownModel`（private 集合 → 本地倒计时）、`pickHostileTarget`（最近存活怪）；`room.target / cast`；gameplay `target` / `cast` 输入（无目标自动选最近怪并同步目标；本地冷却中只提示不发）；模型加 targetId / spells（职业技能栏）/ cooldowns / casting；HUD「技1 / 技2」+ 目标与冷却文案 |
| 用例 | 服务端 `mmo-combat.test.ts`（公式 / aura / checkCast 顺序）、`mmoWorld-mode.test.ts` 新增 2（瞬发 / 拒绝 / 读条打断与到点 / 治疗 / buff 到期；怪死复活 / 角色死复活 / 无头重放一致）；客户端 `mmo-combat.test.ts` + `mmoWorld-gameplay` 战斗用例 |

### ai 面（MK2-B2）

| 层 | 内容 |
| --- | --- |
| shared `api/ai` | 行为词汇（内容包 `behavior` idle / patrol / aggro）；脑状态 idle / patrol / chase / attack / return；纯决策 `decide(perception)`：有活目标 ⇒ 出拴绳 evade / 射程内 cast / leash 0 只还手 / 否则 chase；无目标 ⇒ aggro 内候选 acquire / return 回家・到家 evade / patrol 换点 / 离家回家 / idle；`bucketOf` / `shouldThink`；`./nav` 网格 A*（直线直达短路、八邻域不穿角、确定性、展开上限 fail-closed、共线去点） |
| 服务端 | `api/ai`：`PathfinderPort`（请求带 instanceEpoch + entityVersion）+ 缺省进程内实现 `createInProcessPathfinder` + `isStalePathResult`；组合根可注入 compute 池实现（`core/compute/tasks/kits/mmo/pathfind.ts` = 同一 A* 的 structured-clone 任务，含 admission）；kit 内部 `ai/scheduler.ts` AiScheduler：每 tick 只 tick % buckets 那桶 + wall 预算内思考，超预算顺延、下一 tick 优先（不饿死）；mode：怪物脑（状态 / 巡逻点序 / 路径 / 找路版本），感知 = 仇恨最高的活目标 / aggroRadius 内最近可见角色（位面 / 隐身规则）/ 可用技能射程 / 距出生位；动作 acquire / chase（沿路径点地，目标离路径终点超一格重找）/ cast（同一施法管线）/ evade（清仇恨、回满血、回家）/ patrol；怪物移动每 tick 走同一 resolveMove（撞墙且无路 ⇒ 重找）；死亡 / 复活脑复位；`MMO_AI_BUCKETS = 4`、`MMO_AI_TICK_BUDGET_MS = 2`（候选，§11.2） |
| 内容 | 灰盒 v5：野猪 boar（aggro 150 / 拴绳 400 / 90 速 / strike）在 (1000,1500)、田鼠 rat（patrol 三点）在 (500,500)；slime 仍 idle（leash 0 只还手） |
| 用例 | 服务端 `mmo-ai.test.ts`（decide 十三条 / 分桶 / A* 绕墙・终点阻挡・展开上限 / 调度器预算顺延 / compute 任务 / 迟到判定）、`mmoWorld-mode.test.ts` 新增 3（野猪追击 → 射程内扣血 → 出拴绳 evade 回家；slime 还手不追；田鼠巡逻一圈 / 每 4 步思考 / 假时钟顺延；绕墙不进阻挡格 / 权威换代・版本变更的回执丢弃） |
| 偏差 | 找路端口回执可同步（缺省进程内：同 tick 生效 ⇒ 无头重放确定性）或 Promise（compute 池：下一步消费）；compute 池接线留给组合根（kit ⛔ import compute）；仇恨 = 直伤值，治疗 / 增益不计；怪物无阵营，感知用位面 / 隐身规则；MK2-B1 战斗用例改用 slime 无技能的木桩内容（还手归 ai 用例） |

### 贡献点装载（MK4-B2；docs/KIT.md §4 / MMO.md §8.6）

| 贡献点（kit.json `contributions`） | kind / ends | 插件怎么交 | kit 怎么消费 |
| --- | --- | --- | --- |
| `content` | data · server + client；schema = 内容包顶层形状（schemaVersion 1 / packId / version ≥ 1 / 十个数组），细校验在装载期 `validateContentPack` | `plugin.json` `contributes.mmo.content = "apps/plugins/<id>/content/pack.json"`（须同时 `requires.kits.mmo`） | 服务端 `content/registry.ts`：贡献包（按插件 id 序）在前、内置灰盒兜底，逐包校验 + 索引，跨包 packId / mapId 重复 ⇒ 拒启（一图一包）；`packForMap(mapId)` 贡献包优先；world mode 未注入单包时 onWorldInit 按 `contentFor(context.mapId)` 解析（图级缓存随世界重建）；客户端 `api/content` 同规则（`contentPacks / packForMap / mapDefOf / classOf / itemTemplateOf / defaultMapId`） |
| `presentation` | module · client · export `presentation`（`IPresentationMap`） | `contributes.mmo.presentation = "apps/client/src/plugins/<id>/mmoPresentation.ts"` | 客户端 `presentationMap()`：插件映射按 id 顺序盖在内置之上；`presentationOf` 缺省用它 |
| `orchestration` | module · server · export `orchestration`（`defineOrchestration(...)`） | `contributes.mmo.orchestration = "apps/server/src/core/<id>/mmoOrchestration.ts"` | `orchestration/registry.ts` 首次访问逐个形状断言登记（一包一模块）；`registerMmoWorldWorldMode` 启动期 `assertOrchestrationsResolvable`（模块 packId ∈ 已收录包）⇒ 失败拒启；边界机检扫描 `contributions.generated` 的 import |

生成物：`apps/{server,client}/src/kits/mmo/contributions.generated.ts`（`KIT_CONTRIBUTIONS`，codegen:plugins 刷新；无插件填充时为空列表）。⚠ 发现（本批修）：`plugin -- install --reinstall-from-tree` 的推导集冲突闸此前把这一族 writer 生成物（含 Cocos 镜像 + .meta）当「混入」拒绝——首个在树声明贡献点的 kit 才碰到；`tools/plugin/install.ts` ownershipConflicts 现按硬排除形态豁免（用例 `plugin-reinstall-generated.test.ts`）。内置灰盒包仍是 TS 字面量兜底（kit 服务端 ⛔ node:fs、tsconfig 未开 resolveJsonModule，MK0 偏差 ①），贡献包 = 通道证明；首个真实填充在内容插件样本 MG0（`mmodemo`）。

### 卸载 / 升级闸（MK4-B3；docs/KIT.md §4 / §5、MMO.md §10.3 ①）

`plugin -- uninstall mmo` 前五道闸全部 **fail-closed**（连不上库 / 查询失败即拒）、除 outbox 的开发期 flag 外 **⛔ 无 bypass**；`plugin -- check` 用同一读只告警：

| 闸 | 判据 | 落点 |
| --- | --- | --- |
| 依赖插件 | 已安装插件锁声明 `requires.kits.mmo` ⇒ 拒（先卸插件或改声明） | `tools/plugin/uninstall.ts` |
| pending outbox | `gameplay_outbox` 里 `kit:mmo:*` 且 status=0 ⇒ 拒（`--allow-pending-outbox` 仅非生产） | `tools/plugin/outboxGate.ts` |
| worker | `k_mmo_world_event` 有 pending 行 / 租约 `kit:mmo:*` 在役 ⇒ 拒（先让 worker 消费完、停进程等租约到期） | `tools/plugin/workerGate.ts` |
| 在途交接 | `world_transfer ⋈ persona.kit_id = 'mmo'` 且 `active_key` 非 NULL ⇒ 拒（等交接收敛） | `tools/plugin/transferGate.ts` |
| **运行中分线（本批）** | `world_instance` 候选行（全部 server_id，有界 4096）× coord Redis：权威租约键 `kWorldLease(sId, instanceId)` **存在** ∧ 登记 `kWorldInfo.mode ∈ { mmoWorld }` ⇒ 拒；在租但登记缺 mode（recovering 未发布 / draining 登记已过期）⇒ 无法归属也拒；⛔ 不按 `state`（崩溃遗留的 active 行没人改回 offline，靠它卸载永远被卡）、⛔ 不按 `updated_at`（sleep 的空分线不写 MySQL 却仍续租）。解法 = drain / 停掉承载分线的 world 进程，等租约释放（清退）或过期（崩溃后 ≤ WORLD_LEASE_TTL_MS 15 s） | `tools/plugin/instanceGate.ts` |

显式框架侵入（受保护路径重钉）：`rooms/core/WorldRegistry.ts` 登记 HASH 加 `mode` 字段（`WorldInstancePublish.mode?`，读出恒字符串，缺省 ""）、`WorldRoom.publishRegistry` 发布 `modeId`——分线 → kit 的归属只有运行中的房知道，MySQL `world_instance` 刻意不加列（表结构不变、⛔ 二次迁移）。用例：`plugin-uninstall-instance-gate.test.ts`（假库 + 假 Redis：崩溃遗留 active 行不挡、别的 kit 的分线不挡、登记缺 mode fail-closed、连不上 MySQL / Redis 拒、check 告警）、`world-directory.test.ts`（登记带 mode）、真栈 `test/int/kit-instance-gate.test.ts`（真 world_instance 行 × 真租约键）。

**升级闸 = api 面冻结**：`apps/kits/mmo/api-freeze.json` 钉住九个面的 `version / minSupported` 与三端门面 `apps/{shared,server,client}/src/kits/mmo/api/<face>/index.ts` 的导出符号集（`kind 名字`，TS AST）；`mmo-api-freeze.test.ts` 逐面比对（随 `plugin -- test mmo` / `verify:all`）。v1 冻结数字：characters 1/1、world 2/1、movement 1/1、content 2/2、social 1/1、combat 1/1、ai 1/1、inventory 2/1、orchestration 1/1（version / minSupported）。升级方向（KIT.md §4）：**新增导出 ⇒ 该面 `version + 1`（minSupported 不动）**；**删 / 改名 / 改 kind ⇒ `minSupported` 抬到新 version**（依赖插件声明落在 `[minSupported, version]` 外即被 `install` / `check` 拒，`--break-dependents` 才放行）；改完 kit.json 与测试内冻结表后 `cd apps/server && MMO_API_FREEZE_WRITE=1 node --import tsx --test test/mmo-api-freeze.test.ts` 重钉（⛔ 无隐式重钉）。

### 编排（MK4-B1；`orchestration` 面 v1）

| 层 | 内容 |
| --- | --- |
| shared `api/orchestration` | MMO.md §8.5 契约：`OrchestrationEvent`（§8.2 十三种；v1 ⛔ spellCast / damage）、`OrchestrationCommand`（§8.3 十五种）、`OrchestrationReadApi`（address / tick / packId / `rng(stream)` / vars / world（entity / entitiesInRegion / playersInInstance / isWalkable / region）/ content / party）、`OrchestrationModule`（version / packId / subscribes / tickEvery / interacts / limits / handle）；`defineOrchestration`（形状校验 + freeze）、`validateOrchestrationCommand`（exact keys / 数值域 / 文本 / 未知 op 抛）、`effectiveLimits`（与硬上限取小）；数字：`ORCH_TICK_BUDGET_MS 2`（§11.2 冻结）/ 命令 ≤ 64 / 事件队列 ≤ 256 / vars ≤ 4 KB / timers ≤ 32、≥ 500 ms / prompt ≤ 6 / publishState ≤ 16 键 / sayWorld 6/min（冻结）/ sayNearby 30/min / tickEvery 10..1200 缺省 20 / 缺省 limits { maxSpawnsAlive 64, maxGrantCount 99, maxCurrencyPerGrant 10000 } / durable setVar 强制点 ≥ 30 s 一次；`digestOf` / `stableStringify`（FNV-1a）给环形日志与重放比对 |
| kit 内部 `orchestration/runner.ts` | 一图一包一运行器：`enqueue`（未订阅不投、suspended 不收、队列满 ⇒ suspend）、`schedule(tick)`（到期 timer（repeat 重排）+ tick 节拍按 `hash(packId, instanceId) % tickEvery` 错峰）、`dispatch(tick, world)`（逐事件 handle → 校验 → **本地命令暂存**（setVar / publishState / startTimer / cancelTimer）、其余作 effects；超预算 / 超命令数 / 坏命令 / handler 抛 / vars・timers・publish 超限 ⇒ **整批作废 + suspend**；全部通过才提交）、`notifySuspended`（packSuspended 只投一次，其命令不生效）、`resume`、`snapshot / restore`（timers 按 tick 差重排、suspended 保留）；`rng(stream)` 种子 = instanceId + tick + eventSeq + stream + 调用序；环形日志 64 条 |
| kit 内部 `orchestration/registry.ts` | packId → 模块（`registerOrchestration` 形状断言，一包一模块）；MK4-B2 起从贡献点 `orchestration` 收录 |
| 服务端 `api/orchestration` | 对插件只导出 `readCheckpointedVars(sId, instanceId, packId)`、`createOrchestrationHarness({ module, pack, mapId, seed, entities?, parties? })`（`emit / advance / vars / publish / ring / replay`：同种子重跑逐条比对环形日志摘要）；另有 `pollGrantResults`（回投 grantResult 的轮询读）与 `regionContains`（circle / rect） |
| mode 接线 | 步序：命令 → 角色移动 → AI → 战斗 → 背包轮询 → **编排步**（到期 despawn → 区域进出 diff（只在订阅时算）→ schedule → grantResult 回投（按节拍轮询世界事件表 done / dead 行，水位随快照）→ dispatch → effects 落地 → publishState 变了广播 `scriptState` → durable setVar ⇒ 强制点（限频）→ suspend ⇒ `packSuspended` 审计行 + 只投一次）→ 出站；事件源：instanceStarted（撒怪后进队）/ playerEntered・playerLeft / creatureSpawned・creatureDied（killer = 仇恨最高实体，脚本怪死后 5 s 收回不复活）/ playerDied / lootClaimed / interact（半径 80、模块 interacts × 内容包 interacts 交叉核对）/ choice（未答复的 prompt 才认，一次）/ regionEntered・regionLeft / timer / tick；命令落地：spawn（模板 ∈ 包、可行走、存活 ≤ maxSpawnsAlive、`orch:<packId>:<n>`、到期收回）/ despawn（只脚本怪）/ grantItem・grantCurrency（durable 事件行，确定性 opId；角色不在分线 ⇒ 拒）/ sayNearby（core 世界聊天 perSession，受众 = 视距内会话）/ sayWorld（v1 ⇒ 分线 notice 广播，偏差）/ notice / prompt（perSession）/ teleportWithin（可行走 + pos 回执）/ transfer（走门的同一状态机、不要求在门半径内）/ setRegionEnabled；语义拒绝只记日志 ⛔ suspend；快照 `orchestration { packId, vars, timers, publish, suspended, eventSeq, ring, grantResultSeq }` + 脚本怪（scripted / tag / despawnAtTick）随分线检查点；`__probe.orchestration / emitOrchestration / resumePack / scriptedCreatures` |
| 边界机检 | `mmo-orchestration-boundary.test.ts`：收录模块（夹具 + 贡献点渲染的 import）import 集 ⊆ `@game/shared/kits/mmo/api/**` + 自身目录、无 Math.random / Date / setTimeout / setInterval / setImmediate / process / require / fetch、顶层无副作用（TS AST，注释 / 字符串不算）；反例自证 |
| 用例 | 服务端 `mmo-orchestration.test.ts`（validator 十五种 + 十二种坏形态 / defineOrchestration 十种坏形态 / 运行器：订阅・节拍・timer・vars・publish・65 条 suspend 整批丢弃・预算・handler 抛・坏命令・限频・resume・快照 / rng 确定性 / harness emit・advance・replay 相等・改种子落点不全同）、`mmoWorld-mode` 新增 2（全链：sayNearby 世界聊天、脚本 spawn + notice、scriptState 值不变不发、击杀 boss ⇒ grantItem 行 + durable 强制点、interact ⇒ prompt ⇒ choice ⇒ grantCurrency 行、prompt 只答一次；快照往返脚本怪重建 + timers 重排、maxSpawnsAlive 4、到期收回、suspend + 审计行 + resume）、`mmo-worker` 新增 1（grantItem / packSuspended / 坏载荷）、夹具 `test/fixtures/orchestrationFixture.ts`（定时 boss 样本缩影 + 命令洪水） |
| 偏差 | sayWorld 走分线 notice 广播（kit-api 无 channel 门面）；grantResult 靠轮询世界事件表（无 worker → 房间推送）；party.membersInInstance 用准入时读到的 partyId（进图后换队不跟）；mmoAdmin.resumePack 未做（`__probe.resumePack` + 分线重启恢复）；readCheckpointedVars 按 instanceId（world_instance 是框架表，kit 事务读不到地址 → 实例映射）；factionId 为字符串 id（§8.5 写的 number） |

### 角色保存定稿（MK3-B2）

| 项 | 定稿 |
| --- | --- |
| `k_mmo_character` | 只留身份与成长：server_id / character_id / persona_id / user_id / slot / name / class_id / faction_id / level / exp + `checkpoint_rev` + created_at（列集由 `mmo-sql.test.ts` 冻结；再加列 = 新迁移 + 更新该用例）；⛔ 位置 / HP / MP / 冷却 |
| 角色检查点 | `k_mmo_character_checkpoint` 信封 `snapshot` = v2 `{ mapId, x, y, hp, mp, cooldowns?, arrival? }`（schema `{ 2, minSupported 1 }`，v1 五键照常）；**内容 fail-closed**：`validatePersonaSnapshot`（exact keys / 有限数 / 冷却正整数 / arrival 形态），坏快照 ⇒ 当无检查点从出生点满血进图并记 `enter:<s>:bad-snapshot`（⛔ 半信半疑地回灌） |
| 选角页 | `mapId` = 最新已落库角色检查点的 `snapshot.mapId`（`persistence/characters.ts` 子查询按 `checkpoint_rev`），无检查点 = null（真栈 `int/mmo-checkpoint` ④） |
| 物品 | `k_mmo_item_instance`（MK3-B1）；⛔ 进检查点 |
| 保留策略（MF11 R2-05 归 kit） | 分线 / 角色检查点各只留最近 `MMO_INSTANCE_CHECKPOINT_KEEP 32` / `MMO_CHARACTER_CHECKPOINT_KEEP 16` 个 rev（落盘同事务删更旧的行；恢复只读最大 rev、重放去重只看近期行）⇒ 长跑期间两张表**有界** |

### 物品（MK3-B1；`inventory` 面物品半边，v2）

| 层 | 内容 |
| --- | --- |
| shared `api/inventory` v2 | 背包 wire `IMmoBagWire { rev, items[{ id, itemId, count, location: bag \| equip \| mail, slot, rev }] }`（校验在 gameplays/mmoWorld/wire：≤ 91 件、(location, slot) / id 不重复）；容量 `MMO_BAG_SLOTS 24` / `MMO_EQUIP_SLOT_COUNT 3`（weapon 0 / armor 1 / trinket 2）/ `MMO_MAIL_SLOTS 64`（发放溢出落点，⛔ 丢物品）；`equipSlotOf` / `checkEquip`（槽位类型 → 职业限制 → 单件）；`planGrant`（先并入背包同模板未满堆叠（slot 升序）→ 背包空格（每格 ≤ stackMax）→ 邮箱；都满 ⇒ null）；`bagAttrs`（装备属性合计）/ `equippedTemplates` / `bagSignature` / `sortBagItems`；掉落归属 `MMO_LOOT_OWNER_MS 15 s` |
| 存储 | `persistence/items.ts` `ItemStore`（list / insert / **按 rev CAS 的 update / remove** / 回执 / newId）+ `sqlItemStore(tx)`（k_mmo_item_instance + k_mmo_receipt；交换经 `tmp` 位置三步过渡，同事务内 ⛔ 落库可见）；单测内存实现钉同一语义 |
| 服务端 `api/inventory` | `grantItem`（按 planGrant 落地 + 回执 `{ itemId, count, merged, inserted }`；同 opId 重放零写入；模板不在包 ⇒ unknown-item、都满 ⇒ mail-full）、`moveItem`（bag ↔ bag / bag ↔ equip；装备拒 not-equippable / class-mismatch / stacked / bad-slot；目标有物 ⇒ 同模板堆叠合并（余量留原地）或交换——被换下的一件必须能待在原位置（equip ⇒ 也得能装那格、mail ⇒ occupied）；no-op 也写回执；并发改同一件 ⇒ conflict）、`claimLoot`（= grantItem，opId = 事件 id）、`readBag`；账号级 `bagOf` / `moveItemFor`（角色必须属本账号 ⇒ forbidden，经 withKitTx）、世界房用 `bagOfCharacter`；错误 `MmoInventoryError(code, detail)` |
| worker | `lootClaimed` ⇒ `claimLoot(sqlItemStore(tx), …)`；`MmoInventoryError` ⇒ 死信（⛔ 整轮回滚） |
| mode | 掉落归属：怪死时击杀者 = 仇恨最高的角色（⛔ 清仇恨前取），`ownerCharacterId / ownerUntilTick` 随快照（重排）；独占期内他人拾 ⇒ rejected owned；背包：`onBeforeAdmit` 随角色预热（`loadBag`，读失败 ⇒ 无背包进图 ⛔ 拒准入）⇒ 进图私有流带 `bag`，装备属性合计进 `attack / defense`（职业 + 装备）；拾取后按 `bagRefreshEveryTicks 20 / bagRefreshForTicks 1200` 轮询 loadBag，签名变了才再发一次 bag 并停（worker 落库延迟 ≤ 分线检查点周期 + worker 节拍）；离座清；`__probe.bagOf / bagRefreshing / spawnLoot(…, owner)` |
| 客户端 | `api/inventory` v2：`fetchBag` / `moveItem`（Lobby RPC）、`bagRows` / `equippedOf` / `describeBag`（HUD 摘要「背包 n/24 · 装备 … · 邮箱 m」）；private 流 `bag` 进 `MmoPrivateState`（没带 ⇒ 沿用上次）⇒ 模型 `bag / bagSummary` ⇒ HUD 一行；kit runtime `bag(characterId) / moveItem(input)`（背包页归内容插件） |
| 用例 | 服务端 `mmo-inventory.test.ts`（纯函数 / grantItem / moveItem 十余条规则 / 账号归属）、`mmo-worker` 新增 1（模板不在包 ⇒ 死信）、`mmoWorld-mode` 新增 2（归属：击杀者独占 → 他人 owned → 超时放开 → 探针无主 → 快照重排；背包：预热进流 + 攻防 + 轮询变了才发并停 + 到期停 + 离座清）；真栈 `int/mmo-inventory`（SQL 唯一键 / rev / 回执 / 重放 / 装备 / 交换 tmp 不残留 / **并发同一件恰一个 conflict** / forbidden）+ `int/mmo-loot` 加 ⑥（拾取后世界房轮询到落库背包 ⇒ 私有流带 bag）；客户端 gameplay / room 各 1 |
| 偏差 | moveItem 经 Lobby RPC 走 withKitTx（无分线作用域；withWorldTx 形态留给世界内编排 grantItem，MK4）；背包变更无推送（kit-api 无 push 门面），靠拾取后轮询 + 客户端 mmo.bag 查询；队伍分配 / 拾取权转让归内容 / MK4 |

### 掉落（MK2-B3；`inventory` 面掉落半边）

| 层 | 内容 |
| --- | --- |
| shared `api/inventory` v1 | `rollLoot(table, rng)`（按权重选条目 + 数量域，只经调用方传入的随机流：服务端 = 分线随机流 ⇒ 同种子同命令序同掉落）、`nearestLoot`（半径内最近、只挑 kind loot、并列按 id）、`lootClaimed` 事件载荷 + 纯载荷闸 `lootClaimedPayloadOf`、候选数字 `MMO_LOOT_EXPIRE_MS = 60 s` / `MMO_PICKUP_RADIUS = 48` / `MMO_LOOT_MAX_PER_INSTANCE = 512`（§11.2 只许收紧）；MK3-B1 补物品实例 / 容器 / 装备 / 掉落归属并 bump |
| wire | `IMmoEntityWire.count?`（kind loot 的堆叠数；modeVersion 6）；`c2s.mmoWorld.pickup { lootId, clientReqId }` ⇒ `s2c.mmoWorld.opResult`（ok / rejected：dead / loot 不存在 / range / durable 不可用） |
| mode | 怪死按模板 `lootTableId` 掷骰落在尸体位置 ⇒ `MmoLootDrop`（id = `loot:<lootSeq>`，进 AOI 网格 ⇒ 兴趣集 enter，投影 templateId = itemId / count）；拾取 = 活着 + 存在 + 拾取半径内 + 有 `checkpoint.eventTable` ⇒ `context.events.append("lootClaimed", …)`（随下一个分线检查点同事务落 `k_mmo_world_event`，§7.3 原子规则；⛔ 强制点 ⇒ 奖励最多延迟一个分线周期）+ 掉落离开视野 + ok；到期消失；超上限淘汰最早；分线快照 `loot[] / lootSeq`（expiresTick 按 tick 差重排、恢复后 id 续号）；`__probe.loot / spawnLoot` |
| worker | `lootClaimed` ⇒ `grantItemInTx`：`SELECT k_mmo_receipt(op_id = eventId)` 有 ⇒ 零写入，无 ⇒ 物品进 bag 下一空槽 + 回执（同事务）⇒ 至少一次 + 回执去重 = 0 重复 |
| 客户端 | `api/inventory`（`nearestLoot` / 拾取半径再导出）；gameplay `pickup` 输入 ⇒ 本人预测位置起拾取半径内最近的掉落 ⇒ `room.pickup`（clientReqId `p<seq>`）；模型实体带 `count`；HUD「拾取」按钮、掉落画「名字×数量」；表现映射加三件物品 + boar / rat |
| 内容 | 灰盒 v6：物品 slime-gel（堆 99）/ boar-hide（堆 20）/ rusty-blade（武器 攻 +2，fighter）；掉落表 slime-drops（凝胶 8 : 锈剑 1，凝胶 1–2）/ boar-drops（兽皮 1–3）；slime / boar 挂表 |
| 用例 | 服务端 `mmo-loot.test.ts`（rollLoot 同流同果 / 数量域 / 耗流次数 / 分布按权重 ≈ 0.889 / 越界钳制 / 空表；载荷闸；nearestLoot；grantItemInTx 首发 + 重放零写入 + 输入闸）、`mmo-worker.test.ts` 新增 1、`mmoWorld-mode.test.ts` 新增 2（掷骰 enter 带 count / 同种子同掉落 / 远拒近拾 / 事件批 / 再拾拒 / 无 eventTable 拒；快照往返 + 续号 + 到期 leave + 上限淘汰）、真栈 `int/mmo-loot`（打死 → enter → 走过去拾取 → ok + leave → 事件随周期检查点落库门内 → 真租约 worker 一轮发物品 + 回执 → 再跑一轮零重复）；客户端 gameplay / room 各 1 |
| 偏差 | 掉落归属（拾取权 / 队伍分配）与堆叠合并归 MK3；⚠ int 用例 ⛔ 删 `singleton_lease` 行（worker 租约行由安装 / bootstrap 预铺，`tryAcquireLease` 只 UPDATE 过期行）——归还 = 把 expires_at 置过期 |

### 社交包装（MK1-B5）

| 层 | 内容 |
| --- | --- |
| shared `api/social` | `worldChannelId(sId)` = `realm:<sId>`（框架 channel 原语，世界聊天 = Lobby push）；`IMmoPartyLocate / IMmoPartyMember` + `validatePartyLocate`（exact keys、worldAddress 形态、mapId 与 worldAddress 一致、恰一个队长）；附近聊天 `nearbyChatLineOf`（`s2c.world.chat { fromEntityId, text, at }` → 只映射 fromEntityId → 名字）+ `appendChatLine`（上限 50） |
| 服务端 | kit-api 新增只读门面 `readPartyView(uid)`（动态 import 框架 party 原语，⛔ kit 目录 import core/party）；`api/social`：`partyOf(uid, sId, characterId)`——角色不属本账号 ⇒ MmoSocialForbiddenError，不在队 ⇒ null，成员映射：在世界里的 persona（`listPersonas.worldAddress`）优先、没进世界取首个角色、没角色全 null，队长 / 在线透传；端点 `websocket/mmoSocial/partyLocate.ts`；附近聊天受众仍只由框架按 `primaryEntityOf` + 兴趣集算（§6.5.1，M13） |
| 客户端 | `api/social`：`sayWorld(chat, sId, text)` 直接用框架 chat 门面（ChatLogic.send 同形）投 realm 频道；`partyLocate(lobbyRpc, characterId)`；`partyPanelRows(view, selfCharacterId)`（队长首位、位置 = mapId / 未进世界 / 无角色、本人标记）——队伍面板消费框架 `PartyLogic` 的名册 / 事件 + 本面的定位；世界房：`room.say(text)` ⇒ `c2s.world.chat`，`chat` 观察者回调 ⇒ gameplay 日志（名字来自视野实体表，最新 50 行），HUD 面板画最近两行（完整聊天 UI 归内容插件） |
| 用例 | 服务端 `mmo-social.test.ts`（partyOf 假依赖 / validator / 频道 / 行映射）、向量 `lobbyRpcVectors/mmoSocial.ts`、真栈 `test/int/mmo-social.test.ts`（真 party：建队 → 邀请 → 接受，A 进图后 B 的 partyLocate 看到 A 的 worldAddress / mapId；别人的角色 ⇒ 拒）；客户端 `mmo-social.test.ts` + `mmoWorld-gameplay` 附近聊天用例 |

### 检查点（MK1-B4）

| 层 | 内容 |
| --- | --- |
| 框架（显式侵入，MK0 偏差 ⑩ 收口） | `WorldMode.onPersonaCheckpoint?(context, session)` + `WorldRuntime.forcePersonaCheckpoint`（预留分线 rev 号、⛔ 推进 checkpoint_rev / 移出事件批）+ `WorldCheckpointer.savePersona`（世界事务：首句权威 CAS + 该 persona assertControl，只落该 persona）+ `WorldRoom` 离座 / 交接 prepare 先试 persona 级、mode 未实现则退化为全批；用例 `world-persona-checkpoint.test.ts`（夹具 opt-in `personaCheckpoint`） |
| 端口（kit 目录） | `kits/mmo/persistence/checkpoint.ts`：角色检查点 rev **按角色单调分配**（同事务 `checkpoint_rev + 1`；跨分线不撞），信封分线 rev 落 `instance_rev`（004），重放去重 (instance_id, instance_rev, state_hash)；分线检查点 rev = 信封 rev（1062 幂等）；load 取最大 rev；保留策略：MK3 长跑前不删旧行 |
| 快照 v2（schema `{ version: 2, minSupported: 1 }`） | 角色 `{ mapId, x, y, hp, mp, cooldowns?（spellId → 剩余 ms，落盘按 tick 差折算、进图按 fixedStep 回灌）, arrival? }`；分线 `{ tick, mapId, packId, packVersion, creatures[{ id, templateId, x, y, hp, alive, respawnDueTick? }], loot, scriptVars, timers[{ id, dueTick }], regions }`；恢复：timers 按 tick 差重排（分线 tick 从 0 起）、regions 覆盖内容包 `enabledByDefault`、scriptVars / loot 原样；v1 快照（无新字段）照常回灌；`__probe.setCooldown / setTimer / setRegion / setVar` 是 MK2–MK4 接入前的直接写口 |
| 回退窗口验收（§7.3） | 无头 `mmoWorld-mode.test.ts`（v2 往返 / 重排 / v1 兼容 / onPersonaCheckpoint 只给该会话）；真栈 `test/int/mmo-checkpoint.test.ts`：周期分线检查点（≤ 1 周期）捕获怪物 hp 改动 → **硬杀**（停续租 + 停固定步、⛔ drain）→ 新房从检查点恢复（怪物 hp / 位置回灌、`world_instance` 权威 epoch +1）→ 角色再进从最近角色检查点位置起（≤ 1 角色周期）；离座 = persona 级强制点：只多该角色一行、`instance_rev` 是预留号（不在分线检查点表）、他人零新行、分线 rev 不动 |

### 灰盒内容包（MK0-B5，随 B2 交付；MK1-B1 升 version 2；MK1-B3 升 version 3 加东郊；MK2 升 4 / 5 / 6 加技能族、野猪・田鼠、物品・掉落表）

`apps/shared/src/kits/mmo/content/greybox.ts`：主图 greybox（2000×2000，视距 400，一堵 200×200 的墙 x ∈ [1500, 1700) × y ∈ [900, 1100)，slime ×3）+ 东郊
greybox-east（1000×1000，slime ×2）经 gate-east / gate-west 互通，两职业（fighter 120 / 100 / 50、caster 110 / 80 / 100 = 速度 / HP / MP）一技能（strike）的 TS 字面量单源，启动期与用例都经
`content` 面 `validateContentPack` 过闸（结构 / 数值域 / 引用完整性 / 几何在图内 / 碰撞位图形态 / 出生・复活・刷新点不落墙；可达性随 MK2 nav）。⛔ 不是 JSON 文件：kit 服务端代码不能读文件、
tsconfig 未开 resolveJsonModule；MK4 改经贡献点 `content`（data 贡献本就是 JSON → `contributions.generated.ts`）装载，届时字面量退役。

### 基准（MK0-B6 `mmo-greybox` 场景 A；MK1-B6 `mmo-hotspot` 场景 B）

场景 A 首次数字见 MMO.md §12 MK0 行；MK1-B6 起两剧本都用生产节拍 `MMO_WORLD_TUNING`（`rooms/modes/mmoWorld/index.ts`：角色位置每 2 步 = 10 Hz 进观察者流、相位按实体错开、停下那步补 bump、本人 pos 回执仍 20 Hz；兴趣集每 4 步 = 200 ms 按会话相位重算；单测直构 mode 缺省 1 / 1）。MK1 数字（20 s / 种子 7）：A 40 人 192 只 tick p99 16.2 ms、出站 p50 40.2 KB/s/会话（逐步节拍 75.2 → −47%）；B 热点 500 只 slime：25 人 p99 15.9 ms / 40.5 KB/s ✅、50 人 p99 24.9 ms / 68.5 KB/s ✅（贴线）、100 人 p99 55.2 ms / 125.8 KB/s ❌——热点上限的本质是互见人数 × 更新率的 O(N²) 扇出，且同进程机器人把 SDK 解码算进事件循环；详见 MMO.md §12 MK1 行偏差 ⑧。报告 `docs/perf/world-bench/2026-09-20T14*-mmo-{greybox-mk1-exit,hotspot-hot25|50|100-exit}.json`；⚠ 只用于比较与阈值判定。

长跑（MK3-B3）：`tools/world-bench/run.ts --sample-every <s>`（tools/world-bench/README.md「长跑」段）把窗口切成等长采样，每样本记 tick / 出站 / 事件循环 / 内存 / 活动资源按类型 / 在线机器人 / 错误 / 世界探针（事件积压、两张检查点表行数与主体数），结束时最小二乘得每小时增长 + 检查点表有界检查 ⇒ `stable` / `growing`（容差 `SOAK_TOLERANCE`：RSS ≤ 20 MB/h、heap ≤ 10 MB/h、活动资源 ≤ 2/h、积压 ≤ 1/h、tick p99 ≤ 2 ms/h、行数 ≤ 主体数 × KEEP、不掉线、错误不增）。冒烟 `mmo-greybox --bots 20 --seconds 240 --sample-every 30`：8 样本，RSS 139 → 126 MB（斜率 −482 MB/h = GC 回落）、heap 55 → 56 MB、活动资源恒 68、tick p99 7.9 → 4.4 ms、事件积压 0、分线检查点行 7 ≤ 1 × 32、角色检查点行 140 ≤ 20 × 16、机器人 20 不掉线 errors 0 ⇒ **stable**（报告 `docs/perf/world-bench/2026-09-20T170039-mmo-greybox-soak-smoke.json`）。正式 24 h：`npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --scenario mmo-hotspot --bots 50 --seconds 86400 --sample-every 300 --label soak-24h`（72 h 改 259200）。**正式 24 h（2026-09-20 23:44 → 09-21 23:44 HKT，officenvidia：Ubuntu 26.04 / 18 核 / 30 GB / Node 22.22.1，Docker MySQL 8.4.11 + Redis 8 ×2，代码 rsync 自 kit 0.1.18 树（早于 f6153e84 的 R01–R11 修复））**：`--scenario mmo-hotspot --bots 50 --seconds 86400 --seed 7 --sample-every 300 --label soak-24h-officenvidia`，288 样本全部 bots 50 / errors 0 / 积压 0；RSS +1.1 MB/h（211.7 → 250.8 MB，后 6 h 持平）、heap +0.17 MB/h、活动资源 −0.02/h、tick p99 0 ms/h（逐样本 28.7–30.3 ms）、出站 p50 71.1 → 74.0 KB/s、检查点表有界（32 ≤ 1 × 32、800 ≤ 50 × 16）⇒ **stable**；末窗 tick p50 15.7 / p99 29.6 ms；开跑 2 min 一次 4 s docker 守护重启（该机手工 apt upgrade）只留 11 条连接拒绝、无租约丢失；报告 `docs/perf/world-bench/2026-09-20T234434-mmo-hotspot-soak-24h-officenvidia.json` ⇒ MK3 退出（tag `mk3-exit`）。⚠ 该机单线程约比基准 Mac 慢 1.27×，绝对 tick 只作该机内比较。

MK1 退出复核（2026-09-20，用户拍板选项 ③「接受 50 人热点为 v1 上限」）：`mmo-hotspot --bots 50` 三次重跑，50 人三次重跑（种子 7 / 8 / 9，2026-09-20T1615*）tick p99 20.8 / 24.2 / 24.8 ms、出站 p50 69.1 / 68.8 / 68.5 KB/s/会话、RSS 峰值 ≤ 222 MB、errors 0（种子 9 有一次 108 ms 单 tick 尖峰，p99 仍在线内）；报告 `docs/perf/world-bench/2026-09-20T1615*-mmo-hotspot-hot50-mk1-exit-s{7,8,9}.json`。**内容侧约束：聚集玩法（帮战 / 城内集会 / boss 战）设计上限 = 50 人互见**（§11.2 例外行），超过要靠分线 / 位面 / 视野分层。热点 100 人的根因与候选收紧（分层节拍 / 角色可见上限 / 位置量化 / 聊天限频）与独立进程基准台留作 v1.x 可选项。

### 回退窗口（§7.3，MF1 冻结）

| 状态 | 恢复来源 | 允许回退 |
| --- | --- | --- |
| 已确认资产 | 主账本 + `k_mmo_item_instance` + `k_mmo_receipt` | 0（`event_id` / `op_id` 去重） |
| 角色位置 / HP / MP / 冷却 | `k_mmo_character_checkpoint` | ≤ 1 个角色检查点周期 |
| NPC 存活 / 复活 / 未认领掉落 / 脚本 vars / timers | `k_mmo_instance_checkpoint` | ≤ 1 个分线检查点周期（30 s） |
| 脚本 durable 命令 | `k_mmo_world_event` + checkpoint_rev 门 | 0 重复；最多延迟到下一个分线检查点 |

### 动线

作者侧 `plugin -- pack mmo` → 干净树 `plugin -- install` → `codegen:plugins` / `codegen:gameplays` → `db:bootstrap`（两遍，第二遍零 DDL）
→ `plugin -- check` → `plugin -- test mmo [--int]` → `verify:all`（MMO-PLAN §3）。可选额外功能状态见 docs/EXTRAS.md。
