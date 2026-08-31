# ART-06 UI Kit 生产规范 v01

本目录规定 Underground Idle 确定性 UI Kit 的计划交付。每个组件应以同名 `SVG` 作为唯一可编辑真源，并
确定性导出原尺寸透明 `PNG`。当前文档只描述目标，不表示这些文件或九宫格已经生成和审计。

## 生产规则

- 颜色与材质遵循 `SPEC-03`：深色钢铁/岩石底、黄铜与木材暖色、左上高光、右下压暗。
- 组件只包含容器像素；没有可见文字、数字、百分比、价格、等级或伪文字。
- `capacity_track_empty` 与 `status_track_empty` 仅含空轨和边框。填充值、阈值色、动画与数值必须由运行时节点提供。
- 所有资产都保留透明画布边缘。不要把截图底色烘焙进 PNG。
- 外投影由实例节点或独立效果节点生成，不烘焙进九宫格，避免拉伸阴影和图集边缘污染；组件自身用深色外框与内压边表达重量。
- 九宫格参数以 `manifest.json` 和每个 SVG 的 `metadata` 为准。四角、切角、铆钉、侧标和端帽均在不可拉伸区；只拉伸中心矩形。
- 按钮和页签的文字/图标由独立运行时节点居中叠放；弹窗、面板、提示条的内容区不得被材质纹理侵入。

## 计划资产

| 资产 | 原尺寸 | 推荐用途 |
| --- | ---: | --- |
| `ug_ui_panel_9slice_v01` | 512×384 | 普通信息面板、卡片底 |
| `ug_ui_button_primary_9slice_v01` | 512×160 | 唯一主操作 |
| `ug_ui_button_secondary_9slice_v01` | 512×160 | 次操作、取消 |
| `ug_ui_button_disabled_9slice_v01` | 512×160 | 禁用操作底 |
| `ug_ui_tab_active_9slice_v01` | 384×160 | 当前页签 |
| `ug_ui_tab_inactive_9slice_v01` | 384×160 | 非当前页签 |
| `ug_ui_modal_9slice_v01` | 768×640 | 弹窗主体 |
| `ug_ui_toast_info_9slice_v01` | 768×176 | 普通提示条 |
| `ug_ui_toast_warning_9slice_v01` | 768×176 | 告警提示条 |
| `ug_ui_capacity_track_empty_9slice_v01` | 640×96 | 容量空轨 |
| `ug_ui_status_track_empty_9slice_v01` | 640×96 | 通用状态空轨 |

九宫格坐标采用像素内边距 `{left, top, right, bottom}`。例如 512×384 面板的 `{72,72,72,72}` 表示中心
可拉伸区为 `(72,72)–(440,312)`。候选生成后必须把每个组件的 insets、源尺寸、SHA-256 和导出路径写入
`manifest.json`，并执行以下验收：

- [ ] SVG 可解析且不含 `<text>`、伪文字或未登记外链；
- [ ] PNG 为 sRGB RGBA，四角透明，无截图底色和拉伸阴影；
- [ ] 九宫格四角、切角、铆钉、侧标和端帽均处于不可拉伸区；
- [ ] 在最小、常用和最大计划尺寸下预览，无边框断裂、纹理侵入或像素污染；
- [ ] FairyGUI Editor 中实际设置与 manifest 一致。

完成自动检查和人工视觉签字前，本包保持 `To audit`。
