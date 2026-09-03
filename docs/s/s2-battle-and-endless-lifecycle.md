# S2：竖版战场与无尽生命周期

> [专项索引](README.md) · [上一阶段：S1 素材与目录](s1-assets-and-catalog.md) ·
> [下一阶段：S2R 可靠金币复活](s2r-reliable-coin-relive.md)

## 状态、预计与依赖

| 项目 | 口径 |
|---|---|
| 状态 | `[已完成]`（2026-09-03） |
| 预计 | 11–16 人日；不含最终 FGUI 美术制作与反复数值调优 |
| 前置依赖 | [S0 复刻基线](s0-replication-baseline.md) 已冻结命名配置、来源证据、规则差异表与 golden；[S1 素材与目录](s1-assets-and-catalog.md)（含 S1-12 磁铁表现资源与目录增量）已完成 |
| 本阶段输出 | `snake@2`、4096² V2 战场、无房级 deadline 的持续世界、17 条稳定态活动蛇、确定性 Star 运动与磁铁刷新/扩圈拾取周期、中央操作区、设备本地左右手设置、多点触控、测试经济端口上的真人复活状态机、分块基线与增量同步 |
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
7. 落地 Star `320/3 unit/s`、`34..67 tick` 确定性变向，以及磁铁 `15/60/150 秒 + 后续每 150 秒`
   的服务端权威刷新、移动、拾取、8 秒被动扩圈和状态表现。
8. 将右手布局作为首发默认，在局内设置中切换左/右手布局；候选值设备本地写入成功后才即时应用。
9. 在无真实经济副作用的条件下，把完整玩法状态机、客户端 UI 和竞态测试跑通，为 S2R 提供稳定端口边界。

### 非目标

- 不接入真实 MySQL 扣币、货币流水、复活收据、退款、owner lease 或恢复器；这些只属于 S2R。
- 不用客户端余额扣减、免费复活或内存“成功收据”冒充真实经济完成。
- 不开放广告、分享、广告券、钻石、现金支付、月卡、新手免费复活或无限复活卡。
- 不实现衣柜所有权、装备、碎片解锁和养成奖励；分别属于 S3、S4。
- 不迁移原作私有协议、支付、活动或动态 AB；不把 Feed B 表描述成普通线上 V2 的恒定默认。
- 不恢复 TimeLimit 90 秒模式，不保留第 1800 tick 隐藏收局、终局末段禁复活或整房 `context.settle()`。
- 不把 86 个假榜条目生成成场内 AI、碰撞实体或奖励参与者。
- 不允许不同皮肤改变速度、碰撞体、初始长度、转向、攻击范围或得分。
- 不把磁铁做成主动道具、按钮或四槽入口；不为其新增 c2s 使用消息。
- 不把左右手偏好写入 User、Lobby RPC、房间 wire 或 MySQL；它不是跨设备账号配置。
- 首发 HUD 不显示“本次游玩时长”；`runStartedTick` 仍保留为权威生命周期/证据字段。
- 不手改生成 registry、schema 镜像、客户端 shared 镜像或 Cocos 同步镜像。

## 冻结口径

### 配置组合与世界坐标

本阶段只实现以下五层已命名配置的组合，不允许运行时拼接其他 Classic、TimeLimit 或 AB 值：

| 配置层 | 冻结语义 |
|---|---|
| `newEndlessPortraitV2Map4096` | S0 已冻结的 V2 战场层：原 4896² 只把边界覆盖为 4096²，食物、相机、身体、AI、假榜、表现与来源 `endless_tool_config` 的前三波保持 S0 快照；本层不承载 150 秒后的循环 gate |
| `sourceEndlessTotalTime0` | `totalTime=0`、无剩余时间 HUD、无整局到点和终局末段禁复活 |
| `sourceEndlessReliveFlow` | 普通真人死亡进入限时选择；成功恢复明确累计字段并获得 3 秒碰撞保护；拒绝、超时或无档位结束个人 run |
| `onlineCoinRelive5V1` | 五档金币 `100/200/300/300/300`，固定 5 秒；S2 只把费用作为测试端口输入，不发生真实资产写 |
| `onlineEndlessDropInV2` | 保持稳定 ID，S2 将层内显式 `version: 1` 提升为 `version: 2`：首人启动、3 秒准备、最多 8 真人、Playing 可入、稳定态 17 条活动蛇、个人 run 独立终局、空房回收，以及 Star/磁铁的 20 Hz 确定性移动与 150 秒后的循环 gate |

S0 的五层 hash 与组合 hash `2319d173…f87e2` 是不可改写的历史证据，不是 S2 的目标输出。S2 只保持
`onlineEndlessDropInV2` 的稳定 ID，把其层内显式 `version` 从 `1` 升为 `2`，以本节新增运动、刷新、拾取和
联机规则生成新的实际 layer hash；另外四层的 ID、payload 和 layer hash 必须与 S0
完全相同，版本保持 `1`。最终组合清单把五层 ID、版本和 layer hash 一起规范化，生成新的实际组合 hash；两个新 hash 只能由
实现生成后回写，不在计划中预填，也不得覆盖 S0 evidence。

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
| Star / 磁铁移动 | `320/3 unit/s = 16/3 unit/tick @ 20 Hz` | 使用冻结的 milli/micro-unit 余数累加避免长驻漂移；每次变向间隔由独立 RNG 均匀取整数 `34..67 tick`（含端点） |
| 磁铁刷新 | `tick 300 / 1200 / 3000`，每波 10 个 | 分别对应首次 Playing 后 15/60/150 秒；之后从 tick 6000 起每 3000 tick 判定一次 |
| 磁铁存在 / 生效 | `400 / 160 tick` | 世界存在 20 秒，拾取后 8 秒被动扩大拾取圈；同时存在上限 10，不计入 1030 食物 |
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

Star 的长度/分值仍固定为 `10/10`；蛇的基础速度 `160 unit/s`、加速倍率 `2`、最大转向
`9°/tick @ 20 Hz` 和首次出生保护 30 个活动 tick 继续读取 S0 已拍板差异表。Star 自身移动则
按本次决策固定为 `320/3 unit/s`，不再留作 S2 实施时猜测项。AI 死亡残骸公式为：

```text
totalDeathWreckScore = pow(deadSnakeScore, 0.8) * 2
perWreckScore = max(totalDeathWreckScore / bodyCount, 3)
```

若因房间残骸 cap 合并实体，合并前后必须守恒该次 AI 死亡的总残骸分值。真人死亡只播放表现，不生成可拾取
计分残骸。

### Star 与磁铁确定性周期

- Star 与世界磁铁共用一个服务端权威移动内核：速度精确为 `320/3 unit/s`，20 Hz 每 tick 的标量位移为
  `16/3 unit`。每个实体出生时令 `distanceMilliRemainder=0`；每 tick 依次计算
  `n=distanceMilliRemainder+16000`、`stepMilli=floor(n/3)`、`distanceMilliRemainder=n%3`，得到循环
  `5.333/5.333/5.334` unit 的确定性步长。转向或撞边不清空该余数，禁止把速度截成 `5` 或常量 `5.333`。
- S2 先把当前仅位于服务端 `snake/rules.ts` 的 `directionVector` 下沉到 shared 手写纯函数真源，
  与 shared 已有的 `quantizeSnake` 共同复用：方向分量先量化到 `0.001`，权威内部位置以
  micro-unit 安全整数累加 `directionMilli * stepMilli`，wire/碰撞投影再按
  `quantizeSnake(value)=round(value*1000)/1000` 输出；不得把已投影的浮点坐标反向作为下一 tick 的累加真相。
- 每个实体使用自己的独立 seeded RNG：Star 的子流名固定为 `snake.motion.star:<entityId>`，磁铁固定为
  `snake.motion.magnet:<entityId>`，由 `SeededRandom.stream(matchSeed, streamName)` 派生；`entityId` 是该
  `roomEpochId` 内不复用的十进制稳定 ID。出生时按来源一致的固定 draw order 先取
  `headingDeg=nextInt(0,360)`（整数度闭开区间 `[0,360)`），再取
  `holdTicks=nextInt(34,68)`，并令 `remainingDirectionTicks=holdTicks`。每次计划变向也严格先方向、后保持期；
  禁止共用全局 motion stream。
- 每次 movement phase 开头，若 `remainingDirectionTicks===0`，先按上述 draw order 抽新方向/保持期并把 remaining
  设为 hold；随后计算候选位置，合法边界须扣除实体半径（Star `21`、磁铁 `35`）。未撞边的 tick 在移动完成后
  执行 `remainingDirectionTicks--`，所以一次 `holdTicks=34/67` 恰好驱动 34/67 次移动，不存在 33/66 的歧义。
  越过单轴时镜像反射超出量并翻转该轴方向，角落同 tick 同时反射两轴；撞边结果晚于并覆盖同 tick 的随机转向，
  废弃当前 remaining 并只重抽一次反射后保持期（不重抽随机方向）。当 tick 的镜像反射是上一段候选移动的几何响应，
  不计入新 hold；tick 末设 `remainingDirectionTicks=holdTicks` 且不递减，新 hold 从下一 tick 起恰好驱动
  34/67 个完整 movement tick。若计划变向与撞边同 tick，先消费“方向、保持期”，
  再为反射只消费一个保持期；角落也只抽一次。出生和计划变向的 `holdTicks=34/67` 同样恰好覆盖
  34/67 次完整移动，不存在 33/66 或撞边后 35/68 的歧义。
  所有结果留在 4096² 合法边界内。变向、撞边与移动不消费蛇、食物、
  AI 皮肤或磁铁刷新调度的 RNG 子流。
- 磁铁的稳定 `toolId=10001`。调度器以房间首次进入 Playing 的 `playingStartedTick` 为唯一锚点，
  在相对 tick `300/1200/3000` 无条件生成 10 个；之后在 `6000/9000/...` 每隔 3000 tick 只评估一次。
  drop-in、死亡、复活和重连都不能重置或复制该调度。
- trigger 在 fixed-step 的**开头**读取上一 tick 已提交的 run 状态/长度快照，先完成 gate 与本波实体创建，再进入
  本 tick 的世界实体移动、蛇移动和碰撞/拾取阶段；因此同 tick 内从 49999 变为 50000 或发生死亡/终局不反向
  改写本次 gate。新磁铁以 trigger tick 为 `spawnTick`，当 tick 立即执行一次移动并可在随后碰撞阶段被拾取。
  被 gate 跳过的波次不分配 tool entity ID、不消费位置或 motion RNG，但触发序号照常前进且永不补发。
- 后续循环只在触发 tick 存在至少一个状态为 `active | deadPresentation | reliveOffering | pendingRelive |
  reliveSpawning | reliveCommitting | reliveReady` 且权威长度 `< 50000` 的真人 run 时生成。`active`（包括断线
  宽限中的存活 run）读取当前权威长度，其余六种资格状态读取同一 `deathSnapshot.length`；`preparing | cancelled |
  finalizing | finalized` 明确不具资格，AI 和假榜也不进入 gate。当次不满足就跳过，不补发、不累积到下一波。
- 每个磁铁的存活区间为 `[spawnTick, expireTick)`，`expireTick=spawnTick+400`；同时存在上限为 10。
  真人和 AI 都可拾取，同 tick 竞争按稳定蛇实体 ID 顺序决定唯一胜者，实体移除只发生一次。真人胜者递增其
  run 的 `magnetCollected` 并更新蛇 buff；AI 胜者只更新 AI 蛇的 `magnetUntilTick`，不创建或递增真人 run 计数。
- 拾取后的被动效果区间为 `[pickupTick, magnetUntilTick)`，`magnetUntilTick=pickupTick+160`。在生效期内再拾取
  只刷新为 `max(oldMagnetUntilTick, pickupTick+160)`，不叠层强度。它把 Dot、Star 和两类残骸的拾取范围
  在原半径上额外增加 `2.4 × 36 = 86.4` 世界单位，不扩大磁铁本身的拾取范围。本文的磁铁“吸附”精确解释为
  扩大服务端权威拾取判定圈；不给 Dot/Star/残骸施加二次位移、速度或拉取轨迹，
  客户端也不预测额外位移。最终归属仍只由服务端判定。

### AI、席位与展示榜

- 首位真人开局时生成 K1 level 0 的 16 条 AI：`aiLevel 401×8、402×4、403×2、404×2`。
- 第 2～8 位真人加入时，每人只替换一条 aiLevel 401 AI；满 8 真人时仍保留 9 AI。
- 真人离开且 run 最终完成、席位释放后补回 aiLevel 401 AI。真人处于死亡演出、选择、生成、提交、Ready
  等短暂状态时仍占席，不临时补 AI。
- AI 约 40 tick 后按自身配置重生，保持当前房间生命周期内的 `skinId`；不进入真人复活状态机、不扣玩家
  金币、不占真人复活档位。
- AI 皮肤从 `aiEligible=true` 中筛选，优先排除真人已装备皮肤，使用独立 `snake.ai.skin` seeded RNG 洗牌后
  轮换；皮肤随机不得消费移动、出生、食物或碰撞随机流。
- AI 身份固定用名字显示，不为 AI 另加灰 tint、白色轮廓或头顶箭头；白色轮廓只标记自机。
- 假榜每秒刷新：每项有 2% 概率重置到 80，否则增加 `10..100`；只合并低于当前活动蛇最大长度的条目，
  与活动蛇排序后仅下发 Top 10 和本人位置。它只影响 `displayRank`。

### 皮肤、食物与表现

- `skinId` 是稳定内容 ID，同时决定头、身、尾、body sequence 与动画；禁止 `% 3`、目录索引或实体 id 哈希。
- S3 接入账号所有权前，真人皮肤只能由服务端 `RunSkinResolver` 返回默认皮肤 1；测试 fixture 可由服务端
  显式注入其他 catalog ID，但 join payload 永远不是来源。创建 run 时把结果锁存为不可变
  `skinIdAtRunStart`，供死亡、复活和重连复用；S3 只替换同一个 resolver，不另造准入路径。
- 原作彩色皮肤使用白色 tint；真人不再按席位色重染，AI 不再统一灰化。首发自机标记固定复用当前
  白色轮廓，不在 S2 临时改选头顶箭头、名字或名牌方案。
- 未知皮肤 ID、皮肤资源失败或皮肤 rect 非法统一回退皮肤 1，并记录受控诊断；表现 fallback 不得把经济目录不一致当作
  可写状态。
- Dot 使用 `variant=1..7` 的确定性分布；Star 与残骸由权威 `kind/variant` 描述，必要时携带
  `sourceSkinId`，客户端不能猜。
- 磁铁世界实体使用 S1-12 的 `magnet` 帧（显示尺寸 70），拾取播放 `collect-magnet`；生效时显示
  `magnet-active` 环绕表现和顶部 `magnet-status-icon` 被动状态图标。被动状态图标是同一帧的逻辑别名，不占四槽，
  不生成主动按钮；
  持续期不播放循环音效。
- 磁铁 fallback 按资源角色分型：required world `magnet` 缺失时拒绝进入该 V2 战斗，禁止生成不可见 tool；仅 aura
  运行时损坏可用 `magnet-status-icon` 头顶展示降级；`collect-magnet` 音频缺失静默。三者都不得回退皮肤 1。
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

首版唯一开放功能是加速：默认右手布局只显示 S4，左手布局镜像后只显示 S1；其余三个物理槽不显示、不命中，
其他按钮不得补位。左手模式把 S1～S4 的功能顺序镜像为 `[加速、护盾、主动道具、表情]`，摇杆始终保持
`x=375`。四槽是常驻战斗入口上限。
排行榜和状态信息固定在顶部 Safe Area；首次世界的 3 秒准备提示在安全内容区居中。进入 Playing 后移除准备
提示，且不显示房级剩余时间、`0:00` 或 TimeLimit 结束提示。HUD、弹窗和操作区都不跟随世界相机缩放。

左右手偏好固定为设备本地设置：

- 默认值是 `right`；本地 key 固定为 `snake.controls.handedness.v1`，值只允许 `right|left`。
- key 缺失、值非法或读取抛错都安全回退 `right`；切换时先通过本地端口写入候选值，只有写入成功才把当前布局
  原子切到候选值。写入失败须记录受控诊断并保持/回滚为 `right`，不得出现 UI 已切换但持久值未提交的伪成功。
  偏好不因登录账号改变，同设备切换账号继续共用。
- Logic 只依赖可注入的 `HandednessPreferencePort` 或等价端口；引擎/View 适配层连接 Cocos 可用的设备本地存储。
  `logic/` 不得因此导入 `cc`、`fairygui-cc` 或直接访问 DOM 存储全局。
- 战斗顶部设置入口位于四槽之外。候选值写入成功后，当前 run 立即重排四槽功能，不重建房间、不发网络消息。
- 打开设置前必须执行 `cancel-all` 并强制 `boost=false`；设置窗不暂停权威世界、个人 deadline 或磁铁效果时间。

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
及后续 tick 正常推进。首发 HUD 不显示本次游玩时长；权威 `runStartedTick` 仍用于生命周期、断言和后续证据，
但不能成为结束条件。

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
- `deathSnapshot` 保留长度、分数、击杀、`magnetCollected/starCollected` 等当前 run 累计；两个 collected 字段均为
  从 run 开始起的累计拾取次数，不是当前能力时长。复活保持同一 `roomEpochId/runId/skinId`，清零连杀、持续击杀、攻击、
  碰撞和磁铁剩余效果等单生命瞬态，不重置长度 80，也不会因恢复 `magnetCollected` 而恢复 buff。
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
  magnetUntilTick: number | null;
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

interface ISnakeSnapshotTool {
  id: number;
  toolId: 10001;
  x: number;
  y: number;
  expireTick: number;
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
  playingStartedTick: number | null;
  battlefieldConfigId: "newEndlessPortraitV2Map4096";
  lifecycleConfigId: "sourceEndlessTotalTime0";
  reliveFlowConfigId: "sourceEndlessReliveFlow";
  relivePolicyId: "onlineCoinRelive5V1";
  onlineAdaptationId: "onlineEndlessDropInV2";
  layerVersions: {
    battlefield: 1;
    lifecycle: 1;
    reliveFlow: 1;
    relivePolicy: 1;
    onlineAdaptation: 2;
  };
  layerHashes: {
    battlefield: string;
    lifecycle: string;
    reliveFlow: string;
    relivePolicy: string;
    onlineAdaptation: string;
  };
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
  magnetCollected: number;
  starCollected: number;
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
守门；旧 `respawnTick` 删除或限制为 AI 内部字段。基线包和 delta 另携带 `tools`，与 `foods`、`wrecks`
分类编码；磁铁不计入 1030 食物上限。每个 baseline/delta envelope 必须携带其权威 `envelopeTick`，validator
只能相对该 tick 校验，禁止使用客户端收到包的本地时间：tool 必须满足
`envelopeTick < expireTick <= envelopeTick + 400`；只有存活蛇实体（真人 run 为 `active`，或尚未死亡的 AI）
可令 buff 为 `envelopeTick < magnetUntilTick <= envelopeTick + 160`，死亡、待重生或真人终局状态必须为
`null`。validator 还必须拒绝超过
10 个工具、非 `10001` 的 `toolId`、非有限/越界坐标、非安全整数 tick，以及同一 `roomEpochId` 内重复或复用的
tool entity ID。一次拾取必须在同一 seq 的原子 delta 中同时移除 tool：真人胜者还要原子更新其 run
`magnetCollected` 与蛇 `magnetUntilTick`，AI 胜者只更新 AI 蛇 `magnetUntilTick`，不写真人 run 计数；不得让
客户端观察到半次拾取。`playingStartedTick` 在首次 Playing 前为 `null`，
转入 Playing 时设为安全整数且之后不可变。
本阶段不定义任何磁铁按钮或 c2s 使用消息。

表现目录使用 `SNAKE_PRESENTATION_VERSION` 与 `CLIENT_SNAKE_PRESENTATION_HASH` 守本地资源解释；
`PUBLIC_SNAKE_SKIN_CATALOG_HASH` 只代表公共皮肤身份。S1-12 磁铁表现会使前两者由实际生成结果升版/变化，
不改变公共皮肤 hash 或任一皮肤 `contentVersion`。五层 `configHash` 必须覆盖磁铁时序、循环 gate、
存在/生效时长、拾取扩张值和 Star/磁铁移动参数，不假设表现 hash 已进入 gameplay contract digest。

`snake@2` 必须一次声明 S2R/S4 已知需要的 versioned receipt/result envelope：S2 测试结果使用
`rewardStatus="notEnabled"`，S2R 填充已声明的 relive receipt 状态，S4 才启用
`pending/applied/dead` 与奖励摘要。后续阶段若只激活这些已声明语义，不提升 modeVersion；若确实需要新增或
改变未声明的 wire 语义，则从**当时实际版本**递增并补兼容矩阵，禁止在任何阶段硬编码“必为 `snake@3`”。

## 稳定任务 ID

任务 ID 一旦用于 commit、测试证据或缺陷单，不因排序调整而重编号。每项必须同时完成动作、产物和验证。

### S2-01：落地组合配置与共享规则

**动作**

- 在 shared 手写真源中定义五层配置 ID/版本/layer hash、组合 hash、4096² 边界、食物数量、长度、相机、身体缩放、AI 阵容、
  假榜、`endless_tool_config` 与无 deadline 语义。
- 镜像并校验 71 项 `point_step_config`；显式写入 Star `10/10`、`320/3 unit/s`、`34..67 tick` 变向，
  以及磁铁 `toolId=10001`、波次、gate、400/160 tick 与额外拾取范围 86.4；不得从浮点近似或 UI 推断。
- 把当前服务端 `snake/rules.ts` 中的 `directionVector` 下沉到 shared 手写真源，与已有
  `quantizeSnake` 形成可被服务端、客户端和确定性 fixture 共用的纯函数；不保留另一份服务端公式。
- 保留 `onlineEndlessDropInV2` ID，把层内显式 `version: 1` 升为 `version: 2`，重算该层与组合 hash；另外四层
  payload/hash 必须逐字节保持 S0 值，旧 layer/组合 hash 只作历史输入。
- 将视觉格距 32 与服务端 broadphase `GRID_CELL` 分离，禁止误改碰撞分区。

**产物**

- 可序列化、可 hash、可由双端读取的命名配置，包括 layer version/hash manifest、Star/磁铁的精确定点参数、
  per-entity RNG 子流名、draw order 和 fixed-step phase order。
- `directionVector/quantizeSnake`、路径点、相机和身体缩放的 shared 纯函数与边界向量。

**验证**

- `newEndlessPortraitV2Map4096` 逐字段 fixture 与 S0 冻结快照一致；相对来源 V2 的差异仍只有 S0 已记录的
  4096² 边界覆盖，且来源前三波配置不被循环 gate 改写。
- Star/磁铁 20 Hz 移动和 150 秒后的循环 gate 只出现在 `onlineEndlessDropInV2` 适配层；该层与未变的源战场层及
  其余三层共同进入组合 hash，不回写或篡改 S0 evidence。
- 四个未变层 hash 与 S0 完全相同；online adaptation 明确为 version 2 且 layer hash 改变，新组合 hash 与
  `2319d173…f87e2` 不同。重复生成稳定，计划中没有伪填新 hash。
- 组合 hash 对 Star 速度/变向和磁铁时序/gate/持续时间/范围的任一改动都必然变化；序列化乱序不得改变 hash。
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

### S2-04：实现食物、Star、磁铁与残骸

**动作**

- 生成并维持 1000 Dot + 30 Star；为食物增加权威 `variant`。
- 按冻结的 milli/micro-unit 余数算法实现 Star 与磁铁的 `16/3 unit/tick`，复用 S2-01 下沉后的 shared
  `directionVector/quantizeSnake`，并实现按 kind+entityId 派生的独立 RNG、`0..359` 整数度方向、固定 draw order、
  `34..67 tick` 变向、半径内缩边界、同 tick 顺序和撞边反弹。
- 以 `playingStartedTick` 驱动 300/1200/3000 的必发波和 6000 起每 3000 tick 的受 gate 波；每波生成 10 个
  `toolId=10001` 磁铁，复用 Star 移动内核，实现 fixed-step 开头 gate、当 tick 首次移动/可拾取、跳过不消费 RNG、
  400 tick 过期和稳定 ID 竞争拾取。
- 实现 160 tick 磁铁被动效果、重拾刷新不叠层、额外 86.4 权威拾取范围，并由服务端结算
  Dot、Star 与残骸；不改这些实体的轨迹，磁铁自身拾取也不受效果扩大。
- 分离 Dot、Star、加速残骸和 AI 死亡残骸 `kind`；按需携带 `variant/sourceSkinId`。
- 以确定性定点数实现 AI 残骸公式和房间 cap 下的分值守恒。

**产物**

- 服务端食物/磁铁/残骸模拟、V2 快照字段与客户端 atlas 批渲染。
- 同种子稳定复现的七色 Dot、Star/磁铁轨迹、刷新 gate 和扩圈拾取结果 fixture。

**验证**

- 稳态数量严格为 1000 + 30，七个 Dot 帧均可出现，尺寸为 16/42。
- Star/磁铁长驻运动按 `5.333/5.333/5.334` 步长循环且没有浮点累积真相；初始/后续方向、per-entity seed、
  draw order 与 remaining 递减状态机可由 matchSeed+kind+entityId 重放，hold=34/67 恰驱动 34/67 次移动；
  Star 半径 21、磁铁半径 35 的四边/角落反弹及同 tick 变向顺序可重放。
- 磁铁的首三波、循环 gate、跳过不补发、上限 10、`[spawn,expire)`、`[pickup,until)`、同 tick 唯一胜者
  和重拾刷新边界均有正反 fixture；AI 不能使循环 gate 通过。
- 真人死亡不产生计分残骸；AI 公式边界与合并守恒测试通过。
- 性能测试证明未创建 1030 个 Sprite 节点，draw call/mesh 数满足既有预算；磁铁扩圈查询不突破长驻预算。

### S2-05：统一皮肤渲染与表现目录消费

**动作**

- 以稳定 `skinId` 同时绑定 head/body/tail、动画、body sequence、间距、pivot 和 visual scale。
- 移除席位 tint、AI 灰 tint 和实体 id 哈希身体材质；首发自机标记固定为不改原色的现有细白轮廓，
  AI 身份固定以名字识别。
- 对未知 ID、加载失败、非法 rect 实现皮肤 1 fallback 与受控诊断。
- 从 presentation catalog 读取主题背景、网格、边界、音效和效果；消费 S1-12 的 `magnet`、
  `magnet-status-icon`、`magnet-active` 和 `collect-magnet`，不创建主动道具槽。

**产物**

- 单蛇主体 mesh 渲染器、按皮肤材质分组与 catalog-driven 表现。
- 16 皮肤与磁铁世界/被动状态的动态战场预览/回归 fixture。

**验证**

- 每条蛇头、身、尾和动画始终属于同一 ID；不再出现 `% 3` 或哈希选材质。
- 自机细白轮廓与 AI 名字在不修改皮肤原色的前提下可辨识；AI 不错用自机轮廓。
- 未知皮肤 ID、皮肤缺图或皮肤 rect 非法均稳定回退皮肤 1 且不阻塞开局；该规则不套用到 required world 磁铁帧。
- 磁铁世界帧尺寸 70，被动图标与世界帧共用字节但逻辑名独立；环绕效果、拾取音和无循环音策略可到达。
- `sfxOn`、动态 import、View/Logic 分层与资源加载测试通过。

### S2-06：实现动态真人/AI roster 与展示榜

**动作**

- 首人开局生成 16 AI；真人加入只替换 aiLevel 401，最终离开才补回。
- 把 AI 重生集合重命名并限定为 `pendingAiRespawns`，真人永不进入。
- 实现独立 AI 皮肤 RNG 子流和 86 项假榜模型；展示榜与 run 证据完全隔离。
- 允许 AI 与真人按相同世界碰撞规则拾取磁铁，但 AI 不参与后续刷新 gate；AI 死亡清空 `magnetUntilTick`。

**产物**

- 稳定态 17 条活动蛇的动态 roster。
- Top 10 + 本人位置的 `displayRank` 投影。

**验证**

- 1～8 真人分别对应 16～9 AI；只替换/补回 aiLevel 401。
- 待复活真人仍占席；AI 约 40 tick 后恢复且保持皮肤。
- AI 拾取磁铁可生效但不能使任一刷新 gate 通过；死亡/重生前后无剩余 buff 泄漏。
- 假榜从不进入实体、碰撞、快照蛇数组或资产证据；新增皮肤不改变玩法 RNG 轨迹。

### S2-07：实现测试端口上的真人复活状态机

**动作**

- 建立 `deadPresentation/reliveOffering/pendingRelive/reliveSpawning/reliveCommitting/reliveReady` 状态和
  `deathSeq/stateVersion/terminalIntent` 守门。
- 冻结版本化 death snapshot，实现 4/100/20/60 tick 边界、保护半开区间、五档费用、恢复字段和单生命瞬态清理；
  `magnetCollected/starCollected` 按 run 累计恢复，`magnetUntilTick` 在死亡时清空且复活不恢复。
- 定义并注入无外部资产写的 `ReliveEconomyPort` 测试实现；覆盖成功、余额不足、可重试失败、系统失败。
- 用 `(roomEpochId, runId, deathSeq)` CAS 决定 accept、decline 或 timeout 的唯一赢家。

**产物**

- 可确定性重放的纯玩法状态机和测试经济适配器。
- 生产构建中默认关闭的 `onlineCoinRelive5V1` 发布开关。

**验证**

- 真人永不走 40 tick 自动重生；AI 永不进入真人 offer。
- 同/反向/迟到决定不会重复演出、生成、复活或 finalize。
- 第 1～5 次测试成功费用依次为 100/200/300/300/300；第六次不发窗。
- 磁铁效果生效时死亡的 fixture 证明：累计拾取数留存，复活后 `magnetUntilTick=null`，不会免费恢复剩余秒数。
- 静态/启动断言保证生产配置不能绑定测试端口，也不能以测试结果更新真实余额。

### S2-08：建立 room epoch 与内存 run 生命周期

**动作**

- 通过通用 mode lifecycle capability 在开放 admission 前生成一次 `roomEpochId`，并与前移后的
  `state.matchId` 共用同一值；首人 auto-start 不得覆盖。
- 以测试账本创建唯一 run；通过服务端 `RunSkinResolver` 选择默认皮肤 1（测试 fixture 可显式覆盖），锁存
  `skinIdAtRunStart`，处理重连延续、最终离场冻结和重新加入新 run；禁止读取 join 自报皮肤。
- 重连重建存活蛇时使用权威绝对 `magnetUntilTick`；world tick 在断线期继续，因此只恢复尚未过期的剩余效果，
  不将重连当成再拾取，不刷新 160 tick。
- 最后真人冻结并离开后停止 tick，让 `autoDispose` 回收房间。

**产物**

- S2 内存/测试 run store 与生命周期 capability。
- S2R 可替换的 admission/final-leave 端口契约。

**验证**

- admission 前已有稳定 epoch；其他玩法的 matchId 生成边界不变。
- 宽限内重连沿用 run，最终离开再加入生成新 run。
- 存活断线前的磁铁剩余时长按绝对 tick 自然消耗；过期后重连为 `null`，未过期重连为原 `magnetUntilTick`。
- AI/假榜不能单独维持房间；空房无残留 timer、task 或 world 引用。

### S2-09：升级 `snake@2` 契约与 typed message

**动作**

- 把临时 `skin` 收敛为稳定 `skinId`；为 snake 增加 `magnetUntilTick`，为 food/wreck 增加
  `variant/kind/sourceSkinId`，并新增与 food 分离的 `ISnakeSnapshotTool`。
- 增加房间五层配置 ID/version/hash、组合 config hash、room epoch、
  `playingStartedTick`、无 deadline 元数据与 player run state；
  player/run schema 显式带 `magnetCollected/starCollected`。
- 定义 `reliveDecision/reliveOffered/reliveDecisionResult/reliveResolved/endRun/runFinalizing/runResult` typed
  message及 versioned receipt/result envelope；S2 的 result 明确使用 `rewardStatus="notEnabled"`。
- 分层收口皮肤校验：服务端准入、run 锁存与出站不变量必须精确校验公共 catalog 成员，不使用“稳定 ID 上界”接受
  未发布值；客户端 wire validator 只校验 `skinId` 是安全非负整数，未知成员交由 renderer 回退皮肤 1 并记录受控诊断，
  不因本地目录滞后拒绝整份快照。对 tools 单独限制
  数量 10、`toolId=10001`、安全 tick、4096² 内有限坐标和 `roomEpochId` 内 `ISnakeSnapshotTool.id`
  （tool entity ID）唯一且不复用，并以 envelope 的权威 tick
  校验 tool/buff 半开区间。

**产物**

- `snake@2` 手写真源、生成 schema、客户端 shared 镜像与版本拒绝策略。
- 后续 S2R/S4 激活预声明字段、或新增 wire 语义时递增实际版本的决策表。
- 可由重连 schema 重建 offer/processing/result 的 player state。
- 可由基线/重连恢复磁铁实体、累计计数和未过期被动效果的绝对 tick 契约。

**验证**

- 旧客户端被明确拒绝，不静默解释新字段。
- 服务端不会发出已知非公共 catalog 成员；客户端收到未知但结构合法的 `skinId` 时仅做表现回退，
  配置/hash 不匹配不回退 Classic 或 TimeLimit。
- offer push 丢失后仍能从 schema 恢复同一 `deathSeq/deadline`。
- tools 与 1030 foods 各自守上限；未知 `toolId`、越界坐标、相对权威 envelope tick 非法的
  `expireTick/magnetUntilTick`、重复/复用 `ISnakeSnapshotTool.id`、负数累计均被稳定拒绝；每个合法磁铁实例的类型值
  `toolId` 则都必须是 `10001`。
- 拾取 delta 在同一 seq 原子提交 tool removal 与胜者 buff；只在真人胜出时同 seq 更新其 run
  `magnetCollected`，AI 胜出不产生真人 run 计数。全协议中不存在磁铁按钮消息。
- `runFinalizing/runResult` 不再是省略号契约；后续阶段不硬编码 `snake@3`。

### S2-10：实现 V2 分块基线与有序 delta

**动作**

- 服务端保留完整权威路径，以 `begin → ordered chunks → end(checksum)` 发送首次/重连基线。
- 后续按序发送食物增删、Star 移动、磁铁生成/移动/拾取/过期、磁铁状态和蛇路径
  append/trim delta；维护序号、checksum 和重取机制。
- 为 chunk 数、食物总数、工具总数、单蛇点数、全房点数和序号设置独立 validator 上限。

**产物**

- 可承载 17 蛇、1030 食物、最多 10 个磁铁、单蛇 5186 点、全房理论 88162 点的 wire 流。
- 客户端基线组装、delta 消费和 resync 状态机。

**验证**

- 最大 fixture 可完成首包与重连，不截断尾部、食物、磁铁或蛇，也不把工具错计进 1030 食物。
- 缺块、重复块、乱序、checksum 错误和 delta 丢序均请求新基线，而非静默继续。
- 快照预算与客户端插值在长路径/长驻 churn 下符合性能门禁。

### S2-11：重建中央操作区布局

**动作**

- 按冻结坐标创建中央摇杆和 S1～S4 浅弧；使用统一 `controlShiftY` 适配底部 Safe Area。
- 实现未开放槽位隐藏且不补位、左手功能镜像、HUD/弹窗不随相机缩放；默认必须是右手布局。
- 在顶部战斗区增加不占四槽的设置入口，以 `snake.controls.handedness.v1` 只保存 `right|left`；读取缺失/非法/
  异常统一回退 `right`，切换先写后用，写入成功才当局即时生效，写入失败保持/回滚 `right` 并记录受控诊断。
- 通过可注入本地偏好端口隔离 Logic 与 Cocos 存储实现，不在 gameplay Logic 中直接导入引擎或 DOM API。
- 把排行榜/状态放在顶部 Safe Area，把首次 3 秒准备提示放在安全内容区中央；Playing 后不保留准备提示或
  房级倒计时，首发也不显示本次游玩时长。
- 首发不实现表情入口；默认右手的 S1、左手镜像后的 S4 均因表情功能未开放而隐藏且不命中。首发只有加速
  对应的右手 S4/左手 S1 可见；未来若接入表情面板只能向上展开。设置、衣柜、被动效果和复活弹窗不占四槽。

**产物**

- catalog/配置驱动的竖版控制布局与 Safe Area 计算。
- 默认右手、显式左手、当局切换、重启持久化、先写后用、非法值/存储失败回退与不同底部安全区的布局 fixture。
- 顶部安全区 HUD 与居中准备提示的 `750 × 1624` 布局 fixture。

**验证**

- 默认中心、可见尺寸和命中半径逐项精确断言。
- Safe Area 只整组上移，横向中心、相对弧线、尺寸和世界单位不变。
- 隐藏槽位不渲染、不命中，其他槽位绝不补位。
- 排行榜/状态不侵入刘海或操作区，准备提示居中且 Playing 后消失。
- 左右手偏好不出现在 join payload、schema、RPC、User 或 DB 中；切换账号不清空同设备偏好。
- 写入成功才切换布局；写入失败的同一帧及后续帧均为右手，不显示保存成功，重启读取仍按实际持久值处理。

### S2-12：重写 pointer ownership 与多点触控

**动作**

- 按按钮优先、摇杆最后的圆形热区路由新触点，并锁定唯一 owner。
- 实现双指持续转向+加速、第三指辅助点击、摇杆拖出热区继续控制和按钮原区抬起提交。
- 统一实现 cancel-all，在失焦、死亡、断线、重连、场景切换、模态窗和 run 结束路径调用。
- 打开战斗设置或任一模态窗前先完成 cancel-all 与 `boost=false`；模态层只拦截本机输入，不暂停世界 tick。

**产物**

- 与节点布局共用同一几何数据的输入路由器。
- 可独立于 Creator 运行的 pointer 序列测试。

**验证**

- 删除左半屏与半径 200 旧判断；滑过控件不转移 owner。
- 1～3 指交错 start/move/end/cancel 不抢控、不重复点击、不残留 boost。
- 摇杆帽回正但最后合法方向保持；按钮只在原命中区抬起时提交一次。
- 按住加速时打开设置会在模态窗显示前清空 owner 并发送停止加速；设置期间服务端 tick、offer deadline 不停。

### S2-13：实现客户端无尽、复活与个人结果 ViewModel

**动作**

- Logic 读取 `hasDeadline=false` 并关闭旧倒计时/整房结果路径；保持 world tick 插值与 `runStartedTick`
  内部证据，但首发 ViewModel 不产生本次游玩时长 HUD。
- 依据 `runState/deathSeq/stateVersion/decisionDeadlineTick` 构建复活 ViewModel，用服务端 tick 显示倒计时。
- 依据权威 `magnetUntilTick` 构建被动状态 ViewModel：只在尚有剩余 tick 时显示状态图标/环绕效果，
  过期、死亡或 finalized 立即清理；不暴露“使用磁铁”指令。
- 为局内设置构建设备本地 handedness ViewModel：初始默认右手，左/右切换先通过偏好端口写入，成功后才原子
  应用候选布局；写入失败保持/回滚右手并返回可诊断失败，不显示保存成功。
- 实现稳定 `clientReqId` 的 accept/decline/endRun；同次网络重试复用 ID，再次点击生成新 ID。
- 实现死亡演出、费用/档位、测试余额标识、放弃、处理中、保护表现、无资格直达个人结果和重连恢复；复活窗
  必须显示死亡原因、当前长度/分数、服务端 tick 推导倒计时，战斗 HUD 的“结束本次”必须二次确认。

**产物**

- 不导入 `cc`/`fairygui-cc` 的 gameplay Logic。
- 引擎无关的 `HandednessPreferencePort` 与 Cocos 设备本地存储适配器。
- 原作风格复活模态窗、磁铁被动状态、左右手设置和个人结果路由；明确标注 S2 测试经济环境。

**验证**

- 重复/乱序 offer、decisionResult、resolved 只向更高 `deathSeq/stateVersion` 收敛。
- 客户端不能延长 deadline、创建蛇、决定费用或修改真实余额。
- 模态窗出现前释放全部 pointer；同房其他玩家不进入结果页。
- 重复/乱序的磁铁 delta 只向更新的权威 tick 收敛；断线重连不刷新 buff，死亡后不显示剩余状态。
- 本地偏好反例证明非法值、读取异常和写入失败都回退右手；写失败时没有先闪现候选布局，也不产生任何 RPC、
  schema 变化或账号写。
- “结束本次”首次点击不会直接 finalize；确认取消恢复战斗，确认提交才发送幂等 `endRun`。

### S2-14：连接变化、离场与长驻 churn 清理

**动作**

- 增加通用 `connectionChanged`（或等价）玩法钩子；存活断线时关闭 boost、保留最后合法方向，待复活断线时
  deadline 继续；存活蛇的 `magnetUntilTick` 保持绝对值并随 world tick 自然过期。
- 最终离场同步清理 participant、蛇、`pendingAiRespawns`、真人 relive 状态/任务、输入、快照游标和已完成
  run 引用；空房时同时清理磁铁调度器、实体、移动 RNG 和扩圈查询缓存。
- 实现有界 Draining：停准入、冻结活跃测试 run、关闭连接和回收；不伪装成房级时间结束。

**产物**

- 通用连接投影和 S2 测试版 final-leave 收口。
- 可观测的集合大小/任务注册表诊断。

**验证**

- 大量 join/leave/reconnect/death/decision 后集合回落到当前在线规模。
- 断线不延长 offer；重连只恢复同一 offer 或结果。
- 断线不延长磁铁效果；重连只恢复原绝对 tick 下的剩余时间，不复制实体或拾取结果。
- 最后一名真人离开后世界停止；多真人时单人终局不影响其他人 Playing。

### S2-15：生成、同步与阶段回归

**动作**

- 只修改 shared/schema/feature 等手写真源，依标准顺序执行 gameplay/feature codegen 与
  shared/client sync，并执行 protocol fingerprint `--check`；只有 `apps/shared/src/protocol/**` 确有预期变化时才先显式
  `--write`、审阅锁定 diff，再 `--check`，不因 gameplay wire/schema 升版无条件重钉。
- 更新服务器、客户端、FGUI、故障、容量、性能和兼容测试；加入 Star 精确速度/变向、磁铁波次/gate/
  扩圈拾取/恢复语义、本地左右手偏好和模态 cancel-all 的正反 fixture；保留 Creator 阶段证据占位。
- 审核生成 diff，禁止把无关生成物或依赖目录混入阶段提交。

**产物**

- 双端一致的生成结果、测试 fixture、golden 与命令日志。
- 给 S2R 的端口、状态、schema 和未开放发布开关交接记录。

**验证**

- 运行与本阶段相关的 `typecheck`、client/server/FGUI、protocol、sync、vendor、perf 和 core 门禁。
- 将同 seed 长驻 Star/磁铁的 per-entity stream/draw order、定点余数与四边/角落轨迹、
  300/1200/3000/6000 fixed-step 相位、资格状态集合、
  49999/50000 gate、160/400 tick 半开区间、envelope tick 校验、拾取原子 delta、死亡/复活/重连和本地存储
  写失败列入必跑阶段回归。
- `npm run verify:all` 中与本阶段无 Creator 依赖的项目全绿。
- 生成物只由 codegen/sync 产生；受保护路径检查无手改。

## 故障与并发矩阵

S2 使用纯测试端口验证玩法状态唯一性，不声称覆盖真实数据库崩溃窗口。表中“扣费”均指测试端口调用记录，
绝不能落到真实资产。

| 场景 | 唯一正确结果 | 必备断言 |
|---|---|---|
| tick 1799/1800/1801 | 世界连续 Playing | 无 `context.settle()`、无 `0:00`、tick 单调 |
| `totalTime=0` 与 offer 并存 | 个人 deadline 仍在 100 tick 到期 | 房级字段不参与个人比较 |
| Star/磁铁出生、长驻移动、同 tick 变向/撞边 | 初始方向、draw order、34/67 次 remaining 边界与 `5.333/5.333/5.334` 循环可重放 | matchSeed+kind+entityId 子流；半径内缩；边界反射后置；撞边 tick 不计新 hold、tick 末 remaining=hold；新 hold 从下 tick 起驱动 34/67 次完整移动；角落只重抽一次 |
| 首次 Playing 后 300/1200/3000 tick；无资格真人或真人全为 50000 | 每次仍恰好刷新 10 个磁铁 | 前三波无条件；drop-in/重连不重置锚点；不超过 10 个存活工具 |
| 6000 起循环 trigger，资格/排除状态及真人长度 49999/50000 | 仅列明的七种资格状态下 49999 通过，50000 不通过 | preparing/cancelled/finalizing/finalized 与 AI 排除；跳过永不补发 |
| trigger tick 内长度 49999→50000、死亡或终局 | gate 使用上 tick 已提交快照 | 先 gate/创建，后移动/碰撞；新磁铁当 tick 可移动/拾取；跳过不耗 ID/RNG |
| 真人/AI 同 tick 碰到同一磁铁 | 稳定实体 ID 在前者唯一获得 | 工具只移除一次；真人胜出计数一次，AI 胜出无真人 run 计数 |
| 磁铁拾取 delta 被拆包、乱序或以到达时间校验 | 整个 seq 拒绝并重取 baseline | removal 与 winner until 原子；真人胜出才同 seq 带 run count；边界只看 envelopeTick |
| 磁铁生效期重拾 | `until=max(old,pickup+160)` | 范围只额外 +86.4，强度不叠加，磁铁本身拾取圈不扩大 |
| 磁铁生效时死亡/复活 | 累计数恢复，buff 清空 | `magnetCollected` 不会恢复 `magnetUntilTick` |
| 磁铁生效时存活断线/重连 | 绝对 tick 继续消耗 | 只恢复未过期剩余时间，不刷新 160 tick |
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
| 未知皮肤/皮肤资源缺失 | 表现回退皮肤 1 | 世界继续且有受控诊断；不套用到磁铁资源 |
| 三指交错并滑过控件 | owner 不转移 | 转向、加速、辅助点击互不抢占 |
| 首次本地启动/非法偏好/读取或写入异常 | 右手布局 | 先写后用；失败不显示保存成功，不发 RPC，不修改 User/schema/DB |
| 按住 boost 时打开局内设置 | 先 cancel-all，再显示弹窗 | owner 集合空、boost=false；世界/deadline 继续 |
| 失焦/死亡/断线/场景切换 | cancel-all | pointer 集合空、boost=false |
| 单人 endRun、多真人继续 | 只结束对应 run | room phase 仍为 Playing |
| 最后一名真人离场 | 测试 run 冻结后 autoDispose | AI/假榜不保活，无 detached task |
| 长驻 churn | 集合回到在线规模 | 无 finalized run、游标或 pending AI 泄漏 |

## 退出条件

以下条件已经全部满足，S2 标记为 `[已完成]`：

- [x] S1-12 磁铁资源/目录增量已完成，`SNAKE_PRESENTATION_VERSION=2` 与实际新
  `CLIENT_SNAKE_PRESENTATION_HASH` 由生成/校验证据回写；未改公共皮肤 hash 或 skin contentVersion。
- [x] 四个未变层的 ID/payload/hash 与 S0 完全相同；`onlineEndlessDropInV2` 保持 ID、层内显式
  `version: 1 -> 2` 并生成新 layer hash，五层版本/hash 产生新的真实组合 hash。S0 旧 hash 仅作历史证据；不存在
  Classic、TimeLimit 或动态 AB 隐式 fallback。
- [x] 4096²、32 网格、1000+30 食物、80/100000 长度、相机/身体/路径公式和 AI 残骸公式均有确定性测试。
- [x] Star/磁铁 `320/3 unit/s` 的 milli/micro-unit 余数算法、matchSeed+kind+entityId 子流、0..359 整数度 draw order、
  remaining 计数器的 34/67 次移动边界、实体半径边界、四边/角落反弹和同 tick 顺序经长驻 fixture 后仍精确可重放。
- [x] 磁铁首三波在无资格真人/全长 50000 时仍无条件生成；后续 150 秒 gate 的七种资格状态、人类 `<50000`、
  四种排除状态、AI 排除、跳过不补发、400/160 tick、上限 10、同 tick 唯一拾取、+86.4 范围和重拾刷新不叠层
  均有正反测试。
- [x] trigger 在 fixed-step 开头使用上一 tick 已提交快照；新磁铁当 tick 移动且可拾取，跳过不分配 tool entity ID、不消费
  位置/motion RNG，但触发序号继续。
- [x] 1～8 真人下稳定态始终为 17 条活动蛇；AI 阵容、皮肤 RNG、假榜隔离和独立重生均通过。
- [x] 真人复活状态机的 4/100/20/60 tick 边界、含 provisional 首 tick 的保护半开区间和
  accept/decline/timeout CAS 竞态全部通过。
- [x] 真人不存在 40 tick 自动重生，真人死亡不产生可拾取计分残骸。
- [x] 房间在 1800/1801 tick 继续，客户端不显示剩余时间或等待 room Settle。
- [x] `snake@2` 可承载 17 蛇、1030 食物、最多 10 个磁铁、单蛇 5186 点、全房 88162 点，并完整声明后续 receipt/result
  envelope；基线/delta 故障可重同步，后续版本按实际语义递增而非硬编码 `snake@3`。
- [x] tool/buff validator 只按权威 envelope tick 判断半开区间；`ISnakeSnapshotTool.id` 在 roomEpoch 内不复用，
  而每个实例的 `toolId` 恒为 `10001`；拾取 removal 与
  胜者 `magnetUntilTick` 在同一 seq 原子可见，真人胜出才同 seq 更新其 run `magnetCollected`，AI 不写该计数。
- [x] 中央摇杆、四槽、Safe Area、默认右手/本地左右手切换、双指持续操作和第三指辅助入口均有自动输入回归；
  偏好不进入 User/RPC/wire/DB。
- [x] 首发 HUD 不显示本次游玩时长；磁铁仅显示被动状态，不占四槽且不存在主动使用消息。
- [x] 自机只使用不改原色的细白轮廓，AI 只用名字识别；无额外自机箭头或 AI 轮廓。
- [x] 死亡/复活保留 `magnetCollected/starCollected` 累计但清空磁铁 buff；存活断线/重连只恢复绝对 tick 下的剩余效果。
- [x] 断线、重连、最终离场、Draining、空房回收与 churn 清理不留实体、任务、pointer 或游标。
- [x] 客户端复活窗仅以权威 player state/tick 驱动，重复和乱序消息不产生第二结果。
- [x] 测试 `ReliveEconomyPort` 与生产资产实现物理隔离，生产启动/配置检查无法误绑。
- [x] **`onlineCoinRelive5V1` 面向玩家的发布开关仍为关闭。** 文档、UI 和测试结果没有声称已完成真实扣费。
- [x] 相关生成、同步、类型检查、server/client/FGUI、容量与性能门禁通过；Creator 待验证项已明确留给 S5。

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
| Star/磁铁用浮点近似长驻漂移 | 冻结 milli/micro-unit 余数算法，长时间 golden | 阻断发布；不接受 5 或常量 5.333 替代 |
| drop-in/重连重置磁铁调度 | 单一 `playingStartedTick`、触发序号与跳过不补发断言 | 停止新工具波并保留对局证据，不重启房间时间轴 |
| 磁铁被误做成主动四槽道具 | catalog 类型、UI 结构与协议无 c2s 使用消息 | 移除按钮/消息，保留世界拾取和被动状态 |
| 复活或重连刷新磁铁 buff | 累计字段与 `magnetUntilTick` 分型；死亡清空，存活重连用绝对 tick | 关闭表现/扩圈拾取并以服务端快照重建，不从客户端倒计时恢复 |
| 左右手偏好泄入账号契约或先用后写 | 仅本地 key，静态扫描禁止 User/RPC/schema/DB 字段；写成功才提交布局 | 删除网络接线；写失败保持/回滚右手且不显示成功 |
| 皮肤资源/hash 不一致 | 皮肤 fallback 与配置诊断 | 只对皮肤回退 1；不得把外观目录相关经济写标成可用 |
| 磁铁资源损坏被统一回退 | world/aura/audio 三类独立 validator | world frame 缺失拒绝 V2；aura-only 退头顶 icon；音频 silent；都不回退皮肤 1 |
| pointer owner 泄漏 | 单一 cancel-all 与生命周期钩子 | 立即强制 boost=false；输入测试不通过不得发布 |
| 长驻 churn 泄漏 | 集合诊断和高循环 fixture | 触发房级 Draining；保留证据后安全回收 |
| wire 升版破坏旧客户端 | admission 版本拒绝 | 保留明确升级提示；禁止字段降级解释 |

本阶段的主要回退手段是配置/发布开关和版本准入，不得回退到“真人自动复活、90 秒隐藏收局、客户端扣币”
这类已明确否决的语义。

## 证据回写

完成任务或阶段时填写真正运行过的证据；未运行不得写“通过”。Creator 证据路径必须能由仓库成员复核。

| 任务/范围 | 状态 | commit | 自动验证（命令 + 结果） | golden / Creator / 日志 | 备注 |
|---|---|---|---|---|---|
| S2-01～S2-03 配置、生命周期、几何 | `[已完成]` | 本次提交 | `snake-rules`/`snake-world` 确定性 fixture；layer/config hash 重算；1800/1801 tick 持续 Playing | S0 14 张来源 golden 作为冻结输入；目标几何由无头 world fixture 对照 | online layer `3a61016ceb2e9fc1ffe8a342ed5b174fabec1cff4581346a8224f97a2b19a53f`；组合 `2c74f005c0375f98a07250c4c14ede9d0075a238d9f355ff6f07c9935d97e8e7` |
| S2-04～S2-06 食物、Star/磁铁、表现、AI/假榜 | `[已完成]` | 本次提交 | server world/rules/room fixture 覆盖 1030 食物、定点移动、波次/gate/拾取、17 蛇 roster；client presentation fixture 通过 | S1 runtime 资源 freshness 通过；Creator aura 混合与真机观感留 S5 | required world 磁铁 fail closed；aura/icon 与音频按角色降级 |
| S2-07～S2-08 复活与 run 生命周期 | `[已完成]` | 本次提交 | 4/100/20/60、五档费用、第六次无窗、竞态/断线/final leave fixture 通过 | 无 Creator 依赖 | 仅非资产测试端口；生产误绑断言通过，发布开关关闭 |
| S2-09～S2-10 wire 与同步 | `[已完成]` | 本次提交 | `snake@2` codegen `--check`、protocol fingerprint `--check`、sync 与最大容量/损坏重取 fixture 通过 | 无 Creator 依赖 | baseline begin/chunk/end + ordered delta；tool/run removal 原子收敛 |
| S2-11～S2-14 输入、本地左右手设置、UI、连接与清理 | `[已完成]` | 本次提交 | client input/gameplay/presentation、server room churn 与真栈 Snake 场景通过 | `750 × 1624` 无头布局/资源 fixture 通过；Creator 输入与视觉终验留 S5 | 默认右手、本地先写后用、cancel-all、多指 owner 与 SFX 偏好已覆盖 |
| S2-15 阶段回归 | `[已完成]` | 本次提交 | 2026-09-03：`npm run verify:all` exit 0（client 384/384、server 495/495、FGUI 66/66、inventory 110/110）；`npm --workspace @game/server run test:int` 171/171；codegen/fingerprint/S1 freshness/diff checks 全绿 | Creator 3.8.8、真机与最终截图仍归 S5 | 全量最终计数已同步至专项索引 |
| S2 阶段结论 | `[已完成]` | 本次提交 | 无头与本地真栈门禁全部通过 | Creator/S5 证据位保留 | 战场与测试经济状态机可内部试玩；不代表 S2R 经济可靠性或对外发布完成 |

证据至少包括：组合 config hash、1800/1801 tick 日志、最大容量 fixture、Star/磁铁定点余数与边界长驻轨迹、
磁铁无条件前三波/资格 gate/envelope tick/原子拾取/扩圈/重连记录、复活竞态测试、AI roster/churn 统计、
本地左右手读写失败反例、输入 pointer 序列、`750 × 1624` world golden、自机细白轮廓与 AI 名字对照、资源
fallback 截图，以及发布开关保持关闭的配置证明。

---

> [返回专项索引](README.md) · [上一阶段：S1 素材与目录](s1-assets-and-catalog.md) ·
> [下一阶段：S2R 可靠金币复活](s2r-reliable-coin-relive.md)
