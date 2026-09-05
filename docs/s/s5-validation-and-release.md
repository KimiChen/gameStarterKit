# S5：Demo 全链路验收与 Creator 预览

[上一阶段：S4 Demo 养成奖励](s4-reliable-progression-rewards.md) · [专项索引](README.md)

## 状态与范围

| 项目 | 口径 |
|---|---|
| 状态 | `[已拍板·待实施]` |
| 目标 | 验证 S0～S4 的 demo 动线、生成镜像、自动测试和 Creator 3.8.8 桌面预览 |
| 数据范围 | 进程内衣柜/养成 + Redis 单 HASH profile 投影 |
| 交付物 | 一个可复现的内部 demo 候选和证据记录 |
| 不包含 | 物理真机、生产部署、玩家灰度、渠道发行和生产资产可靠性 |

S5 只回答“这个 demo 是否能完整演示并通过仓库门禁”。它不把 S2R～S4 的进程内实现包装成生产能力，
也不要求为演示项目补建持久化、补偿、后台处理或发布基础设施。

## 冻结口径

内部 demo 候选继续锁定五层玩法身份：

| 层 | 冻结 ID | 核心语义 |
|---|---|---|
| 战场 | `newEndlessPortraitV2Map4096` | 4096² 竖版世界、1000 Dot + 30 Star |
| 生命周期 | `sourceEndlessTotalTime0` | 无房级倒计时与统一结算 |
| 复活流程 | `sourceEndlessReliveFlow` | 真人限时选择，AI 约 40 tick 独立重生 |
| 复活策略 | `onlineCoinRelive5V1` | `100/200/300/300/300`，5 秒选择窗 |
| 联机适配 | `onlineEndlessDropInV2` | 最多 8 真人、稳定态 17 蛇、Playing 可入 |

`onlineCoinRelive5V1` 只是配置 ID。生产环境继续禁用 demo economy，S5 不开启玩家发布开关。

数据口径固定为：

- Redis 逻辑 key 只有 `gp:snake:user:{uid}`，允许字段精确为 `coinBalance`、`equippedSkinId`、
  `ownedSkinIds`、`fragmentBalances`、`snakeXp` 和 `achievementProgress`。
- key、field 和 value 都不增加 `sId`；集合/映射字段使用经过严格校验的 JSON。
- 当前 profile 先在进程内更新，再 best-effort 镜像 Redis；run 去重和最近结果只在当前进程内存在。
- Redis 写失败不使已经完成的复活或奖励失败。
- Redis 写成功时重启后可回灌 profile；未写成功的变化、run 去重和最近结果不会恢复。

## 实施任务

### S5-01：冻结 demo 候选

- [ ] 记录 commit、五层 ID/hash、catalog、gameplay modeVersion、协议 fingerprint 和客户端资源版本。
- [ ] 确认 S0～S4 的状态、实现和证据一致，未完成项不能被 S5 文案标成通过。

### S5-02：执行仓库自动门禁

- [ ] 运行并记录：

```bash
npm run verify:all
npm run verify:sync
npm run test:fgui
```

- [ ] 在本地 Redis 可用时运行 Snake profile 集成用例：

```bash
cd apps/server
node --import tsx --test --test-concurrency=1 test/int/snake-*-demo.test.ts
```

- [ ] 记录日期、exit code 和关键测试计数。未运行的命令不得写“通过”。

### S5-03：执行无头玩法验收

- [ ] 固定 seed 验证 4096² 世界、17 蛇、1030 食物、Star/磁铁运动和 1800 tick 后继续 Playing。
- [ ] 验证左右手操作区、Safe Area 注入、多 pointer 归属、输入 seq 和重连。
- [ ] 验证五档复活、余额不足、第六次死亡、保护时间、AI 独立重生和个人结束。
- [ ] 验证 S3 衣柜、S4 奖励、连续两局换装与结果只影响本人。

### S5-04：执行 demo 数据检查

- [ ] 用非零 `sId` 进入房间，确认 Redis key 与 `sId=0` 时相同。
- [ ] 确认 Redis HASH 只有六项允许字段，没有 `sId`、run、结果、处理标记或请求字段。
- [ ] 注入 Redis 写失败，确认复活与奖励结果仍成功，且留下受控 warning。
- [ ] 在当前进程重复提交同一死亡和同一 run 终局，分别确认只扣一次、只奖一次。
- [ ] 重启开发进程，确认写成功的衣柜/养成 profile 可回灌，而 run 去重与最近结果会重置。

### S5-05：完成 Creator 3.8.8 桌面预览

- [ ] 用 `750 x 1624` 视口和 `safeBottom=0/100` 验证战场、HUD、操作区和弹窗不重叠。
- [ ] 检查 16 套皮肤预览、装备、合成、红点、资源 fallback 和动态 FGUI 打开/关闭。
- [ ] 走完死亡、金币复活、余额不足、放弃、超时、第六次死亡和个人结果页。
- [ ] 连续完成两局，验证 XP、等级、碎片、成就、新解锁皮肤及下一局外观。
- [ ] 记录 Creator 版本、commit、视口、操作步骤、截图/录屏和控制台日志。

### S5-06：回写 demo 结论

- [ ] 把真实命令结果和 Creator 证据写入本页、专项 README 与 `plan-v5.md`。
- [ ] 全部完成后仅标记 `readyForDemoApproval=true`，由用户决定是否接受内部 demo。
- [ ] 最终说明必须保留 best-effort 写可能丢数据、多实例不一致和生产关闭三项限制。

## 验收矩阵

### 战场与输入

| ID | 断言 | 证据 |
|---|---|---|
| S5-WORLD-01 | 4096²、17 蛇、1000 Dot + 30 Star，无房级 deadline | 固定 seed fixture |
| S5-WORLD-02 | Star/磁铁按 20 Hz 权威推进，重连 baseline 一致 | tick 快照 |
| S5-WORLD-03 | 左右手、Safe Area 与多指输入不互抢 | 自动事件轨迹 |
| S5-WORLD-04 | 最后真人离开后房间可回收，集合回到基线 | churn 快照 |

### Demo 金币复活

| ID | 断言 | 证据 |
|---|---|---|
| S5-RELIVE-01 | 五档费用为 `100/200/300/300/300`，第六次不再提供 | 死亡序列 |
| S5-RELIVE-02 | 同一业务死亡换请求 ID 重试仍只扣一次 | 余额前后值 |
| S5-RELIVE-03 | S2R 单独运行时 key 不含 `sId`，HASH 只有 `coinBalance` | 真 Redis `HKEYS` |
| S5-RELIVE-04 | Redis 写失败不撤销复活 | 故障注入与 warning |
| S5-RELIVE-05 | 真人选择只冻结本人；AI 约 40 tick 重生 | 双真人/AI fixture |

### Demo 衣柜与奖励

| ID | 断言 | 证据 |
|---|---|---|
| S5-GROW-01 | 客户端自报皮肤无效，装备只影响下一 run | 连续两局快照 |
| S5-GROW-02 | 四款碎片门槛、超额保留和重复解锁正确，并写入同一 Redis HASH | profile 与 `HKEYS` + 白名单 `HMGET` 前后值（⛔ 判据不用 `HGETALL`，09·R1 全仓禁令） |
| S5-GROW-03 | 同一 run 只奖一次，AI/假榜/排名不发账号奖励 | 重复终局 fixture |
| S5-GROW-04 | 金币/XP 硬顶、等级、成就和碎片公式边界正确 | 参数化测试 |
| S5-GROW-05 | 结果只推送本人，其他玩家继续 Playing | 双真人 fixture |
| S5-GROW-06 | 写成功的 profile 可在重启后回灌；去重和最近结果不恢复 | 重启前后快照 |

### Creator

| ID | 断言 | 证据 |
|---|---|---|
| S5-CR-01 | 资源导入、`.meta`/UUID、动态包与 SpriteFrame 正常 | 导入日志/截图 |
| S5-CR-02 | `750 x 1624` 下 HUD、摇杆、按钮和弹窗无重叠 | 两组 Safe Area 录屏 |
| S5-CR-03 | 16 套皮肤、衣柜、复活和结果页完整可操作 | 流程录屏 |
| S5-CR-04 | 资源缺失时有稳定 fallback，不阻断退出 | 故障截图/日志 |

## 退出条件

- [ ] S5-01～S5-06 全部完成，验收矩阵均有真实证据。
- [ ] 全量自动门禁和 Snake Redis profile 用例通过，生成镜像无漂移。
- [ ] `GameMode.ts`、`GameRoom.ts` 和 SQL schema 无本专项差异。
- [ ] Creator 3.8.8 桌面预览完成；没有用无头测试冒充 Creator 证据。
- [ ] 文档只宣称内部 demo，不宣称生产金币或养成数据可靠。
- [ ] 用户基于绑定 commit 的证据明确接受后，S5 才能标记 `[已完成]`。

## 已知限制

- 物理真机、真实 Safe Area、真机多指和移动端性能未验证。
- Redis 写失败期间的衣柜/养成变化会在进程重启后丢失；去重与最近结果总会重置。
- 多进程下同账号数据可能分叉或覆盖。
- Redis 短暂失败后不会自动补写。
- 生产环境保持禁用，生产部署与渠道发行另立任务。

## 证据回写

| 状态 | commit | 自动验证 | Redis / Creator 证据 | 备注 |
|---|---|---|---|---|
| `[已拍板·待实施]` | - | - | - | 内部 demo 候选；不含物理真机和生产发布 |

---

[上一阶段：S4 Demo 养成奖励](s4-reliable-progression-rewards.md) · [专项索引](README.md)
