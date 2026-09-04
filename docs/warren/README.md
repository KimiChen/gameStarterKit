# warren 玩法研究文档（随 proposal-bitecs-vendor.md 附上）

> 定位：`warren`（竖版动作肉鸽，bitECS + 服务端权威）的技术研究底稿，源自对一个同类
> 商业游戏（Sephiria，Unity/Mono 架构）的本地逆向研究。**仅作机制与数值设计的参考读物**：
> 其中引用的 `src/…`（带注释反编译源码）与 `assets/Data/…`（提取数据）位于外部参考仓
> `~/work/steam-Sephiria/gameVersion/`，**不在本 monorepo 内，也不得进入本仓**
> （版权边界见 MIGRATION_GAMESTARTERKIT.md §六"不变的部分"）。

## 文档清单

| 文档 | 内容 | 对 warren 开发的作用 |
| --- | --- | --- |
| [MIGRATION_GAMESTARTERKIT.md](./MIGRATION_GAMESTARTERKIT.md) | **先读**。迁移方案 v2（强制 bitECS 版）：OOP→ECS 架构翻译表、bitecs 双端可达方案、目录规划、分期里程碑、ECS 风险清单 | 施工蓝图，与根目录提案配套 |
| [COMBAT.md](./COMBAT.md) | 参考作战斗系统详解：20 步伤害结算管线全公式、攻击/防守端乘区链、四条对数曲线、战斗数值数据源总清单 | M1 战斗世界（systems/formulas）的规格来源 |
| [COMBAT_CLONE_PLAN.md](./COMBAT_CLONE_PLAN.md) | 复刻规划（Cocos 竖版手机版）：竖版操作/镜头/弹幕密度重设计、分期 P0-P9、手感三件套、坑清单 | 产品向总规划（分期与 M0-M3 对齐） |
| [ANALYSIS.md](./ANALYSIS.md) | 参考作构筑系统（网格背包/石板 DSL/套装）深度分析 | 后期构筑系统（P4+ 内容层）的机制参考 |
| [BOSSES.md](./BOSSES.md) | 参考作全 Boss 图鉴（14 主线 + 8 小 Boss：HP/招式/数值放大链） | Boss/难度系统设计与数值量级感参考 |

## 与仓库治理的衔接

- 本目录随 `proposal-bitecs-vendor.md` 一并评审；**合入时需登记** `docs/inventory.json`
  与 `features/warren/feature.json`（schema v1 的 `docs` 字段），并过
  `npm run verify:inventory`。
- 文档内所有公式/数值仅作参考基准——warren 的数值须重调（键名设计可参考，
  数值照抄=换皮风险，见 COMBAT_CLONE_PLAN.md §四）。
