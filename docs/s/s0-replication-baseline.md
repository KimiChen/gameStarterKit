# S0 · 复刻基线、取证与规则冻结

> [返回专项总目录](README.md) · [下一阶段：S1 素材与目录](s1-assets-and-catalog.md)

> **状态：`[已拍板·待实施]`**<br>
> **预计：3–4 人日**<br>
> **依赖：无；这是 S1、S2、S2R、S3、S4 的共同前置阶段。**<br>
> **主要输入：** 固定在 commit `6367f65bf210d75ba39c0e48ecace5b30b538a06` 的原作归档
> `/Users/kimi/work/tanchishe/wegameVersion/`、当前仓库 Snake 实现、
> 用户在 2026-09-03 拍板的竖版和地图覆盖口径。<br>
> **主要输出：** `newEndlessPortraitV2Map4096TotalTime0` 的可审计配置栈、来源驱动静态重建的横版/竖版 golden、
> 场景色与边界取证、规则差异表、逐字段 fixture 和证据清单。<br>
> **阶段纪律：** 文档完成不等于阶段完成；未实际运行的命令、未实际生成的截图和未核验的 hash
> 不得登记为通过。源码行号仅是建档快照，复核时按符号重新定位。

---

## 1. 目标与阶段边界

S0 先建立一个任何实现者都能重复核验的复刻基线，再允许后续阶段改代码或接素材。目标是把“像原作”拆成
可比较的坐标、配置、来源、截图和规则差异，防止 S1/S2 在不同理解上并行实现。

本阶段必须完成：

- 固定原作归档、配置对象和源码消费路径，记录内容 hash 或等价的不可歧义身份。
- 从锁定的原作源码、场景序列化数据和素材确定性重建横版战场 golden。
- 按正交旋转生成竖版世界层参照，并单独产出竖屏 UI 标注稿。
- 从场景序列化数据提取背景、网格、地图外背景、边界和透明度，不凭肉眼估色。
- 固化 V2、`totalTime=0`、复活来源、金币样例和 drop-in 联机适配五层配置及组合 hash。
- 用 fixture 逐字段验证 V2 对象、71 项 `point_step_config` 和 Endless 的真实消费路径。
- 对当前实现与目标口径形成逐项差异表，并固化已拍板、不能由 V2 配置直接推导的规则。

### 1.1 非目标

- 不在 S0 实现 4096² 世界、17 条活动蛇、1030 个食物、相机缩放或新 wire；这些属于 S2。
- 不在 S0 复制剩余皮肤、生成最终 catalog 或接入渲染；这些属于 S1/S2。
- 不在 S0 实现复活扣费、持久 run 或奖励；这些属于 S2R/S4。
- 不把原作横版 UI 整图旋转成目标 UI；世界证据旋转，HUD 和操作区按竖屏另行设计。
- 不把 Classic 静态默认、本地调试模板、TimeLimit 模式或线上动态 AB 混进所选配置。
- 不把源工程的私有 socket/protobuf、支付、广告、分享、月卡或平台运行时带入本仓。
- 不把来源驱动的静态重建图表述为未经修改的原作运行截图；未来若取得可运行原作，实机截图只作补充
  对照，不阻塞 S0 退出。
- 不因源文件存在于同一台机器就推断授权；素材授权与逐文件台账由 S1 继续闭环。

---

## 2. 冻结口径

来源归档自身明确缺少微信运行时和 4 个平台插件，是静态可读档案而不是可运行工程。因此 S0 的
“原作横版 golden”统一解释为 `sourceDerivedStaticReconstruction`：从锁定源码、场景序列化数据和原素材
构建的确定性离线参照。每张图必须携带该证据类型、来源 commit、所读文件 hash、重建器版本、配置 hash、
seed 和 fixture；不得省略限定词后声称它是原作实际运行截图，也不得用它证明微信插件、原引擎运行时或
设备渲染行为。

来源 Git 身份冻结为 commit `6367f65bf210d75ba39c0e48ecace5b30b538a06`。实施时仍须为本阶段实际读取的
配置、源码、序列化场景和素材生成路径 + SHA-256 清单。参考目录按流程只读，解析、生成和重放只允许发生
在临时输出目录或临时副本中，不修改来源仓权限和内容。

### 2.1 唯一目标组合

首发唯一目标组合为：

```text
newEndlessPortraitV2Map4096TotalTime0
```

它表示：原作新版无尽 V2 战场层，只把地图边界由 `4896 × 4896` 覆盖为 `4096 × 4096`；保留
1000 Dot + 30 Star、出生长度 80、相机 `1.3 → 0.6 @ 100000`、蛇身
`1.0 → 2.8 @ 100000` 和 K1 level 0 的 16 条 AI；生命周期采用原作 Endless 的
`totalTime=0`，再叠加本项目最多 8 真人、首人开局、Playing 可入和个人 run 结算。

经典静态默认仅作为历史差异证据，不是 fallback；运行时不得跟随原服 AB 漂移。

### 2.2 坐标、地图覆盖与视口

世界证据只作 90° 正交旋转，不拉伸：

```text
source (x, y) -> portrait (-y, x)

source V2 world:          4896 × 4896
rotated evidence world:   4896 × 4896
target portrait bounds:   4096 × 4096

source design viewport:   1624 × 750
portrait design viewport:  750 × 1624
```

冻结规则：

- 旋转保持距离、角度、格距、食物尺寸、蛇身宽度和碰撞比例。
- `4096 / 4896` 不是全局缩放系数；目标世界在以原点为中心的 4096² 边界内重新生成实体。
- 目标网格仍是 32 世界单位，地图边距是 16 世界单位。
- 原作外围每边超出目标的 400 世界单位不参与目标重合区域的像素叠图；边界另用 fixture 验证。
- 场景方向随坐标旋转；蛇头、食物、文字、HUD 和操作区不能作为一张截图整体旋转。
- 目标设计视口为 `750 × 1624`。不同屏幕只调整安全区和 UI 密度，不改变世界单位。
- 横版静态重建和竖版参照都固定使用来源 fresh-install 的浅色主题 `blackBackground=0`；暗色主题只作为
  presentation 基线的另一套精确来源值。

当前代码仍是经典默认世界的竖版转置 `1920 × 3264`，证据入口为
[ruleset.ts](../../apps/shared/src/gameplays/snake/ruleset.ts#L19)。

### 2.3 V2 战场配置快照

来源对象是
`/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/store/FeedGameStore.js:100`
中的 `single_game_config.new_endless_config_abtest`。原客户端在
`ConfigStore.setConfigs/getNewEndlessConfig` 中消费服务端已经选择的对象，本地不再二次选择 AB。

S0 必须保存原值 `newEndlessV2Source4896`，并仅覆盖地图字段形成
`newEndlessPortraitV2Map4096`：

| V2 字段 | 原作归档值 | 项目目标值 | 冻结解释 |
|---|---:|---:|---|
| `map_width / map_height` | `4896 / 4896` | `4096 / 4096` | 用户拍板的唯一 V2 数值覆盖，不是旋转或缩放结果 |
| `endless_dot_count / endless_star_count` | `1000 / 30` | `1000 / 30` | 常驻食物总量 1030 |
| `endless_snake_min_length` | `80` | `80` | 真人与 AI 基础出生长度 |
| `endless_snake_max_length` | `100000` | `100000` | V2 配置上限 |
| `camera_init_scale / camera_min_scale` | `1.3 / 0.6` | `1.3 / 0.6` | 按权威长度线性缩放 |
| `camera_scale_snake_max_length` | `100000` | `100000` | 相机缩放封顶长度 |
| `snake_body_init_scale / snake_body_max_scale` | `1.0 / 2.8` | `1.0 / 2.8` | 全局身体缩放，不因皮肤改变 |
| `body_scale_snake_max_length` | `100000` | `100000` | 身体缩放封顶长度 |
| K1 level 0 AI | `401×8, 402×4, 403×2, 404×2` | 同源值 | 原作单人场内 16 条活动 AI |
| `fake_snake_count` | `86` | `86` | 仅假榜池，不生成场内实体、不参与奖励 |
| 假榜初始/增长/重置 | `100..50000 / 10..100 / 0.02` | 同源值 | 每次刷新增长；2% 时重置到出生长度 80 |
| `endless_wreck_score_rate_a / b` | `0.8 / 2` | `0.8 / 2` | AI 死亡残骸总分公式的指数与倍率 |
| `point_step_config` | 71 项有序分段表 | 同源表 | 完整镜像；`*_max_point_step=1240` 不当作已消费规则 |

地图面积缩小但保留 1030 个食物，会使单位面积密度约为原 V2 的 1.43 倍。这是已拍板覆盖的直接结果，
不得自动把食物数量按面积降到约 721；未来若调整数量，必须建立新的命名配置版本。

### 2.4 路径点配置与边界向量

`point_step_config` 必须逐项保留原作 71 项顺序，可由下列无损定义生成后与源数组比较：

```text
n = 1..63: { max_length: 300*n, step_length: n+2 }
重复端点:  { max_length: 18900, step_length: 66 }
n = 64..67: { max_length: 300*n, step_length: n+3 }
尾部:      {100000,50}, {200000,100}, {300000,100}
```

原作按各段覆盖长度除以 `step_length` 累加，向下取整后乘 `STEP_POINT_COUNT=2`。重复的
`{18900,66}` 是零宽区间，必须保留但不改变结果。V2 最大长度为 100000，后两项只作尾部兼容。

必须冻结以下边界向量：

| 蛇长度 | 逻辑路径点数 |
|---:|---:|
| 80 | 52 |
| 300 | 200 |
| 3000 | 960 |
| 18900 | 1954 |
| 19200 | 1964 |
| 20100 | 1990 |
| 100000 | 5186 |

归档中的三个 `*_max_point_step=1240` 在已还原消费路径中未被读取，只作为源元数据记录，不能误写成
路径点上限或长度上限。

### 2.5 五层可审计配置

| 配置层 | 来源 | 冻结口径 |
|---|---|---|
| `newEndlessPortraitV2Map4096` | 原作新版无尽 + 用户地图覆盖 | 除地图改为 4096² 外，沿用 V2 食物、蛇身、相机、AI、假榜及对应表现 |
| `sourceEndlessTotalTime0` | 原作 `gameModeEndless` | `totalTime=0`、无剩余时间 HUD、无整局到点、无终局末段禁复活 |
| `sourceEndlessReliveFlow` | 原作 Endless 代码路径 | 合资格真人死亡约 200ms 后进入选择；成功恢复明确累计字段并有默认 3 秒保护；拒绝/超时结束原作本局，本项目映射为个人 run 终局 |
| `onlineCoinRelive5V1` | Feed 内置 B 表样例 + 本项目渠道裁剪 | 五档金币 `100/200/300/300/300`、固定 5 秒；不声称是线上 V2 恒定默认，也不运行 8/10 秒 AB |
| `onlineEndlessDropInV2` | 本项目联机约束 | 首人启动、3 秒准备、最多 8 真人、稳定态 17 条活动蛇、Playing 可加入、复活只暂停本人、个人 run 独立结算、空房回收 |

五层分别计算稳定 hash，再计算组合 hash。任一层变化都必须产生可解释的版本变更；不能静默回退到
Classic、TimeLimit 或真人自动复活。

### 2.6 `totalTime=0` 的来源与目标语义

原作证据必须同时证明：

- 默认入口把 Endless 路由到旧 `Game` 场景，模式 switch 对 Endless 写 `totalTime=0`。
- `isNewEndless` 随后覆盖 V2 地图、食物、相机等配置；新版无尽不等于独立 TimeLimit。
- `GameStore.isNewEndless()` 组合 Endless/UGC 等模式与 `endless_snake_min_length > 0`，明确不含
  `gameModeTimeLimit`。
- `totalTime=0` 时仍正向累计 `gameTime`；只有 `totalTime > 0` 才显示剩余时间并触发 `timeIsOver`。

目标联机语义冻结为：

1. 3 秒仅是首次建世界后的操作准备，不是局长倒计时。
2. Playing 下发 `totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false`，`endTick` 为缺省或 `null`；
   数字 0 不能进入现有 `tick >= endTick` 比较。
3. 世界只允许在 `hasDeadline && tick >= endTick` 时因时间返回 done。本配置在第 1800、1801 tick 及之后
   继续推进，mode 不因 `matchTicks` 调用整房 `context.settle()`。
4. 客户端不显示剩余时间或 `0:00`。若未来显示 run 游玩时长，只能从权威 `runStartedTick` 正向推导，
   且不作为结束条件。
5. 房级无 deadline 不影响个人复活选择的 100 tick deadline；两种字段必须分型。
6. 某个真人死亡、放弃或离开只结束其个人 run；其他真人和 world tick 继续。
7. 最后一名真人完成 run 冻结并离开后，由 Colyseus `autoDispose` 触发 mode `onDispose` 停止世界；
   AI 和假榜不能单独维持房间存活。
8. 部署或运维退役走内部 `Active → Draining`，先停新准入并在有界期限内冻结活跃 run，再关闭连接；
   协议单调字段接近安全上界也只能进入 Draining，不能伪装成日常限时局。

### 2.7 真人复活来源与联机裁剪

原作把顶层 `endless_config` 交给 `ReliveStore`；不可付费 Endless 基础档读取 `relive_config_b`，可付费
Endless 读取 `relive_config`。两者与 `single_game_config.new_endless_config_abtest` 的 V2 战场对象分别注入，
不得误读为一个配置对象。

关键来源：

- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/utils/GameEntryUtil.js:107-116`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/store/ConfigStore.js:65-68`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/prefab/game/relive/ReliveStore.js:21-41`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/prefab/game/relive/ReliveAlert.js:69,380-401`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/store/GameStore.js:174-176`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/scene/Game.js:349-385`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/game/snake/SnakeManager.js:165-181`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/game/snake/Snake.js:79-81,92-96`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/Loading.js:232-236`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/api/AppApi.js:53`
- `/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/store/FeedGameStore.js:56-74,100`

Feed 快捷模式内置 B 表冻结为项目的 `onlineCoinRelive5V1`：

| 第几次成功复活 | 来源 `coin_relive` | 来源 `ad_card` | 首发按钮 |
|---:|---:|---:|---|
| 1 | 100 | 1 | `100 金币复活` |
| 2 | 200 | 1 | `200 金币复活` |
| 3 | 300 | 2 | `300 金币复活` |
| 4 | 300 | 3 | `300 金币复活` |
| 5 | 300 | 4 | `300 金币复活` |

`ad_card` 只保留为来源证据，不进入首发扣费。原作选择窗默认 5 秒，AB 可为 8/10 秒；仓内没有普通线上
响应快照，因此项目明确选择固定 `5 秒 = 100 tick @ 20 Hz`。第五次成功后再次死亡不弹窗；广告、分享、
广告券、钻石、月卡追加次数和新手免费复活全部不在首发范围。

目标差异必须写清：真人不再与 AI 共用约 40 tick 自动重生。合资格真人死亡约 4 tick 后进入服务端权威
复活选择，成功才延续相同 run；放弃、超时、档位用尽、强制或逃跑结束个人 run。AI 仍独立在约 40 tick
后重生。真人死亡不产生可拾取计分残骸；AI 残骸公式冻结为：

```text
totalDeathWreckScore = pow(deadSnakeScore, 0.8) * 2
perWreckScore = max(totalDeathWreckScore / bodyCount, 3)
```

成功复活应恢复长度、分数、击杀、磁铁/星星累计等明确字段，清除单生命瞬态，并获得 60 tick（3 秒）
碰撞保护。保护区间冻结为半开区间
`[protectStartTick, protectUntilTick)`，其中 `protectStartTick=reliveFirstActiveTick`、
`protectUntilTick=protectStartTick+60`；activation gate 的 provisional Active step 是第 1 个保护 tick。
S0 只冻结来源与目标差异，状态机和可靠扣费分别在 S2、S2R 实现。

### 2.8 当前实现差距基线

| 维度 | 当前事实 | 目标事实 | 证据入口 |
|---|---|---|---|
| gameplay/profile | `snake@1`、最多 8 真人、`dropIn` | 保持真人上限与 drop-in，升级目标 wire/config | [manifest.json](../../apps/shared/schema/gameplays/snake/manifest.json#L1) |
| 世界与食物 | `1920×3264`、300 Dot + 15 Star、出生长度 30、8 条活动蛇 | `4096²`、1000 + 30、出生长度 80、稳定态 17 条活动蛇 | [ruleset.ts](../../apps/shared/src/gameplays/snake/ruleset.ts#L19) |
| validator | 最多 8 蛇、315 食物、每蛇 512 路径点 | 17 蛇、1030 常驻食物、单蛇 5186 路径点 | [ruleset.ts](../../apps/shared/src/gameplays/snake/ruleset.ts#L88) |
| wire 外观 | `skin=0..15`、食物仅 `kind=0/1` | 稳定内容 ID、食物 `variant`、残骸类型/必要来源 | [wire.ts](../../apps/shared/src/gameplays/snake/wire.ts#L37) |
| 服务端分配 | 真人 `joinOrdinal % 8`，AI 固定 `skin=15` | 服务端权威装备与独立 AI 皮肤池 | [world.ts](../../apps/server/src/rooms/modes/snake/world.ts#L182) |
| 生命周期 | `matchTicks=1800`、房级 `endTick`、到点 `context.settle()` | `totalTime=0`、无房级 deadline、个人 run 结算 | 当前 Snake world/mode，实施时按符号复核 |
| 复活 | 真人与 AI 共用 `pendingRespawns`，约 40 tick 自动重生 | 真人权威选择；AI 独立重生 | 当前 Snake world/mode，实施时按符号复核 |
| 视觉 | View 内硬编码背景、格距 100、Graphics 食物 | presentation catalog、格距 32、atlas 批渲染 | [SnakeWorldView.ts](../../apps/client/src/view/rooms/snake/SnakeWorldView.ts#L37) |
| 皮肤渲染 | 头部 `skin % 3`，身体按实体 id 哈希，真人 tint、AI 灰化 | 同一 `skinId` 决定头身尾，默认白 tint，以非颜色方式识别身份 | [SnakeMeshRenderer.ts](../../apps/client/src/view/rooms/snake/SnakeMeshRenderer.ts#L107) |
| 相机 | 只平移并在地图内钳位 | 随长度 `1.3→0.6`，蛇头居中，边界外仍显示背景 | [SnakeWorldView.ts](../../apps/client/src/view/rooms/snake/SnakeWorldView.ts#L331) |
| 素材 | 首批资源已引入但多数未接线 | S1 完成 16 皮肤及表现目录 | [来源台账](../snakeoff/08-source-and-asset-provenance.md#7-直接素材复用登记模板) |

### 2.9 S0 已拍板的非 V2 直接配置规则

V2 没有给出一套可直接覆盖本项目 fixed-step 联机规则的完整配置。用户于 2026-09-03 批准以下首发值；
其中“项目适配”不得被表述为原作事实：

| 项目 | 当前实现 | 原作静态参考 | 首发目标 | 决策性质与理由 |
|---|---:|---:|---:|---|
| Star 长度/分值 | `5 / 5` | `10 / 10` | `10 / 10` | 采用来源明确、无需单位换算的值 |
| 基础速度 | `160 unit/s` | `4.5 unit/frame` | `160 unit/s` | 保持联机适配；不把逐帧位移静默换算为服务端速度 |
| 加速倍率 | `1.6` | `2` | `2` | 倍率无单位，可直接采用来源比例；客户端与服务端必须共用 shared 值 |
| 最大转向 | `9°/tick @ 20 Hz` | `10°/frame`，无 fixed-step V2 等价值 | `9°/tick @ 20 Hz` | 保持已收敛的联机转向，不做逐帧角速度换算 |
| 首次出生保护 | `30 tick`，从实体创建 tick 起算 | 无可直接覆盖的 fixed-step 值 | `30 个活动 tick` | 项目适配；从该蛇 `firstActiveTick` 起算，3 秒准备期不消耗 |
| 真人成功复活保护 | 当前与出生保护共用 `30 tick` | 3 秒 | `60 tick @ 20 Hz` | 采用已冻结的来源时长，并与首次出生保护分开建模 |

来源启动配置在 `game/main.js` 写 `frameRate: 60`，加载流程又通过平台 API 请求 `setFrameRate(59)`；该差异与
逐帧移动模型共同说明，不能把 `4.5 unit/frame` 当作唯一稳定时基换算到服务端 20 Hz。首发目标因此明确保留
`160 unit/s`，而不是选择 265.5 或 270 的隐式近似。

首发测试向量冻结为：

- Star 被拾取一次后，长度和分值分别精确增加 10。
- 普通移动每 tick 位移 `160 / 20 = 8 unit`；加速移动每 tick 位移 `8 × 2 = 16 unit`。
- 目标方向差大于 9° 时单 tick 最多转 9°；不超过 9° 时精确到达目标方向，并覆盖跨 `0°/360°` 最短弧。
- 每条新建蛇第一次进入正常世界步进的 Active tick 记为 `firstActiveTick`。首次出生保护区间为
  `[firstActiveTick, firstActiveTick + 30)`；`start`、`start+29` 受保护，`start+30` 不受保护。
- 真人成功复活保护区间为 `[reliveFirstActiveTick, reliveFirstActiveTick + 60)`；provisional Active step
  是 `start`，`start`、`start+59` 受保护，`start+60` 不受保护。
- 两种保护都只屏蔽蛇间碰撞的造成与承受，墙体仍可致死；首次出生与真人复活不得复用同一个含糊时长字段。

回退必须通过显式 ruleset 版本完成，不能对单个常量热改。若 S2 验证失败，回退基线为当前实现的
Star `5/5`、基础速度 `160`、加速 `1.6`、转向 `9°/tick` 和从实体创建 tick 起算的 30 tick 保护；
复活功能发布开关保持关闭。S0 只形成批准结果和测试设计，不把以上目标值伪装成已实现；实际 shared 真源、
服务端、客户端和版本说明变更属于 S2/S2R。

---

## 3. 详细任务

### S0-01 · 锁定来源归档与证据身份

**动作**

- [ ] 校验参考仓仍位于 commit `6367f65bf210d75ba39c0e48ecace5b30b538a06`，并生成覆盖本阶段已读取配置、
  源码、场景序列化文件和素材的路径 + SHA-256 清单。
- [ ] 确认参考根目录按流程只读；所有解析、生成和重放只写入临时输出目录或临时副本，不对原目录执行
  `chmod` 或内容修改。
- [ ] hash 清单对普通文件记录原始字节 SHA-256；对符号链接同时记录链接路径、链接目标字符串和解析后目标
  文件的 SHA-256，避免复制方式改变证据身份。
- [ ] 逐项登记 §2.3、§2.6、§2.7 使用的源文件、符号、读取目的和源值；不能只登记行号。
- [ ] 标明哪些事实来自原作、哪些来自用户地图覆盖、哪些是本项目联机适配。
- [ ] 确认目标仓不存在运行时 import、软链接、package dependency 或 URL 指向参考根目录。

**产物**

- 固定的来源身份清单、配置/源码证据索引和三类来源标记。
- 可供评审复算的 SHA-256 输出或等价不可变版本证据。

**验证**

- 在同一归档重复生成清单，输出必须字节一致。
- 随机抽查至少一个 V2 字段、一个 Endless 分支、一个复活字段和一个场景字段，均能从索引定位到源符号。
- 全仓搜索确认参考绝对路径只出现在文档、测试证据或显式开发脚本参数中，不成为运行时依赖。

### S0-02 · 生成来源驱动的横版静态重建 golden

**动作**

- [ ] 使用锁定的原作源码、场景序列化数据和素材建立确定性离线重建器；不得依赖微信运行时、线上账号、
  私有插件或未登记的手工图层。
- [ ] 固定 V2 对象、随机种子、实体 fixture、`1624 × 750` 设计视口、浅色主题
  `blackBackground=0`、相机长度档位和截图时刻。
- [ ] 至少留存出生态、普通游玩态、长蛇缩放态、边界态、Star/残骸态和 AI 多皮肤态。
- [ ] 截图旁记录 `evidenceKind=sourceDerivedStaticReconstruction`、来源 commit/文件 hash、重建器版本、配置
  hash、种子、实体坐标/长度、相机参数和获取步骤。

**产物**

- 来源驱动静态重建的横版 golden 集及其机器可读/可人工复现的元数据。
- 每张图与命名配置、种子、视口和状态的一一映射。

**验证**

- 从干净临时输出目录按记录重跑，核心截图字节、尺寸、配置 hash 和 fixture 状态一致。
- 截图中确认来源网格、背景、边界、七色 Dot、Star、AI 原色皮肤均可识别，且各视觉值能回指源码、
  序列化字段或原素材。
- 不把调试模板或 Classic 画面误标为 V2。
- 元数据和文件名均不得将静态重建图误标为原作实际运行截图。

### S0-03 · 生成竖版世界参照与 UI 标注稿

**动作**

- [ ] 对 S0-02 静态重建 fixture 的世界实体按 `(x,y) -> (-y,x)` 转换，以 `750 × 1624` 目标视口生成参照。
- [ ] 目标 4096² 只裁定新边界和重新生成范围，不对 4896² 源世界应用 `4096/4896` 缩放。
- [ ] 单独制作 UI 标注稿，注明 Safe Area、可见尺寸、命中半径、左右手镜像和世界/HUD 分层。
- [ ] 对落在目标边界内的固定实体保留源/目标坐标对照；对外围 400 单位建立独立边界 fixture。

**产物**

- 从横版静态重建 fixture 派生的竖版世界层 golden、源/目标坐标对照和边界裁定图。
- 不与世界相机缩放绑定的 UI 标注稿，供 S2 操作布局实现使用。

**验证**

- 目标边界内固定实体以 1:1 世界单位叠图后位置、距离和角度一致。
- 自动或人工检查确认没有非等比拉伸，没有把整张 HUD/文字旋转。
- 4096² 边界 fixture 与 4896² 来源证据分别保存，二者不会被同一个尺寸字段覆盖。
- 竖版图继承横版图的 `sourceDerivedStaticReconstruction` 证据类型，并额外记录正交转换和边界覆盖版本。

### S0-04 · 提取场景颜色、网格与边界事实

**动作**

- [ ] 从原作 Game 场景序列化组件提取明/暗地图色、网格色、地图外背景色、边界色及透明度。
- [ ] 记录主题选择入口、纹理/墙块逻辑名、平铺或线框规则；默认主题固定为来源 fresh-install 的
  `blackBackground=0` 浅色地图，暗色值仍完整进入 presentation 基线。
- [ ] 区分视觉网格 `32`、地图边距 `16` 与服务端 broadphase `GRID_CELL=150`，后者不是视觉规格。
- [ ] 将颜色记录为精确通道值和色彩空间/透明度，不用截图吸管近似替代源码证据。

**产物**

- 场景 presentation 基线表和已冻结默认主题记录。
- S1 背景/边界 catalog 的输入清单及 S2 world golden 的比较参数。

**验证**

- 每个值都可反向定位到场景序列化字段或明确的主题资源。
- 在浅色默认主题下重建最小背景图，与静态重建 golden 的采样区域一致；允许记录渲染色彩空间造成的
  已解释差异。
- 断言视觉格距修改不会误改碰撞 broadphase。

### S0-05 · 冻结 V2 配置、路径表与 hash

**动作**

- [ ] 保存不改写的 `newEndlessV2Source4896`，再通过单一、显式的地图覆盖生成
  `newEndlessPortraitV2Map4096`。
- [ ] 对 §2.3 每个字段建立来源值、目标值、覆盖原因和类型校验。
- [ ] 完整镜像 71 项 `point_step_config`，保留重复端点和尾部兼容项。
- [ ] 分别计算源快照、地图覆盖层、路径表和组合结果的稳定 hash。

**产物**

- 可序列化的 V2 来源快照、目标战场配置、逐字段差异和稳定 hash。
- 71 项路径表 fixture 及 §2.4 七个边界向量。

**验证**

- 目标与来源对象的结构化 diff 只能包含 `map_width/map_height: 4896 -> 4096` 及显式元数据。
- 两次从同一来源生成的规范化序列化与 hash 字节一致。
- 逐项断言 71 项顺序、重复 `{18900,66}`、七个路径点向量和最大长度 100000。
- 断言常驻食物仍为 1030，并把约 1.43 倍密度记录为已知结果。

### S0-06 · 证明并冻结 `totalTime=0` 消费路径

**动作**

- [ ] 沿入口、mode switch、`isNewEndless`、HUD 和 `timeIsOver` 路径记录控制流证据。
- [ ] 建立 Endless 与 TimeLimit 对照，证明 V2 战场配置与局长模式是正交选择。
- [ ] 在目标差异表中明确 `hasDeadline/endTick/context.settle()`、1800/1801 tick、HUD 和正向 world tick 行为。
- [ ] 单独记录个人复活 deadline 与房级 deadline 的分型要求。

**产物**

- `sourceEndlessTotalTime0` 证据层、控制流图或等价表格、目标联机语义 fixture 设计。
- Classic、TimeLimit 和当前 90 秒实现的禁止 fallback 清单。

**验证**

- 源证据可重复证明 `totalTime=0` 仍累计 `gameTime` 且不触发时间结束。
- 目标 fixture 明确断言第 1800、1801 tick 继续推进、无 `0:00`、无整房 settle。
- 目标 fixture 同时断言 100 tick 个人选择仍会超时，避免把 0 传播成所有 deadline 失效。

### S0-07 · 冻结真人复活、AI 重生与联机适配差异

**动作**

- [ ] 还原顶层 `endless_config` 到 `ReliveStore` 的路由，分开记录 B 表样例和 V2 战场对象。
- [ ] 固定 `100/200/300/300/300`、5 秒、最多五次成功复活和真人成功复活后 3 秒保护；把 `ad_card`
  标为仅来源证据。
- [ ] 对普通真人、无资格/第六次死亡、AI 死亡、放弃、超时、强制/逃跑分别形成源行为和项目目标对照。
- [ ] 明确真人无计分残骸、AI 约 40 tick 重生和 AI 残骸公式；明确单人暂停不能冻结联机世界。

**产物**

- `sourceEndlessReliveFlow`、`onlineCoinRelive5V1`、`onlineEndlessDropInV2` 三层冻结资料。
- 死亡/复活差异矩阵和 S2/S2R 可直接消费的状态/时序向量。

**验证**

- 每项源结论可定位到 §2.7 的文件与符号；Feed B 表不会被描述成普通线上 V2 恒定默认。
- 对照表中真人与 AI 没有共享“2 秒自动复活”目标分支。
- 复活成功次数而非死亡次数决定费用档位；第五次成功后再死不出现第六档。
- AI 残骸公式只标为场内分值，不进入真人资产奖励。

### S0-08 · 建立当前仓库差异清单

**动作**

- [ ] 按 §2.8 的证据入口重新定位当前符号，记录实际类型、上限、默认值和调用者。
- [ ] 覆盖 shared/schema、server world/mode、client Logic/View、资源和测试，不只比较画面。
- [ ] 为每条差异指定归属阶段、预期真源、生成/同步边界和最小验证。
- [ ] 标出不得手改的 generated/shared/client/Cocos 镜像。

**产物**

- 可排序的差异清单，至少包含“当前、目标、证据、阶段、真源、验证、状态”。
- S1、S2、S2R、S3、S4 的输入清单；无归属差异视为 S0 未完成。

**验证**

- 从差异清单能追踪所有 §2.8 项，不以“后续再看”代替归属。
- `maxPlayers=8` 明确只是真人上限，不再被当作场内实体总量。
- 资源/视觉、生命周期、复活、wire 容量和持久化差异均有后续阶段接收者。

### S0-09 · 固化非 V2 直接配置规则

**动作**

- [ ] 将 §2.9 的 Star `10/10`、基础速度 `160 unit/s`、加速 `2`、转向 `9°/tick`、首次出生保护
  `30 个活动 tick` 和真人复活保护 `60 tick` 写入版本化差异表，并登记 2026-09-03 用户批准来源。
- [ ] 分别标记“采用来源”与“项目适配”，记录玩法影响和显式回退 ruleset；不得把基础速度或转向描述为
  从原作逐帧值精确换算所得。
- [ ] 将首次出生保护起点定义为该蛇 `firstActiveTick`，将真人复活保护起点定义为
  `reliveFirstActiveTick`；两者都使用半开区间且不被准备期/提交等待期消耗。
- [ ] 为所有批准值定义 shared/server/client 一致性与 §2.9 的确定性测试向量。

**产物**

- 无“待确认”的 `snake-ruleset` 差异表版本及批准记录。
- 后续实现需要更新的真源、测试和版本说明清单。

**验证**

- §2.9 每一行都有唯一结论、负责人/批准来源和测试入口。
- 基础速度和转向明确保留项目联机值，不执行 `unit/frame` 到 fixed-step 的换算；位移测试只从批准的
  `unit/s` 与 20 Hz 推导。
- 首次出生保护覆盖 `start/start+29/until`，复活保护覆盖 `start/start+59/until`；两者分别建模，墙体致死
  语义保持不变。

### S0-10 · 封装可复现证据并完成阶段交接

**动作**

- [ ] 汇总五层配置、组合 hash、来源驱动静态重建 golden、调色板、差异表、规则拍板和 fixture 结果。
- [ ] 从干净临时输出目录重跑所有生成/取证步骤，禁止依赖未登记的手工中间文件。
- [ ] 在本页证据表回写真正的 commit、命令结果、截图/日志路径和未完成项。
- [ ] 将全仓当前真相摘要回写到 [plan-v5.md](../../plan-v5.md)，但不得把 S1/S2 未实施内容写成完成。

**产物**

- 可交给 S1/S2 的 S0 evidence bundle 与最终评审记录。
- 配置来源、`totalTime=0` 和静态重建截图均能独立重复核验的阶段结论。

**验证**

- 另一名开发者只依据证据说明即可复现配置 hash 和核心静态重建截图。
- 所有文件路径存在、所有 hash 可复算、所有通过项有原始输出。
- 五层 hash、组合 hash、静态重建 golden 元数据与差异表引用同一配置身份。

---

## 4. 退出条件

以下条件必须全部满足，S0 才能标记为 `[已完成]`：

- [ ] 原作归档 HEAD 为 `6367f65bf210d75ba39c0e48ecace5b30b538a06`，所有已读取文件及符号链接有
  可复算 hash，取证过程未修改参考目录，且目标仓没有对其形成运行时依赖。
- [ ] 来源驱动静态重建的横版 golden、竖版世界参照、UI 标注稿和边界 fixture 可重复生成；元数据明确
  `sourceDerivedStaticReconstruction`，没有冒充原作实际运行截图。
- [ ] 世界转换严格为正交旋转；目标 4096² 是独立边界覆盖，没有 `4096/4896` 全局缩放。
- [ ] 场景背景、网格、地图外背景、边界色和透明度均来自序列化事实，不是视觉近似。
- [ ] `newEndlessV2Source4896`、`newEndlessPortraitV2Map4096`、`sourceEndlessTotalTime0`、
  `sourceEndlessReliveFlow`、`onlineCoinRelive5V1`、`onlineEndlessDropInV2` 及组合 hash 已冻结。
- [ ] V2 逐字段 fixture、71 项路径表和七个路径点边界向量全部通过。
- [ ] 已证明 `totalTime=0` 属于 Endless，不是 TimeLimit；1800/1801 tick、HUD 和个人 deadline 的目标断言完整。
- [ ] 真人复活、AI 重生、残骸、个人 run 与联机继续运行的差异矩阵没有含糊项。
- [ ] Star `10/10`、基础速度 `160 unit/s`、加速倍率 `2`、转向 `9°/tick`、首次出生保护
  `[firstActiveTick, firstActiveTick+30)` 和真人复活保护
  `[reliveFirstActiveTick, reliveFirstActiveTick+60)` 均进入版本化差异表并有 §2.9 测试向量。
- [ ] 当前实现差异全部分配给明确阶段和真源，没有把候选或文档落盘写成已实现。
- [ ] 证据表已回写真正 commit、命令、截图/日志路径；未运行项仍保持未通过。

---

## 5. 风险与回退

| 风险 | 影响 | 预防/回退 |
|---|---|---|
| 混用 Classic、调试模板与 V2 快照 | 无法定义“一致”，后续截图和数值互相冲突 | 五层配置独立命名与 hash；检测到来源不明时停止阶段，不选“看起来接近”的值 |
| 把 4896² 直接写成目标或把它缩放到 4096² | 来源/目标身份混淆，世界比例失真 | 保留源快照；地图覆盖只有两个字段；发现额外 diff 时回退生成结果并调查 |
| 把 1030 食物按面积缩到约 721 | 偏离用户拍板配置 | fixture 固定 1000 + 30；任何数量变更另建配置版本 |
| 把 `totalTime=0` 当作停止时钟或 `endTick=0` | 首 tick 收局、HUD `0:00` 或个人 deadline 永久悬挂 | 房级 deadline 显式分型；1800/1801 tick 与个人 100 tick 同时守门 |
| 把 Feed B 表写成线上恒定默认 | 来源陈述失真，未来无法解释渠道差异 | 名称固定为 `onlineCoinRelive5V1` 项目裁剪；保留“缺普通线上响应快照”说明 |
| 真人继续复用 AI 自动重生 | 无法形成个人 run 终局 | 差异矩阵明确拆分；S2 未删除真人路径前发布开关保持关闭 |
| 源行号漂移 | 复核者定位到错误实现 | hash 锁文件，证据同时记录符号/调用路径；复核按符号而非旧行号 |
| 把静态重建图写成原作运行截图 | 证据等级失真，评审无法判断环境差异 | 强制 `sourceDerivedStaticReconstruction` 元数据与文件命名；未来实机图只作单独补充证据 |
| 截图不可复现 | 像素差异无法归因 | 每图绑定来源 commit/hash、重建器版本、视口、主题、种子、配置 hash、相机和实体 fixture；缺任一字段即重做 |
| 从实体创建 tick 起算首次保护 | 3 秒准备期会提前消耗甚至用完 30 tick 保护 | 只从 `firstActiveTick` 起算；固定 `start/start+29/until` 半开边界测试 |
| 已拍板规则未落入版本化差异表或被实现者改写 | S2 出现隐性产品决定 | S0-09 未闭合则不得进入相关实现；任何变更须新建 ruleset 版本并重新批准 |

---

## 6. 证据回写

状态只允许：`[已拍板·待实施]`、`[进行中]`、`[已完成]`、`[阻塞·需 Creator]`、`[有意不做]`。

| 任务 | 状态 | commit | 自动验证/命令 | 截图、hash 或其他证据 | 备注 |
|---|---|---|---|---|---|
| S0-01 | [已拍板·待实施] | — | — | — | — |
| S0-02 | [已拍板·待实施] | — | — | — | 来源驱动静态重建，非原作运行截图 |
| S0-03 | [已拍板·待实施] | — | — | — | — |
| S0-04 | [已拍板·待实施] | — | — | — | — |
| S0-05 | [已拍板·待实施] | — | — | — | — |
| S0-06 | [已拍板·待实施] | — | — | — | — |
| S0-07 | [已拍板·待实施] | — | — | — | — |
| S0-08 | [已拍板·待实施] | — | — | — | — |
| S0-09 | [已拍板·待实施] | — | — | — | `10/10 · 160 · 2 · 9°/tick · 30/60 tick` 已批准，待证据落盘 |
| S0-10 | [已拍板·待实施] | — | — | — | — |

阶段汇总：

| 阶段 | 状态 | commit | 自动验证 | Creator/视觉证据 | 备注 |
|---|---|---|---|---|---|
| S0 | [已拍板·待实施] | — | — | — | — |

---

> [返回专项总目录](README.md) · [下一阶段：S1 素材与目录](s1-assets-and-catalog.md)
