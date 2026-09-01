# Main v01 · Stage-01 building candidate ImageGen record

> Date: 2026-09-01<br>
> Mode: Codex built-in ImageGen, one generation call per asset<br>
> Status: review candidates only; not selected, normalized, promoted to ART-03, or referenced by FairyGUI/Cocos

## Shared input and production boundary

- Style reference: `docs/undergroundIdle/art/ug_ui_main_concept_02.png`
- Reference role: approved palette, outline, material, lighting, and Q-style rendering reference only; it was not edited or cropped as a production source.
- All three candidates were generated independently. No generated candidate was used as an input to another candidate.
- The built-in generator returned `1254x1254` RGB PNG files with a baked pale checker preview even though genuine transparency was requested. The generated source files remain under Codex's default generated-image directory and were not copied into the project.
- The project candidates below reconstruct only background alpha. They preserve the generated subject RGB and native square canvas. They have not yet been normalized to ART-03's planned `1536x1536` delivery canvas or pivot `[768,1504]`.

## Deterministic alpha cleanup

The same non-generative cleanup was applied to every source:

1. Build a near-white mask from the minimum RGB channel with an `86%` threshold.
2. Use 4-connected components with `area-threshold=120` and `mean-color=true`, so large exterior and enclosed checker regions are removed while small neutral material highlights remain.
3. Invert the mask to foreground alpha.
4. Erode the foreground alpha by `Diamond:1`, blur it with `0x0.7`, then multiply it by the original foreground mask. This produces an inside-only antialiased edge and does not introduce alpha outside the detected silhouette.
5. Copy the resulting opacity onto the unchanged generated RGB, strip generator metadata, and export 8-bit sRGB RGBA PNG.

This step removed the baked checker from exterior space and enclosed openings, including the mine opening and the hoist's frame, rope, pulley, and cage gaps. It did not redraw, recolor, move, resize, or add subject details.

## Mine

- Candidate: `ug_building_mine_stage_01_candidate_v01.png`
- Built-in source: `/Users/kimi/.codex/generated_images/01a058d2-ecc6-72c1-b55b-082d86dadfff/exec-ffe0fdd4-0177-4fd4-b1bd-3258791dfc99.png`
- Source SHA-256: `eef318724a0e1ecbe55a74cdac34de04b4f8ab5265b97a359bfc68d237224a4a`
- Candidate SHA-256: `a0ba37436cb819e0680d13d90800f7d14cdb19b8a7c48e09a604bc597c180a56`

```text
Use case: stylized-concept
Asset type: standalone transparent 2D game building cutout, Underground Idle Stage 01 mine
Primary request: Generate exactly one crude first-stage mine building sprite: a simple hand-cranked rock-drilling machine integrated with a rough timber mine-mouth frame and a small exposed ore vein. The drill must visibly read as manually operated, not electric. Do not include any character or mine cart.
Input images: Image 1 is the approved Underground Idle main-screen concept and is a style, palette, material, outline, and lighting reference only; do not copy the whole screen or any UI.
Scene/backdrop: genuinely transparent RGBA outside the building; no cave scene, wall, floor, ground strip, vignette, or preview checkerboard.
Subject: one compact Stage-01 mine structure made mainly of irregular walnut timber beams, charcoal rock, old dark iron, a tiny restrained amount of worn brass hardware, one basic crank, one crude drill bit, and a sparse faceted ore seam. Keep it visibly primitive and low-capacity.
Style/medium: original Q-style hand-painted 2D game sprite matching Image 1; chunky simplified planes, strong dark charcoal outer contour, limited bevels and highlights, restrained medium detail, readable materials at small runtime size.
Composition/framing: square production canvas; straight-on frontal orthographic view; one complete centered silhouette with generous transparent padding; full roof/top, both sides, drill, ore vein, support feet, and full base visible; stable bottom-center pivot; no cropping.
Lighting/mood: restrained upper-left material highlight consistent with Image 1; unlit object presentation; no emitted light, glow, bloom, cast shadow, drop shadow, or ground shadow.
Color palette: charcoal #182129/#35434D, walnut #8A5B3D, old iron, restrained brass #C88A3D, sparse warm ochre ore facets.
Text: none.
Constraints: true transparent alpha in all exterior open space and all four corners; clean antialiased edges with no pale halo; exactly one building; complete closed readable outline; Stage 01 only with minimal metal fittings and no powered upgrades.
Avoid: characters, people, miner, mine cart, wagon, rails, loose props, crates, UI, card frame, buttons, labels, signs, numbers, letters, logos, watermark, floor plane, terrain base, rock pedestal, checkerboard, white field, fog, haze, particles, projection shadow, perspective turntable, isometric angle, multiple stages, advanced motor, pipes, lamp array, decorative banner.
```

Visual identity check: one frontal timber mine-mouth structure, manual crank and drill, exposed ore vein; no character, mine cart, powered motor, text, UI, floor, or shadow.

## Hoist

- Candidate: `ug_building_hoist_stage_01_candidate_v01.png`
- Built-in source: `/Users/kimi/.codex/generated_images/01a058d2-ecc6-72c1-b55b-082d86dadfff/exec-c08c113c-ae05-465b-9738-91a264475ad0.png`
- Source SHA-256: `486c237e5e2ac3ed50c1b16694ebeb9d3208a68d18642d56ecfb70271aba0d7e`
- Candidate SHA-256: `224a53c27565fe42131b8a97a40886aea6f52f53f9e13637719316fb53dee6d9`

```text
Use case: stylized-concept
Asset type: standalone transparent 2D game building cutout, Underground Idle Stage 01 hoist
Primary request: Generate exactly one crude first-stage mine hoist sprite: a simple rough timber support frame with a manually operated wooden-and-old-iron winch drum, visible crank, two taut ropes, and one small open rope lift cage hanging beneath. Keep it primitive, plausible, and low-capacity.
Input images: Image 1 is the approved Underground Idle main-screen concept and is a style, palette, material, outline, and lighting reference only; do not copy the whole screen or any UI.
Scene/backdrop: genuinely transparent RGBA outside the building; no cave scene, wall, floor, ground strip, vignette, or preview checkerboard.
Subject: one tall but compact Stage-01 hoist made mainly of irregular walnut timber posts and braces, coarse rope, old dark iron joint plates, tiny restrained worn-brass fasteners, one manual crank/winch, and one complete empty wooden rope cage. No powered motor or advanced machinery.
Style/medium: original Q-style hand-painted 2D game sprite matching Image 1; chunky simplified planes, strong dark charcoal outer contour, limited bevels and highlights, restrained medium detail, readable materials at small runtime size.
Composition/framing: square production canvas; straight-on frontal orthographic view; exactly one complete centered silhouette with generous transparent padding; full top beam, crank, rope path, both side posts, entire cage, support feet, and full base visible; stable bottom-center pivot; no cropping.
Lighting/mood: restrained upper-left material highlight consistent with Image 1; unlit object presentation; no emitted light, glow, bloom, cast shadow, drop shadow, or ground shadow.
Color palette: charcoal #182129/#35434D, walnut #8A5B3D, old iron, restrained brass #C88A3D, tan rope.
Text: none.
Constraints: true transparent alpha in all exterior open space, between ropes/frame/cage, and all four corners; clean antialiased edges with no pale halo; exactly one hoist; complete closed readable outline; Stage 01 only with minimal metal fittings.
Avoid: characters, people, miner, ore, cargo, mine cart, rails, loose props, crates, UI, card frame, buttons, labels, signs, numbers, letters, logos, watermark, floor plane, terrain base, rock pedestal, checkerboard, white field, fog, haze, particles, projection shadow, perspective turntable, isometric angle, multiple stages, powered motor, electric parts, pipes, ladder array, lamp array, decorative banner.
```

Visual identity check: one frontal timber frame, manual crank/winch, two ropes, pulley, and one empty open cage; no character, cargo, motor, text, UI, floor, or shadow.

## Warehouse

- Candidate: `ug_building_warehouse_stage_01_candidate_v01.png`
- Built-in source: `/Users/kimi/.codex/generated_images/01a058d2-ecc6-72c1-b55b-082d86dadfff/exec-823341d1-8aa9-4e4d-a53b-3ef96682225a.png`
- Source SHA-256: `65358d286a3b2506cd95ed050368480616366240522581614b379d8892a726e7`
- Candidate SHA-256: `35d6c29e19f5d6d3d40d8e21b5022daf4dc201eaa76989b45161c959ca4c7e04`

```text
Use case: stylized-concept
Asset type: standalone transparent 2D game building cutout, Underground Idle Stage 01 warehouse
Primary request: Generate exactly one crude first-stage mine warehouse sprite: a small rough timber storage facade with a simple closed wooden double door and only a few modest wooden crates indicating approximately five-percent initial storage. Do not show a number, gauge, progress bar, or other UI.
Input images: Image 1 is the approved Underground Idle main-screen concept and is a style, palette, material, outline, and lighting reference only; do not copy the whole screen or any UI.
Scene/backdrop: genuinely transparent RGBA outside the building; no cave scene, wall, floor, ground strip, vignette, or preview checkerboard.
Subject: one squat compact Stage-01 warehouse made mainly of irregular walnut timber boards and beams, a crude peaked or shallow timber lintel, old dark iron hinges and corner plates, tiny restrained worn-brass fasteners, one plain closed double door, plus exactly three small crates clustered neatly beside the entrance. Crates are sparse and mostly empty-looking, conveying about 5% capacity without any gauge.
Style/medium: original Q-style hand-painted 2D game sprite matching Image 1; chunky simplified planes, strong dark charcoal outer contour, limited bevels and highlights, restrained medium detail, readable materials at small runtime size.
Composition/framing: square production canvas; straight-on frontal orthographic view; exactly one complete centered building silhouette with generous transparent padding; full roof/lintel, both side walls, doors, three crates, support feet, and full base visible; stable bottom-center pivot; no cropping.
Lighting/mood: restrained upper-left material highlight consistent with Image 1; unlit object presentation; no emitted light, glow, bloom, cast shadow, drop shadow, or ground shadow.
Color palette: charcoal #182129/#35434D, walnut #8A5B3D, old iron, restrained brass #C88A3D.
Text: none.
Constraints: true transparent alpha in all exterior open space, around the building/crates, and all four corners; clean antialiased edges with no pale halo; exactly one warehouse; complete closed readable outline; Stage 01 only with minimal metal fittings; exactly three crates and no visible ore pile.
Avoid: characters, people, miner, mine cart, rails, loose ore, sacks, barrels, more than three crates, UI, capacity bar, meter, percentage, card frame, buttons, labels, signs, numbers, letters, logos, watermark, floor plane, terrain base, rock pedestal, checkerboard, white field, fog, haze, particles, projection shadow, perspective turntable, isometric angle, multiple stages, reinforced steel facade, powered machinery, pipes, lamp array, decorative banner.
```

Visual identity check: one frontal closed timber warehouse with exactly three small crates, visually sparse storage; no ore pile, percentage, gauge, character, text, UI, floor, or shadow.

## QA results

| Candidate | PNG | Alpha | Visible alpha bbox | Four corners | Identity / exclusions |
| --- | --- | --- | --- | --- | --- |
| mine | `1254x1254`, 8-bit sRGB RGBA | `0..1`, 67 alpha values | `959x975+144+140` | all `A=0` | pass |
| hoist | `1254x1254`, 8-bit sRGB RGBA | `0..1`, 79 alpha values | `930x1140+118+62` | all `A=0` | pass |
| warehouse | `1254x1254`, 8-bit sRGB RGBA | `0..1`, 64 alpha values | `1068x927+87+163` | all `A=0` | pass |

Additional visual QA was performed on transparent-preview, `#182129` dark-cavern, and high-contrast magenta backgrounds. All complete silhouettes fit within the canvas with positive padding on every side. No visible checker residue, pale halo, cropping, baked text, sign writing, UI, character, watermark, emitted glow, cast shadow, or ground plane was found.
An alpha-disabled ImageMagick `AE` comparison between each generated source and its project candidate returned `0`, confirming that cleanup did not change RGB pixels.

The candidates remain intentionally unpromoted. Human selection is required before any 1536-square same-pivot normalization, ART-03 manifest entry, master-page placement, FairyGUI assembly, or Cocos import.
