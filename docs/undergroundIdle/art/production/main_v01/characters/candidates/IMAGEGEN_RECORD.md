# Underground Idle 主界面角色候选 — ImageGen 记录

日期：2026-09-01

阶段：旧流程 G4/G5 人工审稿候选；尚未批准为运行资产，也未进入 FairyGUI/Cocos。

生成方式：Codex 内置 ImageGen（`stylized-concept`）；每个角色独立生成。

## 1. 输入与范围

- 唯一视觉参考：`docs/undergroundIdle/art/ug_ui_main_concept_02.png`
- 参考图 SHA-256：`bff48175b39c5aca7c1f633bd36f423e8f8d29e0157e4d1056c110b2ebf01213`
- 参考图角色约束：格伦＝铁灰宽肩+大铁镐；诺拉＝橙棕背架+绳索；伊芙＝青绿轻装+提灯+地图筒。
- 公共约束：独立完整角色、2.5～3 头身、上左主光、无文字、无 UI、无地面、无投影、无光晕、真实透明背景。
- 本目录只保存候选和记录；未生成 rig、拆件、pivot、头像、图集或发布包。

## 2. 入选候选

| 角色 | 项目内候选 | ImageGen 原始输出 | 原始 SHA-256 | 选择理由 |
| --- | --- | --- | --- | --- |
| 格伦 | `ug_worker_glen_scene_candidate_v01.png` | `/Users/kimi/.codex/generated_images/01a058c6-2897-7881-b2e7-9c2f158efdc9/exec-1a36ebb8-aa80-444d-96a0-be5ee29b931c.png` | `723c729b7b70b6e3dcdb547da7ea88cae4214eef7b30e4586b82b0d4f73c68a4` | 铁灰宽肩、胡须、头灯和大铁镐身份清楚；双手握持与凿岩姿态完整。 |
| 诺拉 | `ug_worker_nora_scene_candidate_v01.png` | `/Users/kimi/.codex/generated_images/01a058c6-2897-7881-b2e7-9c2f158efdc9/exec-033c95c5-22cc-4cf6-94f0-f1c2881c0427.png` | `d5f5235f9a55fff3a047df2099e9f6d6ec480f76c068f3bec96a5789e8cbbc47` | 橙棕主色、装矿背架与粗绳形成强运输员轮廓；双手和绳圈完整。 |
| 伊芙 | `ug_worker_eve_scene_candidate_v01.png` | `/Users/kimi/.codex/generated_images/01a058c6-2897-7881-b2e7-9c2f158efdc9/exec-d1ecd579-10fc-4ceb-9493-a6854fefc085.png` | `03fd31d2b31335ac47041c0e4e43e5cde9e79ea0680e7f0ddf82f08052c04981` | 青绿轻装、辫发、提灯与地图筒均清楚；闲置勘察姿态稳定。 |

## 3. 最终提示词

### 3.1 格伦

```text
Use case: stylized-concept
Asset type: standalone full-body 2D game scene-character cutout candidate with genuine transparent RGBA
Primary request: Generate exactly one complete Underground Idle worker: Glen, the powerful rock breaker. This is a new candidate; use Image 1 only as the approved visual style, palette, material, lighting, and character-identity reference. Do not edit or crop Image 1 and do not reproduce its interface or environment.
Scene/backdrop: genuinely transparent canvas; alpha 0 everywhere outside the character; no visible background, grid, checkerboard, floor, rock, mine, platform, haze, vignette, or scenery.
Subject: Glen alone. Preserve the approved identity: compact broad-shouldered adult male chibi miner, sturdy iron-gray round mining helmet with one small circular headlamp, short dark-brown hair and rugged dark-brown moustache/beard, iron-gray padded work coat and trousers, brown leather gloves, belt and boots, and one oversized steel pickaxe with a warm walnut-wood handle. He is in a readable active rock-breaking pose, both hands naturally gripping the pickaxe raised diagonally, stable feet, determined friendly expression. Exactly two arms, two hands, two legs, two feet, one head, one helmet, one headlamp, and one pickaxe.
Style/medium: polished original Q-version hand-painted 2D game sprite art matching Image 1; compact 2.5–3-head-tall proportions; chunky simplified color planes; strong dark production outline; restrained painterly texture; clear cloth, leather, wood and steel materials; mobile-game silhouette readable at 64–96 px; not photorealistic and not 3D.
Composition/framing: one centered full-body figure in three-quarter view, entire helmet, pickaxe head and handle, fingers, coat, legs and boot soles fully visible; generous transparent padding on every side; no cropping; stable foot-center pivot.
Lighting/mood: restrained upper-left key light matching Image 1, subtle material highlights only; dependable adventurous tone.
Color palette: iron-gray and charcoal dominant, warm walnut-brown leather and wood, small muted brass headlamp details; do not shift Glen to orange-brown, teal, or cream.
Text: none.
Constraints: true transparent alpha, clean antialiased edges with no fringe; all four corners alpha 0; no cast shadow, drop shadow, contact shadow, floor shadow, glow, bloom or halo; no other character; no spare prop; no ore pile; no UI, frame, card, badge, labels, letters, numbers, logo, signature or watermark.
Avoid: baked checkerboard, solid-color backdrop, white outline, smoky aura, duplicated pickaxe, malformed hands, extra fingers or limbs, cropped boots or tool, tiny character within excessive empty canvas, redesigning Glen's helmet, main color, body silhouette, facial hair, or pickaxe.
```

### 3.2 诺拉

```text
Use case: stylized-concept
Asset type: standalone full-body 2D game scene-character cutout candidate with genuine transparent RGBA
Primary request: Generate exactly one complete Underground Idle worker: Nora, the strong transporter. This is a new candidate; use Image 1 only as the approved visual style, palette, material, lighting, and character-identity reference. Do not edit or crop Image 1 and do not reproduce its interface or environment.
Scene/backdrop: genuinely transparent canvas; alpha 0 everywhere outside the character; no visible background, grid, checkerboard, floor, rock, mine, platform, haze, vignette, or scenery.
Subject: Nora alone. Preserve the approved identity: compact athletic adult female chibi transporter, orange-brown round mining helmet with one small circular headlamp, auburn hair gathered behind the helmet, orange-brown work tunic and trousers, brown leather gloves, belt and boots, a sturdy wicker-and-wood ore backpack frame visibly loaded with a modest amount of dark ore, and one thick coiled work rope. She is in a readable active transport pose, leaning slightly with balanced feet, both hands naturally controlling the rope in front of her, confident friendly expression. The backpack and rope must create the clear transporter silhouette. Exactly two arms, two hands, two legs, two feet, one head, one helmet, one headlamp, one backpack frame, and one continuous rope coil.
Style/medium: polished original Q-version hand-painted 2D game sprite art matching Image 1; compact 2.5–3-head-tall proportions; chunky simplified color planes; strong dark production outline; restrained painterly texture; clear cloth, leather, wicker, wood, rope and ore materials; mobile-game silhouette readable at 64–96 px; not photorealistic and not 3D.
Composition/framing: one centered full-body figure in three-quarter view, entire helmet, hair, rope, backpack frame, fingers, legs and boot soles fully visible; generous transparent padding on every side; no cropping; stable foot-center pivot.
Lighting/mood: restrained upper-left key light matching Image 1, subtle material highlights only; dependable adventurous tone.
Color palette: burnt orange and warm ochre-brown dominant, dark walnut leather and wicker, charcoal ore, tiny muted brass headlamp details; do not shift Nora to iron-gray, teal, or cream.
Text: none.
Constraints: true transparent alpha, clean antialiased edges with no fringe; all four corners alpha 0; no cast shadow, drop shadow, contact shadow, floor shadow, glow, bloom or halo; no other character; no loose ore pile outside the backpack; no extra tool; no UI, frame, card, badge, labels, letters, numbers, logo, signature or watermark.
Avoid: baked checkerboard, solid-color backdrop, white outline, smoky aura, duplicated rope or backpack, malformed hands, extra fingers or limbs, cropped boots or props, tiny character within excessive empty canvas, redesigning Nora's helmet, main color, hair, backpack silhouette, or rope.
```

### 3.3 伊芙

```text
Use case: stylized-concept
Asset type: standalone full-body 2D game scene-character cutout candidate with genuine transparent RGBA
Primary request: Generate exactly one complete Underground Idle worker: Eve, the lightweight exploration specialist. This is a new candidate; use Image 1 only as the approved visual style, palette, material, lighting, and character-identity reference. Do not edit or crop Image 1 and do not reproduce its interface or environment.
Scene/backdrop: genuinely transparent canvas; alpha 0 everywhere outside the character; no visible background, grid, checkerboard, floor, rock, mine, platform, haze, vignette, or scenery.
Subject: Eve alone. Preserve the approved identity: light compact adult female chibi scout, teal round mining helmet with one small circular headlamp, warm auburn hair in a practical side braid/low ponytail, teal lightweight work jacket and trousers with restrained orange-brown leather straps, gloves, belt and boots, one small hand lantern and one rolled map tube. She stands in a relaxed alert idle pose, lantern held low in one hand and map tube held clearly in the other, curious capable friendly expression. The lantern and map tube must both be instantly readable and separate. Exactly two arms, two hands, two legs, two feet, one head, one helmet, one headlamp, one hand lantern, and one map tube.
Style/medium: polished original Q-version hand-painted 2D game sprite art matching Image 1; compact 2.5–3-head-tall proportions; chunky simplified color planes; strong dark production outline; restrained painterly texture; clear cloth, leather, paper, brass and glass materials; mobile-game silhouette readable at 64–96 px; not photorealistic and not 3D.
Composition/framing: one centered full-body figure in three-quarter view, entire helmet, hair, lantern handle and body, map tube, fingers, legs and boot soles fully visible; generous transparent padding on every side; no cropping; stable foot-center pivot.
Lighting/mood: restrained upper-left key light matching Image 1, subtle material highlights only; dependable adventurous tone. The lantern glass may contain a small controlled amber core, but there must be no emitted light spill or external halo.
Color palette: deep teal and muted blue-green dominant, orange-brown leather and hair, small warm amber/brass lamp accents; do not shift Eve to iron-gray, orange-brown dominant, or cream.
Text: none.
Constraints: true transparent alpha, clean antialiased edges with no fringe; all four corners alpha 0; no cast shadow, drop shadow, contact shadow, floor shadow, glow, bloom or halo; no other character; no spare prop; no ore pile; no UI, frame, card, badge, labels, letters, numbers, logo, signature or watermark.
Avoid: baked checkerboard, solid-color backdrop, white outline, smoky aura, duplicated lantern or map, malformed hands, extra fingers or limbs, cropped boots or props, tiny character within excessive empty canvas, redesigning Eve's helmet, main color, hair, light silhouette, lantern, or map tube.
```

## 4. 透明背景修正

三次初始调用都返回了无 Alpha 的 RGB PNG，并把浅灰棋盘烘焙进像素。格伦另执行一次只改背景的
`background-extraction` 内置 ImageGen 尝试；输出
`/Users/kimi/.codex/generated_images/01a058c6-2897-7881-b2e7-9c2f158efdc9/exec-fd0f1869-6577-4bb1-af05-2123a5c2f56c.png`
仍为 RGB，且发生轻微重绘，因此拒绝采用。该拒绝输出 SHA-256 为
`73016035333bec08e9b2e72aa9bf6f83b5140361810ed0c681bb903910fc813d`。

按 `main_v01/IMAGEGEN_PROMPTS.md` 的允许路径，对入选初始图只做机械 Alpha 重建：

1. 用 ImageMagick 以 `12%` fuzz 从画布边缘浅色中性背景 flood-fill 到 Alpha 0；
2. 对被闭合道具包围、无法与边缘连通的棋盘空洞，逐个从确认过的中性背景像素 flood-fill：诺拉绳圈
   `(923,685)`、`(869,876)`、`(942,807)`、`(845,680)`、`(735,712)`；伊芙提灯把手 `(280,875)`；
3. 不裁切、不缩放、不改色；将结果复制为本目录三张候选；
4. 将最终文件关闭 Alpha 后与各自 ImageGen 原始图逐像素比较，三张 RGB `AE=0`，确认主体 RGB 未改变。

## 5. 文件与 Alpha 审计

| 文件 | 画布 | 通道 | 非透明包围框 | Alpha 范围 | 四角 Alpha | RGB AE | SHA-256 |
| --- | ---: | --- | --- | --- | --- | ---: | --- |
| `ug_worker_glen_scene_candidate_v01.png` | 1254×1254 | sRGBA 8-bit | `903x1072+158+76` | `0..1` | `0,0,0,0` | 0 | `c0e5e631c6179c10f9aa3fb7f9623db331b5db8b62dfddd77f03274af777afa6` |
| `ug_worker_nora_scene_candidate_v01.png` | 1254×1254 | sRGBA 8-bit | `862x1089+192+85` | `0..1` | `0,0,0,0` | 0 | `e0b5e39d3ecf3508a06d81d6b8dad08af44f8bdf00618db05fc3bd17134fbb0f` |
| `ug_worker_eve_scene_candidate_v01.png` | 1125×1398 | sRGBA 8-bit | `628x1079+219+152` | `0..1` | `0,0,0,0` | 0 | `ddc7cc54cb64c5579cb4c05a8874adb1bcd9f4fad5ed586fb307a1073dc7a93b` |

补充检查：

- 三张均为单一完整角色，无文字、数字、徽标、UI、地面、投影或外部光晕；
- 诺拉全部绳圈空洞和伊芙提灯把手空洞已复核为透明，未残留白色棋盘；
- 在高对比洋红底上检查外轮廓、发丝、手指、绳索、提灯与铁镐，未见背景块或断裂；
- 以可见包围框缩至 96 px 高复核，三人的铁镐/背架绳索/提灯地图筒轮廓仍可区分；
- 当前仍是审稿候选。进入运行资产前必须由人工确认身份与动作，并另做统一 `512×768` 归一化、pivot、拆件和边缘外扩审计。
