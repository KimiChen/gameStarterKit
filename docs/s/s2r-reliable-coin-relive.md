# S2R：Demo 金币复活

> [专项索引](README.md) · [上一阶段：S2 竖版战场与无尽生命周期](s2-battle-and-endless-lifecycle.md) ·
> [下一阶段：S3 Demo 衣柜与装备](s3-wardrobe-and-equipment.md)

## 状态与范围

| 项目 | 口径 |
|---|---|
| 状态 | `[已完成]` |
| 实现范围 | 开发环境中的 demo 金币余额、扣费复活、余额展示与 Redis best-effort 写入 |
| 前置依赖 | S2 已交付的个人 run、死亡选择窗、五档费用和同步 `ReliveEconomyPort` |
| 玩法版本 | `snake@3`（S2R 落地时点；`f2639ae` 因 state 枚举归属重构把 `modeVersion` 递增为 **4**，玩法规则不变。⛔ 不要据本行判断当前运行时版本） |
| 发布门禁 | `onlineCoinRelive5V1` 保持关闭；本实现不具备生产金币链路的发布资格 |

本阶段按 2026-09-03 用户决策收敛为 demo。它只验证“死亡后按余额选择金币复活”的完整演示动线，
不建设生产资产系统，也不扩展通用房间框架。

## 冻结决策

1. 不新建 `snake_player_run`，也不新增或修改任何 MySQL 表。
2. 用户余额只写 Redis 逻辑 key `gp:snake:user:{uid}`，类型为 HASH，唯一 field 是 `coinBalance`。
3. 该 key 只按 `uid` 标识账号，不增加 `sId`；`keys.ts` 仍按仓库约定添加项目级
   `<PROJECT_ID>_` 前缀，但不会添加区服前缀。
4. 不修改 `apps/server/src/rooms/GameMode.ts` 和 `apps/server/src/rooms/GameRoom.ts`。
5. 复用 S2 已有的同步复活状态机，不增加任务注册、后台调度或跨进程恢复流程。
6. 先在当前进程内完成扣费并确认复活，再发起一次不等待结果的 Redis `HSET`。写入失败只记录警告，
   不回滚已经完成的复活。
7. 面向玩家的发布开关继续关闭；生产环境仍绑定 disabled economy，不能误用 demo adapter。

## 数据契约

唯一新增 Redis 数据如下：

```text
logical key: gp:snake:user:{uid}
physical key: <PROJECT_ID>_gp:snake:user:{uid}
type: HASH
field: coinBalance
value: 非负安全整数的十进制字符串
TTL: 无
```

示例：

```text
HSET gono_gp:snake:user:{user-42} coinBalance 9700
```

禁止向这个 HASH 写入 `sId`、run、death、request、receipt、状态或时间戳字段。业务身份来自认证后的
`auth.userId`；`auth.sId` 只用于房间原有的准入一致性校验，不进入余额 key、field 或 value。

这里的“唯一 field”描述 S2R 当前已实现版本。S3/S4 实施后可在同一个 HASH 中增加经过严格校验的
`equippedSkinId`、`ownedSkinIds`、`fragmentBalances`、`snakeXp` 和
`achievementProgress`；仍不增加 `sId`、其他 Snake key 或运行过程字段。

## 运行流程

开发环境默认使用 `RedisDemoReliveEconomy`，初始演示余额为 `10000`。余额表和已处理死亡结果保存在模块级
内存中，因此同一 Node.js 进程内的不同 Snake 房间共享同一 `uid` 的即时余额。

```text
认证准入
  -> Snake mode 只锁存 uid
  -> 创建玩家时投影当前 demo coinBalance
  -> 玩家死亡并接受复活
  -> 按 100 / 200 / 300 / 300 / 300 检查进程内余额
  -> 余额不足：保留选择窗并返回当前余额
  -> 余额足够：同步扣减、确认复活并更新玩家 coinBalance
  -> fire-and-forget HSET gp:snake:user:{uid} coinBalance <余额>
  -> Redis 失败：记录 warning，玩法结果保持成功
```

同一业务死亡的内存幂等键由 `uid + roomEpochId + runId + deathSeq` 组成，不包含 `clientReqId`。因此同一死亡
即使换请求 ID 重试，在当前进程内也只扣一次；不同死亡按各自档位正常扣费。

客户端复活窗显示本档费用和当前余额，按钮文案为“金币复活”。余额不足时展示服务端返回的余额；处理阶段
不允许重复提交。

## Demo 限制

这些限制是本次简化方案的预期行为，不属于待补实现的阶段退出条件：

- Redis 写入不参与复活成功判定，失败后不会补写或回滚。
- 进程重启后内存余额和内存幂等结果会丢失；当前实现不会从 Redis 回灌余额。
- 多进程实例之间没有余额锁或原子扣减，同一账号并发进入不同进程可能产生覆盖。
- 不承诺进程崩溃窗口中的不吞币、不双扣或精确恢复。
- 不开放生产金币复活，不把该 demo 描述为可靠资产实现。

## 实现位置

| 内容 | 真源 |
|---|---|
| Redis key | `apps/server/src/rooms/modes/snake/keys.ts` 的 `kSnakeUser(uid)` = `kGameplay("snake", "user", uid, { zone: "global" })`；中央 `apps/server/src/core/infra/keys.ts` 只提供 `kGameplay` 工厂与分段契约，⛔ 玩法名不进该文件（`e8455f0` 搬家，S2R 落地时的旧位置已失效） |
| demo economy | `apps/server/src/rooms/modes/snake/lifecycle.ts` 的 `RedisDemoReliveEconomy` |
| Snake 接入 | `apps/server/src/rooms/modes/snake/index.ts` |
| schema | `apps/shared/schema/gameplays/snake/{manifest.json,state.json}` |
| 客户端 Logic / View | `apps/client/src/logic/rooms/snake/SnakeHud.ts`、`apps/client/src/view/rooms/snake/SnakeWorldView.ts` |
| 单测 / Redis 集成测试 | `apps/server/test/snake-relive-demo.test.ts`、`apps/server/test/int/snake-relive-demo.test.ts` |

生成文件只能通过 `codegen:gameplays`、`sync:shared` 和 `sync:client` 刷新，不能手改。

## 验收条件

- [x] `snake@3` 投影 `coinBalance`，客户端显示金币费用和余额。
- [x] 五次成功复活费用保持 `100/200/300/300/300`，第六次死亡不再提供复活。
- [x] 同一业务死亡在当前进程内重复提交只扣一次。
- [x] Redis 写失败不会撤销已经完成的复活。
- [x] `kSnakeUser` 在 `zoneCtx.sId=0` 与非零时生成同一个 uid key。
- [x] Redis HASH 只有 `coinBalance` 一个 field。
- [x] `GameMode.ts`、`GameRoom.ts` 和 SQL schema 无改动。
- [x] 生产环境仍拒绝 demo economy，发布开关保持关闭。

## 验证记录

2026-09-03 本地实测：

| 验证 | 结果 |
|---|---|
| `npm run verify:all` | exit 0；client `384/384`、server `499/499`、FGUI `66/66`、inventory `110/110`，typecheck/codegen freshness/sync 全绿 |
| `npm --workspace @game/server run test:int` | `172/172`，含新增 Snake Redis 单字段真栈用例 |
| `npm --workspace @game/server run db:bootstrap` | 仍为既有 11 张表；没有 `snake_player_run` 或其他新增表 |
| 受限路径差异检查 | `GameMode.ts`、`GameRoom.ts`、`apps/server/sql/schema.sql` 均无差异 |

---

[上一阶段：S2 竖版战场与无尽生命周期](s2-battle-and-endless-lifecycle.md) ·
[专项索引](README.md) · [下一阶段：S3 Demo 衣柜与装备](s3-wardrobe-and-equipment.md)
