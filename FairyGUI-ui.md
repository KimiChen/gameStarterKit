# 从完成策划案到可运行 FairyGUI UI 的通用生产工作流

> 文档版本：1.0<br>
> 编写日期：2026-08-31<br>
> 适用范围：任意玩法或业务模块，不绑定 `Idle` 及其他具体项目<br>
> 当前仓库技术栈：Cocos Creator 3.8.8 + FairyGUI 1.2.2 + TypeScript

本文设计一条从“已经完成的策划案”到“可以在 Creator 中真实运行并验收的 UI”的完整生产链，并给出每个阶段可直接复用的提示词。

本文描述的是工作流和交付契约，不代表所有自动化工具已经实现。当前仓库已经具备 FairyGUI Editor 工程、发布链、View codegen、结构契约与测试；`layout.json → 切图/XML` 编译器、`ids.lock.json` 和对应命令仍属于可选的后续建设目标，不能当作现成功能使用。

---

## 1. 推荐结论

推荐采用“带阶段门的混合式 UI 生产编译链”，而不是试图用一条大提示词把策划案直接变成可运行页面：

```text
策划与业务真源
  → G0 策划冻结
  → G1 UI 需求契约与状态矩阵
  → G2 线框、布局与交互契约
  → G3 视觉风格锚点与整页效果图
  → G4 生产拆层与资产清单
  → G5 独立运行资产生产
  → G6 FairyGUI 装配、Editor 往返与发布
  → G7 View / Logic / 数据 / 事件接线
  → G8a Creator 真实运行与全状态集成验收
  → G8b 目标平台/真机验收（交付承诺需要时）
  → G9 冻结、版本化与变更回流
```

这条链有三条并行但不能互相替代的真源：

- 语义线：策划规则 → 页面流程 → 状态矩阵 → 数据和动作契约。
- 视觉线：风格锚点 → 整页效果图 → 经批准的独立生产资产。
- 工程线：布局契约 → FairyGUI 组件 → 程序接线 → 真实运行证据。

提示词只是执行配方，不是项目真源；模型输出也只是候选物。只有经过对应 Gate 批准并写入版本库的契约、源图、资产、设计源、代码和验收证据，才能成为下游输入。

### 1.1 为什么不做“一键从效果图到程序”

一张扁平效果图不包含这些信息：

- 被遮挡物体的完整像素和真实透明边；
- 哪些文字、数字、头像和图标是运行时动态内容；
- 节点树、点击热区、轴心、锚点、层级和安全区关系；
- Controller、page、Gear、Relation、列表模板和状态转移；
- FairyGUI package/resource/component/child 的稳定 ID；
- 数据来源、网络等待、错误、重连、重复点击和生命周期语义。

因此“看起来像最终页面”与“可维护、可运行、可验证”必须是两个阶段。视觉模型负责候选像素，人和结构化契约负责语义，确定性工具和 Editor 负责可重建产物，程序负责运行行为。

### 1.2 完成定义

只有同时满足以下条件，页面才算完成：

1. 策划中的每个用户路径、显示字段、操作和异常分支都能追溯到 UI 契约。
2. 默认、加载、正常、空、错误、锁定、断线、资源不足等实际需要的状态都有明确表现。
3. 效果图中的每个可见部分都能映射到运行时文本、FGUI 图元、Loader 或已批准美术资产。
4. FairyGUI Editor 可以完整打开、保存、重开和发布，无缺失引用或不可解释修复。
5. View、Logic、数据、事件、异步取消和页面生命周期均已接线并有测试。
6. 通过 Cocos Dashboard 打开的 Creator 真实预览覆盖全部状态和目标尺寸。
7. 若交付范围包含移动安全区、压缩纹理或低端机性能承诺，目标平台构建和真机矩阵也已通过；Creator 预览不能替代这些证据。
8. 自动检查、运行截图或录像、缺陷记录和批准结论均可复核。

---

## 2. 核心原则

### 2.1 每个阶段只有一个权威真源

同一事实不能长期存在两个可独立修改的版本。例如：坐标若以 `layout.json` 为真源，标注图必须由它反向生成；不能先手动画标注图，再从标注图抄坐标。机器生成的 XML 和 Editor 人工维护的 XML 也不能由双方同时拥有。

布局必须在批次开始时选择一种模式，不能混用：

- `layoutMode: editor`：当前仓库 M0 默认。线框/JSON 是批准后的 handoff 与验收规范，FairyGUI Editor 设计源是最终结构和坐标真源；没有 renderer 时标注图可以人工制作，但必须明确它不是机器反绘证据。
- `layoutMode: machine`：仅在 M1 的 Schema、编译器、稳定 ID 和 Editor round-trip 全部通过后启用。此时 `layout.json` 才是坐标真源，annotation、运行切图和 machine-owned XML 必须由它确定性生成，Editor 不得反向修改对应组件。

### 2.2 效果图、生产源和运行资产严格分离

- 效果图：用于审美、构图和信息层级评审，可以是扁平图。
- 生产源：分层母版、独立透明件、原始矢量、骨骼源或经批准的九宫格源图。
- 运行资产：经过尺寸、Alpha、裁切、pivot、压缩和图集策略校验后进入 FairyGUI/Cocos 的文件。

效果图默认禁止直接进入运行目录。只有明确批准为 `fullCanvas` 的整层图片，才可以作为运行资产来源。

### 2.3 模型只做有证据的工作

模型不得猜测策划中没有的数据、布局中没有的热区、效果图中看不见的图层、已有 FGUI 包中的 ID，或运行时中不存在的接口。证据不足时输出 `TBD`、`needs_decision` 或 `needs_source`，而不是补造一个看似合理的答案。

### 2.4 一轮只解决一个问题

视觉迭代要明确“本轮允许改变什么”和“哪些内容必须保持不变”。例如只修改按钮材质时，不允许同时改变构图、角色比例、色板或光向。OpenAI 当前图像生成提示指南同样建议明确约束、反复声明不变量，并用小步迭代代替一次塞入过多变化；本文的图片提示词按这一结构设计。参见 [OpenAI GPT Image Generation Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)。

### 2.5 生成只覆盖 machine-owned 文件

自动生成器只能整文件重建明确标记为 `machine-owned` 的文件。人工维护的页面外壳、复杂列表、Transition 和交互组件属于 `editor-owned`。生成器不得局部猜测并覆盖人工子树。

唯一可能的受控例外是 `package.xml` 的资源登记：只有在项目先修改现行“XML 只由 Editor 修改”政策、取得明确文件授权并实现白名单 AST 合并与 round-trip 测试后，工具才能增改自己登记的条目。这个例外不代表生成器拥有 `package.xml` 的其他内容，更不允许它修改 Editor-owned 组件树。

### 2.6 任何修复都回到最早的错误真源

- 玩法、状态或数据错误：回 UI 契约。
- 坐标、层级、热区或适配错误：回布局契约或 FairyGUI 设计源。
- 色板、造型、透明边或 pivot 错误：回生产美术源。
- Controller、Relation、包引用错误：回 FairyGUI 设计源。
- 绑定、事件或生命周期错误：回 View/Logic。

禁止直接修改 `.bin`、atlas、Creator `.meta`、同步镜像或其他生成物来掩盖上游问题。

---

## 3. 角色、真源与建议目录

### 3.1 职责划分

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| 策划 | 玩法规则、状态、数据定义、用户路径、验收标准 | 像素坐标、透明切图、程序接口猜测 |
| UI/UX | 页面地图、线框、交互、信息层级、状态矩阵、适配规则 | 编造业务规则、从效果图恢复隐藏图层 |
| UI 美术 / ImageGen 操作者 | 风格锚点、效果图、独立生产源、视觉一致性 | Controller、数据字段、FairyGUI ID |
| 技术美术 / UI 工程 | 资产清单、Alpha、pivot、九宫格、图集策略、FairyGUI 装配 | 在 View 中实现业务规则 |
| 客户端程序 | View/Logic、数据映射、事件、生命周期、错误与重连 | 手修美术生成物、把业务写进设计源 |
| QA | 全状态、全尺寸、异常路径、性能和回归证据 | 只看默认截图就判定完成 |
| 自动生成器 | 可重复、确定性的 machine-owned 输出 | 与 Editor 双写、伪造发布物、补造缺失语义 |

### 3.2 推荐真源

| 内容 | 权威真源 | 说明 |
| --- | --- | --- |
| 玩法与业务 | 已冻结策划案 | 规则、数值、解锁、奖励和失败语义 |
| UI 需求 | `ui-requirements.yaml` | 页面、数据、动作、反馈和非目标 |
| 页面状态 | `state-matrix.yaml` | 状态判定、Controller 维度和转换 |
| 线框与坐标 | `layoutMode: editor` 时为 FairyGUI Editor 设计源；`layoutMode: machine` 时为 `*.layout.json` | M0 的 JSON 只是 handoff/验收规范，不能与 Editor 并列为最终坐标真源 |
| 视觉语言 | 批准的 style anchor + `style-tokens.yaml` | 色板、材质、描边、圆角、光向和禁止漂移项 |
| 视觉目标 | 批准的整页效果图 | 只决定外观和构图，不直接证明可切层 |
| 美术生产 | `asset-manifest.json` + 批准源文件及哈希 | 每个资产的来源、尺寸、Alpha、pivot 和策略 |
| FGUI ID | `ids.lock.json` | 仅在未来自动化启用时使用，append-only |
| FGUI 结构 | 当前默认由 FairyGUI Editor 工程负责 | machine-owned 组件启用后才由 layout 编译器负责其独占文件 |
| 发布物 | FairyGUI Editor 生成的 `.bin` / atlas | 不能由脚本伪造 |
| 程序 | `apps/client/src` | `apps/Cocos/assets/src` 是生成镜像，禁止手改 |
| 完成证据 | 自动检查结果 + Creator 截图/录像 + 状态矩阵记录 | “能打开”不等于“已验收” |

### 3.3 建议工作目录

以下是新功能的推荐资料结构，不要求一次性创建全部目录：

```text
docs/ui/<feature>/<page>/
├─ 00-input/
│  ├─ gdd-freeze.md
│  └─ decision-log.md
├─ 10-contract/
│  ├─ ui-requirements.yaml
│  ├─ state-matrix.yaml
│  └─ runtime-contract.yaml
├─ 20-layout/
│  ├─ <Page>.layout.json       layoutMode=editor 时是 handoff 规范
│  ├─ <Page>.annotation.png   有 renderer 时由 JSON 反绘，否则标为人工审稿图
│  └─ wireframe.png
├─ 30-visual/
│  ├─ style-anchor.png
│  ├─ style-tokens.yaml
│  ├─ concepts/
│  └─ review-log.md
├─ 40-production/
│  ├─ asset-manifest.json
│  ├─ source/
│  ├─ runtime/
│  └─ contact-sheet.png
└─ 90-evidence/
   ├─ compile-report.json
   ├─ creator/
   └─ acceptance.md
```

`40-production/runtime/` 只是批次审稿、交接和证据暂存区，不是第二份 FairyGUI 运行资产真源。资产通过 G5 后，应按明确映射导入 `apps/art/fairygui/assets/<Package>/`；进入包后的文件、FairyGUI 资源登记和批准哈希共同作为装配输入。禁止让暂存副本与包内副本各自继续修改。

仓库正式路径保持现有约定：

```text
apps/art/fairygui/                    FairyGUI Editor 工程真源
apps/Cocos/assets/resources/ui/       Editor 发布的 .bin、atlas 和独立资源
apps/client/src/                      客户端 TypeScript 真源
apps/Cocos/assets/src/                sync:client 生成镜像，禁止手改
scripts/fgui.manifest.json            FGUI 发布闭包锁
```

---

## 4. 端到端阶段与 Gate

### 4.1 总表

| Gate | 阶段 | 必须输出 | 通过条件 | 失败时回退 |
| --- | --- | --- | --- | --- |
| G0 | 策划冻结 | 范围、用户路径、平台、性能预算、验收标准、非目标 | 所有影响 UI 的关键语义已确定或明确阻断 | 回策划补齐，不开始画高保真图 |
| G1 | UI 需求与状态 | 页面地图、数据/动作表、UI model、状态/场景矩阵、运动反馈、文案槽 | 每个显示值有来源，每个操作有完整反馈，每个状态可重复构造 | 只改 UI 契约，不用视觉图补语义 |
| G2 | 线框与布局 | 节点树、坐标、层级、热区、安全区、极值样例；layout/annotation 按模式交付 | 长文本、极值数字、目标尺寸和点击区均可容纳 | 回 G1 或修改所选布局真源 |
| G3 | 视觉锁定 | style anchor、style tokens、批准效果图、评审记录 | 色板、材质、描边、圆角、光向、构图被批准 | 每轮只改一个视觉变量 |
| G4 | 生产拆层 | 资产清单、分层方案、来源、pivot、九宫格、状态版本 | 每个节点有责任方，无烘焙动态内容，无虚构图层 | 改用独立源、mask 或 fullCanvas |
| G5 | 运行资产 | 透明件、同画布层、九宫格源、manifest、质量报告 | Alpha、尺寸、边缘、pivot、预算和一致性通过 | 定向修单件，必要时回 G3/G4 |
| G6 | FairyGUI | 组件、Controller、Relation、包引用、Editor 发布物 | Editor round-trip、发布、引用闭合和稳定 ID 通过 | 保留上一版，回布局/资产/设计源修复 |
| G7 | 程序接线 | View、Logic、registry、pages、测试 | 状态矩阵可驱动，事件和生命周期正确，检查通过 | 回对应契约、View 或 Logic 层 |
| G8a | Creator 集成验收 | Creator 证据、状态矩阵结果、缺陷归因 | 全状态、目标尺寸和异常路径通过 | 按根因回最早真源并顺序重建 |
| G8b | 目标平台验收 | 真机构建、安全区、纹理格式和性能证据 | 仅在交付承诺需要时为必过 Gate | 回适配、资产、发布或性能真源 |
| G9 | 冻结交付 | 版本、哈希、变更记录、回归范围 | 任意下游产物可追溯和复建 | 拒绝无法追溯的手工热修 |

建议批准责任：G0 由策划/产品负责人签字；G1～G2 由 UI/UX 与客户端共同签字；G3 由美术负责人签字；G4～G5 由美术与技术美术共同签字；G6 由 UI 工程与客户端共同签字；G7 由客户端负责人签字；G8a/G8b 由 QA 与对应产品/技术负责人签字。模型可以整理证据，不能代替授权人做审美、业务或发布批准。

### 4.2 G0：策划冻结

输入：已完成的策划案、平台、目标语言、品牌资料、技术约束。

任务：

1. 明确功能范围和非目标。
2. 提取完整用户路径，而不只提取页面名。
3. 列出所有可见数据、操作、前置条件、成功和失败反馈。
4. 明确加载、空数据、断网、重连、锁定、资源不足、冷却和权限等实际需要的状态。
5. 明确设计分辨率、安全区、语言、性能和资源预算。
6. 明确字体文件、授权、fallback、glyph 覆盖、CJK/RTL、数字/日期/复数格式和内容权利来源。
7. 将仍然不完整的信息列为阻断项，不在下游补猜。

产物：`gdd-freeze.md`、`decision-log.md`、`performance-budget.yaml`、字体/品牌/IP/生成资产权利清单、范围与验收标准。性能预算至少声明目标设备、纹理显存、单图/atlas 最大尺寸、atlas 数量、包加载/首开时间、draw call、CPU/GPU 帧耗和动画 FPS；没有阈值就不能在 G8b 声称“性能通过”。现有 `perf:client` 是 Node 行为探针，不证明 FGUI/GPU 或真机性能。

Gate G0：影响 UI 的规则、状态、字段和动作没有关键 `TBD`；若仍有 `TBD`，它们必须被隔离为不会影响当前批次的非目标。

### 4.3 G1：UI 需求契约与状态矩阵

输入：G0 已冻结内容、现有协议和运行时能力。

任务：

1. 建立页面、弹窗、浮层和共用组件清单。
2. 建立入口、出口和导航图。
3. 为每个显示字段登记数据来源、格式、刷新触发和极值样例。
4. 为每个动作登记前置条件、命令或事件、等待态、成功反馈、失败反馈、防重复和取消规则。
5. 将状态拆成正交维度；不要用一个巨大 Controller 表达所有排列组合。
6. 区分网络错误、业务拒绝、空数据和权限不足。
7. 定义显式 UI model：服务端快照、本地 inflight/乐观状态、时钟、权限、生命周期和宿主环境共同决定页面表现。
8. 建立 `scenario-fixtures.yaml`，为每个状态登记稳定 `scenario_id`、数据快照、本地状态、时钟和环境条件；预览驱动器尚不存在时标为待实现能力。
9. 建立 `motion-feedback.yaml`，记录 Transition/Spine/序列帧/音效/触觉的 trigger、from/to、duration、easing、重入、中断、取消、reduced-motion 降级和生命周期归属。

产物：`ui-requirements.yaml`、`state-matrix.yaml`、`scenario-fixtures.yaml`、`runtime-contract.yaml`、`motion-feedback.yaml`、文案与字体 fallback 表。

Gate G1：每个可见值有来源，每个交互有程序语义，所有状态可由显式 UI model 唯一判断并由 fixture 重复构造，所有异步操作都有等待、成功、失败和重复点击处理。

### 4.4 G2：线框、布局与交互契约

输入：批准的 UI 需求和状态矩阵。

任务：

1. 确定逻辑画布、原点、坐标单位和安全区。
2. 设计页面分区、节点树、父子关系、层级、裁剪、滚动和复用组件。
3. 为节点定义矩形、anchor、pivot、Relation、点击区和文本溢出策略。
4. 用最长目标语言、最大数值、空列表、满列表和目标长短屏做压力布局。
5. 先形成低保真线框，再生成或绘制高保真视觉。
6. `layoutMode: editor` 时交付线框/handoff 规范并在 Editor 中实现，Editor 是最终坐标真源；没有 renderer 时不得宣称标注图由机器反绘。
7. `layoutMode: machine` 时由 `layout.json` 反绘标注图；禁止从标注图 OCR 回填坐标。

产物：线框、所选 `layoutMode`、响应式与极值用例；`layoutMode: editor` 交付 handoff 规范和 Editor 实现，`layoutMode: machine` 交付 `*.layout.json` 与确定性 `*.annotation.png`。

Gate G2：所有节点和热区都有明确位置及状态规则；极端内容和目标尺寸下没有结构性冲突。安全区只在明确程序接线和目标平台证据存在时算通过，Relation 本身不会自动处理刘海或四边 inset。

### 4.5 G3：视觉风格与整页效果图

输入：批准的线框、品牌/IP 资料和视觉目标。

任务：

1. 先生成 style tile/anchor，不直接从策划案生成完整页面。
2. 冻结色板、材质、描边、圆角、内外阴影、光向、图标透视、角色比例和禁用项。
3. 用线框作为布局权威、style anchor 作为视觉权威、IP 图作为身份权威；每张参考图只承担明确职责。
4. 生成 2～3 个方向或一个方向的受控变体，并记录提示词、参考图、模型和输出。
5. 生成关键页面和关键状态效果图；动态文字只保留槽位，不生成不可编辑的伪文字。
6. 评审时逐项映射回布局节点，不接受“看起来不错但无法拆解”的方案。

若使用 OpenAI 图像模型，官方指南当前建议新生产工作流默认采用 `gpt-image-2`；透明输出需使用支持 Alpha 的 PNG 或 WebP，并在调用参数和提示词中同时明确透明背景。模型和接口会演进，实际执行时应再次核对官方文档。

产物：`style-anchor.png`、`style-tokens.yaml`、批准效果图、提示词与评审日志。

Gate G3：视觉语言和关键页面构图被明确批准；禁止用“差不多”或未经记录的聊天结论替代批准记录。

### 4.6 G4：生产拆层与资产清单

输入：布局、状态矩阵、style anchor、批准效果图。

对每个节点选择一种责任类型：

| 类型 | 适用内容 | 关键规则 |
| --- | --- | --- |
| `runtime-text` | 标题、数字、玩家名、价格、计时 | 不烘焙进图片，登记格式、字体和溢出策略 |
| `primitive` | 纯色图形、遮罩、简单热区 | 优先用 FGUI 图元，减少无意义贴图 |
| `nine-slice` | 可伸缩面板、按钮底、气泡 | 四边 inset 显式登记，中心区必须有效 |
| `tile` | 可平铺纹理 | 明确横向、纵向或双向平铺 |
| `transparent-png` | 图标、角色、装饰、独立按钮图层 | 必须有真实 Alpha、完整轮廓、padding 和 pivot |
| `full-canvas-png` | 背景、同画布灯光、前景遮挡 | 保持完整画布和固定坐标，不做 tight crop |
| `loader` | 远端头像、动态资源、按状态换图 | 使用运行时 URL，并登记空值和失败占位 |
| `list-template` | 重复项 | 明确 `defaultItem`、字段契约和空态 |
| `spine/sequence/fx` | 复杂动画 | 单独预算、播放状态和降级策略，不混入静态图集假设 |

生产清单至少记录：stable key、节点覆盖、来源、尺寸、状态、Alpha、trim 模式、padding、pivot、九宫格、图集策略、生产方式、责任方、批准状态和源文件哈希。

Gate G4：页面每个可见节点都有明确渲染责任方；没有动态内容被错误烘焙；没有把扁平图中的被遮挡对象假装成可恢复透明件。

### 4.7 G5：生产运行资产

输入：批准的资产清单、style anchor 和必要的形状/IP 参考。

任务：

1. 每次生成或修订一个资产，不生成精确坐标的巨型 sprite sheet。
2. 对角色或品牌对象先建立可复用身份锚点，后续每次重复比例、服装、色板和轮廓不变量。
3. 独立件使用真实透明背景；明确“无场景、无底板、无棋盘格、无投影、无水印”。
4. 需要全画布位置的灯光、背景和前景遮挡以 `fullCanvas` 方式输出。
5. 九宫格源图在批准后人工或确定性标注 inset，不让图片模型猜伸缩区。
6. 自动或人工检查尺寸、四角 Alpha、可见 bbox、边缘污染、色边、padding、pivot、状态一致性和运行尺寸清晰度。
7. 批准后锁定源文件哈希；编译和装配阶段不再重新调用图片模型。

Gate G5：每个资产通过技术检查和视觉检查；contact sheet 中同家族资产没有明显风格、光向、比例或描边漂移。

### 4.8 G6：FairyGUI 装配与发布

当前仓库的正式默认流程是人工在 FairyGUI Editor 中装配：

1. 用 FairyGUI Editor 打开 `apps/art/fairygui/FairyGUI.fairy`。
2. 创建或修改 package、组件、资源和节点。
3. 配置 Controller、page、Gear、Relation、九宫格、tile、列表 `defaultItem` 和 Loader。
4. 在 Editor 中完整打开、保存、关闭再打开目标组件。
5. 使用 Editor“发布”，生成 `.bin`、atlas 和独立资源到 `apps/Cocos/assets/resources/ui`。
6. 通过 Cocos Dashboard 打开 Creator，让它导入并生成或复用 `.meta`。
7. 运行 codegen、manifest 和结构契约检查。

发布配置真源是 `apps/art/fairygui/settings/Publish.json`。设计基线必须同时核对 `apps/client/src/designSpec.ts`、`apps/client/src/Main.ts`、`apps/art/fairygui/settings/Adaptation.json` 和 `apps/Cocos/settings/v2/packages/project.json`；本仓当前统一为 `750×1624 / MatchWidth / FIXED_WIDTH`。

#### 命名与装配规则

| 前缀 | 典型类型 |
| --- | --- |
| `btn_`、`tge_` | `GButton` |
| `txt_` | `GTextField` / `GRichTextField`，以真实 XML 类型为准 |
| `ld_` | `GLoader` |
| `ld3_` | `GLoader3D` |
| `lst_` | `GList` |
| `img_` | `GImage` |
| `go_` | `GGroup` |
| `jb_` | `GComponent` |
| `pg_` | `GProgressBar` |

- 需程序访问的新元素必须使用类型前缀；无前缀元素应是纯装饰，程序不访问。
- 页面主状态 Controller 推荐命名 `view`，page 使用小驼峰英文；布尔状态用 `true` / `false`。
- `button` 是按钮内部保留 Controller 名，不可挪作业务状态。
- `displayList` 顺序就是 z-order，不能按节点名排序。
- 全屏、贴边、底部停靠元素必须配置 Relation。
- 动态换图使用 `GLoader.url`，不使用 Cocos Sprite API。
- `clearOnPublish` 只用于代码确定会填充的 Loader，否则运行时会空白。
- `interactive` 是全局 FGUI 输入租约：交互页会让 GRoot 捕获输入并挡住背后玩法；纯展示 HUD 才适合 `false`。`interactive: false` 不是独立输入隔离——只要另一个交互页仍打开，全局 InputProcessor 就继续启用。

#### 未来自动化边界

如果以后实现 `layout.json → 运行 PNG / XML` 编译器，必须满足：

1. 当前仓库“XML 只在 FairyGUI Editor 中修改”的规则仍是默认值；自动写入需要专门实现、测试和明确授权。
2. 只写 file-level 标记为 `machine-owned` 的整个组件 XML；`editor-owned` 页面外壳绝不覆盖。
3. 首期由 Editor-owned 外壳引用一个 machine-owned 纯视觉子组件。
4. 既有包先导入真实 ID；稳定 ID 表 append-only，删除后 tombstone，永不复用。
5. `package.xml` 只做白名单 AST 合并，并保留未知属性、原顺序、`extention`、`scale9grid`、`alone_npot` 和 `exported`。
6. 全部输出先在临时目录验证，再原子替换；任一步失败不留下半套产物。
7. `.bin`、atlas、trim、rotation 和分页只能由 FairyGUI Editor 发布；`.meta` 只能由 Creator 真实导入生成或复用。

当前 `package.json` 并没有 `compile:fgui-layout` 或 `verify:fgui-layout`；在工具真正实现并通过 Editor round-trip 前，文档和提示词都不能宣称这些命令可用。

Gate G6：Editor round-trip、发布、引用闭包、Controller/Relation/列表配置和稳定命名全部通过。

### 4.9 G7：程序接线

当前仓库的新页面接入顺序：

1. 运行 `npm run codegen:fgui -- <Package> <Component>`。
2. 在 `apps/client/src/view/fguiContracts.ts` 登记命名元素、Controller、Relation、嵌套组件、列表模板和代码动态引用资产。
3. 在 `apps/client/src/view/XxxView.ts` 只做节点绑定、渲染、点击/列表回调和动作转发。
4. 在 `apps/client/src/logic/page/XxxLogic.ts` 实现不依赖 `cc` / `fairygui-cc` 的业务行为和无头测试。
5. 在 `apps/client/src/view/viewRegistry.ts` 登记 `layer/fullscreen/onlyOne/permanent/interactive/sharedPkgs/load`。
6. 在 `apps/client/src/view/pages.ts` 创建组合根，注入 Logic、网络和导航。
7. 外部入口通过动态 import 调用 `openXxx`；普通脚本不得静态 import FairyGUI 或具体 View。
8. 数据和回调在 `ViewHandle.run(...)` 中注入，将生命周期 `AbortSignal` 传给异步 Logic。
9. 关闭优先使用 `handle.close()`；禁止直接 `view.dispose()`。
10. 用 `scenario-fixtures.yaml` 为 UI model → View state projection 添加无头测试；若需要开发期预览驱动器，应明确实现为开发工具，不能假装当前已经存在。
11. 修改 `apps/client/src` 后运行 `npm run sync:client`，不手改 `apps/Cocos/assets/src`。

codegen 只覆盖 View 内的 `IMPORT`、`REQUIRED`、`FIELD`、`BIND` 四个 AUTO 区块；禁止手改这些区块，业务接线只写在区块外。`fguiContracts.required` 必须与生成的 View `REQUIRED` 一致。

新增页面还必须满足三条强制配对关系：

- `viewRegistry` 的 key、`<Name>View.ts` 和 View 类名使用同一 `<Name>`。
- 必须存在配对的 `logic/page/<Name>Logic.ts`。
- contract 必须加入 `FGUI_CONTRACTS`，并与 registry 引用的 contract 字段级一致。

`viewRegistry.layer` 的合法顺序是 `base < popup < top`。`onlyOne` / `permanent` 页面可按名关闭；多实例页面必须使用 `ViewMgr.open` 返回的 handle 关闭；所有页面都禁止直调 `view.dispose()`。

跨包资源依赖必须以 `"ui/<Package>"` 格式完整登记到 `sharedPkgs`，且不包含页面自身包；页面包由 `ui/${contract.pkg}` 自动加载。漏包通常表现为组件或图片空白；加载失败和超时必须阻止创建并保留可诊断错误，不能静默显示空页面。

现有测试会扫描 `XxxView.ts` 中的 `ui://` 字面量，但其他 `view/` 辅助文件中的手写资源 URL 不在该扫描范围；这类引用必须显式进入契约或增加专项测试。

Gate G7：状态矩阵中的每个状态和转换都有实现或明确阻断；快速重复点击、开关页面、加载失败和迟到异步结果不会产生重复提交、泄漏或已关闭页面更新；自动检查和至少一次 Creator 页面加载 smoke 通过。这个 smoke 不构成 G8a 全状态验收。

### 4.10 G8a：Creator 集成验收

自动检查不能替代引擎验收。必须通过 Cocos Dashboard 打开 Creator 3.8.8，等待真实资源导入后验证：

- 基准 `750×1624 / FIXED_WIDTH` 和 Creator 可模拟的目标长短屏；
- 横向挤压、底部停靠和 Relation；
- 最长语言、最大数字、最小数字、空文本和缺图；
- 默认、加载、正常、空、锁定、资源不足、错误、断线和恢复；
- 快速连点、重复开关、关闭后迟到响应、场景切换；
- 透明黑边、图集串色、九宫格变形、Loader 空白和输入遮挡；
- Creator 环境下可观察的 draw call、包加载、首开和动画表现。

Gate G8a：严重集成缺陷为零；其余缺陷有明确接受决定；截图/录像、测试结果和状态矩阵记录可复核。

### 4.11 G8b：目标平台与真机验收

当交付范围包含移动安全区、设备输入、平台压缩纹理、GPU/内存或低端机性能承诺时，必须制作目标平台构建并在预算声明的设备矩阵上验证：

- 刘海、圆角、状态栏、Home indicator 与四边安全区；
- 触摸、键鼠、返回键、应用切后台/恢复和平台权限；
- 实际纹理格式、透明边、图集串色、显存和加载峰值；
- CPU/GPU 帧耗、动画 FPS、首开时间、包加载时间和内存预算；
- 网络切换、弱网、断网、恢复和目标平台生命周期。

当前仓库并没有通用四边安全区系统，Relation 也不会自动处理刘海；相关页面需要明确的程序接线。Creator 预览只能证明引擎集成，不能证明真机安全区、压缩格式或低端机性能。

Gate G8b：只在产品交付承诺需要这些能力时为必过 Gate；每项结论必须有目标构建、设备、测量方法和阈值证据。

### 4.12 G9：冻结、交付与变更回流

交付批次至少记录：策划版本、UI 契约版本、布局版本、style anchor、批准源图哈希、运行资产哈希、字体/IP/品牌/参考图来源与许可、生成模型与参数、提示词和人工批准记录、FGUI 包/组件、发布物、代码提交和验收证据。

变更请求必须声明：允许改变的真源、必须保持的不变量、下游重建范围和回归矩阵。禁止直接在下游成品上做无法追溯的热修。

---

## 5. 推荐的机器契约

### 5.1 `layout.json` 最小骨架

下面是未来 `layoutMode: machine` 可扩展的建议 Schema，不是当前仓库已经实现的格式；`layoutMode: editor` 不得把它当成可编译真源：

```json
{
  "$schema": "<schema path>",
  "schemaVersion": 1,
  "package": {
    "name": "<Package>"
  },
  "component": {
    "stableKey": "<immutable component key>",
    "name": "<Component>",
    "ownership": "machine",
    "designSize": [750, 1624]
  },
  "safeArea": {
    "mode": "runtime",
    "referenceInsets": [0, 0, 0, 0]
  },
  "sources": [
    {
      "stableKey": "<source key>",
      "file": "<approved source>",
      "expectedSha256": "<sha256>",
      "space": "sourcePx",
      "size": [1500, 3248],
      "logicalSize": [750, 1624]
    }
  ],
  "assets": [
    {
      "stableKey": "<asset key>",
      "source": "<source key>",
      "sourceMode": "copy",
      "sourceRect": null,
      "paddingPx": [0, 0, 0, 0],
      "pivotNormalized": [0.5, 0.5],
      "runtimeSize": [128, 128],
      "nineSliceInsets": null,
      "atlasPolicy": "default",
      "output": "<filename>.png"
    }
  ],
  "nodes": [
    {
      "stableKey": "<node key>",
      "parent": null,
      "type": "image",
      "name": "img_example",
      "asset": "<asset key>",
      "rect": [0, 0, 128, 128],
      "zOrder": 0,
      "touchable": false,
      "visibleWhen": []
    }
  ],
  "controllers": [],
  "gears": [],
  "relations": [],
  "hotspots": [],
  "textSlots": [],
  "lists": []
}
```

必须显式区分 `sourcePx` 和 `logicalPx`，统一左上原点。`ownership: "machine"` 才允许未来编译器生成对应的独占 XML；`ownership: "editor"` 时，该文件只可作为审稿和校验规范，编译器必须拒绝写组件 XML。仅有矩形时，只能生成静态 image、loader 或 graph；Controller、Gear、Relation、Button、ProgressBar 和 List 不能根据节点名猜测。

### 5.2 `ids.lock.json` 规则

如果未来启用自动 XML 生成：

- 既有包先从真实 `package.xml` 和组件导入 ID。
- stable key 与 ID 永久一一映射。
- 新对象只分配未使用 ID。
- 删除写入 tombstone，旧 ID 永不回收。
- JSON 重排、节点重排和改展示名不得改变 ID。
- package/resource ID 改变或重复属于阻断错误。
- group、Relation target、Gear page 和 `ui://` 引用必须最终解析到锁定 ID。

### 5.3 生产资产来源模式

| `sourceMode` | 含义 | 允许条件 |
| --- | --- | --- |
| `copy` | 无损复制批准的独立源 | 文件哈希已锁定 |
| `fullCanvas` | 保持源画布坐标的完整层 | 背景、灯光、遮挡等同画布层 |
| `alphaBBox` | 按可见 Alpha + 显式 padding 裁切 | 已有真实透明通道 |
| `crop` | 按显式矩形裁切 | 确认无背景污染且无遮挡缺失 |
| `mask` | 使用独立 Alpha mask | mask 是批准输入，不能自动猜 |
| `nineSlice` | 生成可伸缩组件源 | 四边 inset 明确且中心区有效 |

扁平效果图中的角色、建筑、按钮和图标如果已经与背景合成，只能重新取得独立源、重新生成透明单体、提供人工 mask，或将其批准为 `fullCanvas` 层；不能用矩形裁切伪装成可复用透明件。

---

## 6. 当前仓库执行清单

### 6.1 FairyGUI Editor 发布前

```text
□ 需程序访问的节点有正确类型前缀，纯装饰节点不被代码访问
□ 主 Controller 与 page 命名稳定，按钮保留内部 button Controller
□ List 配置 defaultItem，并确认 autoClearItems 行为
□ 全屏、贴边、底部停靠节点配置 Relation
□ 可伸缩图设置 scale9grid，可平铺图设置 tile
□ 代码动态换图资源已导出，Loader 的 clearOnPublish 有代码兜底
□ sharedPkgs 能覆盖跨包资源传递闭包
□ 动态文字和数字没有烘焙进图片
□ 目标组件在 Editor 保存、关闭、重开后结构稳定
```

### 6.2 发布、接线与自动检查

codegen 完成后，先人工审阅四个 AUTO 区块，并完成 `fguiContracts.ts`、配对 Logic、`viewRegistry.ts`、`pages.ts` 和 `sharedPkgs` 接线；确认设计源和真实发布物正确后，再更新 manifest 闭包锁。不要从 codegen 直接跳到 `--write`。

```bash
# FairyGUI Editor 完成真实发布后
npm run codegen:fgui -- <Package> <Component>

# 设计源或发布物变化并完成差异审阅后，更新闭包锁
node scripts/fgui-manifest.mjs --write

# 客户端真源同步到 Creator 工程壳
npm run sync:client

# 自动检查
npm run typecheck:client
npm run typecheck:client:legacy
npm run test:client
npm run test:fgui
npm run verify:fgui
npm run verify:sync
```

`fgui-manifest --write` 只能在确认真实发布物正确后使用，不能用更新哈希掩盖错误。上述检查通过后，仍必须通过 Dashboard 打开的 Creator 做真实运行验收。

---

## 7. 提示词设计规范

### 7.1 公共变量

```text
{{PROJECT_NAME}}           项目名
{{FEATURE_NAME}}           功能或系统名
{{PAGE_ID}}                页面稳定标识
{{PLATFORM}}               iOS / Android / Web / PC
{{DESIGN_WIDTH}}           逻辑设计宽度；本仓通常为 750
{{DESIGN_HEIGHT}}          逻辑设计高度；本仓通常为 1624
{{SAFE_AREA}}              安全区规则
{{TARGET_LANGUAGES}}       目标语言
{{REPO_RULES}}             仓库与架构约束
{{GDD}}                    已冻结策划案
{{UI_REQUIREMENTS}}        UI 需求契约
{{STATE_MATRIX}}           页面状态矩阵
{{LAYOUT_SPEC}}            线框与布局契约
{{STYLE_ANCHOR}}           已批准风格锚点
{{STYLE_TOKENS}}           可执行风格参数
{{PAGE_CONCEPT}}           已批准整页效果图
{{ASSET_MANIFEST}}         生产资产清单
{{IDS_LOCK}}               稳定 ID 表；未启用时删除引用它的整行
{{RUNTIME_CONTRACT}}       数据与事件契约
{{CHANGE_REQUEST}}         本轮唯一允许的变化
{{APPROVED_INVARIANTS}}    必须保持不变的内容
```

各提示词还会使用下面这些局部变量：

```text
# 编排和证据
{{STAGE_ID}}、{{ORCHESTRATOR_MODE}}、{{PIPELINE_STATUS}}、{{APPROVED_ARTIFACTS}}
{{CURRENT_OBJECTIVE}}、{{RUNTIME_EVIDENCE}}、{{MODE}}、{{AUTHORIZED_DEFECT_IDS}}
{{SEVERITY_POLICY}}

# 视觉输入和目标
{{PRIMARY_ART_REFERENCE}}、{{BRAND_REFERENCE}}、{{IP_REFERENCE}}、{{SHAPE_REFERENCE}}
{{CHARACTER_OR_BRAND_REFERENCE}}、{{WIREFRAME_IMAGE}}、{{LAYOUT_ANNOTATION}}
{{BRAND_INVARIANTS}}、{{APPROVED_PALETTE_CONSTRAINTS}}
{{CHARACTER_OR_IP_INVARIANTS}}、{{GENERATION_ANCHOR_SENTENCE}}
{{STYLE_BOARD_SIZE}}、{{TARGET_STATE}}、{{VISUAL_FOCUS}}、{{PRIMARY_ACTION}}、{{MOOD}}

# 资产几何和格式
{{ASSET_STABLE_KEY}}、{{ASSET_NAME_AND_PURPOSE}}、{{ASSET_STATE}}、{{ASSET_INVARIANTS}}
{{SOURCE_WIDTH}}、{{SOURCE_HEIGHT}}、{{SOURCE_TO_LOGICAL_SCALE}}、{{OUTPUT_FORMAT}}
{{VISIBLE_BBOX_PX}}、{{PIVOT_NORMALIZED}}、{{PADDING_PX}}、{{SOURCE_MODE}}
{{LAYER_NAME}}、{{LAYER_SPEC}}、{{OCCLUSION_POLICY}}
{{BACKGROUND_CONTAMINANTS}}、{{APPROVED_EXTERNAL_EFFECTS}}
{{TARGET_IMAGE}}、{{EDIT_REGION_OR_MASK_DESCRIPTION}}、{{REFERENCE_IMAGE_ROLES}}

# FGUI 和程序
{{LAYOUT_MODE}}、{{LAYOUT_SCHEMA}}、{{PACKAGE_NAME}}、{{COMPONENT_NAME}}
{{FGUI_BINDINGS}}、{{FGUI_OWNERSHIP_POLICY}}、{{FGUI_PROJECT_STATE}}
{{EXECUTION_MODE}}、{{ALLOWED_WRITE_SCOPE}}、{{CURRENT_CODE}}
```

发送任何提示词前必须执行变量预检：

```text
1. 替换全部 {{...}}；最终提示词中不得残留原始占位符。
2. 可选变量不存在时删除对应整行，并按实际附件顺序重新编号参考图；不要把空字符串或“不适用”发给图片模型。
3. 每个“图 N”必须对应实际附加的图片，不能只写一个模型无法读取的文件名。
4. 模板中的 a | b | c 表示枚举；实际输出必须只选择一个值，不能原样复制整串。
5. 所有 px 字段必须注明属于 sourcePx 还是 logicalPx；pivot 统一使用 0～1 的 pivotNormalized。
6. 首次图片生成使用“目标 + 参考职责 + 不变量 + 输出要求 + 禁区”；只有修订任务才增加“唯一允许变化”。
7. 图片提示词不能证明精确像素尺寸、pivot、Alpha 或未编辑区域不变；这些必须由工具参数、manifest 和外部验证提供证据。
```

### 7.2 文本、结构化数据和代码任务的公共执行头

把下面内容放在 P0～P3、P4B、P6、P9～P11 前：

```text
你正在执行 {{PROJECT_NAME}} 的 UI 生产流水线阶段：{{STAGE_ID}}。

权威输入优先级：
1. {{REPO_RULES}}
2. 已冻结的策划与运行时契约
3. 已批准的页面状态、布局、风格和资产清单
4. 当前实现与真实运行证据
5. 推断

规则：
- 高优先级输入冲突时停止，不得自行选择。
- 输入缺失时使用 TBD、needs_decision 或 needs_source 标注，不得编造玩法、数据、坐标、隐藏图层、ID 或程序接口。
- 只完成本阶段，不提前伪造下游产物。
- 所有结论必须能追溯到权威输入。
- 明确区分事实、推断、建议和阻塞项。
- 示例值不是项目事实。

每次输出分成两块：

输出 A：阶段产物
- 严格遵循当前提示词指定的 JSON/YAML/文档格式。
- 放在独立代码块中，可直接保存；不混入解释、Markdown 注释或执行日志。

输出 B：`run-report.yaml`
stage:
source_inputs:
decision_log:
unresolved:
checks:
gate:
  result: pass | fail | blocked
  missing_evidence:
```

图片任务不直接套用这个长执行头；图片模型只生成候选图，不能自行证明 Alpha、像素尺寸、pivot 或未编辑区不变。编排器或执行代理应在图片返回后另行生成 `run-report.yaml`。

### 7.3 P0：流水线总控

用途：选择下一阶段，或审阅一个已经产出的阶段；选择和审阅分两次调用，防止模型一边调度一边自证通过。

```text
角色：UI 生产流水线总控。

模式：{{ORCHESTRATOR_MODE}}  # select 或 review

目标：
- select：只检查输入并选择下一阶段，不执行阶段，不更新 Gate。
- review：只审阅已经产生的单阶段产物和证据，更新该 work item 的 Gate，不执行下一阶段。

权威输入：
- 仓库规则：{{REPO_RULES}}
- 当前流水线状态：{{PIPELINE_STATUS}}
- 当前已批准产物：{{APPROVED_ARTIFACTS}}
- 本轮目标：{{CURRENT_OBJECTIVE}}

不变量：
- 已批准产物未经显式变更单授权不可修改。
- 每个阶段只能消费已通过 Gate 的上游产物。
- 图片、布局、FairyGUI 和程序分别有独立真源，不能相互反向猜测。
- 效果图不等于分层生产资产，FairyGUI 发布物不等于可运行验收。

任务：
1. select 模式：判断当前应执行的唯一阶段，检查输入，输出提示词编号和变量，保持 Gate 不变。
2. review 模式：检查阶段产物、自动检查和人工证据，输出 Gate 结论与缺口，不调度下一阶段。
3. 同一 work item 同时只有一个当前 Gate；不同页面、组件或资产在共享上游 Gate 通过后可以并行，每项单独记录状态和依赖。
4. 不得虚报“已发布”“已运行”或“已验收”。

输出格式：
current_stage:
work_item_id:
mode: select | review
selected_prompt:
input_check:
  ready:
  missing:
gate:
  criteria:
  result: pass | fail | blocked
next_stage:
decision_log:

禁区：
- 不直接生成美术、FairyGUI 或代码。
- 不跨阶段补造缺失输入。
- 不以“看起来合理”代替验收证据。

验收标准：
- 同一 work item 任意时刻只有一个当前 Gate。
- 每个通过的 Gate 都有对应产物和证据。
```

### 7.4 P1：策划案转 UI 需求契约

```text
角色：资深游戏 UI 系统分析师。

目标：
把已冻结策划案转换为可设计、可装配、可编程、可测试的 UI 需求契约。

权威输入：
- 策划案：{{GDD}}
- 平台：{{PLATFORM}}
- 画布与安全区：{{DESIGN_WIDTH}} × {{DESIGN_HEIGHT}}，{{SAFE_AREA}}
- 目标语言：{{TARGET_LANGUAGES}}
- 现有运行时契约：{{RUNTIME_CONTRACT}}；若尚未实现，明确写“缺失”，不要伪造符号

不变量：
- 不改变玩法、数值公式、奖励规则、解锁条件或业务名词。
- 每个显示值必须有数据来源，无法确认时标为 TBD。
- 每个操作必须有前置条件、等待、成功、失败和防重复规则。
- 动态文字与数字不得被规划为烘焙图片。

任务：
1. 提取用户目标和完整操作路径。
2. 建立页面、弹窗、浮层和共用组件清单。
3. 为每个页面列出入口、出口、数据、操作、反馈和异常状态。
4. 将策划条款映射到具体 UI 需求。
5. 对每个动作先描述 UI 所需能力，再检查是否能映射到已有契约符号。
6. 提取字体/本地化、动效/音效/触觉、可访问性和性能需求。
7. 找出不足以实现 UI 的策划缺口、权利来源缺口和运行时契约缺口。

输出 YAML：
feature:
non_goals:
user_journeys:
pages:
  - page_id:
    type: page | popup | overlay | component
    user_goal:
    entry_conditions:
    exits:
    displayed_data:
      - field:
        source:
        format:
        refresh_trigger:
        extreme_samples:
    actions:
      - action_id:
        precondition:
        required_capability:
        mapped_contract_symbol:
        contract_status: existing | missing | conflict
        waiting_feedback:
        success_feedback:
        failure_feedback:
        idempotency:
        cancellation:
    required_states:
    localization_risks:
traceability:
  - gdd_clause:
    ui_requirements:
runtime_contract_gaps:
typography_and_localization:
motion_sound_haptic_needs:
performance_requirements:
rights_and_provenance_gaps:
unresolved:

禁区：
- 不设计视觉风格和像素坐标。
- 不创造策划中不存在的货币、按钮或功能。
- 不为尚未实现的运行时能力自行命名 shared 消息、RPC 或 HTTP 接口。
- 不用“其他状态类似”省略异常路径。

验收标准：
- 每个策划操作都映射到至少一个 UI 操作。
- 每个显示字段都有来源。
- 每个异步操作都有完整反馈和重复点击处理。
- 所有疑点均显式记录。
```

### 7.5 P2：页面和状态矩阵

```text
角色：UI 状态建模工程师。

目标：
把 UI 需求转换为无歧义的语义状态矩阵和场景 fixture；具体 FairyGUI Controller 只是后续实现建议，不是本阶段真源。

权威输入：
- UI 需求：{{UI_REQUIREMENTS}}
- 运行时数据和事件：{{RUNTIME_CONTRACT}}

不变量：
- 不增加业务状态。
- 区分互斥状态和可正交叠加状态，避免一个状态维度承担所有组合。
- 状态转换必须由明确事件触发。
- 本阶段不决定像素坐标和美术形式。

任务：
1. 为每个页面识别实际需要的默认、加载、正常、空、错误、断线、锁定、资源不足和冷却等状态。
2. 将状态拆分成语义状态维度，并给出 recommended_controllers 作为后续建议。
3. 此时尚无节点树；用 semantic_element_effects 定义主要操作区、内容区、余额显示等语义元素的可见性、文字、图标、启用、选中和交互行为。
4. 生成状态转移表。
5. 显式定义 UI model，其中可包含服务端快照、本地 inflight/乐观状态、时钟、权限、生命周期和宿主环境。
6. 为每个状态生成可重复的 scenario_id 和 fixture；标出无法从现有输入唯一判定或构造的状态。

输出 YAML：
pages:
  - page_id:
    initial_state:
    state_dimensions:
      - id:
        kind: exclusive | orthogonal
        default_value:
        values:
        recommended_controller:
    state_matrix:
      - state_id:
        trigger:
        preconditions:
        dimension_values:
        semantic_element_effects:
          - element_role:
            effects:
        allowed_actions:
        exit_event:
    transitions:
      - from:
        event:
        guard:
        to:
        side_effect:
    scenario_fixtures:
      - scenario_id:
        server_snapshot:
        local_state:
        clock:
        permissions:
        host_environment:
unresolved:

禁区：
- 不用截图代替状态定义。
- 不把网络错误、业务拒绝和空数据混成一个状态。
- 不使用运行时契约中不存在的字段；缺失能力必须标记为 contract gap。

验收标准：
- 每个状态可由显式 UI model 唯一判定，并有可重复 fixture。
- 每个用户操作在相关状态下都有明确行为。
- 状态维度组合不存在不可达或自相矛盾状态。
```

### 7.6 P3：线框与布局契约

```text
角色：游戏 UI 信息架构师与布局工程师。

目标：
生成不依赖最终美术的线框布局和机器可读布局契约。

权威输入：
- UI 需求：{{UI_REQUIREMENTS}}
- 状态矩阵：{{STATE_MATRIX}}
- 布局模式：{{LAYOUT_MODE}}  # editor 或 machine
- 布局 Schema：{{LAYOUT_SCHEMA}}  # machine 模式必填；editor 模式为 handoff 格式定义
- 画布：{{DESIGN_WIDTH}} × {{DESIGN_HEIGHT}}
- 安全区：{{SAFE_AREA}}
- 目标语言：{{TARGET_LANGUAGES}}

不变量：
- 保持页面信息层级和操作顺序。
- 动态文字必须预留最长语言和最大数字范围。
- 所有坐标使用同一原点、单位和轴方向。
- stable key 一旦批准即保持稳定。
- 不用装饰掩盖布局问题。
- 所有页面矩形使用 logicalPx、左上原点；pivot 使用 pivotNormalized；源图裁切和 padding 使用 sourcePx。

任务：
1. 定义页面分区、节点树、坐标、尺寸、anchor、pivot、层级和裁剪规则。
2. 定义 Relation、安全区、列表滚动、文本溢出和点击区域。
3. 建立 semantic_role_to_node_key 映射，再给出每个状态的结构变化。
4. 生成可由 layout 数据反绘的标注说明。
5. 记录仍需视觉阶段决定的槽位。

输出：
- 严格 JSON 的 layout/handoff 契约，字段严格服从 {{LAYOUT_SCHEMA}}。
- 节点清单和 stable key。
- semantic_role_to_node_key 映射。
- 默认、最长文本、极值数字、空列表和满列表的布局检查结果。
- 不能确定的项目放入 openQuestions。

边界：
- layoutMode=editor：JSON 是设计交接和验收规范，最终坐标真源是 FairyGUI Editor；不得宣称 JSON 可直接生成 FGUI。
- layoutMode=machine：只有仓库中已存在并验证过编译器时，JSON 才可生成 annotation 和 machine-owned XML。
- Controller/Gear 只记录已批准语义，不根据节点名推断。

禁区：
- 不从扁平效果图反推隐藏图层。
- 不生成最终材质、光影或装饰。
- 不用肉眼描述代替精确数值。
- 不把点击区默认等同于可见图形边界。

验收标准：
- 节点树闭合、父节点存在、stable key 唯一。
- 所有节点位于合法坐标系，或有明确溢出理由。
- 安全区、长文本、极值数字和目标屏幕均可容纳。
- 关键点击目标没有遮挡和歧义。
```

### 7.7 P4A：生成视觉风格锚点

这是图片生成提示词。输出只用于视觉冻结，不是运行时资产。

```text
任务类型：视觉探索 / style anchor，不是完整页面，也不是运行时切图。

目标：
为 {{PROJECT_NAME}} / {{FEATURE_NAME}} 生成一张统一的游戏 UI 风格锚点图。

参考图职责：
- 图 1：{{PRIMARY_ART_REFERENCE}}，只决定世界观、材质和色彩。
- 图 2：{{BRAND_REFERENCE}}，只决定品牌辨识。
- 图 3：{{IP_REFERENCE}}，只决定角色或 IP 身份；若不适用则忽略。

必须保持的不变量：
- {{BRAND_INVARIANTS}}
- {{APPROVED_PALETTE_CONSTRAINTS}}
- {{CHARACTER_OR_IP_INVARIANTS}}

画面必须展示：
- 主色、辅色、强调色、成功色、警告色和危险色之间的关系。
- 面板、弹窗、卡片、普通按钮、主按钮、禁用按钮的统一材质语言。
- 一组同家族图标、边框、分隔线、角饰和进度条。
- 圆角、描边、内外阴影、高光、厚度和统一光源方向。
- 一个代表世界观的装饰物，但不要形成完整页面。

构图：
- 中性展示底板，元素分区清晰，正视角 UI 展示。
- 元素互不遮挡，保留足够空白。
- 输出尺寸：{{STYLE_BOARD_SIZE}}。

禁区：
- 不生成完整游戏页面。
- 不生成可读正文、数值、未经批准的新商标、签名或水印；批准 Logo 只在明确要求时原样作为身份参考，不得自行改写。
- 不混入第二套画风。
- 不使用摄影场景或复杂透视环境背景。
- 不把棋盘格伪装成透明背景。

验收标准：
- 所有组件像来自同一个 UI 系统。
- 材质、描边、圆角和光向可以被明确描述并重复生成。
- 缩小后仍能区分主操作、次操作、禁用和危险状态。
```

### 7.8 P4B：冻结可执行风格参数

```text
角色：UI 美术规范分析师。

目标：
分析已批准的风格锚点 {{STYLE_ANCHOR}}，生成后续图片生成与 FairyGUI 装配共同使用的风格参数。

权威输入：
- 风格锚点：{{STYLE_ANCHOR}}
- 品牌不变量：{{BRAND_INVARIANTS}}

不变量：
- 只描述图中可验证的视觉规律。
- 无法精确读取的颜色或尺寸标为估计值。
- 不重新设计风格。

输出 YAML：
palette:
materials:
stroke:
corners:
shadow:
highlight:
lighting:
icon_language:
button_states:
panel_language:
typography_direction:
forbidden_style_drift:
generation_anchor_sentence:

禁区：
- 不把单个偶然细节提升为全局规则。
- 不使用“高级感”“精致”等不可验证词作为唯一描述。

验收标准：
- generation_anchor_sentence 可逐字复用于后续每个资产提示词。
- 参数足以判断新资产是否发生风格漂移。
```

### 7.9 P5：生成整页高保真效果图

这是图片生成提示词。输出是评审效果图，不能直接假定为可切生产资产。

```text
任务类型：高保真页面评审图，不是分层生产资产。

目标：
基于已批准线框生成 {{PAGE_ID}} 的整页高保真效果图。

画布映射：
- 逻辑画布：{{DESIGN_WIDTH}} × {{DESIGN_HEIGHT}} logicalPx。
- 实际生成画布：{{SOURCE_WIDTH}} × {{SOURCE_HEIGHT}} sourcePx；必须记录并使用图片工具/API 实际支持的输出尺寸，不能靠提示词声称得到任意精确像素。
- 映射比例：{{SOURCE_TO_LOGICAL_SCALE}}。
- 若模型不支持目标比例，用确定性 fit/pad 生成评审画布，并在评审中以线框/布局契约为准；效果图像素不是最终坐标证据。

参考图职责：
- 图 1：{{WIREFRAME_IMAGE}}，是布局、信息层级和主要热区的唯一权威。
- 图 2：{{STYLE_ANCHOR}}，是色彩、材质、描边、圆角和光向权威。
- 图 3：{{IP_REFERENCE}}，只决定角色或品牌身份。
- 不得互换参考图职责。

必须保持：
- 画布 {{DESIGN_WIDTH}} × {{DESIGN_HEIGHT}}。
- 安全区 {{SAFE_AREA}}。
- 线框中的页面分区、内容槽位、操作顺序和视觉焦点。
- {{APPROVED_INVARIANTS}}。
- 风格句：{{GENERATION_ANCHOR_SENTENCE}}。

目标状态：
- 页面状态：{{TARGET_STATE}}。
- 视觉焦点：{{VISUAL_FOCUS}}。
- 主要操作：{{PRIMARY_ACTION}}。
- 情绪：{{MOOD}}。

文字规则：
- 玩家名、数字、价格、倒计时和动态正文保留为空白槽或简单占位。
- 不生成乱码、伪文字或不可编辑的关键标签。

禁区：
- 不改变线框信息架构。
- 不新增按钮、货币、功能或角色。
- 不将多个交互元素合成不可拆装饰。
- 不改变未授权的构图、色板、角色比例和光向。
- 不声称效果图已经是分层资产。
- 每次只输出一张完整页面，不生成多方案拼图或 contact sheet；需要多个方向时分别运行并独立评审。

验收标准：
- 视觉层级与交互优先级一致。
- 核心内容全部在安全区内。
- 所有动态内容有清晰可编辑槽位。
- 每个视觉元素能映射回一个布局节点或明确标记为纯装饰。
```

### 7.10 P5R：效果图结构化评审

这个提示词用于评审模型或人工评审助手，不生成新图。

```text
角色：游戏 UI 视觉评审与可生产性审计员。

目标：
对比 {{PAGE_CONCEPT}}、{{LAYOUT_SPEC}}、{{STYLE_ANCHOR}}、{{STATE_MATRIX}}，判断效果图是否可以进入生产拆层。

任务：
1. 检查布局节点是否一一对应，是否擅自新增、删除或移动功能。
2. 检查安全区、视觉层级、主要操作、长文本槽和极值数字槽。
3. 检查色板、材质、描边、圆角、光向、图标透视和角色身份一致性。
4. 标出动态文字烘焙、不可拆元素、背景污染、遮挡缺失和不可复用结构。
5. 将问题分成：必须回 G2、必须回 G3、可在 G4 拆层解决、无需阻断。

输出表：
- issue_id
- severity
- evidence
- violated_contract
- root_stage
- minimal_change
- invariants_to_preserve
- gate_result

禁区：
- 不以个人喜好替代契约。
- 不直接修改图像。
- 不把“可以 PS 抠出来”当作已有透明生产源。

验收标准：
- 每个结论都指向可见证据和具体契约。
- Gate 结论只有 pass、fail 或 blocked。
```

### 7.11 P6：生产资产清单

```text
角色：2D 游戏 UI 技术美术与资产规划师。

目标：
把已批准布局、状态和效果图转成可独立生产、可复用、可验证的运行时资产清单。

权威输入：
- 布局：{{LAYOUT_SPEC}}
- 状态矩阵：{{STATE_MATRIX}}
- 风格锚点与参数：{{STYLE_ANCHOR}} / {{STYLE_TOKENS}}
- 效果图：{{PAGE_CONCEPT}}
- 稳定 ID：{{IDS_LOCK}}

不变量：
- 布局和节点语义不变。
- 动态文字、数字、头像和远端内容不得烘焙。
- 扁平效果图无法证明的隐藏像素、pivot 和状态变体必须标记 needs_source。
- 同一语义资产优先复用，不为每个页面复制。

任务：
为每个节点决定：
1. 使用 FGUI 图元、运行时文本、Loader、独立透明图、九宫格、整块背景、序列帧、骨骼、粒子或无需资产。
2. 画布尺寸、可见包围盒、透明边距、裁切方式、pivot、九宫格、采样方式和状态变体。
3. 生产方式、来源、责任方和验证规则。
4. 从效果图无法取得的内容明确列为 needs_source，不做推断裁切。

输出 JSON：
{
  "assets": [
    {
      "stableKey": "",
      "nodeKeys": [],
      "kind": "transparent-png | full-canvas-png | nine-slice | icon | sequence | spine | particle | runtime-text | loader | primitive",
      "purpose": "",
      "states": [],
      "sourceOfTruth": "",
      "sourceMode": "copy | fullCanvas | alphaBBox | crop | mask | nineSlice",
      "outputCanvasPx": {"width": 0, "height": 0},
      "visibleBBoxPx": [0, 0, 0, 0],
      "alpha": true,
      "pivotNormalized": [0.5, 0.5],
      "scale9GridPx": null,
      "paddingPx": [0, 0, 0, 0],
      "format": "png",
      "outputFile": "",
      "atlasPolicy": "",
      "styleReferences": [],
      "generationPromptId": null,
      "owner": "artist | generator | fgui | runtime",
      "status": "ready | needs_decision | needs_source",
      "expectedSha256": null,
      "validation": {}
    }
  ],
  "nodeCoverage": [],
  "unresolved": []
}

禁区：
- 不把整页效果图自动切成推测图层。
- 不烘焙动态文本或交互热区。
- 不在未确认时猜九宫格、pivot 或被遮挡部分。
- 不用一张巨型透明图替代本应复用的组件。
- `crop`、`nineSlice`、精确 padding/scale 和 pivot 登记使用确定性工具，不交给图片模型。

验收标准：
- 每个可见布局节点都有明确资产或渲染责任方。
- 每个状态变体都有来源。
- 资产 stable key 唯一并保持稳定。
```

### 7.12 P7：生成独立透明生产资产

每次只生成一个视觉候选。图片 API 的中间输出可以使用支持 Alpha 的 PNG/WebP，但进入当前 FairyGUI 工程的规范交付默认统一为 RGBA PNG；只有完成 Editor 导入、发布、manifest 和 Creator 验证后，才能批准其他格式直入生产链。仅写“transparent”不能替代正确的工具/API 背景与格式参数。

```text
任务类型：独立透明资产视觉候选；精确几何由 manifest 和确定性后处理完成。

只生成一个资产：
- stable key：{{ASSET_STABLE_KEY}}
- 名称和用途：{{ASSET_NAME_AND_PURPOSE}}
- 来源模式：{{SOURCE_MODE}}  # 仅 alphaBBox 或有批准 mask 的 mask；copy 不需要生成，crop/nineSlice 走确定性工具
- 工具/API 输出格式：{{OUTPUT_FORMAT}}
- 期望可见 bbox：{{VISIBLE_BBOX_PX}} sourcePx
- pivotNormalized：{{PIVOT_NORMALIZED}}  # 资产元数据，不要求图片内嵌
- 目标 padding：{{PADDING_PX}} sourcePx  # 生成后由确定性工具实现
- 目标状态：{{ASSET_STATE}}

参考图职责：
- 图 1：{{STYLE_ANCHOR}}，只决定材质、色彩、描边、圆角和光源。
- 图 2：{{SHAPE_REFERENCE}}，只决定轮廓、比例和朝向。
- 图 3：{{CHARACTER_OR_BRAND_REFERENCE}}，只决定身份特征。

必须保持的不变量：
- {{GENERATION_ANCHOR_SENTENCE}}
- {{ASSET_INVARIANTS}}
- 与同系列资产一致的正视角、光源方向、线宽和边缘处理。

输出要求：
- 使用工具/API 支持的画幅生成真正透明的 RGBA 候选，完整保留 Alpha。
- 只有一个隔离对象，轮廓完整，四周保留指定透明边距。
- 不裁掉描边、高光、外发光或功能部件。
- 除非资产定义明确要求，不添加投影、地面接触影或光晕。
- 输出一个完成版本，不制作 contact sheet 或 sprite sheet。

禁区：
- 无场景、底板、渐变背景、白底或烘焙棋盘格。
- 无文字、数字、Logo、签名或水印。
- 不添加额外道具、第二个对象或展示框。
- 不改变批准的身份、比例、朝向、主色和光向。

验收标准：
- 经外部工具验证四角和主体外部是真实 Alpha 0。
- 候选经确定性 crop/pad/scale 后，输出尺寸、visible bbox、pivotNormalized 和 padding 符合 manifest。
- 缩放到运行尺寸后轮廓仍清晰。
- 与 style anchor 和同系列资产无明显漂移。
```

### 7.13 P7B：同画布视觉层

用于背景、灯光、雾、前景遮挡等必须与页面坐标严格对齐的层。图片模型只产生候选像素，精确 fullCanvas 尺寸和位置由确定性 pad/scale/composite 完成。

```text
任务类型：fullCanvas 视觉层候选。

目标：
只生成 {{LAYER_NAME}}。最终源画布应为 {{SOURCE_WIDTH}} × {{SOURCE_HEIGHT}} sourcePx，对应 {{DESIGN_WIDTH}} × {{DESIGN_HEIGHT}} logicalPx，比例 {{SOURCE_TO_LOGICAL_SCALE}}；图片模型使用其支持的画幅，最终精确画布由确定性工具产生。

权威层定义：{{LAYER_SPEC}}
遮挡策略：{{OCCLUSION_POLICY}}
风格句：{{GENERATION_ANCHOR_SENTENCE}}

参考图职责：
- 图 1：{{PAGE_CONCEPT}}，只决定该层的位置、覆盖范围和视觉作用。
- 图 2：{{STYLE_ANCHOR}}，只决定材质、色彩和光向。
- 图 3：{{LAYOUT_ANNOTATION}}，只决定坐标和安全区。

来源边界：
- 效果图只用于位置和视觉作用参考，不是像素提取源。
- 如果目标层在效果图中被按钮、角色或文字遮挡，而 LAYER_SPEC 没有定义完整内容，立即停止并返回 needs_source，不猜隐藏像素。

必须保持：
- 视角和所有已批准页面区域。
- {{APPROVED_INVARIANTS}}。
- 除 {{LAYER_NAME}} 外的画布全部透明。

输出要求：
- 真透明 RGBA 候选；当前仓库规范交付统一为 RGBA PNG。
- 后处理按 manifest 放入完整画布，不 tight crop，不用模型输出本身证明精确坐标。
- 不包含文字、按钮、角色或其他语义节点，除非它们就是本层定义的一部分。

禁区：
- 不合成其他层。
- 不改变全页构图。
- 不输出带背景的评审图。

验收标准：
- 经确定性后处理后，与效果图按左上原点叠加位置正确。
- 外部 Alpha 检查确认除目标层和批准外部效果外无残留像素。
```

### 7.14 P8：最小范围定向修图

```text
任务类型：最小范围图像编辑。

执行前先检查 CHANGE_REQUEST 是否只有一个可验证差异。若同时涉及构图、色彩、材质、姿态、比例等两个以上维度，停止并拆成多轮，不执行编辑。

目标图：{{TARGET_IMAGE}}

本轮唯一允许变化：
{{CHANGE_REQUEST}}

必须保持完全不变：
- 画布尺寸、文件格式和透明通道。
- 对象位置、比例、朝向、透视和 pivot。
- 未指定区域的轮廓、颜色、材质、光照、阴影和边缘。
- {{APPROVED_INVARIANTS}}。
- 风格句：{{GENERATION_ANCHOR_SENTENCE}}。

编辑区域：
{{EDIT_REGION_OR_MASK_DESCRIPTION}}

参考图职责：
{{REFERENCE_IMAGE_ROLES}}

输出要求：
- 在工具支持时使用与输入相同的编辑画布；最终尺寸、格式和 Alpha 由确定性后处理统一。
- 只返回一个完成版本。
- 透明输入继续保持真正透明的背景。

禁区：
- 不做全局重绘或重新构图。
- 不“顺便优化”其他区域。
- 不增加文字、水印、背景或新物体。
- 不改变未授权的色相、光向和描边。

验收标准：
- 指定问题已解决。
- 对 mask 外区域执行像素差检查；提示词中的“保持不变”不能替代 diff 证据。
- 几何、Alpha、像素差和运行叠加检查均通过后，方可替换原资产。
```

### 7.15 P8B：仅修正透明背景

主体造型已经批准，但输出带白底、棋盘格或背景污染时使用。优先使用确定性 mask/matting，再把原始主体 RGB 与新 Alpha 合成；生成式修图只能产生待审候选。

```text
任务类型：背景 Alpha 修正。

目标：
保留已批准主体的造型和内部像素，只处理明确列出的背景污染。

背景污染：{{BACKGROUND_CONTAMINANTS}}
必须保留的主体外部效果：{{APPROVED_EXTERNAL_EFFECTS}}

本轮唯一变化：
- 只移除 BACKGROUND_CONTAMINANTS 中明确列出的白底、棋盘格或背景色。
- 主体以外开放区域和四个角必须为 Alpha 0。

必须保持完全不变：
- 主体位置、尺寸、比例、朝向、轮廓、内部颜色、材质、描边和功能细节。
- 原画布尺寸和主体在画布中的坐标。

输出：
- 真透明 RGBA 候选；当前 FairyGUI 规范交付统一为 PNG。
- 保留抗锯齿边缘和细小功能部件。

禁区：
- 不移动、缩放、裁切、重绘、重新上色或重新打光。
- 不添加文字、网格、UI、Logo、水印或新物体。
- 无法可靠区分背景污染和 APPROVED_EXTERNAL_EFFECTS 时停止，返回 blocked/needs_mask。

验收标准：
- 外部工具确认四角和 padding 开放区 Alpha 为 0。
- APPROVED_EXTERNAL_EFFECTS 完整保留。
- 主体 bbox、坐标和内部 RGB 没有非授权变化。
```

即使执行了这条提示词，也必须检查四角 Alpha、可见 bbox、发丝/细绳/手指等细节和主体 RGB；“运行过抠图”不是通过证据。

### 7.16 P9：FairyGUI 装配

```text
角色：熟悉 FairyGUI 与当前引擎集成方式的 UI 工程师。

目标：
把已批准布局和生产资产装配成可在 FairyGUI Editor 往返编辑、发布并由程序绑定的组件。

权威输入：
- 仓库规则：{{REPO_RULES}}
- 执行模式：{{EXECUTION_MODE}}  # editor_manual、approved_generator 或 plan_only
- 允许写入范围：{{ALLOWED_WRITE_SCOPE}}
- FGUI 所有权策略：{{FGUI_OWNERSHIP_POLICY}}
- 包名与组件名：{{PACKAGE_NAME}} / {{COMPONENT_NAME}}
- 布局：{{LAYOUT_SPEC}}
- 状态矩阵：{{STATE_MATRIX}}
- 资产清单：{{ASSET_MANIFEST}}
- 稳定 ID：{{IDS_LOCK}}
- 当前 FairyGUI 工程：{{FGUI_PROJECT_STATE}}

不变量：
- 节点名、资源 ID、Controller 名和 page 保持稳定。
- editor-owned 与 machine-owned 文件边界不变。
- 动态内容继续使用 Text、Loader、List 等运行时节点。
- 装配结果必须能被真实 FairyGUI Editor 读取、保存和发布。

任务：
1. 先阅读仓库规则、现有包结构、命名约定、发布配置和可用工具；不要假定规划中的命令已实现。
2. 建立节点树、资源引用、层级、Controller、Gear、Relation、点击区、Loader、列表和九宫格。
3. 只写入 ALLOWED_WRITE_SCOPE 中当前执行方明确拥有的文件；本仓默认通过 Editor 操作 XML。
4. 使用真实 Editor 发布，不手工生成二进制和图集。
5. 运行现有 codegen 与验证。
6. 输出绑定表、变更文件、发布证据和未解决项。

输出 YAML：
package:
component:
ownership:
node_bindings:
controllers:
relations:
resource_ids:
shared_packages:
changed_files:
publish_evidence:
validation:
unresolved:

禁区：
- 不手工伪造 .bin、atlas 或 Creator .meta。
- 不从效果图猜 Controller、Gear、热区或隐藏节点。
- 自动生成器或文本脚本不得覆盖 editor-owned XML；人工只可在授权范围内通过 FairyGUI Editor 修改。
- machine-owned XML 只能由已批准生成器原子生成；同一文件不能由两方共同拥有。
- 不把业务逻辑写进 FairyGUI 组件。
- 无法运行 Editor 时，不得宣称已发布；应输出精确人工步骤和阻塞项。

验收标准：
- Editor 可打开、保存、重开和重新发布，无丢节点或丢引用。
- ID 唯一稳定，程序绑定名与清单一致。
- 全部状态可由 Controller/Gear 或运行时绑定表达。
- 基准分辨率和目标适配尺寸无裁切、错位和异常点击区。
```

### 7.17 P10：程序接线

```text
角色：客户端 UI 架构工程师。

目标：
将已发布 FairyGUI 组件接入现有程序架构，使页面在真实运行时完成数据展示、事件处理和状态切换。

权威输入：
- 仓库规则：{{REPO_RULES}}
- FairyGUI 绑定表：{{FGUI_BINDINGS}}
- UI 状态矩阵：{{STATE_MATRIX}}
- 数据与事件契约：{{RUNTIME_CONTRACT}}
- 当前代码：{{CURRENT_CODE}}

不变量：
- 协议名、错误码、数据类型和公式从现有共享契约导入。
- View 只负责引擎/FGUI 绑定、渲染和动作转发；业务决策进入 Logic。
- 不直接修改生成镜像或生成产物。
- 页面打开、关闭、事件订阅和异步取消必须成对处理。
- 同一运行时状态必须得到确定性的 UI 输出。

任务：
1. 按仓库约定 codegen、注册并动态加载页面。
2. 建立类型安全的节点绑定。
3. 实现 render(model) 或等价单向渲染入口。
4. 接入点击、列表、Loader、等待、成功、失败、断线和恢复。
5. 防止重复提交、重复订阅和关闭后迟到回调。
6. 为 Logic 和状态映射添加无头测试。
7. 执行同步、类型检查和无头测试，并完成至少一次 Creator 页面加载 smoke。

输出 YAML：
implementation_summary:
changed_files:
state_coverage:
event_flow:
cleanup_guarantees:
tests:
runtime_evidence:
creator_smoke:
known_gaps:

禁区：
- 不在 View 内实现业务公式。
- 不复制 shared 中已有的协议常量。
- 不用静态截图代替真实运行验证。
- 不隐藏失败状态或用日志替代用户反馈。
- 不绕过正式包加载、ViewMgr 和页面组合入口。

验收标准：
- 状态矩阵中的每个状态和转换都有实现或明确阻塞。
- 快速连点、开关页面和网络失败不会产生重复请求或泄漏。
- 类型检查、相关测试和 Creator 页面加载 smoke 通过；这不构成 G8a 的全状态、全尺寸正式验收。
```

### 7.18 P11：QA 审计与最小修复

```text
角色：UI 集成 QA、技术美术和客户端诊断工程师。

模式：{{MODE}}  # audit 或 fix
授权修复缺陷：{{AUTHORIZED_DEFECT_IDS}}
严重级别规则：{{SEVERITY_POLICY}}

目标：
依据批准真源对 {{PAGE_ID}} 做全状态、全尺寸、真实运行时验收；若模式为 fix，只修复已证实且已授权的问题。

权威输入：
- UI 需求：{{UI_REQUIREMENTS}}
- 状态矩阵：{{STATE_MATRIX}}
- 布局：{{LAYOUT_SPEC}}
- 风格锚点和效果图：{{STYLE_ANCHOR}} / {{PAGE_CONCEPT}}
- 资产清单：{{ASSET_MANIFEST}}
- 运行时契约：{{RUNTIME_CONTRACT}}
- 实际截图、录像、日志和测试结果：{{RUNTIME_EVIDENCE}}
- 仓库规则：{{REPO_RULES}}

不变量：
- 不为修一个问题改变已批准的信息架构、风格或业务行为。
- 修复必须落到真正所属层：需求、状态、布局、资产、FGUI、发布、程序或性能。
- 生成产物必须通过其真源修复后重新生成。
- 每次只处理证据充分的缺陷。

任务：
1. 覆盖所有状态、目标分辨率、安全区、长文本、极值数字和快速重复操作。
2. 对比期望与实际，定位第一个发生偏差的层。
3. 建立缺陷表并给出最小修复方案。
4. audit 模式可以列出全部缺陷，只报告不修改。
5. fix 模式每次只处理一个授权 defect_id，或一组具有同一最早根因、只修改同一真源的缺陷；否则停止并要求拆批。
6. 提供修复前后证据和回归结果。

输出 YAML：
test_matrix:
defects:
  - id:
    severity:
    state_and_device:
    expected:
    actual:
    evidence:
    root_cause_layer:
    root_cause:
    minimal_fix:
    regression_scope:
fixes_applied:
before_after_evidence:
commands_and_results:
gate: pass | fail | blocked

禁区：
- 不仅凭主观审美判定程序缺陷。
- 不用代码位移补偿错误裁图，也不用重新出图掩盖错误数据。
- 不直接编辑发布物或生成镜像。
- 没有真实运行证据时不得宣布完成。

验收标准：
- G1/G2 定义的路径和状态全部被测。
- 目标尺寸、安全区和目标语言均有证据。
- 严重缺陷为零，其余缺陷有明确接受决定。
- 修复没有引入新的状态、布局、资源或性能回归。
```

### 7.19 给 Codex 的持续编排提示词：执行到下一个人工 Gate

这条提示词用于让 Codex 持续编排一个批次，但每次只执行到下一个需要人工批准或外部工具的 Gate。它不会取消人工视觉批准、FairyGUI Editor 发布和 Creator/真机验收。

```text
为 {{PROJECT_NAME}} 的 {{FEATURE_NAME}} / {{PAGE_ID}} 执行《FairyGUI-ui.md》定义的 UI 生产流水线。

先阅读：
- 仓库 AGENTS.md 与 {{REPO_RULES}}
- 已冻结策划案 {{GDD}}
- 现有客户端和 FairyGUI 文档
- 当前页面、包、契约、代码和测试

固定参数：
- 平台：{{PLATFORM}}
- 逻辑画布：{{DESIGN_WIDTH}} × {{DESIGN_HEIGHT}}
- 安全区：{{SAFE_AREA}}
- 目标语言：{{TARGET_LANGUAGES}}
- 目标 FairyGUI package/component：{{PACKAGE_NAME}} / {{COMPONENT_NAME}}

执行规则：
1. 先盘点已有产物和 Gate，只推进第一个未通过阶段；到下一个人工 Gate 立即停止，不得跨 Gate。
2. 用 P1/P2 先把策划转换为 UI 需求、数据动作契约和状态矩阵，所有未知项显式报告。
3. 用 P3 建立线框和布局契约；layoutMode=editor 时标注图是 handoff/审稿资料，layoutMode=machine 时才允许由布局数据反绘；任何模式都不能 OCR 反推。
4. 按 P4A → 人工批准 → P4B → P5 → P5R 的顺序锁定风格和效果图。效果图只用于评审，动态文字留槽，不直接进入运行目录。
5. 用 P6 建资产清单。扁平图中被遮挡、带背景或无透明 Alpha 的对象不得矩形裁成伪独立件。
6. 用 P7 一次生成一个批准资产，用 P8 做单变量修订；每轮重复不变量和参考图职责。
7. 按当前仓库真实能力在 FairyGUI Editor 装配和发布；不要假定 layout 编译器存在，不手改 XML，不伪造 .bin、atlas 或 .meta。
8. 按仓库 View/Logic、动态 import、viewRegistry、pages、codegen 和同步规则完成程序接线。
9. G7 运行自动检查和 Creator 加载 smoke；G8a 再通过 Cocos Dashboard 打开的 Creator 做全状态集成验收；有真机承诺时继续 G8b。
10. 每个阶段输出产物、决策、未解决项、检查结果和 Gate 结论；没有证据不得写“完成”。
11. 修复必须回到最早错误真源，再顺序重建下游。
12. 只提交本批相关文件，保留用户其他修改；Git 操作遵守仓库约定。

本轮允许变化：
{{CHANGE_REQUEST}}

必须保持：
{{APPROVED_INVARIANTS}}

最终报告：
- 只列出本轮实际产生且有证据的产物。
- 尚未到达的下游项目列为 pending，不得为了满足清单而伪造。
- 策划到 UI 的追溯表
- UI 需求、UI model、状态矩阵、scenario fixtures、运动反馈和性能预算
- 布局契约和线框/标注图
- style anchor、效果图、提示词与批准记录
- asset manifest、生产源、运行资产与技术检查
- FairyGUI 绑定表和真实发布证据
- View/Logic 接线与测试
- Creator G8a 全状态验收证据，以及交付需要时的 G8b 真机证据
- 未完成或被阻断事项
```

---

## 8. 验收矩阵

### 8.1 契约与布局

```text
□ 策划条款能追溯到页面、显示字段或用户动作
□ 每个显示字段都有来源、格式、刷新触发和极值样例
□ 每个异步动作都有等待、成功、失败、取消和防重复语义
□ 状态可由显式 UI model 唯一判断，互斥/正交维度拆分合理
□ 每个状态都有可重复 scenario fixture；没有驱动器时已明确记录待实现项
□ 节点 stable key 唯一，父子关系闭合，z-order 明确
□ 长文本、最大数字、空/满列表和目标长短屏通过
□ layoutMode=editor 时 Editor 是坐标真源；layoutMode=machine 时 annotation/XML 均由 JSON 生成
```

### 8.2 美术资产

```text
□ 效果图、生产源和运行资产目录分离
□ 每个运行资产有 stable key、来源、批准状态和哈希
□ 动态文字、数字、头像和远端内容没有烘焙
□ 透明件四角 Alpha 正确，无白底、棋盘格、色边或背景污染
□ trim、padding、pivot 和页面 anchor 由 manifest/确定性工具处理且不导致视觉漂移
□ 九宫格中心区有效，inset 没落在圆角、描边或装饰上
□ fullCanvas 层保持完整画布和固定坐标
□ contact sheet 中同系列资产的光向、比例、色板和描边一致
□ 运行尺寸下仍清晰，并满足内存、压缩和图集预算
```

### 8.3 FairyGUI

```text
□ 需程序访问的节点使用正确前缀和真实类型
□ Controller/page、Gear、Relation、List/defaultItem 与状态矩阵一致
□ Loader、clearOnPublish、动态资源和 sharedPkgs 闭包完整
□ scale9grid、tile、触摸区和 displayList 顺序正确
□ Editor 完整重载、保存、重开无自动修复或丢引用
□ 发布物由 Editor 产生，Creator .meta 由真实导入产生
□ codegen 后 AUTO 区块、fguiContracts 和 registry 契约一致
□ 若启用生成 XML，Editor-owned 与 machine-owned 文件没有双写
```

### 8.4 程序与运行时

```text
□ View 只做绑定、渲染和动作转发，Logic 无 cc/fairygui 依赖
□ 页面通过 registry 和动态 import 打开
□ sharedPkgs、layer、onlyOne、permanent、interactive 配置正确
□ 数据/回调在 ViewHandle 生命周期内注入，异步支持取消
□ 快速连点不会重复提交，重开不会重复订阅
□ 页面关闭后迟到响应不会继续更新视图
□ 加载失败、超时、断线、重连和业务拒绝有明确表现
□ 自动检查全部通过
□ Creator 加载 smoke 通过；G8a 另有完整状态矩阵和目标尺寸证据
```

### 8.5 目标平台与真机（交付承诺需要时）

```text
□ 目标平台构建在声明的设备矩阵上安装和运行
□ 四边安全区、刘海、圆角、状态栏和 Home indicator 有真机证据
□ 触摸/键鼠/返回键、切后台恢复和权限路径通过
□ 实际压缩纹理、显存、内存、首开、包加载、帧耗和 FPS 满足 performance-budget.yaml
□ 弱网、断网、恢复和平台生命周期有可重复证据
```

---

## 9. 变更影响与回退

| 变更类型 | 回到哪一层 | 必须重建/回归 |
| --- | --- | --- |
| 玩法规则、解锁、奖励、字段或动作 | G0/G1 | 状态、布局、视觉、FGUI、程序和全状态验收 |
| 新增异常态或状态判定变化 | G1 | G2、FGUI Controller/程序状态映射和相关视觉状态 |
| 坐标、层级、热区、适配变化 | G2 | 标注、FGUI Relation/节点、Creator 尺寸验收 |
| 色板、材质、描边、角色身份变化 | G3 | 所有受影响资产、contact sheet、页面视觉验收 |
| 单件 Alpha、尺寸、padding 或 pivot | G5 | 资产检查、FGUI 引用、页面叠加和图集检查 |
| Controller、Gear、Relation、列表模板变化 | G6 | codegen、契约测试、程序状态映射和 Creator |
| 数据绑定、事件、生命周期变化 | G7 | Logic/View 测试、异常路径和 Creator |
| 发布配置、图集或压缩变化 | G6 | manifest、资源导入、透明边、串色、内存和性能 |

回退原则：保留上一批已通过 Gate 的完整产物；新批次在所有检查通过前不得覆盖已知可用版本。未来自动编译器必须使用临时目录和原子替换。

---

## 10. 从人工 MVP 演进到自动化

### M0：人工可复现

先选 1～2 个代表页面跑通：

- 使用 `layoutMode: editor`，结构化记录 UI 需求、状态矩阵和 handoff 布局，但以 FairyGUI Editor 设计源作为最终结构坐标真源；
- 人工批准 style anchor、效果图和独立资产；
- 人工在 FairyGUI Editor 装配、发布；
- 使用现有 codegen、manifest 和测试；
- 记录尺寸、pivot、九宫格、来源和缺陷。

这一阶段的目标不是“零人工”，而是确认每一步可追溯、可复现、能在 Creator 中运行。

### M1：混合自动化，推荐长期形态

当至少两个页面显示出稳定的重复规则后，再建设：

- `ui-layout.schema.json`；
- `ids.lock.json`；
- Alpha bbox、padding、pivot、九宫格的确定性处理；
- 由 JSON 反绘标注图；
- `compile-report.json`；
- machine-owned 纯视觉子组件；
- Editor-owned 页面外壳；
- 临时目录编译、原子替换和 `--check` 漂移模式。

这些能力完成 round-trip 后，目标 machine-owned 组件才切换为 `layoutMode: machine`。机器负责重复且确定的部分，Editor 保留复杂组件、Transition、List 模板和交互编排。这是最稳妥的成熟方案。

### M2：受控整页生成

只有 M1 经过多轮 Editor round-trip 后，才逐项开放：

- 简单整页 machine-owned XML；
- Button、ProgressBar、List 等审核过的白名单模板；
- Schema 升级器；
- CI 中的稳定 ID、引用闭包、来源白名单和连续编译零 diff；
- 提示词、参考图、批准源、模型参数和哈希的版本化记录。

复杂动画和特殊交互不必为了“全自动”强行纳入生成器。

---

## 11. 明确禁止的捷径

- 从一张扁平效果图直接猜全部透明层和被遮挡像素。
- 从带框标注截图 OCR 坐标，再把截图当布局真源。
- 让图片模型生成带精确坐标、精确命名的整张 sprite sheet。
- 把动态文字、数值、头像、价格或倒计时烘焙进美术图。
- 把生成图上的白底或棋盘格误认为透明 Alpha。
- 让生成器和 FairyGUI Editor 同时修改同一个组件 XML。
- 手工伪造 `.bin`、atlas、trim、rotation、分页或 Creator `.meta`。
- 在编译阶段重新调用图片模型；进入装配链的源必须已批准并锁定哈希。
- 为修最终画面直接修改发布目录、同步镜像或其他生成物。
- 只看默认静态页面就宣布可运行或验收完成。
- 把规划中的 `compile:fgui-layout` / `verify:fgui-layout` 当成当前已有命令。

---

## 12. 首次落地建议

第一次实施不要选择最简单页面，也不要选择最复杂页面。推荐选择一个包含以下元素的中等复杂页面：

- 一个背景或同画布视觉层；
- 一个九宫格面板；
- 一组运行时文本和极值数字；
- 一个列表及空态；
- 至少两个正交状态维度；
- 一个动态 Loader；
- 一个异步按钮操作和错误态；
- 需要安全区或底部 Relation 的元素。

用这个页面跑通 G0～G9，再选第二个风格相同、结构不同的页面。两页完成后复盘哪些步骤真正重复、哪些语义仍依赖人工判断，再决定 M1 自动化的最小范围。这样得到的是可持续生产系统，而不是只对一张示例图有效的脚本。

---

## 13. 参考资料

- [客户端开发与 FairyGUI 接入](docs/CLIENT.md)
- [FairyGUI 编辑器工程说明](apps/art/fairygui/README.md)
- [OpenAI GPT Image Generation Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
