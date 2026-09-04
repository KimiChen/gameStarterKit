# 迁移方案 v2：Sephiria 战斗复刻 → gameStarterKit（gono），强制 bitECS 版

> v1 → v2 变化：战斗内核从"OOP 类 + 池"改为 **bitECS 世界**（框架已锁定 bitecs 0.4.0，
> `apps/client/src/lib/bitecs/`，MPL-2.0 字节锁定，`npm run verify:ecs` 守护）。
> 本版回答三个新问题：参考作的 OOP 架构怎么翻译成 ECS、bitecs 怎么进 shared/服务端、
> ECS 化后管线与"事件墙"怎么保持可扩展。

## 一、架构翻译表（参考作 OOP → bitECS 0.4）

| 参考作（C#/OOP） | ECS 实现 | 设计说明 |
|---|---|---|
| `UnitAvatar`（8954 行单位本体） | **实体 + 组件族**：`UnitCore`(hp/maxMp/faction/monsterType)、`Transform`、`MoveIntent`、`DashState`(无敌帧计时)、`GuardState`(方向/扇形/MP/完美窗)、`AIState`(含 attackPhase 前摇) | 单位 = eid；行为全部下沉为系统 |
| `DamageInstance`（32 字段池化对象） | **事件实体**：`DamageEvent` 组件（来源 eid、基础值、方向、击退、暴击参数、元素、`failed` 判定枚举）+ 帧末 `CleanupSystem` 回收 | 每次结算 = 生成事件实体过一遍系统管线——池化语义由 ECS 原生提供 |
| **20 步结算管线**（短路顺序） | **有序系统清单**：每步 = 一个系统（InvulnerableGate → ProtectionPoint → TrapReduce → Counter → Parry → HitInvincible → Dodge → Guard → EvasionRoll → AttackerBonus → Crit → CritDamage → ReceivedMod → ElementalDefense → Armor → TrueDamage/Toughness → ShieldChain → Stagger → ApplyDamage → FeedbackSpawn） | 短路 = `failed` 字段；后续系统 query 只取未失败事件。**系统顺序 = 管线语义**，用显式 manifest 数组 pipe，并写顺序断言测试 |
| 属性字典（字符串键 ~70+隐藏键） | **双层设计**：热属性（~30 个每帧读的）= 组件 typed 字段；长尾属性 = **eid → Float64Array 侧表**（StatStore 模块管理），对外仍暴露 `getStat(eid, 'FireDamage')` 字符串 API | bitecs 组件是定长 typed 数组，动态字符串键不适配；侧表方案避免组件爆炸，配置改键不动组件 |
| 状态表达式 `"ID/数值"` | 配置层解析器不变；运行时 = **状态实体**（`StatusDef` 组件 + 目标 eid + 值 + TTL）+ `ApplyStatusSystem`（写 StatStore 增量，退场时回滚） | 语法与中央工厂是纯配置层概念，ECS 化零损失 |
| **事件墙**（OnCalculateDamage/OnEvade/OnCounter…） | **CombatHooks 生命周期槽**：管线系统在固定相位发射钩子事件进队列；"神器/天赋"= 注册在槽位上的**扩展系统**（系统清单 manifest 里留 Extension Slots） | 这是对付"205 个神器类"的 ECS 答案：内容 = 往槽里加系统 + 往 StatStore 写词条 |
| `NewWeaponFireData`（546 条开火数据） | 配置实体（Excel→codegen 生成 FireData 表 + id 引用）；**开火系统按原型分件**（近战判定框/弹丸/蓄力/散射/召唤） | `relatedStatFormula`（HIGHEST/AVERAGE）在取基础值的系统里实现 |
| `Bullet`/弹幕 | **纯 ECS 实体**：`Projectile`(速度/伤害载荷/归属 eid) + `TTL` + 移动/命中系统 | ECS 的本职战场，同屏 80+ 零压力 |
| 计时器（冷却/前摇） | `Cooldown`/`Telegraph` 组件倒计时系统 | 单一时钟源服务（为联机留门） |

## 二、关键决策：bitecs 如何进 shared / 服务端

参考作"服务端权威 + 单人 Host 同构"要求**同一套战斗世界代码跑在 Colyseus 房间（结算权威）
和客户端（预测/表现）**。gono 现状：bitecs 锁定在 `apps/client/src/lib/bitecs/`，而 shared 是
"源码真相 → 镜像进 client"的方向——**不能让 shared 反向 import client**。两个合规选项：

- **方案 A（推荐）**：与框架维护方协调，把锁定副本提升到中立位置（`vendor/bitecs/`，与
  webplatform tarball 同级，纳入 `verify:vendor`/`verify:ecs` 锁基线）；shared 与 server 都从
  中立位置 import。一次性结构调整，长期最干净。
- **方案 B（不动框架）**：战斗世界代码放 `apps/shared/src/gameplays/warren/sim/`，bitecs 通过
  tsconfig paths 别名指向 client 锁定副本（server 侧 tsx/node 同样可解析）。零结构改动，
  但留下跨工作区路径依赖的债。

> 无论 A/B：锁定文件**一字不改**（MPL + sha 守护），业务代码全部写在世界/组件/系统层。

## 三、目录规划（v2）

```
apps/shared/src/gameplays/warren/
├── wire.ts                    # C2S(移动意图/攻击/冲刺/格挡, rateCost/phases) S2C(伤害/前摇/状态)
├── sim/                       # ★ 战斗世界（纯 TS 无头，双端同构）
│   ├── world.ts               # createWorld + 系统清单 manifest（顺序=管线语义）
│   ├── comps/                 # 组件定义（热属性字段；codegen 由配表生成 StatRegistry）
│   ├── systems/               # 20 步管线系统 + 扩展槽位 + CleanupSystem
│   ├── stats.ts               # StatStore（eid→Float64Array 侧表）+ getStat 字符串 API
│   ├── status.ts              # "ID/数值" 解析工厂 + 状态实体生命周期
│   └── formulas.ts            # 对数曲线×2、处决、下限（COMBAT.md §8）
├── constants.ts               # 机制常数（原作 118 键的键名设计，数值重调）
└── config/                    # Excel→codegen 产物：武器/开火数据/状态定义/难度词条
apps/client/src/logic/rooms/warren/   # WarrenGameplay + WarrenECS（抄 ballMove 的
│                                     # GameECS 包装模式：Colyseus 状态→eid 同步 + 插值系统）
apps/client/src/view/rooms/warren/    # 视图只读 ECS（学 ballMove：渲染端不写逻辑）
apps/server/src/...                   # WarrenRoom：20Hz tick 跑 sim，快照下行
docs/warren/                          # 迁入四份研究文档 + ECS 翻译表（登记 inventory.json）
```

## 四、分期计划（v2）

**M0 脚手架 + bitecs 归位（0.5-1 天）**：feature.json（extra）+ wire 骨架 + 文档登记 +
**bitecs 中立化决策落地（方案 A 或 B）**；`verify:ecs / verify:sync / typecheck` 全绿。

**M1 战斗世界无头开发（2 周）★核心期**
- M1.1 组件 + StatStore + 世界骨架；系统清单 manifest + **顺序断言测试**（管线语义即测试）
- M1.2 20 步管线系统全量 + 四条公式；node 单测：短路顺序/对数曲线数值表/格挡 MP 结算/
  `"ID/数值"` 解析与回滚
- M1.3 弹丸/开火系统（3 原型）+ AI FSM（含 Telegraph 前摇组件）
- M1.4 **确定性演练台**：种子化脚本战（假人 vs 脚本 Boss 模式），无头跑千帧断言结果一致

**M2 客户端接入（2-3 周）**：WarrenECS 包装 + Colyseus 状态→实体同步（ballMove 模式）+
视图只读渲染 + 摇杆/按钮意图层（照原作 PlayerInputController 注入点设计）+ 自动瞄准 +
FairyGUI HUD + 三档震动。

**M3 联机权威（1-2 周）**：WarrenRoom 20Hz tick 结算；**移动客户端权威 + 伤害服务端权威**
（复刻原作网络模型）；SnapshotBuffer 预测插值与纠正。之后按 COMBAT_CLONE_PLAN P2-P7 做内容。

## 五、ECS 强制带来的新风险清单

1. **bitecs 0.4 ≠ 0.3**：API 差异大（其 README 明确警告），别照抄网上旧教程；以 ballMove
   的用法为仓内基准。
2. **锁定纪律**：vendor 12 文件 + `scripts/bitecs.sha256` 不可动（MPL 文件级 copyleft +
   校验矩阵）；所有需求在业务层解决。
3. **系统顺序即正确性**：管线 manifest 必须显式、集中、带测试；禁止散落各处的隐式注册。
4. **事件实体生命周期**：DamageEvent 必须帧末统一 Cleanup，泄漏 = 下帧幽灵伤害。
5. **组件禁存实体引用**：只存 eid（弱引用语义）。
6. **长尾属性不进组件**：StatStore 侧表方案，避免"每加一个词条改一次组件结构"。
7. **浮点跨端不确定**：客户端 sim 只做移动/弹道表现预测，**伤害结算只认服务端**，
   纠偏用快照对齐而非回滚（20Hz + 本品类手感可容忍）。
8. **查询在模块作用域 defineQuery 缓存**，系统内零分配（手机 GC 纪律）。

## 六、不变的部分

四柱一表达式的**语义**全部保留（载体从类变实体/系统）；公式照抄（`formulas.ts`）；
配置 Schema 参考 `assets/Data/*.json`；内容策略 1/20 起步；版权红线不变
（反编译源码与原作数据留在 gameVersion 参考仓，不进产品仓）。
