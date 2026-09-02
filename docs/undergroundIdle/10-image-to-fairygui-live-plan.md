# 《Underground Idle》黄金位图到 FairyGUI Editor 生产流程

> [返回总目录](README.md) · [上一篇：UndergroundIdleMain FairyGUI 装配契约](09-fairygui-undergroundidle-main-assembly.md)
>
> 文档版本：1.3<br>
> 编写日期：2026-09-02<br>
> 当前状态：`规范已定义 / 主界面运行资产、FairyGUI 包、客户端接线与 Creator 验收均未实施`

## 1. 当前流程

Underground Idle 的默认 UI 生产路线固定为：

```text
玩法 / PageSpec / 状态契约
  → 包含完整高保真美术 UI、但不烘焙运行时文字的黄金位图 target
  → decomposition-spec：逐 stableKey 冻结编辑单元与生产方式
  → 背景 clean plate + 逐元素独立源 + 局部状态 delta
  → artistEditableSource PSD + source-reference-excluded composite + Photoshop 人工编辑验收
  → 逐 leaf 来源/许可/生产属性批准 → productionFromAcceptedAssets
  → G5 运行 PNG + runtime-reference-excluded composite
  → target ↔ runtime-reference-excluded composite 分区视觉回归 + 人工签字
  → FairyGUI Editor 导入和装配
  → Editor 保存—关闭—重开 + 正式发布
  → Editor 生成 XML / 内部 ID / .bin / atlas
  → codegen:fgui → .view.json / feature.json → codegen:features
  → 契约/AUTO 审阅 → fgui-manifest --write
  → sync:client → Dashboard/Creator 导入和状态矩阵
```

这里的“无运行时文字”只表示由 FairyGUI/程序填写的中文、数值、价格、等级、倒计时和填充值留空或另作审阅投影，
不表示“无 UI”。G3 target 必须完整呈现 UI chrome、面板、按钮、页签、图标、装饰、场景/角色和状态视觉；背景
clean plate、独立源、`fullCanvas` 白名单与整页 base 禁令从 G4 才开始约束生产，不得反向写成 G3 的 `no UI` 提示词。

生产美术不得使用 SVG Master 作为中间真源。SVG 可以作为一次性审稿或标注工具，但不能成为运行美术真源、切图依赖或
FairyGUI 布局真源。正式运行输入只使用批准并登记的 PNG、字体和程序资源。

效果图也不能被“盲切”为完整页面：只有满足第 5 节条件的像素区域允许直接裁切；遮挡、透明边、隐藏像素、
换态对象和九宫格必须通过补绘、独立生成或人工修图得到合法生产源。

FairyGUI XML、`package.xml` 和内部 ID 由 FairyGUI Editor 分配和序列化。本流程不建立 raw XML writer，
不从图片推算 ID，也不让外部脚本直接写正式 FGUI 工程。

当前历史 source-only PSD 证据是 [`docs/psd-maker/ug_main_layered_source_v02.psd`](../psd-maker/ug_main_layered_source_v02.psd)，
制作过程与证据边界见 [`docs/psd-maker.md`](../psd-maker.md)。旧档位 `sourceOnlyFromTarget` 按当前规范映射为
`referenceCompositeOnly`：它的存在不证明元素级可编辑，不等于 G5 运行 PNG 已 accepted，也不解锁 FairyGUI
编译或正式工程写入。

批准 target 始终是视觉对账基准，不能在拆层时被新的独立构图替代；但它只允许作为隐藏 reference，不得参与
`artistEditableSource` 的可见重组或运行资产导出。G4c 的 `source-reference-excluded composite` 和 G5 的
`runtime-reference-excluded composite` 必须分别由源 leaf 与运行 PNG/native object 重建；后者未通过人工 A/B 前，
运行 PNG 不得进入 FairyGUI Editor。资产拆分只使用批准 target 的像素、局部编辑和同源补绘。

## 2. 真源与所有权

| 内容 | 权威真源 | 说明 |
| --- | --- | --- |
| 玩法、字段、状态与动作 | 02～04、PageSpec/Scenario | 图片不得猜业务语义 |
| 视觉语言 | 07、批准黄金 target | target 锁定构图、材质、光向、比例与 UI 质感 |
| 元素责任与拆分边界 | `decomposition-spec.json` | 冻结 stable key、编辑要求、像素 owner、状态 delta 与 fullCanvas 例外 |
| 可编辑视觉像素 | 通过 G4c 的 `artistEditableSource` PSD + 独立源 | target/reference 只供对照，不参与可见重组 |
| 生产资产 | 批准 PNG 源 + `asset-manifest.json` | 记录来源、crop、Alpha、pivot、九宫格和输出策略 |
| 精确页面结构与坐标 | FairyGUI Editor 设计源 | Editor 是 package/component/child/controller/relation 真源 |
| FGUI 内部 ID | FairyGUI Editor | 外部工具不发号、不推算 |
| 正式发布物 | FairyGUI Editor | `.bin`、atlas、独立纹理由 Editor 发布 |
| View AUTO 区块 | `codegen:fgui` | 禁止手改 |
| Creator `.meta` | Creator 真实导入 | 禁止脚本伪造 |
| 审阅证据 | target、composite、runtime 截图与差异报告 | 只读派生物，不反向成为布局真源 |

`asset-manifest.json` 只拥有资产生产事实，不拥有 FGUI 的内部 ID、Controller、Gear、Relation 或最终精确布局。
PageSpec 只表达语义角色、布局约束、安全区和极值；Editor 保存后的设计源拥有最终像素坐标。

`main_bitmap_v02/asset-manifest.json` 是主界面页面批次的唯一入口。ART-01～ART-09 若作为可复用独立包拥有各自
`asset-manifest.json`，主界面清单只按稳定 key + 文件哈希引用已批准条目，不复制一份可独立修改的 pivot、inset
或来源事实。

## 3. 目录

主界面生产文件使用以下目录：

```text
docs/undergroundIdle/art/
├─ targets/
│  ├─ ug_main_golden_v02.png                 # 750×1624 完整美术化 UI、无运行时文字 target
│  ├─ ug_main_golden_v02_review.png          # 运行时文字审阅投影
│  └─ ug_main_golden_v02.prompt.md
├─ production/main_bitmap_v02/
│  ├─ decomposition-spec.json               # 逐元素编辑责任、来源策略和 fullCanvas 例外
│  ├─ asset-manifest.json                    # 生产资产唯一清单
│  ├─ sources/                               # 批准源、mask、inpaint 输入；不进工程
│  │  ├─ components/                         # 可复用组件母版/独立源
│  │  └─ reference/                          # 整页 target；只读参考，不参与重组
│  ├─ psd/
│  │  └─ ug_main_artist_editable_v02.psd     # 通过 G4c 后的元素级可编辑母版
│  ├─ runtime/
│  │  ├─ full_canvas/                        # 背景、灯光、前景遮挡
│  │  ├─ ui_chrome/                          # 固定区块、九宫格和按钮态
│  │  ├─ buildings/                          # 建筑阶段与状态件
│  │  ├─ characters/                         # 独立 RGBA 角色
│  │  └─ icons/
│  ├─ composite/
│  │  ├─ ug_main_initial_text_off_v02.png
│  │  └─ ug_main_initial_review_v02.png
│  ├─ review/
│  │  ├─ target_composite_overlay_v02.png
│  │  ├─ target_composite_diff_v02.png
│  │  └─ region_report_v02.json
│  └─ AUDIT.md
```

运行 PNG 只有通过 manifest 和审计后才可导入 `apps/art/fairygui`。`targets/`、`sources/`、`composite/`、
`review/` 和 prompt 均禁止进入 FairyGUI/Cocos 运行目录。

## 4. 黄金 target 与几何裁定

### 4.1 target 要求

黄金 target 必须：

- 750×1624 审阅尺寸，另保留尽可能高分辨率的批准源；
- 不含运行时中文、数字、价格、等级、倒计时和填充值；
- 包含完整六区构图、材质、边框、图标透视、角色比例、光向与首屏初始状态；
- 使用真实首版快照语义，不制造不存在的角色、建筑或商业化入口；
- 登记源图哈希、生成/编辑方式、参考图、允许变化区与人工批准记录。

“不含运行时文字”只清空动态文字内容，不清空 UI 美术。target 中必须保留已批准的黑铁/旧钢面板、黄铜护角、磨损、
内阴影/倒角、按钮与页签状态、图标语言和其他视觉层次；不得用默认圆角矩形、统一细描边、纯色素框或程序 HUD 代替。

运行时文字审阅图是由 target + 文本投影生成的证据，不是生产源。

### 4.2 target 与装配契约一致性

黄金 target 必须符合 09 文档的 R1～R6、热区、岗位锚点和安全区换算。视觉参考与装配契约的几何不一致时，
必须先生成或编辑出符合契约的 target 并单独完成人工批准，禁止先切图后拉伸，也不能把另一套几何的批准结论
直接转移到当前 target。

## 5. 资产分类与切片规则

### 5.1 允许的生产方式

本节只约束 G4b/G5 的生产资产，不约束 G3 整页效果图应呈现的美术内容。以下 clean plate、独立源和 `fullCanvas` 限制
不得用于要求 G3 target 省略 UI。

| mode | 适用内容 | 规则 |
| --- | --- | --- |
| `copy` | 已批准独立 PNG | 哈希校验后无损复制 |
| `regionCrop` | 无遮挡、固定尺寸、无动态内容的完整矩形区块 | 显式 sourceRect；不得含运行时文字 |
| `inpaintCrop` | target 上对象被文字或邻近装饰影响，但边界可明确 | 保存 mask、补绘输入和输出哈希 |
| `alphaObject` | 角色、建筑、状态件、图标 | 真实 Alpha、完整隐藏轮廓、padding、pivot |
| `fullCanvas` | 场景 clean plate、全局灯光、前景遮挡 | 保留完整画布坐标，禁止 tight crop；必须登记 `fullCanvasReason`，不得烘焙按钮、面板、图标、角色、建筑状态件或运行时文字 |
| `nineSlice` | 面板、按钮、页签、状态卡 | 必须有干净中心；明确 source insets |
| `tile` | 可验证无缝的纹理 | 提供横/纵向接缝证据 |
| `generatedVariant` | 升级、满仓、解锁、按钮状态 | 以黄金 target/批准单体为 reference，只改变授权状态 |

ImageGen 可用于 `inpaintCrop`、`alphaObject` 和 `generatedVariant` 的候选制作，但每个输出都必须回到 target 做
身份、材质、尺度、光向和边缘检查。不能再次独立生成整套不相关构图后强行拼回页面。

### 5.2 可以直接裁切

同时满足以下条件时才允许 `regionCrop`：

1. 目标区域在 target 中完整可见且没有前景遮挡；
2. 不需要透明边、隐藏像素、独立阴影或独立换态；
3. 不含运行时文字、数字、容量填充或一次性状态；
4. 最终显示尺寸固定，或已证明可作为九宫格干净源；
5. 裁切后放回原坐标可与 target 对齐，不出现背景污染、接缝或重影。

主界面优先裁成少量高保真大区块，而不是把每个铆钉拆成小 PNG：

- 标题/资源/仓库固定 chrome；
- 无文字的指标区 chrome；
- 无文字的底栏 chrome；
- 场景 clean plate；
- 少量需要换态的按钮、图标和状态件。

### 5.3 不能直接裁切

- 被角色、轨道、木梁、阴影、灯光或前景遮住的对象；
- 需要透明边、完整隐藏轮廓、pivot 或程序动画的角色/建筑；
- 会升级、离岗、满仓、装载、解锁或切换页签的对象；
- target 中已与背景预乘、产生色边或带背景残留的像素；
- 没有干净可拉伸中心的任意截图块；
- 运行时文字、进度填充值、热区、Controller、Gear、Relation 和内部 ID。

这些内容必须使用 clean plate + 独立透明件重建。缺失像素通过显式 mask/inpaint 或以 target 为 reference 的
局部资产生成补齐，不允许模型凭空猜测未登记的业务状态。

### 5.4 元素级可编辑性

生产拆分以语义编辑单元为粒度，不要求“每个铆钉一层”，但以下任一条件成立时必须拥有独立 `ROLE::stableKey` 叶层、
原生 Type/Shape/Smart Object 或独立 RGBA 源：需要单独移动、隐藏、调色、替换、复用、动画、九宫格拉伸或切状态。

`decomposition-spec.json` 必须为每个 required 节点登记 `stableKey`、`nodeKey`、责任类型、`editabilityRequirement`、
`sourcePolicy`、`psdLayerPath`、`statePolicy`、`occlusionPolicy`、允许编辑动作和 `fullCanvasReason`。整页 target 只能位于
隐藏 `REFERENCE_ONLY` 组；背景 clean plate 必须移除所有可调前景并补齐被遮挡像素。

仅把 target 中的可见裁片复制到独立层、同时保留含该对象的完整 base，不算拆层：隐藏或移动裁片后出现底图残影，
必须阻断 G4c。状态差异使用共享基底加局部 delta，不得为每个状态复制整页位图。

## 6. 主界面拆分

### 6.1 固定视觉大块

| 资产 | 建议模式 | 说明 |
| --- | --- | --- |
| 顶部标题与资源 chrome | `regionCrop` 或 2～3 个固定 PNG | 保留黑铁、黄铜护角和手绘磨损；文字槽透明/空白 |
| 仓库与收取 chrome | 固定底板 + 收取按钮五态 | 容量填充、库存数字独立 |
| 中央矿井 clean plate | `fullCanvas` 或 R4 固定视口 PNG | 移除角色、矿车、可换建筑和深层状态，补齐隐藏背景 |
| 四指标 chrome | 固定大块或四个同源组件 | 数字、标签和状态轨由运行时/换态层承担 |
| 三页签 chrome | 固定底板 + 三个页签状态 | 倒计时、待领取角标独立 |

### 6.2 动态透明件

- 格伦、诺拉、伊芙与后续奥托；
- 矿井、升降机、仓库三个外观阶段；
- 空矿车、装载层、矿堆、升降负荷、箱体填充；
- 深层锁定、可解锁、已解锁；
- 岗位牌、锁、告警、收取、页签和资源语义图标；
- 暖灯、冷光、雾、尘埃与脚底前景遮挡。

所有动态件使用相同坐标系和 pivot；切换状态不得移动热区、岗位锚点和固定 UI。

## 7. `asset-manifest.json`

manifest 至少记录以下字段；字段可扩展，但不能把 FGUI ID 或最终 XML 结构塞进资产清单：

```json
{
  "version": 1,
  "target": {
    "file": "../../targets/ug_main_golden_v02.png",
    "sha256": "TBD",
    "width": 750,
    "height": 1624,
    "geometryContract": "09#R1-R6"
  },
  "assets": [
    {
      "key": "ui.topChrome",
      "nodeKey": "ui.topChrome",
      "mode": "regionCrop",
      "editabilityClass": "independent",
      "psdLayerPath": "20_COMPONENTS/GROUP::ui.topChrome/IMG::ui.topChrome",
      "referenceOnly": false,
      "fullCanvasReason": null,
      "statePolicy": "sharedBase",
      "source": "sources/ug_main_golden_v02_2x.png",
      "sourceRect": [0, 0, 1500, 414],
      "output": "runtime/ui_chrome/ug_ui_top_chrome_v02.png",
      "runtimeSize": [750, 207],
      "alpha": "opaque",
      "atlasPolicy": "alone",
      "approval": "pending"
    }
  ]
}
```

示例坐标只说明字段含义，不能在几何裁定完成前复制为实际值。每个资产还应按类型登记：

- crop 前原点、可见 Alpha bbox、padding 和 pivot；
- `nodeKey`、`psdLayerPath`、`editabilityClass`、`sourcePolicy`、`referenceOnly` 与允许编辑动作；
- 九宫格 `left/top/right/bottom` source inset；
- fullCanvas 的固定画布、blend mode、`fullCanvasReason` 和显式空的 `bakedStableKeys`；
- generatedVariant 的 reference、允许变化区和状态 key；
- source/output SHA-256、色彩空间、位深、许可与批准状态。

## 8. 双重确定性 composite 与视觉 Gate

G4c 先只使用 PSD 中 `referenceOnly=false` 的可编辑叶层或原生对象生成
`source-reference-excluded composite`，证明元素拆分和源重组成立。G5 再只使用已导出的运行 PNG 或原生对象生成
`runtime-reference-excluded composite`，证明运行导出没有偷用 PSD 文档 composite 或 target/reference 像素。两者都按
manifest 在 750×1624 画布上重组至少以下状态；整页 target、隐藏 reference、guide 和审稿文字不得参与重组：

- 新手初始；
- 产能平衡、开采瓶颈、运输瓶颈；
- 仓库近满、已满；
- 深层锁定、可解锁、已解锁；
- 收取按钮五态；
- 安全区与长数字样例。

`target ↔ runtime-reference-excluded composite` 以及
`source-reference-excluded composite ↔ runtime-reference-excluded composite` 检查至少包含：

1. 全页叠图和分区感知差异；
2. R1～R6 的材质、边框、倒角、纹理、光向和信息密度 A/B；
3. 角色与建筑的尺度、脚底接触、环境色和遮挡；
4. 九宫格 1×/极值尺寸无变形；
5. 关闭运行时文字后无伪字、数字、等级或填充值；
6. 人工三秒扫描与美术负责人签字。
7. 逐元素 solo sheet，以及隐藏、平移、换色消融结果；差异必须局限于该元素声明的影响范围。
8. 每个 required node 的 `editableCoverage` 为 100%，状态件只包含声明的局部 delta。

不要求跨字体和渲染器逐像素相等，但批准的固定像素区不得无理由漂移。差异报告必须区分：允许的运行时文字/
状态区、采样/抗锯齿容差和禁止变化区。没有人工签字时，自动分数不能关闭视觉 Gate。

## 9. FairyGUI Editor 装配

`target ↔ runtime-reference-excluded composite` 和源/运行重组对账通过后才进入 Editor：

1. 用 FairyGUI Editor 打开 `apps/art/fairygui/FairyGUI.fairy`；
2. 导入 manifest 中 `approval=accepted` 的运行 PNG；
3. 创建/修改 `UndergroundIdle / UndergroundIdleMain`；
4. 在 Editor 中配置组件、Controller/page、Gear、Relation、九宫格、List、Loader、pivot 和热区；
5. 完整保存、关闭、重开目标组件，记录 Editor 往返结论；
6. 使用 Editor 正式发布 `.bin`、atlas 和独立纹理。

自动化使用 `cliPSDCompiler`：它只在锁定版本的临时完整工程中导入批准资产、生成授权 leaf component 和候选
XML/`package.xml`，不得写正式工程。候选必须经过 Editor takeover、保存—关闭—重开和正式发布；正式 ID 以 Editor
接管后的设计源为准。UndergroundIdleMain 这类复杂整页必须在 `seededTemplate` 与 golden package 验证通过后再进入
`rawProjectCompiler` 页面级试点。

明确禁止：

- 从 target 或标注图推算 package/resource/child/controller page ID；
- 外部脚本直接写正式组件 XML 或 `package.xml`；
- 伪造 `.bin`、atlas、trim、rotation、分页或 Creator `.meta`；
- 把 review/composite/spec/prompt 导入运行包；
- 在装配阶段重新调用图片模型修最终画面。

## 10. Editor 后执行顺序

顺序固定为：

```bash
# 前提：Editor 已保存、关闭、重开并正式发布
npm run codegen:fgui -- UndergroundIdle UndergroundIdleMain

# 创建/更新目标 View 同目录 .view.json 与 features/<id>/feature.json 后
npm --workspace @game/server run codegen:features

# 审阅真实 XML、View AUTO、fguiContracts、viewRegistry、pages 与 feature 生成差异

node scripts/fgui-manifest.mjs --write
npm run sync:client
npm run test:fgui
npm run typecheck
npm run test:client
npm run verify:sync
```

`.view.json` 与 `features/<id>/feature.json` 是 feature/View 登记真源；`fguiContracts`、`viewRegistry`、`pages`
等稳定 façade 的生成区不得手改。`fgui-manifest --write` 必须晚于两次 codegen 和 AUTO 审阅，因为发布闭包锁
包含 View AUTO 哈希。随后通过 Cocos Dashboard 打开 Creator，等待真实导入生成/复用 `.meta`，再执行 09 文档
的完整状态矩阵。

## 11. Gate 与完成定义

| Gate | 交付 | 关闭条件 |
| --- | --- | --- |
| G0 | 策划冻结 | 玩法范围、业务规则、非目标和权威边界批准 |
| G1 | PageSpec/Scenario | 字段、状态、动作、极值与验收场景闭合 |
| G2 | 布局与几何裁定 | target 与 09 的固定区、热区、岗位锚点和安全区契约一致 |
| G3 | 视觉锁定 | 完整高保真美术 UI、无运行时文字的黄金 target、prompt/编辑记录、哈希和人工美术批准 |
| G4a | 元素分解 | decomposition-spec 覆盖全部 required node，编辑单元、来源策略、状态 delta 与 fullCanvas 例外获批 |
| G4b | 独立源生产 | 背景 clean plate、独立元素、Alpha/遮挡补绘和共享组件母版齐备；target 仅作隐藏 reference |
| G4c | 可编辑 PSD | `artistEditableSource` 从独立叶层重组；`source-reference-excluded composite`、solo/消融和 Photoshop 移动、隐藏、替换、调色、文字修改后保存—重开通过 |
| G5 | 运行资产 | `productionFromAcceptedAssets` 产生的 PNG 的 Alpha/尺寸/pivot/状态系列通过，`runtime-reference-excluded composite` 与 target/source 分区回归和人工 A/B 通过 |
| G6 | Editor | 保存—关闭—重开、正式发布、引用闭合通过 |
| G7 | 代码接线 | 两次 codegen、契约审阅、FGUI 发布闭包锁、同步和客户端测试通过 |
| G8a/G8b | Creator/目标平台 | 初始、极值、安全区、网络、完整状态矩阵及交付范围内真机检查通过 |
| G9 | 冻结与回流 | 证据、批准结论、缺陷回流与版本状态闭合 |

任何 Gate 的文件存在不等于通过。`referenceCompositeOnly` 不能关闭 G4c；G5 未通过时必须回到独立生产源或运行 PNG
修复，不能在 Editor 中用额外装饰掩盖；G6 之后的结构问题回 Editor，视觉源问题回 G3～G5。

## 12. 风险与回退

| 风险 | 阻断/检测 | 回退 |
| --- | --- | --- |
| 直接裁切含背景污染 | Alpha/边缘与回放重影检查 | 改用 inpaintCrop 或独立透明件 |
| 大区块保真但状态不可换 | manifest 动态节点盘点 | 拆出最小动态覆盖层，不拆静态铆钉 |
| 九宫格中心不干净 | inset 与极值拉伸检查 | 重新绘制同风格九宫格源 |
| 角色像贴纸 | 脚底、环境色、投影和遮挡 A/B | 回角色源与局部灯光层修复 |
| target 与装配坐标比例冲突 | G2 布局与几何裁定 | 修订 target；若业务布局确需变化则先同步修改 08/09 |
| Editor 与外部工具双写 | 正式工程写入监控/审阅 | 丢弃外部候选，回 Editor 已知版本 |
| 发布顺序导致闭包锁陈旧 | codegen/AUTO 哈希检查 | 重新 codegen、审阅后再写 manifest |

## 13. 实施顺序

1. 在 G2 确认 target 与 09 装配契约的几何一致；
2. 在 G3 制作并批准包含完整高保真美术 UI、但不烘焙运行时文字的 `ug_main_golden_v02`；
3. 在 G4a 建立 `decomposition-spec.json`，先冻结共享组件、逐元素编辑单元和 fullCanvas 例外；
4. 在 G4b 生产背景 clean plate、独立元素和局部状态 delta；
5. 在 G4c 重组 `artistEditableSource` PSD，生成 `source-reference-excluded composite`，完成 solo/消融与 Photoshop 人工编辑验收；
6. 批准全部 exportable leaf/native object 的来源、许可和生产属性，创建 `productionFromAcceptedAssets` bundle；
7. 在 G5 从该 bundle 生产 PNG、生成 `runtime-reference-excluded composite` 并完成 target/source 人工 A/B；
8. 进入 09 规定的 FairyGUI Editor 装配。

在 G5 通过前，不创建 UndergroundIdleMain 正式 XML、不发布资源，也不修改客户端绑定。
