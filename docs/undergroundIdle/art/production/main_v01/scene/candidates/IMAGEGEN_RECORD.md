# Main v01 场景候选 ImageGen 记录

> 日期：2026-09-01<br>
> 状态：旧流程 G4/G5 场景拆层候选，现为 v01 `Needs revision` 历史证据；不是 Production-ready<br>
> 工具：Codex 内置 ImageGen<br>
> 参考：docs/undergroundIdle/art/ug_ui_main_concept_02.png

参考图仅用于锁定已批准的手绘风格、综合色板、正视矿井剖面、材质和光向，不是编辑目标，也没有从中裁切
运行资产。三个内容层分别调用 ImageGen；背景、结构和灯效没有在同一次调用中混合生成。

## 交付文件

| 文件 | 角色 | 尺寸/Alpha | 当前结论 |
| --- | --- | --- | --- |
| ug_main_00_background_candidate_v01.png | 00_BACKGROUND 候选 | 750×1624，RGB，全幅不透明 | 只含远景岩壁与深度渐变 |
| ug_main_10_structure_candidate_v01.png | 10_STRUCTURE 候选 | 750×1624，RGBA | 三层木梁/轨道/绳索/右侧空井架；四角 8×8 Alpha 均为 0 |
| ug_main_60_light_fx_candidate_v01.png | 60_LIGHT_FX 候选 | 750×1624，RGBA | 暖/冷光效；四角 8×8 Alpha 均为 0 |
| ug_main_00_background_candidate_v01_source.png | ImageGen 原始输出 | 853×1844，RGB | 原始候选，保留用于溯源 |
| ug_main_10_structure_candidate_v01_source.png | ImageGen 原始输出 | 853×1844，RGB | 生成器把棋盘烘焙进 RGB；不可直接使用 |
| ug_main_10_structure_candidate_v01_alpha_edit.png | ImageGen 背景提取重试 | 852×1846，RGB | 仍无 Alpha；仅作为修正来源与失败证据 |
| ug_main_60_light_fx_candidate_v01_source.png | ImageGen 原始输出 | 853×1844，RGB | 生成器把深色棋盘烘焙进 RGB；不可直接使用 |
| ug_main_60_light_fx_candidate_v01_alpha_edit.png | ImageGen 背景提取重试 | 853×1844，RGB | 改成浅色棋盘但仍无 Alpha；仅作为修正来源与失败证据 |

## 参考图角色

- Image 1：docs/undergroundIdle/art/ug_ui_main_concept_02.png
- 角色：已批准视觉参考，只约束风格、综合色板、材质、光向、正视构图和大致层级。
- 禁止：把 Image 1 作为编辑目标，或从它直接裁切背景、结构、灯光、角色、UI 和文字。

## 1. 远景岩壁提示词

~~~text
Use case: stylized-concept
Asset type: independent deepest-background layer candidate for a portrait 2D mobile game scene
Primary request: Create one original, production-oriented, full-canvas underground mine rock-wall background for the Underground Idle main scene. Compose for the exact 750×1624 portrait aspect ratio so it can later be scaled exactly to 1500×3248.
Input images: Image 1 is an approved visual reference only for palette, hand-painted rendering language, rock treatment, and restrained upper-left light direction. It is not an edit target. Do not copy or include its UI, characters, platforms, props, equipment, architecture, or borders.
Scene/backdrop: full-bleed opaque charcoal cavern wall and deep vertical depth gradient; three broad, low-frequency geological bands that become subtly darker and cooler toward the bottom; continuous rock coverage from every edge to every edge with no open transparent holes.
Subject: only distant rock wall, broad shadow masses, subtle large cracks and restrained depth haze integrated into the rock.
Style/medium: original Q-version hand-painted 2D game environment art; chunky simplified planes; strong readable low-frequency shapes; restrained texture; mobile-game clarity; straight-on orthographic mine cutaway backing.
Composition/framing: very tall narrow portrait, exact 750:1624 ratio, full canvas coverage, no frame or margin; visual rhythm should support three future stacked work levels without drawing actual shelves or horizontal structural beams.
Lighting/mood: dark but readable; very subtle upper-left ambient shaping only; no visible light source, glow, bloom, spotlight, bright focal point, or cast light patch.
Color palette: #182129 deepest charcoal through #35434D rock midtone, with extremely restrained cool teal variation only in the deepest lower band.
Materials/textures: broad faceted rock planes, sparse large cracks, no high-frequency pebble noise.
Text: none.
Constraints: background layer only; output must be fully opaque edge-to-edge; no transparency; no cave opening; no timber, beams, platforms, rails, pipes, ropes, chains, buildings, doors, elevator shaft, elevator cage, carts, ore chunks, tools, characters, lamps, light fixtures, light effects, UI, panels, frames, icons, text, numbers, pseudo-writing, logo, signature, or watermark.
Avoid: foreground silhouettes, architecture, symmetrical framing, bright turquoise portal, horror, photorealism, 3D render, tiled texture look, noisy gravel, vignette border, phone frame, checkerboard.
~~~

原始默认输出：

/Users/kimi/.codex/generated_images/01a058c6-5eac-74c1-9aa4-972927faf0f2/exec-2dc4a3c0-bf11-46f5-99c9-b5d2dbb83b2e.png

结果没有透明通道，符合背景层要求。最终候选只做确定性缩放到 750×1624、移除元数据和转为 sRGB。

## 2. 结构层提示词

~~~text
Use case: stylized-concept
Asset type: standalone full-canvas transparent 2D game structure layer candidate
Primary request: Create one original structural overlay for the Underground Idle main screen on an exact 750×1624 portrait-aspect canvas, suitable for later exact scaling to 1500×3248. Generate only the fixed mine structure: three straight-on stacked timber work platforms with support posts and braces, old steel rail tracks integrated along the platform floors, fixed rope/cable lines, and the structural frame of a tall elevator shaft on the right.
Input images: Image 1 is the approved visual reference only for hand-painted style, palette, material language, line weight, straight-on mine-cutaway composition, and approximate scene placement. It is not an edit target. Do not reproduce its UI, characters, equipment, buildings, lamps, doors, carts, or text.
Scene/backdrop: genuinely transparent RGBA everywhere outside the structural pixels; no cave wall, no darkness field, no painted backdrop, no checkerboard.
Subject: three rugged walnut timber platforms and their posts/braces across the central mine viewport; short sections of worn dark steel rails on the platform floors; weathered fixed rope and old steel guide cable; a tall open shaft frame at the right edge built from timber and restrained steel brackets. The shaft must be empty: structural uprights, cross braces, and guide lines only.
Style/medium: original Q-version hand-painted 2D game environment art; chunky simplified planes; strong dark production outline; clear material separation between walnut wood, old steel, rope, and sparse brass fasteners; restrained internal texture; mobile-readable.
Composition/framing: exact 750:1624 full canvas. Keep the upper interface area approximately the top 23% fully transparent and the lower metric/navigation area approximately the bottom 20% fully transparent. Confine the structural mine stage to the middle viewport. Straight-on orthographic cutaway, not isometric. Three horizontal work levels should align with the approved scene rhythm, with the empty elevator shaft occupying the right side. Extend edge-touching structure slightly beyond left/right canvas edges to avoid seams, but do not crop important interior joints.
Lighting/mood: neutral restrained upper-left material highlight only; no emitted light, glow, bloom, cast shadow, or ground shadow.
Color palette: walnut #8A5B3D, dark steel near #35434D, restrained aged brass #C88A3D, deep outline near #182129.
Materials/textures: simplified wood grain, worn steel edges, twisted rope; sparse bolts and brackets only.
Text: none.
Constraints: actual transparent alpha outside the complete structure; all four canvas corners alpha 0; clean antialiased edges; structure only. No rock wall, cave background, ground fill, dark vignette, mine opening, ore seam, building facade, warehouse, guild hall, elevator cage, hoist platform, winch, pulley mechanism, machinery, pipes, minecart, ore, crates, barrels, doors, gates, chains, locks, lamps, light fixtures, characters, tools, UI, panels, borders, icons, text, numbers, pseudo-writing, logo, signature, or watermark.
Avoid: baked checkerboard, solid black background, presentation board, card frame, diorama, perspective camera, isometric view, 3D render, overly dense rivets, splinters or high-frequency texture, architectural clutter, duplicate platforms, foreground rock silhouettes.
~~~

原始默认输出：

/Users/kimi/.codex/generated_images/01a058c6-5eac-74c1-9aa4-972927faf0f2/exec-20b82d45-6548-4cb8-8356-13c8cb745c8c.png

### 2.1 背景提取重试

~~~text
Use case: background-extraction
Asset type: corrected transparent structure-layer candidate
Input images: Image 1 is the edit target.
Primary request: Change only the exterior background alpha. Remove every light gray and white checkerboard square and every background-field pixel from Image 1. Output the same complete mine structure on genuinely transparent RGBA.
Critical invariants: preserve the exact timber platforms, posts, braces, rails, ropes, guide cables, right-side elevator-shaft frame, their pixel positions, scale, crop, outlines, colors, highlights, and material texture. Do not move, resize, redraw, recolor, simplify, add, or remove any structural part.
Alpha requirement: all open space between and around the structural pieces and all four canvas corners must be alpha 0. Preserve clean antialiased edge pixels belonging to timber, rope, cable, rails, bolts, and brackets. Do not leave a checkerboard, white field, gray field, vignette, halo, cast shadow, or haze in RGB/alpha.
Text: none.
Constraints: exactly one unchanged structure layer; genuine transparent background; no new object, backdrop, rock wall, UI, text, number, icon, logo, signature, or watermark.
~~~

重试默认输出：

/Users/kimi/.codex/generated_images/01a058c6-5eac-74c1-9aa4-972927faf0f2/exec-d6d72343-8d9f-4c53-b422-2d9ae598b524.png

重试仍为 RGB 棋盘底。最终候选从重试图确定性重建 Alpha：以连接画布的近白中性底为背景，按白底距离建立
连续 Alpha，并按白色 matte 的反合成恢复半透明边缘颜色；透明像素 RGB 归零，四个 8×8 角块强制透明，
最后缩放为 750×1624 sRGB。该步骤没有增加、移动或重绘任何结构对象。

## 3. 灯效层提示词

~~~text
Use case: stylized-concept
Asset type: standalone full-canvas transparent 2D game lighting-effects layer candidate
Primary request: Create one restrained lighting-effects overlay for the Underground Idle main mine scene on an exact 750×1624 portrait-aspect canvas, suitable for later exact scaling to 1500×3248. Generate only soft light, dust, and atmosphere pixels that can be composited using screen/additive-style blending.
Input images: Image 1 is the approved visual reference only for palette, approximate mine-stage placement, upper-left lighting direction, and balance between warm work lights and cool deep-gate light. It is not an edit target. Do not include or redraw its UI, scene geometry, characters, props, lamps, or text.
Scene/backdrop: genuinely transparent RGBA everywhere outside the light-effect pixels; no black field, no cave wall, no checkerboard.
Subject: three small, controlled amber work-light halos at the upper, middle, and lower work levels; one very restrained warm rim near the right-side hoist zone; a subdued cool teal depth mist and narrow edge glow in the lower-right deep-gate zone; a sparse handful of tiny warm dust motes around the active work areas. The cool light must remain clearly secondary to the warm work lights.
Style/medium: soft hand-painted 2D game FX masks with feathered gradients and restrained painterly breakup; production-oriented isolated overlay.
Composition/framing: exact 750:1624 full canvas. Keep the upper interface area approximately the top 23% fully transparent and the lower metric/navigation area approximately the bottom 20% fully transparent. Confine all visible FX to the middle mine viewport, aligned to the approved scene's three work levels and lower-right locked depth entrance. Large portions of the canvas must remain alpha 0.
Lighting/mood: warm, reliable, busy but calm; no horror; low-intensity teal depth accent; no central spotlight and no full-screen bloom.
Color palette: warm amber #F3BE58 with sparse orange #C88A3D; cool teal #57C7BE at much lower intensity.
Text: none.
Constraints: actual transparent alpha; all four canvas corners alpha 0; clean feathered alpha gradients; FX pixels only. No lamp fixtures, bulbs, lantern silhouettes, beams, wood, rails, ropes, shaft, cage, buildings, doors, chains, locks, carts, ore, crates, characters, tools, UI, panels, borders, icons, text, numbers, pseudo-writing, logo, signature, or watermark. No opaque black or colored background.
Avoid: baked checkerboard, solid background, presentation board, lens flare, starburst, giant particles, dense dust, smoke filling the screen, overbright portal, neon cyberpunk, fire, sparks shower, hard-edged colored blobs, vignette, cast shadows, 3D render.
~~~

原始默认输出：

/Users/kimi/.codex/generated_images/01a058c6-5eac-74c1-9aa4-972927faf0f2/exec-59481c40-ebc7-473d-8da4-a2607cb31d40.png

### 3.1 背景提取重试

~~~text
Use case: background-extraction
Asset type: corrected transparent light-FX layer candidate
Input images: Image 1 is the edit target.
Primary request: Remove every checkerboard square and every neutral gray background-field pixel from Image 1, changing only the exterior/background alpha. Output only the existing warm amber halos and motes plus the existing cool teal lower-right glow on genuinely transparent RGBA.
Critical invariants: preserve the existing warm/cool light placement, hue, brightness hierarchy, softness, scale, and canvas crop. Do not move, resize, redraw, recolor, intensify, duplicate, add, or remove any actual amber or teal light effect. The teal light must remain secondary.
Alpha requirement: all non-FX open space and all four canvas corners must be alpha 0. Feather every halo smoothly to alpha 0. Remove the baked checkerboard, neutral gray smoky field, dark background, vignette, and any neutral checker pattern completely; do not leave gray haze or a halo around the canvas.
Text: none.
Constraints: FX pixels only on genuine transparent background; no black or colored backing field; no geometry, object, lamp fixture, character, UI, text, icon, logo, signature, or watermark.
~~~

重试默认输出：

/Users/kimi/.codex/generated_images/01a058c6-5eac-74c1-9aa4-972927faf0f2/exec-8c9d36e2-dfbd-4697-90d7-bb01f64bb459.png

重试仍为 RGB 棋盘底。最终候选从重试图的暖/冷色差信号确定性重建两个 Alpha mask：去除中性棋盘和中性
烟雾，以 8 px 高斯模糊平滑边缘，暖光最大不透明度约 22%，冷光约 15%，分别使用 #F3BE58 与 #57C7BE，
再合成、清零透明像素 RGB 并缩放为 750×1624 sRGB。该处理保留 ImageGen 给出的光区位置和形状，不新增灯具
或场景对象。实际 screen blend 强度仍需在 Creator Gallery 中复测。

## 自动检查

最终候选检查结果：

| 文件 | 尺寸 | hasAlpha | Alpha 范围/均值 | 四角 8×8 |
| --- | --- | --- | --- | --- |
| ug_main_00_background_candidate_v01.png | 750×1624 | no | 全幅不透明 | 四角均为有效岩壁像素 |
| ug_main_10_structure_candidate_v01.png | 750×1624 | yes | 0～1，mean 0.391305 | TL/TR/BL/BR max 均为 0 |
| ug_main_60_light_fx_candidate_v01.png | 750×1624 | yes | 0～0.219608，mean 0.0299746 | TL/TR/BL/BR max 均为 0 |

视觉检查：

- 远景只有低频岩壁、深度衰减与克制的下层冷色，不含梁轨、建筑、设备、角色、UI、文字或发光源；
- 结构为正视三层木平台、旧轨、绳索/导缆和右侧空升降机井架，不含笼体、绞盘、灯具、建筑、角色、UI
  或文字；
- 灯效仅保留暖色工作区和右下冷色深层光，不含灯具本体、几何、角色、UI 或文字；
- ImageGen 没有严格服从“顶部约 23% / 底部约 20% 全透明”的坐标约束：结构候选占用了大部分竖向画布，
  灯效位置也只能视为近似。因此本批只可用于选风格、材质和结构语言，不能直接登记为同画布最终层；母版制作时
  必须重新排布到中央场景 Mask，并重新验证上下固定 UI 区域为透明；
- 三张图均为候选，不得直接复制为正式 ART-01 运行资产；需先人工选片、在同画布母版中确定最终位置，
  再按 manifest、FairyGUI 和 Creator 流程验收。

## SHA-256

~~~text
5b4a5033b8b2aa2683c433c68d696e21041904d2261ab655b904e444d64d6ecc  ug_main_00_background_candidate_v01.png
7e45db77497d69668745285312873bbbe4eadb952a4eba6eee10540017ef6844  ug_main_00_background_candidate_v01_source.png
1bf2e7fc4fd3331d44e0b1c39289064900fc856c218361e30bd844d8d26a2685  ug_main_10_structure_candidate_v01.png
ef6e0f6f7d8b2768f14a3fc65f1e71ccbe3e3668c4529e8624effec84f460180  ug_main_10_structure_candidate_v01_alpha_edit.png
df2e39951dca18d08c28ca4145a09fb48d21de1eaf0d68e8546e7517b6819d14  ug_main_10_structure_candidate_v01_source.png
e62137ed82ebfc0890bbf6b5a59c40d7f4112e59f61836fb229825f4c6ec9245  ug_main_60_light_fx_candidate_v01.png
a223f79121eae21de1da5d883125524d28d1ccf8acd7fe3e2079d0f8423d941d  ug_main_60_light_fx_candidate_v01_alpha_edit.png
acb69c24324e1ea26cb35d84e0737a49a38cfdc274afa9b5151af91d6163e482  ug_main_60_light_fx_candidate_v01_source.png
~~~
