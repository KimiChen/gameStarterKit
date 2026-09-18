<!--
  来源：2026-09-19 对 docs/MMO.md（整合设计基线 v1，2026-09-09；最后改动 eea74070 2026-09-10）的开门审阅——
  即 MMO.md 抬头「待 MF1 对抗审阅」与 §12「下一动作：第二轮审阅」所指的那一轮。
  方法：单审阅者（Claude）按接缝 / 数据 / 排期三视角逐节通读，并对工作树只读核验；正文 file:line 以 2026-09-19
  工作树（d2c62c14）为准，后续实施会让行号漂移。⛔ 不是 PLUGIN-REVIEW 那种 8 维度多 agent 流程，MF1 若要更强的
  对抗性可再补一轮。
  ⛔ 本文是审阅记录，不是设计真源：设计真源仍是 docs/MMO.md，本文结论只在被 MMO.md 采纳（正文或 §12 回写）后才
  生效。编号 M01–M20 供 MMO.md / slg.md / lvr.md 引用（slg.md 引用的「MMO 审阅 R1 / R2 / R4」在仓内无原文，见 M01）。
-->
# docs/MMO.md 审阅报告

## 结论

MMO.md 的骨架站得住：三个不变判据、「框架 → kit → 内容插件」三层、内存权威 WorldRoom 与 SQL 权威视图房两种形态，
以及 §6（社交原语）/ §8（编排面）两块规格都写到了可直接开工的粒度；§3 对本仓现状的十几处 file:line 引用逐条核对属实
（附录 A）。挡在前面的是三件事：

1. **可追溯性断裂**（M01）：正文与 CLAUDE.md / AGENTS.md 索引都说四稿 + mmo1 是「保留的讨论材料」，但五份文件既不在
   工作树也不在 git 历史；正文三处按稿名编号的引用、slg.md 两处「MMO 审阅 R1 / R2 / R4」引用都无原文可查，与抬头
   「自包含」自述矛盾。
2. **排期把消费方真正需要的通用件压在三道单向门之后**（M02、M04–M06）：文中自己声明「不需要 WorldRoom / persona /
   检查点」的 MF5 GameRoom 路径与 MF7 通用 SQL worker，被 §5.2 挂在 MF4 之后，而 MF4 又在 MF2（主账主键迁移）与
   MF3（GameRoom 抽取）两道单向门之后。slg 2b（slg.md §10.8 判为硬阻塞）与 lvr（拍板 P4 等 MF7，并自陈「MF7 今天
   没有排期」）两个已立项消费方因此被一个尚无消费方的 persona 迁移挡住；lvr 还明确拍板不要 persona。
3. **kit 首阶段有一条写路径按现行契约走不通**（M03）：`createCharacter`「框架 persona 行 + `k_mmo_character` 同事务」，
   但 kit 事务句柄的表闸只放行 `k_<id>_` 前缀，MF2 又没有给 KitTx 任何 persona 门面。

其余是口径不一（kit 开工门三种说法、MF6a 依赖自相矛盾）、数据模型双真源（角色位置）、一条恢复时序缺口（durable 命令
与检查点的原子关系）以及若干 Low 级措辞与数字问题。上游对照（Nakama 七钩子与许可证、AzerothCore 引用 commit 可达）
核对无误。

## 问题清单

严重度：High = 阻塞开工或与仓内事实冲突；Medium = 需改正文才能作为验收依据；Low = 措辞 / 数字 / 一致性。

### High

| 编号 | 章节 | 问题 | 证据 | 修法 |
|---|---|---|---|---|
| M01 | 抬头 / §4.3 / §5.2 / §12 | 来历材料不在仓，按稿编号的引用不可核 | `docs/MMO.md:4-6` 链接 `mmo-chatgpt/claude/kimi/zcode.md` 与 `mmo1.md`；`ls docs/` 与 `git log --all -- 'docs/mmo*.md'` 皆空；`:174`「mmo1 §4.2」、`:254`「claude W4→W5 / kimi E5→E6」、`:1001`「按 mmo1 §4 四条对照」；`CLAUDE.md` / `AGENTS.md:17` 仍写「四份 docs/mmo-*.md 与 docs/mmo1.md 为讨论材料」；`slg.md:181,201` 引用「MMO 审阅 R1 / R2 / R4」同样无原文 | 二选一：① 把五份材料只读入库到 `docs/mmo-drafts/`（不登记 inventory，抬头注明「归档、不维护」）；② 删掉索引里那半句，正文三处改为自包含陈述（把「E5→E6 反转」的理由写出来而不是引编号）。R1–R4 在 MMO.md §12 或 slg.md §6 补一段原文摘录 |
| M02 | §5.2 / §5.3 / §5.5 | MF5 与 MF7 各自的「通用半边」被挂在 MF4 之后，两个已立项消费方被不相关的单向门阻塞 | 文中自证：`:363` MF5 adapter 行「端口不强制要求 WorldAddress / personaId / authorityEpoch」、`:365`「SQL 视图房夹具 … 用 kitfix 表」；`:387` MF7「端口无需 WorldRoom、persona 或检查点」、`:390`「SQL worker 夹具 … 无 WorldRoom/persona」。但 `:243-252` 图与 `:265,268` 表把 MF5、MF7 的依赖写成 MF4，MF4 依赖 MF3 依赖 MF2（`:235`「① → ② → ③ 串行」）。消费方：`slg.md:448-470` §10.8「MF5 尚未实施，2b 全部阻塞」并已给出只依赖 MF1 的批次序；`lvr.md:196-205` 拍板 P4 等 MF7、`:421`「MF7 今天没有排期」 | 拆段：**MF5a**（perSession wire 声明 + 生成、InterestSet / ObserverSync / Baseline / OutboundQueue、S2CPorts fail-closed、GameRoom 消费路径 + D4 名册分离、kitfix 双房夹具；前置 MF1 + MF3）与 **MF5b**（WorldRoom 接入 + worldFixture；前置 MF4）；**MF7a**（`kit.json.workers[]`、租约守卫受限 KitTx、`kitWorker.ts` 入口、uninstall 闸、SQL worker 夹具；前置 MF0）与 **MF7b**（CheckpointPort / WorldTx / WorldEventPort；前置 MF4）。§5.2 图、§5.3 表、§5.5 开工条件、§6.7、§4.1.1、§12 同批改 |
| M03 | §7.2 / MF2 / MF7 | `createCharacter`「框架 persona 行 + `k_mmo_character` 同事务」按现行 kit 事务契约写不出来 | `docs/MMO.md:613`；`apps/server/src/core/infra/kitApi.ts:270-284` `assertKitTableAccess` 只放行 `k_<id>_` 前缀（`docs/KIT.md:92` 同口径）；MF2 修改面 `:298-313` 只加 `tx.assertControl`，无 persona 增删查门面；MF7 `:382` `withWorldTx` 也只「暴露 KitTx 门面 + appendWorldEvent」；`k_mmo_character.persona_id` 也不能声明外键（KIT.md §2 禁指向非本 kit 表的 FK） | MF2 修改面补 `tx.createPersona(kitId, slot, meta)` / `tx.deletePersona` / `listPersonas(uid, sId, kitId)`（`UNIQUE(server_id,user_id,kit_id,slot)` 冲突语义、槽位上限归框架还是 kit 写死），并把「persona ↔ kit 角色行一致性由同事务保证、孤儿 persona 归谁清理」写进 §7.3；或 §7.2 改两阶段（框架域 `persona.create` 先建行）并规定孤儿清理 |

### Medium

| 编号 | 章节 | 问题 | 证据 | 修法 |
|---|---|---|---|---|
| M04 | §5.5 / §7 / §7.6 / D8 | kit 开工门三种口径互斥 | `:454`「MF0–MF8 退出 + MF9 退出；MF10 / MF11 可与 MK0 并行」；`:552`「前置：MF0–MF9 退出」；`:702` MK0 前置「MF0–MF4、MF7」、MK1「MF5、MF6、MF8」、MK4「MF9、MF11」；`:969` D8「kit 等框架验收」 | 以 §7.6 逐阶段前置为准（M02 拆段后：MK0 ← MF4 + MF7b，MK1 ← MF5b + MF6 + MF8），§5.5 与 §7 抬头改为「见 §7.6 表」，D8 改写为「kit 每阶段只消费已退出的框架阶段」 |
| M05 | §5.1 / MF3 | MF3 依赖「MF2 完成并 drain」无理由，且 `rooms/core/` 不是新目录 | `:263,:235`；MF3 是行为等价抽取，与 persona / outbox 无交集；`apps/server/src/rooms/core/` 已有 AccessPolicy / RoomProfile / StartPolicy，`apps/server/tools/plugin/ownership.ts:129` 已把它列为硬排除，`scripts/protected-paths.json` 尚无该条（PLUGIN-REVIEW F03 遗留） | MF3 前置改为 MF1，门①与门②解耦（「② → ③ 串行，① 只需先于 MF4」）；`:323` 改为「把既有 `rooms/core/**` 登进 gameplayFlow」，顺带关闭 F03 |
| M06 | §5.2 / §5.3 / §6 | MF6a 依赖 MF2，与图注「只依赖 Lobby + 流，可并行」自相矛盾 | `:248` vs `:266`；§6.2–§6.5 全部以 uid 为主体，`:472` `characterId` 是「框架不解释」的字符串；§6.7 三个第二消费方（guild 扇出、ServerNotice、snake 私房整队）都不需要 persona | MF6a 前置改为 MF1；这是最早能对既有仓交付价值的框架段（修 `pushToGuild` 多节点静默丢：`apps/server/src/websocket/push.ts:212`） |
| M07 | MF4 / MF5 | D4 名册分离在 GameRoom 路径上的修改面与协议影响未写 | `:336` world 根「禁止 players map」只改 gameplay-schema / lib；但 `apps/server/tools/gameplay-codegen/stateRenderer.ts:546-592` `ROOT_LIFECYCLE_FIELDS` 对所有根强制 `players`，`apps/server/src/rooms/schema/GameRoomState.ts:33` 全房广播 id/name；`:363` 说要「内部名册与 Schema 投影分离」却未点名这两处，也未说是否 bump `GAME_ROOM_PROTOCOL_VERSION`（现值 8）或按 mode 开关（snake 不动）；slg.md S4 已把这条列为 2b 硬阻塞 | MF5a 修改面补 `stateRenderer.ts` / `GameRoomState.ts` 与客户端对应端；写明策略：manifest 可选 `roster: "public" \| "hidden"`（缺省 public，既有 mode 零变），hidden 时根不生成 `players`，名册留房内会话表；协议整数是否 bump 写成人工决策项进 §11.2 |
| M08 | §7.3 | 角色位置 / HP / MP 双真源 | `:629` `k_mmo_character` 带 `map_id / pos_x / pos_y / heading / hp / mp`；`:639-648` 回退窗口表说这些的恢复来源是 `k_mmo_character_checkpoint`；违反判据 2「每种数据一个持久真源」 | `k_mmo_character` 只留身份 / 成长（class / faction / level / exp）+ `checkpoint_rev` 指针，位置 / HP / MP 只在检查点表；或明写「角色行 = 最新检查点投影，同一事务写入，读侧只读角色行」 |
| M09 | §8.6 #5 / §7.3 / §10.2 | durable 命令批与分线检查点的原子关系未写，存在重复发奖窗口 | `:846`「durable 命令进内存 outbox，随分线检查点或每 ≤ 1 s 批写」；`:749` op_id = uuidv5(instanceId, packId, eventSeq, idx)；`:646` timer「恢复后按 tick 差重排」。若事件批已落库、对应状态的检查点未落即崩溃：恢复回到 kill 前状态，boss 链重放会用**新的** eventSeq 产出第二份 grant，op_id 不同 ⇒ 双发，与 `:935` 表「NPC 死亡后崩溃：不重复发」冲突；`:635` `k_mmo_world_event.checkpoint_rev` 列暗示了解法但没写 | 三选一写进 §7.3 并补一行「脚本 durable 命令」回退窗口：① 事件批只随检查点同事务落库（放弃 ≤ 1 s 批写）；② worker 只执行 `checkpoint_rev ≤ 已落库分线检查点 rev` 的事件，其余 pending；③ op_id 改为业务键确定性 id（instanceId, packId, spawnId / killSeq） |
| M10 | §4.1.1 / §6.7 / §12 | lvr 未登记为消费方，且与 MF2 / MF8 的假设相冲 | `lvr.md:98-100` 世界形态 = SQL 权威 + 视图房；`:149-151` 依赖 MF7 / MF6 / MF5；`:253` 实时视图房 `lvrWorld`、海战、BOSS；`:266` 活动插件化依赖 MF9；`:314`「跨服 GVG / 王城战等 MF8」；`:395` 拍板「persona 不预留，主体键 (uid, server_id)」；`:475`「MF7 落地后回写 MMO.md §12」。MMO.md `:129-137` / `:540-548` / `:992-1001` 只登记 arena / slg | §4.1.1 消费方列加 lvr；§6.7 每行加 lvr 用例；§4.1.1 写明 MF8 是 persona 在同区 WorldAddress 间的交接、`sId` 是隔离维度，⛔ 不提供跨区——lvr.md 的「跨服等 MF8」应改口径；§11.2 增一项「主体模型：MF2 owner scope 与 lvr 的 uid 主体如何并存（缺省 account 即 uid，lvr 零变）」并点名 |
| M11 | §7.1 / MF7 / MF9 | kit.json 草案用了三个 schema 里不存在的字段，只标了两个 | `apps/server/tools/plugin/kit-schema-v1.json` `additionalProperties:false`，顶层无 `contributions` / `workers`，`sql.tables[]` 项只有 `name` / `zone`——`:635` `role:"world-event"` 没有 ⭐；`plugin-schema-v2.json` 无 `contributes` / `launch.payload` | `role` 加 ⭐ 归 MF7；MF7 / MF9 修改面点名 `kit-schema-v1.json` 与锁抬头 / 身份摘要（KIT.md §3）的处理：沿 K0-2 `requires` 先例做 v1 增量可选字段，⛔ 不 bump schemaVersion，写进 §11.1 |

### Low

| 编号 | 章节 | 问题 | 证据 | 修法 |
|---|---|---|---|---|
| M12 | MF3 退出条件 | 「符号出现次数 = 0」在抽取后写不出用例 | `:326`；现状 `verifyAndCacheWebPlatformSession` 2、`validateC2SPayload` 2、`messageBudget` 7、`GAME_ROOM_PROTOCOL_VERSION` 7 次；抽取后 GameRoom 仍要引用门面 | 改为「不 import `core/auth/session`；无 `validateC2SPayload(` 调用；`MessageBudget` 只以类型出现；协议常量由 RoomAuth 注入」 |
| M13 | §6.5.1 / §7.2 | 附近聊天受众计算在框架与 kit 各写了一份 | `:267` `WorldMode.primaryEntityOf`（框架按兴趣集投递）vs `:620` `social.nearbyRecipients(speakerEntityId)` | 契约只留一个：框架 `primaryEntityOf` + 兴趣集，kit 可见性规则走 MF5 授权回调；删 `nearbyRecipients` 或改为纯查询别名 |
| M14 | §7.4 | `baselineRequest { roomEpochId, afterSeq }` 用了 GameRoom 词汇 | `:665`；§3 明说 `roomEpochId` 只是 GameRoom 身份令牌；MF4 信封已有 `resumeSeq`，世界身份是 `instanceId` / `authorityEpoch` | 改 `{ authorityEpoch, afterSeq }`，或删掉该 token 只走重连信封 `resumeSeq` |
| M15 | MF1 / §8.3 / §10.1 / §11.2 | 待冻结数字散落且互不一致 | `:295` kill criterion「100 机器人 + 300 实体」vs `:930` 场景 B「100 玩家 + 500 实体」；`:752` `sayWorld`「每分钟 ≤ N」N 未定且不在 §11.2；`maxPlayers`、`emptyAfterMs`、`checkpointMs`、`ORCH_TICK_BUDGET_MS` 分散各节 | §11.2 收成一张「MF1 冻结数字表」（候选值 / 来源 / 冻结方式），正文只引表 |
| M16 | §8.2 / §8.5 | `grantResult` 表格与类型不一致 | `:737`「带 instanceEpoch，旧 epoch 丢弃」；`:789` 类型 `{ opId, ok, reason? }` 无该字段 | 表格改「kit 内部按 instanceEpoch 过滤后投递，类型不暴露」 |
| M17 | §6.2 / §6.4 | 「durable noeviction ⇒ 每键必有 TTL」写成普适规则 | `:473`；`:499` `kPartyIdSeq()` TTL 无，玩家档亦无；`docs/SERVER.md:88` 只说 noeviction + AOF | 改为「presence 键是提示语义，必带 TTL」 |
| M18 | MF7 | `withWorldTx` 首句用 `checkpoint_rev` 自增当写栅栏 | `:382`：每笔 kit 事务（含每次拾取回执）都 `UPDATE world_instance SET checkpoint_rev=…`，与两张检查点表的 `rev` 语义混用 | 首句改为不改语义的 CAS（`write_seq = write_seq + 1` 或 `updated_at = NOW(3)`），`checkpoint_rev` 只在 `onCheckpoint` 推进 |
| M19 | §2.3 | AzerothCore 引用锁 commit 与所引文件无关 | `:99` `a5e0e6b8…` GitHub 可达，标题 `fix(Scripts/Ulduar): constellations…`（只改 1 个 boss 脚本）；作为「2026-09-08 master HEAD 快照」可用 | 注明「master HEAD@2026-09-08，与所引文件无关」；MF1 引用锁按文件写 blob 或路径 + commit |
| M20 | §12 / KIT.md §9 / AGENTS.md | SLG「10000×10000」是 2026-09-09 时点事实，之后已改 | `:997`、`docs/KIT.md:189`、`AGENTS.md:21` 仍 10000×10000；`slg.md:284` §9 于 2026-09-10 改 1500×1500 并扩五图；`CLAUDE.md` 已改而 `AGENTS.md` 未改且缺 lvr 两行（`diff AGENTS.md CLAUDE.md`） | §12 该行末尾加「尺寸后改 1500×1500 + 五图，见 slg.md §9 / §10」；AGENTS.md 与 CLAUDE.md 重新对齐（索引真源只该有一份） |

## 建议的阶段重排（供 MF1 消化；⛔ 未经拍板不改 MMO.md）

```text
MF0 KIT K1 ─┐
MF1 审阅 + 基准台 + AOI 实验 ┤ 退出后并行开工：
                            ├→ MF3 共享层抽取（门②）──→ MF5a 观察者同步·GameRoom 路径 + D4 名册分离 ──→ slg 2b 可开工
                            ├→ MF6a presence / 总线 / party / 频道（顺带修 guild 扇出、ServerNotice）
                            ├→ MF7a kit worker（workers[] + 租约守卫 KitTx）──→ slg / lvr 无人在线结算可开工
                            ├→ MF9 贡献点 / fragment / 带参 launch
                            └→ MF2 persona / 资产主体（门①，只需先于 MF4）
MF2 + MF3 → MF4 WorldRoom（门③）→ MF5b WorldRoom 接入 → MF6b 附近聊天
                                  → MF7b 检查点 / 世界事件 → MF8 交接（用 MF6a 的流）
MF4–MF8 → MF10 → MF11
```

变化只有四处：MF3 / MF6a 提前到 MF1 之后；MF5、MF7 各拆两半，通用半边不再等 MF4；MF2 不再阻塞任何非 persona
工作。单向门的语义不变，只是门①不再是所有工作的前置。

## 附录 A：核对通过的事实（⛔ 不需要改）

- §3 全部 file:line：`GameRoom.ts` 2214 行、`:801-813` 房内 Chat 全房广播、`ballMove/rules.ts:92-96` 常量速度积分 + clamp、
  `snake/world.ts:121-160` `SpatialGrid` 只出候选、`push.ts` 的 `pushToUser` / `pushToGuild` / `pushToAll` 皆本节点、
  `app.config.ts:74-79` 独立 Redis 实例、`changed.ts:200-226` 按单条路径认领（两包同改仍走快路径，`plugin-changed.test.ts:116`）、
  `viewCatalog.ts:658-668` 边界前缀（`mmodemo` 不匹配 `mmo`）、`player/character.ts` + `K_CHARACTER_REPAIR_*` 占用 character
  一词、`singleton_lease` 预置 relayer / freeze_worker / db_bootstrap 三行、基线 commit `26da7e5` 存在。
- 版本：`@colyseus/core` 0.17.44、`@colyseus/schema` 4.0.27（服务端 build 含 StateView）；客户端 vendored bundle 标
  schema 4.0.13、含 `StateView` 类、无手写 `.d.ts`；`selectProcessIdToCreateRoom` 在 `@colyseus/core/build/Server.d.ts:35` 存在。
- 上游：Nakama 七钩子（init / joinAttempt / join / leave / loop / terminate / signal）、Apache-2.0；AzerothCore AGPL-3.0、
  `WORLD_SLEEP_CONST` 50 ms、`MapInstanced` / `GridNotifiers` / `PlayerStorage` / `MovementHandler` / `EventMap` 均为真实文件；
  引用 commit 可达（见 M19）。
- §9.1「snake 锁文件 230 个」：`scripts/packages/snake.lock` 230 条路径 ✓。
- §7.1 命名闸：`mmoWorld` 与 `mmo` 归一不等 ✓；三域以 `mmo` 为边界前缀 ✓；§8.6 `contributes.mmo` 三条路径都在插件所有权
  推导集内（`ownership.ts:301` `apps/server/src/core/<id>`、`install.ts:649`）✓。
- 与其余文档口径一致：⛔ 不进 plan-v5（`docs/plan-v5.md` 零命中）✓；EXTRAS §5.2 只留 Y2 指针 ✓；KIT.md §9 K1 未开始 =
  MF0 前提成立 ✓；`test:faults:int`、`scripts/fault-matrix.config.json`、`tools/m0/`、`scripts/lib/fixture-checkout.mjs`、
  `serverImportBan.test.ts`、`kit-import-boundary.test.ts` 皆存在 ✓。

## 附录 B：处置顺序建议

1. 文档真相对齐（零代码风险）：M01、M20、M04、M06、M16、M17、M19。
2. 契约缺口补写（MF1 内完成）：M03、M07、M08、M09、M11、M13、M14、M18。
3. 排期重排拍板（需用户决定）：M02、M05、M10 → 改 §5.2 / §5.3 / §5.5 / §4.1.1 / §6.7，并让 slg.md §10.8 与 lvr.md §4.3
   改引新的 MF5a / MF7a 编号。
4. 数字冻结（MF1 基准台之后）：M15、M12。
