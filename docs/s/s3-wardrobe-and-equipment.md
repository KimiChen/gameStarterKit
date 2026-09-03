# S3：衣柜与服务端权威装备

[← S2R · 可靠金币复活](s2r-reliable-coin-relive.md) · [专项索引](README.md) · [S4 · 可靠养成奖励 →](s4-reliable-progression-rewards.md)

> **状态：`[已拍板·待实施]`**
>
> **预计：6–10 人日**
>
> **依赖：S1 素材与 catalog 已冻结；S2 wire/战场支持稳定 `skinId`；S2R 的 awaited 准入、带不可变 `skinIdAtRunStart` 的最小 run/checkpoint 与离场边界已通过门禁。**

## 1. 目标与非目标

本阶段在 S1 的 16 套稳定皮肤目录上建立纯外观的收藏、碎片合成、预览和装备闭环。账号资产由 Bag/User
权威存储；每次创建真人 Snake 前，服务端通过 S2R 的通用异步准入边界读取、校验并锁存装备。客户端只提交
装备或解锁意图，不能通过 join 数据选择未拥有皮肤。

本阶段完成后可以内部试玩衣柜和权威装备，但不能对玩家宣称“养成系统完成”；可靠 run 奖励属于
[S4](s4-reliable-progression-rewards.md)。以下事项不是 S3 退出条件：

- 永久皮肤金币购买、现金支付、广告、限时试用、赛季通行证和随机宝箱。
- 皮肤熟练度，以及 `trailId`、`deathFxId`、`killFxId`、`nameplateId`、`emoteSetId` 对应内容。
- 用皮肤改变速度、初始长度、转向、碰撞、攻击范围或得分；所有皮肤必须保持纯表现。
- 为 Snake 另造准入旁路、直接信任 join `skinId`，或手改生成 registry/客户端镜像。

## 2. 冻结口径

### 2.1 首发内容和产品边界

S1 生成全部 16 套预览后，由美术和产品按视觉质量分配获取方式，不根据数字 ID 猜稀有度。首发建议配额是：

| 获取方式 | 数量 | 口径 |
|---|---:|---|
| 默认永久拥有 | 1 | 新账号、旧账号缺字段和异常场景的稳定 fallback |
| 新手/等级里程碑 | 3 | S4 奖励闭环后开放来源 |
| 金币购买 | 4 | 仅保留产品分配；购买写路径不属于 S3 退出条件 |
| 成就解锁 | 4 | S4 冻结奖励/成就证据后开放来源 |
| 碎片合成/活动 | 4 | S3 只实现确定性的碎片合成，不做随机宝箱 |

默认皮肤使用稳定内容 ID `1`，视为隐式永久拥有。退休皮肤停止新增获取，但既有所有权和装备能力保留。
重复取得唯一皮肤必须被业务唯一性拒绝，不能静默转化，也不能二次扣款。

养成展示仍遵守纯外观边界：蛇等级是累计 XP 派生的全局成长线，只解锁外观和展示内容；收藏进度按永久拥有
皮肤的稀有度累计，只用于头像框、名牌或徽章；皮肤熟练度留待后续按该皮肤的有效参赛累积。不得同时保存会
漂移的两个权威 `level/xp` 值，S3 snapshot 中的等级必须由 XP 表派生。

后续槽位只预留数据语义，不在 S3 创建空按钮或占位成功路径：`trailId` 表示移动/加速拖尾，`deathFxId` 表示
死亡爆散，`killFxId` 表示击杀表现，`nameplateId` 表示名字底板/头像框/称号，`emoteSetId` 表示局内表情集合。
每个槽位独立 fallback，缺失时不能连带阻塞主皮肤。

### 2.2 权威存储

复用现有 User Hash、分片 Bag 和现有用户锁，不新增独立 Redis key：

| 数据 | 权威位置 | 编码与读取规则 |
|---|---|---|
| 永久皮肤所有权 | `bag:{uid}:N` | `ownershipItemId >= 1` 表示拥有；默认皮肤可隐式拥有 |
| 皮肤碎片 | `bag:{uid}:N` | `fragmentItemId` 为可累加数量 |
| 当前装备 | `user:{uid}.snakeEquippedSkinId` | 缺失、非法、已禁用时回退默认皮肤 |
| 外观状态版本 | `user:{uid}.snakeCosmeticVersion` | 缺失视为 `0`；每次成功写递增 |
| 蛇经验/养成奖励 | Bag additive item 或有界 additive grant | S4 写入；禁止延迟 absolute `setField` 覆盖新值；皮肤熟练度仍属后续 |
| 金币与购买收据 | MySQL currency/ledger/entitlement receipt | 后续商业化阶段实现，不属于 S3 退出条件 |

新增 User 字段是可选业务字段，不要求批量回填。Snake cosmetic store 必须显式读取这些开放字段，不能假设
现有通用 `readUser` 会自动返回它们。

### 2.3 `snakeCosmetic` 契约

新增独立 Lobby RPC 域，descriptor 是契约真源：

```text
snakeCosmetic.getSnapshot
  -> catalogVersion/catalogHash
  -> stateVersion
  -> equippedSkinId
  -> ownedSkinIds
  -> fragmentBalances
  -> snakeXp / derivedLevel

snakeCosmetic.equip(clientReqId, skinId, expectedStateVersion)
snakeCosmetic.unlock(clientReqId, skinId, expectedStateVersion)
```

首发领域错误码至少包含：

```text
SKIN_NOT_FOUND
SKIN_NOT_OWNED
SKIN_UNAVAILABLE
SKIN_ALREADY_OWNED
STATE_CONFLICT
INSUFFICIENT_FRAGMENTS
CATALOG_VERSION_MISMATCH
```

若本阶段只新增 Lobby RPC、Feature 和素材目录，不提升 gameplay `modeVersion`；只有确实新增此前未声明的
Snake wire 语义时，才从**实施当时的实际 modeVersion** 递增并补兼容矩阵。不得为了“阶段编号一致”做无语义
版本升级，也不得硬编码假设下一版本必为 `snake@3`。

### 2.4 装备、解锁和当前 run 语义

装备写在现有 `withUser` 用户锁/UoW 内完成：校验 catalog 版本、皮肤存在且可用、永久拥有、
`expectedStateVersion`，随后写 `snakeEquippedSkinId`、递增版本并返回完整新快照。同一
`clientReqId + canonical payload` 重放同一结果；同 ID 异 payload 必须冲突。

碎片合成使用专用同槽 Lua，一次性完成“校验版本与皮肤 → 确认未拥有 → 确认碎片足够 → 扣碎片 →
写永久所有权 → 递增版本 → 写 applied/payload 幂等绑定”。碎片不足、版本冲突或已经拥有时整笔零写入；
不能复用会先扣后补的通用负 item effect。

衣柜写入立即作用于账号，但只影响下一次创建的新 run。当前 run 的 `skinIdAtRunStart` 已冻结；真人成功复活、
AI 自动重生和断线宽限内重连继续使用原值。服务端撤下外观时，只在下一次准入回退默认皮肤，并可在用户锁内
修复装备字段。S3 还在同一 run 上持久新增 `catalogVersionAtRunStart`，两者共同构成后续结算与审计快照。

### 2.5 catalog 与客户端边界

- shared 公共目录只暴露稳定 `skinId`、公开状态、版本/hash 和跨端校验字段；业务 item/价格只在服务端目录；
  纹理、rect、pivot、帧时间和 fallback 只在客户端资源目录。
- 服务端与客户端 catalog hash 不一致时禁止装备、解锁等经济写；战斗读取未知皮肤时回退皮肤 1 并记录受控诊断，
  不阻塞房间。
- 衣柜 Logic 构造不可变 ViewModel、负责 RPC/幂等 journal/错误映射，禁止导入 `cc` 或 `fairygui-cc`。
- FGUI 只通过动态加载和 View registry 打开；不得把 FairyGUI 静态依赖带入普通脚本图。
- 首页 launch target 扩展为 `gameplay | route` 联合类型，衣柜 route 由 Feature 自持；首页 GList 的最终视觉可与
  [plan-v5 B1](../../plan-v5.md#b-编辑器--creator-待办-无头环境无法替代) 同批完成。

## 3. 详细任务

### S3-01：冻结首发产品分配与 catalog 业务映射

- [ ] **动作：** 为 S1 的 16 个稳定 `skinId` 补齐显示名、稀有度、排序、公开状态、默认/AI/fallback、
  `ownershipItemId`、`fragmentItemId`、合成数量与获取方式；由预览评审决定分配，不从 ID 推断稀有度。
- **产物：** 复用并冻结 S1 已生成的 shared 公共目录与客户端资源目录，在其上补齐服务端业务映射、唯一 catalog
  hash 和首发/后续来源清单；不得另建第二套资源身份目录。
- **验证：** 校验 ID 唯一、唯一默认皮肤、fallback 无环、所有公开皮肤都有业务映射和资源映射；皮肤属性表中
  不出现玩法数值差异。

### S3-02：建立 `snakeCosmetic` RPC 契约和 Feature 登记

- [ ] **动作：** 新增 getSnapshot/equip/unlock descriptor、请求/响应类型和领域错误码；登记
  `features/snakeCosmetic/feature.json`，按仓库标准流程生成 registry、服务端路由、客户端 façade 和能力文档。
- **产物：** shared 手写真源、生成的 Lobby RPC registry/客户端 feature、协议 fingerprint 变更记录（仅实际改
  `protocol/` 时）。
- **验证：** codegen、双端 typecheck、descriptor/registry 守门通过；客户端不能构造 descriptor 未声明的写请求；
  无 Snake wire 新语义时 `modeVersion` 保持前序阶段实际交付值；确需升级时只从该实际值递增并记录兼容矩阵。

### S3-03：实现权威 snapshot 和兼容读取

- [ ] **动作：** 建立 Snake cosmetic store，显式读取 Bag 所有权/碎片以及 User 装备/版本；处理冷用户缺字段、
  冻结归档 thaw、跨区隔离、退休/禁用皮肤和默认隐式拥有。
- **产物：** 完整、稳定排序的 `getSnapshot`，包含 catalog/version、装备、拥有、碎片和 S4 可填充的 XP/派生等级。
- **验证：** 冷/热用户返回相同语义；缺字段不触发批量回填；跨区数据不串用；未知或禁用装备稳定回退皮肤 1。

### S3-04：实现幂等装备 CAS

- [ ] **动作：** 在 `withUser` 内校验 catalog、所有权、可用状态和 `expectedStateVersion`，原子写装备并递增
  cosmetic/global version；绑定 `clientReqId` 与 canonical payload。
- **产物：** equip handler、幂等记录和完整新 snapshot 响应。
- **验证：** 同 ID 同 payload 重放同一结果；同 ID 异 payload 冲突；同/不同 ID 并发只有合法版本胜出；客户端
  伪造未拥有皮肤、退休后无所有权皮肤、catalog mismatch 均零写入。

### S3-05：实现碎片合成的同槽原子 Lua

- [ ] **动作：** 实现专用脚本，在同一原子边界完成检查、扣碎片、授予唯一所有权、递增版本与幂等绑定。
- **产物：** Lua 真源、typed adapter、错误映射和测试 fixture。
- **验证：** 碎片不足、重复拥有、版本冲突、同 ID 异 payload 时所有字段零写入；并发只成功一次，碎片和所有权
  不出现负数、双扣或双发。

### S3-06：复用 S2R awaited 准入并锁存装备

- [ ] **动作：** 在鉴权后、Snake 实体创建前复用 `preparePlayerAdmission(uid, session/generation)`，以 Bag/User
  权威实现替换 S2/S2R 的同一个 `RunSkinResolver` 默认实现；读取装备与所有权、验证 catalog，调用
  `startOrResumePlayerRun`，在创建实体前把 `skinIdAtRunStart` 与 `catalogVersionAtRunStart` 持久到同一 run；
  不得新增 Snake 专属 GameRoom 分支。
- **产物：** 准入 adapter、超时/fail-closed 结果和当前 run 外观投影。
- **验证：** 存储失败时不先创建无账本实体；重连恢复同一 run 与两项 run-start 快照；最终离开后重新加入创建
  新 run 并读取最新装备；run 中换装不改变当前真人、复活实体或 AI；join 自报皮肤始终无效。

### S3-07：完成客户端衣柜 Logic 与恢复 journal

- [ ] **动作：** 拉取并校验 catalog hash，构造不可变 ViewModel，提供“全部/已拥有/未拥有/可合成”筛选与稳定
  排序；执行装备/解锁、版本冲突刷新和领域错误映射；写请求先进入 `PendingOperationJournal`。
- **产物：** 无引擎依赖 Logic、筛选/排序模型、pending/重试状态和恢复适配。
- **验证：** 网络超时以相同 ID/payload 重放；恢复后不会生成第二个业务操作；状态冲突刷新后才能重试；Logic
  import 图不含 `cc`/`fairygui-cc`。

### S3-08：完成 FGUI 衣柜 View 与首页 route

- [ ] **动作：** 用虚拟列表展示预览、稀有度、拥有/锁定/可合成状态；中央动态预览同时显示头、身、尾、动画和
  长度增长；详情区展示来源、碎片、装备/解锁按钮；增加当前装备、首次获得、新解锁和红点状态；通过 feature
  route 接入首页。
- **产物：** `.view.json` sidecar、FGUI 组件/契约、动态 View 注册、首页 route contribution 和资源缺失 UI。
- **验证：** `test:client`/`test:fgui` 覆盖虚拟列表复用、状态冲突禁点、动态加载/关闭、route 失败回滚和 fallback；
  本阶段产出纹理 rect、pivot、动画与不同长度预览的可执行 Creator 用例，实际断言和证据由 S5-CR-04 完成。

### S3-09：完成跨端一致性、重连与资源回退门禁

- [ ] **动作：** 汇总 catalog mismatch、冷用户、退休皮肤、换装时机、断线重连、未知资源、生成同步和旧客户端
  兼容测试；对经济禁写与战斗 fallback 使用不同策略。
- **产物：** 单测/集成 fixture、受控诊断、兼容矩阵和 S3 验收证据。
- **验证：** 服务端未知皮肤不会被客户端快照拒绝或崩溃；经济写在 hash 不一致时 fail closed；当前 run 永不因
  换装或 fallback 中途变色；`verify:sync` 和生成物保护检查通过。

### S3-10：永久皮肤购买设计占位（后续，非退出条件）

- **动作：** 商业化阶段若开放金币购买，在 MySQL 建
  `(uid, sId, skinId, entitlementGeneration)` 唯一业务收据；同一事务扣金币、写 ledger/outbox，由 outbox 向 Bag
  发永久所有权，并用 receipt 与 applied/payload 共同守住重放。未来契约形状为
  `snakeCosmetic.purchase(clientReqId, skinId, expectedStateVersion)`，本阶段不把它注册成可成功调用的 RPC。
- **产物：** 后续设计记录；S3 首发不创建可调用的 purchase 成功路径，不注册占位支付协议。
- **验证：** 设计评审必须证明不同 `clientReqId` 购买同一唯一皮肤也不会二次扣款；本项未实施不阻塞 S3，且不能
  被登记为首发已完成能力。

## 4. 故障与验收矩阵

| 场景 | 操作/注入 | 期望结果 | 主要任务 |
|---|---|---|---|
| 未拥有皮肤 | 客户端直接 equip 稳定 ID | `SKIN_NOT_OWNED`，装备/版本零写入 | S3-04 |
| catalog 不一致 | 旧客户端执行 equip/unlock | 返回 `CATALOG_VERSION_MISMATCH`；经济禁写，战斗仍回退默认 | S3-02/09 |
| 同 ID 同 payload | 响应丢失后重试 | 返回同一 canonical snapshot，不二次递增版本 | S3-04/05/07 |
| 同 ID 异 payload | 重用 requestId 改 skin 或数量 | 冲突，任何资产和版本均不改变 | S3-04/05 |
| 装备并发 | 两个 expectedVersion 同时写不同皮肤 | 恰有一个成功，失败方刷新完整 snapshot | S3-04/07 |
| 碎片不足 | 合成数量少 1 | 碎片、所有权、版本和幂等状态全部零写入 | S3-05 |
| 重复合成 | 同/不同 ID 并发获取同一皮肤 | 所有权只建立一次，不双扣碎片 | S3-05 |
| 冷用户/旧数据 | User 无新增字段、Bag 无默认皮肤项 | snapshot 推导默认拥有/装备，不要求批量回填 | S3-03 |
| 退休皮肤 | 既有用户与新用户分别读取/装备 | 既有所有者可继续装备；无所有权用户不能新增获取 | S3-03/04 |
| run 中换装 | 活跃或待复活时装备另一皮肤 | 账号快照更新；当前 run/复活/重连保持原 skin，下个新 run 才变化 | S3-06/09 |
| 准入存储失败 | prepare admission 超时或错误 | fail closed，不创建 Snake/OPEN run 半成品 | S3-06 |
| 资源缺失 | 客户端未知 ID、rect 或纹理加载失败 | 战斗和衣柜回退皮肤 1、记录诊断；不以客户端 fallback 改写权威装备 | S3-08/09 |
| Feature 恢复 | 页面写请求中断后重建 View | journal 以原 ID/payload 恢复，View 不重复发业务写 | S3-07/08 |

## 5. 退出条件

- [ ] S3-01～S3-09 全部完成；S3-10 明确保持“后续/非退出条件”，没有伪成功协议或可调用占位实现。
- [ ] `snakeCosmetic` descriptor、codegen、sync、双端类型检查、客户端/FGUI/服务端单测全部通过。
- [ ] Bag/User snapshot、equip CAS、unlock Lua 的同/异 requestId、版本冲突、碎片不足与并发 fixture 全绿。
- [ ] S2R 的 `preparePlayerAdmission` 被复用；伪造 join skin、失败准入、重连、最终离开后重入和 run 中换装均按
  `skinIdAtRunStart/catalogVersionAtRunStart` 冻结语义运行，没有第二套 Snake 准入或 run 账本。
- [ ] catalog hash 不一致时经济禁写；未知资源稳定 fallback；冷用户、thaw、跨区和退休皮肤测试通过。
- [ ] 衣柜 Logic 保持无引擎依赖，FGUI 通过动态入口打开；无头环境已完成可执行的契约/资源校验，并把动态预览、
  rect/pivot/动画的精确 Creator 用例交给 S5。实际 Creator 结果属于 S5 退出条件，不使 S3 与 S5 形成互相前置。
- [ ] 阶段证据已回写本页，并在 [README 状态表](README.md#8-总状态与证据汇总) 汇总；只可宣称“衣柜与权威装备
  可内部试玩”，不得提前宣称养成奖励闭环完成。

## 6. 风险与回退

| 风险 | 防线 | 失败时回退 |
|---|---|---|
| 直接信任 join `skinId` 导致越权 | awaited 准入读取 Bag/User 并锁存 | 拒绝准入或皮肤 1；绝不采用客户端值 |
| catalog 版本漂移造成白图或经济争议 | hash 闸门、三层目录、生成校验 | 经济 fail closed；战斗只做可诊断视觉 fallback |
| 通用负 item effect 发生部分扣减 | 专用同槽 Lua、零写入断言 | 整笔失败，刷新权威 snapshot |
| 当前 run 因换装中途改变外观 | `runId + skinIdAtRunStart + catalogVersionAtRunStart` 一次锁存 | 保持当前 run 值，下次准入再读取 |
| 唯一皮肤被普通 Shop SKU 重复购买 | S3 不开放购买；后续唯一 entitlement receipt | 下线购买入口，不影响装备/解锁 |
| Logic/View 或静态 FGUI 依赖越界 | import 守门、动态 View registry | 禁用衣柜 feature；战斗入口保持可用 |
| 误把 S3 完成写成养成闭环完成 | README 与退出文案明确依赖 S4 | 只发布内部试玩标记，等待 S4 |
| 手改生成物造成镜像漂移 | 只改 descriptor/sidecar/手写真源并 codegen/sync | 丢弃生成物手改，从真源重新生成 |

## 7. 证据回写

未实际运行的命令不得填写为通过。Creator 证据需记录版本、视口、操作路径和截图位置。

| 状态 | commit | 自动验证（命令、exit code、计数、日期） | Creator/人工证据 | 备注 |
|---|---|---|---|---|
| `[已拍板·待实施]` | — | — | — | S3-10 不计退出条件 |

---

[← S2R · 可靠金币复活](s2r-reliable-coin-relive.md) · [专项索引](README.md) · [S4 · 可靠养成奖励 →](s4-reliable-progression-rewards.md)
