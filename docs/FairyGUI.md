# FairyGUI UI 生产、装配与自动化工作流

> 文档版本：2.3<br>
> 编写日期：2026-09-02<br>
> 适用范围：任意玩法或业务模块<br>
> 当前运行时：Cocos Creator 3.8.8 + `fairygui-cc` 1.2.2 + TypeScript

本文定义从“已冻结的策划案”到“能在 Creator 中真实运行并验收的 UI”的生产链，也定义这条链应如何自动化。

本文同时包含当前能力和规划能力。阅读时必须区分：

- **当前已有**：FairyGUI Editor 工程、人工保存与发布、View codegen、`.view.json`/`feature.json` 驱动的
  `codegen:features`、生成式 FGUI 契约与 registry、结构契约测试、FGUI 发布闭包锁、发布物反解析对账、客户端同步和 Creator 人工验收。
- **实际 PSD 证据**：`docs/psd-maker/ug_main_layered_source_v02.psd` 是已保存的 source-only 分层 PSD，制作与
  composite 对账见 `docs/psd-maker.md`；它不是通用 CLI 的生产金样，也没有通过 Photoshop 往返、运行资产、三层
  stable key 或 FairyGUI 编译门禁。
- **近期优先**：统一只读 `FguiProjectIR`、PageSpec Schema、可执行 Scenario、Creator UI Gallery、设置门禁、Editor 工具链锁和发布 receipt。
- **受控试点**：CLI 编译器 PSD 版在临时完整工程中生成候选 XML/`package.xml`，再由固定版本 Editor 人工接管、
  保存—重开和正式发布。OpenFairyGUI 至多作为只读解析/影子验证候选。
- **条件式后备**：超出白名单 ownership 的包级 raw XML merge、外部 ID 兼容层和可编辑浏览器 Studio。它们不是默认建设项。

当前本机 FairyGUI Editor 6.1.4 只能作为 POC 候选基线；仓库尚未锁定 Editor 安装包哈希、工程格式 adapter、XML codec
或 Photoshop 工具链，不能把“本机可用”写成“项目可复建”。

为避免同名概念混淆，本文固定使用以下名称：

| 名称 | 含义 |
| --- | --- |
| **生产资产清单** | 页面批次的 `asset-manifest.json`，记录批准源、Alpha、裁切、pivot、九宫格和输出策略 |
| **PSD 交接包** | `PsdHandoffBundle`：批准 PSD、命名/alias、sidecar、source/prompt hash、preview 和批准记录的原子集合 |
| **CLI 编译器 PSD 版** | 内部 `authoringMode` 为 `cliPSDCompiler`；只在临时完整 FairyGUI 工程生成候选，包含 `seededTemplate` 与 `rawProjectCompiler` 两阶段 |
| **FGUI 发布闭包锁** | `scripts/fgui.manifest.json`，钉住设计源、发布物和 View AUTO 区块哈希 |
| **Editor 保存—重开往返验收** | 在真实 Editor 中打开、保存、关闭、重开，检查是否发生修复、丢失或语义变化 |
| **发布物反解析对账** | 现有 `scripts/fgui-roundtrip.mjs` 对设计源声明与 `.bin` 解析结果做语义对账；它不证明 Editor 能打开或保存 |

---

## 1. 推荐结论

当前可执行路线是“**Scenario-first + Editor-first**”；目标路线是“**Scenario-first + PSD handoff + CLI 编译器 PSD 版
+ Editor takeover**”。`editor` 流程现在可执行；`cliPSDCompiler` 必须经过 M2 的 ADR、工具锁和 golden test 后才可启用。
两条路线都以 FairyGUI Editor 作为正式结构、内部 ID、XML/`package.xml` 序列化和发布权威。

```text
G0～G2：策划冻结 → PageSpec / Scenario → 布局约束
                                      │
                                      ▼
G3～G5：视觉锁定 → 命名 + sidecar 的 PSD handoff → 批准运行资产
                                      │
                                      ▼
G6：    人工 Editor 装配（当前）
          或 CLI 临时完整工程编译候选（M2 计划）
          → Editor takeover / 人工调整
          → Editor 保存—重开 → Editor 正式发布
                                      │
                                      ▼
G7：    codegen:fgui → .view.json / feature.json / Logic / View
          → codegen:features → 生成式结构契约 / registry / routes
          → fgui-manifest --write → sync:client
                                      │
                                      ▼
G8a/G8b/G9：无头场景测试 + Creator UI Gallery（计划）
              → 人工审美批准 → 必要时真机矩阵 → 冻结证据
```

自动化建设顺序固定为：

```text
当前人工 Editor
  → 统一只读 FguiProjectIR 与设置门禁
  → Scenario Host / Creator UI Gallery
  → PsdHandoffBundle pack/verify
  → CLI 编译器 PSD 版：seededTemplate
  → rawProjectCompiler + Editor takeover
       ├─ 已满足需求：停止扩张，维持白名单 ownership
       └─ 仍有读取/兼容缺口：OpenFairyGUI 只读影子验证
              └─ 仍无法满足且另立 ADR：包级 raw XML merge 后备

可编辑浏览器 Studio 是独立的协作产品决策，只在只读在线审稿需求被证明后另行评估。
```

### 1.1 三档交付

交付档位决定证据广度，不改变单一真源、Editor 正式发布、禁止手改生成物和 Creator 真实运行等底线。

| 档位 | 使用场景 | 最小要求 |
| --- | --- | --- |
| Prototype | 内部探索、交互验证 | 真实 Editor 保存/发布；默认、错误、极值文本场景；Creator smoke；明确标记为不可交付，不承诺全状态、真机或性能 |
| Standard | 普通生产页面，默认档 | G0～G8a 与 G9；完整 required scenario；目标 viewport/locale 证据；发布闭包与结构对账；人工审美批准 |
| Full | 正式平台交付、长期复用或有性能承诺 | Standard 全部要求，加 G8b、真机安全区、多语言、实际压缩纹理和量化性能预算 |

能力成熟度 M0～M3 与交付档位是两个维度。处于 M0 的人工流程也能交付 Full 证据；进入 M2 的 CLI 自动化也不能降低验收标准。

### 1.2 效果图与可运行程序的交付边界

一张扁平效果图不包含：

- 被遮挡对象的完整像素和真实透明边；
- 哪些文字、数字、头像和图标是运行时动态内容；
- 节点树、点击热区、轴心、锚点、层级和安全区关系；
- Controller、page、Gear、Relation、列表模板和状态转移；
- FairyGUI package/resource/component/child 的内部 ID；
- 数据来源、等待、错误、重连、重复点击和生命周期语义。

因此，“视觉上接近”与“可维护、可运行、可验证”必须分阶段。视觉模型只产生候选像素；结构化契约负责语义；Editor 负责设计源与正式发布；程序和 Creator 证据负责运行结果。

### 1.3 完成定义

页面只有同时满足以下条件才算完成：

1. 每个用户路径、显示字段、动作和异常分支都能追溯到 PageSpec。
2. 每个 required state 都有可重复构造的 Scenario；M1 未落地前，至少有等价的人工记录和无头测试。
3. 每个可见部分都能映射到运行时文本、FGUI 图元、Loader 或批准资产。
4. Editor 保存—重开往返验收通过，发布物反解析对账也通过；两者不得互相冒充。
5. View、Logic、数据、事件、异步取消和页面生命周期已接线并有测试。
6. Creator 真实预览覆盖全部 required scenario 和目标尺寸，且走正常 registry/pages/Logic/View 路径。
7. 若交付承诺包含移动安全区、压缩纹理或低端机性能，目标平台构建和真机矩阵也通过。
8. 自动检查、截图或录像、缺陷记录和批准结论可复核。

---

## 2. 核心原则

### 2.1 每个事实只有一个可编辑真源

同一事实不能长期存在两个可独立修改的版本。例如，状态条件不能同时维护在 YAML fixture 和 TypeScript 测试里；
进入 Editor takeover 后，精确坐标不能同时由 sidecar 和 Editor 人工维护；CLI 与人工也不能同时拥有同一组件子树。

当前合法的 `authoringMode` 是 `editor`；M2 验证通过后可为授权组件选择 `cliPSDCompiler`：

- `editor`：当前默认。Editor 设计源是结构、精确坐标和内部 ID 真源。handoff 只保存语义角色、布局约束、适配规则和极值样例；坐标审计图应从真实设计源生成只读 snapshot。
- `cliPSDCompiler`：计划中的机器辅助方向。CLI 复制正式基线，在临时完整工程内按 `EditorAssemblyPlan` 生成白名单
  候选；候选 ID 不是正式 ID。人工在固定版本 Editor 中接管、调整、保存—重开后，Editor 设计源重新成为唯一真源。

`cliPSDCompiler` 内部先使用 `seededTemplate`，再扩展为 `rawProjectCompiler`；二者都只写临时工程。`rawXmlFallback`
专指超出白名单 ownership 的包级合并后备，未通过第 7.8 节单独 ADR 前不是合法模式。任何模式都不能与 Editor 双写或
直接覆盖正式工程。

`layoutMode: machine` 不是合法默认模式。CLI 输入统一使用经 Schema 校验的 PageSpec、`assembly-recipe.json` 与
`EditorAssemblyPlan`；不得再维护一份自由格式 `layout.json`。

### 2.2 三条真源并行但不能互相替代

- 语义线：策划规则 → PageSpec → UI model / Scenario → 数据与动作契约。
- 视觉线：风格锚点 → 整页目标 → 独立生产源 → 运行资产。
- 工程线：Editor 设计源 → 官方发布物 → View/Logic → Creator/真机证据。

提示词只是执行配方，不是项目真源；模型输出也只是候选物。只有经过 Gate 批准并进入版本库的契约、批准源、设计源、代码和证据，才能成为下游输入。

### 2.3 效果图、生产源和运行资产分离

- 效果图用于审美、构图和信息层级评审，可以是扁平图。
- 生产源是分层母版、独立透明件、原始矢量、骨骼源或九宫格源图。
- 运行资产是经过尺寸、Alpha、裁切、pivot、压缩和图集策略校验后进入 FairyGUI/Cocos 的文件。

效果图默认禁止直接进入运行目录。只有明确批准为 `fullCanvas` 的整层图片才可作为运行资产来源。

### 2.4 模型只做有证据的工作

模型不得猜测策划中没有的数据、布局中没有的热区、效果图中看不见的图层、已有 FGUI 包中的 ID，或运行时中不存在的接口。证据不足时输出 `TBD`、`needs_decision` 或 `needs_source`。

每个视觉审阅批次都要明确“允许改变什么”和“必须保持什么”。一次只处理一个可审阅变量，避免把构图、色板、材质和角色比例同时漂移。

### 2.5 自动化先补证据闭环

先让同一 Scenario 驱动无头投影、Creator Gallery 和截图证据，再自动化页面装配。能自动生成页面但不能重复构造全状态、不能在真实运行时取证，不算生产效率提升。

### 2.6 生成只覆盖明确授权范围

`cliPSDCompiler` 只可在路径守门器确认的临时完整工程创建或修改授权对象。首版 ownership 是整文件隔离的
`cli-managed-component`；人工在同一子树内修改前必须进入 takeover，之后 CLI 不得再次覆盖。候选 XML 与 ID 只是
传递载体，stable key 只做业务映射或审计，不是正式 ID 发号器。

超出 plan 白名单的 `package.xml` AST merge、混合 subtree merge 和外部 `ids.lock.json` 属于 `rawXmlFallback`，启用
条件见第 7.8 节；它们也不得成为正式工程写入器或正式 ID 发号器。

三层交接固定为：

1. **PSD 命名**：顶层可用面向美术的排序组；进入编译的叶子层使用 `ROLE::stableKey`，只回答“它是谁”。
2. **sidecar 契约**：`delivery-spec.json`、`asset-manifest.json`、`assembly-recipe.json` 回答 Controller、Gear、Relation、
   热区、九宫格和安全区“应该是什么”；任何 T/H/A 历史编号必须有显式 alias。
3. **Editor 映射**：takeover 后从正式 Editor 工程反解析 stable key 到 package/resource/component/child 正式 ID，回答
   “Editor 最终保存成什么”。映射是只读 snapshot，不参与发号。

三层 key 必须闭合；missing、orphan、duplicate 都阻断。单个 PSD、单个 XML 或单个 ID 表都不能替代完整交接。

### 2.7 修复回到最早的错误真源

- 玩法、状态、数据或动作错误：回 PageSpec / Logic。
- 坐标、层级、热区或适配错误：回当前 `authoringMode` 的权威输入。
- 色板、造型、透明边或 pivot 错误：回生产美术源或生产资产清单。
- Controller、Relation、列表或包引用错误：takeover 前回 PageSpec/recipe/compiler adapter，takeover 后回 Editor 并
  用 reconcile 判断是否需要回写上游。
- 绑定、事件或生命周期错误：回 View/Logic。

禁止修改 `.bin`、atlas、Creator `.meta`、`apps/Cocos/assets/src` 或其他生成物来掩盖上游错误。

### 2.8 Schema 与提示词的优先级

PageSpec Schema 和生产资产清单 Schema 是计划中的可执行契约；[提示词工具](../tools/FairyGUI-Prompts.md) 只能由
Schema 派生或按 Schema 校验。提示词中的 `layoutMode`、fixture 或 machine XML 描述不是项目真源，也不能演化成
第二套协议。

---

## 3. 角色、真源与目录

### 3.1 职责

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| 策划 | 规则、状态、数据、用户路径、验收和非目标 | 像素坐标、透明切图、程序接口猜测 |
| UI/UX | 页面地图、线框、交互、信息层级、适配和极值样例 | 编造业务规则、从扁平图恢复隐藏图层 |
| UI 美术 | 风格锚点、效果图、独立生产源和视觉一致性 | Controller、数据字段和 FGUI ID |
| 技术美术/UI 工程 | 生产资产清单、Alpha、pivot、九宫格、图集和 Editor 装配 | 在 View 中实现业务规则 |
| 服务端程序 | shared 契约、RPC/Room 行为、持久化、一致性、幂等和测试 | 从 XML 或图片猜业务协议、修改 UI 生成物 |
| 客户端程序 | UI model、Scenario、View/Logic、数据映射、事件和生命周期 | 手修美术生成物、把业务写进设计源 |
| QA | 全状态、全尺寸、异常路径、性能和回归证据 | 只看默认截图就判定完成 |
| 自动化工具 | 确定性读取、检查和明确授权的辅助写入 | 与 Editor 双写、伪造官方发布物、补造语义 |

### 3.2 推荐真源

| 内容 | 权威真源 | 状态与说明 |
| --- | --- | --- |
| 玩法与业务 | 已冻结策划案 | 当前流程 |
| 批次页面、`featureKind` 与前后端领域 | 批准的 `delivery-spec.json` | 计划中的批次投影；从策划条款派生并保留来源 hash，XML 不得补造 |
| 页面语义 | `<Page>.page-spec.yaml` | 推荐的新单一契约；Schema 计划中。包含页面、字段、动作、状态维度、运动反馈、非目标和 Scenario ID |
| 可执行 Scenario | `<Page>.scenarios.ts` | M1 计划；使用真实 UI-model/Logic 类型，同时驱动无头测试与 Creator Gallery |
| 精确布局 | 当前 `editor` 以 Editor 设计源为真；`cliPSDCompiler` takeover 后同样回归 Editor | takeover 前 recipe 只表达候选约束；坐标 snapshot 是只读派生物 |
| 视觉语言 | 批准的 style anchor + style tokens | 色板、材质、描边、圆角、光向和禁用项 |
| 视觉目标 | 批准的整页效果图 | 不直接证明可切层 |
| 美术生产 | `PsdHandoffBundle` + 批准独立源 | 使用“PSD 命名 + sidecar 契约 + Editor 映射”；单个 PSD 不是完整输入 |
| FGUI 内部 ID | FairyGUI Editor 工程 | 新 ID 由 Editor 分配；外部映射至多是只读审计快照 |
| FGUI 结构 | FairyGUI Editor 工程 | CLI 只生成临时候选；人工 takeover 后由 Editor 序列化并成为正式真源 |
| 统一读取模型 | `FguiProjectIR` | M0.5 计划中的只读派生模型，不是第二份可编辑真源 |
| 发布物 | Editor 生成的 `.bin` / atlas / 独立资源 | 当前能力；禁止脚本伪造 |
| 发布证据 | 当前为人工发布/验收记录；M0.5 后为 publish receipt | receipt 记录工具版本、输入/设置/输出哈希和检查结果 |
| 双端程序 | shared 契约 + `apps/server/src` + `apps/client/src` 对应手写真源 | `apps/Cocos/assets/src` 和各类 generated catalog/schema 是生成物 |
| 完成证据 | 自动检查 + Creator/真机截图录像 + Scenario 结果 | 人工审美批准不可由像素 diff 代替 |

PageSpec 只引用稳定 Scenario ID。M1 前，每个批次必须在 PageSpec 内嵌 fixture 或现有无头测试 fixture 中二选一，声明一份临时唯一来源，并明确记录“统一驱动器未实现”；不得再维护第二份独立状态条件。M1 后，数据快照、本地 inflight 状态、时钟、网络、权限、viewport 和 locale 以 TypeScript catalog 为唯一可执行真源。YAML/JSON 只能是由 catalog 生成的人读投影，或是被 TypeScript 直接导入的纯数据。

### 3.3 建议资料目录

以下路径是新批次的推荐形态；标注“计划”的代码目录在 M1 实现前不要假装存在：

```text
docs/ui/<feature>/<page>/
├─ 00-input/
│  ├─ gdd-freeze.md
│  ├─ decision-log.md
│  ├─ performance-budget.yaml
│  └─ rights-and-fonts.md
├─ 10-contract/
│  └─ <Page>.page-spec.yaml
├─ 20-layout/
│  ├─ wireframe.png
│  ├─ handoff-constraints.md
│  └─ editor-layout.snapshot.json     # 计划：只读派生，不可反向编辑
├─ 30-visual/
│  ├─ style-anchor.png
│  ├─ style-tokens.yaml
│  ├─ concepts/
│  └─ review-log.md
├─ 40-production/
│  ├─ <Page>.approved.psd
│  ├─ delivery-spec.json
│  ├─ asset-manifest.json
│  ├─ assembly-recipe.json
│  ├─ prompts/
│  ├─ source/
│  ├─ runtime/
│  ├─ generated/
│  │  ├─ psd-handoff-ir.json          # 计划：只读派生
│  │  ├─ editor-assembly-plan.json    # 计划：只读派生
│  │  └─ editor-id-map.snapshot.json  # 计划：takeover 后只读派生
│  ├─ evidence/
│  │  ├─ psd.approval.json
│  │  └─ fgui.approval.json
│  └─ contact-sheet.png
└─ 90-evidence/
   ├─ scenarios/
   ├─ gallery/
   ├─ publish-receipt.json            # 计划
   └─ acceptance.md

apps/client/src/devtools/uiGallery/   # M1 计划；置于开发专用 scene/bundle，并证明未进入正式构建
├─ defineUiScenario.ts
├─ scenarioRegistry.ts
└─ scenarios/<Page>.scenarios.ts

tmp/ui-pipeline/<batchId>/<runId>/    # 计划：ignored，可整体丢弃
├─ fairygui-project/
├─ publish/
├─ diff/
└─ logs/
```

`40-production/runtime/` 只是审稿和交接暂存区。G5 通过后，资产按明确映射进入 `apps/art/fairygui/assets/<Package>/`；暂存副本和包内副本不能各自继续修改。
PSD 命名、sidecar 字段、输入档位和 Photoshop 门禁以 [PSD 到 FairyGUI 的“CLI 编译器 PSD 版”方案](psd.md) 为准。

仓库正式路径：

```text
apps/art/fairygui/                         FairyGUI Editor 工程真源
apps/art/fairygui/settings/Publish.json    Editor 发布设置
apps/art/fairygui/settings/Adaptation.json Editor 适配设置
apps/Cocos/assets/resources/ui/            当前 Editor 正式发布目录
apps/Cocos/settings/v2/packages/project.json Creator 项目设置
apps/client/src/                           客户端 TypeScript 真源
apps/Cocos/assets/src/                     sync:client 生成镜像
scripts/fgui.manifest.json                 FGUI 发布闭包锁
```

---

## 4. G0～G9 生产 Gate

### 4.1 总表

| Gate | 阶段 | 必须输出 | 通过条件 |
| --- | --- | --- | --- |
| G0 | 策划冻结 | 范围、路径、平台、预算、验收、非目标 | 影响 UI 的关键语义已确定或明确阻断 |
| G1 | PageSpec 与 Scenario | UI model、字段/动作、状态维度、Scenario、运动反馈 | 每个值有来源、每个操作有闭环、每个 required state 可重复构造 |
| G2 | 线框与布局 | 节点角色、布局约束、热区、安全区、极值样例 | 长文本、极值数字、目标尺寸和点击区可容纳 |
| G3 | 视觉锁定 | style anchor、tokens、批准效果图、评审记录 | 视觉语言、构图和不变量被批准 |
| G4 | 生产拆层 | PSD 命名、sidecar、来源/许可和分层批准 | 输入档位明确；无烘焙动态内容、无虚构图层 |
| G5 | 运行资产 | `productionFromAcceptedAssets` bundle、透明件、九宫格源、质量报告 | Alpha、尺寸、边缘、pivot、预算和一致性通过 |
| G6 | Editor 装配与发布 | 组件、Controller、Relation、Editor 映射、官方发布物 | 候选只在临时工程；Editor 保存—重开、正式发布、引用闭合通过 |
| G7 | 双端程序接线 | shared/服务端/客户端行为、View/Logic、FGUI 契约和测试 | 策划行为与 XML 结构各自从正确真源实现，异步和生命周期正确 |
| G8a | Creator 集成验收 | 场景矩阵、截图/录像、缺陷归因 | 全状态、目标尺寸和异常路径通过 |
| G8b | 目标平台验收 | 真机构建、安全区、纹理和性能证据 | 仅在交付承诺需要时必过 |
| G9 | 冻结交付 | 版本、哈希、人工发布/验收记录、变更与回归范围；M0.5 后附 receipt | 下游产物可追溯、可复建 |

G0 由策划/产品批准；G1～G2 由 UI/UX 与客户端批准；G3 由美术负责人批准；G4～G6 由美术、技术美术/UI 工程和客户端共同批准；G7 由客户端批准；G8a/G8b 由 QA 与对应负责人批准。模型可以整理证据，不能代替授权人作业务、审美或发布决定。

### 4.2 G0：策划冻结

任务：

1. 冻结功能范围、用户路径和非目标。
2. 列出所有可见数据、操作、前置条件、成功与失败反馈。
3. 明确加载、空、断网、重连、锁定、资源不足、冷却和权限状态。
4. 明确设计分辨率、安全区、目标语言、字体 fallback 和内容许可。
5. 声明性能预算：目标设备、纹理显存、单图/atlas 尺寸与数量、首开、draw call、CPU/GPU 帧耗和动画 FPS。
6. 将缺失信息列为阻断项，不在下游补猜。

当前 `perf:client` 是 Node 行为探针，不证明 FGUI/GPU 或真机性能。没有量化阈值就不能在 G8b 声称“性能通过”。

### 4.3 G1：PageSpec 与 Scenario 契约（M1 后可执行）

PageSpec 至少包含：页面/弹窗/浮层清单、导航、显示字段、动作、正交状态维度、显式 UI model、文案槽、运动反馈、适配条件、required scenario ID 和非目标。

每个异步动作都要定义前置条件、命令或事件、等待态、成功、失败、防重复、取消和关闭后迟到结果。网络错误、业务拒绝、空数据和权限不足不得合并成一个模糊的 `error`。

M1 的 `defineUiScenario<TUiModel>()` 至少表达：

- 稳定 `scenarioId` 和页面；
- `initialModel`，以及服务端/本地数据、inflight 或乐观状态；
- 类型化 dependency fixture：固定时钟、随机种子、网络、权限、会话与导航结果；
- viewport、locale 和安全区参考值；
- `steps`：打开、点击、释放 deferred、推进时钟、关闭与重开；
- 每一步后的 `checkpoints`：语义状态、可见内容、动作可用性和副作用断言；
- `teardown`：取消异步、关闭 handle、释放订阅并复位会话与缓存。

Controller/page 的具体映射由 FGUI 结构契约和 IR 检查，不复制进 Scenario。M1 后，同一 Scenario 必须同时驱动无头 UI-model 投影和 Creator Gallery；M1 前按第 3.2 节选择临时唯一 fixture，明确标注“缺少统一驱动器”，不要创造一个当前不存在的命令。

### 4.4 G2：线框、布局与交互

任务：

1. 定义逻辑画布、原点、坐标单位和安全区策略。
2. 设计分区、节点树、父子关系、层级、裁剪、滚动和复用组件。
3. 为节点定义角色、anchor、pivot、Relation、热区和文本溢出策略。
4. 用最长语言、最大数值、空/满列表和目标长短屏压力测试。
5. 先低保真线框，再做高保真视觉。

`authoringMode: editor` 时，handoff 只交付布局约束与极值样例，精确坐标在 Editor 中维护。
`authoringMode: cliPSDCompiler` 时，recipe 只为临时工程生成候选；takeover 完成后精确坐标仍回归 Editor。
不得让 recipe 和 Editor 长期双写同一坐标；需要审计时从正式 Editor 设计源生成 snapshot。

Relation 不会自动处理刘海或四边安全区。没有明确程序接线和目标平台证据，安全区不算通过。

### 4.5 G3：视觉锁定

先批准 style tile/anchor，再生成整页。线框负责布局、style anchor 负责视觉语言、IP 资料负责身份；每张参考图只承担明确职责。

冻结色板、材质、描边、圆角、阴影、光向、图标透视、角色比例和禁用项。动态文字只保留槽位，不生成不可编辑的伪文字。每轮只改变一个变量，并记录提示词、参考图、模型、输出和批准结论。

### 4.6 G4：生产拆层

每个可见节点选择责任类型：

| 类型 | 用途 | 关键规则 |
| --- | --- | --- |
| `runtime-text` | 标题、数字、玩家名、价格、计时 | 不烘焙，登记格式、字体、极值和溢出 |
| `primitive` | 纯色、遮罩、热区 | 优先 FGUI 图元 |
| `nine-slice` | 面板、按钮底、气泡 | 明确四边 inset，中心区有效 |
| `tile` | 平铺纹理 | 明确方向 |
| `transparent-png` | 图标、角色、装饰 | 真实 Alpha、完整轮廓、padding、pivot |
| `full-canvas-png` | 背景、同画布灯光、前景遮挡 | 保持完整画布和固定坐标 |
| `loader` | 头像、远端或状态资源 | 定义空值、加载和失败占位 |
| `list-template` | 重复项 | 明确 `defaultItem`、字段和空态 |
| `spine/sequence/fx` | 复杂动画 | 单独预算、状态和降级 |

生产资产清单至少记录 stable key、节点覆盖、来源、尺寸、状态、Alpha、裁切、padding、pivot、九宫格、图集、责任方、批准状态、许可和源哈希。

分层 PSD 必须声明输入档位：批准整页 target 重组得到的是 `sourceOnlyFromTarget`，只能做分层审阅和后续资产补产；
只有由 source-approved 独立生产源重建、并带完整 sidecar 与 Photoshop 往返批准的
`productionFromAcceptedAssets`，在 G5 验收通过后才能进入 CLI FairyGUI 编译。`psd-maker.md` 的现有样例属于前者。

### 4.7 G5：运行资产

1. 每次生成或修订一个资产，不生成要求精确坐标的巨型 sprite sheet。
2. 独立件使用真实透明背景；禁止白底、棋盘格、场景和水印。
3. 灯光、背景和前景遮挡需要保持坐标时使用 `fullCanvas`。
4. 九宫格 inset 由人工或确定性工具标注，不让图片模型猜。
5. 检查尺寸、四角 Alpha、可见 bbox、边缘污染、padding、pivot、同系列一致性和运行尺寸清晰度。
6. 批准后锁定源哈希；装配阶段禁止调用图片模型。

G5 接收的是完整 `PsdHandoffBundle`，不是孤立 `.psd`。PSD、sidecar、source/prompt hash 或批准记录任一变化，运行资产
批准立即失效；`sourceOnlyFromTarget` 必须先补齐真实 Alpha、隐藏像素、padding 和 pivot，不能直接从整页 target 切图。

### 4.8 G6：FairyGUI Editor 装配与发布

#### 当前人工流程

1. 用 FairyGUI Editor 打开 `apps/art/fairygui/FairyGUI.fairy`。
2. 创建或修改 package、组件、资源和节点。
3. 配置 Controller/page、Gear、Relation、九宫格、tile、List `defaultItem` 和 Loader。
4. 完整打开、保存、关闭并重开目标组件，完成 Editor 保存—重开往返验收。
5. 使用 Editor 正式发布到当前 `apps/Cocos/assets/resources/ui`。
6. 记录 Editor 版本、发布设置、改动包/组件和人工保存—重开结论。

G6 到正式发布为止。随后按 G7 和第 5 节完成 codegen、接线、闭包锁与 `sync:client`，再通过 Cocos Dashboard 打开 Creator，让它一次性导入发布资源和新增脚本、生成或复用 `.meta`，最后进入 G8a。

当前 `Publish.json` 直接写正式输出目录，仓库也没有 staging-aware 校验命令。发布到 staging、生成 receipt 和原子提升都是 M0.5/M2 目标，不能写成当前已有能力。

发布设置真源是 `apps/art/fairygui/settings/Publish.json`。设计基线必须同时核对：

- `apps/client/src/designSpec.ts`；
- `apps/client/src/Main.ts`；
- `apps/art/fairygui/settings/Adaptation.json`；
- `apps/Cocos/settings/v2/packages/project.json`。

本仓当前约定为 `750×1624 / MatchWidth / FIXED_WIDTH`。现有测试尚未读取 Cocos `project.json`，因此四方一致仍有门禁盲区。

#### 命名与装配规则

| 前缀 | 典型类型 |
| --- | --- |
| `btn_`、`tge_` | `GButton` |
| `txt_` | `GTextField` / `GRichTextField`，以 XML 真实类型为准 |
| `ld_` | `GLoader` |
| `ld3_` | `GLoader3D` |
| `lst_` | `GList` |
| `img_` | `GImage` |
| `go_` | `GGroup` |
| `jb_` | `GComponent` |
| `pg_` | `GProgressBar` |

- 需程序访问的元素必须使用类型前缀；无前缀元素应是纯装饰。
- 页面主状态 Controller 推荐名为 `view`；布尔 page 用 `true` / `false`。
- `button` 是按钮内部保留 Controller 名，不能挪作业务状态。
- `displayList` 顺序就是 z-order，不能按节点名排序。
- 全屏、贴边和底部停靠元素配置 Relation。
- 动态换图使用 `GLoader.url`，不用 Cocos Sprite API。
- `clearOnPublish` 只用于代码确定会填充的 Loader。
- `interactive` 是全局 FGUI 输入租约，不是单页命中隔离；关闭必须走 `ViewHandle.close()` 或受支持的 `ViewMgr.close(name)`。

#### 计划中的 CLI 编译器 PSD 版边界

M2 首版使用 `seededTemplate`：人工用 Editor 在临时完整工程建立真实槽位和种子 ID，CLI 只填充白名单 leaf
component 或替换批准资源；`rawProjectCompiler` 阶段允许在临时工程新增 package item、
Controller、Gear、Relation 和引用。两阶段都必须生成 plan、预期 diff、实际 diff，并要求重复编译零 diff。

CLI 不得写正式工程或正式发布目录，不得把候选 ID 当正式 ID，不得覆盖 editor-owned 子树。候选必须经固定版本 Editor
打开并只在 Editor UI 中人工调整，完成保存—关闭—重开和隔离发布；之后通过 Editor 支持的复制/导入方式接管到正式
工程。stable key 与正式内部 ID 的关系只记录在 Editor 映射 snapshot 中。

### 4.9 G7：程序接线

G7 同时消费两类互不替代的输入：批准的 DeliverySpec/PageSpec/Scenario 驱动 shared、服务端与客户端行为；正式
FairyGUI XML 只驱动 View 结构绑定。不得从按钮名、Controller 或 XML 推导 RPC、Room state、存档、锁、幂等或结算。

- `featureKind=lobbyFeature`：先在 shared 的 Lobby RPC domain descriptor 声明消息与 validator，再实现服务端
  endpoint、数据一致性和测试。
- `featureKind=roomGameplay`：先手写 `apps/shared/schema/gameplays/<id>/{manifest.json,state.json}` 和玩法
  `wire.ts`，运行 `codegen:gameplays`，再实现服务端 mode/commands、客户端 room adapter 与 gameplay module。
- 两类都遵守 View/Logic 分离；涉及玩法 schema/wire 时，`codegen:gameplays` 必须早于 `codegen:features`，生成物禁手改。

UI 接入顺序以正式产物为准：

1. Editor 保存—重开并正式发布。
2. 运行 `npm run codegen:fgui -- <Package> <Component>`；它从真实 XML 生成或重写 View 的 `IMPORT`、
   `REQUIRED`、`FIELD`、`BIND` 四个 AUTO 区块。
3. 在 View AUTO 区块外完成绑定、渲染、点击/列表回调和动作转发；在 Logic 中实现不依赖
   `cc` / `fairygui-cc` 的行为和无头测试。
4. 在 View 同目录创建或更新 `<Name>View.view.json` sidecar：登记 owner/kind、layer、fullscreen、onlyOne、
   permanent、interactive、logic、sharedPkgs，以及 `manualRequired/nested/listItems/controllers/relations/assetUrls`
   等手写契约段。直接绑定的 `required` 由 XML 与 View AUTO 共同守门，不在 sidecar 复制。
5. 将 sidecar、路由、菜单或其他 contribution 登记进 `features/<id>/feature.json`；新增 feature 页面通过 feature
   route / `NavigationService` 打开，不向 `pages.ts` 增加新的手写全集入口。
6. 运行 `npm --workspace @game/server run codegen:features`，从 `.view.json`、FGUI XML 与 `feature.json` 刷新
   `apps/client/src/generated/` 下的 View、FGUI 契约、feature、route 和 package catalog。
7. 审阅 View AUTO、sidecar、feature 登记与生成 catalog；`fguiContracts.ts`、`viewRegistry.ts`、`pages.ts` 是
   稳定 façade，禁止手改其中的生成值或新增页面全集。
8. 审阅完成后运行 `node scripts/fgui-manifest.mjs --write`，更新包含 View AUTO 哈希的 FGUI 发布闭包锁。
9. 运行 `npm run sync:client`，不手改 `apps/Cocos/assets/src`。
10. M1 落地后注册同一组 Scenario。每个场景拥有独立 lifecycle owner、`AbortController` 和可控
    deferred/scheduler，结束时必须完成 teardown。

直接绑定的 `required` 以 Editor XML → `codegen:fgui` View AUTO 为单源；其余手写契约段以 `.view.json` 为单源，
页面/路由/contribution 归属以 `feature.json` 为单源，契约与注册值由 `codegen:features` 生成。FGUI 发布闭包锁记录
View AUTO 哈希和生成 View 清单，所以 `fgui-manifest --write` 必须晚于两条 codegen 与对应审阅。

若本批次改变 shared 契约，按 [整体开发动线](OVERVIEW.md#4-标准开发动线) 运行 `sync:shared`、协议指纹或 gameplay
codegen，并在服务端执行对应单元、smoke/int 测试。不能因为页面已显示就跳过服务端行为和一致性验收。

这里的“走正常入口”是复用同一 composition factory、registry、ViewMgr、Logic 和 View，不是强迫 Host 调用无法注入依赖的生产 wrapper，也不是另造假页面。跨包依赖以 `ui/<Package>` 完整登记到 `sharedPkgs`，不含页面自身包。加载失败和超时必须阻止创建，不能静默显示空页面。数据与回调在 `ViewHandle.run(...)` 生命周期内注入，异步 Logic 接收 `AbortSignal`；禁止直接 `view.dispose()`。

### 4.10 G8a：Creator 集成验收

自动检查不能替代引擎验收。当前必须从 Cocos Dashboard 打开 Creator 3.8.8，等待真实资源导入后验证：

- 基准 `750×1624 / FIXED_WIDTH` 与目标长短屏；
- Relation、横向挤压、底部停靠和安全区接线；
- 最长语言、最大/最小数字、空文本和缺图；
- 默认、加载、正常、空、锁定、资源不足、错误、断线与恢复；
- 快速连点、重复开关、关闭后迟到响应和场景切换；
- 透明黑边、图集串色、九宫格变形、Loader 空白和输入遮挡；
- Creator 环境中的包加载、首开、draw call 和动画表现。

M1 的 Creator UI Gallery 应枚举 `scenario × viewport × locale`，固定时钟、随机种子和网络结果，显示 Scenario ID 与输入摘要，并通过正常页面入口截图。无头测试不能替代 Gallery；截图 diff 只能发现变化，最终审美批准仍由人完成。

### 4.11 G8b：目标平台与真机

当交付承诺包含移动安全区、设备输入、平台压缩纹理、GPU/内存或低端机性能时，必须制作目标平台构建并验证：刘海/圆角/Home indicator、触摸/键鼠/返回键、切后台恢复、实际纹理格式、显存/内存峰值、CPU/GPU 帧耗、FPS、首开、弱网与生命周期。

当前仓库没有通用四边安全区系统，Relation 也不会自动处理刘海。Creator 预览不能证明真机安全区、压缩纹理或低端机性能。

### 4.12 G9：冻结与回流

批次至少记录：策划与 PageSpec 版本、Scenario 集、style anchor、批准源与运行资产哈希、字体/IP/品牌/参考图许可、
生成模型和参数、PSD/CLI/Editor 工具版本、临时工程 baseline、发布设置、发布物、代码提交和验收证据。

M0.5 落地后用 receipt 记录这些机器可得字段。变更请求必须声明可改真源、不变量、下游重建范围和回归矩阵；禁止在下游成品上做无法追溯的热修。

---

## 5. 当前仓库可执行清单

### 5.1 Editor 发布前

```text
□ 需程序访问的节点有正确类型前缀，纯装饰节点不被代码访问
□ Controller/page、List defaultItem、autoClearItems、Relation 和层序正确
□ 可伸缩图设置 scale9grid，可平铺图设置 tile
□ 动态资源已导出，Loader clearOnPublish 有代码兜底
□ sharedPkgs 覆盖跨包引用闭包
□ 动态文字和数字没有烘焙
□ 目标组件完成真实 Editor 保存—关闭—重开验收
□ 使用 Editor 正式发布；没有手工伪造 .bin 或 atlas
□ 没有提前手工仿写 .meta；它将在 sync:client 后由 Creator 真实生成或复用
```

### 5.2 接线、锁定与检查

顺序不能颠倒：FGUI 发布闭包锁包含 View AUTO 哈希，因此必须先 codegen、同步 FGUI 结构契约并审阅，再运行 `--write`。

```bash
# 前置条件：FairyGUI Editor 已保存、重开并正式发布
# 0. roomGameplay 的 manifest/state/wire 有变化时先刷新三端 catalog/schema，再同步 shared
npm --workspace @game/server run codegen:gameplays
npm run sync:shared

# 1. 由真实 XML 更新 View AUTO 区块
npm run codegen:fgui -- <Package> <Component>

# 2. 在 AUTO 区块外完成 View/Logic；更新同目录 <Name>View.view.json
#    并将 sidecar、路由和 contribution 登记进 features/<id>/feature.json

# 3. 生成 View、FGUI 契约、feature、route 与 package catalog；稳定 façade 禁止手改
npm --workspace @game/server run codegen:features

# 4. 审阅设计源、发布物、四个 AUTO 区块、sidecar 与生成 catalog 后，更新 FGUI 发布闭包锁
node scripts/fgui-manifest.mjs --write

# 5. 同步客户端真源到 Creator 工程壳
npm run sync:client

# 6. 用 Dashboard 打开 Creator，等待发布资源和新增脚本完成导入并生成/复用 .meta
# 7. 自动检查
npm run typecheck:client
npm run typecheck:client:legacy
npm run test:client
npm run test:fgui
npm run verify:fgui
npm run verify:sync
```

`fgui-manifest --write` 会先构建当前闭包并执行发布物反解析对账，但它不会替代 Editor 保存—重开验收，也不能用来接受错误的新哈希。

Creator 导入完成且上述检查通过后，继续在该 Creator 工程中做 G8a。`tools/fgui-codegen/cli.ts` 当前帮助文字中允许“照格式手工”创建 `.meta`，这与仓库铁律冲突；在工具修正前以本文件和根 `AGENTS.md` 为准：**只能由 Creator 真实生成或复用 `.meta`**。

---

## 6. 能力成熟度路线

### M0：人工可复现（当前工具支持的新批次流程）

- `authoringMode: editor`；
- 人工批准 PageSpec、线框、风格和资产；
- 人工在 Editor 装配、保存—重开和发布；
- 运行现有 codegen、契约、发布闭包锁、反解析对账、同步和测试；
- 在 Creator 人工跑状态与尺寸矩阵。

M0 的目标不是零人工，而是每一步可追溯、可复现、可归因。既有页面不会因为当前工具可用就自动视为已补齐 PageSpec、全状态矩阵和验收证据。

### M0.5：基础设施收口（第一优先级）

1. 建立唯一只读 `FguiProjectIR`，统一解析 package/resource/component、child、Controller/page、Gear、Relation、List/defaultItem、`ui://`、跨包引用、exported、shared package 闭包和源/`.bin` 对账。
2. 让 codegen、FGUI 发布闭包工具、contract test 和 registry test 逐步消费同一 IR，消除多套正则/解析器分叉。
3. 从 IR 确定性生成或校验可推导的 `required`、结构引用和 shared package 建议；`manualRequired`、代码动态 `assetUrls`、业务生命周期和 `interactive` 仍由人显式声明。
4. 新增 `Publish.json`、`Adaptation.json`、`designSpec.ts`、`Main.ts` 和 Cocos `project.json` 一致性检查。
5. 检查发布文件与 `.meta` 一一对应、无孤儿；atlas sprite rect 不越界；设计源/包声明/发布物闭合。
6. 先用两个结构不同的金样包验证 IR，再扩展为全包 `--all --check` 式只读检查；默认不改文件，并修正现有工具中允许手工仿写 `.meta` 的错误提示。
7. 锁定 Editor 版本与安装包 SHA-256、工程格式样本、XML codec、`Publish.json`/`Adaptation.json` 哈希；PSD/CLI
   adapter 版本在 M2 POC 创建前一并锁定。
8. 每次正式发布生成 receipt；在 staging 校验和原子提升实现前，不改变当前正式发布行为。

### M1：可执行验收

- **M1a**：落地 PageSpec Schema、`defineUiScenario<TUiModel>()`、类型化 composition/dependency seam 和手工切换的 Creator Gallery；同一 Scenario 先驱动无头投影与真实页面入口。
- **M1b**：加入动作步骤、检查点、确定性 teardown、`scenario × viewport × locale` 自动截图矩阵、结构断言和可审阅 diff。
- Gallery 位于经验证的开发专用 scene/bundle/入口；正式构建依赖报告必须证明 devtools 未进入生产包，仅检查“无静态 import”不够。

### M2：CLI 编译器 PSD 版 + Editor takeover

- 以仓库锁定的 Editor 工程格式、XML codec 和 Photoshop/PSD 工具链为唯一目标；本机 6.1.4 只是 POC 候选；
- 输入必须是 `productionFromAcceptedAssets` 的完整 `PsdHandoffBundle`，使用“命名 + sidecar 契约 + Editor 映射”；
- 先实现 `seededTemplate`，只填充真实模板槽和隔离 leaf component；再以两个结构不同的 golden package 验证
  `rawProjectCompiler` 的 package/component codec、候选 ID 和引用闭包；
- CLI 只写 `tmp/ui-pipeline/<batch>/<run>/fairygui-project`，明确 `editor-owned` 与 `cli-managed-component` 边界；
- 同一输入连续编译两次零 diff，候选通过静态 IR 与官方 CLI 隔离发布后，才允许 Editor takeover；
- 人工修改只发生在 Editor UI；保存—关闭—重开后 reconcile stable key、正式 ID 与语义 diff；
- 正式工程通过 Editor 支持的复制/导入接管并正式发布，CLI 不复制候选 XML 覆盖正式目录；
- 生成完整 receipt，支持 baseline 漂移阻断和失败回退。

### M2-S：OpenFairyGUI 影子试点

OpenFairyGUI 是非官方的独立项目，不是当前依赖或生产权威。试点必须精确锁定 release/commit 和哈希；对正式工程始终只读，初期只在工程副本或临时目录执行 inspect、建模、事务变换和差异报告。

输出先归一化为 `FguiProjectIR`，再与官方 Editor 保存/发布结果做语义 diff。至少覆盖两个结构不同的真实包、未知字段保留、重复执行 zero-diff、官方 Editor 重开/保存/发布和完整回退。没有单独 ADR，不得写正式工程或正式发布目录。

### M3：条件式后备

只有第 7.8 节的启用条件全部满足，才讨论超出 `cliPSDCompiler` 白名单 ownership 的包级 raw XML merge 或混合
subtree merge。浏览器 Studio 更晚：先证明跨角色在线审稿有真实需求，再从只读 evidence viewer 开始；不得为了
“自动化完整”重造半个 FairyGUI Editor。

---

## 7. 自动化架构 ADR

### 7.1 选择顺序

对每个自动化需求依次回答：

1. 只读 `FguiProjectIR`、Scenario 或现有检查能否解决？
2. 人工 Editor 加模板能否以较低总成本解决？
3. `seededTemplate` 能否在临时完整工程填充已批准槽位？
4. 白名单 `rawProjectCompiler` 能否生成候选并由 Editor takeover？
5. OpenFairyGUI 只读影子试点能否降低解析或兼容验证成本？
6. 是否确有必要承担包级 raw XML merge 或混合 ownership 的额外维护成本？

只有前一层有证据证明不足，才进入后一层。浏览器 Studio 不参与结构生产路线的默认选择。

### 7.2 `FguiProjectIR`：统一只读模型

IR 应一次解析、被多方消费，至少表达：

- package 名称/ID、resource 名称/ID、类型、exported 和路径；
- component display list、真实 child 类型、层序和嵌套路径；
- Controller/page、Gear 与 Relation 的 owner/target；
- List `defaultItem`、模板闭包和 `autoClearItems`；
- Loader、`clearOnPublish`、代码动态资源与跨包 `ui://`；
- `Publish.json`、`Adaptation.json` 和发布输出；
- 源 XML/package 声明与 `.bin` 反解析语义。

IR 是内存模型或可丢弃快照，不是可编辑真源。所有消费者必须对同一工程得到一致结构；解析失败或未知语义必须显式报告，不能静默丢字段。

### 7.3 Scenario Host 与 Creator UI Gallery

Scenario catalog 使用真实 UI-model/Logic 类型。Scenario Host 负责把确定性输入注入页面组合根；Gallery 负责选择 Scenario、viewport、locale 和安全区参考值，并收集截图、结构摘要与交互结果。

每个试点页面先抽出类型化 composition factory / `PageDependencies`。正式入口传真实网络、时钟、会话和导航；Scenario Host 向同一 factory 传可控 deferred、scheduler 和确定性依赖。每个场景独占 lifecycle owner 与 `AbortController`，结束时关闭 handle、释放订阅并复位会话/缓存，下一场景不得继承状态。

禁止：

- 为 Gallery 复制一套业务判定；
- 绕过 registry/pages 直接 new View；
- 维护只在截图时存在的假组件；
- 用 Node 投影或浏览器 DOM 截图冒充 Creator 运行证据。

### 7.4 CLI 编译器 PSD 版数据流

```text
策划文档 → DeliverySpec / PageSpec / Scenario
                 +
PSD 命名 + sidecar 契约 + 批准运行资产
                 │
                 ▼
PsdHandoffIR + 正式工程只读 FguiProjectIR
  → EditorAssemblyPlan / expected diff
                 │
                 ▼
复制正式 baseline → 临时完整 Editor 工程
  → seededTemplate / rawProjectCompiler
  → candidate XML、候选 ID、actual diff
                 │
                 ▼
重复编译零 diff + IR/引用/所有权检查
  → 官方 CLI 发布到隔离目录
                 │
                 ▼
固定版本 Editor takeover
  → 只在 Editor UI 人工调整 → 保存—关闭—重开
  → reconcile stable key / 正式 ID / 语义 diff
                 │
                 ▼
Editor 支持的复制/导入接管正式工程
  → Editor 正式发布 → codegen / sync / Scenario / receipt
```

当前没有 CLI 编译器、staging 或原子提升实现；现阶段仍使用人工 `authoringMode: editor`。POC 必须在临时工程中完成，
不得改写正式包，也不得把“人工修改 XML 文件”解释为文本编辑 XML；人工修订只能在 Editor UI 中进行。

### 7.5 所有权与身份

| 对象 | 权威所有者 | 自动化边界 |
| --- | --- | --- |
| 分层源、RGBA、九宫格源 | 美术 | 工具只做确定性校验/转换 |
| PSD 结构语义 | `asset-manifest.json` + `assembly-recipe.json` | PSD 命名负责定位；sidecar 负责语义；不得从像素猜业务 |
| Editor 人工页面/复杂组件 | Editor 人工流程 | CLI 不得覆盖 editor-owned 子树 |
| 临时候选 leaf component | CLI 可在 plan 白名单内管理 | takeover 前 CLI 整文件拥有；不支持人机混编子树 |
| 候选 XML、`package.xml`、候选 ID | CLI 编译器 PSD 版的临时候选工程 | 只用于验证和接力，不得覆盖正式目录 |
| 正式 XML、`package.xml`、内部 ID | FairyGUI Editor | takeover 后由 Editor 保存和序列化，外部工具恢复只读 |
| `.bin`、atlas、独立发布资源 | FairyGUI Editor | 禁止伪造 |
| Creator `.meta` | Cocos Creator | 禁止手工仿写 |
| View AUTO 区块 | codegen | 禁止手改 |
| `apps/Cocos/assets/src` | `sync:client` | 禁止手改 |

业务 stable key 与 Editor 内部 ID 是不同概念。CLI 可分配确定性的候选 ID，但 takeover 后必须从 Editor 正式设计源
反解析 `editor-id-map.snapshot.json`；候选 ID 无权覆盖正式映射。若用 `customData` 保存 stable key，必须先证明目标
Editor 保存—重开稳定保留，否则只使用外部只读映射。

### 7.6 工具链锁、staging 与 receipt

正式自动化至少要锁定：Editor 版本和安装包哈希、Photoshop 版本、Pillow/PSD parser/writer/ImageMagick、Node 与 XML
codec/工程格式 adapter、CLI 源码 hash、`Publish.json`、`Adaptation.json`、DeliverySpec/PageSpec/PSD/sidecar/批准资产哈希。

目标 receipt 至少记录：

- 工具链与平台版本；
- package/component 和 ownership；
- 输入、设置、设计源、发布物与 View AUTO 哈希；
- Editor 保存—重开结果；
- 发布物反解析对账结果；
- IR/契约/Scenario/Creator 证据索引；
- staging 到正式目录的提升结果和代码提交。

staging 必须包含完整输出闭包并通过校验后整体提升。提升前重新核对正式工程的 baseline revision/hash；POC 期间若正式工程被人工修改，必须终止并重建候选，不能覆盖并发改动。不得把半个包、单独 XML 或未导入的 `.meta` 混入正式目录。

### 7.7 OpenFairyGUI 影子边界

试点只允许：读取工程、构建 outline/IR、在临时副本做事务变换、输出语义 diff。必须审查许可证和依赖，锁定版本/commit 与哈希，验证未知字段保留和失败回滚。

即使影子试点通过，官方 Editor 仍是序列化和发布权威。任何写正式工程的放权都要另立 ADR，不能从“读得出来”推导为“可以接管生产”。

### 7.8 包级 raw XML 后备启用条件

只有以下条件全部满足，才能启动独立 RFC：

1. `seededTemplate` 与白名单 `rawProjectCompiler` 都无法完成一个已由两个真实页面证明的必要操作。
2. 重复成本足以覆盖包级协议、并发、迁移和回退的长期维护成本。
3. 已有至少两个官方 Editor 创建、结构不同的 golden package 和真实 ID 样本。
4. no-op round-trip、重复编译零 diff、未知字段保留和候选引用闭包全部通过。
5. ownership 能缩小为独占 package 或整文件集合；仍不允许人机混编同一 subtree。
6. Editor 保存—重开、官方发布、发布物反解析和 Creator Scenario 已成为自动 Gate。
7. Editor/XML 版本、Schema、版本兼容、baseline 并发锁、失败回退和备份策略已冻结。

即使启用，首版仍遵守：外部 writer 只在临时工程生成白名单 package/文件候选；候选进入正式工程前必须由
固定版本 Editor 打开、接管、保存、关闭、重开并重新序列化，最终 `package.xml`、XML 与内部 ID 仍归 Editor。
外部 ID 表只从 Editor 导入作审计，不负责发号；`.bin`、atlas 和 `.meta` 继续由官方工具生成。自由结构配方、混合
subtree writer 和超出批准 ownership 的包级 AST merge 只允许在单独 RFC 批准的临时候选实验中出现。

### 7.9 生产资产的确定性规则

拟定生产资产清单最小字段：

```text
stableKey
sourceFile + sourceSha256
colorMode + requiresAlpha
mode
sourceRectSourcePx
expectedAlphaBBoxSourcePx
paddingSourcePx
maskSource
sourceAnchorNormalized
outputSizeSourcePx
runtimeSizeLogicalPx
nineSliceInsetsSourcePx
atlasPolicy + exported
outputRelativePath
```

不适用字段显式为 `null`，不能省略后交给工具猜。`outputRelativePath` 只能位于批准根下，拒绝绝对路径和 `..`。

| `mode` | 用途 | 条件 |
| --- | --- | --- |
| `copy` | 无损复制独立源 | 源哈希已锁定 |
| `regionCrop` | 显式矩形裁切 | 区域完整、无背景污染、无遮挡缺失且不需隐藏像素 |
| `inpaintCrop` | 先按 mask 补绘再提取 | 保存批准输入、mask、处理记录和输出哈希 |
| `alphaObject` | 独立透明角色、建筑、状态件或图标 | 有完整轮廓、真实 Alpha、padding 和 pivot |
| `fullCanvas` | 保留源画布坐标 | 背景、灯光、前景遮挡 |
| `nineSlice` | 可伸缩源图 | inset 明确且中心有效 |
| `tile` | 横向或纵向平铺纹理 | 已提供目标方向的无缝接缝证据 |
| `generatedVariant` | 升级、锁定、满仓等换态单体 | reference、状态 key 与允许变化区已登记 |

`nineSliceInsetsSourcePx` 的顺序固定为 `left, top, right, bottom`；它不是 FairyGUI `scale9grid` 的中心矩形。工具转换时必须按源图宽高计算中心矩形并校验正面积。输出先进入临时目录，校验通过后原子替换；删除只能按生成清单精确执行。

### 7.10 视觉证据与差异

视觉核验分两段：

```text
target ↔ composite  ：拆层、切图、层序、坐标、pivot、透明边
composite ↔ runtime：Editor 发布、atlas、九宫格、字体和运行时装配
```

差异报告组合使用结构断言、区域截图、感知差异和人工审阅；不得只用全图逐像素相等。字体、抗锯齿、纹理采样、色彩空间和 Alpha 预乘要固定环境或使用批准容差。动态粒子、倒计时和网络内容只能用带原因的显式 mask 排除。

### 7.11 浏览器 Studio 的决策边界

只有跨角色、远程、无需安装 Editor 的审稿需求被两个以上真实流程证明后，才评估 Studio。第一版只读展示 PageSpec、Scenario、target/composite/runtime 和差异证据；不做布局写入。

在 `cliPSDCompiler` 和 ownership 尚未稳定前，禁止在 Studio 实现图层编辑、Controller、Relation、撤销重做或 XML
导出。OpenFairyGUI 只读影子评估不能改变 Editor 权威，也不能成为另一套布局真源。

---

## 8. 验收矩阵

### 8.1 契约与 Scenario

```text
□ 策划条款能追溯到页面、字段或动作
□ 每个字段有来源、格式、刷新触发和极值
□ 每个异步动作有等待、成功、失败、取消和防重复
□ 状态由显式 UI model 唯一判断，互斥/正交维度合理
□ 每个 required state 有稳定 Scenario ID
□ M1 后，同一 Scenario 同时驱动无头投影和 Creator Gallery
□ YAML/JSON 投影没有复制 TypeScript catalog 的业务条件
□ Gallery 不绕过 registry/pages/Logic/View
```

### 8.2 布局与美术

```text
□ Editor 是 editor 流程及 cliPSDCompiler takeover 后的精确布局真源
□ handoff 只保存约束，坐标 snapshot 可重建且不可反向编辑
□ 长文本、最大数字、空/满列表和目标长短屏通过
□ 效果图、生产源和运行资产分离
□ 每个运行资产有 stable key、来源、许可、批准状态和哈希
□ 动态文字、数字、头像和远端内容没有烘焙
□ Alpha、trim、padding、pivot、九宫格和 fullCanvas 规则正确
□ 运行尺寸清晰，并满足纹理、图集和内存预算
```

### 8.3 FairyGUI 与工具链

```text
□ 命名节点使用正确前缀和真实类型
□ Controller/page、Gear、Relation、List/defaultItem 与 PageSpec 一致
□ Loader、clearOnPublish、exported 和 sharedPkgs 闭包完整
□ Editor 保存—关闭—重开无未解释修复或丢引用
□ 发布物由 Editor 产生，Creator .meta 由真实导入产生
□ 发布物反解析对账通过，但未被当成 Editor 保存—重开证据
□ codegen AUTO、`.view.json`、`feature.json` 与 generated FGUI 契约/registry 字段级一致
□ FGUI 发布闭包锁晚于 codegen 更新且只在审阅后写入
□ M0.5 后，FguiProjectIR 的消费者对同一工程得出一致结构
□ M2 后，CLI 候选只在临时完整工程生成，并通过零 diff、Editor takeover、重开、隔离发布和 receipt
□ OpenFairyGUI 影子试点没有正式工程写权限
```

### 8.4 程序与运行时

```text
□ View 只做绑定、渲染和动作转发，Logic 无 cc/fairygui 依赖
□ 页面通过 registry 和动态 import 打开
□ sharedPkgs、layer、onlyOne、permanent、interactive 正确
□ 数据/回调在 ViewHandle 生命周期内注入，异步支持取消
□ 快速连点不重复提交，重开不重复订阅
□ 关闭后迟到响应不更新页面
□ 加载失败、超时、断线、重连和业务拒绝有明确表现
□ typecheck、client/fgui 测试、发布闭包和同步检查通过
□ Creator 覆盖 required scenario 与目标尺寸
```

### 8.5 目标平台（承诺需要时）

```text
□ 目标构建在声明设备矩阵安装运行
□ 四边安全区、刘海、圆角、状态栏和 Home indicator 有真机证据
□ 触摸/键鼠/返回键、切后台恢复和权限路径通过
□ 实际压缩纹理、显存、内存、首开、包加载、帧耗和 FPS 满足预算
□ 弱网、断网、恢复和平台生命周期有可重复证据
```

---

## 9. 变更影响与回退

| 变更 | 回到 | 必须重建/回归 |
| --- | --- | --- |
| 规则、解锁、奖励、字段或动作 | G0/G1 | Scenario、布局、视觉、FGUI、程序和验收 |
| 状态判定或异常态 | G1 | Scenario、Controller/程序映射和相关视觉 |
| 坐标、层级、热区、适配 | G2/G6 | Editor 设计源、Relation、Creator 尺寸 |
| 色板、材质、角色身份 | G3 | 受影响资产、contact sheet、视觉验收 |
| Alpha、尺寸、padding、pivot | G5 | 资产、引用、页面叠加和图集 |
| Controller、Gear、Relation、列表 | G6 | codegen、contract、程序映射和 Creator |
| 数据、事件、生命周期 | G7 | Logic/View 测试、Scenario 和 Creator |
| 发布设置、图集、压缩 | G6 | 发布闭包、导入、串色、内存和性能 |
| Editor/PSD/CLI/XML codec/OpenFairyGUI 版本 | M0.5/M2 | PSD composite、IR、往返、发布、diff、receipt 和回退 |

生成或提升前保留最近一个已通过 Gate 的完整基线。CLI 编译器与影子工具都必须使用临时目录或工程副本；全部检查
通过前不得覆盖已知可用版本。

---

## 10. 明确禁止的捷径

- 从扁平效果图猜透明层、隐藏像素、热区或内部 ID。
- 从标注截图 OCR 坐标，再把截图当布局真源。
- 维护只供 Gallery 使用的假业务逻辑或假页面。
- 让 CLI 与人工同时维护同一组件子树；人工调整必须进入 Editor takeover。
- 让 CLI、OpenFairyGUI 影子试点或脚本直接写正式工程。
- 自行分配或推算 package/resource/child ID。
- 未先建立 Scenario、PsdHandoffBundle、golden project、临时路径守门和 Editor takeover，就扩张 raw XML writer。
- 外部修改 `package.xml` 后用字符串替换或未验证 AST merge 掩盖冲突。
- 手工伪造 `.bin`、atlas、trim、rotation、分页或 Creator `.meta`。
- 把发布物反解析对账称为 Editor 保存—重开往返验收。
- 把生产资产清单与 FGUI 发布闭包锁混称为“manifest”。
- 在装配阶段重新调用图片模型；输入必须已批准并锁定哈希。
- 为修最终画面直接修改发布目录或同步镜像。
- 只看默认静态页面就宣布全状态、真机或性能通过。
- 把 PageSpec、Scenario Host、Gallery、staging、receipt 或 `ui:*` CLI 命令当成当前已有能力。
- 把浏览器 Studio 建成新的布局或业务真源。

---

## 11. 能力建设顺序

1. 先选两个结构不同的金样包实施 M0.5 的只读 IR 与设置/资源检查，不改变设计源。
2. 金样稳定后扩展到全包只读检查，再宣称 M0.5 完成。
3. 选一个现有中等复杂页面实现 M1a 的 typed Scenario Host 和手工 Creator Gallery。
4. 覆盖默认、加载、空、错误、极值文本、重复点击和至少两个 viewport，再进入 M1b 自动截图/diff。
5. 把 `psd-maker.md` 的一次性流程收口为可复建 `PsdHandoffBundle` pack/verify，并补 Photoshop 往返金样。
6. 选一个隔离 leaf component 做 `seededTemplate` POC；本机 6.1.4 只作候选，不先写入“已锁定”。
7. 用两个结构不同的 golden package 验证 `rawProjectCompiler`，再按九宫格面板、状态组件、小弹窗、主页面逐级试点。
8. 只有读取/兼容问题有实证时才做 OpenFairyGUI 只读影子试点；只有第 7.8 节条件齐备才扩张包级 merge。

中等复杂页面应包含：背景或同画布层、九宫格面板、运行时文本与极值数字、List 与空态、至少两个正交状态维度、动态 Loader、异步按钮与错误态，以及 Relation/安全区接线。它足以暴露真实问题，又不会把试点变成无法归因的巨型项目。

---

## 12. 参考资料

- [客户端开发与 FairyGUI 接入](CLIENT.md)
- [FairyGUI Editor 工程说明](../apps/art/fairygui/README.md)
- [FairyGUI UI 生产流水线提示词工具](../tools/FairyGUI-Prompts.md)
- [PSD 到 FairyGUI 的“CLI 编译器 PSD 版”实施方案](psd.md)
- [一次实际分层 PSD 生成记录](psd-maker.md)
- [FairyGUI 包与 package.xml](https://www.fairygui.com/docs/editor/package)
- [FairyGUI 发布](https://www.fairygui.com/docs/editor/publish)
- [FairyGUI 组件](https://www.fairygui.com/docs/editor/component)
- [FairyGUI 控制器](https://www.fairygui.com/docs/editor/controller)
- [FairyGUI 关联](https://www.fairygui.com/docs/editor/relation)
- [FairyGUI Editor 发布日志](https://www.fairygui.com/release/editor)
- [OpenFairyGUI（非官方候选，仅影子评估）](https://github.com/OpenFairyGUI/OpenFairyGUI)
- [Cocos Creator 3.8 命令行发布](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-in-command-line.html)
- [OpenAI 图像生成提示指南](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
