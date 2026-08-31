# FairyGUI UI 生产、装配与自动化工作流

> 文档版本：2.0<br>
> 编写日期：2026-08-31<br>
> 适用范围：任意玩法或业务模块<br>
> 当前仓库技术栈：Cocos Creator 3.8.8 + FairyGUI 1.2.2 + TypeScript

本文定义从“已经完成的策划案”到“可以在 Creator 中真实运行并验收的 UI”的完整生产链，同时给出未来从结构化布局生成 SVG、PNG 和受控 FairyGUI XML 的自动化技术边界。

本文描述的是工作流、交付契约和演进目标，不代表所有自动化工具已经实现。当前仓库已经具备 FairyGUI Editor 工程、发布链、View codegen、结构契约与测试；`layout.json → 切图/XML` 编译器、`ids.lock.json`、浏览器 UI Studio 和对应命令仍属于后续建设目标，不能当作现成功能使用。

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

视觉迭代要明确“本轮允许改变什么”和“哪些内容必须保持不变”。例如只修改按钮材质时，不允许同时改变构图、角色比例、色板或光向。OpenAI 当前图像生成提示指南同样建议明确约束、反复声明不变量，并用小步迭代代替一次塞入过多变化；配套的 [FairyGUI UI 生产流水线提示词工具](../tools/FAIRYGUI-Prompts.md) 中的图片模板按这一结构设计。该工具仅提供辅助执行模板；与本文冲突时，以本文的流程、Gate 和验收要求为准。参见 [OpenAI GPT Image Generation Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)。

### 2.5 生成只覆盖 machine-owned 文件

自动生成器只能整文件重建明确标记为 `machine-owned` 的文件。人工维护的页面外壳、复杂列表、Transition 和交互组件属于 `editor-owned`。生成器不得局部猜测并覆盖人工子树。

唯一可能的受控例外是 `package.xml` 的资源登记：只有在项目先修改现行“XML 只由 Editor 修改”政策、取得明确文件授权并实现白名单 AST 合并与 round-trip 测试后，工具才能增改自己登记的条目。这个例外不代表生成器拥有 `package.xml` 的其他内容，更不允许它修改 Editor-owned 组件树。

### 2.6 任何修复都回到最早的错误真源

- 玩法、状态或数据错误：回 UI 契约。
- 坐标、层级、热区或适配错误：`layoutMode: editor` 回 FairyGUI 设计源，`layoutMode: machine` 回 `layout.json`。
- 色板、造型、透明边或 pivot 错误：回生产美术源。
- Controller、Relation 或包引用错误：Editor-owned 内容回 FairyGUI 设计源，machine-owned 内容回 `layout.json`、审核模板或编译器。
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

#### 自动化边界

当前默认仍是人工在 FairyGUI Editor 中维护 XML。未来启用 machine-owned 组件时，必须遵守第 7 节的文件所有权、稳定 ID、原子写入、Editor round-trip 和官方发布边界；没有获得明确授权的生成器不得写 XML。

当前 `package.json` 没有 `ui:studio`、`compile:fgui-layout`、`verify:fgui-layout` 或 `diff:fgui-layout`。这些能力真正实现并通过金样验证前，文档、提示词和验收记录都不得宣称它们可用。

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

## 5. 当前仓库执行清单

### 5.1 FairyGUI Editor 发布前

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

### 5.2 发布、接线与自动检查

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

## 6. 从人工 MVP 演进到自动化

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

## 7. Machine 模式技术规范

### 7.1 定位与启用条件

Machine 模式的目标不是“从一张效果图自动还原完整 UI”，而是让已经批准的结构化布局和分层生产源可重复生成审稿投影、运行切图和受控 FairyGUI 设计源。

职责固定为：

> SVG 负责看和拖，`layout.json` 负责记录 machine-owned 子树，FairyGUI XML 负责交付给 Editor，PNG 负责运行和分段核验。

只有同时满足以下条件，组件才能从 `layoutMode: editor` 切换为 `layoutMode: machine`：

- 已有通过 Editor 手工创建的最小金样和真实 ID；
- Schema、稳定 ID、图片处理和 XML 编译器已经实现；
- 相同输入连续编译能得到确定性输出；
- FairyGUI Editor 可以打开、保存、重开并发布生成组件；
- Editor round-trip 没有未解释的语义变化；
- Creator 可以加载发布物并通过结构与视觉验收；
- 组件文件被整体标记为 machine-owned，且不与 Editor 双写。

`layout.json` 只对它拥有的生成子树构成唯一布局真源。Editor-owned 页面外壳、复杂组件和交互编排仍以 Editor 设计源为真源；跨边界关系必须通过组件边界、Relation、命名绑定或显式契约表达，禁止在两边复制同一组坐标并分别维护。

### 7.2 为什么不能从扁平效果图直接生成

扁平 PNG 或嵌入整张效果图的 SVG 可以用于视觉评审，但不包含：

- 被遮挡对象的完整像素和真实 Alpha；
- Button 正常、按下、禁用等状态；
- 可替换文字、动态数字、头像和远端内容；
- 节点树、点击区、pivot、锚点和层级；
- 九宫格、mask、blend、Controller、Gear 和 Relation 语义。

矩形裁切不能恢复已经丢失的信息。正确输入必须是分层母版、完整 RGBA 单体、批准的 mask、字体和图标，以及显式布局契约。只有确认无需透明、无遮挡且不会复用的区域，才允许使用声明过的 `crop`。

FairyGUI XML 也不能直接充当浏览器 DOM。它没有 CSS cascade、flex 或 grid，`displayList` 顺序具有层级语义，并依赖 package item、child、Controller page 等稳定 ID。Editor 还可能补默认值或规范化字段，且没有承诺 XML 是长期稳定的外部交换协议。因此必须通过版本化中间模型和 Editor 金样约束可生成子集。

### 7.3 总体数据流

```text
批准的契约与视觉目标 + asset manifest + 分层母版 / 独立 RGBA
                           │
                           ▼
                 layout.json + ids.lock.json
                  布局真源       稳定 ID 真源
                           │
                           ▼
                    fgui-layout-compiler
          ┌────────────────┼─────────────────┐
          ▼                ▼                 ▼
     review.svg       generated/*.png    machine-owned XML
     annotation.png   composite.png      package.xml 授权条目
     diff.png         compile-report
          └────────────────┼─────────────────┘
                           ▼
             FairyGUI Editor 重载、往返与正式发布
                           ▼
                 .bin + atlas + 独立纹理
                           ▼
                    Cocos Creator 导入
                           ▼
             runtime.png + 结构检查 + 差异报告
```

生成链不自行伪造 `.bin`、atlas 坐标、trim、rotation、分页或 Creator `.meta`；它们继续由 FairyGUI Editor 和 Cocos Creator 产生。

### 7.4 文件所有权

| 文件或目录 | 职责 | 所有者 | 直接人工编辑 |
| --- | --- | --- | --- |
| 分层 PSD/PSB/SVG、完整 RGBA 源件 | 像素、造型与透明度真源 | 美术 | 允许 |
| `*.target.approved.png` | 人工批准的视觉目标 | 审稿流程 | 重新审稿后替换 |
| `*.layout.json` | machine-owned 子树的几何、FGUI 映射及资产/状态 stable key 引用 | UI Studio/开发者 | 允许，推荐通过 Studio |
| `ids.lock.json` | stable key 到 FairyGUI ID 的映射 | 编译器 | 禁止手改，只追加或显式迁移 |
| `*.review.svg`、`*.annotation.png` | 浏览器画布与审稿投影 | 编译器 | 禁止 |
| `generated/*.png`、`*.composite.png` | 运行切图与布局重建证据 | 编译器 | 禁止 |
| `<Generated>.xml` | machine-owned 纯视觉或白名单组件 | 编译器 | 禁止 |
| `<Page>.xml` | 页面外壳、复杂控件和交互编排 | FairyGUI Editor | 只在 Editor 中编辑 |
| `package.xml` | 包数据库 | 默认由 Editor 拥有；未来生成器仅拥有获批条目 | 禁止人工文本修改 |
| `.bin`、atlas、独立发布纹理 | 正式运行发布物 | FairyGUI Editor | 禁止 |
| Creator `.meta` | Creator 资源身份和导入信息 | Cocos Creator | 禁止伪造 |
| `*.runtime.png` | 真实运行证据 | 验收流程 | 运行时生成 |

本仓当前规则仍是 XML 只能通过 FairyGUI Editor 修改。启用 machine-owned XML 前，必须先取得针对明确文件的窄化授权；`package.xml` 只有在白名单 AST 合并、未知字段保留和 round-trip 测试全部通过后才能开放生成器条目。

### 7.5 推荐目录

```text
docs/ui/<feature>/<page>/
├─ 00-input/
├─ 10-contract/
├─ 20-layout/
│  ├─ <Page>.layout.json
│  ├─ <Page>.review.svg
│  └─ <Page>.annotation.png
├─ 30-visual/
├─ 40-production/
│  ├─ asset-manifest.json
│  ├─ source/
│  ├─ runtime/
│  └─ contact-sheet.png
└─ 90-evidence/
   ├─ <Page>.composite.png
   ├─ <Page>.runtime.png
   ├─ <Page>.diff.png
   ├─ compile-report.json
   └─ acceptance.md

apps/art/fairygui/
├─ layout/<Package>/ids.lock.json
└─ assets/<Package>/
   ├─ package.xml
   ├─ <Page>.xml
   ├─ <Generated>.xml
   └─ generated/*.png

apps/Cocos/assets/resources/ui/
├─ <Package>.bin
├─ <Package>_atlas*.png
└─ *.meta
```

`40-production/runtime/` 只是审稿和交接暂存区。通过 G5 的资产必须按清单导入 FairyGUI 包，不能让暂存副本和包内副本成为两份可独立修改的真源。

### 7.6 Machine-mode `layout.json` 模型

本节是合并文档中唯一的 machine-mode 语义骨架。真正实现后，仓库中的版本化 JSON Schema 才是唯一可执行契约；本文负责定义真源边界和最小数据流，不用第二份示例替代正式 Schema。

相邻契约之间只允许稳定引用，禁止复制同一事实：

| 事实 | 权威真源 | `layout.json` 中允许保存的内容 |
| --- | --- | --- |
| 资产来源、哈希、sourceMode、裁切、Alpha bbox、padding、美术锚点、运行尺寸、九宫格、atlas、exported 与输出文件 | `asset-manifest.json` | manifest 路径与哈希；node 只引用资产 stable key |
| 业务状态、判定条件和数据 fixture | `state-matrix.yaml`、`scenario-fixtures.yaml` | Controller/page 的 FGUI 映射与 scenario stable key |
| 动态字段来源、格式和刷新语义 | `runtime-contract.yaml` | text slot 到 node/绑定名的映射 |
| 节点树、逻辑坐标、层序、pivot、FGUI Controller/Gear/Relation 和运行时 mask | `layout.json` | 完整 machine-owned 几何与装配语义 |

编译器把解析后的资产元数据、状态映射和引用闭包写入 `compile-report.json` 作为只读快照；这些快照不能反向编辑，也不能成为新的真源。

```json
{
  "$schema": "<schema-path>",
  "schemaVersion": 1,
  "layoutMode": "machine",
  "canvas": {
    "logicalSize": [750, 1624],
    "origin": "top-left",
    "adaptationAssert": {
      "mode": "MatchWidth"
    }
  },
  "safeArea": {
    "mode": "runtime",
    "referenceInsetsLogicalPx": [0, 0, 0, 0]
  },
  "package": {
    "stableKey": "package.example",
    "name": "<Package>",
    "idSource": "editorSeeded"
  },
  "component": {
    "stableKey": "component.example.generated",
    "name": "<Generated>",
    "ownership": "machine",
    "exported": false
  },
  "assetManifest": {
    "file": "../40-production/asset-manifest.json",
    "expectedSha256": "<sha256>"
  },
  "nodes": [
    {
      "stableKey": "node.example",
      "parent": null,
      "type": "image",
      "name": "img_example",
      "asset": "asset.example",
      "rectLogicalPx": [0, 0, 128, 128],
      "pivotNormalized": [0.5, 0.5],
      "pivotAsAnchor": false,
      "zOrder": 0,
      "touchable": false,
      "visible": true
    }
  ],
  "controllers": [
    {
      "stableKey": "controller.view",
      "name": "view",
      "stateDimension": "ui.state.view",
      "pages": [
        {
          "stableKey": "controller.view.page.default",
          "name": "default",
          "stateValue": "default"
        }
      ]
    }
  ],
  "gears": [],
  "relations": [],
  "masks": [],
  "hotspots": [],
  "textSlots": [],
  "lists": [],
  "scenarios": [
    {
      "stableKey": "scenario.default",
      "fixture": "scenario.default",
      "controllerPages": {
        "controller.view": "controller.view.page.default"
      }
    }
  ],
  "diffMasks": []
}
```

契约要求：

- `layoutMode: machine` 与 `component.ownership: machine` 必须同时成立；`layoutMode: editor` 只能搭配 editor ownership，编译器不得接受交叉组合；
- `assetManifest.file`、`$schema` 和所有间接资源路径必须位于批准根目录，且 manifest 哈希必须匹配；
- 正式 Schema 的所有对象都设置 `additionalProperties: false`，版本变化只能通过显式升级器迁移；
- `sourcePx` 和 `logicalPx` 明确分离并统一左上原点；source-space 字段以 `SourcePx` 结尾，布局和运行尺寸以 `LogicalPx` 结尾；
- `referenceInsetsLogicalPx` 顺序固定为 left/top/right/bottom，只是测试参考值，不覆盖运行时安全区；
- `adaptationAssert` 和发布配置只允许读取与校验；单个页面的编译不得修改 `Adaptation.json`、`Publish.json` 或 Creator 工程设置；
- node 的 `asset` 与 `component` 按类型二选一；同一父节点下 `zOrder` 唯一，并据此生成 `displayList`，不得按名称排序；
- asset manifest 的 `sourceAnchorNormalized` 描述裁切前美术锚点，node 的 `pivotNormalized` 与 `pivotAsAnchor` 描述 FGUI 语义；编译器负责坐标回算；
- 基础显隐只使用 node 的 `visible`，条件显隐只通过 Gear 表达，不维护 `visibleWhen`；
- Controller 及 page、Gear、Relation、mask、hotspot、text slot、list、scenario 和 diff mask 都有 stable key，引用必须闭合；
- Controller 的 `stateDimension/stateValue`、scenario 的 `fixture` 和 text slot 的运行时字段只能引用上游契约，不复制判定条件、数据快照或格式规则；
- M1 纯视觉编译器要求 `hotspots` 与 `lists` 为空；只有 M2 的审核模板和绑定契约落地后才逐项开放；
- scenario 覆盖关键 Controller page、极值文本、异常态和目标安全区；动态差异只能通过带 reason 的显式 diff mask 排除。

### 7.7 切图与图像规则

本节资产规则同时适用于 `layoutMode: editor` 和 `layoutMode: machine`。Editor 模式由人工或独立确定性工具执行并登记证据；Machine 模式才由布局编译器自动执行。

| `sourceMode` | 用途 | 允许条件 |
| --- | --- | --- |
| `copy` | 无损复制批准的独立源 | 文件哈希已锁定 |
| `fullCanvas` | 保持源画布坐标的完整层 | 背景、灯光、前景遮挡等同画布层 |
| `alphaBBox` | 按可见 Alpha 和显式 padding 裁切 | 已有真实透明通道，并记录裁切前原点 |
| `crop` | 按显式矩形裁切 | 确认无背景污染且无遮挡缺失 |
| `mask` | 使用独立 Alpha mask | mask 是批准输入，不能自动猜 |
| `nineSlice` | 生成可伸缩源图 | 四边 inset 明确且中心区有效 |

可供 machine 模式消费的 manifest 条目至少登记：asset stable key、源文件及 SHA-256、颜色模式、是否要求 Alpha、`sourceMode`、`sourceRectSourcePx`、`expectedAlphaBBoxSourcePx`、`paddingSourcePx`、`maskSource`、`sourceAnchorNormalized`、`runtimeSizeLogicalPx`、`nineSliceInsetsSourcePx`、`atlasPolicy`、`exported` 和 `output`。不适用字段必须为 `null`，不能省略后交给编译器猜测；`output` 只能是批准的 `generated/` 根下相对路径，禁止绝对路径和 `..`。

所有 PNG 保留真实 Alpha，不使用有损压缩。九宫格边界必须在尺寸内，四个角不能进入伸缩区；源变化而 asset manifest 没有更新、重新批准并锁定哈希时编译失败。输出先进入临时目录，完整校验通过后原子替换；删除旧资源只能按生成清单精确执行。

`fullCanvas` 不是默认逃生口。大量同画布层会增加纹理内存、加载、overdraw 和仓库体积，必须纳入 G0 性能预算和 G8b 真机测量。

### 7.8 稳定 ID

`ids.lock.json` 覆盖 package、package item、child 和 Controller page 的 stable key 映射：

- 新包必须先由 FairyGUI Editor 创建空包，再导入真实 package ID；生成器不得自行推算 package ID；
- 既有包先从真实 Editor 工程导入 ID；
- image、component 和其他 package item 共用整个包级 ID 命名空间，不得拆成互不校验的分类 ID；
- stable key 首次出现时分配，之后永久保持；
- 移动、重排和修改显示名称不改变 ID；
- 删除后写入 tombstone，旧 ID 永不复用；
- stable key 重命名必须通过显式迁移；
- package 或 package item ID 漂移、重复或引用悬空属于阻断错误；
- Relation target、Gear Controller/page、group 和 `ui://` 引用必须全部解析；
- 多分支同时新增 key 时必须由确定性合并器或串行分配流程解决冲突，不能人工挑选保留一边。

folder item 采用 FairyGUI 的规范化完整路径语义；目录移动通过显式路径迁移处理，不与永久对象 ID 混为一谈。

### 7.9 SVG 与浏览器 UI Studio

SVG 是浏览器画布和审稿投影，不是第二份布局真源。节点通过 `data-stable-key` 映射到 JSON；拖动、缩放、排序和属性编辑都更新内存中的 `layout.json`，再重新渲染 SVG。

首版 Studio 只暴露 FairyGUI 可落地的白名单能力：

- 图层选择、锁定、显隐、分组、排序与重命名；
- 拖拽、缩放、数值输入、网格和边缘吸附；
- 设计分辨率、安全区与目标屏幕比例预设；
- pivot、裁切框、Alpha bbox、九宫格保护区与热区；
- Controller/page、Gear 和 Relation 预览；
- 长文本、长数字、缺字和 target/composite/runtime/diff 切换；
- revision/hash 冲突保护、撤销重做和确定性格式化。

Studio 不支持任意 CSS、浏览器滤镜、Web 字体效果、复杂 SVG matrix 或自由 path 变形。若未来允许导入人工修改的 SVG，只接受 stable key、矩形、显隐、DOM 顺序和可归一化 translate/scale；其他语义仍以 JSON 为准。

### 7.10 XML 生成边界

首版编译器只支持经过金样验证的白名单：

- image、loader、graph、group、text 和 component；
- 坐标、尺寸、pivot、显隐、层序，以及 M1 中固定为 `false` 的 touchable；
- 简单 Controller/page、`gearDisplay`、`gearIcon` 和 Relation；
- mask 与已审核资源引用。

Button、ProgressBar、List、Transition 和复杂 Controller/Gear 保留在 Editor-owned 外壳，或以后通过仓库内带 round-trip 测试的模板开放。禁止第一版自由拼装全部 FairyGUI XML 特性。

写入要求：

- machine-owned 组件由编译器整文件重建，禁止人工修改；
- `package.xml` 只允许保留未知属性、节点和顺序的白名单 AST 合并，不使用字符串替换；
- 保留 Editor 的实际字段拼写与资源元数据，包括 `extention`、`scale9grid`、`alone_npot` 和 `exported`；
- `displayList` 严格按 `zOrder` 输出，禁止按名称排序；
- 属性正确转义，写入前完成唯一性、尺寸、资源存在性和引用闭包检查；
- Editor 在临时工程副本中的保存结果只用于结构化 diff，不得反写正式 machine-owned 文件；
- 长期优先评估 FairyGUI Editor 插件 API，以降低对未版本化 XML 细节的依赖。

### 7.11 编译、发布与验收

单次编译按以下顺序执行：

1. 解析并用 JSON Schema 校验布局；
2. 校验资源根、路径、尺寸、颜色模式、Alpha 和哈希；
3. 读取并校验 ID lock，只为新 stable key 分配 ID；
4. 计算裁切、pivot、九宫格、层序和引用图；
5. 在临时目录生成切片 PNG、review SVG、annotation/composite PNG 和组件 XML；
6. 校验资源、节点、Controller、Gear、Relation 与 `ui://` 引用闭包；
7. 在已经授权的前提下对白名单 `package.xml` 条目做 AST 合并；
8. 生成 `compile-report.json`；
9. 在固定工具链中再次编译：文本和规范化机器产物要求字节级 zero-diff，Editor 输出使用结构化语义 diff；
10. 复制完整 FairyGUI 工程到临时目录，并把 staging 候选覆盖到该副本；正式工程保持不变；
11. 在临时副本执行 Editor 重载、保存、重开和结构化 round-trip；任何差异未解释前都不得提升候选；
12. round-trip 全部通过后，才将候选 machine-owned 文件和获批 package 条目一次原子提升到正式工程；
13. 从正式工程使用 Editor 发布 `.bin`、atlas 和独立纹理；
14. 执行现有 codegen、manifest、FGUI 测试和同步检查；
15. 通过 Cocos Dashboard 打开 Creator，执行场景矩阵并获取真实运行证据。

视觉验收分成两段：

```text
target ↔ composite  ：验证拆层、切图、层序、坐标、pivot 和透明边
composite ↔ runtime：验证 XML、Editor 发布、atlas、九宫格、字体和运行时装配
```

差异报告至少包含热力图、变化像素比例和最大颜色误差。字体、抗锯齿、纹理采样、色彩空间与 Alpha 预乘必须固定环境或使用经过批准的小容差；动态粒子、倒计时和网络内容只能用显式 mask 排除。默认截图不能替代所有 Controller 状态、长短屏和安全区场景。

### 7.12 计划命令与现有衔接

以下命令是未来接口设计，当前不存在：

```bash
npm run ui:studio -- \
  --layout docs/ui/<feature>/<page>/20-layout/<Page>.layout.json

npm run compile:fgui-layout -- \
  --layout docs/ui/<feature>/<page>/20-layout/<Page>.layout.json

npm run verify:fgui-layout -- \
  --layout docs/ui/<feature>/<page>/20-layout/<Page>.layout.json

npm run diff:fgui-layout -- \
  --layout docs/ui/<feature>/<page>/20-layout/<Page>.layout.json \
  --actual path/to/<Page>.runtime.png
```

Editor 正式发布后衔接现有命令：

```bash
npm run codegen:fgui -- <Package> <Component>
node scripts/fgui-manifest.mjs --write
npm run test:fgui
npm run verify:fgui
npm run sync:client
npm run typecheck:client
npm run typecheck:client:legacy
npm run test:client
npm run verify:sync
```

`codegen:fgui` 只从已有组件 XML 生成 View AUTO 区块，不负责生成 XML、切图、`.bin` 或 atlas。更新 manifest 哈希之前必须先审阅真实设计源和发布物，禁止用 `--write` 掩盖错误。

代码直接通过 `UIPackage.createObject` 创建的正式页面或组件必须 `exported: true`。仅由 Editor-owned 外壳内部引用的 machine-owned 子组件可以保持 `exported: false`；默认只对正式外壳执行 codegen，只有业务代码确实直接访问生成组件时才为其生成独立 View。

### 7.13 Machine-mode 提交闭包

一次 machine-mode 变更必须按引用闭包提交：`layout.json`、引用的 asset manifest 与批准源、`ids.lock.json`、生成 PNG/XML、获批的 `package.xml` 变化、Editor 发布的 `.bin`/atlas/独立纹理、Creator 生成或复用的 `.meta`、更新后的 FGUI manifest，以及本批验收记录。只忽略工具缓存、临时编译目录、临时 Editor 工程和明确不作为交付物的审稿中间文件。

提交前必须验证所有被引用文件都在闭包内、所有生成物与真源同批更新，并检查仓库体积和二进制变化；不能只提交 XML 或只更新 manifest 哈希。

### 7.14 建设顺序与完成口径

建设顺序固定为：

1. 冻结 ownership、工具版本、发布设置和最小 Editor 金样；
2. 实现 Schema、路径/哈希校验、稳定 ID、迁移和失败 fixture；
3. 实现无界面 CLI 的确定性切图、白名单 XML、引用闭包和原子写入；
4. 验证 Editor round-trip、正式发布、现有 codegen/manifest 和 Creator 运行；
5. 固化 target/composite/runtime 差异环境、阈值和状态矩阵；
6. 只有 CLI 和运行链稳定后才建设浏览器 Studio；
7. 按金样逐类开放 Relation、文本槽、Button、ProgressBar、Controller/Gear、List 和 Transition。

只有以下条件全部满足，才能宣称 machine 模式可投入生产：

- 每个 machine-owned 组件只有一份权威 `layout.json`；
- 固定输入连续编译 zero-diff，旧 ID 不因重排、增删或显示名变化而漂移；
- approved target 可由批准切片和布局在阈值内重建；
- Editor 可以重载、保存、重开和发布，无丢节点、丢引用或未解释规范化；
- `.bin`、atlas 和 `.meta` 分别由官方工具产生；
- Creator 能加载页面并覆盖关键状态、目标尺寸和安全区；
- 文档、命令和验收证据明确区分“已实现”与“计划中”。

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

## 10. 明确禁止的捷径

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

## 11. 首次落地建议

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

## 12. 参考资料

- [客户端开发与 FairyGUI 接入](CLIENT.md)
- [FairyGUI 编辑器工程说明](../apps/art/fairygui/README.md)
- [FairyGUI 包与 package.xml](https://www.fairygui.com/docs/editor/package)
- [FairyGUI 发布](https://www.fairygui.com/docs/editor/publish)
- [FairyGUI 组件](https://www.fairygui.com/docs/editor/component)
- [FairyGUI 控制器](https://www.fairygui.com/docs/editor/controller)
- [FairyGUI 关联](https://www.fairygui.com/docs/editor/relation)
- [FairyGUI 编辑器插件](https://www.fairygui.com/docs/editor/plugin)
- [OpenAI GPT Image Generation Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
