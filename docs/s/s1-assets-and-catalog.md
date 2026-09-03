# S1 · 素材、皮肤目录与确定性转换

> [返回专项总目录](README.md) · [上一阶段：S0 复刻基线](s0-replication-baseline.md) ·
> [下一阶段：S2 战场与无尽生命周期](s2-battle-and-endless-lifecycle.md)

> **状态：`[已拍板·待实施]`**<br>
> **预计：3–5 人日**<br>
> **依赖：S0 已冻结来源归档、场景表现基线、目标配置和规则差异。**<br>
> **主要输入：** S0 evidence bundle、原作 internal skins/atlas/body config、现有
> `apps/Cocos/assets/resources/snakeoff/` 首批资源、来源与授权台账。<br>
> **主要输出：** 16 套稳定皮肤的分层 catalog、标准化 atlas rect/body config、预览、七色 Dot/Star/
> 残骸/墙块/背景/音效表现目录、确定性转换与校验器、资源与授权 SHA 台账。<br>
> **阶段纪律：** 只改手写真源并通过既有 codegen/sync 动线产生镜像；不得手改 generated registry、
> `apps/client/src/shared/` 或 `apps/Cocos/assets/src/`。Creator 最终导入验收在 S5 收口，S1 仍须完成
> 无头可验证的资源、rect、fallback 和 hash 门禁。

---

## 1. 目标与阶段边界

S1 的目标是把“散落的 PNG 和原作 atlas 信息”变成稳定、可生成、可校验、可由服务端和客户端共同识别的
内容目录。S2 只能从该目录渲染战场，S3 只能从该目录建立所有权和装备；任何一侧都不得再次解析文件名、
依赖数组下标或自行猜 rect。

本阶段必须完成：

- 补齐 16 个 internal skin 稳定内容 ID 对应的 PNG、atlas JSON、身体配置和预览。
- 解析原作 atlas/body config，确定性生成 head/body/tail 帧、动画和身体序列。
- 建立 shared 公共、服务端业务、客户端资源三层目录，并生成稳定 catalog hash。
- 补齐七色 Dot、Star、加速残骸、AI 死亡残骸、墙块、背景/网格主题和已批准音效的表现登记。
- 建立 ID、默认皮肤、AI 池、资源、rect、fallback、hash 和确定性生成门禁。
- 逐文件维护来源绝对路径、逻辑名、SHA-256、授权、目标路径、转换和 `.meta` 状态。

### 1.1 非目标

- 不在 S1 实现 1030 食物批渲染、Star 移动、相机、皮肤 mesh 或 AI 分配；这些属于 S2。
- 不在 S1 实现 Bag/User 所有权、解锁、购买、装备或衣柜 RPC；这些属于 S3。
- 不按数字 ID 猜稀有度、价格或获取方式；16 套预览齐备后再由产品/美术分配。
- 不允许不同皮肤拥有不同速度、碰撞体、初始长度、转向、攻击范围或得分收益。
- 不复制原作旧 import metadata、UUID、运行时代码或平台依赖。
- 不继续假设所有皮肤纹理都是 `216 × 72` 三等分，也不手抄大量 rect。
- 不以资源已存在于目标目录替代授权和 SHA 台账，不以合成 `.meta` 替代 Creator 最终确认。
- 不播放或接线限时结束音效；所选 `totalTime=0` 模式没有 TimeLimit 结束提示。

---

## 2. 冻结口径

### 2.1 16 个稳定皮肤 ID

首发皮肤集合固定为：

```text
1, 2, 3, 4, 10, 11, 101, 111,
112, 132, 133, 139, 401, 403, 411, 701
```

`skinId` 是跨 shared、server、client、持久化和快照的稳定内容 ID：

- 不依赖目录顺序、文件名补零、数组下标、`joinOrdinal` 或 `% 3`。
- 目录排序只由 `sortOrder` 决定；修改排序不改变所有权和装备身份。
- 皮肤 1 是统一运行时 fallback 候选；S1 校验它资源完整且可由真人/AI 安全显示。
- 是否 `playerUsable`、是否 `aiEligible` 是明确字段，不根据 ID 大小推断。
- 增删或改变内容解释必须提升相应 `contentVersion` 并更新 catalog hash。

当前资源目录已有首批皮肤、食物、墙块、操作图和音效，但不等于 16 套均完整，也不等于 atlas/body config
已经接线。以 [当前资源目录](../../apps/Cocos/assets/resources/snakeoff/) 和
[来源台账](../snakeoff/08-source-and-asset-provenance.md#7-直接素材复用登记模板) 为审计起点，不以现有文件名推断完成率。

### 2.2 `SnakeSkinCatalog` 最小定义

每个皮肤至少包含：

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

`FrameDefinition` 必须能无歧义表达纹理内 rect、pivot/anchor、旋转标志和必要的源帧名；具体 TypeScript
形状在实现时遵守 shared ES2017、零依赖和 exact validation 约束。

冻结渲染解释：

- 同一个 `skinId` 同时决定头、身体、尾部和动画；不能按实体 id 再选择身体材质。
- 身体帧次序由 `bodySequence` 决定；不能默认单帧或简单循环所有 rect。
- `bodyDistance`、pivot 和 `visualScale` 属于表现目录；玩法碰撞和全局身体缩放仍由 shared/server 权威规则决定。
- 原作彩色素材默认使用白色 tint；真人/AI/席位身份不得通过改皮肤原色表达。
- 未知 ID、资源加载失败或 rect 非法统一回退皮肤 1，并产生受控诊断。

### 2.3 三层所有权边界

| 层 | 允许内容 | 禁止内容 |
|---|---|---|
| Shared 公共目录 | 稳定 `skinId`、公开/退休状态、`contentVersion`、共享校验字段、公共 catalog hash | Cocos/DOM/Node API、纹理对象、商城价格、数据库访问 |
| 服务端业务目录 | ownership itemId、碎片 itemId、获取方式、价格、上下架时间、`aiEligible`、服务端 catalog hash | 客户端资源加载、SpriteFrame/Texture2D、相信客户端自报拥有 |
| 客户端资源目录 | 预览/纹理逻辑路径、head/body/tail rect、pivot、帧时间、body sequence、fallback、客户端 hash | 永久所有权真相、扣费结果、玩法属性 |

S1 建立三层可关联的内容身份和校验。S3 才为所有权、价格、碎片和上下架填入最终业务值；S1 期间这些字段
若尚未拍板，必须是显式 unavailable/draft 状态，不能用 ID 推断假数据。

### 2.4 皮肤素材转换规则

- 读取每套皮肤的原作 atlas JSON 与身体配置，转换为规范化帧和身体序列。
- 对 source rect 的 x/y/width/height、旋转、trim、原始尺寸和 pivot 做显式转换；不能只读取 PNG 尺寸。
- 原作可能存在多身体帧、动画头、独立尾部和不同身体间距；转换器必须逐结构支持或明确 fail-fast。
- 转换结果排序和序列化必须稳定，不依赖文件系统遍历顺序或对象属性偶然顺序。
- 可在运行时由 Texture2D + rect 构建 SpriteFrame，减少手工切片 `.meta`；仍需在 S5 用 Creator 3.8.8
  确认资源、UUID、pivot、动画、混合和层级。
- 源 PNG 可原样复制或按已登记步骤转换，但不能复制旧项目 `.meta`、import cache 或 UUID。
- 同字节素材可去重，但必须在台账中说明逻辑别名、唯一物理目标和相同 SHA，而不是静默丢行。

### 2.5 食物、残骸与地图表现目录

S1 只定义资源帧、尺寸和主题；数量、移动及权威分值由 S2 实现。

| 类型 | 目标帧/变体 | 世界显示尺寸 | 目录要求 |
|---|---|---:|---|
| Dot | 普通食物 `1..7` | 16 | 七帧均存在、rect 合法、逻辑 ID 稳定；同种子/实体 id 可由 S2 决定性选取 |
| Star | `star` 及所选主题变体 | 42 | 明确默认帧、主题覆盖和 fallback |
| 加速残骸 | 原作对应素材/帧 | 22 | 与 Dot、AI 死亡残骸使用不同稳定 kind |
| AI 死亡残骸 | 原作对应素材/帧 | 34 | 支持必要 `variant` 或 `sourceSkinId` 表现；真人死亡不使用该目录生成计分残骸 |
| 墙块/边界 | 已批准 wall block 或主题线框 | 由主题拼接规则决定 | 记录平铺/拼接、边界方向、默认主题和 fallback |
| 背景/网格 | S0 提取的明暗主题精确值 | 网格 32、边距 16 世界单位 | 颜色、透明度、地图外背景进入 presentation catalog，不留在 View 魔法数 |

1030 个常驻食物在 S2 必须由同一 atlas/material 的批量 mesh 渲染，不能建立 1030 个 Sprite 节点或 draw call。
因此 S1 的 atlas 分组、材质兼容性和 frame 数据必须支持批渲染，而不是只适合逐节点 SpriteFrame。

### 2.6 AI 皮肤所需目录能力

S2 的 AI 规则要求目录支持：

1. 过滤 `aiEligible=true`。
2. 排除本房真人已装备的皮肤。
3. 用独立 `snake.ai.skin` seeded RNG 洗牌并轮换，池不足时循环。
4. AI 重生时保持当前房间生命周期内的 `skinId`。
5. 皮肤随机流不消费移动、出生、食物或碰撞随机流。

S1 因此必须保证 AI 池非空、所有 AI entry 可解析到完整纹理/帧/fallback。AI 身份通过名字、名牌或头像表现，
不能靠统一灰化皮肤。`fake_snake_count=86` 不需要世界皮肤实体，不得被 catalog 生成器误算为 86 条活动 AI。

### 2.7 音效与其他表现

presentation catalog 至少登记：

- 吃普通食物。
- 吃残骸。
- 击杀。
- 真人死亡。
- 退出/个人 run 结果。
- 按钮点击。
- 加速拖尾、出生/复活保护、死亡爆散等已批准视觉资源（若首批存在）。

所有音效必须有稳定逻辑名、资源路径、hash、授权和 fallback/缺失策略，并遵守现有 `sfxOn`。限时时间结束音效
即使已在资源目录，也不得进入 `totalTime=0` 的目标播放映射；可以保留为来源/历史资产，但必须标为未使用。

### 2.8 来源、授权和 `.meta` 状态

每个直接复制或转换的文件必须登记：

| 字段 | 要求 |
|---|---|
| 源绝对路径 | 精确到文件，不只写 bundle 目录 |
| Catalog 逻辑名 | 稳定、唯一；别名/去重关系需显式记录 |
| SHA-256 | 对进入转换器的源字节计算；目标另记输出 hash |
| 权利/许可证证据 | 引用实际批准来源和日期，不能写“同机可见” |
| 批准日期/负责人 | 可追责且与证据一致 |
| 目标路径 | 仓库内精确路径 |
| 转换/重绘说明 | 原样复制、裁切、重排、重绘、格式转换均需记录 |
| 新 `.meta` | 新生成/Creator 重导入/待确认，不复制旧 UUID |
| 状态 | 只能使用下列合法状态 |

合法状态：

- `待授权，不得引入`
- `已授权，待转换`
- `已引入，待验收`
- `已验收`
- `已移除`

现有台账已记录首批 31 项及 SHA；S1 必须复算、补齐剩余资源并消解历史结论与后续授权记录之间的状态差异。
权威台账入口是
[08 · 来源与素材借鉴台账](../snakeoff/08-source-and-asset-provenance.md#7-直接素材复用登记模板)。

### 2.9 hash、fallback 与发布门禁

- 生成器对规范化 shared 公共目录和客户端/服务端内容身份分别计算稳定 hash。
- 服务端与客户端目录 hash 不一致时，禁止购买、解锁、装备等外观目录相关经济写；S3 必须复用此门禁。
- 战斗读取未知/退休/缺失资源时允许回退皮肤 1，避免纯资源问题阻塞房间，但要记录受控诊断。
- fallback 链必须有界且无环；fallback 目标必须存在且资源完整。首发建议所有非默认 entry 直接指向皮肤 1。
- 退休皮肤停止新获取但保留既有所有权和装备显示能力；删除资源前必须提供兼容 fallback 和迁移说明。
- 资源顺序、JSON 空白、文件系统遍历顺序不得改变规范化 hash；内容或解释变化必须改变 hash。

### 2.10 生成与同步边界

涉及 shared/schema 与生成物时，遵守仓库标准动线：

```text
修改 shared 手写真源 / snake schema
-> npm --workspace @game/server run codegen:gameplays
-> 若涉及 feature，再运行 npm --workspace @game/server run codegen:features
-> npm run sync:shared
-> protocol 变更时显式重钉 fingerprint
-> npm run sync:client
-> 类型检查与测试
```

S1 不应为了纯资源目录提前创建 `snakeCosmetic` feature；该 feature 属于 S3。以下路径均禁止手改：

- `../../apps/shared/src/gameplays/generated/`
- `../../apps/server/src/rooms/schema/generated/`
- `../../apps/client/src/gameplay/catalog.generated.ts`
- `../../apps/shared/src/protocol/lobbyRpc/registry.generated.ts`
- `../../apps/client/src/generated/`
- `../../apps/client/src/shared/`
- `../../apps/Cocos/assets/src/`

资源真源位于 Cocos 资源树时，不得由 `sync:client` 反向覆盖；代码真源仍以 `apps/client/src` 为准。

---

## 3. 详细任务

### S1-01 · 建立 16 皮肤完整性矩阵

**动作**

- [ ] 以 §2.1 的 16 个 ID 为唯一集合，逐个定位原作 catalog、atlas JSON、native PNG、body config 和名称。
- [ ] 对照目标资源目录，标明“已存在且已登记、已存在但缺配置、缺 PNG、缺 atlas、缺 body config、缺预览”。
- [ ] 识别逻辑重复/字节重复素材和 source alias，不以相近文件名合并不同 `skinId`。
- [ ] 对无法定位或结构异常的 entry 记录阻塞原因，禁止用 classic 三等分素材临时冒充。

**产物**

- 16 行皮肤完整性矩阵和每个 entry 的精确来源集合。
- 缺口列表、去重/别名决策和转换优先级。

**验证**

- ID 集合与冻结列表严格相等：无缺失、无额外、无重复。
- 每个 entry 至少能定位到纹理、atlas/body 配置或明确阻塞；“文件看起来相似”不算映射证据。
- 已有资源逐个与来源台账和 SHA 对上，不凭文件名认领。

### S1-02 · 闭合来源、授权与 SHA 台账

**动作**

- [ ] 对所有源文件和目标文件复算 SHA-256，并与现有首批 31 项记录比较。
- [ ] 为新增的皮肤 PNG、atlas JSON、body config、预览、食物帧、墙块、背景和音效逐文件新增台账行。
- [ ] 补齐批准来源、日期/负责人、转换步骤、新 `.meta` 状态和合法状态值。
- [ ] 若 hash 不符或授权证据缺失，将 entry 标为 `待授权，不得引入`，移出可发布目录输入。
- [ ] 对已授权缺口执行实际引入：把缺失的皮肤 PNG、atlas JSON 和 body config 复制/转换到明确的手写真源或
  资源真源路径，再由标准生成/同步流程物化目标；禁止沿用原作 UUID、import cache、旧 `.meta` 或运行时绝对路径。

**产物**

- 无缺字段的资源/授权/SHA 台账。
- 源 hash、转换输入 hash、目标输出 hash 和逻辑 catalog entry 的可追踪链。
- 已补齐的 16 套转换输入集合，以及每个新引入文件对应的仓内真源路径。

**验证**

- 自动复算结果与台账一致；同字节去重 entry 的 hash 相等且别名关系有记录。
- 所有进入目标 catalog 的资源状态至少为 `已授权，待转换`，所有目标已引用文件至少为
  `已引入，待验收`。
- 全仓不存在未登记的源 UUID/native hash 文件名，也不存在指向参考目录的软链接或运行时 URL。
- 每个批准补齐项的仓内文件 hash 与来源/转换台账一致；完整性矩阵不再把已引入文件列为缺口。

### S1-03 · 实现确定性 atlas/body 转换器

**动作**

- [ ] 解析原作 atlas JSON、trim/rotate/originalSize/pivot 信息和每套身体配置。
- [ ] 生成规范化 head/body/tail frame、`bodySequence`、帧时间、`bodyDistance`、pivot 和 `visualScale`。
- [ ] 对未知结构 fail-fast，并输出带 `skinId`、源路径和字段位置的稳定错误；禁止猜默认 rect 后继续。
- [ ] 把输入排序、数字格式、JSON key 顺序、换行和输出排序固定；支持只读 `--check` 或等价 freshness 模式。
- [ ] 转换器只读取参考/手写真源并写明确目标，不扫描或改写生成镜像。

**产物**

- 可重复运行的转换器、规范化 catalog 中间格式和 fixture。
- 至少覆盖单帧、多个身体帧、动画头、独立尾部、trim/rotate 和异常 rect 的测试样例。

**验证**

- 同一输入连续生成两次，输出字节和 hash 完全一致。
- 打乱源文件遍历顺序后输出不变。
- 修改一个 rect、body sequence 或源 hash 时 `--check` 失败且诊断指向正确 entry。
- 非 `216×72`、多帧和旋转/trim fixture 均被正确解析；越界和未知结构必须失败。

### S1-04 · 建立 Shared 公共目录

**动作**

- [ ] 在 shared 手写真源中定义稳定 ID、公开/退休状态、`contentVersion` 和客户端/服务端共用校验数据。
- [ ] 保持 shared 零依赖、ES2017、无 Node/DOM/Cocos 全局、无 `const enum`。
- [ ] 为 exact validation、唯一 ID、稳定排序和 catalog hash 建立单测。
- [ ] 明确皮肤目录变更与 gameplay wire/mode version 的关系；仅资源补齐不应无理由升级 wire。

**产物**

- 16-entry 公共目录和规范化 shared hash。
- 可由 server/client 导入的稳定查询 API，不要求调用方遍历数组猜 ID。

**验证**

- shared typecheck 和对应测试通过；目录无第三方/宿主依赖。
- 任意未知 ID exact reject 或进入显式 fallback API，不通过 `%`、下标或字符串解析接受。
- 调整 `sortOrder` 不改变 `skinId`；内容版本/公开状态变化按约定改变 hash。

### S1-05 · 建立服务端业务目录骨架

**动作**

- [ ] 为每个 `skinId` 建立 ownership itemId、碎片 itemId、获取方式、价格、上下架和 `aiEligible` 的明确槽位。
- [ ] 未经 S3 拍板的获取/价格字段使用显式 draft/unavailable，不填伪造值。
- [ ] 固定唯一默认皮肤和非空 AI 池；退休状态不删除历史 entry。
- [ ] 生成或计算服务端 catalog hash，并提供与 shared/客户端身份对比的门禁输入。

**产物**

- 可供 S2 AI 过滤、S3 所有权/装备使用的服务端目录骨架。
- 默认、AI eligibility、退休和经济可写状态的明确查询接口。

**验证**

- 16 个公共 ID 在服务端一一有 entry；无孤儿业务 entry。
- AI 池非空，且每个 eligible entry 都能通过客户端资源/fallback 校验。
- draft 获取字段不能被购买/解锁代码当作有效配置；经济写门禁默认关闭直到 S3 完成。

### S1-06 · 生成客户端皮肤资源目录

**动作**

- [ ] 为每个 `skinId` 关联 preview、texture、head/body/tail frames、body sequence、帧时间、pivot、间距、
  `visualScale` 和 fallback。
- [ ] 使用稳定逻辑资源路径，不把源 native hash 文件名或绝对路径暴露给运行时。
- [ ] 确认全部彩色素材默认白 tint；身份轮廓/箭头/名牌作为独立表现能力登记。
- [ ] 生成客户端 catalog hash 和可控诊断码，供未知 ID、加载失败和非法 rect 回退。

**产物**

- 16-entry 客户端资源目录、纹理/帧映射和 hash。
- 供 S2 renderer 消费的 `skinId -> head/body/tail/animation` 单一解析入口。

**验证**

- 每个 entry 的所有 rect 均在纹理边界内，序列索引合法，帧时间和间距为有限正值。
- 同一 ID 的头、身、尾不能解析到不同皮肤；不再存在 `% 3` 或实体 id 决定材质的目录 API。
- 任意未知/缺失/非法 entry 都确定性回退皮肤 1，并只产生受控诊断。

### S1-07 · 补齐食物、残骸、墙块与背景目录

**动作**

- [ ] 从原作 atlas 确认 Dot `1..7`、Star/主题 Star、加速残骸、AI 死亡残骸和墙块 tile rect。
- [ ] 记录世界显示尺寸 16/42/22/34、稳定 kind/variant 和默认/fallback 帧。
- [ ] 将 S0 的明暗背景、网格、地图外背景、透明度、墙块平铺/线框规则写入 presentation catalog。
- [ ] 按单 atlas/material 批渲染需求组织帧和材质；避免让 S2 只能逐节点加载。

**产物**

- 食物/残骸 frame catalog、主题/边界 catalog 和材质分组计划。
- 七色 Dot 完整性、Star 主题覆盖、墙块拼接和背景精确值的 fixture。

**验证**

- Dot `1..7` 恰好七个稳定变体且全部 rect 合法；Star、两类残骸与墙块 tile rect 均在纹理边界内，且不混用
  kind。
- 默认主题每个逻辑资源都有直接资源或无环 fallback。
- 视觉网格固定 32、边距 16；catalog 不包含把 broadphase 150 当视觉格距的字段。
- 批次分组能覆盖 1030 常驻食物，不要求每个实体独立 Sprite/材质。

### S1-08 · 建立音效与视觉效果登记

**动作**

- [ ] 为吃食物、吃残骸、击杀、死亡、个人结果和按钮登记稳定逻辑名、资源、hash、授权、音量/并发策略。
- [ ] 登记加速拖尾、保护、死亡爆散和复活视觉资源；缺失项显式标为后续或 fallback。
- [ ] 将 `time_over` 标为历史/未使用资源，禁止映射到目标 Endless 生命周期。
- [ ] 保持 View/Logic 边界和 `sfxOn` 语义，不把播放状态写进素材 catalog。

**产物**

- 音效/FX presentation catalog 和缺失/fallback 表。
- S2/S5 可用于播放映射、资源加载和 `totalTime=0` 禁播的测试向量。

**验证**

- 所有目标逻辑事件最多有一个默认音效映射；缺失不会导致战斗初始化失败。
- `time_over` 在目标事件映射中不可达。
- 所有已引用音频/FX 资源均存在、hash 匹配且有授权状态。

### S1-09 · 生成 16 套预览并完成内容审阅

**动作**

- [ ] 用规范化 catalog 生成统一背景、统一方向、统一长度/缩放和统一光照规则下的 16 套预览。
- [ ] 同时输出头部动画、身体序列、尾部、pivot 和间距的检查图/contact sheet。
- [ ] 由美术/产品按实际视觉质量标注 displayName、稀有度候选和获取方式候选，不按 ID 猜测。
- [ ] 缺帧、错序、白边、trim、pivot、缩放或 fallback 问题回到转换真源修复，不手改预览结果。

**产物**

- 16 套预览、统一 contact sheet 和审阅问题单。
- S3 分配“默认 1 / 等级 3 / 金币 4 / 成就 4 / 碎片或活动 4”的视觉输入；配额仍由 S3 最终拍板。

**验证**

- 16 个冻结 ID 各有且只有一套可识别预览；预览使用的 hash 与目录 hash 一致。
- 每套预览能确认头、身、尾来自同一 `skinId`，动画/序列没有越界或错位。
- 修复后从真源重生预览能复现结果，不存在仅修改导出 PNG 的漂移。

### S1-10 · 建立全目录校验与 hash 门禁

**动作**

- [ ] 校验 ID 唯一、唯一默认皮肤、AI 池非空、资源存在、rect/索引合法、fallback 无环且目标完整。
- [ ] 校验 shared/server/client 的 entry 集合、内容版本和公共身份一致。
- [ ] 计算稳定 hash；对 JSON 空白、key 顺序和文件遍历顺序做规范化。
- [ ] 增加 hash mismatch 策略测试：外观目录相关经济写 fail-closed，战斗确定性回退皮肤 1；金币复活由
  独立 room config/policy/receipt 守门，不错误耦合 cosmetic catalog。
- [ ] 将校验器接入适当的测试/verify 链；命令名称以实际实现为准并回写证据表。

**产物**

- 全目录 validator、freshness/hash 检查和正反 fixture。
- 可由 S2/S3 直接复用的 catalog compatibility gate。

**验证**

- 正常 16-entry 目录全绿；重复 ID、第二默认、空 AI 池、缺资源、越界 rect、fallback 环、孤儿 entry
  和跨层 hash mismatch 分别稳定失败。
- 相同语义的不同输入顺序得到相同 hash；内容变化得到不同 hash。
- hash mismatch 时测试证明外观目录相关经济写不会进入，战斗仍只回退默认且留下诊断。

### S1-11 · 执行同步、无头验证与阶段交接

**动作**

- [ ] 只修改手写真源；按实际改动运行必要的 gameplay codegen、shared sync、protocol fingerprint 和 client sync。
- [ ] 运行转换器 freshness、catalog validator、资源 hash、inventory、sync、类型检查和客户端测试。
- [ ] 核对生成 diff 只包含预期产物，未手改受保护镜像，未混入未授权或未登记文件。
- [ ] 在证据表登记实际命令、commit、预览/contact sheet、hash 和尚待 Creator 验收项。
- [ ] 将 catalog API、hash、fallback、材质分组和未解决 Creator 风险交接给 S2/S3/S5。

**产物**

- 可消费且 freshness 通过的 S1 catalog/asset bundle。
- 完整交接说明和真实验证输出。

**验证**

- 至少根据实际改动运行并记录：`npm run sync:shared`、`npm run sync:client`、`npm run typecheck`、
  `npm run test:client`、`npm run verify:sync`、`npm run verify:inventory`；不适用项写明理由，不能伪造通过。
- 若修改 gameplay schema，额外运行并记录
  `npm --workspace @game/server run codegen:gameplays` 及相关服务端测试。
- 若修改 protocol，显式运行 fingerprint 写入/检查动线；不得隐式重钉。
- 对同一输入从零重生资源目录，输出和 catalog hash 与提交内容一致。

---

## 4. 退出条件

以下条件必须全部满足，S1 才能标记为 `[已完成]`：

- [ ] 16 个冻结 internal skin ID 均有完整来源映射、PNG、atlas/body config、规范化 entry 和预览。
- [ ] 所有资源逐文件具备源路径、逻辑名、SHA-256、授权、目标路径、转换、`.meta` 状态和合法状态值。
- [ ] 转换器能处理实际多帧/动画/trim/rotate/body sequence，并对未知结构 fail-fast。
- [ ] 转换器和规范化目录在重复运行、乱序输入下仍字节确定。
- [ ] Shared、服务端和客户端三层目录的 ID/版本/公共身份一致，且 ownership 与资源所有权边界明确。
- [ ] 唯一默认皮肤存在且完整，AI 池非空，未知/缺失/非法资源稳定回退皮肤 1。
- [ ] 所有 rect、pivot、序列、帧时间、body distance、资源存在性和 fallback 链校验通过。
- [ ] Dot `1..7`、Star、两类残骸、墙块、背景/网格主题和目标音效/FX 均进入 presentation catalog。
- [ ] `time_over` 不可从目标 `totalTime=0` 事件映射触发。
- [ ] 服务端/客户端 catalog hash mismatch 时外观目录相关经济写 fail-closed、战斗 fallback 的测试通过。
- [ ] 16 套统一预览/contact sheet 完成，稀有度/获取方式没有按 ID 猜测。
- [ ] 所有 codegen/sync/typecheck/test/verify 按实际改动运行并留存原始输出；生成 diff 已审阅。
- [ ] Creator 尚未执行的资源/UUID/pivot/混合确认明确留给 S5，不能登记为已通过。

---

## 5. 风险与回退

| 风险 | 影响 | 预防/回退 |
|---|---|---|
| 假设所有 atlas 都是 `216×72` 三等分 | 动画头、多身体帧或尾部错切 | 转换器解析 atlas/body config；遇未知结构 fail-fast，回退到该 entry 未就绪而不是猜 rect |
| 手抄大量 rect | 易漂移、无法 freshness 校验 | 所有 rect 由确定性转换器生成；发现手改时丢弃输出并从真源重生 |
| 根据文件名或 ID 合并素材 | 皮肤身份错配、历史所有权不可迁移 | 只按源 catalog 和 SHA 证据映射；字节去重仍保留逻辑别名 |
| 缺授权资源进入发布目录 | 发布风险或后续返工 | `待授权，不得引入` fail-closed；使用已批准 fallback，不用“同机可见”补证 |
| 复制旧 `.meta`/UUID/import cache | Cocos 资源冲突或跨工程幽灵引用 | 只复制/转换源字节，新建目标 `.meta`；S5 用 Creator 重导入确认 |
| 资源和 catalog hash 漂移 | 白图、错皮肤、外观资产争议 | 规范化 hash 与 freshness 门禁；外观目录相关经济禁写，战斗回退皮肤 1 |
| fallback 缺失或成环 | 加载失败递归、无法开局 | validator 强制默认唯一、fallback 有界无环且目标完整 |
| AI 皮肤池为空或消费玩法 RNG | AI 无法生成，新增皮肤改变对局轨迹 | 非空门禁；S2 使用独立 `snake.ai.skin` RNG，目录仅提供候选 |
| 真人/AI tint 改写原皮颜色 | 与 golden 不一致且身份提示依赖颜色 | catalog 默认白 tint；身份提示作为独立轮廓/箭头/名牌资源 |
| 每个食物独立 Sprite/material | 1030 食物导致节点和 draw call 失控 | S1 按 atlas/material 批次组织；不满足批渲染的目录不得交给 S2 |
| 把 `time_over` 音效接入 Endless | 暗示不存在的限时终局 | 明确标为历史/未使用；事件映射测试不可达 |
| 提前写死价格/稀有度 | S3 被未经评审的内容决策绑架 | S1 使用 draft/unavailable；预览审阅后由 S3 拍板 |
| 手改 generated 或同步镜像 | 后续 codegen/sync 覆盖、真源漂移 | 只改手写真源；发现镜像单独 diff 时回退该 diff 并从标准动线重生 |

---

## 6. 证据回写

状态只允许：`[已拍板·待实施]`、`[进行中]`、`[已完成]`、`[阻塞·需 Creator]`、`[有意不做]`。

| 任务 | 状态 | commit | 自动验证/命令 | catalog、hash、预览或授权证据 | 备注 |
|---|---|---|---|---|---|
| S1-01 | [已拍板·待实施] | — | — | — | — |
| S1-02 | [已拍板·待实施] | — | — | — | — |
| S1-03 | [已拍板·待实施] | — | — | — | — |
| S1-04 | [已拍板·待实施] | — | — | — | — |
| S1-05 | [已拍板·待实施] | — | — | — | — |
| S1-06 | [已拍板·待实施] | — | — | — | — |
| S1-07 | [已拍板·待实施] | — | — | — | — |
| S1-08 | [已拍板·待实施] | — | — | — | — |
| S1-09 | [已拍板·待实施] | — | — | — | — |
| S1-10 | [已拍板·待实施] | — | — | — | — |
| S1-11 | [已拍板·待实施] | — | — | — | — |

阶段汇总：

| 阶段 | 状态 | commit | 自动验证 | Creator/视觉证据 | 备注 |
|---|---|---|---|---|---|
| S1 | [已拍板·待实施] | — | — | — | — |

---

> [返回专项总目录](README.md) · [上一阶段：S0 复刻基线](s0-replication-baseline.md) ·
> [下一阶段：S2 战场与无尽生命周期](s2-battle-and-endless-lifecycle.md)
