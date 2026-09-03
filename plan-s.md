# Snake 竖版战场复刻与养成系统专项计划（plan-s）

> **状态：[已拍板·待实施]。更新时间：2026-09-03。** 本文件记录 Snake 玩法的竖版战场表现复刻、
> 皮肤衣柜与养成闭环专项计划，
> 不替代 [plan-v5.md](plan-v5.md) 的全仓当前真相指针。实施状态、commit 与验收证据应在每一阶段
> 完成后回写本文件，并在 [plan-v5.md](plan-v5.md) 保留相应摘要。
>
> **批准来源：** 用户会话指令（2026-09-03）：当前玩法参考
> `/Users/kimi/work/tanchishe/wegameVersion/` 原游戏无尽模式；源游戏为横版，本项目改为竖版；
> 原游戏素材可直接采用；要求规划蛇皮肤等养成系统，并使战场格子、食物颜色、AI 皮肤等表现一致。
>
> **操作区补充拍板：** 用户会话指令（2026-09-03）：虚拟摇杆水平移动到屏幕中间，其他操作入口放在
> 虚拟摇杆上方；最终采用“底部中央固定摇杆 + 上方四槽弧形操作区”，并同步重构命中区域与多指归属，
> 不能只移动控件图片。
>
> **当前实现基线：** drop-in 自由加入、8 蛇总量（真人不足由 AI 填充）、首人开局、Playing 可入、
> 90 秒限时计分、死亡 2 秒复活保分。该口径已在 [plan-v5.md](plan-v5.md#c-玩法实现既定范围外随玩法立项另立计划)
> 登记；这是本专项要替换的现状，不是目标生命周期。
>
> **本专项已选组合：`newEndlessPortraitV2Map4096TotalTime0`。** 战场层采用原作归档的新版无尽 V2，
> 但按用户拍板把源地图 `4896 × 4896` 覆盖为 `4096 × 4096`；1000 Dot + 30 Star、出生长度 80、
> 相机 `1.3 → 0.6 @ 100000`、蛇身
> `1.0 → 2.8 @ 100000`、16 条 AI；生命周期直接采用新版无尽的 `totalTime=0`：不显示剩余时间、
> 不因时长到点结束、也不存在第 1800 tick 自动收局。最多 8 真人、首人开局、Playing 可入和死亡 2 秒
> 自动复活属于联机适配；场内真人增加时替换 AI，目标活动蛇总量固定为 17。
>
> **证据口径：** 文内源码行号是建档时快照，后续复核应按符号重新定位。固定状态标签为
> `[已拍板·待实施]`、`[进行中]`、`[已完成]`、`[阻塞·需 Creator]`、`[有意不做]`；
> 文档落盘本身不代表任何实现阶段完成。

---

## 1. 目标与拍板口径

本专项按两条依赖有序的主线实施：

1. **先建立竖版复刻基线。** 修复格距、背景、食物、皮肤、AI 外观、相机和残骸等表现差异，
   建立可自动验证的素材与表现目录。
2. **再建立纯外观养成。** 在同一套稳定皮肤目录上实现收藏、预览、解锁、装备、真人 run 结束经验与碎片，
   皮肤不提供速度、初始长度、转向、碰撞或得分优势。

首发范围：

- 固定 `newEndlessPortraitV2Map4096TotalTime0`：V2 战场层（地图覆盖为 4096²）+ 原作新版无尽
  `totalTime=0` 生命周期 + 本项目 drop-in 联机适配，不在运行时跟随原服 AB 漂移。
- 接入原作 internal skins 的 16 个稳定内容 ID。
- 完成衣柜、永久所有权、装备、AI 皮肤和可靠 run 结束奖励。
- 预留拖尾、击杀/死亡特效、名牌、表情、皮肤熟练度等槽位，但首发不展开。
- 经典静态默认值只作为历史差异证据，不作为首发 fallback 配置。

### 1.1 非目标

- 不把地图改回横版。
- 不把原作私有网络协议、支付、广告、临时皮肤或商业活动系统整体移植进本仓。
- 不允许客户端在 join 数据中自报一个未经服务端验证的 `skinId`。
- 不为不同皮肤设置不同碰撞体、速度或攻击范围。
- 不在运行时接入原服动态难度 AB；首发冻结 V2 的 K1 level 0 AI 阵容。
- 不把 86 个假榜条目当作场内 AI 或结算参与者。
- 不再组合原作独立的 TimeLimit 90 秒模式，也不保留当前第 1800 tick 自动收局作为隐藏兜底。
- 不把 `totalTime=0` 理解为“永不结算、永不回收”：玩家 run 与房间生命周期必须分别闭环。
- 不以手改生成镜像或生成 registry 的方式接入功能。

---

## 2. 横版转竖版的坐标与视口规则

### 2.1 世界坐标只旋转，不拉伸

当前代码仍是经典默认世界的竖版转置 `1920 × 3264`，见
[apps/shared/src/gameplays/snake/ruleset.ts](apps/shared/src/gameplays/snake/ruleset.ts#L19)。原作 V2 世界为
`4896 × 4896` 正方形，项目目标边界改为 `4096 × 4096`。角色方向、素材朝向与证据坐标仍采用正交旋转，
地图改值则作为独立边界覆盖处理：

```text
source (x, y) -> portrait (-y, x)

source V2 world:          4896 × 4896
rotated evidence world:   4896 × 4896
target portrait bounds:   4096 × 4096

source design viewport:   1624 × 750
portrait design viewport:  750 × 1624
```

该变换保持距离、角度、格距、食物尺寸、蛇身宽度与碰撞比例不变。`4096 / 4896` 不作为全局缩放系数；
程序在以原点为中心的 4096² 新边界内重新生成出生点、食物和 AI，网格仍为 32。场景方向随坐标旋转；
蛇头素材、食物、文字和 HUD 不作为一张画面整体旋转，而是按竖屏重新布局。

### 2.2 竖屏布局

- 战场世界层按 `750 × 1624` 设计视口显示，不为填满屏幕而二次拉伸世界。
- 排行榜与状态放置在顶部安全区；3 秒准备提示居中显示，进入 Playing 后不保留局长倒计时。
- 战斗操作区使用底部中央固定摇杆；加速与辅助按钮在摇杆上方组成固定浅弧，不与顶部 HUD 混排。
- HUD、弹窗和摇杆不得跟随世界层相机缩放。
- 不同视口宽高比只调整安全区与 UI 密度，不修改世界单位。

#### 2.2.1 中央摇杆与上方操作入口定稿

以下坐标使用 `750 × 1624` 竖版设计单位、左下角为原点。实现先把实际视口和 Safe Area 换算到设计坐标；
`safeBottom` 是底部安全区高度，整组上移量固定为：

```text
controlShiftY = max(0, safeBottom + 161 - 220)
```

| 控件/槽位 | 默认功能 | 设计中心 `(x, y)` | 可见尺寸 | 独立命中半径 |
|---|---|---:|---:|---:|
| 中央摇杆 | 转向 | `(375, 220 + controlShiftY)` | 底盘 Ø220、摇杆帽约 Ø92 | 155 |
| S1 左肩 | 表情 | `(130, 410 + controlShiftY)` | Ø88 | 56 |
| S2 左上 | 当前主动道具 | `(295, 490 + controlShiftY)` | Ø104 | 64 |
| S3 右上 | 条件护盾 | `(455, 490 + controlShiftY)` | Ø104 | 64 |
| S4 右肩 | 加速 | `(620, 410 + controlShiftY)` | Ø144 | 88 |

S2/S3 比两侧肩位高 80，形成按钮位于摇杆上方的浅弧，同时给中央蛇头观察方向留出通道。S4 加速为
最大、最高频按钮，默认靠右拇指；摇杆水平中心永远为 `x=375`，不因左右手设置移动。左手模式只镜像
四个按钮的功能顺序为 `[加速、护盾、主动道具、表情]`，不镜像摇杆。首版若只有加速，则只渲染 S4；
表情、主动道具和护盾分别在功能接入后占用既定槽位。槽位不可用时不显示、不命中，其余按钮不得自动补位。
四槽是常驻战斗入口上限，新增主动能力由局前配置决定 S2 显示内容，不能继续横向堆第五、第六个按钮。

触控路由与视觉布局必须同批修改：

1. 新触点按 `S1 → S2 → S3 → S4 → 中央摇杆` 的视觉层级做精确圆形命中；重叠时按钮优先，禁止继续使用
   “左半屏都属于摇杆”或加速半径 200 的旧规则。
2. 每个 pointer 在 `TOUCH_START` 后锁定唯一 owner，直到 `TOUCH_END/TOUCH_CANCEL`；摇杆指针滑过按钮、
   按钮指针滑入另一按钮都不转移归属。
3. 至少支持一指持续转向、另一指按住加速；第三指可点击表情、护盾或主动道具。加速在按下时生效、
   抬起或取消时停止；其他按钮只在原命中区内抬起时提交一次点击意图。
4. 摇杆手指拖出起始热区后仍持续控制，视觉摇杆帽按原半径钳制；抬起只回正摇杆帽，蛇保持最后合法方向。
5. 失焦、死亡、断线、重连恢复、场景切换和 run 结束必须清空全部 pointer owner，并强制停止加速。
6. 表情面板向上展开；任何模态弹层出现前先释放当前操作指针。设置、衣柜、被动效果和复活弹层不进入四槽。

当前客户端在 `SnakeWorldView.buildControls/onTouchStart` 中仍把摇杆放在左下、加速放在右下，并用左半屏和
半径 200 分配触摸。实施时必须同时修改节点布局、Safe Area 重排、pointer 路由及对应输入测试，不能仅改
`setPosition`。

### 2.3 复刻配置必须冻结

归档实值来自
`/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/store/FeedGameStore.js:100` 的
`single_game_config.new_endless_config_abtest`。原客户端在
`ConfigStore.setConfigs/getNewEndlessConfig` 中直接使用服务端已经选好的对象，本地不再做第二次 AB 选择。
本项目将原对象冻结为 `newEndlessV2Source4896` 证据快照，再只覆盖地图字段生成
`newEndlessPortraitV2Map4096` 战场层；不得运行时跟随原服务变动，也不得与 Classic 静态默认或
`remoteBundles/res` 中的本地调试模板混用。

| V2 字段 | 原作归档值 | 项目目标值 | 本项目口径 |
|---|---:|---:|---|
| `map_width / map_height` | `4896 / 4896` | `4096 / 4096` | 用户拍板的唯一 V2 数值覆盖；不是旋转或缩放结果 |
| `endless_dot_count / endless_star_count` | `1000 / 30` | `1000 / 30` | 常驻食物总量 1030 |
| `endless_snake_min_length` | `80` | `80` | 真人与 AI 的基础出生长度 |
| `endless_snake_max_length` | `100000` | `100000` | V2 配置上限 |
| `camera_init_scale / camera_min_scale` | `1.3 / 0.6` | `1.3 / 0.6` | 按长度线性缩放 |
| `camera_scale_snake_max_length` | `100000` | `100000` | 相机缩放封顶长度 |
| `snake_body_init_scale / snake_body_max_scale` | `1.0 / 2.8` | `1.0 / 2.8` | 全局身体缩放，不因皮肤改变 |
| `body_scale_snake_max_length` | `100000` | `100000` | 身体缩放封顶长度 |
| K1 level 0 AI | `aiLevel 401×8, 402×4, 403×2, 404×2` | 同源值 | 原作单人场内的 16 条活动 AI |
| `fake_snake_count` | `86` | `86` | 仅假榜池，不生成场内实体、不参与奖励 |
| 假榜初始/增长/重置 | `100..50000 / 10..100 / 0.02` | 同源值 | 每次刷新增长；2% 时重置到 80 |
| `endless_wreck_score_rate_a / b` | `0.8 / 2` | `0.8 / 2` | 死亡残骸总分公式的指数与倍率 |
| `point_step_config` | 71 项有序分段表 | 同源表 | 完整镜像源数组；`*_max_point_step=1240` 不当作已消费规则 |

保持 1030 个食物而把地图边长从 4896 改为 4096，会让单位面积食物密度变为原 V2 的约 1.43 倍；
这是本次地图覆盖的直接结果，不自动把食物数按面积降到约 721。若以后调整食物数，必须另建配置版本。

### 2.4 `totalTime=0` 的原作依据与联机落地规则

原作新版无尽和独立 TimeLimit 是两类模式；本专项只选择前者：

- 归档默认入口把 Endless 路由到旧 `Game` 场景，其模式 switch 对 Endless 写 `totalTime=0`；
  `isNewEndless` 随后覆盖 V2 地图、食物、相机等配置，因此新版无尽没有整局倒计时。
- `GameStore.isNewEndless()` 只把 Endless/UGC 等模式与 `endless_snake_min_length > 0` 组合为新版无尽，
  明确不包含 `gameModeTimeLimit`。
- 原作即使 `totalTime=0` 也继续正向累计 `gameTime` 供事件、AI 与临时保存使用；只有 `totalTime > 0`
  才显示剩余时间 HUD 并触发 `timeIsOver`。因此 0 表示无截止时间，不是停止世界时钟。
- V2 真人死亡走 `relive_config_b`：选择窗默认 5 秒、AB 可为 8/10 秒，成功后恢复死亡前长度、分数、击杀等，
  并获得 3 秒保护；实际默认路由中的 AI 在死亡约 2 秒后重生。相关归档证据位于
  `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/utils/GameEntryUtil.js:107-116`、
  `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/store/GameStore.js:174-176`、
  `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/scene/Game.js:168-189,306-311,349-352,410-414`
  和 `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/game/snake/SnakeManager.js:165-176`。

本项目最终命名配置为 `newEndlessPortraitV2Map4096TotalTime0`，由三个可审计层组成：

| 配置层 | 来源 | 冻结口径 |
|---|---|---|
| `newEndlessPortraitV2Map4096` | 原作新版无尽 + 用户地图覆盖 | 除地图改为 4096² 外，沿用 V2 的食物、蛇身、相机、AI、假榜及对应表现 |
| `sourceEndlessTotalTime0` | 原作 `gameModeEndless` | `totalTime=0`、无剩余时间 HUD、无时长到点和超时禁复活 |
| `onlineEndlessDropInV1` | 本项目联机约束 | 首人启动、3 秒准备、最多 8 真人、活动总量 17、Playing 可加入、死亡 2 秒自动复活、真人 run 独立结算、空房回收 |

组合后的联机无尽语义固定如下：

1. 3 秒只用于首次创建世界后的操作准备，不是局长倒计时；进入 Playing 后下发 `totalTime=0`、
   `matchDurationTicks=0` 与 `hasDeadline=false`。`endTick` 使用 `null`/缺省语义，不得把数值 0 送进现有
   `tick >= endTick` 比较；服务端继续保留单调 world tick 作为确定性模拟序号和正向游玩时长来源。
2. 世界结束判断必须显式写成 `hasDeadline && tick >= endTick`；本配置下 `world.step()` 不按时间返回 done，
   mode 也不按 `matchTicks` 调用 `context.settle()`。第 1800 tick、第 1801 tick 与后续 tick 正常推进。
3. 默认不显示剩余时间 HUD。若以后增加本次游玩时长，只能显示从权威 `runStartedTick` 推导的正向计时，
   且不得作为结束条件。
4. 真人死亡后沿用本项目 2 秒自动复活并保留当前 run 累计分，资格判断改为
   `!hasDeadline || tick + respawnDelayTicks < endTick`。死亡本身不结束真人 run；该规则是为了联机连续性
   保留的适配，不伪称为原作真人的选择式付费/广告复活流程。
5. 世界不因某个玩家死亡或退出而整体结束。每位真人在最终准入、创建蛇实体前建立唯一 `runId`；主动“结束本次”、
   断线重连宽限耗尽、被服务端移出或运维 drain 时，先冻结该玩家 run 证据并可靠入队，再从世界移除。
   宽限内重连继续原 `runId`，离开后重新加入必须创建新 `runId`。
6. 至少还有一名真人时，其他玩家继续游戏，AI 按规则补位；最后一名真人完成 run 冻结并离开后，由
   Colyseus `autoDispose` 触发 mode `onDispose` 停止 tick 和清理世界。不得调用整房 `context.settle()` 代替回收，
   AI 和假榜也不能单独维持房间存活。
7. `totalTime=0` 只表示没有玩法时长上限。进程关闭、房间故障和运维 drain 使用房级内部
   `Active → Draining`：先停止新准入，在有界 drain deadline 内冻结活跃 run，再关闭连接并回收房间；不得
   静默丢奖，也不得把技术中断伪装成限时结算。
8. 正常玩法不设置 arena 最大时长。只有部署/运维指令或 tick、snapshotSeq、joinOrdinal 等单调字段接近其
   协议安全上界时才进入 Draining；阈值随 wire 版本冻结并由边界测试守门，不能复用为日常限时局。

---

## 3. 当前实现差距

### 3.1 契约和服务端

- 当前 `snake@1`、最多 8 真人、`dropIn` profile，见
  [apps/shared/schema/gameplays/snake/manifest.json](apps/shared/schema/gameplays/snake/manifest.json#L1)。
- 当前规则仍是 `1920 × 3264`、300 Dot + 15 Star、出生长度 30、固定体宽和 8 条活动蛇；
  `newEndlessPortraitV2Map4096` 要求改为 `4096 × 4096`、1000 + 30、出生长度 80、长度驱动体型与
  17 条活动蛇。`maxPlayers=8` 继续表示真人上限，不能再拿它当场内实体总量。
- 当前快照 validator 最多接受 8 条蛇和 315 个食物，无法承载 V2 的 17 条蛇和 1030 个常驻食物，见
  [apps/shared/src/gameplays/snake/ruleset.ts](apps/shared/src/gameplays/snake/ruleset.ts#L88)。
- 快照已有 `skin`，但只允许 `0..15`，无法表达原作 `101、133、401、701` 等稳定 ID，见
  [apps/shared/src/gameplays/snake/wire.ts](apps/shared/src/gameplays/snake/wire.ts#L37) 与
  [apps/shared/src/gameplays/snake/wire.ts](apps/shared/src/gameplays/snake/wire.ts#L128)。
- 食物快照只有 `kind=0/1`，没有彩点帧 `variant`；残骸没有加速/死亡种类或来源外观。
- 真人皮肤按 `joinOrdinal % 8` 临时分配，AI 固定 `skin=15`，没有读取玩家所有权和装备，见
  [apps/server/src/rooms/modes/snake/world.ts](apps/server/src/rooms/modes/snake/world.ts#L182)。
- 当前规则把 `matchTicks=1800` 写死；`SnakeWorld` 构造 `endTick`、`step()` 到点返回 done，mode 随即调用
  `context.settle()`。死亡与复活也直接拿 `endTick` 判断末段禁复活，不能靠把字段改成 0 实现无尽。
- 当前 room schema 的 `endTick/winnerId` 和客户端的 `phase===Settle` 结果页均绑定整房限时收局，需要改为
  `hasDeadline=false` 与个人 `runResult`，同时保持其他玩家的 room phase 为 Playing。
- 当前 gameplay command handler 只允许同步 `void`；若直接把 `endRun` 写成 async，dispatcher 不会等待其
  durable finalize。必须使用 mode-owned tracked task，或先扩展并验证通用 awaited command 契约。
- 当前 drop-in 中途准入没有可 await 的玩法档案准备钩子，且现有同步 admission 明确不能返回 Promise；
  无法在创建 Snake 前可靠加载装备并持久创建 OPEN run。
- 当前 Snake 结算没有能覆盖中途加入/离开的可靠真人 run 账本，不能直接承诺永久 run 结束奖励。
- 当前 Playing 离场仍保留部分 shell participant 索引，`removePlayerSnake` 也没有从所有 pending 集合移除实体；
  在固定时长房间中有界的问题会在长驻无尽房中随 churn 累积。finalize 成功后必须清理 participant、蛇、
  pendingRespawns、输入、快照游标和内存 run 账本中的全部引用。
- 当前 Snake 的 `connected` 投影没有完整接上 GameRoom drop/reconnect 状态；无尽 run 必须真正实现宽限期内
  停止 boost、保持既定移动语义，并让奖励 `activeTicks` 排除断线时间。

### 3.2 客户端表现

- 背景、网格、AI、食物与残骸颜色都在 View 内硬编码，见
  [apps/client/src/view/rooms/snake/SnakeWorldView.ts](apps/client/src/view/rooms/snake/SnakeWorldView.ts#L37)。
- 视觉格距为 100；原作 `MAP_SPACE` 为 32。服务端的 `GRID_CELL=150` 是碰撞 broadphase，
  与视觉格距无关，不得一并修改。
- Dot/Star 当前是 Graphics 圆，未使用已引入的原作 atlas。
- 运行时只加载三张 classic 皮肤；已引入的 internal skin、AI skin、食物、墙块和音效大多未接线。
- 蛇头按 `snapshot.skin % 3` 选图，蛇身却按实体 id 哈希选材质，头身可能不同皮肤，见
  [apps/client/src/view/rooms/snake/SnakeMeshRenderer.ts](apps/client/src/view/rooms/snake/SnakeMeshRenderer.ts#L107)。
- 真人皮肤被席位色 tint，AI 被统一灰化，破坏原作素材颜色。
- 当前相机只平移并在地图内钳位，没有随长度缩放，见
  [apps/client/src/view/rooms/snake/SnakeWorldView.ts](apps/client/src/view/rooms/snake/SnakeWorldView.ts#L331)。

### 3.3 已有素材与授权

当前首批素材及 SHA-256、来源、转换方式和授权证据已登记在
[docs/snakeoff/08-source-and-asset-provenance.md](docs/snakeoff/08-source-and-asset-provenance.md#L256)。
后续补齐其余皮肤、atlas JSON、身体配置或音效时，继续逐文件登记，不以“同机可见”代替授权台账。

---

## 4. 竖版战场表现规格

### 4.1 几何与相机

| 项目 | `newEndlessPortraitV2Map4096` 目标 | 说明 |
|---|---:|---|
| 世界尺寸 | `4096 × 4096` | 原 V2 为 4896²；本项目按用户拍板覆盖边界 |
| 视觉格距 | 32 世界单位 | 不是屏幕像素，也不是碰撞分区 |
| 地图边距 | 16 世界单位 | 对应原作 `MAP_BORDER` |
| 蛇身基础宽度 | 36 | 所有皮肤统一玩法碰撞口径 |
| 出生/最大长度 | `80 / 100000` | 采用 V2 的 min/max length |
| 相机初始/最小缩放 | `1.3 / 0.6` | 随权威长度线性插值 |
| 相机缩放长度上限 | `100000` | 达到后保持 0.6 |
| 蛇身全局缩放 | `1.0 → 2.8 @ 100000` | 服务端碰撞和客户端表现必须一致 |
| 路径点增长 | V2 `point_step_config` | 作为命名配置随 hash 冻结，不沿用当前固定点距假设 |

`point_step_config` 必须完整镜像原作 71 项有序表。为了便于审计，可用下列无损定义生成并与源数组逐项比对：

```text
n = 1..63: { max_length: 300*n, step_length: n+2 }
重复端点:  { max_length: 18900, step_length: 66 }
n = 64..67: { max_length: 300*n, step_length: n+3 }
尾部:      {100000,50}, {200000,100}, {300000,100}
```

原作按各段覆盖长度除以 `step_length` 累加，向下取整后乘 `STEP_POINT_COUNT=2`。重复的
`{18900,66}` 是零宽区间，镜像中保留但不改变结果；V2 最大长度为 100000，后两条只是尾部兼容数据。
边界测试至少固定 `80→52、300→200、3000→960、18900→1954、19200→1964、20100→1990、100000→5186`
个路径点。归档中的三个 `*_max_point_step=1240` 在已还原消费路径中未被读取，只记录为源元数据。

相机公式：

```text
cameraScale = max(
  cameraMinScale,
  cameraInitScale
    - snakeLength * (cameraInitScale - cameraMinScale) / cameraScaleSnakeMaxLength
)
```

- 相机中心始终跟随自己的蛇头。
- 靠近边界时继续跟随，地图外绘制原作外围背景与边界，不采用当前视口钳位。
- 若加放大镜等临时效果，恢复过程单独插值，不改变稳定公式。
- 长度缩放若进入碰撞，必须由服务端权威计算；禁止只把客户端画粗而保留旧碰撞半径。
- 世界逻辑仍使用中心原点；只在原作证据、竖版展示和输入方向映射处应用 90° 变换，禁止对正方形地图
  再做非等比拉伸。

### 4.2 背景、网格和边界

- 从原作 Game 场景序列化组件提取实际明/暗地图色、网格色、地图外背景色和透明度，禁止凭肉眼填近似 RGB。
- 保留原作浅色/深色地图主题能力，首发默认主题以 P0 截图基准为准。
- 世界网格按 32 单位生成；相机缩放后屏幕像素间距自然变化。
- 地图边界优先复用已授权墙块素材和原作平铺/拼接规则；若原作当前主题只用线框，则按主题目录选择。
- 背景和网格进入 presentation catalog，不继续散落在 View 魔法数中。

### 4.3 食物与残骸

原作 atlas 包含普通食物 `1..7`、`star` 和主题 star 变体。V2 首发目标：

| 类型 | 数量 | 显示尺寸 | 长度/分值 | 表现 |
|---|---:|---:|---:|---|
| Dot | 1000 | 16 | 1 | `1..7` 彩色帧按原作确定性随机分布 |
| Star | 30 | 42 | 原作 10；是否同步规则见 §4.7 | star 帧、移动、随机变向、撞边反弹 |
| 加速残骸 | 有界补充 | 22 | 1 | 原作对应素材/帧 |
| 死亡残骸 | 房间 cap 内 | 34 | 每个至少 3，按死亡蛇分数公式分摊 | 区分死亡掉落表现 |

实现约束：

- 快照增加服务端权威的 `food.variant`；同一种子和实体 id 应稳定复现。
- 残骸增加 `kind`，必要时增加 `variant` 或 `sourceSkinId`；不能只靠客户端猜。
- Star 运动由服务端模拟并随现有快照同步。
- 1030 个常驻食物必须使用同一 atlas/material 的批量 mesh；不得创建 1030 个 Sprite 节点或 draw call。
- 食物素材 rect、尺寸和 atlas 边界加入自动校验。

原作已消费 V2 的死亡残骸参数，场内公式不是待猜测的真人 run 奖励规则：

```text
totalDeathWreckScore = pow(deadSnakeScore, 0.8) * 2
perWreckScore = max(totalDeathWreckScore / bodyCount, 3)
```

本项目在 shared/server 中以确定性定点数口径实现并补齐边界向量；若受房间残骸上限影响而合并实体，必须
守恒该次死亡产生的总残骸分值。该分值只参与场内拾取和 run 分数，不直接等同于 §8 的资产奖励。

### 4.4 皮肤目录与渲染

首发目录使用原作 internal skin 的稳定内容 ID：

```text
1, 2, 3, 4, 10, 11, 101, 111,
112, 132, 133, 139, 401, 403, 411, 701
```

`SnakeSkinCatalog` 每条至少包含：

```ts
interface SnakeSkinDefinition {
  skinId: number;
  contentVersion: number;
  displayName: string;
  rarity: string;
  sortOrder: number;
  previewAsset: string;
  textureAsset: string;
  headFrames: readonly FrameDefinition[];
  bodyFrames: readonly FrameDefinition[];
  tailFrames: readonly FrameDefinition[];
  bodySequence: readonly number[];
  animationFrameMs: number;
  bodyDistance: number;
  pivotX: number;
  pivotY: number;
  visualScale: number;
  playerUsable: boolean;
  aiEligible: boolean;
  fallbackSkinId: number;
}
```

目录分层：

- **Shared 公共目录：** 稳定 `skinId`、公开状态、版本/hash、服务端与客户端共用校验。
- **服务端业务目录：** 所有权 itemId、碎片 itemId、解锁方式、价格、上下架时间、AI eligibility。
- **客户端资源目录：** 预览、纹理路径、head/body/tail rect、pivot、帧时间、body sequence、fallback。

素材转换要求：

- 读取原作每套皮肤的 atlas JSON 与身体配置，生成标准化目录。
- 不能继续假设所有图片都是 `216 × 72` 三等分；部分皮肤有多身体帧、动画头和不同身体间距。
- 可在运行时从 Texture2D + rect 构造 SpriteFrame，减少手工切片 `.meta`；最终仍须 Creator 打开确认资源与 UUID。
- 目录生成阶段校验 ID 唯一、唯一默认皮肤、AI 池非空、rect 不越界、资源存在、fallback 无环。
- 服务端、客户端目录 hash 不一致时禁止经济写；战场允许回退默认皮肤，避免资源问题阻塞开局。

渲染规则：

- `skinId` 同时决定头、身、尾及动画，禁止再按实体 id 哈希身体材质。
- 原作彩色皮肤默认使用白色 tint，不用席位色重染。
- 自己的识别通过细白轮廓、头顶箭头、名字或名牌完成。
- 每条蛇最多一条主体 mesh；不同皮肤可分材质，常用纹理可进一步合并 atlas。
- 未知 ID、资源加载失败或 rect 非法时统一回退皮肤 1，并记录受控诊断。

### 4.5 AI 皮肤与身份表现

原作在 `GameStore.generateGameSnakeInfos` 中从其他蛇皮肤池轮换 AI 外观，并对名字、头像做不重复抽取。
本项目采用等价但可确定性重放的规则：

- `maxPlayers=8` 只限制真人；Playing 阶段目标活动实体总量固定为 17。
- 首位真人开局时生成 16 条 AI，冻结 K1 level 0 阵容：`aiLevel 401×8、402×4、403×2、404×2`。
- 第 2～8 位真人加入时，每人替换一条 aiLevel 401 AI；公式为 `AI 数 = 17 - 真人数`，因此满 8 真人时
  仍有 9 条 AI。真人离开且席位释放后，补回对应 aiLevel 401 AI，维持总量。
- 不启用 K2 或运行时动态难度 AB；未来调整必须形成新的命名配置版本。
- `fake_snake_count=86` 仅创建展示榜数据，可用于原作风格 Top 10/个人名次表现；它们没有世界坐标、
  碰撞、皮肤实体或奖励资格，绝不能混入活动蛇数组。

展示榜与真人 run 奖励必须分为两个模型：

- `displayRank` 只服务局内排行榜。服务端每秒刷新一次：每条假榜记录有 2% 概率把分数重置到出生长度 80，
  否则增加 `10..100`；取当前活动蛇最大长度作为门槛，仅合并分数小于该门槛的假榜记录，再与活动蛇按分数
  降序排列，向客户端下发 Top 10 和本人位置。假榜记录只是假数据显示，不能进入 world 或奖励证据。
- `runSettlement` 只冻结单个真人从 `runStartedTick` 到 `runEndedTick` 的权威统计。无尽房间没有全员同刻结束，
  因而不生成伪造的全局 `settlementRank`，奖励也不按退出瞬间名次发放；若界面记录真人实时名次，只能作为
  展示或成就证据，AI 和假榜不得进入资产计算。

活动 AI 的皮肤分配规则：

1. 从 catalog 过滤 `aiEligible=true`。
2. 优先排除本房真人已经装备的皮肤。
3. 使用独立 `snake.ai.skin` seeded RNG 洗牌。
4. 按洗牌结果轮换；池不足时才循环。
5. AI 重生期间保持当前房间生命周期内的 `skinId`。
6. 皮肤随机流不得消费移动、出生、食物或碰撞随机流。

AI 不再统一灰化；若需要区分 AI，通过名牌标记、名字池或头像表现，不修改皮肤原色。

### 4.6 音效与其他表现

- 接入已登记的吃食物、吃残骸、击杀、死亡、退出结算、按钮等音效；不播放限时时间结束提示。
- 音效遵守现有 `sfxOn` 设置和 View/Logic 边界。
- 加速拖尾、出生保护、死亡爆散与复活表现可使用原作已授权素材，但必须进入 presentation catalog。
- 动画只做视觉插值，玩法状态和命中仍以服务端 tick 为准。

### 4.7 表现复刻与规则复刻的边界

本次配置选择已拍板同步以下 V2 字段：除地图尺寸外的常驻食物数量、出生/最大长度、相机缩放、身体缩放、
路径点增长配置、K1 level 0 活动 AI 阵容、假榜参数和 `totalTime=0` 生命周期。目标地图 4096²、最多 8 真人、
首人启动、Playing 可入、真人死亡 2 秒自动复活与按真人 run 独立结算，分别属于用户地图覆盖或明确标注的
`onlineEndlessDropInV1`。不得重新混入 TimeLimit 的倒计时、超时禁复活或整房统一结算，也不得把联机适配
伪装成原作原生规则。

当前规则还调整过速度、转向、加速、出生保护和 Star 价值，见
[apps/shared/src/gameplays/snake/ruleset.ts](apps/shared/src/gameplays/snake/ruleset.ts#L32)。V2 对这些字段没有形成一套可直接
覆盖本项目 fixed-step 联机规则的完整配置，不能借“选择 V2”静默混入近似换算。仍需在 S0 差异表逐项拍板：

- 当前 Star 长度/分值为 5，原作静态默认是 10。
- 当前速度 160 unit/s，低于原作 `4.5 px/frame @ 60fps` 的近似速度。
- 当前加速倍率 1.6，原作静态默认为 2。
- 当前转向速度和出生保护也经过竖版/联机收敛。

`endless_wreck_score_rate_a=0.8`、`b=2` 已在原作场内死亡残骸路径消费：总残骸分值为
`pow(deadSnakeScore, 0.8) * 2`，再按身体数量分摊且单个至少为 3。该公式随 V2 快照冻结，接入前补齐
定点数、房间上限下分值守恒与确定性测试；不得误接到真人 run 资产结算。任何规则同步均需更新 shared 真源、
测试和版本说明。

---

## 5. 养成系统产品设计

### 5.1 核心循环

```text
开始一次无尽 run
  -> 获得蛇经验、金币或碎片
  -> 提升蛇等级 / 完成成就
  -> 解锁或合成皮肤
  -> 在衣柜预览、装备
  -> 下一次创建蛇实体时以新皮肤出战
```

### 5.2 首发内容分配

16 套皮肤先全部生成预览图，再由美术和产品按视觉质量分配，不根据数字 ID 猜稀有度。建议配额：

| 获取方式 | 数量 | 目的 |
|---|---:|---|
| 默认永久拥有 | 1 | 新账号与所有异常场景的稳定 fallback |
| 新手/等级里程碑 | 3 | 让前期养成快速形成反馈 |
| 金币购买 | 4 | 建立基础货币消耗点 |
| 成就解锁 | 4 | 引导分数、有效时长、run 次数、击杀等目标 |
| 碎片合成/活动 | 4 | 中长期追求；首发不做随机宝箱 |

原则：

- 首发不做抽卡和随机重复皮肤。
- 永久皮肤重复获取必须被业务唯一键拒绝，不能再次扣款后转换。
- 退休皮肤停止售卖但保留既有所有权和装备能力。
- 限时试用、广告、支付皮肤和赛季通行证在可靠资产链完成后另立商业化阶段。

### 5.3 蛇等级、收藏和熟练度

- **蛇等级：** 全局成长线，经验来自有效 `activeTicks`、分数和击杀/里程碑；等级只解锁外观和展示内容。
- **收藏进度：** 按永久拥有皮肤的稀有度累计，用于头像框、名牌或徽章，不改变战斗属性。
- **皮肤熟练度：** 后续阶段按装备该皮肤的有效参赛累积，可解锁徽章、拖尾或专属展示动作。
- 等级由累计经验表派生，避免同时保存可漂移的 `level` 与 `xp` 两份权威值。

### 5.4 后续外观槽位

数据模型预留但首发不开放：

- `trailId`：移动/加速拖尾。
- `deathFxId`：死亡爆散和残骸特效。
- `killFxId`：击杀表现。
- `nameplateId`：名字底板、头像框、称号。
- `emoteSetId`：对局表情。

所有槽位保持纯表现；配置缺失时逐槽回退，不连带阻塞主皮肤。

---

## 6. 数据模型与写路径

### 6.1 权威存储

复用现有 User Hash、分片 Bag、MySQL currency/ledger 与 gameplay outbox，不新增独立 Redis key：

| 数据 | 权威位置 | 编码 |
|---|---|---|
| 永久皮肤所有权 | `bag:{uid}:N` | `ownershipItemId` 数量 `>=1` 表示拥有 |
| 皮肤碎片 | `bag:{uid}:N` | 可累加 `fragmentItemId` |
| 蛇经验/熟练度 | Bag additive item 或新 additive grant | 禁止用会乱序覆盖的延迟 `setField` |
| 当前装备 | `user:{uid}.snakeEquippedSkinId` | 缺失回退默认皮肤 |
| 外观状态版本 | `user:{uid}.snakeCosmeticVersion` | 缺失视为 0 |
| 金币 | MySQL `user_currency` | 继续沿用现有权威 |
| 金币流水/购买收据 | MySQL ledger/专用 entitlement receipt | 唯一业务键防重复购买 |

默认皮肤隐式拥有。新增 User 字段为可选业务字段，不要求首发批量回填；读取必须由独立 Snake cosmetic store
显式取字段，不能假设现有 `readUser` 自动返回开放字段。

### 6.2 RPC 契约

新增 `snakeCosmetic` Lobby RPC 域：

```text
snakeCosmetic.getSnapshot
  -> catalogVersion/catalogHash
  -> stateVersion
  -> equippedSkinId
  -> ownedSkinIds
  -> fragmentBalances
  -> snakeXp / derivedLevel

snakeCosmetic.equip(clientReqId, skinId, expectedStateVersion)
snakeCosmetic.unlock(clientReqId, skinId, expectedStateVersion)
snakeCosmetic.purchase(clientReqId, skinId, expectedStateVersion) // 商业化阶段
```

领域错误码至少包含：

```text
SKIN_NOT_FOUND
SKIN_NOT_OWNED
SKIN_UNAVAILABLE
SKIN_ALREADY_OWNED
STATE_CONFLICT
INSUFFICIENT_FRAGMENTS
CATALOG_VERSION_MISMATCH
```

RPC descriptor 是契约真源，按标准流程生成 registry、服务端路由和能力文档。

### 6.3 装备写路径

装备属于 Redis-only 状态变更：

1. 进入现有 `withUser` 用户锁/UoW。
2. 校验 catalog 版本、皮肤有效、已拥有、未下架禁用。
3. 校验 `expectedStateVersion`。
4. 写 `snakeEquippedSkinId` 并递增 cosmetic/global version。
5. 返回完整的新状态快照。

装备不需要 MySQL outbox，但必须支持同一 `clientReqId + payload` 重试，并拒绝同 id 不同 payload。

### 6.4 碎片解锁

碎片解锁必须使用专用同槽 Lua，一次性完成：

```text
检查 catalog/版本
-> 检查尚未拥有
-> 检查碎片足够
-> 扣碎片
-> 写永久 ownership=1
-> 递增状态版本
-> 写 applied/payload 幂等绑定
```

不能直接使用通用负 item effect；现有脚本的下溢处理不能表达“余额不足则整笔零写入”。

### 6.5 永久皮肤购买

不同 `clientReqId` 仍可能针对同一皮肤重复购买，因此不能只增加普通可堆叠 Shop SKU。商业化阶段应：

1. 在 MySQL 建 `(uid, sId, skinId, entitlementGeneration)` 唯一业务收据。
2. 同一事务扣金币、写 ledger、写 outbox。
3. outbox 向 Bag 发放永久所有权。
4. 重放时由唯一收据和 applied/payload 共同保证不重复扣款和不重复发放。

---

## 7. 入房、快照和版本演进

### 7.1 服务端权威装备

客户端可以上传 `clientCatalogVersion` 用于兼容性检查，但不得把 join 中的 `skinId` 当权威。正确准入顺序：

```text
房间创建 -> initializeRoomEpoch（admission 前生成且整房不轮换）
鉴权成功
-> preparePlayerAdmission(uid, session/generation)
-> 读取 equippedSkinId 与所有权
-> 校验 catalog 和资源版本
-> startOrResumePlayerRun：持久创建或读取唯一 OPEN run
-> 创建当前 run 的 Snake(skinId)
-> 将 runId 与 skinId 锁存在实体
```

当前初始阵容可使用已被 await 的 `onMatchInitialize`，但 Playing 中途加入只有同步 admission/createPlayer。
应新增通用、带超时边界的异步 `preparePlayerAdmission` hook，在鉴权后、实体创建前执行；不得在 `GameRoom` 写 Snake 专属分支。
OPEN run 持久化失败时准入必须 fail closed，不能先产生一个无账本蛇实体；断线重连按 `runId + generation`
恢复同一 run，不得重复创建。

局中换装规则：

- 衣柜写入立即生效于账号，但只影响下一次创建的 Snake。
- 当前 run 实体的 `skinId` 冻结；重生、断线重连继续使用该值。
- 若外观被服务端撤下，下一次创建实体时回退默认并可在用户锁内修复装备字段。

### 7.2 Snake wire v2 与 V2 容量

建议将字段语义从临时索引收敛为稳定内容 ID，并提升 `snake.modeVersion`：

```ts
interface ISnakeSnapshotSnake {
  skinId: number;
  // 其余字段保持现状
}

interface ISnakeSnapshotFood {
  variant: number;
}

interface ISnakeSnapshotWreck {
  kind: number;
  variant?: number;
  sourceSkinId?: number;
}

interface ISnakeEndlessRoomMeta {
  roomEpochId: string;
  battlefieldConfigId: "newEndlessPortraitV2Map4096";
  lifecycleConfigId: "sourceEndlessTotalTime0";
  onlineAdaptationId: "onlineEndlessDropInV1";
  configHash: string;
  totalTime: 0;
  matchDurationTicks: 0;
  hasDeadline: false;
}

type ISnakePlayerRunState =
  | { runId: string; state: "preparing" | "cancelled"; runStartedTick: null }
  | { runId: string; state: "active" | "finalizing" | "finalized"; runStartedTick: number };
```

- 房间元数据显式下发 `battlefieldConfigId=newEndlessPortraitV2Map4096`、
  `lifecycleConfigId=sourceEndlessTotalTime0`、`onlineAdaptationId=onlineEndlessDropInV1`、配置 hash、
  `totalTime=0`、`matchDurationTicks=0` 与 `hasDeadline=false`，重连客户端不得靠本地默认猜配置。
- Snake 房间在创建完成、开放任何 admission 之前生成一次 `roomEpochId`。通过通用 mode lifecycle capability
  把现有 `state.matchId` 前移并赋同一个值；首次 auto-start 的 `initializeMatchState` 不得再次覆盖，其他玩法仍
  保持原 matchId 生成边界。这样首个 OPEN run 持久化前已有稳定 epoch，又不产生两个同义 ID。
- `endTick/winnerId` 不再承担本模式的整房结束语义；兼容期若 schema 仍保留字段，必须由 `hasDeadline=false`
  守门，客户端不得把 `endTick=0` 显示成 `0:00` 或据此进入结果页。
- 新增 typed `c2s.snake.endRun`、`s2c.snake.runFinalizing` 与 `s2c.snake.runResult`。command handler 保持同步：
  校验后原子切换 Finalizing、停止输入、按 runId 登记 mode-owned tracked Promise，并立即回 `runFinalizing`；
  Promise 完成后异步推送唯一 receipt。重复 endRun 和 `preparePlayerFinalLeave` 必须 join 同一任务，mode task
  registry 在 dispose/drain 前收口，不得产生 detached Promise。客户端收到结果后离房；未按时离开则由服务端
  在有界确认窗后关闭连接。断线超时等无在线客户端场景把 receipt 留到下一次账号 snapshot 展示。
- 个人 run 结果不得借 room `phase=Settle` 广播；同房其他玩家始终保持 Playing。
- drop/reconnect 必须投影到 Snake player state：宽限内保留最后合法方向、强制关闭 boost、暂停奖励
  `activeTicks`，成功重连后继续原 run；宽限耗尽只 finalize 一次。
- validator 按 catalog 成员或稳定 ID 上界校验，不能继续限制 `0..15`。
- `bodyScale` 若能由 shared 长度公式确定，可不占快照字段；若规则可热版本化，则显式下发规则版本。
- 素材目录不在当前 gameplay contract digest 内，需额外携带 `presentationVersion/catalogHash`。
- 服务器发送客户端未知的皮肤时，客户端必须回退默认，而不是崩溃或拒绝整个快照。
- 世界集合上限改为 17 条活动蛇、1030 个常驻食物和现有有界残骸；86 个假榜条目走独立排名模型，
  不占 `snapshot.snakes`。
- V2 逻辑路径在长度 100000 时可达 5186 点，当前每蛇 512 点上限不能直接沿用。服务端保留完整权威路径；
  首次入房/重连通过 `begin → ordered chunks → end(checksum)` 发送有界世界基线，后续按序发送食物增删、
  Star 移动与蛇路径 append/trim delta。丢序或校验失败时重新申请基线，禁止静默截掉尾部、食物或蛇。
- 升级 wire 时为 chunk 数、总实体数、单蛇路径点数、全房路径点总数和序号分别设置 validator 上限；
  fixture 必须覆盖 `17 条蛇 / 1030 个食物 / 单蛇 5186 点 / 全房理论上限 88162 点`，以及缺块、重复块、
  乱序 delta、重连恢复和旧客户端版本拒绝。
- 长驻房的实体删除必须同时移除 participant 索引、pendingRespawns、输入状态和快照游标；已 durable finalize
  的 run 内存记录及时驱逐。fixture 用大量 join/leave/reconnect 循环验证集合回到当前在线规模。

### 7.3 生成流程

涉及契约与生成物时按仓库标准动线执行：

```text
修改 shared 手写真源 / snake schema
-> npm --workspace @game/server run codegen:gameplays
-> npm --workspace @game/server run codegen:features
-> npm run sync:shared
-> protocol 变更时显式重钉 fingerprint
-> npm run sync:client
-> 类型检查与测试
```

禁止手改：

- `apps/shared/src/gameplays/generated/`
- `apps/server/src/rooms/schema/generated/`
- `apps/client/src/gameplay/catalog.generated.ts`
- `apps/shared/src/protocol/lobbyRpc/registry.generated.ts`
- `apps/client/src/generated/`
- `apps/client/src/shared/`
- `apps/Cocos/assets/src/`

---

## 8. 可靠的真人 run 结算与奖励

### 8.1 为什么不能继续依赖整房 settle

`totalTime=0` 后房间没有共同结束时刻，玩家又可以中途加入和离开；当前离开会从 world 删除，等待整房
`context.settle()` 将导致先离开的玩家无法及时结算，长时间有人在线时甚至永远不会结算。因此正式养成奖励
必须改成 Snake 自持的每真人 run 证据。该无尽 mode 全程不因奖励或空房回收调用 `context.settle()`；最后一个
客户端离开后由 Colyseus `autoDispose` 调用 `onDispose` 清理。运维退役则走独立 Draining/close 流程。

### 8.2 真人 run 账本

每次最终准入先创建唯一 `runId`，持久成功后才入座；重连延续该 run，最终离开后重新准入创建新 run：

```ts
interface SnakePlayerRunLedger {
  roomEpochId: string;
  runId: string;
  state: "preparing" | "active" | "finalizing" | "finalized" | "cancelled";
  uid: string;
  sId: string;
  sessionId: string;
  runStartedTick: number | null;
  runEndedTick: number | null;
  endReason: "explicitExit" | "disconnectTimeout" | "sessionReplaced" | "moderationKick"
    | "serverDrain" | "roomFault" | null;
  activeTicks: number;
  score: number;
  finalLength: number;
  maxLength: number;
  kills: number;
  deaths: number;
  equippedSkinId: number;
  catalogVersion: number;
  rewardPolicyVersion: number;
  evidenceVersion: number;
  confirmedThroughTick: number;
}
```

OPEN run 在准入阶段先以 `state=preparing, runStartedTick=null` 持久创建；首位真人在 3 秒准备结束后的第一个
可操作 tick、后续 drop-in 真人在实际出生且可操作的 tick，以 CAS 原子写入 `runStartedTick` 并转为 `active`。
只有 `active/finalizing/finalized` 记录允许非空 `runStartedTick`。Preparing 阶段离场以 CAS 转为 `cancelled`，
不生成 settlement 或奖励；最终 settlement 一律拒绝空 `runStartedTick`。

`activeTicks` 只累计 3 秒准备完成后同时满足 `connected && alive && runState=active` 的模拟 tick；死亡后的
40 tick 等待、断线宽限和 Finalizing 均不计奖励时长。`runStartedTick` 是时间轴锚，不可直接相减冒充
`activeTicks`。

账本至少在关键里程碑和固定 checkpoint 间隔写入单调版本的持久证据；结束有效 run 时用 fence/CAS 执行
`active → finalizing → finalized`，确保主动退出、断线超时和并发顶号只能有一个结束者；Preparing 只允许
`preparing → active` 或 `preparing → cancelled`，不得伪造 `runStartedTick`。进程异常恢复时以最后一个已确认
checkpoint 关闭或恢复 run，不得把同一 `runId` 当成新参赛记录重复发奖。硬崩溃不会执行 leave/dispose，
只能结算到 `confirmedThroughTick`；方案承诺已确认进度不漏不重，不声称未持久化的 checkpoint 窗口也能恢复。

### 8.3 结算协议

现有 `onPlayerLeaving` 是同步钩子，不能承载该顺序；应在通用 `GameMode`/shell 增加可 await、带超时和 generation
复验的 `preparePlayerFinalLeave` 边界。Snake 进入该边界即把 run 标为 Finalizing 并停止输入，完成 durable freeze
后才释放实体/席位；不得在 `GameRoom` 硬编码 Snake 分支。

1. checkpoint 只更新 canonical evidence 与 `confirmedThroughTick`，不得生成奖励 intent 或占用最终 opId。
2. 在从 world 移除真人前，先冻结该 `SnakePlayerRunLedger`；只有首次取得 `active → finalizing` fence 的
   执行者可以创建最终奖励，事务成功后才写 `finalized`；`preparing → cancelled` 不创建奖励。
3. 同一 MySQL 事务写 `snake_run_settlement`、金币 ledger 和 Redis effect outbox intent；房内其他玩家不参与。
4. opId 至少绑定 `(sId, roomEpochId, runId, uid, rewardPolicyVersion)`；重复 finalize 必须回读并比对 canonical
   evidence/effect，异 payload 冲突进入隔离而不是覆盖。
5. 经验、碎片和熟练度映射为 Bag additive item，或先扩展有界 additive grant effect；禁止延迟执行会覆盖
   新值的 absolute setField。
6. `endReason` 使用显式奖励资格矩阵：反作弊/封禁类 `moderationKick` 不发奖，普通退出、断线超时、会话替换、
   serverDrain 和 roomFault 按已确认进度结算。
7. 进程崩溃后由 relayer 重放；超过重试阈值进入 dead 告警和人工 replay SOP，客户端可按 runId 查询
   `pending/applied/dead` reward status 与 receipt。
8. 最后一名真人离开时，必须先完成所有 run 的 durable freeze，再允许房间 autoDispose。

### 8.4 奖励公式形状

首轮数值不在计划中硬编码，先根据真实 V2 无尽 run 的时长、得分和击杀分布调参；公式结构固定为：

```text
reward
  = baseParticipation
  + activeTimeComponent
  + cappedScoreComponent
  + cappedKillOrMilestoneComponent
  + firstRunOrAchievementBonus
```

- 有效时长只读取账本 `activeTicks`，不受房间已运行多久影响。
- 无输入、无移动贡献且无得分的账号不获得参与奖励；重复短 run 不得反复领取 base。
- 时间、分数和击杀组件使用软上限或硬封顶，避免无限挂机和超长 run 冲击经济。
- 无尽房间没有共同终局，不设置 `rankBonus` 或 `firstWin`；`displayRank`、AI 和假榜分数不得进入经济写路径。
- 每次调参提升 `rewardPolicyVersion`，历史结算按原版本重放。

---

## 9. 客户端 Feature 与页面

新增独立 `features/snakeCosmetic/feature.json`，按非侵入式 feature 动线接入。

### 9.1 Logic

- 拉取权威 snapshot 并验证 catalog hash。
- 读取 `hasDeadline=false` 后关闭旧倒计时逻辑；world tick 只用于插值、重连校正和当前 run 正向时长。
- 发送幂等 `endRun(runId, clientReqId)`，只由匹配 runId 的 `runResult` 打开个人结算；不得等待或伪造
  room `phase=Settle`。
- 构造不可变衣柜 ViewModel。
- 提供“全部/已拥有/未拥有/可合成”筛选和稳定排序。
- 执行装备、解锁、冲突刷新和错误映射。
- 写操作在发出前进入 `PendingOperationJournal`，恢复后用相同 payload 重发。
- Logic 禁止导入 `cc` 或 `fairygui-cc`。

### 9.2 View

- FGUI 虚拟列表显示预览、稀有度、拥有/锁定/可合成状态。
- 中央动态预览同时展示头、身、尾、动画和长度增长效果，用作素材验收入口。
- 详情区展示获取方式、碎片进度、装备/解锁按钮。
- 当前装备、首次获得和新解锁具有明确状态与红点。
- 状态版本冲突时禁用重复点击，刷新后恢复。
- 战斗 HUD 不显示 `0:00` 或剩余时间；“结束本次”需要二次确认，结果页展示 runId 对应的奖励 receipt。

### 9.3 页面动线

```text
Home
  -> 装扮/衣柜
      -> 皮肤列表
      -> 动态预览
      -> 解锁/装备
  -> 开始游戏
      -> 使用服务端锁存装备
  -> 主动结束本次 / 最终离场
  -> 真人 run 结算
      -> 展示经验、碎片、等级进度和新解锁
```

首页 schema 当前主要面向 gameplay launch。建议一次性把 launch target 扩展为 `gameplay | route` 联合类型，
让衣柜入口完全由 feature 自持；首页实体 GList 视觉可与 [plan-v5.md](plan-v5.md#b-编辑器--creator-待办-无头环境无法替代)
的 B1 一起完成。

---

## 10. 实施阶段与交付物

> 人日为单工程师粗估，不含最终 FGUI 美术制作和产品数值反复。

| 阶段 | 状态 | 工作 | 主要交付物 | 退出条件 | 预计 |
|---|---|---|---|---|---:|
| S0 | [已拍板·待实施] | 冻结基线、取证、差异表 | `newEndlessPortraitV2Map4096TotalTime0`、原作/竖版 golden、规则差异表 | 配置来源、`totalTime=0` 和截图均可重复核验 | 3–4 人日 |
| S1 | [已拍板·待实施] | 素材目录与转换 | 16 皮肤 catalog、atlas rect/body config 生成、资源/授权台账 | 全目录生成和资源/rect/hash 校验通过 | 3–5 人日 |
| S2 | [已拍板·待实施] | V2 战场与无尽生命周期 | 4096² 世界、1030 食物、17 活动蛇、V2 相机/身体、中央操作区与多点触控、分块基线、持续世界与空房回收 | 定向测试、操作布局/双指测试通过且竖版 world golden 达标 | 8–12 人日 |
| S3 | [已拍板·待实施] | 衣柜与装备 | Feature、FGUI、snapshot/equip/unlock、Bag/User 存储、准入锁存 | 权威装备、并发、重连、fallback 测试通过 | 6–10 人日 |
| S4 | [已拍板·待实施] | 可靠养成奖励 | 真人 run 账本/checkpoint、durable run settlement、金币/经验/碎片 outbox | 已确认进度在各结束原因与结算崩溃窗口不漏奖、不双发 | 7–11 人日 |
| S5 | [已拍板·待实施] | 验收与发布 | 自动测试、Creator、故障演练与兼容证据 | 全量门禁与 Creator 证据齐全 | 2–3 人日 |

完整首发合计约 29–46 人日。S3 可用于内部试玩，面向玩家宣称“养成系统完成”必须等 S4 的可靠奖励闭环完成。

### S0：复刻基线

- [ ] 在原作固定构建和配置下截取横版战场 golden。
- [ ] 生成只旋转世界层后的竖版参照图；UI 单独给出标注可见尺寸、触控半径、Safe Area 与左右手镜像的
  竖屏布局稿。
- [ ] 从场景序列化数据提取背景、网格和边界颜色。
- [ ] 固化 `newEndlessV2Source4896`、`newEndlessPortraitV2Map4096`、`sourceEndlessTotalTime0`、
  `onlineEndlessDropInV1` 及组合配置 hash。
- [ ] 用逐项 fixture 校验 V2 归档对象、71 项路径表及 Endless 的 `totalTime=0` 消费路径。
- [ ] 列出原作 V2 无尽与本项目 drop-in、2 秒自动复活、真人 run 结算的差异，禁止混入 TimeLimit 规则。

### S1：素材与目录

- [ ] 补齐 16 个 internal skin 的 PNG、atlas JSON、body config 与预览。
- [ ] 补齐七色 Dot、Star、残骸和墙块 rect。
- [ ] 编写确定性转换/校验脚本，不手抄大量 rect。
- [ ] 更新素材授权与 SHA 台账。
- [ ] 验证 default、fallback、AI pool、资源存在和 rect 边界。

### S2：战场表现

- [ ] 将世界、食物、出生/最大长度切换为 `4096²、1000+30、80/100000`。
- [ ] 将网格 100 改为 catalog 的 32 世界单位。
- [ ] 接入原作背景/边界主题。
- [ ] 食物、Star 和残骸改为 atlas 批渲染。
- [ ] 接入 Star 运动与反弹。
- [ ] 统一 `skinId -> head/body/tail` 渲染。
- [ ] 移除原皮席位 tint 与 AI 灰 tint，增加自机非颜色提示。
- [ ] 按 2.2.1 落实中央固定摇杆与上方四槽弧形操作区，所有控件按底部 Safe Area 整组重排，隐藏槽位不补位。
- [ ] 重写触控分配为按钮圆形热区优先、中央摇杆次之和一指一 owner；支持转向 + 按住加速并行，所有取消、
  失焦、死亡、断线、场景切换与 run 结束路径都释放 owner 并停止加速。
- [ ] 更新 `snakePresentation.test.ts` 中旧摇杆中心 `(170, 220)`、左半屏方向区和半径 200 加速区假设，
  增加左右手镜像、固定槽位、Safe Area 与多指不抢控回归。
- [ ] 接入 `1.3→0.6` 相机、`1.0→2.8` 身体缩放和 71 项路径增长，并同步权威碰撞。
- [ ] 实现 17 条活动蛇、真人替换 aiLevel 401 AI、离开补位，以及与奖励榜隔离的 86 条 `displayRank` 假榜池。
- [ ] AI 皮肤使用独立 seeded RNG。
- [ ] 下发 `totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false`，让 `endTick` 缺省；所有结束/复活比较
  先检查 `hasDeadline`，移除第 1800 tick 收局、末段禁复活和剩余时间 HUD。
- [ ] 通过通用 mode lifecycle capability 在 admission 前生成 Snake `roomEpochId/state.matchId`，首人 auto-start
  不再覆盖，其他玩法保持现有 matchId 生成边界。
- [ ] 实现真人 run 创建/重连延续/最终离场冻结、其他玩家不中断、最后真人离场后停止世界并回收房间。
- [ ] 修复 drop/reconnect 状态投影；宽限内停止 boost、保持最后合法方向，并暂停奖励 `activeTicks`。
- [ ] 离场同步清理 participant、pendingRespawns、输入、游标和 finalized run 引用，以 churn fixture 守门。
- [ ] 提升 wire 版本，完成 17 蛇/1030 食物/单蛇 5186 点/全房 88162 点上限的分块基线、delta 与重连恢复。

### S3：衣柜与装备

- [ ] 增加 shared catalog 与 `snakeCosmetic` RPC descriptor。
- [ ] 实现 Bag 所有权/碎片查询和 User equipped/version store。
- [ ] 实现 equip CAS 与专用 unlock Lua。
- [ ] 增加通用异步 `preparePlayerAdmission` hook。
- [ ] 提升 Snake modeVersion，生成和同步所有镜像。
- [ ] 完成衣柜 Logic、FGUI View、动态预览和首页 route 入口。
- [ ] 完成重连、run 中换装只影响下一次实体创建、未知素材 fallback。

### S4：可靠奖励

- [ ] 建立动态 roster 的 `SnakePlayerRunLedger` 与持久 checkpoint。
- [ ] 建立带 `endReason` 的 durable run settlement/evidence。
- [ ] 接入 awaited `preparePlayerFinalLeave`、幂等 `endRun` 与可补领的 `runResult` receipt。
- [ ] 在同一 MySQL 事务写 run settlement、金币 ledger 与 gameplay outbox；checkpoint 不触发奖励。
- [ ] 建立 rewardPolicyVersion 及绑定 `sId/roomEpochId/runId/uid` 的幂等 opId。
- [ ] 覆盖主动结束、断线超时、并发顶号、moderationKick、drain、房间故障、重连、dead replay 和重复 finalize。
- [ ] 完成首轮经验、等级、碎片和成就表调优。

### S5：验收与发布

- [ ] `npm run verify:all` 全绿。
- [ ] Snake server/client/FGUI 单测和真栈 int 全绿。
- [ ] Creator 3.8.8 打开确认资源 `.meta`、动态加载和 SpriteFrame rect。
- [ ] 750×1624 Creator 预览截图留证。
- [ ] 回写本文件状态、commit、命令结果、截图和 Creator 证据路径。

---

## 11. 验收标准

### 11.1 视觉一致性

- 使用落在目标边界内的固定实体位置/种子 fixture，在 `750 × 1624` 下把原作横版世界层旋转 90°，与目标
  世界的重合区域按 1:1 世界单位叠图；不得用 `4096/4896` 缩放。原作外围 400 单位/边不参与像素叠图，
  另用边界 fixture 验证目标 4096² 覆盖。
- 目标世界为 `4096 × 4096`，同时保留原作 V2 `4896 × 4896` 配置快照作来源证据；稳定态恰有
  1000 Dot + 30 Star，显示数量不得回落到 Classic 的 300 + 15。
- 网格间距严格为 32 世界单位；地图边距为 16。
- Dot 和 Star 的世界显示尺寸分别为 16 和 42，七种 Dot 帧均可出现。
- 背景、网格、边界色来自原作场景数据，不是人工近似值。
- 每条蛇的头、身、尾和动画始终来自同一 `skinId`。
- 单真人时 16 AI、共 17 条活动蛇；新增真人只替换 aiLevel 401 AI，满 8 真人时仍有 9 AI。
- AI 不再统一灰色；同局皮肤池具有足够多样性；86 个假榜条目从不出现在世界实体或结算参与者中。
- 局内 `displayRank` 可合并符合门槛的假榜记录；资产奖励只读取单个真人的冻结 run 证据，AI、假榜和
  退出瞬间名次均不影响奖励。
- 出生长度 80；相机 `1.3→0.6@100000`、身体 `1.0→2.8@100000`、蛇头中心跟随和边界外围背景
  均可由 fixture 自动断言。
- 未知皮肤和资源加载失败稳定回退默认，不阻塞战斗。

### 11.2 操作布局与触控

- `750 × 1624` 设计视口下摇杆中心为 `(375, 220)`、可见底盘 Ø220、独立命中半径 155；摇杆帽回正、
  最大视觉位移和最后合法方向行为均有输入回归。
- 默认按钮中心严格为 S1 `(130,410)`、S2 `(295,490)`、S3 `(455,490)`、S4 `(620,410)`；加速可见尺寸
  Ø144，其他槽位尺寸与 2.2.1 表一致，按钮命中区互不重叠且不侵入摇杆命中区。
- 底部 Safe Area 增大时，摇杆与四槽按同一个 `controlShiftY` 整组上移；横向中心、弧形相对距离、按钮尺寸
  和世界单位均不改变。
- 未接入或当前不可用的槽位不渲染、不命中，其余按钮位置不补位；默认模式与左手镜像模式下摇杆都保持
  `x=375`，加速等按钮只按约定镜像功能顺序。
- 一指转向与另一指按住加速可同时持续；第三指点击辅助入口不会抢走前两指。任意 pointer 滑过其他控件都不
  改变 owner，按钮区域也不会触发方向变化。
- 加速仅在其 owner 存活时为 true；`TOUCH_END/TOUCH_CANCEL`、失焦、死亡、断线、重连恢复、场景切换和
  run 结束后均无残留 pointer 或 boost 状态。
- 输入实现不再包含“左半屏都属于摇杆”或加速半径 200 的旧判定；精确命中、固定槽位和多指行为由自动测试守门。

### 11.3 协议与数据正确性

- 房间声明 `totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false` 且无有效 `endTick`；3 秒准备结束后
  持续推进，第 1800、1801 tick 均不触发收局，客户端不显示剩余时间 HUD 或 `0:00`。
- `world.step()` 只有 `hasDeadline && tick >= endTick` 才可按时间返回 done；无尽 mode 不从该路径调用
  `context.settle()`。任意 tick 死亡都可在 40 tick 后按联机规则复活，不存在临近 endTick 禁止复活分支。
- 房间同时声明 V2 战场层、原作 Endless `totalTime=0` 层和 drop-in 联机适配层，任何 hash 不一致均不能
  静默 fallback 到 Classic 或 TimeLimit。
- 17 蛇、1030 食物、单蛇 5186 点及全房理论上限 88162 个逻辑路径点可完成首包/重连；缺块、乱序或
  校验失败会重取基线。
- 死亡残骸按 `pow(deadSnakeScore, 0.8) * 2` 计算总值、按身体数分摊且单个至少 3；实体合并前后总分守恒。
- `skinId` 使用稳定内容 ID，不依赖目录顺序或 `% 3`。
- 客户端伪造未拥有皮肤不能进入战场。
- 同/不同 requestId 并发装备、重复解锁和状态版本冲突行为确定。
- 碎片不足时所有字段零写入。
- 冷用户 thaw、冻结归档、跨区隔离和退休皮肤均有测试。
- 中途换装只影响下一次实体创建；重连和重生保持当前 run 外观。
- 单人主动退出只结束自己的 run，其他真人世界继续；最后一名真人离开后才停止世界并回收房间。
- 宽限内重连延续同一 `runId`，最终离开后重入生成新 `runId`；已确认进度在各结束原因与结算崩溃窗口
  不漏奖、不双发。
- 个人结果只由对应 `runResult`/receipt 驱动；room phase 在仍有真人时保持 Playing，不向其他玩家广播结算页。
- `activeTicks` 排除准备期、死亡等待、断线宽限和 Finalizing；大量 join/leave/reconnect 后所有内存集合回落到
  当前在线规模，不残留 finalized run 或永久 pendingRespawns。
- checkpoint 不发奖；首次 finalize 原子地产生 settlement/ledger/outbox，重复同 payload 返回同 receipt，
  异 payload 隔离，dead 状态可查询并可按 SOP 重放。

### 11.4 Creator 与可复现证据

- Creator 预览确认所有纹理、rect、pivot、动画、混合和层级正确。
- 留存固定视口下的战场 golden、衣柜、结算、断线重连和资源缺失 fallback 截图/日志。

---

## 12. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 混用 Classic 静态默认、本地调试模板与 V2 快照 | 永远无法定义“一致” | 冻结命名配置、hash 和截图基线，逐字段 fixture 守门 |
| 把目标 4096² 写成原作 V2 原值或把 4896² 整体缩放 | 来源与视觉比例失真 | 分离 `newEndlessV2Source4896` 与 `newEndlessPortraitV2Map4096`；只覆盖边界，不缩放世界单位 |
| 仍在第 1800 tick 收局或保留 TimeLimit HUD | 实际仍是 90 秒模式，违反已选 `totalTime=0` | 使用 `sourceEndlessTotalTime0`，测试 1800/1801 tick 连续推进并禁止 TimeLimit fallback |
| 继续沿用 8 蛇/315 食物/512 路径点快照上限 | 合法 V2 世界被拒绝或静默截断 | wire 升版，分别守门单蛇 5186 点和全房 88162 点，使用有校验的分块基线和有序 delta |
| 把 86 个假榜条目生成为活动 AI | 世界数量、碰撞和奖励全部错误 | 假榜使用独立模型；活动蛇硬上限 17 |
| 把 `1240` 当作路径点或长度上限 | 蛇身、相机与碰撞公式错误 | 镜像 71 项源表并以边界向量验证真实消费算法 |
| 运行时继续读取动态 AI AB | 同一版本阵容不可复现 | 首发冻结 K1 level 0；变更必须新建命名配置版本 |
| 原皮 atlas 布局不一致 | 头身错位、动画错误 | 解析原 atlas/body config，生成 catalog，rect 自动验界 |
| 只改客户端体型 | 视觉和碰撞不一致 | 全局缩放公式由 shared/server 权威，或明确保持固定体宽 |
| 直接信任 join skinId | 越权使用未拥有皮肤 | 服务端异步准入读取并锁存装备 |
| drop-in 最终离场时直接删实体 | 真人 run 漏奖或重复发奖 | world 外维护持久 run 账本，先以 fence/CAS durable finalize，再移除实体 |
| 直接在同步 `onPlayerLeaving` 中异步发奖 | 离场删除与持久化竞态，进程退出后丢证据 | 增加通用 awaited `preparePlayerFinalLeave`，带 generation 复验、超时和幂等恢复 |
| 把 `endRun` 直接实现成 async command handler | dispatcher 不等待并错误回复，finalize 变成 detached task | command 同步切 Finalizing并登记按 runId 去重的 mode-owned tracked Promise，leave/drain 复用并等待 |
| `totalTime=0` 被误解为房间永不回收 | 空房和 AI 世界泄漏 | AI 不计房间存活；最后真人 run 冻结后停止 tick 并允许 autoDispose |
| 运维发布直接关闭长驻 Playing 房 | 活跃 run 无结束证据 | 内部 Active→Draining 停准入，冻结 run 后再关闭；客户端按 `serverDrain` 展示结果 |
| 把 `runStartedTick` 到当前 tick 全算活跃时长 | 死亡等待、断线与挂机获得额外奖励 | 只累计 connected、alive、active 的权威 `activeTicks` |
| 硬崩溃前尚未确认 checkpoint | 最近进度无法凭空恢复 | receipt 显示 `confirmedThroughTick`；只承诺已确认进度，缩短窗口需另行调整持久化策略 |
| 普通 Shop SKU 重复购买唯一皮肤 | 多次扣款 | 专用 entitlement receipt 唯一键 |
| 资源版本与服务端目录不一致 | 白图、崩溃、经济争议 | catalog hash 闸门；经济禁写、战斗 fallback |
| 每食物一个节点 | 节点和提交数量失控 | 单 atlas/material 批量 mesh |
| 皮肤随机影响玩法 RNG | 新增皮肤改变对局轨迹 | 独立命名 seeded RNG 子流 |
| 只移动摇杆节点而保留左半屏和加速半径 200 的旧命中规则 | 按钮抢触、误转向和热区重叠 | 按钮圆形热区优先，移除半屏判断，以 pointer ownership 和多点触控测试守门 |
| 手改生成物 | 镜像漂移和后续覆盖 | 只改真源并运行 codegen/sync |

---

## 13. 实施状态与证据回写模板

每完成一个阶段，在下表登记真实证据；未运行的命令不得写成通过。

| 阶段 | 状态 | commit | 自动验证 | Creator 证据 | 备注 |
|---|---|---|---|---|---|
| S0 | [已拍板·待实施] | — | — | — | — |
| S1 | [已拍板·待实施] | — | — | — | — |
| S2 | [已拍板·待实施] | — | — | — | — |
| S3 | [已拍板·待实施] | — | — | — | — |
| S4 | [已拍板·待实施] | — | — | — | — |
| S5 | [已拍板·待实施] | — | — | — | — |

建议的最终发布口径：

> **竖版新版无尽 V2 战场（4096² 地图覆盖）+ 原作 `totalTime=0` 无尽生命周期 + drop-in 联机适配 +
> 16 套原作皮肤 + 纯外观养成 + 服务端权威装备 + 可靠真人 run 奖励。**
