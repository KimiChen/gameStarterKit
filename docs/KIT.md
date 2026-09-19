# kit（地基层）设计提案

> 状态：**提案 v2 已拍板（2026-09-06；v1 经三名审阅者对抗审阅后改写，53 条发现全部消化；§9 五条拍板项用户全部同意，待实施）**。本文定义框架与
> 插件之间的第三层 **kit**——「定义了一类游戏是什么」的地基（SLG 的 worldmap 这种），商城 / 邮件 / 好友这类插件建在它
> 上面，同一个商城在不同 kit 上是不同的插件。已定前提（用户拍板）：kit **可分发**，但**只有经 gono 开发团队审核的 kit
> 才能进注册表**；`feature` 一词不再是仓内概念。实施状态只在本文 §9 回写；⛔ 不进 plan-v5。
>
> 前置文档：[docs/PLUGIN.md](PLUGIN.md)（包格式、所有权推导、安装动线）、[docs/PLUGIN-REGISTRY.md](PLUGIN-REGISTRY.md)
> （注册表）。本文只写 kit 相对于插件**多出来**的东西；相同部分直接复用。凡是要动框架的地方都标了「框架 PR」——
> 它们是 kit 机制的前置，不是 kit 自己能带进来的。

## 1. 三层与信任模型

| 层 | 谁定义 | 谁审核 | 能定义什么 | 依赖 |
| --- | --- | --- | --- | --- |
| 框架（gono 本仓） | gono 团队 | 框架 PR | 协议信封、房间 / 大厅 / 经济原语、`plugin-api` / `kit-api` 门面、迁移账本、区表登记 | — |
| kit | 任何人 | **gono 团队审核后才可分发**（§6） | 一类游戏的地基契约：shared 类型、RPC 域、持久世界状态（含 SQL 表）、服务端服务、玩法（可多个）、客户端基础页与端口、给插件用的 `kit-api` | 只依赖框架（v0 ⛔ 不依赖别的 kit） |
| plugin | 可信同事 | 自发布（owners） | ⛔ 不能定义，只消费框架与所声明 kit 的 api | 框架 + 0..n 个 kit |

PLUGIN.md §1 的核心判据「插件只能消费不能定义」不变；kit 是**被审核的定义方**。审核线就是安全线：kit 能碰的东西
（SQL、玩法、世界状态）比插件多得多，分发门槛也高得多。

一个 SLG 游戏 = 框架 + `slg` kit（worldmap / march / alliance 是它的三个 **api 面**，§4）+ 建在它上面的商城 / 邮件 / 好友插件。

## 2. kit 能定义什么、不能定义什么（划线）

**可以（kit 的推导集内；包 id 与目录名相同，⛔ 不复用 `plugins/` 命名空间）**

| 面 | 落点 | 说明 |
| --- | --- | --- |
| 登记与单源 | `apps/kits/<id>/{kit.json, README.md, gameplays/<modeId>/, sql/}` | 一个 kit 一个目录，与 `apps/plugins/<id>/` 对称 |
| shared 类型与校验器 | `apps/shared/src/kits/<id>/**` | 零依赖 shared 规则不变；跨包复用的类型只能从这里出 |
| Lobby RPC 域 | `domains/<d>.ts` + `websocket/<d>/` + 向量 sidecar | 域名必须以包 id 开头（`slg`、`slgAdmin`）；**该规则对插件同样生效**（框架 PR，否则插件可先占 kit 的前缀） |
| 持久世界状态（SQL） | `apps/kits/<id>/sql/NNN-<name>.sql` | 表名 `k_<id 小写>_*`；每张表在 `kit.json.sql.tables` 里声明 `zone`（§5）；**插件 ⛔ 不可** |
| Redis 键 | `kKitUser` / `kKitShared` 工厂，前缀 `kt:` | 与 `gp:` / `pl:` 互不可达；`kKitUser(kitId, name, uid, { zone })` → `kt:<kitId>:<name>:{uid}`；`kKitShared(kitId, name, shard, { zone })` 的 hash-tag 恒带分片键——per-zone `{<kitId>:s<sId>:<shard>}`、global `{<kitId>:<shard>}`，`shard` 必填，⛔ 整 kit 一个 tag 在构造上不可能（契约测试 `apps/server/test/kit-keys.test.ts`） |
| 服务端服务与任务 | `apps/server/src/kits/<id>/**`、`core/compute/tasks/kits/<id>/**` | 长计算仍走 compute 任务（铁律 11）；⛔ 不再给 `core/<id>/`（那是插件的落点） |
| 玩法 | `apps/kits/<id>/gameplays/<modeId>/{manifest,state}.json` + 各玩法既有落点 | 一个 kit 可带多个 mode；modeId 是全仓玩法 id 空间的成员，⛔ 不得与任何包 id 大小写归一相等 |
| 客户端基础页、端口、路由、菜单 | `apps/client/src/kits/<id>/**`，登记面写在 `kit.json` | 与插件登记面同一字段集，但命名空间是 `kits/` |
| 给插件用的 API | `apps/{shared,server,client}/src/kits/<id>/api/<surface>/index.ts` | §4 |
| FGUI 包、资源、配表 | `apps/art/fairygui/assets/<Pkg>/`、`resources/kits/<id>/`、配表 `<id>_*` | 与插件同一形态：插件是 `resources/plugins/<id>/`（2026-09-06 起；此前是与宿主目录平级的 `resources/<modeId>/`，见 PLUGIN.md §5.5.3）。⚠ kit 的 mode 资源也归 `resources/kits/<kitId>/`，⛔ 不另给 `resources/<modeId>/` |

**不可以（硬排除，与插件相同再加四条）**

- 框架保护面：协议信封、`LOBBY_PROTOCOL_VERSION` / `GAME_ROOM_PROTOCOL_VERSION` 语义、`core/infra`、`rooms/core`、`app/**`、
  `apps/server/sql/`（含字节锁的 `schema.sql`）、`protected-paths.json` 登记的一切；
- npm 依赖、根命令、tsconfig、`.env`；
- 经济原语：⛔ 不得自建第二套货币账本；扣款 / 入账只经 `kit-api/server` 暴露的 `debitInTx` / `creditInTx`（§4）；
- 别的 kit / 插件的表、键、目录；
- SQL 里 ⛔ TRIGGER / EVENT / PROCEDURE / FUNCTION / GRANT / USE / 指向非本 kit 表的外键 / 任何 `DROP`；
- 导入期副作用（模块顶层只允许声明与注册）。

## 3. 包格式：`kit.json`

`kit.json` 有自己的 schema（`apps/server/tools/plugin/kit-schema-v1.json`）：登记面字段与 `plugin.json` v2 同名同义，但路径
pattern、命名空间闸（`isKitClientDir`）、entry 形态都指向 `kits/`——⛔ 不是「复用 plugin schema 片段」，是两份 schema 共用一个解释器。

```json
{
  "schemaVersion": 1,
  "id": "slg",
  "version": "1.0.0",
  "description": "SLG 地基：世界地图 / 行军 / 联盟",
  "api": { "worldmap": { "version": 1, "minSupported": 1 }, "march": { "version": 1, "minSupported": 1 } },
  "domains": ["slg", "slgAdmin"],
  "modes": [{ "id": "battle", "constantName": "SlgBattle" }, { "id": "march", "constantName": "SlgMarch" }],
  "sql": { "files": ["sql/001-init.sql"], "tables": [{ "name": "k_slg_tile", "zone": "per-zone" }, { "name": "k_slg_world", "zone": "global" }] },
  "userKeys": ["tileOwner", "marchQueue"],
  "entry": "apps/client/src/kits/slg/index.ts",
  "routes": [], "menu": [], "viewDirs": [], "views": [], "owners": []
}
```

- `api`：命名 api 面集合（§4）；任一面变化必 bump `version`。单面 kit 用 `default`。
- `modes`：kit 自带的玩法清单（id + constantName），锁抬头用它替代插件的单个 `constantName`；所有权按每个 mode 各推一组
  gameplay 规则（`gameplays/<modeId>/`、`apps/shared/src/gameplays/<modeId>/`、`rooms/modes/<modeId>/`、`<Constant>Room.ts`、
  `wire-vectors/<modeId>.ts`、`<modeId>-*.test.ts`）。
- `sql.files`：迁移文件顺序；`sql.tables`：每张表的 `zone`（§5）。
- **MMO MF7a 增量可选字段（2026-09-19 交付，⛔ 不 bump schemaVersion，K0-2 `requires` 先例；进锁抬头与身份摘要）**：
  `sql.tables[].role: "world-event"` = 该表按框架固定的世界事件表形态（必备列 `event_id / instance_id / seq / kind / payload /
  status / attempts / checkpoint_rev`，`db:bootstrap` 的形状机检缺列 fail-closed）；`workers: [{ id, entry }]` = 后台 worker
  清单，`entry` 固定形态 `apps/server/src/kits/<id>/workers/<worker>.ts`（默认导出 `defineKitWorker({ pass })`，§4），每个
  worker 对应一行 `singleton_lease('kit:<id>:<worker>')`（bootstrap 预置，§5）。
- **MMO MF9 增量可选字段（2026-09-19 交付，同样 ⛔ 不 bump schemaVersion，进锁抬头与身份摘要）**：`contributions: { <id>: { kind:
  "data" | "module", ends: [shared | server | client], schema? | export? } }` = kit 定义的**贡献点**（§4：module 恰好一端且带
  `export`；data 带 `schema`（解释器支持的 draft-07 子集，加载期 fail-fast），schema 的 sha256 进锁 / 身份摘要——schema 变了就是
  契约变了）；`fragments: [<name>]` = kit 提供的 state fragment（文件 `apps/kits/<id>/fragments/<name>.state.json`，
  `{ schemaVersion: 1, root?: WireField[], player?: WireField[] }`，字段形态与 state.json 一致；mode 的 state.json 以
  `"<kitId>:<name>"` 引用，字段注入 root / players value 类型，文件字节并入该 mode 的 contractDigest）。
- `userKeys`：kit 的 per-user Redis 键名清单——冷档 freeze/thaw 按它快照与 UNLINK（框架 PR：freeze/thaw 读该清单）。
- 没有 `version` = 宿主自有 kit（与插件同规则：不可打包、不进锁）。
- 派生形态：`client`（有登记）/ `gameplay`（modes 非空）/ `server`（有 sql 或 `apps/server/src/kits/<id>/`）——纯 SQL + 服务的
  kit 合法（插件工具的「两者皆无即拒绝」对 kit 放宽为「三者皆无即拒绝」）。
- 锁：与插件同一目录、同一形态，抬头多一个 `"class":"kit"`。**锁目录改为 `scripts/packages/`**（框架 PR：两把插件锁
  `git mv`，`plugin-lock.test.ts`、`foreignLockOwners`、两两不交、id 大小写归一唯一都只扫这一处）——kit 与 plugin 的 id
  共享同一命名空间，撞名即拒绝。

## 4. kit-api：插件怎么建在 kit 上

- kit 在三端各导出若干 **api 面**：`apps/{shared,server,client}/src/kits/<id>/api/<surface>/index.ts`。插件只能 import 门面，
  ⛔ 不能 import kit 内部模块。导入边界**按解析后的路径**机检（不是按裸说明符）：客户端只有相对导入（Cocos 编译链，铁律 3），
  允许的目标是 `apps/client/src/kits/<id>/api/**` 与自身目录；服务端 / shared 允许 `@game/shared/kits/<id>/api/<surface>/index`
  子路径与 `apps/server/src/kits/<id>/api/**`。这与 PLUGIN-REGISTRY §4.3 的 plugin-api 边界是同一道闸的两条规则。
- `kit-api/server` 由框架提供三样插件与 kit 都拿不到的东西（框架 PR）：`withKitTx(sId, fn(conn))`（限定在 `k_<id>_*` 表的
  事务句柄）、`debitInTx` / `creditInTx`（经济主账本的事务内调用）、outbox 写入；以及构建期登记命名空间化 effect kind
  （`kit:<id>:<name>` + 零依赖 validator，随 codegen 汇入 effect 表与 Lua 镜像）。没有这三样，「世界状态在 SQL、经济在框架」
  之间没有原子路径。
- **persona 与资产主体（MMO MF2，2026-09-19 已交付）**：`tx.debit / tx.credit / tx.enqueueEffect` 末位可选 `owner: AssetOwnerRef`
  （缺省 account；persona 主体的钱包 / 流水按 `(owner_kind, owner_id)` 分键、同 uid 各主体互不可见，`kCacheCurrency` 随主体分键，relayer
  对 persona 主体只落状态不 redisApply——Redis 背包属于账号主体）；persona 门面（框架写 `persona` 行，kit ⛔ 直接 SQL 碰它、表闸照拒）：
  `tx.createPersona(uid, slot, meta?) → personaId`（`UNIQUE(server_id,user_id,kit_id,slot)` 冲突 `PersonaSlotTakenError`、
  `slot ≥ PERSONA_MAX_SLOTS_HARD(16)` 拒、meta ≤ 4 KB；槽位上限的产品值归 kit）、`tx.assertControl(personaId, controlEpoch)`
  （`UPDATE … WHERE control_epoch = ?` 的 Rows matched CAS；0 行 ⇒ `PersonaNotFoundError` / `ControlConflictError` 带实际 epoch）、
  `tx.deactivatePersona(personaId)`（在世界房拒）/ `tx.deletePersona(personaId)`（仅 inactive 且 `world_address IS NULL`）、事务外只读
  `listPersonas(kitId, uid, sId)`；**固定锁序 fail-closed**：同一事务内 createPersona（account 作用域 `FOR UPDATE`）先于任何 persona 行锁、
  persona 行锁按 id 升序，乱序 ⇒ `PersonaLockOrderError` 触库前拒。kit 表的 `persona_id` ⛔ 无外键（§2），孤儿 persona 由 kit 只读对账后
  `deletePersona`。会话撤销 / 踢下线由框架抬高 `session_generation`（顶号按区、封号 / 撤销全部区；`core/auth`，EXTRAS §3.2）。真库夹具
  `apps/server/test/int/{kit-persona,persona-session}.test.ts`；发布 SOP（门①）见 docs/SERVER.md §8.2。
- **kit worker（MMO MF7a，2026-09-19 已交付）**：`kit.json.workers[]` 登记的后台进程，`KIT_WORKER_ZONES=1,2 npm --workspace
  @game/server run worker -- <kit>:<worker>` 启动（区清单显式非空，⛔ 不从 GROUP_ZONES 推）：只认生成目录里登记的 worker（未登记
  即拒、⛔ 不 import）、争租 `singleton_lease('kit:<kit>:<worker>')`（同名 worker 全局单例）、逐区串行一条**租约守卫受限事务**
  `withKitWorkerTx(kitId, workerId, sId, lease, fn)`（kit-api：同连接同事务首句 `renewLeaseGuard`，被顶替 / 旧 fence ⇒
  `LeaseLostError` 自动回滚、业务表零写入；句柄同 `withKitTx` 但没有 `.conn`，回调内 ⛔ 另开事务），失租即退出进程（僵尸 leader
  自杀）；entry 默认导出 `defineKitWorker({ pass(tx, ctx), idleMs? })`，`pass` 一轮一条事务、返回 `{ more: true }` 表示同区还有
  积压（有界批次由 pass 自己的 LIMIT 决定）；⛔ 模块级 `setInterval` / 导入期副作用（§2）。真库夹具见
  `apps/server/test/int/kit-worker-lease.test.ts`。
- **贡献点 / fragment / 带参 launch（MMO MF9，2026-09-19 已交付）**：
  - 贡献点是 kit 反向接收插件内容的唯一通道（kit ⛔ import 插件；插件按 kit 定义的形状交内容）：插件 `plugin.json.contributes:
    { <kitId>: { <id>: <仓库相对路径> } }`（**贡献 = 依赖**：该 kit 必须同时在 `requires.kits`），`codegen:plugins` 三道校验——登记
    （kit / 贡献点 id 存在）、所有权（路径 ⊆ 插件所有权推导集，硬排除 / 受保护 / 别的包一律拒）、内容（module：.ts、落在声明端的
    `apps/<end>/src/`、TS 语法读取确认导出符号；data：.json、按 kit schema 校验）——后渲染 `apps/<end>/src/kits/<kitId>/contributions.generated.ts`
    （module = 静态字面量相对 import，data = 同源 JSON 字面量；kit 声明了某端贡献点即恒生成，空列表；撤销声明后孤儿文件由 writer
    收回）。kit 代码从自己目录 `./contributions.generated` 导入 `KIT_CONTRIBUTIONS`（K1 边界扫描对 `*.generated.ts` 豁免；
    protected-paths 以 `*` 单段通配登记这一族生成物）。闸：`pack` 越界贡献整包拒；`install` 正向闸（kit 已装且贡献点存在）；kit
    `install --reinstall-from-tree` 反向闸（已安装插件填充的贡献点被删 / 契约（kind / ends / export / schema digest）变化 ⇒ 点名，
    `--break-dependents` 才放行）；`check` 持续核对。
  - kit fragment（§3 `fragments`）泛化了 ownerReady / inviteRoom 的注入通道：mode 在 state.json `fragments` 里写 `"<kitId>:<name>"`，
    `codegen:gameplays` 按 kit.json.fragments 声明 + 文件解析并注入（撞名 / 未声明 / 缺文件 / 无发现根一律拒）。
  - 带参 launch（EXTRAS X1）：menu `launch.payload`（对象，⛔ 生成器不解释）/ `launch.profile`（须 ∈ 该玩法 manifest.profiles，
    codegen 校验）随 GeneratedLaunchTarget 进客户端；`AppRuntime.launch(target)` 把 `{ ...payload, profile? }` 经
    `RoomController.startRegistered` 交给该玩法 `GameplayModule.validateLaunch`（exact 校验：未知字段 / 非法 profile 在启动时刻拒、
    不进房）；`services.joinGameRoom(adapter, signal, { profile })` 让 joiner 按 target 选房型（ballMove 是参考接线）。
- **观察者同步 / 名册分离（MMO MF5a，2026-09-19 已交付）**：kit 的 mode ⛔ 自建 AOI 差分 / 投递内核——声明 `GameMode.observer`
  （六个 `defineS2C(..., { perSession: true, coalesceKey? })` token + payload 构造器 + `visibleEntities(session)` 返回该会话视野内的
  **公开投影**），框架做差分 / 编号 / 只含兴趣集的 baseline / 有界投递（每 tick 排空、超限重同步、重连自动 baseline）；本人私有流 /
  回执经 `context.observers.emitPerSession`（与视野流共用单 seq 流，`nextSeq` 领号，`requestBaseline` 请求重发）；`broadcastS2C`
  对 perSession token fail-closed。名册：SQL 视图房 / 世界形态的 mode 在 manifest 写 `roster: "hidden"`（root ⛔ 声明 `players`，
  名册只在服务端座位表；D4）。客户端消费 `logic/rooms/observer/ObserverReconciler` + `net/rooms/GameRoomTransport.bindObserverStream`。
  参考接线 `apps/server/test/fixtures/viewFixtureMode.ts`（视口 / 视距 / 私有字段过滤都在 mode；内存或 SQL 真源轮询）；
  slg 2b / lvr 视图房据此开工（slg.md §10.8），端口不要求 WorldAddress / personaId / authorityEpoch。
- **世界形态玩法（MMO MF4，2026-09-19 已交付）**：kit 的 `kind:"world"` 玩法（manifest `world {emptyPolicy, emptyAfterMs, checkpointMs}`，根必填集 `{tick, phase:WorldPhase, instanceId, mapId, line, authorityEpoch}`、⛔ players）由 codegen 分表登进 `worldModeRegistry`、跑在 `RoomName.World` / `WorldRoom`（profile 恒 `"world"` = AccessPolicy world-ticket、无 StartPolicy）；mode 实现 `rooms/WorldMode.ts` 的十个钩子（⛔ 不继承 GameMode），只见会话 id / persona / 有序命令，⛔ 不持 client、⛔ 不 import colyseus——全部规则在无头 `WorldRuntime` 可重放；权威（`world_instance.authority_epoch`）与控制权（`persona.control_epoch`）由框架 CAS，kit 只在 `WorldMode` 钩子里读 `context.authorityEpoch` / 会话的 `controlEpoch`（MF7b 的 `withWorldTx` 首句 CAS 用它们）。参考接线 `apps/server/test/fixtures/worldFixtureMode.ts`；客户端经 `net/rooms/WorldRoomTransport.ts` 进入（凭据来自 MF8 的 `world.enter`，MF4 用占位端口）。
- **世界形态的观察者同步（MMO MF5b，2026-09-20 已交付）**：world mode 声明 `WorldMode.observer`（与 `GameMode.observer` 同形：六个 perSession token + 投影构造器 + `visibleEntities(session, context)` 公开投影），差分 / 编号 / baseline / 有界投递由无头 `WorldRuntime` 做（重连归位 / 超限 / `context.observers.requestBaseline` ⇒ 只含兴趣集的 baseline；宽限中不排空），私有流经 `context.observers.emitPerSession`；客户端 `WorldRoomHandle.bindObserverStream` 接 ObserverReconciler。参考接线 `apps/server/test/fixtures/worldFixtureMode.ts`（视距 / 私有字段 `stamina` 过滤都在 mode）。
- **世界检查点 / 世界事件 outbox（MMO MF7b，2026-09-20 已交付）**：world mode 声明 `WorldMode.checkpoint = { kitId, port, schema, eventTable? }`——`port` 是 kit 实现的 `CheckpointPort`（`saveInstance / savePersona` 在框架给的世界事务句柄 `tx.query` 内写本 kit 表；`loadInstance / loadPersona` 自己读；快照内容归 kit，框架只校验信封与 `schema` 版本窗口，不兼容 fail-closed 拒启）；周期（manifest `checkpointMs`）与强制点（drain / 离座 / `context.requestCheckpoint`）由框架取批并在**同一个** `withKitWorldTx`（kit-api 第 7 条：首句权威 CAS、逐 persona `assertControl`、`appendWorldEvent` 只许 role:"world-event" 表）里落分线快照 + persona 快照 + 事件批 + `world_instance.checkpoint_rev`；durable 命令经 `context.events.append(kind, payload)`（分线内单调 seq），随下一个检查点落库；消费方是本 kit 的 worker（MF7a）：`tx.claimWorldEvents(table)` 门内认领 + 同事务效果（opId = eventId 去重）、`releaseWorldEvent` / `deadLetterWorldEvent`。参考接线 `apps/server/test/fixtures/{worldFixtureMode,kitfixWorld}.ts`；口径见 SERVER.md §8.3。
- **附近聊天（MMO MF6b，2026-09-20 已交付）**：框架 core 世界 token——客户端在世界房 `send("c2s.world.chat", { text })`（rateCost 2、只在 Active），框架按兴趣集把 `s2c.world.chat { fromEntityId, text, at }` 经 perSession 视野流发给视距内会话（含发送者）；kit 只需在客户端把 `fromEntityId` 映射成角色名、在服务端进程入口经 `setChatPolicy({ canSend, transform })`（`core/chat/policy.ts`，ctx.channel = `nearby:<worldAddress>`）注入禁言 / 过滤；⛔ 不另算受众、⛔ 不在 kit 表存气泡（history 无）。参考 `apps/server/test/world-chat.test.ts`。
- 插件声明依赖：`plugin.json` 加 `requires: { kits: { "slg": { "worldmap": 1 } } }`（plugin schema **v2 增量可选字段**，
  K0-2 拍板 ⛔ 不 bump schemaVersion，`requires` 进锁抬头、身份摘要、注册表索引；PLUGIN.md §5.3 与 PLUGIN-REGISTRY §2.1 / §5 同步改口径：依赖解析只做 plugin → kit 单向）。
  判定：`kit.api.<surface>.minSupported ≤ 声明 ≤ version`；`install` / `check` / 注册表 `validate` 都查；宿主未装该 kit 即拒绝。
  `codegen:plugins` 把 `requires.kits` 自动并入 PluginHost 的 `dependencies`（有 entry 的 kit 先装载），⛔ 不写两遍。
- **kit 升级的反向闸**：kit 的 `install` / `--reinstall-from-tree` 落盘前读全部已安装插件的 `requires.kits`，任一声明落到新的
  `[minSupported, version]` 之外即拒绝并点名插件，显式 `--break-dependents` 才放行。
- 同一个商城在 SLG 与 MMO 上是**两个插件 id**（`shopSlg` / `shopMmo`）；⛔ v0 不做「商城接口 + 多实现」。
- kit 之间：v0 ⛔ 不允许 kit 依赖 kit。SLG 做成一个 `slg` kit，worldmap / march / alliance 是三个 api 面，各自独立
  versioning——alliance 的破坏性变化不连坐只依赖 worldmap 面的插件。等真出现第二个要复用 worldmap 的 kit 再开 kit-on-kit。

## 5. 数据：SQL 迁移账本与区（相对插件多出来的核心）

**原则：`install` / `uninstall` 只做文件级操作，⛔ 不碰 MySQL。** 表的唯一应用者是 `db:bootstrap`（树 + 账本），install 的
`nextSteps` 只打印「运行 db:bootstrap」。理由：安装是离线、可在 CI / fixture 跑通的（PLUGIN.md §5.4），DDL 隐式提交、不可
回滚，把它挂在 install 上会制造「文件回滚了、表留下了」的半态。

| 项 | 规则 |
| --- | --- |
| 账本（框架 PR） | `schema.sql` 增加 `kit_migration(kit_id, file, sha256, statement_count, applied_statements, applied_at)`；`db:bootstrap` 在 `singleton_lease('db_bootstrap')` 下、按 kit id + 文件序，只应用账本里没有（或没跑完）的文件，逐条语句执行（`multipleStatements:false`）并按语句推进进度——中途失败留下续跑点，下次从失败那条继续而不是重跑已提交的 DDL；失败点名到 kit / 文件 / 语句序号；已应用文件 sha256 变化即 fail-closed（这就是「⛔ 不改已发布迁移」的机检形态）；语句级白名单 lint（只放行 CREATE TABLE / ALTER TABLE ADD\|MODIFY COLUMN、ADD [UNIQUE] INDEX\|KEY / CREATE [UNIQUE] INDEX / INSERT [IGNORE] INTO，表名须已声明且带前缀，其余一律拒）在执行前跑完；实现 `apps/server/tools/kit-migrations.ts` |
| 幂等 | 有账本后 `.sql` 不必自身幂等：`CREATE TABLE`、`ALTER TABLE ADD COLUMN` 都只跑一次。审核清单里的「应用两遍」改为「重跑 bootstrap 零 DDL」 |
| 区 | `sql.tables[].zone` 无缺省：`per-zone` 表必须有 `server_id SMALLINT UNSIGNED NOT NULL` 且进主键与每个 UNIQUE；`global` 表不得有；框架维护「按区表登记」（框架 PR），关单区 / 统计 / 冷档遍历时自动汇入 kit 表 |
| worker 租约行（MF7a） | `db:bootstrap` 在 kit 迁移之后按目录对每个 `workers[]` 预置 `singleton_lease('kit:<id>:<worker>')`（`tools/kit-workers.ts`：与 schema.sql 预置行同形的幂等 ODKU no-op，已有行的 holder / fence / expires_at 零触碰；⛔ INSERT IGNORE / REPLACE），worker 进程只抢占已有的行（缺行 = 未 bootstrap）；删 kit 后行保留，`check` / bootstrap 点名孤儿行 |
| 卸载 | `uninstall` 删文件、收缩生成物，表**保留**；`uninstall --drop-data` 的 drop 清单来自 `INFORMATION_SCHEMA` 的 `k_<id 小写>_` 前缀（⛔ 不读已删的文件；FOREIGN_KEY_CHECKS=0 成批 drop）并删账本行，同时 SCAN 粗匹配后按 `<前缀>(s<sId>_)?kt:<id>:` 精确过滤再有界 UNLINK Redis；`check`（或 bootstrap）对「账本有 kit X 而树无 kit X」告警。⚠ 卸载前 `gameplay_outbox` 里仍 pending 的 `kit:<id>:*` effect 会在 kit 的 effect kind 离开 `KIT_EFFECT_KINDS` 后成为 relayer 的永久 EFFECT_UNKNOWN_KIND 死信——先等 outbox 排空（K1 已做，MF0：uninstall 对 pending 行拒绝、`check` 告警）。**kit worker 闸（MF7a）**：`role:"world-event"` 表还有 `status = 0` 的行、或该 kit 的 worker 租约在役（holder 非空且未过期）⇒ `uninstall` 拒（`tools/plugin/workerGate.ts`，⛔ 无 bypass flag：先让 worker 消费完 / SIGTERM 停 worker 并等租约到期），`check` 只告警并点名孤儿 `kit:%` 租约行 |
| 冷档 | kit 的 per-user 键按 `kit.json.userKeys` 进 freeze 快照与 thaw 恢复（框架 PR）；共享键不冻结。**写侧硬契约**：对 `userKeys` 的每次写必须在 `withUserLock(uid)` 内，或在同一条 Lua 里先确认 `user:{uid}` 存在（缺席返回 'cold'）并 `HINCRBY user.ver 1`——`FREEZE_COMMIT` 只以 `user.ver` 加各 kit 键的字段数比对为判据，绕过它的直写会被冻结丢掉（`APPLY_EFFECT` 的 kit 分支满足该契约；kit 服务端代码 ⛔ 不得裸 HSET `kt:` per-user 键）。**已接受的缺口**：已卸载（未 `--drop-data`）kit 的残留 `kt:` 键在 overwrite 恢复时不被清理，只由 `--drop-data` 的 SCAN 清 |
| 升级 | 新增迁移只追加文件；表结构演进用 `ALTER … ADD COLUMN`（账本保证只跑一次），需要守卫的复杂变更写成 TS 迁移步（沿用 db-bootstrap 的 INFORMATION_SCHEMA 先例） |

## 6. 审核线（注册表侧）

注册表多出一个包类别与一个追加式审核记录：

```text
packages/<id>/<version>/publish.json        多 "class": "kit" | "plugin"
packages/<id>/<version>/reviews/NNN.json    仅 kit，追加式：{ action: "approve"|"reject"|"revoke", reviewer:{login,githubId},
                                            at, frameworkCommit, checklist:{…}, notes, zipSha256, filesLockSha256, signature }
```

- **状态**由 reviews/ 派生：无记录 = pending；最后一条 approve = approved；reject / revoke 即不可安装。`revoke` 是审核方
  对已批准坏 kit 的撤销路径（与 owner 的 `yank` 并列，二者任一即下架）。索引里 kit 的 `latest` = **最高的已批准版本**，
  pending 版本默认不被解析。
- **谁能审**：注册表自己做 GitHub OAuth（独立 App，scope `read:org`），审核动作实时复核 `gono-maintainers` 团队成员关系；
  发布者 ∪ owners 不能审自己的。v0 若 OAuth App 未就绪，退路是制品树里一份签名过的 `maintainers.json`（githubId 列表，改动走审计）。
  ⚠ 这意味着注册表的身份源是 GitHub 本身（WebPlatform 契约不暴露 GitHub 身份），PLUGIN-REGISTRY §3「鉴权」行同步改。
- **签名与可信根**：批准时注册表用 gono 审核密钥对 `reviews/NNN.json` 的规范字节签名，记录内嵌 `zipSha256` 与
  `filesLockSha256` 形成 sig → review → zip 链；公钥钉在框架仓 `scripts/kits/allowed_signers`（登记进 protected-paths.json，
  轮换 = 框架 PR）。`publish.json` 仍由发布者按 PLUGIN-REGISTRY §3.3 签。
- **宿主侧强制**：kit 的 `install --from-registry` 校验签名链，失败拒装；本地 `install <zip>` / `--reinstall-from-tree` 装 kit
  时若 zip 内没有经校验的 review 记录，必须显式 `--allow-unreviewed`，且只在 `NODE_ENV !== production` 生效，锁抬头写
  `"reviewed":false`，`check` 告警、`verify:all` 在 CI 环境（`CI=1`）红。
- **审核清单**（reviews/NNN.json.checklist；机检项由注册表 `validate` 自动填，人工项由审核者勾）：

  | 项 | 机检 / 人工 |
  | --- | --- |
  | `validate` 在固定 commit 通过（所有权 / allowlist / 镜像 / uuid / 域名前缀） | 机检 |
  | 导入边界：只 import 框架门面、`kit-api` 与自身 | 机检（K1 的边界测试） |
  | SQL：表名前缀、`zone` 声明与 `server_id` 形态、禁用语句、账本驱动下重跑零 DDL | 机检（SQL 语法级 lint + 一次性数据库实跑两遍） |
  | api：每个面的 `version` / `minSupported` 相对上一已批版本的变化方向 | 机检（导出符号 diff） |
  | 测试：`plugin -- test <id>`（K0 新增：按锁枚举包内测试单跑）通过 | 机检 |
  | README 写清定义了什么、插件该怎么用 api；设计是否符合 §2 划线 | 人工 |

## 7. 宿主侧落点与工具改动（K0 清单）

- 目录：`apps/kits/<id>/`；代码命名空间 `apps/{shared,server,client}/src/kits/<id>/`（三处新目录进推导集与 `isSharedNamespace`）。
- 发现根（四处都要加）：`codegen:gameplays`（`apps/kits/*/gameplays/*/`，断言 manifest.id === 子目录名且不与任何包 id 撞）、
  `codegen:plugins` 的登记面（`apps/kits/*/kit.json`，catalog 多 `class` 字段）与玩法 id 集、`verify-inventory` 的 capability
  fragment、客户端 `homeMenu.test.ts` 的手写并集。
- 工具：`kit-schema-v1.json` + 同一解释器；`deriveOwnership` 加 class=kit 规则集（按 modes 逐个推玩法规则）；锁目录合并到
  `scripts/packages/`（含两把插件锁迁移）；`check` 加「插件依赖的 kit 都在且 api 兼容」「账本 vs 树」；`uninstall` 加依赖反查
  （依据 = 各插件锁抬头的 `requires`）与 `--drop-data`；`install` 加反向闸 `--break-dependents`；新增 `plugin -- test <id>`。
- 框架 PR（前置，⛔ 不在 kit 包内）：`kit_migration` 账本 + bootstrap 租约 + 逐语句执行；按区表登记；freeze/thaw 读 `userKeys`；
  `kKitUser` / `kKitShared`（`kt:`，共享键强制分片 tag）；`kit-api/server` 的 `withKitTx` / `debitInTx` / `creditInTx` / outbox；
  effect kind 登记通道；域名前缀规则对插件生效；plugin schema v2 增量 `requires`（K0-2 拍板 ⛔ 不 bump schemaVersion）；`scripts/kits/allowed_signers`。

## 8. 分期与首个样本

| 期 | 内容 |
| --- | --- |
| K0（机制） | §7 全部；样本 kit 走通 pack → install → codegen → bootstrap → 插件建在其上 → uninstall |
| K1（门面与边界） | `kit-api` 路径级导入边界机检（与 plugin-api 同批）；`plugin -- test` |
| K2（注册表） | `class: kit`、`reviews/` 追加式记录、GitHub OAuth + 团队判定、审核签名链、`latest` 按已批准重算、CLI 拒装未审核 |
| 样本 | `arena` kit：一张 SQL 世界表（per-zone）+ 两个 mode（`arenaCapture`、`arenaDuel`）+ 两个 api 面（`board`、`ranking`）+ 一个建在 `board` 面上的 `arenaShop` 插件——这四样正好覆盖 kit 相对插件多出来的全部机制；之后再做 `slg` |

## 9. 实施状态

| 项 | 状态 |
| --- | --- |
| 拍板前提（可分发 + gono 审核；`feature` 不作仓内概念） | ✅ 2026-09-06 用户决定 |
| v1 → v2：对抗审阅（接缝 / 数据 / 审核线三视角，53 条） | ✅ 2026-09-06：SQL 落点统一到 kit 目录、迁移账本取代「幂等 .sql」、install 不碰 MySQL、多 mode 身份模型、api 命名面、锁目录合并、路径级导入边界、reviews/ 追加式 + 签名链 + revoke、GitHub OAuth 作身份源 |
| §2 划线 / §3 格式 / §4 api / §5 数据 / §6 审核线 | ✅ 2026-09-06 用户拍板（下列五条全部同意） |
| K0-1 锁目录合并 `scripts/packages/` | ✅ 2026-09-06（276faae：两把插件锁 git mv，`INSTALLED_LOCK_DIR` 改值） |
| K0-2 基座：`kit-schema-v1.json` + 同一解释器（`patternProperties`）、plugin.json `requires`（v2 增量可选字段，⛔ 不 bump schemaVersion）、`apps/{shared,server}/src/kits/catalog.generated.ts` 占位与类型真源 | ✅ 2026-09-06（fc8d4fb） |
| K0-3 工具：kit 类别（class/modes 身份、kits/ 命名空间推导、域名前缀规则对插件生效、锁抬头 class/api/modes/requires、正向 / 反向闸、依赖反查、`plugin -- test`） | ✅ 2026-09-06（78b2e53；`--drop-data` 已随 K0-4 账本落地，14ef9e5） |
| K0-4 框架 PR（账本 + 租约 + 逐语句、按区表登记、freeze/thaw 读 userKeys、`kKit*`、`kit-api/server`、effect kind 通道、域名前缀规则对插件生效）与四处发现根（codegen:plugins / codegen:gameplays / verify-inventory / homeMenu.test.ts） | ✅ 2026-09-06（14ef9e5 三区集成、c92a5c3 租约修复、4783122 第四区 + 三区对抗审阅修复：39 条发现全部消化）；`scripts/kits/allowed_signers` 随 K2 签名链一起做 |
| K0-5 样本 `arena` kit + `arenaShop` 插件走通 pack → install → codegen → bootstrap → 插件建在其上 → uninstall | ✅ 2026-09-06（7c37d56：主树真跑 pack 93 + 26 → 干净安装（首次 postinstall 因残留空目录失败并精确回滚，重装成功）→ arenaShop 过正向闸 → db:bootstrap 两遍（应用 2 条语句 / 第二遍跳过 1）→ check 四包 ✔ → test arena 33 / arenaShop 9 → uninstall arena 被依赖反查拒绝；对抗审阅 16 条：11 修复、5 按约束驳回；两包保持已安装，样本文档见 [apps/kits/arena/README.md](../apps/kits/arena/README.md) / [apps/plugins/arenaShop/README.md](../apps/plugins/arenaShop/README.md)） |
| K1（门面与边界） | ✅ 2026-09-19 作为 MMO 框架阶段 **MF0** 交付（docs/MMO.md §12、docs/MMO-PLAN.md MF0-B1–B3）：客户端 kit-api 路径级导入边界 `apps/client/test/kitImportBoundary.test.ts`（6582d4ac）；服务端 / shared 侧边界 + `.conn` AST 禁令 `apps/server/test/kit-import-boundary.test.ts`（1ce10d01）；uninstall 对 pending `kit:<id>:*` outbox 行的闸 `tools/plugin/outboxGate.ts` + CLI `--allow-pending-outbox`（107f8e5a，`plugin -- check` 只告警）。样本发现的框架小面 `applyKitEffect` / `readKitUserField` / `currentZoneId` 已进 kit-api |
| kit worker（MMO MF7a） | ✅ 2026-09-19 作为 MMO 框架阶段 **MF7a** 交付（docs/MMO.md §12、docs/MMO-PLAN.md MF7a-B1–B6，tag `mf7a-exit`）：kit-schema 增量字段 `workers[]` / `sql.tables[].role`（979a980d）、bootstrap 预置租约行（fe18d127）、`withKitWorkerTx`（3f978152）、`src/workers/kitWorker.ts` 入口 + `defineKitWorker`（bb2b0728）、uninstall / check 闸（ab11e6a0）、真库争租夹具 + 本文 §3 / §4 / §5 |
| 贡献点 / fragment / 带参 launch（MMO MF9） | ✅ 2026-09-19 作为 MMO 框架阶段 **MF9** 交付（docs/MMO.md §12、docs/MMO-PLAN.md MF9-B1–B5，tag `mf9-exit`）：schema 增量字段 `contributions` / `fragments` / `contributes` / `launch.payload|profile`（f6fad19f）、codegen 收录 + 三道闸（745f5ca6）、kit fragment（2c528c69）、带参 launch（944be274，显式框架侵入）、本文 §3 / §4 + PLUGIN.md §5 + EXTRAS X1 |
| persona 与资产主体（MMO MF2） | ✅ 2026-09-19 作为 MMO 框架阶段 **MF2** 交付（docs/MMO.md §12、docs/MMO-PLAN.md MF2-B1–B6，tag `mf2-exit`）：shared `protocol/identity.ts`、`persona` 表 + 经济三表 owner 列（`ensureAssetOwnerShape` 迁移，门① SOP SERVER.md §8.2）、经济 / KitTx 主体化、persona 门面（§4）、会话撤销覆盖 persona；样本 kit `arena` 随之 1.0.0 → 1.0.1（已安装 kit 的测试假实现补门面桩，锁 `--reinstall-from-tree` 重写） |
| 观察者同步 / 名册分离（MMO MF5a） | ✅ 2026-09-19 作为 MMO 框架阶段 **MF5a** 交付（docs/MMO.md §12、docs/MMO-PLAN.md MF5a-B1–B6，tag `mf5a-exit`）：perSession wire 声明与生成、rooms/core 四件原语、S2CPorts 闸、manifest `roster` 开关、GameMode `observer` 能力 + 上下文端口、客户端 reconcile、viewFixture 内存 / SQL 真栈、world-bench `view-r100 / view-r300`（视距 300 → 100 每会话出站 −83%） |
| K2（注册表） | 未开始 |
| `slg` 样本阶段 1 / 2a | ✅ 2026-09-09 完成并验收：SQL 权威地块与行军，worldmap/march v1，原创 10000×10000 地图页，耐久回执/变更日志；七张 per-zone 表、无 mode。verify:all 通过；Creator 17 步/13 图/console 空；干净制品安装、独立空库 4+3 语句、包测试 35/35、重复 bootstrap 零新应用，见 [验收证据](evidence/creator-2026-09-09/slg/README.md)。规则与边界见 [apps/kits/slg/README.md](../apps/kits/slg/README.md)；SLG 2b 等 MMO MF5，离线 worker 等 MF7，不表示 K1/K2 或 MMO 原语已完成 |

**已拍板**（2026-09-06，全部同意）：

1. §5 kit 允许带 SQL（`apps/kits/<id>/sql/`，账本驱动、`install` 不碰数据库、表声明 `zone`、卸载不 drop）。
2. §4 v0 不做 kit-on-kit：SLG 做成一个 `slg` kit，子系统作为独立 **api 面** 各自 versioning。
3. §6 注册表的身份源改为 GitHub OAuth 本身（团队成员关系从 GitHub 读），WebPlatform SSO 不再是注册表的登录方式。
4. §3 锁目录合并为 `scripts/packages/`（kit 与 plugin 共享 id 空间）。
5. §8 先用 `arena` kit + `arenaShop` 插件走通机制，再做 `slg`。
