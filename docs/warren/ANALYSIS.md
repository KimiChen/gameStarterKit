# Sephiria 构筑系统（Build System）深度分析

> 基于反编译源码（`src/`）与资产数据（`assets/Data/`）的逆向结论。
> 所有行号引用均指向反编译代码，仅供参考。

---

## 0. 一句话总结

Sephiria 的构筑深度来自**四条互相咬合的轴**：

1. **流派轴** —— 22 个物品分类的套装件数阈值 + 适应性掉落正反馈；
2. **空间轴** —— 6×7 网格背包上的"格子等级 + 石板位置效果"（类背包乱斗的空间谜题，但用**相对方位 DSL**实现，而非物品形状占格）;
3. **成长轴** —— 神器 5 级成长、格子升级、双生神器配对合成、石板雕刻(Engraving)；
4. **武器轴** —— 独立于神器的第二构筑系统（196 把武器 / 546 条开火数据 / 69 种改装件）。

---

## 1. 网格背包 GridInventory（核心类，6252 行）

`GridInventory.cs:10` — 继承 Mirror `NetworkBehaviour`，**整个背包状态服务端权威、全量同步**。

### 1.1 尺寸与扩容

```csharp
public const int MaxSubBagCount = 18;   // 副背包上限
public const int MaxWidth  = 6;         // 固定 6 列
public const int MaxHeight = 7;         // 最高 7 行 → 42 格上限
public short CurrentInventoryStorage = 24;  // 初始 24 格（4 行）
public byte Width = 6;
public byte Height => (byte)Mathf.CeilToInt(storage / Width);  // GridInventory.cs:455
```

初始 4 行，通过局外/局内奖励扩到最多 7 行。**格子不是平权的**——这是本作背包玩法的根基：

### 1.2 七张"格子上叠加的状态矩阵"（全部是 Mirror 同步容器）

| 矩阵 | 作用 |
|---|---|
| `inventoryMatrix : SyncDictionary<ItemPosition, NewItemOwnInstance>` | 格子 → 物品实例 |
| `charms / stoneTablets` | 格子 → 神器/石板行为组件（与物品一一对应，分表存储） |
| `levelMatrix` | **格子等级**（格子本身可升级，等级转授给放在上面的物品） |
| `maxLevelMatrix` | 格子等级上限 |
| `disableMatrix` | 被禁用的格子（石板"X"效果制造负空间） |
| `ignoreCriteriaMatrix` | 忽略判定条件的格子 |
| `multiplyLevelMatrix` | **等级倍乘格子**（石板 MUL/n 制造的爆发点） |
| `dungeonTempLevels` | 本局临时格子等级 |
| `mysticPositions : SyncList<ItemPosition>` | 神秘格子（随机增益位） |

**设计核心**：物品强度 = 物品自身等级（受 Charm maxLevel 限制）+ 所在格子等级 × 倍乘。
"把关键神器放在被强化/倍乘的格子上"是空间规划的收益来源。

### 1.3 其他背包容器

- **药水腰带** `numberOfPotionStorage`（独立于网格的药水栏）
- **副背包** `subBagMatrix`（上限 18 格，`cannotStoreInSubBag` 标记的物品不可存入）
- **临时背包** `temporaryInventory`（结算/拾取缓冲）
- **起始物品** `startingItems`（build 起动物品，`itemBehaviour=StartUp`）
- **自动整理** `AutoArrangeState/SlotState`（`GridInventory.cs:109` 起）——背包乱斗式的一键收纳状态机

---

## 2. 物品体系与内容量

`ItemEntity`（SO 资产，`ItemDatabase.cs:53` 运行时 `Resources.LoadAll` 加载）：

**全量 491 条，剔除禁用/测试后有效 385 条：**

| 类型 | 数量 | 说明 |
|---|---|---|
| 神器 (Charm) | **272** | 构筑核心；对应 **205 个 `Charm_*` 行为类** |
| 石板 (StoneTablet) | 62 | 空间效果件（见 §4） |
| 药水 | 26 | `PotionEffect_StatusInstance.stats` 直接改属性 |
| 可鉴定 | 24 | 未鉴定随机物品 |
| 杂物/食物/卷轴/投掷 | 少量 | |

稀有度分布：普通 66 / 非凡 148 / 稀有 124 / 传说 46 / 永恒 1。
另有异空间商店物品 8、魔女帽物品 13（`EItemActiveType`）。

### 2.1 神器行为架构

```
Charm_Basic (NetworkBehaviour)          ← 通用底座
 ├── maxLevel = 5                        ← 神器最高 5 级（Charm_Basic.cs:46）
 ├── EffectEnabledLevel / limitedEffectEnabledLevel  ← 效果随等级逐档解锁
 ├── BuildEffectString(...)              ← 按等级渲染 tooltip 数值
 └── 205 个子类（Charm_AlchemyFlask、Charm_Wings、Charm_FrozenEgg…）
      └── Charm_Magic : IMagicCharm      ← 主动技能型神器
           ├─ skill : ActiveSkillEntity  （40 种主动技能池）
           ├─ maxAmmo / cooldown / additionalCost
           └─ FireCasting(...)           （Charm_Magic.cs:296）
```

**数值不在 ItemEntity 上**：`ItemEntity.resourcePrefab` 指向预制体，效果参数序列化在
预制体的 `Charm_*` 组件里（已提取至 `assets/Data/item_prefabs.json`，共 471 条）。
阅读姿势：`items_zh.json` 找到物品 → 取 `组件[].class` → 对照 `src/<类名>.cs` 看行为。

### 2.2 双生神器（Unique Pair）

`GridInventory.cs:230` 区域：`isDual` 物品两两配对可合成强化（`UniquePairArtifactConvertData`、
`uniquePairAddedComboCount`），是传说构筑的锁钥机制。

---

## 3. 套装（分类）与适应性掉落 —— 流派正反馈

`ItemCategoryEntity`（22 个分类，`assets/Data/categories_zh.json`）：

```csharp
public SetTarget[] setStatus;   // { itemCount, status } 阈值表
```

`GridInventory.SearchSetEffectInInventory()`（`GridInventory.cs:3412`）：按背包内**同分类件数**
查表应用 `StatusInstance`（状态数据库 186 条，`assets/Data/StatusEntity.json`）。
例：火焰分类 2/4/6 件 → 逐档火伤加成（具体阈值见表）。

**适应性掉落**（`GridInventory.cs:837`）—— 流派滚雪球的关键：

```csharp
int num = setEffectCount * (adaptiveItemDropBonus + defaultAdaptiveWeight);
if (setEffectCount >= 10) ... >= 8 ... >= 6 ... >= 4 ...   // 4/6/8/10 件分档
```

你已凑的分类件数越多，该分类物品掉落权重越高——**玩家被系统推向"选定流派后越走越深"**，
这解释了评测里"围绕一个大流派构筑扩张"的体感。

---

## 4. 石板系统 —— 空间谜题的真身（StoneTablet.cs，2548 行）

> 注意：类似背包乱斗的**图案摆放加成**（ArrangementBonus）在正式版被硬编码禁用
> （`GridInventory.cs:450  ArrangementBonusEnabled() => false`，仅存 BlackHole/Trio 4 条定义）。
> 实际生效的空间系统是石板。

### 4.1 图案查询语言（DSL）

每块石板预制体上有两段文本（`assets/Data/tablets_zh.json` 已全量导出 62 块）：

- `conditionQuery` —— 条件区（哪些格子需要满足什么：`ITEM`/`CHARM`/`PLACED`）
- `query` —— 效果区（对哪些格子施加什么效果）

**方位指令 38 个**（`StoneTablet.ParseQuery`, `StoneTablet.cs:561`）：

| 类别 | 指令 |
|---|---|
| 自身 | `O` |
| 正交 1~4 格 | `LEFT/RIGHT/UP/DOWN` × 重复（`LEFTLEFT`…×4） |
| 对角 | `DIAUPLEFT/DIAUPRIGHT/DIADOWNLEFT/DIADOWNRIGHT` |
| **马步** | `KNIGHTUPLEFT/UPRIGHT/DOWNLEFT/DOWNRIGHT` |
| 整行/整列 | `HORIZONTAL/VERTICAL` |
| 棋盘交错 | `CHECKERBOARD / CHECKERBOARD2`（两种相位） |
| 边缘锚定 | `TOP/BOTTOM/LEFTEND/RIGHTEND`（贴边判定） |
| 绝对索引 | `IDX n / RIDX n`（从头/尾数第 n 格） |

**效果指令 4 种**（`StoneTablet.cs:441-474`）：

| 值 | EffectType | 含义 |
|---|---|---|
| `±N` | `IncreaseConstLevel` | 目标格子物品等级 ±N |
| `X` | `Disable` | **禁用目标格子**（负空间） |
| `IGNORECRITERIA` | `IgnoreCriteria` | 目标格无视条件判定 |
| `MUL/n` | `MultiplyConstLevel` | 目标格物品等级 ×n |

石板支持 4 向旋转（62 块中 48 块 `isRotatable`，`rotation` 参与方位换算）。

### 4.2 实例还原（照抄 DSL 即可复刻）

| 石板 | 原文 | 解读 |
|---|---|---|
| 诅咒 | `CHECKERBOARD2 1` + `CHECKERBOARD -1` | 全背包棋盘格交错 +1/-1（赌徒式重排） |
| 奇迹 | `HORIZONTAL 1` + `VERTICAL 1` | 所在整行 +1 且整列 +1（十字强化） |
| 正义 | 条件 `LEFTEND PLACED`+`RIGHTEND PLACED`，效果 `VERTICAL +1` | **贴着左右边缘放置时**整列 +1（边缘流） |
| 压迫 | `RIGHT X` | 右侧格子被禁用（以负空间换强度） |
| 聚集 | `HORIZONTAL -1` + `UP +3` | 整行 -1，上方 +3（牺牲换爆发） |
| (自定义) | `O MUL/2` | 自身格倍乘 ×2（`CUSTOM_TABLET_ID=2101`，雕刻产物） |

### 4.3 石板雕刻（Engraving）

`GridInventory.cs:229` `engravings : SyncList<StoneTablet>` + `tabletEngravingCount` ——
把石板效果"雕刻"到其他物品/格子上，是局外成长对背包空间的再入侵。

---

## 5. 武器系统（独立第二构筑轴）

- **196 个 `WeaponEntity`**（`assets/Data/WeaponEntity.json`），9 大类：
  `SwordAndShield / GreatSword / Dagger / Crossbow / StaffMagic / Katana / Golem / Staff / Random`
- 每把武器 = `mainWeaponPrefab`(+副手) + `standardEnhancements` + `enhanceFromId` **进化链**
  （Tier1→Tier2→Tier3，资产名即 `_Tier3_E` 之类）
- 开火数据 **546 条**（`NewWeaponFireData_*`）：近战 393、弹丸 71、连发 50、散射 9、
  特殊投射 21、召唤 2 —— 近战形态数据量最大，对应"每武器 50+ 升级"的官方宣传
- **69 个 `WeaponAddon*` 类**：攻击附带、格挡反制、横扫增伤等改装件
- `WeaponUniqueEffect` 本地化 54 条：武器专属词条

---

## 6. 难度系统（评测区争议的来源）

- **BossHardEntity ×10**：Boss 强化词条，效果为表达式字符串
  例 `Berserk = ["FINAL_HP/-20", "FINAL_DAMAGE/50"]`（血 -20%、伤 +50%）
- **HardModeShardEntity ×17**：难度碎片，`shardMaxLevel / effectPerLevel / stepIncreasePerLevel`
  ——逐级放大的自定义难度（叠加到 60 层）
- **HardModeRewardEntity ×13**：难度奖励
- 最终 Boss + "敌人吸血"词条在高难下的失控，在代码层就是 BossHard 效果表达式与
  Boss 血量参数的乘性叠加（参见 Steam 评测差评集中点）

---

## 7. 局外与外围系统（内容量补充）

| 系统 | 数据 | 规模 |
|---|---|---|
| 局外天赋树 | TreeShopItemEntity | 56 节点（`priceByQuantity` 分档定价） |
| 主动技能 | ActiveSkillEntity | 40 |
| 状态/Buff | StatusEntity | 186 |
| Tooltip 关键词 | KeywordEntity | 406 |
| 服装 | Costume/Skin | 28 + 79 |
| 剧情 | 本地化 `Talk_*` 键 | 1046 条对话 |
| 本地化总量 | 15 语言 | 6590 键/语言 |

Mod 支持内建：`HorayModAPI.LoadModItemDatabase()`（`ItemDatabase.cs:106`）+ `ExamMod`
本地化目录——物品/本地化均留了运行时注册接口。

---

## 8. 联机架构对构筑系统的影响

背包全部状态使用 Mirror `SyncVar/SyncDictionary` 服务端权威同步（`GridInventory` 字段区）。
后果（与 Steam 评测抱怨完全对应）：

- 掉线无法重连 = 背包状态只存在于 host 内存（无持久化快照机制）；
- 延迟制 netcode（FizzySteamworks + kcp2k）而非 rollback → 高强度走位输入延迟；
- `Permission` 写锁（`GridInventory.cs:82`）串行化背包操作，防止多端并发改格子。

---

## 9. 设计洞察（可迁移的经验）

1. **空间收益不用物品形状，而用"格子状态叠加"**：物品全部 1×1，空间博弈转移到
   格子等级/倍乘/禁用 + 石板相对方位 DSL——实现简单（无需形状旋转碰撞检测）、
   又保留背包乱斗的规划乐趣，还天然支持 4 人联机同步（同步格子状态远比同步形状布局便宜）。
2. **DSL 即内容**：石板效果是一行文本（`"HORIZONTAL 1\nVERTICAL 1"`），
   设计师加一块石板 = 写一行字符串，无需改代码——62 块石板产出极高。
3. **正反馈闭环**：套装件数 → 适应性掉落权重 → 更多的同类物品 → 更高的套装档位。
4. **被禁用的系统也保留在包里**（ArrangementBonus）——EA 期间试过图案玩法后砍掉的痕迹，
   逆向才能看到的"设计墓地"。
5. **数值与表现分离**：ItemEntity(壳) → prefab 组件(数值) → Charm_*(行为) →
   StatusEntity(通用状态池) 四层解耦，186 个状态被所有系统复用。
