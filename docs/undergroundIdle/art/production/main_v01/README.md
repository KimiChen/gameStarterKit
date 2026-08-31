# Underground Idle 主界面母版生产规范 v01

本目录规定 `08-main-screen-art-brief.md` 的 1500×3248 分层母版目标。当前状态为 `To generate`：计划文件名、
层级、pivot、状态和提示词均不代表母版或切图已经生成、审阅或最终采用。未来母版也不是 FairyGUI 发布包，
不得直接整页复制到 Cocos resources。

## 计划母版与审阅导出

- `ug_main_master_v01.svg`：计划可编辑总装源，按同画布外链各子层；
- `ug_main_master_v01.png`：计划开启运行时文字的 1500×3248 审阅导出；
- `ug_main_master_text_off_v01.png`：计划关闭 `80_RUNTIME_TEXT` 的同构导出；
- `ug_main_master_review_v01.png`：计划 750×1624 快速审阅图；
- `review/`：计划放置 SPEC-02 v02 的八张 1500×3248 递增阶段证据；
- `IMAGEGEN_PROMPTS.md`：远景、建筑首阶段与四角色拆件的候选 ImageGen prompt，不是生成记录。

验收时必须比较 `ug_main_master_v01.png` 与文字 OFF 图：所有差异只能位于 `80_RUNTIME_TEXT` 的非零 Alpha
范围内，层外差异必须为 0。实际差异像素数应由当次导出重新计算并写入审计记录，不预设为既有结果。

## 计划固定层序

| 层 | 可编辑源 | 归属 |
| --- | --- | --- |
| `00_BACKGROUND` | `scene/ug_main_00_background_v01.svg` | 全幅岩壁、深度渐变 |
| `10_STRUCTURE` | `scene/ug_main_10_structure_v01.svg` | 梁、轨道、管道、平台与侧壁 |
| `30_BUILDING` | `buildings/ug_main_30_building_v01.svg` | 首阶段矿井、升降机、仓库；大厅为隐藏 alternate |
| `40_PROP_STATE` | `state/ug_main_40_prop_state_v01.svg` | 矿车、仓库填充、深层锁与岗位牌；六个状态 alternate |
| `50_CHARACTER` | `characters/*/ug_worker_*_rig_v01.svg` | 四角色独立拆件 rig；初始态只显示格伦、诺拉、伊芙 |
| `50B_FRONT_OCCLUSION` | `characters/ug_main_50b_front_occlusion_v01.svg` | 仅脚底窄前缘遮挡；厚岩台不得放到角色脸部上方 |
| `60_LIGHT_FX` | `light/ug_main_60_light_fx_v01.svg` | 暖光、尘埃、深层冷光及反馈 alternate；不含灯具本体 |
| `70_UI_CONTAINERS` | `ui/ug_main_70_ui_containers_v01.svg` | 无字、无填充值的 UI 容器与图标；R3 内容窗和容量槽透明，露出 30/40 层 |
| `80_RUNTIME_TEXT` | `ui/ug_main_80_runtime_text_v01.svg` | 唯一允许出现运行时中文、数字、等级、价格和倒计时的层 |

关闭建筑、角色、灯光或 UI 时，应露出完整补绘的下层内容；透明黑块、残留光晕、仓库状态留在 UI 层，或
关闭文字后仍有伪字均为验收失败。

## 角色 Pivot

所有场景角色统一使用脚底中心 pivot `(0.5, 1.0)`：

| 角色 | 初始状态 | 主画布脚底坐标 | 可见 Alpha 底边 |
| --- | --- | --- | --- |
| 格伦 | `JOB_MINE_01` | `(390, 1400)` | `y=1400` |
| 诺拉 | `JOB_TRANSPORT_01` | `(764, 1872)` | `y=1872` |
| 伊芙 | `IDLE_01` | `(616, 2348)` | `y=2348` |
| 奥托 | `IDLE_02`，默认隐藏 | `(870, 2348)` | `y=2348` |

每个目标 rig 的头、躯干、左右手臂、下半身和角色道具必须拆成独立 RGBA PNG 与独立 SVG `<image>` 节点；
头灯/提灯不得包含在 `60_LIGHT_FX`，只有光晕属于灯效层。表中 pivot 是生产目标，需在候选生成后复核。

## 计划状态切换

- `40_PROP_STATE` 默认显示约 5% 仓库、空矿车、深层锁和四块无字岗位牌；
- `ALT_BALANCED`、`ALT_TRANSPORT_BOTTLENECK`、`ALT_WAREHOUSE_NEAR_FULL`、
  `ALT_WAREHOUSE_FULL`、`ALT_DEPTH_UNLOCKABLE`、`ALT_DEPTH_UNLOCKED` 默认隐藏；
- 开启 `ALT_DEPTH_UNLOCKED` 时必须同时关闭 `DEFAULT_DEPTH_LOCKED`；
- `60_LIGHT_FX` 的收取、升级、解锁和满仓反馈组默认隐藏，只由程序短时播放；
- 奥托角色组在大厅 2 级解锁前保持隐藏。

## 生产与验收顺序

1. 按 [`IMAGEGEN_PROMPTS.md`](IMAGEGEN_PROMPTS.md) 和各层规范生成候选，不直接把整页生成图作为母版；
2. 人工选择候选并建立同画布 SVG 分层源、文字 ON/OFF 导出和八张递增阶段图；
3. 执行尺寸、Alpha、外链、文字差异、遮挡、角色身份和状态互斥审计；
4. 通过后再按 [`../README.md`](../README.md) 拆分 ART-01～ART-09 候选包；
5. 各包单独验收后，才进入 FairyGUI Editor 和 Creator 装配验证。

人工验收必须确认三秒内能找到“全部收取”“瓶颈”和“远征”，并确认四角色身份、建筑材质与主界面构图一致。
在母版和各拆包均完成证据记录之前，状态保持 `To audit`。
