# mmo kit（apps/kits/mmo）—— MMO 地基

`mmo` 是 [docs/MMO.md](../../../docs/MMO.md) §7 定义的 **MMO 地基 kit**：常驻分线世界玩法 `mmoWorld`（`kind:"world"`，跑在框架
`WorldRoom` / `WorldRuntime` 上）+ 按面 versioning 的 api（MK0：`characters` / `world` / `content`；MK1-B1 加 `movement`、`content` 升 v2；
MK1–MK4 依次再加 `combat` / `ai` / `inventory` / `social` / `orchestration`）+ 七张 `k_mmo_*` 表 + `worldEvents` worker。内容插件（MG 段样本
`mmodemo` / `mmohold`）只消费冻结的面与贡献点，⛔ 不 import kit 内部模块。实施状态只在 MMO.md §12 回写（施工单 MMO-PLAN.md §3）。

## 状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| MK0 骨架 | kit.json / SQL / `mmoWorld` 单源 + wire / characters + world + content 面 / 灰盒内容包 / 客户端选角页 + 世界视图 / 验收链 | ✅ 2026-09-20 退出（MMO.md §12 MK0 行；tag `mk0-exit`） |
| MK1 世界闭环 | movement 面、AOI 接入、两图交接、检查点验收、社交包装、基准 | B1–B6 ✅ 2026-09-20 交付（kit 0.1.6）；**退出待拍板**：场景 B 热点 100 人未达 kill criterion（50 人贴线达标），见 MMO.md §12 MK1 行 |
| MK2 模拟闭环 | combat + ai 面、掉落 | 施工中：B1 combat 面 ✅ 2026-09-20（kit 0.1.7；B2–B3 未开工） |
| MK3 资产闭环 | inventory 面、角色保存定稿、长跑 | 未开工 |
| MK4 编排与验收 | orchestration 面 + 运行器 + harness、贡献点装载、冻结 `mmo-kit-v1-frozen` | 未开工 |

## 定义了什么（MK0-B1）

| 面 | 内容 |
| --- | --- |
| 玩法 `mmoWorld` | `gameplays/mmoWorld/{manifest,state}.json`：`kind:"world"`、`maxPlayers` 100（§11.2）、空实例 `sleep` 120 s、分线检查点 30 s；root `MmoWorldRoomState` 只放全图公开的分线元数据（tick / phase / instanceId / mapId / line / authorityEpoch + packId / packVersion / population / scriptStateRev），⛔ 名册 |
| wire | `apps/shared/src/gameplays/mmoWorld/wire.ts`（§7.4 全部 token：8 个 C2S 意图 + 10 个 perSession S2C + 2 个分线广播；观察者六件取框架 MF5b 形态，⛔ 单一 delta）；向量 `apps/server/test/wire-vectors/mmoWorld.ts` |
| SQL | `sql/001-characters.sql`（`k_mmo_character` / `k_mmo_character_checkpoint`）、`002-items.sql`（`k_mmo_item_instance` / `k_mmo_receipt`）、`003-world.sql`（`k_mmo_instance` / `k_mmo_instance_checkpoint` / `k_mmo_world_event` role:"world-event"）、`004-character-checkpoint-instance-rev.sql`（MK1-B4：角色检查点表加 `instance_rev` 列 + 索引，只追加）；全部 per-zone；检查点表整份落框架信封（`envelope JSON`，snapshot 在其内） |
| worker | `workers/worldEvents.ts`：认领门内 `k_mmo_world_event`，`grantCurrency` ⇒ 主账 credit（persona 主体，opId = eventId），其余 MK0 死信 |
| 域 `mmo` | `mmo.characters`（query：角色 + 孤儿 persona + 槽位上限）、`mmo.createCharacter`（idempotent-write：同一 withKitTx 内 createPersona + 角色行 + 回执；errorCodes MMO_NAME_TAKEN / MMO_SLOT_TAKEN / MMO_SLOTS_FULL）；进世界走框架 `world.enter` |
| 域 `mmoSocial`（MK1-B5） | `mmoSocial.partyLocate { characterId }`（query）→ `{ party: IMmoPartyLocate \| null }`：框架 party 成员 → 本 kit 角色 + worldAddress / mapId；errorCodes MMO_SOCIAL_CHARACTER_FORBIDDEN；世界 / 附近聊天 ⛔ 不在本域 |
| 服务端 api 面 | `characters`（listCharacters / createCharacter / characterOfPersona）、`world`（readInstanceMeta）、`content`（contentIndex / packForMap / mapDefOf / creatureOf / spellOf / itemOf；内置灰盒包启动期 validateContentPack fail-closed）、`movement`（MK1-B1：resolveMove / applyIntent / parseCollisionGrid 再导出 + teleportWithin） |
| WorldMode | `rooms/modes/mmoWorld/index.ts`：撒怪 / 准入预热（职业模板不在内容包 ⇒ 拒）/ 检查点回灌 / 权威积分（movement 面 `resolveMove` + 内容包碰撞网格）/ 本人 `s2c.mmoWorld.pos` 直发回执 / 视野流（AOI 网格候选 + 规则 + 上限）/ 私有流 / 检查点（全批 `onCheckpoint` + persona 级 `onPersonaCheckpoint`）；检查点端口住 kit 目录 `kits/mmo/persistence/checkpoint.ts`（MK1-B4 迁回：kit-api 再导出 CheckpointPort / CheckpointEnvelope / CheckpointSchema） |

## 客户端（MK0-B4）

| 件 | 内容 |
| --- | --- |
| kit module | `apps/client/src/kits/mmo/index.ts`（resident）：install 组装 `MmoRuntime`（角色列表 / 建角 / 框架 `world.enter` / 带参 launch `mmoWorld` / 关闭 route） |
| 客户端 api 面 | `characters`（fetchCharacters / createCharacter / describeCharacter / 槽位视图）、`world`（enterWorld、观察者六件 token 集 + reconciler codec、integrate / clampToMap 再导出）、`content`（客户端地图几何 + `classOf` 职业模板 + `IPresentationMap` 表现映射：2D 公告板颜色 / 尺寸，`model` 3D 预留）、`movement`（MK1-B1：dirFromJoystick / IntentThrottle / MovementPredictor） |
| 选角页 | route `mmoCharacters`（View `MmoCharacterSelect`，纯节点手搓版）+ 菜单「进入世界」；逻辑 `logic/MmoCharacterSelectLogic.ts` |
| mode 四件 | `gameplay/modes/mmoWorld/`（launch exact `{ characterId, mapId }`，characterId → personaId 经角色列表解析）、`net/rooms/MmoWorldRoom.ts`（world.enter → WorldRoomTransport.join；seq 递增意图；观察者流 → ObserverReconciler；seq 断裂自动重同步）、`logic/rooms/mmoWorld/MmoWorldGameplay.ts`、`view/rooms/mmoWorld/MmoWorldView.ts`（相机跟随的 2D 方块 + 最小 HUD；HUD 画在世界节点内 = 3d.md SC1-B9 退路） |

## movement 面（MK1-B1）

| 层 | 内容 |
| --- | --- |
| shared `api/movement` | 双端同源纯函数：`normalizeDir`（钳 [-1,1] + 超单位圆归一）/ `integrate` / `clampToMap`（自 world 面迁入，world 面再导出）/ `parseCollisionGrid`（内容包 `collision {cellSize, bitmap}` → 格查询，cols × rows 按 ceil，形态不合 RangeError）/ `applyIntent`（dir 清目标、target 钳图清方向）/ `resolveMove`（一个固定步：点地 reach + 0.5 内到达、撞墙先试轴向滑动、仍阻挡原地并清目标 ⛔ 空转）；`MMO_MOVE_STEP_MS = TICK_MS` |
| content v2 | `classes[]` 职业模板（classId / hpMax / mpMax / attack / defense / speedPerSec / spells）= 角色速度 / HP / MP 的真源（MK0 常量退役）；碰撞位图校验（长度 = cols × rows、'0'/'1'）；出生点 / 复活点 / 刷新点 ⛔ 落阻挡格；`indexContentPack().classById` |
| wire | 新增直发 S2C `s2c.mmoWorld.pos {seq, tick, x, y}`（本人权威位置 + 它反映到的意图 seq；⛔ 观察者单流）⇒ `mmoWorld` modeVersion 3 |
| 服务端 | mode 每固定步 `resolveMove`（碰撞网格随图解析一次）；收到意图那步或真动了都回 `pos`；准入拒职业不在包的角色；`api/movement` 再导出 + `teleportWithin`（钳图、落阻挡格 ⇒ null） |
| 客户端 | `MmoWorldRoom.move / moveTo / stop` 返回 seq（拒发 null）；`MovementPredictor`（意图立即施加、按 `MMO_MOVE_STEP_MS` 用同一 `resolveMove` 推进、回执按 seq 和解：位置以回执为准、方向 / 目标保持最新意图（在途意图已折叠进本地状态）、丢弃 ≤ seq 的在途意图；旧回执忽略）；`dirFromJoystick` 死区 0.15；`IntentThrottle` 同向 100 ms 合并、变向 / 停立即发；`MmoWorldGameplay` 本人位置取预测（速度取 `classOf(templateId)`、网格取 `mapDefOf`），他人取视野流 |
| 用例 | 服务端 `mmo-movement.test.ts`（纯函数 + content v2 坏包点名路径）、`mmoWorld-mode.test.ts`（caster 5.5 / 步、pos 回执 seq、停下静默、撞墙、职业不在包拒）、int `mmo-world`（真栈 pos 回执）；客户端 `mmo-movement-predictor.test.ts`（与服务端参考回放逐步一致、迟到回执重放、撞墙）、`mmoWorld-gameplay.test.ts`（预测 + 和解） |

## AOI 接入（MK1-B2）

| 层 | 内容 |
| --- | --- |
| kit 内部 `apps/server/src/kits/mmo/aoi/` | `grid.ts` AoiGrid：格长 = 图的 `aoi.cellSize`（与 collision / nav 的 cellSize 互不绑定），insert / move（跨格才搬桶）/ remove / clear，`candidates(center, radius)` = 视距圆外接矩形覆盖的格子里的全部 id（**只是候选**，确定性：格序 + 插入序）；`visibility.ts`：`canSee`（本人永远可见 → 位面相同 → 隐身只对同阵营可见，无阵营观察者看不见）+ `pickInterest`（精确欧氏视距 → 规则 → 最近优先（距离再 id）→ 截到 cap）。⛔ 不是 api 面（MMO.md §7.6 内部目录），插件不 import |
| mode | 实体新增 `factionId`（角色 = 建角阵营；怪物 null）/ `plane`（缺省 0）/ `stealth`；撒怪 / 进图 / 离座 / 移动 / 回灌同步网格；`visibleEntities` = 网格候选 → `pickInterest`（cap `MMO_INTEREST_MAX_ENTITIES = 256`，`limits.interestMaxEntities` 同值报给框架；框架 InterestSet 超限即抛，所以 kit 先收敛）；`__probe.setVisibility(id, {plane?, stealth?})` 是 MK2 aura / MK4 编排接入前的直接写口 |
| wire / world 面 | 名片 `IMmoEntityWire` 新增可选 `factionId`（怪物省略，exact keys）⇒ `world` 面 v2（minSupported 1）、`mmoWorld` modeVersion 4；客户端 `MmoWorldEntityView.factionId`（无阵营 null） |
| 验收（`mmoWorld-mode.test.ts`） | 超视野零泄露（900 单位外的角色 id 不出现在对方任何出站，含 baseline）；走进视距（第 84 步）enter 恰一次；隐身：异阵营 leave / 同阵营不变 / 本人不变，解除 ⇒ enter；位面：双向 leave，回位面 ⇒ enter；300 只 slime 挤在出生点：baseline = 256 条、本人必在、没选上的都不比选上的近、继续走不抛 |

## 两图交接（MK1-B3）

| 层 | 内容 |
| --- | --- |
| 内容 | 灰盒 v3：主图 `gate-east`（(1000,700) 半径 60）↔ 东郊 `greybox-east`（1000×1000，slime ×2）`gate-west`（(500,800)）；落点各自的 `gate` 出生点在门外（半径外，⛔ 落地即再触发） |
| 服务端 mode | `c2s.mmoWorld.transfer { portalId, clientReqId }`：portal 不存在 / 不在半径内 / 在途 ⇒ opResult rejected；否则**落点先写进实体**（`arrival = { toMapId, toSpawnPointId }`，停下）⇒ `context.transfer.request(session, { toMap, payload: { portalId, toSpawnPointId } })`（框架 MF8：prepare → 强制点 → 凭据 → commit）⇒ Committed ⇒ perSession `s2c.mmoWorld.transferReady { transferId, worldAddress, ticket, expiresAt }`（凭据只此一处出网，不可丢类）⇒ 壳以 "transferred" 离座；端口失败 ⇒ rejected + 落点清 + 可重试。落点经 persona 快照 `arrival`（框架 prepare 后强制点落库）传到目标图：onEnter 同图检查点优先，否则 `arrival.mapId` 等于本图 ⇒ 该出生点，否则首个出生点；HP / MP 随快照随身 |
| 客户端 | HUD「传送」⇒ `{ type: "transfer" }` ⇒ 本人（预测位置）在某个传送门半径内才发 `room.transfer(portalId)`（clientReqId `t<n>`）；`transferReady` ⇒ 记下凭据 + 请求退出，本局 stop 时交给 `onTransfer` ⇒ mode 模块下一拍 `runtime.launchWorld(characterId, 目标 mapId, 凭据)`（launch `{ characterId, mapId, transfer? }` exact 校验，凭据 worldAddress 必须与 mapId 一致）⇒ joiner 凭据在手 ⇒ 跳过 world.enter、`{ kind: "transfer" }` strategy 直进；无凭据（重连 / 回复丢失）⇒ world.enter 由框架解析在途交接 ⇒ transferId 非 null 时同样 transfer strategy |
| 验收 | 无头 `mmoWorld-mode.test.ts`（拒绝三态 / 端口目标 + 载荷 / 在途快照带落点 / 失败清落点 / Committed perSession 出网；目标图落位 / 异图 / 未知落点 / 同图优先）；真栈 `test/int/mmo-transfer.test.ts`（门外拒 → 门内交接 → 源房 CONSENTED → **reply-lost 注入**走 resolveTransfer 轮换 → 东郊落点 + 2 slime + 职业 HP / MP → finalized + 载荷落库 → 离座检查点 mapId 东郊 → 再进从检查点起）；其余三个注入（client-drop / source-crash / target-crash）是框架状态机性质，由 MF8-B7 `world-transfer-flow` 覆盖，kit ⛔ 复制 |

## combat 面（MK2-B1）

| 层 | 内容 |
| --- | --- |
| shared `api/combat` | 双端同源纯函数：`ticksOf` / `effectiveStats`（buff 加攻、debuff 减防 ≥ 0、过期忽略）/ `damageOf`（框架 `shared/logic/battle.ts` 新增公式族 `calcDamageWithDefense`：max(1, power + 0.5·atk − 0.3·def) × 等级成长，× ±10% 浮动，最小 1）/ `healOf` / `auraOf` / `cooldownReadyTick` / `checkCast`（拒绝顺序 unknown-spell → not-learned → dead → casting → cooldown → mp → no-target → self-target → target-dead → range；治疗 / 增益缺目标落到本人）/ `threatOf` / `castReqIdOf`（回执 `cast:<seq>`） |
| 内容 | 灰盒 v4：技能族 strike（瞬发直伤）/ guard（自增防御 buff）/ fireball（读条直伤）/ mend（读条治疗）/ weaken（减防 debuff）；战士 [strike, guard]、法师 [fireball, mend, weaken]；slime 学 strike（AI 随 B2） |
| 服务端 mode | 实体加 attack / defense / spells / auras / threat / casting / targetId / alive / respawnDueTick / origin；`c2s.mmoWorld.target` 选目标；`c2s.mmoWorld.cast` ⇒ checkCast ⇒ 读条（castMs > 0，移动即打断 ⇒ rejected moved）或瞬发 ⇒ 到点二次校验 ⇒ 扣蓝 / 记冷却 / 施效（直伤按公式 + 分线随机流浮动、记仇恨；治疗；aura）⇒ opResult ok；hp ≤ 0 ⇒ 死亡（清热状态、怪物离开视野、按 respawnSec / `MMO_PLAYER_RESPAWN_MS` 5 s 复活、`checkpointOnDeath` ⇒ 强制点）；private 流加 `cooldowns`（spellId → 剩余 ms，只在集合变化时发 ⛔ 每 tick 倒计时）与 `casting` ⇒ modeVersion 5；战斗步在移动之后、出站之前按实体插入序结算（同命令序 + 同种子 ⇒ 同轨迹） |
| 客户端 | `api/combat`：`CooldownModel`（private 集合 → 本地倒计时）、`pickHostileTarget`（最近存活怪）；`room.target / cast`；gameplay `target` / `cast` 输入（无目标自动选最近怪并同步目标；本地冷却中只提示不发）；模型加 targetId / spells（职业技能栏）/ cooldowns / casting；HUD「技1 / 技2」+ 目标与冷却文案 |
| 用例 | 服务端 `mmo-combat.test.ts`（公式 / aura / checkCast 顺序）、`mmoWorld-mode.test.ts` 新增 2（瞬发 / 拒绝 / 读条打断与到点 / 治疗 / buff 到期；怪死复活 / 角色死复活 / 无头重放一致）；客户端 `mmo-combat.test.ts` + `mmoWorld-gameplay` 战斗用例 |

## 社交包装（MK1-B5）

| 层 | 内容 |
| --- | --- |
| shared `api/social` | `worldChannelId(sId)` = `realm:<sId>`（框架 channel 原语，世界聊天 = Lobby push）；`IMmoPartyLocate / IMmoPartyMember` + `validatePartyLocate`（exact keys、worldAddress 形态、mapId 与 worldAddress 一致、恰一个队长）；附近聊天 `nearbyChatLineOf`（`s2c.world.chat { fromEntityId, text, at }` → 只映射 fromEntityId → 名字）+ `appendChatLine`（上限 50） |
| 服务端 | kit-api 新增只读门面 `readPartyView(uid)`（动态 import 框架 party 原语，⛔ kit 目录 import core/party）；`api/social`：`partyOf(uid, sId, characterId)`——角色不属本账号 ⇒ MmoSocialForbiddenError，不在队 ⇒ null，成员映射：在世界里的 persona（`listPersonas.worldAddress`）优先、没进世界取首个角色、没角色全 null，队长 / 在线透传；端点 `websocket/mmoSocial/partyLocate.ts`；附近聊天受众仍只由框架按 `primaryEntityOf` + 兴趣集算（§6.5.1，M13） |
| 客户端 | `api/social`：`sayWorld(chat, sId, text)` 直接用框架 chat 门面（ChatLogic.send 同形）投 realm 频道；`partyLocate(lobbyRpc, characterId)`；`partyPanelRows(view, selfCharacterId)`（队长首位、位置 = mapId / 未进世界 / 无角色、本人标记）——队伍面板消费框架 `PartyLogic` 的名册 / 事件 + 本面的定位；世界房：`room.say(text)` ⇒ `c2s.world.chat`，`chat` 观察者回调 ⇒ gameplay 日志（名字来自视野实体表，最新 50 行），HUD 面板画最近两行（完整聊天 UI 归内容插件） |
| 用例 | 服务端 `mmo-social.test.ts`（partyOf 假依赖 / validator / 频道 / 行映射）、向量 `lobbyRpcVectors/mmoSocial.ts`、真栈 `test/int/mmo-social.test.ts`（真 party：建队 → 邀请 → 接受，A 进图后 B 的 partyLocate 看到 A 的 worldAddress / mapId；别人的角色 ⇒ 拒）；客户端 `mmo-social.test.ts` + `mmoWorld-gameplay` 附近聊天用例 |

## 检查点（MK1-B4）

| 层 | 内容 |
| --- | --- |
| 框架（显式侵入，MK0 偏差 ⑩ 收口） | `WorldMode.onPersonaCheckpoint?(context, session)` + `WorldRuntime.forcePersonaCheckpoint`（预留分线 rev 号、⛔ 推进 checkpoint_rev / 移出事件批）+ `WorldCheckpointer.savePersona`（世界事务：首句权威 CAS + 该 persona assertControl，只落该 persona）+ `WorldRoom` 离座 / 交接 prepare 先试 persona 级、mode 未实现则退化为全批；用例 `world-persona-checkpoint.test.ts`（夹具 opt-in `personaCheckpoint`） |
| 端口（kit 目录） | `kits/mmo/persistence/checkpoint.ts`：角色检查点 rev **按角色单调分配**（同事务 `checkpoint_rev + 1`；跨分线不撞），信封分线 rev 落 `instance_rev`（004），重放去重 (instance_id, instance_rev, state_hash)；分线检查点 rev = 信封 rev（1062 幂等）；load 取最大 rev；保留策略：MK3 长跑前不删旧行 |
| 快照 v2（schema `{ version: 2, minSupported: 1 }`） | 角色 `{ mapId, x, y, hp, mp, cooldowns?（spellId → 剩余 ms，落盘按 tick 差折算、进图按 fixedStep 回灌）, arrival? }`；分线 `{ tick, mapId, packId, packVersion, creatures[{ id, templateId, x, y, hp, alive, respawnDueTick? }], loot, scriptVars, timers[{ id, dueTick }], regions }`；恢复：timers 按 tick 差重排（分线 tick 从 0 起）、regions 覆盖内容包 `enabledByDefault`、scriptVars / loot 原样；v1 快照（无新字段）照常回灌；`__probe.setCooldown / setTimer / setRegion / setVar` 是 MK2–MK4 接入前的直接写口 |
| 回退窗口验收（§7.3） | 无头 `mmoWorld-mode.test.ts`（v2 往返 / 重排 / v1 兼容 / onPersonaCheckpoint 只给该会话）；真栈 `test/int/mmo-checkpoint.test.ts`：周期分线检查点（≤ 1 周期）捕获怪物 hp 改动 → **硬杀**（停续租 + 停固定步、⛔ drain）→ 新房从检查点恢复（怪物 hp / 位置回灌、`world_instance` 权威 epoch +1）→ 角色再进从最近角色检查点位置起（≤ 1 角色周期）；离座 = persona 级强制点：只多该角色一行、`instance_rev` 是预留号（不在分线检查点表）、他人零新行、分线 rev 不动 |

## 灰盒内容包（MK0-B5，随 B2 交付；MK1-B1 升 version 2；MK1-B3 升 version 3 加东郊）

`apps/shared/src/kits/mmo/content/greybox.ts`：主图 greybox（2000×2000，视距 400，一堵 200×200 的墙 x ∈ [1500, 1700) × y ∈ [900, 1100)，slime ×3）+ 东郊
greybox-east（1000×1000，slime ×2）经 gate-east / gate-west 互通，两职业（fighter 120 / 100 / 50、caster 110 / 80 / 100 = 速度 / HP / MP）一技能（strike）的 TS 字面量单源，启动期与用例都经
`content` 面 `validateContentPack` 过闸（结构 / 数值域 / 引用完整性 / 几何在图内 / 碰撞位图形态 / 出生・复活・刷新点不落墙；可达性随 MK2 nav）。⛔ 不是 JSON 文件：kit 服务端代码不能读文件、
tsconfig 未开 resolveJsonModule；MK4 改经贡献点 `content`（data 贡献本就是 JSON → `contributions.generated.ts`）装载，届时字面量退役。

## 基准（MK0-B6 `mmo-greybox` 场景 A；MK1-B6 `mmo-hotspot` 场景 B）

场景 A 首次数字见 MMO.md §12 MK0 行；MK1-B6 起两剧本都用生产节拍 `MMO_WORLD_TUNING`（`rooms/modes/mmoWorld/index.ts`：角色位置每 2 步 = 10 Hz 进观察者流、相位按实体错开、停下那步补 bump、本人 pos 回执仍 20 Hz；兴趣集每 4 步 = 200 ms 按会话相位重算；单测直构 mode 缺省 1 / 1）。MK1 数字（20 s / 种子 7）：A 40 人 192 只 tick p99 16.2 ms、出站 p50 40.2 KB/s/会话（逐步节拍 75.2 → −47%）；B 热点 500 只 slime：25 人 p99 15.9 ms / 40.5 KB/s ✅、50 人 p99 24.9 ms / 68.5 KB/s ✅（贴线）、100 人 p99 55.2 ms / 125.8 KB/s ❌——热点上限的本质是互见人数 × 更新率的 O(N²) 扇出，且同进程机器人把 SDK 解码算进事件循环；详见 MMO.md §12 MK1 行偏差 ⑧。报告 `docs/perf/world-bench/2026-09-20T14*-mmo-{greybox-mk1-exit,hotspot-hot25|50|100-exit}.json`；⚠ 只用于比较与阈值判定。

## 回退窗口（§7.3，MF1 冻结）

| 状态 | 恢复来源 | 允许回退 |
| --- | --- | --- |
| 已确认资产 | 主账本 + `k_mmo_item_instance` + `k_mmo_receipt` | 0（`event_id` / `op_id` 去重） |
| 角色位置 / HP / MP / 冷却 | `k_mmo_character_checkpoint` | ≤ 1 个角色检查点周期 |
| NPC 存活 / 复活 / 未认领掉落 / 脚本 vars / timers | `k_mmo_instance_checkpoint` | ≤ 1 个分线检查点周期（30 s） |
| 脚本 durable 命令 | `k_mmo_world_event` + checkpoint_rev 门 | 0 重复；最多延迟到下一个分线检查点 |

## 动线

作者侧 `plugin -- pack mmo` → 干净树 `plugin -- install` → `codegen:plugins` / `codegen:gameplays` → `db:bootstrap`（两遍，第二遍零 DDL）
→ `plugin -- check` → `plugin -- test mmo [--int]` → `verify:all`（MMO-PLAN §3）。可选额外功能状态见 docs/EXTRAS.md。
