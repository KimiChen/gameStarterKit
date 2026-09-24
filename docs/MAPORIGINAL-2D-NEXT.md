# mapOriginal 历史交接单（2026-09-23）

> 2026-09-23 · 分支 `new` · ⚠ 本单是**交接用**的施工计划，⛔ 不是设计真源。
> 设计真源 = [`MAPORIGINAL-2D.md`](MAPORIGINAL-2D.md)；批次真源 = [`MAPORIGINAL-2D-PLAN.md`](MAPORIGINAL-2D-PLAN.md)。
> 本单的批次编号 `Nx-Bn` 与 PLAN 的 `Mx-Bn` **不冲突**，落地后把阶段级结论回写 PLAN §5。
>
> 2026-09-24 整理：下文保留当时的问题、统计与操作记录，不是当前待办或当前工作区状态。
> N0–N3 的完成记录见 [PLAN §5](MAPORIGINAL-2D-PLAN.md#5-实施状态)；格线已由 A12 补齐，
> 资源完整 prefab、普通选框与 UV/河格补核见 [机制 §9](MAPORIGINAL-2D.md#9-本-kit-与原版对照表)。
> 当前重建命令见 [素材工具](../tools/maporiginal-assets/README.md)，优化状态只在 OPTIMIZATION §9。

---

## 0. 交接时的状态快照

| 事项 | 状态 |
|---|---|
| 分支 | `new` |
| 当时新增提交 | 4 个（N0 重放退出 / N2 城名 / N1 季·地貌变体 / N3+N4 调研回写）；不代表当前未推范围 |
| 机检 | client 1008 / server 1375 全绿；`verify:sync`、`verify:protected-paths` 绿；`verify:all` exit 0 |
| ⚠ 一条踩过的 | `verify:sync` 的「缺 `.meta`」**只对已入库文件生效** ⇒ `git add` **之前**跑是绿的、之后才红。⛔ 新增镜像文件后要在 `git add` 之后**再跑一遍** |
| ⚠ 又一条踩过的 | **Creator 的脚本编译器会静默停摆**（文件变了不重编、重放跑旧 bundle，症状 = 新逻辑不生效且 console 0 条）——改完先看 `temp/programming/packer-driver/targets/preview/chunks/` 里出现新代码再跑；不响就重启 Creator（N2 踩过） |
| 真机重放 | ✅ **N0 已退出**（2026-09-23）：15 步全绿、肉眼四项全过；抓出并修掉 2 条回归（层容器 layer 黑屏 / 重放解析器漂移 + 缩略图 y 翻号），见 §2 |
| 批次总览 | **N0 / N1 / N2 / N3 全部退出**（§2–§5）；N4 研究项 B1/B2/B3 已查明（§6），B4 按原判不阻塞不做；遗留开放项 = 名胜地标层（N4-B1 `[5]` 桶）、grid 格线（可做，N4-B3 依据已备）、雪季 decorate 换件查号（N4-B2 残余） |
| 工作树 | ⚠ **被多个会话共用**：测试跑一半树会变、git 会撞 `index.lock`。归因间歇性失败前先看有没有别的会话在写 |

**原始素材永远留仓外只读**（`../apkdecode/`、`../sourceVersion/`），只入派生产物，
九字段授权台账 `apps/kits/mapOriginal/art/LICENSES.md` 由 `emit_ledger.py` 生成，⛔ 不手改。

### 本轮刚落地的三件事

1. **`base.cw`（66.8 MB ctable）格式全解开** —— 逆自 `libnative-lib.so`
   （值解码 `0xb3fdb0` / 子项寻址 `0xb3f930` / 表布局 `0xb3fb50`）。
   通用解码器 `tools/maporiginal-assets/ctable_cw.py`：`tables()` / `groups()` / `rows()` / `table()`。
2. **249 座城补上真名 / 类型 / 等级 / 形状**，入 `MAPO_CITY_SITES`。
3. **城址件层 `city`** —— 15 个原版件覆盖 249 座、1,642 sprite。
   ⛔ 删掉了摆件层里自创的「面积前 8 大 + 位置散列」挑件。

### ⚠ 本轮纠正的四条**曾经写错**的结论（⛔ 别照旧文档办事）

| 曾经写的 | 真相 |
|---|---|
| ctable 的「行 = 定长 KV 数组」 | ⛔ 错。**每行本身就是一个独立表对象**，长度天然可变；「变长行边界」这个问题根本不存在 |
| `land.is_block` 的真值是 `0x01000000` | ⛔ 错。它是 **tag 3 (boolean)**，早先是把标签字节连读进值里了 |
| 道路 `type_info` 的 id 比 `client_res` **小 1**、要 `+1` | ⛔ 错。真值 **1:1**。先前扫表整体错位一格，与「+1」两个错误相抵 ⇒ 绑定结果一直是对的，**只有推理错了** |
| `city_res` 的 `.group` 是 **3D 件**、2D 沙盘用不上 | ⛔ 错。路径在 `scene/` 下（`scene_3d/` 才是 3D 树），件与 `_top_group` 完全同构 |

---

## 1. 现状：层表

```
plate 90 < terrain 100 < blocks 110 < region 300 < road 900 < grid 950
      < river 1600 < decor 3400 < city 3900 < banner 3950 < label 4000
```

| 层 | 状态 |
|---|---|
| `terrain` 地表底 | ✅ 一块 10×10 格 + 一张 256² 底纹整数次 `GL_REPEAT`（原版做法） |
| `blocks` 雪/沙带 | ✅ block 级地貌带，叠在地表底之上 |
| `region` 山林 | ✅ 锚点模型（`res.bytes` 值 48..61 = 锚点，`res_multi` 只是覆盖掩码） |
| `road` 道路 | ✅ 42,018 片，id→精灵绑定已升 `[实测]` |
| `river` 河流 | ✅ 水面多边形 + `_top_group` 手摆件 |
| `decor` 摆件 | ✅ 值即格 id，零概率零哈希 |
| **`city` 城址** | ✅ **本轮新增 + 已过真机**（N0，2026-09-23：洛阳 218 sprite 在屏、四项肉眼全过） |
| `label` 地名 | ✅ 大区 9 / 郡 55 |
| `plate` 远档 | ✅ 由地形自烘 |
| `grid` 网格线 | ⛔ 未实现；原版依据已查明（N4-B3）：**地表内嵌贴图格线**（FRAME=1400、淡黄 α24%、26.57° 菱形边、静态合批、远档隐）——可做，另开批次 |
| `banner` 目标旗 | ⛔ 未实现（要服务端 AOI 归属数据，v1 不做） |

---

## 2. N0 · 真机重放与 `.meta`（✅ **已退出**，2026-09-23）

**结果**　`node tools/creator-preview/run.mjs mapOriginal --out /tmp/maporiginal-run` **15 步全绿**、
console 0 条；状态行 `· 城 218`（洛阳整件 218 sprite 全在屏）。证据留档
`docs/evidence/creator-2026-09-23/maporiginal-n0/`（截图 + report.json，按 .gitignore 政策不入库）。
肉眼四项全过：城在地表之上、在资源件之上、城墙内无摆件（第 4 道门）、洛阳约 5 格宽（档内最大件）。

⚠ **真机重放抓出两条单测全绿盖不住的回归**（sgzzmap 的教训再次命中）：

1. **全部 mesh 层黑屏**（188c59dd 引入）：`mapo-layer-<id>` 容器没继承 layer —— Cocos 的
   `addChild` **不传播** layer，新节点默认 `DEFAULT`（2^30），而 UI 相机只看 `UI_2D`
   ⇒ 地表/路/河/山/摆件/城**整批被裁掉**。状态行计数照涨、重放节点判据照过、画面全黑。
   修复 = `MapOriginalWorldView.onOpen` 建容器时 `node.layer = this.world.layer`。
2. **重放解析器漂移**：M2/M3 往状态行加了「地表/道路/水面/点缀」段但没同步
   `maporiginal.mjs` 的 `STATUS_RE`（摆件/山林组静默失配），且近档地表节点早在 M2-B1
   改名 `mapo-ground`（重放还在等 `mapo-terrain`）。⇒ **重放自 M2 起就没跑通过**，
   层表里那些 ✅ 此前只有单测。已全修：段序对齐、组号重排、`· 城 N` 进判据。

另修一条工具 bug：缩略图点击换算的 **y 翻号**（局部 y 上 / 页面 y 下）——写反会跳到
(938,823) 而非洛阳；新增「点图心读详情格」公开信号钉住落点（±30 格容差：缩略图 1 CSS px ≈ 9 行）。

⚠ 初始视口在图心 (750,750)，**附近 60 行内没有城**（最近的武关在 (690,750)）⇒ 图心的
「城 0」是合法的，城的验收必须跳到洛阳去做（重放最后一步）。

`.meta`：本轮无新增镜像文件，`verify:sync` 绿；Creator 未改写 `resources/` 的 uuid。

<details><summary>N0 原始施工单（已退出，留档）</summary>

**为什么**　城址件层新开了一个材质、一个合批、一张 1024² 图集、1,642 个 sprite，
但**只过了单测**。本仓的先例写得很清楚：sgzzmap 有 673 条绿单测，仍被真机重放抓出七条
（见 `apps/kits/sgzzmap/README.md` 的两张表）。⛔ 别把「单测绿」当验收。

⚠ **`.meta` 已补齐**（2026-09-23 交接前）：`apps/Cocos/assets/src/` 下三个新文件的
`.meta` 已由 Creator 生成并入库，`verify:sync` 恢复绿。
⚠ 但**重放本身仍未跑** —— Creator 只是打开过、生成了 `.meta`，⛔ 不等于验收。

**落点**　`tools/creator-preview/maporiginal.mjs`（已存在，本轮未动）

**做什么**
1. 跑重放，确认状态行出现 `· 城 N`（N > 0）。⛔ 掉到 0 说明 `cities.bin` / `city-atlas` 没到位。
2. 肉眼核四件事：城**在地表之上**、**在资源件之上**、**不与摆件重叠**（第 4 道门）、
   **大小合理**（约 2.7–5 格宽）。
3. ⚠ Creator 正式导入**可能改写** `resources/` 下确定性铸的 uuid —— 改了就以它为准提交。

**退出**
```bash
node tools/creator-preview/run.mjs mapOriginal --reuse --out /tmp/maporiginal-run
```
落盘截图 + `report.json`，截图里能看到城；`npm run verify:sync` 仍绿。

**风险**　中。合批/材质在真引擎里可能暴露 sgzzmap README 里那五条硬规矩相关的问题。
**依赖**　无。

</details>

---

## 3. N1 · 季/地貌变体换件（✅ **已退出**，2026-09-23）

**结果**　选件带归属改用原版真机制 —— cell 级 `logic_background.bytes`
（`check_ground_type` = `GROUND_TYPE_NAMES[格值] or "ground"`；枚举干净集 `const.lua:252`、
层归属干净集 `map_layer_config.lua`、消费现场干净集 `sparse_layer_block.lua`）⇒ 逐格单值，
**块带双挂无优先级问题**（489 双挂块内实测 雪 41,295 / 沙 3,292 / 草 813；值 2 格 100% ⊆ 雪块、
值 3 格 100% ⊆ 沙块）。decor 三套件 143 格一张 4096×2048、region 基础季+雪山 26 格一张
2048×4096（沙漠山 2D 与基础季同件 13/13 ⇒ 无沙件格）。新数据 `bands.data.ts`（shared RLE
213 KB）+ kit 留档 `bands.bytes`。机检：三套件齐全 / 带内带外选件 / UV 不越界 / bands
逐字节互证，verify:all 绿（client 1005 / server 1375）。
真机抽验：重放 15 步回归全绿 + 跳雪带/沙带各一张截图（雪地雪覆件、沙地沙色件、带界过渡正常）。
顺带坐实并修正**资源类型次序**（真值 木/石/粮/铁，`land.name` × `client_res.src_name` 互证；
旧假设把铁/石/粮轮转错位，摆件美术与详情类型名已一并改正，`terrain.bytes` 逐字节不变）。

⚠ 显存 +33.6 MB（两图集各扩一倍）；LOD0 逐件过采样比不变（≈1.8–1.9×，与 tops 既定同档）。
⚠ 两个新 TS 镜像的 `.meta` 是确定性铸的，Creator 首次正式导入若改写 uuid 就以它为准补交。

<details><summary>N1 原始施工单（已退出，留档）</summary>

**为什么**　`base.cw` 的 `land` 表里，每个地块类型都有**四套件**：

```
client_res_id（基础季） / snow_client_res_id / desert_client_res_id / autumn_client_res_id
```

**353 个 land 里有 113 个的雪/沙件与基础件不同**。而本 kit 现在**所有格一律用基础件** ——
雪带和沙带里的资源件与山体画的都是绿地版本。

**影响面（实测，用 `build_blocks.py` 的真映射 `BLOCK_TILES=10 / ORIGIN=-10` 算）**

| 项 | 格数 |
|---|---:|
| 雪带 | 402,600 |
| 沙带 | 464,700 |
| **应换件、现用基础件** | **388,456 / 1,027,616 = 37.8%** |
| ├ 其中资源件 | 363,045 |
| └ 其中山锚点 | 25,411 |

⚠ **`autumn_*` 不要用**：M0-B3 已拍板「山体美术换回基础季」，秋季是误用。
本批只接 **snow / desert** 两套，⛔ 别把 autumn 一起接进来。

**落点**
- `tools/maporiginal-assets/pack_decor.py`、`pack_regions.py`：图集要多装 snow / desert 两套件
- `tools/maporiginal-assets/build_blocks.py`：块→格的带归属已有，**复用它的映射**，⛔ 别自己再写一份
- 客户端 `logic/mapoDecor.ts`、`logic/mapoRegions.ts`：查表时先判带，再选件

**做什么**
1. 从 `land` 表读四列，建 `res 值 → {base, snow, desert}` 三套格 id。
2. 图集扩容 —— ⚠ **先实测面积**：多两套件可能装不进现有 POT，装不下就分图集
   （`build_tops.py` 的「每族一张图集」是现成先例）。
3. 逐格选件：格在雪块内 → snow 件；在沙块内 → desert 件；否则基础件。
   ⚠ 雪带与沙带**是否可能重叠**要先验；重叠时谁优先要有依据，⛔ 别拍脑袋。
4. 机检：带内抽样格的选件必须与 `land` 表一致；带外必须仍是基础件。

**退出**
```bash
/tmp/maporiginal-venv/bin/python tools/maporiginal-assets/pack_decor.py
/tmp/maporiginal-venv/bin/python tools/maporiginal-assets/pack_regions.py
/tmp/maporiginal-venv/bin/python tools/maporiginal-assets/install_to_kit.py
npm run sync:shared && npm run sync:client && npm run verify:all
```
新增用例：三套件齐全 / 带内带外选件正确 / 图集 UV 不越界。

**风险**　中。图集会变大（显存），要复核 LOD0 的过采样比。
**依赖**　N0（真机验证通了再动图集，否则两个变量混在一起不好归因）。

</details>

---

## 4. N2 · 城名标注（✅ **已退出**，2026-09-23）

**结果**　地名三档分带落地：LOD 0–1 城名（249 座，`mapoCityLabelSize` 按 大型 24 / 中型 20 /
小型 16 分档、洛阳 10 级独享 28）/ LOD 2 郡名 / LOD ≥3 大区名，三档不混画。
渲染层零改动（`MapoLabelRenderer` 照旧建在 root 上、字号不跟缩放）。
机检：新增 `apps/client/test/mapOriginal-labels.test.ts` 两条（分带 + 字号纪律），client 48 条绿。
真机：重放 15 步全绿，洛阳步断言「洛阳」在屏（截图 `docs/evidence/creator-2026-09-23/maporiginal-n2/`）。
重放侧配套：近档步不再等郡名（图心没有城 ⇒ 城名档下那里合法为空），郡名档由单测钉。

⚠ 踩过一条环境坑：Creator 的脚本编译器会**静默停摆**（文件变了不重编、重放跑的是旧 bundle，
症状是「新逻辑死活不生效且 console 0 条」）——判据：改完先看
`temp/programming/packer-driver/targets/preview/chunks/` 里出现新代码再跑；不响就重启 Creator。

<details><summary>N2 原始施工单（已退出，留档）</summary>

**为什么**　249 座城的**真名已经在** `MAPO_CITY_SITES`（南皮 / 洛阳 / 风陵渡 …），
但画面上一个字都没有。地名层 `label` 已有（大区 9 / 郡 55），扩一档即可。

**落点**　`logic/mapoLabels.ts` + `view/MapoLabelRenderer.ts`（已存在）

**做什么**
- 近档（L0–L1）画城名，中档画郡，远档画大区 —— ⚠ **三档不要一起画**（现有 label 层已是这个纪律）。
- 按 `cityType` / `level` 分字号：大型 > 中型 > 小型；洛阳（10 级，唯一）可再突出。
- ⚠ 地名建在 root 上、**字号不跟相机缩放**（现有 `MapoLabelRenderer` 的既定做法，照抄）。

**退出**　`npm run test:client` + N0 的重放截图里能看到城名。
**风险**　低。**依赖**　N0。

</details>

---

## 5. N3 · LOD 门控对齐原版（✅ **已退出**，2026-09-23）

**结论**　档界**找到了，但它是 3D 的**：写在 `util/viewport_lod/camera_{default,01,02,03}{,_v}.lua`
的 `lod_zoom_{in,out}_divide_defind_cfg`（比率 0.55/0.94/1.76/3.29/6.11 × `lod_0_cam_dis`，
双方向表 = 原版滞回；竖屏 `_v` 后缀）。而整套 `viewport_lod` 在 2D 被 `is_in_2d_scene`
短路、`_lod` 恒 0（MAPORIGINAL-2D §8.1/§8.2）⇒ **2D 沙盘没有运行时 LOD 门控可对齐**，
本 kit 自建档界是正确拍板（⛔ 拿 3D 相机距离比套 2D 缩放是跨维度套用）。
已对齐并机检落地的是：档数 6、层结构（LOD_0 特判 + LOD_1..5 表）、方向（档大=远）、
**各层隐藏模式** —— `apps/kits/mapOriginal/data/lodref.json` + shared `lodref.data.ts` +
`apps/client/test/mapOriginal-lodref.test.ts`：11 层映射全带依据、相对次序零矛盾
（唯一豁免 = river：原版恒隐、本 kit §1.6 自建）。⛔ 现有档界一个数没动。
意外收获：原版大区名只在最远档出（`sandbox_area_name` [1,1,1,1,0]）——与 N2 三带同向坐实。
另坐实：`map_layer_lod`（37 层 3 档）是旧档（与现行 cfg 表 7 层冲突 + 旧档自述待删 +
消费方函数名三证），仅留档。

<details><summary>N3 原始施工单（已退出，留档）</summary>

**为什么**　本 kit 的 `hideAtLod` / `showFromLod` 是**自建**的（`mapoLayers.ts` 抬头已诚实标注）。
原版在 `base.cw` 里有真表：

**为什么**　本 kit 的 `hideAtLod` / `showFromLod` 是**自建**的（`mapoLayers.ts` 抬头已诚实标注）。
原版在 `base.cw` 里有真表：

| 表 | 内容 |
|---|---|
| `map_layer_lod` | 37 层，带中文说明，`lod_hide_cfg` **3 档** |
| `map_layer_lod_cfg` | **64 层**，`lod_hide_cfg` **5 档** + `is_lod_0_hide` |

★ 消费方在 **2D 路径**：`script/scene/mapview/2d/background/forest_grid_layer_view.lua:21`
调 `birdview_mgr:get_map_layer_lod_cfg(...)`。

⚠ **但档界阈值取不到**：`birdview_mgr` 与基类 `big_city_ground_layer_view` **都不在干净集**
（2D mapview 13 个文件里 `lod` 只出现在那一个文件，而且只是存下来不用）。
⇒ ⛔ **不能直接照搬档号**。

**做什么（按序）**
1. 先补证据：在 `disasm/` 里找 `big_city_ground_layer_view` / `birdview_mgr`，确定档界怎么定的。
2. 拿到档界前，**只做交叉校验**：把原版表落成一份参考数据，机检「本 kit 的层在原版表里
   对应层的相对次序」不矛盾（如 `road`/`res` 属「静态层、几乎不隐藏」，`creature`/`bullet`
   属「动态层、全档隐藏」）。⛔ 别改现有档界。
3. 档界拿到了再谈对齐。

**风险**　⚠ 高（会动所有层的可见性）。**依赖**　N0；第 1 步是独立的调研，可以并行。

</details>

---

## 6. N4 · 研究项（不阻塞，按兴趣排）

### N4-B1　`base.cw` 余下的语义
- `client_res` 行里的 tag-4 子表：`ui_offset` / `vector` / `variant_*_list`（结构可读、含义未考）
- `city` 命名空间其余桶 ✅ 已粗筛（2026-09-23，`[实测]`）：`[2]` 城等级数值 / `[3]` 董卓 /
  `[4]` 要塞 / `[8]` 属性格式 / `[10]` 可占领码头均服务端数值、无关；`[6]` 郡 57 行 / `[7]` 州
  10 行（含化外）是元数据（命名已被 N2 覆盖）；⚠ `[5]` 8 行**名胜地标**（东海/九寨沟/泰山/
  长江/黄河…带 `no_show_default_mountain`）是唯一与表现层沾边的 —— 本 kit 无地标层，
  登记为新开放项。
- minimap 四表 ✅ 已查明（2026-09-23，`[实测]`）：`minimap_plate`（10 行）= 9 州板块 +
  世界板块的图键/缩放界（几何列全 0）；`minimap_name_plate`(193)/`_canton`(229)/`_area`(1270)
  = 板块/州/郡三档的「地图文案_X」key 串清单（含赛季变体）；**坐标不在 base.cw**，在干净集
  `season_cfg/s1/{canton,area}_name_info.lua`（州 9 条带 grid+bounds、郡 55 条带 grid+area_id）
  —— 即 N2 已抽的那两份。⇒「缩略图标注原版化」**可行、无数据缺口**（labels.json 已有
  9+55 带坐标，minimap 投影与 plate 同式），剩样式决策（`show_progress` 语义未考 `[推断]`）。
- ⚠ 已查过、**不适用**的两个：`land.offset_2d` 只有 2 行非空（赛事城墙楼梯之类）、
  `variant_client_res_id_list` 只有 15 行非空且 id ≥ 220，**都不在 s1 的 res 值域（1..61）内**

### N4-B2　`decorate_layer_res` / `birdview_build_icon_cfg` / `scene_split`
✅ 已查明（2026-09-23，`[实测]`），三表勾销：`decorate_layer_res`（235 行）= 地表装饰件
注册表（含雪季变体列），弱相关且 N1 烘焙已覆盖（残余价值 = 雪季换件查号）；
`birdview_build_icon_cfg`（183 行）= 鸟瞰视图建筑类型→图标 res 映射，v1 无建筑数据、无关；
`scene_split`（10 行）= 3D 按州分场景加载登记，与 2D 表现层无关。

### N4-B3　`grid` 层：原版到底有没有线框网格 —— ✅ 已查明（2026-09-23）
结论：**没有独立的线框网格层**（两张 lod 表全量导出 `[实测]`，grid 名层全是格子类叠图：
`grid_state`=占领状态层、`birdview_grid_state`=过渡层地块格子、`forest_grid`=特殊城逐格
建筑件且 S1 数据为空 `[disasm]`；干净集 6,620 Lua 无 DrawNode 类线框 API、base.cw 串池无
「线框/格子线」`[干净集+实测]`）。
**但 2D 地表视图内嵌常显格线子系统** `[disasm]`：`2d/background/ground_layer_view`
（⛔ 不在干净集 —— 这正是此前「无证据」的原因）建 `line_layer` @ `MAP_ZORDER.FRAME`(=1400)，
用 `GROUND_GRID_LINE`（`ground_down/grid_line.png`，全季通用）铺 `{pos,width,angle}` 线段、
angle = deg(atan(0.5)) = **26.57°**（2:1 菱形格边方向），`obj2d.static_nodes` 静态合批、
随块刷新；贴图实物 `[实测]` = 8×8 仅一条 1px 淡黄线（252,252,133，α≈24%）。3D 侧同语义
`[disasm]`：昼/夜两张格线贴花、逐格添加、`is_birdview` 远档跳过。⚠ 覆盖粒度
（逐格密铺 vs 块界）未坐实，标 `[推断]`（3D 逐格语义 + 贴图形态支持逐格）。
⇒ 本 kit `grid` 行从「无证据」改判为：**可做，原版依据 = 地表内嵌贴图格线**
（FRAME=1400、淡黄 α24%、26.57°、静态合批、远档隐），⛔ 不是独立层、不是引擎线框 API。
后续已由 2026-09-24 A12 实现，见机制 §9.1；本节保留研究时的证据边界。

### N4-B4　短 Proto 的 Lua 明文
`../sourceVersion/sgzz-2084.1768/` 的干净集是 6,620 个大 Proto；10,486 个短 Proto 因弱 key
假阳性被寄存器越界校验挡在外面。核心业务函数都是大 Proto，⛔ 这条不阻塞任何事。

---

## 7. 明确不做（v1）

| 项 | 为什么 |
|---|---|
| 占领 / 连地 / 行军 / 同盟 | 要服务端（SQL / RPC / worker），v1 无服务端 ⇒ ⛔ 违反「不留半套」 |
| AOI 驱动的**动态** unit（军队 / 营 / 归属态） | 同上。⚠ **静态**城址件已建（本轮），别混淆 |
| 1620² 的 PK 系图 | 等 1500² 这张跑通；要重算世界包围盒与 LOD 档位 |
| 3D 沙盘（原 P6） | 依赖框架 `docs/3d.md` 的 Stage3D；⛔ 不在 kit 内自建 3D 相机 |
| 鸟瞰 / `map_birdview_icons` | 2D 下恒不生效，已判归 `mapOriginal3d` |
| 引 `logic_road.bytes` 做通行/行军 | 它是 3D PCG 的压平遮罩源；原版的路是**纯表现层** |

---

## 8. 当时的命令记录（现行流程见素材工具 README）

```bash
# 内容管线（venv 固定在 /tmp/maporiginal-venv）
P=/tmp/maporiginal-venv/bin/python
$P tools/maporiginal-assets/build_labels.py       # 地名 + 249 座城的真名/类型/等级/形状
$P tools/maporiginal-assets/build_cities.py       # 城址件：15 件 / 1,642 sprite / 249 摆位
$P tools/maporiginal-assets/build_terrain.py      # 地形 + 通行层（挡路集由 base.cw 的 land 直给）
$P tools/maporiginal-assets/install_to_kit.py     # 落 kit + Cocos 镜像（确定性铸 .meta）
$P tools/maporiginal-assets/emit_ledger.py --out apps/kits/mapOriginal/art/LICENSES.md
```

```bash
# 同步与机检
npm run sync:shared && npm run sync:client
npm run verify:sync && npm run verify:protected-paths
npx tsx --test apps/server/test/mapOriginal-content.test.ts apps/client/test/mapOriginal-*.test.ts
npm run verify:all
```

```bash
# 真机重放（N0）
node tools/creator-preview/run.mjs mapOriginal --reuse --out /tmp/maporiginal-run
```

```python
# base.cw 随手查（在 tools/maporiginal-assets/ 下跑）
from ctable_cw import BaseCw
cw = BaseCw()
t = cw.tables()                       # 2,397 张表：名 → 子项索引
rows = cw.rows(t["land"])             # 展平成 {id: 行}
groups = cw.groups(t["city"])         # ⚠ 命名空间要用 groups()，rows() 会报错
```

---

## 9. 交接坑清单（⛔ 都是踩过的）

1. **`rows()` 只在唯一叶子表时能用**。目录里的名字**可能是命名空间**（`city` 下 9 张互不相干的表，
   `id` 各自从 1 起）—— 合并会静默互相覆盖。现在一撞 id 就报错，改用 `groups()` 自己挑桶。
   ⚠ 分桶**本身正常**：`client_res` 就散在 336 个桶里，73,679 个 id 全局唯一。
2. **VFS 里目录名是小写**：配置写 `Gate/` / `Wharf/` / `S1`，包里是 `gate/` / `wharf/` / `s1`
   ⇒ 查资源要**大小写不敏感**。
3. **图集 XML 的 `n=` 未归一化**：常写成
   `…/atlas_mutil_assets/asset/<真路径>@@<材质名>.png`，而 prefab 里写的是 `<真路径>.png`
   ⇒ **两边都要过 `normalize()` 再比**。直接拿 prefab 的路径去查会 50/158 落空。
4. **材质写 `.png`、包里是 `.ktx`**（构建期转的）⇒ 查不到时换扩展名再查。
5. **`assert.equal(-0, 0)` 在 `node:assert/strict` 下会失败**（SameValue 语义）—— 用 `& 1` 别用 `% 2`。
6. **Float32 缓冲 ⛔ 不能 `deepEqual` 双精度**，要用容差。
7. **macOS 是 BSD grep，⛔ 不支持 `grep -oP`**；也没有 `timeout` 命令。
8. **大目录复制用 `rsync -a`**，⛔ 别用 `cp -Rc`（APFS clone 与源共享磁盘块）。
9. **尺寸换算漏了会静默**：件的世界尺寸 = 原图像素 × prefab 的 `scale` × (32 / 150)。
   漏掉那道换算会让所有件**一次性大 4.7 倍**，而 UV / 数量 / 次序的用例**全都照过** ——
   `mapOriginal-cities.test.ts` 已为此专门钉了一条尺寸量级闸，新层照抄这个做法。
