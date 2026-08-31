# FairyGUI UI 生产流水线提示词工具

> 文档版本：1.0<br>
> 编写日期：2026-08-31<br>
> 类型：开发辅助工具，不是业务实现或项目状态真源

本文集中保存 FairyGUI UI 生产流水线使用的 P0～P11 提示词、公共变量、执行头和持续编排模板。权威流程、Gate、文件所有权、当前仓库能力和验收要求见[FairyGUI UI 生产、装配与自动化工作流](../docs/FAIRYGUI.md)。

使用边界：

- 提示词只生成候选产物和执行报告，不能替代业务、视觉、发布或 QA 批准；
- 模板必须消费主文档规定的已批准上游真源，不得凭提示词补造玩法、数据、坐标、隐藏图层或接口；
- 主文档与本文件冲突时以主文档为准；仓库真实代码、配置和运行证据优先于模板示例；
- 尚未实现的 layout 编译器、稳定 ID 或预览驱动器仍是规划能力，不能因模板提及而视为可用。

---
## 1. 公共变量

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

## 2. 文本、结构化数据和代码任务的公共执行头

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

## 3. P0：流水线总控

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

## 4. P1：策划案转 UI 需求契约

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

## 5. P2：页面和状态矩阵

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

## 6. P3：线框与布局契约

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

## 7. P4A：生成视觉风格锚点

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

## 8. P4B：冻结可执行风格参数

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

## 9. P5：生成整页高保真效果图

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

## 10. P5R：效果图结构化评审

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

## 11. P6：生产资产清单

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

## 12. P7：生成独立透明生产资产

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

## 13. P7B：同画布视觉层

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

## 14. P8：最小范围定向修图

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

## 15. P8B：仅修正透明背景

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

## 16. P9：FairyGUI 装配

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

## 17. P10：程序接线

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

## 18. P11：QA 审计与最小修复

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

## 19. 给 Codex 的持续编排提示词：执行到下一个人工 Gate

这条提示词用于让 Codex 持续编排一个批次，但每次只执行到下一个需要人工批准或外部工具的 Gate。它不会取消人工视觉批准、FairyGUI Editor 发布和 Creator/真机验收。

```text
为 {{PROJECT_NAME}} 的 {{FEATURE_NAME}} / {{PAGE_ID}} 执行《docs/FAIRYGUI.md》定义的 UI 生产流水线。

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
