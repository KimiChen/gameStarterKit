# ART-03 ImageGen 候选提示词计划

本包计划使用内置 ImageGen，每个目标阶段单独调用；`Image 1` 应提供对应三阶段概念稿，`Image 2` 应提供
经人工选择的 Stage 01 透明身份锚点。以下提示词是待执行起点，不代表调用已经发生，也不代表任何输出已被最终采用。

## 共同约束

```text
Use case: stylized-concept
Asset type: production game building sprite, ART-03
Input images: Image 1 is the supplied three-stage concept sheet (left stage 01, center stage 02, right stage 03); Image 2 is the selected isolated stage-01 identity candidate.
Style/medium: original Q-style hand-painted 2D sprite, fixed frontal orthographic view, dark charcoal contour, warm amber work light, readable timber/brass/iron/rock materials.
Composition/framing: exactly one complete building centered with generous padding; full top and full base visible.
Constraints: keep the stage-01 footprint, functional opening, track/base alignment and bottom-center pivot; no text, numbers, sign writing, UI, characters, loose props, watermark, floor plane, cave scene or duplicate building. Prefer genuine transparency; otherwise use only a pale neutral checker outside the silhouette for deterministic removal.
```

## 八张计划目标差异

### Mine · Stage 02

```text
Match the CENTER stable mine variant. Preserve the mine-cart track and hoist cage. Add only the compact powered drill assembly, reinforced metal joints, extra warm work lamps and restrained brass fittings visible in the approved center concept.
```

### Mine · Stage 03

```text
Match the RIGHT mature mine variant. Preserve the mine-cart track and hoist cage. Add the reinforced dark-metal frame, mature drill and pipes, warm multi-lamp array, restrained blank brass sign plate and stronger structural brackets. Reveal the complete lower track, stones and support feet; no crop.
```

### Hoist · Stage 02

```text
Match the CENTER stable hoist variant: the same tall timber A-frame, rail platform and hanging cage, with reinforced brass winch housing, metal joint plates and a second warm work lamp.
```

### Hoist · Stage 03

```text
Match the RIGHT mature hoist variant: the same A-frame, rail platform and cage, with mature reinforced brass-and-dark-steel winch, overhead guard, right-side pipe/ladder service assembly, paired warm work lamps and heavier joint plates.
```

### Warehouse · Stage 02

```text
Match the CENTER stable warehouse variant: the same gabled storage doorway and rail threshold; replace the canvas awning with a reinforced timber-and-dark-metal facade, paired warm lamps and stronger door braces.
```

### Warehouse · Stage 03

```text
Match the RIGHT mature warehouse variant: the same doorway and rail threshold, with a dark-metal reinforced facade, blank brass plate, roof vent/pipe, paired protected warm lamps, valve and heavy corner plates.
```

### Guild Hall · Stage 02

```text
Match the CENTER stable guild-hall variant: the same arched stone doorway and crossed-pick emblem, with reinforced carved timber lintel, brass corner plates, two side lamps plus center lamp and a blank framed notice board.
```

### Guild Hall · Stage 03

```text
Match the RIGHT mature guild-hall variant: the same arched doorway and crossed-pick emblem, with dark-steel/brass reinforced gable, blank crown plate, triple warm-lamp hierarchy, pipe/chain service details and heavier stone/metal feet.
```

## 透明背景修正

如果候选输出带有 RGB 浅色预览格，应先尝试一次 `background-extraction`，或使用
`remove-light-checker.mjs` 仅清除与画布边缘连通的亮中性色。随后必须检查四角 Alpha、可见 bbox、完整底座
和主体 RGB 是否被误改。原始生成稿应保留 `_raw_v01` 后缀供追溯，任何候选均需人工选择和视觉审阅后才能
进入归一化流程，且 `_raw_` 文件不得作为运行资源。
