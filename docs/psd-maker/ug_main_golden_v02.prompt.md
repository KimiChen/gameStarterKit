# UG-MAIN-GOLDEN-V02 ImageGen 与选稿记录

> 状态：`G2 已完成 / G3 视觉稿已由用户选定 / G4 候选待联合审阅 / G5 未开始`
> 日期：2026-09-01
> 选定输出：`exec-53aa6312-22bd-4b18-91f0-0701dc29b469.png`
> 工具：Codex `$imagegen`，内置 ImageGen，`stylized-concept`

## 用户选稿

用户明确指定 `exec-53aa6312-22bd-4b18-91f0-0701dc29b469.png` 为主界面唯一视觉稿。此次选稿没有再次调用
ImageGen，也没有重绘、补画、重排或拉伸原图；只将 853×1844 源图等比缩放并居中补边到项目逻辑尺寸
750×1624。旧的“强制 R1～R6 几何重组”候选已转存为历史证据，不再代表当前 target。

## 当前输出与校验

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| `ug_main_golden_v02.png` | 750×1624、无运行时文字、用户选定的 G3 target | `697ae579d2c2875c763b6f07b09b08666513fc33f219dc9bf0106184b02538f4` |
| `ug_main_golden_v02_review.png` | 使用项目字体投影常规中文与数值，仅供审稿 | `326e2375272495f61852e9e4f28095aa27251013992966310e14674c033ee93d` |
| `ug_main_golden_v02_review_extreme.png` | 投影长数值、极限速率和仓库满状态，仅供审稿 | `b7b73c085b0501275f6951d841f6a0d13ddcf4eef84c1acd88274648b37c87ef` |
| `ug_main_selected_exec_53aa_source_853x1844.png` | ImageGen 原始选定输出 | `1de931e33d5d66e65f12ecdcf50ee4d84675c091c310f09fbd26ace2cf20b8fd` |

源图原始位置为：

```text
/Users/kimi/.codex/generated_images/01a05c96-ed07-73b1-b206-da161135a7b5/exec-53aa6312-22bd-4b18-91f0-0701dc29b469.png
```

规范化步骤仅包含：等比缩放至不超过 750×1624、在 750×1624 RGB/sRGB 画布居中、以黑色补足不足的边缘像素。
未做非等比缩放，未裁掉界面内容，也未把 853×1844 机械放大成虚假的高分辨率源。

## 生成提示词

以下为产生用户所选输出的完整提示词：

```text
Use case: stylized-concept
Asset type: high-resolution golden visual target candidate for a portrait mobile game home screen, G3 review source only
Primary request: Create one coherent original hand-painted 2D Underground Idle mine home screen in exact contract geometry for a 750×1624 logical canvas. Author at approximately 1500×3248 detail density, very tall narrow portrait aspect ratio 0.462, full bleed, no phone frame, no outer margin.

Exact fixed layout and hierarchy:
1) R1, y 0–108: compact title/safe-area chrome. Crossed-pickaxe mining-guild emblem inside a chunky brass-and-steel button at left, a broad completely EMPTY recessed title plaque in the center, and a gear settings button at right.
2) R2, y 108–207: three equal resource capsules for ore, relic shard, and lantern stamina. Each has one clear hand-painted icon and a deliberately EMPTY dark recessed number slot.
3) R3, y 207–369: warehouse/capacity panel occupying the left 454 px with crate-and-track motif and an EMPTY value/progress slot; a large rectangular warm-gold collect button occupying the right 262 px with an EMPTY label slot. The collect button is the strongest UI focal point.
4) R4, y 369–1307: straight-on orthographic vertical mine cutaway inside a fixed clipped viewport. Three stacked timber work platforms. Crude level-one mine machinery and an ore seam in the upper-left; old rails and an empty waiting mine cart clearly communicate a mining bottleneck. A rope-and-cage hoist occupies the right side, operating normally with restrained warm lamps. A small warehouse linkage is visible. A chained deep gate sits in the lower-right with subdued teal mist and low intensity, clearly secondary.
5) R5, y 1307–1502: four equal thick-framed metric cards. Icon-only headers for mining, transport, effective rate, and bottleneck, with EMPTY dark recessed numeric/label slots. First three show equal-length teal status rails; fourth uses an orange-red warning shape and equal-length status rail. These are status rails, never percentage bars.
6) R6, y 1502–1624: fixed three-tab bottom navigation. Mine tab selected, workers inactive, expedition inactive. Use mine/pickaxe, worker helmet, and compass-map icons with EMPTY label slots. Expedition must be immediately discoverable.

Initial gameplay state: warehouse visually about five percent full; mining is the bottleneck, represented by the empty cart and one warning-shaped icon area; hoist has normal warm lighting and no overload; deep gate locked by chain with quiet cool light. Mine, hoist, warehouse, and guild visual language is crude level-one: timber, rope, old steel, very little brass. Do not depict an upgraded stable-stage machine.

Characters: exactly three original chibi workers, no fourth character.
• Glen at the upper mining station: iron-gray palette, wide shoulders, oversized pickaxe, actively mining.
• Nora near the hoist: orange-brown palette, rope and ore backpack silhouette, transporting.
• Eve idle on the lower platform: teal palette, hand lantern and map tube.
All are consistent 2.5–3 heads tall, readable at mobile scale, strong distinct silhouettes, matching hats and role tools, no cards or labels.

Style/medium: polished original Q-version hand-painted 2D game UI; straight-on mine cutaway; chunky simplified planes; strong deep outlines; thick charcoal rock and old-steel panels with walnut wood and restrained brass trim; corner guards, sparse rivets, inner shadows and limited bevels. Medium environment detail but simplified at 1× mobile size. UI hierarchy dominates decoration.
Lighting/mood: warm, reliable, busy lights in a dark mine; unified upper-left key light; controlled amber work lamps; restrained teal depth light; light industrial adventure, never horror.
Color palette: deepest charcoal #182129, mid rock #35434D, walnut #8A5B3D, brass #C88A3D, main action #F3BE58, cool depth #57C7BE, warning #E66555. EMPTY text slots are dark blue-charcoal recessed steel around #24313A–#2D3B45, suitable for later off-white runtime text.
Materials/textures: hand-painted rock planes, worn walnut beams, old steel rails, small brass highlights; keep wood grain, rubble, cracks and rivets low frequency.
Runtime text: every title, number, rate, capacity value, timer, badge, tab label, button label, Chinese text and level marker must be completely blank. Do not draw placeholder glyphs, fake letters, pseudo-writing, runes, tally marks, scratches resembling text, or numbers.
Constraints: all subjects remain inside their declared region; exact six-region proportions; collect button, mining-bottleneck cue, and expedition tab pass a three-second scan; practical shippable-looking UI composition; no baked device safe area; no text, no logos, no trademarks, no signature, no watermark.
Avoid: isometric or 2.5D camera, perspective room diorama, 3D render, photorealism, thin flat UI, horror, high-frequency pebble/wood/rivet noise, bright deep gate, shop, premium currency, ads, levels, rarity, equipment cards, extra characters, duplicate characters, floating expedition card, fake text, gibberish.
```

提示词请求了旧版契约分区，但 ImageGen 实际输出保留了更高的顶部 UI 和更紧凑的矿井视口。用户已明确选择实际输出，
因此以选定像素为视觉真相；不能再声称该图精确满足旧版 09 文档坐标。几何差异与后续动作见
`ug_main_golden_v02.geometry.md`。

## 运行时文字投影

审阅图使用项目字体
`apps/art/fairygui/assets/L10n_zh_hans/Font/siyuanheitiCNRegular.ttf`，仅在选定 target 上投影：标题、三资源值、
仓库容量、收取按钮、四指标和三个页签。极值图另投影 `9.99M`、`9,999,999 / 9,999,999`、
`999.9K/分钟` 和 `仓库已满`。文字不会回写 target，也不能进入运行位图。

## 历史候选

选稿前的契约重组 target、常规审阅图和极值审阅图未纳入本证据目录；其历史文件名为：

```text
ug_main_contract_candidate_before_selection_750x1624.png
ug_main_contract_candidate_before_selection_review_750x1624.png
ug_main_contract_candidate_before_selection_review_extreme_750x1624.png
```

这些未归档候选、几何 guide、整页候选和仓库局部修订源不得替代用户选定的 source。

## Gate 限制

- G2 已采用 `adoptConceptGeometry` 并同步 08/09、文字槽、点击热区、安全区与短屏断点；Gate A、G4、G5 仍未关闭。
- G4 manifest 候选已建立，但预算和联合审阅未闭合；G4、G5 与 Gate A 全部通过前不进入 FairyGUI Editor。
- G5 仍需生产 clean plate、透明件、九宫格、composite 与 diff。
