# SVG / PNG / FairyGUI XML 同源可视化编辑方案

> 文档状态：设计方案，尚未实施
>
> 编写日期：2026-08-31
>
> 适用技术栈：Cocos Creator 3.8.8 + FairyGUI 1.2.2
>
> 试点页面：`Underground Idle / IdleMain`

## 1. 结论

可以实现“像编辑网页一样编辑效果图”，也可以在同一次生成中产出：

- 浏览器可视化编辑和审稿用 SVG；
- FairyGUI 工程需要的组件 XML、`package.xml` 登记和切片 PNG；
- 设计合成 PNG、差异图以及 Cocos 真实运行截图；
- 最终给 Cocos 使用的 FairyGUI `.bin`、atlas 和独立纹理。

但不推荐把 FairyGUI XML 直接当成网页编辑器的唯一数据模型，也不能让 SVG、XML、PNG 三者各自独立可编辑。
本方案采用以下职责划分：

> SVG 负责“看和拖”，`layout.json` 负责“记”，FairyGUI XML 负责“交付给 Editor”，PNG 负责“运行与核验”。

其中：

- `*.layout.json` 是节点、坐标、层序、资源、热区、状态和布局关系的唯一机器真源；
- `ids.lock.json` 是 FairyGUI 稳定 ID 的唯一真源；
- SVG、切片 PNG、合成 PNG 和 machine-owned XML 均由编译器确定性生成；
- FairyGUI Editor 负责打开设计源、在临时工程副本中完成往返验证，并从正式工程发布 `.bin` 和 atlas；
- Cocos Creator 的真实运行截图才是最终视觉验收证据。

这与仓库已有的[图片标注到 FairyGUI 自动编译计划](docs/undergroundIdle/10-image-to-fairygui-live-plan.md)
方向一致。现有计划和本文都只是设计，当前不能把命令、目录或产物视为已经实现。

## 2. 对 `tmp/main.svg` 与 `tmp/main.png` 的判断

当前两个文件分别承担不同职责：

| 文件 | 当前内容 | 能否直接作为分层 UI 真源 |
| --- | --- | --- |
| `tmp/main.png` | 750×1624、RGB、无透明通道的最终扁平效果图 | 不能 |
| `tmp/main.svg` | 3000×3248 的审稿板；左侧以 2×尺寸嵌入整张 `main.png`，再叠加安全区、区域、热区、锚点和说明；右侧是规格表 | 不能直接作为运行分层源，但很适合作为审稿投影的原型 |

`tmp/main.svg` 中真正的效果画面仍是一个整体 `<image href="main.png">`。SVG 虽然已经保存了 H01～H10 热区、
R1～R6 区域、角色锚点和安全区等结构信息，却没有把背景、建筑、角色、按钮、文字、状态图分别保存成独立
图层。因此它现在更像“效果图 + 工程标注板”，不是 Photoshop/Figma 意义上的分层母版。

不能从 `main.png` 的矩形区域反向得到可靠的生产切图：

- 角色或建筑被其他元素遮挡的像素已经丢失；
- 矩形裁切会把背景颜色一起带入，无法恢复真实 Alpha；
- 按钮正常、按下、禁用等状态不存在；
- 文字和图标已经烘焙进图片，不能替换内容或适配长文本；
- 九宫格边界、pivot、遮罩和 blend 语义无法仅靠像素猜出。

正确方向是：在生成效果图的同一批次中，同时输出完整透明层、独立组件图和机器布局描述，再由这些源件合成
效果图；而不是先得到扁平效果图，之后再尝试“智能切开”。

## 3. 为什么不直接用 FairyGUI XML 模拟 HTML

FairyGUI XML 确实可以表达不少网页式场景树信息：

| 网页概念 | FairyGUI 对应概念 |
| --- | --- |
| DOM 子树 | 组件 XML 的 `displayList` |
| `left/top/width/height` | `xy`、`size` |
| `z-index` | `displayList` 节点顺序 |
| 图片元素 | `image` 或 `loader` |
| 点击区域 | Button 组件或透明 `graph`/组件 |
| 状态类 | controller page + gear |
| 锚点/响应式约束 | relation |
| 九宫格背景 | `package.xml` 中的 `scale9grid` |
| 页面截图 | 设计合成 PNG 或运行截图 |

但 FairyGUI XML 不是 HTML/CSS，也没有 CSS cascade、flex、grid 或浏览器统一排版模型。直接以 XML 为唯一编辑
模型会遇到以下问题：

1. `package.xml`、组件、资源、子节点、controller page 之间依赖稳定 ID 和交叉引用；
2. `displayList` 的顺序就是层级，通用 XML 格式化或排序可能改变语义；
3. Editor 保存时可能补默认值、规范化字段和重新排版；
4. `package.xml` 还保存导出、九宫格、atlas、`Alone (NPOT)` 等资源元数据；
5. Button、ProgressBar、list、gear、relation、transition 不是简单矩形节点；
6. XML 只是 FairyGUI 设计源，Cocos 运行时消费的是 Editor 发布的 `.bin` 和纹理，不直接加载这些 XML；
7. FairyGUI 并未把工程 XML 承诺为长期稳定的外部交换协议，升级 Editor 时必须做兼容性金样测试。

因此浏览器编辑器需要一个稳定、可版本化、可校验的中间模型。第一版让 `layout.json` 做这个模型，再将它编译
成限定范围的 FairyGUI XML，是风险最低的方案。

## 4. 总体架构

```text
批准的目标效果图 + 分层母版 / 独立透明件 / 字体与图标
                         │
                         ▼
              本地浏览器 UI Studio
    图层树、拖拽、缩放、吸附、pivot、热区、九宫格、
    relation、controller/page、状态切换、安全区、差异预览
                         │ 保存
                         ▼
        *.layout.json + ids.lock.json
             唯一布局真源    稳定 ID 真源
                         │
                         ▼
              fgui-layout-compiler
        ┌────────────────┼─────────────────┐
        ▼                ▼                 ▼
  review.svg       generated/*.png   FairyGUI 设计源
  annotation.png   composite.png     package.xml 受控合并
  diff.png         compile-report    Generated.xml
        └────────────────┼─────────────────┘
                         ▼
              FairyGUI Editor 整包重载
          临时副本保存往返验证 + 正式工程发布
                         │
                         ▼
         Idle.bin + atlas*.png + 独立纹理
                         │
                         ▼
                 Cocos Creator 导入
                         │
                         ▼
        runtime.png + 结构检查 + 像素差异报告
```

这条链路不需要自行伪造 `.bin`、atlas 坐标、trim/rotation 或 Creator `.meta`。这些仍由各自的官方工具负责。

## 5. 文件职责与所有权

| 文件/目录 | 职责 | 所有者 | 是否允许直接人工编辑 |
| --- | --- | --- | --- |
| 分层 PSD/PSB/SVG、完整 RGBA 源件 | 像素、美术造型和透明度真源 | 美术 | 允许 |
| `main.target.approved.png` | 人工批准的目标视觉 | 审稿流程 | 仅重新审稿后替换 |
| `*.layout.json` | 节点树、坐标、层序、资源、热区、状态和布局真源 | UI Studio/开发者 | 允许，推荐通过 Studio |
| `ids.lock.json` | stable key 到 FairyGUI ID 的永久映射 | 编译器 | 不允许手改；只追加 |
| `*.review.svg` | 浏览器画布和审稿投影 | 编译器 | 不允许；修改会被重生成覆盖 |
| `*.annotation.png` | 带坐标、热区、pivot 和安全区的审稿图 | 编译器 | 不允许 |
| `generated/*.png` | FairyGUI 的运行切图 | 编译器 | 不允许 |
| `*.composite.png` | 用切图和布局重新合成的设计预览 | 编译器 | 不允许 |
| `IdleSceneGenerated.xml` | 机器拥有的 FairyGUI 子组件 | 编译器 | 不允许 |
| `IdleMain.xml` | 人工维护的页面外壳和复杂业务组件 | FairyGUI Editor | 只在 Editor 中编辑 |
| `package.xml` | FairyGUI 包数据库 | Editor + 生成器白名单合并 | 不手改生成器登记区 |
| `.bin`、atlas | FairyGUI 正式运行发布物 | FairyGUI Editor | 不允许手工生成或修改 |
| Creator `.meta` | Creator 资源身份与导入信息 | Cocos Creator | 不允许伪造 |
| `*.runtime.png` | Cocos/FairyGUI 实际运行截图 | 验收流程 | 运行时生成 |

当前 [FairyGUI 资源约束](apps/art/fairygui/README.md) 规定 XML 只能通过 FairyGUI Editor 修改。实施本方案前，
项目负责人需要对明确命名的 machine-owned XML 授权窄化例外。例外只允许编译器整文件生成指定组件，以及通过
AST 合并 `package.xml` 中由它拥有的条目；不授权开发者手工编辑 XML，也不允许覆盖 Editor-owned 子树。

## 6. 推荐目录

以下目录是建议目标，不表示当前已经存在：

```text
docs/undergroundIdle/art/production/main_v01/
├─ source/
│  ├─ main.target.approved.png
│  ├─ master.psb                         # 可选的分层母版
│  └─ layers/                            # 完整 RGBA 层和独立状态件
├─ fgui/
│  └─ IdleSceneGenerated.layout.json     # 唯一布局/装配真源
└─ review/
   ├─ IdleSceneGenerated.review.svg
   ├─ IdleSceneGenerated.annotation.png
   ├─ IdleSceneGenerated.composite.png
   ├─ IdleSceneGenerated.diff.png
   └─ compile-report.json

apps/art/fairygui/layout/idle/
└─ ids.lock.json

apps/art/fairygui/assets/Idle/
├─ package.xml
├─ IdleMain.xml                          # Editor-owned 外壳
├─ IdleSceneGenerated.xml                # machine-owned 子组件
└─ generated/
   └─ *.png                              # machine-owned 运行切图

apps/Cocos/assets/resources/ui/
├─ Idle.bin                              # FairyGUI Editor 发布
├─ Idle_atlas*.png                       # FairyGUI Editor 发布
└─ *.meta                                # Creator 导入时生成
```

FairyGUI 工程继续沿用仓库现有的 `apps/art/fairygui/FairyGUI.fairy` 和 `settings/`，不创建第二套工程级配置。
尤其是 `MatchWidth` 属于现有 `settings/Adaptation.json` 的工程适配设置；layout 中只能声明期望值并校验，编译器
不得因某个组件的输入而擅自修改全局适配配置。

`IdleMain.xml` 首期只引用一个 `IdleSceneGenerated` 子组件。业务文字、复杂 Button、ProgressBar、list、transition
和控制器先留在外壳中由 Editor 管理；等 XML 往返稳定后，再逐步扩大可生成范围。

注意：FGUI XML 本身不“包含一个 PNG 文件夹”。准确关系是：

- `package.xml` 登记 PNG、组件和稳定资源 ID；
- 组件 XML 用 `src/pkg` 引用资源，并定义节点树、坐标和状态；
- `generated/*.png` 是设计源资源；
- FairyGUI Editor 决定发布时的 atlas 分页、trim、旋转和独立纹理；
- Cocos 只接收发布后的 `.bin`、atlas 和必要独立纹理，不接收审稿 SVG 与目标大图。

## 7. `layout.json` 最小契约

第一版 Schema 至少需要以下内容：

- Schema 版本、包名、组件名和所有权；
- `sourcePx` 与 `logicalPx` 两套显式坐标空间；
- 设计尺寸、对工程适配设置的断言、安全区策略；
- 源文件路径、尺寸和 SHA-256；
- 资源来源模式、裁切框、Alpha bbox、padding、source anchor、九宫格、`exported` 和 atlas 策略；
- 节点 stable key、类型、名称、父子关系、矩形、层序、显隐和 touchable；
- controller、page、gear、relation；
- hotspot、mask、文本槽和命名绑定；
- 默认、满仓、锁定、异常等验收场景；
- 允许忽略像素差异的动态区域 mask。

示例：

```json
{
  "$schema": "../../../../../../tools/fgui-layout-compiler/schema/ui-layout.schema.json",
  "schemaVersion": 1,
  "canvas": {
    "logicalSize": [750, 1624],
    "sourceSize": [1500, 3248],
    "origin": "top-left",
    "adaptationAssert": {
      "mode": "MatchWidth"
    }
  },
  "package": {
    "stableKey": "idle.package",
    "name": "Idle",
    "idSource": "editorSeeded"
  },
  "component": {
    "stableKey": "idle.scene.main.generated",
    "name": "IdleSceneGenerated",
    "ownership": "machine",
    "exported": false
  },
  "assets": [
    {
      "stableKey": "idle.asset.collect.normal",
      "source": "../source/layers/collect-normal.png",
      "sourceMode": "copy",
      "runtimeSize": [262, 132],
      "sourceAnchorNormalized": [0.5, 0.5],
      "nineSliceInsets": [28, 24, 28, 24],
      "atlas": "default",
      "exported": false
    }
  ],
  "nodes": [
    {
      "stableKey": "idle.node.collect",
      "type": "image",
      "name": "img_collect",
      "asset": "idle.asset.collect.normal",
      "rect": [476, 226, 262, 132],
      "pivotNormalized": [0.5, 0.5],
      "pivotAsAnchor": false,
      "zOrder": 700,
      "touchable": false
    }
  ],
  "controllers": [],
  "relations": [],
  "hotspots": [],
  "textSlots": [],
  "scenarios": [
    {
      "name": "default",
      "controllerPages": {}
    }
  ]
}
```

正式 Schema 需要禁止未知字段或对未知字段给出明确兼容策略，所有路径必须限定在批准的资源根目录内，以防路径
穿越或把非 UI 文件带入发布物。

示例中的 PNG 是 `image` 资源，不能作为 FairyGUI `component` 引用。真正的按钮必须引用一个 Button 组件资源，
或由 Editor-owned 外壳叠加独立热区。正式可由代码创建的 `IdleMain` 必须 `exported: true`；生成子组件若只由
`IdleMain` 内部引用，可以不直接导出，只有代码需要直接 `createObject` 时才将它导出。

该示例只生成 `img_collect` 视觉节点，真正响应点击的 `btn_collect` 首期留在 Editor-owned `IdleMain` 并覆盖同一
矩形。Schema 中不能用自定义 `action` 字段假装它会自动成为 FairyGUI 事件；若以后把交互节点也放进生成子组件，
必须使用仓库允许的 `go_*`/`btn_*` 前缀，并先实现和验证嵌套路径绑定或事件转发契约。

`sourceAnchorNormalized` 表示裁切前源件的美术锚点；`pivotNormalized` 和 `pivotAsAnchor` 表示 FairyGUI 子节点
语义。编译器必须明确输出 XML 的 `anchor`，或在 `pivotAsAnchor=false` 时把位置回算为左上角坐标，禁止只写
pivot 数值而不定义 `xy` 的含义。

## 8. SVG 的正确定位

浏览器 Studio 可以用 SVG DOM 作为交互画布，因为它天然支持分组、选择、矩形、辅助线、事件和清晰缩放。
每个画布节点使用 `data-stable-key` 映射回 JSON，例如：

```xml
<g id="btn_collect" data-stable-key="idle.node.collect">
  <image href="generated/collect-normal.png" x="476" y="226" width="262" height="132"/>
  <rect data-role="hit-area" x="476" y="226" width="262" height="132"/>
</g>
```

拖动、缩放、排序或修改属性时，Studio 应更新内存中的 `layout.json`，再重新渲染 SVG；保存目标也是 JSON，
不是 SVG 文件本身。如此可避免 Illustrator、Inkscape 等工具重写 ID、transform、CSS 或 DOM 结构后破坏
FairyGUI 语义。

如果以后确实需要导入人工修改的 SVG，只接受严格子集：

- 保留 `data-stable-key`；
- 仅导入 x/y/width/height、显隐和 DOM 顺序；
- 仅允许可归一化的 translate/scale；
- controller、gear、relation、九宫格、资源策略仍以 JSON 为准；
- 缺失 key、任意 CSS、滤镜、路径变形或复杂矩阵直接拒绝导入。

## 9. 浏览器 UI Studio 的功能范围

首版推荐四区布局：左侧图层树、中间 750×1624 画布、右侧属性面板、底部状态/差异工具栏。

必要能力包括：

- 图层选择、锁定、显隐、分组、排序和重命名；
- 拖拽、缩放、数值输入、网格与边缘吸附；
- safe area、设计分辨率和不同屏幕比例预设；
- pivot、源裁切框、Alpha bbox、九宫格保护区可视化；
- 热区与视觉边界分别显示；
- controller/page 切换和 gear 预览；
- relation 约束编辑；
- 文本槽长数字、长中文、英文和缺字测试；
- target、composite、runtime、diff 四态切换；
- 每次保存带 revision/hash，冲突时拒绝覆盖；
- 撤销/重做和确定性格式化。

Studio 只能暴露 FairyGUI 可落地的语义子集。不能允许任意 CSS、浏览器滤镜或 Web 字体效果，否则网页预览
正确，FairyGUI/Cocos 运行时却无法复现。

## 10. 切图与图像生成规则

建议支持以下显式来源模式：

| 模式 | 用途 |
| --- | --- |
| `copy` | 直接复制批准的独立 RGBA 文件 |
| `fullCanvas` | 保持与母版同画布，适合固定背景或叠加层 |
| `alphaBBox` | 按可见 Alpha 包围盒裁切，并记录源锚点 |
| `crop` | 使用人工声明的矩形裁切 |
| `mask` | 用批准的 mask 从源层导出 |
| `nineSlice` | 导出九宫格源图并校验保护区 |

规则：

1. 不允许从扁平目标图伪造被遮挡对象的透明件；
2. 输出 PNG 保留 Alpha，不做有损压缩；
3. `alphaBBox` 必须记录裁切前原点偏移，保证 pivot 和画面位置不漂移；
4. 九宫格边界必须落在尺寸内，且四个角不能被拉伸；
5. 同一输入与 Schema 重复编译必须得到字节一致或语义一致的结果；
6. 所有源文件都记录 SHA-256，源变化而 Schema 未确认时编译失败；
7. 所有输出先写临时目录，完整校验通过后再原子替换正式目录；
8. 删除的生成资源通过清单精确清理，不能用宽泛目录删除命令。

## 11. 稳定 ID

FairyGUI 的 package、package item、child 和 controller page ID 必须稳定。图片与组件都属于
`package.xml` 的 package item，不应再人为拆成互不相干的 “resource ID” 和 “component ID” 命名空间。
不能根据数组下标、显示名称、当前文件顺序或随机数在每次编译时重新生成。

`ids.lock.json` 保存 `stableKey → FairyGUI ID` 映射，并遵守：

- 首次出现时分配，之后永久保持；
- 移动、重排和改显示名称不改变 ID；
- 删除后记录 tombstone，旧 ID 永不复用；
- stable key 本身不可随意重命名，必须通过显式迁移；
- package 或 package item ID 意外变化属于阻断错误；
- relation target、gear controller/page 和跨组件引用必须全部解析成功；
- lock 文件只追加机器生成条目，编译器拒绝不合法的人工改写。

示意：

```json
{
  "schemaVersion": 1,
  "entries": {
    "idle.package": "<editor-generated-package-id>",
    "idle.scene.main.generated": "cmp001",
    "idle.asset.collect.normal": "img001",
    "idle.node.collect": "n001",
    "idle.controller.view.page.ready": "0"
  },
  "tombstones": {}
}
```

首次建立 `Idle` 包时，先由 FairyGUI Editor 创建空包，再把 `<packageDescription id="...">` 的真实值写入 lock；
编译器只能校验和复用，不能重算。`generated/` 等目录也要登记为 folder item，但现有 FairyGUI 工程中的 folder
ID 是 `/RGBA/`、`/Login/1/` 这类规范化完整路径：它应由路径确定并校验，移动或改名时执行显式路径迁移，
不进入永久 tombstone ID lock。

package item 可以使用便于阅读的 ID 前缀，但其唯一性和引用校验必须覆盖整个 FairyGUI 包。

## 12. FairyGUI XML 生成边界

首版编译器只支持白名单节点和属性：

- `image`、`loader`、`graph`、`group`、`text`、`component`；
- 坐标、尺寸、pivot、显隐、touchable 和层序；
- 简单 controller/page、`gearDisplay`/`gearIcon`；
- relation；
- mask 和透明 hotspot；
- 已审核的资源引用。

Button、ProgressBar、list、transition 和复杂 controller/gear 首期使用两种方式之一：

1. 留在 Editor-owned 的 `IdleMain.xml`；
2. 通过仓库内已审核、带测试的 XML 模板实例化。

禁止第一版自由拼装所有 FairyGUI XML 特性。

XML 写入规则：

- machine-owned 组件由编译器整文件重建，禁止人工编辑；
- `package.xml` 必须做保留未知属性、节点和顺序的 AST 合并，不能用字符串替换；
- 保留 FairyGUI 实际字段拼写，例如已有文件中的 `extention`；
- `displayList` 严格按 Schema 层序输出；
- XML 属性值必须正确转义；
- 生成后先做引用闭包、唯一性、尺寸和资源存在性校验；
- FairyGUI Editor 在临时工程副本中保存后的 XML 与编译输出做结构化 diff，而不是只比较缩进；差异不能直接
  反写正式 machine-owned 文件。

长期生产版可以评估使用
[FairyGUI Editor 插件 API](https://www.fairygui.com/docs/editor/plugin)
让 Editor 插件创建/更新包与组件，以减少对未版本化 XML 细节的依赖；第一阶段仍可用受控 XML 生成完成概念验证。

## 13. PNG 验收不能只有一张

如果最终 PNG 和 XML 都从同一个 JSON/渲染器生成，再用这张 PNG 证明 XML 正确，只是在“同源自证”。至少要
区分三类 PNG：

| 文件 | 来源 | 验证目标 |
| --- | --- | --- |
| `main.target.approved.png` | 人工批准的视觉稿 | 产品/美术真正想要的效果 |
| `main.composite.png` | 切图按 `layout.json` 重新合成 | 切片、层序、坐标、pivot 和透明边能否重建目标 |
| `main.runtime.png` | Cocos/FairyGUI 实际运行截图 | XML、Editor 发布、atlas、九宫格、字体和运行时装配是否正确 |

形成两段独立差异：

```text
target ↔ composite  ：验证美术拆分和同源布局
composite ↔ runtime：验证 FGUI 编译、发布、Creator 导入和真实渲染
```

像素比较需要：

- 输出差异热力图、变化像素比例和最大颜色误差；
- 对随机粒子、动画、倒计时、网络文字等动态区使用显式 mask；
- 对静态节点同时做结构化精确比较，不能只依赖相似度阈值；
- 字体、抗锯齿、采样差异采用经过基线验证的小容差；
- 每个重要 controller 场景分别截图，一张默认态截图不能覆盖全部状态。

IdleMain 至少应覆盖默认、满仓、运输瓶颈、深层锁定/解锁、异常遮罩、三页签和两组安全区场景；完整矩阵可参考
[IdleMain FairyGUI 装配契约](docs/undergroundIdle/09-fairygui-idlemain-assembly.md)。

## 14. 编译与验证流程

单次保存/编译建议按以下顺序执行：

1. 解析并用 JSON Schema 校验 `layout.json`；
2. 校验源文件路径、尺寸、Hash、颜色模式和 Alpha 要求；
3. 读取并校验 `ids.lock.json`，只为新 stable key 分配 ID；
4. 计算裁切、pivot、九宫格、层序和引用图；
5. 在临时目录生成切片 PNG、review SVG、annotation/composite PNG 和 XML；
6. 校验所有资源与节点引用闭包；
7. 对 `package.xml` 执行白名单 AST 合并；
8. 生成 `compile-report.json`；
9. 再用同一输入编译一次，执行 zero-diff 确定性检查；
10. 全部通过后原子替换 machine-owned 正式文件；
11. 把完整 FairyGUI 工程复制到临时目录，由 Editor 重载并保存，再对临时输出做 XML 结构化往返 diff；临时
    保存结果只用于发现规范化或语义差异，不能反写正式 machine-owned XML；
12. 由 Editor 正式发布 `.bin` 和 atlas；
13. 执行现有 codegen、manifest、FGUI 测试和同步验证；
14. 从 Cocos Dashboard 启动 Creator，获取真实运行截图并生成最终 diff 报告。

任何源缺失、Hash 不符、裁切越界、ID 冲突、九宫格非法、引用悬空、往返语义变化或运行截图超阈值，都必须
在写入正式产物前失败，不能留下“半套 XML + 半套 PNG”。

## 15. 计划命令

下面的 `ui:studio`、layout 编译和差异命令是建议新增能力，当前尚不存在：

```bash
npm run ui:studio -- \
  --layout docs/undergroundIdle/art/production/main_v01/fgui/IdleSceneGenerated.layout.json

npm run compile:fgui-layout -- \
  --layout docs/undergroundIdle/art/production/main_v01/fgui/IdleSceneGenerated.layout.json

npm run verify:fgui-layout -- \
  --layout docs/undergroundIdle/art/production/main_v01/fgui/IdleSceneGenerated.layout.json

npm run diff:fgui-layout -- \
  --layout docs/undergroundIdle/art/production/main_v01/fgui/IdleSceneGenerated.layout.json \
  --actual path/to/main.runtime.png
```

FairyGUI Editor 发布完成后，衔接仓库已有流程：

```bash
npm run codegen:fgui -- Idle IdleMain
node scripts/fgui-manifest.mjs --write
npm run test:fgui
npm run verify:fgui
npm run sync:client
npm run typecheck:client
npm run test:client
npm run verify:sync
```

`codegen:fgui` 的职责仍是从已有组件 XML 生成 TypeScript 绑定，不负责生成 XML、切图、`.bin` 或 atlas。首期
业务代码创建和绑定的是正式导出的 `IdleMain`；`IdleSceneGenerated` 只是其内部子组件，不为它生成独立 View。

## 16. 非状态性的实施顺序摘要

本节只说明依赖顺序，不记录任务状态、完成百分比或验收证据。实际阶段状态继续以
[图片标注到 FairyGUI 自动编译滚动实施计划](docs/undergroundIdle/10-image-to-fairygui-live-plan.md) 和根
`plan-v4.md` 为唯一真相；下面故意不沿用 P0～P7 编号，避免形成第二份状态计划。

### 步骤 A：冻结边界和金样

- 明确 machine-owned 与 Editor-owned 文件范围；
- 固定 FairyGUI 版本、设计分辨率和发布设置；
- 选一个静态小组件作为最小金样；
- 保存 Editor 手工创建的 XML、发布物和 Creator 截图作为对照；
- 为自动生成 XML 取得项目内明确授权。

### 步骤 B：Schema 与稳定 ID

- 实现 `ui-layout.schema.json`；
- 实现 source hash、坐标空间和引用校验；
- 实现 append-only `ids.lock.json`、tombstone 和迁移测试；
- 建立成功和失败 fixture。

### 步骤 C：浏览器编辑与审稿投影

- 实现 SVG 画布、图层树和属性面板；
- 所有编辑保存到 JSON；
- 生成 review SVG、annotation PNG 和状态预览；
- 实现并发 revision/hash 和撤销/重做。

### 步骤 D：确定性切图与 XML 编译

- 实现六种来源模式、pivot 和九宫格；
- 只支持静态白名单节点；
- 生成 machine-owned 组件；
- 受控合并 `package.xml`；
- 实现临时目录、原子替换和双编译 zero-diff。

### 步骤 E：Idle 子组件试点

- 生成 `IdleSceneGenerated.xml`；
- 在 Editor-owned `IdleMain.xml` 中人工引用该子组件；
- 在临时工程副本中完成 FairyGUI Editor 重载、保存往返，并从正式工程执行单包发布；
- 处理 Editor 规范化差异，禁止隐藏 XML-only 修改。

### 步骤 F：仓库门禁

- 接入 `codegen:fgui`、manifest 和现有测试；
- 增加悬空引用、ID 漂移、旧资源残留、发布物新鲜度检查；
- 明确提交闭包：FairyGUI 设计源 PNG/XML、`package.xml`、`ids.lock.json`、Editor 发布的 `.bin`/atlas、Creator
  生成的 `.meta` 和更新后的 manifest 均随变更提交；只忽略工具缓存、临时编译目录和明确不作为交付物的审稿
  临时文件。

### 步骤 G：Creator 真实视觉验收

- 从 Cocos Dashboard 启动 Creator；
- 对状态矩阵截图；
- 生成 target/composite/runtime 两段 diff；
- 固化结构阈值、像素阈值和动态 mask。
- 补齐并测试 safeTop/safeBottom 到 R1～R6、场景 mask 与点击热区的统一换算；当前
  [FguiView.ts](apps/client/src/view/FguiView.ts) 只有 top inset 能力，未实现 bottom inset 适配，因此在补齐前
  不能宣称“两组安全区验收”已经成立。

### 步骤 H：扩展复杂组件

- 依次增加 relation、text slot、Button、ProgressBar、controller/gear、list 和 transition；
- 每增加一类 XML 语义，都先增加 Editor round-trip 金样与 Creator 运行测试；
- 未通过兼容验证的能力继续留在 Editor-owned 外壳。

## 17. 完成口径

只有同时满足以下条件，才可以宣称“效果图可像网页一样编辑并直接投入 FairyGUI 运行链路”：

- 浏览器 Studio 编辑后只产生一份权威 `layout.json`；
- 相同输入连续编译两次，受控产物 zero-diff；
- stable key 重排、改名和增删不会让既有 FairyGUI ID 漂移；
- `main.target.approved.png` 能由切片和布局在容差内重建；
- FairyGUI Editor 能完整重载生成工程，无丢失资源和悬空引用；
- 临时工程副本中的 Editor 保存往返没有未解释的语义变化，且临时保存结果未覆盖正式 machine-owned XML；
- `.bin` 和 atlas 由 Editor 正式发布，并通过现有 manifest/FGUI 门禁；
- Cocos Creator 能真实加载页面；
- 默认态和关键 controller 状态都通过结构检查与视觉差异验收；
- safeTop 与 safeBottom 都经过运行时实现和状态矩阵验证，而不只是 Studio 预设；
- 文档、命令和仓库状态明确区分“已实现”与“计划中”。

## 18. 不采用的方案

### 18.1 SVG、XML、PNG 三份都允许独立编辑

不采用。一个按钮的位置和状态会迅速出现三份不同答案，双向同步成本高于编辑器本身。

### 18.2 直接把 FairyGUI XML 当浏览器 DOM

不作为首选。仍需自行实现包 ID、gear、relation、模板和 Editor 规范化语义，且容易与 Editor 争夺所有权。

### 18.3 从扁平 `main.png` 自动切出全部运行资源

不采用。遮挡、背景污染、透明度和缺失状态不可逆；只允许对确认为整块背景或无需透明的区域做显式裁切。

### 18.4 自制 `.bin`、atlas 或 Creator `.meta`

不采用。这些分别属于 FairyGUI Editor 和 Cocos Creator 的职责，自制结果缺乏兼容性保证。

## 19. 最终推荐

本项目最适合的完整交付不是只有 `main.svg + FairyGUI XML + main.png`，而是：

```text
分层美术源 / 独立 RGBA 源件
IdleSceneGenerated.layout.json      # 唯一布局与行为真源
ids.lock.json                       # 稳定 ID 真源
IdleSceneGenerated.review.svg       # 浏览器编辑/审稿投影
generated/*.png                     # FairyGUI 运行切图
IdleSceneGenerated.xml              # machine-owned 设计源
package.xml                         # 白名单受控登记
main.target.approved.png            # 人工批准目标
main.composite.png                  # 同源合成验证
main.runtime.png                    # Creator 最终运行证据
Idle.bin + atlas*.png               # Editor 正式发布物
```

首期采用“Editor-owned 页面外壳 + machine-owned 生成子组件”，而不是一次覆盖整个现有页面。先打通静态图层、
热区、pivot、九宫格、稳定 ID、Editor 往返和 Creator 截图，再逐步加入复杂控件与状态。这样既能获得网页式编辑
体验，又能保持 FairyGUI 的可视化维护能力和 Cocos 运行链路的可靠性。

## 20. 参考资料

- 仓库：[图片标注到 FairyGUI 自动编译滚动实施计划](docs/undergroundIdle/10-image-to-fairygui-live-plan.md)
- 仓库：[IdleMain FairyGUI 装配契约](docs/undergroundIdle/09-fairygui-idlemain-assembly.md)
- 仓库：[FairyGUI 资源维护约束](apps/art/fairygui/README.md)
- FairyGUI 官方：[包与 `package.xml`](https://www.fairygui.com/docs/editor/package)
- FairyGUI 官方：[发布](https://www.fairygui.com/docs/editor/publish)
- FairyGUI 官方：[组件](https://www.fairygui.com/docs/editor/component)
- FairyGUI 官方：[控制器](https://www.fairygui.com/docs/editor/controller)
- FairyGUI 官方：[关联](https://www.fairygui.com/docs/editor/relation)
- FairyGUI 官方：[编辑器插件](https://www.fairygui.com/docs/editor/plugin)
