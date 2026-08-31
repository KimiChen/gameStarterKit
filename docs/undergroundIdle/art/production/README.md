# Underground Idle 工程美术生产计划索引

> 计划批次：ART-01～ART-09 v01<br>
> 当前口径：生产规范已定义；资产待生成、待整理、待静态审计和待运行时验收

本目录承接 `08-main-screen-art-brief.md` 的工程拆分。`main_v01/` 规定主界面分层母版的目标结构；
`art01_*`～`art09_*` 规定后续生产包的文件名、尺寸、锚点和验收标准。目录中的 README、提示词、manifest
设计和审稿要求均属于生产计划，不代表对应 PNG/SVG 已生成、已采用或已通过审计。

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

## 生产与装配边界

- 生产前先按各包 README 建立源文件、导出文件和机器可读 manifest；文件名存在于规范中不代表文件已交付；
- 生成中间稿、`_raw_`、联系表、review 图和带审稿文字的文件不得作为运行资源；
- 建筑、角色、九宫格和动效的 pivot、frame rect、blend mode 必须在验收前写入各包 manifest；
- 运行时中文、数字、等级、价格、容量填充和倒计时全部由 FairyGUI 文本/程序状态提供；
- FairyGUI 设计真源应通过 FairyGUI Editor 建立和复核；不得把未经 Editor 重载、发布和 Creator 预览的 XML
  标记为可交付；
- `tools/` 仅计划用于透明清理、同锚点归一化和确定性导出，不是运行资源。

## 计划验收门

1. 逐包生成候选源图、透明切图、联系表和 manifest，登记来源与生成参数；
2. 执行 Alpha、尺寸、色彩空间、pivot、引用闭包、文字禁入和缩小可读性审计；
3. 由美术负责人逐包选择候选并签字，未签字资产保持 `To audit`；
4. 在 FairyGUI Editor 中装配 750×1624 页面，设置九宫格、pivot、controller 与无字状态资源；
5. 发布到 Cocos resources，执行 manifest/codegen/客户端测试，并通过 Creator 状态预览；
6. 人工复核三秒扫描、角色身份、长数字、满仓、锁定、离岗、断线与结果弹窗。

节点、坐标、controller、资源名与 Creator 状态矩阵以
[`../../09-fairygui-undergroundidle-main-assembly.md`](../../09-fairygui-undergroundidle-main-assembly.md) 为装配目标；其中任何现状描述
都不能替代本目录各生产包的单独生成和验收记录。
