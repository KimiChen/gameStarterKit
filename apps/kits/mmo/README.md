# mmo kit（apps/kits/mmo）—— MMO 地基

`mmo` 是 [docs/MMO.md](../../../docs/MMO.md) §7 定义的 **MMO 地基 kit**：常驻分线世界玩法 `mmoWorld`（`kind:"world"`，跑在框架
`WorldRoom` / `WorldRuntime` 上）+ 按面 versioning 的 api（MK0：`characters` / `world` / `content`；MK1-B1 加 `movement`、`content` 升 v2；
MK1–MK4 依次再加 `combat` / `ai` / `inventory` / `social` / `orchestration`）+ 七张 `k_mmo_*` 表 + `worldEvents` worker。内容插件（MG 段样本
`mmodemo` / `mmohold`）只消费冻结的面与贡献点，⛔ 不 import kit 内部模块。实施状态只在 MMO.md §12 回写（施工单 MMO-PLAN.md §3）。

## 状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| MK0 骨架 | kit.json / SQL / `mmoWorld` 单源 + wire / characters + world + content 面 / 灰盒内容包 / 客户端选角页 + 世界视图 / 验收链 | ✅ 2026-09-20 退出（MMO.md §12 MK0 行；tag `mk0-exit`） |
| MK1 世界闭环 | movement 面、AOI 接入、两图交接、检查点验收、社交包装、基准 | 施工中：B1 movement 面 ✅、B2 AOI 接入 ✅ 2026-09-20（kit 0.1.2；B3–B6 未开工） |
| MK2 模拟闭环 | combat + ai 面、掉落 | 未开工 |
| MK3 资产闭环 | inventory 面、角色保存定稿、长跑 | 未开工 |
| MK4 编排与验收 | orchestration 面 + 运行器 + harness、贡献点装载、冻结 `mmo-kit-v1-frozen` | 未开工 |

## 定义了什么（MK0-B1）

| 面 | 内容 |
| --- | --- |
| 玩法 `mmoWorld` | `gameplays/mmoWorld/{manifest,state}.json`：`kind:"world"`、`maxPlayers` 100（§11.2）、空实例 `sleep` 120 s、分线检查点 30 s；root `MmoWorldRoomState` 只放全图公开的分线元数据（tick / phase / instanceId / mapId / line / authorityEpoch + packId / packVersion / population / scriptStateRev），⛔ 名册 |
| wire | `apps/shared/src/gameplays/mmoWorld/wire.ts`（§7.4 全部 token：8 个 C2S 意图 + 10 个 perSession S2C + 2 个分线广播；观察者六件取框架 MF5b 形态，⛔ 单一 delta）；向量 `apps/server/test/wire-vectors/mmoWorld.ts` |
| SQL | `sql/001-characters.sql`（`k_mmo_character` / `k_mmo_character_checkpoint`）、`002-items.sql`（`k_mmo_item_instance` / `k_mmo_receipt`）、`003-world.sql`（`k_mmo_instance` / `k_mmo_instance_checkpoint` / `k_mmo_world_event` role:"world-event"）；全部 per-zone；检查点表整份落框架信封（`envelope JSON`，snapshot 在其内） |
| worker | `workers/worldEvents.ts`：认领门内 `k_mmo_world_event`，`grantCurrency` ⇒ 主账 credit（persona 主体，opId = eventId），其余 MK0 死信 |
| 域 `mmo` | `mmo.characters`（query：角色 + 孤儿 persona + 槽位上限）、`mmo.createCharacter`（idempotent-write：同一 withKitTx 内 createPersona + 角色行 + 回执；errorCodes MMO_NAME_TAKEN / MMO_SLOT_TAKEN / MMO_SLOTS_FULL）；进世界走框架 `world.enter` |
| 服务端 api 面 | `characters`（listCharacters / createCharacter / characterOfPersona）、`world`（readInstanceMeta）、`content`（contentIndex / packForMap / mapDefOf / creatureOf / spellOf / itemOf；内置灰盒包启动期 validateContentPack fail-closed）、`movement`（MK1-B1：resolveMove / applyIntent / parseCollisionGrid 再导出 + teleportWithin） |
| WorldMode | `rooms/modes/mmoWorld/index.ts`：撒怪 / 准入预热（职业模板不在内容包 ⇒ 拒）/ 检查点回灌 / 权威积分（movement 面 `resolveMove` + 内容包碰撞网格）/ 本人 `s2c.mmoWorld.pos` 直发回执 / 视野流（AOI 网格候选 + 规则 + 上限）/ 私有流；检查点端口 `checkpoint.ts`（k_mmo_character_checkpoint + k_mmo_instance_checkpoint + k_mmo_instance） |

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

## 灰盒内容包（MK0-B5，随 B2 交付；MK1-B1 升 version 2）

`apps/shared/src/kits/mmo/content/greybox.ts`：一图（greybox 2000×2000，视距 400，一堵 200×200 的墙 x ∈ [1500, 1700) × y ∈ [900, 1100)）两职业
（fighter 120 / 100 / 50、caster 110 / 80 / 100 = 速度 / HP / MP）一怪（slime ×3，idle）一技能（strike）的 TS 字面量单源，启动期与用例都经
`content` 面 `validateContentPack` 过闸（结构 / 数值域 / 引用完整性 / 几何在图内 / 碰撞位图形态 / 出生・复活・刷新点不落墙；可达性随 MK2 nav）。⛔ 不是 JSON 文件：kit 服务端代码不能读文件、
tsconfig 未开 resolveJsonModule；MK4 改经贡献点 `content`（data 贡献本就是 JSON → `contributions.generated.ts`）装载，届时字面量退役。

## 基准（MK0-B6，`tools/world-bench` 剧本 `mmo-greybox`）

场景 A 首次数字见 MMO.md §12 MK0 行与 `docs/perf/world-bench/*-mmo-greybox-*.json`；⚠ 机器人与服务端同进程，只用于比较与阈值设定。

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
