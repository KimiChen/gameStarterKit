# Snake 竖版新版无尽 V2 与养成专项阶段任务

> **状态：`[进行中]`。更新时间：2026-09-05。S0、完整 S1（含 S1-12 磁铁增量）、S2 与
> S2R demo 已完成；**S3-0 收口进行中**，S3～S5 尚未实施。下一步工作计划见 §9。**<br>
> 本目录把原根计划拆成可独立实施、验证和回写证据的 S0～S5 阶段任务。根
> [plan-s.md](../../plan-s.md) 只保留兼容入口，不再维护第二份正文。阶段状态只以本页、对应阶段证据表和
> [plan-v5.md](../../plan-v5.md) 的一致结论为准。

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
底部水平中央，其他操作入口固定在摇杆上方，并同步重做命中区与多指归属。2026-09-03 的后续决策又冻结：
首发纳入场内自动拾取磁铁；Star 与磁铁共用 `320/3 unit/s` 的确定性移动内核；操作习惯默认右手，左手切换只在设备
本地持久化；首发不显示正向游玩时长，自机使用细白轮廓、AI 使用名字识别。

当前代码基线是 `snake@4`（S2R 落地时为 `snake@3`；`f2639ae` 因 state 枚举归属重构而递增 modeVersion，玩法规则不变）：在 S2 的 drop-in、4096² 无尽世界、17 条稳定态活动蛇、1030 个食物、场内磁铁
和个人 run 状态机之上，增加了 demo 金币余额与复活。开发环境先在进程内同步扣费，再把唯一余额字段
best-effort 写入 Redis `gp:snake:user:{uid}`；key 和数据均不含 `sId`。生产环境无法绑定 demo economy，
`onlineCoinRelive5V1` 面向玩家的发布开关仍关闭。Demo 衣柜、养成奖励与 Creator 验收仍属于 S3～S5。

本专项唯一目标组合为 `newEndlessPortraitV2Map4096TotalTime0`：

| 层 | 冻结 ID | 目标口径 |
|---|---|---|
| 战场 | `newEndlessPortraitV2Map4096` | 原作新版无尽 V2，仅把 4896² 边界覆盖为 4096²；保留 1000 Dot + 30 Star、出生长度 80、V2 相机/身体/路径配置和来源 `endless_tool_config` 前三波 |
| 生命周期 | `sourceEndlessTotalTime0` | `totalTime=0`、无剩余时间 HUD、无整房到点结算，world tick 继续正向推进 |
| 复活流程 | `sourceEndlessReliveFlow` | 真人死亡进入限时选择；成功恢复当前 run，放弃、超时、次数用尽或失败只结束本人 run；AI 约 2 秒独立重生 |
| 首发复活策略 | `onlineCoinRelive5V1` | Feed B 表样例冻结为 `100/200/300/300/300` 金币、5 秒选择窗；不接广告、分享、钻石、月卡与 AB |
| 联机适配 | `onlineEndlessDropInV2` | 保持 ID，S2 将层内显式 `version: 1` 升为 `version: 2`：首人启动、3 秒准备、最多 8 真人、Playing 可入、稳定态 17 条活动蛇、个人 run 结算、空房回收，以及 Star/磁铁 20 Hz 确定性移动和后续循环 gate |

S0 的旧五层/组合 hash 只作历史证据。S2 已保持另外四层 version 1 与原 hash，把联机适配层升为 version 2，
生成 layer hash `3a61016c…a53f` 与组合 hash `2c74f005…e8e7`；没有反写 S0 evidence。

## 3. 首发目标与非目标

首发必须形成两个依赖有序的闭环：先复刻竖版新版无尽 V2 的可验证战场，再在同一稳定皮肤目录上完成
Demo 收藏、解锁、装备与个人 run 奖励。16 个 internal skin 的稳定 ID 为：

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
- 磁铁是场内自动拾取物，不占 S1～S4 操作槽；首发操作区只开放加速功能，默认右手显示 S4、左手镜像后显示
  S1，其余物理槽隐藏且不命中；不借磁铁开放主动道具入口。
- 首发不显示正向游玩时长；`runStartedTick` 与 `activeTicks` 仍作为权威生命周期和结算证据保留。
- 首发不做抽卡、随机重复皮肤、限时试用、付费皮肤、赛季、拖尾/击杀/死亡特效、名牌、表情或皮肤熟练度；
  数据槽可预留，但没有实现和发布承诺。
- 不把 `totalTime=0` 解释为永不结算或永不回收：个人 run 和空房生命周期都必须闭环。

## 4. 阶段依赖与阅读导航

主发布链严格为：

```text
S0 复刻基线
  -> S1 素材与目录
      -> S2 战场与无尽生命周期
          -> S2R Demo 金币复活
              -> S3 Demo 衣柜与装备
                  -> S4 Demo 养成奖励
                      -> S5 Demo 验收
```

S1（含新增 S1-12 的磁铁资源、表现目录和 hash 门禁）、S2 与简化后的 S2R demo 已经完成。S2R 只复用现有
S2 死亡/run 状态机和同步端口，不扩展通用 shell。按 2026-09-03 的后续决策，S3～S5 也统一收敛为
进程内 demo：衣柜与养成先更新内存，再 best-effort 写入同一个 `gp:snake:user:{uid}` HASH；run 去重和
最近结果只留内存。不新增其他 Snake key、通用房间生命周期接口或后台处理链。

| 阶段文档 | 状态 | 主要结果 | 关键退出门 | 预计 |
|---|---|---|---|---:|
| [S0 · 复刻基线](s0-replication-baseline.md) | `[已完成]` | 命名配置、来源 fixture、横/竖 golden、差异决策表 | 34 个来源身份、71 项路径表、14 张 golden、55 文件逐字节复建通过 | 3–4 人日 |
| [S1 · 素材与目录](s1-assets-and-catalog.md) | `[已完成]` | 16 皮肤及表现目录，以及磁铁 `10001` 世界帧/被动 icon/aura/音效增量 | 16/16、8 个磁铁 runtime 资源、`presentationVersion=2`、三层 hash/fallback/freshness 均闭合 | 4–7 人日（估算；非工时实绩） |
| [S2 · 战场与无尽生命周期](s2-battle-and-endless-lifecycle.md) | `[已完成]` | 4096² V2 世界、17 蛇、1030 食物、磁铁、中央操作区、无尽/死亡状态机、wire v2 | config/wire/world/Star/磁铁、输入/竞态、容量/重连测试与真栈 171/171 通过 | 11–16 人日（估算；非工时实绩） |
| [S2R · Demo 金币复活](s2r-reliable-coin-relive.md) | `[已完成]` | uid 进程内余额、同步扣费、Redis 单字段 best-effort 镜像、余额 UI | 同一进程同一死亡只扣一次；Redis 失败不影响复活 | demo 简化实现 |
| S3-0 · 开工前收口（§9） | `[进行中]` | 文档漂移订正、S0 证据可复现性加注、A/B/C 三项拍板 | 5 处漂移全改；键名 grep 门无输出；三项拍板各有落笔 | 0.5–1 人日 |
| [S3 · Demo 衣柜与装备](s3-wardrobe-and-equipment.md) | `[已拍板·待实施]` | 内存 profile、Redis 镜像、解锁/装备、衣柜页面 | 同一 HASH 保存装备/拥有/碎片，不含 `sId` | demo 简化实现 |
| [S4 · Demo 养成奖励](s4-reliable-progression-rewards.md) | `[已拍板·待实施]` | 同步 run 奖励、内存去重、Redis profile、个人结果 | 同一进程同一 run 只奖一次 | demo 简化实现 |
| [S5 · Demo 验收](s5-validation-and-release.md) | `[已拍板·待实施]` | 自动化、Redis profile 检查与 Creator 桌面预览 | Demo 门禁和人工证据齐全 | demo 简化验收 |

S3～S5 不再沿用原生产级方案的工期估算，实际工程量在各阶段实现时回写。S3 完成后可试玩衣柜，
S4 完成后可试玩养成结果，S5 只验收内部 demo。任何阶段都不产生生产金币或养成资产的技术放行资格，
`onlineCoinRelive5V1` 保持关闭。

## 5. 最终架构不变量（含阶段生效点）

1. 世界逻辑以原点为中心；原作证据坐标到竖版使用 `source (x,y) -> portrait (-y,x)`，地图边界独立改为
   4096²。网格、食物、蛇身和碰撞仍使用原世界单位。
2. `maxPlayers=8` 只表示真人上限。稳定态活动蛇为 17；真人加入替换 aiLevel 401 AI，满 8 真人仍有 9 AI。
3. 房间声明 `totalTime=0`、`matchDurationTicks=0`、`hasDeadline=false` 且没有可参与比较的 `endTick`。
   只有 `hasDeadline && tick >= endTick` 才能走按时结束；Snake 无尽不调用整房 `context.settle()`。
4. 真人与 AI 的死亡策略彻底分离。真人没有 40 tick 自动复活；复活选择只冻结本人，其他玩家和 world tick
   继续；AI 约 40 tick 重生且不进入真人扣费/奖励路径。
5. S2/S2R demo 的个人 run 继续只存在于房间状态机；没有持久 run store。宽限内重连延续原 run；最终离开后
   重入创建新 run；个人结果不得把同房 phase 改成 Settle。
6. S2/S2R 在 S3 接入前由服务端 `RunSkinResolver` 固定选择默认皮肤 1；测试可由服务端 fixture 注入其他合法
   ID，但永不读取 join 自报值。自 S3 起，普通 Lobby RPC 先从 Redis 回灌进程内 profile，Snake mode 同步读取
   装备并在当前房间 run 中锁存
   `skinIdAtRunStart`；换装只影响下一次新 run，真人复活和宽限重连保持当前外观。
   ⚠ **命名口径（2026-09-05 核对）**：`skinIdAtRunStart` 目前只是**语义名**，源码里没有这个字段——
   Snake player schema 的字段叫 `skinId`，它在 `createPlayer` 时写入、run 期间不再变更，语义上已经就是
   「run 起始锁存的皮肤」。是沿用 `skinId` 只补语义注释，还是另立一个显式字段（= Schema 破坏性变更 +
   `modeVersion` bump + 三处生成镜像联动），归 S3-03 实施时决定；⛔ 在此之前不要按字面 grep 该名字找代码。
7. S2R demo 余额只按认证 `uid` 放在模块级内存，并只向 Redis 逻辑 key `gp:snake:user:{uid}` 的 `coinBalance`
   field 发起 best-effort 写入；不带 `sId`，写失败不回滚复活。
8. 皮肤完全是表现。服务端、客户端 catalog hash 不一致时禁止装备、解锁、购买等**外观目录相关**经济写；
   战斗稳定回退皮肤 1 并留下受控诊断。demo 金币复活不依赖外观 catalog。
9. S2R demo 不发奖励。S4 在 run 终局同步更新进程内 profile，并用单条 `HSET` best-effort 镜像余额、
   已拥有皮肤、碎片、XP 和成就进度。
10. S2R～S4 都是 demo，`eligibleForEnable=false`；S5 只做内部验收，不得据此宣称生产金币或养成数据可靠。
11. 磁铁使用稳定 `toolId=10001`：房间首次进入 Playing 后的 15、60、150 秒各无条件生成 10 个，即使没有资格
    真人或所有真人长度均为 50000 也不例外；随后在 300、450……秒按 150 秒周期继续。后续波次只接受状态为
    `active/deadPresentation/reliveOffering/pendingRelive/reliveSpawning/reliveCommitting/reliveReady` 且长度
    `<50000` 的真人 run，其他状态、AI 和假榜不参与门槛。磁铁存在 20 秒、拾取后生效 8 秒、真人与 AI 均可
    自动拾取，且不占操作槽。
12. Star 与磁铁权威速度固定为 `320/3 unit/s`，20 Hz 下每 tick 标量位移 `16/3 unit`，按 S2 冻结的
    milli/micro-unit 余数算法循环产生 `5.333/5.333/5.334`；每次方向保持期使用独立确定性 RNG 取闭区间
    `34..67 tick`，实体半径边界、同 tick 变向顺序和撞边反弹均由服务端权威推进。
13. 首发 HUD 不显示正向游玩时长；自机用细白轮廓、AI 用名字识别。操作习惯默认右手，左手模式只镜像四槽
    功能顺序并持久在设备本地，不进入账号、Lobby RPC、玩法 wire 或数据库；切换必须先写后用，写入失败保持/
    回滚右手并给出受控诊断。

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

## 7. 当前内容归属表

该表登记当前方案的唯一实施真源。2026-09-03 以前的生产级 S2R～S5 设计已被 demo 决策取代，
不再要求按旧任务数量或旧持久化内容逐项覆盖。

| 当前内容 | 实施真源 |
|---|---|
| 目标、非目标、批准来源、阶段总表、状态模板 | 本 README |
| 坐标证据、配置冻结、`totalTime=0` 来源、现状差距、规则差异 | [S0](s0-replication-baseline.md) |
| 素材授权、16 皮肤、atlas/body 配置、背景/食物/磁铁/音效表现目录 | [S1](s1-assets-and-catalog.md) |
| 竖屏操作、Star/磁铁权威规则、AI/假榜、无尽与死亡状态机、wire/chunk、战场 View | [S2](s2-battle-and-endless-lifecycle.md) |
| Demo 金币复活、uid 余额、Redis 单字段镜像与限制 | [S2R](s2r-reliable-coin-relive.md) |
| Demo 养成产品、内存/Redis profile、RPC、装备/解锁、衣柜 Feature 与页面 | [S3](s3-wardrobe-and-equipment.md) |
| 房间内 run 统计、同步奖励公式、Redis 成长投影与个人结果 | [S4](s4-reliable-progression-rewards.md) |
| 视觉/输入/协议、Redis profile 和 Creator demo 验收 | [S5](s5-validation-and-release.md) |

## 8. 总状态与证据汇总

阶段完成时必须把具体证据先写入阶段文件；此处只汇总最终状态。自动验证至少记录命令、exit code、关键计数
和日期；Creator 证据记录版本、视口、截图/日志路径和人工结论。

| 阶段 | 状态 | commit | 自动验证 | Creator/真栈证据 | 备注 |
|---|---|---|---|---|---|
| S0 | `[已完成]` | `7a04131` | unit 10/10；evidence rebuild 55/55 byte-identical；SHA 54/54；inventory 14/5 | [14 张来源驱动静态重建及 metadata](evidence/s0/goldens/manifest.json) | 组合 hash `2319d173…f87e2`；作为已冻结历史输入，S2 未反写 |
| S1 | `[已完成]` | `d18846a`（原基线）+ `bc5bb97`（S1-12） | converter 13/13、S1 server 5/5、client catalog 11/11；全量 client 380/380、server 489/489；typecheck/sync/inventory/SHA 全绿 | [16 张预览、两张 contact sheet 与磁铁完整性证据](evidence/s1/README.md)；Creator aura 终验留 S5 | public `a1cdecbc…b075`、server `9ed3762e…fa19` 保持不变；client 升为 `8615596a…d629`，`presentationVersion=2` |
| S2 | `[已完成]` | `04072d4` | `verify:all` exit 0：client 384/384、server 495/495、FGUI 66/66、inventory 110/110；真栈 `test:int` 171/171；codegen/fingerprint/S1 freshness 全绿 | `750 × 1624` 无头 View/输入/资源 fixture 已通过；Creator 3.8.8 与真机视觉终验仍归 S5 | `snake@2`；online layer `3a61016c…a53f`；组合 `2c74f005…e8e7`；仅测试经济，发布开关关闭 |
| S2R | `[已完成]` | `0b19440` | `verify:all` exit 0：client 384/384、server 499/499、FGUI 66/66、inventory 110/110；typecheck/codegen/sync 全绿 | 真栈 `test:int` 172/172，含 Redis 仅 `coinBalance` 用例 | `snake@3` demo；`eligibleForEnable=false`；发布开关关闭 |
| S3-0 | `[进行中]` | 本次 | 建档基线 `verify:all` exit 0：client 423/423、server 541/541、FGUI 66/66、inventory 14 能力/5 入口（2026-09-05 实测；README §8 上面各行的 384/499 等计数是钉在各自 commit 的历史值，不代表 HEAD） | 不适用（纯文档订正） | 见 §9；A/B/C 三项拍板未完成前不进 S3-1 |
| S3 | `[已拍板·待实施]` | — | — | — | 内存先记；同一 HASH 镜像衣柜字段 |
| S4 | `[已拍板·待实施]` | — | — | — | 内存同步奖励；同一 HASH 镜像养成字段 |
| S5 | `[已拍板·待实施]` | — | — | — | 内部 demo 验收；不含生产发布 |

内部 demo 口径只能在 S5 全部退出条件满足并经用户确认后使用：

> **竖版新版无尽 V2 战场（4096² 地图覆盖）+ 原作 `totalTime=0` 无尽生命周期 + 真人死亡限时选择复活 +
> AI 独立约 2 秒重生 + 场内自动拾取磁铁 + drop-in 联机适配 + 16 套原作皮肤 + Demo 衣柜、装备与个人
> run 奖励。衣柜和养成先在当前进程内生效，再 best-effort 镜像到同一个 Redis HASH，生产功能保持关闭。**

## 9. 下一步工作计划（2026-09-05 全量核对后制定）

本节来源：对 docs/s/ 全部 8 份文档逐条核对源码后的结论。⚠ 与前面各节冲突时以本节为准，
前面各节的订正已随 S3-0 完成。

### 9.1 三项必须先拍板的问题（⛔ 未拍板不进 S3-1）

| ID | 问题 | 现状证据 | 选项 |
|---|---|---|---|
| **A** | 不变量 8「catalog hash 不一致时禁止外观经济写」目前**没有活的判据** | `index.ts` 调 `resolveServerBattleSkin(requestedSkin)` **不传 peerHash**，而形参默认值就是 `PUBLIC_SNAKE_SKIN_CATALOG_HASH` → 比对恒真；`canWriteSnakeSkinCosmetics` 生产调用点为 0；Snake wire 里没有客户端上报皮肤目录 hash 的通道（`layerHashes`/`configHash` 是 ruleset 配置 hash，不是皮肤目录 hash） | ① `equip/unlock` 请求加必选 `catalogHash`（改域 descriptor + 向量 sidecar，形状定了不好改）；② 显式承认该判据只在文档层，删去或降级不变量 8 |
| **B** | 个人结果契约扩 v1 还是造 v2 | `ISnakeRunResultV1` 已预留 `rewardPolicyVersion` / `rewardReceiptId` / `rewardSummary` 三个可选字段；S4 文档写的是新造 `resultVersion: 2` 的 `ISnakeDemoRunResult` | ① 扩 v1：不动 token 名与客户端订阅；② 造 v2：要 bump `modeVersion` 并联动三处生成镜像 |
| **C** | 「再来一局」的实现路径 | 服务端**没有**房内重开 run 的能力：`runId` 只在 `createPlayer` 分配，Finalized 后玩家留在房里但没有任何命令能开新 run | ① 离房重进：S4 零服务端改动；② 房内重开：新增命令 + 状态机分支 |

### 9.2 两个不可执行的陷阱（⛔ 排期时不要踩）

1. **`docs/s/evidence/s0/**` 的任何编辑都不可执行。** 该目录 `SHA256SUMS` 第 1 行就是 `README.md`
   自身的哈希，而重钉需要 `tools/snake-s0-replication/cli.mjs --source <外部归档>`（`--write` / `--check`
   都强制该参数），锁定归档在本机已不存在 → **S0 证据当前不可重新生成**，加注只能写在
   [s0-replication-baseline.md](s0-replication-baseline.md)。⚠ S1 相反：其 `--write` / `--check` 是
   repo-only，`evidence/s1` 可以重钉。
2. **Lobby RPC 域 descriptor / 向量 sidecar / 全部 handler 必须同批提交。** 端点文件集合与
   `ALL_LOBBY_RPC_TYPES` 必须**双向相等**，缺一启动即 throw；codegen 缺 sidecar 直接 fail-fast。
   分两批做，中间那一批必红。

### 9.3 S3-0 收口（本轮）

| 步 | 内容 | 退出门 |
|---|---|---|
| 0.1 | 提交 Creator 预览实测的 CocosView 父锚居中修复 | ✅ 已由 `e9e6900` 落地 |
| 0.2 | 修漂移 ①②⑤：Redis 逻辑键 → `gp:snake:user:{uid}`；`kSnakeUser` 真源路径；`snake@3` 时点标注 | `grep -rn 'snake:user' docs/ plan-v5.md \| grep -v 'gp:snake:user'` 无输出。⚠ ⛔ 判据不能写成 `…:{uid}` 的整串：s2r 的示例占位是 `{user-42}`，整串模式会漏掉唯一一条可直接粘进 redis-cli 的命令 |
| 0.3 | 修漂移 ③④：S3-01 业务目录真源指向服务端生成器；`HGETALL` → 白名单 `HMGET`；`skinIdAtRunStart` 统一口径 | `grep -rn 'HGETALL' docs/s/ \| grep -viE '禁\|⛔\|不用'` 无输出——即 ⛔ 剩余提及必须**全部**落在禁令语境里，不得出现在任何「尝试/使用 HGETALL」的动作句 |
| 0.4 | S0 页加注：byte-for-byte 结论的绑定 commit、golden 待重钉、§2.2/§2.8「当前事实」列的时点声明 | 加注只落在 `docs/s/*.md`，`docs/s/evidence/s0/` 零改动 |
| 0.5 | 拍板 §9.1 的 A / B / C | 三项各有明确落笔 |

### 9.4 S3 主线（拍板后）

| 步 | 内容 | 退出门 |
|---|---|---|
| S3-1 | 冻结 demo 业务目录：改 `tools/snake-s1-assets/core.mjs` 产出真实 rarity/acquisition/碎片门槛 → `--write` 重生；放宽 `skinBusinessCatalog.ts` validator 的 approved 分支；翻 `SNAKE_SKIN_COSMETIC_WRITES_ENABLED`；**同批**改 `snake-s1-assets.test.ts` 的 hash 与 `false` 断言 | 服务端测试全绿；新的 server business hash 回写 §8 与 `evidence/s1` |
| S3-2 | 新建 `rooms/modes/snake/cosmeticProfile.ts`：模块级 `Map<uid, profile>` + `HMGET` 回灌 + 单条 `HSET` best-effort。⚠ 读函数必须返回**深拷贝**；⛔ 本步只写三个 cosmetic field，`coinBalance` 的合并留到 S4（提前合并会造出新的覆盖窗口） | 单测覆盖默认值 / 损坏 JSON / 未拥有 / 碎片边界 / 重复操作 / 返回副本 |
| S3-3 | **同批**新建域 descriptor + 向量 sidecar + 三个 ws 端点；跑 `codegen:features` → `protocol-fingerprint.mjs --write` | 服务端可启动；lobbyRpc 契约与向量测试全绿 |
| S3-4 | mode 接入：resolver 入参加 uid，读已预热 profile，校验存在且已拥有，非法回退皮肤 1，run 内锁存 | join 自报皮肤无效；run 中换装不改当前蛇的 fixture |
| S3-5 | 客户端衣柜 feature（首版取 `kind: "cocos"` 纯节点页——仓内没有衣柜 FGUI 包）+ feature 登记；再跑 `codegen:features` + `sync:shared` | `test:client` / `test:fgui` 绿 |
| S3-6 | 为新增镜像文件补 `.meta` | `verify:sync` 绿。⚠ 风险已降低：2026-09-05 Creator 会话实测未重写脚本合成的 `.meta`（[证据](../evidence/creator-2026-09-05/README.md)），可优先按 `features/redeem` 的合成先例做，Creator 只做确认 |

S4 顺序：S4-02（shared 纯公式 + fixture，零副作用可独立测）→ S4-01（补 `maxLength` / `meaningfulInputCount` /
`reliveCoinSpent`；其余 run 统计 schema 里已有）→ S4-03（progression + 去重）→ S4-04（结果 wire 与页面）。
奖励必须插在 run 转入 Finalized 之后、下发 `SnakeRunResult` 之前。

### 9.5 四条需纳入 S5 的遗漏项

- 表现目录里 `walls[]`、`star.themeVariants`、`identity` 被 catalog 严格校验，但 `view/` 零消费 —— 是
  「已登记但永不渲染」的死条目，S5 收口前要么接上要么显式标注。
- `SnakeWorldView` 的背景绘制写死 `palette.dark`，目录里另有 light 分支，该选择当前无处登记。
- `scripts/fault-matrix.config.json` 无 snake 条目，且 `test:faults` **不在** `verify:core` / `verify:all`
  链里 → S5-04「注入 Redis 写失败」只能是构造器注入，永远进不了自动门禁，需在 S5 写明。
- `apps/server/sql/schema.sql` 不在 `verify:protected-paths` 覆盖内 → S5 退出条件「SQL schema 无本专项
  差异」没有机检，需标为人工核对项。

---

下一篇：[S0 · 复刻基线](s0-replication-baseline.md)
