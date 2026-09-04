# Sephiria 全 Boss 图鉴（逆向数据版）

> 来源：游戏预制体序列化数据（HP/组件）+ AI 源码（招式协程/字段）+ 精灵图命名（动作表）
> + 本地化（名称/台词）。数据文件：`assets/Bosses/*.json`，形象帧：`assets/Bosses/portrait_*.png`。
> HP 为预制体基础值，实际受 BossHard 词条与联机人数缩放（每 +1 人 HP+90%/伤+12%）。

## 一、主线 Boss 战（14 场）

| # | Boss | 基础 HP | AI（代码量） | 技能与机制 |
|---|---|---|---|---|
| 1 | 掠夺者头目"拉塔卡"<br>`OinkKing` | 2950 | UnitAI_OinkKing (364行) | 4 套攻击循环 Pattern0~3 + **召唤魔法师增援**（SummonMagic）；台词 3 条 |
| 2 | 鼹鼠头领"黑爪莫格迪"<br>`MoleChieftain` | 1650 | UnitAI_MoleChieftain (592行) | 攻击模式由 Unit_MoleChieftain 挥砍组件驱动；专属场景"鼹鼠头领办公室"；台词 15 键 |
| 3 | 爆破专家"奥德纳"<br>`MoleBigBomb` | 3000 | UnitAI_MoleBigBomb (369行) | 炸弹投放战（按模式播报台词——**全 Boss 最话痨，23 条**） |
| 4 | 监狱看守长<br>`MoleElite_Boss` | 1400 | UnitAI_MoleElite (244行) | **74 个动作帧**（86 张精灵）：攻击连段/炸弹/呼援（Call）；战斗中触发钥匙事件 |
| 5 | 影刃"拉里德"<br>`PantherRogueKing` | 2450 | UnitAI_PantherRogueKing (505行) | 高机动刺客：**冲刺突进 Rush + 影分身匕首四式**（CloneDagger / CloneRandomDagger / CloneDaggerSpread / BasicAttack）；台词 4 条 |
| 6 | 图书馆守护者"彭塔克西斯"<br>`LibraryGuard` | 2572 | UnitAI_LibraryGuard (184行) | **火球弹幕**（LibraryGuardFireBall 00-05 + 三段特效）；另有 SimpleBoss 变体（4000 HP，同一名称键） |
| 7 | 疯狂科学家"埃尔玛"<br>`MadArmadillo` | 本体 135<br>(驾驶魔像) | UnitAI_MadArmadillo (857行) | **驾驶战**：侏儒本体 HP 极低，真身是魔像（Golem，1063 张精灵）；36 个动作帧含 **GolemCore 魔法核心**、空中机甲（Airborne 系列）；事件战形态 2000 HP；台词 13 条 |
| 8 | Qliphoth 守护恶魔"科维斯"<br>`BirdDemon` | 4000 | UnitAI_BirdDemon (292行) | 空战型，14 个动作：**爪击 TalonAttack / 龙卷风 Tornado / 波状俯冲 WaveAttack / 双重俯冲 DoubleAttack / 护盾 Shield / 远程 RangeAttack / 风刃 FlyWind**；第五章复刻形态 BirdDemonC5；台词 6 条 |
| 9 | Qliphoth 守护恶魔"克拉兹"<br>`LizardDemon` | 5500 | UnitAI_LizardDemon (296行) | **冲撞型**：Dash 直线冲锋 + DashToCenter 回轴再突进 |
| 10 | 噬心之根"哈兹"<br>`RootDemon` | **1**(机制) | UnitAI_RootDemon (217行) | **机制 Boss**：HP 锁 1（无敌/机制击杀），另有"残余"形态（MainRun 复战） |
| 11 | Q 守护者<br>`QBoss` | 6500 | UnitAI_QBoss (576行) | **激光树 PatternTreeLaser**（光束分叉弹幕）；强化版 QBossAdv（821 行，同 6500 HP）；台词 7+7 条 |
| 12 | QQ 守护者<br>`QQBoss` | 10000 | UnitAI_QQBoss (905行) | **召唤残影混合战**：狐之残影攻击（FoxAttack）/ 鼠之法球（MouseOrb）/ 触手召唤（TentacleSummon）/ 菱形爆破（DiamondExplosion）/ 瞬移（Blink） |
| 13 | QQQ 终焉守护者<br>`QQQBoss` | **17000** | UnitAI_QQQBoss (**1342 行，全游戏最大 Boss AI**) | **12 套模式**：圆环弹幕 CircleAttack / 黑暗领域 Darkness / 坠落群像 FallGuys / **一闪 Issen**（居合秒杀判定）/ 激光 LaserAttack / 进出突袭 InAndOut / 方尖碑召唤 ObeliskSummoner / 单位召唤 SummonUnit / 终局模式 LastPattern（**可回满血 LastPatternMaxHpRestore**—— Steam 差评"打 40 分钟回满血"的出处） |
| 14 | 教主"阿斯卡德"<br>`Askard`（四章四形态） | C1 2000<br>C2 2000<br>C3 4000<br>C5 4000×2 变体 | UnitAI_Askard (993行)<br>_Chapter2 (872行)<br>_Chapter3 (646行) | **贯穿全程的反派**：激光（AskardLaser V1/V2）+ 假身（Fake）+ 法杖召唤（Phase1_SummonStaff）+ **三阶段变身 ChangePhase2/3**；地图专属头像（AskardMap）；台词 24 条（最多）；大地图 NPC 形态（DeepCave，250 HP） |

## 二、小 Boss / 精英战（8+）

| 小 Boss | HP | 机制要点 |
|---|---|---|
| 骷髅山羊 `GoatSkeleton` | 1500 | 冲锋（Charge）+ 跳跃踩踏（JumpAttack_Stomp）；序章/深洞复刻变体 |
| 恶魔化的魔道书 `LibraryDemonBook` | — | **吃豆人式追踪**（PackmanMove）+ 瞄准弹（Aiming）+ 推挤弹（PushBullet）+ 落页踩踏（Stamp）；眩晕 UI（Groggy） |
| 狐之残影 `Fox` | — | 与 QQBoss 的 FoxAttack 同源；草原探索"强敌"事件出现 |
| 狮之残影 `Lion` | — | 同上（残影三兄弟之一） |
| 鼠之残影 `Mouse` | — | QQBoss MouseOrb 同源 |
| 黑豹刺客 `PantherRogue` | — | 小规模"影刃"前哨战 |
| 旋转棒恶魔 `SpinningStaffDemon` | — | 旋转法棍弹幕 |
| 埃尔玛（事件战）`MadArmadilloEvent` | 2000 | 剧情 NPC 战形态 |

## 三、Boss 数值放大器（叠乘关系）

1. **BossHard 词条 ×10**（每场随机叠加）：狂暴（HP-20% 伤+50%）/ 暴击抗性 30 / HP+15% 防+8 /
   **无视防御 50% / 无视闪避 50%** / 火·冰·雷·物抗 33 / 坚韧 10 —— 表达式见 `assets/Data/BossHardEntity.json`
2. **联机人数缩放**：每 +1 人 Boss HP+90%、伤+12%；小怪 HP+60%、伤+10%（Const.json）
3. **高难碎片 ×17 种**：写入 `hardModeEnvironment`（FEROCIOUSCLAWS 加伤 / BOSSPATTERN 开启硬模式招式 /
   PROLIFERATE 怪物增殖…），可叠至 60 级难度
4. QQQBoss 终局模式自带**回满血**机制——与上述叠乘后即差评区"百万血 40 分钟"体验的完整成因链

## 四、文件索引

- `assets/Bosses/bosses_raw.json` —— 26 条 Boss 预制体原始数据（HP/组件/精灵）
- `assets/Bosses/boss_ai_summary.json` —— 各 AI 招式协程/弹幕字段统计
- `assets/Bosses/boss_visual.json` —— 精灵动作名集合与形象文件映射
- `assets/Bosses/portrait_*.png` —— 7 个 Boss 的代表帧（Askard/BirdDemon/Golem/LibraryGuard/MadArmadillo/MoleElite/QBoss；其余 Boss 的形象在动画图集中按帧命名，未单独导出）
