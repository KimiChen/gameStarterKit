# S2R：可靠金币复活

> [专项索引](README.md) · [上一阶段：S2 竖版战场与无尽生命周期](s2-battle-and-endless-lifecycle.md) ·
> [下一阶段：S3 衣柜与装备](s3-wardrobe-and-equipment.md)

## 状态、预计与依赖

| 项目 | 口径 |
|---|---|
| 状态 | `[已拍板·待实施]` |
| 预计 | 4–6 人日；不含 S4 奖励数值调优 |
| 前置依赖 | [S2](s2-battle-and-endless-lifecycle.md) 已交付稳定的 run/death 状态机、typed wire、`roomEpochId`、测试 `ReliveEconomyPort` 与关闭状态的发布开关 |
| 本阶段输出 | 通用 awaited 准入/离场钩子、最小持久真人 run/checkpoint、五档真实金币策略、decision/charge/apply/activate/refund 收据、恢复器、真实余额 UI 与全崩溃窗口证据 |
| 后续依赖方 | S3 复用 `preparePlayerAdmission` 锁存权威装备；S4 扩展同一 run 账本与 `preparePlayerFinalLeave` 做奖励结算 |
| 发布门禁 | **S2R 的数据库、恢复器、生命周期 join、客户端真实收据和故障矩阵全部通过前，`onlineCoinRelive5V1` 必须保持关闭。S2R 只签发技术准入结论，实际 go/no-go 与开启动作唯一归 S5。不得以 S2 测试端口或部分 happy path 提前开放。** |

本文件是 S2R 的实施与验收真相。全仓当前状态仍以 [plan-v5.md](../../plan-v5.md) 为准；事务、锁、fence、
幂等、outbox、Redis 与 MySQL 约束遵守 [服务端开发约束](../SERVER.md) 和根 `AGENTS.md`。

## 目标与非目标

### 目标

1. 将 S2 的测试 `ReliveEconomyPort` 替换为真实、可恢复、可审计的金币复活适配器，同时保持 S2 已冻结的
   4/100/20/60 tick 状态语义和 typed wire 不漂移。
2. 在发出 offer 前持久保存完整 death snapshot 与策略依据，使进程重启、断线重连和 push 丢失都能恢复同一
   `runId + deathSeq`。
3. 通过跨进程 decision 绑定、自然业务收据、货币行锁、ledger、run checkpoint 和 CAS，保证同一死亡最多
   扣一次、复活一次、退款一次或终局一次。
4. 建立 `charged → applying → applied → activated` 与 `refunded` 的可恢复收据状态；只有确认交付至少一个
   provisional Active step 并持久写入 activated 后，金币扣费才成为不可反转的成功交付。
5. 在 activation 确认前发生故障、终局意图或无法恢复时，按用户有利原则可靠退款；退款未完成前 run 保持
   Finalizing，不伪造 timeout、免费复活或内存终态。
6. 为 admission、final leave、disconnect、drain、onDispose 和恢复器建立通用 awaited/generation 边界，禁止
   detached 扣费、迟到生成或先删 run 后留悬空资产。
7. 用真栈故障注入覆盖数据库提交不明、进程 kill、租约接管、缓存失效、跨区隔离和生命周期竞争；全部通过后
   只记录 `eligibleForEnable=true` 的技术准入证据，发布开关仍保持关闭并交由 S5 决策。

### 非目标

- 不新增 S4 的金币/经验/碎片奖励，不在 checkpoint 阶段创建 reward intent，不实现最终 reward outbox。
- 不另建第二套 run 账本；S4 必须扩展本阶段的 `snake_player_run` 和 `preparePlayerFinalLeave`。
- 不实现 S3 的皮肤所有权、衣柜、装备 CAS 或碎片 Lua；本阶段只提供其复用的通用 admission hook。
- 不把复活扣费与 run 结束奖励合并成一个事务；两条业务链使用不同收据、opId 和恢复逻辑。
- 不接入广告、分享、广告券、钻石、现金、月卡、新手免费复活或无限复活卡；首发只接受
  `paymentType="coin"`。
- 不在客户端本地扣余额、决定费用、生成蛇、延长 deadline 或宣告退款完成。
- 不用 gameplay outbox Effect 表示生成蛇；蛇实体恢复是当前 room generation 的 mode-owned 工作。
- 不允许“基础设施失败后免费复活”“先记失败再让后台继续扣费”或只存在内存的伪退款终态。
- 不在通用 shell 中硬编码 Snake 分支；新增能力必须是其他 mode 可选择实现的通用 hook/capability。

## 冻结口径

### 复活策略与状态边界

本阶段继续使用 S2 冻结的 `onlineCoinRelive5V1`：

| 成功复活档位 | 金币费用 | 决策窗 | 保护 |
|---:|---:|---:|---:|
| 1 | 100 | 100 tick / 5 秒 | 含 provisional 首 tick 的 60 tick / 3 秒 |
| 2 | 200 | 100 tick / 5 秒 | 同上 |
| 3 | 300 | 100 tick / 5 秒 | 同上 |
| 4 | 300 | 100 tick / 5 秒 | 同上 |
| 5 | 300 | 100 tick / 5 秒 | 同上 |

只有复活权 `applied` 事务成功才推进 `relivesUsed`，只有最终 `activated` 才构成不可退款的交付证明。余额不足、
spawnFailed、未扣费系统失败和 activation 前退款都不消耗档位。第五次成功后再次死亡不发 offer。

外部可见状态沿用：

```text
preparing | active | deadPresentation | reliveOffering | pendingRelive
| reliveSpawning | reliveCommitting | reliveReady | finalizing | finalized | cancelled
```

`activationCommitting` 是 mode 内部短暂状态，不作为客户端可操作状态。对客户端，`reliveOffering` 和
`reliveReady/activationCommitting` 都表现为“复活处理中”；客户端只在 schema 投影为 Active 且收到或重建
canonical `revived` 后恢复操作。

### 最小真人 run/checkpoint

S2R 建立后续阶段唯一可扩展的 `snake_player_run`（名称可采用等价通用表，但语义不得拆成第二套账本）。最低
字段集如下：

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
  // 只持久恢复源流程明确恢复的累计字段；连杀、攻击和碰撞等单生命瞬态不恢复
}

interface SnakePlayerRunCheckpoint {
  roomEpochId: string;
  runId: string;
  uid: string;
  sId: number;
  sessionId: string;
  skinIdAtRunStart: number;
  state: "preparing" | "active" | "deadPresentation" | "reliveOffering"
    | "pendingRelive" | "reliveSpawning" | "reliveCommitting" | "reliveReady"
    | "finalizing" | "finalized" | "cancelled";
  stateVersion: number;
  runStartedTick: number | null;
  runEndedTick: number | null;
  terminalIntent: SnakeRunEndReason | null;
  endReason: SnakeRunEndReason | null;
  activeTicks: number;
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
  confirmedThroughTick: number;
}
```

S2R 沿用 S2 的唯一 `RunSkinResolver` 准入接缝：S3 交付前，真人解析为服务端默认皮肤 `1`，服务端测试夹具可
显式覆盖；客户端 join 数据永远不能决定该值。`skinIdAtRunStart` 在持久创建 run 时写入，此后死亡快照、复活、
宽限重连和最终结果都复用这一不可变值。S3 只替换同一 resolver 为 Bag/User 权威读取，并在同一 run 上增加
`catalogVersionAtRunStart`，不得另造准入路径。

准入先持久创建 `state=preparing, runStartedTick=null` 的 OPEN run，成功后才允许创建席位/蛇。首次世界在 3 秒
准备后的第一个可操作 tick、后续 drop-in 在实际出生且可操作的 tick，以 CAS 写 `runStartedTick` 并转 Active。
Preparing 离场只转 Cancelled，不生成结算或奖励。宽限内重连延续同一 run；最终离开后再加入创建新 run。

S2R 的 checkpoint 只服务准入、死亡、复活、离场冻结与故障恢复；S4 再增加完整奖励证据。任何 S2R checkpoint
都不得生成 reward intent、占用最终奖励 opId 或声称养成奖励已完成。

`activeTicks` 的唯一计数点是 fixed step 开始：仅 `connected && alive && state=active` 时加一，所以发生死亡的
当前 step 计入，随后死亡演出、Offering、Pending、Spawning、Committing、Ready、activation 确认、断线宽限
与 Finalizing 均不计。activated 提交后从下一 step 恢复。`runStartedTick` 只是时间轴锚，不可相减替代
`activeTicks`；硬崩溃时只承诺恢复到 `confirmedThroughTick`，不虚构尚未 checkpoint 的进度。

### 决策、收据与幂等键

复用现有 `user_currency`、`currency_ledger`、`withUser(fence)`、`withRcTx`、`debitInTx/creditInTx`，新增
`snake_relive_decision` 和 `snake_relive_receipt`（或严格等价的通用业务表）：

```text
唯一业务键 = (uid, sId, roomEpochId, runId, deathSeq)
请求绑定键 = (uid, sId, clientReqId) + canonical payload hash

canonical payload =
  command/decision/uid/sId/roomEpochId/runId/deathSeq/
  reliveIndex/coinCost/relivePolicyVersion

reliveIndex = relivesUsed + 1                 // 1-based
chargeOpId = stableHash(uid/sId/roomEpochId/runId/deathSeq/"charge")
refundOpId = stableHash(chargeOpId, "refund")

receipt state = charged | applying | applied | activated | refunded
decision state = processing(owner/generation/lease) | resolved(canonical result)
```

同一 `clientReqId + canonical payload` 返回同一结果；同 ID 异 payload 返回冲突。已经持久解析成失败的 ID 不再
尝试，用户重新点击必须生成新 ID。若提交结果不明，decision 保持 processing 并通过 run/receipt 自然键查明，
不能先记 `retryableFailure` 再让同一业务后台继续扣款。

有界参数冻结为：

| 参数 | 值 | 语义 |
|---|---:|---|
| `reliveOfferPersistTimeoutMs` | 3000 | offer 依据持久化的有界窗口；失败则不发窗、不扣费 |
| `reliveCommitTimeoutMs` | 5000 | 当前请求在 mode 内维持唯一提交任务的窗口 |
| `reliveApplyLeaseMs` | 15000 | decision/receipt owner lease；过期后可被恢复器 claim |
| `reliveSpawnMaxWaitTicks` | 20 | 扣费前寻找安全出生点的最大世界 tick |
| `decisionWindowTicks` | 100 | offer 成功持久后冻结的服务端选择 deadline |
| `protectTicks` | 60 | 从 provisional 首个 Active tick 起算的蛇身/首领碰撞保护 |

### Offer 持久化先于展示

普通且有档位的死亡先进入 `reliveOffering`。mode-owned task 以 `runId + deathSeq` 去重，并在 3000 ms 内持久
写入：

- `deathSnapshotVersion`、完整 canonical `deathSnapshot` 与 hash；
- `reliveIndex`、`coinCost`、`relivePolicyVersion`；
- 当前 run generation/token 和无终局意图条件。

提交成功后，才在下一个权威 tick 冻结 `offeredTick` 与
`decisionDeadlineTick=offeredTick+100`，CAS 到 `pendingRelive` 并下发 offer。持久化失败必须以
`reliveSystemFailed` 结束该 run；不得先显示一个重启后无法恢复的窗口。push 丢失时，客户端从权威 run state
恢复同一 offer。

### Accept、spawn、扣费与应用

1. `reliveDecision` 先写/读 decision 请求绑定，再以 `runId + deathSeq + stateVersion` CAS 让 accept、decline、
   timeout 只有一个胜者。`currentTick < deadline` 才可新接受；在 deadline 前已取得 accept token 的任务不被
   并发 timeout 抢走。
2. accept 获胜后进入 `reliveSpawning`，在最多 20 tick 内寻找并保留候选安全点。找不到则
   `reliveSpawnFailed` 且不创建 receipt、不扣费。
3. 候选点不是持久权利。任何 DB await 返回后都复验 room generation、task token、terminalIntent 和当前碰撞；
   候选失效时在剩余 tick 内重找。
4. 取得候选后进入 `reliveCommitting`。tracked task 通过 `withUser` 取得最新 fence，在 RC 事务内按自然键
   `SELECT/INSERT` receipt，完整比对 canonical payload，调用 `debitInTx`，写 debit ledger，把 receipt 置为
   `charged` 并记录 `balanceAfter/applyExpiresAt`。
5. 余额不足、旧 fence 或事务失败必须让 receipt、ledger、余额全部零写入。提交结果不明时按自然键回读，
   禁止盲目重扣。charge 提交后 best-effort `invalidateBalanceCache(uid,sId)`；`balanceAfter` 只用于本次响应。
6. `charged` 只能由持有 `applyOwner/generation/applyLeaseUntil` 的 task CAS claim 为 `applying`。应用事务原子
   写完整版本化 snapshot/hash、`state=reliveReady`、`reliveAppliedDeathSeq`、`relivesUsed=reliveIndex`、
   `reliveCoinSpent += coinCost`，并将 receipt 置为 `applied`。
7. `applied` 只表示复活权已经持久化，不表示玩家已收到可操作蛇；不得提前发送 `revived` 或 canonical success。

### Activation gate 与交付证明

匹配 room generation 的 mode task 从 durable `reliveReady` 重建实体并再次确认安全点：

1. fixed step 开始检查 task token 且 `terminalIntent IS NULL`，只允许**恰好一个**带保护的 provisional Active
   step，并记录 `reliveFirstActiveTick`。
2. 该 step 结束立即进入内部 `activationCommitting`，冻结输入、拾取、得分和后续碰撞。后续 RC await 即使跨
   多个 world step，也不能继续让该蛇活动。
3. 事务 CAS `run.state=reliveReady AND terminalIntent IS NULL`，原子写 run Active、
   `reliveFirstActiveTick` 与 receipt `activated`。
4. 提交成功后才保持 Active、重新开放输入并发送 `revived`；`activeTicks` 从提交后的下一 step 才恢复累计。
5. 若 activated 提交回包或 push 丢失，run Active checkpoint 是重连 canonical success；不得再次扣费或生成。
6. 提交前崩溃或 CAS 失败按用户有利原则退款并移除临时蛇。已经发生的单个确定性世界 step 副作用不回滚，
   但不能据此把未确认交付标成 activated。

保护区间固定为半开区间 `[reliveFirstActiveTick, reliveFirstActiveTick + 60)`：provisional step 就是第 1 个
保护 tick；activated 提交成功后若进入下一 step，最多还剩 59 个保护 tick。只有同时带匹配
`reliveFirstActiveTick` 的 `activated` 才是不可反转交付证明。

S2 的当前 typed wire 已预声明 receipt/result envelope，本阶段优先填充该兼容 envelope；若实施时确实需要新增
未声明的 wire 语义，必须从**当时实际 modeVersion** 递增并补兼容矩阵，禁止预设固定的下一版本号。

### 退款、恢复器与终局意图

若同一 room generation 无法恢复、安全点耗尽、activation 前出现终局意图或应用无法可靠交付，退款事务必须：

- CAS receipt 为 `refunded`；
- 以匹配的 `reliveAppliedDeathSeq/deathSeq/reliveIndex` 回滚本档 `relivesUsed/reliveCoinSpent`；
- 将 run 从 `reliveCommitting/reliveReady`，或匹配 receipt 的未确认 `finalizing`，收敛到 `finalizing`；
- 写 `reliveCompensatedDeathSeq` 并清空 `reliveAppliedDeathSeq`；
- 保留最高优先级 `terminalIntent`；没有其他原因时使用 `reliveSystemFailed`；
- 通过 `creditInTx` 和 `refundOpId` 写反向 ledger，提交后 best-effort 失效余额缓存。

若退款暂时不能提交，run 保持 `finalizing`，receipt 保持可被恢复器 claim 的 `charged/applying/applied`；完成事务
后才发送最终结果。禁止留下 `refunded + reliveReady` 供迟到 task 再激活。

默认启用 reconciler，按 `(status, applyExpiresAt)` 索引批量 claim 过期 `charged/applying/applied`；启动、周期、
登录与重连都触发恢复。只有 run checkpoint 的 `reliveAppliedDeathSeq==deathSeq` 且 snapshot hash、策略版本、
receipt 全部匹配，才能把 applying 补成 applied/ReliveReady。普通 death/offer checkpoint 即使 deathSeq 相同，
也不是应用证明。

终局意图先持久 CAS，再影响内存 world。settlement 冻结前允许高优先级覆盖低优先级：

```text
moderationKick
  > sessionReplaced
  > serverDrain / roomFault
  > explicitExit / disconnectTimeout
  > reliveDeclined / reliveTimeout / deathNoOffer /
    reliveSpawnFailed / reliveSystemFailed / forcedDeath / escape
```

同层首次 CAS 为准。Offering/Spawning/Committing/Ready 中一旦存在终局意图，禁止恢复输入或再发 offer；
activation 前取消或退款，activated 已先成功则立即按终局意图 finalize，不能吞掉退出或留下僵尸 Active。

### 通用 awaited 生命周期边界

S2R 必须在通用 `GameMode`/shell 提供以下能力，不在 `GameRoom` 写 Snake 专属分支：

```text
鉴权成功
-> preparePlayerAdmission(uid, session/generation)       // await + timeout + generation 复验
-> 持久创建或恢复唯一 OPEN run
-> 创建席位与 Snake

最终离场意图
-> preparePlayerFinalLeave(uid, runId, generation)       // await + timeout + generation 复验
-> 写 terminalIntent，join relive task，durable freeze
-> 释放实体与席位
```

`preparePlayerAdmission` 失败必须 fail closed，不能先创建无账本蛇。S3 将在同一 hook 内增加装备加载，不得另造
旁路。`preparePlayerFinalLeave` 在 S2R 只保证无奖励版 durable freeze 与 receipt 收敛；S4 在同一边界增加最终
reward settlement。

`endRun` command handler 保持同步：校验后锁存 terminalIntent、停止输入、按 runId 登记 mode-owned tracked
Promise，立即回 `runFinalizing`；Promise 完成后异步推送唯一结果。重复 endRun、disconnect timeout、leave、
drain 和 onDispose 必须 join 同一任务。不得把 handler 改成 dispatcher 不等待的裸 async，也不得留下 detached
Promise。

## 稳定任务 ID

任务 ID 一旦用于 commit、测试证据或缺陷单，不因排序调整而重编号。每项必须同时完成动作、产物和验证。

### S2R-01：扩展通用 awaited admission/final-leave 能力

**动作**

- 在通用 mode/shell 增加带超时、generation token 和返回类型的 `preparePlayerAdmission`、
  `preparePlayerFinalLeave`。
- 明确 hook 失败、超时、session replacement、room drain 和 disposal 的收口语义。
- 保持现有同步 command dispatcher 约束；用 mode-owned registry 管理长任务。

**产物**

- 无 Snake 硬编码的 lifecycle capability 与通用测试 mode。
- admission 前置、实体释放后置的时序断言。

**验证**

- hook await 期间 generation 变化会取消旧结果，不创建迟到实体。
- admission 失败/超时 fail closed；final leave 在 freeze 前不释放席位。
- 其他玩法未实现 capability 时保持原有行为与测试。

### S2R-02：建立最小持久 run 与 checkpoint

**动作**

- 建立/迁移 `snake_player_run`，落实唯一 OPEN run、stateVersion、run/death/relive/terminal 字段与索引。
- admission 通过唯一 `RunSkinResolver` 得到权威皮肤，先把不可变 `skinIdAtRunStart` 持久到 Preparing run，再创建
  实体；首个可操作 tick CAS Active。
- 建立关键状态和固定间隔 checkpoint，维护 `confirmedThroughTick`。

**产物**

- S4 可原位扩展的唯一 run 表、repository/store 和迁移。
- Preparing cancel、重连 resume、最终 freeze 的幂等 API。

**验证**

- 同 uid/session/generation 并发 admission 只有一个 OPEN run。
- 宽限内重连沿用 run；最终离开后重入创建新 run。
- run、实体与每次 death snapshot 的皮肤都等于 `skinIdAtRunStart`；join 自报值无效，S3 前默认值为 `1`。
- Preparing 离开只 Cancelled，不创建 settlement/reward；checkpoint 不产生 reward intent。

### S2R-03：建立 decision 与 receipt 表和不变量

**动作**

- 建立 `snake_relive_decision`、`snake_relive_receipt`、自然唯一键、请求绑定键、状态/check 约束和恢复索引。
- 存储 canonical payload/hash、owner/generation/lease、receiptId、terminal result、`balanceAfter`、
  `applyExpiresAt` 与审计时间。
- 定义 `chargeOpId/refundOpId` 的稳定 hash 版本并补迁移/兼容策略。

**产物**

- 幂等 repository、SQL schema/migration 和 canonical encoder。
- 数据库级唯一约束与索引说明。

**验证**

- 同自然键/同 payload 返回原 receipt；异 payload 被隔离。
- 同 requestId 同 payload 重放结果；异 payload 冲突。
- 编码在字段顺序、进程、区服实例间稳定，opId fixture 固定。

### S2R-04：持久化 offer 后再开放决策

**动作**

- 实现 `reliveOffering` task：写完整 death snapshot/hash、档位、费用、策略版本和 generation/token。
- 提交后在下一权威 tick 冻结 offered/deadline，CAS Pending 并推送；3 秒内失败走 systemFailed。
- 启动/重连恢复 Offering：提交完成则继续同一 offer，无法完成则唯一终局。

**产物**

- offer checkpoint、恢复器入口和 schema/push 一致投影。

**验证**

- checkpoint 前/中/提交后 kill 分别不发窗、恢复同一 task 或重放同一 offer。
- push 丢失可从 schema 恢复；不会产生第二 deathSeq/deadline。
- 持久失败不调用扣费、不展示不可恢复窗口。

### S2R-05：实现跨进程 decision 绑定与唯一赢家

**动作**

- 所有 accept/decline 先写/读 decision 行，再执行 run CAS；processing 使用 owner/generation/lease。
- 恢复器按 runState、terminalIntent、receipt 收敛过期 processing：Pending 时在 deadline 下重放，
  Spawning/Committing 时恢复原 task，已有 receipt 时转 receipt 恢复，终局/Active 时补 canonical result。
- 明确 `< deadline` 接受、`== deadline` timeout 和 accept token 的竞争规则。

**产物**

- 跨进程幂等 decision service 与 canonical result 映射。

**验证**

- 同/异 requestId、同 ID 异 payload、accept/decline/timeout 并发矩阵通过。
- processing 写入后任意 kill 可被租约接管，不永久卡 run 或 requestId。
- 已解析失败的 ID 不重新执行；新点击使用新 ID。

### S2R-06：扣费前锁定安全 spawn 资格

**动作**

- accept 获胜后在 20 tick 内找安全点；穷尽才 spawnFailed，且不建 receipt。
- DB await 前后复验 task token、room generation、terminalIntent 和碰撞；失效候选在剩余 tick 内重找。
- 把 spawn/reservation 与玩法随机流、重连和 drain 取消语义固定下来。

**产物**

- 可取消、可重建、不会先扣费的 spawn planner。

**验证**

- 无安全点、候选 await 中失效、room generation 变化均不扣币。
- accept token 不被原 deadline 抢走，但终局意图能安全取消。
- 同死亡最多一个 spawn task 和一个临时实体。

### S2R-07：实现真实 charge 事务与余额一致性

**动作**

- 使用 `withUser(fence)` 和 RC 事务自然键回读/创建 receipt，完整比对 payload。
- 调用 `debitInTx` 原子更新余额、debit ledger 和 charged receipt，记录 `balanceAfter/applyExpiresAt`。
- 对余额不足、旧 fence、事务失败和提交结果不明分别收口；成功提交后失效余额缓存。

**产物**

- 真实 coin `ReliveEconomyPort` charge 适配器与审计 ledger。

**验证**

- 同一死亡并发只扣一次；余额不足时 receipt/ledger/余额零写入。
- commit 回包丢失按自然键查明，不盲扣第二次。
- 跨区/旧 fence 无写入；charge 后后续余额查询不返回旧缓存值。

### S2R-08：原子应用复活权并生成 ReliveReady

**动作**

- 通过 apply owner/generation/lease claim charged→applying。
- 在同一事务写 canonical snapshot/hash、ReliveReady、applied deathSeq、档位/花费与 receipt applied。
- 拒绝 snapshot、策略、receipt、run state 任一不匹配的应用。

**产物**

- 可恢复的 apply transaction 与 ReliveReady checkpoint。

**验证**

- apply 前/中/提交后 kill 只会恢复同一 apply 或进入退款，不免费多开档。
- `relivesUsed/reliveCoinSpent` 只在 applied 事务推进一次。
- 普通 death/offer checkpoint 不能被误识别为 apply 证明。

### S2R-09：实现单 step activation gate

**动作**

- 从 ReliveReady 恢复蛇，在 fixed step gate 允许恰好一个 protected provisional Active step。
- step 后冻结输入/拾取/得分/碰撞，事务确认 run Active + receipt activated，再正式开放并推送 revived。
- 记录 `reliveFirstActiveTick`，按 `[firstActiveTick, firstActiveTick + 60)` 保护；provisional step 已消耗第 1 tick，
  从确认后的下一 step 恢复 activeTicks。

**产物**

- mode-owned activation task、内部 activationCommitting 与重连 canonical success。

**验证**

- activated RC await 跨多 tick 仍只有一个 provisional step。
- gate 前/step 中/step 后/activated 提交前后 kill 均收敛为唯一 activated 或退款。
- 保护边界在 `firstActiveTick`、`firstActiveTick+59` 生效，在 `firstActiveTick+60` 失效；确认后不重置为 60。
- push 丢失由 Active checkpoint 恢复，不重复扣费/生成；无 firstActiveTick 的 activated 被约束拒绝。

### S2R-10：实现终局取消与幂等退款

**动作**

- 先 durable CAS terminalIntent，再取消未扣费 task或 join charged/applying/applied task。
- 以 refundOpId 在 RC 事务中反向 ledger、receipt refunded、档位/花费回滚和 run checkpoint 收敛。
- 退款失败时保持 Finalizing/可 claim receipt，成功后失效余额缓存并产生 canonical systemFailed/终局结果。

**产物**

- terminal priority resolver、refund service 和“退款处理中/已退回”权威状态。

**验证**

- endRun/disconnect/moderation/drain/fault 与每个 receipt 状态竞争均只有一个终态。
- 退款事务前后 kill 可幂等恢复，不双退；不存在 refunded+ReliveReady 再激活。
- activated 先胜时不退款，但仍立即按终局意图 finalize。

### S2R-11：建立启动、周期与 lazy reconciler

**动作**

- 按 `(status, applyExpiresAt)` 分页 claim 过期 receipt，使用 owner/generation/lease 防并行恢复。
- 启动和周期扫描默认启用；登录、准入和重连对当前 uid/run 做 lazy reconcile。
- 将 backlog、最老过期时间、claim/activate/refund/failure 指标接入健康检查和告警。

**产物**

- 可水平扩展的 decision/receipt reconciler、健康闸门和人工 replay 查询入口。

**验证**

- 多恢复器/迟到 task 并发只有一个 claim 胜者。
- charged/applying/applied 全部能收敛到 activated 或 refunded，不永久悬挂。
- 恢复 backlog/数据库不可用时开服或发布开关按阈值 fail closed。

### S2R-12：接入真实 receipt 客户端体验

**动作**

- 将 S2 测试余额标识替换为权威 `balanceAfter` 和 receipt/result；后续余额读取仍走已失效/刷新的缓存。
- 区分 insufficient、retryable、processing、revived、systemFailed、refund pending/refunded。
- 重连从 run schema + receipt 状态重建；网络重试复用原 ID，用户再次点击使用新 ID。

**产物**

- 真实金币费用/余额、复活处理中和退款处理中 ViewModel/UI。

**验证**

- 客户端不本地扣币、不提前关闭 processing、不把 applied 当 revived。
- push 丢失/乱序/重复和重连显示同一 canonical 结果。
- Finalizing 且 receipt 未收敛时明确显示“复活失败，金币退回处理中”，不伪造 timeout。

### S2R-13：收口 leave、disconnect、drain 与 onDispose

**动作**

- 所有最终离场路径先写 terminalIntent，复用 `preparePlayerFinalLeave` 并 join 同一 relive/finalize task。
- onDispose/drain 在释放 world、run 或连接前等待 mode-owned registry 有界收口；超时转 durable 恢复。
- finalized/cancelled 后清理 participant、蛇、输入、游标、pending task 与内存 run 引用。

**产物**

- 无 detached Promise 的生命周期任务注册表与有界 shutdown/drain 流程。

**验证**

- charge/apply/activation/refund 任一 await 中触发离场或 dispose，最终均可从 durable 状态恢复。
- 不能先删 run/实体后遗留不可关联扣费。
- 最后一名真人的 run durable freeze 后才允许 autoDispose。

### S2R-14：执行真栈故障门禁并签发技术准入

**动作**

- 建立可在每个 decision、SQL、CAS、task registration、spawn、apply、activation、refund 边界 kill 的真栈
  fault harness。
- 运行本文件故障矩阵、缓存/跨区/恢复器健康检查和 S2 全量回归。
- 汇总 migration、开关、回滚、reconcile backlog、余额/ledger 对账、无头客户端证据与需交给 S5 的精确
  Creator 用例；全部通过后只签发 `eligibleForEnable=true` 的技术准入结论，不改变开关值。

**产物**

- 可重复的真栈故障报告、对账结果、发布检查表和技术准入审计记录。

**验证**

- 所有注入点均满足“不吞币、不双扣、不双退、不重复复活、不永久 processing”。
- 启动恢复、周期恢复和 lazy reconcile 均在真实 Redis/MySQL 下通过。
- **任一门禁缺失时 `eligibleForEnable=false`；全部门禁有证据后才可签为 `true`，但开关仍须保持关闭，等待
  S5 唯一的 go/no-go 与开启动作。**

## 故障与并发矩阵

下表是 S2R 的最低真栈覆盖，不可只用 mock/单进程单测替代。每个 kill 点都要验证数据库、ledger、run、receipt、
客户端结果和内存实体最终一致。

| 故障/竞争窗口 | 唯一正确收口 | 必备断言 |
|---|---|---|
| 同 requestId 同 payload 并发 | 重放同一 processing/terminal result | 一个 decision 绑定，不重复业务 |
| 同 requestId 异 payload | 冲突 | 原 payload/result 不变 |
| 不同 requestId 同死亡并发 accept | run CAS 只允许一个赢家 | 一个 spawn task、一个 receipt、最多一次扣费 |
| accept vs decline | 一个 terminal/accept token | 不同时复活和 finalize |
| accept vs `== deadline` timeout | timeout 胜；更早已获 token 的 accept 不被抢 | 不信客户端时间戳 |
| decision 行写入后、run CAS 前 kill | lease 接管并按当前 run 收敛 | requestId 不永久 processing |
| run CAS 后、task 登记前 kill | 恢复器重建同一 task | 不丢 accept、不新建 deathSeq |
| task owner 死亡/lease 过期 | 新 generation claim | 迟到 owner 写入被 CAS 拒绝 |
| offer snapshot 写入前 kill | 不发窗，恢复/终局 | 无 receipt、无扣费 |
| offer snapshot 提交回包丢失 | 自然键/状态回读 | 同一 snapshot/hash/deadline |
| offer 3000 ms 超时 | systemFailed | 不发窗、不扣费 |
| offer push 丢失 | schema 重建同一 offer | 不追加 100 tick |
| 20 tick 无安全点 | spawnFailed | 不创建 receipt、不扣费 |
| 候选点在 DB await 中失效 | 剩余窗口重找或退款/终局 | 不在危险点复活 |
| spawn 后、charge 前终局意图 | 取消 | 无 receipt/ledger |
| 余额不足 | Pending 或 deadline 后 timeout | receipt/ledger/余额零写入，不推进档位 |
| 旧 fence/跨区请求 | 拒绝 | 目标分区零写入 |
| debit 事务提交前 kill | 全回滚 | 无 charged receipt/ledger 差异 |
| debit commit 成功、回包前 kill | 自然键查到 charged | 不重扣；余额缓存最终失效 |
| charged 后、apply claim 前 kill | reconciler claim | 收敛 applied/activated 或 refunded |
| applying owner 死亡 | lease 后唯一接管 | 不并行应用两次 |
| apply 事务提交前 kill | run/receipt 均未 applied | 档位/花费不推进 |
| apply commit 后回包丢失 | run ReliveReady + receipt applied | 不再次扣费或应用 |
| 普通 offer checkpoint 与 charged 并存 | 不能当 applied 证明 | snapshot/policy/receipt 三重匹配失败则恢复或退款 |
| ReliveReady 重建无安全点 | 退款并 Finalizing | 不留下临时蛇，不吞币 |
| activation gate 前终局意图 | 退款 | 无 provisional Active step |
| provisional step 中进程 kill | 用户有利退款 | 未确认 step 不作为 activated 证明 |
| activation RC await 跨多 tick | 只运行一个 provisional step | 后续输入/拾取/得分/碰撞冻结 |
| activated 提交前 kill | 退款 | 无 confirmed activated |
| activated commit 成功、push 丢失 | Active checkpoint 重建 success | 不退款、不重复复活 |
| refund 事务提交前 kill | receipt 仍可 claim | run 保持 Finalizing，不发假结果 |
| refund commit 成功、回包前 kill | refundOpId/receipt 回读 | 不双退；余额缓存最终失效 |
| 迟到 apply task 遇 refunded | CAS 失败 | 不出现 refunded + Active |
| endRun 在 Offering | 锁 terminal，取消/终局 | 不再发 offer |
| endRun 在 Spawning | 取消 spawn | 不创建 receipt |
| endRun 在 Committing/Ready | join 并退款 | 退款前不 finalize/delete run |
| endRun 在 activated 后 | 不退款，立即 finalize | 不吞退出意图 |
| moderation 与玩法死亡原因竞争 | moderation 优先 | 奖励资格留给 S4，当前终局原因唯一 |
| sessionReplaced vs explicitExit | sessionReplaced 优先 | 同层/跨层 CAS 规则稳定 |
| drain/roomFault vs timeout | 运维/故障优先 | 不伪装成玩家超时 |
| disconnect 宽限耗尽 vs accept | terminal/accept token 唯一收口 | 不生成僵尸 Active |
| onDispose 在 charge/apply/refund await 中 | 有界 join 或 durable 恢复 | 无 detached Promise |
| 多 reconciler + 迟到原 task | 一个 lease/CAS 胜者 | receipt 终态唯一 |
| 登录/重连触发 lazy reconcile | 与周期扫描幂等 | 不重复 push/余额变化 |
| charge/refund 后读余额 | 返回新值 | cache invalidation 生效 |
| 恢复 backlog 超阈值 | health gate 关闭功能/拒绝开放 | 不在不可恢复状态下继续收费 |

## 退出条件

以下条件必须全部满足，S2R 才能标记 `[已完成]` 并签发技术准入；这不授权本阶段实际开启发布开关：

- [ ] 通用 `preparePlayerAdmission` 与 `preparePlayerFinalLeave` 已实现 timeout、generation 复验和其他 mode
  兼容测试；`GameRoom` 无 Snake 专属旁路。
- [ ] admission 在实体创建前持久创建/恢复唯一 OPEN run；final leave 在释放席位前完成 durable freeze。
- [ ] `snake_player_run` 是 S4 将扩展的唯一账本；Preparing/Cancelled、checkpoint 和 S2R finalize 不产生奖励。
- [ ] offer 的完整 death snapshot/hash/档位/策略在展示前可靠持久；3 秒失败路径不发窗、不扣费。
- [ ] decision 请求绑定、自然 receipt 键、canonical payload/opId、owner/generation/lease 和数据库唯一约束全部生效。
- [ ] 五档真实扣费分别为 100/200/300/300/300；余额不足、spawnFailed、未扣费失败和退款均不消耗档位。
- [ ] charged/applying/applied/activated/refunded 在所有 kill 窗口中只能收敛为一个 activated 或一个 refunded。
- [ ] activation gate 在 RC await 跨多 tick 时仍恰好一个 provisional step；该 step 是 60 tick 保护区间的
  第 1 tick，只有 firstActiveTick + activated checkpoint 才发送/恢复 revived。
- [ ] activation 前故障或终局意图可幂等退款；退款未完成时保持 Finalizing 和真实“退款处理中”，不伪造结果。
- [ ] terminalIntent 优先级、endRun、断线、顶号、moderation、drain、fault 和 onDispose 竞争全部通过。
- [ ] 启动/周期/lazy reconciler 默认启用并有 health gate、指标、告警和人工 replay 查询路径。
- [ ] charge/refund 后余额缓存失效；客户端 `balanceAfter`、后续查询、ledger 和数据库余额一致。
- [ ] 同/异 requestId、提交结果不明、跨区 fence、lease 接管、多恢复器和迟到 task 的真栈测试全部通过。
- [ ] mode-owned task registry 在 leave/drain/dispose 前有界 join；无 detached 扣费、退款或迟到生成。
- [ ] S2 的 4/100/20/60 tick、无房级 deadline、其他玩家继续 Playing、AI 独立重生等回归保持通过。
- [ ] migration、回滚、对账、恢复 backlog、客户端文案、Creator 用例移交与运维 SOP 均有可复核证据；实际
  Creator 运行结果在 S5 收口。
- [ ] **门禁全部通过前 `eligibleForEnable=false`；通过后记录为 `true`，但 `onlineCoinRelive5V1` 仍保持关闭，
  实际开启唯一归 S5。**

S2R 完成不代表养成奖励完成。面向玩家宣称“养成系统完成”仍需等待 S3 衣柜/装备和 S4 可靠 run 奖励闭环。

## 风险与回退

| 风险 | 预防 | 回退/处置 |
|---|---|---|
| happy path 可用但崩溃窗口吞币 | 收据状态机、真栈 kill matrix | 开关保持/切回关闭；reconciler 对账并退款 |
| decision processing 永久卡住 | owner/generation/lease + lazy reconcile | claim 过期行；禁止客户端换 ID绕过旧 processing 扣费 |
| commit 回包丢失导致重扣 | 自然键回读、唯一约束 | 以 receipt/ledger 为准，不盲重试 debit |
| offer 先展示后落库 | ReliveOffering 严格前置 | 持久失败不发窗，systemFailed 收口 |
| 普通 checkpoint 被误作 applied | deathSeq+hash+policy+receipt 三重/四重匹配 | 无充分证明则恢复原 task 或退款 |
| DB 先 activated、玩家未得到活动 tick | provisional step + firstActiveTick 后确认 | 未确认一律用户有利退款 |
| RC await 跨 tick 让玩家持续免费活动 | step 后 activationCommitting 冻结 | 强制移除/冻结临时蛇并退款 |
| refund 与迟到 apply 同时成功 | receipt/run CAS、terminalIntent | refunded 后所有 activation CAS 必须失败 |
| 退款暂时失败却已发结果 | Finalizing + 可 claim receipt | 保持“退款处理中”，恢复成功后再发终态 |
| charge/refund 后读到旧余额 | commit 后缓存失效 | `balanceAfter` 仅本次显示；健康检查报警并刷新缓存 |
| leave/onDispose 产生 detached Promise | mode-owned registry + awaited hook | 有界 drain；超时保留 durable 状态交 reconciler |
| 通用 shell 被 Snake 逻辑污染 | capability interface 和通用测试 mode | 阻断合并；移回 mode adapter |
| S2 测试端口误进生产 | 依赖注入白名单、启动断言、关闭开关 | 启动 fail closed，禁止免费成功 |
| 恢复 backlog 过大仍继续收费 | 指标、health gate、开关守门 | 自动关闭复活入口，先 reconcile/对账 |
| 跨区/旧 fence 修改资产 | `withUser` 最新 fence、sId 全键绑定 | 零写入并隔离冲突记录 |
| S2R 与 S4 重复建账本/结算 | 唯一 run 表与 hook 扩展契约 | 停止重复实现，迁移回本阶段主链 |

回退优先级固定为：关闭发布开关 → 停止新 offer/charge → 继续 reconciler 和既有退款/activation 收口 → 完成
ledger/receipt/余额对账 → 再决定版本回退。不得在关闭入口时停止处理已经 charged/applying/applied 的收据。

## 证据回写

完成任务或阶段时填写真正运行过的证据；未运行不得写“通过”。故障证据需注明注入点、进程 generation、
最终 run/decision/receipt/ledger/余额状态和客户端结果。

| 任务/范围 | 状态 | commit / migration | 自动/真栈验证 | 对账 / UI / 运维证据 | 备注 |
|---|---|---|---|---|---|
| S2R-01～S2R-02 lifecycle 与 run | `[已拍板·待实施]` | — | — | — | — |
| S2R-03～S2R-05 decision、receipt、offer | `[已拍板·待实施]` | — | — | — | — |
| S2R-06～S2R-09 spawn、charge、apply、activate | `[已拍板·待实施]` | — | — | — | — |
| S2R-10～S2R-11 refund 与 reconciler | `[已拍板·待实施]` | — | — | — | — |
| S2R-12～S2R-13 客户端与生命周期收口 | `[已拍板·待实施]` | — | — | — | — |
| S2R-14 真栈门禁 | `[已拍板·待实施]` | — | — | — | 只签技术准入，开关保持关闭 |
| S2R 技术准入审查 | `[已拍板·待实施]` | — | — | — | 记录 `eligibleForEnable`、审批时间、config hash、回退步骤 |
| S2R 阶段结论 | `[已拍板·待实施]` | — | — | — | 不代表 S4 奖励完成 |

证据至少包括：DDL/迁移校验、canonical/opId fixture、每个 kill 点的前后状态、并发 decision 结果、charge/refund
ledger 对账、缓存失效日志、reconciler backlog 与 lease 接管、drain/onDispose join、真实余额 UI、重连恢复，以及
门禁前后的 `eligibleForEnable` 值和始终关闭的发布开关证明。

---

> [返回专项索引](README.md) · [上一阶段：S2 竖版战场与无尽生命周期](s2-battle-and-endless-lifecycle.md) ·
> [下一阶段：S3 衣柜与装备](s3-wardrobe-and-equipment.md)
