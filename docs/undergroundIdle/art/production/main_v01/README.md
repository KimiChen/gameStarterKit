# Underground Idle 主界面母版 v01（Needs revision）

本目录保存首轮 1500×3248 SVG 分层母版、FX-01/02、SPEC-01/02、ImageGen 候选和自动审计证据。用户在
2026-09-01 将 FX-01 与已批准的 `ug_ui_main_concept_02_review.png` 并排审阅后，确认两者美术视觉差距明显；
因此本批结论为 `Needs revision`，不得进入 ART 拆包、FairyGUI 导入或 Creator 验收。

现有 SVG、派生 PNG、SHA-256、`AE=0` 和文字 ON/OFF 差异证据全部保留。它们证明 v01 可以按既有 SVG 层序
重渲染并隔离文字，但不能证明重组结果延续了批准概念图的材质、细节密度、光照、角色比例和整体完成度。
ART-01～ART-09 不因本目录文件存在而视为已生成或已交付。

## v01 历史交付与证据

- `ug_main_master_v01.svg`：首轮 SVG 总装源，仅作历史技术证据；
- `ug_main_master_v01.png`：开启运行时文字的 1500×3248 历史审阅导出；
- `ug_main_master_text_off_v01.png`：关闭 `80_RUNTIME_TEXT` 的同构历史导出；
- `ug_main_master_review_v01.png`：750×1624 历史快速审阅图；
- `review/spec02_*.png`：SPEC-02 v01 的八张 1500×3248 递增阶段证据；
- `review/ug_main_text_diff_*_v01.png`：文字差异 mask 与槽外零差异证据；
- `AUDIT.md`：本批自动检查、人工结论和停止条件；
- `IMAGEGEN_PROMPTS.md` 与各 `candidates/IMAGEGEN_RECORD.md`：候选 prompt、生成来源与透明处理记录。

这些文件不得改名冒充新版本，也不得作为下一批 `asset-manifest.json` 的批准输入。替代批次使用新的版本号和
独立目录；v01 目录保持可复核。

## v01 历史层序

下表只描述 v01 自动审计所验证的 SVG 层序，不再定义后续生产真源：

| 层 | v01 历史 SVG | 当时用途 |
| --- | --- | --- |
| `00_BACKGROUND` | `scene/ug_main_00_background_v01.svg` | 全幅岩壁、深度渐变 |
| `10_STRUCTURE` | `scene/ug_main_10_structure_v01.svg` | 梁、轨道、管道、平台与侧壁 |
| `30_BUILDING` | `buildings/ug_main_30_building_v01.svg` | 首阶段矿井、升降机、仓库；大厅为隐藏 alternate |
| `40_PROP_STATE` | `state/ug_main_40_prop_state_v01.svg` | 矿车、仓库填充、深层锁与岗位牌；六个状态 alternate |
| `50_CHARACTER` | `characters/ug_main_50_character_v01.svg` | 三名初始角色的独立身份 cutout；奥托隐藏；ART-04 完整拆件 rig 仍待制作 |
| `50B_FRONT_OCCLUSION` | `characters/ug_main_50b_front_occlusion_v01.svg` | 仅脚底窄前缘遮挡；厚岩台不得放到角色脸部上方 |
| `60_LIGHT_FX` | `light/ug_main_60_light_fx_v01.svg` | 暖光、尘埃、深层冷光及反馈 alternate；不含灯具本体 |
| `70_UI_CONTAINERS` | `ui/ug_main_70_ui_containers_v01.svg` | 无字、无填充值的 UI 容器与图标；R3 内容窗和容量槽透明，露出 30/40 层 |
| `80_RUNTIME_TEXT` | `ui/ug_main_80_runtime_text_v01.svg` | 唯一允许出现运行时中文、数字、等级、价格和倒计时的层 |

v01 关闭建筑、角色、灯光或 UI 的层级证据仍可用于追溯，但不能迁移成新批次的视觉批准。下一批必须用批准的
PNG 语义资产重新完成相同的开关、遮挡和文字隔离检查。

## v01 角色 Pivot 记录

场景角色使用登记过的个体水平 pivot，垂直脚底统一为源画布 `y=720`；显示尺寸统一约 `213.33×320`：

| 角色 | 初始状态 | 512×768 源 pivot | 主画布脚底坐标 |
| --- | --- | --- | --- |
| 格伦 | `JOB_MINE_01` | `(326,720)` | `(390,1400)` |
| 诺拉 | `JOB_TRANSPORT_01` | `(255,720)` | `(764,1872)` |
| 伊芙 | `IDLE_01` | `(240,720)` | `(616,2348)` |
| 奥托 | `IDLE_02`，默认隐藏 | 待 ART-04 交付 | `(870,2348)` |

当前 cutout 只用于历史身份与锚点证据。下一批目标 rig 的头、躯干、左右手臂、下半身和角色道具应拆成独立
RGBA PNG，并在 manifest 中登记 z-order、pivot、画布和来源；不再建立中间 SVG 节点。头灯/提灯不得包含在
灯效 PNG，只有光晕属于灯效层。

## v01 状态记录

- `40_PROP_STATE` 当时默认显示约 5% 仓库、空矿车、深层锁和四块无字岗位牌；
- `ALT_BALANCED`、`ALT_TRANSPORT_BOTTLENECK`、`ALT_WAREHOUSE_NEAR_FULL`、
  `ALT_WAREHOUSE_FULL`、`ALT_DEPTH_UNLOCKABLE`、`ALT_DEPTH_UNLOCKED` 默认隐藏；
- 开启 `ALT_DEPTH_UNLOCKED` 时必须同时关闭 `DEFAULT_DEPTH_LOCKED`；
- `60_LIGHT_FX` 的收取、升级、解锁和满仓反馈组当时默认隐藏；
- 奥托角色组当时默认隐藏。

这些状态语义可以带入新 manifest，但不得复用 v01 SVG group 作为运行资产。

## 未通过视觉审阅的原因

- v01 使用分别生成的场景、建筑、角色候选和低细节 SVG UI 重新拼装，未能保持批准整页图的一体化视觉；
- 自动检查覆盖尺寸、层序、解析、文字隔离和像素复现，却没有建立“批准黄金图 ↔ 运行 PNG 重组图”的视觉门；
- 因此 `AE=0` 只说明同一套 v01 输入能稳定得到同一套 v01 输出，不能说明输出接近正确的视觉目标。

## 替代生产流程

1. 以已批准概念图为视觉目标，先完成 G2 布局与几何裁定，再在 G3 生成 750×1624 无字黄金 target 和批准高分辨率源，
   并先取得人工签字；采用 contract geometry 时推荐保留 1500×3248 作者源；
2. 建立 `asset-manifest.json`，登记每个语义资产的源哈希、`mode`、source rect、
   修复 mask、pivot、九宫格、输出尺寸和运行名；
3. 完整无遮挡区域可用 `regionCrop`；被遮挡角色/建筑、透明边、连续灯光和底层 clean plate 必须通过 mask、
   补绘/inpaint 或同源局部 ImageGen 修复得到独立 PNG；
4. 用运行 PNG 确定性重组 750×1624 逻辑页面，提交黄金图、重组图、diff 和修复 mask 进行 A/B 审阅；
5. 视觉通过后再拆分并逐包验收 ART-01～ART-09；
6. 只把批准的 runtime PNG 导入 FairyGUI Editor，由 Editor 完成组件、文本、Controller、Gear、Relation、
   热区、XML、内部 ID、`.bin` 和 atlas；
7. 通过 Editor 保存—重开、正式发布和 Creator 状态矩阵后，才能关闭工程交接 Gate。

新流程不把整张黄金位图作为运行页面，也不由脚本生成 FairyGUI XML。v01 保持 `Needs revision`，直到新的版本
独立完成审阅也不会回写为 `Accepted`。
