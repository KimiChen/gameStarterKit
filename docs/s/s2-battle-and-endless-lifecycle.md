# S2：竖版战场与无尽生命周期

> [专项索引](README.md) · [上一阶段：S1 素材与目录](s1-assets-and-catalog.md) ·
> [下一阶段：S2R 可靠金币复活](s2r-reliable-coin-relive.md)

## 状态、预计与依赖

| 项目 | 口径 |
|---|---|
| 状态 | `[已拍板·待实施]` |
| 预计 | 9–13 人日；不含最终 FGUI 美术制作与反复数值调优 |
| 前置依赖 | [S0 复刻基线](s0-replication-baseline.md) 已冻结命名配置、来源证据、规则差异表与 golden；[S1 素材与目录](s1-assets-and-catalog.md) 已交付可校验的表现目录和资源 |
| 本阶段输出 | `snake@2`、4096² V2 战场、无房级 deadline 的持续世界、17 条稳定态活动蛇、中央操作区、多点触控、测试经济端口上的真人复活状态机、分块基线与增量同步 |
| 后续依赖方 | S2R 将测试经济端口替换为真实扣费/收据/恢复链；S3 复用稳定皮肤 ID；S4 扩展真人 run 账本并发奖 |
| 发布门禁 | **本阶段不得开放 `onlineCoinRelive5V1`。S2 只连接确定性的测试 `ReliveEconomyPort`；S2R 负责取得真实金币链路的技术放行资格，实际开关只能由 S5 在最终 go/no-go 后开启。** |

本文件是 S2 的实施与验收真相。全仓当前状态仍以 [plan-v5.md](../../plan-v5.md) 为准；生成物与写路径约束遵守
[仓库总览](../OVERVIEW.md)、[服务端约束](../SERVER.md)、[客户端约束](../CLIENT.md) 和根 `AGENTS.md`。

## 目标与非目标

### 目标

1. 把当前 Classic 风格的 `1920 × 3264`、300 Dot + 15 Star、8 条活动蛇、90 秒整房结算替换为已冻结的
   `newEndlessPortraitV2Map4096TotalTime0`。
2. 在 `750 × 1624` 竖版设计视口中复刻 V2 的世界比例、网格、食物、残骸、皮肤、AI、相机和身体缩放；
   地图边界改为 4096²，但世界单位不得按 `4096 / 4896` 整体缩放。
3. 实现最多 8 真人、首人启动、Playing 可加入、真人替换低级 AI、稳定态 17 条活动蛇的 drop-in 无尽世界。
4. 移除真人 40 tick 自动重生，建立服务端权威的死亡、限时选择、复活或个人 run 终局状态机；AI 保留独立约
   40 tick 重生。
5. 完成 `snake@2` 的稳定内容 ID、房间元数据、复活 typed message、V2 容量、分块基线和有序 delta。
6. 将底部操作区改为中央固定摇杆与上方四槽浅弧，命中区域、pointer owner、多指操作和清理路径与视觉布局
   同批落地。
7. 在无真实经济副作用的条件下，把完整玩法状态机、客户端 UI 和竞态测试跑通，为 S2R 提供稳定端口边界。

### 非目标

- 不接入真实 MySQL 扣币、货币流水、复活收据、退款、owner lease 或恢复器；这些只属于 S2R。
- 不用客户端余额扣减、免费复活或内存“成功收据”冒充真实经济完成。
- 不开放广告、分享、广告券、钻石、现金支付、月卡、新手免费复活或无限复活卡。
- 不实现衣柜所有权、装备、碎片解锁和养成奖励；分别属于 S3、S4。
- 不迁移原作私有协议、支付、活动或动态 AB；不把 Feed B 表描述成普通线上 V2 的恒定默认。
- 不恢复 TimeLimit 90 秒模式，不保留第 1800 tick 隐藏收局、终局末段禁复活或整房 `context.settle()`。
- 不把 86 个假榜条目生成成场内 AI、碰撞实体或奖励参与者。
- 不允许不同皮肤改变速度、碰撞体、初始长度、转向、攻击范围或得分。
- 不手改生成 registry、schema 镜像、客户端 shared 镜像或 Cocos 同步镜像。

## 冻结口径

### 配置组合与世界坐标

本阶段只实现以下五层已命名配置的组合，不允许运行时拼接其他 Classic、TimeLimit 或 AB 值：

| 配置层 | 冻结语义 |
|---|---|
| `newEndlessPortraitV2Map4096` | V2 战场；原 4896² 只把边界覆盖为 4096²，食物、相机、身体、AI、假榜与表现继续采用 V2 值 |
| `sourceEndlessTotalTime0` | `totalTime=0`、无剩余时间 HUD、无整局到点和终局末段禁复活 |
| `sourceEndlessReliveFlow` | 普通真人死亡进入限时选择；成功恢复明确累计字段并获得 3 秒碰撞保护；拒绝、超时或无档位结束个人 run |
| `onlineCoinRelive5V1` | 五档金币 `100/200/300/300/300`，固定 5 秒；S2 只把费用作为测试端口输入，不发生真实资产写 |
| `onlineEndlessDropInV2` | 首人启动、3 秒准备、最多 8 真人、Playing 可入、稳定态 17 条活动蛇、个人 run 独立终局、空房回收 |

源世界证据坐标到竖版证据坐标只做正交旋转：

```text
source (x, y) -> portrait (-y, x)

source V2 world:          4896 × 4896
rotated evidence world:   4896 × 4896
target portrait bounds:   4096 × 4096
source design viewport:   1624 × 750
portrait design viewport:  750 × 1624
```

`4096 / 4896` 不是缩放系数。出生点、食物和 AI 在以原点为中心的 4096² 边界内重新生成；距离、角度、格距、
食物尺寸、身体宽度和碰撞比例保持世界单位语义。HUD、文字、皮肤纹理与操作区按竖屏重排，不把整张横屏画面旋转。

### V2 战场数值

| 项目 | 冻结值 | 约束 |
|---|---:|---|
| 世界 | `4096 × 4096` | 原 V2 4896² 是来源快照，不是目标值 |
| 视觉格距 / 地图边距 | `32 / 16` | `GRID_CELL=150` 是 broadphase，禁止随视觉格距修改 |
| Dot / Star | `1000 / 30` | 总计 1030；不按面积降到约 721 |
| Dot / Star 显示尺寸 | `16 / 42` | 使用 atlas；Star 运动、随机变向、撞边反弹由服务端权威 |
| 出生 / 最大长度 | `80 / 100000` | 真人与 AI 的基础出生长度采用 V2 值 |
| 身体基础宽度 | `36` | 所有皮肤统一玩法口径 |
| 相机 | `1.3 → 0.6 @ 100000` | 随权威长度线性插值，靠边界不钳住相机中心 |
| 身体全局缩放 | `1.0 → 2.8 @ 100000` | 服务端碰撞与客户端表现一致 |
| 活动蛇 | 稳定态 17 | 最多 8 真人；AI 数为 `17 - 真人席位数` |
| 假榜 | 86 | 独立展示模型；绝不进入 `snapshot.snakes` 或资产结算 |
| 房级时间 | `totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false` | `endTick` 为 `null`/缺省；不得用数值 0 参与结束比较 |

相机公式固定为：

```text
cameraScale = max(
  cameraMinScale,
  cameraInitScale
    - snakeLength * (cameraInitScale - cameraMinScale) / cameraScaleSnakeMaxLength
)
```

V2 `point_step_config` 完整保留 71 项有序表，可用下列无损规则生成后逐项与 S0 快照比对：

```text
n = 1..63: { max_length: 300*n, step_length: n+2 }
重复端点:  { max_length: 18900, step_length: 66 }
n = 64..67: { max_length: 300*n, step_length: n+3 }
尾部:      {100000,50}, {200000,100}, {300000,100}
```

原作按各段覆盖长度除以 `step_length` 累加，向下取整后乘 `STEP_POINT_COUNT=2`。重复端点保留但贡献零宽区间；
三个 `*_max_point_step=1240` 只作来源元数据，不能当作路径点或长度上限。固定路径点向量为：

```text
80→52, 300→200, 3000→960, 18900→1954,
19200→1964, 20100→1990, 100000→5186
```

Star 的最终分值、速度、加速倍率、转向和出生保护只能读取 S0 已拍板差异表；不得借“V2”名义静默换算。AI
死亡残骸公式则已冻结为确定性规则：

```text
totalDeathWreckScore = pow(deadSnakeScore, 0.8) * 2
perWreckScore = max(totalDeathWreckScore / bodyCount, 3)
```

若因房间残骸 cap 合并实体，合并前后必须守恒该次 AI 死亡的总残骸分值。真人死亡只播放表现，不生成可拾取
计分残骸。

### AI、席位与展示榜

- 首位真人开局时生成 K1 level 0 的 16 条 AI：`aiLevel 401×8、402×4、403×2、404×2`。
- 第 2～8 位真人加入时，每人只替换一条 aiLevel 401 AI；满 8 真人时仍保留 9 AI。
- 真人离开且 run 最终完成、席位释放后补回 aiLevel 401 AI。真人处于死亡演出、选择、生成、提交、Ready
  等短暂状态时仍占席，不临时补 AI。
- AI 约 40 tick 后按自身配置重生，保持当前房间生命周期内的 `skinId`；不进入真人复活状态机、不扣玩家
  金币、不占真人复活档位。
- AI 皮肤从 `aiEligible=true` 中筛选，优先排除真人已装备皮肤，使用独立 `snake.ai.skin` seeded RNG 洗牌后
  轮换；皮肤随机不得消费移动、出生、食物或碰撞随机流。
- 假榜每秒刷新：每项有 2% 概率重置到 80，否则增加 `10..100`；只合并低于当前活动蛇最大长度的条目，
  与活动蛇排序后仅下发 Top 10 和本人位置。它只影响 `displayRank`。

### 皮肤、食物与表现

- `skinId` 是稳定内容 ID，同时决定头、身、尾、body sequence 与动画；禁止 `% 3`、目录索引或实体 id 哈希。
- S3 接入账号所有权前，真人皮肤只能由服务端 `RunSkinResolver` 返回默认皮肤 1；测试 fixture 可由服务端
  显式注入其他 catalog ID，但 join payload 永远不是来源。创建 run 时把结果锁存为不可变
  `skinIdAtRunStart`，供死亡、复活和重连复用；S3 只替换同一个 resolver，不另造准入路径。
- 原作彩色皮肤使用白色 tint；真人不再按席位色重染，AI 不再统一灰化。自机通过轮廓、头顶箭头、名字或
  名牌识别。
- 未知 ID、资源失败或 rect 非法统一回退皮肤 1，并记录受控诊断；表现 fallback 不得把经济目录不一致当作
  可写状态。
- Dot 使用 `variant=1..7` 的确定性分布；Star 与残骸由权威 `kind/variant` 描述，必要时携带
  `sourceSkinId`，客户端不能猜。
- 1030 个常驻食物使用同一 atlas/material 的批量 mesh；禁止每食物一个 Sprite 节点或 draw call。
- 世界外绘制主题外围背景和边界，不采用当前视口钳位。背景、网格、墙块、拖尾、保护、死亡和复活效果只从
  S1 presentation catalog 读取。

### 中央操作区与触控

坐标采用 `750 × 1624` 设计单位，原点在左下。整组 Safe Area 上移量为：

```text
controlShiftY = max(0, safeBottom + 161 - 220)
```

| 控件 | 默认功能 | 设计中心 | 可见尺寸 | 独立命中半径 |
|---|---|---:|---:|---:|
| 中央摇杆 | 转向 | `(375, 220 + controlShiftY)` | 底盘 Ø220、摇杆帽约 Ø92 | 155 |
| S1 左肩 | 表情 | `(130, 410 + controlShiftY)` | Ø88 | 56 |
| S2 左上 | 当前主动道具 | `(295, 490 + controlShiftY)` | Ø104 | 64 |
| S3 右上 | 条件护盾 | `(455, 490 + controlShiftY)` | Ø104 | 64 |
| S4 右肩 | 加速 | `(620, 410 + controlShiftY)` | Ø144 | 88 |

首版仅有加速时只显示 S4；不可用槽位不显示、不命中，其他按钮不得补位。左手模式只把四槽功能顺序镜像为
`[加速、护盾、主动道具、表情]`，摇杆始终保持 `x=375`。四槽是常驻战斗入口上限。
排行榜和状态信息固定在顶部 Safe Area；首次世界的 3 秒准备提示在安全内容区居中。进入 Playing 后移除准备
提示，且不显示房级剩余时间、`0:00` 或 TimeLimit 结束提示。HUD、弹窗和操作区都不跟随世界相机缩放。

触控语义固定如下：

1. 新触点按 `S1 → S2 → S3 → S4 → 中央摇杆` 做精确圆形命中；重叠时按钮优先，移除“左半屏是摇杆”和
   加速半径 200 的旧规则。
2. 每个 pointer 在 `TOUCH_START` 后锁定唯一 owner，直到 `TOUCH_END/TOUCH_CANCEL`；滑过其他控件不转移。
3. 至少支持一指持续转向、第二指按住加速、第三指点击辅助入口。加速按下生效、抬起或取消停止；其他按钮
   仅在原命中区内抬起时提交一次。
4. 摇杆手指拖出初始热区仍控制，摇杆帽按半径钳制；抬起回正视觉，但蛇保持最后合法方向。
5. 失焦、死亡、断线、重连恢复、场景切换、模态窗和 run 结束都清空 pointer owner 并强制停止加速。

### 无尽生命周期与真人复活状态

3 秒只用于首次世界的操作准备。Playing 后世界 tick 单调递增，结束判断只能写成：

```text
hasDeadline && tick >= endTick
```

本配置下 `world.step()` 不按时间返回 done，mode 不按 `matchTicks` 调用 `context.settle()`。第 1800、1801 tick
及后续 tick 正常推进；若显示本次游玩时长，只能从权威 `runStartedTick` 正向推导，不能成为结束条件。

真人状态机在 S2 以纯确定性世界状态和测试经济端口实现：

```text
active
  -> deadPresentation                    // 4 tick / 200 ms
      -> reliveOffering                  // 持久端口保存 offer 依据；S2 为测试实现
          -> pendingRelive               // 100 tick / 5 秒选择窗
              -> finalizing -> finalized // decline / timeout
              -> reliveSpawning          // 最多 20 tick 找安全点
                  -> finalizing           // spawnFailed，未扣费
                  -> reliveCommitting     // 调用 ReliveEconomyPort
                      -> pendingRelive    // 测试余额不足/可重试失败且未超时
                      -> reliveReady
                          -> activation gate
                              -> active   // 含 provisional 首 tick的 60 tick / 3 秒碰撞保护
                          -> finalizing   // 系统失败/终局意图
      -> finalizing -> finalized         // 第六次死亡、force、escape
```

- 死亡 tick 停止本人输入、加速和碰撞，递增 `deathSeq/deaths`，冻结版本化 `deathSnapshot`。重复事件不得重复
  播放权威死亡表现。
- 普通死亡且有档位才在 4 tick 演出后进入 offer；第六次、force、escape 不发窗。
- offer 包含 `runId/deathSeq/reliveIndex/coinCost/offeredTick/decisionDeadlineTick/relivePolicyVersion`，并投影
  到权威 player state。接受条件严格为 `currentTick < decisionDeadlineTick`；等于 deadline 时 timeout 获胜。
- `deathSnapshot` 保留长度、分数、击杀、磁铁/Star 累计等源流程会恢复的字段；复活保持同一
  `roomEpochId/runId/skinId`，清零连杀、持续击杀、攻击和碰撞等单生命瞬态，不重置到长度 80。
- 安全点搜索最多 20 tick。找不到时 `reliveSpawnFailed`，不产生扣费；取得点后再调用经济端口。
- S2 的 `ReliveEconomyPort` 只能返回确定性的测试成功、余额不足、可重试失败或系统失败，并生成非资产型测试
  标识。它不得访问 MySQL、Redis 资产、ledger 或真实余额，也不得被生产配置绑定。
- 保护使用半开区间 `[protectStartTick, protectUntilTick)`：
  `protectStartTick=reliveFirstActiveTick`、`protectUntilTick=protectStartTick+60`。activation gate 的 provisional
  Active step 是第 1 个保护 tick，activated 提交后还剩 59 个保护 tick；该保护只覆盖蛇身/首领碰撞，
  不是对墙等所有死亡来源绝对无敌。
- 选择期间只暂停本人输入、碰撞与 `activeTicks`；其他玩家、AI、食物和 world tick 不暂停。
- decline、超时、无档位、force、escape、spawnFailed、systemFailed 只结束本人 run；其他玩家的 room phase
  保持 Playing。
- 最后一名真人完成 run 冻结并离开后，AI 不再维持房间存活，由 Colyseus `autoDispose` 停 tick 和清理。
- 部署/drain、故障和单调字段接近协议安全上界使用房级内部 `Active → Draining`，不得伪装成限时结算。

`activeTicks` 在每个 fixed step 开始时，只为同时满足 `connected && alive && runState=active` 的真人加一。因此
本 step 内发生死亡的 tick 计入；Preparing、死亡演出、Offering、Pending、Spawning、Committing、Ready、
activation 确认、断线宽限和 Finalizing 都不计。成功复活后从 durable Active 确认后的下一 step 恢复累计，
不得用 `currentTick - runStartedTick` 冒充有效时长。

### `snake@2` 冻结契约

S2 将玩法契约一次提升为 `snake@2`。字段名和联合状态按下列语义冻结；后续只增加 Lobby RPC 或素材目录时
不得无故再次提升 gameplay modeVersion：

```ts
interface ISnakeSnapshotSnake {
  skinId: number;
  // 其余位置、方向、路径和玩法字段沿用版本化定义
}

interface ISnakeSnapshotFood {
  variant: number;
}

interface ISnakeSnapshotWreck {
  kind: number;
  variant?: number;
  sourceSkinId?: number;
}

type SnakeRunEndReason =
  | "explicitExit"
  | "disconnectTimeout"
  | "sessionReplaced"
  | "moderationKick"
  | "reliveDeclined"
  | "reliveTimeout"
  | "deathNoOffer"
  | "reliveSpawnFailed"
  | "reliveSystemFailed"
  | "forcedDeath"
  | "escape"
  | "serverDrain"
  | "roomFault";

interface ISnakeEndlessRoomMeta {
  roomEpochId: string;
  battlefieldConfigId: "newEndlessPortraitV2Map4096";
  lifecycleConfigId: "sourceEndlessTotalTime0";
  reliveFlowConfigId: "sourceEndlessReliveFlow";
  relivePolicyId: "onlineCoinRelive5V1";
  onlineAdaptationId: "onlineEndlessDropInV2";
  configHash: string;
  totalTime: 0;
  matchDurationTicks: 0;
  hasDeadline: false;
}

type ISnakePlayerRunState = {
  runId: string;
  stateVersion: number;
  deathSeq: number;
  relivesUsed: number;
  relivePolicyVersion: number;
  terminalIntent: SnakeRunEndReason | null;
} & (
  | { state: "preparing" | "cancelled"; runStartedTick: null }
  | { state: "active"; runStartedTick: number }
  | { state: "deadPresentation"; runStartedTick: number; resolveAtTick: number }
  | { state: "reliveOffering"; runStartedTick: number; reliveIndex: number; coinCost: number }
  | { state: "pendingRelive"; runStartedTick: number; reliveIndex: number; coinCost: number;
      offeredTick: number; decisionDeadlineTick: number }
  | { state: "reliveSpawning" | "reliveCommitting"; runStartedTick: number;
      decisionDeadlineTick: number; decisionClientReqId: string; receiptId?: string }
  | { state: "reliveReady"; runStartedTick: number; decisionClientReqId: string; receiptId: string }
  | { state: "finalizing" | "finalized"; runStartedTick: number }
);

type SnakeReliveReceiptState =
  | "none" | "processing" | "charged" | "applying" | "applied"
  | "activated" | "refunding" | "refunded";

type SnakeRewardStatus = "notEnabled" | "pending" | "applied" | "dead";

interface ISnakeRunResultV1 {
  resultVersion: 1;
  runId: string;
  endReason: SnakeRunEndReason;
  confirmedThroughTick: number;
  rewardStatus: SnakeRewardStatus;
  rewardPolicyVersion?: number;
  rewardReceiptId?: string;
  rewardSummary?: readonly { itemId: string; amount: number }[];
}
```

typed message 至少包括：

```text
c2s.snake.reliveDecision(runId, deathSeq, clientReqId, "accept" | "decline")
s2c.snake.reliveOffered(runId, deathSeq, offeredTick, decisionDeadlineTick,
                        reliveIndex, relivesRemaining, coinCost, relivePolicyVersion)
s2c.snake.reliveDecisionResult(runId, deathSeq, clientReqId,
                               insufficientCoins | retryableFailure,
                               retryable, balanceAfter?)
s2c.snake.reliveResolved(runId, deathSeq, clientReqId?,
                         revived | declined | timeout | ineligible | spawnFailed | systemFailed,
                         resolvedTick, protectUntilTick?, receiptId?)
c2s.snake.endRun(runId, clientReqId)
s2c.snake.runFinalizing(runId, stateVersion, endReason?, reliveReceiptState?)
s2c.snake.runResult(payload: ISnakeRunResultV1)
```

普通且无档位时不发送 `reliveOffered`，以 `deathNoOffer` 直接产生个人结果；`ineligible` 只用于迟到/竞态
decision 的 canonical 回应，并映射同一 `deathNoOffer`，不能另造第二种结算原因。`reliveOffered` 必须同步
投影进 schema，不能只靠 push。兼容期即使仍保留 `endTick/winnerId`，客户端也必须由 `hasDeadline=false`
守门；旧 `respawnTick` 删除或限制为 AI 内部字段。素材目录另携带 `presentationVersion/catalogHash`，不假设它
已经进入 gameplay contract digest。

`snake@2` 必须一次声明 S2R/S4 已知需要的 versioned receipt/result envelope：S2 测试结果使用
`rewardStatus="notEnabled"`，S2R 填充已声明的 relive receipt 状态，S4 才启用
`pending/applied/dead` 与奖励摘要。后续阶段若只激活这些已声明语义，不提升 modeVersion；若确实需要新增或
改变未声明的 wire 语义，则从**当时实际版本**递增并补兼容矩阵，禁止在任何阶段硬编码“必为 `snake@3`”。

## 稳定任务 ID

任务 ID 一旦用于 commit、测试证据或缺陷单，不因排序调整而重编号。每项必须同时完成动作、产物和验证。

### S2-01：落地组合配置与共享规则

**动作**

- 在 shared 手写真源中定义五层配置 ID、组合 hash、4096² 边界、食物数量、长度、相机、身体缩放、AI 阵容、
  假榜与无 deadline 语义。
- 镜像并校验 71 项 `point_step_config`；按 S0 差异表显式处理 Star、速度、加速、转向和保护。
- 将视觉格距 32 与服务端 broadphase `GRID_CELL` 分离，禁止误改碰撞分区。

**产物**

- 可序列化、可 hash、可由双端读取的命名配置。
- 路径点、相机和身体缩放的 shared 纯函数与边界向量。

**验证**

- 配置逐字段 fixture 与 S0 冻结快照一致，唯一覆盖仅为 4096² 地图。
- 路径点固定向量全部通过；`1240` 未进入消费路径。
- shared 继续保持 ES2017、零依赖、无 Node/DOM/引擎全局。

### S2-02：移除房级限时收局

**动作**

- 将房间元数据改为 `totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false`，让 `endTick` 缺省。
- 所有按时长结束判断增加 `hasDeadline` 守门；移除第 1800 tick settle、终局末段禁复活和剩余时间 HUD。
- 保留单调 world tick、首次 3 秒准备和个人 `decisionDeadlineTick`。

**产物**

- 持续推进的无尽 mode 和兼容期 schema 投影。
- 无 `0:00`、无 TimeLimit 结果页的客户端 HUD。

**验证**

- 自动推进到 1799、1800、1801 及更后 tick，world 与 Playing phase 均不结束。
- 房级无 deadline 不影响 100 tick 复活选择超时。
- 无尽 mode 没有通过奖励、空房或死亡路径调用 `context.settle()`。

### S2-03：实现世界几何、相机、身体与路径增长

**动作**

- 改为中心原点的 4096² 世界、16 单位边距、80 出生长度和 100000 最大长度。
- 实现长度驱动的相机 `1.3→0.6`、身体 `1.0→2.8` 和 V2 路径点增长。
- 相机持续跟随自机蛇头，靠边界显示外围背景；服务端碰撞使用相同身体缩放。

**产物**

- shared/server 权威几何计算与客户端一致的渲染投影。
- 固定实体/种子的竖版 world golden。

**验证**

- 80、300、3000、18900、19200、20100、100000 长度的路径、相机、身体断言通过。
- 旋转证据与目标重合区域按 1:1 世界单位叠图，不发生 4096/4896 缩放。
- 靠四条边界的相机、外围背景、碰撞和视觉轮廓一致。

### S2-04：实现食物、Star 与残骸

**动作**

- 生成并维持 1000 Dot + 30 Star；为食物增加权威 `variant`。
- 实现 Star 的移动、确定性随机变向与撞边反弹。
- 分离 Dot、Star、加速残骸和 AI 死亡残骸 `kind`；按需携带 `variant/sourceSkinId`。
- 以确定性定点数实现 AI 残骸公式和房间 cap 下的分值守恒。

**产物**

- 服务端食物/残骸模拟、V2 快照字段与客户端 atlas 批渲染。
- 同种子稳定复现的七色 Dot 和 Star 轨迹 fixture。

**验证**

- 稳态数量严格为 1000 + 30，七个 Dot 帧均可出现，尺寸为 16/42。
- 真人死亡不产生计分残骸；AI 公式边界与合并守恒测试通过。
- 性能测试证明未创建 1030 个 Sprite 节点，draw call/mesh 数满足既有预算。

### S2-05：统一皮肤渲染与表现目录消费

**动作**

- 以稳定 `skinId` 同时绑定 head/body/tail、动画、body sequence、间距、pivot 和 visual scale。
- 移除席位 tint、AI 灰 tint 和实体 id 哈希身体材质；增加不改原色的自机/AI 身份提示。
- 对未知 ID、加载失败、非法 rect 实现皮肤 1 fallback 与受控诊断。
- 从 presentation catalog 读取主题背景、网格、边界、音效和效果。

**产物**

- 单蛇主体 mesh 渲染器、按皮肤材质分组与 catalog-driven 表现。
- 16 皮肤的动态战场预览/回归 fixture。

**验证**

- 每条蛇头、身、尾和动画始终属于同一 ID；不再出现 `% 3` 或哈希选材质。
- 未知、缺图、非法 rect 均稳定回退且不阻塞开局。
- `sfxOn`、动态 import、View/Logic 分层与资源加载测试通过。

### S2-06：实现动态真人/AI roster 与展示榜

**动作**

- 首人开局生成 16 AI；真人加入只替换 aiLevel 401，最终离开才补回。
- 把 AI 重生集合重命名并限定为 `pendingAiRespawns`，真人永不进入。
- 实现独立 AI 皮肤 RNG 子流和 86 项假榜模型；展示榜与 run 证据完全隔离。

**产物**

- 稳定态 17 条活动蛇的动态 roster。
- Top 10 + 本人位置的 `displayRank` 投影。

**验证**

- 1～8 真人分别对应 16～9 AI；只替换/补回 aiLevel 401。
- 待复活真人仍占席；AI 约 40 tick 后恢复且保持皮肤。
- 假榜从不进入实体、碰撞、快照蛇数组或资产证据；新增皮肤不改变玩法 RNG 轨迹。

### S2-07：实现测试端口上的真人复活状态机

**动作**

- 建立 `deadPresentation/reliveOffering/pendingRelive/reliveSpawning/reliveCommitting/reliveReady` 状态和
  `deathSeq/stateVersion/terminalIntent` 守门。
- 冻结版本化 death snapshot，实现 4/100/20/60 tick 边界、保护半开区间、五档费用、恢复字段和单生命瞬态清理。
- 定义并注入无外部资产写的 `ReliveEconomyPort` 测试实现；覆盖成功、余额不足、可重试失败、系统失败。
- 用 `(roomEpochId, runId, deathSeq)` CAS 决定 accept、decline 或 timeout 的唯一赢家。

**产物**

- 可确定性重放的纯玩法状态机和测试经济适配器。
- 生产构建中默认关闭的 `onlineCoinRelive5V1` 发布开关。

**验证**

- 真人永不走 40 tick 自动重生；AI 永不进入真人 offer。
- 同/反向/迟到决定不会重复演出、生成、复活或 finalize。
- 第 1～5 次测试成功费用依次为 100/200/300/300/300；第六次不发窗。
- 静态/启动断言保证生产配置不能绑定测试端口，也不能以测试结果更新真实余额。

### S2-08：建立 room epoch 与内存 run 生命周期

**动作**

- 通过通用 mode lifecycle capability 在开放 admission 前生成一次 `roomEpochId`，并与前移后的
  `state.matchId` 共用同一值；首人 auto-start 不得覆盖。
- 以测试账本创建唯一 run；通过服务端 `RunSkinResolver` 选择默认皮肤 1（测试 fixture 可显式覆盖），锁存
  `skinIdAtRunStart`，处理重连延续、最终离场冻结和重新加入新 run；禁止读取 join 自报皮肤。
- 最后真人冻结并离开后停止 tick，让 `autoDispose` 回收房间。

**产物**

- S2 内存/测试 run store 与生命周期 capability。
- S2R 可替换的 admission/final-leave 端口契约。

**验证**

- admission 前已有稳定 epoch；其他玩法的 matchId 生成边界不变。
- 宽限内重连沿用 run，最终离开再加入生成新 run。
- AI/假榜不能单独维持房间；空房无残留 timer、task 或 world 引用。

### S2-09：升级 `snake@2` 契约与 typed message

**动作**

- 把临时 `skin` 收敛为稳定 `skinId`；为 food/wreck 增加 `variant/kind/sourceSkinId`。
- 增加房间五层配置 ID、config hash、room epoch、无 deadline 元数据与 player run state。
- 定义 `reliveDecision/reliveOffered/reliveDecisionResult/reliveResolved/endRun/runFinalizing/runResult` typed
  message及 versioned receipt/result envelope；S2 的 result 明确使用 `rewardStatus="notEnabled"`。
- validator 由 `0..15` 改为 catalog 成员或稳定 ID 上界。

**产物**

- `snake@2` 手写真源、生成 schema、客户端 shared 镜像与版本拒绝策略。
- 后续 S2R/S4 激活预声明字段、或新增 wire 语义时递增实际版本的决策表。
- 可由重连 schema 重建 offer/processing/result 的 player state。

**验证**

- 旧客户端被明确拒绝，不静默解释新字段。
- 未知皮肤仅表现回退；配置/hash 不匹配不回退 Classic 或 TimeLimit。
- offer push 丢失后仍能从 schema 恢复同一 `deathSeq/deadline`。
- `runFinalizing/runResult` 不再是省略号契约；后续阶段不硬编码 `snake@3`。

### S2-10：实现 V2 分块基线与有序 delta

**动作**

- 服务端保留完整权威路径，以 `begin → ordered chunks → end(checksum)` 发送首次/重连基线。
- 后续按序发送食物增删、Star 移动和蛇路径 append/trim delta；维护序号、checksum 和重取机制。
- 为 chunk 数、总实体、单蛇点数、全房点数和序号设置独立 validator 上限。

**产物**

- 可承载 17 蛇、1030 食物、单蛇 5186 点、全房理论 88162 点的 wire 流。
- 客户端基线组装、delta 消费和 resync 状态机。

**验证**

- 最大 fixture 可完成首包与重连，不截断尾部、食物或蛇。
- 缺块、重复块、乱序、checksum 错误和 delta 丢序均请求新基线，而非静默继续。
- 快照预算与客户端插值在长路径/长驻 churn 下符合性能门禁。

### S2-11：重建中央操作区布局

**动作**

- 按冻结坐标创建中央摇杆和 S1～S4 浅弧；使用统一 `controlShiftY` 适配底部 Safe Area。
- 实现未开放槽位隐藏且不补位、左手功能镜像、HUD/弹窗不随相机缩放。
- 把排行榜/状态放在顶部 Safe Area，把首次 3 秒准备提示放在安全内容区中央；Playing 后不保留准备提示或
  房级倒计时。
- 首发不实现表情入口，S1 保持隐藏且不命中；未来若接入表情面板只能向上展开。设置、衣柜、被动效果和
  复活弹窗不占四槽。

**产物**

- catalog/配置驱动的竖版控制布局与 Safe Area 计算。
- 默认、左手、不同底部安全区的布局 fixture。
- 顶部安全区 HUD 与居中准备提示的 `750 × 1624` 布局 fixture。

**验证**

- 默认中心、可见尺寸和命中半径逐项精确断言。
- Safe Area 只整组上移，横向中心、相对弧线、尺寸和世界单位不变。
- 隐藏槽位不渲染、不命中，其他槽位绝不补位。
- 排行榜/状态不侵入刘海或操作区，准备提示居中且 Playing 后消失。

### S2-12：重写 pointer ownership 与多点触控

**动作**

- 按按钮优先、摇杆最后的圆形热区路由新触点，并锁定唯一 owner。
- 实现双指持续转向+加速、第三指辅助点击、摇杆拖出热区继续控制和按钮原区抬起提交。
- 统一实现 cancel-all，在失焦、死亡、断线、重连、场景切换、模态窗和 run 结束路径调用。

**产物**

- 与节点布局共用同一几何数据的输入路由器。
- 可独立于 Creator 运行的 pointer 序列测试。

**验证**

- 删除左半屏与半径 200 旧判断；滑过控件不转移 owner。
- 1～3 指交错 start/move/end/cancel 不抢控、不重复点击、不残留 boost。
- 摇杆帽回正但最后合法方向保持；按钮只在原命中区抬起时提交一次。

### S2-13：实现客户端无尽、复活与个人结果 ViewModel

**动作**

- Logic 读取 `hasDeadline=false` 并关闭旧倒计时/整房结果路径；保持 world tick 插值和正向 run 时长。
- 依据 `runState/deathSeq/stateVersion/decisionDeadlineTick` 构建复活 ViewModel，用服务端 tick 显示倒计时。
- 实现稳定 `clientReqId` 的 accept/decline/endRun；同次网络重试复用 ID，再次点击生成新 ID。
- 实现死亡演出、费用/档位、测试余额标识、放弃、处理中、保护表现、无资格直达个人结果和重连恢复；复活窗
  必须显示死亡原因、当前长度/分数、服务端 tick 推导倒计时，战斗 HUD 的“结束本次”必须二次确认。

**产物**

- 不导入 `cc`/`fairygui-cc` 的 gameplay Logic。
- 原作风格复活模态窗和个人结果路由；明确标注 S2 测试经济环境。

**验证**

- 重复/乱序 offer、decisionResult、resolved 只向更高 `deathSeq/stateVersion` 收敛。
- 客户端不能延长 deadline、创建蛇、决定费用或修改真实余额。
- 模态窗出现前释放全部 pointer；同房其他玩家不进入结果页。
- “结束本次”首次点击不会直接 finalize；确认取消恢复战斗，确认提交才发送幂等 `endRun`。

### S2-14：连接变化、离场与长驻 churn 清理

**动作**

- 增加通用 `connectionChanged`（或等价）玩法钩子；存活断线时关闭 boost、保留最后合法方向，待复活断线时
  deadline 继续。
- 最终离场同步清理 participant、蛇、`pendingAiRespawns`、真人 relive 状态/任务、输入、快照游标和已完成
  run 引用。
- 实现有界 Draining：停准入、冻结活跃测试 run、关闭连接和回收；不伪装成房级时间结束。

**产物**

- 通用连接投影和 S2 测试版 final-leave 收口。
- 可观测的集合大小/任务注册表诊断。

**验证**

- 大量 join/leave/reconnect/death/decision 后集合回落到当前在线规模。
- 断线不延长 offer；重连只恢复同一 offer 或结果。
- 最后一名真人离开后世界停止；多真人时单人终局不影响其他人 Playing。

### S2-15：生成、同步与阶段回归

**动作**

- 只修改 shared/schema/feature 等手写真源，依标准顺序执行 gameplay/feature codegen、shared/client sync 和
  protocol fingerprint 显式重钉。
- 更新服务器、客户端、FGUI、故障、容量、性能和兼容测试；保留 Creator 阶段证据占位。
- 审核生成 diff，禁止把无关生成物或依赖目录混入阶段提交。

**产物**

- 双端一致的生成结果、测试 fixture、golden 与命令日志。
- 给 S2R 的端口、状态、schema 和未开放发布开关交接记录。

**验证**

- 运行与本阶段相关的 `typecheck`、client/server/FGUI、protocol、sync、vendor、perf 和 core 门禁。
- `npm run verify:all` 中与本阶段无 Creator 依赖的项目全绿。
- 生成物只由 codegen/sync 产生；受保护路径检查无手改。

## 故障与并发矩阵

S2 使用纯测试端口验证玩法状态唯一性，不声称覆盖真实数据库崩溃窗口。表中“扣费”均指测试端口调用记录，
绝不能落到真实资产。

| 场景 | 唯一正确结果 | 必备断言 |
|---|---|---|
| tick 1799/1800/1801 | 世界连续 Playing | 无 `context.settle()`、无 `0:00`、tick 单调 |
| `totalTime=0` 与 offer 并存 | 个人 deadline 仍在 100 tick 到期 | 房级字段不参与个人比较 |
| 普通死亡事件重复到达 | 只冻结一个 `deathSeq` | 一次演出、一个 snapshot、一个 offer |
| 第六次死亡或 force/escape | 直接个人 finalizing | 不发 offer、不调用经济端口 |
| accept 与 decline 同 tick | 一个 CAS 胜者 | 不同时复活和 finalize |
| accept 与 deadline 相遇 | `< deadline` 的已获 token accept 胜；`==` timeout 胜 | 客户端时间戳不能挽救晚到请求 |
| 同 requestId 同 payload 重放 | 返回相同测试结果 | 不重复 spawn/端口调用/状态跃迁 |
| 同 requestId 异 payload | 冲突 | 不改变原决定 |
| 相反 decision 晚到 | 返回既有 canonical 结果 | 不重复演出、复活或结算 |
| 测试余额不足且 deadline 未到 | 回同一 PendingRelive | 不消耗档位；再次点击用新 ID |
| 测试余额不足且 deadline 已到 | timeout | 不复活、不消耗档位 |
| 安全点 20 tick 内不可得 | spawnFailed | 经济端口调用次数为 0 |
| 测试端口系统失败 | systemFailed 个人终局 | 无真实资产写；不开免费复活 |
| 待复活时断线/重连 | deadline 继续；重建同一 offer/result | runId/deathSeq 不变，不重复机会 |
| 存活时断线 | 关闭 boost，暂停 activeTicks | 最后方向语义稳定，无 pointer 残留 |
| 真人待复活 | 仍占真人席位 | 不补短命 AI，其他世界继续 |
| 1～8 真人并发加入/离开 | 稳态活动蛇为 17 | 只替换/补回 aiLevel 401 |
| AI 与真人同时死亡 | AI 40 tick 重生，真人进选择 | 两套 pending 集合无交叉 |
| chunk 缺失/重复/乱序/校验错 | 客户端重取基线 | 不应用部分或乱序世界 |
| 旧客户端加入 `snake@2` | 明确版本拒绝 | 不静默降级字段 |
| 未知皮肤/资源缺失 | 表现回退皮肤 1 | 世界继续且有受控诊断 |
| 三指交错并滑过控件 | owner 不转移 | 转向、加速、辅助点击互不抢占 |
| 失焦/死亡/断线/场景切换 | cancel-all | pointer 集合空、boost=false |
| 单人 endRun、多真人继续 | 只结束对应 run | room phase 仍为 Playing |
| 最后一名真人离场 | 测试 run 冻结后 autoDispose | AI/假榜不保活，无 detached task |
| 长驻 churn | 集合回到在线规模 | 无 finalized run、游标或 pending AI 泄漏 |

## 退出条件

以下条件必须全部满足，S2 才能标记 `[已完成]`：

- [ ] S0 的五层配置与 hash 被双端显式声明；不存在 Classic、TimeLimit 或动态 AB 隐式 fallback。
- [ ] 4096²、32 网格、1000+30 食物、80/100000 长度、相机/身体/路径公式和 AI 残骸公式均有确定性测试。
- [ ] 1～8 真人下稳定态始终为 17 条活动蛇；AI 阵容、皮肤 RNG、假榜隔离和独立重生均通过。
- [ ] 真人复活状态机的 4/100/20/60 tick 边界、含 provisional 首 tick 的保护半开区间和
  accept/decline/timeout CAS 竞态全部通过。
- [ ] 真人不存在 40 tick 自动重生，真人死亡不产生可拾取计分残骸。
- [ ] 房间在 1800/1801 tick 继续，客户端不显示剩余时间或等待 room Settle。
- [ ] `snake@2` 可承载 17 蛇、1030 食物、单蛇 5186 点、全房 88162 点，并完整声明后续 receipt/result
  envelope；基线/delta 故障可重同步，后续版本按实际语义递增而非硬编码 `snake@3`。
- [ ] 中央摇杆、四槽、Safe Area、左右手模式、双指持续操作和第三指辅助入口均有自动输入回归。
- [ ] 断线、重连、最终离场、Draining、空房回收与 churn 清理不留实体、任务、pointer 或游标。
- [ ] 客户端复活窗仅以权威 player state/tick 驱动，重复和乱序消息不产生第二结果。
- [ ] 测试 `ReliveEconomyPort` 与生产资产实现物理隔离，生产启动/配置检查无法误绑。
- [ ] **`onlineCoinRelive5V1` 面向玩家的发布开关仍为关闭。** 文档、UI 和测试结果不得声称已完成真实扣费。
- [ ] 相关生成、同步、类型检查、server/client/FGUI、容量与性能门禁通过，Creator 待验证项有明确证据位。

S2 完成只表示“战场与测试经济状态机可内部试玩”。S2R 真实收据、恢复与全崩溃窗口门禁完成后只取得技术
放行资格；实际对外开关仍由 S5 在最终 go/no-go 后开启。

## 风险与回退

| 风险 | 预防 | 回退/处置 |
|---|---|---|
| 4096² 被误作整体缩放 | 源快照与目标配置分离；1:1 世界单位叠图 | 阻断 golden；回退目标配置 commit，不改源证据 |
| Classic/TimeLimit 值混入 | 五层 ID+hash 强校验 | fail closed，不自动退回旧 90 秒模式 |
| `totalTime=0` 误伤个人 deadline | 字段分型、独立测试 | 禁止上线；恢复最后一个通过的 wire/config 版本 |
| 真实经济误接 S2 | 依赖反转、生产启动断言、发布开关关闭 | 立即关闭开关；若发生资产写转 S2R 收据审计，不以客户端补偿 |
| V2 容量导致快照/内存失控 | 分块基线、有序 delta、独立上限和 perf fixture | 拒绝不兼容客户端；不得静默截断世界 |
| 体型只改视觉 | shared/server 权威公式 | 阻断视觉 golden 与碰撞门禁，不发布该配置 |
| 真人复用 AI 重生/残骸 | 分离集合与状态类型 | 测试发现即 fail closed，禁止用旧路径兜底 |
| AI/皮肤 RNG 污染玩法 RNG | 命名子流 | 回退新增表现目录不影响已有世界 seed |
| 资源/hash 不一致 | 表现 fallback 与配置诊断 | 战斗回退皮肤 1；不得把外观目录相关经济写标成可用 |
| pointer owner 泄漏 | 单一 cancel-all 与生命周期钩子 | 立即强制 boost=false；输入测试不通过不得发布 |
| 长驻 churn 泄漏 | 集合诊断和高循环 fixture | 触发房级 Draining；保留证据后安全回收 |
| wire 升版破坏旧客户端 | admission 版本拒绝 | 保留明确升级提示；禁止字段降级解释 |

本阶段的主要回退手段是配置/发布开关和版本准入，不得回退到“真人自动复活、90 秒隐藏收局、客户端扣币”
这类已明确否决的语义。

## 证据回写

完成任务或阶段时填写真正运行过的证据；未运行不得写“通过”。Creator 证据路径必须能由仓库成员复核。

| 任务/范围 | 状态 | commit | 自动验证（命令 + 结果） | golden / Creator / 日志 | 备注 |
|---|---|---|---|---|---|
| S2-01～S2-03 配置、生命周期、几何 | `[已拍板·待实施]` | — | — | — | — |
| S2-04～S2-06 食物、表现、AI/假榜 | `[已拍板·待实施]` | — | — | — | — |
| S2-07～S2-08 复活与 run 生命周期 | `[已拍板·待实施]` | — | — | — | 测试端口；发布开关必须关闭 |
| S2-09～S2-10 wire 与同步 | `[已拍板·待实施]` | — | — | — | — |
| S2-11～S2-14 输入、UI、连接与清理 | `[已拍板·待实施]` | — | — | — | — |
| S2-15 阶段回归 | `[已拍板·待实施]` | — | — | — | — |
| S2 阶段结论 | `[已拍板·待实施]` | — | — | — | 不代表 S2R 经济可靠性完成 |

证据至少包括：组合 config hash、1800/1801 tick 日志、最大容量 fixture、复活竞态测试、AI roster/churn
统计、输入 pointer 序列、`750 × 1624` world golden、资源 fallback 截图，以及发布开关保持关闭的配置证明。

---

> [返回专项索引](README.md) · [上一阶段：S1 素材与目录](s1-assets-and-catalog.md) ·
> [下一阶段：S2R 可靠金币复活](s2r-reliable-coin-relive.md)
