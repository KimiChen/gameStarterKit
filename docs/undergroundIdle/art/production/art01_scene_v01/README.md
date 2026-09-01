# ART-01 场景层生产规范 v01

本包计划把通过 G3 视觉锁定并进入 G4 生产拆分的黄金位图按运行层整理为场景 clean plate、必要结构、窄前景遮挡和灯光 mask。
目标产物从 `main_bitmap_v02/asset-manifest.json` 登记的 `regionCrop`、`inpaintCrop`、`alphaObject` 或
`fullCanvas` 源确定性导出；
禁止从未批准效果图盲切，也不建立 SVG 分层 Master。本文只规定生产和验收口径，不表示对应资产已经生成。

## 坐标与装配

- 逻辑画布：750×1624，左上角为 (0,0)。
- 高分辨率作者源：优先使用黄金 target 的批准高分辨率源；运行时按 manifest 登记尺寸缩放。
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
通过后不得为追求层数而强拆像素；大块固定场景优先保持为同源 clean plate。

10_STRUCTURE 不包含矿井、升降机、仓库、公会大厅、角色、矿车、状态牌、按钮或文字。交互设备继续由外部
30/40 层装配，禁止烘焙回背景。

50B 源中用于补绘的完整平台唇和侧壁只保存在 `sources/`，不得进入运行资产，否则会遮住角色脸部。
60 的反馈 variant 同样默认隐藏，计划默认 PNG 只表达初始灯光状态。

## 裁切与无缝规则

- 背景必须整张使用；结构和其它透明层必须保持 manifest 登记的批准高分辨率同画布，并能确定性重组为
  750×1624 逻辑页面，不做逐对象 tight crop。
- 结构源的横梁、平台和侧壁必须越过视口边缘补绘；验收时确认裁到逻辑画布不会露缝。
- 关闭结构时露出背景属于正常；关闭灯光时灯具本体仍存在属于正常，但不得残留宽范围光晕。
- 750×1624 适配只允许整体等比缩放；安全区变化由外层视口裁切，不拉伸岩层或改变岗位锚点。

## 联系表

计划生成 `review/ug_art01_scene_layer_contact_v01.png` 作为 2×2 累积联系表，依次显示仅背景、加入结构、
加入窄前景、加入默认灯光。青色小框只能位于 `90_REVIEW_ANNOTATION`，不得进入运行资产。

## 验证

候选文件生成后，在本目录执行 PNG 属性检查，并按 `asset-manifest.json` 重组主界面：

    find . -name '*.png' -print0 | xargs -0 -n1 sips -g pixelWidth -g pixelHeight -g space -g hasAlpha

如果候选声明为 `copy`，应与 manifest 登记的批准 PNG 使用 `cmp` 或 SHA-256 检查；`regionCrop`、
`inpaintCrop` 和 `fullCanvas` 则必须保留 source rect/mask，并通过 target ↔ composite 分区回归。

验收前应在 `asset-manifest.json` 登记完整 SHA-256、来源、mode、anchor、parallax 和 blend mode。候选尚未生成时
保持 `To generate`；候选生成后进入 `To audit`，完成登记、自动检查与人工签字后才能标记为 `Accepted`。
