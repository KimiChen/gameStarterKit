# mmohold — MMO 内容插件样本 2

消费冻结的 `mmo` kit 公共面（characters 1 / content 4 / orchestration 3），不自带 SQL、mode、wire 或房间状态。设计真源是 [MMO.md §9.3](../../../docs/MMO.md)，施工状态在其 §12 和 [MMO-PLAN.md §9](../../../docs/MMO-PLAN.md)。

## 内容与规则

`content/pack.json`：原创 holdRidge（争旗山脊），1600×1200，出生点 (600,600)，A 据点 (600,600)、B 据点 (1000,600)，半径均 150。fighter / caster 使用本包职业属性、技能与独立表现 id；守卫 sentinel 由 orchestration 管理。三件奖励为 hold-medal / hold-banner / hold-seal。

编排 `core/mmohold/mmoOrchestration.ts` 分派到 `encounters/capture.ts`，只消费 kit 面：每 20 tick 对两据点按存活角色阵营计数，多数方占领并每点每秒得 1 分；无人或平票保留归属、停止计分。易主先按 tag 收回旧守卫，再刷新 2 个中立驻守标记（idle，非友军 AI），并广播通知。

先到 100 分获胜；双方同 tick 达标先比总分，再同分按奇数轮曙光、偶数轮暮光决定。胜方当时在场的所有角色（含死亡者）同 tick 获得 1 件轮换奖励和 25 金币，批量目标上限 100，不截断。奖励沿 kit durable 事件与幂等回执落地。两个据点关闭 60 秒，期间不计分；重开清归属 / 分数、轮次 +1。phase、round、结果与 reopen 定时器随检查点恢复，恢复不重发奖励、不延长休战。

公开状态共 8 键：`owner:pointA/B`（neutral/dawn/dusk）、`score:dawn/dusk`、`phase`（active/closed）、`winner`、`round`、`reopenIn`。`MmoHoldHudLogic` 订阅 holdRidge 快照；`MmoHoldHudView` 替换默认 HUD，显示实时分数 / 归属 / 休战，并提供摇杆、技能轮盘、前往 A/B、拾取和离开。世界实体层与点地 / 点选继续由 kit 负责；插件不导入 kit 内部模块。

## 入口与战况

设置 →「据点争夺」→ `MmoHoldStandingsView`，读取自有 query `mmohold.standings`（最近已落库检查点，不是实时 HUD）。每页 3 条分线，支持刷新 / 翻页；经 characters 面列角色、建曙光或暮光角色并进入 holdRidge，不改宿主 placement。两端运行时按当前地图解析内容，不影响 demoVale。

## 验证

`npm --workspace @game/server run plugin -- test mmohold`：内容 validator、职业 / 表现 / 物品跨包无冲突、harness 占点 / 平票 / 易主 / 100 人奖励 / 60 秒重开 / 恢复 / 确定性重放、战况域正反向。

`npm run test:client`：HUD 生命周期 / 断线清屏、战况分页 / 失败保留、建角 / 入场、表现覆盖。Creator 场景 `mmohold`：16/16 步、11 张截图、控制台零错误；比分增长、A/B 占点、重进即得快照（3 ms）与检查点战况均通过，进入与重进后活守卫精确 4 名、两点各 2。证据在 `docs/evidence/creator-2026-09-23/mmohold/`（本地不入库）。§9.4 双样本与完整安装验收状态以 MMO.md §12 MG2 行为准。
