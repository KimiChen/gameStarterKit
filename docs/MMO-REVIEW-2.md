<!--
  来源：2026-09-20 MMO MF11-B1「三视角对抗审阅」——对 MF0–MF10 交付的**代码与文档**（不是设计稿）按接缝 / 数据 / 负载三视角只读通读，
  并对每条发现做工作树核验（file:function 口径，行号随实施漂移，⛔ 不引行号）。单审阅者（Claude），同 docs/MMO-REVIEW.md 形态。
  ⛔ 本文是审阅记录，不是设计真源：结论只在被消化进代码（本轮提交）或 MMO.md §12 回写后生效。编号 R2-01–R2-14 供 MMO.md / 提交信息引用。
  处置状态：R2-01 / R2-02 已改代码（本轮提交，含变异验证）；R2-03–R2-08 已改文档口径（MMO.md §12 MF11 段登记）；R2-09–R2-14 是核对通过的事实或
  留给 kit / MK 阶段的测量项（⛔ 不是缺陷）。
-->
# MMO 框架段（MF0–MF10）代码审阅报告

## 结论

框架段十一个阶段（MF0–MF10，MF5 / MF7 各分 a / b）的交付与 MMO.md 的骨架一致：单主不变量（权威租约 + `authority_epoch` / `control_epoch` CAS +
`withWorldTx` 首句 CAS）在存储边界处闭合；三种回退窗口（资产 0 / 角色 ≤ 1 周期 / 分线 ≤ 1 周期）逐行有用例；交接四注入、崩溃重启、
worker 失租、双登顶号都有真栈证据；多进程接管有实验报告。**没有发现阻塞 kit 开工（MK0）的缺陷。**

真正需要改代码的是两条**自愈缺口**（R2-01 / R2-02，本轮已改并带变异验证）：

1. **陈旧的 Committed 前交接行没有任何人清**（R2-01）：源房在 request → prepare → commit 之间崩溃会留下 requested / prepared 行，persona 从此
   被 `UNIQUE(server_id, persona_id, active_key)` 判为「在途」——`world.enter` 一律回 `WORLD_TRANSFER_INVALID`、再 portal 一律 `TransferInFlightError`，
   而 `expireReservations` 只有运维手工调用。现在 `world.enter` 与源房 `requestTransfer` 都按预留窗口懒清（`transfer.cancelIfStale`），
   源房还会把「本房已接住但 finalize 丢失」的 activated 行先收敛再重试。
2. **客户端交接退源房无界等待**（R2-02）：半开连接上 LEAVE 永不回执，`WorldRoomTransport.transfer()` 会卡死在 `source.leave()`；服务端 Committed 后
   本就会离座，现在有界等待（3 s，可注入）后本地收尾继续。

其余是口径与已知取舍（分配阈值来自配置而非 mode、登记是提示不是真源、凭据 TTL 30 s、检查点表的保留归 kit）与几项负载侧的测量项
（每周期 N 条 persona 快照、`readAdminWorldInstances` 的 N 次登记读），全部登记进 MMO.md §12 MF11 段。

## 问题清单

严重度：High = 会把 persona / 交接卡死或与不变量冲突；Medium = 需改代码或口径才能作为验收依据；Low = 措辞 / 一致性 / 测量项。

### High

| 编号 | 视角 | 问题 | 证据 | 处置 |
| --- | --- | --- | --- | --- |
| R2-01 | 数据 / 接缝 | 源房在 Committed 前崩溃遗留的 requested / prepared 行永不收敛，persona 被永久判「在途」 | `rooms/core/transfer.ts` `requestTransfer` 的 INSERT 带 `active_key='1'`，只有 `cancelTransfer` / `finalizeTransfer` 置 NULL；`expireReservations` 无框架调用方（grep 仅 int 用例）；`core/world/enterRpc.ts` `handleWorldEnter` 对 requested / prepared 一律 `WORLD_TRANSFER_INVALID`；`rooms/WorldRoom.ts` `requestTransfer` 对 `TransferInFlightError` 直接 reject | **已改**：`transfer.cancelIfStale(sId, row, nowMs, staleAfterMs)`（prepared 预留到期 / requested 建行超过预留窗口 ⇒ cancelled；Committed 及之后 ⛔ 动，`WorldTransferRow` 加 `createdAt`）；`world.enter` 遇 requested / prepared 先懒清再决定拒 / 放；源房 `requestTransfer` 遇在途：activated 且 toInstance = 本房 ⇒ finalize，陈旧 Committed 前行 ⇒ cancel，然后重试一次；`WorldTransferPort` 加 `cancelIfStale` / `activeOf`。用例：`world-enter-rpc`（陈旧 requested / 预留到期 prepared 懒清）、`world-transfer-room`（自愈三段）、`int/world-transfer`（真库 createdAt / 判据）；变异 4/4 转红 |
| R2-02 | 接缝（客户端） | 交接退源房无界等待：半开连接上 LEAVE 永不回执 ⇒ `transfer()` 卡死，目标房凭据在 30 s 内过期 | `apps/client/src/net/rooms/WorldRoomTransport.ts` `transfer()` 原为 `await source.leave()`；`handle.leave` 只在 SDK `room.leave()` 回执后 `finish` | **已改**：`Promise.race([source.leave(), timeout(WORLD_TRANSFER_LEAVE_TIMEOUT_MS=3 s)])`，超时即 `abandon()` 本地收尾（服务端 Committed 后本就离座）；`leaveTimeoutMs` 可注入；用例 `worldRoomTransport.test`「LEAVE 无回执」；变异转红 |

### Medium

| 编号 | 视角 | 问题 | 证据 | 处置 |
| --- | --- | --- | --- | --- |
| R2-03 | 接缝 | 分线分配的满员阈值是配置 `WORLD_LINE_CAPACITY`（缺省 100），不是目标 mode 的 `capacity`；登记 `seated` 最多滞后一个续租节拍（5 s） | `rooms/core/WorldDirectory.ts` `allocate({ capacity })` 由 `core/world/enterRpc.ts` 传 `WORLD_LINE_CAPACITY`；`WorldRoom.publishRegistry` 入座 / 离座即时、其余按 `WORLD_INFO_REFRESH_MS` | 口径：分配是**提示**，硬上限仍是房内 `mode.capacity`（`RoomFull`，凭据未消费可原票重试）；突发涌入可能短暂超过阈值到 `RoomFull`；按图定制阈值与客户端自动重试归 kit（MK1）——写进 MMO.md §12 MF11 段与 SERVER.md §5 |
| R2-04 | 数据 | 凭据绑定「签发时的 control_epoch」：任何一次失败的准入若已消耗 `acquireControl`（epoch +1），同 persona 的旧凭据整体作废 | `rooms/WorldRoom.ts` onJoin ⑧ 之后失败 `releaseControlLater`（epoch 不回退）；`WorldTicket` claim 比较 `controlEpoch` | 口径：这是绑定 epoch 的必然结果，客户端须重新 `world.enter`（MF8 偏差 ③ 已写）；`world.enter` 幂等且无副作用，⛔ 改 |
| R2-05 | 数据 | kit 检查点表只追加、无保留策略（`k_kitfix_checkpoint` 每周期一行 / persona） | `test/fixtures/kitfixWorld.ts` `SqlCheckpointPort.save` INSERT 追加、`load` 取最大 rev | 口径：快照内容与保留归 kit（框架只校验信封）；MK3「24–72 h 长跑」必须带表增长指标；kit 至少保留最近 N rev（建议 N=3）——写进 KIT.md §4 |
| R2-06 | 负载 | 周期检查点对每个在座 persona 各一条 INSERT（同一世界事务）：100 人 / 30 s ⇒ 每分线每分钟 200 行 | `rooms/core/WorldCheckpoint.ts` `save` 逐 persona `savePersona` | 口径：单事务内串行 INSERT 在 100 人档可接受（int 用例 ms 级）；MK1 场景 B 实测 tick 尾部与事务耗时后决定是否分批 / 只写脏 persona（§11.2 只许收紧） |
| R2-07 | 接缝 | 附近聊天受众只算**已进入兴趣集**的会话：刚入座、首个 baseline 之前的会话收不到同 tick 的气泡；无 observer 能力的 mode 只有发送者自己收到 | `rooms/core/WorldRuntime.ts` `sayNearby` 用 `observerSync.interest.sessions()` | 口径：气泡与 enter / leave 同序的代价（先 baseline 后差分）；MF6b 偏差 ⑤ 已写，本轮补「首帧前不收」 |
| R2-08 | 接缝 | `WorldRegistry` 缺省 Redis 端口在单测里会真连 coord（进程不退出） | `rooms/core/WorldRegistry.ts` `redisWorldRegistry` 是模块级单例；`WorldRoom` 缺省注入它 | **已改**（MF10-B1）：单测 harness 缺省 `MemoryWorldRegistry`；口径：新增缺省 Redis 端口的 deps 必须同批给 harness 内存实现（写进 rooms/README） |

### Low

| 编号 | 视角 | 问题 | 证据 | 处置 |
| --- | --- | --- | --- | --- |
| R2-09 | 负载 | 运维只读面 `instances` 对每行各读一次登记 | `core/world/adminRead.ts` `readAdminWorldInstances` `Promise.all` 并发 | 已是并发；4096 行上限下可接受，⛔ 改 |
| R2-10 | 数据 | 交接凭据原文可经 mode 的 token 出网（夹具 `s2c.worldFixture.transfer`） | `test/fixtures/worldFixtureMode.ts` portal then 分支 | 口径：由 mode 决定（kit 可只发 transferId，让客户端走 `world.resolveTransfer`）；KIT.md §4 已写；夹具保留以覆盖 reply-lost 段 |
| R2-11 | 接缝 | `world.enter` 遇 Committed 交接强制解析到交接目标（忽略请求的 mapId） | `core/world/enterRpc.ts` `handleWorldEnter` | 口径：⛔ 绕开交接（MF8 偏差 ②）；activated ⇒ 懒 finalize 后按请求的图进入 |
| R2-12 | 负载 | 登记发布：每次入座 / 离座一条 MULTI（HSET + PEXPIRE），续租节拍再刷一次 | `WorldRoom.publishRegistry` | 100 人涌入 = 100 条 MULTI，coord 单实例毫秒级；⛔ 改 |
| R2-13 | 数据 | 多进程实验用 dev 身份提供者签会话 | `tools/world-bench/multi-process.ts` | 实验专用（fake WebPlatform 客户端是进程内存），⛔ 进生产；README 已写 |
| R2-14 | 接缝 | `multi-mode-wire.test` 在 4 并发下偶发抖动一次 | 全量单测一次红、单跑 / 重跑绿（MF10 记录） | 与 MMO 改动无关；留意，不处置 |

## 附录 A：核对通过的事实（⛔ 不需要改）

- 权威 / 控制权 / 世界事务三处 CAS 谓词齐全：`control.acquireAuthority` / `acquireControl` / `assertControl`、`kitApi.withKitWorldTx` 首句、`WorldCheckpoint.commitCheckpointRev`；旧 owner 迟到写在 int（world-tx / world-crash-restart / world-transfer-flow source-crash 段）各有 0 行证据。
- 事件批只随分线检查点同事务落库（D25 选项 ④），worker 门 `checkpoint_rev ≤ world_instance.checkpoint_rev` 与 Recovering superseded 作纵深；至少一次 + `credit(opId=eventId)` 去重。
- 交接状态机每步持久 CAS、`transferId` 幂等 already、activate 唯一（并发赢家由控制权 CAS 裁决，already 且非本 epoch 只剩纵深）、已消费交接在取控制权前拒（⛔ 顶号）。
- 凭据一次性：Lua CAS 三态、seat 后重放拒、轮换后旧凭据作废；绑定四元组 + controlEpoch。
- perSession 闸对 core 世界 token 同样 fail-closed（S2CPorts 启动期断言含 CORE_S2C_TOKENS）。
- 多进程：独立 Redis 实例断言（含只换 db 的反例）；登记 TTL = 租约（B4 实验修正）。

## 附录 B：处置顺序

R2-01 / R2-02 随本轮 MF11-B1 提交；R2-03–R2-08 的口径随 MF11-B2 真相对齐写进 MMO.md §12 / SERVER.md / KIT.md / rooms README；其余不处置。
