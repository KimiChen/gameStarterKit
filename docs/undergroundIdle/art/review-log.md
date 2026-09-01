# Underground Idle 当前美术审阅状态

> 当前生产路线：`Bitmap-first + Editor-first`<br>
> 当前下一步：G2 布局与几何裁定<br>
> G2～G5 状态：全部未开始

## 当前视觉基准

| 字段 | 当前记录 |
| --- | --- |
| 基准 ID | `UG-MAIN-CONCEPT-02` |
| 基准文件 | `ug_ui_main_concept_02.png` / `ug_ui_main_concept_02_review.png` |
| 当前状态 | 已批准的概念与风格参考；不是 G3 黄金 target 或运行资产 |
| 锁定内容 | 六段式构图、综合色调、材质、上左光向、三名初始角色比例、厚重 UI 语言 |
| 非锁定内容 | 运行时中文与数值、容量比例、建筑等级、精确热区、状态轨含义、生产切分和最终 Editor 节点 |
| 当前用途 | G2 几何裁定的视觉参考，以及 G3 新黄金 target 的 A/B 基准 |

概念审阅图不得导入运行包。完成 G2 后，G3 必须生成 750×1624 无字黄金 target 和批准高分辨率源，并单独
取得人工签字；只有 G3 批准源及其 manifest 登记的派生物可以成为 G4/G5 输入。

## 待审 Gate

| Gate | 当前状态 | 待审对象 | 通过条件 |
| --- | --- | --- | --- |
| G2 布局与几何裁定 | 未开始 | 几何决策记录、安全区、固定区、热区、极值文本样例、08/09 同步证据 | 明确采用概念几何或契约几何；目标尺寸、长文本、极值数字和点击区可容纳 |
| G3 黄金 target / 视觉锁定 | 未开始 | `targets/ug_main_golden_v02.png`、审阅图、批准高分辨率源、哈希和生成/编辑记录 | 无字 target 的构图、材质、光向、角色尺度和 UI 质感经人工批准 |
| G4 生产拆分 | 未开始 | `production/main_bitmap_v02/asset-manifest.json` 与切分计划 | source、mode、source rect、mask/修复、Alpha、pivot、九宫格、状态、哈希和批准状态闭合 |
| G5 运行资产 | 未开始 | accepted runtime PNG、composite、diff、allow-mask、自动报告和 A/B 审阅图 | Alpha、边缘、尺寸、pivot、状态系列和 target ↔ composite 一致性通过自动与人工检查 |

## 当前审阅规则

- 完整、无遮挡且没有背景污染的区域可以按 manifest 使用 `regionCrop`；
- 被遮挡角色/建筑、透明边、连续灯光和底层 clean plate 必须使用登记的 mask、补绘/inpaint 或同源局部
  ImageGen 修复，不能让工具猜缺失像素；
- 运行时中文、数字、等级、价格、容量和倒计时必须由 FairyGUI 文本或程序状态提供；
- target、review、mask/repair、annotation、composite 和 diff 都是来源或证据，不作为整页运行资源；
- G5 通过后才允许把 accepted runtime PNG 导入 FairyGUI Editor；XML、内部 ID、`.bin` 和 atlas 由 Editor
  保存和发布；
- ART-01～ART-09、FairyGUI 页面和 Creator 状态矩阵当前均未完成，文件存在或自动检查不能替代 Gate 签字。
