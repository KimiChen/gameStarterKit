# Underground Idle 工程美术生产计划索引

> 计划批次：ART-01～ART-09 v01<br>
> 当前生产路线：`Bitmap-first + Editor-first`<br>
> 当前状态：G2～G5 均未开始；ART-01～ART-09 仍待生成和验收

本目录承接 `08-main-screen-art-brief.md` 的工程拆分。批准的黄金位图负责锁定视觉，`asset-manifest.json`
负责记录位图来源与切分语义，透明 PNG/同画布 PNG 是运行资产，FairyGUI Editor 是页面结构、内部 ID、
XML 序列化和正式发布的权威。

`art01_*`～`art09_*` 规定各生产包的文件名、尺寸、锚点和验收标准。可复用 ART 包可以拥有各自的
`asset-manifest.json`；主界面页面批次的 `main_bitmap_v02/asset-manifest.json` 只按稳定 key + 哈希引用批准条目，
不得复制一份可独立修改的来源、pivot 或 inset。目录中的 README、提示词、manifest
设计和审稿要求均属于生产计划，不代表对应运行 PNG 已生成、已采用或已通过审计。

| 包 | 入口 | 计划交付 | 状态 |
| --- | --- | --- | --- |
| ART-01 场景层 | [`art01_scene_v01/README.md`](art01_scene_v01/README.md) | 背景/深度、中景结构、前景遮挡、灯光 mask | 待生成与审计 |
| ART-02 通用模块 | [`art02_modules_v01/README.md`](art02_modules_v01/README.md) | 洞口、木梁、轨道、管道、灯、箱、桶、绳 | 待生成与审计 |
| ART-03 建筑状态 | [`art03_buildings_v01/README.md`](art03_buildings_v01/README.md) | 四建筑三阶段、7 个通用状态、7 个主界面独立状态件 | 待生成与审计 |
| ART-04 角色 | [`art04_characters_v01/README.md`](art04_characters_v01/README.md) | 四头像、四场景 rig、计划拆件与 pivot | 待生成与审计 |
| ART-05 远征 | [`art05_expedition_v01/README.md`](art05_expedition_v01/README.md) | 三地点、路线、节点、锁与雾 | 待生成与审计 |
| ART-06 UI Kit | [`art06_ui_kit_v01/README.md`](art06_ui_kit_v01/README.md) | 11 个无字九宫格组件 | 待生成与审计 |
| ART-07 图标 | [`art07_icons_v01/README.md`](art07_icons_v01/README.md) | 19 枚 256×256 通用/首屏语义图标 | 待生成与审计 |
| ART-08 结果徽记 | [`art08_badges_v01/README.md`](art08_badges_v01/README.md) | C/B/A/S 框与徽章、深层徽记、归队剪影 | 待生成与审计 |
| ART-09 程序动效 | [`art09_fx_v01/README.md`](art09_fx_v01/README.md) | 5 个单纹理、3 组四帧 atlas | 待生成与审计 |

统一验收清单、计划计数和待执行记录见 [`AUDIT.md`](AUDIT.md)。

## 当前 Gate

| Gate | 当前状态 | 当前必须产物 |
| --- | --- | --- |
| G2 布局与几何裁定 | 未开始 | 几何决策记录、安全区、热区、固定区、极值文本样例与 08/09 同步证据 |
| G3 黄金 target / 视觉锁定 | 未开始 | 750×1624 无字 target、批准高分辨率源、哈希、生成/编辑记录与人工签字 |
| G4 生产拆分 | 未开始 | `main_bitmap_v02/asset-manifest.json`、节点责任、来源、mode、mask、pivot、九宫格和许可闭包 |
| G5 运行资产 | 未开始 | accepted runtime PNG、逻辑尺寸 composite、target ↔ composite diff/allow-mask、自动报告与人工 A/B |

必须依次关闭 G2、G3、G4、G5；当前下一步是 G2。文件存在、脚本可运行或自动分数不能替代对应 Gate 的
人工批准。

## Bitmap-first 交付物

| 类别 | 用途 | 是否可导入 FairyGUI |
| --- | --- | --- |
| 无字黄金位图 | 750×1624 逻辑 target + 批准高分辨率源；锁定构图、材质、光向、角色比例和 UI 语言 | 否，不作为整页运行图 |
| `asset-manifest.json` | 记录源哈希、`mode`、source rect、mask/修复来源、pivot、九宫格、输出尺寸和运行名 | 否，属于生产契约 |
| source-only PNG | 原始候选、Alpha mask、补绘 clean plate、局部修复和审稿标注 | 否 |
| runtime PNG | 同画布场景层、透明角色/建筑/状态件、九宫格源图、图标和动效帧 | 是，逐项导入 |
| composite / diff | 用 runtime PNG 确定性重组的整页、黄金图对照、差异图和修复 mask 证据 | 否 |
| FairyGUI 设计源与发布物 | Editor 中的组件、文本、Controller、Gear、Relation、热区、XML、`.bin` 和 atlas | 仅由 Editor 保存和发布 |

位图切分只允许以下已登记方式：`copy`、`regionCrop`、`inpaintCrop`、`alphaObject`、`fullCanvas`、
`nineSlice`、`tile`、`generatedVariant`。只有完整、无遮挡、没有背景污染的区域可以直接 `regionCrop`；
被遮挡对象、透明边、连续光影和需要补足 bleed 的对象必须使用批准的 mask、补绘/inpaint 或同源局部
ImageGen 修复，并在 manifest 中记录来源和允许变化区域。不得把视觉相近但来源不明的独立生成件直接拼入页面。

## 生产与装配边界

- 先完成 G2 布局与几何裁定，再生成 750×1624 无字黄金 target 并在 G3 单独获得人工签字；应保留批准高分辨率源，采用
  contract geometry 时推荐 1500×3248 作者源；
- 生产前按各包 README 建立来源 PNG、运行 PNG 和机器可读 manifest；文件名存在于规范中不代表文件已交付；
- 生成中间稿、`_raw_`、联系表、review 图和带审稿文字的文件不得作为运行资源；
- 建筑、角色、九宫格和动效的 pivot、frame rect、blend mode 必须在验收前写入各包 manifest；
- 运行时中文、数字、等级、价格、容量填充和倒计时全部由 FairyGUI 文本/程序状态提供；
- 效果图到运行资产之间只使用批准 PNG、manifest、mask/repair 和确定性派生 PNG，不建立 SVG 中间层；
- FairyGUI 设计真源必须通过 FairyGUI Editor 建立和复核。脚本不得为本流程生成或维护 XML、`package.xml`
  和内部 ID，也不得伪造 `.bin`、atlas 或 Creator `.meta`；
- `tools/` 仅用于透明清理、裁切、同锚点归一化、确定性重组、diff 和审计，不是运行资源或页面真源。

## 计划验收门

1. 完成 G2 几何裁定，在 G3 生成 750×1624 无字黄金 target 与批准高分辨率源，和已批准概念图 A/B 审阅并人工签字；
2. 在 G4 建立 `asset-manifest.json` 与切分计划，逐项登记 mode、source rect、mask、补绘/inpaint、九宫格和运行尺寸；
3. 在 G5 导出 PNG 语义资产，执行 Alpha、尺寸、色彩空间、pivot、来源闭包、文字禁入和缩小可读性审计；
4. 在 G5 用这些 PNG 确定性重组整页，提交黄金图/重组图/差异图/修复 mask；未解释差异或明显视觉降级必须返工；
5. 由美术负责人逐包选择候选并签字，未签字资产保持 `To audit`；
6. 在 FairyGUI Editor 中导入批准的 runtime PNG，装配 750×1624 页面并设置文本、九宫格、pivot、
   Controller、Gear、Relation 和热区；
7. 执行 Editor 保存—关闭—重开和正式发布，再依次运行 `codegen:fgui`、`codegen:features`、审阅、
   `fgui-manifest --write`、客户端同步/测试并通过 Creator 状态预览；
8. 人工复核三秒扫描、角色身份、长数字、满仓、锁定、离岗、断线与结果弹窗。

节点、坐标、controller、资源名与 Creator 状态矩阵以
[`../../09-fairygui-undergroundidle-main-assembly.md`](../../09-fairygui-undergroundidle-main-assembly.md) 为装配目标；其中任何现状描述
都不能替代本目录各生产包的单独生成和验收记录。
