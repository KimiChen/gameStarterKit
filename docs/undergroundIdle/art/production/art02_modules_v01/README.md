# ART-02 通用矿井模块生产规范 v01

本目录规定 `Underground Idle` 的八个通用模块 PNG 生产目标。优先从批准黄金 target 或已批准单体做同源
裁切/补绘；target 中不存在的模块可用局部图片编辑或独立透明件生成，并回到 target 检查材质、尺度和光向。
生产过程不建立 SVG 中间真源。本文不表示 PNG 或 asset manifest 已经生成或通过审计。

## 统一制作契约

- 源画布：512×512，sRGB，透明背景。
- 安全边距：可见 Alpha 距四边至少 32px；运行时缩小时给图集外扩保留空间。
- 轮廓：源尺寸外轮廓约 14～18px，缩到完整 64×64 画布后仍保留约 2px 主轮廓。
- 材质：木材、旧钢、黄铜、岩石沿用 `SPEC-03` 色板；纹理只保留大块木纹、钢轨高光和低频岩裂。
- 光向：315° 左上主光；工作灯只包含灯具和灯芯，光晕必须由 `60_LIGHT_FX` / `ART-09` 独立叠加。
- 坐标：pivot 使用 512×512 PNG 源坐标；原点在左上，`x` 向右、`y` 向下。
- 缩放：运行尺寸是完整 512 画布对应的节点尺寸，必须等比缩放，不按可见 bbox 拉伸。
- 分层：洞口、梁、轨、管与灯具属于结构候选；箱、桶与绳可按场景用途进入静态装饰或状态物件层。

## 计划文件与运行登记

| ID | PNG basename | 建议运行节点 | Pivot |
| --- | --- | ---: | --- |
| `cave_opening` | `ug_module_cave_opening_v01` | 256×256 | bottom-center `(256,456)` |
| `wood_beam` | `ug_module_wood_beam_v01` | 256×256 | center `(256,256)` |
| `rail_segment` | `ug_module_rail_segment_v01` | 256×256 | bottom-center `(256,368)` |
| `pipe_elbow` | `ug_module_pipe_elbow_v01` | 224×224 | upper-connector `(150,60)` |
| `work_lamp` | `ug_module_work_lamp_v01` | 192×192 | mount-center `(256,64)` |
| `crate` | `ug_module_crate_v01` | 192×192 | bottom-center `(256,446)` |
| `barrel` | `ug_module_barrel_v01` | 192×192 | bottom-center `(256,450)` |
| `rope` | `ug_module_rope_v01` | 192×192 | upper-anchor `(256,48)` |

计划生成 `ug_art02_modules_contact_sheet_v01.png` 仅用于审稿：金色十字表示登记 pivot，右下棋盘格小窗
展示实际导出后的 64×64 缩小结果。联系表中的说明文字不得进入任何生产切图。

## 使用边界

- 洞口允许覆盖岩壁，但不得把建筑、角色或运行时锁定状态烘焙进去。
- 木梁、轨道和管道可旋转或镜像复用；连接端应对齐节点 pivot 或 manifest 中的 connection point。
- 箱与桶只表达场景材质，库存比例仍由 `ART-03` 状态层控制。
- 绳可围绕上端 pivot 做轻微摆动，不启用复杂绳索物理。
- 灯具可做亮度呼吸；任何 bloom、尘埃和火花均使用独立 FX 节点。

候选生成后，机器可读尺寸、可见 bbox、pivot、连接点、生产 mode、来源和文件名必须登记到
`asset-manifest.json`，并进入 `To audit`。自动检查、target 风格对账与人工缩小审阅均通过后才能标记为
`Accepted`；候选尚未生成时保持 `To generate`。
