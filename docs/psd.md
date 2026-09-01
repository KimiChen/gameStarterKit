# PSD 到 FairyGUI 的 CLI-first 生产流水线实施方案

> 版本：0.1（方案稿）  
> 日期：2026-09-02  
> 状态：**尚未实现，不代表仓库已经具备本文命令或工具**  
> 决策：不开发 FairyGUI Editor 插件；用命令行脚本承担 PSD 解析、资产导出、装配计划生成和候选 FairyGUI 工程编译。
> 核心契约：明确采用“**命名 + sidecar 契约 + Editor 映射**”三层方案。

本文给出长期方案：PSD 继续作为可编辑像素生产源；命令行工具把 PSD 与 PageSpec、Scenario、资产 manifest
编译为可审计的中间表示，再在**可丢弃的完整 FairyGUI 临时工程副本**中创建候选资源、组件、Controller、
Gear、Relation、热区和九宫格配置。候选工程必须经固定版本 FairyGUI Editor 打开、保存、关闭、重开并正式发布，
才能成为权威设计源和发布物。

本文服从 [FairyGUI UI 生产、装配与自动化工作流](FairyGUI.md)、
[客户端开发](CLIENT.md)、[FairyGUI 设计源说明](../apps/art/fairygui/README.md) 和根 `AGENTS.md`。
本文改变的是长期自动化实现选择，不改变以下边界：FairyGUI Editor 仍是正式 XML、`package.xml`、内部 ID 和发布物
的最终权威；Creator 仍是 `.meta` 的唯一生成者。

## 1. 结论与关键限制

推荐长期架构是“**Scenario-first + PSD handoff + CLI 临时工程编译器 + Editor takeover**”：

```text
PageSpec / Scenario / 设计 tokens
                +
分层 PSD + asset-manifest.json
                │
                ▼
        psd:inspect / psd:extract
                │
                ▼
       PsdHandoffIR（只读派生物）
                │
                ▼
  EditorAssemblyPlan（只读装配计划）
                │
                ▼
CLI FairyGUI Project Compiler
只写可丢弃的完整临时工程副本
                │
                ▼
FairyGUI Editor 打开 → 保存 → 关闭 → 重开
                │
                ▼
正式工程接管 → Editor 正式发布
                │
                ▼
codegen:fgui → feature codegen → manifest → sync:client
                │
                ▼
Creator 导入、Scenario 验收、receipt 冻结
```

必须先接受一个事实：FairyGUI 官方命令行目前提供的是**发布**能力，不是完整的设计期对象 API。它不能像 Editor
插件那样直接创建组件、Controller、Gear 或 Relation。因此，不使用 Editor 插件而实现同等能力，本质上是维护一个
受控的 FairyGUI 工程编译器，理解并生成固定版本 Editor 的项目格式。

这带来四条硬约束：

1. 自研编译器只写临时完整工程，绝不直接写 `apps/art/fairygui/` 正式设计源。
2. 编译器生成的资源 ID、组件 ID 和子对象 ID 都只是候选；Editor 接管后的 ID 才是正式 ID。
3. `package.xml`、组件 XML 和未知字段必须通过版本锁、round-trip golden test 和 Editor 重开验证。
4. 在本文方案完成 ADR、工具锁和两个结构不同的 golden package 之前，仍执行 `docs/FairyGUI.md` 的现行
   `authoringMode: editor` 流程；不能把本文中的计划命令当作已有能力。

## 2. 目标与非目标

### 2.1 目标

- 从分层 PSD 稳定提取可运行 PNG、文字槽、热区轮廓和视觉状态参考。
- 用结构化 sidecar 表达 PSD 无法表达的 Controller、Gear、Relation、九宫格和安全区规则。
- 生成可审阅、可复现、可 diff 的 FairyGUI 候选工程，而不是依赖人工重复装配。
- 在不开发 Editor 插件的前提下覆盖插件原计划承担的叶子组件和页面装配能力。
- 保持 Editor 对正式内部 ID、设计源序列化和发布的最终控制权。
- 让每次生产批次都有输入哈希、工具版本、预期变更、实际变更和验收证据。

### 2.2 非目标

- 不把 PSD 变成 FairyGUI 的第二套结构真源。
- 不从图像或层名“猜测”业务状态、Controller 页面或运行时数据绑定。
- 不让脚本直接覆盖正式 `package.xml`、组件 XML、`.bin`、图集或 Creator `.meta`。
- 不用字符串替换、正则表达式拼 XML，或把 Editor 私有格式当成稳定公开协议。
- 不用 macOS UI 自动化冒充可验证的 Editor API。
- 不在第一阶段实现一个通用可视化 UI Editor。

## 3. “命名 + sidecar 契约 + Editor 映射”三层方案

PSD 不能可靠保存 FairyGUI 的 Controller、Gear、Relation、热区、内部 ID、九宫格和安全区运行逻辑。因此本方案
不把这些信息全部压进 PSD 名称，而是固定使用三层契约：

```text
第一层：PSD 命名
role + stableKey + 可选 FGUI 名称
        │
        ▼
第二层：sidecar 契约
PageSpec / Scenario / asset-manifest / assembly-recipe
完整表达状态、结构、约束和资产事实
        │
        ▼
CLI 编译临时 FairyGUI 工程候选
        │
        ▼
第三层：Editor 映射
正式 Editor 对象、内部 ID、序列化结果与 stableKey 的只读映射
```

### 3.1 第一层：命名

PSD 图层名只回答三个问题：这个图层扮演什么角色、它的稳定业务身份是什么、需要时对应哪个公开 FGUI 名称。

```text
IMG::ui.storage.panel
TEXT::T01::txt_storage_current
HIT::H04::btn_collect
```

这一层适合美术直接维护，容易在 Photoshop 中检查，也能让导出脚本找到对象。它不保存坐标外的结构语义，尤其不保存
内部 ID、Controller page、Gear 值、Relation 编码、九宫格 inset 或设备 safe inset。

### 3.2 第二层：sidecar 契约

sidecar 是机器可校验的完整语义层，由下列文件组成：

- PageSpec / Scenario：字段、动作、状态维度、required page、极值和异常态；
- `asset-manifest.json`：sourceRect、Alpha、padding、pivot、九宫格、输出策略和 hash；
- `assembly-recipe.json`：节点树、Controller、Gear、Relation、热区、List、Loader、文字槽和安全区意图；
- JSON Schema：版本、枚举、必填项、引用闭包和所有权约束。

PSD 名称中的 stable key 必须在 sidecar 中唯一闭合。sidecar 不保存 Editor 内部 ID，也不复制可从 PSD 或正式 Editor
工程确定性解析出的事实。需要改变业务状态或装配规则时修改 sidecar，再整体重建只读 IR 和候选工程。

### 3.3 第三层：Editor 映射

Editor 映射负责把 stable key 对到**正式 Editor 接管后的对象身份**。它由工具在 Editor 保存—关闭—重开后只读生成，
而不是人工填写或对 Editor 发号：

```text
stableKey
  → package / component
  → object kind / public name / structural path
  → resource ID / child ID / controller ID / page ID
  → formal source hash / Editor version
```

映射采用两份派生文件：

- `editor-map-request.json`：由 `EditorAssemblyPlan` 生成，描述期望匹配的 stable key、对象类型、公开名称和结构路径；
- `editor-id-map.snapshot.json`：从正式 Editor 工程反解析生成，记录实际 ID、路径和基线 hash。

默认匹配键是 `package + component + object kind + public name + structural path`。只有在固定版本 Editor 的
round-trip POC 证明自定义字段会被原样保留时，才允许额外写入 `stableKey` 标记；不能把未验证的私有 XML 属性当成
长期协议。任一 key 出现零匹配、多匹配、类型不符或基线过期，映射生成必须失败，禁止按名称模糊匹配。

### 3.4 三层不变量

- 数据方向是“命名 → sidecar → 候选工程 → Editor → 只读映射”，Editor ID 不反向写回 PSD 名称或 sidecar。
- 重命名公开 FGUI 对象时必须显式更新 sidecar，并生成映射迁移报告；不能静默创建第二个对象。
- PSD stable key、sidecar stable key 和 Editor 映射 key 必须一一闭合；missing、orphan 和 duplicate 都是阻断错误。
- 第一层负责“找到谁”，第二层负责“应该做什么”，第三层负责“Editor 最终把它保存成什么”。
- 三层都不能替代 PageSpec/Scenario 的业务真相，也不能替代 Editor 对正式内部 ID 和序列化格式的权威。

## 4. 真源与所有权

同一事实只允许一个可编辑真源。名称可以帮助建立映射，但不能承载全部语义。

| 事实 | 可编辑真源 | 其他产物的角色 |
| --- | --- | --- |
| 玩法字段、动作、状态维度 | PageSpec / Scenario | PSD Layer Comp 只能作为视觉样例 |
| 视觉像素、遮挡补绘、图层效果 | PSD | PNG 是批准后的运行资产投影 |
| sourceRect、Alpha、padding、pivot、九宫格 inset、输出哈希 | `asset-manifest.json` | PSD 名称只引用 stable key |
| 候选节点、Controller、Gear、Relation、热区映射 | CLI 装配配方 | `EditorAssemblyPlan` 是生成结果，不手改 |
| 正式精确布局、组件结构、内部 ID | Editor 接管后的正式设计源 | ID snapshot 只读，不反向发号 |
| 正式 `.bin`、图集、发布描述 | FairyGUI Editor 发布 | 自研脚本不得伪造 |
| Creator `.meta` | Creator 真实导入 | 脚本不得手工创建 |
| View AUTO 区块 | `npm run codegen:fgui` | 从正式 XML 生成 |
| 运行时安全区 inset | Creator/宿主运行时 | PSD 只提供安全区预览，FGUI 只提供容器和 Relation |

### 4.1 stable key 与内部 ID 分离

所有跨阶段映射都使用人类可读的 `stableKey`，例如 `ui.top.settings`、`hit.collect`、
`text.storage.current`。stable key 是业务身份，不是 FairyGUI 内部 ID。

命令行工具可以在临时工程内分配确定性的**候选 ID**，目的是让同一输入重复编译得到零 diff；它不能宣称这些 ID
是正式 ID。Editor 接管后生成只读的 `editor-id-map.snapshot.json`：

```json
{
  "schemaVersion": 1,
  "editorVersion": "<locked-version>",
  "package": "UndergroundIdle",
  "component": "UndergroundIdleMain",
  "sourceHash": "sha256:...",
  "items": {
    "hit.collect": {
      "resourceId": "<editor-owned>",
      "childId": "<editor-owned>"
    }
  }
}
```

该 snapshot 只用于 codegen 对账、漂移诊断和 receipt；不得编辑，也不得用来强迫 Editor 复用旧 ID。

## 5. 推荐目录

以下目录均为规划目标；落地时应把临时目录和生成证据加入 `.gitignore`，但批准的契约与必要审计记录是否入库，
需在阶段 0 的 ADR 中决定。

```text
tools/psd-pipeline/
├── cli.ts
├── inspectPsd.ts
├── extractAssets.ts
├── composePreview.ts
├── compileHandoff.ts
├── naming.ts
├── schemas/
│   ├── asset-manifest.schema.json
│   ├── psd-handoff-ir.schema.json
│   ├── assembly-recipe.schema.json
│   └── receipt.schema.json
└── fairygui/
    ├── parseProject.ts
    ├── projectIr.ts
    ├── seededTemplateWriter.ts
    ├── rawProjectWriter.ts
    ├── packageCodec.ts
    ├── componentCodec.ts
    ├── idAllocator.ts
    ├── semanticEnums.ts
    ├── diff.ts
    └── verifyRoundtrip.ts

docs/ui/<feature>/<page>/40-production/
├── <Page>.psd
├── asset-manifest.json
├── assembly-recipe.json
├── generated/
│   ├── psd-handoff-ir.json
│   ├── editor-assembly-plan.json
│   └── editor-id-map.snapshot.json
├── staging/
│   ├── png/
│   ├── composite/
│   └── reports/
└── evidence/
    ├── review.json
    └── receipt.json

tmp/psd-pipeline/<batchId>/<runId>/
├── fairygui-project/
├── publish/
├── diff/
└── logs/
```

正式 FairyGUI 设计源仍位于 `apps/art/fairygui/`。编译器对该目录只有读取和复制权限；写操作必须由路径守门器
拒绝。正式发布目录也不作为候选输出目录。

## 6. PSD 制作规范

### 6.1 文件基线

- 使用 PageSpec 指定的设计画布；Underground Idle 主界面当前基线是 750×1624 竖屏。
- 使用 RGB、8 bit、锁定的 sRGB 色彩空间；禁用未嵌入的外部色彩配置。
- 智能对象默认嵌入。确需链接文件时，链接必须在批次 manifest 中登记且解析后仍位于工作区允许目录。
- 字体必须登记版本和授权。缺失字体直接阻断，不允许静默替换后继续导出。
- 不支持或跨渲染器不一致的图层效果必须经批准后栅格化；原始效果层保留在不可导出的 source 组。
- 所有运行时文字保持独立 Type Layer，只用于排版参考；导出的运行资产不得烘焙中文、数值、等级或价格。
- 透明热区使用独立 Shape Layer；视觉图层本身默认不承担点击范围。
- 九宫格边框保留完整四角和边缘；stretch inset 写入 manifest，不依赖肉眼重猜。
- Layer Comp 用于状态视觉 A/B，不作为 Controller 真源。

### 6.2 图层命名语法

推荐使用简短、可解析、与中文显示名分离的命名：

```text
GROUP::<stableKey>
IMG::<stableKey>
NINE::<stableKey>
TEXT::<slotId>::<fguiName>
HIT::<hotspotId>::<fguiName>
LOADER::<stableKey>
IGNORE::<reason>
```

示例：

```text
GROUP::scene.upper_mine
IMG::scene.upper_mine.background
NINE::ui.storage.panel
TEXT::T01::txt_storage_current
HIT::H04::btn_collect
LOADER::character.glen
```

Layer Comp 可以使用：

```text
SCENARIO::undergroundIdle.initial
CTRL::production::PAGE::balanced
CTRL::storage::PAGE::full
```

命名只承担角色和 stable key 映射。以下内容禁止塞进图层名：坐标、尺寸、九宫格 inset、哈希、Relation 数值、
FairyGUI 内部 ID、完整本地化文本或业务公式。

### 6.3 命名校验

`psd:inspect` 必须拒绝：

- 重复 stable key、slot ID 或 hotspot ID；
- 未知角色前缀和非法字符；
- `../`、绝对路径、控制字符或可能逃逸输出目录的名称；
- `TEXT` 层被设置为运行图片输出；
- `HIT` 层带可见像素输出；
- `NINE` 层在 manifest 中没有 inset；
- PageSpec 中的 required key 在 PSD 和装配配方中均缺失；
- 同一 key 同时声明为多种互斥角色。

PSD 自带 layer ID 只可写入审计日志，不能当作跨保存稳定身份。

## 7. 用 sidecar 表达 PSD 无法表达的 FairyGUI 语义

### 7.1 能力映射

| FairyGUI / 运行时能力 | PSD 中的提示 | 权威表达 | CLI 产物 |
| --- | --- | --- | --- |
| Controller / Page | Layer Comp 可给视觉样例 | PageSpec + `assembly-recipe.json` | 候选 Controller 和 page |
| Gear | 不从可见性自动猜 | `nodeKey + controllerKey + pageKey + property` | 候选 gear 条目 |
| Relation | 可从 bbox 提供初始几何 | 语义 Relation DSL | 候选 Relation |
| 热区 | `HIT::<id>::<name>` Shape Layer | hotspot recipe + G2 契约 | 透明 Button/Graph |
| 内部 ID | 不表达 | Editor | 临时候选 ID + 正式只读 snapshot |
| 九宫格 | `NINE::<key>` | asset manifest 四边 inset | 候选资源 scale9Grid |
| 安全区 | 可有预览 guide | PageSpec + 运行时 safe inset | 容器、Relation 和运行时 hook |
| 文字 | `TEXT::<slot>::<name>` | 文案 key、字体 token、运行时数据 | `GTextField` 占位节点 |
| Loader | `LOADER::<key>` | recipe 与包依赖 | `GLoader` 候选节点 |
| List/defaultItem | 可提供单个 cell 视觉 | recipe + 独立 cell 组件 | `GList` 和 defaultItem 引用 |

### 7.2 装配配方示例

以下是概念示例，最终字段以 JSON Schema 和 golden project 反推结果为准：

```json
{
  "schemaVersion": 1,
  "target": {
    "package": "UndergroundIdle",
    "component": "UndergroundIdleMain",
    "size": { "width": 750, "height": 1624 }
  },
  "ownership": {
    "mode": "cli-managed-component",
    "allowedComponent": "UndergroundIdleMain"
  },
  "controllers": [
    {
      "key": "storage",
      "name": "storage",
      "pages": ["normal", "nearFull", "full"]
    }
  ],
  "nodes": [
    {
      "key": "ui.storage.panel",
      "type": "image",
      "resource": "ui.storage.panel",
      "relations": [
        { "target": "parent", "kind": "center-center" },
        { "target": "parent", "kind": "width" }
      ],
      "gears": [
        {
          "controller": "storage",
          "property": "color",
          "values": {
            "normal": "#FFFFFF",
            "nearFull": "#FFE6A0",
            "full": "#FFB0A0"
          }
        }
      ]
    },
    {
      "key": "text.storage.current",
      "type": "text",
      "name": "txt_storage_current",
      "textKey": "ui.underground.storage.current",
      "sample": "999.9K",
      "fontToken": "ui.body.numeric"
    },
    {
      "key": "hit.collect",
      "type": "button",
      "name": "btn_collect",
      "hotspot": "H04"
    }
  ],
  "safeArea": {
    "policy": "runtime-insets",
    "topContainer": "ui.top",
    "bottomContainer": "ui.bottom",
    "contentContainer": "scene.content"
  }
}
```

### 7.3 Relation 使用语义枚举

配方不得保存 Editor 私有的裸数字枚举。对外 schema 使用稳定的语义词，例如：

```text
left-left
left-center
right-right
top-top
middle-middle
bottom-bottom
width
height
size
center-center
```

固定 Editor 版本的 adapter 负责把语义枚举转换为候选 XML。Editor 版本变化时，只替换 adapter 并重跑
golden test，不让业务配方感知私有编码。

### 7.4 Controller 与 Gear 不做图像推断

Layer Comp 可以验证某个状态的视觉结果，但脚本不能因为某层在 Comp 中隐藏，就自动创造业务 Controller 或 Gear。
Controller 的维度、page 名和默认 page 来自 PageSpec；Gear 的属性和值来自装配配方。自动化只允许做一致性检查：

- recipe 中每个 required page 是否有 Scenario；
- Layer Comp 引用的 controller/page 是否存在；
- 每个 Gear 的目标节点和 page 是否存在；
- 可见性、位置、尺寸、颜色等属性是否属于白名单；
- 默认 page 是否显式声明。

### 7.5 热区

`HIT` Shape Layer 提供初始矩形或多边形。编译器把它转换为透明、可命名的交互对象，并应用项目命名前缀：
`btn_`、`tge_`、`txt_`、`ld_`、`ld3_`、`lst_`、`img_`、`go_`、`jb_`、`pg_`。

热区尺寸必须满足 G2 点击区契约。视觉按钮可以小于热区；热区不得跟随局部发光或阴影的 Alpha 边界自动收缩。

### 7.6 九宫格

九宫格事实写入 `asset-manifest.json`：

```json
{
  "key": "ui.storage.panel",
  "source": "UndergroundIdleMain.psd#NINE::ui.storage.panel",
  "output": "ui_storage_panel.png",
  "width": 420,
  "height": 168,
  "scale9": { "left": 32, "top": 28, "right": 32, "bottom": 28 }
}
```

校验必须确认四边 inset 非负、中心可拉伸区域大于零、圆角与装饰不落入拉伸区，并生成最小/基准/最大尺寸的
A/B 预览。最终九宫格配置经 Editor 重开后再从正式工程反解析对账。

### 7.7 安全区

PSD 和 FairyGUI 不能独立决定设备安全区。推荐把页面拆为 `safeTop`、`content`、`safeBottom` 三个语义容器：

- CLI 编译器创建容器、锚点和 Relation；
- Creator/宿主读取真实 safe inset；
- View 或统一适配器只把 inset 应用到声明的容器；
- 背景可铺满屏幕，交互和关键信息保持在安全区内；
- 750×1624、短屏、刘海屏、圆角和底部手势区分别进入 Scenario 验收。

safe inset 数值不得写入 PSD 图层名、PNG 或 FairyGUI 固定坐标。

## 8. 中间产物

### 8.1 `PsdHandoffIR`

`PsdHandoffIR` 是由 PSD 和 manifest 生成的只读快照，至少包含：

- schema、批次和页面版本；
- PSD 路径、文件哈希、画布、色彩空间；
- 解析器、像素渲染器和字体锁版本；
- 图层树、stable key、角色、bbox、可见性、混合模式；
- 文字槽、热区、Layer Comp 和导出资产；
- 外部智能对象、缺失字体、不支持效果等警告；
- 每个 PNG 的尺寸、Alpha bbox、hash 和来源层集合。

它不能手改。输入变化后必须整体重建。

### 8.2 `EditorAssemblyPlan`

该文件由 `PsdHandoffIR + PageSpec + assembly-recipe + 正式工程只读 IR` 编译，至少包含：

- 目标包、组件和 authoring mode；
- 正式基线 revision/hash；
- 允许写入的组件和子树；
- 新增/替换资源列表；
- 节点树、层级、名称、位置和尺寸；
- Controller、page、Gear、Relation、transition；
- List、Loader、defaultItem 和包依赖；
- 九宫格、pivot、触摸和安全区意图；
- 预期文件变更和禁止变更；
- Editor takeover 与发布后的对账项。

该 plan 同样是只读派生物。需要改动时回到 PageSpec、PSD、manifest 或 recipe。

### 8.3 receipt

每个批次最终生成 receipt，至少记录：

- 所有输入文件和哈希；
- 命令行工具、PSD 解析器、像素渲染器、FairyGUI Editor、Cocos Creator 版本；
- 临时工程基线、装配 plan 哈希和候选 diff；
- Editor 打开、保存、关闭、重开和正式发布的人工确认；
- 正式 XML/`package.xml` 与发布闭包哈希；
- codegen、manifest、同步、测试和 Creator Scenario 结果；
- 审美批准人、技术批准人、日期和已知例外。

receipt 不能自行代表审美批准或 Editor 操作成功；它只收集可追溯证据。

## 9. CLI 工具设计

### 9.1 命令状态约定

本节所有 `psd:*` 命令均为**计划命令**，仓库当前尚不存在。实现前先在 `package.json` 登记，再为每条命令补
`--help`、JSON Schema、退出码和测试。本文后面明确标为“现有”的命令才可以立即运行。

### 9.2 计划命令

```bash
# [计划] 只读检查 PSD、命名、字体、色彩空间和 manifest
npm run psd:inspect -- \
  --psd docs/ui/<feature>/<page>/40-production/<Page>.psd \
  --page-spec docs/ui/<feature>/<page>/page-spec.json \
  --manifest docs/ui/<feature>/<page>/40-production/asset-manifest.json \
  --out docs/ui/<feature>/<page>/40-production/generated/psd-handoff-ir.json

# [计划] 使用锁定的像素渲染 adapter 导出 staging PNG
npm run psd:extract -- \
  --ir docs/ui/<feature>/<page>/40-production/generated/psd-handoff-ir.json \
  --out docs/ui/<feature>/<page>/40-production/staging/png

# [计划] 重组无字页面、状态板和九宫格拉伸预览
npm run psd:composite -- \
  --ir docs/ui/<feature>/<page>/40-production/generated/psd-handoff-ir.json \
  --out docs/ui/<feature>/<page>/40-production/staging/composite

# [计划] 生成只读 EditorAssemblyPlan 和预期 diff
npm run psd:plan -- \
  --ir docs/ui/<feature>/<page>/40-production/generated/psd-handoff-ir.json \
  --recipe docs/ui/<feature>/<page>/40-production/assembly-recipe.json \
  --baseline apps/art/fairygui \
  --out docs/ui/<feature>/<page>/40-production/generated/editor-assembly-plan.json

# [计划] 复制正式基线并只在临时完整工程中编译候选
npm run psd:compile:fgui -- \
  --plan docs/ui/<feature>/<page>/40-production/generated/editor-assembly-plan.json \
  --baseline apps/art/fairygui \
  --mode rawProjectCompiler \
  --out tmp/psd-pipeline/<batchId>/<runId>/fairygui-project

# [计划] 静态结构、引用闭包、ID 冲突和预期 diff 守门
npm run psd:verify:fgui -- \
  --plan docs/ui/<feature>/<page>/40-production/generated/editor-assembly-plan.json \
  --candidate tmp/psd-pipeline/<batchId>/<runId>/fairygui-project

# [计划] 调用官方 Editor CLI 发布候选到隔离目录，仅作解析/闭包验证
npm run psd:publish:fgui -- \
  --project tmp/psd-pipeline/<batchId>/<runId>/fairygui-project \
  --out tmp/psd-pipeline/<batchId>/<runId>/publish

# [计划] 汇总证据；缺失人工确认时 receipt 必须保持 incomplete
npm run psd:receipt -- --batch <batchId>
```

所有命令默认 dry-run；任何写入命令都必须显式给出 `--out`，且输出路径只能位于批准的 staging 或 `tmp/psd-pipeline`
根下。禁止用当前工作目录、`~`、`$HOME` 或未解析的环境变量作为删除或覆盖目标。

### 9.3 PSD 解析与像素渲染分离

PSD 结构解析器和像素渲染器是两个 adapter：

- 结构解析器读取图层树、名称、bbox、文字信息、Shape 和 Layer Comp；
- 像素渲染器负责与批准视觉一致的 PNG；
- Node PSD 库可以作为结构解析候选，但在 golden test 证明前，不得假设它能忠实渲染全部 Photoshop
  图层效果、混合模式、智能对象和字体；
- 美术生产推荐优先使用锁定版本 Photoshop 的原生批处理导出；无 Photoshop 的 CI 只验证已批准 PNG、哈希、
  manifest 和结构，不重新解释像素；
- 任何 renderer 变化都必须使全部 PNG hash 失效并重新走 G5 A/B 审阅。

### 9.4 FairyGUI XML codec

编译器必须使用结构化 XML codec，而非正则或字符串模板。要求：

- 禁用外部实体和网络解析，防止 XXE；
- 保留未知元素、未知属性、命名空间和能保留的顺序；
- 解析后无修改再序列化，在 golden project 上应为零语义 diff；
- 对确定性输出使用固定换行、编码和排序策略；
- 任何未知且可能影响运行的字段都令写入失败，不得丢弃后继续；
- package/component codec 按锁定 Editor 版本分目录实现；
- Editor 升级必须创建新 adapter，不在原 adapter 上静默兼容。

### 9.5 候选 ID 分配

`rawProjectCompiler` 为临时工程分配候选 ID 时必须：

1. 扫描临时工程内全部 package、resource、component、child、controller 和 page ID；
2. 以批次锁和目标包为命名空间，生成固定长度、符合已验证格式的候选 ID；
3. 同一输入重复编译得到相同 ID；
4. 任意碰撞立即退出，不尝试覆盖；
5. 不仅凭显示名生成 ID；显示名可改，stable key 和目标路径共同参与映射；
6. Editor takeover 后丢弃候选发号权，只记录正式 snapshot。

候选 ID 算法需要两个结构不同的包做 golden test，并验证 Editor 保存—重开后引用仍闭合。

## 10. 两阶段编译器

### 10.1 阶段 A：`seededTemplate`

这是首个可落地版本，也是 raw compiler 的安全垫：

- 人工用 Editor 创建临时完整工程、包、叶子组件、资源槽和真实种子 ID；
- CLI 只填充明确授权的隔离组件 XML，或替换已登记槽位对应的 PNG；
- 不新增 package item，不修改 `package.xml`；
- 不跨包创建依赖；
- 每次生成后仍走 Editor 保存—关闭—重开。

优点是风险低、容易验证；缺点是无法自动新增任意资源和组件，模板槽必须预先准备。它适合先验证 PSD naming、
IR、资产导出、Controller/Gear/Relation codec 和 diff 守门。

### 10.2 阶段 B：`rawProjectCompiler`

这是长期目标，用命令行覆盖原 Editor 插件计划能力：

- 在临时完整工程内新增资源和 package item；
- 创建隔离 leaf component，逐步扩展到完整页面；
- 创建 Controller/page、Gear、Relation、transition、List/defaultItem 和包依赖；
- 写候选 `package.xml` 与组件 XML；
- 维护候选 ID、引用闭包和确定性 diff；
- 用官方 Editor CLI 在隔离发布目录做可解析性检查；
- 用桌面 Editor 完成最终接管。

启用条件：

- 先更新 `docs/FairyGUI.md` 的 ADR，使 `cliTempCompiler` 成为明示授权模式；
- 锁定 FairyGUI Editor 安装包、版本、工程 schema 样本和发布设置；
- 至少两个结构不同的 golden package 通过无修改 round-trip；
- 同一输入连续编译两次零 diff；
- Editor 保存—关闭—重开后无引用丢失、无未知字段丢失、无 ID 碰撞；
- 候选工程和正式工程在路径层面有硬隔离；
- 有完整回退和人工批准流程。

现有 [FairyGUI 设计源说明](../apps/art/fairygui/README.md) 只允许 UndergroundIdleMain 在特定 Gate 后做一次窄化的
raw XML 候选实验，且禁止写 `package.xml`。在上述 ADR 完成前，该现行限制优先于本文阶段 B。

### 10.3 所有权粒度

第一版只允许 `cli-managed-component`：编译器拥有一个完全隔离的叶子组件，人工不得在其内部维护混合子树。
人工对象通过外层 editor-owned 组件组合该叶子组件。

以后若要支持混合所有权，必须先证明 stable key 标记能被固定版本 Editor 保存—重开且不丢失；否则不做 subtree merge。
任何未带明确 CLI 所有权声明的对象都视为 editor-owned，编译器必须拒绝覆盖。

## 11. 完整生产流程

### 11.1 阶段 0：ADR 与工具链锁

1. 在 `docs/FairyGUI.md` 增加 `cliTempCompiler` authoring mode 和启用条件。
2. 明确正式设计源、临时工程、staging 发布和 Creator 发布目录。
3. 锁定 FairyGUI Editor、Photoshop/像素 renderer、Node、PSD parser 和 XML codec 版本与哈希。
4. 保存两个结构不同的最小 golden package：一个纯叶子组件，一个含 Controller/Gear/Relation/跨组件引用。
5. 记录官方 Editor CLI 的调用方式、发布输出和失败诊断边界。
6. 为正式路径增加写入守门测试，确保 `psd:*` 工具无法直接修改它。

退出条件：ADR 批准、工具版本可复建、golden project 可在固定 Editor 中打开和发布。

### 11.2 G0～G2：先冻结语义、Scenario 与几何

1. 冻结页面范围、平台、预算、非目标和验收责任。
2. PageSpec 列出所有字段、值来源、动作、异步结果和异常状态。
3. Scenario 覆盖 required Controller page、极值数字、长文本、无数据、锁定、满仓和错误态。
4. G2 定义区域、容器、滚动策略、点击热区、岗位 pivot、安全区和短屏规则。
5. `assembly-recipe.json` 只引用已冻结的 stable key，不发明业务语义。

退出条件：每个显示值有来源，每个操作有闭环，每个 required 状态可重复构造。

### 11.3 G3：视觉锁定

1. 选定 style anchor、色板、材质、字体 token 和黄金 target。
2. 确认概念图中哪些内容是视觉不变量，哪些文字、数值和功能只是占位。
3. 明确状态不能只依赖颜色表达。
4. 人工批准黄金 target；模型或脚本不能代替审美批准。

Underground Idle 应继续遵守 `UG-MAIN-GOLDEN-V02`、750×1624、Bitmap-first、无运行时文字和安全区规则。

### 11.4 G4：制作分层 PSD

1. 按语义区域和运行时职责拆层，而不是按视觉碎片随意切层。
2. 为资产、文字槽、热区、Loader 和九宫格应用第 6 节命名。
3. 被遮挡但运行时会移动或切换的对象完成补绘。
4. 运行时文字保留为独立 Type Layer，不进入 PNG 输出。
5. `asset-manifest.json` 登记来源、输出策略、尺寸、padding、pivot、九宫格和许可。
6. `assembly-recipe.json` 登记 Controller、Gear、Relation、List、Loader、热区和安全区意图。

退出条件：PSD、manifest、recipe 和 PageSpec stable key 闭合，无虚构层、无重复身份。

### 11.5 G5：检查与导出运行资产

1. 运行计划命令 `psd:inspect`，生成 `PsdHandoffIR`。
2. 对缺失字体、外链智能对象、未知效果、非法混合模式和路径逃逸零容忍。
3. 使用锁定 renderer 导出透明 PNG 到 staging。
4. 检查尺寸、Alpha bbox、半透明边、padding、pivot、功耗/纹理预算和命名。
5. 重组无字页面，和批准黄金 target 做确定性 overlay/A-B。
6. 为九宫格生成最小、基准、最大尺寸预览。
7. 人工审阅每张资产和重组结果，批准后冻结 PNG hash。

退出条件：G5 报告通过、人工批准、PNG hash 与 manifest 一致。

### 11.6 生成装配计划

1. 只读解析正式 `apps/art/fairygui/`，生成 `FguiProjectIR` 和基线 hash。
2. 编译 `PsdHandoffIR + PageSpec + recipe + FguiProjectIR`。
3. 检查 required node、资源、Controller page、Gear target、Relation target 和包依赖。
4. 生成 `EditorAssemblyPlan` 和人类可读预期 diff。
5. 审核预计新增、修改、删除对象；首版删除必须完全禁止。
6. 计划批准后冻结 plan hash。

退出条件：预期 diff 只覆盖授权组件，不触及 editor-owned 对象或正式发布目录。

### 11.7 创建临时完整工程

1. 创建唯一 `runId` 和 `tmp/psd-pipeline/<batch>/<runId>`。
2. 把正式 FairyGUI 工程只读复制为完整基线，保留设置、包依赖和发布配置。
3. 写入批次锁，记录正式基线 hash 和工作树 revision。
4. 将批准 PNG 复制到候选工程允许的资源目录。
5. 再次确认输出路径不等于正式工程、发布目录或工作区根。

临时工程可以整体丢弃；任何失败都不得通过“把临时 XML 覆盖回正式目录”修复。

### 11.8 编译候选 FairyGUI 工程

1. MVP 使用 `seededTemplate`；长期目标使用经 ADR 授权的 `rawProjectCompiler`。
2. 按 plan 创建或更新授权组件和资源。
3. 创建 Controller/page 后再创建引用它们的 Gear。
4. 先创建依赖组件和 defaultItem，再创建 List/Loader 引用。
5. 应用 Relation、pivot、触摸、九宫格和初始 page。
6. 分配候选 ID并扫描全工程冲突。
7. 生成实际 diff，并与预期 diff 逐项对账。
8. 再编译一次，要求第二次零 diff。

退出条件：静态 schema、引用闭包、ID、所有权、确定性和预期 diff 全部通过。

### 11.9 候选验证

1. 用 `FguiProjectIR` 重新解析候选工程，确认语义与 plan 相等。
2. 调用 FairyGUI 官方 CLI，把候选工程发布到隔离 `tmp/.../publish`。
3. 反解析发布物，检查 package、component、资源和依赖闭包。
4. 不仅根据进程退出码判断成功；还要检查预期文件、时间戳、结构、日志和 hash。
5. 保存候选截图、结构报告和发布日志。

官方 CLI 发布只证明候选可被发布，不代表 Editor takeover、审美或 Creator 集成已经通过。

### 11.10 Editor takeover

由于不开发 Editor 插件，本步骤保留明确的人机接力：

1. 用锁定版本 FairyGUI Editor 打开候选完整工程。
2. 检查目标包、组件、资源、Controller、Gear、Relation、List、Loader、九宫格和热区。
3. 保存工程，关闭 Editor。
4. 重新打开同一候选工程，确认结构、ID、引用、布局和发布设置未丢失。
5. 再次发布到隔离目录并与 takeover 前结果做语义 diff。
6. 记录人工确认和 Editor 日志。

若 Editor 重写了未知字段、丢失引用、改变语义或导致非授权 diff，立即丢弃候选并回到 codec/adapter；不得手工修补
后跳过 golden test。

### 11.11 接管到正式 FairyGUI 工程

正式接管遵循 Editor 支持的复制/导入和人工审阅流程：

1. 再次读取正式工程 hash；如果从 plan 生成后已有变化，批次作废并重新规划。
2. 在 Editor 中打开正式工程，使用 Editor 支持的包/组件复制或资源导入方式接管已验证组件。
3. 不把候选 `package.xml` 或组件 XML 直接覆盖到正式目录。
4. 由 Editor 在正式工程中分配或确认正式 ID、保存并关闭。
5. 重开正式工程，做第二次结构和视觉检查。
6. 从正式工程生成只读 `editor-id-map.snapshot.json` 和正式 `FguiProjectIR`。
7. 对比 plan 语义；允许 ID 与序列化顺序变化，不允许 Controller、Gear、Relation、资源或布局语义变化。

如果目标 Editor 版本没有可靠的组件导入/复制路径，退回人工 Editor 装配；不能把“缺少导入 API”变成直接覆盖
正式 XML 的理由。

### 11.12 G6：正式发布

1. 在正式 FairyGUI Editor 中检查发布设置和包依赖。
2. 使用 Editor 正式发布 `.bin`、图集和描述文件。
3. 验证发布闭包和结构 round-trip。
4. 禁止自研脚本生成或伪造 `.bin`、图集描述和 `.meta`。
5. 当前仓库尚无完整 staging/原子 promotion 基础设施时，继续遵守 `docs/FairyGUI.md` 的人工发布边界；本文的
   staging 目标不能被当作已有能力。

退出条件：Editor 保存—重开、正式发布、引用闭合、结构对账全部通过。

### 11.13 G7：现有接线流程

以下命令是仓库**现有**流程。前置条件是正式 Editor 已保存、重开并发布：

```bash
# 1. 从正式 XML 生成或重写 View AUTO 区块
npm run codegen:fgui -- <Package> <Component>

# 2. AUTO 区块外完成 View/Logic，并更新同目录 .view.json 与 feature.json

# 3. 刷新 feature、View、FGUI 契约、route 和 package catalog
npm --workspace @game/server run codegen:features

# 4. 人工审阅设计源、发布物、AUTO 区块、sidecar 和生成 catalog 后更新闭包锁
node scripts/fgui-manifest.mjs --write

# 5. 同步客户端真源到 Creator 工程壳
npm run sync:client

# 6. 自动检查
npm run typecheck:client
npm run typecheck:client:legacy
npm run test:client
npm run test:fgui
npm run verify:fgui
npm run verify:sync
```

不得手改生成 façade 或镜像。Creator 必须通过 Dashboard 打开工程并真实导入发布资源和脚本，生成或复用 `.meta`。

### 11.14 G8a/G8b：Creator 与目标平台验收

Creator UI Gallery 或实际页面至少覆盖：

- 初始、加载、空数据、正常、满仓、锁定、可领取、资源不足和网络错误；
- 每个 Controller required page；
- 最小/典型/最大数值，长中文、英文和缺失文案；
- 750×1624、短屏、目标 viewport、刘海、圆角和底部手势区；
- 热区、滚动、遮挡、层级、列表复用和 Loader 缺失资源；
- 图集串色、Alpha 边缘、九宫格拉伸和实际压缩纹理；
- 交付承诺要求时的真机内存、帧率和输入响应。

UI 自动截图只能证明可重复状态；最终视觉和交互仍需人工验收。

### 11.15 G9：冻结与回流

1. 生成完整 receipt，状态从 `incomplete` 变为 `accepted` 前必须具备人工签名。
2. 冻结 PSD、manifest、recipe、批准 PNG、正式设计源、发布物和闭包 hash。
3. 记录哪些产物需要入库、哪些仅保存在构建证据中。
4. 缺陷按最早错误真源回流：像素回 PSD，资产规则回 manifest，语义回 PageSpec/recipe，结构回 CLI adapter 或 Editor，
   运行时行为回 View/Logic。
5. 任一上游真源变化都使下游 receipt 失效，必须重新走受影响 Gate。

## 12. 测试与质量门

### 12.1 单元测试

- 图层命名解析、重复 key、非法路径和控制字符；
- JSON Schema、语义 Relation 枚举和 Gear 属性白名单；
- Alpha bbox、padding、pivot 和九宫格 inset；
- 候选 ID 确定性、碰撞和全项目扫描；
- 所有权边界和正式路径写入拒绝；
- XML 外部实体禁用、未知字段保留和 canonical diff；
- baseline 漂移、expected diff 与 actual diff；
- 删除操作默认拒绝。

### 12.2 golden PSD

至少准备：

1. 透明图片、嵌套组和普通导出；
2. Type Layer、热区 Shape、九宫格和 Layer Comp；
3. 智能对象、蒙版、混合模式和已批准的栅格化效果；
4. 缺失字体、外链丢失、重复 key 和路径逃逸的失败样本。

同一工具版本的导出必须 hash 稳定；工具升级后允许 hash 变化，但必须重新人工 A/B。

### 12.3 golden FairyGUI project

至少准备两个结构不同的工程：

- A：单包叶子组件，含图片、文字、Button、九宫格和 Relation；
- B：多组件或多包依赖，含 Controller/page、Gear、List/defaultItem、Loader 和 transition。

每个工程执行：

```text
parse → no-op serialize → zero semantic diff
compile → compile again → zero diff
Editor open/save/close/reopen → semantic equivalence
official publish → published closure/round-trip equivalence
```

### 12.4 集成测试

- 正式 baseline 在 plan 后变化时必须阻断；
- 多个批次并发写同一包时必须加包级锁或阻断；
- 候选工程无法发布时不得进入 takeover；
- Editor takeover 后发生非授权 diff 时不得进入正式工程；
- 正式发布物缺文件、旧时间戳或闭包不一致时不得运行 codegen；
- codegen、feature codegen、manifest、sync 和 Creator 导入形成一条可追溯链。

## 13. 安全、并发与回退

### 13.1 输入安全

- 限制 PSD 最大尺寸、图层数、嵌套深度和解压后内存；
- 禁止 XML 外部实体和网络 schema；
- 所有输出路径经过 `realpath` 和允许根校验；
- 不把图层名拼接成 shell 命令；
- 外链智能对象必须在 allowlist 内；
- 临时文件先写新文件、校验后原子 rename；
- 删除只允许作用于 receipt 明示的临时批次目录，默认不自动清理。

### 13.2 并发

- 计划生成时记录正式工程 revision/hash；
- 每个目标 package/component 使用独占批次锁；
- 正式接管前重新比较 baseline；
- 任一漂移都重新生成 plan，不做三方猜测 merge；
- 两个批次修改同一组件时，后一个必须基于前一个正式接管后的新基线重跑。

### 13.3 回退

- 临时工程失败：整体丢弃该 `runId`，正式工程不受影响；
- PSD/PNG 失败：回到 PSD 或 manifest，不在 FGUI 中补像素；
- codec 失败：修 adapter 和 golden test，不手工修候选 XML后继续；
- Editor takeover 失败：保留日志和 diff，丢弃候选；
- 正式接管失败：由 Editor 撤销或从接管前完整备份恢复，不使用 `git reset --hard`；
- Creator 失败：修正式设计源/发布设置或客户端接线，重新发布与导入。

每次正式接管前都保留最近一个 G6 通过的完整 Editor 工程备份和发布闭包。

## 14. 分阶段实施路线

### Phase 0：决策与锁定

- 更新 FairyGUI ADR，正式选择 `cliTempCompiler`，删除“生产目标是 Editor 插件”的歧义。
- 锁定 Editor/Photoshop/parser/codec 版本和哈希。
- 建立目录、schema、命令退出码和禁止写正式路径的守门测试。

退出标准：只读 POC 可重复，现有人工流程不受影响。

### Phase 1：只读 PSD inspector

- 实现命名解析、字体/智能对象/效果检查和 `PsdHandoffIR`。
- 不输出运行资产，不写 FairyGUI。
- 建立四类 golden PSD。

退出标准：同一 PSD 的 IR 稳定，所有失败样本被正确阻断。

### Phase 2：资产导出与 G5

- 接入锁定 renderer，导出 staging PNG。
- 实现 Alpha、padding、pivot、九宫格、重组预览和 hash。
- 建立人工 A/B 与批准记录。

退出标准：一组 leaf assets 能通过 G5，未触碰 FairyGUI 设计源。

### Phase 3：`seededTemplate` 编译器

- Editor 人工建立叶子组件模板和资源槽。
- CLI 生成节点、Controller、Gear、Relation 和热区候选。
- 完成 expected diff、二次零 diff、Editor round-trip 和隔离发布。

退出标准：一个孤立 leaf component 连续三批次可复现，Editor 重开无语义漂移。

### Phase 4：`rawProjectCompiler`

- 实现 package/component codec、候选 ID、资源新增和依赖闭包。
- 通过两个结构不同的 golden package。
- 实现 baseline 锁、包级并发锁、正式路径硬隔离和 receipt。

退出标准：临时工程新增 package item 和组件后可被 Editor 接管，重复编译零 diff，未知字段无丢失。

### Phase 5：页面级试点

- 先选择结构小、状态明确的真实组件，而不是直接上复杂主界面。
- 顺序建议：九宫格面板 → 带 Controller/Gear 的按钮或进度组件 → 小型弹窗 → 主页面。
- 每提升一级复杂度都新增 golden case 和 Creator Scenario。

退出标准：页面级结构、运行时文字、热区、安全区和多状态在 Creator 中通过 G8a。

### Phase 6：生产化

- 建立正式 staging/promotion 机制和完整 receipt。
- 将视觉截图、结构 diff、发布闭包和 Creator Gallery 串为审阅入口。
- 定义 Editor/Photoshop 升级演练与回退。

退出标准：至少两个不同页面、两个包完成端到端交付，且人工成本和失败率达到团队接受阈值。

## 15. Underground Idle 试点建议

Underground Idle 当前主界面玩法、FairyGUI 包和客户端接线尚未实施，G4 manifest 候选待联合审阅、G5 未关闭。
因此不要把 `UndergroundIdleMain` 作为编译器的第一个样本。

推荐顺序：

1. 从批准黄金 target 中选择一个无文字九宫格面板，验证 PSD → PNG → manifest → Editor 资源配置。
2. 选择一个独立收取按钮，验证 `normal/pressed/disabled`、热区和文字槽。
3. 选择仓库容量组件，验证 `normal/nearFull/full` Controller、Gear、长数字和九宫格。
4. 选择一个建筑卡或弹窗，验证 Loader、List/defaultItem 和跨组件引用。
5. G4、G5 和现有文档要求的 Gate A 全部关闭后，再把 `UndergroundIdleMain` 作为页面级试点。

主界面试点必须同时遵守：

- 750×1624 六区结构；
- 标题、资源、仓库、指标和底栏固定；
- 四个核心热区、岗位 pivot 与核心按钮不随成长状态移动；
- 刘海、圆角和底部手势区由运行时安全区处理；
- 背景和装饰不含运行时文字、等级、价格或容量；
- 状态差异优先使用局部差异层和同一 Controller，不为每个状态生成整页位图。

具体视觉与几何契约见：

- [《Underground Idle》策划案](undergroundIdle/README.md)
- [美术表现与资产制作方案](undergroundIdle/07-art-direction.md)
- [UndergroundIdleMain FairyGUI 装配契约](undergroundIdle/09-fairygui-undergroundidle-main-assembly.md)
- [黄金位图到 FairyGUI Editor 生产流程](undergroundIdle/10-image-to-fairygui-live-plan.md)

## 16. 完成定义

只有同时满足以下条件，才能声称 CLI-first 流水线完成一个组件或页面：

- PageSpec、Scenario、PSD、manifest 和 recipe 的 stable key 闭合；
- PSD 无运行时文字烘焙，PNG 通过 G5 和人工 A/B；
- `EditorAssemblyPlan` 和预期 diff 已审阅；
- 候选只生成于临时完整工程；
- 重复编译零 diff，引用、ID 和所有权检查通过；
- 官方 CLI 隔离发布的闭包和结构通过；
- 固定版本 Editor 完成打开、保存、关闭、重开；
- 正式工程由 Editor 接管、再次保存—重开并正式发布；
- 正式内部 ID snapshot、XML 和发布物完成对账；
- `codegen:fgui`、feature codegen、manifest、sync 和自动测试通过；
- Creator 真实导入 `.meta` 并完成 required Scenario 与安全区验收；
- receipt 完整且有审美、技术和测试责任人的确认。

## 17. 明确禁止的捷径

- 让 CLI 直接写 `apps/art/fairygui/` 或正式发布目录。
- 把 PSD 图层名、PSD layer ID 或 hash 当作 FairyGUI 内部 ID。
- 从图层可见性自动猜 Controller、Gear 或业务状态。
- 用正则、字符串替换或未经 golden test 的 AST merge 修改 `package.xml`。
- 把中文、数值、等级、价格和容量烘焙进运行 PNG。
- 用整页位图代替组件、Controller、热区和运行时文字。
- 仅凭官方 Editor CLI 退出码宣称发布成功。
- 自研生成 `.bin`、图集描述或 Creator `.meta`。
- 候选失败后把临时 XML 手工复制到正式工程“抢救”。
- 把本文的 `psd:*`、FguiProjectIR、staging、receipt 或 Gallery 当作当前已有能力。
- 在 G4/G5 未关闭前，把 UndergroundIdleMain 的临时 raw XML 候选当成正式设计源。

## 18. 参考资料

- [FairyGUI UI 生产、装配与自动化工作流](FairyGUI.md)
- [客户端开发](CLIENT.md)
- [FairyGUI 设计源说明](../apps/art/fairygui/README.md)
- [FairyGUI 官方：发布](https://www.fairygui.com/docs/editor/publish)
- [FairyGUI 官方：包与 package.xml](https://www.fairygui.com/docs/editor/package)
- [FairyGUI 官方：导入和导出](https://www.fairygui.com/docs/editor/export)
