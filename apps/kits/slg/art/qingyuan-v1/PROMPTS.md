# 青原仙洲 v1 · 生成提示词

生成方式：内置 imagegen；日期：2026-09-10。前一轮青原仙洲全域概念图仅作风格参考。

## terrain

```text
Use case: stylized-concept
Asset type: Production-oriented TERRAIN TEXTURE ATLAS, six flat ground textures for a reusable Chinese xianxia SLG world. Landscape 3:2 canvas, requested 1536x1024.
Input images: Image 1 is STYLE AND COLOR REFERENCE ONLY, not an edit target. Derive matching game-art materials, do not reproduce the map composition.
Primary request: Exactly THREE equal columns and TWO equal rows of square ground-texture cells filling the entire image. NO spacing, NO border, NO bevel, NO text. Cells meet precisely at one third and two thirds of the image width and half the height. Each cell is a continuous, fully opaque, edge-to-edge flat repeatable surface; ALL SIX must be equally sized squares.
Cell order from left to right:
Top left: muted jade-green grassland, subtle tiny grass fibers and moss.
Top middle: deep evergreen forest FLOOR, softly mottled moss and sparse tiny fallen leaves; NO trees or trunks.
Top right: calm mineral-blue water, small soft ripples across the full tile; NO land, shore, islands or foam border.
Bottom left: warm ochre bare earth, fine sparse grain and low-contrast cracks.
Bottom middle: grey-green stone ground, subtle broad stone mottling, NO tall rocks.
Bottom right: pale ivory snow ground, softly mottled cool shadows, NO mountains or objects.
Style/medium: Original refined 2D hand-painted game terrain, gentle gouache texture, deliberately LOW-CONTRAST flat detail suitable for repeated tiles viewed at 48-96 screen pixels. Consistent even overhead lighting, no directional gradient or bright center, no cast shadows, no raised diorama or perspective. Each cell's edge colors should match its opposite edge for quiet repeating surfaces.
Constraints: Six plain ground textures ONLY. Do not include map icons, characters, plants taller than grass, buildings, objects, annotation, watermark, background margins or frame. Smooth restrained texture density with no dominant unique marks. FULLY OPAQUE image. This is a texture atlas, not a moodboard or illustrated map.
```

## decorations

```text
Use case: stylized-concept
Asset type: Transparent-background DECORATION SPRITE ATLAS for a reusable Chinese xianxia world map. Landscape 3:2 canvas, requested 1536x1024.
Input images: Image 1 is STYLE REFERENCE ONLY, not an edit target. Extract the visual vocabulary of its mountains, woodland and small Chinese sect compounds, drawing new separate original sprites.
Primary request: Exactly SIX isolated sprites in a strict THREE equal columns by TWO equal rows layout. Every cell is square, each object centered within its cell with generous transparent padding (at least 15% of cell width on every side). One sprite per cell, no overlap, all objects entirely inside their cells. Same near-overhead orthographic game-map illustration view and soft upper-left lighting, no horizon. Landscape atlas fills whole canvas, invisible cell boundaries.
Cell order from left to right:
Top left: a compact cluster of five varied evergreen and broadleaf trees, jade and dark green; separate clear silhouette.
Top middle: a compact cluster of three Chinese grey-green stone peaks with tiny moss patches; same simple map-asset language.
Top right: the SAME family of compact stone peaks, capped with ivory snow.
Bottom left: a small Chinese immortal-sect compound: three muted teal-roof buildings and a pale stone courtyard, walled rectangular footprint; modest simple architecture.
Bottom middle: an ancient Chinese cultivation ruin, low circular stone dais with broken engraved standing stones, no Greek columns.
Bottom right: a small original spirit-stone outcrop, a few jade-blue crystals on mossy stone, faint restrained glow.
Style/medium: Clean readable simplified 2D hand-painted game sprites with soft gouache shading, coherent outline weight and light direction, moderately detailed at 128-256px. All objects are reusable map decorations.
Transparency: GENUINELY TRANSPARENT RGBA background, preserve alpha; transparent between and around every object. NO white or grey background, NO checkerboard drawn into pixels, NO full-cell ground patches, NO rectangular backing cards. A very small contact shadow directly beneath each object is allowed.
Constraints: No labels, no text, no borders or gridlines, no watermark, no characters, no extra sprites, no cropped objects, no arbitrary decorative flourishes. Treat this as an actual usable sprite atlas.
```

## overview

```text
Use case: stylized-concept
Asset type: Clean independent WORLD OVERVIEW BASE MAP for a Chinese xianxia game, square requested 2048x2048. This is a static navigation art base representing a 10000x10000 logical-cell world, not a literal cell grid.
Input images: Image 1 is a geographical and art-style reference. Keep its broad geography and palette: northern snowy peaks, western ochre dryland, central green plain with a north-south river, southern deep forest, eastern blue coast and lakes. Simplify it for navigation at small display sizes.
Primary request: Paint an uncluttered high-quality top-down atlas view of Qingyuan Xianzhou. Clear large organic biome regions and open areas with distinct silhouettes, broad navigable-looking valleys, a single readable connected river system leading to the eastern sea. Use six cohesive terrain families: jade grassland, deep evergreen woods, grey-green mountains, mineral-blue water, ochre earth, ivory snow. Modular repeated peak/tree-cluster vocabulary, SMALL scale consistently across the entire map. Much simpler and clearer than the reference at thumbnail size; about 65% calm ground or water. Northern snow stays near the northern edge.
Composition: North at image top. No horizon or perspective, uniform near-overhead orthographic map scale, edge-to-edge square map. Keep the central plain open for a later viewport locator, leave open basins for later landmark markers. Terrain land continues beyond west/north/south edges; partial coast on east. Subtle only terrain relief, softly painted clean outlines.
Style: Refined original 2D hand-painted Chinese fantasy strategy game art, restrained gouache textures, soft even daylight. No dramatic fog blocking terrain.
Constraints: Terrain-only world overview base. NO sects/buildings/ruins/crystals in this image because interactive landmark sprites will be overlaid separately. NO names, text, compass, UI panels, legend, frame, route lines, grid, characters, banners, location markers or watermark. Do not bake interactive information into the map. Must be readable as a navigation background at around 600 pixels wide.
```

## 装饰透明修正尝试

内置工具初次生成和去背重试均输出 RGB，棋盘格是图像内容。这两个版本已舍弃；最终改用纯色底稿与用户授权的本地去背，见文末。

```text
Use case: background-extraction
Asset type: Actual transparent RGBA PNG game sprite atlas.
Input images: Image 1 is the EDIT TARGET, the six-sprite decoration atlas.
Primary request: Remove ONLY the painted grey-and-white checkerboard background, turning every background pixel between and around the six sprites into REAL alpha=0 transparency in the resulting PNG. The uploaded source is RGB with a fake checkerboard painted into it; correct that defect. This is a background-removal task, not a new drawing.
Invariants: Preserve the six sprites exactly in their existing positions, dimensions, colors and painted details: tree cluster, green mountains, snowy mountains, Chinese sect, circular ruin, crystal rock. Preserve all object silhouettes and details, the 1536x1024 canvas and strict 3-column by 2-row cell layout. Do not add or redraw objects.
Output requirement: a genuinely TRANSPARENT BACKGROUND with actual alpha channel. No grey, white, black or colored opaque replacement background. Absolutely DO NOT DRAW a checkerboard pattern; transparency is file alpha, not a checkerboard illustration. Preserve clean semitransparent antialiasing at the silhouettes. The empty corner and gutter pixels must have alpha 0.
```


## 最终装饰底稿与本地去背

用户于 2026-09-10 明确授权本地图像处理。最终采用内置 imagegen 生成纯洋红色底稿，再本地识别底色、恢复边缘 alpha 并去除边缘底色污染，导出 RGBA PNG。未将草底检查图当作透明文件。

```text
Use case: background-extraction
Asset type: Six-sprite xianxia map atlas prepared for local chroma-key background removal.
Input images: Image 1 is the EDIT TARGET.
Change ONLY the backdrop. Replace EVERY grey or white checkerboard pixel with a completely flat, uniform, opaque pure magenta background: RGB(255,0,255), hexadecimal #FF00FF. Include empty gaps within foliage and between separated rocks. No checkerboard should remain anywhere. No background gradients, shadows, textures, grain, lighting, or color variation. No magenta reflection, no magenta spill, no magenta on the sprites themselves.
Keep the six original sprites, their details, exact layout, positions, size and 1536x1024 canvas: three columns by two rows, tree cluster, stone mountain, snow mountain, Chinese sect courtyard, stone ruin, blue crystals. Preserve WHITE SNOW and grey ROCKS as part of the objects, and leave actual empty spaces magenta. Preserve all artwork colors and silhouettes. Flat magenta must touch the clean contours of every object, including all gaps; retain natural white highlights only when part of an object. Output full-size RGB PNG. No labels or additional graphics.
This opaque keyed version will be cut out locally; DO NOT attempt to depict transparency or draw a checkerboard.
```
