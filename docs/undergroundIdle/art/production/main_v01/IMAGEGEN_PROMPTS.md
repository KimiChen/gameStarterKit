# Main v01 — ImageGen 候选提示词计划

本批位图计划在需要时使用 Codex 内置 ImageGen；坐标、UI、文字、状态和验收图不使用生成式整页输出。
以下是待执行、可迭代的候选 prompt，输入图仅作风格/身份参考，不作为工程母版直接裁切。本文件不记录任何
调用成功、候选入选或最终采用结果。

## 1. 远景岩壁

```text
Use case: stylized-concept
Asset type: independent deepest-background game scene layer
Primary request: Create a portrait underground mine rock-wall background for a 750×1624 mobile screen, authored so it can be scaled exactly to 1500×3248. Use the supplied FX-01 composition and SPEC-03 only as visual references.
Scene/backdrop: full-bleed charcoal cavern wall and depth gradient; three broad low-frequency cavern bands; no open transparent holes.
Style/medium: original hand-painted 2D game art; chunky simplified planes; restrained texture; strong but not noisy dark shapes; upper-left key light.
Palette: #182129 through #35434D with very restrained cool variation.
Constraints: background only; no beams, platforms, rails, pipes, buildings, carts, props, characters, lamps, glow, UI, text, numbers, logos or watermark.
Avoid: foreground silhouettes, high-frequency pebble noise, bright focal points, fake interface panels, checkerboard.
```

计划候选输出：`scene/ug_bg_mine_depth_01_source.png`；经审阅后才可机械缩放为
`scene/ug_bg_mine_depth_01_2x.png`。文件名登记不代表文件已经生成。

## 2. 建筑首阶段透明件

对矿井、升降机、仓库和大厅分别单独生成，`BUILDING` 与 `LEFT_STAGE_DESCRIPTION` 替换为对应对象：

```text
Use case: stylized-concept
Asset type: standalone transparent 2D game building cutout
Primary request: Generate only the crude first-stage BUILDING from the left column of the supplied three-stage building reference, matching SPEC-03.
Input images: Image 1 is the supplied three-stage silhouette and attachment reference; Image 2 is the supplied palette, outline, material and lighting reference.
Subject: LEFT_STAGE_DESCRIPTION. Preserve only the first-stage structure; do not include any later-stage attachment, extra platform, upgraded roof, decoration, light array or capacity extension.
Style/medium: original hand-painted 2D game art; straight-on orthographic presentation; chunky silhouette; dark production outline; simplified wood, rock, brass and steel; restrained internal texture.
Composition/framing: one complete centered building, fully visible with generous transparent padding; stable bottom-center pivot; no cropping.
Lighting/mood: restrained upper-left material highlight; no emitted glow, bloom, cast shadow or ground shadow.
Text: none.
Constraints: genuine RGBA transparency outside the complete silhouette; clean antialiased edges; no UI, labels, numbers, level badge, price, logo or watermark.
Avoid: checkerboard baked into RGB, card frame, perspective turntable, multiple stages, extra props, floor plane, halo.
```

背景提取修正：

```text
Use case: background-extraction
Primary request: Preserve the exact selected building-candidate pixels and remove only the checkerboard, white field, vignette, haze and cast shadow. Output one unchanged building silhouette on genuine transparent alpha.
Constraints: do not move, resize, redraw, recolor or add details; alpha outside the physical building must be 0; preserve clean antialiased edge pixels; no halo, text, UI or new object.
```

## 3. 四角色可动画拆件

每个角色独立生成 3×3 拆件板：

```text
Use case: stylized-concept
Asset type: production-ready 2D game character animation parts sheet with genuine transparent alpha
Primary request: Generate one square 3×3 parts sheet for the selected Underground Idle worker reference shown in the identity cutout and character sheet, following SPEC-03. This is a new candidate using the inputs only as references.
Scene/backdrop: genuinely transparent RGBA; no visible grid, checkerboard, floor or environment.
Style/medium: original hand-painted 2D game sprite art; compact 2.5–3-head proportions; strong dark outer outline; simplified large color planes; restrained texture; materially distinct cloth, leather, wood, rope, brass and steel; upper-left key light.
Composition/framing: use nine equal invisible cells with generous transparent gutters. Put exactly one complete isolated component in every declared non-empty cell. No component may overlap, touch, cross a cell boundary or be cropped. Orient body parts consistently for a natural three-quarter pose.
Lighting/mood: neutral production lighting only; no cast shadow, drop shadow, floor shadow, glow, bloom or halo.
Text: none.
Constraints: exact requested part count; true transparent alpha between and around parts; clean antialiased edges with color extension; preserve character identity, clothing and role props; no assembled duplicate, extra limb, merged prop, labels, numbers, UI, logo, signature or watermark.
Avoid: baked checkerboard or solid background, sprite-sheet borders, duplicate parts, missing fingers, cropped boots, photorealism, 3D render, presentation board styling.
```

角色格位：

| 角色 | R1C1 | R1C2 | R1C3 | R2C1 | R2C2 | R2C3 | R3C1 | R3C2 | R3C3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 格伦 | 头+头盔无灯 | 躯干 | 左臂 | 右臂 | 下半身 | 镐 | 独立头灯 | 空 | 空 |
| 诺拉 | 头+头盔无灯 | 躯干+背架 | 左臂 | 右臂 | 下半身 | 绳圈 | 独立头灯 | 空 | 空 |
| 伊芙 | 头+头盔无灯 | 躯干+挎包 | 左臂 | 右臂 | 下半身 | 提灯 | 勘察筒 | 独立头灯 | 空 |
| 奥托 | 头+帽/护目镜无灯 | 躯干 | 左臂 | 右臂 | 下半身 | 医疗包 | 方形药箱 | 独立头灯 | 空 |

背景提取修正：

```text
Use case: background-extraction
Primary request: Change only exterior background alpha. Remove every checkerboard/background pixel, vignette, haze, cast shadow and soft halo around the selected candidate parts. Output only the unchanged component silhouettes on genuine transparent alpha.
Invariants: preserve every part's exact identity, shape, color, outline, position, scale and interior highlight; do not redraw or restyle; keep declared empty cells fully transparent.
Alpha requirement: all open space and all four corners must be alpha 0; preserve antialiased pixels belonging to hair, fingers, helmet brim, cloth, wood, rope, tools and lamp mounts.
Constraints: no movement, resizing, cropping, duplication, text, labels, grid, UI, logo, signature or watermark.
```

如果 ImageGen 返回烘焙棋盘 RGB，只允许对与画布边缘连通的中性背景重建 Alpha；主体 RGB 必须保持逐通道
不变，并复核浅色高光、细绳、手指、头发和透明边缘。不得用自动抠图结果重绘角色。每次调用、候选文件、
筛选理由、修正步骤和验收结论应另行登记；未登记的输出不得进入生产包。
