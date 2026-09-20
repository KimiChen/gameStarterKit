# mmo kit（apps/kits/mmo）—— MMO 地基

`mmo` 是 [docs/MMO.md](../../../docs/MMO.md) §7 定义的 **MMO 地基 kit**：常驻分线世界玩法 `mmoWorld`（`kind:"world"`，跑在框架
`WorldRoom` / `WorldRuntime` 上）+ 按面 versioning 的 api（MK0：`characters` / `world` / `content`；MK1–MK4 依次加 `movement` /
`combat` / `ai` / `inventory` / `social` / `orchestration`）+ 七张 `k_mmo_*` 表 + `worldEvents` worker。内容插件（MG 段样本
`mmodemo` / `mmohold`）只消费冻结的面与贡献点，⛔ 不 import kit 内部模块。实施状态只在 MMO.md §12 回写（施工单 MMO-PLAN.md §3）。

## 状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| MK0 骨架 | kit.json / SQL / `mmoWorld` 单源 + wire / characters + world + content 面 / 灰盒内容包 / 客户端选角页 + 世界视图 / 验收链 | ✅ 2026-09-20 退出（MMO.md §12 MK0 行；tag `mk0-exit`） |
| MK1 世界闭环 | movement 面、AOI 接入、两图交接、检查点验收、社交包装、基准 | 未开工 |
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
| 服务端 api 面 | `characters`（listCharacters / createCharacter / characterOfPersona）、`world`（readInstanceMeta）、`content`（contentIndex / packForMap / mapDefOf / creatureOf / spellOf / itemOf；内置灰盒包启动期 validateContentPack fail-closed） |
| WorldMode | `rooms/modes/mmoWorld/index.ts`：撒怪 / 准入预热 / 检查点回灌 / 常量速度积分 / 视野流 / 私有流；检查点端口 `checkpoint.ts`（k_mmo_character_checkpoint + k_mmo_instance_checkpoint + k_mmo_instance） |

## 客户端（MK0-B4）

| 件 | 内容 |
| --- | --- |
| kit module | `apps/client/src/kits/mmo/index.ts`（resident）：install 组装 `MmoRuntime`（角色列表 / 建角 / 框架 `world.enter` / 带参 launch `mmoWorld` / 关闭 route） |
| 客户端 api 面 | `characters`（fetchCharacters / createCharacter / describeCharacter / 槽位视图）、`world`（enterWorld、观察者六件 token 集 + reconciler codec、双端同源 integrate / clampToMap）、`content`（客户端地图几何 + `IPresentationMap` 表现映射：2D 公告板颜色 / 尺寸，`model` 3D 预留） |
| 选角页 | route `mmoCharacters`（View `MmoCharacterSelect`，纯节点手搓版）+ 菜单「进入世界」；逻辑 `logic/MmoCharacterSelectLogic.ts` |
| mode 四件 | `gameplay/modes/mmoWorld/`（launch exact `{ characterId, mapId }`，characterId → personaId 经角色列表解析）、`net/rooms/MmoWorldRoom.ts`（world.enter → WorldRoomTransport.join；seq 递增意图；观察者流 → ObserverReconciler；seq 断裂自动重同步）、`logic/rooms/mmoWorld/MmoWorldGameplay.ts`、`view/rooms/mmoWorld/MmoWorldView.ts`（相机跟随的 2D 方块 + 最小 HUD；HUD 画在世界节点内 = 3d.md SC1-B9 退路） |

## 灰盒内容包（MK0-B5，随 B2 交付）

`apps/shared/src/kits/mmo/content/greybox.ts`：一图（greybox 2000×2000，视距 400）一怪（slime ×3，idle）一技能（strike）的 TS 字面量单源，启动期与用例都经
`content` 面 `validateContentPack` 过闸（结构 / 数值域 / 引用完整性 / 几何在图内；可达性随 MK2 nav）。⛔ 不是 JSON 文件：kit 服务端代码不能读文件、
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
