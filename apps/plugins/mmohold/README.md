# mmohold — MMO 内容插件样本 2

消费冻结的 `mmo` kit 公共面（content 4 / orchestration 3），不自带 SQL、mode、wire 或房间状态。设计真源是 [MMO.md §9.3](../../../docs/MMO.md)，施工状态在其 §12 和 [MMO-PLAN.md §9](../../../docs/MMO-PLAN.md)。

## 内容与规则

`content/pack.json`：原创 holdRidge（争旗山脊），1600×1200，出生点 (600,600)，A 据点 (600,600)、B 据点 (1000,600)，半径均 150。fighter / caster 使用本包职业属性、技能与独立表现 id；守卫 sentinel 由 orchestration 管理。三件奖励为 hold-medal / hold-banner / hold-seal。

编排 `core/mmohold/mmoOrchestration.ts` 分派到 `encounters/capture.ts`，只消费 kit 面：每 20 tick 对两据点按存活角色阵营计数，多数方占领并每点每秒得 1 分；无人或平票保留归属、停止计分。易主先按 tag 收回旧守卫，再刷新 2 个中立驻守标记（idle，非友军 AI），并广播通知。

先到 100 分获胜；双方同 tick 达标先比总分，再同分按奇数轮曙光、偶数轮暮光决定。胜方当时在场的所有角色（含死亡者）同 tick 获得 1 件轮换奖励和 25 金币，批量目标上限 100，不截断。奖励沿 kit durable 事件与幂等回执落地。两个据点关闭 60 秒，期间不计分；重开清归属 / 分数、轮次 +1。phase、round、结果与 reopen 定时器随检查点恢复，恢复不重发奖励、不延长休战。

公开状态共 8 键：`owner:pointA/B`（neutral/dawn/dusk）、`score:dawn/dusk`、`phase`（active/closed）、`winner`、`round`、`reopenIn`。

## 验证

内容 validator、表现映射、公开 harness 占点 / 平票 / 易主 / 100 人奖励 / 60 秒重开 / 检查点恢复 / 确定性重放；自有 HUD 与战况入口留 MG2-B2。
