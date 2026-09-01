# Underground Idle 主界面 Gate A 候选审计 v01

> 执行日期：2026-09-01<br>
> 范围：`main_v01` 分层母版、FX-01、FX-02、SPEC-01、SPEC-02<br>
> 人工审阅日期：2026-09-01<br>
> 当前结论：`Needs revision`；自动技术检查通过，但 Gate A 人工视觉审阅未通过

本记录只覆盖主界面 Gate A 审稿候选，不把 ART-01～ART-09 标记为已生成或 `Accepted`，也不代表
FairyGUI Editor、Cocos Creator 或运行时状态矩阵已经验收。v01 文件继续保留为历史证据，但不得进入后续
ART 拆包或 FairyGUI 导入。

## 1. 交付盘点

| 交付 | v01 历史源 | 审阅导出 | 结果 |
| --- | --- | --- | --- |
| 分层 Master | `ug_main_master_v01.svg` | `ug_main_master_v01.png`、`ug_main_master_text_off_v01.png`、`ug_main_master_review_v01.png` | 技术证据已生成；视觉未通过，不得晋级 |
| FX-01 | `../../effects/ug_fx_main_initial_v01_review.svg` | 无字底稿与 750×1624 审阅 PNG | 用户与批准概念图比对后判定 `Needs revision` |
| FX-02 | `../../effects/ug_fx_main_state_board_v01_review.svg` | 2480×3508 状态板 PNG | 状态数量证据保留；视觉沿用失败母版，不得晋级 |
| SPEC-01 | `../../specs/ug_spec_main_safearea_hotzones_v01.svg` | 750×1624 左板派生 PNG + 1780×1700 全板 PNG | 坐标语义可供新批次复核，不构成视觉通过 |
| SPEC-02 | `../../specs/ug_spec_main_layer_toggle_v01.svg` | 2048×2048 联系板 + `review/spec02_*.png` | 层序证据保留；不构成视觉通过 |

## 2. 自动检查结果

| 检查 | 当次结果 |
| --- | --- |
| Master 画布 | `1500×3248`，8-bit sRGBA |
| 分层数量/顺序 | 9 层：`00_BACKGROUND` → `10_STRUCTURE` → `30_BUILDING` → `40_PROP_STATE` → `50_CHARACTER` → `50B_FRONT_OCCLUSION` → `60_LIGHT_FX` → `70_UI_CONTAINERS` → `80_RUNTIME_TEXT` |
| SVG 解析 | 本批全部 SVG 通过 `xmllint --noout` |
| Master 源重渲染 | `ug_main_master_v01.svg` 重渲染与分层合成 `AE=0` |
| 文字 ON/OFF 差异 | `34,483` 像素发生变化，恰等于 `80_RUNTIME_TEXT` 非零 Alpha 像素数 |
| 文字槽外差异 | `0` 像素；证据为 `review/ug_main_text_diff_outside_v01.png` |
| 非文字生产层 `<text>` | `0`；运行时中文和数字只在 `80_RUNTIME_TEXT`/审稿注释组 |
| SPEC-01 常驻热区 | H01～H10 共 `10` 个；资源卡和指标卡未擅自新增热区 |
| SPEC-02 递增阶段 | `8` 张，均为 `1500×3248`，由同一母版逐层合成 |
| FX-02 状态数量 | 主状态 `8` 个，收取按钮状态 `5` 个；共 `13` 个独立运行时文字组 |
| 透明角 | 结构、建筑、状态、角色、遮挡、灯光和文字层左上角 Alpha 为 `0`；背景/UI 按设计覆盖画布边缘 |

以上结果只证明 v01 文件可解析、可复现并满足既定文字隔离规则。`AE=0` 比较的是 v01 SVG 与它自己的分层
合成，不是 v01 与批准概念图之间的差异，因此不能用于证明视觉一致或关闭 Gate A。

关键 SHA-256：

```text
733a70011678435311694a1e9a066bad4c6b50d4ea1a965f2d13b64d0d6eda54  ug_main_master_v01.svg
7db75c732aa695f71a8dae5830c428d00e37bd248a710168acc53cb48b31c156  ug_main_master_v01.png
75a561d2ae9e0bf7dd3d6ff98bc5a70acd7860251c72b0ac164a7955e1b059a2  ug_main_master_text_off_v01.png
83b61ea805c932b684f2d4f50161179c546fe374fdc7e1718abf486ca9928e31  ug_fx_main_initial_v01.png
```

## 3. 制作方语义自检

- 初始快照显示 `100 / 0 / 30/30`、`50/1,000`、`12.8 / 19.8 / 12.8`、开采瓶颈与可用的黄色“全部收取”；
- 只显示格伦、诺拉、伊芙；奥托默认隐藏，没有等级、品质、装备、抽取、商店或付费入口；
- 格伦为铁灰宽肩与大铁镐，诺拉为橙棕绳索/矿篮，伊芙为青绿提灯/地图筒；
- 制作方曾判断矿井、升降机和仓库使用同一木梁、钢件和黄铜语言，深层锁门亮度低于当前工作区；
- 制作方曾判断收取按钮、瓶颈卡与底栏远征入口可以定位；该判断不能替代后续人工视觉结论；
- FX-02 同构状态只叠加数值、状态标记、箱体/矿石、局部灯光或深层入口反馈，不移动角色锚点和热区。

这些项目只说明业务语义被放入了正确位置，不表示画面达到批准概念图的视觉质量。

## 4. 人工视觉审阅结论

用户直接比较以下两张审阅图：

- `../../effects/ug_fx_main_initial_v01_review.png`；
- `../../ug_ui_main_concept_02_review.png`。

人工结论是两者在美术视觉上仍有明显差距，Gate A v01 未通过。工作流复盘确认，v01 将分别生成的场景、建筑、
角色候选与低细节 SVG UI 再次拼装，只验证了“能否分层复现”，没有验证“重组后是否保持黄金图的一体化材质、
细节密度、光照、角色比例和整体完成度”。因此自动检查不能推翻人工 `Needs revision` 结论。

## 5. ImageGen 来源与透明处理

- 场景候选与提示词：`scene/candidates/IMAGEGEN_RECORD.md`；
- 三名角色候选与透明 QA：`characters/candidates/IMAGEGEN_RECORD.md`；
- 三座 L1 建筑候选与透明 QA：`buildings/candidates/IMAGEGEN_RECORD.md`；
- 候选均保留原始生成图与确定性透明处理记录；归一化副本只改变画布、缩放和 pivot 对齐，不重绘 RGB。

## 6. 仍然阻断后续 Gate 的项目

- Gate A v01 已完成人工审阅并判定 `Needs revision`；此前按旧流程编号通过的 G3 概念图仍是视觉目标；
- 必须以新的版本号完成 G2 布局与几何裁定，在 G3 生成 750×1624 无字黄金 target 和批准高分辨率源，先单独取得人工签字；
- 必须建立 `asset-manifest.json`，从批准位图通过受控 `regionCrop/inpaintCrop/alphaObject/fullCanvas/nineSlice`、补绘或同源局部
  ImageGen 得到 PNG 语义资产，并提交确定性重组图、diff 和修复 mask；
- 角色目前是身份 cutout，不是 ART-04 的头、身、前臂、工具、头灯拆件 rig，手腕 pivot 也未交付；
- 四建筑三阶段、ART-01～ART-09 完整 manifest、透明运行件和逐包审计仍待制作；
- SPEC-01 坐标还需在 FairyGUI/Cocos 首次装配后读取实际节点世界矩形复测；
- 未进入 FairyGUI Editor，未发布 `.bin`/atlas，未创建或修改 Creator `.meta`，未执行 Creator 预览。

替代批次通过前，v01 SVG、Master 和 FX/SPEC 派生图不得作为 ART 或 FairyGUI 输入。FairyGUI XML、内部 ID、
`package.xml`、`.bin` 和 atlas 必须由 Editor 保存和发布，不由切图脚本生成。

## 7. 人工签字

| 审阅对象 | 结论 | 审阅人 | 日期 | 备注 |
| --- | --- | --- | --- | --- |
| FX-01 / FX-02 / SPEC-01 / SPEC-02 / Master v01 | Needs revision | 用户 | 2026-09-01 | 与批准概念图视觉差距明显；保留技术证据，停止沿用 SVG 中间层，改走黄金位图 + PNG 语义资产 + manifest + 重组/diff + FairyGUI Editor |
