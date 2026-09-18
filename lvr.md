# 用 gono 框架 1:1 复刻 Last Voyage: Rising —— 实施规划

> - 日期：2026-09-18。本仓基线见 `git log -1`。状态：**规划 v1，未开工**；⛔ 未实施任何 LVR 能力，不改变既有承诺。
> - 方法论沿用 [slg.md](slg.md)：**设计移植，不是代码搬运**。
> - 治理：⛔ 不进 plan-v5；实施状态只在本文 §11 回写；开放项去向遵循 [docs/EXTRAS.md](docs/EXTRAS.md) §5.2。
> - 依据：两轮全量测绘（逆向源 + 框架）+ 11 个子系统逐个精读与框架映射 + 14 条框架缺口对抗复核 + 完整性批判修订。
>   全部结论均已回代码核验，引用路径为核验当时实测。
> - 逆向源：`../sourceVersion/lvr-1.0.0/`（仓外，只读）；全记录 `../apk/LastVoyageRising-1.0.0.md`。

---


## 1. Context

`../sourceVersion/lvr-1.0.0/` 是 Last Voyage: Rising（`com.sea.an`，9RING 发行）的逆向整合版：
Unity 2022.3.62f3 + IL2CPP + HybridCLR 热更 + xLua，无加固，全静态逆向完成，业务逻辑完全可读。
目标是用本仓 gono 框架（Cocos Creator 3.8.8 + FairyGUI + Colyseus + MySQL/Redis）重新实现它。

**已拍板的七条前提**（⛔ 本规划不再重开）：

| 项 | 决定 |
| --- | --- |
| 复刻范围 | 完整 1:1 复刻（全系统对齐原作） |
| 架构落点 | 新建独立 `lvr` kit（`apps/kits/lvr/`），⛔ 不建在 `slg` kit 之上 |
| 在线形态 | 服务端权威 + 持久世界 |
| 资产策略 | UnityPy 解包提取配置表、提取美术素材复用、补做协议手册 |
| 版权口径 | **按已选做（素材与配表复用），同时建与 snake 同规格的素材授权台账** |
| 框架前置 | **两条线并行**：框架 PR 与 `lvr` kit 阶段 1 同时开工 |
| M1 起点 | **主城 + 队列 + 资源** |
| 3D 路线 | **B：自建 3D 管线，用 Cocos 的 3D 能力**；单独出需求文档 [lvr-3d.md](lvr-3d.md)，由单独排期实现 |
| 主键预留 | **都不预留**：persona 与合服均显式列为「不提供」 |
| 首屏 | **不做框架适配**：按 kit 标准，主城从设置面板入口进入 |
| 邮件 | **kit 自建 `k_lvr_mail`**，⛔ 不提 mailer 门面 re-export PR |
| 团队口径 | 8–10 人 / 1.5–2.5 年，三条泳道（主线 / 协议层 / UI 重建）并行 |

---

## 2. 原作是什么（实测）

**品类**：商业级 4X/SLG（COK-like）海盗航海题材，前挂 merge-2 小游戏作 FTUE。全程在线、服务端权威。

场景图即核心循环（`csharp/PirateGame/GameSceneType.cs`）：
`ComposeMiniGame`（新玩家落地）→ `MainCity` → `World`，外加 `Uncharted` / 战斗 / 第三方小游戏。

### 2.1 规模

| 指标 | 数值 |
| --- | --- |
| `.cs` / 行数 | 10,909 / 1,346,286（ILSpy 产物含 async 膨胀；手写等价 **25–35 万行**） |
| protobuf 消息 | **3,992**（1,196 Req / 1,192 Ack / 677 Ntf）；运行期注册 **1,115 种**处理器 |
| 配置表 | **493 张**（`Cfg/C/`），500 个行类型（`Cfg/G/`），44 个共享列结构（`Cfg/Cm/`） |
| UI 面板类 | **~790**（646 DeepUI + 146 WndMgr）；UI prefab bundle ~540 |
| 全局事件 | `TEventType` **1,509 个成员** |
| 活动模块 | **113 个 `Activity*Module` + 51 个 Banner 模块** |
| 错误码 | **1,469 个** |
| 语言 | **15 种** |
| AssetBundle | 2,593 个（**全部未解包**） |

### 2.2 决定架构的五个硬事实

1. **战斗完全服务端权威，客户端只是回放渲染器。** 服务端逐 tick 推 `cspb/FightProcessInOneTick`
   （`FightAction` / `Taker{hpChange,absorbed,criticalRatio}` / `Unit{rageMeter,buffIds,hp}`），
   `Logic/LBattle.cs` 按 `frame.timestamp <= GameTime.Time` 缓冲释放；动作只有 `NormalAttack | CounterAttack | SpellEffectTriggered` 三种。
   ⇒ 可原样搬到框架的消息通道，**不需要客户端预测或回滚**。
2. **存在第二套客户端模拟战斗引擎**（`Game/Level/` + `Demo/Game/`），服务于休闲/FTUE 线。1:1 = 两套都做。
3. **传输是裸 TCP + protobuf**（帧 = `uint32 msgID`(LE) + body，msgID 来自 `msgid.def`）。
   框架是 Colyseus WS + Lobby RPC 信封。**协议不能移植，只能按 gono 的单源重新定义**——这是最大的隐藏工作量，见 §7。
4. **原作是 3D 游戏**（GPU skinning / 阴影 / 海面 / LOD / Spine / Timeline）。框架客户端全 2D、仓内零 3D 资产先例。见 §9.1。
5. **配置表是 Unity `ScriptableObject` 二进制**（`XCore/Data/Scriptable/BaseScriptableDataTable.cs`，落在
   `assets.data.scriptableassets*.ab`）。行类 `Cfg/G/*.cs` 给出精确列 schema。⚠ 可导出性未验证，见 §6.1。

---

## 3. 目标框架

### 3.1 三层信任模型（`docs/KIT.md` §1、`docs/PLUGIN.md` §2）

| 层 | 能定义 | 不能定义 |
| --- | --- | --- |
| framework（需 PR） | 协议信封、房型策略、state 片段、core wire、shell 钩子、npm 依赖、`apps/server/sql/schema.sql`、**HTTP endpoint 归属** | — |
| **kit** | 自己的 SQL 表（`k_<id>_*`，账本驱动迁移）、多个 gameplay mode、服务端 services、shared 类型、**独立版本化 api 面**、`kt:` Redis、effect kind、客户端页面 | 上述 framework 项；第二套货币账本 |
| plugin | ⛔ 无 | 只消费 framework + 声明的 kit |

**v0 明令禁止 kit 依赖 kit**（`docs/KIT.md` §4 原话就是拿 SLG 举例：「SLG 做成一个 slg kit，worldmap / march /
alliance 是三个 api 面」）。⇒ `lvr` 必须自建 worldmap/march，**照抄 `slg` 的实现模式但不能 import**。

### 3.2 ★ 本仓已有同类先例：`slg.md`

**这件事本仓做过一次。** `slg.md`（479 行）的开篇结论就是本案该沿用的方法论：

> 「迁移」= **设计移植，不是代码搬运**……语言/引擎完全不同，一行都不能拷；要移植的是它的架构。

配套 `tools/slg-maps/`（14 个脚本）已用 UnityPy 把 **zjcs-1.2.6 学习包**的 Unity 地图转成 kit 运行时数据。
**LVR 的资产管线照这条已验证的路做 `tools/lvr-*`，⛔ 不要另起炉灶。**

三条直接继承的结论：

1. **世界形态 = 「SQL 权威 + 视图房」**，⛔ 不是 MMO.md 的 WorldRoom。
   LVR 的行军、建造/训练/研究队列、资源产出**全部是 `f(now)` 的确定函数**，房崩了从 SQL 重放即恢复。
   ⇒ 直接免掉 **MF2 / MF3 / MF4 / MF8 / MF7 的检查点**五项框架阶段。
2. 并发契约已冻结：裸 `INSERT` 撞唯一键 → 冲突事务内重读 → 按实际状态分支；
   ⛔ 不依赖 `SELECT … FOR UPDATE` 对不存在行的间隙行为。
3. RPC 写 → 房间可见：**变更日志表 + 游标**（`k_*_log` 同事务追加、per-zone 单调 revision、tombstone、出窗走 baseline 重建）。

⚠ **两处必须纠正的过期认知**：
- 根 `CLAUDE.md` 写的「10000×10000 地图页」是**过期描述**。实测 `SLG_MAPS` 与 `apps/kits/slg/README.md`
  都是 **1500×1500（225 万格）**。任何容量论证不要拿 10000×10000 当已证基准。
- ⛔ **不要照抄 slg 的 tileId 打包**（`mapIndex<<22 | y<<11 | x`，每轴 11bit、地图 4bit ⇒ 最多 16 张图、每轴 2048）。
  LVR 有 15 种 MapType × 多实例（副本、每玩家一张未知海图、GVG 战场），实例数轻易过千。
  第一版就用 `(instance_id, x, y)` 三列或更宽编码。

### 3.3 可抄的现成实现

| 来源 | 抄什么 |
| --- | --- |
| `apps/kits/slg/` | 稀疏地块、revision 行锁、耐久回执（`op_id + payload_hash + contract_version + response_json` 逐字节重放）、锁序、批量上限溢出返回 pending、**无房间 + lazy 结算**、变更日志 + 游标。实测全量 **3,666 行（客户端 2,819 行**：mapStreamer / LOD / tilemapMesh / 资源生命周期）——这才是重复成本的真实量级 |
| `apps/kits/arena/` | kit 机制完整形：SQL + 多 mode + 多 api 面 + `arenaShop` 插件 `requires.kits` |
| `apps/plugins/builtin/` | **登录链路已由框架提供**：`login` / `areaList` / `loginNotice` / `home` / `promoHome` / `settings` / **`entryGroup`**（任意条数入口列表，真引擎已跑通）全套 route 与 View |
| `core/compute/tasks/battleSim.ts` | 战斗模拟的落点模板：worker 池 + `apps/shared/src/logic/battle.ts` 双端共享纯公式 + `logic/random.ts` 的 `SeededRandom` |
| `core/infra/{lease,lifecycle}.ts` + `economy/relayer.ts` + `archive/freezeWorker.ts` | 独立单例 worker 的完整参考实现 |
| `core/infra/streamConsumer.ts` + `K_STREAM_MAILWAKE` / `K_STREAM_KICK` | 跨节点投递总线，已实现两次 |

### 3.4 规模对照

| | gono 现状 | LVR |
| --- | ---: | ---: |
| 客户端自有代码 | ~31,800 行 | UI 一项 ~46 万行 |
| 服务端 `src/` | 25,619 行 | 协议面 1,115 种消息 |
| 最大玩法样本（snake） | ~12,000 行 | 单个 `UIMainPopup.cs` 15,062 行 |
| Lobby RPC route | 25 条 | ~870 条（1,196 Req 语义合并后） |
| FGUI 包 | 12 个 | ~200 个 |
| SQL 表 | 12 框架 + 9 样本 kit | ~100 张 `k_lvr_*` |

---

## 4. 框架缺口的真实状态

14 条声称的框架缺口经独立对抗复核（判据：不确定时判「不成立」）**全部被驳回**——
框架的原语比文档 §5.2 的字面陈述丰富得多。但「有绕法」≠「零代价」。
下表按 `slg.md` 的写法逐条给出**绕法 + 代价 + 记账去向**，⛔ 不允许任何一条在里程碑里隐身。

### 4.1 被驳回但要记账（kit 层能做，代价进工时）

| 曾以为缺 | 实际可用原语 | 绕法代价 / 记账 |
| --- | --- | --- |
| i18n（X2） | FGUI 原生 `UIPackage.setStringsSource` / `TranslationHelper.loadFromXML`（`fairygui.mjs:5222`，零调用方但可用）+ 每语言 FGUI 包 + view sidecar `sharedPkgs` + `ErrorMessage`/`errorMessageOf` 码表 + kit 自带 JSON 资源表（slg `terrain.json` 先例） | **kit 自建 `api/text` 面**（key → JSON 表）。⚠ 必须在**第一个 View 之前**定契约，否则 ~200 页全返工。宿主 chrome 的多语言化是独立框架 PR，不在 kit 可达范围 |
| loading 界面（X3） | `view/layers.ts` top 层 + `ViewMgr.ts:409` async open + AbortSignal + `packageLoader.ts` 的 deadline/三态错误码/retryable + `uiPlate.ts`。**slg 已有一份可直接抄**（`SlgMapView.ts` 加载态 + 失败重试、`SlgArtResources.ts` 批量加载 + addRef/decRef） | kit 自建，计 0.5 人月 |
| 首页入口列表（U1/U2） | `view/EntryGroupView.ts` + `logic/page/EntryGroupLogic.ts` 已渲染任意条数入口并通过真引擎验收；`host.json` groups + `PluginRegistry.entryGroups()` | 无需 PR；主城 20+ 功能入口自己画在主城页里 |
| kit 后台 worker（MF7） | `withKitTx` 放行自有表的 INSERT/UPDATE ⇒ **kit 可自建租约表**；`withKitUserFence`（离线用户锁 + 冷档自愈）、`applyKitEffect`（显式 zoneCtx，不依赖在线会话）、`readKitUserFieldInZone`、`retryKitTransaction`、`kitOpId` 全部可达；`relayer.ts` / `freezeWorker.ts` 是完整参考实现 | ⚠ **进程入口在 `apps/server/package.json`（框架 PR）**。⛔ **绝不用模块级 `setInterval` 绕**——`docs/KIT.md` §2 硬排除「导入期副作用」。**⏳ 落法待定，见 §4.3** |
| 跨用户推送（MF6） | `websocket/push.ts` 的 `pushToUser(uid,…)` + `defineLobbyPush` + 客户端 `onPush` + guild 的 `GetEvents(sinceSeq)` 自愈拉取形态 + 两条现成跨节点流总线 | 联盟/聊天/援助可做；**名册与事件落 kit 自有表** |
| 逐视口同步（MF5） | slg 阶段 1/2a 已证明「SQL 权威 + 无房 + 客户端 chunk streamer 轮询」能把大地图与行军整条链跑完并通过真引擎验收 | 首版轮询，实时视图房登记为等 MF5。⚠ 这是**体验降级**不是功能缺失 |
| 3D 场景管线 | `SlgChunkRenderer` / `SlgFarLayerRenderer` 等已用 Material / EffectAsset / 动态 Mesh / 材质销毁 / LOD / 后处理；`kind:"cocos"` View 给全屏 root Node；`SlgArtResources.ts` 是资源生命周期范本；`tools/slg-maps/verify-redraw.py` 是美术往返自检 | Cocos 3.8 本就是 3D 引擎，**不是能力缺口而是零先例 + 全部成本落在 kit**。**已拍板走自建 3D 管线**，需求拆到 [lvr-3d.md](lvr-3d.md)，见 §9.1 |
| 多资源货币 | `user_currency` 主键含 `currency SMALLINT`（65535 个码位）；`kitApi.ts:117/119` 的 `tx.debit/credit(uid, currency, …)` 是自由入参 | 无代价。⛔ 不需要第二套账本 |
| 资源连续产出 | 懒结算：kit 表存 `(rate, cap, settled_at)`，任何触碰时算 `accrued = f(now − settled_at)` 封顶，同事务一次 `tx.credit` | **一次结算一条流水，不是一 tick 一条** |
| 余额只读 | 三条路：kit 自有 SQL 纯读事务（`ALLOWED_LEADING` 含 SELECT）、`readKitUserField(InZone)`、`shop.queryOp` 这条 query 路由本就下发 `balance` | 无代价。⛔ 不需要「扣 0 元」 |

### 4.2 我复核后认为是**真限制**的四条

| 限制 | 证据 | 影响与对策 |
| --- | --- | --- |
| **kit 发不了邮件** | `core/infra/kitApi.ts` 的 export 清单里没有 mailer/sendMail；kit 只许 import `kitApi` | SLG 的战报、联盟通知、活动发奖全走邮件。**已拍板：kit 自建 `k_lvr_mail`**，⛔ 不提 re-export PR。代价（写进 kit README 冻结规则）：框架 `mail` 表与域闲置、两套邮箱并存、框架侧的 mail 唤醒流用不上 |
| **effect 通道只能加不能减** | `apps/shared/src/protocol/lobbyRpc/economy.ts:19` 明写「只加不减：kit 世界状态的扣减走 kit 自己的 SQL」；`redisScripts.ts:396/443` 的 `APPLY_EFFECT` 在 `nextValue < 0` 时钳零塞进 `under`，全仓无消费方 | **道具/材料/招募券的扣减必须落 kit 自有表**，⛔ 不能走框架 bag。⚠ 这在 **M2 就撞**（地块清理投料、加速道具、时之沙），不是 M6 |
| **kit 定义不了 HTTP endpoint** | 所有权推导给 kit 的是 `websocket/<domain>`，`apps/server/src/http/` 不在推导集 | 渠道/IAP 回调无 kit 合法路径。⇒ 真钱链路整体出范围（§9.3 已列不做） |
| **kit 设不了登录后首屏** | `NavigationPort`（`ports.ts:43`）只暴露 `open/replace/close/closeGroup`；`setAuthenticatedBase` 只在 `loginFlow.ts:750/882` 调用，而 `apps/client/src/app/` 在所有权硬排除清单里 | 原作登录后直落主城。**已拍板：不做框架适配**——按 kit 标准，`lvrCity` 是一条普通 route，从设置面板的入口进入（`builtin` 的 `settings` 已承载真实入口列表）。⛔ 不提首屏 PR。代价：与原作的「登录即主城」不同，写进 kit README 冻结规则 |

---

### 4.3 ⏳ 待拍板：定时推进（kit worker）的落法

**问题**：SLG 本质是定时驱动的，而框架今天没有 kit 可用的后台 worker 通道。

**lazy 结算能覆盖的**（只影响本人、且本人下次操作时才需要正确）：资源产出、自己的建造/训练/研究/治疗队列。
**lazy 覆盖不了的**：

| 语义 | 为什么 lazy 不够 |
| --- | --- |
| 行军到达打到**别人** | 被攻击方不操作就不会触发结算；但攻击方自己会回来看结果，可在攻击方的事务里一并写被攻击方的表 ⇒ **实际可绕，代价是被攻击方收不到即时通知** |
| 活动开/关、阶段推进 | 可做成 `f(now)` 读时判定（配置里写起止时刻）⇒ **可绕** |
| 日重置 / 周重置 | 可按 `last_reset_at` 与 `now` 的周期边界读时结算 ⇒ **可绕** |
| **排行榜 / 赛季定格** | 必须在固定时刻定格。可退化为「结算时刻之后第一个访问者触发 + 租约防并发」⇒ 可绕，但**定格时刻取决于谁先来** |
| **保留期清理**（回执表、变更日志、邮件） | 可在写路径里摊还批量 DELETE ⇒ 可绕，但无人在线时段不清理 |
| **全服无人在线时段** | 上述全部绕法都依赖「有人来触发」。跨夜低峰期一切静止 |

**四条候选路线**：

| 路线 | 做法 | 代价 |
| --- | --- | --- |
| **P1 提 MF7 最小实现** | 框架加一个 `kit-worker` 进程入口 + 读 `kit.json.workers[]` 装载，照 `core/economy/relayer.ts` / `core/archive/freezeWorker.ts` 的现成形态（两者都已有独立 npm 入口） | 一条不大的框架 PR；`slg.md` 也登记了同一依赖，做了是两个 kit 共同受益 |
| **P2 全 lazy + 读时判定** | 按上表逐条绕；在 kit README 冻结「⛔ 不承诺无人在线时按时结算/发奖」 | 零框架改动；代价是通知缺失、定格时刻漂移、低峰期静止 |
| **P3 外部触发过渡** | 用系统 cron / 独立脚本，以一个机器人账号定时调 `lvrOps.tick` 这条普通 Lobby RPC | 零框架改动、定时精确；但引入一个仓外调度依赖与一个特权账号，鉴权模型要另设计 |
| **P4 等 MF7 完整实施** | 按 `docs/MMO.md` 的设计做全套（租约保护的受限 KitTx + `kit.json.workers[]` + 世界检查点） | 最正规；但那是独立的框架阶段排期，M1–M4 期间用不上 |

⛔ **无论选哪条，都不允许用模块级 `setInterval` 绕**——`docs/KIT.md` §2 硬排除「导入期副作用」，
`slg.md` §5 也已把「不绕过框架租约表」写成冻结取舍。

> **⏳ 本节待拍板。** 拍板后在此登记结论，并同步 §7 的 M0-F 行与 kit README 的冻结规则。

---

## 5. 目标架构：`lvr` kit

### 5.1 api 面划分（按破坏性变化的传播边界）

11 个子系统映射后收敛为约 **20 个独立版本化 api 面**：
`content`（配表装载与 validator）· `asset` · `inventory` · `city` · `build` · `queue` · `islander` · `idle` ·
`worldmap` · `march` · `rally` · `radar` · `hero` · `heroEquip` · `artifact` · `troop` · `tech` · `lineup` ·
`combat` · `battlelog` · `alliance` · `quest` · `progression` · `guide` · `mailbox` · `activity` · `leaderboard` · `text`

### 5.2 三个必须在第一天定死的横切件（最大的隐藏工作量）

> 这三条来自 11 个子系统测绘的交叉结论。任何一条晚定，全部已写模块都要回头改写路径。

| 横切件 | 为什么必须第一天 |
| --- | --- |
| **`progression.checkFuncOpen`（功能解锁网关，对应原作 `CUnlockConfig`）** | 每个功能入口、每个红点、每条引导都要问它。晚做 = 每个页面回头补判断 |
| **`quest.bumpQuestCounter`（~180 项 `QuestTypeID` 行为计数器）** | 横切主城/科技/军队/世界/英雄/贸易船/小游戏的**每一条写路径**。活动、任务、成就全建在它上面。⛔ 不能等做活动时再回头改 M1 的每处写路径 |
| **`asset` 面 v1 冻结** | 主城建造、英雄养成、联盟、世界采集四大子系统都消费它；kit 迁移**已发布只能追加、改一字节 sha256 fail-closed** |

另有三项需在 M1 冻结：`lineup_type` 维度（后补代价极高）、`CombatLog` 的 shared 类型、错误码命名空间规则。

### 5.3 SQL 与域的纪律

- **表**：约 100 张 `k_lvr_*`，全部 per-zone。⚠ `sql/001-*.sql` 在 M1 验收后即冻结 ⇒ **001 只放真正稳定的 4–6 张表**，其余走 002+。
- **回执表按域族拆 3–5 张**（世界 / 养成 / 商业化 / 活动），⛔ 不做全 kit 唯一回执表：
  迁移 lint 禁 `DROP/TRUNCATE`，运行时只能 `DELETE`，单表承载 ~40 类幂等写 + 亿行批删是运维热点。
  每张自带保留期与 DELETE 批次上限常量。
- **域**：约 30–50 个 `lvr*` 前缀域。⚠ **域名不得与任何插件 id 相同**——
  `ownership.ts:118 domainBelongsTo` 会让 kit `lvr` 的前缀规则与插件 id `lvrShop` **同时**命中
  `domains/lvrShop.ts`，两包都推进各自所有权集，`plugin -- check` 必红。
  ⇒ kit 域用 `lvrEcon` / `lvrGiftPack` 之类避让，或把该域整体划给插件。
- **错误码**：原作 1,469 个，而 codegen 强制「一个码只由一个域声明」。
  M0 产出命名规则 `LVR_<域>_<语义>` 与收敛目标（**1,469 → ≤200**），在生成器里做唯一性断言。
- **mode**：只有需要实时逐会话推送的才建房（`lvrWorld` 视图房、海战、实时波次 BOSS）。
  主城 / 英雄 / 任务 / 商城 / 活动**全部不建房**。⚠ `kit.json` 的 `modes` 与 `gameplays/` 子目录集有双向断言，
  ⛔ 不要为登记 api 面提前造空 mode。

### 5.4 内容插件

插件 ⛔ 不能建表、不能建 HTTP endpoint。适合外拆的只有**纯消费层**：
`lvrGiftPack`（~45 个商城模块）· `lvrVip` · `lvrOnlineReward` · `lvrTreasurePuzzle` · `lvrMinigameWorkshop` ·
`lvrAdEvent` · 各款第三方小游戏 · 活动展示层。

⚠ **两条硬约束**：
- 活动的**进度必须落 kit 的通用进度表**并经 kit api 面代写，⛔ 不落 `pl:` Redis——
  `pl:` 键不在冷档 freeze/thaw 的快照范围内，长尾玩家回热后静默归零。
- 113 个活动模块真正插件化依赖 **MF9 贡献点**（未实施）。M1–M7 先内置在 kit 里。

---

## 6. 数据与资产前置（M0）

### 6.1 ⚠ 两个必须先做的 spike（M0 的门，不是任务）

| spike | 为什么 |
| --- | --- |
| **配置表可导出性（第一周）** | 数值在 `assets.data.scriptableassets{,_7a7dea4d,_b56b3919}.ab`。这是 IL2CPP + HybridCLR 的 ScriptableObject，**release bundle 通常不带 TypeTree**，UnityPy 只能取裸字节，必须按 `Cfg/G/*.cs` 的字段声明序手工重建布局。全记录里**没有任何一张表被实际导出成功的记录**。⇒ 拿 3 张表（含一张带嵌套/数组）做可行性验证。失败则整个排期重估（走 TypeTree 生成器或运行时 dump） |
| **引导链 DSL 对抗验证** | 原作是 Odin 节点图（101 种节点、154 张链、224 个文件）。DSL 设计失误只在内容重做时暴露。⇒ 用 3–5 条真实引导链验证 DSL 表达力，⛔ 不要先写调度器 |

### 6.2 管线（照 `tools/slg-maps/` 的形态）

| 任务 | 做法 | 产物 |
| --- | --- | --- |
| `tools/lvr-config` | UnityPy 解 scriptableassets bundle，用 493 个行类作 schema 驱动反序列化；`Cfg/H/CConfigLib.cs`（二进制常量池，偏移在 EOF-4）与 `CParse.cs` 作兜底 | 493 张明文 JSON |
| `tools/lvr-proto` | 扫 `cspb/` 3,992 个类 + `ILRuntime_*.cs` 注册表 → Markdown + JSON（照 `gen_protocol_index.py`） | 协议手册 + **域切分与错误码收敛的输入** |
| `tools/lvr-art` | UnityPy 批量解 2,587 个 bundle | 素材库 + **素材授权台账** |

**热改边界必须在 M0 决定**：kit 的数据落点是 `apps/kits/lvr/data/` + `apps/Cocos/assets/resources/kits/lvr/`
**逐字节镜像**，客户端那份在包体里 ⇒ 改数值要重发客户端（无热更）。
⇒ M0 划线：哪些数值进 SQL（可热改）、哪些接受随包。

**⚠ 美术硬约束**：UGUI prefab **不能**转 FGUI，~790 界面必须手工重建；3D 模型可导网格但材质/shader 要在 Cocos 重做。
捷径是本仓 PSD↔UniFlex↔FGUI 工具链（`ui:import-psd` / `ui:export-fgui` / `ui:art-*`），省切图不省布局与交互。

**版权口径（已拍板走复用）**：在 `apps/kits/lvr/README.md` 建与 snake 同规格的素材授权台账，
并在 `slg.md` §5 的版权红线旁登记本 kit 为例外及理由——否则两份文档互相矛盾，后来者无从判断。

---

## 7. 里程碑路线图

> 单位人月，按**本框架实现成本**估，数量级口径。⚠ 不含内容生产与美术，那是独立泳道。

| 里程碑 | 目标 | 前置 | 估 |
| --- | --- | --- | --- |
| **M0** | 两个 spike + 三条管线 + **协议域切分与错误码收敛规则** + i18n `api/text` 契约 + 热改边界划线 | — | 4–6 |
| **M0-F** | 框架 PR（并行）：**仅 kit worker 进程入口一条，落法待定见 §4.3**。首屏与邮件已拍板走 kit 侧，⛔ 不提 PR | — | 0–1 |
| **M1** | **主城可玩闭环**：kit 骨架（照 arena 走通 pack→install→codegen→db:bootstrap→check→test）+ `content`/`asset`/`city`/`build`/`queue` 五面 + **三个横切件**（§5.2）+ 建筑四态与升级 + 双队列 + 加速 + 资源懒结算与上限。⛔ **不含登录/选服/重连**（`builtin` 已提供） | M0 | 3–5 |
| **M2** | **经济与背包**：`inventory` 面（⚠ 道具扣减必须走 kit 表，见 §4.2）+ 缺资源漏斗 + 货币消耗网关 + 仓库/挂机 + `islander`/`idle` | M1 | 3–4 |
| **M3** | **英雄与部队**：`hero`/`heroEquip`/`artifact`/`troop`/`tech`/`lineup` 六面 + 抽卡双轨保底 + 科技树 ×3 + 兵营/医院/演武场 | M2 | 5–8 |
| **M4** | **战斗**：`combat`/`battlelog` 两面 + 回合模拟器下沉 `core/compute` + 战报落库与分页回放 + 伤兵四态 + kit mailbox。⚠ 需 `lvrDebug.mockEncounter` 作为独立验收入口 | M3 | 5–8 |
| **M5** | **大地图与行军**：`worldmap`/`march`/`rally`/`radar` 四面（照抄 slg **约 3.5k 行，其中客户端 2.8k**）+ 13 种行军指令 + 采集/侦察/野战 + 集结全生命周期 + 领地要塞 | M4 | 5–8 |
| **M6** | **任务引导与成长**：`quest` 八域全量 + `guide` DSL 运行时 + 成长分/段位 + 红点体系 + `leaderboard` | M1、M4 | 4–6 |
| **M7** | **活动框架与商业化**：`activity` 面（实例四段生命周期 + 五个通用模板件）+ `lvrGiftPack`/`lvrVip` 插件 + 首批活动内容插件。⚠ 外部依赖：**运营后台（仓外另立项）**，期间降级为 `lvrAdmin.upsertActvCfg` + 独立鉴权 + 审计表 | M2、M6 | 5–8 |
| **M8** | **副玩法**：合成岛（FTUE 入口）· 贸易船 · 海上探索 · 未知海域 + 海战房 · 试炼塔 · 竞技场（先异步积分赛）· 城防 | M4 | 6–10 |
| **M9** | **长尾**：剩余 ~100 活动 · 跨服（GVG/ZVZ/王城战，等 MF8）· 赛季 | M7 | 20–40+ |
| **协议层** | **独立泳道**：~870 route × (域描述符 + endpoint + 向量 + handler + 错误码 + contractVersion bump + 指纹重钉) ≈ 0.5 人日/route。**生成器代替不了的人工语义**（约束、错误码、向量、联调） | 贯穿 | **15–25** |
| **UI 重建** | **独立泳道**：~790 屏 × 0.5–2 人日（FGUI 布局 + 绑定 + `.view.json` + 无头测试） | 贯穿 | **20–80** |

**核心工程总量：约 100–200 人月 ≈ 8–17 人年。**
按 8–10 人团队 ≈ **1.5–2.5 年**，与原作自身投入同数量级。
⚠ **另有「内容与策划」泳道未计**：154 条引导链、~500 张表的数值填写与平衡、30+ 邮件模板、
42 种正文模块文案、80+ 榜配置、~200 页红点与文案规则。SLG 项目里内容工通常 ≥ 程序工。

### 7.1 M1 详细展开

按标准开发动线（`docs/OVERVIEW.md` §4 + `SERVER.md` §13 登记点），顺序不可调换：

**① 登记与单源**
1. `apps/kits/lvr/kit.json`：`id:"lvr"`（宿主自有，先不带 `version`）、
   `api:{content,asset,city,build,queue}`、`domains:["lvrCity","lvrBuild"]`、
   **⛔ 先不登记 `modes`**（与 `gameplays/` 子目录集有双向断言）、`fguiPackages`（有 FGUI 页时必须声明）、
   `sql.files:["sql/001-city.sql"]`、`sql.tables`、`userKeys`、`effects`、`entry`/`viewDirs`/`views`/`owners`/`routes`/`menu`（照 arena 形状）。
2. `apps/kits/lvr/sql/001-city.sql`：**只放稳定的 4–6 张表**
   （`k_lvr_revision` / `k_lvr_city` / `k_lvr_building` / `k_lvr_queue` / `k_lvr_asset` / `k_lvr_receipt_world`）。
   `server_id` 进主键与每个 UNIQUE，遵守白名单 lint。
3. `apps/kits/lvr/data/` + `apps/Cocos/assets/resources/kits/lvr/`（逐字节镜像）：M0 导出的建筑/队列/资源配表。
4. `apps/kits/lvr/README.md`：定义了什么、插件怎么用 api 面、**素材授权台账**、**冻结规则与已知降级**（照 slg README 的「验收与后续边界」格式）。

**② shared（零依赖，铁律 4）**
5. `apps/shared/src/kits/lvr/api/content/index.ts`：**schema 描述 + 一个表驱动解释器**
   （复用 `apps/shared/src/protocol/http.ts` 的 `assertExactKeys` / `finiteInteger` / `boundedString`），
   ⛔ **不是 500 份手写 validator**——那会被 `sync:shared` 三处镜像并过两遍 tsc。数据本体一律 JSON。
6. `api/asset/index.ts`（资源类型、`accruedAt(rate,cap,since,now)` 纯函数、掠夺保护规则）、
   `api/city|build|queue/index.ts`（建筑前置/耗时/队列规则纯函数）、
   `api/progression/index.ts`（`checkFuncOpen`）、`api/quest/index.ts`（`QuestTypeID` 单源 + `bumpQuestCounter` 签名）。
7. `apps/shared/src/protocol/lobbyRpc/domains/lvrCity.ts`：`snapshot`（query）+
   `buildStart` / `buildSpeedUp` / `buildClaim` / `resourceClaim`（idempotent write，必须带字面量 `clientReqId`）+ 领域错误码。
8. `apps/server/test/lobbyRpcVectors/lvrCity.ts`：每路由向量。

**③ 服务端**
9. `apps/server/src/kits/lvr/`：`cityRepo.ts` / `api/*/index.ts` / `host.ts`。
   ⛔ 只 import `../../core/infra/kitApi` 与 `@game/shared*`（`kit-import-boundary.test.ts` 机检）。
   写路径在 `withKitTx("lvr", sId, …)` 内：**⚠ 主城是单人私有世界 ⇒ 用 `withKitUserFence(uid)` 每玩家串行化，
   ⛔ 不要照抄 slg 的全区 revision 行锁**（那是全区序列，主城不需要）→ 读写建筑与队列 → 结算资源 `tx.credit` →
   写回执 → 写变更日志，同事务提交。
10. `apps/server/src/websocket/lvrCity/*.ts`：每个一行 `export default defineRpc(Type, { handler })`。

**④ 客户端**
11. `apps/client/src/kits/lvr/index.ts`（`createPluginModule`）+ `api/*/index.ts`（⛔ 不 import `cc`）。
12. `logic/`（纯度门保护、Node 无头全测）：`CityLogic` / `QueueLogic` / `cityRuntime`。
13. `view/LvrCityView.ts` + `.view.json`（`kind:"cocos"` 起步）。
    ⚠ 实心矩形一律用 `view/uiPlate.ts` 的 `createSolidPlate()`，⛔ 不要一矩形一 `Graphics`
    （`docs/CLIENT.md` §3 实测：112.6 MB → 0.1 MB）。
14. `kit.json` 登记 route + menu；M0-F 落地后设为 authenticated base。
15. ⚠ **`.meta` 规模**：`apps/Cocos/assets/src/` 是 `apps/client/src` 的逐字节镜像且 `.meta` 随目录提交，
    `sync-client.mjs` 的 `checkMetaContents` 校验全树 uuid 唯一。
    全程约 **1,000 个新 `.meta` 需由 Creator 生成并提交**，**多人并行铸 meta 会撞 uuid** ⇒ 定串行铸造纪律。

**⑤ 生成与校验（顺序固定）**
```bash
npm --workspace @game/server run codegen:plugins
node scripts/protocol-fingerprint.mjs --write     # 只在改了 apps/shared/src/protocol/** 时
npm run sync:shared && npm run sync:client
npm --workspace @game/server run db:bootstrap
npm run typecheck && npm run test:client
npm --workspace @game/server run test
npm run verify:all
```

**M1 退出判据**（对齐 `apps/kits/slg/README.md` 的验收段形式，可量化）：
`verify:all` exit 0（记录 FGUI / inventory / 客户端 / 服务端各项测试数）；
`db:bootstrap` 跑两遍第二遍零新应用；独立空库应用 N 条建表语句；
同 `clientReqId` 重放 `buildStart` 不双扣（回执逐字节回读）；队列到期并发结算只生效一次；资源封顶正确；
干净制品 `plugin -- test lvr --int` 全绿；
Creator 真引擎预览证据（登录 → 主城 → 升级 → 倒计时 → 领取 → 重连恢复，截图 + console 空）；
**三个横切件与 `api/text` 契约已冻结并写进 README**。

---

## 8. 必须登记的三条冻结决策

kit 迁移**已发布只能追加、改一字节 sha256 fail-closed**，下面三条一旦走错就是百表主键迁移，届时账本改不动：

| 决策 | 内容 |
| --- | --- |
| **persona（MF2）** | **已拍板：不预留。** v0 = 一区一角色，全部表以 `(uid, server_id)` 为主体键，⛔ 不预留 `owner_id`。persona 化显式列为「不提供」（§9.3）。⚠ 将来若要做，是一次百表主键迁移且账本改不动 |
| **合服** | 框架的区隔离是三层硬约束（`user_currency` 主键含 `server_id`、kit per-zone 表 `server_id` 进主键与每个 UNIQUE、Redis 按区前缀）。合服 = 跨 sId 全量迁移 + uid 冲突消解 + 联盟/排行重算，**框架零支持**。**已拍板：不预留**，显式列为「不提供」（§9.3）。⚠ 这意味着实体 id 可以 per-zone 自增、联盟/排行 id 可复用；将来若要合服，是一次跨 sId 全量迁移 + uid 冲突消解 + 联盟/排行重算的独立项目 |
| **冷档 freeze/thaw** | 冷档快照只覆盖框架键与 `kit.json.userKeys` 声明的 `kt:` 键。⇒ 逐个插件标注持久态落点；凡需跨冷档存活的一律进 kit 表并由 kit api 面代写 |

---

## 9. 风险与不做的事

### 9.1 3D 管线：已拍板走自建，需求拆到 [lvr-3d.md](lvr-3d.md)

原作是 3D（GPU skinning 19 个类 / 三套阴影方案 / 海面多贴图混合 / 两级 LOD 的 19 种地图实体 /
主城三档细节状态机 / Spine / Timeline）。框架客户端全 2D，`apps/Cocos/assets/resources/kits/` 下只有 png/json，
**仓内零 3D 资产先例**。Cocos 3.8 本身是 3D 引擎 ⇒ 不是能力缺口，是**零先例 + 全部踩坑成本落在 kit**。

**已拍板：走自建 3D 管线（用 Cocos 的 3D 能力），拆成独立需求文档 [lvr-3d.md](lvr-3d.md) 由单独排期实现。**
⚠ 因此 **§7 的 100–200 人月 ⛔ 不含 3D 管线**——它是一条独立预算。

lvr-3d.md 里已登记的三条主要风险：shader ⛔ 不能自动转（海面 / GPU skinning 采样 / 阴影三处要手工重写）、
Unity ParticleSystem ⛔ 不能转（265 个 vfxbaseres bundle 要逐个重建或替代）、
任何第三方库（如 glTF loader）都是框架 PR（kit 加不了 npm 依赖）。
其 A0 阶段是一个**可行性 spike**（取 1 个模型 + 1 套动画 + 1 张海面贴图渲出来），走不通就要重估整条管线。

### 9.2 其余风险

| 风险 | 说明 |
| --- | --- |
| **协议层是最大低估项** | ~870 route 的域描述符/端点/向量/错误码/版本闸是人工语义，生成器代替不了。已在 §7 独立计工 |
| **无热更 ⇒ 包体 JSON 也不能热改** | 客户端那份配表在包体里。M0 必须划清「哪些进 SQL 可热改」 |
| **FGUI 只有加载没有卸载路径** | 现仓 12 个包，LVR 要 ~200 个。`resident:false` 的 releaseIfIdle 与切换策略缺失，内存策略要单独设计 |
| **CI 时长** | slg 验收时是客户端 487 / 服务端 749 个测试。870 route 的向量 + ~100 表的集成测试会把 `verify:all` 推到不可接受；而 `test:changed` 的判据是「整次改动都落在包推导集内」，kit 巨大时反而经常退回全量 ⇒ 需要测试分层策略 |
| **活动长尾是第二个产品** | 113 + 51 个模块，M9 的 20–40 人月主要是它 |
| **单 kit 巨型目录** | v0 不许 kit-on-kit ⇒ 全挤在 `apps/server/src/kits/lvr/**`。参考 `GameRoom.ts` 2,100 行的教训，早立目录纪律。建议尽早推 MF0（KIT K1 的客户端/shared 侧路径级导入边界 + `.conn` 禁令） |
| **战斗数值还原精度** | 依赖 493 张表完整导出 + `FormulaCalculate.cs` 精确还原，任何偏差都会让手感不一致 |
| **两套战斗引擎** | 服务端权威 SLG 战斗 + 客户端模拟休闲战斗，1:1 = 都做 |
| **GM 鉴权模型缺位** | 框架只有 `http/admin/kick.ts` 的 best-effort 样例，无角色权限、无审计。⛔ 不要把 GM 面挂普通玩家 Lobby RPC 域 |
| **`GameRoom` 无零客户端保活** | `autoDispose` 默认 true，仓内唯一保活的是 `LobbyRoom` |

### 9.3 明确不做

生产部署/CD/扩容/监控/备份；**真钱 IAP 订单、退款、对账**（kit 定义不了 HTTP endpoint，且 EXTRAS §4 不提供）；
微信/抖音渠道账号、登录、支付、广告、分享 SDK；渠道打包、审核、灰度；**热更新**；合规与商店发布；
原作的埋点 BI、AIHelp 客服、ilivedata 翻译服务；
**合服**与 **persona（同区多角色）**——§8 已拍板不预留主键，两者都是「不提供」。
（主体出自 `docs/EXTRAS.md` §4「明确不提供」，⛔ 不是待办。）

---

## 10. 验证方式

```bash
npm --workspace @game/server run codegen:plugins     # 改 kit.json / 域描述符 / 向量 / .view.json 后
npm --workspace @game/server run codegen:gameplays   # 改 gameplays/ 后（M5 起）
npm --workspace @game/server run codegen:http        # 若有 HTTP（本案基本没有）
npm run sync:shared && npm run sync:client
npm --workspace @game/server run db:bootstrap
npm run typecheck && npm run test:client
npm --workspace @game/server run test
npm run verify:all                                   # 提交闸
# ⚠ 下面三项 verify:all 不含，但 slg 验收跑了，必须补进每个里程碑：
npm --workspace @game/server run test:int
npm --workspace @game/server run plugin -- test lvr --int
node scripts/protocol-fingerprint.mjs --check
# 以及：codegen:plugins / codegen:gameplays 重跑后生成物无 diff
```

**三道版本闸**（每轮必撞，⛔ 不能绕）：per-mode `contractDigest` 变 → 同批 bump `manifest.modeVersion`；
per-domain 描述符任一字节变 → 同批 bump `contractVersion`；`apps/shared/src/protocol/**` 字节变 →
`protocol-fingerprint --write`（外加**人工**判断是否 bump `GAME_ROOM_PROTOCOL_VERSION` / `LOBBY_PROTOCOL_VERSION`）。

**包验证**：宿主自有 kit（无 `version`）不能直接 `plugin -- test lvr`。
照 `slg.md` §4：临时制品副本补 `version` → 打包安装到临时宿主 → 由包锁驱动测试，⛔ 不回灌主树。

**Creator 真引擎实证**：每里程碑一次，`tools/creator-preview/` 的 CDP 驱动器落截图 + `report.json`
到 `docs/evidence/creator-<date>/lvr/`，console 必须为空。
⚠ 需真实 Creator 桌面 + CDP，证据按 `.gitignore` 不入库 ⇒ **先定谁在哪台机器上跑、证据如何归档**。

**每个里程碑都要有同形的可量化退出判据**（照 M1 的写法），⛔ 不能只有功能清单。

**文档回写点**：`apps/kits/lvr/README.md`（唯一真源，含冻结规则与已知降级）、根 `CLAUDE.md` 速查、
`docs/KIT.md` §9、`docs/MMO.md` §12（MF5/MF7 消费方落地时）。
⚠ 顺手修正根 `CLAUDE.md` 里 slg 的「10000×10000」为 **1500×1500**。

---

## 11. 实施状态回写

> 未立项。每阶段完成在此登记一行（里程碑 / 日期 / commit / 实际交付与基准结果 / 偏差）。⛔ 不向 plan-v5 回写。

- 暂无完成记录。
