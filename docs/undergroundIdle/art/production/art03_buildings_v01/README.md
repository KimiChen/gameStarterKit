# ART-03 建筑与状态生产规范

> 版本：v01<br>
> 画面基线：`SPEC-03` / `SPEC-04` / `production/main_v01`<br>
> 计划运行文件：透明 PNG；文字、等级和价格由 FairyGUI/客户端运行时提供<br>
> 当前状态：候选待生成、待选择、待归一化和待审计

## 计划交付内容

- `buildings/ug_building_<id>_stage_01..03_v01.png`
  - `mine`、`hoist`、`warehouse`、`guild_hall` 各三阶段，共 12 张；
  - 统一 1536×1536 RGBA 画布；
  - 统一底部中心 pivot：`[768,1504]`；
  - 同一建筑三阶段保持固定正视角、底部落点与交互占位，升级只增加附件、灯光和轮廓复杂度。
- `state/ug_state_ore_pile_v01.png`：运输瓶颈矿堆；
- `state/ug_state_hoist_load_v01.png`：升降笼负荷；
- `state/ug_state_warehouse_00/25/50/75/100_v01.png`：五档仓储场景状态；
- `state/main/ug_state_warehouse_05_v01.png`：新手初始约 5% 仓储状态；
- `state/main/ug_state_empty_cart_v01.png`、`ug_state_cart_load_v01.png`：开采瓶颈空矿车与平衡态装载层；
- `state/main/ug_state_job_plate_v01.png`：四个岗位共用的无字牌；
- `state/main/ug_state_depth_locked/unlockable/unlocked_v01.png`：深层入口三态；
- `state/ug_art03_state_atlas_v01.svg/.png`：2048×1024 可编辑状态 atlas；
- `state/main/main-state-overlays.json`：主界面状态件裁切、运行尺寸、pivot 与源画布位置；
- `manifest.json`：文件、frame rect、pivot、来源和归一化数据；
- `ug_art03_building_stages_contact_sheet_v01.png`：四建筑三阶段审阅表。
- `ug_art03_main_state_overlays_contact_sheet_v01.png`：七个主界面独立状态件审阅表。

## 阶段语义

| 阶段 | 等级 | 视觉差异 |
| --- | --- | --- |
| `01` 简陋 | Lv1–2 | 木石主体、单灯或基础设备、最少金属附件 |
| `02` 稳定 | Lv3–4 | 加固节点、稳定设备、更多工作灯和少量黄铜 |
| `03` 成熟 | Lv5 | 深色钢架、完整设备/管线、成熟灯组和空白铭牌 |

铭牌不含文字；等级、价格、进度、仓储比例和警告文案不得烘焙进图片。

## 计划制作与来源

- Stage 01 计划从 `production/main_v01/buildings/` 中经人工选择的候选切图无损复用；
- Stage 02/03 计划使用内置 ImageGen，以四张三阶段概念稿与经选择的 Stage 01 为身份锚点逐张生成；候选提示词见
  [`IMAGEGEN_PROMPTS.md`](IMAGEGEN_PROMPTS.md)；
- 如果 ImageGen 把浅色透明预览格烘焙进 RGB，原始输出应以 `*_raw_v01.png` 保存为可追溯中间件且不得进入运行时；
  `production/tools/remove-light-checker.mjs` 只清除与画布边缘连通的高亮中性色背景；
- `production/tools/normalize-building-stages.mjs` 计划将同组阶段归一到固定画布和 pivot；任何 `framingScale`
  必须经人工审阅，只能纠正透明留白差异，不得改变建筑内部几何；
- 状态件计划由 `ug_art03_state_atlas_v01.svg` 确定性输出，并沿用主界面木材、钢铁、黄铜与矿石色板；
- 七个主界面独立状态件计划从 `production/main_v01/state/ug_main_40_prop_state_v01.svg` 的目标 group/symbol
  机械提取，不重绘；裁切应保留 24px 源画布透明边，并在 metadata 中登记 2×→1×位置换算。

## 工程约束

- 验收完成后，FairyGUI/Cocos 只允许引用无 `_raw_` 后缀的 12 张建筑 PNG、7 张通用状态 PNG（或 atlas
  frame）以及 `state/main/` 的 7 张主界面状态 PNG；
- 建筑节点锚点使用 `(0.5, 1504/1536)`，切换阶段时不得重算点击区或岗位锚点；
- 状态单图均为 512×512，建议 pivot `[256,480]`；仓储五档只切换场景箱堆，不替代顶部权威容量条；
- `state/main/` 使用紧凑裁切而非 512×512 通用画布；必须按 `manifest.mainStateOverlays` 的
  `runtimeSizeLogical`、`sourceAnchorLogical` 与 `pivotNormalized` 放置，不能再次 tight crop；
- 四块岗位牌复用同一资源，实例矩形以 `job_plate.instances` 为准；文字、加号与忙碌状态单独渲染；
- 灯光 bloom、呼吸和粒子来自 ART-09，建筑图中的灯芯仅提供静态可读性。

## 待执行验证

以下命令只用于生成候选或检查候选，不代表当前已经执行：

```bash
xmllint --noout docs/undergroundIdle/art/production/art03_buildings_v01/state/ug_art03_state_atlas_v01.svg
NODE_PATH=/Users/kimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
  node docs/undergroundIdle/art/production/tools/extract-art03-main-states.mjs
NODE_PATH=/Users/kimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
  node docs/undergroundIdle/art/production/tools/normalize-building-stages.mjs
NODE_PATH=/Users/kimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
  node docs/undergroundIdle/art/production/tools/build-art03-delivery.mjs
```

验收重点：四组阶段底部落点一致、成熟阶段无裁切、透明边缘无浅色方格、空白铭牌无伪文字。生成脚本、自动
检查和人工签字全部完成前不得把本包标为可交付。
