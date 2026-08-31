# 《Underground Idle》图片标注到 FairyGUI 自动编译滚动实施计划（Living Plan）

> [返回总目录](README.md) · [上一篇：UndergroundIdleMain FairyGUI 装配契约](09-fairygui-undergroundidle-main-assembly.md)
>
> 文档版本：0.1<br>
> 首次编写：2026-08-30<br>
> 最近更新：2026-08-30<br>
> 当前状态：`初始实施计划 / 全部阶段未开始`<br>
> 下一阶段：P0 基线审查与边界冻结<br>
> 目标：下一批页面在生成或确认图片的同一轮中，同时得到机器标注、生产切图和 FairyGUI 设计源 XML

## 1. 目标与完成口径

本计划定义一条待首次实现的“标注即编译”流水线，用于把未来的效果图、SPEC 标注、ART manifest、切图与
FairyGUI 装配收口到同一机器真源：

```text
效果图 / 分层母版 / 独立透明件
  → 同批写入机器可读 layout.json
  → 自动生成审稿标注图
  → 确定性切图、透明边与 pivot 归一化
  → 稳定 ID 分配
  → 生成 machine-owned FairyGUI 组件 XML
  → 受控合并 package.xml
  → FairyGUI Editor 重载并发布 .bin / atlas
  → codegen、自动门禁
  → Cocos Dashboard 启动 Creator 完成真实预览
```

“下一批可以直接这样做”只有在本计划的 Gate C 通过后才成立。统一 Schema、ID lock、切图入口、XML 编译器、
Idle FairyGUI 真源/发布物与业务接线均尚未实施；本文只定义目标、边界、阶段与验收方法，不能作为自动化可用
或界面已经实现的证据。

### 1.1 一次任务应交付什么

每次页面或场景视觉批次至少同时交付：

1. 审稿效果图或分层母版；
2. `*.layout.json`：坐标、资源、节点、状态和交互的唯一机器真源；
3. `*_annotation.png`：由 JSON 反向绘制的审稿标注图，不是坐标真源；
4. 运行 PNG：透明切图、同画布层、九宫格源图或已批准文件的无损副本；
5. `ids.lock.json`：package、resource、component、child、controller page 的稳定 ID；
6. FairyGUI `package.xml` 受控资源登记与 machine-owned 组件 XML；
7. 编译报告：源图哈希、裁切框、可见 Alpha bbox、输出尺寸、pivot、引用闭包和告警；
8. FairyGUI Editor 发布结果及 Creator 真实预览验收记录。

### 1.2 明确不自动完成

- 不从画有矩形和文字的标注 PNG 做 OCR，再猜坐标或节点语义；
- 不从一张扁平效果图直接裁出角色、按钮、建筑等被遮挡或需要透明背景的生产件；
- 不猜 controller、page、gear、relation、热区、文本槽和安全区适配；这些必须在 Schema 中显式声明；
- 不伪造 FairyGUI `.bin`、atlas、trim、rotation、分页或 `Alone (NPOT)` 发布结果；
- 不由脚本创建或伪造 Creator `.meta`；
- 不通过命令行启动 Cocos Creator，Creator 必须由 Cocos Dashboard 启动；
- 不让生成器与 FairyGUI Editor 同时成为同一个 XML 文件的写入真源。

## 2. 初始输入与实施缺口

| 能力 | 初始输入 | 首次实施任务 |
| --- | --- | --- |
| 分层与坐标 | 07～09 规定尺寸、pivot、九宫格和装配目标 | 建立统一 v1 Schema，并用首次批准的分层源验证 |
| 切图 | 本文规定 Alpha bbox、padding、pivot 和 source anchor 规则 | 实现统一入口、原子写入、来源白名单和编译报告 |
| FairyGUI 源 | 09 规定拟定装配契约 | 创建 `UndergroundIdle/package.xml`、组件 XML、运行 PNG，并由 Editor 首次发布 |
| 稳定引用 | 本文规定稳定 ID 原则 | 首次创建 package/resource/component/child/page ID 后写入 append-only lock |
| View 绑定 | 仓库通用 codegen 能力需要在 P0 盘点 | 验证或补齐 XML → TypeScript，并接入生成 XML |
| 发布闭包 | 仓库通用 manifest 能力需要在 P0 盘点 | 验证设计源与 Editor 发布物闭包；`.bin` 必须由 Editor 发布 |
| 最终预览 | 08～09 提供验收矩阵 | 首次完成 Editor round-trip 与 Dashboard/Creator 状态矩阵验收 |

P0 应先盘点可复用的通用工具；只有经过验证的能力才接入，不另建第二套互不兼容的资源规则。

## 3. 真源、所有权与建议目录

### 3.1 真源优先级

```text
玩法与交互：02～04
视觉语言：07～08
UndergroundIdleMain 拟定装配契约：09
生成节点、坐标和切图：*.layout.json
稳定 FairyGUI ID：ids.lock.json
生成物：运行 PNG + machine-owned XML
发布物：FairyGUI Editor 生成的 .bin / atlas
最终实机表现：Dashboard 启动的 Creator 预览
```

标注图必须由 `layout.json` 生成。禁止先手动画标注图、再把肉眼读出的数字回填 JSON，否则审稿图和实际编译
输入会再次形成双真源。

### 3.2 计划新增的工具和文件

以下路径全部属于实施目标，不表示文件或目录已经创建：

```text
tools/fgui-layout-compiler/
├─ cli.ts
├─ schema/ui-layout.schema.json
├─ readLayout.ts
├─ sliceAssets.ts
├─ idLock.ts
├─ compilePackage.ts
├─ compileComponent.ts
├─ renderAnnotation.ts
├─ validate.ts
└─ *.test.ts

docs/undergroundIdle/art/production/main_v01/fgui/
├─ UndergroundIdleSceneGenerated.layout.json
├─ UndergroundIdleSceneGenerated.annotation.png
└─ compile-report.json

apps/art/fairygui/layout/idle/
└─ ids.lock.json

apps/art/fairygui/assets/UndergroundIdle/
├─ package.xml
├─ UndergroundIdleMain.xml                    # Editor-owned 外壳，首期不整文件覆盖
├─ UndergroundIdleSceneGenerated.xml          # machine-owned
└─ generated/                      # machine-owned 运行 PNG
```

首期先生成 `UndergroundIdleSceneGenerated.xml`，由人工维护的 `UndergroundIdleMain.xml` 继续持有业务文字、按钮、controller 和复杂
交互。新页面如果从第一天就以 Schema 为真源，可以让生成器独占整个页面 XML；已有页面只有在 Editor 往返稳定
后才迁移，禁止半自动地覆盖任意人工子树。

### 3.3 FairyGUI 文件授权

首次实施前必须由项目负责人对明确的 FairyGUI 文件范围给出写入授权。授权只解除相应 XML 的写入限制，不降低
[09 装配契约](09-fairygui-undergroundidle-main-assembly.md) 规定的 XML 解析、Editor 整项目重载、单包发布、codegen、契约
测试和 Creator 验收要求。生成器只能写 machine-owned 文件和白名单约束的 `package.xml` 条目，不能覆盖无关
人工节点。

未取得明确授权时，只生成 `layout.json`、标注图、切图和待应用的 XML 变更报告，不直接写 FairyGUI 真源。

## 4. `layout.json` 最小契约

### 4.1 坐标约定

- `sourcePx`：源图真实像素，例如主界面 2×母版 `1500×3248`；
- `logicalPx`：FairyGUI 设计尺寸，例如 `750×1624`；
- 原点固定为左上，x 向右、y 向下；
- 每个矩形必须注明属于 `sourcePx` 还是 `logicalPx`，禁止依赖隐式缩放；
- 节点层级以 Schema 数组顺序或显式 `zOrder` 为准，不能按名称排序；
- pivot 统一使用资源局部像素或 0～1 归一化值，并在字段名中明确单位。

### 4.2 示例骨架

下面仅定义字段形态，正式实现以 JSON Schema 和测试 fixture 为准：

```json
{
  "$schema": "../../../../../../tools/fgui-layout-compiler/schema/ui-layout.schema.json",
  "schemaVersion": 1,
  "package": {
    "name": "Idle",
    "id": "<allocate-on-first-generation>"
  },
  "component": {
    "stableKey": "undergroundIdle.scene.main.generated",
    "name": "UndergroundIdleSceneGenerated",
    "ownership": "machine",
    "designSize": [750, 1624]
  },
  "source": {
    "file": "../ug_main_master_v01.png",
    "space": "sourcePx",
    "size": [1500, 3248],
    "logicalSize": [750, 1624],
    "expectedSha256": "<required-at-compile-time>"
  },
  "assets": [
    {
      "stableKey": "undergroundIdle.scene.background",
      "name": "ug_main_00_background_v01",
      "sourceMode": "fullCanvas",
      "sourceRect": [0, 0, 1500, 3248],
      "output": "generated/ug_main_00_background_v01.png",
      "runtimeSize": [750, 1624],
      "pivotNormalized": [0, 0],
      "atlas": "alone_npot"
    },
    {
      "stableKey": "undergroundIdle.ui.panel.example",
      "name": "ug_ui_panel_example_v01",
      "sourceMode": "alphaBBox",
      "sourceRect": [100, 200, 600, 320],
      "paddingPx": [24, 24, 24, 24],
      "output": "generated/ug_ui_panel_example_v01.png",
      "runtimeSize": [300, 160],
      "pivotNormalized": [0.5, 0.5],
      "nineSliceInsets": [36, 36, 36, 36],
      "atlas": "default"
    }
  ],
  "nodes": [
    {
      "stableKey": "undergroundIdle.node.background",
      "type": "image",
      "name": "img_background",
      "asset": "undergroundIdle.scene.background",
      "rect": [0, 0, 750, 1624],
      "zOrder": 0,
      "touchable": false
    }
  ],
  "controllers": [],
  "relations": [],
  "hotspots": [],
  "textSlots": []
}
```

### 4.3 Schema 必须覆盖的五层信息

| 层 | 必填信息 |
| --- | --- |
| 画布与来源 | 源文件、哈希、真实尺寸、逻辑尺寸、坐标系、缩放和来源级别 |
| 资产 | stable key、来源模式、crop/mask、trim、padding、pivot、anchor、运行尺寸、九宫格、atlas 策略、输出名 |
| 组件与节点 | stable key、类型、名称、xywh、z-order、group、资源/组件引用、touchable、fill、文本样式 |
| 行为 | controller、page、默认页、gear、relation、hotspot、list/defaultItem、ProgressBar/Button 模板 |
| 稳定 ID | package、resource、component、child、controller page 的永久映射和 tombstone |

仅有位置矩形时，只能生成静态 image/loader/graph。需要按钮、进度条、状态切换或安全区关系时，必须补齐行为层，
编译器不得根据节点名字自行猜测。

## 5. 切图规则

### 5.1 允许的来源模式

| `sourceMode` | 用途 | 规则 |
| --- | --- | --- |
| `copy` | 已批准独立 PNG | 校验哈希后无损复制，不重新编码 |
| `fullCanvas` | 背景、结构、灯光、前景遮挡等同画布层 | 保持完整画布，不 tight crop；可标为 `alone_npot` |
| `alphaBBox` | 已有真实透明 Alpha 的独立件 | 按可见 bbox + 显式 padding 裁切，并回算 pivot |
| `crop` | 确认没有背景污染、没有被其他对象遮挡的局部区域 | 只使用显式矩形，不自动扩大语义边界 |
| `mask` | 有独立 Alpha mask 或图层源的对象 | mask 必须是输入文件，不能由模型凭效果图猜测 |
| `nineSlice` | 严格组件源图 | 必须显式登记四边 inset，并校验中心可拉伸区大于零 |

### 5.2 扁平效果图的限制

如果角色、建筑、图标或按钮与背景已经合成，矩形裁切会带入背景像素，也无法恢复被遮挡部分。这种情况只能：

1. 使用原始分层母版或独立图层；
2. 重新生成单体透明件；
3. 使用人工提供并审核的 mask；
4. 将整层作为 `fullCanvas` 视觉层，而不是伪装成可复用透明件。

审稿用 `FX`、`SPEC`、`*_review.*`、contact sheet、带文字效果图和生成原稿默认禁止进入运行输出。

### 5.3 pivot 与位置回算

裁切后必须保持页面上的视觉锚点不漂移。紧凑切图可使用：

```text
nodeXY = sourceAnchorLogical
         - pivotPx × runtimeSize / outputSize
```

编译报告必须同时记录原始矩形、Alpha bbox、最终 crop、padding、输出尺寸、pivot 和页面 anchor，便于逐像素复核。

九宫格从四边 inset 转为 FairyGUI `scale9grid`：

```text
scale9grid = [
  left,
  top,
  sourceWidth - left - right,
  sourceHeight - top - bottom
]
```

## 6. FairyGUI ID 与 XML 编译规则

### 6.1 ID lock

`ids.lock.json` 必须 append-only：

- 若目标包在实施时已有真实 `package.xml`、组件 XML 和 controller pages，则先导入 ID；首次新建包则分配一次并立即锁定；
- 使用 stable key 查找 ID，不能用数组位置、文件顺序或可改名的展示名称重新计算；
- 新对象只分配未使用 ID；删除对象写入 tombstone，旧 ID 永不回收；
- 编译时检查重复、悬空引用和 lock 漂移；
- 仅重新排序节点不得改变任何既有 ID；
- package/resource ID 改变会破坏 `ui://`，必须作为阻断错误；
- group、relation target 和 gear page 最终都解析为锁定 ID。

UndergroundIdleMain 首次生成后必须增加精确节点 ID 契约测试；后续若迁移已存在页面，必须导入其真实 ID，而不是重新编号。

### 6.2 XML 所有权

- `UndergroundIdleSceneGenerated.xml` 等 machine-owned 文件允许整文件确定性重建；
- `UndergroundIdleMain.xml` 首期为 Editor-owned，只显式引用生成子组件，不做通用三方合并；
- `package.xml` 使用 XML AST 只增改本工具登记的 folder/component/image，保留未知属性、已有顺序、
  `alone_npot`、`scale9grid`、`exported` 和不透明元数据；
- FairyGUI 的实际字段名 `extention` 不得被“纠正”为 `extension`；
- `displayList` 顺序即 z-order，不能做字母排序；
- Button、ProgressBar、复杂 list、transition 和特殊资源首期只允许使用已审核模板，不开放任意生成；
- Editor 保存后的格式化或默认值变化必须进入 round-trip diff 审核，不能直接用 manifest `--write` 掩盖。

### 6.3 原子写入

编译器先在临时目录完成全部切图、XML 和引用校验，成功后再替换 machine-owned 输出。任一资源、ID 或 XML
校验失败时，不得留下半套输出，也不得修改 Editor-owned 文件。

## 7. 计划命令

以下命令是计划接口，需在 P1～P5 实现后才可使用：

```bash
# 生成审稿标注图、切图、ID lock、组件 XML，并受控更新 package.xml
npm run compile:fgui-layout -- \
  --layout docs/undergroundIdle/art/production/main_v01/fgui/UndergroundIdleSceneGenerated.layout.json

# 只检查 Schema、源哈希、切图漂移、ID 和 XML 引用，不写文件
npm run verify:fgui-layout -- \
  --layout docs/undergroundIdle/art/production/main_v01/fgui/UndergroundIdleSceneGenerated.layout.json

# XML → View 代码生成；P0 先确认仓库工具接口
npm run codegen:fgui -- UndergroundIdle UndergroundIdleSceneGenerated

# FairyGUI Editor 首次发布完成后执行仓库门禁
npm run test:fgui
npm run verify:fgui
npm run verify:sync
```

不得增加“命令行启动 Creator”的脚本。最终步骤是人工通过 Cocos Dashboard 启动 Creator 3.8.8。

## 8. 实时阶段计划

状态约定：`[x]` 已完成，`[~]` 进行中，`[ ]` 未开始，`[!]` 阻断。每次推进后更新本文“最近更新”、阶段状态、
证据和下一步；不能仅因文件存在就把 Gate 标为通过。

### P0：基线审查与边界冻结

- [ ] 盘点 ART manifest、切图工具、FairyGUI 工程、codegen 和 manifest 校验器；
- [ ] 用最小 fixture 验证设计源 XML 的可生成范围，并确认 `.bin`/atlas 只由 FairyGUI Editor 发布；
- [ ] 确认 Creator 只能通过 Cocos Dashboard 启动；
- [ ] 把扁平效果图和审稿标注图加入生产来源禁止清单；
- [ ] 人工批准“machine-owned 生成子组件 + Editor-owned 页面外壳”首期所有权模型；
- [ ] 审阅第 9 节任务提示词和 ImageGen 提示词模板。

Gate 0：工具盘点、所有权、授权与发布边界均有可复核记录。<br>
状态：`未开始`。

### P1：统一 Schema、fixture 与 ID lock 建立/导入

- [ ] 新增 `ui-layout.schema.json` 和 TypeScript 类型；
- [ ] 定义 source/logical 两套坐标、来源白名单和 SHA-256 锁定；
- [ ] 定义 asset、node、controller、gear、relation、hotspot 和 text slot；
- [ ] 为 ART-01、ART-03、ART-04、ART-06、ART-07 首次 manifest 编写适配器或样例；
- [ ] 创建新的 package/resource/component/child/page ID 并从第一次生成起锁定；若实施时存在真实目标包，
  则先显式导入其 ID，禁止根据文档推测 ID；
- [ ] 建立 append-only `ids.lock.json`、tombstone 和碰撞测试；
- [ ] 产出最小合法、完整合法和非法输入 fixtures。

Gate A：Schema 能完整表达一个静态页面、一个九宫格、一个热区和一组 controller/gear，重排 JSON 不改变 ID。<br>
状态：`未开始`。

### P2：确定性切图与标注图

- [ ] 实现 `copy/fullCanvas/alphaBBox/crop/mask/nineSlice`；
- [ ] 实现并测试 Alpha bbox、padding、pivot 和 source anchor 逻辑；
- [ ] 检查四角 Alpha、边缘污染、空图、越界 crop、输出重名和不允许来源；
- [ ] 从 JSON 生成带 stable key、矩形、锚点和 z-order 的审稿标注图；
- [ ] 输出 `compile-report.json` 与源/目标哈希；
- [ ] 使用临时目录和原子替换，失败不污染输出；
- [ ] 同输入重复运行得到字节一致 PNG 或受控的等价哈希。

Gate B1：首次制作的主界面代表性资源可由批准源确定性生成，位置、Alpha、pivot 和九宫格审计通过。<br>
状态：`未开始`。

### P3：稳定 ID 与 XML 编译

- [ ] 生成 machine-owned 组件的 controller 和有序 `displayList`；
- [ ] 支持 image、loader、graph、group、text slot 和白名单 component；
- [ ] 支持显式 relation、gearDisplay、gearIcon 及引用校验；
- [ ] 受控 AST 合并 `package.xml`，保留未知字段和已锁定资源 ID；
- [ ] 校验所有 `src + pkg`、`ui://`、group、relation target 和 gear page；
- [ ] 校验 gear pages/values 数量及 controller 归属；
- [ ] 添加 `--check` 漂移模式和确定性格式化测试。

Gate B2：连续编译两次零 diff；只改坐标不会改 ID；新增、删除、重排资源不会复用旧 ID。<br>
状态：`未开始`。

### P4：`UndergroundIdleSceneGenerated` 试点

- [ ] 在首次 UndergroundIdleMain 方案中选择纯视觉场景层作为试点，不先纳入业务 controller；
- [ ] 建立 `UndergroundIdleSceneGenerated.layout.json`，分配并锁定首次资源 ID；若目标包已有真实 ID 则先导入；
- [ ] 自动生成场景切图和 `UndergroundIdleSceneGenerated.xml`；
- [ ] 在 Editor-owned `UndergroundIdleMain.xml` 中只接入一个生成子组件实例；
- [ ] 对比 08～09 的拟定坐标、遮挡、热区和状态契约；
- [ ] 验证 Editor 打开、保存、重载后没有丢节点、修复提示或不可解释 diff。

Gate C：FairyGUI Editor round-trip 通过，并能按首次确认的 `Publish.json` 单包发布有效 `.bin` 与 atlas。<br>
状态：`未开始`。

### P5：命令、测试与仓库门禁

- [ ] 增加 `compile:fgui-layout` 和 `verify:fgui-layout`；
- [ ] 为 Schema、裁切、ID、package 合并、XML 引用和原子失败添加测试；
- [ ] 把生成组件接入 P0 验证通过的 `fgui-codegen`，缺失能力先补齐；
- [ ] 把 layout、ID lock、生成源和 Editor 发布物纳入 manifest 闭包；
- [ ] 验证 `test:fgui`、`verify:fgui`、`verify:sync` 和相关 typecheck；
- [ ] 记录生成文件与人工文件边界，防止格式化工具批量改写 Editor-owned XML。

状态：`未开始`。

### P6：Dashboard/Creator 验收

- [ ] FairyGUI Editor 完整重载并发布；
- [ ] 通过 Cocos Dashboard 启动 Creator 3.8.8；
- [ ] 等待 Creator 导入并生成/稳定 `.meta`；
- [ ] 验收 750×1624、安全区、长数字、遮挡、热区和主要状态；
- [ ] 检查图集黑边、透明污染、九宫格拉伸和 NPOT 独立纹理；
- [ ] 保存真实预览证据并更新本计划。

Gate D：Creator 真实预览与状态矩阵通过。至此可把本流程标记为“下一批默认可用”。<br>
状态：`未开始`。

### P7：扩展与迁移

- [ ] 用一个新页面验证整页 machine-owned XML；
- [ ] 评估是否迁移 UndergroundIdleMain 的 UI 容器和简单状态，不强制迁移复杂交互；
- [ ] 按实际需求增加 Button、ProgressBar、list、transition 白名单模板；
- [ ] 统一剩余 ART manifest，删除重复的人工复制步骤；
- [ ] 建立变更记录和 Schema 升级器，旧布局可继续重建。

状态：`未开始`，不阻断首期可用。

## 9. 下一批可直接复用的提示词

### 9.1 给 Codex 的整批执行提示词

替换尖括号变量后直接使用；如果本计划尚未通过 Gate C，提示词应先要求完成编译器，而不是假装命令已经存在。

```text
阅读 docs/undergroundIdle/README.md、07-art-direction.md、
08-main-screen-art-brief.md、09-fairygui-undergroundidle-main-assembly.md 和
10-image-to-fairygui-live-plan.md。

使用 $imagegen 基于 <参考图路径或已附图片> 制作 <页面/状态/资产批次>。本次把视觉生成、机器标注、
生产切图和 FairyGUI 设计源作为同一个交付批次，不在生成图片后再人工抄坐标。

固定参数：
- FairyGUI package：<package，例如 idle>
- machine-owned component：<组件名，例如 UndergroundIdleSceneGenerated>
- 逻辑画布：<宽×高，例如 750×1624>
- 源画布：<宽×高，例如 1500×3248>
- 视觉与交互真相：<文档/manifest 路径>
- 输出 layout：<*.layout.json 路径>
- 输出运行资源目录：<FairyGUI package 下的 generated/ 路径>

授权边界：实施前取得 FairyGUI 目标文件的明确写入授权；未授权时只输出待应用的 XML 变更报告，不直接修改
FairyGUI 真源。

执行要求：
1. 先冻结构图、状态语义和资产清单，再生成效果图或独立透明件。
2. 同步写机器可读 layout.json；坐标、crop、pivot、运行尺寸、九宫格、z-order、group、热区、
   controller/page/gear/relation 均使用显式字段。标注 PNG 必须由 layout.json 生成，禁止 OCR 反推。
3. 扁平效果图中有背景污染、遮挡或缺失像素的对象不得直接矩形裁切；改用分层源、独立透明件或显式 mask。
4. 使用稳定 ids.lock.json；若目标包有真实 ID 则导入复用，否则首次分配后立即锁定；禁止按数组下标重编号或回收 ID。
5. 自动输出经过 Alpha、尺寸、pivot、九宫格和来源白名单检查的切图，并生成 machine-owned FairyGUI XML；
   package.xml 只做受控 AST 合并，不能覆盖未知属性或非本工具所有的资源配置。
6. 不生成或伪造 .bin、atlas、Creator .meta；这些由 FairyGUI Editor 发布和 Dashboard 启动的 Creator 导入。
7. 运行 verify:fgui-layout、codegen、test:fgui、verify:fgui、verify:sync；记录未通过项，不能用更新哈希掩盖错误。
8. 输出本批的源图、layout、标注图、切图、XML、编译报告、人工 Editor 步骤和 Creator 验收清单。
9. 不通过命令行启动 Cocos Creator。
10. 不 commit，不 push。
```

### 9.2 ImageGen：整页视觉探索提示词

整页结果只用于冻结构图和视觉方向，不直接切成生产资产：

```text
Use case: stylized-concept
Asset type: full-page mobile game visual target, review-only
Primary request: Create the approved <PAGE_AND_STATE> for Underground Idle at a strict portrait composition matching a 750×1624 logical canvas. Use the supplied approved main-screen baseline and style tile only as visual references.
Layout: preserve the documented fixed regions, safe areas, interaction hierarchy, stage viewport and empty runtime-text slots exactly; keep all important subjects inside their declared rectangles.
Style/medium: original hand-painted 2D game art; chunky readable silhouettes; dark charcoal rock, timber, old steel and restrained brass; strong dark outlines; upper-left key light; controlled warm amber actions and restrained cool depth light.
State: clearly communicate <STATE_DESCRIPTION> without moving fixed UI regions or changing semantic hotspots.
Runtime text: leave every title, number, price, timer, badge and Chinese text slot blank for FairyGUI runtime text.
Constraints: one coherent review image; no fake text, gibberish, logo, watermark, device frame, notch, gesture bar, debug guides or coordinate labels.
Avoid: isometric camera, 3D render, photorealism, thin flat UI, noisy microtexture, baked status numbers, moved buttons, duplicated characters, conflicting light direction.
```

### 9.3 ImageGen：可切生产单体提示词

角色、建筑、装饰和图标应单独生成，不能依赖从整页图恢复透明背景：

```text
Use case: stylized-concept
Asset type: standalone production 2D game <ASSET_TYPE> cutout
Primary request: Generate exactly one complete <ASSET_NAME>, matching the supplied approved Underground Idle identity, silhouette, material and upper-left lighting references.
Style/medium: original hand-painted 2D game art; strong dark production outline; simplified readable color planes; restrained texture; consistent timber, rock, cloth, leather, brass and old-steel materials.
Composition/framing: one complete centered object, fully visible, generous transparent padding, stable <PIVOT_DESCRIPTION>; no crop and no second object.
Scene/backdrop: genuine transparent RGBA outside the complete silhouette.
Lighting: neutral production lighting only; no cast shadow, floor shadow, glow, bloom or halo unless the requested asset itself is an isolated light-FX layer.
Text: none.
Constraints: clean antialiased edges with color extension; preserve all required functional parts; no UI, labels, numbers, level badge, price, logo, signature or watermark.
Avoid: baked checkerboard, solid background, card frame, presentation board, perspective turntable, extra props, floor plane, duplicated parts, cropped base.
```

### 9.4 透明背景修正提示词

只有主体已经通过身份和造型审阅时使用：

```text
Use case: background-extraction
Primary request: Preserve the exact approved subject pixels and change only the exterior background alpha. Remove every checkerboard/background pixel, vignette, haze, cast shadow and soft halo. Output only the unchanged complete subject on genuine transparent alpha.
Invariants: do not move, resize, crop, redraw, recolor, relight or add details; preserve the exact silhouette, interior colors, outline, position and scale.
Alpha requirement: all open space and all four corners must be alpha 0; preserve clean antialiased edge pixels and fine functional details.
Constraints: no text, labels, grid, UI, logo, signature, watermark or new object.
```

ImageGen 仍可能返回烘焙棋盘或浅色背景。自动清理只能移除与画布边缘连通、且满足明确颜色条件的背景；随后必须
检查四角 Alpha、可见 bbox、细绳/手指/发丝/高光和主体 RGB，不能把“运行了抠图”当成通过。

### 9.5 给标注/编译步骤的专用提示词

当视觉资产已经批准、不需要再次生成图片时使用：

```text
不要重新设计或重绘图片。读取 <批准源图/分层目录>、<视觉契约>、<目标 FairyGUI package；首次可为空> 和
10-image-to-fairygui-live-plan.md，为 <组件名> 建立或更新机器可读 layout.json。

先列出每个 asset/node 的 stableKey、来源模式、sourceRect、logical rect、padding、pivot、runtimeSize、
nineSlice、atlas policy、z-order、group、touchable、controller/page/gear/relation 和输出文件。无法从证据确定的
语义必须报告，不得根据像素或名称猜测。

随后由 layout.json 生成审稿标注图、生产切图、ids.lock、machine-owned 组件 XML 和受控 package.xml 变更，
执行确定性二次编译和全部引用/Alpha/尺寸门禁。不得从标注图 OCR 回填数据，不得从扁平合成图裁带背景的透明件，
不得伪造 FairyGUI .bin、atlas 或 Creator .meta，也不得通过命令行启动 Creator。写入 FairyGUI 真源前必须
确认项目负责人已对明确文件范围授权；未授权时只输出待应用变更。
```

## 10. 验收矩阵

### 10.1 自动验收

- Schema 版本、必填字段、坐标空间和源文件哈希有效；
- crop/mask 不越界，输出非空，透明件四角和边缘满足规则；
- 九宫格中心区为正数，inset 没有落到圆角、描边或装饰上；
- 同 stable key 的既有 ID 不变，新增 ID 无碰撞，tombstone 不复用；
- 所有 package、resource、component、child、group、relation、page 和 `ui://` 引用闭合；
- gear page 属于目标 controller，pages 与 values 数量一致；
- `displayList` 与显式 z-order 一致；
- 连续编译两次无 diff，`--check` 在漂移时以非零状态退出；
- review、raw、contact sheet、文字烘焙源没有进入运行目录；
- 任一步失败时不得留下半套输出；若目标目录已有可用输出，则保持不变。

### 10.2 FairyGUI Editor 验收

- 工程完整重载无缺失资源、自动修复或悬空引用；
- machine-owned XML 打开、保存、关闭再打开后结构稳定；
- `package.xml` 的 `alone_npot`、九宫格、exported 和已锁定 ID 保持；
- 组件遮挡、状态页、gear、relation、按钮模板和热区符合契约；
- 按首次确认的 `Publish.json` 发布 `.bin`、atlas 和独立纹理成功。

### 10.3 Creator 验收

- 只通过 Cocos Dashboard 启动 Creator 3.8.8；
- 资源导入和 `.meta` 稳定；
- 750×1624 基线、安全区、长数字、满仓、锁定、远征和异常态通过；
- 无九宫格变形、透明黑边、图集串色、热区漂移或遮挡错误；
- `test:fgui`、`verify:fgui`、`verify:sync` 及相关客户端测试通过。

## 11. 风险与回退

| 风险 | 阻断方式 | 回退策略 |
| --- | --- | --- |
| 扁平图无法恢复透明件 | 来源模式和白名单阻断 | 改用独立图层、透明单体或 fullCanvas 层 |
| ID 重算破坏 `ui://`/gear/group | append-only lock、既有 ID 导入和精确测试 | 保留旧 lock，禁止发布新 XML |
| Editor 与生成器双写 | 文件级 ownership | 回到上一个生成输出；人工改动回填 Schema 后重编译 |
| package 合并丢未知属性 | AST 白名单、round-trip diff | 不写 package，保留现有文件并报告差异 |
| ImageGen 输出不稳定 | 源哈希、人工批准和确定性后处理 | 固定批准源，不在编译阶段重新调用生成模型 |
| trim/pivot 导致页面漂移 | anchor 公式和逐像素 overlay | 回退 fullCanvas 或修正显式 pivot/crop |
| 更新 manifest 掩盖坏发布物 | 先执行结构与预览门禁 | 不运行写入模式，回到 Editor 修复并重新发布 |

## 12. 实施记录

初始记录为空。首次执行从 P0 开始；每次更新只追加有证据的结论。若 Gate 未通过，状态必须保持“未开始/
进行中/阻断”，不能使用“基本完成”代替明确的失败项，也不能把文档编写本身登记为实现证据。

## 13. 完成定义

当且仅当以下条件全部满足，才能在下一批任务中把“生成图片时同步得到切图和 FGUI XML”作为默认能力：

1. 一个批准源批次可以通过单一 `layout.json` 重建标注图、所有运行 PNG 和 machine-owned XML；
2. 相同输入连续编译零 diff，JSON 重排不改变稳定 ID；
3. 非法来源、污染 Alpha、越界 crop、悬空引用和错误 gear 会在写文件前失败；
4. FairyGUI Editor round-trip 和发布通过，不需要手工修 XML 才能打开；
5. 项目 codegen、manifest 和 FGUI 测试已接入本流水线并通过；
6. Cocos Dashboard 启动的 Creator 完成真实预览；
7. 下一位执行者能够仅凭仓库中的文档、命令、所有权和回退说明复现结果。

---

[返回总目录](README.md) · [上一篇：UndergroundIdleMain FairyGUI 装配契约](09-fairygui-undergroundidle-main-assembly.md)
