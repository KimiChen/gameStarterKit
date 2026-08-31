# 《Underground Idle》数据、服务端与内容配置

> [返回总目录](README.md) · [上一篇：页面体验、客户端与 WS-RPC](04-client-and-rpc.md) · [下一篇：指标、测试、路线图与完成定义](06-testing-and-roadmap.md)

> 文档状态：初始设计，本文所列存档、服务端写路径、幂等语义与内容配置均待实施。

## 1. 数据设计

### 1.1 权威边界

| 数据 | 首版真源 | 说明 |
| --- | --- | --- |
| 账号、会话、角色存在性 | 外部 WebPlatform | 本玩法不接触其数据库或业务源码 |
| Underground Idle 状态、矿石、碎片、矿工、远征 | durable Redis 玩家热档 | 使用现有玩家锁、fence 与 UoW |
| 行动力与恢复时间 | durable Redis 现有玩家字段 | 拟复用 shared 体力公式，并与 `idleState` 同一 UoW 提交 |
| 操作收据 | 同一 `idle` 领域聚合 | 与状态同一提交边界 |
| 玩法配置 | 版本化 TypeScript/shared 配置或受控 JSON | 客户端配置仅作展示，服务端权威 |
| cache Redis | 不存权威玩法数据 | 缓存失败不能影响游戏结果 |
| MySQL 货币、ledger、outbox | 首版不使用 | 未来跨经济域时另行设计 |
| Room state、进程 Map、Timer | 不作为真源 | 重启后不能依赖这些恢复挂机状态 |

### 1.2 MVP 物理存储建议

首版状态小且上限固定，可在按区玩家 `user:{uid}` Hash 中增加一个版本化、大小受限的 JSON 字段，概念名
`idleState`。实施时按需读取该字段，不使用 `HGETALL`。行动力继续使用现有两个标量字段，并在一次 UoW 提交中与
`idleState` 一起更新。

读取 `idleState`、`stamina` 与 `lastStaminaRecoverAt` 时必须使用同一次 `HMGET`（或等价的单次 Lua 读取），
禁止三个独立读取造成撕裂；写入则由同一次 UoW/Lua 原子提交。这里的“快照原子”以这两个条件同时满足为准。

这种方案每次会重写整个小型领域聚合，但可以得到：

- 快照原子；
- 领域迁移集中；
- 避免多字段部分更新；
- 状态和最近操作收据同一提交；
- 直接复用 `withUser`、锁、fence 和冷档写接缝。

首版硬上限建议为 4 名可用矿工、16 名矿工数据上限、1 个活动远征、128 条最近操作收据、16 条已领取远征
tombstone，以及 256 KiB 编码后 `idleState`。若未来加入大量装备、历史、多队或多槽远征，再以真实数据量为依据
拆键或建表，不在首版提前复杂化。

### 1.3 `idle` 领域聚合逻辑结构

| 字段 | 类型/范围 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 正整数 | 领域存档结构版本 |
| `stateVersion` | 非负安全整数 | 每次成功领域写递增 |
| `oreBalance` | 非负安全整数 | 已收取可消费矿石 |
| `fragmentBalance` | 非负安全整数 | 遗迹碎片 |
| `milestones` | 固定键布尔对象 | 深层开拓徽记等一次性进度 |
| `warehouseStock` | 非负安全整数 | 受容量限制的待收取矿石 |
| `productionRemainder` | 有界非负整数 | 定点结算余数 |
| `checkpointAt` | 毫秒时间戳 | 上次权威结算检查点 |
| `productionConfigVersionAtCheckpoint` | 稳定版本 ID | 检查点到下一次结算使用的生产配置 |
| `buildings` | 固定键对象 | 四类建筑等级 |
| `workers` | 有界数组 | 矿工实例、模板、岗位和远征引用 |
| `activeExpedition` | 对象或空 | 唯一在途/待领取远征 |
| `recentOperations` | 有界数组或映射 | payload 摘要、结果版本和必要结果摘要 |
| `claimedExpeditionTombstones` | 有界数组 | 防止旧远征被再次发奖，并在窗口内回读摘要 |

生产率、容量、成本、任务时长等派生数值不重复写入玩家档；它们由配置版本、等级、岗位和矿工模板计算。

### 1.4 矿工实例字段

| 字段 | 说明 |
| --- | --- |
| `workerId` | 玩家内稳定实例 ID |
| `templateId` | 固定矿工模板 |
| `assignmentSlotId` | 当前凿岩/运输槽；空闲或远征中为空 |
| `returnSlotId` | 远征结束自动返回的保留槽；非远征中为空 |
| `activeExpeditionId` | 远征中引用，否则为空 |
| `injuredUntil` | 第二阶段使用；首版固定 0 |

### 1.5 远征实例字段

| 字段 | 说明 |
| --- | --- |
| `expeditionId` | 稳定唯一实例 ID |
| `locationId` | 地点配置 ID |
| `configVersion` | 固化地点和奖励规则版本 |
| `outcomeVersion` | 结果算法与随机流版本 |
| `startedAt`、`endAt` | 服务端时间 |
| `crewSnapshot` | 矿工、出发属性、特质和原岗位 |
| `teamPower` | 出发时固化能力 |
| `seed` | 私有 `uint32` 随机材料，不进公共快照 |
| `resultGrade` | 已固化 C/B/A/S |
| `outcome` | 已固化准确奖励与预留遗物 roll，不在结束前公开 |
| `returnMaterializedAt` | 归队状态已物化的时间；未物化为 0 |
| `rewardOpId` | 稳定发奖操作 ID |

持久记录只保存不可由时间推导的事实。公共视图中的 `running`/`claimable` 由 `serverNow < endAt` 推导；领取
后清除 `activeExpedition`，并写入含 `expeditionId`、`rewardOpId`、`claimedAt` 和奖励摘要的 tombstone。
`claimable` 不作为必须由读请求物化的持久枚举。

历史配置版本必须保留到所有引用它的活动远征已经领取或超过明确保留期。热更新不能让在途远征改时长、
换奖励或无法结算。

### 1.6 操作收据

每条有界收据至少保存：

| 字段 | 说明 |
| --- | --- |
| `clientReqId` | 客户端逻辑操作 ID |
| `operationType` | 完整 `UndergroundIdleWriteRpcType`：`undergroundIdle.activate`、`undergroundIdle.collect`、`undergroundIdle.upgradeBuilding`、`undergroundIdle.assignWorkers`、`undergroundIdle.startExpedition`、`undergroundIdle.claimExpedition` |
| `payloadHash` | 规范化完整请求摘要；除 activate 外包含 `expectedStateVersion` |
| `resultingStateVersion` | 首次成功后的领域版本 |
| `resultSummary` | 重试必须返回的最小结果 |
| `createdAt` | 收据创建时间 |

首版把“完整结果可回读窗口”明确为：创建后 24 小时内，且尚未被 128 个更新的成功操作挤出；任一条件先
失效即结束。客户端自动查询/重试不得超过该窗口，并且重试必须复用完整原请求；若该路由包含
`expectedStateVersion`，也必须复用原值。窗口内保证同 ID 同 payload 回读同结果、同 ID 异 payload 返回
冲突；窗口外不再承诺返回原结果或识别 payload 冲突，只保证合法的完整原请求不会被重复应用。

后一个安全保证来自单调 `stateVersion` 和业务对象约束，而不是无限历史：旧收取、升级、调岗或派遣携带的
原版本会冲突；旧领取的 `expeditionId` 不再匹配活动远征。领取 tombstone 在保留期内负责回读原摘要，过期
后只返回“已领取记录不可回读”或通用无效状态，绝不根据客户端参数重建奖励。

### 1.7 缺档与坏档

- 玩家没有 `idleState` 时，`undergroundIdle.getSnapshot` 只返回 `activationState: unactivated` 的版本 0 预览，不计算
  生产，也不伪造临时 `checkpointAt`；
- 客户端随后调用幂等写 RPC `undergroundIdle.activate`，在 `withUser` 中以首次成功提交的 `serverNow` 创建确定初始档，
  包含 100 矿石余额、50 仓库矿石及稳定检查点；
- `undergroundIdle.activate` 不接收 `expectedStateVersion`：先判存档是否存在，不存在才创建版本 1；两设备同时激活只能
  创建一次，后到请求回读现有状态，不重置资源或检查点；
- JSON 解析失败、未知 schema、越界数字或非法状态组合必须 fail-closed；
- 坏档不能静默当作新玩家，否则等价于清档；
- 领域需要独立 decoder、迁移版本和测试。框架只对玩家根档做 N/N-1 只读校验并在 writer 首写前迁移；
  不会自动替本玩法迁移内嵌 `idleState.schemaVersion`。

## 2. 服务端一致性与安全边界

### 2.1 写路径

所有写 RPC 进入现有玩家级串行边界：

```text
Lobby 认证上下文
  → 路由限流与 shared runtime validator
  → 本地 mutex
  → Redis 分布式锁与 fence
  → 单次 HMGET 读取 idleState / 行动力
  → 收据与 expectedStateVersion 检查（activate 走存在性特例）
  → 结算、校验、状态转换
  → UoW 一次提交
  → 返回完整快照
```

客户端使用 `idle` 领域自己的 `stateVersion`，不直接使用玩家全局 `ver`。修改头像、设置或社交公会等无关写入
可能增加全局 `ver`，不应导致挂机玩法发生无意义冲突。

`withUser` callback 在极端 cold thaw 路径可能重跑一次。随机材料必须在 callback 外固定，或从稳定操作 ID
确定性派生；callback 中不得执行没有幂等保障的外部副作用。

服务端应只有一个纯 `advanceIdleTo(state, stamina, serverNow)` 入口：它负责矿场时间结算、行动力投影、远征到期和矿工自动
归队，并按存档中的配置版本读取历史目录。`getSnapshot` 调用它做只读投影而不提交；所有写 RPC 先调用同一
入口，再执行自己的状态转换并提交。禁止读写两条路径各复制一套离线公式。

`advanceTo` 必须把“收益积分”和“状态推进”分开：收益只计算到 8 小时上限，远征结束和归队事件仍推进到
`serverNow`。跨过 `endAt` 时先按旧岗位结算到边界，再只物化一次归队、清理矿工的远征引用与
`returnSlotId`；之后才允许调岗或领取。领取只发奖和清理活动远征，绝不能再次恢复旧岗位覆盖玩家在
归队后的新调岗。

### 2.2 通用幂等层的实现前置

当前 dispatcher 的通用幂等只按 `(type, uid, clientReqId)` 建 key，没有绑定 payload hash；成功结果缓存约
60 秒。若同一 ID 在缓存期内携带不同 payload，通用层可能直接返回第一次结果，领域 handler 根本没有机会发现冲突。

因此实施本 Demo 前必须选择一种方案：

1. **推荐**：增强通用幂等层，使占位和结果同时绑定规范化 payload hash；
2. 或为 `undergroundIdle.*` 提供能够在缓存命中前校验 payload 的领域幂等适配；
3. 不接受“仅在 handler 内加收据”作为完整解决方案，因为它拦不住通用缓存的提前返回。

RPC handler 超时使用的 `Promise.race` 不会取消迟到副作用。客户端收到 `TIMEOUT`、`CONN_LOST` 或
`IN_PROGRESS` 后必须保留原 `clientReqId`，查询操作状态或使用完全相同 payload 重试，禁止换新 ID。

`undergroundIdle.queryOperation` 还需要通用幂等层提供受控查询适配，才能区分 `pending` 与 `unknown`。在该适配完成前，
快照没变化或查不到领域收据都不能被解释为“原操作已安全失败”。

### 2.3 权威输入与数据泄漏

- uid 和区号只取 Lobby 认证上下文；
- 所有请求与响应使用 shared exact validator，拒绝未知字段、NaN、Infinity、越界整数和超长数组；
- 客户端不得上传时间、价格、产率、概率、种子和奖励；
- 私有远征种子和准确隐藏结果不能进入开始远征响应；
- 同 uid 跨区状态通过 `zoneCtx` 和 per-zone key 隔离；
- 权威状态只放 durable Redis，不放 cache Redis、Room state、进程 Map 或 Timer；
- 状态 JSON、矿工、远征槽、奖励条目和收据全部设置硬上限；
- 当前公共 RPC 令牌桶不允许用每秒拉取替代客户端本地动画。

### 2.4 推送边界

首版不需要新增玩法推送。前台根据 `endAt` 显示“可领取”，但点击后仍由服务端判定。应用恢复、重连、
切设备或写操作完成后重新拉快照即可。

第二阶段可增加 `undergroundIdle.changed`，只携带更高的 `stateVersion`，客户端收到后拉完整快照。现有 Lobby push 是
本节点尽力唤醒，不保证跨节点必达或离线送达，不能在 push 中承载唯一奖励或权威增量。

### 2.5 MySQL 与跨存储边界

首版矿石、碎片和远征全部留在一个 durable Redis 领域聚合中，不为了“展示技术栈”强行写 MySQL。

如果未来远征奖励现有货币或背包道具，就进入跨存储/跨聚合原子性问题，必须重新设计稳定 intent、ledger、
outbox、applied marker 和失败补偿。当前 relayer、死信处置和 archive 都有明确限制，不属于首版验收内容，
不能采用“先标已领取，再尽力发奖”的裸双写。

## 3. 内容配置

### 3.1 建筑等级表 `idle_building_level`

| 字段 | 说明 |
| --- | --- |
| `buildingId` | mine、hoist、warehouse、hall |
| `level` | 当前等级 |
| `contentVersion` | 配置版本 |
| `baseRateMilliPerMinute` | 矿井/升降机基础速率 |
| `capacity` | 仓库容量 |
| `slotCount` | 对应岗位槽数 |
| `upgradeOreCost` | 升级矿石成本 |
| `upgradeFragmentCost` | 大厅碎片成本 |
| `requiredBuildingLevels` | 大厅升级要求的生产建筑等级；其他建筑为空 |
| `unlockWorkerIds` | 新解锁矿工 |
| `unlockLocationIds` | 新解锁地点 |

### 3.2 矿工模板 `idle_worker_template`

| 字段 | 说明 |
| --- | --- |
| `templateId` | 稳定模板 ID |
| `contentVersion` | 配置版本 |
| `nameKey`、`descKey` | 本地化文本键 |
| `portraitId` | 头像资源 ID |
| `mining`、`hauling` | 岗位属性 |
| `scouting`、`survival` | 远征属性 |
| `traitIds` | 首版为空或固定 |
| `unlockHallLevel` | 解锁大厅等级 |
| `enabled` | 是否允许新玩家解锁 |

### 3.3 远征地点 `idle_expedition_location`

| 字段 | 说明 |
| --- | --- |
| `locationId` | 稳定地点 ID |
| `contentVersion` | 任务配置版本 |
| `nameKey`、`descKey` | 本地化文本 |
| `durationSec` | 权威持续时间 |
| `staminaCost` | 行动力消耗 |
| `minCrew`、`maxCrew` | 编队人数 |
| `minPower`、`recommendedPower` | 最低与推荐能力 |
| `scoutingWeightBps` | 勘察权重 |
| `survivalWeightBps` | 生存权重 |
| `baseOreReward` | 基础矿石 |
| `fragmentMin`、`fragmentMax` | 碎片区间 |
| `firstClearMilestoneId` | 首次完成时授予的一次性里程碑；没有则为空 |
| `rewardTableVersion` | 奖励表版本 |
| `requiredHallLevel` | 解锁条件 |
| `enabled` | 是否进入新任务列表 |

### 3.4 配置发布原则

- 所有 ID 稳定，不能因改名复用旧 ID；
- 配置加载时校验安全整数、等级连续、成本非负、概率和权重范围；
- 服务端拒绝未知或缺失的历史版本，不能使用当前表猜旧结果；
- 首版生产配置在存档存续期间不可热改；未来若开放热更，必须保留历史版本，先按旧版本结算到发布边界再
  切换 `productionConfigVersionAtCheckpoint`；
- 客户端配置只负责展示，服务端不接受客户端回传成本或奖励；
- 当前 Excel 转换工具尚没有正式生成物 freshness 与消费闭环，首版优先使用可测试的版本化 TS/JSON；
- 若后续接入 Excel，需把生成、校验、同步和版本保留一起纳入门禁。

## 4. 实施前框架基线与非承诺边界

实现前必须对现状保持准确描述：

- Underground Idle 尚无页面、RPC、领域存档或服务端业务实现；
- `apps/client/src/logic/rooms/idle/IdleGameplay.ts` 只是用于玩法注册/生命周期测试的最小 fixture，不是本策划
  所述挂机系统，也不意味着挂机玩法应该使用 Room；
- shared 的体力、自然日和命名 RNG 当前只有纯函数与单测，没有 Underground Idle 业务调用点；
- 通用 RPC 幂等未绑定 payload hash，成功结果缓存约 60 秒；
- handler 超时不会取消迟到副作用；
- 玩家根档 reader 只读校验 N/N-1，writer 在首写前迁移；内嵌领域 `schemaVersion` 不会自动迁移；
- push 是尽力唤醒，不是必达事件系统；
- 默认未启用 RedisPresence/RedisDriver，不承诺横向扩展；
- archive freeze 默认关闭，且不提供备份、物理容量保证或自动冷档淘汰，不能作为挂机档备份方案；
- Excel 配表工具尚无正式生成物消费与 freshness 闭环；
- outbox relayer、死信处置及跨存储后台编排仍是有限参考；
- 当前框架不包含生产部署、备份恢复、运营后台、线上监控告警或已验证的容量体系。

本策划描述的是**拟建设目标与验收标准**。实施时应遵守 [技术总览](../OVERVIEW.md)、
[服务端开发约束](../SERVER.md) 和 [客户端开发约束](../CLIENT.md) 的单源契约、View/Logic 分离、
锁/fence/幂等和运行时 validator 规则。

---

[返回总目录](README.md) · [上一篇：页面体验、客户端与 WS-RPC](04-client-and-rpc.md) · [下一篇：指标、测试、路线图与完成定义](06-testing-and-roadmap.md)
