# Snake 竖版新版无尽 V2 与养成专项阶段任务

> **状态：`[已拍板·待实施]`。更新时间：2026-09-03。**<br>
> 本目录把原根计划拆成可独立实施、验证和回写证据的 S0～S5 阶段任务。根
> [plan-s.md](../../plan-s.md) 只保留兼容入口，不再维护第二份正文。文档落盘不表示任何实现阶段已经完成。

## 1. 文档定位与优先级

- [plan-v5.md](../../plan-v5.md) 仍是全仓“当前已经实现什么、还欠什么”的唯一真相；本目录描述下一轮
  Snake V2 无尽与养成专项的已拍板目标、实施顺序和阶段证据。
- [docs/snakeoff/](../snakeoff/README.md) 是早期私人房/90 秒方案与来源台账。它仍可用于理解首版和查素材来源，
  但其中“4 真人、Waiting/Ready、房主 Start、90 秒候选”等口径不适用于本专项；冲突时以本目录为准。
- 实际实现还必须服从 [整体设计](../OVERVIEW.md)、[服务端约束](../SERVER.md)、
  [客户端约束](../CLIENT.md) 和根 [AGENTS.md](../../AGENTS.md)。阶段文档不能授权手改生成物或绕开一致性边界。
- 每完成一个阶段，先在对应阶段文件登记 commit、命令结果和人工证据，再在本页状态表汇总，并在
  [plan-v5.md](../../plan-v5.md) 留下当前事实摘要。

固定状态标签只有：`[已拍板·待实施]`、`[进行中]`、`[已完成]`、`[阻塞·需 Creator]`、`[有意不做]`。
未实际运行的命令不得登记为通过。

## 2. 批准来源、当前基线与目标

批准来源是 2026-09-03 用户会话指令：参考
`/Users/kimi/work/tanchishe/wegameVersion/` 的原游戏新版无尽模式；横版世界改为竖版；获准复用原作素材；
战场格子、食物颜色、AI 皮肤等表现需一致；同时规划纯外观皮肤养成。后续补充拍板要求把虚拟摇杆移到
底部水平中央，其他操作入口固定在摇杆上方，并同步重做命中区与多指归属。

当前代码基线是：drop-in 自由加入、最多 8 真人、真人不足由 AI 填到 8 条活动蛇、首人开局、Playing 可入、
90 秒限时计分、死亡约 2 秒自动复活并保分。该事实以 [plan-v5.md](../../plan-v5.md) 为准，是本专项要替换的
现状，不是目标生命周期。

本专项唯一目标组合为 `newEndlessPortraitV2Map4096TotalTime0`：

| 层 | 冻结 ID | 目标口径 |
|---|---|---|
| 战场 | `newEndlessPortraitV2Map4096` | 原作新版无尽 V2，仅把 4896² 边界覆盖为 4096²；保留 1000 Dot + 30 Star、出生长度 80、V2 相机/身体/路径配置 |
| 生命周期 | `sourceEndlessTotalTime0` | `totalTime=0`、无剩余时间 HUD、无整房到点结算，world tick 继续正向推进 |
| 复活流程 | `sourceEndlessReliveFlow` | 真人死亡进入限时选择；成功恢复当前 run，放弃、超时、次数用尽或失败只结束本人 run；AI 约 2 秒独立重生 |
| 首发复活策略 | `onlineCoinRelive5V1` | Feed B 表样例冻结为 `100/200/300/300/300` 金币、5 秒选择窗；不接广告、分享、钻石、月卡与 AB |
| 联机适配 | `onlineEndlessDropInV2` | 首人启动、3 秒准备、最多 8 真人、Playing 可入、稳定态 17 条活动蛇、个人 run 结算、最后真人离开后空房回收 |

## 3. 首发目标与非目标

首发必须形成两个依赖有序的闭环：先复刻竖版新版无尽 V2 的可验证战场，再在同一稳定皮肤目录上完成
永久收藏、解锁、装备与可靠个人 run 奖励。16 个 internal skin 的稳定 ID 为：

```text
1, 2, 3, 4, 10, 11, 101, 111,
112, 132, 133, 139, 401, 403, 411, 701
```

下列事项不属于本专项首发：

- 不改回横版，不用 `4096/4896` 对世界单位做整体缩放，也不按屏幕宽高拉伸世界。
- 不移植原作私有网络协议、账号、支付、广告、分享、月卡、临时皮肤、动态 AB 或商业活动系统。
- 不组合独立 TimeLimit 90 秒模式，不保留第 1800 tick 自动收局或隐藏超时兜底。
- 不允许客户端自报未经服务端验证的 `skinId`，也不让皮肤改变速度、初始长度、转向、碰撞或得分。
- 不把 86 个假榜条目生成场内实体或纳入奖励，不把 AI 死亡残骸公式误作真人资产奖励。
- 首发不做抽卡、随机重复皮肤、限时试用、付费皮肤、赛季、拖尾/击杀/死亡特效、名牌、表情或皮肤熟练度；
  数据槽可预留，但没有实现和发布承诺。
- 不把 `totalTime=0` 解释为永不结算或永不回收：个人 run 和空房生命周期都必须闭环。

## 4. 阶段依赖与阅读导航

主发布链严格为：

```text
S0 复刻基线
  -> S1 素材与目录
      -> S2 战场与无尽生命周期
          -> S2R 可靠金币复活
              -> S3 衣柜与装备
                  -> S4 可靠养成奖励
                      -> S5 验收与发布
```

S1 的转换脚本可在 S0 尾期并行；S2R 的数据库与 shell 设计可在 S2 后段并行，但集成必须建立在 S2
死亡/run 状态机之上；S4 的奖励策略设计可在 S3 UI 后段并行，但发布门禁仍要求 S3、S4 全部完成。

| 阶段文档 | 状态 | 主要结果 | 关键退出门 | 预计 |
|---|---|---|---|---:|
| [S0 · 复刻基线](s0-replication-baseline.md) | `[已拍板·待实施]` | 命名配置、来源 fixture、横/竖 golden、差异决策表 | 来源、数值、`totalTime=0` 与截图可重复核验 | 3–4 人日 |
| [S1 · 素材与目录](s1-assets-and-catalog.md) | `[已拍板·待实施]` | 16 皮肤及表现目录、转换产物、资源/授权台账 | 全目录生成以及 rect/resource/hash 校验通过 | 3–5 人日 |
| [S2 · 战场与无尽生命周期](s2-battle-and-endless-lifecycle.md) | `[已拍板·待实施]` | 4096² V2 世界、17 蛇、1030 食物、中央操作区、无尽/死亡状态机、wire v2 | world golden、输入/竞态、容量/重连与定向测试通过 | 9–13 人日 |
| [S2R · 可靠金币复活](s2r-reliable-coin-relive.md) | `[已拍板·待实施]` | awaited hooks、最小 run/checkpoint、decision/receipt、扣费/应用/激活/退款恢复 | 所有崩溃窗口不吞币、不双扣、不重复复活 | 4–6 人日 |
| [S3 · 衣柜与装备](s3-wardrobe-and-equipment.md) | `[已拍板·待实施]` | `snakeCosmetic` Feature/RPC、Bag/User 存储、解锁/装备、FGUI | 权威装备、并发、重连与 fallback 测试通过 | 6–10 人日 |
| [S4 · 可靠养成奖励](s4-reliable-progression-rewards.md) | `[已拍板·待实施]` | 完整 run 账本、durable settlement、金币/经验/碎片 outbox | 各结束原因和崩溃窗口不漏奖、不双发 | 7–11 人日 |
| [S5 · 验收与发布](s5-validation-and-release.md) | `[已拍板·待实施]` | 自动化、真栈故障、Creator 与兼容/发布证据 | 全部门禁和人工证据齐全 | 2–3 人日 |

合计约 34–52 人日，不含最终 FGUI 美术制作和反复数值调优。S3 完成可供内部试玩；对玩家宣称“养成系统完成”
必须等 S4 的可靠奖励闭环完成。S2R 全部门禁通过只产生金币复活的技术放行资格；
`onlineCoinRelive5V1` 实际发布开关仍保持关闭，S5 是执行最终 go/no-go 与开启动作的唯一 owner。

## 5. 最终架构不变量（含阶段生效点）

1. 世界逻辑以原点为中心；原作证据坐标到竖版使用 `source (x,y) -> portrait (-y,x)`，地图边界独立改为
   4096²。网格、食物、蛇身和碰撞仍使用原世界单位。
2. `maxPlayers=8` 只表示真人上限。稳定态活动蛇为 17；真人加入替换 aiLevel 401 AI，满 8 真人仍有 9 AI。
3. 房间声明 `totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false` 且没有可参与比较的 `endTick`。
   只有 `hasDeadline && tick >= endTick` 才能走按时结束；Snake 无尽不调用整房 `context.settle()`。
4. 真人与 AI 的死亡策略彻底分离。真人没有 40 tick 自动复活；复活选择只冻结本人，其他玩家和 world tick
   继续；AI 约 40 tick 重生且不进入真人扣费/奖励路径。
5. S2 只使用无资产副作用的内存/测试 run store；自 S2R 起，每次最终准入都必须在创建蛇实体前持久创建或
   恢复唯一 OPEN `runId`。宽限内重连延续原 run；最终离开后重入创建新 run；个人结果不得把同房 phase
   改成 Settle。
6. S2/S2R 在 S3 接入前由服务端 `RunSkinResolver` 固定选择默认皮肤 1；测试可由服务端 fixture 注入其他合法
   ID，但永不读取 join 自报值。自 S3 起，同一 resolver 才读取所有权和装备。所有阶段都把结果持久锁存为
   不可变 `skinIdAtRunStart`；换装只影响下一次新 run，真人复活和宽限重连保持当前外观。
7. S2R 建立的最小 run/checkpoint 与 `preparePlayerAdmission`、`preparePlayerFinalLeave` 是后续唯一基础；
   S3/S4 只能扩展或复用，不能另建 Snake 专属旁路。
8. 皮肤完全是表现。服务端、客户端 catalog hash 不一致时禁止装备、解锁、购买等**外观目录相关**经济写；
   战斗稳定回退皮肤 1 并留下受控诊断。金币复活不依赖外观 catalog，而由 room config hash、
   `relivePolicyVersion` 与复活收据单独守门。
9. S2R checkpoint 只确认准入、复活与无奖励离场冻结，不发奖。自 S4 起，只有可奖励 run 的首次
   reward-finalize 才能在同一事务写 settlement、currency ledger 与 gameplay outbox；只承诺
   `confirmedThroughTick` 以内的持久证据不漏不重。
10. S2R 只判定 `eligibleForEnable=true` 并提交技术证据，不改面向玩家的功能开关；S5 汇总全部阶段、Creator、
    运维与回滚证据后，才可作为唯一 owner 执行实际开启。

## 6. 真源、生成和镜像边界

涉及契约或生成物时按下列顺序执行，只有修改 `protocol/` 时才显式重钉 fingerprint：

```text
修改 shared 手写真源 / Snake schema / feature descriptor
-> npm --workspace @game/server run codegen:gameplays
-> npm --workspace @game/server run codegen:features
-> npm run sync:shared
-> node scripts/protocol-fingerprint.mjs --write   # 仅协议真源发生预期变化时
-> npm run sync:client
-> 类型检查与分层测试
```

禁止手改 `apps/shared/src/gameplays/generated/`、`apps/server/src/rooms/schema/generated/`、
`apps/client/src/gameplay/catalog.generated.ts`、`apps/shared/src/protocol/lobbyRpc/registry.generated.ts`、
`apps/client/src/generated/`、`apps/client/src/shared/` 和 `apps/Cocos/assets/src/`。相对导入不带扩展名，
shared 继续保持零依赖，客户端 View/Logic 与 FairyGUI 动态加载边界不变。

## 7. 原计划内容覆盖表

该表用于验证拆分不是删减。阶段文件可引用前置阶段冻结值，但同一要求只在一个文件中作为实施真源维护。

| 原 `plan-s.md` 内容 | 新归属 |
|---|---|
| 目标、非目标、批准来源、阶段总表、状态模板 | 本 README |
| 坐标证据、配置冻结、`totalTime=0` 来源、现状差距、规则差异 | [S0](s0-replication-baseline.md) |
| 素材授权、16 皮肤、atlas/body 配置、背景/食物/音效表现目录 | [S1](s1-assets-and-catalog.md) |
| 竖屏操作、世界规则、AI/假榜、无尽与死亡状态机、wire/chunk、战场 View | [S2](s2-battle-and-endless-lifecycle.md) |
| 金币复活写路径、最小 run/checkpoint、准入/离场 hooks、恢复与退款 | [S2R](s2r-reliable-coin-relive.md) |
| 养成产品、Bag/User、RPC、装备/解锁、衣柜 Feature 与页面 | [S3](s3-wardrobe-and-equipment.md) |
| 完整真人 run 账本、结算协议、奖励公式、个人结果 | [S4](s4-reliable-progression-rewards.md) |
| 视觉/输入/协议/数据/Creator 验收、真栈故障、发布风险 | [S5](s5-validation-and-release.md) |

## 8. 总状态与证据汇总

阶段完成时必须把具体证据先写入阶段文件；此处只汇总最终状态。自动验证至少记录命令、exit code、关键计数
和日期；Creator 证据记录版本、视口、截图/日志路径和人工结论。

| 阶段 | 状态 | commit | 自动验证 | Creator/真栈证据 | 备注 |
|---|---|---|---|---|---|
| S0 | `[已拍板·待实施]` | — | — | — | — |
| S1 | `[已拍板·待实施]` | — | — | — | — |
| S2 | `[已拍板·待实施]` | — | — | — | — |
| S2R | `[已拍板·待实施]` | — | — | — | 只产出技术资格；实际开关保持关闭至 S5 |
| S3 | `[已拍板·待实施]` | — | — | — | — |
| S4 | `[已拍板·待实施]` | — | — | — | — |
| S5 | `[已拍板·待实施]` | — | — | — | — |

最终发布口径只能在 S5 全部退出条件满足后使用：

> **竖版新版无尽 V2 战场（4096² 地图覆盖）+ 原作 `totalTime=0` 无尽生命周期 + 真人死亡限时选择复活 +
> AI 独立约 2 秒重生 + drop-in 联机适配 + 16 套原作皮肤 + 纯外观养成 + 服务端权威装备 +
> 可靠真人 run 奖励。**

---

下一篇：[S0 · 复刻基线](s0-replication-baseline.md)
