# UG-MAIN-CONCEPT-02 ImageGen 记录

> 状态：`旧流程 G3 已批准 / 主界面概念基准`<br>
> 生成日期：2026-09-01<br>
> 工具：Codex 内置 ImageGen<br>
> 用途：主界面视觉、构图与信息层级审稿；不是 FairyGUI/Cocos 运行资产
> 流程更新：2026-09-01 的 v01 生产候选审阅未通过；后续以 Bitmap-first + Editor-first v02 流程为准

## 文件

- 原始候选：`ug_ui_main_concept_02_source_v01.png`（853×1844）
- 750×1624 审稿基线：`ug_ui_main_concept_02.png`
- 可编辑运行时文字叠层：`ug_ui_main_concept_02_review.svg`
- 审稿预览：`ug_ui_main_concept_02_review.png`

## 首次生成提示词

```text
Use case: stylized-concept
Asset type: full-page portrait mobile game visual target, review-only G3 concept candidate
Primary request: Create the initial Underground Idle mine home screen as one coherent original hand-painted 2D review image. Compose for an exact 750×1624 logical canvas (very tall narrow portrait, aspect ratio 0.462); no phone frame and no extra margins.

Layout — preserve these six fixed regions and their hierarchy:
1) y 0–108: compact title/safe-area bar with a crossed-pickaxe mining-guild emblem at left, a broad EMPTY title plaque in the center, and a gear settings icon at right.
2) y 108–207: three equal resource capsules for ore, relic shard, and lantern stamina, each with a clear icon and a deliberately EMPTY wide number slot.
3) y 207–369: warehouse/capacity panel on the left with a crate-and-track motif and an EMPTY value slot; a large rectangular warm-gold collect button on the right with an EMPTY label slot. This must be the strongest UI focal point.
4) y 369–1307: a straight-on orthographic vertical mine cross-section in a fixed viewport, showing three stacked timber work platforms, crude level-one mine machinery and ore seam in the upper left, old rails and an empty mine cart communicating a mining bottleneck, a rope-and-cage hoist occupying the right side, a small warehouse linkage, and a chained deep gate in the lower right with subdued teal mist. The deep gate must remain a quiet secondary element.
5) y 1307–1502: four equal thick-framed metric cards for mining, transport, effective rate, and bottleneck. Use icon-only headers and EMPTY numeric/label slots. The first three have equal-length teal status rails; the fourth uses an orange-red warning shape and equal-length status rail, never a percentage bar.
6) y 1502–1624: fixed three-tab bottom navigation; mine selected, workers inactive, expedition inactive. Use pickaxe/mine, worker helmet, and compass/map icons with EMPTY label slots. Expedition must be discoverable within three seconds.

Initial scene state: warehouse visually about five percent full; mining is the bottleneck, represented by an empty waiting cart and a clear warning-shaped icon area; hoist operates normally with restrained warm lamps; the deep gate is locked with chain and low-intensity cool light; all buildings are crude level-one timber, rope, old steel, and only a little brass.

Characters — exactly three, no fourth character:
• Glen: iron-gray, wide-shouldered chibi miner, oversized pickaxe, working at the upper mine.
• Nora: orange-brown chibi transporter, rope and ore backpack silhouette, working near the hoist.
• Eve: teal lightweight chibi scout, hand lantern and map tube, idle on the lower platform.
All are 2.5–3 heads tall, large readable silhouettes, consistent hats, tools and role colors; fully original.

Style/medium: polished original Q-version hand-painted 2D game UI, straight-on mine cutaway, chunky simplified planes, strong dark outlines, thick stone/steel panels with walnut wood and restrained brass trim, corner guards, sparse rivets, inner shadows and limited bevels. Medium scene detail but simplified at mobile size. UI information hierarchy must dominate decoration.
Lighting/mood: warm, reliable, busy lights in a dark mine; upper-left key light; controlled amber work lamps; restrained teal depth light; light industrial adventure, never horror.
Color palette: deepest charcoal #182129, rock #35434D, walnut #8A5B3D, brass #C88A3D, main action #F3BE58, cool depth #57C7BE, warning #E66555, empty text-slot surfaces compatible with #F4F0E8 and #AEBAC2.

Runtime text: leave every title, number, rate, capacity, timer, badge, tab label, button label, Chinese text and level marker completely blank. Do not draw placeholder glyphs, fake letters, pseudo-writing, runes, scratches resembling text, or numbers.
Constraints: original design only; practical shippable-looking UI composition; all important subjects remain inside their declared region; collect button, mining-bottleneck cue, and expedition tab are readable in a three-second scan; no baked device safe area; no logos, trademarks, signature, or watermark.
Avoid: isometric or 2.5D camera, 3D render, photorealism, thin flat UI, high-frequency pebble/wood/rivet noise, horror, shop/currency/ads, character levels/rarity/equipment cards, duplicated characters, fourth character, floating expedition card, bright deep gate, fake text or gibberish.
```

## 单变量修正提示词

```text
Use case: precise-object-edit
Asset type: full-page portrait mobile game visual target, review-only G3 concept candidate
Input images: Image 1 is the edit target.
Primary request: Change only the light ivory/parchment-colored EMPTY runtime-text inset plates throughout the interface into dark recessed blue-charcoal steel plates, approximately #24313A to #2D3B45, with restrained inner shadow and subtle upper-left edge highlight. This applies to the central title slot, the three resource number slots, the warehouse value slot, all four metric-card text/number slots, and all three bottom-tab label slots.
Critical invariants: keep the large warm-gold collect button exactly gold and empty; keep every icon, frame, region boundary, character, mine scene, lighting, color coding, status rail, composition, dimensions, crop, and spacing unchanged. Do not move, resize, redraw, add, or remove any object.
Runtime text: all edited slots must remain completely empty and suitable for later off-white FairyGUI text. Do not add letters, numbers, pseudo-writing, glyphs, runes, scratches resembling text, logo, signature, or watermark.
Avoid: changing the gold collect-button face; changing the mine scene; changing the three characters; adding text; making the slots flat black or overly glossy.
```

## 审稿边界

- ImageGen 结果是扁平 RGB 概念候选，不可盲切：完整、无遮挡、无动态内容且无背景污染的固定区域可在新的
  黄金 target 批准后按 `regionCrop` 提取；角色、建筑、透明件和九宫格仍须补绘/独立生成并经重组回归。
- `80_RUNTIME_TEXT` 只存在于 SVG 审稿叠层；`ug_ui_main_concept_02.png` 本体无中文和数字。
- 只有人工确认构图、综合色板、角色身份、材质与光向后，才可将本候选登记为 `UG-MAIN-CONCEPT-02` 基准。
  “进入 G4/G5 独立生产资产”属于当时旧流程编号，已被下述 v02 G2～G5 路线取代。
- FairyGUI 设计源、`.bin`、atlas、Cocos `.meta` 均未在本批创建。

## 审阅记录

- 2026-09-01：用户明确回复“审阅通过，继续下一步”。
- 本次批准锁定构图、综合色调、材质、光向、三名初始角色比例与厚重 UI 语言；不锁定运行时文字、数值、热区、状态轨含义或最终拆层。
- 原定的 FX-01/02、SPEC-01/02 与 SVG Master 已在 v01 形成候选，但人工视觉审阅结论为 `Needs revision`。
- 下一步：完成 G2 布局与几何裁定，在 G3 制作并批准 750×1624 无字黄金 target 与高分辨率源，再建立
  `main_bitmap_v02/asset-manifest.json`、runtime PNG 和 target ↔ composite 证据。
