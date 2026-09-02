# Snake 竖版战场复刻与养成系统专项计划（plan-s）

> **状态：[已拍板·待实施]。更新时间：2026-09-03。** 本文件记录 Snake 玩法的竖版战场表现复刻、
> 皮肤衣柜与养成闭环专项计划，
> 不替代 [plan-v5.md](plan-v5.md) 的全仓当前真相指针。实施状态、commit 与验收证据应在每一阶段
> 完成后回写本文件，并在 [plan-v5.md](plan-v5.md) 保留相应摘要。
>
> **批准来源：** 用户会话指令（2026-09-03）：当前玩法参考
> `/Users/kimi/work/tanchishe/wegameVersion/` 原游戏无尽模式；源游戏为横版，本项目改为竖版；
> 原游戏素材可直接采用；要求规划蛇皮肤等养成系统，并使战场格子、食物颜色、AI 皮肤等表现一致。
>
> **当前玩法基线：** drop-in 自由加入、8 蛇总量（真人不足由 AI 填充）、首人开局、Playing 可入、
> 90 秒限时计分、死亡 2 秒复活保分。该口径已在 [plan-v5.md](plan-v5.md#c-玩法实现既定范围外随玩法立项另立计划)
> 登记，本专项首期只补战场表现与养成闭环，不暗中把联机规则替换成原作其他版本。
>
> **证据口径：** 文内源码行号是建档时快照，后续复核应按符号重新定位。固定状态标签为
> `[已拍板·待实施]`、`[进行中]`、`[已完成]`、`[阻塞·需 Creator]`、`[有意不做]`；
> 文档落盘本身不代表任何实现阶段完成。

---

## 1. 目标与拍板口径

本专项按两条依赖有序的主线实施：

1. **先建立竖版复刻基线。** 修复格距、背景、食物、皮肤、AI 外观、相机和残骸等表现差异，
   建立可自动验证的素材与表现目录。
2. **再建立纯外观养成。** 在同一套稳定皮肤目录上实现收藏、预览、解锁、装备、赛后经验与碎片，
   皮肤不提供速度、初始长度、转向、碰撞或得分优势。

首发推荐范围：

- 固定一个 `classicEndlessPortraitV1` 竖版复刻配置。
- 接入原作 internal skins 的 16 个稳定内容 ID。
- 完成衣柜、永久所有权、装备、AI 皮肤和可靠赛后奖励。
- 预留拖尾、击杀/死亡特效、名牌、表情、皮肤熟练度等槽位，但首发不展开。
- 原作新版无尽的更大地图、更多食物和更多 AI 作为独立规则配置候选，不与首发经典基线混用。

### 1.1 非目标

- 不把地图改回横版。
- 不把原作私有网络协议、支付、广告、临时皮肤或商业活动系统整体移植进本仓。
- 不允许客户端在 join 数据中自报一个未经服务端验证的 `skinId`。
- 不为不同皮肤设置不同碰撞体、速度或攻击范围。
- 不以手改生成镜像或生成 registry 的方式接入功能。

---

## 2. 横版转竖版的坐标与视口规则

### 2.1 世界坐标只旋转，不拉伸

经典原作默认世界为 `3264 × 1920`，当前项目为 `1920 × 3264`，见
[apps/shared/src/gameplays/snake/ruleset.ts](apps/shared/src/gameplays/snake/ruleset.ts#L19)。
这不是缩放，而是同面积的 90° 转置。统一采用以下正交变换：

```text
source (x, y) -> portrait (-y, x)

source world:   3264 × 1920
portrait world: 1920 × 3264

source design viewport:   1624 × 750
portrait design viewport:  750 × 1624
```

该变换保持距离、角度、格距、食物尺寸、蛇身宽度与碰撞比例不变。场景位置和方向随坐标旋转；
蛇头素材、食物、文字和 HUD 不作为一张画面整体旋转，而是按竖屏重新布局。

### 2.2 竖屏布局

- 战场世界层按 `750 × 1624` 设计视口显示，不为填满屏幕而二次拉伸世界。
- 排行榜、时间和状态放置在顶部安全区。
- 摇杆、加速与辅助按钮放置在底部安全区，左右手布局可继续由设置控制。
- HUD、弹窗和摇杆不得跟随世界层相机缩放。
- 不同视口宽高比只调整安全区与 UI 密度，不修改世界单位。

### 2.3 复刻配置必须冻结

原作静态默认值位于
`/Users/kimi/work/tanchishe/wegameVersion/subpackages/loading/bundle/_r/config/GameConstant.js`，但运行时还会由
`Game.assignByConfigs` 使用远端配置覆盖。归档中存在 `4896 × 4896、1000 Dot + 30 Star` 的新版无尽配置，
不能把它与经典 `3264 × 1920、300 + 15` 默认值混成一个不可复现的目标。

因此首发冻结：

| 配置 | 用途 | 场地 | 食物 | AI/局制 |
|---|---|---:|---:|---|
| `classicEndlessPortraitV1` | 本专项首发 | `1920 × 3264` | 300 Dot + 15 Star | 保留当前 8 蛇、90 秒联机规则 |
| `newEndlessPortraitV2` | 后续候选 | 单独取证后决定 | 单独取证后决定 | 另行做容量、网络和规则评审 |

---

## 3. 当前实现差距

### 3.1 契约和服务端

- 当前 `snake@1`、最多 8 真人、`dropIn` profile，见
  [apps/shared/schema/gameplays/snake/manifest.json](apps/shared/schema/gameplays/snake/manifest.json#L1)。
- 快照已有 `skin`，但只允许 `0..15`，无法表达原作 `101、133、401、701` 等稳定 ID，见
  [apps/shared/src/gameplays/snake/wire.ts](apps/shared/src/gameplays/snake/wire.ts#L37) 与
  [apps/shared/src/gameplays/snake/wire.ts](apps/shared/src/gameplays/snake/wire.ts#L128)。
- 食物快照只有 `kind=0/1`，没有彩点帧 `variant`；残骸没有加速/死亡种类或来源外观。
- 真人皮肤按 `joinOrdinal % 8` 临时分配，AI 固定 `skin=15`，没有读取玩家所有权和装备，见
  [apps/server/src/rooms/modes/snake/world.ts](apps/server/src/rooms/modes/snake/world.ts#L182)。
- 当前 drop-in 中途准入没有可 await 的玩法档案准备钩子，不能在创建 Snake 前可靠加载装备。
- 当前 Snake 结算没有能覆盖中途加入/离开的可靠参赛账本，不能直接承诺永久赛后奖励。

### 3.2 客户端表现

- 背景、网格、AI、食物与残骸颜色都在 View 内硬编码，见
  [apps/client/src/view/rooms/snake/SnakeWorldView.ts](apps/client/src/view/rooms/snake/SnakeWorldView.ts#L37)。
- 视觉格距为 100；原作 `MAP_SPACE` 为 32。服务端的 `GRID_CELL=150` 是碰撞 broadphase，
  与视觉格距无关，不得一并修改。
- Dot/Star 当前是 Graphics 圆，未使用已引入的原作 atlas。
- 运行时只加载三张 classic 皮肤；已引入的 internal skin、AI skin、食物、墙块和音效大多未接线。
- 蛇头按 `snapshot.skin % 3` 选图，蛇身却按实体 id 哈希选材质，头身可能不同皮肤，见
  [apps/client/src/view/rooms/snake/SnakeMeshRenderer.ts](apps/client/src/view/rooms/snake/SnakeMeshRenderer.ts#L107)。
- 真人皮肤被席位色 tint，AI 被统一灰化，破坏原作素材颜色。
- 当前相机只平移并在地图内钳位，没有随长度缩放，见
  [apps/client/src/view/rooms/snake/SnakeWorldView.ts](apps/client/src/view/rooms/snake/SnakeWorldView.ts#L331)。

### 3.3 已有素材与授权

当前首批素材及 SHA-256、来源、转换方式和授权证据已登记在
[docs/snakeoff/08-source-and-asset-provenance.md](docs/snakeoff/08-source-and-asset-provenance.md#L256)。
后续补齐其余皮肤、atlas JSON、身体配置或音效时，继续逐文件登记，不以“同机可见”代替授权台账。

---

## 4. 竖版战场表现规格

### 4.1 几何与相机

| 项目 | `classicEndlessPortraitV1` 目标 | 说明 |
|---|---:|---|
| 世界尺寸 | `1920 × 3264` | 原作 `3264 × 1920` 的 90° 转置 |
| 视觉格距 | 32 世界单位 | 不是屏幕像素，也不是碰撞分区 |
| 地图边距 | 16 世界单位 | 对应原作 `MAP_BORDER` |
| 蛇身基础宽度 | 36 | 所有皮肤统一玩法碰撞口径 |
| 出生长度 | 30 | 当前与原作静态默认同量级 |
| 相机初始缩放 | 1.4 | 首发经典配置 |
| 相机最小缩放 | 0.7 | 长蛇时封顶 |
| 相机缩放长度上限 | 5000 | 线性插值上限 |
| 蛇身全局缩放 | 1.0 → 2.8 | 按长度增长；服务端碰撞和客户端表现必须一致 |

相机公式：

```text
cameraScale = max(
  cameraMinScale,
  cameraInitScale
    - snakeLength * (cameraInitScale - cameraMinScale) / cameraScaleSnakeMaxLength
)
```

- 相机中心始终跟随自己的蛇头。
- 靠近边界时继续跟随，地图外绘制原作外围背景与边界，不采用当前视口钳位。
- 若加放大镜等临时效果，恢复过程单独插值，不改变稳定公式。
- 长度缩放若进入碰撞，必须由服务端权威计算；禁止只把客户端画粗而保留旧碰撞半径。

### 4.2 背景、网格和边界

- 从原作 Game 场景序列化组件提取实际明/暗地图色、网格色、地图外背景色和透明度，禁止凭肉眼填近似 RGB。
- 保留原作浅色/深色地图主题能力，首发默认主题以 P0 截图基准为准。
- 世界网格按 32 单位生成；相机缩放后屏幕像素间距自然变化。
- 地图边界优先复用已授权墙块素材和原作平铺/拼接规则；若原作当前主题只用线框，则按主题目录选择。
- 背景和网格进入 presentation catalog，不继续散落在 View 魔法数中。

### 4.3 食物与残骸

原作 atlas 包含普通食物 `1..7`、`star` 和主题 star 变体。经典首发目标：

| 类型 | 数量 | 显示尺寸 | 长度/分值 | 表现 |
|---|---:|---:|---:|---|
| Dot | 300 | 16 | 1 | `1..7` 彩色帧均匀或按原作随机分布 |
| Star | 15 | 42 | 原作 10；是否同步规则见 §4.7 | star 帧、移动、随机变向、撞边反弹 |
| 加速残骸 | 有界补充 | 22 | 1 | 原作对应素材/帧 |
| 死亡残骸 | 房间 cap 内 | 34 | 3 或聚合价值 | 区分死亡掉落表现 |

实现约束：

- 快照增加服务端权威的 `food.variant`；同一种子和实体 id 应稳定复现。
- 残骸增加 `kind`，必要时增加 `variant` 或 `sourceSkinId`；不能只靠客户端猜。
- Star 运动由服务端模拟并随现有快照同步。
- 315 个常驻食物必须使用同一 atlas/material 的批量 mesh；不得创建 315 个 Sprite 节点或 draw call。
- 食物素材 rect、尺寸和 atlas 边界加入自动校验。

### 4.4 皮肤目录与渲染

首发目录使用原作 internal skin 的稳定内容 ID：

```text
1, 2, 3, 4, 10, 11, 101, 111,
112, 132, 133, 139, 401, 403, 411, 701
```

`SnakeSkinCatalog` 每条至少包含：

```ts
interface SnakeSkinDefinition {
  skinId: number;
  contentVersion: number;
  displayName: string;
  rarity: string;
  sortOrder: number;
  previewAsset: string;
  textureAsset: string;
  headFrames: readonly FrameDefinition[];
  bodyFrames: readonly FrameDefinition[];
  tailFrames: readonly FrameDefinition[];
  bodySequence: readonly number[];
  animationFrameMs: number;
  bodyDistance: number;
  pivotX: number;
  pivotY: number;
  visualScale: number;
  playerUsable: boolean;
  aiEligible: boolean;
  fallbackSkinId: number;
}
```

目录分层：

- **Shared 公共目录：** 稳定 `skinId`、公开状态、版本/hash、服务端与客户端共用校验。
- **服务端业务目录：** 所有权 itemId、碎片 itemId、解锁方式、价格、上下架时间、AI eligibility。
- **客户端资源目录：** 预览、纹理路径、head/body/tail rect、pivot、帧时间、body sequence、fallback。

素材转换要求：

- 读取原作每套皮肤的 atlas JSON 与身体配置，生成标准化目录。
- 不能继续假设所有图片都是 `216 × 72` 三等分；部分皮肤有多身体帧、动画头和不同身体间距。
- 可在运行时从 Texture2D + rect 构造 SpriteFrame，减少手工切片 `.meta`；最终仍须 Creator 打开确认资源与 UUID。
- 目录生成阶段校验 ID 唯一、唯一默认皮肤、AI 池非空、rect 不越界、资源存在、fallback 无环。
- 服务端、客户端目录 hash 不一致时禁止经济写；战场允许回退默认皮肤，避免资源问题阻塞开局。

渲染规则：

- `skinId` 同时决定头、身、尾及动画，禁止再按实体 id 哈希身体材质。
- 原作彩色皮肤默认使用白色 tint，不用席位色重染。
- 自己的识别通过细白轮廓、头顶箭头、名字或名牌完成。
- 每条蛇最多一条主体 mesh；不同皮肤可分材质，常用纹理可进一步合并 atlas。
- 未知 ID、资源加载失败或 rect 非法时统一回退皮肤 1，并记录受控诊断。

### 4.5 AI 皮肤与身份表现

原作在 `GameStore.generateGameSnakeInfos` 中从其他蛇皮肤池轮换 AI 外观，并对名字、头像做不重复抽取。
本项目采用等价但可确定性重放的规则：

1. 从 catalog 过滤 `aiEligible=true`。
2. 优先排除本房真人已经装备的皮肤。
3. 使用独立 `snake.ai.skin` seeded RNG 洗牌。
4. 按洗牌结果轮换；池不足时才循环。
5. AI 重生和重连期间保持本局 `skinId`。
6. 皮肤随机流不得消费移动、出生、食物或碰撞随机流。

AI 不再统一灰化；若需要区分 AI，通过名牌标记、名字池或头像表现，不修改皮肤原色。

### 4.6 音效与其他表现

- 接入已登记的吃食物、吃残骸、击杀、时间结束、结算、按钮等音效。
- 音效遵守现有 `sfxOn` 设置和 View/Logic 边界。
- 加速拖尾、出生保护、死亡爆散与复活表现可使用原作已授权素材，但必须进入 presentation catalog。
- 动画只做视觉插值，玩法状态和命中仍以服务端 tick 为准。

### 4.7 表现复刻与规则复刻的边界

当前规则有意调整过速度、转向、加速、出生保护和 Star 价值，见
[apps/shared/src/gameplays/snake/ruleset.ts](apps/shared/src/gameplays/snake/ruleset.ts#L32)。本专项第一阶段不得借“表现一致”
静默改这些玩法数值。需要另开数值拍板项的差异包括：

- 当前 Star 长度/分值为 5，原作静态默认是 10。
- 当前速度 160 unit/s，低于原作 `4.5 px/frame @ 60fps` 的近似速度。
- 当前加速倍率 1.6，原作静态默认为 2。
- 当前转向速度和出生保护也经过竖版/联机收敛。

P0 应形成“只改表现”与“需要规则变更”的差异表。任何规则同步均需更新 shared 真源、测试和版本说明。

---

## 5. 养成系统产品设计

### 5.1 核心循环

```text
参加比赛
  -> 获得蛇经验、金币或碎片
  -> 提升蛇等级 / 完成成就
  -> 解锁或合成皮肤
  -> 在衣柜预览、装备
  -> 下一局以新皮肤出战
```

### 5.2 首发内容分配

16 套皮肤先全部生成预览图，再由美术和产品按视觉质量分配，不根据数字 ID 猜稀有度。建议配额：

| 获取方式 | 数量 | 目的 |
|---|---:|---|
| 默认永久拥有 | 1 | 新账号与所有异常场景的稳定 fallback |
| 新手/等级里程碑 | 3 | 让前期养成快速形成反馈 |
| 金币购买 | 4 | 建立基础货币消耗点 |
| 成就解锁 | 4 | 引导分数、排名、场次、击杀等目标 |
| 碎片合成/活动 | 4 | 中长期追求；首发不做随机宝箱 |

原则：

- 首发不做抽卡和随机重复皮肤。
- 永久皮肤重复获取必须被业务唯一键拒绝，不能再次扣款后转换。
- 退休皮肤停止售卖但保留既有所有权和装备能力。
- 限时试用、广告、支付皮肤和赛季通行证在可靠资产链完成后另立商业化阶段。

### 5.3 蛇等级、收藏和熟练度

- **蛇等级：** 全局成长线，经验来自有效参赛、分数和排名；等级只解锁外观和展示内容。
- **收藏进度：** 按永久拥有皮肤的稀有度累计，用于头像框、名牌或徽章，不改变战斗属性。
- **皮肤熟练度：** 后续阶段按装备该皮肤的有效参赛累积，可解锁徽章、拖尾或专属展示动作。
- 等级由累计经验表派生，避免同时保存可漂移的 `level` 与 `xp` 两份权威值。

### 5.4 后续外观槽位

数据模型预留但首发不开放：

- `trailId`：移动/加速拖尾。
- `deathFxId`：死亡爆散和残骸特效。
- `killFxId`：击杀表现。
- `nameplateId`：名字底板、头像框、称号。
- `emoteSetId`：对局表情。

所有槽位保持纯表现；配置缺失时逐槽回退，不连带阻塞主皮肤。

---

## 6. 数据模型与写路径

### 6.1 权威存储

复用现有 User Hash、分片 Bag、MySQL currency/ledger 与 gameplay outbox，不新增独立 Redis key：

| 数据 | 权威位置 | 编码 |
|---|---|---|
| 永久皮肤所有权 | `bag:{uid}:N` | `ownershipItemId` 数量 `>=1` 表示拥有 |
| 皮肤碎片 | `bag:{uid}:N` | 可累加 `fragmentItemId` |
| 蛇经验/熟练度 | Bag additive item 或新 additive grant | 禁止用会乱序覆盖的延迟 `setField` |
| 当前装备 | `user:{uid}.snakeEquippedSkinId` | 缺失回退默认皮肤 |
| 外观状态版本 | `user:{uid}.snakeCosmeticVersion` | 缺失视为 0 |
| 金币 | MySQL `user_currency` | 继续沿用现有权威 |
| 金币流水/购买收据 | MySQL ledger/专用 entitlement receipt | 唯一业务键防重复购买 |

默认皮肤隐式拥有。新增 User 字段为可选业务字段，不要求首发批量回填；读取必须由独立 Snake cosmetic store
显式取字段，不能假设现有 `readUser` 自动返回开放字段。

### 6.2 RPC 契约

新增 `snakeCosmetic` Lobby RPC 域：

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
snakeCosmetic.purchase(clientReqId, skinId, expectedStateVersion) // 商业化阶段
```

领域错误码至少包含：

```text
SKIN_NOT_FOUND
SKIN_NOT_OWNED
SKIN_UNAVAILABLE
SKIN_ALREADY_OWNED
STATE_CONFLICT
INSUFFICIENT_FRAGMENTS
CATALOG_VERSION_MISMATCH
```

RPC descriptor 是契约真源，按标准流程生成 registry、服务端路由和能力文档。

### 6.3 装备写路径

装备属于 Redis-only 状态变更：

1. 进入现有 `withUser` 用户锁/UoW。
2. 校验 catalog 版本、皮肤有效、已拥有、未下架禁用。
3. 校验 `expectedStateVersion`。
4. 写 `snakeEquippedSkinId` 并递增 cosmetic/global version。
5. 返回完整的新状态快照。

装备不需要 MySQL outbox，但必须支持同一 `clientReqId + payload` 重试，并拒绝同 id 不同 payload。

### 6.4 碎片解锁

碎片解锁必须使用专用同槽 Lua，一次性完成：

```text
检查 catalog/版本
-> 检查尚未拥有
-> 检查碎片足够
-> 扣碎片
-> 写永久 ownership=1
-> 递增状态版本
-> 写 applied/payload 幂等绑定
```

不能直接使用通用负 item effect；现有脚本的下溢处理不能表达“余额不足则整笔零写入”。

### 6.5 永久皮肤购买

不同 `clientReqId` 仍可能针对同一皮肤重复购买，因此不能只增加普通可堆叠 Shop SKU。商业化阶段应：

1. 在 MySQL 建 `(uid, sId, skinId, entitlementGeneration)` 唯一业务收据。
2. 同一事务扣金币、写 ledger、写 outbox。
3. outbox 向 Bag 发放永久所有权。
4. 重放时由唯一收据和 applied/payload 共同保证不重复扣款和不重复发放。

---

## 7. 入房、快照和版本演进

### 7.1 服务端权威装备

客户端可以上传 `clientCatalogVersion` 用于兼容性检查，但不得把 join 中的 `skinId` 当权威。正确准入顺序：

```text
鉴权成功
-> preparePlayerAdmission(uid, session/generation)
-> 读取 equippedSkinId 与所有权
-> 校验 catalog 和资源版本
-> 创建本局 Snake(skinId)
-> 将 skinId 锁存在本局实体
```

当前初始阵容可使用已被 await 的 `onMatchInitialize`，但 Playing 中途加入只有同步 admission/createPlayer。
应新增通用、限时的异步 `preparePlayerAdmission` hook，在鉴权后、实体创建前执行；不得在 `GameRoom` 写 Snake 专属分支。

局中换装规则：

- 衣柜写入立即生效于账号，但只影响下一次创建的 Snake。
- 当前局实体的 `skinId` 冻结；重生、断线重连继续使用该值。
- 若外观被服务端撤下，下一局回退默认并可在用户锁内修复装备字段。

### 7.2 Snake wire v2

建议将字段语义从临时索引收敛为稳定内容 ID，并提升 `snake.modeVersion`：

```ts
interface ISnakeSnapshotSnake {
  skinId: number;
  // 其余字段保持现状
}

interface ISnakeSnapshotFood {
  variant: number;
}

interface ISnakeSnapshotWreck {
  kind: number;
  variant?: number;
  sourceSkinId?: number;
}
```

- validator 按 catalog 成员或稳定 ID 上界校验，不能继续限制 `0..15`。
- `bodyScale` 若能由 shared 长度公式确定，可不占快照字段；若规则可热版本化，则显式下发规则版本。
- 素材目录不在当前 gameplay contract digest 内，需额外携带 `presentationVersion/catalogHash`。
- 服务器发送客户端未知的皮肤时，客户端必须回退默认，而不是崩溃或拒绝整个快照。

### 7.3 生成流程

涉及契约与生成物时按仓库标准动线执行：

```text
修改 shared 手写真源 / snake schema
-> npm --workspace @game/server run codegen:gameplays
-> npm --workspace @game/server run codegen:features
-> npm run sync:shared
-> protocol 变更时显式重钉 fingerprint
-> npm run sync:client
-> 类型检查与测试
```

禁止手改：

- `apps/shared/src/gameplays/generated/`
- `apps/server/src/rooms/schema/generated/`
- `apps/client/src/gameplay/catalog.generated.ts`
- `apps/shared/src/protocol/lobbyRpc/registry.generated.ts`
- `apps/client/src/generated/`
- `apps/client/src/shared/`
- `apps/Cocos/assets/src/`

---

## 8. 可靠赛后奖励

### 8.1 为什么不能直接在现有 settle 后发奖

Snake 是动态 roster：玩家可以中途加入和离开；当前离开会从 world 删除，最终 world 排名不能覆盖早退玩家。
现有 drop-in 又不与冻结 initialRoster 的 evidence capability 组合。因此正式养成奖励必须先增加 Snake 自持的
完整参赛账本，不能使用 detached best-effort Redis 发放冒充可靠闭环。

### 8.2 参赛账本

每位本局参与者即使离开 world，也保留：

```ts
interface SnakeParticipantLedger {
  uid: string;
  sessionId: string;
  joinedTick: number;
  leftTick: number | null;
  activeTicks: number;
  score: number;
  rank: number | null;
  kills: number;
  equippedSkinId: number;
  catalogVersion: number;
  rewardPolicyVersion: number;
}
```

需要定义重连合并、同 uid 多 session、防并发顶号、中途退出和房间异常 dispose 的语义。

### 8.3 结算协议

1. 先持久化 `snake_match_settlement` 或通用动态参赛 evidence。
2. 为每位玩家生成确定性奖励 intent。
3. opId 至少绑定 `(matchId, uid, sId, rewardPolicyVersion)`。
4. 金币在 MySQL 同一事务入账并写 ledger。
5. 经验、碎片、熟练度等 Redis 资产通过 gameplay outbox 应用。
6. 进程崩溃后由 relayer 重放，最终必须不漏奖、不双发。

### 8.4 奖励公式形状

首轮数值不在计划中硬编码，先根据真实 90 秒局分数分布调参；公式结构固定为：

```text
reward
  = baseParticipation
  + activeTimeComponent
  + cappedScoreComponent
  + rankBonus
  + firstWinOrAchievementBonus
```

- 晚加入按有效时长折算。
- 无输入、无移动贡献且无得分的账号不获得完整奖励。
- 分数组件必须封顶，避免单局异常值冲击经济。
- 每次调参提升 `rewardPolicyVersion`，历史结算按原版本重放。

---

## 9. 客户端 Feature 与页面

新增独立 `features/snakeCosmetic/feature.json`，按非侵入式 feature 动线接入。

### 9.1 Logic

- 拉取权威 snapshot 并验证 catalog hash。
- 构造不可变衣柜 ViewModel。
- 提供“全部/已拥有/未拥有/可合成”筛选和稳定排序。
- 执行装备、解锁、冲突刷新和错误映射。
- 写操作在发出前进入 `PendingOperationJournal`，恢复后用相同 payload 重发。
- Logic 禁止导入 `cc` 或 `fairygui-cc`。

### 9.2 View

- FGUI 虚拟列表显示预览、稀有度、拥有/锁定/可合成状态。
- 中央动态预览同时展示头、身、尾、动画和长度增长效果，用作素材验收入口。
- 详情区展示获取方式、碎片进度、装备/解锁按钮。
- 当前装备、首次获得和新解锁具有明确状态与红点。
- 状态版本冲突时禁用重复点击，刷新后恢复。

### 9.3 页面动线

```text
Home
  -> 装扮/衣柜
      -> 皮肤列表
      -> 动态预览
      -> 解锁/装备
  -> 开始游戏
      -> 使用服务端锁存装备
  -> 结算
      -> 展示经验、碎片、等级进度和新解锁
```

首页 schema 当前主要面向 gameplay launch。建议一次性把 launch target 扩展为 `gameplay | route` 联合类型，
让衣柜入口完全由 feature 自持；首页实体 GList 视觉可与 [plan-v5.md](plan-v5.md#b-编辑器--creator-待办-无头环境无法替代)
的 B1 一起完成。

---

## 10. 实施阶段与交付物

> 人日为单工程师粗估，不含最终 FGUI 美术制作和产品数值反复。

| 阶段 | 状态 | 工作 | 主要交付物 | 退出条件 | 预计 |
|---|---|---|---|---|---:|
| S0 | [已拍板·待实施] | 冻结基线、取证、差异表 | `classicEndlessPortraitV1`、原作/竖版 golden、规则差异表 | 复刻目标可由固定配置和截图重复获得 | 2–3 人日 |
| S1 | [已拍板·待实施] | 素材目录与转换 | 16 皮肤 catalog、atlas rect/body config 生成、资源/授权台账 | 全目录生成和资源/rect/hash 校验通过 | 3–5 人日 |
| S2 | [已拍板·待实施] | 战场表现复刻 | 32 格距、背景、食物、残骸、相机、皮肤统一渲染、AI 外观 | 定向测试通过且竖版 world golden 达标 | 5–7 人日 |
| S3 | [已拍板·待实施] | 衣柜与装备 | Feature、FGUI、snapshot/equip/unlock、Bag/User 存储、准入锁存 | 权威装备、并发、重连、fallback 测试通过 | 6–10 人日 |
| S4 | [已拍板·待实施] | 可靠养成奖励 | 参赛账本、durable settlement、金币/经验/碎片 outbox | 各崩溃窗口恢复后不漏奖、不双发 | 6–10 人日 |
| S5 | [已拍板·待实施] | 验收与发布 | 自动测试、Creator、故障演练与兼容证据 | 全量门禁与 Creator 证据齐全 | 2–3 人日 |

完整首发合计约 24–38 人日。S3 可用于内部试玩，面向玩家宣称“养成系统完成”必须等 S4 的可靠奖励闭环完成。

### S0：复刻基线

- [ ] 在原作固定构建和配置下截取横版战场 golden。
- [ ] 生成只旋转世界层后的竖版参照图；UI 单独给出竖屏布局稿。
- [ ] 从场景序列化数据提取背景、网格和边界颜色。
- [ ] 固化 `classicEndlessPortraitV1` presentation 配置和 hash。
- [ ] 列出表现差异与规则差异，明确本阶段不改的数值。

### S1：素材与目录

- [ ] 补齐 16 个 internal skin 的 PNG、atlas JSON、body config 与预览。
- [ ] 补齐七色 Dot、Star、残骸和墙块 rect。
- [ ] 编写确定性转换/校验脚本，不手抄大量 rect。
- [ ] 更新素材授权与 SHA 台账。
- [ ] 验证 default、fallback、AI pool、资源存在和 rect 边界。

### S2：战场表现

- [ ] 将网格 100 改为 catalog 的 32 世界单位。
- [ ] 接入原作背景/边界主题。
- [ ] 食物、Star 和残骸改为 atlas 批渲染。
- [ ] 接入 Star 运动与反弹。
- [ ] 统一 `skinId -> head/body/tail` 渲染。
- [ ] 移除原皮席位 tint 与 AI 灰 tint，增加自机非颜色提示。
- [ ] 接入长度相机缩放；评审并同步蛇身全局缩放与碰撞。
- [ ] AI 皮肤使用独立 seeded RNG。

### S3：衣柜与装备

- [ ] 增加 shared catalog 与 `snakeCosmetic` RPC descriptor。
- [ ] 实现 Bag 所有权/碎片查询和 User equipped/version store。
- [ ] 实现 equip CAS 与专用 unlock Lua。
- [ ] 增加通用异步 `preparePlayerAdmission` hook。
- [ ] 提升 Snake modeVersion，生成和同步所有镜像。
- [ ] 完成衣柜 Logic、FGUI View、动态预览和首页 route 入口。
- [ ] 完成重连、局中换装只影响下一局、未知素材 fallback。

### S4：可靠奖励

- [ ] 建立动态 roster 参赛账本。
- [ ] 建立 durable match settlement/evidence。
- [ ] 使用 MySQL ledger + gameplay outbox 发放奖励。
- [ ] 建立 rewardPolicyVersion 和幂等 opId。
- [ ] 覆盖中途加入、早退、重连、崩溃窗口和重复结算。
- [ ] 完成首轮经验、等级、碎片和成就表调优。

### S5：验收与发布

- [ ] `npm run verify:all` 全绿。
- [ ] Snake server/client/FGUI 单测和真栈 int 全绿。
- [ ] Creator 3.8.8 打开确认资源 `.meta`、动态加载和 SpriteFrame rect。
- [ ] 750×1624 Creator 预览截图留证。
- [ ] 回写本文件状态、commit、命令结果、截图和 Creator 证据路径。

---

## 11. 验收标准

### 11.1 视觉一致性

- 使用固定实体位置/种子的 fixture，在 `750 × 1624` 下将竖版世界层与原作横版世界层旋转 90° 后叠图。
- 网格间距严格为 32 世界单位；地图边距为 16。
- Dot 和 Star 的世界显示尺寸分别为 16 和 42，七种 Dot 帧均可出现。
- 背景、网格、边界色来自原作场景数据，不是人工近似值。
- 每条蛇的头、身、尾和动画始终来自同一 `skinId`。
- AI 不再统一灰色；同局皮肤池具有足够多样性。
- 相机缩放公式、蛇头中心跟随和边界外围背景可用 fixture 自动断言。
- 未知皮肤和资源加载失败稳定回退默认，不阻塞战斗。

### 11.2 协议与数据正确性

- `skinId` 使用稳定内容 ID，不依赖目录顺序或 `% 3`。
- 客户端伪造未拥有皮肤不能进入战场。
- 同/不同 requestId 并发装备、重复解锁和状态版本冲突行为确定。
- 碎片不足时所有字段零写入。
- 冷用户 thaw、冻结归档、跨区隔离和退休皮肤均有测试。
- 中途换装只影响下一次实体创建；重连和重生保持本局外观。
- 结算在每个崩溃窗口恢复后不漏奖、不双发。

### 11.3 Creator 与可复现证据

- Creator 预览确认所有纹理、rect、pivot、动画、混合和层级正确。
- 留存固定视口下的战场 golden、衣柜、结算、断线重连和资源缺失 fallback 截图/日志。

---

## 12. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 混用原作静态默认与远端新版配置 | 永远无法定义“一致” | 冻结命名配置、hash 和截图基线 |
| 原皮 atlas 布局不一致 | 头身错位、动画错误 | 解析原 atlas/body config，生成 catalog，rect 自动验界 |
| 只改客户端体型 | 视觉和碰撞不一致 | 全局缩放公式由 shared/server 权威，或明确保持固定体宽 |
| 直接信任 join skinId | 越权使用未拥有皮肤 | 服务端异步准入读取并锁存装备 |
| drop-in 早退丢失记录 | 漏奖、排名和成就错误 | world 外保留完整参赛账本，durable settlement 后再发奖 |
| 普通 Shop SKU 重复购买唯一皮肤 | 多次扣款 | 专用 entitlement receipt 唯一键 |
| 资源版本与服务端目录不一致 | 白图、崩溃、经济争议 | catalog hash 闸门；经济禁写、战斗 fallback |
| 每食物一个节点 | 节点和提交数量失控 | 单 atlas/material 批量 mesh |
| 皮肤随机影响玩法 RNG | 新增皮肤改变对局轨迹 | 独立命名 seeded RNG 子流 |
| 手改生成物 | 镜像漂移和后续覆盖 | 只改真源并运行 codegen/sync |

---

## 13. 实施状态与证据回写模板

每完成一个阶段，在下表登记真实证据；未运行的命令不得写成通过。

| 阶段 | 状态 | commit | 自动验证 | Creator 证据 | 备注 |
|---|---|---|---|---|---|
| S0 | [已拍板·待实施] | — | — | — | — |
| S1 | [已拍板·待实施] | — | — | — | — |
| S2 | [已拍板·待实施] | — | — | — | — |
| S3 | [已拍板·待实施] | — | — | — | — |
| S4 | [已拍板·待实施] | — | — | — | — |
| S5 | [已拍板·待实施] | — | — | — | — |

建议的最终发布口径：

> **竖版经典无尽战场表现复刻 + 16 套原作皮肤 + 纯外观养成 + 服务端权威装备 + 可靠赛后奖励。**
