# S4：Demo 养成奖励与个人结果

[上一阶段：S3 Demo 衣柜与装备](s3-wardrobe-and-equipment.md) ·
[专项索引](README.md) · [下一阶段：S5 Demo 验收](s5-validation-and-release.md)

## 状态与范围

| 项目 | 口径 |
|---|---|
| 状态 | `[已拍板·待实施]` |
| 实现范围 | 当前进程内的 run 统计、金币/XP/碎片/成就奖励与个人结果页 |
| 数据来源 | S2 房间内已有的真人 run 状态和权威计数 |
| 账号状态 | S3/S4 共用的模块级内存 profile，并 best-effort 镜像到 Redis |
| Redis | 复用 `gp:snake:user:{uid}`，增加 XP 与成就字段 |
| 发布口径 | Demo 奖励，不承诺进程崩溃或跨实例一致性 |

S4 不再假定 S2R 已建立持久 run、checkpoint 或通用生命周期接口。本阶段直接消费房间内当前 run，
在终局时同步计算并应用一次奖励；失败的 Redis profile 镜像不改变已经展示的结果。

## 冻结决策

1. 不新增数据库表或 Redis key；继续复用 `gp:snake:user:{uid}` HASH。
2. S4 允许在该 HASH 增加 `snakeXp` 和 `achievementProgress`，并更新 S3 已允许的皮肤/碎片字段。
3. 不修改 `apps/server/src/rooms/GameMode.ts` 和 `apps/server/src/rooms/GameRoom.ts`。
4. 奖励计算和 profile 更新在 Snake mode 的同步终局路径完成，不登记后台处理流程。
5. 同一 `uid + roomEpochId + runId` 在当前进程内只应用一次，重复终局返回缓存结果。
6. 全部奖励先同步写入当前进程内 profile，再用一条不等待结果的 `HSET` 镜像所有变化字段；
   Redis 失败只告警，不撤销金币、XP、碎片、解锁或个人结果。
7. AI、86 个假榜条目和 `displayRank` 不参与账号奖励。

## 合格 run

只奖励已经进入可操作状态的真人 run。建议沿用以下简单条件：

```text
qualified =
  endReason != moderationKick
  && activeTicks >= 600
  && (score > 0 || kills > 0 || meaningfulInputCount >= 3)
```

`600` ticks 在 20 Hz 下为 30 秒。不合格 run 仍可展示本局统计，但所有奖励为 0。成功复活不结束
run，也不触发奖励；放弃、超时、次数用尽、主动结束或最终离场才按当前终局原因计算。

## Demo 奖励规则

### 金币和 XP

保留已批准的有界整数公式形状：

```text
cappedComponent(x, numerator, denominator, componentCap)
  = min(componentCap, floor(max(0, x) * numerator / denominator))

coinReward = min(100,
  coinBase
  + cappedComponent(activeTicks, coinTimeNum, coinTimeDen, coinTimeCap)
  + cappedComponent(score,       coinScoreNum, coinScoreDen, coinScoreCap)
  + cappedComponent(kills,       coinKillNum, coinKillDen, coinKillCap))

xpReward = min(300,
  xpBase
  + cappedComponent(activeTicks, xpTimeNum, xpTimeDen, xpTimeCap)
  + cappedComponent(score,       xpScoreNum, xpScoreDen, xpScoreCap)
  + cappedComponent(kills,       xpKillNum, xpKillDen, xpKillCap))
```

实现时把一套固定 demo 参数放在 shared 配置真源中，并用 fixture 钉住结果；不建立策略迁移或历史版本兼容。
全局硬顶固定为每 run 金币 `100`、XP `300`。金币是本局获得值，不减去复活消耗。

金币先加到 S2R 共用的进程内余额。终局完成后以一条 `HSET` 将 `coinBalance` 与本次变化的
`ownedSkinIds/fragmentBalances/snakeXp/achievementProgress` 一起 best-effort 写到同一个 Redis HASH。

### 等级

等级只由当前进程内累计 XP 派生：

```text
xpThreshold(level) = 50 * level * (level - 1), level in [1, 10]
derivedLevel = min(10, max({ level | snakeXp >= xpThreshold(level) }))
```

| 等级 | 累计 XP | 自动解锁 |
|---:|---:|---|
| 1 | `0` | 皮肤 `1` |
| 2 | `100` | 皮肤 `2` |
| 3 | `300` | - |
| 4 | `600` | 皮肤 `3` |
| 5 | `1000` | - |
| 6 | `1500` | - |
| 7 | `2100` | 皮肤 `4` |
| 8 | `2800` | - |
| 9 | `3600` | - |
| 10 | `4500` | - |

满级后 XP 可以继续累计，显示等级保持 10。达到门槛时直接把对应皮肤加入 S3 profile 的拥有集合。

### 成就

| 解锁皮肤 | 累计指标 | 门槛 |
|---:|---|---:|
| `132` | `activeTicks` | `36000` |
| `101` | `kills` | `100` |
| `139` | `starCollected` | `200` |
| `701` | `floor(score)` | `100000` |

每项进度在门槛处饱和。达到门槛时同步加入拥有集合；已经拥有则只保留饱和进度。

### 专属碎片

```text
scorePart = min(4, floor(max(0, score) / 1000))
killPart = min(4, floor(max(0, kills) / 5))
fragmentCount = 1 + min(4, scorePart + killPart)
priority = 401 -> 403 -> 133 -> 411
```

选择优先级中第一个尚未拥有的皮肤；四款均拥有时本局碎片为 0。数量直接加到 S3 profile，
范围为 `1..5`。本局计算完成后不因随后换装或合成而改投其他皮肤。

## Profile、Redis 投影与去重

S4 在 S3 profile 上追加：

```ts
interface SnakeDemoProgression {
  xp: number;
  achievementProgress: {
    101: number;
    132: number;
    139: number;
    701: number;
  };
}
```

另有两个模块级集合：

- `processedRuns`：key 为 `uid + roomEpochId + runId`，保存已经应用的结果。
- `latestResultByUid`：只保存当前进程内最近一条个人结果，供断线后回到首页时展示。

第一次终局按“读取旧值、计算全部增量、一次替换 profile、缓存结果”的顺序同步完成。重复终局直接返回缓存值。
没有跨进程竞争处理；这是明确的 demo 限制。

S4 实施后 `gp:snake:user:{uid}` 的完整允许字段为：

| field | 编码 |
|---|---|
| `coinBalance` | 非负安全整数十进制字符串 |
| `equippedSkinId` | 合法 `skinId` 十进制字符串 |
| `ownedSkinIds` | 升序去重 JSON 数组 |
| `fragmentBalances` | 四个固定碎片 skin ID 的 JSON 对象 |
| `snakeXp` | 非负安全整数十进制字符串 |
| `achievementProgress` | 四个固定成就 skin ID 的 JSON 对象 |

不保存 run、终局结果、处理标记、请求 ID、`sId` 或时间戳。首次 S3 snapshot 回灌时也读取并校验 S4
字段；缺失采用 0，损坏则告警并对该 progression profile 使用默认值。

## 个人结果契约

> ⛔ **待拍板 B / C（[README §9.1](README.md#91-三项必须先拍板的问题)，未定不进 S4-04）**
>
> - **B｜扩 v1 还是造 v2**：现有 `ISnakeRunResultV1`（`apps/shared/src/gameplays/snake/wire.ts`）
>   已预留 `rewardPolicyVersion` / `rewardReceiptId` / `rewardSummary` 三个可选字段。扩 v1 不动
>   token 名、不动客户端订阅；下面写的 `resultVersion: 2` 需要 bump `modeVersion` 并联动三处生成镜像。
> - **C｜「再来一局」怎么实现**：服务端当前**没有**房内重开 run 的能力——`runId` 只在 `createPlayer`
>   分配，Finalized 之后玩家留在房里但没有任何命令能开新 run。选「离房重进」则 S4 零服务端改动；
>   选「房内重开」要新增命令与状态机分支。下面「页面提供『再来一局』」一句在 C 拍板前不成立。

结果只表达最终值，不包含中间状态：

```ts
interface ISnakeDemoRunResult {
  resultVersion: 2;
  runId: string;
  endReason: SnakeRunEndReason;
  qualified: boolean;
  stats: {
    skinIdAtRunStart: number;
    activeTicks: number;
    score: number;
    finalLength: number;
    maxLength: number;
    kills: number;
    deaths: number;
    relivesUsed: number;
    reliveCoinSpent: number;
    magnetCollected: number;
    starCollected: number;
    meaningfulInputCount: number;
  };
  coin: {
    amount: number;
    balanceAfter: number;
  };
  progression: {
    xpAmount: number;
    xpAfter: number;
    levelBefore: number;
    levelAfter: number;
    fragmentSkinId: number | null;
    fragmentAmount: number;
    achievementProgressAfter: Record<string, number>;
    newlyUnlockedSkinIds: number[];
  };
}
```

结果只推送给本人，同房其他玩家继续 Playing。页面提供“再来一局”和“返回首页”，展示本局金币、复活消耗、
XP、等级、碎片、成就与新解锁皮肤。没有领取按钮；奖励在结果生成前已经写入当前进程内 profile。

## 运行流程

```text
真人 run 结束
  -> 冻结当前房间内统计副本
  -> 检查 processedRuns
  -> 计算 qualified 与全部奖励
  -> 同步替换内存 profile
  -> 同步生成并缓存个人结果
  -> best-effort 单条 HSET gp:snake:user:{uid} <完整变化字段>
  -> 只向本人推送结果
```

## 实施任务

### S4-01：补齐当前 run 统计

- [ ] 在 Snake mode 内维护 `activeTicks`、长度、得分、击杀、磁铁、Star 和有效输入计数。
- [ ] 只使用房间内状态，不增加持久 run 或周期快照。

### S4-02：实现 demo reward policy

- [ ] 在 shared 真源定义固定参数、资格条件、硬顶、等级、成就和碎片公式。
- [ ] 覆盖边界、溢出保护、AI/假榜排除和不合格 run 的 0 奖励。

### S4-03：实现 progression、Redis 投影与去重

- [ ] 扩展 S3 profile，按 run key 同步应用一次金币、XP、碎片、进度和解锁。
- [ ] 用单条 `HSET` best-effort 镜像余额、拥有、碎片、XP 和成就；失败只记录警告。

### S4-04：实现结果 wire 与页面

- [ ] 通过 gameplay codegen 增加简化结果类型和本人 push。
- [ ] 完成结果 Logic/View、“再来一局”和“返回首页”。

### S4-05：验证与同步

- [ ] 运行 codegen、sync、双端 typecheck、客户端/FGUI/服务端测试。
- [ ] 把完整结果页和连续两局的 Creator 证据留给 S5。

## 验收条件

- [ ] 同一 run 在当前进程内重复终局只加一次奖励。
- [ ] 金币、XP、等级、四项成就和碎片公式的上下界有精确 fixture。
- [ ] AI、假榜、`displayRank`、不合格 run 和成功复活不会错误发奖。
- [ ] Redis 仍只有 `gp:snake:user:{uid}` 一个 Snake key，字段严格匹配本阶段六项白名单且不含 `sId`。
- [ ] Redis 写失败不影响已经生成的奖励结果。
- [ ] 结果只发给本人，其他玩家和房间 phase 不受影响。
- [ ] 受限通用房间文件无差异，生成镜像新鲜。

## Demo 限制

- Redis 写成功时可在进程重启后回灌 XP、碎片、成就和解锁；写失败期间的变化会丢失。
- 结果缓存和 run 去重记录始终只在内存，进程重启后不会恢复。
- 多进程实例可能分别奖励同一账号或用旧 profile 覆盖 Redis。
- 不承诺崩溃窗口中的不漏奖、不重复奖励或结果找回。
- 本阶段完成只能表述为“Demo 养成奖励可内部试玩”。

## 证据回写

| 状态 | commit | 自动验证 | Creator 证据 | 备注 |
|---|---|---|---|---|
| `[已拍板·待实施]` | - | - | - | 进程内同步奖励；单 HASH best-effort Redis 投影 |

---

[上一阶段：S3 Demo 衣柜与装备](s3-wardrobe-and-equipment.md) ·
[专项索引](README.md) · [下一阶段：S5 Demo 验收](s5-validation-and-release.md)
