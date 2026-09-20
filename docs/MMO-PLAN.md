# MMO 实施施工单：MF0–MF11 → MK0–MK4 → MG0–MG2 逐批次

> - 日期：2026-09-19。依据 [MMO.md](MMO.md) **v1.2**（2026-09-19；v1.1 按 MMO-REVIEW M01–M20 修订，v1.2 按本文 §7 细化与 D27 回写）。基线 `7bf2b8a4`。
> - 定位：**施工单**——把 MMO.md §5–§9 的每个阶段拆成可独立提交、可独立验收的批次（`MFx-Bn` / `MKx-Bn` / `MGx-Bn`），
>   写清每批的文件落点、机检退出条件与要跑的命令。⛔ 本文不是设计真源：任何与 MMO.md 冲突处以 MMO.md 为准；
>   本文若发现设计缺口，只登记在 §7「施工细化」并回写 MMO.md，⛔ 不在本文另立口径。
> - 状态回写：阶段级完成仍只回写 MMO.md §12；**批次级勾选只在本文 §9**。⛔ 不进 plan-v5。
> - 进程拆分（lobby / game / world 三进程）作为独立轨道 **PS** 列在 §5；PS0 四项已于 2026-09-19 拍板（MMO.md D27），MF4-B6 / MF8-B4 / MF10-B2 的交点已按拍板写定；本文 §7 的 P1–P7 已回写 MMO.md v1.2。

## 0. 总览：波次与并行

```text
波 0   MF0 KIT K1 前置 ──────────────┐   MF1 基准台 + AOI 实验 + 冻结数字表 ┐
                                     └──────────────────────────────────────┴─▶ MF1 退出（⛔ 任何框架编码不得早于此）
波 1   MF3 共享层抽取（门②）  ‖  MF6a 社交原语  ‖  MF7a kit worker  ‖  MF9 贡献点  ‖  MF2 persona（门①）
波 2   MF5a 观察者同步·GameRoom（← MF3）        ‖  MF4 WorldRoom / 租约 / 控制权（门③，← MF2 + MF3）
波 3   MF5b WorldRoom 接入（← MF4 + MF5a）  ‖  MF7b 检查点 / 世界事件（← MF4 + MF7a）
波 4   MF6b 附近聊天（← MF5b）  ‖  MF8 交接与凭据（← MF6a + MF7b）
波 5   MF10 容量 / 多进程 / 运维（← MF4–MF8）
波 6   MF11 收口审阅与冻结（← MF0–MF10）
kit    MK0（← MF0–MF4 + MF7）→ MK1（← MF5 + MF6 + MF8）→ MK2 → MK3 → MK4（← MF9 + MF11）
插件   MG0（← MK4）→ MG1 ‖ MG2
```

| 波 | 阶段 | 批次数 | 首个外部受益方 |
| --- | --- | --- | --- |
| 0 | MF0、MF1 | 3 + 3 | KIT K1 关闭；冻结数字表 |
| 1 | MF3、MF6a、MF7a、MF9、MF2 | 3 + 5 + 6 + 5 + 6 | MF6a：guild 扇出修复；MF7a：slg / lvr 无人在线结算 |
| 2 | MF5a、MF4 | 6 + 8 | MF5a：slg 2b、lvr 视图房可开工 |
| 3 | MF5b、MF7b | 3 + 6 | — |
| 4 | MF6b、MF8 | 2 + 7 | — |
| 5 | MF10 | 4 | — |
| 6 | MF11 | 5 | 「框架侧完成」 |
| kit | MK0–MK4 | 6 + 6 + 3 + 3 + 6 | `mmo-kit-v1-frozen` |
| 插件 | MG0–MG2 | 3 + 2 + 3 | 两样本 |

## 1. 施工纪律（每一批都适用）

1. **一批 = 一个提交**（提交信息以批次号开头：`MF3-B2：…`），批内 `verify:all` 绿才提交；涉 Redis / MySQL 的批再跑 `test:int`；故障类批把注入点登记进 `scripts/fault-matrix.config.json` 并跑 `test:faults` / `test:faults:int`。
2. **动线**（MMO.md §5.1）：改 shared 真源 → `npm --workspace @game/server run codegen:gameplays` / `codegen:plugins` / `codegen:http`（按改动面）→ `npm run sync:shared` → 改了 `apps/shared/src/protocol/**` 时 `node scripts/protocol-fingerprint.mjs --write` → 改了 `scripts/protected-paths.json` 时 `node scripts/protected-paths-lock.mjs --write` → `npm run sync:client` → `npm run verify:all`。
3. **变异验证**是退出条件的一部分：每批在测试文件头注释或提交信息里写「改哪一行 → 哪条用例转红」，并至少手工执行一次。
4. **夹具纪律**：框架段（MF0–MF11）任何提交 ⛔ 不得出现 `apps/kits/mmo/`、`k_mmo_*`、`mmo` 域名；只用 `worldFixture` / `kitfix` / `kitfixContent` / `aoi-probe`（`tools/world-bench/aoi-probe.ts`）/ `world-bench` 剧本。`kitfix` / `kitfixContent` 只在测试临时根物化（`scripts/lib/fixture-checkout.mjs` 先例），⛔ 不入库。
5. **协议整数**：新增 Lobby RPC 域缺省 ⛔ 不 bump `LOBBY_PROTOCOL_VERSION`（EXTRAS X4 口径）；`GAME_ROOM_PROTOCOL_VERSION` 只在 MMO.md §11.2 人工决策后 bump；`WORLD_ROOM_PROTOCOL_VERSION = 1` 由 MF4 一次定型。任何 bump 写进提交信息。
6. **上游对照**：提交信息写「设计对照：<仓>/<路径>@<commit>」（MMO.md §2.3）；⛔ AzerothCore 代码零行、SQL 零条。
7. **回写**：阶段退出时一行进 MMO.md §12（阶段 / 日期 / commit / 实测数字 / 偏差）；本文 §9 勾批次；MF0 另回写 KIT.md §9 K1 行；MF5a / MF7a 退出时通知 slg.md §10.8 / lvr.md §4.3。
8. **阶段退出打轻量 tag**（`mf3-exit`、`mf5a-exit`…）：给 MMO.md §9.4 的「冻结基线零变」diff 一个可引用的基点；kit 验收打 `mmo-kit-v1-frozen`。

## 2. 框架阶段施工单

### MF0 · KIT K1 前置（波 0，可与 MF1 并行）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF0-B1 客户端 kit-api 路径级导入边界 | 新 `apps/client/test/kitImportBoundary.test.ts`（先例 `apps/client/test/serverImportBan.test.ts`）：解析 `apps/client/src/plugins/<id>/**` 的相对导入到绝对路径，只允许 `apps/client/src/kits/<kit>/api/**`（kit ∈ 该插件 `plugin.json.requires.kits`）、自身目录、框架 plugin-api 门面；反例夹具用临时目录物化 3 个违规文件（深路径 import kit 内部、import 未声明 kit 的 api、import 别的插件） | 3 个反例各一条红用例；arenaShop 现有导入全绿 | `npm run test:client` |
| MF0-B2 shared 侧规则 + `.conn` 禁令 | 扩 `apps/server/test/kit-import-boundary.test.ts`：shared 侧只允许 `@game/shared/kits/<id>/api/<surface>/index` 子路径；`.conn` 禁令用 `typescript` 编译 API 扫 `apps/server/src/kits/**` 与 `apps/server/src/core/<pluginId>/**` 的属性访问 `tx.conn` / 解构 `{ conn }`（⛔ 裸正则）；反例临时物化 | `.conn` 反例红；删 judge 里 `.conn` 分支 → 反例转红（变异） | `npm --workspace @game/server run test` |
| MF0-B3 uninstall 对 pending outbox 的闸 | `apps/server/tools/plugin/uninstall.ts` / `check.ts`：卸载前 `SELECT COUNT(*) FROM gameplay_outbox WHERE status=0 AND kind LIKE 'kit:<id>:%'` > 0 即拒（fail-closed）；`--allow-pending-outbox` 仅 `NODE_ENV !== production`；连不上库即拒并点名；`check` 对 pending > 0 告警 | 新 `plugin-uninstall-outbox.test.ts`：带 pending 拒 / 空放行 / 断库拒；变异：pending 计数改常量 0 → 转红 | `npm --workspace @game/server run plugin -- check`；`test:int/kit-migrations.test.ts` 加一例 |

退出：三批绿 + `plugin -- test arena` / `plugin -- test arenaShop` + `verify:all`；KIT.md §9 K1 行改 ✅（K2 注册表仍未开始）；MMO.md §12 一行。回滚：可回退。

### MF1 · 基准台、AOI 载体实验、冻结数字表（波 0）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF1-B1 `world-bench` 基准台 | ✅ 3da785c7（实际：进程内 `Server` + 真实 WebSocket 传输而非 `@colyseus/testing`，为采样真实出站字节；`scenario.ts` 剧本接口 + `--compare`；两次偏差最大 3.9%）。原计划：新 `apps/server/tools/world-bench/{run.ts,report.ts,scenarios/snake-baseline.ts}`：`@colyseus/testing` 起房 + `@colyseus/sdk` 机器人 N 个（Node 端，`test/smoke.ts` 先例）+ 脚本实体 M 个固定剧本（种子固定）；记录 tick p95 / p99、每会话出站字节、baseline 体积、进程 RSS；输出 `docs/perf/world-bench/<date>-<scenario>.json`；⛔ 不进 `verify:core`（同 `tools/m0/`）。已核：`scripts/verify-perf-baseline.mjs` 只读 `docs/perf/client-ballMove-baseline.json`，不 glob，输出目录安全 | 同剧本两次主要指标偏差 < 10%；种子改一位 → 结果 diff 非空（变异） | `npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --scenario snake-baseline` |
| MF1-B2 AOI 载体实验 | ✅ f1c19cde（实际：`tools/world-bench/aoi-probe.ts` 裸 Colyseus 双房同种子对照，50 观察者 / 300 实体 / 半径 300 / 20 Hz，⛔ 未做 gameplay 夹具、零泄露变异归 MF5a，偏差登记在 MMO.md §12 MF1 行）。原计划：夹具 `aoiProbeFixture`（`apps/shared/schema/gameplays/aoiProbeFixture/{manifest,state}.json` `wireExposed:false` + `apps/shared/src/gameplays/aoiProbeFixture/wire.ts` + `rooms/modes/aoiProbeFixture/`）：变体 A = `client.view` / StateView（服务端 schema 4.0.27；客户端 bundle 4.0.13 含类无 `.d.ts`，实验期本地增补 `.d.ts` ⛔ 不入库），变体 B = 每会话 `sendS2C` 消息级 delta；剧本：100 实体、视野 20 / 80、重连 baseline 重建；比较编码 CPU、字节、重连成本、生成器改动面 | 两变体各有数字；私有字段塞进公共块 → 零泄露断言转红（变异）；结果 `docs/perf/world-bench/aoi-<date>.json` | 同上 `--scenario aoi-a` / `aoi-b` |
| MF1-B3 冻结 | ✅ 见 §9 与 MMO.md §12 MF1 行。内容：引用锁：MMO.md §2.3 每个上游文件写 blob（`<仓>/<路径>@<blob-sha>`）；§7.3 回退窗口表与 §4.5 空实例策略表由「候选」改「冻结」；§11.2 冻结数字表逐行填冻结值（AOI 载体、kill criterion、`maxPlayers`、`emptyAfterMs`、`checkpointMs`、`WORLD_LEASE_TTL_MS`、`ORCH_TICK_BUDGET_MS`、`ORCH_SAY_WORLD_PER_MIN`、`PERSONA_MAX_SLOTS_HARD`、两个协议 bump 决策、`persona` 命名、主体模型口径）；框架待修改路径清单落本文 §7 | §11.2 无「候选」字样；MMO.md §12 登记 MF1 退出 | 文档提交 |

退出：B1–B3 全部（✅ 2026-09-19）；`aoi-probe.ts` 已入库为 world-bench 工具，MF11 决定去留。回滚：可回退。

### MF3 · 共享层抽取（门②，波 1，← MF1）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF3-B1 行为等价快照 | 抽取前先把要保护的行为钉死：核对 `game-room-dispatch` / `game-room-wire-contract` / `protocol-version-matrix` / `snake-room` / `private-room` / `drop-in` / `arena*` / `fault-mutation` 覆盖了 onAuth 六步、dispatcher 固定序、预算、重连 generation fence、S2C token 闸；缺哪条补哪条（只加测试，⛔ 不改 GameRoom）；新增 `rooms-core-import-ban.test.ts`（`apps/server/src/rooms/core/**` ⛔ import `rooms/modes/`、`websocket/`，当前目录已通过） | 新增用例绿；覆盖清单写在测试头注释 | `npm --workspace @game/server run test` |
| MF3-B2 抽取 + 切换（**单提交**） | 新 `rooms/core/RoomAuth.ts`（join options 校验 → 协议整数比对（注入常量）→ mode / modeVersion / profile → 区号复核 → token → session verify）、`rooms/core/WireDispatcher.ts`（预算 → owner → exact validate → rateCost → phase → handler，catch-all `messages["_"]` 不变）、`rooms/core/{MessageBudget,ReconnectGrace,S2CPorts}.ts`；`rooms/GameRoom.ts` 同一提交改为消费者，对局语义留原处；`scripts/protected-paths.json` gameplayFlow 加 `apps/server/src/rooms/core/**`（既有 AccessPolicy / RoomProfile / StartPolicy 随之受保护，关 PLUGIN-REVIEW F03）+ `protected-paths-lock.mjs --write`；Non-intrusive §12.2 散文视图同批 | 可数判据：`GameRoom.ts` 不 import `core/auth/session`；无 `validateC2SPayload(` 调用；`MessageBudget` 只以类型出现；`GAME_ROOM_PROTOCOL_VERSION` 出现 0 次；B1 全部用例零改动绿。变异：owner 闸挪到 exact validate 之后 → snake owner 隔离转红；删版本比对 → version-matrix 转红；删重连 generation 比对 → 迟到重连转红 | `verify:all`；`test:faults` |
| MF3-B3 文档 | SERVER.md §5（GameRoom shell 职责改为「消费 rooms/core」）、`rooms/README.md`、`docs/inventory.json` 的 game-room-runtime 能力 sourceOfTruth 若指向 GameRoom.ts 则加 rooms/core | `verify:inventory` 绿 | 文档提交 |

退出：B2 单提交合入且 B1 用例零改动；tag `mf3-exit`。回滚：**门②**——中止整批 revert B2。

### MF6a · presence / 投递总线 / party / 世界频道（波 1，← MF1）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF6a-B1 presence | `config.NODE_ID`（缺省 `${hostname}:${PORT}`）；`core/presence/{keys,presence.ts}`：`kPresence(uid,sId)`、字段 `lobby/lobbyAt/world/mapId/instanceId/characterId/worldAt`、`PRESENCE_TTL_S=90` / `PRESENCE_HEARTBEAT_S=30`、Lua `PRESENCE_CLEAR_IF_OWNER`（`HGET lobby == NODE_ID` 才 HDEL）、`readPresence / readPresenceMany / isOnline`；LobbyRoom onJoin（`registerOnline` 后、seat 公开前）/ final onLeave 接线 | `presence.test.ts`（假时钟）：onJoin 后 `isOnline` 真；final onLeave 假；节点 b 持新连接时 a 下线不清 `lobby`；90 s 无心跳 ⇒ null。变异：删 owner 比较 → 「顶号跨节点」转红；删 EXPIRE → 「崩溃自愈」转红 | `test`；`test:int/lobby-zone.test.ts` 加一例 |
| MF6a-B2 投递总线 + guild 扇出修复 | `core/push/pushBus.ts`：`K_STREAM_PUSH`（coord）、`publishPush({kind:users\|realm\|guild\|room, sId, uids≤64 自动切片, gid, instanceId, type∈LobbyPushMap, data≤2KB, issuedAt, origin})`、`startPushConsumer`（`startStreamConsumer("push", coordClient, K_STREAM_PUSH, …, {trimMs: PUSH_STREAM_TRIM_MS=10min})`，每节点 `$` 游标、先过 `PUSH_RUNTIME_VALIDATORS[type]`、`issuedAt` > 30 s 丢弃）；`websocket/push.ts`：`realmOnline: Map<sId,Set<uid>>`（与 `guildOnline` 同三处维护）、本地落地 `pushToUsers / pushToRealm / pushToGuild(改走总线) / signalRoom(登记表占位)`、`setPushLocalHandlers`；发布方 ⛔ 不本地直投；`index.ts` 注入 + 启停进 lifecycle | `push-bus.test.ts`：两个消费者各挂假在线表（NODE_ID a / b）：到达 b 在线 uid、不到达同 uid 的 s2 连接；`pushToRealm(s1)` 只到 s1；65 uid 切两条；2049 B 拒；早于 30 s 丢；未知 type 丢；两节点各恰一次；guild 事件经总线到达 b 节点。变异：删 `conn.sId===sId` → 串区转红；删 max-age → 转红；删切片 → 转红；本地直投 → 「恰一次」转红 | `test`；`test:int`（真双消费者末项） |
| MF6a-B3 party | `core/infra/keys.ts`：`kParty/kPartyMembers/kPartyInvites/kPartyEvtSeq/kPartyEvtLog`（per-zone `P()`，hash-tag `{p<pid>}`）、`kPartyIdSeq()`；Lua `PARTY_CREATE/INVITE/ACCEPT/DECLINE/LEAVE/KICK/TRANSFER`（校验 → 变更 → `HINCRBY ver` → 事件 → PEXPIRE 全族 / 最后一人 DEL 全族；队长离开由 ZSET 最早成员接任）；`core/party/`；shared `domains/party.ts`（`create/invite/accept/decline/leave/kick/transferLeader` idempotent-write；`get` query；`getEvents(sinceSeq)`；push `party.event{seq,partyId}` / `party.invited{partyId,by,expAt}`；错误码 7 个）；端点 `websocket/party/*.ts`；向量 `test/lobbyRpcVectors/party.ts`；档字段 `partyId` 经 `withUser`；客户端 `logic/page/PartyLogic.ts` 逐字照 `GuildLogic` | `party.test.ts` + 向量：第 6 人 `PARTY_FULL`；过期邀请；非队长 kick；自动转让；五键全无；跳号全量刷新；同 `clientReqId` 不建第二队；蒸发队伍 `get` 返回 null 并清字段。变异见 MMO.md §6.6 | `codegen:plugins` → `sync:shared` → `protocol-fingerprint --write` → `sync:client` → `verify:all`；`test:int` |
| MF6a-B4 chat（realm / party） | shared `domains/chat.ts`（`chat.send{channel,text}` natural-write，exact keys，1..200，无控制字符；push `chat.message{channel,msgId,from:{uid,name},text,at}`）；`core/chat/{send,policy}.ts`（`setChatPolicy({canSend,transform})` 同 `setKickHandler` 形）；限流 `TOKEN_BUCKET`：`kRl("chat:send:<uid>")` cap 3 / refill 0.5，realm 另加 `kRl("chat:realm:s<sId>")` cap 100 / refill 30，桶失败 `CHAT_UNAVAILABLE`；端点 `websocket/chat/send.ts`；向量；客户端最小 `ChatLogic` | `chat.test.ts`：非成员发 party 频道 `CHAT_CHANNEL_FORBIDDEN`；跨区同上；请求含 `from` → `INVALID_PAYLOAD`；第 4 条连发 `RATE_LIMITED`；桶失败 `CHAT_UNAVAILABLE`；接收方 `from.uid` = 发送者；发送者收到回显 | 同 B3 动线 |
| MF6a-B5 第二消费方 | `ServerNotice`：新 HTTP 端点 `POST /admin/notice`（shared `protocol/http.ts` 契约表 + `http/admin/notice.ts` + `codegen:http`）走 `pushToRealm`；snake 私房整队入座：客户端队长 `room.prepareCreate` 后发 `party.event{kind:roomInvite,data:{code}}`（走 party 域的通用事件，⛔ 不加新 RPC），成员 `room.resolve`（可作为 MF6a 退出后的独立小批） | `/admin/notice` 到达两节点同区在线；snake 整队用例（客户端无头） | `codegen:http`；`verify:all` |

退出：B1–B4 必须，B5 的 `ServerNotice` 必须（消费方先于升格），snake 整队可后置；`LOBBY_PROTOCOL_VERSION` 不 bump（提交信息注明）；tag `mf6a-exit`；回写 §12 + lvr.md §4.2 可用推送面。回滚：可回退（键带 TTL；流按 MINID 裁）。

### MF7a · kit worker：`workers[]` + 租约守卫受限 KitTx（波 1，← MF0）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF7a-B1 schema 增量字段 | `apps/server/tools/plugin/kit-schema-v1.json` 加可选 `workers[]: {id, entry}` 与 `sql.tables[].role: "world-event"`（⛔ 不 bump schemaVersion；K0-2 `requires` 先例）；`kits/catalogTypes.ts` + `catalog.generated.ts` 渲染两字段；`tools/plugin/{manifest,lock}.ts` 锁抬头 / 身份摘要纳入；`role` 表形状机检进 `tools/kit-migrations.ts` `verifyKitTableShapes`（必备列 `event_id/instance_id/seq/kind/payload/status/attempts/checkpoint_rev`） | `plugin-lock.test.ts` / `kit-migrations.test.ts` 加例：带 workers 的 kit 锁抬头含 workers；role 表缺列 fail-closed | `codegen:plugins`；`test` |
| MF7a-B2 bootstrap 预置租约行 | `tools/db-bootstrap.ts`：按 catalog 对每个 `kit.json.workers[]` `INSERT … ON DUPLICATE KEY UPDATE lease_name=lease_name` 预置 `singleton_lease('kit:<id>:<worker>')` | `db-bootstrap.test.ts`：两遍 bootstrap 零新行；删 kit 后行保留并 `check` 告警 | `db:bootstrap`；`test:int/kit-migrations.test.ts` |
| MF7a-B3 `withKitWorkerTx` | `core/infra/kitApi.ts` 新 `withKitWorkerTx(kitId, workerId, sId, lease, fn)`：`withRcTx` 内**首句** `renewLeaseGuard(conn, lease)`（既有 `core/infra/lease.ts`，`UPDATE singleton_lease … WHERE lease_name=? AND holder=? AND fence_token=?`）返回 false ⇒ 抛 `LeaseLostError` 自动 ROLLBACK；再构造受限 `KitTx`（同 `withKitTx`，表闸 + `.conn` 由 K1 机检禁）；回调另开事务 / 取原始连接被拒 | `kit-worker-tx.test.ts`（假 pool）：失租首句 0 行 ⇒ 整体回滚；越表拒；变异：删 `fence_token=?` → 「失租写成功」转红 | `test` |
| MF7a-B4 worker 进程入口 | 新 `apps/server/src/workers/kitWorker.ts`：`npm --workspace @game/server run worker -- <kit>:<worker>`（`package.json` 加 `worker` 脚本；`isMain` 守卫同 relayer）；按 catalog 找 `workers[].entry`（动态 import，entry 默认导出 `defineKitWorker({ pass(tx, ctx) })`）；`tryAcquireLease` 争租 / 续租 / 串行 pass / 有界批次 / 失租 `process.exit(1)`；SIGTERM 停；未登记即拒 | `kit-workers.test.ts`：未登记拒；登记的 kitfix worker 跑一轮 pass；变异：跳过登记检查 → 转红 | `test` |
| MF7a-B5 uninstall / check 闸 | `tools/plugin/uninstall.ts`：`role:"world-event"` 表 `status=0` > 0 或该 kit 的 worker 租约 `expires_at > NOW()` 且 holder 非空 → 拒；`check` 告警 | 用例：带 pending 行拒、持有中拒、空放行；变异：忽略 pending 计数 → 转红 | `plugin -- check` |
| MF7a-B6 争租夹具 + 文档 | `kitfix` 临时根加 `workers:[{id:"tick",entry:…}]` + 普通 `k_kitfix_*` 表；`test:int/kit-worker-lease.test.ts`：同进程两个 worker 实例争租只一个能写；注入旧持有者暂停 / 恢复、事务前后失租 → 写被拒；提交丢响应可重放；停止 / 卸载后不再提交；KIT.md §4 / §5 加 workers 与 `withKitWorkerTx`；SERVER.md §13 登记点加 `workers[]` | int 用例全绿 | `test:int` |

退出：B1–B6；tag `mf7a-exit`；回写 §12 并通知 slg.md §0.1 / lvr.md §4.3（无人在线结算可开工）。回滚：可回退（先排空 pending）。

### MF9 · 贡献点 / fragment / 带参 launch（波 1，← MF1；MF11 前必须完成）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF9-B1 schema 增量字段 | kit-schema：`contributions: {<id>: {kind:"data"\|"module", end(s), export\|schema}}`、`fragments:[<name>]`；plugin-schema v2：`contributes:{<kitId>:{<id>:<路径>}}`、`launch.payload`、`launch.profile`（EXTRAS X1）；⛔ 不 bump 两个 schemaVersion；锁抬头 / 身份摘要纳入 | schema 用例；`plugin-lock.test.ts` 加例 | `test` |
| MF9-B2 codegen + 三道闸 | `tools/plugin-codegen/lib.ts` 生成 `apps/{server,client,shared}/src/kits/<kitId>/contributions.generated.ts`（module = 静态字面量 import；data = 校验后同源生成两端）；`contributes` 路径 ⊆ 插件所有权集（`ownership.ts` 推导集）否则拒；`install` 正向闸（kit 已装且 id 存在）；kit `install --reinstall-from-tree` 反向闸（删 id 点名插件）；`protected-paths.json` `generatedWriterOwned` 加 contributions.generated + lock | `plugin-codegen.test.ts` 加例：夹具插件只新增一个文件即被收录；越界贡献 pack 拒；反向闸点名；变异：跳过所有权检查 → 越界被拒转红 | `codegen:plugins`；`protected-paths-lock.mjs --write` |
| MF9-B3 kit fragment | `tools/gameplay-codegen/lib.ts`：`apps/kits/<id>/fragments/<name>.state.json`，mode manifest `fragments:["<kit>:<name>"]` 合并（泛化既有 ownerReady / inviteRoom 片段机制） | `gameplay-codegen.test.ts` 加例：合并后 state 生成物各恰一次；变异：跳过合并 → 转红 | `codegen:gameplays` |
| MF9-B4 带参 launch | `apps/client/src/app/AppRuntime.ts`（受保护，提交信息标「显式框架侵入」）`LaunchPort.launch(target)` 透传 `payload` / `profile`；`gameplay/services.ts` → `GameplayModule.validateLaunch(payload)` exact 校验；未知字段拒 | `apps/client/test/launch*.test.ts`：未知 launch 字段被拒；变异：放行未知键 → 转红 | `test:client` |
| MF9-B5 夹具 + 文档 | `kitfix.contributions.content` + `kitfixContent.contributes.kitfix.content`（临时根）；PLUGIN.md §5 / KIT.md §3–§4 加贡献点、fragment、launch 三段 | 夹具用例绿；`verify:inventory` | `verify:all` |

退出：B1–B5；tag `mf9-exit`。回滚：可回退。

### MF2 · persona 与资产主体（门①，波 1，← MF1；只需先于 MF4）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF2-B1 shared 身份类型 | 新 `apps/shared/src/protocol/identity.ts`：`AssetOwnerRef = {kind:"account",uid}\|{kind:"persona",personaId}`、`PersonaRef`、零依赖校验器；`constants/errors.ts` 加 `PersonaSlotTaken` / `PersonaNotFound` / `ControlConflict`（ControlConflict 供 MF4） | shared 单测；指纹重钉 | `sync:shared`；`protocol-fingerprint --write` |
| MF2-B2 schema 迁移 | `schema.sql`：新表 `persona`（per-zone：`(server_id,persona_id) PK`、`user_id`、`kit_id`、`slot`、`status`、`control_epoch`、`world_address NULL`、`session_generation`、时间戳；`UNIQUE(server_id,user_id,kit_id,slot)`）；`user_currency` PK → `(user_id,server_id,owner_kind,owner_id,currency)`；`currency_ledger.uk_idem` 与 `gameplay_outbox` 加 `owner_kind TINYINT DEFAULT 0` / `owner_id VARCHAR(64) DEFAULT ''`；`tools/db-bootstrap.ts` TS 迁移步（INFORMATION_SCHEMA 守卫先例，`singleton_lease('db_bootstrap')` 下一次性完成，已迁即跳过）；`zoneTables.ts` `FRAMEWORK_PER_ZONE_TABLES += persona`；`schema.sql` 字节锁随 `protected-paths-lock.mjs --write` 更新 | `db-bootstrap.test.ts`：空库一次到位、旧形态库迁移一次、两遍零变；`test:int/perzone.test.ts` 加 persona 行 | `db:bootstrap`；`test:int` |
| MF2-B3 经济主体化 | `core/economy/{currency,outbox,relayer}.ts`：`debitInTx / creditInTx` 加 `owner`（缺省 account）；intent 带 owner；relayer 对 persona 主体只落账本；`core/infra/keys.ts` `kCacheCurrency` 带 owner scope | `economy.test.ts` / `effect-atomic.test.ts` / `relayer.test.ts` 回归绿；新例：两 persona 同 uid 余额互不可见；旧路径写出的 ledger 行 `owner_kind=0` | `test`；`test:int/economy.test.ts` |
| MF2-B4 KitTx 主体化 + persona 门面 | `core/infra/kitApi.ts`：`KitTx.debit/credit` 可选 `owner`；`tx.assertControl(personaId, controlEpoch)`（`UPDATE persona … WHERE control_epoch=?` Rows matched）；`tx.createPersona(kitId, slot, meta) → personaId`（UNIQUE 冲突 `PersonaSlotTaken`；`slot ≥ PERSONA_MAX_SLOTS_HARD` 拒）；`tx.deletePersona(personaId)`（仅 `status=inactive` 且 `world_address IS NULL`）；事务外只读 `listPersonas(uid,sId,kitId)`；表闸对三门面豁免（kit 直接 SQL 碰 `persona` 仍拒）；固定锁序：account uid → persona id 升序 | `kit-api.test.ts` 加例：同一 `withKitTx` 内 `createPersona` + kitfix 角色行，任一失败整体回滚；超硬上限拒；孤儿 persona 对账 + `deletePersona`；旧 epoch `assertControl` 0 行；变异：删 `control_epoch=?` → 转红；忽略 UNIQUE 冲突 → 「同槽二建」转红；交换锁序 → 死锁用例转红 | `test` |
| MF2-B5 会话撤销覆盖 persona | `core/auth/{session,kickBus}.ts`：撤销 / 踢下线抬高该 uid 全部 persona 的 `session_generation` | `auth-token-contract.test.ts` 加例 | `test` |
| MF2-B6 回归 + 门① 手册 | shop / mail / redeem / arena / arenaShop / snake 全回归；`archive.test.ts` 证明 freeze / thaw 不碰 persona 表；写 `apps/server/tools/README`（或 SERVER.md §8）「门①发布 SOP：发布前 drain 全部 pending outbox（`relayer` 跑空 + `outboxStats.pending=0`）→ bootstrap 迁移 → 上线；回退需再迁一次」 | 全绿；SOP 落文档 | `verify:all`；`test:int` |

退出：B1–B6；tag `mf2-exit`。回滚：**门①**——按 SOP。

### MF5a · 观察者同步·GameRoom / SQL 视图房路径 + D4 名册分离（波 2，← MF1 + MF3）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF5a-B1 perSession wire 声明 | `apps/shared/src/gameplays/defineGameplayWire.ts` `defineS2C(type, validate, { perSession?: true, coalesceKey?: string })`（今只两参）；`tools/gameplay-codegen/{wireParser,lib}.ts` 解析并渲染 `GAME_WIRE_PER_SESSION` 进 `wire-catalog.generated.ts`；既有 token 无选项 ⇒ 生成物字节不变 | `gameplay-codegen.test.ts` 加例；生成物 diff 为空 | `codegen:gameplays`；`sync:shared` |
| MF5a-B2 四件原语 | `rooms/core/InterestSet.ts`（会话 → 实体集合 + 版本）、`ObserverSync.ts`（`diffAndEmit(session, prev, next)` → enter / update / leave 同 tick 有序、单 seq）、`Baseline.ts`（自 `modes/snake/index.ts` 的 baselineId / Begin-Chunk-End / checksum / cursor 泛化，token 由 mode 注入，只含兴趣集）、`OutboundQueue.ts`（每会话有界；按 key 合并（位置）与不可丢（回执）两类；超限 → 重同步标记） | `observer-sync.test.ts`：跨格 enter / leave 各一次且顺序正确；`outbound-queue.test.ts`：合并、不可丢、超限重同步；变异：删 leave 分支 → 转红；删上界 → 转红 | `test` |
| MF5a-B3 S2CPorts fail-closed | `rooms/core/S2CPorts.ts`：`broadcastS2C` 对 `GAME_WIRE_PER_SESSION` 中的 token 启动期断言 + 发送期拒 | 用例：perSession 广播被拒；变异：删闸 → 转红 | `test` |
| MF5a-B4 `roster` 开关（M07） | `tools/gameplay-codegen/{manifestSchema.ts,gameplay-schema-v1.json}` manifest 可选 `roster:"public"\|"hidden"`（缺省 public）；`stateRenderer.ts` `ROOT_LIFECYCLE_FIELDS` 的 `players` 项按 roster 条件化；客户端 stateRenderer 对应端；重生成 `rooms/schema/GameRoomState.ts` 等生成物；`rooms/GameRoom.ts` 内部名册改读 RoomAuth 产出的会话 / seat 表，⛔ 不再依赖 Schema `players` | `roster-hidden.test.ts`：hidden 根无 `players`；既有 mode 生成物字节不变（对 catalog 全量 `--check`）；变异：hidden 仍渲染 players → 转红 | `codegen:gameplays`；`verify:sync` |
| MF5a-B5 GameRoom / GameMode 消费路径 + SQL 视图房夹具 | `GameMode` context 新端口：`interest(session)`、`emitPerSession(session, token, payload)`、`requestBaseline(session)`；`GameRoom` 接 ObserverSync / OutboundQueue（每 tick 排空）；客户端 `net/rooms/GameRoomTransport.ts` reconcile 端口（enter / update / leave / baseline）；夹具：kitfix 临时根加 `k_kitfix_view` 表 + fixture mode `viewFixture`（`roster:"hidden"`，dropIn，带一个「私有字段」），两间 dropIn GameRoom 各自从 SQL 恢复投影与兴趣集 | `visibility-leak.test.ts`：超视距两会话互不收到；重连 baseline 只含兴趣集且 checksum 通过；私有字段对他人零泄露；慢会话超限重同步且回执不丢；满员第二房、断线 baseline、空房销毁重建；变异：私有字段塞进 enter → 转红 | `test`；`test:int`（两房 + SQL 夹具） |
| MF5a-B6 基准 + 文档 + 回写 | `world-bench` 场景「视野缩小 → 每会话字节下降」；SERVER.md §5 加观察者同步端口；`protected-paths` 已覆盖 rooms/core；MMO.md §12 登记「MF5a 退出 = slg 2b 开工条件」，通知 slg.md §10.8 | 基准数字入 `docs/perf/world-bench/` | 文档提交 |

退出：B1–B6；`GAME_ROOM_PROTOCOL_VERSION` 按 §11.2 决策（缺省不 bump，提交信息注明）；tag `mf5a-exit`。回滚：可回退。

### MF4 · WorldRoom / WorldRuntime / 权威租约 / 控制权（门③，波 2，← MF2 + MF3）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF4-B1 shared 世界协议（一次定型） | `protocol/rooms.ts`：`RoomName.World`、`IWorldRoomJoinOptions {v, token, sId, mode, modeVersion, mapId, line?, personaId, ticket, resumeSeq?}` + validator、`WORLD_ROOM_PROTOCOL_VERSION = 1`、`WorldPhase`；`constants/errors.ts` 加 `WorldNotAuthoritative / WorldTicketInvalid / WorldDraining`（`ControlConflict` 已在 MF2-B1）；`protocol-version-matrix.test.ts` 加 World 行 | 版本矩阵绿；指纹重钉 | `sync:shared`；`protocol-fingerprint --write` |
| MF4-B2 codegen world 形态 | manifest 可选 `kind:"match"\|"world"`（缺省 match）、`world:{emptyPolicy, emptyAfterMs, checkpointMs}`；world 根必填集 `{tick, phase:WorldPhase, instanceId, mapId, line, authorityEpoch}`，`kind:"world"` ⇒ `roster` 恒 hidden（复用 MF5a-B4 开关；若本批先落地则开关在此实现、MF5a 复用）；生成 `WORLD_MODE_IDS`；`modes/catalog.generated.ts` 分出 `worldModeRegistry` | `gameplay-codegen.test.ts`：world 根加 `players` → 反例红；缺必填集红 | `codegen:gameplays` |
| MF4-B3 MySQL 侧：`world_instance` + 控制权 | `schema.sql` 新表 `world_instance`（per-zone：`(server_id,instance_id) PK`、`map_id`、`line`、`authority_epoch`、`holder`、`state`、`checkpoint_rev`、**`write_seq`**（施工细化，供 MF7b 首句 CAS，避免二次迁移）、`updated_at`；`UNIQUE(server_id,map_id,line)`）+ `zoneTables.ts`；`rooms/core/control.ts`：`acquireAuthority(instance) → epoch`（CAS `authority_epoch+1`）、`acquireControl(persona, worldAddress) → controlEpoch`、`releaseControl`、`assertControl` | `test:int/world-control.test.ts`：同 persona 两处 join 只一个控制权；变异：删 CAS 谓词 → 双登转红 | `db:bootstrap`；`test:int` |
| MF4-B4 Redis 权威租约 | `rooms/core/WorldLease.ts` + `core/infra/{keys,redisScripts,config}.ts`：`kWorldFence(sId,instanceId)` INCR 发号、`kWorldLease` `SET NX PX WORLD_LEASE_TTL_MS`、续租 `CAS_RENEW` Lua、加载期断言 `renew*3 ≤ ttl`；丢租回调 | `test:int/world-lease.test.ts`：丢租 → Draining；同实例两房争抢只一个 Active；变异：续租永不过期 → 转红 | `test:int` |
| MF4-B5 契约 + 无头运行时 | `rooms/WorldMode.ts`（§4.5 十个钩子，⛔ 不继承 GameMode）；`rooms/core/WorldRuntime.ts`（注入时钟；固定步累积 + catch-up 上限自 `GameRoom.stepFixed / update` 抽出；命令队列；`Recovering → Active → Draining → Offline` 状态机；⛔ 不 import `colyseus`） | `world-runtime.test.ts`（假时钟、catch-up、Draining 拒新命令）；`rooms-core-headless-import.test.ts`；变异：加 `import "colyseus"` → 转红 | `test` |
| MF4-B6 传输壳 + profile + 目录 + 登记 | `rooms/WorldRoom.ts`（`autoDispose=false`；onAuth → RoomAuth 比 `WORLD_ROOM_PROTOCOL_VERSION`；准入：ticket 占位 → 控制 CAS → `onAdmit`；会话表；喂 C2S / 按 tick 排空；丢租 → Draining；空实例三策略）；`rooms/core/WorldProfile.ts`（profile `"world"`：AccessPolicy `world-ticket`，无 StartPolicy；`assertRoomProfilesConfigured` 跳过 `kind:"world"`；与 evidence / invite-code 互斥）；`rooms/core/WorldDirectory.ts`（`(sId,mapId,line) → instance`，v1 进程内 + MySQL 行）；登记在 `world.config.ts`（PS4 占位入口，D27）：`[RoomName.World]: defineRoom(WorldRoom).filterBy([...])`；合体入口 `index.ts` 合并时带上 | `world-room.test.ts`、`world-empty-policy.test.ts`（三策略各一例）；变异：`emptyAfterMs` 被忽略 → unload 转红 | `test` |
| MF4-B7 客户端世界传输 | 新 `apps/client/src/net/rooms/WorldRoomTransport.ts`；`matchmaking.ts` strategy `{kind:"world", mapId, line?}`；`RoomClient.ts` / `GameRoomTransport.ts` 零改动 | `apps/client/test/worldRoomTransport.test.ts` | `test:client` |
| MF4-B8 worldFixture | `apps/shared/schema/gameplays/worldFixture/{manifest(kind:"world", profiles:["world"], wireExposed:false),state}.json` + `apps/shared/src/gameplays/worldFixture/wire.ts`（`c2s.worldFixture.move {dirX,dirY,seq}`）+ `rooms/modes/worldFixture/` + `apps/client/src/gameplay/modes/worldFixture/`；两类实体（移动体 / 静态体） | 干净树只新增文件即建房 / 准入 / 推进 / Draining；`WORLD_ROOM_PROTOCOL_VERSION=1` 进矩阵；`GAME_ROOM_PROTOCOL_VERSION` / `LOBBY_PROTOCOL_VERSION` 不变 | `verify:all`；`test:int` |

退出：B1–B8；tag `mf4-exit`。回滚：**门③**——首个客户端发版前可 revert；`world_instance` 回退需清空。

### MF5b · 观察者同步·WorldRoom 接入（波 3，← MF4 + MF5a）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF5b-B1 WorldRoom 出站 | `rooms/WorldRoom.ts` 每 tick 排空 OutboundQueue；重连 / 兴趣集突变触发 Baseline | `world-visibility-leak.test.ts` | `test` |
| MF5b-B2 客户端 reconcile | `WorldRoomTransport.ts` enter / update / leave 与 baseline reconcile 端口 | 客户端无头单测 | `test:client` |
| MF5b-B3 夹具 + 矩阵重跑 | worldFixture wire 加 `s2c.worldFixture.{enter,update,leave,private,baselineBegin,baselineChunk,baselineEnd}`（perSession）+ 私有字段；MF5a 矩阵在 worldFixture 上逐项重跑 | 矩阵全绿；⚠ 不作 slg 2b 证据 | `verify:all` |

退出：tag `mf5b-exit`。回滚：可回退。

### MF6b · 附近聊天（波 4，← MF5b）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF6b-B1 core 世界 token | `apps/shared/src/protocol/messages.ts`（core 表，受保护）加 `c2s.world.chat`（rateCost 2）/ `s2c.world.chat`（perSession）+ `test/wire-vectors/core.ts` 向量；`WorldMode.primaryEntityOf`；WorldRoom：收到 → `chatPolicy`（复用 MF6a-B4）→ 对兴趣集含 `primaryEntityOf(sender)` 的会话 `sendS2C`（含发送者），载荷 `{fromEntityId, text, at}` | 视距外不收；视距内含发送者各收一次；`broadcastS2C(s2c.world.chat)` 被拒；变异：删兴趣集过滤 → 转红 | `codegen:gameplays`；`protocol-fingerprint --write` |
| MF6b-B2 夹具 + 文档 | worldFixture 用例 + SERVER.md §5 | 绿 | `verify:all` |

### MF7b · 检查点 / 世界事件 outbox（波 3，← MF4 + MF7a）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF7b-B1 CheckpointPort | `rooms/core/CheckpointPort.ts`：`savePersona / loadPersona / saveInstance / loadInstance`；信封 `{rev, eventOffset, authorityEpoch, controlEpoch?, schemaVersion, stateHash, snapshot}`；快照内容由 kit 定义，框架只校验信封与版本（不兼容 fail-closed） | `world-checkpoint.test.ts` | `test` |
| MF7b-B2 WorldTx | `rooms/core/WorldTx.ts`：`withWorldTx(kitId, sId, {instanceId, authorityEpoch, personas?}, fn)`：RC 事务首句 `UPDATE world_instance SET write_seq = write_seq + 1 WHERE instance_id=? AND authority_epoch=?`（0 行 `AuthorityLostError` ROLLBACK；⛔ 不碰 `checkpoint_rev`），再逐 persona `assertControl`；暴露 KitTx 门面 + `appendWorldEvent` | 旧 owner 迟到写 0 行；变异：删首句 CAS → 转红 | `test:int` |
| MF7b-B3 WorldEventPort + 原子规则 | `rooms/core/WorldEventPort.ts`：事件表形态固定（`role:"world-event"` 表）；行带 `checkpoint_rev`（= 下一个将落盘的分线检查点 rev）；worker 只执行 `checkpoint_rev ≤` 已落库最大 rev 的行；Recovering 把 `status=0 AND checkpoint_rev >` 恢复点 rev 标 `superseded(3)`（或改选「事件批随检查点同事务落库」，二选一写进提交信息）；至少一次 + 回执去重；死信同 outbox；kitfix 的 MF7a worker 消费 `k_kitfix_world_event` | `world-event-dedup.test.ts`：含「事件已落库、检查点未落」窗口崩溃 → 恢复后 superseded + 重放只发一次；变异：忽略 `checkpoint_rev` 门 → 双发转红 | `test`；`test:int` |
| MF7b-B4 周期与强制点 | `WorldRuntime.ts` / `WorldRoom.ts`：`onCheckpoint`（manifest `checkpointMs`）+ 强制点（drain / leave / 交接 / `checkpointOnDeath` / `setVar durable` 入口）；Recovering 顺序按 §4.5 | 用例 | `test` |
| MF7b-B5 夹具 | kitfix 临时根加 `k_kitfix_checkpoint`、`k_kitfix_world_event`（role 声明）；worldFixture 实现 `CheckpointPort` 走 kitfix 表 | `test:int/world-crash-restart.test.ts`：同进程两房 A / B，硬杀 A（停续租 + 跳过 drain），A′ 从检查点恢复；位置回退 ≤ 1 周期、货币 0 回退、A 迟到 `withWorldTx` 0 行 | `test:int` |
| MF7b-B6 回退窗口逐行用例 + 文档 | §7.3 表每行一条用例（含「脚本 durable 命令」）；`world_transfer` 在途闸留给 MF8-B7（表在 MF8 才有，施工细化）；SERVER.md §8 加 world 事件 outbox 口径 | 全绿 | `verify:all` |

退出：tag `mf7b-exit`。回滚：可回退（先排空 pending 事件）。

### MF8 · 交接与一次性凭据（波 4，← MF6a + MF7b）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF8-B1 表 | `schema.sql` 新表 `world_transfer`（per-zone；列见 MMO.md MF8；`UNIQUE(server_id, persona_id, active_key)` 终态置 NULL）+ `zoneTables.ts` | bootstrap 两遍零变 | `db:bootstrap` |
| MF8-B2 状态机 + 凭据 | `rooms/core/transfer.ts`（每步持久 CAS；`transferId` 幂等重放同一结果；Committed 前可取消并释放预留；超时查持久状态）；`rooms/core/WorldTicket.ts` + `keys.ts`（复用 `kRoomTicket` 形态：一次性、短时、绑定 `(uid, personaId, worldAddress, controlEpoch)`，claim 为 Lua CAS） | `world-ticket.test.ts`：二次使用被拒；`world-transfer.test.ts` 状态机 | `test` |
| MF8-B3 准入固定时序 | `rooms/WorldRoom.ts`：同步公共拒绝 → 同步占位 → 异步 claim → 同步重验 → `acquireControl` → `onAdmit`（SERVER.md §5 邀请码同形）；源房 Committed 后冻结该 persona 意图并回收实体 | 用例 | `test` |
| MF8-B4 框架域 `world` | shared `domains/world.ts`：`world.enter {personaId, mapId} → {worldAddress, endpoint, ticket}`（D27）、`world.resolveTransfer {transferId} → {worldAddress, endpoint, ticket}`；端点 `websocket/world/`；向量；codegen + 指纹 | 向量测试；`LOBBY_PROTOCOL_VERSION` 不 bump | 动线 |
| MF8-B5 客户端 | `matchmaking.ts` strategy `{kind:"transfer", roomId?, ticket}`；`WorldRoomTransport.ts`：退源房 → 带凭据 join → 收 baseline → 恢复输入 | 客户端单测 | `test:client` |
| MF8-B6 跨房唤醒 | MF6a-B2 的 `signalRoom(instanceId)` 从占位改真：`K_STREAM_PUSH kind=room` → 本进程 WorldRoom 登记表 → `onSignal`（best-effort，权威仍是表） | 用例 | `test` |
| MF8-B7 夹具 + 故障矩阵 + 卸载闸 | worldFixture 两实例（map A / B）+ `c2s.worldFixture.portal`；注入点 `transfer-source-crash / -target-crash / -reply-lost / -client-drop` 进 `scripts/fault-matrix.config.json`；`test:int/world-transfer.test.ts`；`tools/plugin/uninstall.ts` 加「`world_transfer` 有该 kit 在途行 → 拒」 | 四注入下只激活一次、只扣一次费；预留到期释放；重连凭 `transferId` 解析目标；变异见 MMO.md MF8 | `test:faults:int`；`test:int` |

退出：tag `mf8-exit`。回滚：需数据清理——收敛全部在途 transfer。

### MF10 · 容量 / 多进程 / 运维（波 5，← MF4–MF8）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF10-B1 分线分配 | `WorldDirectory.ts`：`(sId,mapId)` 满员开新 `line`；指定 `line`；`WORLD_MAX_LINES_PER_MAP` | 上限用例；变异：忽略上限 → 转红 | `test` |
| MF10-B2 多进程启用路径 | `WORLD_MULTI_PROCESS=1` 启用 RedisDriver / Presence（只在多个 world 进程之间需要，D27）；`REDIS_COLYSEUS_URL` 必须 ≠ durable / coord（加载期断言）；`selectProcessIdToCreateRoom` 放置钩子（`@colyseus/core` `Server.d.ts:35` 已确认存在） | 断言红 / 绿用例 | `test` |
| MF10-B3 运维只读面 | 非生产挂载 HTTP：世界房 / 分线 / 在途交接 / 事件积压（shared `protocol/http.ts` 契约表 + `http/admin/world*.ts` + `codegen:http`） | 读出积压 | `codegen:http` |
| MF10-B4 多进程实验报告 | `tools/world-bench/multi-process.ts`（`colyseus-redis-probe.ts` 形态）：节点退出 → 租约过期 → 新节点 Recovering 接管；输出报告到 `docs/perf/world-bench/`（⛔ 非首版闸） | 报告存在并登记偏差 | `exec tsx -- tools/world-bench/multi-process.ts` |

退出：tag `mf10-exit`。回滚：可回退；生产启用为部署门。

### MF11 · 收口审阅与冻结（波 6，← MF0–MF10）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| MF11-B1 三视角对抗审阅 | 接缝 / 数据 / 负载三视角，记录 `docs/MMO-REVIEW-2.md`（同 MMO-REVIEW 形态），发现逐条消化进代码或 MMO.md | 发现清零 | — |
| MF11-B2 真相对齐 | `protocol-fingerprint --write` 重钉；`docs/inventory.json`（新入口 / 能力：world-room-runtime、kit-worker）；OVERVIEW / SERVER / CLIENT / KIT / PLUGIN；`protected-paths.json` 与 Non-intrusive §11.3 / §12.2 散文视图同批 | `verify:inventory`、`verify:protected-paths` 绿 | `verify:all` |
| MF11-B3 夹具处置 | `aoi-probe.ts` 去留（已是 `world-bench` 工具，无 gameplay 生成物；`aoiProbeFixture` 从未入库） | README 与 MMO.md §5.5 一致 | — |
| MF11-B4 「框架侧完成」矩阵 | `scripts/lib/fixture-checkout.mjs` 先例：临时根记录保护文件 hash → 加入 worldFixture + kitfix + kitfixContent → 先证全部 `--check` 红 → writer / sync → 全绿 → 分类器断言人工文件只出现夹具自有 `A`、既有 `M` 只命中 provenance 白名单 → 第二次 writer 字节不变；变异：向 `GameRoom.ts` 注入一行手改 → 分类器转红 | 矩阵脚本入 `test:int` 末项或独立 `verify:mmo-fixture-matrix` | — |
| MF11-B5 登记 | MMO.md §12 逐段登记；tag `mmo-framework-v1` | — | — |

退出：B1–B5 全部（✅ 2026-09-20）；矩阵落为独立命令 `npm run verify:mmo-fixture-matrix`（⛔ 进 test:int / verify:core：一次性检出 + 两端 typecheck 约 4 分钟），发现登记 MMO.md §12 MF11 偏差 ①–⑪。回滚：可回退。

## 3. `mmo` kit 施工单（MK0–MK4）

前置以 MMO.md §7.6 表为唯一口径。kit 段动线 = KIT.md §5 + PLUGIN.md §5：`plugin -- pack mmo` → 干净树 `plugin -- install mmo.zip` → `codegen:plugins` / `codegen:gameplays` → `db:bootstrap`（两遍，第二遍零 DDL）→ `plugin -- check` → `plugin -- test mmo` → `verify:all`。

| 批次 | 内容 | 验收 |
| --- | --- | --- |
| MK0-B1 骨架 | `apps/kits/mmo/{kit.json（MMO.md §7.1 草案 + ⭐ role / workers 字段）,README.md,sql/001-characters.sql,002-items.sql,003-world.sql}`；`gameplays/mmoWorld/{manifest(kind:"world", roster hidden 隐含),state}.json`；`scripts/packages/mmo.lock` 经 pack → install 产生 | `plugin -- check` ✔；`db:bootstrap` 两遍 |
| MK0-B2 shared 三面 | `apps/shared/src/kits/mmo/api/{characters,world,content}/index.ts` 类型 + 零依赖 validator；`apps/shared/src/gameplays/mmoWorld/wire.ts`（§7.4 全部 token，perSession 由 `defineS2C(..., {perSession:true})`）；`domains/{mmo,mmoSocial,mmoAdmin}.ts` | `codegen:gameplays` / `codegen:plugins` 绿；指纹重钉 |
| MK0-B3 server 三面 + WorldMode | `apps/server/src/kits/mmo/{world,content,persistence}/**`、`api/{characters,world,content}/index.ts`（`createCharacter` 走 MF2 persona 门面同事务）、`rooms/modes/mmoWorld/index.ts` 实现 `WorldMode`（灰盒：出生点、一怪、常量速度积分）、`websocket/{mmo,mmoSocial,mmoAdmin}/`、`workers/worldEvents.ts`（MF7a 入口） | `plugin -- test mmo`：建角、进图、走路、看到怪（无头） |
| MK0-B4 client | `apps/client/src/kits/mmo/{index.ts,api/**,logic/**,view/MmoCharacterSelectView}`；mode 四件 `gameplay/modes/mmoWorld/`、`net/rooms/MmoWorldRoom.ts`、`logic/rooms/mmoWorld/`、`view/rooms/mmoWorld/MmoWorldView`（最小 HUD；世界视图按 3d.md SD9 = C：2D 公告板 + `WorldPresentation` 适配器；骨架 ⛔ 不等 3D 轨道，FGUI HUD 与世界的输入归属等 3d.md SC1-B9 或退路 = HUD 画在世界节点内） | `test:client`；Creator 预览证据一次 |
| MK0-B5 灰盒内容包 | `apps/kits/mmo/content/greybox/*.json`（一图一怪一技能）内置 import（MK4 改经贡献点） | content validator 绿 |
| MK0-B6 验收链 | 干净树全链闭环；`world-bench` 场景 A 首次数字 | 记录进 MMO.md §12 |
| MK1-B1 movement 面 | `integrate / clampToMap` 双端同源纯函数；权威积分器 + `collision` 网格候选；客户端摇杆 → dir 意图、点地 → target、本地预测 + 按 seq 和解 | 无头回放一致 |
| MK1-B2 AOI 接入 | kit 网格 → InterestSet 候选；可见性规则（隐身 / 阵营 / 位面）经 MF5 授权回调 | 超视野零泄露 |
| MK1-B3 两图交接 | portal → `c2s.mmoWorld.transfer` → 框架 MF8 状态机；`s2c.mmoWorld.transferReady` | 故障矩阵四注入 |
| MK1-B4 检查点 | `CheckpointPort` 实现：角色快照（位置 / HP / MP / 冷却 / mapId）与分线快照（creatures / loot / script_vars / timers / regions）；`k_mmo_*_checkpoint` | 杀房重启回退窗口达标 |
| MK1-B5 社交包装 | `social` 面：`worldChannelId / partyOf`；附近聊天只映射 `fromEntityId` → 名字；队伍面板消费 `PartyLogic` | 用例 |
| MK1-B6 基准 | `world-bench` 场景 B 爬升；kill criterion 达标 | 数字进 §12 |
| MK2-B1 combat 面 | 施法管线（准备 → 施放 → 完成）、aura 表、仇恨表、有序战斗事件；公式扩展 `shared/logic/battle.ts` | 无头重放一致 |
| MK2-B2 ai 面 | 分桶调度器、行为解释器、`nav` 网格 A*（可下沉 `core/compute/tasks/kits/mmo/pathfind.ts`，结果带 `instanceEpoch` + `entityVersion`，迟到即丢） | AI 分桶不挤占主 tick（预算用例） |
| MK2-B3 掉落 | `ILootTable` 掷骰确定性（`api.rng` 同源）；`lootClaimed` 事件 | 重放一致 |
| MK3-B1 inventory 面 | `grantItem / moveItem / claimLoot` 全在 `withWorldTx`；回执 `k_mmo_receipt`；唯一物品 / 容器 / 装备 / 掉落归属 | 并发拾取 / 重复请求 / 重启重放不复制 |
| MK3-B2 角色保存定稿 | `k_mmo_character` 只留身份成长 + `checkpoint_rev`；选角页读最新检查点 `snapshot.mapId` | 用例 |
| MK3-B3 长跑 | 24–72 h 无头长跑：内存 / 计时器 / 连接 / 积压无增长 | 报告进 §12 |
| MK4-B1 orchestration 面 | shared 契约（MMO.md §8.5）+ `defineOrchestration` + `validateOrchestrationCommand`；server 运行器（事件分发、命令校验、预算、fail-closed suspend、`(eventSeq, eventDigest, commandDigest)` 环形日志）；`readCheckpointedVars`、`createOrchestrationHarness` | `mmo-orchestration-boundary.test.ts`；预算超限（65 条命令）→ `packSuspended`；重放逐条相等 |
| MK4-B2 贡献点装载 | `kit.json.contributions`（content / presentation / orchestration）；灰盒内容包改经贡献点装载；`contributions.generated.ts` 消费 | 干净安装闭环 |
| MK4-B3 卸载 / 升级闸 | `uninstall` 在有依赖插件 / pending 事件 / 在途交接 / 运行中分线时拒；api 面 `version / minSupported` 冻结 | 用例 |
| MK4-B4 说明书 | `apps/kits/mmo/README.md`：九面、三贡献点、事件 / 命令清单、预算数字、回退窗口 | 人工 |
| MK4-B5 容量证据 | 场景 A / B 最终数字；故障矩阵全表 | 进 §12 |
| MK4-B6 冻结 | tag `mmo-kit-v1-frozen`（含 `scripts/packages/mmo.lock`） | — |

MK0 退出：B1–B6 全部（✅ 2026-09-20；B5 随 B2 交付）；干净树全链闭环落为根命令 `npm run verify:kit-clean-install -- --kit mmo`（`scripts/kit-clean-install.mjs`，MK4-B6 复用）；场景 A 数字与偏差 ①–⑫ 见 MMO.md §12 MK0 行。回滚：可回退（`plugin -- uninstall mmo`，表保留）。

## 4. 内容插件施工单（MG0–MG2）

| 批次 | 内容 | 验收 |
| --- | --- | --- |
| MG0-B1 拍板 | 样本名（`mmodemo` / `mmohold`）与范围；`apps/plugins/mmodemo/{plugin.json（requires.kits.mmo + contributes.mmo）,README.md,content/*.json}` | `plugin -- check` |
| MG0-B2 编排 + 表现 | `apps/server/src/core/mmodemo/{mmoOrchestration.ts,encounters/{bossTimer,ambush}.ts}`；`apps/client/src/plugins/mmodemo/{index.ts,mmoPresentation.ts}` | harness 重放：boss 周期、伏击冷却、奖励只发同队在场者、预算内 |
| MG0-B3 动线验收 | MMO.md §9.4 #1–#7、#9 | 全过 |
| MG1-B1 竖屏操作 | 摇杆 + 目标选择 + 技能轮盘（kit 默认 HUD 上） | Creator 预览证据（`tools/creator-preview/` 加 step） |
| MG1-B2 可选域页面 | `domains/mmodemo.ts`（`bossBoard` query）+ `websocket/mmodemo/bossBoard.ts` + 向量 + `MmoDemoBoardLogic/View` | 向量测试 |
| MG2-B1 `mmohold` 内容 + 编排 | `holdRidge` 内容包；`tick`（`tickEvery=20`）据点计分、易主换守卫、达标发奖 + 关闭重开状态机 | harness |
| MG2-B2 自有 HUD | `MmoHoldHudView` 替换 kit 默认 HUD（`subscribeScriptState`） | Creator 证据 |
| MG2-B3 双样本验收 | §9.4 #8：两样本重复 #3，kit 零改动；若需改 kit 回 MK 阶段 bump 面版本重做 | 全过 |

## 5. 进程拆分轨道 PS（MMO.md 之外；待四项拍板）

| 批次 | 内容 | 与 MMO 的交点 |
| --- | --- | --- |
| PS0 拍板（✅ 2026-09-19，MMO.md D27） | ① 本地 `dev` 缺省合体，`dev:split` 另给；② 端点发现走游戏 HTTP `/version` 字段，反代路径为部署选项；③ 删 `room.resolve` 的 matchmaker 房间快照；④ world 入口先占位（入口 + `WORLD_PORT` + 空 config），房间等 MF4 | MF4-B6 登记在 `world.config.ts` |
| PS1 入口拆分 | `apps/server/src/entries/{lobby,game}.ts` + `{lobby,game}.config.ts`；共用 `bootstrapProcess()`（lifecycle 登记、后台循环按进程装配：mailwake / kick / 角色修复 → lobby，结算流深度告警 → game，监控与 shutdown 聚合器每进程一份）；`index.ts` / `app.config.ts` 改为合并三份 config 的合体入口；`LOBBY_PORT` / `GAME_PORT`（缺省 = `PORT`）；`package.json` 加 `start:lobby` / `start:game` 与 `dev:split`（并发起三进程；`dev` 缺省仍合体）；`docs/inventory.json` 登记新入口；int helpers / `protocol-version-matrix` / `test/smoke.ts`（两个 URL）改 boot 对应 config | MF3 的 rooms/core 抽取与本批无冲突；建议 PS1 在 MF3 之后、MF4 之前落地 |
| PS2 端点发现 | 游戏 HTTP `/version` 加 `lobbyWs / gameWs / worldWs`（shared `protocol/http.ts` + `codegen:http`）；客户端 `serverSession.getCurrentLobbyWsUrl()` / `getCurrentWorldWsUrl()`（缺省回落 `gameWsUrl`）；`loginFlow.ts` / `LoginLogic.ts` 改用 lobby 端点 | MF8-B4 `world.enter` 返回 `worldAddress` 时附 world 端点 |
| PS3 解耦 `room.resolve` | 删 `matchMaker.driver.findOne` 快照（③ 已拍板）：`room.resolve` 只做 lease 读取 + 凭据签发，`ROOM_FULL` / `ROOM_START_IN_PROGRESS` 改由 GameRoom admission 给出；`private-room.test.ts` 相关期望同批改 | `core/rooms/privateRoomRpc.ts` |
| PS4 world 入口占位（④ 已拍板） | `entries/world.ts` + `world.config.ts`（空 rooms）+ `WORLD_PORT`，与 PS1 同批先占位；MF4-B6 登记于此；MF10-B2 的 RedisDriver 只在多个 world 进程之间；`WorldDirectory` 记录实例所在节点 publicAddress | MMO.md v1.2 已回写（§4.2、MF4 / MF8 / MF10 行） |
| PS5 snake 皮肤缓存 | `rooms/modes/snake/cosmeticProfile.ts` 的进程内 Map 在拆进程后跨进程失效：snake 房每次 join 从 Redis 重新水合，或 Map 只做请求内缓存 | 与 MMO 无关，PS1 的必做项 |

## 6. 命令速查

```bash
# 每批必跑
npm run verify:all
npm --workspace @game/server run test
# 涉 Redis / MySQL 的批
npm --workspace @game/server run stack && npm --workspace @game/server run db:bootstrap
npm --workspace @game/server run test:int
# 故障类批
npm run test:faults && npm run test:faults:int
# 改了 shared 真源 / 玩法单源 / kit·plugin 登记 / HTTP 端点
npm --workspace @game/server run codegen:gameplays
npm --workspace @game/server run codegen:plugins
npm --workspace @game/server run codegen:http
npm run sync:shared && npm run sync:client
node scripts/protocol-fingerprint.mjs --write      # 只在改了 apps/shared/src/protocol/** 时
node scripts/protected-paths-lock.mjs --write       # 只在改了 scripts/protected-paths.json 时
# kit / 插件闭环
npm --workspace @game/server run plugin -- pack <id>
npm --workspace @game/server run plugin -- install <id>.zip
npm --workspace @game/server run plugin -- check
npm --workspace @game/server run plugin -- test <id>
# 基准台
npm --workspace @game/server exec tsx -- tools/world-bench/run.ts --scenario <name>
```

## 7. 施工细化与待回写 MMO.md 的点

| # | 细化 | 回写 |
| --- | --- | --- |
| P1 | `world_instance` 在 MF4-B3 就带 `write_seq` 列（MF7b 首句 CAS 用），避免二次迁移 | ✅ v1.2 MF4 `schema.sql` 行 |
| P2 | `world_transfer` 在途闸从 MF7b 挪到 MF8-B7（表在 MF8 才建） | ✅ v1.2 MF7b / MF8 行 |
| P3 | `ServerNotice` 的 `/admin/notice` 是新 HTTP 端点，需改 shared `protocol/http.ts` 契约表（手写）+ `codegen:http` | ✅ v1.2 §6.7 |
| P4 | MF6b 的 core 世界 token 落在 `apps/shared/src/protocol/messages.ts` 的 core 表（codegen 从这里读 CORE_C2S / CORE_S2C）+ `test/wire-vectors/core.ts` | ✅ v1.2 §6.5.1 |
| P5 | `renewLeaseGuard`（`core/infra/lease.ts` 既有）即 `withKitWorkerTx` 的首句实现，⛔ 不另写 SQL | ✅ v1.2 MF7a 行 |
| P6 | `world-bench` 输出目录 `docs/perf/world-bench/` 已核安全（`verify-perf-baseline.mjs` 只读 `client-ballMove-baseline.json`） | ✅ v1.2 MF1 行 |
| P7 | PS 拍板后：MF4-B6 登记点、MF8-B4 `world.enter` 返回端点、MF10-B2 RedisDriver 范围三处改口径 | ✅ v1.2 §4.2 新段 + D27 + MF4 / MF8 / MF10 行 + §6.3 注入点 |
| P8 | 框架待修改路径清单（MF1-B3）= 本文 §2 各批次的落点列，与 MMO.md §6 各阶段落点表逐批对齐；MF1 实际落点变更一处：AOI 对照由 `aoiProbeFixture` 改为 `tools/world-bench/aoi-probe.ts`（MMO.md §5.5 已改） | ✅ MF1-B3 |

## 8. 风险与看护点

- **MF3-B2 单提交体量**：抽五件 + 切换 GameRoom 一次提交；靠 MF3-B1 先把行为钉死，B2 只允许「移动 + 注入」，不许顺手改语义。
- **MF2 门①**：主账主键迁移不可逆；发布前 drain outbox 的 SOP 必须先写（MF2-B6）再执行。
- **MF5a-B4 `roster` 开关**触碰生成物 `GameRoomState.ts`（受保护生成物，只经 `codegen:gameplays` 重生成）；「既有 mode 生成物字节不变」是硬闸。
- **上游许可**：AzerothCore AGPL——只对照结构，零行代码 / SQL；提交信息写对照。
- **PS 与 MF4 的时序**：PS1 + PS4（入口拆分与 world 占位）在 MF3 之后、MF4 之前落地，MF4-B6 直接登记进 `world.config.ts`；`docs/inventory.json` 与 int helpers 随 PS1 同批。
- **数字冻结**：§11.2 已于 2026-09-19（MF1-B3）冻结；之后批次把数字钉进代码常量时注释引用 §11.2 的行名，改数 = 新拍板 + MMO.md §12 登记。

## 9. 批次状态（只在本文回写；阶段级完成回写 MMO.md §12）

- [x] MF0-B1（6582d4ac） [x] MF0-B2（1ce10d01） [x] MF0-B3（107f8e5a）— MF0 退出 2026-09-19，见 MMO.md §12
- [x] MF1-B1（3da785c7） [x] MF1-B2（f1c19cde） [x] MF1-B3（本行所在提交，文档）— MF1 退出 2026-09-19，见 MMO.md §12（偏差 ①–④ 登记在该行）
- [x] MF3-B1（61a0125e） [x] MF3-B2（dd3ec2fe） [x] MF3-B3（本行所在提交，文档）— MF3 退出 2026-09-19，见 MMO.md §12（偏差 ①–③ 登记在该行）；tag `mf3-exit`
- [x] MF6a-B1（1f86f07f） [x] MF6a-B2（0e17fcd1） [x] MF6a-B3（e4f9f692） [x] MF6a-B4（1280037e） [x] MF6a-B5（6e38095f；`ServerNotice` 已做，snake 整队入座按施工单后置 ⛔ 未做）— MF6a 退出 2026-09-19，见 MMO.md §12（偏差 ①–⑤ 登记在该行）；tag `mf6a-exit`
- [x] MF7a-B1（979a980d） [x] MF7a-B2（fe18d127） [x] MF7a-B3（3f978152） [x] MF7a-B4（bb2b0728） [x] MF7a-B5（ab11e6a0） [x] MF7a-B6（本行所在提交，真库争租夹具 + 文档）— MF7a 退出 2026-09-19，见 MMO.md §12（偏差 ①–⑤ 登记在该行）；tag `mf7a-exit`
- [x] MF9-B1（f6fad19f） [x] MF9-B2（745f5ca6） [x] MF9-B3（2c528c69） [x] MF9-B4（944be274，显式框架侵入） [x] MF9-B5（本行所在提交，文档）— MF9 退出 2026-09-19，见 MMO.md §12（偏差 ①–⑥ 登记在该行）；tag `mf9-exit`
- [x] MF2-B1（4008c6f2） [x] MF2-B2（2c4027ba） [x] MF2-B3（d8c1a6e9） [x] MF2-B4（d1bbaa89；arena 1.0.0 → 1.0.1 锁 `--reinstall-from-tree` 重写） [x] MF2-B5（9369e654；`schema.sql` 加 `idx_persona_uid`，受保护文件显式重钉） [x] MF2-B6（本行所在提交，回归 + 门① SOP SERVER.md §8.2 + 文档；勾选行曾随 3D 轨道提交 7dc98304 先行入库）— MF2 退出 2026-09-19，见 MMO.md §12（偏差 ①–⑥）；tag `mf2-exit`
- [x] MF5a-B1（9db63ceb） [x] MF5a-B2（fc5dfd9f，显式框架侵入 rooms/core） [x] MF5a-B3（369cadb7） [x] MF5a-B4（88391af8，显式框架侵入 GameRoom） [x] MF5a-B5（9968cc6f，显式框架侵入 GameRoom / GameMode / GameRoomTransport） [x] MF5a-B6（本行所在提交，world-bench `view-r100 / view-r300` + 文档）— MF5a 退出 2026-09-19，见 MMO.md §12（偏差 ①–⑧）；tag `mf5a-exit`；`GAME_ROOM_PROTOCOL_VERSION` 不 bump（§11.2）
- [x] MF4-B1（c61dde16） [x] MF4-B2（ce5b21aa） [x] MF4-B3（39c19209） [x] MF4-B4（9705ba6f） [x] MF4-B5（ccde4349） [x] MF4-B6（05e9933a，显式框架侵入 RoomAuth / RoomProfile / GameRoom / app.config + protected-paths 新增 WorldRoom / WorldMode / world.config；B8 的 shared / 夹具 mode 半边随本批） [x] MF4-B7（2c455fed） [x] MF4-B8（9fe7118a，真栈 int；本行所在提交 = 文档回写）— MF4 退出 2026-09-19，见 MMO.md §12（偏差 ①–⑩）；tag `mf4-exit`；`WORLD_ROOM_PROTOCOL_VERSION=1` 一次定型
- [x] MF5b-B1（43b0c827；观察者运行时住 WorldRuntime + WorldRoom 每 tick 排空 + worldFixture 七个 perSession token（B3 的夹具半边与 `gameplay-wire-per-session` 扩表随本批，modeVersion 1 → 2）+ `world-visibility-leak.test.ts`） [x] MF5b-B2（0d7e2adc；客户端 `bindObserverStream`） [x] MF5b-B3（本行所在提交：矩阵 / verify 各阶段全绿 + 文档）— MF5b 退出 2026-09-20，见 MMO.md §12（偏差 ①–④）；tag `mf5b-exit`；⚠ 不作 slg 2b 证据
- [x] MF6b-B1（74ef0369） [x] MF6b-B2（本行所在提交：worldFixture 用例随 B1 的 `world-chat.test.ts`、SERVER.md §5 / §13 + KIT.md §4 + rooms/README）— MF6b 退出 2026-09-20，见 MMO.md §12；tag `mf6b-exit`
- [x] MF7b-B1（be50abf0） [x] MF7b-B2（8f1da3cd） [x] MF7b-B3（2bb60051；实现选项取 ④「事件批只随分线检查点同事务落库」，①–③ 门 / superseded 保留作纵深） [x] MF7b-B4（32da36de） [x] MF7b-B5（0bd33abf；夹具 mode 住 test/fixtures，kitfix 两表在 int 内物化） [x] MF7b-B6（本行所在提交：§7.3 逐行用例 `world-rollback-windows.test.ts` + SERVER.md §8.3 + 文档）— MF7b 退出 2026-09-20，见 MMO.md §12（偏差 ①–⑥）；tag `mf7b-exit`
- [x] MF8-B1（056096a3） [x] MF8-B2（162334f9；状态机 / 凭据用例落 test/int：world-transfer / world-ticket） [x] MF8-B3（2bb25a8c） [x] MF8-B4（73716dac） [x] MF8-B5（0c6c596f） [x] MF8-B6（356f003e） [x] MF8-B7（本行所在提交：`test/int/world-transfer-flow.test.ts` 四注入 + fault-matrix `world-transfer` 组 + `tools/plugin/transferGate.ts` 卸载闸 + 文档）— MF8 退出 2026-09-20，见 MMO.md §12；tag `mf8-exit`
- [x] MF10-B1（76ae49ff） [x] MF10-B2（a8211ff7） [x] MF10-B3（b1898b14） [x] MF10-B4（本行所在提交：`tools/world-bench/multi-process.ts` + 报告 `docs/perf/world-bench/2026-09-20T040342-multi-process.json` + 文档）— MF10 退出 2026-09-20，见 MMO.md §12；tag `mf10-exit`
- [x] MF11-B1（80234284；MMO-REVIEW-2 R2-01 / R2-02 改代码） [x] MF11-B2（f6eeb83b） [x] MF11-B3（52db09d2） [x] MF11-B4（b11bda7b；独立命令 `verify:mmo-fixture-matrix`，34 步） [x] MF11-B5（本行所在提交）— MF11 退出 2026-09-20，见 MMO.md §12；tag `mmo-framework-v1`（框架段 MF0–MF11 完成）
- [x] MK0-B1（a7b9ebf8） [x] MK0-B2（334db811） [x] MK0-B3（b897745f） [x] MK0-B4（09ce50bb） [x] MK0-B5（随 B2：灰盒包 TS 字面量单源，JSON 形态归 MK4-B2） [x] MK0-B6（本行所在提交：仓内首装 + `verify:kit-clean-install` 干净树 25 步 + `mmo-greybox` 场景 A 首次数字）— MK0 退出 2026-09-20，见 MMO.md §12；tag `mk0-exit`
- [x] MK1-B1（本行所在提交：`movement` 面三端 + content v2（职业模板 + 碰撞位图）+ 直发 `s2c.mmoWorld.pos`（modeVersion 3）+ 客户端预测按 seq 和解 + kit 0.1.1 从树重装） [ ] MK1-B2…B6 [ ] MK2-B1…B3 [ ] MK3-B1…B3 [ ] MK4-B1…B6
- [ ] MG0-B1…B3 [ ] MG1-B1…B2 [ ] MG2-B1…B3
- [x] PS0（2026-09-19 拍板 → MMO.md D27） [ ] PS1 [ ] PS2 [ ] PS3 [ ] PS4 [ ] PS5
