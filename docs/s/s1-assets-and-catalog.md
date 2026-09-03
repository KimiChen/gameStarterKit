# S1 · 素材、皮肤目录与确定性转换

> [返回专项总目录](README.md) · [上一阶段：S0 复刻基线](s0-replication-baseline.md) ·
> [下一阶段：S2 战场与无尽生命周期](s2-battle-and-endless-lifecycle.md)

> **状态：`[已完成]`（S1-01～S1-11 于 2026-09-03 完成；S1-12 磁铁表现资产、目录与 hash 已在
> `bc5bb97` 完成无头闭环，Creator 3.8.8 终验仍按约定留给 S5）**<br>
> **预计：4–7 人日；其中 S1-01～S1-11 原估 3–5 人日，S1-12 追加 1–2 人日；历史完成记录不冒充工时实绩**<br>
> **依赖：S0 已完成并产出可重复核验的 [evidence bundle](evidence/s0/README.md)，已冻结来源归档、场景表现基线、
> 目标配置和规则差异。**<br>
> **主要输入：** S0 evidence bundle、原作 internal skins/atlas/body config、`tools/10001` 磁铁帧、
> `SnakeMagnet` 持续效果依赖、`eat_tool` 音频、现有
> `apps/Cocos/assets/resources/snakeoff/` 首批资源、来源与授权台账。<br>
> **主要输出：** 16 套稳定皮肤的分层 catalog、标准化 atlas rect/body config、预览、七色 Dot/Star/
> 磁铁/残骸/墙块/背景/音效表现目录、确定性转换与校验器、公共/业务/表现 hash、资源与授权 SHA 台账。<br>
> **阶段纪律：** 只改手写真源并通过既有 codegen/sync 动线产生镜像；不得手改 generated registry、
> `apps/client/src/shared/` 或 `apps/Cocos/assets/src/`。Creator 最终导入验收在 S5 收口，S1 仍须完成
> 无头可验证的资源、rect、fallback 和 hash 门禁。

既有实现基线：S1-01～S1-11 已在 commit `d18846a` 闭合；冻结来源 commit
`6367f65bf210d75ba39c0e48ecace5b30b538a06` 的 68 个实际读取文件已形成仓内可重放输入，16 套皮肤、
27 个实际表现资源、78 行资源/转换/预览台账和 16 张预览均已闭合。以下是 **S1-12 扩展前历史基线**，
不得当作重开后的最终 hash：

- `publicCatalogHash=a1cdecbc5e31db3f90ac2fd15465768ef9206b2520000d4ab9f88d6c2135b075`；S1-12 完成后必须保持不变。
- `serverBusinessHash=9ed3762e5f5d24d168aafd14fcaccac1d4de83413d0acb17f6308cea1ccbfa19`；S1-12 完成后必须保持不变。
- `clientPresentationHash=62e1a6683a71db3ef0724cd6030114b7d9a64845723b14fa8c7c6d58a9302efe`；仅为扩展前值，
  S1-12 完成时必须按新目录重算并回写真实值，禁止预填。

S1-12 已在 `bc5bb97` 把来源清单扩为 77 个实际读取文件，交付 7 个磁铁复制资源与 1 个生成 recipe，显式升级
`presentationVersion=2`，并生成
`clientPresentationHash=8615596acd12651307cc885bdc606517f6094bba47e729fb8cb59203c93ed629`。公共与服务端业务 hash
保持上述历史值不变。完整无头结果及扩展前 commit/hash 说明见更新后的
[S1 evidence bundle](evidence/s1/README.md)。

---

## 1. 目标与阶段边界

S1 的目标是把“散落的 PNG 和原作 atlas 信息”变成稳定、可生成、可校验、可由服务端和客户端共同识别的
内容目录。S2 只能从该目录渲染战场，S3 只能从该目录建立所有权和装备；任何一侧都不得再次解析文件名、
依赖数组下标或自行猜 rect。

本阶段必须完成：

- 补齐 16 个 internal skin 稳定内容 ID 对应的 PNG、atlas JSON、身体配置和预览。
- 解析原作 atlas/body config，确定性生成 normal/boost 的 head/body/可选 tail、动画和身体序列。
- 建立 shared 公共、服务端业务、客户端资源三层目录，并分别生成稳定 hash。
- 补齐七色 Dot、Star、磁铁场内帧/被动状态图标/持续效果、加速残骸、AI 死亡残骸、墙块、背景/网格主题和
  已批准音效的表现登记。
- 建立 ID、默认皮肤、AI 池、资源、rect、fallback、hash 和确定性生成门禁。
- 逐文件维护来源绝对路径、逻辑名、SHA-256、授权、目标路径、转换和 `.meta` 状态。

### 1.1 非目标

- 不在 S1 实现 1030 食物批渲染、Star 移动、相机、皮肤 mesh 或 AI 分配；这些属于 S2。
- 不在 S1 实现磁铁生成、移动、拾取判定、8 秒权威效果、AI 生效、复活/重连恢复或 wire；这些属于 S2。
  S1 只交付可由 S2 直接消费且完整受 hash/来源门禁保护的磁铁表现资产与目录。
- 不在 S1 实现 Bag/User 所有权、解锁、购买、装备或衣柜 RPC；这些属于 S3。
- 不在 S1 拍板最终展示名、稀有度、价格或获取方式；S1 只生成预览和技术审阅输入，最终内容审阅是
  S1 完成后、S3-01 开始前的进入门，不阻塞 S1 或 S2/S2R。
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

`skinId` 是跨 shared、server、client、持久化和快照的稳定内容 ID。首发初始矩阵固定如下，S1/S2/S3
不得重新分配：

| 字段 | 冻结值 |
|---|---|
| `publicationState` / 公共目录成员 | 16 套全部为 `active` 并进入公共目录；进入公共目录不表示已可购买或解锁 |
| `playerUsable` | 16 套全部 `true` |
| `defaultSkinId` | 唯一为 `1` |
| `sortOrder` | 按 §2.1 数字 ID 升序排列 |
| `contentVersion` | 16 套初始均为 `1` |
| `fallbackSkinId` | 皮肤 1 为 `null` 终点；其余 15 套全部直接指向 `1` |

原作 Feed V2 的 `ai_flag=1` 列表和 `SkinStore.canAiUse` 映射共同冻结 AI 池：

```text
101, 111, 112, 132, 133, 139, 401, 403, 411, 701
```

来源证据分别位于固定归档
`subpackages/loading/bundle/_r/store/FeedGameStore.js:68` 和
`subpackages/loading/bundle/_r/store/SkinStore.js:79`，实现和测试不得改用“全部皮肤”或按 ID 推断。

其余 `1, 2, 3, 4, 10, 11` 固定 `aiEligible=false`；16 套仍全部可由玩家使用。随后遵守：

- 不依赖目录顺序、文件名补零、数组下标、`joinOrdinal` 或 `% 3`。
- 目录排序只由 `sortOrder` 决定；修改排序不改变所有权和装备身份。
- 皮肤 1 是统一运行时 fallback；S1 校验它资源完整且可由真人/AI 安全显示。
- `playerUsable` 和 `aiEligible` 必须逐项生成上述显式值，不能根据 ID 大小推断。
- 增删或改变内容解释必须提升相应 `contentVersion` 并更新 `publicCatalogHash`。

来源 `remoteBundles/internalSkins/config.json` 已确认恰好覆盖这 16 个 ID，每个 ID 都能定位 Texture2D、
SpriteAtlas、body config 和 native PNG；因此 S1 开工前没有素材缺口决策。以下保留为 **S1 开工前差距快照**：
当时目标资源已引入 `1, 2, 4, 10, 11, 133, 139, 401, 701`，尚待补齐
`3, 101, 111, 112, 132, 403, 411`；这些缺口后来已由 S1-01～S1-11 在 `d18846a` 闭合并逐项复算 SHA、接线
atlas/body config，不是当前待办。以 [当前资源目录](../../apps/Cocos/assets/resources/snakeoff/) 和
[来源台账](../snakeoff/08-source-and-asset-provenance.md#7-直接素材复用登记模板) 为审计起点，不以现有文件名推断
完成率：现有 `snake_skin_classic_1/2/3` 是 legacy/history 资源，不映射 internal skin 1/2/3；
`snake_skin_ai.png` 对应稳定 ID 701，文件名不赋予它 AI-only 语义。

### 2.2 三层 catalog 最小定义

禁止用一个 `SnakeSkinDefinition` 混装公共身份、服务端业务与客户端资源。S1 分别建立以下三类数据；符号名可按
现有目录约定落位，但字段归属、可空性和枚举语义不得改变：

```ts
interface PublicSkinIdentity {
  skinId: number;
  contentVersion: number;
  publicationState: "active" | "retired";
  isDefault: boolean;
  sortOrder: number;
  playerUsable: boolean;
  technicalLabel: string;
}

type DisplayNameValue = {
  state: "source" | "technical-draft" | "approved";
  value: string;
};

type DecisionValue<T> =
  | { state: "draft" | "unavailable"; value: null }
  | { state: "approved"; value: T };

interface ServerSkinBusinessDraft {
  skinId: number;
  aiEligible: boolean;
  displayName: DisplayNameValue;
  rarity: DecisionValue<string>;
  ownershipItemId: DecisionValue<number>;
  fragmentItemId: DecisionValue<number>;
  acquisition: DecisionValue<string>;
  saleState: DecisionValue<"on-sale" | "off-sale">;
  price: DecisionValue<number>;
}

interface TimedFrameDefinition extends FrameDefinition {
  durationFrames: number;
}

interface SkinPartTrack {
  level: number;
  sourceDistance: number;
  frames: readonly TimedFrameDefinition[];
}

interface SkinMotionPresentation {
  head: SkinPartTrack;
  body: readonly SkinPartTrack[];
  tail: SkinPartTrack | null;
  bodySequence: readonly number[];
  sourceBodyOffset: number;
}

interface ClientSkinPresentation {
  skinId: number;
  previewAsset: string;
  textureAsset: string;
  normal: SkinMotionPresentation;
  boost: SkinMotionPresentation;
  boostSource: "source" | "inherit-normal";
  bodyRenderWidthRate: number;
  bodyRenderType: 2;
  headAnchorY: number;
  visualScale: number;
  fallbackSkinId: number | null;
}

interface SkinLayoutMetrics {
  firstBodyPointDistance: number;
  repeatedBodyPointDistance: number;
  tailPointDistance: number | null;
}

declare function deriveSkinLayoutMetrics(
  presentation: ClientSkinPresentation,
  bodyScale: number,
  pointDistance: number,
): SkinLayoutMetrics;
```

客户端表现目录顶层必须新增显式 `presentationVersion`，并生成同值常量 `SNAKE_PRESENTATION_VERSION`。
S1-01～S1-11 已闭合、尚未携带该字段的历史 envelope 只在迁移解释中视为隐式版本 `1`；S1-12 在加入磁铁
世界帧、被动状态图标、持续效果与拾取音频后直接生成显式版本 `2`，不回写旧证据冒充当时已有字段。该版本
描述整个客户端表现 envelope，不属于任一皮肤，也不得借此提升 16 套皮肤的 `contentVersion`。

`FrameDefinition` 必须能无歧义表达纹理内 rect、pivot/anchor、trim、原始尺寸、旋转标志和源帧名。
`durationFrames = max(1, source.frame_time)`，单位是原作渲染帧保持次数，不得改名或解释成毫秒；源原始值仍写入
转换证据。`sourceDistance` 和 `sourceBodyOffset` 保留源文件允许的负数位移，只校验为有限数，不能把源负 offset
直接当正间距。`deriveSkinLayoutMetrics` 复刻原作 `GameUtil.calSkinSizeInfo` 的对应分支，根据帧尺寸、身体基础宽度
36、`bodyRenderWidthRate`、运行时 `bodyScale` 与正 `pointDistance` 推导三个有限正路径点距离；
与原作一致，几何只读取 normal 的 head/body/tail 和 `body_distance`，boost 只切换纹理而不重排路径点，尾部不存在时
返回 `null`。`body_speed_distance` 仍作为来源字段保存在 boost profile 与转换证据中，但首发不参与布局计算。
首发 16 套 `body_render_type` 均固定为 `2`（NormalRepeat）；该布局分支不消费 `headAnchorY`，字段只用于头部绘制
锚点，读取 `head_anchor_y_pos`，源缺失时按原作 Loader 固定为 `0.5`。其他 render type 在本阶段 fail-fast，
不得套用 NormalRepeat 公式。具体类型仍须遵守 shared ES2017、零依赖和 exact validation 约束。帧归一证据位于
`subpackages/loading/bundle/_r/loader/Loader.js:190`，布局证据位于
`subpackages/loading/bundle/_r/game/util/GameUtil.js:23-28`；均以 S0 固定来源 commit 中的内容为准。

冻结渲染解释：

- 同一个 `skinId` 同时决定 normal/boost 的头、身体、可选尾部和动画；不能按实体 id 再选择身体材质。
- 身体帧次序由各 motion 的 `bodySequence`、`level` 和 `sourceDistance` 决定；不能默认单帧或简单循环所有 rect。
- 源缺少 boost 组时必须写 `boostSource="inherit-normal"` 并完整继承 normal，不能生成空动画或猜帧。
- `sourceBodyOffset`、布局推导、逐帧 pivot 和 `visualScale` 属于表现目录；玩法碰撞和全局身体缩放仍由
  shared/server 权威规则决定。
- 原作彩色素材默认使用白色 tint；真人/AI/席位身份不得通过改皮肤原色表达。
- 未知 ID、资源加载失败或 rect 非法统一回退皮肤 1，并产生受控诊断。

### 2.3 三层所有权边界

| 层 | 允许内容 | 禁止内容 |
|---|---|---|
| Shared 公共目录 | 稳定 `skinId`、active/retired 状态、`contentVersion`、排序、玩家可用性、技术标签、`publicCatalogHash` | Cocos/DOM/Node API、纹理对象、商城价格、数据库访问 |
| 服务端业务目录 | ownership/fragment itemId、展示名状态、稀有度、获取方式、价格、上下架、`aiEligible`、`serverBusinessHash` | 客户端资源加载、SpriteFrame/Texture2D、相信客户端自报拥有 |
| 客户端资源目录 | 顶层 `presentationVersion`，预览/纹理逻辑路径，normal/boost 的 head/body/tail、rect、pivot、帧保持次数、身体序列/位移/间距、磁铁表现、fallback、`clientPresentationHash` | 永久所有权真相、扣费结果、玩法属性与磁铁权威规则 |

S1 建立三层可关联的内容身份和校验。每套 `technicalLabel` 均固定为 `皮肤 <ID>`；没有可核验源名称时，
`displayName` 使用该技术标签但不得把它当成获批玩家展示名；已能核验的源名称标为 `source`。S1 中
`displayName.state` 只能是 `source` 或
`technical-draft`，其他业务决策字段必须是 `{ state: "draft" | "unavailable", value: null }`；禁止用空串、0、
哨兵 itemId 或默认枚举冒充最终值。S3 才根据内容审阅结果写入最终名称、所有权、价格、碎片和上下架业务值。

### 2.4 皮肤素材转换规则

- 字段映射固定为：`head_frame/body_frame/tail_frame/body_distance` 进入 normal，
  `head_speed_frame/body_speed_frame/tail_speed_frame/body_speed_distance` 进入 boost；每个 part 的 `level`、
  `distance` 和 frame 原序保留。
- 读取每套皮肤的原作 atlas JSON 与身体配置，分别转换 normal/boost 的 head/body/可选 tail、身体序列、
  `level`、有符号 `distance` 和逐帧 `durationFrames`。
- 对 source rect 的 x/y/width/height、旋转、trim、原始尺寸和 pivot 做显式转换；不能只读取 PNG 尺寸。
- 原作可能存在多身体帧、动画头、独立尾部和不同身体位移；转换器必须逐结构支持或明确 fail-fast。
- 首发已知结构必须成为回归 fixture：403 有独立 tail；其他 15 套 tail 为 `null`，不得伪造尾帧；411 的 boost
  head 为 12 帧；701 的 normal/boost head 分别为 2/7 帧；3、4 缺 boost 组时显式继承 normal。
- `frame_time=0` 按原作 Loader 归一为 1 帧；大于 0 的值原样保留为帧保持次数，不在 S1 换算毫秒。
- 转换结果排序和序列化必须稳定，不依赖文件系统遍历顺序或对象属性偶然顺序。
- 可在运行时由 Texture2D + rect 构建 SpriteFrame，减少手工切片 `.meta`；仍需在 S5 用 Creator 3.8.8
  确认资源、UUID、pivot、动画、混合和层级。
- 源 PNG 可原样复制或按已登记步骤转换，但不能复制旧项目 `.meta`、import cache 或 UUID。
- 同字节素材可去重，但必须在台账中说明逻辑别名、唯一物理目标和相同 SHA，而不是静默丢行。

### 2.5 食物、磁铁、残骸与地图表现目录

S1 只定义资源帧、尺寸和主题；数量、移动及权威分值由 S2 实现。

| 类型 | 目标帧/变体 | 世界显示尺寸 | 目录要求 |
|---|---|---:|---|
| Dot | 普通食物 `1..7` | 16 | 七帧均存在、rect 合法、逻辑 ID 稳定；同种子/实体 id 可由 S2 决定性选取 |
| Star | `star` 及所选主题变体 | 42 | 明确默认帧、主题覆盖和 fallback |
| 磁铁 | `tools` atlas 的 `10001` | 70 | 世界 kind 固定为 `magnet`；被动状态 icon 只做同帧逻辑别名，不复制纹理字节 |
| 加速残骸 | 原作对应素材/帧 | 22 | 与 Dot、AI 死亡残骸使用不同稳定 kind |
| AI 死亡残骸 | 原作对应素材/帧 | 34 | 支持必要 `variant` 或 `sourceSkinId` 表现；真人死亡不使用该目录生成计分残骸 |
| 墙块/边界 | 已批准 wall block 或主题线框 | 由主题拼接规则决定 | 记录平铺/拼接、边界方向、默认主题和 fallback |
| 背景/网格 | S0 提取的明暗主题精确值 | 网格 32、边距 16 世界单位 | 颜色、透明度、地图外背景进入 presentation catalog，不留在 View 魔法数 |

1030 个常驻食物在 S2 必须由同一 atlas/material 的批量 mesh 渲染，不能建立 1030 个 Sprite 节点或 draw call。
因此 S1 的 atlas 分组、材质兼容性和 frame 数据必须支持批渲染，而不是只适合逐节点 SpriteFrame。

#### 2.5.1 磁铁表现目录与已核验来源

磁铁的表现身份固定如下；S2 只能按这些逻辑名取资源，不能再次解析原作文件名或把磁铁做成主动道具按钮：

```ts
interface MagnetPresentation {
  kind: "magnet";
  sourceToolId: 10001;
  world: {
    logicalName: "magnet";
    textureAsset: "snakeoff/snake_magnet_tools";
    frame: FrameDefinition;
    displaySize: 70;
  };
  statusIcon: {
    logicalName: "magnet-status-icon";
    logicalAliasOf: "magnet";
    role: "passive-indicator";
    interactive: false;
  };
  activeEffect: {
    event: "magnet-active";
    policy: "resource";
    recipeAsset: "snakeoff/snake_magnet_aura";
    fallback: {
      logicalName: "magnet-status-icon";
      placement: "over-head";
    };
  };
}
```

- 世界帧的稳定逻辑名为 `magnet`，源 `toolId=10001`，取 `tools` atlas 的 `10001`；规范化 rect 精确为
  `[x=346, y=256, width=84, height=92]`，世界显示尺寸固定为 `70`，运行时纹理路径固定为
  `snakeoff/snake_magnet_tools`。
- `magnet-status-icon` 与世界 `magnet` 必须指向同一 texture、同一 frame 定义，台账登记
  `logicalAliasOf="magnet"`；不得裁出或复制第二份 PNG。它只显示 8 秒被动效果剩余状态，不可点击、不占中央四槽，
  也不改变“首发主动操作只开放加速”的口径。
- `magnet-active` 是蛇头随附的磁力 aura，与状态 icon 分开登记。转换器从原作 `prefab/SnakeMagnet` 提取层级、
  混合、动画和五个纹理依赖，输出仓内规范化 recipe；客户端表现目录以稳定
  `recipeAsset="snakeoff/snake_magnet_aura"` 引用其生成后的 Cocos JsonAsset，Cocos 3.8.8 据此重建，
  禁止复制 Cocos 2 prefab、
  UUID、`.meta` 或 import cache。五个源逻辑纹理固定为 `x_lighting01`、`x_lighting02`、`x_lighting03`、
  `xt_s_lighting`、`xt_s_lighting02`，不得借用 boost/protection 表现冒充。
- world item、status icon 与 aura 分别登记批次/material 归属；共享 frame 只表示共享纹理字节，不表示 UI 与世界
  必须合并 draw call。构建期缺 frame、越界 rect、别名分叉或 aura 依赖不全一律 fail-fast；仅运行时部署损坏时，
  aura 可退为头顶 `magnet-status-icon`，世界拾取物缺失则拒绝进入目标战斗，禁止生成不可见磁铁。

以下路径均相对 S0 冻结来源归档 `/Users/kimi/work/tanchishe/wegameVersion/`；SHA-256 已只读核验，S1-12 实施时
仍须由工具复算并写入 manifest/provenance，不能把本表当成生成证据：

| 用途/源逻辑名 | 冻结来源路径 | SHA-256 |
|---|---|---|
| `tools` atlas texture；`magnet` 与 `magnet-status-icon` 共用 | `remoteBundles/atlas/native/14/1473c6a2-0588-411d-b295-2b7517dc029b.png` | `e954359e45836981a574101f7397906da997d07c52498e682b4a1c98b1ee4090` |
| `tools` atlas pack；规范化时只提取 `10001` | `remoteBundles/atlas/import/06/069cb84df.json` | `9d1e12c5d141653450b0af0ff7d3be572a2b92e78674d2e02fa0f1f03e2e3748` |
| `SnakeMagnet` prefab pack；仅作 recipe/依赖来源 | `remoteBundles/game/import/03/0365be86c.json` | `9daafc4c3ce38d76427c02ed40b82c2aa15ce3463fdf832ccd06b802fd4b536f` |
| `x_lighting01` | `remoteBundles/game/native/ca/cae4c893-2179-4fca-9b76-44472a335923.png` | `f86fb2768cc1c9228ca99d7588c01f37c86e1a088e306076bbde05d94c35aa5b` |
| `x_lighting02` | `remoteBundles/game/native/f1/f1b42444-7757-4bdb-b713-c4606298d4f0.png` | `8bf1c195d4dfc2bf7ad8db4740a0faaa1743d092ac715f9e562a0bccee2c3194` |
| `x_lighting03` | `remoteBundles/game/native/3a/3a12368b-8ef7-4bf6-91a9-191ef071ec99.png` | `15331a741d25de8e08ed903f9c88cab46ebad60bc57c40005fc96f839dd5b45d` |
| `xt_s_lighting` | `remoteBundles/game/native/ae/ae0301dd-05fa-45c7-90f5-bb39e23422ca.png` | `11b9fdc1983d39bb1a578ded1fa7e4962fae95da44895f40b819f507c1a5425c` |
| `xt_s_lighting02` | `remoteBundles/game/native/4e/4e216bd4-1dae-4211-bd44-976710bd9889.png` | `4e77f9fbd45a66be64f8cd4311e4e761ffdb91e76580e4e8334d582dd7eaebc0` |
| `eat_tool`；目标事件 `collect-magnet` | `remoteBundles/audio/native/dc/dc5e02f9-c04f-4bc5-b6e8-3f9016ea8e94.mp3` | `7ca26a88922302ec4492ed31117f57410268109d47645b689318e6138bb5c113` |

### 2.6 AI 皮肤所需目录能力

AI 候选集合必须严格等于 §2.1 冻结的 10 个 ID；“非空”只是最低结构校验，不能用来接受多余或缺失 ID。
S2 的 AI 规则要求目录支持：

1. 过滤 `aiEligible=true`，结果与冻结 10-ID 集合严格相等。
2. 排除本房真人已装备的皮肤。
3. 用独立 `snake.ai.skin` seeded RNG 洗牌并轮换，池不足时循环。
4. AI 重生时保持当前房间生命周期内的 `skinId`。
5. 皮肤随机流不消费移动、出生、食物或碰撞随机流。

排除真人外观后的候选不足时只循环剩余候选；若未来规则变化导致过滤后为空，则退回完整的冻结 10-ID 池，
不得临时启用 6 个 `aiEligible=false` 的 ID。S1 必须保证 10 个 AI entry 全部可解析到完整纹理/帧/fallback。
身份表现随 S1-12 一并收敛：自机只使用不改皮肤原色的细白轮廓，不显示额外箭头；AI 只使用文字名字，不使用
头像、箭头或轮廓。其他真人可保留文字名字，但不得套用自机轮廓。该选择是客户端本机身份投影，不进入公共皮肤
身份、服务端业务目录或 wire。`fake_snake_count=86` 不需要世界皮肤实体，不得被 catalog 生成器误算为 86 条活动 AI。

### 2.7 音效与其他表现

presentation catalog 至少登记：

- 吃普通食物。
- 吃残骸。
- 拾取磁铁：稳定事件名 `collect-magnet`，独立使用来源 `eat_tool`，不能借用吃食物或吃残骸音效。
- 磁铁持续期间：显式 `none/silent`，不播放循环音；视觉剩余状态由被动 icon/aura 表达。
- 击杀。
- 真人死亡。
- 个人 run 结果：固定登记为显式 `none/silent`，不加载或播放资源。
- 按钮点击。
- 基础加速、出生/复活保护、死亡爆散等战斗表现资源（若首批存在）；不创建可收藏的 trail/deathFx/killFx 槽位内容。

实际映射资源的音效必须有稳定逻辑名、资源路径、hash、授权和 fallback/缺失策略，并遵守现有 `sfxOn`；
`none/silent` 项只登记稳定逻辑名、状态和原因，不能伪造资源路径/hash。限时时间结束音效即使已在资源目录，
也不得进入 `totalTime=0` 的目标播放映射，更不得被个人结果复用；可以保留为来源/历史资产，但必须标为未使用。
若后续为“退出”定义独立逻辑事件，必须另有明确资源或 `none` 记录，不能自动继承个人结果、真人死亡或
`time_over` 的映射。`collect-magnet` 固定受 `sfxOn` 控制，并复用现有音效系统的有界单实例/并发策略，
防止重复 push 造成爆音；该策略只影响本地播放，不影响权威拾取结果。

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

现有用户会话与台账已由项目及源游戏权利方批准复用
`/Users/kimi/work/tanchishe/wegameVersion/` 冻结来源归档中的素材；对该归档内的 16 套皮肤、atlas/body config、
食物、磁铁 `tools/10001`、`SnakeMagnet` aura 纹理、墙块、背景、音频和必要转换产物无需逐项再次请求产品授权，
但仍必须逐文件登记来源、SHA、转换和目标。
只有新增冻结归档外来源时才进入 `待授权，不得引入` 并重新请求授权。

### 2.9 hash、fallback 与发布门禁

- `publicCatalogHash` 只覆盖规范化公共身份，在 shared、server、client 三层生成相同值；下游文档和接口简称
  `catalogHash` 时均指该值。跨端兼容及外观经济写门禁只比较这一同构 hash，不能直接比较异构目录全集。
- `serverBusinessHash` 覆盖服务端业务目录，`clientPresentationHash` 覆盖客户端表现目录；二者分别用于本层
  freshness/审计，天然不要求相等。皮肤公共身份或某个皮肤资源解释变化时才提升该皮肤 `contentVersion`，并使
  `publicCatalogHash` 随之变化；磁铁、地图、音效等非皮肤表现变化只提升顶层 `presentationVersion` 并改变
  `clientPresentationHash`。
- S1-12 的变更边界固定为隐式 `presentationVersion: 1` 迁移到显式 `2`，生成
  `SNAKE_PRESENTATION_VERSION=2`；现有 hash 常量中只允许 `CLIENT_SNAKE_PRESENTATION_HASH` 发生变化，
  `PUBLIC_SNAKE_SKIN_CATALOG_HASH`、`SERVER_SNAKE_SKIN_BUSINESS_HASH` 和 16 套皮肤
  `contentVersion=1` 必须保持扩展前值。任一不应变化项漂移均使 validator 失败。
- 服务端与客户端的 `publicCatalogHash` 不一致时，禁止购买、解锁、装备等外观目录相关经济写；S3 必须复用此门禁。
- 构建期声明资源缺失、损坏或 rect 非法必须让 validator 失败，不能靠 fallback 放行不完整 catalog。运行时只有
  未知 ID、部署损坏、加载失败或非法 rect 才确定性回退皮肤 1，留下受控诊断，且不改写权威
  `equippedSkinId` / `skinIdAtRunStart`。
- fallback 固定为皮肤 1 的 `fallbackSkinId=null`，其余 15 套 `fallbackSkinId=1`；validator 将 `null` 视为
  唯一终点并拒绝自环、多终点、缺失目标或更长链。
- 退休皮肤只停止新增获取；资源完整时，既有所有者仍按原 `skinId` 装备和显示，不因退休触发表现 fallback。
  删除资源前必须另有兼容 fallback 和迁移说明。
- 资源顺序、JSON 空白、文件系统遍历顺序不得改变各自规范化 hash；内容或解释变化必须改变对应 hash。

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

外部绝对路径只允许用于显式 import/refresh 和来源台账审计。S1 工具与仓内配置输入根固定为
`tools/snake-s1-assets/`：`source/manifest.json` 记录来源 commit、逐文件路径/hash 和目标映射，
`source/internal-skins/<id>/atlas.json` 与 `body.json` 保存 16 套可重放转换输入；实际 PNG/音频字节真源位于
`apps/Cocos/assets/resources/snakeoff/`。S1-12 另将 `tools/10001` 规范化为
`source/presentation/magnet.atlas.json`，将 `SnakeMagnet` 层级/混合/动画依赖规范化为
`source/presentation/magnet-aura.json`；常规 generate、`--check`、测试和 CI 只读这些仓内
相对路径，不得依赖 `/Users/kimi/work/tanchishe/wegameVersion/` 存在。客户端代码生成物先写入
`apps/client/src` 真源再走 `sync:client`；不得直接写 `apps/Cocos/assets/src` 镜像。

S1 的生成证据固定写入 `docs/s/evidence/s1/`，包括转换报告、顶层 `presentationVersion`、三类 hash、
来源/输出 SHA、完整性矩阵、磁铁 frame/aura/audio 完整性、预览和
contact sheet；不得改写 `docs/s/evidence/s0/` 的历史基线。S1 source manifest 可引用 S0 已登记的文件身份，
但必须独立补齐本阶段实际消费的全部 16 套素材与配置。

### 2.11 S1 → S3 内容审阅门

S1-09 只负责生成统一预览/contact sheet、完成头/身/可选尾、动画、pivot、间距和 fallback 的技术检查，并输出
内容审阅包。S1 完成后、S3-01 开始前，由用户或美术/产品结合预览确定最终展示名、稀有度和获取方式分配；
该审阅不阻塞 S1 退出，也不阻塞 S2/S2R 开发，但未完成时不得开始 S3-01。S3-01 对默认皮肤、AI 池和
fallback 只复用并验证 S1 冻结值，不得借内容审阅重新分配。

---

## 3. 详细任务

### S1-01 · 建立 16 皮肤完整性矩阵

**动作**

- [x] 以 §2.1 的 16 个 ID 为唯一集合，逐个定位原作 catalog、atlas JSON、native PNG、body config 和可核验名称证据；
  源名称缺失不是素材阻塞，使用 `皮肤 <ID>` 技术标签并标记 `technical-draft`。
- [x] 对照目标资源目录，标明“已存在且已登记、已存在但缺配置、缺 PNG、缺 atlas、缺 body config、缺预览”。
- [x] 识别逻辑重复/字节重复素材和 source alias，不以相近文件名合并不同 `skinId`。
- [x] 对无法定位或结构异常的 entry 记录阻塞原因，禁止用 classic 三等分素材临时冒充。
- [x] 核对已知基线：目标已有 9 套、待补 7 套；legacy classic 不映射 internal ID，`snake_skin_ai.png` 只映射 701。

**产物**

- 16 行皮肤完整性矩阵和每个 entry 的精确来源集合。
- 缺口列表、去重/别名决策和转换优先级。

**验证**

- ID 集合与冻结列表严格相等：无缺失、无额外、无重复。
- 每个 entry 均能定位到纹理与 atlas/body 配置；“文件看起来相似”不算映射证据，缺正式名称只进入 draft 标签。
- 已有资源逐个与来源台账和 SHA 对上，不凭文件名认领。

### S1-02 · 闭合来源、授权与 SHA 台账

**动作**

- [x] 对所有源文件和目标文件复算 SHA-256，并与现有首批 31 项记录比较。
- [x] 为新增的皮肤 PNG、atlas JSON、body config、预览、食物帧、墙块、背景和音效逐文件新增台账行。
- [x] 补齐批准来源、日期/负责人、转换步骤、新 `.meta` 状态和合法状态值。
- [x] 对冻结来源归档复用既有权利方授权并逐文件引用证据；只有新增范围外来源或无法关联既有授权时，才将 entry
  标为 `待授权，不得引入` 并移出可发布目录输入。
- [x] 对已授权缺口执行实际引入：把缺失的皮肤 PNG、atlas JSON 和 body config 复制/转换到明确的手写真源或
  资源真源路径，再由标准生成/同步流程物化目标；禁止沿用原作 UUID、import cache、旧 `.meta` 或运行时绝对路径。
- [x] 将来源映射写入 `tools/snake-s1-assets/source/manifest.json`，将逐 ID atlas/body 输入写入
  `tools/snake-s1-assets/source/internal-skins/<id>/`，并把实际 PNG/音频字节放入 Cocos snakeoff 资源真源；
  外部绝对路径仅保留在 import/refresh 审计记录中。
- [x] 以 S0 source manifest 为已核验证据输入但不修改其文件；S1 对新增读取和全部 16 套转换输入建立独立清单。

**产物**

- 无缺字段的资源/授权/SHA 台账。
- 源 hash、转换输入 hash、目标输出 hash 和逻辑 catalog entry 的可追踪链。
- 已补齐的 16 套仓内转换输入集合，以及每个新引入文件对应的仓内真源路径。

**验证**

- 自动复算结果与台账一致；同字节去重 entry 的 hash 相等且别名关系有记录。
- 所有进入目标 catalog 的资源状态至少为 `已授权，待转换`，所有目标已引用文件至少为
  `已引入，待验收`。
- 全仓不存在未登记的源 UUID/native hash 文件名，也不存在指向参考目录的软链接或运行时 URL。
- 每个批准补齐项的仓内文件 hash 与来源/转换台账一致；完整性矩阵不再把已引入文件列为缺口。
- 移走或不可访问外部参考目录后，常规 generate、`--check`、测试和 CI 仍能只凭仓内输入通过。

### S1-03 · 实现确定性 atlas/body 转换器

**动作**

- [x] 解析原作 atlas JSON、trim/rotate/originalSize/pivot 信息和每套身体配置。
- [x] 分别生成 normal/boost 的 head/body/可选 tail、`bodySequence`、`level`、有符号源 distance/offset、
  `durationFrames`、逐帧 pivot、`headAnchorY` 和 `visualScale`，并提供只按 normal 几何计算的确定性
  `deriveSkinLayoutMetrics`。
- [x] 按 `durationFrames=max(1, source.frame_time)` 保留帧时基；禁止输出 `animationFrameMs` 或提前换算毫秒。
- [x] 校验 16 套 `body_render_type=2` 并只复刻 NormalRepeat 布局分支；其他值或未知 render type fail-fast。
- [x] 缺 boost 时显式 `inherit-normal` 并让解析器引用 normal，缺 tail 时输出 `null`；禁止复制 normal 后伪装成
  `boostSource="source"`，也禁止用 body 伪造 tail。
- [x] 对未知结构 fail-fast，并输出带 `skinId`、源路径和字段位置的稳定错误；禁止猜默认 rect 后继续。
- [x] 把输入排序、数字格式、JSON key 顺序、换行和输出排序固定；支持只读 `--check` 或等价 freshness 模式。
- [x] 常规转换器只读取仓内手写真源并写明确目标，不扫描外部参考目录，也不改写生成镜像；外部读取仅属于显式
  import/refresh 入口。

**产物**

- 可重复运行的转换器、规范化 catalog 中间格式和 fixture。
- 覆盖单帧、多身体层级、normal/boost 动画头、可选尾部、trim/rotate、帧保持计数、负 distance 和异常 rect
  的测试样例。

**验证**

- 同一输入连续生成两次，输出字节和 hash 完全一致。
- 打乱源文件遍历顺序后输出不变。
- 修改一个 rect、body sequence 或源 hash 时 `--check` 失败且诊断指向正确 entry。
- 非 `216×72`、多帧和旋转/trim fixture 均被正确解析；越界和未知结构必须失败。
- 已知结构断言通过：403 有 tail、其余 15 套 tail 为 `null`；411 boost head 12 帧；701 normal/boost head
  为 2/7 帧；3、4 标记 `inherit-normal`；`frame_time` 的 0/6 分别生成 1/6 `durationFrames`；负 distance 保留；
  缺少 `head_anchor_y_pos` 时生成 `headAnchorY=0.5`；16 套 `bodyRenderType` 均严格为 2。

### S1-04 · 建立 Shared 公共目录

**动作**

- [x] 在 shared 手写真源中定义 `PublicSkinIdentity`、稳定 ID、公开/退休状态、`contentVersion`、默认标志、排序、
  玩家可用性和技术标签。
- [x] 固定并生成 16 套均 active、均进入公共目录、`playerUsable=true`、唯一默认 1、升序 `sortOrder`、
  初始 `contentVersion=1`。
- [x] 保持 shared 零依赖、ES2017、无 Node/DOM/Cocos 全局、无 `const enum`。
- [x] 为 exact validation、唯一 ID、唯一默认、稳定排序和 `publicCatalogHash` 建立单测。
- [x] 明确皮肤目录变更与 gameplay wire/mode version 的关系；仅资源补齐不应无理由升级 wire。

**产物**

- 16-entry 公共目录和规范化 `publicCatalogHash`。
- 可由 server/client 导入的稳定查询 API，不要求调用方遍历数组猜 ID。

**验证**

- shared typecheck 和对应测试通过；目录无第三方/宿主依赖。
- 任意未知 ID exact reject 或进入显式 fallback API，不通过 `%`、下标或字符串解析接受。
- 调整 `sortOrder` 不改变 `skinId`；任一公共字段或内容解释变化按约定提升版本并改变 `publicCatalogHash`。

### S1-05 · 建立服务端业务目录骨架

**动作**

- [x] 为每个 `skinId` 建立 ownership itemId、碎片 itemId、获取方式、价格、上下架和 `aiEligible` 的明确槽位。
- [x] 未经 S3 拍板的名称使用 `DisplayNameValue` 的 source/technical-draft；稀有度、itemId、获取方式、上下架和
  价格使用 `DecisionValue` 的 draft/unavailable + `value:null`，不填空串、0 或伪造值。
- [x] 固定唯一默认皮肤 1 和 §2.1 的精确 10-ID AI 池；退休状态不删除历史 entry。
- [x] 生成 `serverBusinessHash`，并嵌入与 shared 相同的 `publicCatalogHash` 作为跨端门禁输入。

**产物**

- 可供 S2 AI 过滤、S3 所有权/装备使用的服务端目录骨架。
- 默认、AI eligibility、退休和经济可写状态的明确查询接口。

**验证**

- 16 个公共 ID 在服务端一一有 entry；无孤儿业务 entry。
- AI 池严格等于 `101,111,112,132,133,139,401,403,411,701`，其余 6 套明确 false；每个 eligible entry
  都能通过客户端资源/fallback 校验。
- draft 获取字段不能被购买/解锁代码当作有效配置；经济写门禁默认关闭直到 S3 完成。

### S1-06 · 生成客户端皮肤资源目录

**动作**

- [x] 为每个 `skinId` 关联 preview、texture、normal/boost 的 head/body/可选 tail、body sequence、
  `durationFrames`、逐帧 pivot、有符号源 distance/offset、`headAnchorY`、`visualScale` 和 fallback。
- [x] 使用稳定逻辑资源路径，不把源 native hash 文件名或绝对路径暴露给运行时。
- [x] 确认全部彩色素材默认白 tint；扩展前的轮廓/箭头/名牌作为独立表现能力登记。
- [x] 生成 `clientPresentationHash`、嵌入的 `publicCatalogHash` 和可控诊断码，供未知 ID、加载失败和非法 rect 回退。

**产物**

- 16-entry 客户端资源目录、纹理/帧映射、`clientPresentationHash` 和 `publicCatalogHash`。
- 供 S2 renderer 消费的 `skinId -> normal/boost/head/body/tail/animation` 单一解析入口和布局推导函数。

**验证**

- 每个 entry 的所有 rect 均在纹理边界内，序列索引合法；`durationFrames` 为有限正值，源 distance/offset
  只要求有限并允许负数；布局只读取 normal 几何，在目标 `bodyScale=1.0..2.8` 和正 `pointDistance` fixture 下
  返回有限正值，切换 boost 纹理不改变路径点索引。
- 同一 ID 的头、身、可选尾不能解析到不同皮肤；不再存在 `% 3` 或实体 id 决定材质的目录 API。
- 皮肤 1 的 fallback 为 `null`、其余 15 套为 1；资源完整的 retired entry 仍解析自身。构建期缺失/非法 entry
  使验证失败，运行时未知/部署缺失/非法 entry 才确定性回退皮肤 1 并只产生受控诊断。

### S1-07 · 补齐食物、残骸、墙块与背景目录

**动作**

- [x] 从原作 atlas 确认 Dot `1..7`、Star/主题 Star、加速残骸、AI 死亡残骸和墙块 tile rect。
- [x] 记录世界显示尺寸 16/42/22/34、稳定 kind/variant 和默认/fallback 帧。
- [x] 将 S0 的明暗背景、网格、地图外背景、透明度、墙块平铺/线框规则写入 presentation catalog。
- [x] 按单 atlas/material 批渲染需求组织帧和材质；避免让 S2 只能逐节点加载。

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

- [x] 为吃食物、吃残骸、击杀、死亡和按钮登记稳定逻辑名、资源、hash、授权、音量/并发策略。
- [x] 将个人 run 结果固定登记为 `none/silent`，无 asset、无声音 fallback；不得借用其他事件音效。退出若成为
  独立事件则另行登记，不继承个人结果、真人死亡或 `time_over`。
- [x] 登记基础加速、保护、死亡爆散和复活视觉资源；缺失项显式标为 `none` 或后续，不创建收藏型特效内容。
- [x] 将 `time_over` 标为历史/未使用资源，禁止映射到目标 Endless 生命周期。
- [x] 保持 View/Logic 边界和 `sfxOn` 语义，不把播放状态写进素材 catalog。

**产物**

- 音效/FX presentation catalog 和资源/`none`/fallback 表。
- S2/S5 可用于播放映射、资源加载和 `totalTime=0` 禁播的测试向量。

**验证**

- 所有目标逻辑事件最多有一个默认音效映射；`none/silent` 或缺失不会触发资源加载，也不会导致战斗初始化失败。
- 个人结果不会播放声音，`time_over` 在目标事件映射中不可达。
- 所有实际引用的音频/FX 资源均存在、hash 匹配且有授权状态；`none` 项不伪造资源/hash。

### S1-09 · 生成 16 套预览与内容审阅输入

**动作**

- [x] 用规范化 catalog 生成统一背景、统一方向、统一长度/缩放和统一光照规则下的 16 套预览。
- [x] 同时输出头部动画、身体序列、尾部、pivot 和间距的检查图/contact sheet。
- [x] 完成头/身/可选尾、normal/boost 动画、pivot、间距、白边、trim 和 fallback 的技术审阅并关闭阻塞问题。
- [x] 汇总来源名称证据、`皮肤 <ID>` 技术标签和统一预览，形成 S3-01 使用的展示名、稀有度、获取方式审阅包；
  S1 内不要求用户/美术产品给出最终标注。
- [x] 缺帧、错序、白边、trim、pivot、缩放或 fallback 问题回到转换真源修复，不手改预览结果。

**产物**

- `docs/s/evidence/s1/` 下的 16 套预览、统一 contact sheet、已关闭的技术问题单和待产品审阅包。
- S3 分配“默认 1 / 等级 3 / 金币 4 / 成就 4 / 碎片或活动 4”的视觉输入；最终展示名、稀有度、获取方式
  与具体分配在 S1 完成后、S3-01 开始前审阅。

**验证**

- 16 个冻结 ID 各有且只有一套可识别预览；预览记录的表现 hash 与 `clientPresentationHash` 一致。
- 每套预览能确认头、身、可选尾来自同一 `skinId`，normal/boost 动画和序列没有越界或错位。
- 修复后从真源重生预览能复现结果，不存在仅修改导出 PNG 的漂移。
- `displayName.state` 仍为 `source|technical-draft`；稀有度、获取方式等 `DecisionValue` 仍为
  `draft|unavailable` 且 `value:null`。未审批不使 S1 失败，但不得进入 S3-01。

### S1-10 · 建立全目录校验与 hash 门禁

**动作**

- [x] 校验 ID 唯一、唯一默认皮肤、精确 10-ID AI 池、资源存在、rect/索引合法、normal/boost 完整、
  fallback 以皮肤 1 的 `null` 为唯一终点。
- [x] 校验 shared/server/client 的 entry 集合、内容版本和公共身份一致；16 套初始状态、排序和玩家可用性与
  §2.1 严格相等。
- [x] 分别计算稳定 `publicCatalogHash`、`serverBusinessHash`、`clientPresentationHash`；对 JSON 空白、key
  顺序和文件遍历顺序做规范化，不比较异构业务/表现 hash 是否相等。
- [x] 增加 `publicCatalogHash` mismatch 策略测试：外观目录相关经济写 fail-closed，战斗确定性回退皮肤 1；金币复活由
  独立 room config/policy/receipt 守门，不错误耦合 cosmetic catalog。
- [x] 区分 retired 与损坏：资源完整的 retired entry 保持自身解析，未知/部署损坏/加载失败/非法 rect 才运行时回退。
- [x] 将校验器接入适当的测试/verify 链；命令名称以实际实现为准并回写证据表。

**产物**

- 全目录 validator、三类 freshness/hash 检查和正反 fixture。
- 可由 S2/S3 直接复用的 catalog compatibility gate。

**验证**

- 正常 16-entry 目录全绿；重复 ID、第二默认、AI 集合漂移、缺资源、越界 rect、错误 normal/boost、
  fallback 自环/多终点、孤儿 entry 和公共 hash mismatch 分别稳定失败。
- 相同语义的不同输入顺序得到相同的对应 hash；业务 draft 单独变化只改变 `serverBusinessHash`；公共字段或
  某个皮肤的资源解释变化则提升对应 `contentVersion`、改变 `publicCatalogHash`，表现变化还改变
  `clientPresentationHash`。此项只记录 S1-10 当时已验证的皮肤目录规则；非皮肤表现的顶层
  `presentationVersion` 规则已由 S1-12 的版本迁移与 hash 正反例补齐。
- `publicCatalogHash` mismatch 时测试证明外观目录相关经济写不会进入，战斗仍只回退默认且留下诊断；
  `serverBusinessHash` 与 `clientPresentationHash` 不做相等断言。
- retired entry 正常渲染自身；构建期损坏 fail-fast；运行时模拟部署损坏才触发 fallback 且不改写权威 skin ID。

### S1-11 · 执行同步、无头验证与阶段交接

**动作**

- [x] 只修改手写真源；按实际改动运行必要的 gameplay codegen、shared sync、protocol fingerprint 和 client sync。
- [x] 在外部参考目录不可访问的条件下运行转换器 freshness、catalog validator、资源 hash、inventory、sync、
  类型检查和客户端测试，证明常规链只依赖仓内输入。
- [x] 核对生成 diff 只包含预期产物，未手改受保护镜像，未混入未授权或未登记文件。
- [x] 在证据表登记实际命令、commit、预览/contact sheet、hash 和尚待 Creator 验收项。
- [x] 将转换报告、三类 hash、SHA、完整性矩阵和预览统一写入 `docs/s/evidence/s1/`，不改写 S0 evidence。
- [x] 将 catalog API、三类 hash、fallback、材质分组、S3 内容审阅包和未解决 Creator 风险交接给 S2/S3/S5。

**产物**

- 可消费且 freshness 通过的 S1 catalog/asset bundle。
- 完整交接说明、S3-01 前置内容审阅包和真实验证输出。

**验证**

- 至少根据实际改动运行并记录：`npm run sync:shared`、`npm run sync:client`、`npm run typecheck`、
  `npm run test:client`、`npm run verify:sync`、`npm run verify:inventory`；不适用项写明理由，不能伪造通过。
- 若修改 gameplay schema，额外运行并记录
  `npm --workspace @game/server run codegen:gameplays` 及相关服务端测试。
- 若修改 protocol，显式运行 fingerprint 写入/检查动线；不得隐式重钉。
- 对同一输入从零重生资源目录，输出和三类 catalog hash 与提交内容一致。

### S1-12 · 补齐磁铁表现资产并重封目录

S1-01～S1-11 的完成记录是历史事实，不回退或伪改；本任务是首发磁铁范围拍板后新增的 S2 强前置。

**动作**

- [x] 扩展显式 `--refresh-source`：从 §2.5.1 已核验路径读取 `tools` texture/atlas pack、
  `SnakeMagnet` prefab pack 与五个 aura PNG、`eat_tool` MP3；复算源 SHA，并将每次实际读取的文件、用途和来源
  commit 写入 `tools/snake-s1-assets/source/manifest.json`。
- [x] 只提取 `tools` atlas 的 `10001` 为 `tools/snake-s1-assets/source/presentation/magnet.atlas.json`；输出必须保留
  rect、pivot、trim、originalSize 和 rotate，不能在运行时解析整包或手抄第二份 frame。
- [x] 将 `SnakeMagnet` 的 Cocos 2 层级、混合、关键帧/粒子参数和五个纹理依赖转换为仓内规范化
  `tools/snake-s1-assets/source/presentation/magnet-aura.json`；遇未知组件或无法表达的动画字段 fail-fast，不静默丢弃。
- [x] 将实际资源字节复制到明确真源：`snake_magnet_tools.png`、
  `snake_magnet_aura_x_lighting01.png`、`snake_magnet_aura_x_lighting02.png`、
  `snake_magnet_aura_x_lighting03.png`、`snake_magnet_aura_xt_s_lighting.png`、
  `snake_magnet_aura_xt_s_lighting02.png` 和 `snake_sfx_collect_magnet.mp3`；同时把规范化 recipe 生成为
  `snake_magnet_aura.json`。这 8 个运行时资源只生成仓库自己的新 `.meta`，不复制旧 prefab、UUID、
  `.meta` 或 import cache。
- [x] 在客户端表现目录的 `tools` 分组加入稳定逻辑项 `magnet`（规范化 catalog path 为 `tools.magnet`）：
  world kind=`magnet`、sourceToolId=`10001`、textureAsset=`snakeoff/snake_magnet_tools`、displaySize=`70`；
  `magnet-status-icon` 写成同 texture/frame 的 `logicalAliasOf="magnet"`，role=`passive-indicator`、interactive=`false`；
  `magnet-active` 以 recipeAsset=`snakeoff/snake_magnet_aura` 关联规范化 aura recipe，并登记运行时 aura 损坏时的结构化 fallback：逻辑资源仍是已登记的
  `magnet-status-icon`，placement=`over-head`，不得另造 `magnet-status-icon-over-head` 资源名。
- [x] 重封 presentation identity：`self` 只启用 `fine-white` outline 且 arrow=`none`；`otherHuman` 只保留文字名字；
  `ai` 也只保留文字名字且 arrow/outline=`none`。自机选择由本地 View 身份决定，不新增共享皮肤字段或 wire 字段。
- [x] 为 `collect-magnet` 登记 `snake_sfx_collect_magnet`、资源 SHA、`sfxOn` 和有界单实例/并发策略，
  missing=`silent`；为持续态另记 `magnet-active-loop=none/silent`，禁止创建或猜测循环音资源。
- [x] 将历史无该字段的 envelope 按迁移规则解释为隐式 `presentationVersion=1`，再生成显式
  `presentationVersion=2`，重算并生成新的
  `CLIENT_SNAKE_PRESENTATION_HASH`；以固定断言保证 `PUBLIC_SNAKE_SKIN_CATALOG_HASH`、
  `SERVER_SNAKE_SKIN_BUSINESS_HASH` 和全部皮肤 `contentVersion` 字节级保持既有值。
- [x] 更新 converter fixture、catalog validator、资源 inventory、provenance、SHA256SUMS、validation report、
  execution record 与 evidence README；扩展前数字/hash 只保留为带 commit 的历史基线，不覆盖成新结果。
- [x] 只改手写真源并经标准生成/sync 动线物化结果；磁铁不新增 shared 皮肤身份、不创建 cosmetic feature，
  gameplay/wire 由 S2 实现。Creator 3.8.8 的 aura 混合、层级和真机观感终验仍明确交给 S5。

**产物**

- 仓内可重放的磁铁 atlas 输入、aura recipe，以及世界纹理、五个 aura 纹理、拾取音频、生成 recipe
  共 8 个运行时资源文件和仓库自有 `.meta`。
- `presentationVersion=2` 的客户端表现目录，以及 world frame、被动 icon alias、aura 和音频的单一解析入口。
- 更新后的来源/授权/SHA 台账、完整性报告和真实 `CLIENT_SNAKE_PRESENTATION_HASH`；公共/业务 hash 不变证据。

**验证**

- `magnet` 恰好解析到 `10001`，rect 恰好 `[346,256,84,92]`、displaySize 恰好 `70` 且位于 `468×769`
  texture 内；额外/缺失 world entry、手改 rect、错误尺寸和 frame 越界分别稳定失败。
- `magnet-status-icon` 与 `magnet` 的 textureAsset/frame 规范化值完全相同且只有一个物理资源；复制字节、别名指向
  其他 frame、`interactive=true` 或把它登记进主动按钮槽均使测试失败。
- `magnet-active.recipeAsset` 恒为 `snakeoff/snake_magnet_aura`，解析的 recipe 精确引用五个冻结逻辑纹理，
  每个目标字节 hash 与来源/台账相符；缺依赖、未知组件、fallback 自环或
  复制旧 UUID 均 fail-fast。运行时部署损坏 fixture 只允许 aura 回退头顶 icon，不允许生成不可见 world item。
- identity 目录只允许自机细白轮廓和 AI 文字名字；旧 human arrow、AI outline、AI avatar 任一重新可达都使测试失败，
  并证明选择自机轮廓不改变皮肤 tint、公共目录或 wire。
- `collect-magnet` 只解析到已登记 `eat_tool` 字节，重复触发遵守配置的有界单实例/并发策略；持续 8 秒不触发循环音，
  `sfxOn=false` 时不播放但不影响资源目录初始化。
- 相同输入连续生成及乱序输入的输出字节与新 `CLIENT_SNAKE_PRESENTATION_HASH` 相同；删除/修改任一磁铁
  frame、aura recipe/纹理或音频时 freshness/hash 检查失败。
- `presentationVersion` 恰好为 `2`，新 `CLIENT_SNAKE_PRESENTATION_HASH` 与扩展前值不同；
  `PUBLIC_SNAKE_SKIN_CATALOG_HASH`、`SERVER_SNAKE_SKIN_BUSINESS_HASH` 和 16 个 `contentVersion=1` 与扩展前
  基线严格相同。
- 移走或禁止访问外部来源归档后，`node tools/snake-s1-assets/cli.mjs --check`、转换器测试、client catalog 测试、
  `npm run typecheck`、`npm run test:client`、`npm run verify:sync` 与 `npm run verify:inventory` 仍通过；实际命令、
  suite 数和 exit code 原样写回 evidence，未运行项不得伪造。

---

## 4. 退出条件

以下条件必须全部满足，S1 才能标记为 `[已完成]`：

- [x] 16 个冻结 internal skin ID 均有完整来源映射、PNG、atlas/body config、规范化 entry 和预览。
- [x] S1-01～S1-11 既有资源逐文件具备源路径、逻辑名、SHA-256、授权、目标路径、转换、`.meta` 状态和
  合法状态值。
- [x] 16 套均为 active、均进入公共目录、`playerUsable=true`、初始 `contentVersion=1` 并按数字 ID 升序；
  唯一默认皮肤为 1。
- [x] `aiEligible=true` 集合严格等于 `101,111,112,132,133,139,401,403,411,701`，其余 6 套明确为 false。
- [x] 转换器能处理 normal/boost、多帧动画、逐帧保持次数、trim/rotate、body level/sequence、有符号
  distance/offset 和可选 tail，并对未知结构 fail-fast。
- [x] 转换器和规范化目录在重复运行、乱序输入下仍字节确定。
- [x] 常规 generate、`--check`、测试和 CI 只依赖仓内输入，不读取外部绝对路径。
- [x] Shared、服务端和客户端三层目录的 ID/版本/公共身份一致，且 ownership 与资源所有权边界明确。
- [x] 皮肤 1 完整且 `fallbackSkinId=null`，其余 15 套全部直接 fallback 到 1；构建期不完整目录 fail-fast，
  运行时未知/部署损坏/非法资源稳定回退 1，retired 完整资源仍显示自身。
- [x] 所有 rect、pivot、序列、`durationFrames`、有符号 distance/offset、布局推导、资源存在性和 fallback 链
  校验通过。
- [x] Dot `1..7`、Star、两类残骸、墙块、背景/网格主题和目标音效/FX 的资源或显式 `none` 策略均进入
  presentation catalog。
- [x] 磁铁 `10001` world frame 以 rect `[346,256,84,92]`、displaySize `70` 进入表现目录；
  `magnet-status-icon` 是同帧、同纹理、无复制字节的被动逻辑别名，且不占主动按钮槽。
- [x] `SnakeMagnet` 五个 aura 纹理与规范化 Cocos 3 recipe、`collect-magnet/eat_tool` 音频及持续态
  `none/silent` 均完成来源/SHA/授权/资源/fallback 校验，外部归档不可访问时仍可重生。
- [x] presentation identity 已收敛为自机细白轮廓、AI 仅文字名字；旧自机箭头、AI 轮廓/头像不可达，且该投影
  不进入公共皮肤身份、业务目录或 wire。
- [x] 个人结果固定 `none/silent`，`time_over` 不可从目标 `totalTime=0` 事件映射触发。
- [x] S1-01～S1-11 扩展前三类 hash 各自稳定、三层 `publicCatalogHash` 相同；公共 hash mismatch 时外观目录相关经济写
  fail-closed、战斗 fallback 的测试通过，异构业务/表现 hash 不做相等比较。
- [x] 表现目录显式升级到 `presentationVersion=2` 并产出真实的新 `CLIENT_SNAKE_PRESENTATION_HASH`；
  `PUBLIC_SNAKE_SKIN_CATALOG_HASH`、`SERVER_SNAKE_SKIN_BUSINESS_HASH` 与 16 个皮肤 `contentVersion=1`
  均与扩展前基线严格相同。
- [x] 16 套统一预览/contact sheet、技术问题关闭记录和 S3 内容审阅包完成；名称保持
  `source|technical-draft`，稀有度/获取方式保持 `draft|unavailable` 且 `value:null`，不按 ID 猜测，也不作为
  S1 退出门。
- [x] S1-01～S1-11 的 codegen/sync/typecheck/test/verify 已按实际改动运行并留存原始输出；生成 diff 已审阅。
- [x] S1-12 的 converter/catalog/hash/inventory/sync/typecheck/test/verify 已按实际改动运行并留存原始输出；
  生成 diff 已审阅且未伪造未运行结果。
- [x] Creator 尚未执行的资源/UUID/pivot/混合确认明确留给 S5，不能登记为已通过。

---

## 5. 风险与回退

| 风险 | 影响 | 预防/回退 |
|---|---|---|
| 假设所有 atlas 都是 `216×72` 三等分 | 动画头、多身体帧或尾部错切 | 转换器解析 atlas/body config；遇未知结构 fail-fast，回退到该 entry 未就绪而不是猜 rect |
| 手抄大量 rect | 易漂移、无法 freshness 校验 | 所有 rect 由确定性转换器生成；发现手改时丢弃输出并从真源重生 |
| 根据文件名或 ID 合并素材 | 皮肤身份错配、历史所有权不可迁移 | 只按源 catalog 和 SHA 证据映射；字节去重仍保留逻辑别名 |
| 缺授权资源进入发布目录 | 发布风险或后续返工 | `待授权，不得引入` fail-closed；使用已批准 fallback，不用“同机可见”补证 |
| 复制旧 `.meta`/UUID/import cache | Cocos 资源冲突或跨工程幽灵引用 | 只复制/转换源字节，新建目标 `.meta`；S5 用 Creator 重导入确认 |
| 皮肤资源和 catalog hash 漂移 | 白图、错皮肤、外观资产争议 | 三类规范化 hash 与 freshness 门禁；公共 hash 不符时外观经济禁写，只有皮肤解析按规则回退皮肤 1；磁铁按 world/aura/audio 分型处置 |
| 把异构业务/表现 hash 直接比较 | 永久 mismatch 或错误开启经济写 | 跨端只比较同构 `publicCatalogHash`；其余 hash 只守本层 freshness/审计 |
| fallback 缺失或成环 | 加载失败递归、无法开局 | 皮肤 1 以 `null` 作为唯一终点，其余 15 套直达 1；validator 拒绝其他形状 |
| AI 皮肤池漂移或消费玩法 RNG | AI 外观偏离来源，新增皮肤改变对局轨迹 | 精确 10-ID 集合门禁；S2 使用独立 `snake.ai.skin` RNG，目录仅提供候选 |
| 把 `frame_time` 当毫秒 | 动画速度严重偏离来源 | 归一为 `durationFrames=max(1, frame_time)` 并以 0/6 fixture 守门 |
| 拒绝负 distance 或混成正间距 | 身体布局错位或转换器误报 | 有符号源 offset/distance 只校验有限；路径点距离由 `deriveSkinLayoutMetrics` 独立推导和校验 |
| 合并 normal/boost 或伪造 tail | 加速动画、411/701 多帧或 403 尾部错误 | 双 profile、显式继承和可选 tail；以已知结构 fixture 守门 |
| 把 retired 当作损坏资源 | 既有所有者换装或显示被错误改写 | retired 只停新增获取，资源完整时继续解析自身；损坏才运行时 fallback |
| 常规构建依赖开发机绝对路径 | CI/他机无法重生目录 | 转换输入和 manifest 入仓；绝对路径仅用于显式 import/refresh 与台账审计 |
| 真人/AI tint 改写原皮颜色，或旧箭头/AI 轮廓重新可达 | 与 golden 和冻结身份口径不一致 | catalog 默认白 tint；仅本机自机选择细白轮廓，AI 只显示文字名字，validator 拒绝旧表现分支 |
| 每个食物独立 Sprite/material | 1030 食物导致节点和 draw call 失控 | S1 按 atlas/material 批次组织；不满足批渲染的目录不得交给 S2 |
| S0 目标配置保留磁铁但 S1 未交付表现目录 | S2 生成不可见道具或临时解析原作资源 | S1-12 成为 S2 强前置；world/icon/aura/audio 全部进入仓内 catalog、SHA 和 freshness 门禁 |
| 把磁铁被动状态 icon 做成主动按钮 | 四槽语义与“首发仅加速”口径漂移 | icon 固定 `passive-indicator`、`interactive=false`，validator 拒绝主动槽登记 |
| 复制旧 `SnakeMagnet` prefab、UUID 或 `.meta` | Cocos 2/3 结构不兼容、资源身份冲突 | 只提取五个纹理与规范化 recipe，在 Cocos 3 重建并由 S5 终验 |
| 磁铁扩展误改公共/业务 hash | 无关外观经济被错误 fail-closed 或皮肤版本漂移 | 只提升 `presentationVersion` 和重算客户端表现 hash；公共/业务 hash 与皮肤版本设固定不变断言 |
| 把 `time_over` 音效接入 Endless | 暗示不存在的限时终局 | 明确标为历史/未使用；事件映射测试不可达 |
| 提前写死名称/价格/稀有度 | S3 被未经评审的内容决策绑架 | S1 使用 source/technical-draft/unavailable；S1 后、S3-01 前完成内容审阅 |
| 手改 generated 或同步镜像 | 后续 codegen/sync 覆盖、真源漂移 | 只改手写真源；发现镜像单独 diff 时回退该 diff 并从标准动线重生 |

---

## 6. 证据回写

状态只允许：`[已拍板·待实施]`、`[进行中]`、`[已完成]`、`[阻塞·需 Creator]`、`[有意不做]`。

| 任务 | 状态 | commit | 自动验证/命令 | catalog、hash、预览或授权证据 | 备注 |
|---|---|---|---|---|---|
| S1-01 | [已完成] | `d18846a` | `--refresh-source` 精确 commit/clean 校验；16/16 完整 | [完整性矩阵](evidence/s1/completeness-matrix.json) · [来源 manifest](../../tools/snake-s1-assets/source/manifest.json) | 目标已有 9/缺 7、legacy 与 701 别名均按来源身份闭合 |
| S1-02 | [已完成] | `d18846a` | 68 个冻结源文件、27 个实际资源、78 行资源/转换/预览续表复算通过 | [机器可读续表](evidence/s1/provenance.json) · [SHA 清单](evidence/s1/SHA256SUMS) | 新 `.meta` 为仓库所有；未复制旧 UUID/import cache；状态均为「已引入，待验收」 |
| S1-03 | [已完成] | `d18846a` | `node --test tools/snake-s1-assets/snake-s1-assets.test.mjs` 8/8；`--check` exit 0 | [转换报告](evidence/s1/conversion-report.json) · [技术审阅](evidence/s1/technical-review.json) | 覆盖乱序、非 216×72、多 body、动画、403 tail、rotate/trim、0/6 帧、负 offset 与反例 |
| S1-04 | [已完成] | `d18846a` | shared/client typecheck；exact/default/order/hash 正反测试 | [公共目录](../../apps/shared/src/cosmetics/snakeSkinCatalog.ts) · [hash](evidence/s1/catalog-hashes.json) | 16 active、唯一默认 1、版本 1；未改 gameplay wire/schema/protocol |
| S1-05 | [已完成] | `d18846a` | server S1 5/5；AI drift/orphan/sentinel/hash mismatch 反例通过 | [服务端业务目录](../../apps/server/src/rooms/modes/snake/skinBusinessCatalog.ts) | 10-ID AI 池精确；全部业务值保持 draft/unavailable；经济写默认关闭 |
| S1-06 | [已完成] | `d18846a` | client catalog 8/8；rect/sequence/layout/fallback/mismatch 通过 | [客户端表现目录](../../apps/client/src/logic/rooms/snake/SnakePresentationCatalog.ts) | 运行时诊断不改权威 ID；retired 完整 entry 按自身解析；彩色素材固定白 tint |
| S1-07 | [已完成] | `d18846a` | 七色 Dot、Star 主题、22/34 wreck、墙/背景精确值 fixture 通过 | [表现生成物](../../apps/client/src/logic/rooms/snake/SnakePresentationCatalog.generated.ts) | 网格 32、边距 16；单 atlas/material 容量 1030；无 broadphase 150 泄漏 |
| S1-08 | [已完成] | `d18846a` | 音效/FX 唯一映射、hash、静默/不可达策略测试通过 | [来源续表](evidence/s1/provenance.json) | personal result=`silent`；`time-over=historical-unused/unreachable`；死亡爆散显式 none |
| S1-09 | [已完成] | `d18846a` | 16/16 preview；normal/boost 技术 contact sheet 人工检查通过、阻塞 0 | [预览总览](evidence/s1/contact-sheet.png) · [技术总览](evidence/s1/technical-contact-sheet.png) · [S3 审阅包](evidence/s1/content-review-package.json) | 名称仍为 technical-draft，产品名/稀有度/获取/价格未冒充审批 |
| S1-10 | [已完成] | `d18846a` | repo-only freshness + shared/server/client 正反 validator/hash/fallback tests | [验证报告](evidence/s1/validation-report.json) · [三类 hash](evidence/s1/catalog-hashes.json) | 只比较同构公共 hash；业务/表现 hash 独立；构建损坏 fail-fast，部署损坏才 fallback |
| S1-11 | [已完成] | `d18846a` | `sync:shared`、`sync:client`、`typecheck`、`test:client`、server test、`verify:sync`、`verify:inventory` 均 exit 0 | [执行记录](evidence/s1/execution-record.md) · [证据入口](evidence/s1/README.md) | gameplay schema 与 protocol 未改，故 gameplay codegen/fingerprint 重钉不适用；Creator 终验留 S5 |
| S1-12 | [已完成] | `bc5bb97` | refresh 77 文件；converter 13/13；client catalog 11/11；全量 client 380/380、server 489/489；typecheck/sync/inventory/freshness 均 exit 0 | [磁铁完整性](evidence/s1/magnet-completeness.json) · [三类 hash](evidence/s1/catalog-hashes.json) · [执行记录](evidence/s1/execution-record.md) | 8 个 runtime 资源闭合；`presentationVersion=2`，仅 client hash 改变；Creator aura 终验留 S5 |

阶段汇总：

| 阶段 | 状态 | commit | 自动验证 | Creator/视觉证据 | 备注 |
|---|---|---|---|---|---|
| S1 | [已完成] | `d18846a`（原基线）+ `bc5bb97`（S1-12） | converter 13/13、server S1 5/5、client catalog 11/11；全量 client 380/380、server 489/489；typecheck/sync/inventory/SHA 全绿 | 16 张皮肤单图 + 两张 contact sheet 已人工检查；磁铁 aura 的 Creator 3.8.8 混合/层级终验留 S5 | S2 前置门已解除；S3-01 仍必须先完成内容审批 |

---

> [返回专项总目录](README.md) · [上一阶段：S0 复刻基线](s0-replication-baseline.md) ·
> [下一阶段：S2 战场与无尽生命周期](s2-battle-and-endless-lifecycle.md)
