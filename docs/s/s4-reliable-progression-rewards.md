# S4：可靠真人 run 结算与养成奖励

[← S3 · 衣柜与服务端权威装备](s3-wardrobe-and-equipment.md) · [专项索引](README.md) · [S5 · 验收与发布 →](s5-validation-and-release.md)

> **状态：`[已拍板·待实施]`**
>
> **预计：7–11 人日**
>
> **依赖：S2 无尽/个人 run 状态机完成；S2R 的最小 `snake_player_run`、checkpoint、relive receipt、awaited 准入/离场边界和恢复器通过门禁；S3 已在同一 run 冻结 `skinIdAtRunStart/catalogVersionAtRunStart`，且 Bag/User 与 catalog 可被奖励 effect 消费。**

## 1. 目标与非目标

本阶段把 S2R 已建立的动态 roster 真人 run 账本扩展为完整奖励证据，并在每个真人 run 首次终局时可靠地产生
金币、经验、碎片和成就 effect。`totalTime=0` 的房间没有共同结束时刻，因此奖励以单个真人的冻结 run 为单位，
不能继续等待整房 `context.settle()`，也不能让一个人的结果把其他玩家的 room phase 改成 Settle。

本阶段不是第二套账本工程：不得新建与 S2R 平行的 OPEN run、checkpoint、`runId`、离场 hook 或 relive 状态。
只能在原表、原状态机和原恢复路径上做向前兼容的字段/版本扩展。以下事项不是目标：

- 不按 `displayRank`、退出瞬间名次、AI 或 86 个假榜记录发资产奖励。
- 不把 AI 死亡残骸的 `pow(deadSnakeScore, 0.8) * 2` 场内分值公式当成资产奖励公式。
- 不把复活成功当成 run 结算；成功复活只更新同一 run checkpoint。
- 不承诺硬崩溃前尚未写入 checkpoint 的内存进度可恢复；只承诺 `confirmedThroughTick` 以内不漏不重。
- 不用延迟 absolute `setField` 写 XP、碎片或成就进度，也不在同步 command handler 中留下 detached 奖励 Promise。
- 皮肤熟练度仍是后续扩展，不纳入 S4 首发奖励、调优表或退出条件。
- 不在计划中硬编码最终数值；先用真实 V2 无尽 run 分布调参，并以 `rewardPolicyVersion` 冻结每版公式。

## 2. 冻结口径

### 2.1 账本扩展原则

S2R 的最小 `snake_player_run` 与 checkpoint 是唯一基座。S4 通过 `evidenceVersion` 和向前兼容迁移补齐奖励字段，
不改变既有 `roomEpochId/runId/deathSeq`、复活状态、receipt 关联和 `terminalIntent` 语义：

```ts
interface CanonicalSnakeDeathSnapshot {
  version: number;
  skinId: number;
  length: number;
  score: number;
  kills: number;
  magnetCollected: number;
  starCollected: number;
  mostEarn: number;
  mostLiveTime: number;
  // 只保留源复活流程恢复的累计字段；单生命瞬态不持久恢复
}

interface SnakePlayerRunLedger {
  roomEpochId: string;
  runId: string;
  state: "preparing" | "active" | "deadPresentation" | "reliveOffering" | "pendingRelive"
    | "reliveSpawning" | "reliveCommitting" | "reliveReady"
    | "finalizing" | "finalized" | "cancelled";
  uid: string;
  sId: number;
  sessionId: string;
  runStartedTick: number | null;
  runEndedTick: number | null;
  terminalIntent: SnakeRunEndReason | null;
  endReason: SnakeRunEndReason | null;
  activeTicks: number;
  score: number;
  finalLength: number;
  maxLength: number;
  kills: number;
  deaths: number;
  deathSeq: number;
  lastDeathTick: number | null;
  deathSnapshotVersion: number | null;
  deathSnapshot: CanonicalSnakeDeathSnapshot | null;
  deathSnapshotHash: string | null;
  relivesUsed: number;
  reliveCoinSpent: number;
  relivePolicyVersion: number;
  offeredTick: number | null;
  decisionDeadlineTick: number | null;
  reliveAppliedDeathSeq: number | null;
  reliveCompensatedDeathSeq: number | null;
  reliveFirstActiveTick: number | null;
  reliveReceiptId: string | null;
  skinIdAtRunStart: number;
  catalogVersionAtRunStart: number;
  rewardPolicyVersion: number;
  evidenceVersion: number;
  confirmedThroughTick: number;
}
```

`skinIdAtRunStart` 直接复用 S2R 已持久的不可变字段，`catalogVersionAtRunStart` 直接复用 S3 在同一准入路径增加的
不可变字段；S4 只消费并纳入 evidence，不在结算阶段重新读取“当前装备”或首次引入另一组同义字段。

S2 已预声明 typed `runFinalizing/runResult` envelope，S4 优先激活该兼容 envelope。若实现确实需要此前未声明的
wire 语义，必须从实施时的实际 modeVersion 递增并补兼容矩阵，不得预设固定版本号。

OPEN run 仍先以 `preparing/runStartedTick=null` 持久创建；首人于 3 秒准备结束后的首个可操作 tick、后续 drop-in
真人于实际出生可操作 tick，以 CAS 写 `runStartedTick` 并进入 Active。`preparing → cancelled` 不产生 settlement
或奖励；其他可结算状态必须有非空 `runStartedTick`。

### 2.2 `activeTicks` 与已确认进度

每个 fixed step 开始时，只为同时满足 `connected && alive && runState=active` 的真人累加一次 `activeTicks`。
本 step 内发生死亡的 tick 计入；准备、断线宽限、死亡演出、ReliveOffering、PendingRelive、Spawning、
Committing、Ready 和 Finalizing 均不计。复活 activated 提交后，从下一模拟 tick 恢复累计。
`runStartedTick` 只是时间轴锚，禁止用“当前 tick - runStartedTick”冒充有效时长。

checkpoint 在关键里程碑和固定间隔单调写入 `evidenceVersion/confirmedThroughTick`。checkpoint 只更新 canonical
evidence，不能创建奖励 intent、占用最终 opId 或提前发奖。硬崩溃恢复与最终结算只读取已确认版本。

### 2.3 终局、资格与生命周期

结束者先持久锁存 `terminalIntent`，再以 fence/CAS 取得任一 live state
`→ finalizing → finalized` 的唯一执行权。终局优先级沿用 S2R：

```text
moderationKick
  > sessionReplaced
  > serverDrain / roomFault
  > explicitExit / disconnectTimeout
  > 玩法死亡原因
```

同一优先级首次 CAS 为准；settlement evidence 冻结后不得再改写原因。ReliveOffering/Spawning/Committing/Ready
中出现终局意图时，必须 join 同一个 mode-owned relive task：activation 前取消或退款，activation 已先成功则仍
立即 finalize。奖励 finalize、复活应用和退款不能并行各自获胜。

| 状态或结束原因 | 是否产生 settlement/奖励 | 口径 |
|---|---|---|
| `preparing → cancelled` | 否 | 从未进入可操作 run |
| 成功复活 `revived/activated` | 否 | 只更新同一 run checkpoint |
| `moderationKick` | settlement 可留审计，资产奖励否 | 反作弊/封禁类不发奖 |
| `reliveDeclined` / `reliveTimeout` / `deathNoOffer` | 是 | 按已确认进度结算 |
| `reliveSpawnFailed` / `reliveSystemFailed` | 是 | 先收敛未扣费或幂等退款，再结算 |
| `forcedDeath` / `escape` | 是 | 不发复活 offer，按已确认进度结算 |
| `explicitExit` / `disconnectTimeout` | 是 | 只结束本人 run |
| `sessionReplaced` | 是 | 高优先级终局，重复连接不能双结算 |
| `serverDrain` / `roomFault` | 是 | 冻结已确认进度，不伪装成玩法超时 |

### 2.4 原子 settlement 与 outbox

首次取得 finalizing fence 的执行者在同一 MySQL 事务写：

1. `snake_run_settlement` 的 canonical evidence、reward policy、effect hash 和状态；
2. 金币 `currency_ledger`（若本版公式产生金币）；
3. MySQL `gameplay_outbox` intent，供 relayer 将 XP、碎片或成就进度等 additive effect 写入 Bag/User。

最终 opId 至少绑定 `(sId, roomEpochId, runId, uid, rewardPolicyVersion)`。同 payload 重放返回同一 receipt；异
payload 必须隔离并告警，不能覆盖既有 settlement。经验、碎片和成就进度只能使用 Bag additive item 或先扩展
有界 additive grant effect；绝不能用可能乱序覆盖新值的 delayed absolute update。

relayer 超过重试阈值后进入 `dead` 并留下告警/人工 replay SOP。客户端可按 `runId` 查询
`pending/applied/dead` 状态与同一 receipt；重放不创建第二份奖励。

### 2.5 奖励公式形状

```text
reward
  = baseParticipation
  + activeTimeComponent
  + cappedScoreComponent
  + cappedKillOrMilestoneComponent
  + firstRunOrAchievementBonus
```

- 有效时长只读取 `activeTicks`；无输入、无移动贡献且无得分的账号不领参与奖励。
- base 必须有防重复短 run 领取策略；时间、分数和击杀组件采用软上限或硬封顶。
- 无尽房没有共同终局，不定义 `rankBonus` 或 `firstWin`；`displayRank`、AI、假榜分数均不进入经济路径。
- 每次调参提升 `rewardPolicyVersion`，历史 settlement 始终用其冻结版本重放。
- 蛇等级由累计 XP 表派生，不同时保存会漂移的两个权威 `level/xp` 值；首发收藏/成就只解锁表现内容，皮肤
  熟练度留作未来 additive 扩展。

### 2.6 客户端个人结果

`endRun` command handler 保持同步：校验后原子锁存终局意图、停止输入、按 runId 登记/复用 mode-owned tracked
Promise，并立即返回 `runFinalizing`；Promise 完成后推送唯一 `runResult` receipt。重复 endRun、最终离场与
drain 必须 join 同一任务。客户端只允许匹配当前 runId 的结果打开个人结算页；同房其他玩家仍为 Playing。

结果页显示已确认统计、金币/经验/碎片、等级进度、新解锁、receipt/status 和 `confirmedThroughTick`。如果
outbox 尚未 applied，展示 pending；dead 状态给出可查询/补领语义，不伪造到账。无在线客户端的断线终局把
receipt 留到下一次账号 snapshot 展示。

## 3. 详细任务

### S4-01：原位扩展 S2R run/checkpoint schema

- [ ] **动作：** 在 S2R 的 `snake_player_run`、repository 和 checkpoint codec 上增加完整统计、复用
  `skinIdAtRunStart/catalogVersionAtRunStart`、reward/evidence 版本与 `confirmedThroughTick`；为旧最小记录
  提供显式向前迁移和状态校验。
- **产物：** 单一 `SnakePlayerRunLedger` schema、幂等 migration、版本化 codec 和旧记录读取策略。
- **验证：** 仓库中不存在第二张平行 OPEN run/账本；旧 S2R 记录能恢复或按明确策略终局；未知 evidenceVersion
  fail closed，不猜测奖励字段。

### S4-02：实现权威统计和 checkpoint

- [ ] **动作：** 在 fixed step 的规定边界累计 activeTicks、score、final/max length、kills/deaths 等 canonical
  evidence；在死亡、复活、断线、重连、里程碑和固定间隔写单调 checkpoint。
- **产物：** 统计聚合器、checkpoint scheduler、版本/fence 与 confirmed-through receipt 字段。
- **验证：** 准备/断线/全部复活状态/Finalizing 不计时；死亡发生 step 计入一次；activated 后下一 step 才继续；
  乱序或重复 checkpoint 不能回退版本或重复触发奖励。

### S4-03：建立终局原因和唯一 finalizing fence

- [ ] **动作：** 实现显式 `SnakeRunEndReason` 资格矩阵、持久 terminalIntent 优先级和任一 live state 到
  finalizing/finalized 的 CAS；preparing 只可 cancelled。
- **产物：** 终局 reducer、资格策略、canonical evidence freeze 和审计记录。
- **验证：** death decision、endRun、断线超时、顶号、moderation、drain、room fault 并发时只有一个最终原因和
  一个奖励执行者；较高优先级可在冻结前覆盖，冻结后不可改写。

### S4-04：扩展 awaited final-leave 与 `endRun`

- [ ] **动作：** 复用并扩展 S2R 的 `preparePlayerFinalLeave`，先 durable freeze 再释放实体/席位；同步
  `endRun` 只登记可追踪任务，leave/dispose/drain 均 join；与 relive receipt/退款按同一 terminalIntent 收敛。
- **产物：** 通用 hook 扩展、mode-owned finalize registry、typed runFinalizing/runResult 流程。
- **验证：** 无 detached Promise；未冻结不能删实体；activation 前退款与 activation 后立即 finalize 都不会重开
  输入；最后真人 durable freeze 完成后才允许 autoDispose。

### S4-05：实现原子 settlement、ledger 与 gameplay outbox

- [ ] **动作：** 在单一 RC 事务写 settlement、金币 ledger 和 outbox intent，以冻结 evidence/effect hash 和稳定
  opId 绑定 payload；checkpoint 与最终 opId 完全分离。
- **产物：** `snake_run_settlement`、reward receipt、ledger/outbox 写路径和 payload conflict 隔离。
- **验证：** 事务任一点失败整笔回滚；提交结果不明按 opId/自然键回读；同 payload 重放同 receipt，异 payload
  隔离；checkpoint 永远不产生 ledger/outbox。

### S4-06：实现 additive effect、relayer 恢复与补领

- [ ] **动作：** 把 XP、碎片和成就进度映射为现有 Bag additive item 或新增有界 additive grant；为
  pending/dead outbox 建重试、查询、告警和人工 replay SOP。
- **产物：** effect codec、relayer handler、状态查询 API/快照投影和 replay 操作说明。
- **验证：** 乱序、重复和跨进程重放不覆盖新值、不双发；超过阈值进入 dead 且可按原 opId 补领；跨区/不同 sId
  严格隔离。

### S4-07：实现版本化奖励策略与反滥用边界

- [ ] **动作：** 基于真实 V2 run 分布拟合 base/time/score/kill/milestone 组件、封顶和短 run/无贡献门槛；冻结
  `rewardPolicyVersion`；逐表完成经验获取、等级派生、皮肤碎片产出与成就阈值四张表的首轮调优，并明确所有
  解锁只影响表现。
- **产物：** 四张首轮调优表、版本化策略、边界向量、真实分布调参报告和历史 replay fixture。
- **验证：** 无输入/无移动贡献且零分不领 base；重复短 run 不能刷 base；超长 run 被封顶；同 evidence 在同版本
  结果稳定，不同版本互不串用；经验、等级、碎片、成就四表各有上下界/里程碑 fixture；不存在
  rankBonus/firstWin。

### S4-08：完成个人结果 Logic/View 与到账状态

- [ ] **动作：** 只由匹配 runId 的 `runResult` 打开结果页，展示统计、奖励、等级进度、新解锁、receipt 与
  pending/applied/dead；网络恢复按同 runId 查询，不等待 room Settle。
- **产物：** run result ViewModel、FGUI 结果页、snapshot/query 恢复和错误文案。
- **验证：** 同房其他玩家页面/phase 不变化；旧/乱序 runResult 不覆盖当前 run；pending 不伪装到账，dead 可按 SOP
  查询；断线终局在下次账号 snapshot 只展示一次。

### S4-09：完成竞态、崩溃和长驻房回归

- [ ] **动作：** 对全部 endReason、relive receipt 状态、checkpoint/事务/outbox 崩溃窗口、重连、重复 finalize、
  churn 与最后真人离场建立单测和真栈故障 fixture。
- **产物：** 可重复 fault matrix、真 Redis/MySQL 证据、内存集合水位断言和恢复日志。
- **验证：** 已确认进度不漏奖、不双发；relive 与 settlement 各自只有一个胜者；大量循环后 finalized run、任务、
  participant、快照游标和 pending AI 引用回落到当前在线规模。

## 4. 故障与验收矩阵

| 场景 | 注入点/竞争 | 预期收敛 | 主要任务 |
|---|---|---|---|
| Preparing 离场 | OPEN run 尚未 Active | `cancelled`，无 settlement/ledger/outbox | S4-01/03 |
| 同 payload 重复 finalize | 同/异进程重复 endRun/leave | 同一 receipt，不重复资产 | S4-03/05 |
| 异 payload 同 opId | evidence/effect hash 不同 | 隔离并告警，不覆盖首个 settlement | S4-05 |
| checkpoint 后、finalize 前崩溃 | 已更新 confirmedThroughTick | 恢复后只按最新已确认 evidence 结算一次 | S4-02/03 |
| settlement 事务提交前崩溃 | 任一 SQL 写后 kill | 整笔回滚，可安全重试 | S4-05 |
| settlement 提交回包丢失 | COMMIT 成功后 kill/timeout | 按自然键回读既有 receipt，不重复写 | S4-05 |
| outbox apply 重复/乱序 | relayer crash/replay | additive effect 恰好一次语义，不覆盖新值 | S4-06 |
| outbox 长期失败 | 超过重试阈值 | 状态 `dead`、告警、同 opId 人工 replay | S4-06/08 |
| relive 与 endRun 竞争 | charged/applying/applied/ready/activated 各点 | activation 前退款后 finalize；activated 后立即 finalize；只奖一次 | S4-03/04 |
| death decision 与离场竞争 | decline/timeout/endRun/disconnect 同时发生 | terminalIntent 优先级与 CAS 产生唯一原因/结果 | S4-03/09 |
| session replaced/moderation | 与低优先级死亡原因竞争 | 高优先级在 evidence 冻结前胜出；moderation 不发资产 | S4-03 |
| 断线宽限内重连 | 同一 run 尚未终局 | 延续 run，不结算；断线时间不计 activeTicks | S4-02/04 |
| 断线宽限耗尽后重入 | 原 run 已 finalized | 原 run receipt 可查；新准入创建新 run | S4-04/08 |
| 最后真人离场 | 房内仍有 AI/假榜 | 先冻结/结算真人，再停止 tick/autoDispose；AI 不维持房间 | S4-04/09 |
| 房内另一真人结算 | 同房仍 Playing | 仅本人收到 runResult，其他玩家不见全房结算页 | S4-04/08 |
| 硬崩溃在 checkpoint 窗口 | 最近内存进度未确认 | 只恢复 confirmedThroughTick，不伪造未确认奖励 | S4-01/02/08 |
| displayRank/AI/假榜污染 | 构造高假榜分数或 AI 击杀 | 资产结果不变；只读取真人 ledger | S4-05/07 |
| 超长/短 run 滥用 | 极端 activeTicks/score 或重复短 run | 组件封顶、base 门槛生效，结果确定 | S4-07 |

## 5. 退出条件

- [ ] S4-01～S4-09 全部完成；S2R 的最小 run/checkpoint 是唯一被扩展基座，仓库中没有第二套平行账本、hook
  或 runId 生命周期。
- [ ] 全部有效 endReason 都有显式资格；moderation 不发资产，preparing/cancelled 不结算，成功复活不结算。
- [ ] `activeTicks`、checkpoint、confirmedThroughTick 和 evidenceVersion 的边界测试通过，只承诺已确认进度。
- [ ] 首次 finalize 在同一事务写 settlement/金币 ledger/gameplay outbox；同 payload 重放、异 payload 隔离和
  commit-unknown 回读均有真栈证据。
- [ ] XP/碎片/成就进度使用 additive effect，relayer 的 pending/applied/dead 查询、重放和人工 SOP 可用；皮肤
  熟练度未被误列为首发必做。
- [ ] endRun、最终离场、断线、顶号、moderation、drain、room fault 与所有 relive 状态竞争不漏奖、不双发、
  不吞退款，也不向其他玩家广播结果页。
- [ ] 奖励公式有 `rewardPolicyVersion`、真实分布调参记录、边界/反滥用 fixture；AI 残骸、displayRank 和假榜与
  资产路径隔离。
- [ ] 经验获取、等级派生、皮肤碎片产出与成就阈值四张表已逐表完成首轮调优，并有版本、输入分布、上下界与
  回放证据。
- [ ] 最后真人先 durable freeze 再 autoDispose；长时间 churn 后内存集合回落到在线规模。
- [ ] 阶段证据已回写本页并同步 [README 状态表](README.md#8-总状态与证据汇总)。只有本阶段退出后，才可把
  “衣柜与可靠养成奖励闭环”列为完成能力。

## 6. 风险与回退

| 风险 | 防线 | 失败时回退 |
|---|---|---|
| 另建奖励账本，与 S2R run/receipt 分叉 | 原位 migration、同一 repository/runId、schema 守门 | 停止迁移，恢复读旧 evidenceVersion；不得双写两套账本 |
| drop-in 离场先删实体导致证据丢失 | awaited final-leave 先 freeze 后释放 | 保留席位/Finalizing，恢复器继续收口 |
| 同步 command 内启动 detached async finalize | mode-owned registry、重复请求 join | 保持 run Finalizing；不返回伪造完成结果 |
| relive apply/refund 与 reward finalize 并行 | durable terminalIntent、join 同一 task、唯一 finalizing fence | activation 前先退款；无法收敛时不发奖励结果 |
| checkpoint 被误当最终奖励 intent | checkpoint 与 settlement/opId 分离 | 只更新 evidence，拒绝发现的提前 outbox |
| `runStartedTick` 相减夸大活跃时长 | fixed-step activeTicks 条件 | 只按已确认 activeTicks 结算 |
| absolute effect 乱序覆盖新资产 | additive item/grant + 幂等 opId | outbox 隔离并进入 dead/SOP，不做 setField 补丁 |
| 假榜/AI/退出排名进入奖励 | 结算输入类型只接受真人 ledger | fail closed 并隔离 settlement payload |
| 硬崩溃未确认窗口被宣传为可恢复 | receipt 明示 confirmedThroughTick | 只展示已确认进度；需缩窗另立持久化调优 |
| 运维直接关闭长驻房 | Active→Draining，停准入并冻结 run | 延迟 close 至有界 drain；失败记录 roomFault/可恢复证据 |

## 7. 证据回写

未实际运行的命令不得填写为通过。故障证据至少写明注入点、事务/receipt 最终态、重复运行次数和余额/Bag
前后值；只写“测试通过”不构成崩溃窗口证据。

| 状态 | commit | 自动验证（命令、exit code、计数、日期） | 真栈/故障证据 | 备注 |
|---|---|---|---|---|
| `[已拍板·待实施]` | — | — | — | 必须证明扩展而非重建 S2R 账本 |

---

[← S3 · 衣柜与服务端权威装备](s3-wardrobe-and-equipment.md) · [专项索引](README.md) · [S5 · 验收与发布 →](s5-validation-and-release.md)
