# S4：可靠真人 run 结算与养成奖励

[← S3 · 衣柜与服务端权威装备](s3-wardrobe-and-equipment.md) · [专项索引](README.md) · [S5 · 验收与发布 →](s5-validation-and-release.md)

> **状态：`[已拍板·待实施]`**
>
> **预计：7–11 人日**
>
> **依赖：S2 无尽/个人 run 状态机完成；S2R 的最小 `snake_player_run`、checkpoint、relive receipt、awaited 准入/离场边界和恢复器通过门禁；S3 已在同一 run 冻结 `skinIdAtRunStart/catalogVersionAtRunStart`，且 Bag/User 与 catalog 可被奖励 effect 消费。**
>
> **产品决策：2026-09-03 用户已批准本页首发奖励、等级、成就、碎片、结果页和调参/版本切换口径。**

## 1. 目标与非目标

本阶段把 S2R 已建立的动态 roster 真人 run 账本扩展为完整奖励证据，并在每个已启用奖励的合格真人 run 首次
终局时，于同一 MySQL 事务确认金币奖励、持久化 progression intent，再由幂等 relayer 发放 XP、专属碎片和成就
进度，并自动授予等级/成就皮肤；等级本身始终由累计 XP 派生，不作为资产发放。
`totalTime=0` 的房间没有共同结束时刻，因此奖励以单个真人的冻结 run 为单位，不能继续等待整房
`context.settle()`，也不能让一个人的结果把其他玩家的 room phase 改成 Settle。

本阶段不是第二套账本工程：不得新建与 S2R 平行的 OPEN run、checkpoint、`runId`、离场 hook 或 relive 状态。
只能在原表、原状态机和原恢复路径上做向前兼容的字段/版本扩展。以下事项不是目标：

- 不按 `displayRank`、退出瞬间名次、AI 或 86 个假榜记录发资产奖励。
- 不把 AI 死亡残骸的 `pow(deadSnakeScore, 0.8) * 2` 场内分值公式当成资产奖励公式。
- 不把复活成功当成 run 结算；成功复活只更新同一 run checkpoint。
- 不承诺硬崩溃前尚未写入 checkpoint 的内存进度可恢复；只承诺 `confirmedThroughTick` 以内不漏不重。
- 不用延迟 absolute `setField` 写 XP、碎片或成就进度，也不在同步 command handler 中留下 detached 奖励 Promise。
- 皮肤熟练度仍是后续扩展，不纳入 S4 首发奖励、调优表或退出条件。
- 不做首局、首胜、每日首局或成就额外金币/XP bonus；等级与成就只自动授予已批准的纯外观皮肤。
- 不做随机碎片、保底、玩家自选目标、万能碎片、碎片换币或已拥有碎片自动转换；沿用 S3 的专属碎片边界。
- 不增加独立成就领奖页、手动领奖/补领经济按钮、头像框、名牌或徽章内容；进度在衣柜锁定详情和个人结果中投影。
- 不把调参过程变成新的产品审批：资格、硬顶、等级、成就、碎片和分布目标已冻结；金币/XP 各组件系数由不少于
  100 个合格真人 run 的证据拟合。首个达标参数集冻结为 `rewardPolicyVersion=1`，已经参与 settlement 的版本
  永远不得原地改写，后续调参只能产生新版本。

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
  meaningfulInputCount: number;
  mostEarn: number;
  mostLiveTime: number;
  // S4 奖励所需的 run 累计证据；连杀、攻击、临时 buff 等单生命瞬态不持久恢复
}

interface SnakePlayerRunLedger {
  roomEpochId: string;
  runId: string;
  state: "preparing" | "active" | "deadPresentation" | "reliveOffering" | "pendingRelive"
    | "reliveSpawning" | "reliveCommitting" | "reliveReady"
    | "finalizing" | "finalized" | "cancelled";
  stateVersion: number;
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
  magnetCollected: number;
  starCollected: number;
  meaningfulInputCount: number;
  lastAcceptedInputSeq: number;
  meaningfulDirectionAnchorX: number | null;
  meaningfulDirectionAnchorY: number | null;
  meaningfulBoostAnchor: boolean;
  meaningfulLastCountedTick: number | null;
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
  rewardPolicyVersion: number | null;
  evidenceVersion: number;
  confirmedThroughTick: number;
}
```

`skinIdAtRunStart` 直接复用 S2R 已持久的不可变字段，`catalogVersionAtRunStart` 直接复用 S3 在同一准入路径增加的
不可变字段；S4 只消费并纳入 evidence，不在结算阶段重新读取“当前装备”或首次引入另一组同义字段。

S4 在实施时的 schema registry 注册实际“下一版” `S4_EVIDENCE_VERSION`，不假定尚未实施的 S2R 已占用版本 1。
字段缺失按 `legacyS2R` 解码，只允许迁移、恢复和收口；不存在的统计字段不得补零冒充已确认值，也不得从当前账号
状态反推。没有在准入时锁存策略的旧 run 使用 `rewardPolicyVersion=null`，结果标记 `notEnabled`，不追溯发奖。
上线顺序固定为“奖励开关关闭 → schema/codec 向前迁移并收口旧 OPEN run → 冻结策略 1 → 仅对新准入开启”；
显式但未知的 evidenceVersion 一律 fail closed。

`catalogVersionAtRunStart` 与非空 `rewardPolicyVersion` 都在 `preparing` 创建 run 时一次锁存，并引用不可变 registry；
finalize、恢复和 replay 禁止读取 latest 偷换版本。策略/catalog 切换先令旧房进入 Draining、停止新准入，既有 run
继续按旧版本结算，新房才使用新版本；至少在所有引用该版本的 OPEN/Finalizing run 收口前保留旧 registry，之后的
outbox replay 只消费 settlement 已冻结的完整 effect。

S2 已预声明 typed `runFinalizing/runResult` envelope，但现有 `ISnakeRunResultV1` 不能表达本阶段的统计、分组件状态、
等级前后值和自动解锁。S4 必须新增 §2.7 的 `resultVersion=2` union，从实施时的实际 modeVersion 递增并补 V1/V2
兼容矩阵；不得预设固定版本号，也不得继续把 V1 的通用 `itemId` summary 当作公开养成契约。

OPEN run 仍先以 `preparing/runStartedTick=null` 持久创建；首人于 3 秒准备结束后的首个可操作 tick、后续 drop-in
真人于实际出生可操作 tick，以 CAS 写 `runStartedTick` 并进入 Active。`preparing → cancelled` 不产生 settlement
或奖励；其他可结算状态必须有非空 `runStartedTick`。

### 2.2 `activeTicks` 与已确认进度

每个 fixed step 开始时，只为同时满足 `connected && alive && runState=active` 的真人累加一次 `activeTicks`。
本 step 内发生死亡的 tick 计入；准备、断线宽限、死亡演出、ReliveOffering、PendingRelive、Spawning、
Committing、Ready 和 Finalizing 均不计。复活 activated 提交后，从下一模拟 tick 恢复累计。
`runStartedTick` 只是时间轴锚，禁止用“当前 tick - runStartedTick”冒充有效时长。

`meaningfulInputCount` 只统计上述可计时状态中、通过服务端严格递增 input seq 校验且确实改变权威意图的输入。
计数基准是 checkpoint 中最近一次计数后的 normalized target direction/boost，而不是每 tick 追随中的蛇头实际方向；
出生时以出生方向和 `boost=false` 建 baseline，不计一次。每个 fixed step 先把该 step 内严格 accepted 的输入
coalesce 为最后一份权威 target/boost；其方向相对基准累计变化至少 `9°`，或 boost boolean 相对基准发生切换时
计一次，并把两项基准更新为该最终权威意图，同一 fixed step 最多一次。
旧/重复/乱序 seq、同方向 heartbeat 和自动前进不计；零向量不改变方向，但其中真实 accepted boost 切换仍可计。
断线/死亡/复活等服务端强制意图变化只重建 baseline、不增加计数；anchors 与 last-counted tick 随 checkpoint
`lastAcceptedInputSeq`、anchors 与 last-counted tick 随 checkpoint 恢复，避免重连或崩溃后把相同意图再算一次。
客户端“取消全部/释放加速”若作为正常 accepted input 改变 boost，
与其他玩家输入一样计数，禁止信任客户端自报 reason 另开豁免。

checkpoint 至少每 `100` fixed ticks（20 Hz 下 5 秒）单调写入一次，并在 Active、死亡、复活扣费/activated、
断线、重连和 Finalizing 等关键边界立即写；S2R 若已有更严格节奏则保留更严格值。它覆盖本节全部 canonical
evidence 和 `confirmedThroughTick`，但不能创建奖励 intent、占用最终 opId 或提前发奖。硬崩溃恢复、资格判断和
最终结算只读取已确认版本。

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

“合格 run”与“当前是否启用奖励”分开计算，且都只读 frozen/confirmed evidence：

```text
qualified = endReason != moderationKick
  && activeTicks >= 600
  && (score > 0 || kills > 0 || meaningfulInputCount >= 3)

rewardEligible = rewardPolicyVersion != null && qualified
```

`600` ticks 在 20 Hz 下等于 30 秒。自动前进不满足输入贡献；时间条件与贡献条件缺一不可。凡已有非空
`runStartedTick` 的 terminal run（包括 moderation/notEnabled/notQualified）都必须写零或非零 settlement 与
durable result receipt；只有 `preparing → cancelled` 没有 settlement/result。未通过时金币、XP、成就进度和
碎片全部为 `0/notGranted`，不写经济 ledger/outbox；合格但 `rewardPolicyVersion=null` 的影子样本/旧 run 另以
`notEnabled` 解释，不能伪装成反作弊不合格，也不追溯发奖。

| 状态或结束原因 | 是否产生 settlement/奖励 | 口径 |
|---|---|---|
| `preparing → cancelled` | 否 | 从未进入可操作 run |
| 成功复活 `revived/activated` | 否 | 只更新同一 run checkpoint |
| `moderationKick` | 必须留零奖励 settlement/result，资产奖励否 | 反作弊/封禁类永不发奖 |
| `reliveDeclined` / `reliveTimeout` / `deathNoOffer` | 是，仅 `rewardEligible` 发奖 | 按已确认进度结算 |
| `reliveSpawnFailed` / `reliveSystemFailed` | 是，仅 `rewardEligible` 发奖 | 先收敛未扣费或幂等退款，再结算 |
| `forcedDeath` / `escape` | 是，仅 `rewardEligible` 发奖 | 不发复活 offer，按已确认进度结算 |
| `explicitExit` / `disconnectTimeout` | 是，仅 `rewardEligible` 发奖 | 只结束本人 run |
| `sessionReplaced` | 是，仅 `rewardEligible` 发奖 | 高优先级终局，重复连接不能双结算 |
| `serverDrain` / `roomFault` | 是，仅 `rewardEligible` 发奖 | 冻结已确认进度，不伪装成玩法超时 |

### 2.4 原子 settlement 与 outbox

首次取得 finalizing fence 的执行者在同一 MySQL 事务写：

1. `snake_run_settlement` 的 canonical evidence、资格、reward policy、冻结奖励摘要、effect hash 和状态；
2. `rewardEligible` 且金币大于 `0` 时写金币 `currency_ledger`；
3. `rewardEligible` 且 progression grant 非空时写 MySQL `gameplay_outbox` intent，供 relayer 将 XP、冻结专属碎片、
   成就进度和自动解锁原子写入 Bag/User。

对 `rewardEligible` run，碎片目标在首次 finalize 写事务前确定：先按自然键回读既有 settlement；不存在时，在
既有 per-user 串行边界内取得一次权威 S3 ownership snapshot，只用 run 已锁存的 catalog/policy 候选和 §2.6
固定顺序选目标并释放锁，再把 `fragmentTargetSkinId + fragmentCount` 与 catalog/policy 版本写入本次事务和
effect hash。不得持 Redis 用户锁
等待 MySQL I/O。snapshot timeout、损坏或版本无法解析时保持 Finalizing 并可重试，不能当成“四款全拥有”或任选
目标。唯一约束的竞争 loser、commit-unknown 或后续 replay 必须回读已落库 payload，不能重新查看当前衣柜再选目标。

最终 opId 至少绑定 `(sId, roomEpochId, runId, uid, rewardPolicyVersion)`。同 payload 重放返回同一 receipt；异
payload 必须隔离并告警，不能覆盖既有 settlement。金币是本局毛奖励：复活扣款已经在 S2R 独立记账，
`reliveCoinSpent` 只进入统计和展示，禁止在 settlement 再次扣除或把奖励改成净额。

服务端内部 item 编码冻结如下，必须由 catalog validator 验证全局唯一、在 Bag 合法范围内且不与 S3 的
`100000 + skinId` ownership、`200000 + skinId` fragment 段碰撞；这些 ID 不进入客户端 wire：

| 数据 | Bag item ID | 写入规则 |
|---|---:|---|
| Snake 累计 XP | `300000` | 非负 additive，满级后继续累积 |
| 成就 101/132/139/701 进度 | `300101` / `300132` / `300139` / `300701` | 非负 additive，在对应阈值饱和 |

普通 `item HINCRBY` 无法安全完成“跨阈值后唯一解锁”。S4 必须新增版本化、有界的 `snakeProgression` grant
（或等价单槽原子 Lua），但不能就地破坏现有 `EFFECT_SCHEMA_VERSION=1`：普通 v1 shop/mail effect 继续由原
decoder/apply 路由处理和 replay，新 grant 以兼容 union 的新 kind/grantVersion 分派。升级时已经 pending/dead 的
v1 outbox 必须继续可读可执行。

滚动发布严格 read-before-write：先把所有 relayer/恢复器实例升级为同时理解旧 v1 与新 grant 的版本，并通过能力
探针确认 singleton lease 已从旧 reader 完成交接；之后才允许新 settlement writer/reward policy 产生
`snakeProgression` outbox。回滚顺序相反，先关闭/排空新 writer，再撤回 reader；旧 relayer 未退场时绝不能让它
抢到新 kind 后误判 unknown/dead。

冻结的 progression effect 必须自包含 resolved XP/成就/ownership/fragment item IDs、各 candidate delta、全部
阈值、`fragmentTargetSkinId + fragmentCount`、catalog/policy/grant 版本和 payload hash；apply 不依赖 latest
registry。在同一幂等原子操作内完成：XP/四项成就增加与饱和、冻结目标碎片增加、按 post-XP/post-progress
状态补齐所有已达门槛但尚缺失的 S3 永久 ownership，并在本次确有新 ownership 时把
`snakeCosmeticVersion` 只递增一次。它与 S3 equip/unlock 写路径共用同一个 ownership + cosmetic-version CAS/递增
协议：S3 equip 的 UoW dirty commit 必须在一个 Redis 原子提交内再次比较 expected `snakeCosmeticVersion`，再写
equipped skin 并递增；S3 unlock Lua 与 progression Lua 对同一版本字段执行同样的原子校验/递增。`withUser` 锁
本身不能隔离不经该锁的 outbox relayer；若 progression 先递增，并发 equip 的旧
`expectedStateVersion` 必须得到 `STATE_CONFLICT`，不能覆盖自动解锁的版本。

Lua 把资产变化、applied marker、payload 绑定和本 op 的 `xp/level/progress/balance before/after +
newlyUnlockedSkinIds` outcome 原子写入同槽。已拥有皮肤的 ownership 是 no-op；同 opId 重放直接返回原 outcome，
不重复加数或重新计算“本次解锁”。relayer 取得 outcome 后，必须先在幂等 MySQL 守卫事务把 canonical outcome
回写 settlement/result row，再把 outbox 标成 done；崩在两步之间时从 Redis applied marker 重读 outcome 并补写。
done 后的长期历史/query 只读 MySQL 副本，不依赖会裁剪的 Redis marker。若实现新增 outcome key，必须登记到现有
用户 freeze/thaw、TTL/清理和诊断体系；也可在 done 前以内嵌 applied marker 承载，但不得留下未登记永久 key。
绝不能用 delayed absolute `setField`，也不能在 settlement 时读取当前绝对进度后拼一组非原子 item effect。

relayer 超过重试阈值后进入 `dead` 并留下告警/人工 replay SOP。客户端可按 `runId` 查询
同一 receipt：金币因与 settlement 同事务提交，只会是 `notGranted/applied`；聚合 progression 是
`notGranted/pending/applied/dead`。`pending/dead` 不得伪造 levelAfter 或 newlyUnlocked；人工 replay 始终复用原
opId，客户端不提供会创建经济写入的“补领”按钮。

### 2.5 金币与 XP 公式、硬顶

首发同时发金币和 XP。只有 §2.3 的 `rewardEligible` run 进入公式；两个结果都是非负整数，且只由本 run 的 confirmed
`activeTicks/score/kills` 决定：

```text
cappedComponent(x, numerator, denominator, componentCap)
  = min(componentCap, floor(max(0, x) * numerator / denominator))

coinGross = min(100,
  coinBase
  + cappedComponent(activeTicks, coinTimeNum, coinTimeDen, coinTimeCap)
  + cappedComponent(score,       coinScoreNum, coinScoreDen, coinScoreCap)
  + cappedComponent(kills,       coinKillNum, coinKillDen, coinKillCap))

xpGrant = min(300,
  xpBase
  + cappedComponent(activeTicks, xpTimeNum, xpTimeDen, xpTimeCap)
  + cappedComponent(score,       xpScoreNum, xpScoreDen, xpScoreCap)
  + cappedComponent(kills,       xpKillNum, xpKillDen, xpKillCap))
```

策略 validator 要求 base/分母为有界正整数，分子和组件 cap 为有界非负整数（允许拟合后关闭某组件），并使用
溢出安全的饱和整数运算，不能先让 `x * numerator` 越过 JS safe integer/后端整数范围再 clamp；全部参数与配置
hash 固化进 `rewardPolicyVersion`。具体系数不是新的产品选择，由 §2.8 的真人样本拟合；在冻结版本后改变任何参数都必须升版。
不合格 run 两项均为 `0`。公式没有首局、首胜、每日、成就、rank 或假榜 bonus；金币为毛收入，禁止减去
`reliveCoinSpent`。全局硬顶固定为每 run 金币 `100`、XP `300`，组件 cap 不能绕过全局硬顶。

### 2.6 等级、成就与专属碎片

Snake 等级只由 Bag 中累计 XP 派生，不持久化第二份权威 level：

```text
xpThreshold(level) = 50 * level * (level - 1), level ∈ [1, 10]
derivedLevel = min(10, max({ level | snakeXp >= xpThreshold(level) }))
```

| 等级 | 累计 XP 门槛 | 达到时自动解锁 |
|---:|---:|---|
| 1 | `0` | 默认皮肤 `1` 沿用 S3 语义 |
| 2 | `100` | 皮肤 `2` |
| 3 | `300` | — |
| 4 | `600` | 皮肤 `3` |
| 5 | `1000` | — |
| 6 | `1500` | — |
| 7 | `2100` | 皮肤 `4` |
| 8 | `2800` | — |
| 9 | `3600` | — |
| 10 | `4500` | — |

达到 10 级后 XP 继续累计，派生/展示等级封顶 10。皮肤 `2/3/4` 分别在首次跨过 L2/L4/L7 时由 §2.4 原子 grant
自动、幂等写入 S3 ownership；不设手动领取，也不附加金币或 XP，只影响下一次新 run 的可装备外观。

成就只累加 `rewardEligible` run 的 confirmed evidence，到门槛后饱和并在同一原子 grant 自动解锁；不合格或
奖励未启用的 run 不贡献进度，已经拥有目标皮肤仍保留饱和进度但不重复授予。为避免小数 score 与 Bag 整数漂移，
每个 `rewardEligible` run 的分数增量固定为
`max(0, floor(score))`：

| 成就皮肤 | 累计指标 | 门槛 | 展示/授予 |
|---:|---|---:|---|
| `132` | `activeTicks` | `36000`（20 Hz 下 30 分钟） | 衣柜锁定详情显示 tick 换算时长，达标自动解锁 |
| `101` | `kills` | `100` | 衣柜锁定详情显示 `current / 100`，达标自动解锁 |
| `139` | `starCollected` | `200` | 衣柜锁定详情显示 `current / 200`，达标自动解锁 |
| `701` | `floor(score)` | `100000` | 衣柜锁定详情显示 `current / 100000`，达标自动解锁 |

写入 effect 前先按门槛有界化：`candidateDelta = min(required, nonnegativeMetric)`；apply 再取
`appliedDelta = min(candidateDelta, max(0, required - progressBefore))`。因此合法超长 run 也不会产生无界 payload，
但单局越过门槛仍能完整达成成就。上述 score 的 `nonnegativeMetric` 就是按 run 取整后的值。

首发没有独立成就页或领取动作，也没有成就额外金币/XP。S4 只扩展 S3 snapshot/锁定详情的进度投影；自动解锁后
沿用 S3 的设备本地 `owned - viewed` 红点规则，不替用户写 viewed 状态。

每个 `rewardEligible` run 的专属碎片数量和目标固定为：

```text
scorePart = min(4, floor(max(0, score) / 1000))
killPart = min(4, floor(max(0, kills) / 5))
fragmentCount = 1 + min(4, scorePart + killPart)
priority = 401 -> 403 -> 133 -> 411
```

先把两个 part 各自饱和到 4 后相加，是已批准
`min(5, 1 + floor(score / 1000) + floor(kills / 5))` 在非负输入上的溢出安全等价式。

首次 finalize 使用 §2.4 的 ownership snapshot 选择顺序中第一个尚未拥有的皮肤，并冻结精确
`fragmentTargetSkinId + fragmentCount`；若四款均已拥有，则冻结
`fragmentTargetSkinId=null, fragmentCount=0`。数量范围因此为 `1..5` 或
全拥有时 `0`。重试、恢复和 replay 不重新选目标。若 outbox apply 前玩家已经通过 S3 合成/其他合法来源取得该
皮肤，仍把冻结数量加到原专属碎片余额并按 S3 规则保留超额，不改投其他皮肤、不转金币、不撤销奖励。

### 2.7 V2 个人结果与显式 ACK

`endRun` command handler 保持同步：校验后原子锁存终局意图、停止输入、按 runId 登记/复用 mode-owned tracked
Promise，并立即返回 `runFinalizing`；Promise 完成后只向本人推送唯一 receipt。重复 endRun、最终离场与 drain
必须 join 同一任务；同房其他玩家仍为 Playing。

`ISnakeRunResultV2` 至少公开以下业务语义；具体生成文件仍由 gameplay wire 真源生成，服务端内部 item ID 不得
下发：

```ts
type SnakeRewardComponentStatus = "notGranted" | "pending" | "applied" | "dead";

interface ISnakeRunResultV2 {
  resultVersion: 2;
  runId: string;
  finalizedAtMs: number;
  endReason: SnakeTerminalEndReasonType;
  confirmedThroughTick: number;
  catalogVersionAtRunStart: number;
  rewardPolicyVersion: number | null;
  receiptId: string;
  eligibility: {
    qualified: boolean;
    rewardEligible: boolean;
    reason: "qualified" | "notQualified" | "moderation" | "notEnabled";
  };
  stats: {
    skinIdAtRunStart: number;
    activeTicks: number;
    score: number;
    finalLength: number;
    maxLength: number;
    kills: number;
    deaths: number;
    relivesUsed: number;
    reliveCoinSpent: number;
    magnetCollected: number;
    starCollected: number;
    meaningfulInputCount: number;
  };
  coin: {
    amount: number;
    status: "notGranted" | "applied";
    balanceAfter?: number;
  };
  progression: {
    status: SnakeRewardComponentStatus;
    xp: {
      amount: number;
      status: SnakeRewardComponentStatus;
      before?: number;
      after?: number;
      levelBefore?: number;
      levelAfter?: number;
    };
    fragment: {
      skinId: number | null;
      amount: number;
      status: SnakeRewardComponentStatus;
      balanceBefore?: number;
      balanceAfter?: number;
    };
    achievements: Array<{
      skinId: 101 | 132 | 139 | 701;
      candidateDelta: number;
      required: number;
      status: SnakeRewardComponentStatus;
      appliedDelta?: number;
      progressBefore?: number;
      progressAfter?: number;
      unlockedThisRun?: boolean;
    }>;
    newlyUnlockedSkinIds?: number[];
  };
}
```

reason 的优先级固定为 `moderation → notEnabled → notQualified → qualified`；只有最后一种
`rewardEligible=true`。这样奖励关闭期的合格真人 run 仍可进入 §2.8 样本，但不会误写任何资产。

`finalizedAtMs` 是数据库分配的 Unix epoch 毫秒安全整数，离线稳定顺序以 `(finalizedAtMs, runId)` 断开并列。
`candidateDelta` 是 frozen evidence 算出的本局候选增量，`appliedDelta` 是阈值饱和后的真实增加量；后者只在
applied outcome 出现。四项 achievements 与 `newlyUnlockedSkinIds` 均按 `skinId` 升序。聚合 progression.status
表示单一 outbox 的物理状态；每个非零组件继承其 pending/applied/dead，零碎片或零成就候选固定为 notGranted，
使客户端能分别渲染 XP、碎片和四项成就而不伪造发放。

`pending/dead` 只展示冻结 grant 和状态，只有 `applied` outcome receipt 才可填 before/after、levelAfter、
balanceAfter、appliedDelta、progressAfter、unlockedThisRun 和 newlyUnlockedSkinIds。所有奖励自动发放，没有领取按钮。
在线当前 run 的匹配 V2 push 自动打开个人结果页；旧/乱序 live push 不覆盖当前 run。页面固定提供“再来一局”和
“返回首页”，progression 仍 pending/dead 时也可离开；
金币区分别标注“本局获得金币”和“复活消耗”，不得展示二次相减后的净额。dead 只提供刷新/查询和联系客服/运维
提示，经济 replay 只能由后端 SOP 以原 opId 执行。

离线恢复必须落在账号可用的 Lobby RPC，而不是只能连着原 room 才能调用的 command。新增 `snakeProgression`
descriptor/Feature 并走标准 codegen，冻结最小契约：

```text
snakeProgression.listUnacked(cursor?, limit=20)
  -> items: ISnakeRunResultV2[] / nextCursor?     // limit 取 1..20，最旧优先
snakeProgression.getRunResult(runId)
  -> ISnakeRunResultV2                           // 只允许当前 uid/sId 的历史
snakeProgression.ackRunResult(clientReqId, runId, receiptId)
  -> { runId, receiptId, acknowledged: true }
```

cursor 是绑定 uid/sId 与稳定排序键的不透明游标，单页最多 20，禁止无界响应。list/get 纯读取，不得隐式标记；
在线 push 或离线队列都只在对应结果页成功 mount 后发送显式 ACK。`clientReqId + canonical(runId, receiptId)` 绑定
通用幂等收据：同 ID 同 payload 返回同结果，同 ID 异 payload 返回 `OPERATION_CONFLICT` 且零写入；不同请求 ID
重复同一 `runId + receiptId` 也返回已 ACK 结果。同 runId 异 receipt 必须 `RESULT_RECEIPT_MISMATCH` 且零写入。
mount 失败、fetch 后退出或 ACK 回包丢失时允许重投；
ACK 成功后不再自动弹出，但 receipt 仍按既有 settlement/history 保留策略供 get 查询，不因 ACK 删除。账号启动/
返回首页时处理离线队列，不在另一局 Playing 中强插旧结果页。

### 2.8 真人样本、调参与版本发布

S4-07 必须收集至少 `100` 个去重、合格、真实人工参与的当前 S4 evidence 版本内测 run；纯模拟、AI 和假榜不能计入
100 个门槛，但可以补充边界验证。报告至少记录样本筛选/排除原因，以及 activeTicks/等价时长、score、kills、
meaningfulInputCount、coinGross、xpGrant 的 p50/p90/p95 和最大值。所有 percentile 统一使用升序 nearest-rank，
即对零下标有序数组和样本数 `n` 取 `pXX = values[ceil((XX / 100) * n) - 1]`，不插值；离线回放候选参数，
直到同时满足：

| 指标 | 首发目标 |
|---|---:|
| 金币 p50 | `25..35`（围绕产品目标约 `30` 的工程验收带） |
| 金币 p95 | `<= 80` |
| 金币单 run 最大值 | `<= 100` |
| XP p50 | `80..120`（围绕产品目标约 `100` 的工程验收带） |
| XP p95 | `<= 250` |
| XP 单 run 最大值 | `<= 300` |

样本不足或任一目标不满足时，S4-07 与整个 S4 均不得标记完成，奖励 launch flag 保持关闭。达标参数连同样本摘要、
policy config/hash 和 replay fixture 冻结为 `rewardPolicyVersion=1`；等级/成就/碎片常量不随本轮拟合改动。S4
通过只产生技术放行资格，玩家可见 launch flag 仍保持关闭，实际 go/no-go 与开启动作唯一归 S5。冻结后如需调参
只能生成版本 2+，按 §2.1 的“旧房 Draining、旧 run 旧策略、新房新策略”切换并保留跨版本回放证据。

## 3. 详细任务

### S4-01：原位扩展 S2R run/checkpoint schema

- [ ] **动作：** 在 S2R 的 `snake_player_run`、repository 和 checkpoint codec 上增加完整统计（含
  `magnetCollected/starCollected/meaningfulInputCount`）、复用 `skinIdAtRunStart/catalogVersionAtRunStart`，并增加
  输入计数 anchors、准入冻结的 nullable reward policy、实施时 registry 的下一版 `S4_EVIDENCE_VERSION` 与
  `confirmedThroughTick`；为缺少 evidenceVersion 的旧最小记录提供显式 legacy 解码、向前迁移和状态校验。
- **产物：** 单一 `SnakePlayerRunLedger` schema、幂等 migration、版本化 codec 和旧记录读取策略。
- **验证：** 仓库中不存在第二张平行 OPEN run/账本；字段缺失的旧 S2R 记录能恢复或按
  `rewardPolicyVersion=null/notEnabled` 终局且不追发，显式未知 evidenceVersion fail closed，不猜测奖励字段。

### S4-02：实现权威统计和 checkpoint

- [ ] **动作：** 在 fixed step 的规定边界累计 activeTicks、score、final/max length、kills/deaths、磁铁、Star 和
  符合 `9°/boost` 规则的 meaningful input 等 canonical evidence；在关键状态边界和最多每 100 ticks 写单调
  checkpoint。
- **产物：** 统计聚合器、checkpoint scheduler、版本/fence 与 confirmed-through receipt 字段。
- **验证：** 准备/断线/全部复活状态/Finalizing 不计时；死亡发生 step 计入一次；activated 后下一 step 才继续；
  旧/重复 seq、未越过 9° 基准、同方向 heartbeat、自动移动不计 meaningful input；anchors 重连/恢复一致；乱序或
  重复 checkpoint 不能回退版本或重复触发奖励。

### S4-03：建立终局原因和唯一 finalizing fence

- [ ] **动作：** 实现显式 `SnakeRunEndReason` 资格矩阵、`600 ticks + score/kills/3 次有效输入` 统一 gate、持久
  terminalIntent 优先级和任一 live state 到 finalizing/finalized 的 CAS；preparing 只可 cancelled。
- **产物：** 终局 reducer、资格策略、canonical evidence freeze 和审计记录。
- **验证：** death decision、endRun、断线超时、顶号、moderation、drain、room fault 并发时只有一个最终原因和
  一个奖励执行者；599/600 ticks、2/3 次有效输入和任一正分/击杀边界符合 §2.3；较高优先级可在冻结前覆盖，
  冻结后不可改写。

### S4-04：扩展 awaited final-leave 与 `endRun`

- [ ] **动作：** 复用并扩展 S2R 的 `preparePlayerFinalLeave`，先 durable freeze 再释放实体/席位；同步
  `endRun` 只登记可追踪任务，leave/dispose/drain 均 join；与 relive receipt/退款按同一 terminalIntent 收敛。
- **产物：** 通用 hook 扩展、mode-owned finalize registry、typed runFinalizing/runResult 流程。
- **验证：** 无 detached Promise；未冻结不能删实体；activation 前退款与 activation 后立即 finalize 都不会重开
  输入；最后真人 durable freeze 完成后才允许 autoDispose。

### S4-05：实现原子 settlement、ledger 与 gameplay outbox

- [ ] **动作：** 为全部已开始 terminal run 写 durable settlement/result；rewardEligible run 首次 finalize 先按
  S3 ownership snapshot 冻结碎片目标，再在单一 RC 事务写 settlement、金币 ledger 和聚合 progression outbox
  intent，以 frozen evidence/effect hash 和稳定 opId 绑定 payload；checkpoint 与最终 opId 完全分离，金币按毛
  奖励写入且不减复活花费。
- **产物：** `snake_run_settlement`、分组件 reward receipt、ledger/outbox 写路径、碎片目标快照和 payload
  conflict 隔离。
- **验证：** 事务任一点失败整笔回滚；提交结果不明按 opId/自然键回读；同 payload 重放同 receipt，异 payload
  隔离；ownership snapshot 失败保持 Finalizing 且零写入，碎片目标在重试/合成竞态后不重选；相同 evidence、
  不同 `reliveCoinSpent` 不改变毛奖励；checkpoint 永远不产生 ledger/outbox。

### S4-06：实现原子 progression grant 与 relayer 恢复

- [ ] **动作：** 以兼容 union/版本分派实现 §2.4 的有界 `snakeProgression` effect/Lua，把 XP、四项饱和成就进度、
  冻结目标碎片、等级/成就 ownership 与一次 cosmetic version 递增原子化；把同槽 per-op outcome 先幂等回写
  MySQL settlement/result 再标 outbox done；按 reader-first/writer-second 发布，并为 pending/dead 建重试、查询、
  告警和人工 replay SOP。
- **产物：** 向后兼容的 versioned effect codec、self-contained payload、与 S3 共用 CAS 语义的原子脚本、relayer
  handler、Redis applied outcome + MySQL 历史副本、状态查询 API 和 replay 操作说明。
- **验证：** 既有 v1 shop/mail pending/dead outbox 升级后仍可 replay；乱序、重复、跨进程重放、apply 后回包丢失
  及“Lua 成功/MySQL outcome 回写前”崩溃均返回同 outcome，不覆盖新值、不双发；并发跨 XP/成就阈值或与 S3
  equip/unlock 竞争时 ownership 唯一、cosmetic version 不丢且 stale write 冲突；旧 registry 卸载后 frozen effect
  仍可 replay；旧 reader 活跃时 writer 门禁拒绝开启，回滚先停 writer；dead 只能按原 opId 由 SOP replay，跨区/
  不同 sId 严格隔离。

### S4-07：实现版本化奖励策略与反滥用边界

- [ ] **动作：** 收集不少于 100 个去重合格真人 run，按 §2.8 报告分布并仅拟合金币/XP 的 base/time/score/kill
  系数；验证已经批准的资格、硬顶、等级、成就与碎片表，随后冻结 `rewardPolicyVersion=1`、config/hash 和历史
  replay fixture。
- **产物：** 真实分布调参报告、版本化奖励策略、四张已批准规则表的边界向量、开关/rollover 配置和跨版本 fixture。
- **验证：** 样本数量和 nearest-rank p50/p90/p95 可追溯，金币/XP 同时达到目标；重复短 run 不能刷 base，
  超长 run 受 `100/300` 硬顶；同 evidence 同版本稳定，旧 run 重放不串入新版本；不存在 rank/首局/首胜/成就 bonus。

### S4-08：完成个人结果 Logic/View 与到账状态

- [ ] **动作：** 落地 `ISnakeRunResultV2` 与 V1/V2 兼容，只由匹配当前 runId 的 live push 自动打开本人结果页；
  分别展示统计、毛金币、XP/碎片/成就状态、等级进度和新解锁，提供“再来一局/返回首页”；通过账号 Lobby
  descriptor/codegen 增加有界 oldest-first list/get 与 mount 后显式幂等 ACK，不等待 room Settle。
- **产物：** V2 wire、run result ViewModel、FGUI 结果页、`snakeProgression` Feature/RPC、稳定游标、snapshot 恢复和
  pending/dead 文案。
- **验证：** 同房其他玩家页面/phase 不变化；旧/乱序 live result 不覆盖当前 run；pending/dead 可离开且不伪造
  applied outcome，dead 无经济重试按钮；fetch 不 ACK、mount 后 ACK、ACK 回包丢失/重复及 ACK 后不再自动展示均
  有 fixture，历史 receipt 仍可查。

### S4-09：完成竞态、崩溃和长驻房回归

- [ ] **动作：** 对全部 endReason、资格边界、relive receipt 状态、checkpoint/事务/outbox 崩溃窗口、S3 合成/
  自动解锁竞态、结果 ACK、policy rollover、重连、重复 finalize、churn 与最后真人离场建立单测和真栈故障 fixture。
- **产物：** 可重复 fault matrix、真 Redis/MySQL 证据、内存集合水位断言和恢复日志。
- **验证：** 已确认进度不漏奖、不双发；relive 与 settlement 各自只有一个胜者；大量循环后 finalized run、任务、
  participant、结果游标和 pending AI 引用回落到当前在线规模；旧房 drain 后旧 run/新房 run 各自稳定使用正确版本。

## 4. 故障与验收矩阵

| 场景 | 注入点/竞争 | 预期收敛 | 主要任务 |
|---|---|---|---|
| Preparing 离场 | OPEN run 尚未 Active | `cancelled`，无 settlement/ledger/outbox | S4-01/03 |
| 零奖励终局 | moderation/notEnabled/notQualified 且已开始 run | 有 durable 零奖励 result receipt，无经济 ledger/outbox | S4-03/05/08 |
| 资格 tick 边界 | `599/600` confirmed ticks，分别组合正分/击杀/输入 | `599` 一律不合格；`600` 还须贡献条件命中 | S4-02/03/07 |
| 输入贡献边界 | 2/3 次有效改变、旧 seq、同方向 heartbeat、自动前进 | 仅 3 次服务端接受且实际改变的意图可单独满足贡献条件 | S4-02/03 |
| 输入基准恢复 | 连续小角度累计越过 9°、断线/崩溃后重发 | 只按 restored anchor 计一次；服务端重建 baseline 本身不计 | S4-01/02 |
| 同 payload 重复 finalize | 同/异进程重复 endRun/leave | 同一 receipt，不重复资产 | S4-03/05 |
| 异 payload 同 opId | evidence/effect hash 不同 | 隔离并告警，不覆盖首个 settlement | S4-05 |
| checkpoint 后、finalize 前崩溃 | 已更新 confirmedThroughTick | 恢复后只按最新已确认 evidence 结算一次 | S4-02/03 |
| settlement 事务提交前崩溃 | 任一 SQL 写后 kill | 整笔回滚，可安全重试 | S4-05 |
| settlement 提交回包丢失 | COMMIT 成功后 kill/timeout | 按自然键回读既有 receipt，不重复写 | S4-05 |
| ownership snapshot 失败 | timeout/损坏/版本不可解析 | 保持 Finalizing 可重试，零 settlement/ledger/outbox，不猜全拥有 | S4-05 |
| Effect V1 存量升级 | 升级前留有 shop/mail pending/dead | 仍由 v1 路由 decode/apply/replay，不被 progression union 打死 | S4-06 |
| 新旧 relayer 滚动发布 | 旧 reader 尚持 lease 时尝试开启新 writer | 能力门禁拒绝；reader 全部兼容并交接后 writer 才产新 kind | S4-06/09 |
| outbox apply 重复/乱序 | relayer crash/replay | additive effect 恰好一次语义，不覆盖新值 | S4-06 |
| apply 成功但回包丢失 | Lua 已写资产/outcome 后断线 | 原 opId 回读同 outcome，不重复进度/所有权 | S4-06 |
| outcome 回写窗口崩溃 | Lua applied 后、MySQL result 前或 result 后/done 前 kill | 重读 Redis outcome 幂等补 MySQL，再标 done；历史最终只读 MySQL | S4-06/08 |
| outbox 长期失败 | 超过重试阈值 | 状态 `dead`、告警、同 opId 人工 replay | S4-06/08 |
| XP 跨级边界 | `99→100`、`599→600`、`2099→2100`、`4499→4500` | L2/L4/L7 皮肤各只解锁一次；L10 后 XP 继续、显示 10 | S4-06/07 |
| 成就跨阈值 | 四指标各以 threshold-1/threshold 并发 apply | 进度饱和、ownership 唯一、一次 grant 的 cosmetic version 只增一次 | S4-06/07 |
| 自动解锁与 S3 写竞争 | progression apply 并发 equip/unlock stale version | 共用 CAS/递增语义；自动解锁不丢，stale 客户端写冲突 | S4-06/09 |
| 碎片数量与目标 | count `1..5`、不同 owned 集合、四款全拥有 | 按 `401→403→133→411` 冻结首个未拥有；全拥有为 `null/0` | S4-05/06/07 |
| 碎片冻结后先合成 | settlement 已选目标、outbox 尚未 apply | 原目标碎片仍到账并保留盈余，不重选/转换 | S4-05/06 |
| relive 与 endRun 竞争 | charged/applying/applied/ready/activated 各点 | activation 前退款后 finalize；activated 后立即 finalize；只奖一次 | S4-03/04 |
| 复活花费与毛奖励 | 相同 evidence、不同 `reliveCoinSpent` | coinGross/XP 完全相同，结果另列复活消耗 | S4-05/07/08 |
| death decision 与离场竞争 | decline/timeout/endRun/disconnect 同时发生 | terminalIntent 优先级与 CAS 产生唯一原因/结果 | S4-03/09 |
| session replaced/moderation | 与低优先级死亡原因竞争 | 高优先级在 evidence 冻结前胜出；moderation 不发资产 | S4-03 |
| 断线宽限内重连 | 同一 run 尚未终局 | 延续 run，不结算；断线时间不计 activeTicks | S4-02/04 |
| 断线宽限耗尽后重入 | 原 run 已 finalized | 原 run receipt 可查；新准入创建新 run | S4-04/08 |
| 最后真人离场 | 房内仍有 AI/假榜 | 先冻结/结算真人，再停止 tick/autoDispose；AI 不维持房间 | S4-04/09 |
| 房内另一真人结算 | 同房仍 Playing | 仅本人收到 runResult，其他玩家不见全房结算页 | S4-04/08 |
| 硬崩溃在 checkpoint 窗口 | 最近内存进度未确认 | 只恢复 confirmedThroughTick，不伪造未确认奖励 | S4-01/02/08 |
| 结果 fetch/ACK 竞争 | fetch 未 mount、ACK 回包丢失/重复、同 clientReqId 异 payload | ACK 前最旧优先重投；同 payload 幂等、异 payload 冲突；ACK 后停弹但历史可查 | S4-08/09 |
| 结果组件投影 | fragment/某成就候选为 0，XP outbox pending/dead | 零组件 notGranted；非零 XP/碎片/成就分别继承真实状态 | S4-06/08 |
| V1/V2 客户端组合 | modeVersion 握手与旧/新结果交叉 | 按兼容矩阵接收或明确拒绝，不把 V1 item summary 当 V2 | S4-08/09 |
| policy/catalog rollover | 旧房仍有 OPEN run 时发布新版 | 旧房 Draining 停准入并按旧版收口；新房用新版；旧 receipt 可重放 | S4-01/07/09 |
| 旧 registry 卸载后 replay | frozen progression outbox 进入 dead 后移除旧 registry | self-contained effect 仍以原 IDs/阈值/target 返回同 outcome | S4-06/09 |
| displayRank/AI/假榜污染 | 构造高假榜分数或 AI 击杀 | 资产结果不变；只读取真人 ledger | S4-05/07 |
| 超长/短 run 滥用 | 极端 activeTicks/score/kills 或重复短 run | 资格/base 门槛生效，coin/XP 分别不超过 `100/300` | S4-07 |

## 5. 退出条件

- [ ] S4-01～S4-09 全部完成；S2R 的最小 run/checkpoint 是唯一被扩展基座，仓库中没有第二套平行账本、hook
  或 runId 生命周期。
- [ ] 实施时注册的 `S4_EVIDENCE_VERSION` 原位包含 Star/磁铁/meaningful input 及计数 anchors；字段缺失的旧记录
  以 legacy + nullable policy/notEnabled 收口，显式未知版本 fail closed，未猜测或追发历史奖励。
- [ ] 全部有效 endReason 都有显式资格；`600 ticks + 任一贡献` 边界通过，moderation 不发资产，preparing/cancelled
  不结算，成功复活不结算。
- [ ] `activeTicks`、meaningful input、100-tick checkpoint、confirmedThroughTick 的边界测试通过，只承诺已确认进度。
- [ ] 所有已开始 terminal run 都有 durable result receipt；首次 rewardEligible finalize 在同一事务写
  settlement/金币 ledger/gameplay outbox。同 payload 重放、异 payload 隔离和 commit-unknown 回读均有真栈证据；
  ownership snapshot 失败零写入，碎片目标随 effect 冻结，毛金币未二次扣复活花费。
- [ ] XP/碎片/成就与自动 ownership 使用原子、幂等 progression grant，per-op outcome 可重读；relayer 的
  Redis outcome → MySQL result → outbox done 顺序、旧 Effect V1 兼容、S3 cosmetic version CAS、
  pending/applied/dead 查询、重放和人工 SOP 可用，皮肤熟练度未被误列为首发必做。
- [ ] endRun、最终离场、断线、顶号、moderation、drain、room fault 与所有 relive 状态竞争不漏奖、不双发、
  不吞退款，也不向其他玩家广播结果页。
- [ ] 至少 100 个合格真人 run 的样本和 nearest-rank p50/p90/p95 报告可追溯；金币/XP 达到 §2.8 目标并冻结 policy 1，
  样本不足时 launch flag 确实保持关闭；AI、纯模拟、displayRank 和假榜未计入样本或资产路径。
- [ ] 等级 `L1..L10`、L2/L4/L7 解锁、四项成就阈值、碎片 `1..5`/固定顺序/全拥有为 0 均有上下界、并发、
  回放证据；满级 XP 继续累计，自动解锁只影响表现。
- [ ] `ISnakeRunResultV2` 和 V1/V2 兼容矩阵可用；金币/progression 分组件状态、双按钮、oldest-first query、
  20 条有界分页、按 runId 查询、mount 后幂等 ACK 与 ACK 后保留历史均通过客户端/协议 fixture，客户端没有
  经济补发按钮。
- [ ] catalog/reward policy 在准入冻结；旧房 Draining/旧 run 旧版/新房新版及历史 settlement replay 有验证，
  finalize 从未读取 latest 改算。
- [ ] 最后真人先 durable freeze 再 autoDispose；长时间 churn 后内存集合回落到在线规模。
- [ ] 阶段证据已回写本页并同步 [README 状态表](README.md#8-总状态与证据汇总)。只有本阶段退出后，才可把
  “衣柜与可靠养成奖励闭环”列为完成能力；S4 只提交技术放行资格，玩家可见开关仍由 S5 唯一决策和执行。

## 6. 风险与回退

| 风险 | 防线 | 失败时回退 |
|---|---|---|
| 另建奖励账本，与 S2R run/receipt 分叉 | 原位 migration、同一 repository/runId、schema 守门 | 停止迁移，按字段缺失读取 legacyS2R；不得双写两套账本 |
| drop-in 离场先删实体导致证据丢失 | awaited final-leave 先 freeze 后释放 | 保留席位/Finalizing，恢复器继续收口 |
| 同步 command 内启动 detached async finalize | mode-owned registry、重复请求 join | 保持 run Finalizing；不返回伪造完成结果 |
| relive apply/refund 与 reward finalize 并行 | durable terminalIntent、join 同一 task、唯一 finalizing fence | activation 前先退款；无法收敛时不发奖励结果 |
| checkpoint 被误当最终奖励 intent | checkpoint 与 settlement/opId 分离 | 只更新 evidence，拒绝发现的提前 outbox |
| `runStartedTick` 相减夸大活跃时长 | fixed-step activeTicks 条件 | 只按已确认 activeTicks 结算 |
| 普通 item effect 跨阈值丢解锁或重复 ownership | 原子 progression grant + per-op outcome + 幂等 opId | outbox 隔离进入 dead/SOP，不拆成 setField/item 补丁 |
| 新 effect 版本打死存量 shop/mail outbox | v1 decoder 保留 + union/grantVersion 分派 | 关闭新 grant，恢复 v1 relayer；不得原地重写旧 payload |
| 旧 relayer 抢到新 grant 后标 dead | reader-first/writer-second 能力门禁与 lease 交接 | 先停新 writer，再恢复兼容 reader；不得让旧 reader 带新 kind 运行 |
| 自动解锁与 S3 equip/unlock 互相覆盖版本 | 共用 ownership/cosmetic-version CAS 协议 | stale 写返回 STATE_CONFLICT，不做绝对版本补丁 |
| ownership snapshot 失败被误作全拥有 | snapshot fail closed、Finalizing 可重试 | 零写入等待恢复，不选 null/随机目标 |
| 延迟发放时重新选碎片目标 | settlement 冻结 fragmentTargetSkinId/fragmentCount/effect hash | 只发冻结目标；已拥有仍保留盈余，不改投/换币 |
| 用当前账号值伪造某局等级前后值 | apply 原子 outcome 先回写 MySQL 再 done | pending/dead 不展示 after；历史只回读该 op 的 MySQL 副本 |
| 假榜/AI/退出排名进入奖励 | 结算输入类型只接受真人 ledger | fail closed 并隔离 settlement payload |
| 硬崩溃未确认窗口被宣传为可恢复 | receipt 明示 confirmedThroughTick | 只展示已确认进度；需缩窗另立持久化调优 |
| finalize 读取 latest 导致跨版本改算 | 准入锁存 policy/catalog、旧 registry 保留、effect 自包含 | 旧房 Draining 停准入，按旧版本收口，不热改历史版本 |
| 真人样本不足却开启奖励 | 100-run 守门、报告计数与 launch flag | 保持开关关闭；继续采样/离线拟合，不用 AI/模拟补人数 |
| S4 越权开启玩家奖励 | S4 仅产技术放行资格、S5 是唯一 go/no-go owner | 维持玩家开关关闭，交由 S5 汇总证据 |
| fetch 被误当已读导致离线结果丢失 | durable unacked + mount 后显式幂等 ACK | ACK 前重投；ACK 后仅停自动展示，保留历史查询 |
| 运维直接关闭长驻房 | Active→Draining，停准入并冻结 run | 延迟 close 至有界 drain；失败记录 roomFault/可恢复证据 |

## 7. 证据回写

未实际运行的命令不得填写为通过。故障证据至少写明注入点、事务/receipt 最终态、重复运行次数和余额/Bag
前后值；只写“测试通过”不构成崩溃窗口证据。

| 状态 | commit | 自动验证（命令、exit code、计数、日期） | 真栈/故障证据 | 备注 |
|---|---|---|---|---|
| `[已拍板·待实施]` | — | — | — | 2026-09-03 用户“按推荐全部采用”：资格/硬顶、10 级曲线、4 项成就、碎片公式与顺序、自动结果/ACK、100 真人 run 与版本切换口径均已冻结；实施仍须证明扩展而非重建 S2R 账本 |

---

[← S3 · 衣柜与服务端权威装备](s3-wardrobe-and-equipment.md) · [专项索引](README.md) · [S5 · 验收与发布 →](s5-validation-and-release.md)
