# 分层 PSD 生成流程

> 文档版本：1.0<br>
> 编写日期：2026-09-02<br>
> 示例对象：`Underground Idle / ug_main_layered_source_v02.psd`<br>
> 适用范围：从批准的整页 PNG 视觉稿制作可审阅、带逻辑分组和文字层的 PSD 美术交接文件

## 1. 目的与结论

本文记录 `ug_main_layered_source_v02.psd` 的实际生成过程，并把它整理成可复用流程。

该 PSD 不是在 Photoshop 中逐层手工绘制，而是通过以下链路生成：

```text
批准的无字黄金 PNG
  → 内置 ImageGen 局部编辑，生成无角色 clean plate 候选
  → Pillow 规范化画布、裁切固定 UI、蒙版提取角色、渲染文字预览
  → 生成扁平 composite 预览
  → ag-psd + pngjs 写入 PSD 图层、组和 Type 文字描述
  → PSD 往返解析、ImageMagick 渲染与像素对账
```

这个产物的定位是 **source-only 可编辑美术交接文件**。它不能替代：

- 页面批次的 `asset-manifest.json`；
- G5 accepted 透明 PNG、九宫格源和确定性 composite；
- FairyGUI Editor 中的 package、component、Controller、Gear、Relation 和内部 ID；
- Creator 真实运行与安全区验收。

相关约束见：

- [FairyGUI UI 生产、装配与自动化工作流](FairyGUI.md)
- [Underground Idle 美术表现与资产制作](undergroundIdle/07-art-direction.md)
- [主界面视觉落地与效果图任务书](undergroundIdle/08-main-screen-art-brief.md)
- [UndergroundIdleMain FairyGUI 装配契约](undergroundIdle/09-fairygui-undergroundidle-main-assembly.md)
- [黄金位图到 FairyGUI Editor 生产流程](undergroundIdle/10-image-to-fairygui-live-plan.md)

## 2. 输入、工具与输出

### 2.1 输入

示例使用以下视觉基准：

```text
docs/undergroundIdle/art/targets/ug_main_golden_v02.png
```

它是 `750×1624`、无运行时文字的 `UG-MAIN-GOLDEN-V02` 批准视觉 target。

项目字体来自：

```text
apps/art/fairygui/assets/L10n_zh_hans/Font/siyuanheitiCNRegular.ttf
```

PSD 中登记的 PostScript 字体名为：

```text
SourceHanSansCN-Regular
```

### 2.2 实际使用的工具

| 工具 | 用途 |
| --- | --- |
| Codex 内置 ImageGen | 从黄金 target 生成移除三名角色后的 clean plate 候选 |
| Python 3 + Pillow 12.2.0 | 画布规范化、裁切、Alpha 蒙版、文字预览和 composite |
| Node.js + `ag-psd@31.0.2` | 写入 PSD 文档、组、图层和 Type 文字描述 |
| `pngjs@7.0.0` | 将临时 RGBA PNG 解码为 PSD 所需像素数组 |
| ImageMagick 7.1.2 | 识别 PSD、渲染合成帧和执行像素对账 |

内置 ImageGen 是默认生成路径，不要求 `OPENAI_API_KEY`。ImageGen 输出必须复制到工作区后才能成为项目内的源候选。

### 2.3 示例输出

历史示例输出路径为：

```text
docs/undergroundIdle/art/production/main_bitmap_v02/sources/
├─ ug_main_cleanplate_imagegen_candidate_v01.png
├─ ug_main_layered_source_v02.psd
├─ ug_main_layered_source_v02_preview.png
└─ ug_main_layered_source_v02.prompt.md
```

这些文件属于 source/review，不得整页导入 FairyGUI 或 Cocos 运行目录。

## 3. `UG-MAIN-GOLDEN-V02` 的背景与参考资料

### 3.1 黄金 target 的来源

`UG-MAIN-GOLDEN-V02` 不是本次 PSD 任务临时生成的全新构图。它在此前的 G3 选稿中已由用户明确选定，原始 ImageGen 输出 ID 为：

```text
exec-53aa6312-22bd-4b18-91f0-0701dc29b469.png
```

该输出归档为：

```text
docs/undergroundIdle/art/production/main_bitmap_v02/sources/
ug_main_selected_exec_53aa_source_853x1844.png
```

原始图尺寸是 `853×1844`。项目中的 `750×1624` 黄金 target 由该源等比缩放、居中并补足画布得到，没有进行非等比拉伸，也没有把低分辨率图机械放大后冒充新的高分辨率作者源。

原始提示词曾要求旧版六区几何，但 ImageGen 实际输出形成了更高的顶部 UI 和更紧凑的矿井视口。用户选择实际像素后，G2 采用 `adoptConceptGeometry`：

- 不把选定图切开后强行压回旧坐标；
- 不重新生成一张“更符合旧契约”但视觉不同的页面；
- 改为让 08、09、几何稿、文字槽、热区和安全区规则同步选定像素；
- 后续 PSD 和运行资产继续以该 target 为视觉对账基准。

`UG-MAIN-GOLDEN-V02` 锁定：

- 六段式信息层级和正视矿井剖面；
- 炭黑岩层、胡桃木、旧钢轨、黄铜和暖黄/青绿/橙红配色；
- 粗描边、厚边框、护角、铆钉、内阴影和有限倒角；
- 三名初始角色的身份、比例、帽型、主色和工具；
- UI chrome、构图、整体光向和信息密度。

它不锁定：

- 运行时中文、数字、容量、倒计时和价格；
- 建筑最终阶段资源和状态组合；
- 透明 bbox、padding、pivot、九宫格和 atlas 策略；
- FairyGUI 最终节点矩形、Controller、Relation 和内部 ID；
- G5 的最终拆层方式和 accepted PNG。

制作该 PSD 时的 Gate 背景是：

```text
G2：已完成 adoptConceptGeometry
G3：用户已选定 UG-MAIN-GOLDEN-V02
G4：asset-manifest 候选已建立，等待联合审阅和预算决策
G5：未开始
Gate A：未关闭
```

生成 PSD 没有改变这些状态。

### 3.2 实际参考的仓库文件

除了 PNG 图像，制作前还读取或核对了以下文件：

| 文件 | 在 PSD 生成中的作用 |
| --- | --- |
| `AGENTS.md` | 确认仓库真源、生成镜像、FairyGUI 和 Git 约束 |
| `docs/undergroundIdle/README.md` | 确认玩法范围、当前实施状态和美术阅读路径 |
| `docs/undergroundIdle/07-art-direction.md` | 确认 Q 版手绘方向、色板、材质、人物比例、主界面六区、文字禁入和资产责任 |
| `docs/FairyGUI.md` | 确认 Scenario-first + Editor-first、G0～G9 Gate、效果图/生产源/运行资产边界、Type 文本与 Editor 所有权 |
| `docs/undergroundIdle/08-main-screen-art-brief.md` | 确认 FX-01 初始快照、R1～R6 语义、分层组顺序、三秒扫描、文字投影和 Gate A 口径 |
| `docs/undergroundIdle/09-fairygui-undergroundidle-main-assembly.md` | 提供 R/T/H/A 坐标、T01～T13 槽位、岗位锚点、目标节点树和安全区规则 |
| `docs/undergroundIdle/10-image-to-fairygui-live-plan.md` | 确认 `regionCrop`、`inpaintCrop`、`alphaObject`、`fullCanvas` 等生产方式，以及禁止盲切和整页导入 |
| `docs/undergroundIdle/art/production/README.md` | 确认 Bitmap-first 批次状态、source/runtime/composite/review 的目录责任和 Gate 顺序 |
| `docs/undergroundIdle/art/production/main_bitmap_v02/README.md` | 确认 79 项计划输出、当前烘焙责任、三层场景、角色/灯光/状态的待拆边界 |
| `docs/undergroundIdle/art/production/main_bitmap_v02/asset-manifest.json` | 核对计划资产组、文字槽、热区、状态族和 composite 责任；没有把 pending 条目冒充 accepted 输入 |
| `docs/undergroundIdle/art/targets/ug_main_golden_v02.geometry.md` | 确认 `adoptConceptGeometry`、六区坐标、Mask、安全区和短屏决策 |
| `docs/undergroundIdle/art/targets/ug_main_golden_v02.prompt.md` | 确认原始 ImageGen 提示词、用户选稿、853×1844 源、750×1624 规范化方法和历史候选排除项 |
| `apps/art/fairygui/assets/L10n_zh_hans/Font/siyuanheitiCNRegular.ttf` | 用于 T01～T13 的栅格预览，并登记 `SourceHanSansCN-Regular` Type 字体名 |

这些文件的责任不同：

- 07 定义跨页面视觉语言；
- 08 定义主界面效果图和状态语义；
- 09 提供装配约束与文字槽；
- 10 和 `docs/FairyGUI.md` 定义生产与 Editor 边界；
- `asset-manifest.json` 记录生产计划事实；
- 黄金 target 始终是像素视觉基准。

任何单个文件都不能单独宣布 PSD 或运行资产完成。

### 3.3 实际参考的图像证据

| 图像 | 用途 | 是否直接进入 PSD 默认合成 |
| --- | --- | --- |
| `art/targets/ug_main_golden_v02.png` | 唯一批准视觉 target、ImageGen 编辑目标、固定 UI 和角色像素来源 | 是；固定 UI/角色来自该图，另保留隐藏参考层 |
| `art/production/main_bitmap_v02/sources/ug_main_selected_exec_53aa_source_853x1844.png` | 核对用户选定的原始 ImageGen 输出和细节密度 | 否；PSD 使用规范化 target 和新的 clean plate 候选 |
| `art/targets/ug_main_golden_v02_review.png` | 核对项目字体、常规中文、数值层级和视觉占位 | 否；文字在 PSD 中重新建立 |
| `art/targets/ug_main_golden_v02_review_extreme.png` | 核对长数字、极限速率和满仓文字槽设计 | 否；它是审稿证据 |
| `art/ug_spec_main_geometry_v02.png` | 核对 R/Mask/H/T/A 标注 | 否；PSD 根据 09 的坐标重新生成隐藏 guide |
| `art/ug_spec_main_safearea_88_68_v02.png` | 理解非对称安全区和 598px 舞台规则 | 否；安全区不是烘焙像素 |
| `ug_main_cleanplate_imagegen_candidate_v01.png` | 本轮依据黄金 target 新生成的无角色 R4 候选 | 是；规范化后仅使用 R4 |

以下历史图明确没有被当作最终 PSD 视觉输入：

- 选稿前的 `ug_main_contract_candidate_before_selection_*`；
- 旧概念母版 `ug_ui_main_concept_02.png`；
- geometry guide、warp edit input 和仓库局部生成历史；
- 任意 review、extreme review 或 SPEC 图中的标注文字。

### 3.4 外部与临时技术参考

本次还读取了 ImageGen 技能说明及其提示词资料：

```text
$CODEX_HOME/skills/.system/imagegen/SKILL.md
$CODEX_HOME/skills/.system/imagegen/references/prompting.md
$CODEX_HOME/skills/.system/imagegen/references/sample-prompts.md
```

它们用于确定：

- 默认使用内置 ImageGen；
- 本次属于 `precise-object-edit`；
- 输入图是 edit target，不只是风格参考；
- 提示词必须重复不变量并限制只修改三名角色；
- 项目资产必须从 ImageGen 默认目录复制回工作区；
- 最终记录提示词、输出路径和使用模式。

PSD 写入实现还核对了临时安装的：

```text
ag-psd/README.md
ag-psd/dist/psd.d.ts
```

重点确认 `Layer.imageData`、`children` 分组、`LayerTextData`、`shapeType=box`、`boxBounds`、字体、行距和 `paragraphStyle.justification` 的写入结构。它们只是 PSD 文件格式实现参考，不是项目视觉或业务真源。

## 4. 第一步：锁定 target 与页面几何

生成前先确认视觉真相和页面几何，禁止让图片模型重新决定页面布局。

示例画布为 `750×1624`，六个区域如下：

| 区域 | 左上/右下坐标 | 尺寸 | 内容 |
| --- | --- | ---: | --- |
| R1 | `(0,0)–(750,178)` | 750×178 | 标题、公会徽章、设置 |
| R2 | `(0,178)–(750,280)` | 750×102 | 三资源栏 |
| R3 | `(0,280)–(750,464)` | 750×184 | 仓库与全部收取 |
| R4 | `(0,464)–(750,1218)` | 750×754 | 矿井舞台 |
| R5 | `(0,1218)–(750,1467)` | 750×249 | 四指标卡 |
| R6 | `(0,1467)–(750,1624)` | 750×157 | 三页签底栏 |

生成和拆层必须保持以下不变量：

- R1、R2、R3、R5、R6 的批准 UI chrome 不漂移；
- R4 保持正视纵向矿井剖面；
- 不新增人物、装备、商店、商业化入口或伪文字；
- 所有中文、数字、容量、速率和倒计时留给独立文字层；
- 批准 target 作为隐藏参考层保留在 PSD 中。

## 5. 第二步：用 ImageGen 生成 clean plate 候选

ImageGen 使用 `precise-object-edit`，输入图既是参考图也是编辑目标。实际提示词的核心内容如下：

```text
Use case: precise-object-edit
Asset type: source-only clean-plate candidate for a layered PSD of the
Underground Idle portrait mobile game home screen

Input images:
Image 1 is the approved UG-MAIN-GOLDEN-V02 visual reference and edit target.

Primary request:
Remove only the three chibi workers from the mine stage:
- Glen with pickaxe on the upper platform;
- Nora inside the right hoist cage;
- Eve with lantern/map on the lower platform.

Reconstruct the rock walls, timber platforms, rails, hoist interior,
shadows, and local lighting naturally behind the removed figures.

Constraints:
- preserve the composition, six-region geometry, crop and UI chrome;
- preserve the mine cart, buildings, locked deep gate, icons and bottom tabs;
- leave all title, number, value, button and tab slots blank;
- change only the three workers and pixels directly behind them;
- no new characters, props, fake text, watermark, logo or device frame;
- this is an inpaint clean-plate candidate, not a redesigned screen.
```

实际 ImageGen 输出为 `852×1846`。它没有直接作为整个 PSD 底图，而是先作为 source-only 候选保存，再进入确定性处理。

这样做的原因是：图片模型可能对边框、图标和 UI 几何产生轻微漂移，所以只使用其 R4 clean plate，不使用其重新生成的顶部和底部 UI。

## 6. 第三步：规范化画布与固定 UI 裁切

使用 Pillow 将 ImageGen 输出规范化到逻辑画布：

```python
clean = ImageOps.fit(
    clean_raw,
    (750, 1624),
    method=Image.Resampling.LANCZOS,
)
```

随后只裁取生成图的 R4：

```python
scene_layer = clean.crop((0, 464, 750, 1218)).convert("RGBA")
```

R1、R2、R3、R5、R6 从批准 target 原样裁切：

```python
ui_layers = [
    target.crop((0, 0, 750, 178)),
    target.crop((0, 178, 750, 280)),
    target.crop((0, 280, 750, 464)),
    target.crop((0, 1218, 750, 1467)),
    target.crop((0, 1467, 750, 1624)),
]
```

底部再建立一张完整画布的矿岩底色层：

```python
background = Image.new("RGBA", (750, 1624), (24, 33, 41, 255))
```

即 `#182129`，用于防止任何透明区域露出未定义颜色。

## 7. 第四步：提取角色 source mask

三名角色没有再次生成，而是从批准 target 中提取，以保持人物身份、服装、工具和比例。

| 角色 | 提取 bbox | 输出尺寸 |
| --- | --- | ---: |
| 格伦 | `(96,520)–(318,724)` | 222×204 |
| 诺拉 | `(536,724)–(700,952)` | 164×228 |
| 伊芙 | `(177,980)–(374,1204)` | 197×224 |

处理过程：

1. 为人物和标志道具手工定义多边形顶点；
2. 在 bbox 局部坐标中绘制单通道 Alpha mask；
3. 使用 `GaussianBlur(0.7)` 轻微羽化边缘；
4. 把 mask 写入 target crop 的 Alpha 通道；
5. 按 bbox 左上坐标把角色放回页面。

关键实现：

```python
mask = Image.new("L", (bbox_width, bbox_height), 0)
ImageDraw.Draw(mask).polygon(local_polygon, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(0.7))
image.putalpha(mask)
```

这些图层只应称为 `source mask`。它们没有自动获得生产级隐藏轮廓、透明边、padding、pivot 或动画拆件，不能直接标记为 G5 accepted 角色资产。

## 8. 第五步：生成文字预览与 Type 描述

### 8.1 文字内容

示例 PSD 使用以下 T01～T13 内容：

| ID | 文本 | 字号 | 对齐 | 颜色 |
| --- | --- | ---: | --- | --- |
| T01 | `矿场` | 42 | 居中 | `#F4F0E8` |
| T02 | `100` | 30 | 右对齐 | `#F4F0E8` |
| T03 | `0` | 30 | 右对齐 | `#F4F0E8` |
| T04 | `30/30` | 30 | 右对齐 | `#F4F0E8` |
| T05 | `50 / 1,000` | 25 | 右对齐 | `#F4F0E8` |
| T06 | `全部收取` | 34 | 居中 | `#F4F0E8` |
| T07 | `开采\n12.8/分钟` | 18 | 两行居中 | `#F4F0E8` |
| T08 | `运输\n19.8/分钟` | 18 | 两行居中 | `#F4F0E8` |
| T09 | `有效产率\n12.8/分钟` | 17 | 两行居中 | `#F4F0E8` |
| T10 | `瓶颈\n开采` | 18 | 两行居中 | `#F4F0E8` |
| T11 | `矿场` | 21 | 居中 | `#F3BE58` |
| T12 | `矿工` | 21 | 居中 | `#AEBAC2` |
| T13 | `远征` | 21 | 居中 | `#AEBAC2` |

文字槽坐标必须来自页面装配契约，不从图片中文字 bbox 反推。

### 8.2 栅格预览

每个文字槽先生成独立 RGBA 预览层：

1. 按文字槽宽高创建透明图像；
2. 使用项目字体计算 `multiline_textbbox`；
3. 根据居中、右对齐或左对齐计算局部坐标；
4. 先在 `(x+1,y+2)` 绘制半透明黑色阴影；
5. 再绘制正文颜色；
6. 保存为单独临时 PNG。

栅格预览使 PSD 缩略图、ImageMagick 和不解析 Type Engine 的工具也能显示正确文字。

### 8.3 PSD Type 元数据

写入 PSD 时，同一文字层还包含 Type 描述：

```javascript
text: {
  text: item.text,
  transform: [1, 0, 0, 1, item.left, item.top + item.fontSize],
  antiAlias: 'smooth',
  orientation: 'horizontal',
  shapeType: 'box',
  boxBounds: [0, 0, item.width, item.height],
  style: {
    font: { name: 'SourceHanSansCN-Regular' },
    fontSize: item.fontSize,
    fillColor: { r, g, b },
    leading,
    autoLeading: false,
  },
  paragraphStyle: {
    justification,
  },
}
```

因此文字层同时具有：

- 当前画面的栅格预览；
- 可被 PSD 解析器识别的 Type 描述。

`ag-psd` 的文字写入能力并不等同于真实 Photoshop 往返验收。生产交付前仍应在目标 Photoshop 版本中执行打开、检查、更新文字、保存、关闭和重开；若 Photoshop提示更新文字渲染，应按项目验收流程处理并记录结果。

## 9. 第六步：生成审阅标注层

额外生成一个默认隐藏的 `90_REVIEW_ONLY` 图层，包含：

- R1～R6 区域框；
- T01～T13 文字槽；
- H01～H11 热区；
- A01～A06 岗位锚点；
- 批准 target 的完整参考层。

标注层只用于人工核对。它不得进入运行目录，也不得反向成为 FairyGUI 精确布局或内部 ID 真源。

## 10. 第七步：生成 composite 预览

使用 Pillow 按以下顺序做 Alpha 合成：

```text
10_BG_ROCK
→ 20_STRUCTURE / R4 ImageGen clean plate
→ 50_CHARACTER / Glen、Nora、Eve
→ 70_UI_COMPONENT / R1、R2、R3、R5、R6
→ 80_RUNTIME_TEXT / T01～T13
```

对应伪代码：

```python
composite = Image.new("RGBA", (750, 1624), (0, 0, 0, 0))
paste(composite, background_layer)
paste(composite, scene_layer)

for layer in characters:
    paste(composite, layer)

for layer in ui_layers:
    paste(composite, layer)

for layer in text_layers:
    paste(composite, layer)
```

先保存 composite PNG，再把同一份 composite 像素写入 PSD 文档级 `imageData`。这样文件管理器和普通渲染器显示的 PSD 预览与实际分层合成一致。

## 11. 第八步：写入 PSD

### 11.1 临时依赖

依赖可安装在临时目录，避免污染项目依赖：

```bash
mkdir -p tmp/imagegen/psd-builder
npm install --prefix tmp/imagegen/psd-builder ag-psd@31.0.2 pngjs@7.0.0
```

临时依赖和中间 PNG 不进入正式资源目录，也不应提交。

### 11.2 PNG 转换为 PSD imageData

`pngjs` 解码后的 RGBA 数据转换为：

```javascript
{
  data: new Uint8ClampedArray(png.data),
  width: png.width,
  height: png.height,
}
```

每个普通图层至少写入：

```text
name
left / top / right / bottom
blendMode=normal
hidden
imageData
```

### 11.3 图层树

示例 PSD 的顶层结构为：

```text
99_README__SOURCE_ONLY__DO_NOT_IMPORT_TO_FAIRYGUI
90_REVIEW_ONLY__GUIDES_AND_APPROVED_TARGET
80_RUNTIME_TEXT__EDITABLE__FGUI_TEXT_AT_RUNTIME
70_UI_COMPONENT__TEXT_OFF_CHROME
60_LIGHT_FX__CURRENTLY_BAKED_IN_CLEANPLATE_CANDIDATE
50_CHARACTER__SEPARATE_SOURCE_MASKS
40_PROP_STATE__CURRENTLY_BAKED_IN_CLEANPLATE_CANDIDATE
30_BUILDING__CURRENTLY_BAKED_IN_CLEANPLATE_CANDIDATE
20_STRUCTURE__IMAGEGEN_CLEANPLATE_CANDIDATE
10_BG_ROCK
00_REFERENCE_TARGET__HIDDEN_PIXEL_BASELINE
```

其中：

- `80_RUNTIME_TEXT` 包含 13 个 Type 文字层；
- `70_UI_COMPONENT` 包含五个固定无字 UI 区域；
- `50_CHARACTER` 包含三名角色 source mask；
- `20_STRUCTURE` 包含 ImageGen R4 clean plate；
- `90_REVIEW_ONLY` 与 `00_REFERENCE_TARGET` 默认隐藏；
- `30_BUILDING`、`40_PROP_STATE`、`60_LIGHT_FX` 是说明性组，明确标记尚未完成生产拆分。

### 11.4 写入参数

```javascript
const buffer = writePsdBuffer(psd, {
  noBackground: true,
  trimImageData: false,
  invalidateTextLayers: false,
});
```

- `noBackground=true`：不把最底层强制转换为不可透明的 Photoshop Background；
- `trimImageData=false`：保留每个图层声明的画布、坐标和 padding；
- `invalidateTextLayers=false`：保留随层写入的 Type 描述和栅格预览，后续是否重绘由 Photoshop 往返验收决定。

## 12. 第九步：验证 PSD

### 12.1 格式与尺寸

```bash
file docs/undergroundIdle/art/production/main_bitmap_v02/sources/ug_main_layered_source_v02.psd
```

示例预期：

```text
Adobe Photoshop Image, 750 x 1624, RGB, 3x 8-bit channels
```

### 12.2 PSD 结构往返

写入后立即使用 `ag-psd.readPsd` 只读解析：

```javascript
const roundtrip = readPsd(buffer, {
  skipLayerImageData: true,
  skipCompositeImageData: true,
  skipThumbnail: true,
});
```

示例结果：

```text
画布：750×1624
顶层组：11
全部组/图层节点：44
保留 text 描述的图层：13
文件大小：14,866,179 bytes
```

该检查证明 PSD 结构和 Type 描述可以被同一解析器重新读取，但不能替代 Photoshop 真实打开—保存—重开。

### 12.3 合成像素对账

使用 ImageMagick 渲染 PSD 的文档合成帧：

```bash
magick 'ug_main_layered_source_v02.psd[0]' psd_render.png
```

再与预先生成的 sibling preview 比较：

```bash
magick compare \
  -metric AE \
  ug_main_layered_source_v02_preview.png \
  psd_render.png \
  null:
```

示例结果为：

```text
0
```

即 PSD 文档级 composite 与交付预览没有不同像素。

### 12.4 项目计划校验

若 PSD 对应 Underground Idle 主界面批次，还应运行：

```bash
node docs/undergroundIdle/art/production/main_bitmap_v02/validate-manifest.mjs --plan
```

历史示例输出为：

```text
PASS: plan manifest validation
79 planned assets
13 text slots
11 hit areas
24 bitmap render cases
```

计划校验通过只说明 G4 候选结构自洽。预算未决定、联合审阅未完成、运行 PNG 未 accepted 时，不得因此宣布 G4/G5 或 Gate A 已通过。

## 13. 已知限制

这个流程生成的 PSD 有以下明确限制：

1. **不是完整生产拆层。** 建筑、矿车、仓储状态、深层状态和部分灯光仍烘焙在 clean plate 中。
2. **角色是审稿级蒙版。** 角色没有完整隐藏轮廓、严格透明边、padding、pivot 和程序动画拆件。
3. **ImageGen clean plate 不是批准像素的无损恢复。** 模型可能在 R4 内改变岩纹、木梁、阴影或局部几何，必须人工 A/B。
4. **Type 描述未经过 Photoshop 实机往返。** `ag-psd` 往返成功不等于 Photoshop、Photopea 或其他编辑器表现完全一致。
5. **PSD 不拥有运行时文字。** T01～T13 最终必须在 FairyGUI Editor 中建立真实文本节点，由运行时数据更新。
6. **PSD 不拥有交互。** 热区、Controller、Gear、Relation、Loader、内部 ID 和安全区逻辑仍归 FairyGUI Editor 与客户端代码。
7. **不能整页导入运行包。** PSD、preview、prompt、target 和 guide 都属于 source/review。

## 14. 进入生产流程前的完成条件

若要把该流程提升为真正的 G5 生产交付，至少还需：

```text
□ G4 asset-manifest.json 完成美术、技术美术/UI 工程、客户端联合批准
□ 明确目标设备、纹理、atlas、显存、首开和帧耗预算
□ 建筑、状态件、灯光和角色逐项生成/补绘为真实 RGBA
□ 每项登记 source/output SHA、Alpha bbox、padding、pivot 和运行尺寸
□ 九宫格完成 source inset 与极值拉伸验证
□ target ↔ composite 分区 diff 和 allow-mask 完整
□ 750×754 与 750×598 场景 composite 通过
□ 人工 A/B 和三秒扫描签字
□ 真实 Photoshop 或批准的 PSD 编辑器完成打开—保存—关闭—重开
□ 只有 accepted PNG 进入 FairyGUI Editor
```

## 15. 可复用执行清单

```text
□ 读取页面策划、美术方向、几何和 FairyGUI 约束
□ 锁定批准 target、画布、区域、文字槽与不变量
□ 明确 ImageGen 只允许修改的区域和必须保持的像素
□ 保存 ImageGen 输入、输出、提示词、尺寸和哈希
□ 只使用 ImageGen 输出中经过授权的 clean plate 区域
□ 固定 UI 从批准 target 或 accepted 独立源确定性裁切
□ 动态对象使用 RGBA/mask，不用含背景矩形冒充透明件
□ 中文和数字分别建立独立栅格预览与 Type 描述
□ 保留隐藏 target 和 guide，不导入运行目录
□ 先生成 composite，再把同一 composite 写入 PSD 文档级 imageData
□ PSD 写入后立即 round-trip 解析图层和文字描述
□ 渲染 PSD composite，并与 sibling preview 执行像素对账
□ 在目标 PSD 编辑器中执行真实往返验收
□ 明确记录该 PSD 是否仅为 source-only、是否关闭任何 Gate
```

---

该流程的关键原则是：**ImageGen 只提供候选像素，脚本只做确定性拆分和封装，PSD 只做美术交接；批准资产、FairyGUI Editor 与 Creator 证据仍分别拥有各自的生产真相。**
