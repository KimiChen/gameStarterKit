# Sephiria 战斗系统详解（技术实现与数据源）

> 基于逆向源码（`src/`）与提取数据（`assets/Data/`）的完整还原。
> 行号引用基于本仓库反编译源码。构筑侧系统（背包/石板/套装）见 `ANALYSIS.md`，
> 本文专注**战斗管线本身**与**全部战斗数值来源**。

---

## 0. 一图总览

```
[输入/IA] WeaponController / WeaponControlAnimator
    └→ WeaponSimple.CreateBasicAttackProjectile(idx)          ← 攻击端组装伤害
         ├ 基础值 = GetRelatedStatMultiplier()  ← 元素属性 or HIGHEST/AVG 公式
         ├ × 通用加成(WeaponDamage/BasicAttack-DashAttack-SpecialAttack%)
         ├ × MPSKILLDAMAGE%(耗蓝攻击) × FinalWeaponDamage% × 武器个体加成%
         └→ NewWeaponFireData*.CreateAttack(damage, ...)       ← 开火数据(SO) 定型弹道
              └ (MeleeAttack 393 / Bullet 71 / Burst 50 / Spread 9 / Special 21 / Summon 2)
                  └→ Bullet/MeleeCollision 等投射物飞行/挥砍判定 (CombatManager 阵营过滤)
                       └→ victim.ApplyDamage(DamageInstance)   ← 服务端权威
                            UnitAvatar.ApplyDamage() 防守端 20 步管线（§3）
                                └→ RpcApplyDamage(DamageData) → 客户端表现(DamageFeedback)
```

**架构原则**：所有伤害结算在**服务端**（单人即本机）执行，客户端只收 `RpcApplyDamage`
做数字飘字/受击表现——这是联机掉线即丢进度的同一架构根源。伤害载体是**对象池复用**
的 `DamageInstance`（32 个字段：伤害、类型、方向、击退、暴击参数、元素……）。

---

## 1. 核心类速查

| 类 | 文件 | 职责 |
|---|---|---|
| `UnitAvatar` | `src/Units/UnitAvatar.cs`（8954 行） | ★战斗单位本体：HP/MP、**属性字典**、防守端管线、闪避/格挡/无敌状态 |
| `PlayerAvatar` | `src/Units/PlayerAvatar.cs` | 玩家扩展：服装属性(`costumeStats`)、存档属性 |
| `CombatBehaviour` | `src/Units/CombatBehaviour.cs` | 可被伤害对象的基类接口（`ApplyDamage` 虚方法） |
| `DamageInstance` | `src/Units/DamageInstance.cs` | 一次伤害的完整描述（对象池） |
| `DamageApplicable` | `src/Units/DamageApplicable.cs` | 可发起伤害者的统一入口 |
| `CombatManager` | `src/Units/CombatManager.cs` | 阵营过滤(`ContainsAttackableFaction`)、和平模式、当前玩家 |
| `WeaponController(Simple)` | `src/Weapons/` | 攻击输入→选择 WeaponAction→触发开火；格挡/冲刺/无敌帧状态机 |
| `NewWeaponFireData*` | `src/Weapons/` | 开火数据 SO：伤害倍率/突进/属性/耗蓝 → 实例化投射物 |
| `Bullet / ProjectileBase / MeleeCollision` | `src/Units/` | 飞行弹丸与近战判定框，命中回调 `onAttack(受击者, DamageInstance)` |
| `StatusInstance(±子类)` | `src/Status/` | 通用 Buff/Debuff：`ID/数值` 表达式 → 修改属性或挂行为 |
| `KeywordDatabase` | `src/Core/KeywordDatabase.cs` | 全局常量表 + 关键词/伤害ID 注册中心 |

---

## 2. 攻击端伤害公式（武器 → DamageInstance.damage）

以 `WeaponSimple.CreateBasicAttackProjectile`（`src/Weapons/WeaponSimple.cs:873`）为准：

```csharp
float dmg = GetRelatedStatMultiplier(avatar, fireData.damageElementalType, fireData.relatedStatFormula);
dmg += dmg * WeaponDamageBonus / 100;                    // 武器通用加成
dmg += dmg * (Basic|Dash|Special)AttackDamageBonus / 100; // 按攻击类型（普攻/冲刺/特殊）
if (mpConsumed > 0) dmg += dmg * MPSKILLDAMAGE / 100;     // 耗蓝攻击加成
dmg += dmg * FinalWeaponDamage / 100;                     // 最终武器伤害加成
dmg += dmg * GetAdditionalBasicAttackDamagePercent(idx)/100; // 武器个体(改装件)加成
// CreateAttack 内：弹丸伤害 = dmg × fireData.damageMultiplier × avatar.finalDamageMultiplier
```

**基础值的选取**（`GetRelatedStatMultiplier`, `WeaponSimple.cs:738`）是本作武器构筑的精髓：
- 空公式：取武器元素对应属性（`FIREDAMAGE / ICEDAMAGE / LIGHTNINGDAMAGE / PHYSICALDAMAGE`）；
- `relatedStatFormula` 支持聚合公式：**`HIGHEST`（取四系最高并变为此元素）**、`LOWEST`、
  `AVERAGE`、`AVERAGEALL`——"跟着构筑走"的武器（如全元素平均值武器）由此实现。

其余攻击种类同构：冲刺攻击乘 `DashAttackDamageBonus`（`WeaponSimple.cs:984`），
魔法书神器走 `Charm_Magic.FireCasting → ActiveSkill`（技能数据见 §5.4）。

---

## 3. 防守端管线（`UnitAvatar.ApplyDamage`, `src/Units/UnitAvatar.cs:2527`）

一次伤害进入受击者后的**完整判定顺序**（顺序即设计：前者短路后者）：

| # | 判定 | 关键数据/公式 |
|---|---|---|
| 1 | 死亡/无敌/坠落中 | `IsInvulnerable`、`isLifeInvincibleApplied` |
| 2 | 阵营/友军过滤 | `CombatManager.ContainsAttackableFaction`；不可打自己/随从 |
| 3 | **护体次数** | `protectionPoint--`，完全格挡一次（"伤害保护手套"类词条） |
| 4 | 陷阱减伤 | `TrapDamageReduction%` |
| 5 | 反击无敌 | `isCounterInvincibleApplied` → 触发 `OnCounter`（弹反类） |
| 6 | **招架(Parry)** | `parryInvincibleApplied` → `OnParry` + 获得短暂无敌 |
| 7 | 受击无敌帧 | `isHitInvincibleEnabled` |
| 8 | **冲刺闪避** | `isDodgeInvincibleApplied`（冲刺无敌帧，见 §4） |
| 9 | **格挡(Guard)** | 见下方展开 |
| 10 | **闪避掷骰** | `闪避率 = 100 × ln(Evasion/6200 + 1) × 0.8 + ABSOLUTEEVASION`（Evasion 上限 10000 → 软上限 ≈86%）；攻击者 `IGNOREEVASION%` 削减 |
| 11 | 攻击者伤害加成 | `AllDamageBonus%`、队长 `FOLLOWERDAMAGE%`、`ADVANCED_NEGOTIATION`（议价属性转化伤害!）、`ELITEDAMAGE%`（仅Boss/精英）、`DASHCOUNT×WEAPONDAMAGEBONUSBYDASHCOUNT%`（冲刺层数转伤害）、`DEBUFFDAMAGE/POISONDEBUFFDAMAGEBONUS%`（仅元素异常伤害）、**`GOLDHAND`（金钱转伤害：每 200 金 +1%，上限 20 层）**、`TRUEDAMAGE`、`IGNOREDEFENSE` |
| 12 | **暴击/处决** | 暴击率 `criticalChancePercent − 受击者CRITICALRESIST%`；`EXECUTION>0` 时溢出暴击率(−100%) 掷**处决** |
| 13 | **暴伤结算** | `criticalDamageRate`（默认 50%）+ `CriticalDamageBonus` + 队长贡献；处决 ×2 |
| 14 | 攻守转换 | 攻击者 `DEFENSETOATTACK`：自身减伤属性反哺伤害 |
| 15 | 受击修正 | `RECEIVEDDAMAGEREDUCTION%` / `RECEIVEDDAMAGEINCREASE%` |
| 16 | **元素防御** | 对应 `FIREDEFENSE/ICEDEFENSE/LIGHTNINGDEFENSE/PHYSICALDEFENSE%`（上限 99） |
| 17 | **护甲减伤** | `减免量 = damage × ln(DamageReduction/40 + 1) × 0.445`（对数软曲线）；攻击者 `IGNOREDEFENSE%` 削减免减量 |
| 18 | 固定值 | `+ TRUEDAMAGE − TOUGHNESS`，**下限 1 点** |
| 19 | 护盾链 | `Shield`（普通盾）→ `MPSHIELD`（MP 当血量扣） |
| 20 | 硬直 | `staggeringLevel − staggerResist`；`remainingSuperArmor` 霸体免硬直 |

**格挡展开**（`UnitAvatar.cs:2653`）：格挡方向与伤害方向做点积判定是否在
`guardAngle` 扇形内；成功则消耗 `MP = 10 × (1 − GuardResist%)`（**MP 是防御资源**，
耗尽 → GuardBreak 硬直）；**完美格挡**：`guardStartTimer − latencyBonus < PerfectGuardTime`
窗口内减半消耗并触发专属特效/事件（`OnGuardSucceeded(damage, isPerfect)`）。

**两条对数曲线**是数值设计的核心（防堆叠收益递减）：
- 减伤：`ln(D/40+1)×0.445` → 40 点防 ≈ 30% 减伤，400 点 ≈ 74%，无限趋近但难达 99%
- 闪避：`ln(E/6200+1)×0.8` → 后期堆闪避必须靠 `ABSOLUTEEVASION` 直通项

---

## 4. 动作层（手感来源）

- **冲刺**：`DashCount`（属性可加，`DASHCOUNT`）——冲刺次数直接参与伤害
  （`WEAPONDAMAGEBONUSBYDASHCOUNT`，见 §3 第 11 步）；冲刺期间 `StartDodgeInvincible`
  给出**无敌帧**，时长吃 `DashInvincibleTimeBonus`；`DASHEVASION` 词条把无敌帧闪避
  显示为"闪避"飘字。冲刺本身可越过坑洞（`대시 시 충돌 무시`）。
- **格挡/招架/反击**：三种"免伤态"独立计时（`WeaponController` 状态机），
  完美格挡窗口 `PerfectGuardTime`、招架成功奖励无敌（`parrySuccessBonus`）。
- **受击无敌帧**：普攻命中后短暂 `isHitInvincibleEnabled`，防止多弹丸同帧融化。
- **霸体/超甲**：`remainingSuperArmor` 期间免疫硬直（Boss 招式常用）。
- **硬直**：`staggeringLevel`（开火数据 SO 每招可配）对抗 `staggerResist`。

---

## 5. 元素系统

- 四主元素 + 混沌(Chaos)：`EDamageElementalType`（Fire/Ice/Lightning/Physical/Chaos…）。
- **元素转换**（`UnitAvatar.cs:1739`）：属性如 `FIRETOICE%` 表示火伤害**溢出部分**
  （超过 20 的部分）按百分比转为冰——多元素混构筑的收益通道；
- 元素异常：感电(`ElectricStack` 加速触发)、灼烧、冰冻（`CharacterDebuff/CharacterBuff`
  行为类 + `DEBUFFDURATION/BUFFDURATION/DebuffImmunity` 属性）；
- 混沌伤害：`isForcedChaosDamage` 强制变色与专属结算。

---

## 6. 联机战斗（Mirror 服务端权威）

- 结算全在服务端；客户端表现走 `RpcApplyDamage` / `DamageFeedback`。
- **队长/随从加成**：`NetworkLeader` 体系——随从攻击继承队长
  `FOLLOWERDAMAGE / FOLLOWERCRITICAL(±贡献率 FOLLOWERCRITICALCONTRIBUTE) / FOLLOWERDEFENSE`。
- **多人难度缩放**（Const.json）：每多 1 名玩家——
  `bossBonusHpByPlayerNumber = 90`（Boss 血 +90%/人）、
  `enemyBonusHpByPlayerNumber = 60`、`enemyBonusDamageByPlayerNumber = 10`、
  `bossBonusDamageByPlayerNumber = 12`。

---

## 7. 战斗数值数据源总清单（★本文核心交付）

> 每一行的"如何生效"均已在 §2-§6 对应位置出现；`ID/数值` 表达式
> （如 `"FIRE_DAMAGE/2"`）由 `StatusDatabase.CreateStatusEntity` 统一解析——
> **一套状态语法贯穿 套装/BossHard/药水/服装/局外**。

### 7.1 代码内常量

| 源 | 位置 | 内容/数量 | 作用 |
|---|---|---|---|
| **Const.json** | `assets/Data/Const.json`（游戏内 `Resources/Const` TextAsset） | 118 键 | 全局调参表：联机缩放、格挡消耗、暗云倍率(darkCloudDamagePercent=110%)、蓄力横扫(chargedSweep×5)、金手叶(goldHandLeaf=200/Max=20)、双生掉率分档、武器专属机制常数……被 `KeywordDatabase.GetConstValue()` 按键读取 |
| **ConstFloat.json** | 同上 | 2 键 | 浮点常量（当前仅 2 个） |
| **硬编码公式** | `UnitAvatar.cs` | — | 两条对数曲线、暴击/处决、护盾链顺序（§3）——改动需重编译 |

### 7.2 ScriptableObject 资产（运行时按 Resources 目录加载）

| 源 | 数据 | 加载点 | 战斗作用 |
|---|---|---|---|
| **StatusEntity** ×186 | `assets/Data/StatusEntity.json`（`Resources/Status`） | `StatusDatabase.Initialize` | 每条 = `id + className(行为类) + 显示配置`；行为类（`Status/StatusInstance_*.cs`）决定是改属性还是挂特效。例 `CRITICAL → StatusInstance_Critical → AddCustomStat(Critical)`；`divideForDisplay=100` 即内部值×100 显示为 % |
| **WeaponEntity** ×196 | `assets/Data/WeaponEntity.json` | 武器抽取/进化链 | 武器注册表（强化来源 enhanceFromId、标准强化词条） |
| **NewWeaponFireData*** ×546 | `assets/Data/NewWeaponFireData_*.json` | 武器预制体引用 | **每招的伤害倍率/元素/公式(HIGHEST等)/硬直/击退/突进/耗蓝**（§2 全部乘数的提供者） |
| **ActiveSkillEntity** ×40 | `assets/Data/ActiveSkillEntity.json` | `Charm_Magic.skill` | 魔法书技能：`mpCostsByLevel[3]`(随技能等级)、`chargingTime/maxChargingPower`(蓄力档)、`ammo`、`cooldownTime`、施法位移(magicDash*) |
| **BossHardEntity** ×10 | `assets/Data/BossHardEntity.json` | `BossSpawner.cs:643` 逐条 `CreateStatusEntity` 后 `ApplyStatus` | Boss 强化词条（表达式数组，如 Berserk=`["FINAL_HP/-20","FINAL_DAMAGE/50"]`） |
| **HardModeShardEntity** ×17 | `assets/Data/HardModeShardEntity.json` | `HardModeManager.cs:77 → hardModeEnvironment[shardKey]=effectPerLevel[level]` | 自定义难度：写入**同步字典**，由生成器/BossSpawner 消费（如 `FEROCIOUSCLAWS` 加伤害、`BOSSPATTERN` 开启硬模式招式、`PROLIFERATE` 怪物增殖） |
| **TreeShopItemEntity** ×56 | `assets/Data/TreeShopItemEntity.json` | 局外天赋树 | `EBehaviour`: `Status`(直接挂状态实例=永久战斗属性) / `CustomScript`(Miniscript) / `UnlockItem` / `StartingMoney` / `PassivePoint` / 剧情开关 |
| **CostumeEntity** ×28 + Skin ×79 | `assets/Data/Costume*.json` | `PlayerAvatar.costumeStats` | 服装战斗加成：同样是 `StatusInstance` 列表；含默认武器/攻击动画变体 |
| **KeywordEntity** ×406 | `assets/Data/KeywordEntity.json` | `KeywordDatabase` | 词条释义/tooltip 换算（显示层，不改数值） |
| **PassiveEntity** ×8 | `assets/Data/PassiveEntity.json` | 被动系统 | 被动技能数据 |

### 7.3 预制体序列化组件（数值在 prefab 上，不在 SO 上）

| 源 | 位置 | 战斗作用 |
|---|---|---|
| **神器预制体** ×471 | `assets/Data/item_prefabs.json`（原位于 sharedassets0） | `Charm_*` 组件字段 = 神器全部效果参数（205 个行为类，见 `src/Charms/`）——如 `attackSpeedUnitByLevel[]` 按等级数组 |
| **武器预制体** ×195 | `assets/Data/weapon_prefabs.json` | `WeaponSimple` 上的开火数据引用表、武器个体加成 |
| **怪物预制体**（119 个 `Unit_*` 类） | 游戏资产内（未整表导出） | `UnitAvatar` 组件序列化值 = 该怪的 `maxHp(默认100)/staggerResist/monsterType` 及 AI 参数；Boss 由 `BossSpawner` 在此基础上叠加（§6 联机缩放 + BossHard） |
| **石板/格子等级** | 见 `ANALYSIS.md` §4 | 通过提升神器等级间接放大战斗数值（`maxLevel=5` 钳制） |

### 7.4 属性注册表（代码侧）

| 源 | 位置 | 说明 |
|---|---|---|
| **ECustomStat 枚举** ~70 项 | `src/Systems/ECustomStat.cs` | 全部"正式"属性名：四系伤害/暴击/闪避/减伤/格挡抵抗/冲刺数/冷却回复/处决/荆棘/感电层数…（§3 公式中全部消费方） |
| **字符串扩展属性** | `GetCustomStatUnsafe("XXX")` | 未入枚举的隐藏属性（`DASHEVASION/GOLDHAND/TRUEDAMAGE/DEFENSETOATTACK/MPSHIELD/CRITICALRESIST/FIREDEFENSE…`）——神器/难度词条大量使用，只能靠源码检索 |

---

## 8. 关键公式速查卡

```
攻击伤害 = 元素属性(或公式) × (1+武器加成%) × (1+类型加成%) × (1+耗蓝加成%) × (1+最终武器%)
           × 开火倍率 × 最终倍率 …（防守端再加 §3-11 的十余项）

护甲减免   = damage × ln(护甲/40 + 1) × 0.445          （软上限）
闪避率     = 100 × ln(闪避/6200 + 1) × 0.8 + 绝对闪避   （闪避 ≤ 10000）
暴击       = (来源暴击 − 受击者暴抗%) ；处决 = 暴击率−100 溢出部分，伤害 ×2
格挡消耗   = 10MP × (1 − 格挡抵抗%)；完美格挡减半；MP 尽 → GuardBreak
联机 Boss  = 基础 × (1 + 0.9×额外人数)（血）；小怪 +60%血/+10%伤 每人
元素转换   = (来源元素 − 20) × 转换%  → 目标元素（20 以上溢出才转）
```

---

## 9. 与构筑系统的衔接（交叉引用 `ANALYSIS.md`）

战斗数值的大多数"乘数槽位"都被背包构筑占用：套装/石板等级→神器效果档位；
神器(Charm_*)→ AddCustomStat / 行为事件（`OnAttackUnitBeforeOperation`、
`OnCalculateDamage`、`OnEvade`、`OnCounter`……`UnitAvatar.cs:1534` 起的事件墙）；
武器进化链→开火数据升级。**事件墙 + 属性字典 + 状态表达式**三件套，
就是"205 个神器类能组合出深度构筑"的全部技术底座。
