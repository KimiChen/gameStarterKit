# ART-01 场景层生产规范 v01

本包计划把 Gate A 主场景候选按运行层整理为远景、结构、窄前景遮挡和灯光 mask。目标产物应从经人工选择的
`main_v01` 分层源确定性导出，不得从扁平效果图直接裁切。本文只规定生产和验收口径，不表示对应资产已经生成。

## 坐标与装配

- 逻辑画布：750×1624，左上角为 (0,0)。
- @2x 作者画布：1500×3248；运行时统一缩放 0.5。
- 四层均使用同画布左上 anchor，不得分别自动裁透明边。
- v01 固定视口不启用视差，因此目标 manifest 的 `parallaxFactor` 应全部为 `(0,0)`。如以后增加镜头微动，
  必须先补 overscan，并让结构、建筑、状态、角色和前景使用相同运动组；不能只移动梁轨。

运行层序：

    00_BACKGROUND
      → 10_STRUCTURE
      → 外部 30_BUILDING / 40_PROP_STATE / 50_CHARACTER
      → 50B_FRONT_OCCLUSION
      → 60_LIGHT_FX
      → 外部 UI 与运行时文字

## 各层说明

| 层 | 计划运行 PNG | Alpha | Blend | 目标说明 |
| --- | --- | --- | --- | --- |
| 00_BACKGROUND | background/ug_main_00_background_v01.png | RGBA 容器、全幅不透明 | normal | 待选定的远景岩壁、深度衰减、地层与暗角合并底图 |
| 10_STRUCTURE | midground/ug_main_10_structure_v01.png | 透明 | normal | 梁、轨、固定管线、洞口、平台和侧壁；包含越界 bleed |
| 50B_FRONT_OCCLUSION | foreground/ug_main_50b_front_occlusion_v01.png | 透明 | normal | 只保留三个默认岗位的窄脚底前缘 |
| 60_LIGHT_FX | light/ug_main_60_light_fx_v01.png | 透明 | screen | 默认暖工作灯、克制尘埃和深层锁门冷光；不含灯具本体 |

00_BACKGROUND 计划合并远景岩壁与深度渐变。候选 backing raster 必须先通过综合色彩和地质连续性验收；
通过后不得为追求层数而强拆像素。SVG 中如提供矢量 fallback，应保持默认隐藏。

10_STRUCTURE 不包含矿井、升降机、仓库、公会大厅、角色、矿车、状态牌、按钮或文字。交互设备继续由外部
30/40 层装配，禁止烘焙回背景。

50B SVG 中用于溯源的完整平台唇和侧壁组应保持隐藏；运行时不得启用，否则会遮住角色脸部。60 的反馈 alternate
同样默认隐藏，计划默认 PNG 只表达初始灯光状态。

## 裁切与无缝规则

- 背景必须整张使用；结构和其它透明层必须保持 1500×3248 同画布，不做逐对象 tight crop。
- 结构源的横梁、平台和侧壁必须越过视口边缘补绘；验收时确认裁到逻辑画布不会露缝。
- 关闭结构时露出背景属于正常；关闭灯光时灯具本体仍存在属于正常，但不得残留宽范围光晕。
- 750×1624 适配只允许整体等比缩放；安全区变化由外层视口裁切，不拉伸岩层或改变岗位锚点。

## 联系表

计划生成 `review/ug_art01_scene_layer_contact_v01.png` 作为 2×2 累积联系表，依次显示仅背景、加入结构、
加入窄前景、加入默认灯光。青色小框只能位于 `90_REVIEW_ANNOTATION`，不得进入运行资产。

## 验证

候选文件生成后，在本目录执行：

    find . -name '*.svg' -print0 | xargs -0 xmllint --noout
    find . -name '*.png' -print0 | xargs -0 -n1 sips -g pixelWidth -g pixelHeight -g space -g hasAlpha

如果候选声明为从 `main_v01` 无损复制，应使用 `cmp` 检查，例如：

    cmp -s background/ug_main_00_background_v01.png ../main_v01/scene/ug_main_00_background_v01.png
    cmp -s midground/ug_main_10_structure_v01.png ../main_v01/scene/ug_main_10_structure_v01.png
    cmp -s foreground/ug_main_50b_front_occlusion_v01.png ../main_v01/characters/ug_main_50b_front_occlusion_v01.png
    cmp -s light/ug_main_60_light_fx_v01.png ../main_v01/light/ug_main_60_light_fx_v01.png

验收前应在 `manifest.json` 登记完整 SHA-256、来源、anchor、parallax 和 blend mode；未完成登记时保持
`To audit`。
