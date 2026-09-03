# S5：全链路验收、Creator 证据与内部 RC

[← S4 · 可靠养成奖励](s4-reliable-progression-rewards.md) · [专项索引](README.md)

> **状态：`[已拍板·待实施]`**
>
> **预计：2–3 人日**
>
> **依赖：进入 S5 前，S0～S4 的自动化、真栈和非 Creator 退出条件必须全部满足；前序阶段明确移交的 Creator-only 用例可在 S5 收口，除此之外不得留缺口。**

## 1. 目标与非目标

本阶段冻结一个可追溯的**内部开发候选（RC）**，执行自动测试、本地真 Redis/MySQL 故障矩阵、Creator
3.8.8 预览验证、长驻房运维演练和兼容/回滚检查，随后回写证据。RC 结论必须能从命令输出、fixture、
receipt/ledger、截图和 commit 复现，不能以“文档已完成”替代实现证据。

S5 不包含生产部署、玩家灰度、渠道打包、审核、合规、商店发行或线上值守，也不建设 V2 准入、可靠奖励、
金币复活的玩家发布开关。S0～S4 的功能完成并通过本阶段测试后即是当前开发版本能力；
`onlineCoinRelive5V1` 只表示冻结的复活策略 ID，不是运行时 release flag。S5 完成后只能声明“内部开发候选通过”，
不得据此声称已经面向玩家上线。真实生产/渠道发布如有需要另立阶段。

S5-01 对前序阶段遗留的开发期 launch/release gate 作一次性 RC 装配收口：既有 wire/state 的
`onlineCoinReliveEnabled` 在本候选中固定为 `true`，只投影“当前 RC 已装配该能力”；新 run 固定锁存
`rewardPolicyVersion=1`，衣柜/装备写作为当前开发版本的普通能力可用。此后不保留百分比、白名单或人工开关，
也不演练运行时切换。删除既有协议字段属于 S2/S2R 的 wire 变更，不在 S5 处理。

数据库/缓存/恢复 backlog、版本或 hash 不健康时拒绝新 offer/charge/settlement 写入的 fail-closed 安全闸必须保留；
它由客观健康状态触发，不是发布 gate，也不得被“一次性启用”绕过。

本阶段只要求 Creator 桌面预览，不要求物理真机。Safe Area 使用 `safeBottom=0/100` 两个固定注入值验证，
多 pointer 由自动事件 fixture 验证；真机多指、真实 Safe Area 和移动设备性能仍是未验证项，不能关闭
[plan-v5 C3 真机联调](../../plan-v5.md)。

S5 不增加玩法语义，不在验收时临时调数或补协议，不把失败检查改写成“有意不做”，也不允许静默 fallback 到
Classic、TimeLimit、真人 40 tick 自动复活或客户端扣款。若发现规格缺口，退回拥有该规格的阶段修正并重新跑
受影响门禁；S5 只负责一次性 RC 装配收口、聚合验收与内部 RC 的 go/no-go 决定。工程侧整理证据并给出建议，
用户是唯一最终批准人。

## 2. RC 冻结口径

内部 RC 必须同时声明并校验以下五层 ID/hash：

| 层 | 冻结 ID | 不可漂移的核心语义 |
|---|---|---|
| 战场 | `newEndlessPortraitV2Map4096` | 与 S0 快照一致：来源 4896²、目标只覆盖为 4096²、世界单位不整体缩放，并保留来源磁铁前三波；不承载后续循环 gate |
| 生命周期 | `sourceEndlessTotalTime0` | `totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false`、无有效 `endTick` |
| 复活流程 | `sourceEndlessReliveFlow` | 真人限时选择且无自动复活；AI 约 40 tick 独立重生 |
| 复活策略 | `onlineCoinRelive5V1` | 五档 `100/200/300/300/300` 金币、100 tick 选择窗；它是本候选的策略 ID，不是发布开关；Feed B 表是冻结样例，不宣称为生产默认 |
| 联机适配 | `onlineEndlessDropInV2` | 稳定 ID、层内 `version: 2`：3 秒准备、最多 8 真人、稳定态 17 蛇、Playing 可入、个人 run 结算、空房回收，以及 Star/磁铁 20 Hz 确定性移动与后续循环 gate |

另外四个配置层的 version/hash 必须与 S0 相同；联机适配层及组合 hash 必须采用 S2 实际生成的新值，禁止把
S0 历史组合 hash `2319d173…f87e2` 当作候选目标。内部 RC 还必须冻结 catalog/presentation、gameplay wire/mode、relive policy、reward policy、evidence schema、
数据库 migration、协议 fingerprint 和客户端资源版本。任一 hash/version 对不上，不得通过运行时降级改变玩法
语义；候选直接 no-go，并回到 manifest 中精确登记的上一套完整兼容 commit/build。

## 3. 详细任务

### S5-01：建立内部 RC 清单与追溯基线

- [ ] **动作：** 锁定 commit、五层配置 hash、catalog/presentation、wire/mode、relive/reward/evidence 版本、
  migration 集合和客户端资源构建；逐项关联 S0～S4 的退出证据，并登记上一套完整兼容 commit/build。
- [ ] **动作：** 一次性移除或退休 S2R/S3/S4 遗留的玩家 launch/release gate：RC 装配固定投影
  `onlineCoinReliveEnabled=true`，新 run 锁存 `rewardPolicyVersion=1`，衣柜/装备写可用；不得新增运行时 toggle、
  百分比或白名单控制。保留存储、恢复 backlog、版本/hash 异常时自动拒绝新经济写的 fail-closed 安全闸。
- **产物：** release-candidate manifest、版本/迁移兼容矩阵、阶段证据索引；工程侧负责证据审计，用户是唯一
  最终 go/no-go 批准人。
- **验证：** manifest 可从干净 checkout 重建；静态搜索和行为 fixture 证明不存在可操作的玩家发布 gate，三项能力
  在 RC 中固定可用，而健康异常仍 fail closed。任何未完成阶段、未知 hash、缺失 migration 或未关闭的临时测试
  端口都使候选 fail closed。

### S5-02：验证文档覆盖、真源和生成镜像

- [ ] **动作：** 以拆分前 `9e1814e:plan-s.md` 为来源清单，核对 61 个原阶段任务、19 个代码块、11 张表和
  14 个唯一旧链接目标均有唯一归属；检查 `docs/s/` 内相对路径与跨文件锚点；从手写真源重跑必要 codegen/sync。
- [ ] **动作：** 对拆分后跨阶段协作项指定唯一 canonical owner；原清单 #43 的 catalog +
  `snakeCosmetic` descriptor 以 S3-02 为 canonical owner，S1-04 与 S3-01 只登记为资源身份和业务映射依赖。
- [ ] **动作：** 同步 README、S2R、S4 与 plan-v5 中“S5 开启玩家发布开关/负责真机与正式发布”的旧表述：
  S5 只批准内部 RC，既有 `onlineCoinReliveEnabled` 只作 RC capability 投影，物理真机继续留在 plan-v5 C3，
  生产/渠道发布另立阶段。
- **产物：** coverage/link 报告、无遗漏/重复说明、生成差异和 protected-path 审计。
- **验证：** 每个旧任务映射至少一个稳定阶段 ID，canonical owner 恰好一个；无裸 `§x`/“x.y 节”失效引用；
  `docs/s/*.md` 被链接检查实际扫描，而不是因未登记在 inventory 中被跳过；`verify:sync` 无漂移。

### S5-03：执行完整自动化与本地真栈命令

- [ ] **动作：** 在 RC commit 的干净工作区执行全量门禁、故障矩阵和本地真 Redis/MySQL 集成测试；记录原始
  输出、exit code、测试计数、耗时和日期。
- **产物：** 以下命令的可复现日志；若新增专用 Snake 测试入口，同时记录其命令但不得替代全量门禁。
- **验证：** 每条命令 exit 0，未 skip 关键 Snake/relive/cosmetic/reward fixture，镜像和类型检查包含新增目录。

```bash
npm run verify:all
npm run test:faults
npm --workspace @game/server run stack
npm --workspace @game/server run db:bootstrap
npm --workspace @game/server run smoke:framework
npm --workspace @game/server run test:int
npm run test:faults:int
```

### S5-04：执行固定种子视觉与批渲染结构验收

- [ ] **动作：** 运行 S5-VIS 矩阵：固定视口、实体位置和 RNG seed，比对旋转后的原作 world golden、目标边界、
  数量/尺寸/颜色、皮肤、AI、相机/身体缩放和批渲染结构。
- **产物：** golden/diff、fixture 输出、catalog/atlas 校验、节点/draw-call 结构证据，以及同一台开发机上的
  帧耗/内存观察值和差异说明。主机相关的 FPS、帧耗与内存只留基线，不作为 RC 硬门禁。
- **验证：** S5-VIS-01～10 全部通过；任何视觉断言或批渲染结构门禁豁免必须退回 S0/S1/S2 形成新冻结版本，
  不能在 S5 口头放行。

### S5-05：执行操作区与多指输入验收

- [ ] **动作：** 在默认右手/左手模式、`safeBottom=0/100` 和触控取消场景运行 S5-IN 矩阵，自动断言节点位置、
  可见尺寸、圆形命中、pointer owner、boost 生命周期及仅设备本地的操作习惯持久化。
- **产物：** 输入 fixture、事件轨迹、布局截图和旧命中规则不存在的静态/行为证据。
- **验证：** S5-IN-01～07 全部通过；一指转向、另一指持续加速、第三指点击辅助入口互不抢占。

### S5-06：执行无尽生命周期、wire 容量与重连验收

- [ ] **动作：** 运行 S5-NET 矩阵，覆盖 1800/1801 tick、房级/个人 deadline 分型、五层 meta/hash、17 蛇与
  1030 食物、磁铁波次/效果、5186/88162 路径点、chunk/delta 校验、版本不匹配拒绝和重连恢复；记录候选实际
  modeVersion 及“精确匹配可进入/不匹配明确拒绝”的兼容矩阵，不以阶段编号推测版本号，也不建立 N/N-1 共存窗口。
- **产物：** world/wire fixture、首包与 delta 抓包、checksum/重取日志、版本拒绝证据和内存水位报告。
- **验证：** S5-NET-01～11 全部通过；合法 V2 世界不被旧 8/315/512 上限拒绝或静默截断，协议或 modeVersion
  不匹配的客户端在 admission 前明确拒绝且零副作用。

### S5-07：执行金币复活真栈故障验收

- [ ] **动作：** 运行 S5-REL 矩阵，对 offer、decision、spawn、charge、apply、首个 provisional tick、activated、
  refund、owner lease、缓存失效和所有终局竞争逐点 kill/restart/replay。
- **产物：** 每个注入点的 decision/receipt/run/ledger/balance 最终态、恢复器日志和客户端表现记录。
- **验证：** S5-REL-01～13 全部通过；不吞币、不双扣、不重复复活、不免费复活，退款未确认时不伪造终局。

### S5-08：执行衣柜、权威装备与可靠奖励验收

- [ ] **动作：** 运行 S5-ECO 矩阵，覆盖 catalog mismatch、伪造皮肤、equip/unlock 并发、冷用户/thaw/退休、
  run 外观锁存、checkpoint、全部 endReason、settlement/outbox 重放和个人结果。
- **产物：** RPC/Bag/User/ledger/outbox 前后快照、幂等/冲突日志、runResult UI 证据和 reward policy 边界报告。
- **验证：** S5-ECO-01～10 全部通过；S4 原位扩展 S2R 账本，无第二套 run；资产只来自真人已确认 evidence。

### S5-09：执行长驻房、churn、drain 与资源恢复验收

- [ ] **动作：** 在完整 17 蛇/1030 食物负载下连续运行 30 分钟，并完成至少 200 个完整 churn cycle。一个 cycle
  固定为 `admission →（轮换覆盖 reconnect 或 death-decision）→ terminal/final leave → cleanup`；四类路径各至少
  命中一次。期间执行 AI 补位，并注入资源缺失、掉线、并发顶号、moderation、room fault 和运维 drain，观察
  tick、集合、task、run、receipt 和 autoDispose。
- **产物：** soak/churn 曲线、内存集合水位、drain 时间线、空房回收日志、资源 fallback 和故障结果。
- **验证：** S5-OPS-01～07 全部通过；AI/假榜不维持空房，所有 run 先 durable freeze，迟到 task 不重开输入。

### S5-10：完成 Creator 3.8.8 桌面预览验收

- [ ] **动作：** 用 Creator 3.8.8 打开同步后的工程，在 `750 × 1624` 桌面预览中注入 `safeBottom=0/100`，
  走完战场、衣柜、复活、结果、重连和资源缺失路径；双/三 pointer 行为由 S5-IN 自动事件 fixture 补证。
- **产物：** S5-CR 矩阵的截图/录屏/日志，记录 Creator 版本、RC commit、开发机、视口、Safe Area 注入值、
  操作步骤和结论，并明确标记“未做物理真机验证”。
- **验证：** S5-CR-01～07 全部通过；`.meta`/UUID、动态加载、SpriteFrame rect/pivot、动画、混合、层级和弹窗输入
  租约符合规格。无头结果不能替代 Creator 预览证据，Creator 预览也不能冒充真机证据。

### S5-11：执行内部 RC、drain 与回滚演练

- [ ] **动作：** 在隔离的本地/开发环境验证 migration 顺序、版本不匹配客户端的明确拒绝、catalog/config hash
  闸门、Active→Draining、精确回滚 commit/build 和恢复器兼容。当前没有已部署旧客户端，不设计共存窗口，也不做
  玩家放量或功能开关演练；S0～S4 能力在 RC 中直接启用。全部门禁全绿后，由用户对内部 RC 作最终 go/no-go 批准。
- **产物：** RC runbook、go/no-go 清单、开发诊断项、精确回滚 commit/build 和一次完整演练记录。
- **验证：** 进入 Draining 的时刻记为 `T0` 并立即停止新准入；不晚于 `T0+60s` 把活跃 run 以 `serverDrain`
  durable freeze，只有对应 run freeze 且未决 relive/reward 已 durable/claimable 后才关闭其连接，并在 `T0+120s`
  前关闭全部连接/房间；连接关闭后兼容恢复器仍可继续收敛。回滚不降 schema、不丢 receipt/outbox，也不静默切回
  另一玩法语义；版本不匹配客户端只得到明确拒绝/升级提示。

### S5-12：回写状态与最终 RC 证据

- [ ] **动作：** 将实际 commit、命令/计数、本地真栈故障、Creator 预览、RC/回滚演练和已知限制写入本页；同步
  [专项索引状态表](README.md#8-总状态与证据汇总) 和 [plan-v5.md](../../plan-v5.md) 的当前事实摘要。
- **产物：** 完整证据表、内部 RC 结论、剩余问题 owner/阶段和用户批准的最终 RC 声明口径。
- **验证：** 未运行项不写“通过”；所有链接可解析。全部门禁全绿只把 manifest 标为
  `readyForUserApproval=true`，页面在用户批准前保持 `[进行中]`；用户批准记录必须绑定 RC commit/hash、日期和
  结论，之后才可标记 `[已完成]` 并使用最终 RC 口径。物理真机、生产部署与渠道发布必须继续列为未验证/范围外，
  不能被 RC 完成状态覆盖。

## 4. 可执行验收矩阵

### 4.1 视觉、世界与批渲染结构

| 检查 ID | 可执行断言 | 必留证据 |
|---|---|---|
| [ ] S5-VIS-01 | 固定实体/seed 在 `750 × 1624` 下把原作横版世界层正交旋转 90° 后，与目标重合区按 1:1 世界单位叠图；不得乘 `4096/4896` | 原图、目标图、diff；原作外围每边 400 单位排除说明和独立 4096² 边界 fixture |
| [ ] S5-VIS-02 | 同时保留来源 `4896 × 4896` 快照与目标 `4096 × 4096`；稳定态恰有 1000 Dot + 30 Star，不回落 Classic 300 + 15 | 配置 hash、实体计数断言 |
| [ ] S5-VIS-03 | 视觉网格间距 32 世界单位、地图边距 16；背景/明暗网格/边界/外围色取自原作序列化数据，不是肉眼近似；顶部 Safe Area 内排行榜/状态 HUD 不遮挡战场 | 颜色提取 fixture、像素采样、HUD 布局值和截图 |
| [ ] S5-VIS-04 | Dot/Star 显示尺寸分别为 16/42，七种 Dot 帧均可出现；Star/磁铁权威速度为 `320/3 unit/s`，按 milli/micro-unit 余数产生 `5.333/5.333/5.334` 步长。motion RNG 由 matchSeed+kind+entityId 命名子流派生：出生/计划变向先抽 `[0,360)` 整数度方向、再抽闭区间 `34..67 tick`；反射不重抽方向、只抽一次 hold，计划变向与反射同 tick 时则先消费方向+hold、再消费反射 hold。remaining=hold，未撞边移动后递减；撞边 tick 的镜像反射属于上一段候选移动，不计入新 hold，tick 末保持 remaining=hold，新 hold 从下一 tick 起恰驱动 34/67 次完整移动，不产生 35/68。Star 半径 21、磁铁半径 35 的反弹、角落及同 tick draw order 不依赖客户端帧率 | 固定 seed 分布、子流名/draw order、34/67 边界、尺寸、余数状态、逐 tick 长驻轨迹和四边/角落反弹测试 |
| [ ] S5-VIS-05 | 每条蛇的 head/body/tail/animation 始终来自同一稳定 `skinId`；原皮白 tint，AI 不统一灰化，自机用细白轮廓、AI 用名字提示 | 16 皮肤动态预览、同局 AI 截图 |
| [ ] S5-VIS-06 | 单真人时 16 AI/共 17 蛇；2～8 真人仅替换 aiLevel 401，满 8 真人仍 9 AI；86 假榜无世界实体、碰撞或奖励资格 | roster/displayRank/world 三模型断言 |
| [ ] S5-VIS-07 | 出生长度 80；相机 `1.3→0.6@100000`、身体 `1.0→2.8@100000`、蛇头中心跟随、地图外背景和路径边界向量全部匹配 | 长度边界 fixture、golden/轨迹日志 |
| [ ] S5-VIS-08 | 未知皮肤 ID、皮肤资源加载失败或皮肤 rect 非法时回退皮肤 1，不阻塞战斗；权威装备不被客户端 fallback 改写 | 缺皮肤资源注入、受控诊断和账号快照 |
| [ ] S5-VIS-09 | 1030 常驻食物恰好使用一个 `snake-food-batch` 节点和一个共享 atlas/material 的 mesh renderer，不存在 per-food Node/Sprite/material；皮肤 RNG 不消费移动/出生/食物/碰撞随机流。该节点/组件结构是硬门禁，开发机 draw-call、FPS、帧耗与内存仅作同机观察，不设绝对阈值 | 节点/组件结构断言、开发机配置与观察值；增删皮肤前后玩法轨迹一致 |
| [ ] S5-VIS-10 | 磁铁 `10001` 的 frame、rect、显示尺寸、icon、aura 和拾取音频来自通过 S1-12 门禁的 presentation catalog；160 tick/8 秒权威持续时间只来自 gameplay configHash。required world frame 缺失拒绝 V2，aura-only 损坏退头顶 icon，音频缺失 silent，均不回退皮肤 1。自机为细白轮廓、AI 以名字识别，无额外箭头或 AI 轮廓 | 磁铁分型故障、资源/hash/rect 与 gameplay config 校验、拾取与效果录屏、自机/AI 对照截图 |

### 4.2 操作布局与触控

| 检查 ID | 可执行断言 | 必留证据 |
|---|---|---|
| [ ] S5-IN-01 | `750 × 1624` 下摇杆中心 `(375,220)`、底盘 Ø220、帽约 Ø92、独立命中半径 155；最大位移钳制，抬起回正帽但保留最后合法方向 | 坐标/半径断言、输入轨迹 |
| [ ] S5-IN-02 | 默认 S1 `(130,410)`/Ø88/命中56，S2 `(295,490)`/Ø104/64，S3 `(455,490)`/Ø104/64，S4 `(620,410)`/Ø144/88；命中区互不重叠且不侵入摇杆 | 节点树、圆形几何 fixture |
| [ ] S5-IN-03 | `safeBottom=0/100` 时均按 `controlShiftY=max(0,safeBottom+161-220)` 整组上移；横向中心、弧形相对距离、尺寸和世界单位不变 | 两组注入值的布局截图与数值断言 |
| [ ] S5-IN-04 | 不可用槽位不渲染、不命中且不补位；默认/左手模式摇杆均 `x=375`，左手把 S1～S4 功能顺序镜像为 `[加速、护盾、主动道具、表情]`。首发唯一开放的加速因此在右手 S4、左手 S1 可见，其他三个物理槽隐藏 | 两种模式 slot/owner fixture |
| [ ] S5-IN-05 | pointer 按 S1→S2→S3→S4→摇杆优先级精确命中，一指一 owner 至 END/CANCEL；一指转向、另一指按住加速、第三指点辅助入口互不抢控 | 多指事件序列和最终 intent |
| [ ] S5-IN-06 | END/CANCEL、失焦、死亡、断线、重连、场景切换、模态窗和 run 结束清空 owner/boost；实现中不存在“左半屏摇杆”或加速半径 200 | 自动回归、静态搜索和状态快照 |
| [ ] S5-IN-07 | 全新本地存储状态默认右手；切换先写后用，只有本地写入成功才原子应用左/右手布局并跨场景/重启恢复，写入失败保持/回滚右手且不显示保存成功。退出或切换账号不上传、不覆盖；清除本地设置后回到右手。磁铁自动拾取且不占槽；首发右手只显示 S4 加速、左手只显示 S1 加速 | 本地存储成功/失败前后值、同帧布局、预览重启/换账号矩阵、受控诊断、slot 节点与命中证据 |

### 4.3 无尽生命周期、协议与容量

| 检查 ID | 可执行断言 | 必留证据 |
|---|---|---|
| [ ] S5-NET-01 | meta 同时携带五层 ID/version/hash 与新组合 hash：前四层 version 1/hash 等于 S0，`onlineEndlessDropInV2` 为 version 2/新 hash，组合 hash 不等于 S0 历史值；同时有 `totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false` 且无有效 `endTick`，客户端不显示 `0:00` | 建房/重连 meta 抓包、S0/S2 hash diff 和 HUD 截图 |
| [ ] S5-NET-02 | 3 秒只用于首次准备；world 第 1800、1801 及后续 tick 正常推进；只有 `hasDeadline && tick >= endTick` 才可按时间 done，Snake 不从此调用 `context.settle()` | 定向 world/mode fixture |
| [ ] S5-NET-03 | 房级无 deadline 不影响 `decisionDeadlineTick`；不存在临近房级 endTick 禁复活分支 | 100 tick 边界与无房级 deadline 组合测试 |
| [ ] S5-NET-04 | `roomEpochId/state.matchId` 在开放 admission 前只生成一次，首人 auto-start 不覆盖；首个 OPEN run 已有稳定 epoch | 首人/后续 drop-in/重连生命周期日志 |
| [ ] S5-NET-05 | wire 使用稳定 skin ID、food variant、wreck kind/variant/source；服务端准入/run/出站严格限制为公共 catalog 成员，客户端 wire 只验安全非负整数并把未知 ID 交 renderer 回退，两者都不使用 `0..15` 这类上界猜测。tool 必须满足 `envelopeTick < expireTick <= envelopeTick+400`；buff 必须满足 `envelopeTick < magnetUntilTick <= envelopeTick+160` 且只允许 active 真人或存活 AI，死亡、待重生与终局必须为 null。`ISnakeSnapshotTool.id` 在 roomEpoch 内唯一且不复用，每个实例的 `toolId` 恒为 `10001`；拾取 removal 与胜者 buff 在同一 seq 原子可见，真人胜出才同 seq 更新其 run `magnetCollected`，AI 胜出不写真人 run 计数。manifest 记录实际 modeVersion，新增语义从当时版本递增；当前没有已部署旧客户端，版本不匹配者明确拒绝并提示升级，不做共存或静默降级 | schema/validator 分层、未知皮肤兼容回退、tool/buff 半开边界、真人/AI 胜者对照、到达时间反例、拆包/乱序拾取、entity ID 复用测试、版本矩阵和版本不匹配拒绝证据 |
| [ ] S5-NET-06 | 首包/重连可承载 17 蛇、1030 食物、单蛇 5186 点、全房理论上限 88162 点；不沿用 8/315/512 限制 | 最大容量 fixture 和内存/包大小证据 |
| [ ] S5-NET-07 | baseline 按 `begin→ordered chunks→end(checksum)`；后续 delta 有序；缺块、重复、乱序或 checksum 失败会请求新 baseline | 丢包/乱序/重复注入日志 |
| [ ] S5-NET-08 | `point_step_config` 完整保留 71 项；`80→52、300→200、3000→960、18900→1954、19200→1964、20100→1990、100000→5186`；`1240` 不作路径/长度上限 | 源数组 hash、边界向量 |
| [ ] S5-NET-09 | world 集合删除同时清 participant、AI respawn、真人 relive/task、输入、游标和 finalized run；循环后水位回落 | churn 前后集合计数 |
| [ ] S5-NET-10 | 磁铁在首次 Playing 后第 15/60/150 秒各无条件生成 10 个，即使无资格真人或真人全长 50000 也不例外；之后于 300/450……秒每 150 秒重复。后续波次只接受 active/deadPresentation/reliveOffering/pendingRelive/reliveSpawning/reliveCommitting/reliveReady 且长度 `<50000` 的真人 run；active（含断线宽限）读当前长度，其余六态读同一 deathSnapshot.length，preparing/cancelled/finalizing/finalized、AI 与假榜排除。trigger 在 fixed-step 开头读取上一 tick 提交快照；新磁铁当 tick 移动且可拾取，跳过不分配 tool entity ID、不耗位置/motion RNG且永不补发。单体 20 秒过期、拾取后效果 8 秒，真人/AI 均可拾取；基线/delta/重取保持位置、过期和 effect tick 一致 | 无条件前三波、资格/排除状态、49999→50000 同 tick、跳过前后 RNG、AI 对照、过期/拾取、baseline/delta/重连 fixture |
| [ ] S5-NET-11 | `v != GAME_ROOM_PROTOCOL_VERSION` 或 `modeVersion != catalogModeVersion("snake")` 均在 admission 前以共享 `ErrorCode.ProtocolMismatch`（`3004`）拒绝，客户端显示“客户端版本过旧，请更新后再试”；不创建 participant/OPEN run/蛇实体，不写 decision/receipt/settlement/ledger/outbox，不缺省解释新字段，也不回退 Classic/TimeLimit。当前没有已部署旧客户端，不建立 N/N-1 共存窗口 | 两类拒绝抓包、客户端升级文案、world/存储零写入快照 |

### 4.4 真人死亡与可靠金币复活

| 检查 ID | 可执行断言 | 必留证据 |
|---|---|---|
| [ ] S5-REL-01 | 真人死亡立即停止输入/boost/碰撞、只增一次 deathSeq/deaths 且不生成计分残骸；4 tick 后仅普通且有档位者进入 offer | 死亡事件/实体/残骸 fixture |
| [ ] S5-REL-02 | 完整版本化 deathSnapshot/hash 持久成功后才激活 offer；deadline=`offeredTick+100`，`currentTick < deadline` 才接收，等号由 timeout 胜 | checkpoint kill 与 99/100 tick 边界 |
| [ ] S5-REL-03 | 第 1～5 次 applied 分别扣 `100/200/300/300/300`；余额不足/可重试失败不消耗档位；第六次、force/escape 不发 offer | 五档余额/次数/死亡矩阵 |
| [ ] S5-REL-04 | accept/decline/timeout 在 `runId+deathSeq` 上仅一个 CAS 胜者；同 requestId 同 payload 重放，异 payload 冲突，迟到/相反决定不重复效果 | 并发与跨进程 replay 日志 |
| [ ] S5-REL-05 | spawn 最多等 20 tick 且先找安全点再扣费；失败为 spawnFailed、无 receipt/扣费；任一 DB await 后复验 generation/token/碰撞 | 无安全点、迟到 task 与重找 fixture |
| [ ] S5-REL-06 | receipt 只能 `charged→applying→applied→activated` 或幂等 `refunded`；普通 offer checkpoint 不能充当 applied 证明；owner/generation/lease 可恢复 | 各状态 kill/reconciler 最终态 |
| [ ] S5-REL-07 | ReliveReady 只允许恰好一个保护中的 provisional Active step，随后冻结等待 activated CAS；该 step 是 `[reliveFirstActiveTick, reliveFirstActiveTick+60)` 的第 1 tick，有 firstActiveTick 才下发 revived，确认前崩溃按用户有利原则退款 | 首 tick 前/中/后 kill，世界副作用与余额记录 |
| [ ] S5-REL-08 | 成功保持同一 runId/skinIdAtRunStart，恢复明确累计字段、清零单生命瞬态；保护在 firstActiveTick 与 `+59` 生效、`+60` 失效，确认后最多剩 59 tick，且不声称对墙绝对无敌 | snapshot 前后 diff、半开保护边界 |
| [ ] S5-REL-09 | Offering/Pending/Spawning/Committing/Ready 只冻结本人；其他玩家/world tick 继续，本人仍占席；断线不暂停 deadline，重连恢复同一 offer/result | 双真人与重连 fixture |
| [ ] S5-REL-10 | systemFailed 若已扣费必须先退款；退款中保持 Finalizing 和可 claim receipt；charge/refund 后余额缓存失效，receipt.balanceAfter 仅用于本次响应 | 退款中 kill、缓存读回和 UI 文案 |
| [ ] S5-REL-11 | AI 不进入真人 offer/扣费/档位，约 40 tick 后保持 AI skin 重生；仅符合源路径的 AI 死亡残骸按 `pow(deadSnakeScore,0.8)*2` 分摊、单个至少 3，cap 合并前后总值守恒 | 真人/AI 对照、定点边界与合并守恒 fixture |
| [ ] S5-REL-12 | decision/receipt/ledger 按 uid、sId、roomEpochId、runId、deathSeq 隔离；跨区、错账号或错 epoch 的重放不能读取、扣除或恢复另一 run | 跨区/跨账号/跨 epoch 真栈注入 |
| [ ] S5-REL-13 | `magnetCollected/starCollected` 是当前真人 run 的累计次数，AI 拾取不写这两个字段；death snapshot/apply/复活不丢失或重复，复活清除死亡前磁铁剩余 buff。存活断线期间绝对 `magnetUntilTick` 继续流逝，宽限重连只恢复剩余 tick，不刷新 8 秒 | 真人/AI 拾取对照、拾取→死亡→复活与拾取→断线→重连逐 tick 快照、客户端效果时长录屏 |

### 4.5 衣柜、装备、run 与奖励

| 检查 ID | 可执行断言 | 必留证据 |
|---|---|---|
| [ ] S5-ECO-01 | 服务端准入忽略客户端 join skin，读取拥有/装备后在实体创建前持久锁存不可变 `skinIdAtRunStart/catalogVersionAtRunStart`；伪造未拥有皮肤不能进战场 | admission 请求、run/账号/实体快照 |
| [ ] S5-ECO-02 | 皮肤 catalog hash 不一致时装备/解锁等经济写 fail closed；未知皮肤资源时战斗/预览回退皮肤 1，不把该规则套用到磁铁资源 | mismatch 与缺皮肤资源注入 |
| [ ] S5-ECO-03 | equip/unlock 同/异 requestId、同 ID 异 payload、expectedVersion 冲突行为确定；碎片不足时所有字段零写入 | 并发前后 Bag/User/version 快照 |
| [ ] S5-ECO-04 | 冷用户、thaw、跨区、退休皮肤有确定读取；默认隐式拥有；既有退休所有者仍可装备 | 用户矩阵和 snapshot |
| [ ] S5-ECO-05 | run 中换装只影响下一新 run；真人复活、AI 重生和宽限重连保持当前 `skinIdAtRunStart/catalogVersionAtRunStart`，结算也不重读当前装备 | 连续两 run、中途换装和结算录像/日志 |
| [ ] S5-ECO-06 | 宽限内重连延续同一 runId，最终离场后重入生成新 run；单人退出不影响其他真人，最后真人后才回收房间 | 多人生命周期 fixture |
| [ ] S5-ECO-07 | activeTicks 只在 step 开始 connected/alive/Active 时累计，排除准备、死亡/复活全状态、断线和 Finalizing | 状态逐 tick 计数表 |
| [ ] S5-ECO-08 | checkpoint 不发奖；凡 `runStartedTick != null` 的 terminal run 第一次成功 finalize 都写零或非零 `snake_run_settlement` 与 durable result receipt，finalize 前置快照失败时保持 Finalizing 且零写入。只有 `rewardEligible && coinGross > 0` 时写 `currency_ledger`，只有 `rewardEligible` 且 progression effect 非空时写单一聚合 `gameplay_outbox`；`preparing → cancelled` 与成功 `revived/activated` 不结算。同 payload 同 receipt、异 payload 隔离，dead 可查询/SOP replay | SQL/Redis 前后态、零/非零奖励对照与故障日志 |
| [ ] S5-ECO-09 | 每个 endReason 按资格矩阵收敛；`moderationKick` 写零奖励 settlement/result receipt 但资产为零，成功复活不写 settlement；已确认进度在崩溃窗口不漏不重 | endReason × kill-point 矩阵、moderation 零奖励 receipt 与成功复活无结算对照 |
| [ ] S5-ECO-10 | runResult 只驱动本人结果页；其他玩家 room phase 仍 Playing；奖励不读取 displayRank/AI/假榜，XP/碎片走 additive effect | 双真人 UI、effect payload 和 replay |

### 4.6 长驻房与运维

| 检查 ID | 可执行断言 | 必留证据 |
|---|---|---|
| [ ] S5-OPS-01 | 完整 17 蛇/1030 食物负载连续运行 30 分钟并完成至少 200 个完整 churn cycle；每个 cycle 都覆盖 admission、轮换 reconnect/death-decision、terminal/final leave 与 cleanup，且 join/leave/reconnect/death-decision 四类路径各至少命中一次。每个 cycle 及最后空房后，mode-owned participant、pendingAiRespawns、relive task、游标和 finalized-run 引用回到基线，应清项为 0；heap/帧耗只记录，不设百分比阈值 | 30 分钟 soak 水位曲线、逐 cycle 计数与结束后集合快照 |
| [ ] S5-OPS-02 | 最后一名真人先 durable freeze，再停止 tick/autoDispose；AI 和假榜不能单独维持房间 | 空房时间线 |
| [ ] S5-OPS-03 | 以进入 Draining 为 `T0` 并立即停准入；不晚于 `T0+60s` 以 `serverDrain` durable freeze 全部活跃 run，只有对应 run freeze 且未决 relive/reward 已 durable/claimable 后才可关闭其连接，并在 `T0+120s` 前关闭全部连接/房间。关闭后恢复器继续收敛，客户端显示 serverDrain 而非超时结算 | 带 T0/60/120 秒及边界的 drain 时间线、录像和后台收敛结果 |
| [ ] S5-OPS-04 | endRun/disconnect/sessionReplaced/moderation/drain/roomFault 与 relive task 竞争遵循 terminalIntent 优先级；迟到 task 不重开输入 | 全竞争矩阵 |
| [ ] S5-OPS-05 | tick/snapshotSeq/joinOrdinal 接近协议上界才触发技术 drain，不能成为日常 arena 时限 | 边界 fixture 与配置审计 |
| [ ] S5-OPS-06 | 硬崩溃恢复只承诺 confirmedThroughTick；UI/receipt 不暗示未确认窗口已持久 | 崩溃恢复与文案证据 |
| [ ] S5-OPS-07 | 本地开发诊断能通过故障注入发现 decision/receipt lease 过期、outbox dead、余额缓存异常、集合水位增长和 config/catalog mismatch；任一双扣、吞币、免费复活、重复奖励、跨账号资产、缺 receipt 或 mismatch 后仍写经济都使 RC no-go，不承诺生产监控/告警平台 | 本地故障注入、诊断输出与 RC runbook 链接 |

### 4.7 Creator 3.8.8 与可复现证据

| 检查 ID | 人工步骤 | 必留证据 |
|---|---|---|
| [ ] S5-CR-01 | 打开工程并等待资源导入完成，检查同步 `.meta`/UUID、动态包和 SpriteFrame rect 未丢失 | Creator 版本、导入日志、资源检查截图 |
| [ ] S5-CR-02 | `750 × 1624` 预览固定 seed 战场并注入 `safeBottom=0/100`，检查背景、网格、边界、食物、Star 确定性轨迹、磁铁、16 皮肤、AI 名字、细白自机轮廓、相机和身体缩放；顶部 HUD 不越过冻结的设计安全区且不显示游玩时长，首次 3 秒准备提示保持屏幕居中 | 两组 bottom 注入值的战场 golden、Star/磁铁轨迹、准备期与 HUD 截图/录屏 |
| [ ] S5-CR-03 | Creator 桌面预览只检查 `safeBottom=0/100`、默认右手/左手的摇杆与四槽布局、本地存储成功/失败及取消路径；双/三 pointer ownership 只由 S5-IN 自动 fixture 证明。重启预览确认左手偏好仅本地持久且磁铁不占操作槽 | Creator/浏览器/开发机/视口/注入值、布局录屏、本地设置成功/失败前后值和自动 pointer 轨迹；明确标记无真机触控证据 |
| [ ] S5-CR-04 | 打开衣柜，检查虚拟列表、动态 head/body/tail 预览、动画、rect/pivot、筛选、装备/解锁、冲突和 fallback | 衣柜截图/录屏 |
| [ ] S5-CR-05 | 走完普通死亡、五档费用、复活窗的死亡原因/当前长度/分数/服务器倒计时、复活中、保护、放弃/超时/第六次/systemFailed退款中以及重连恢复；“结束本次”必须二次确认 | 状态序列录屏、倒计时抓包与服务端日志 |
| [ ] S5-CR-06 | 用两份本地开发客户端/Creator 预览配合本地 harness，验证个人 runResult、pending/applied/dead、断线重连和皮肤资源缺失；同房另一真人不进入结算页 | 两份本地客户端/harness 证据和结果页截图；不表述为两台真机 |
| [ ] S5-CR-07 | 检查吃食物/残骸、`collect-magnet`、击杀、死亡和按钮音效遵守 `sfxOn`；个人 run 结果与退出固定 `none/silent`。磁铁持续 8 秒不播放循环音，且无 TimeLimit 到时提示；视觉插值不改变权威 tick/命中 | `sfxOn` 前后录屏、个人结果/退出静默证据、磁铁拾取/持续期事件与音频触发日志 |

## 5. 跨阶段风险与 RC 回退矩阵

| 风险/失败信号 | RC 防线 | no-go 与回退动作 |
|---|---|---|
| Classic、本地调试模板与 V2 快照混用 | 五层 ID/hash 和逐字段 fixture | no-go；回滚整个候选，不做静默 runtime fallback |
| 遗留 launch/release gate 仍可关闭或人工切换能力，或清理 gate 时误删健康 fail-closed | S5-01 静态搜索与健康故障 fixture | RC no-go；固定三项 RC capability，并恢复存储/backlog/version/hash 安全拒绝路径 |
| 把来源 4896² 当目标或把它整体缩到 4096² | S5-VIS-01/02 | 退回 S0/S2 修配置和 golden |
| 1800 tick 收局、TimeLimit HUD 或房级 deadline 污染复活 deadline | S5-NET-01～03 | no-go；退回 S2 修正，不形成内部 RC |
| 协议/modeVersion 不匹配客户端被接纳、产生任何状态写入或静默回退 | S5-NET-11 | RC no-go；在 admission 前按共享 3004 明确拒绝并重跑零副作用矩阵 |
| Feed B 表被宣称为普通线上 V2 默认 | RC manifest 明示 `onlineCoinRelive5V1` 来源 | 修正文档/config 名称后重验，不输出超出候选范围的说明 |
| 真人复用 AI 40 tick 重生、真人生成计分残骸或全房暂停 | S5-REL-01/09、S5-VIS-06 | no-go；退回 S2 状态机 |
| accept/decline/timeout 多赢家或 offer 早于持久快照 | S5-REL-02/04 | RC no-go；退回 S2R |
| charged/applied 后未交付、activated 早于活动 tick、恢复器误认 offer checkpoint | S5-REL-06/07/10 | 停止测试准入，运行兼容 reconciler/退款，修复后全矩阵重跑 |
| decision/receipt 无 owner lease，离场/drain 与 task 竞争 | S5-REL-04/06、S5-OPS-04 | 停新准入；drain 并收敛/退款，禁止删除 run |
| charge/refund 后余额缓存仍旧 | S5-REL-10 | 禁止展示缓存余额；修失效路径并回归 |
| 仍使用 8 蛇/315 食物/512 点上限或误把 1240 当上限 | S5-NET-06/08 | no-go；退回 wire/validator，不允许截断 |
| 86 假榜成为实体/奖励，或动态 AI AB 破坏重放 | S5-VIS-06/09、S5-ECO-10 | 禁用假榜合并/动态 AB，恢复冻结 RNG/config |
| atlas/body config 错位、只改客户端体型 | S5-VIS-05/07、S5-CR-01/02 | 战斗可临时视觉 fallback，但候选 no-go；退回 S1/S2 |
| join skin 越权、catalog mismatch 仍写经济 | S5-ECO-01/02 | 经济 fail closed；RC no-go，退回 S3/S4 修正 |
| final leave 先删实体、async handler detached、第二套账本 | S5-ECO-06/08/09、S5-OPS-01 | no-go；保留 Finalizing 并用原 hook/repository 恢复 |
| 已开始的非合格/未启用 terminal run 缺零奖励 receipt，或错误写入 ledger/outbox | S5-ECO-08/09 | RC no-go；退回 S4 修正 settlement 分支和资格投影 |
| `totalTime=0` 导致空房永不回收，或 drain 直接杀长驻 Playing 房 | S5-OPS-02/03 | 停准入并按 60/120 秒口径 drain；不得伪装玩法结算 |
| `runStartedTick` 相减、未确认 checkpoint 被承诺、AI/排名进入奖励 | S5-ECO-07～10、S5-OPS-06 | 隔离错误 settlement，按 SOP 修复/补领，不扩大错误发奖 |
| 唯一皮肤用普通 Shop SKU 重复购买 | S3 明确未开放 purchase | 下线购买入口；S3 退出不受后续购买能力影响 |
| 每食物一节点或皮肤 RNG 污染玩法 RNG | S5-VIS-09 | no-go；恢复批渲染/独立 seeded 子流 |
| 磁铁波次/真人门槛漂移、占用操作槽，或 Star/磁铁使用客户端帧率推进 | S5-VIS-04/10、S5-IN-07、S5-NET-10 | no-go；退回 S1/S2 修正资源目录、权威 tick 与 wire |
| 仍存在左半屏摇杆、半径 200 加速或 pointer 残留 | S5-IN-01～06 | no-go；退回 S2 输入实现 |
| 手改生成物或镜像不一致 | S5-02、`verify:sync`/protected paths | 从真源重新生成，禁止提交手改镜像 |

内部 RC 回滚必须以 manifest 中精确登记、数据库向前兼容且恢复器可读当前 receipt/outbox 的 commit/build 为目标。
不得尝试破坏性降 schema，不得删除未决 decision/receipt/settlement，也不得将已进入新 run 的测试账号静默搬到
Classic/TimeLimit。演练时先停新准入、执行 Active→Draining，等待或恢复退款/奖励，再切换本地候选构建。

## 6. 退出条件

- [ ] S5-01～S5-12 全部完成；S5-VIS、IN、NET、REL、ECO、OPS、CR 所有检查项均有可复现证据且无未解释失败。
- [ ] `npm run verify:all`、单元/客户端/FGUI/类型/生成/镜像门禁、真 Redis/MySQL `test:int` 和故障矩阵全部 exit 0；
  关键 Snake fixture 未被 skip。
- [ ] Creator 3.8.8 桌面预览已完成资源、战场、输入、衣柜、复活、个人结果、重连和 fallback 人工验收；无头测试
  没有冒充 Creator 证据，Creator 预览也没有冒充物理真机证据。
- [ ] 内部 RC 的五层 ID/hash、catalog/wire/policy/evidence/migration/fingerprint 全部锁定；当前没有已部署旧
  客户端，版本不匹配只明确拒绝/提示升级；回滚 manifest 精确记录兼容 commit/build。
- [ ] 所有 `runStartedTick != null` 的 terminal run 第一次成功 finalize 均有零或非零 settlement/result receipt；
  只有 `rewardEligible && coinGross > 0` 写 `currency_ledger`，只有 `rewardEligible` 且 progression effect 非空写
  单一聚合 `gameplay_outbox`；`preparing → cancelled` 与成功复活不结算。
- [ ] `onlineCoinRelive5V1` 仅作为复活策略 ID 参与候选，不存在由 S5 开启的玩家发布开关；S0～S4 功能通过
  全量门禁并经 S5-01 一次性 RC 装配后直接构成当前开发版本能力；健康异常的 fail-closed 安全闸仍有效。
- [ ] 30 分钟完整负载、至少 200 个完整 churn cycle、以 T0 计时且先冻结后断连的 60/120 秒 drain、空房
  autoDispose、reconciler/outbox replay、
  开发诊断和回滚演练成功；未决资产操作可继续收敛。
- [ ] 阶段与总状态、commit、命令计数、本地真栈/Creator 预览路径、已知限制已回写，并在 plan-v5 留下当前事实摘要。
- [ ] 用户已基于完整证据明确批准内部 RC；最终口径只描述已验证能力：

  > **内部开发候选已验证：竖版新版无尽 V2 战场（4096² 地图覆盖）+ 原作 `totalTime=0` 无尽生命周期 + 真人死亡限时选择复活 +
  > AI 独立约 2 秒重生 + 场内自动拾取磁铁 + drop-in 联机适配 + 16 套原作皮肤资源（12 套可按当前开发版规划路径获取、
  > 4 套未来金币购买分类仍为 off-sale）+ 纯外观养成 + 服务端权威装备 +
  > 可靠真人 run 奖励。未验证物理真机、生产部署、玩家灰度或渠道发行。**

## 7. 证据回写

未实际运行的命令、未打开的 Creator 工程和未注入的故障不得登记为通过。大型日志可以写绝对或仓内证据路径，
本表保留摘要、计数和结论；截图必须标明 RC commit 与视口。物理真机、生产与渠道验证必须显式记为未执行，不能
以 Creator 预览或内部 RC 演练替代。

| 状态 | commit/候选版本 | 自动验证（命令、exit code、计数、日期） | 本地真栈/故障证据 | Creator 桌面预览 / RC 演练 / 用户批准 | 备注 |
|---|---|---|---|---|---|
| `[已拍板·待实施]` | — | — | — | — | 内部开发 RC；无玩家发布开关；不含物理真机、生产或渠道发布 |

---

[← S4 · 可靠养成奖励](s4-reliable-progression-rewards.md) · [专项索引](README.md)
