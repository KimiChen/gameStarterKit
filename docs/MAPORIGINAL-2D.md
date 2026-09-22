# 原版《三国志·战略版》2D 沙盘实现机制（设计真源）

> **这份文档是什么**：`mapOriginal` kit 复刻对象 —— 原版 2D 沙盘 —— 的**实现机制记录**。
> 它是本 kit 一切「原版是怎么做的」结论的**唯一真源**：代码注释、README、机检的判据都应引它，
> ⛔ 不要在别处另立一套说法。
>
> **这份文档不是什么**：⛔ 不是施工单（采纳哪条、什么顺序、退出判据在
> [MAPORIGINAL-2D-PLAN.md](MAPORIGINAL-2D-PLAN.md)，**实施状态只在那份的 §5 回写**）；
> ⛔ 不是 3D 沙盘的记录（3D 归 `mapOriginal3d`，尚未建）；⛔ **不进 plan-v5**。
>
> 调研日期 2026-09-22。素材基线：APK `apkdecode/sgzz-1768.2084/elp-unpacked` +
> 发行商 CDN `…/cdn-unpacked`（21 GB）；反查表 `tools/maporiginal-assets/out/name_map.json`（201,443 条）。

---

## 0. 证据分层约定

文档里每条机制断言前面都带一个标记。**⛔ 不许把低档当高档引用**：

| 标记 | 含义 | 可信度 |
|---|---|---|
| `[干净集]` | 反编译出的**可读 `.lua`**（`sourceVersion/sgzz-2084.1768/src-lua/`，6,620 份）直读 | 最高，等同读源码 |
| `[实测]` | 在本仓跑脚本量出来的数据（字节结构、格数统计、像素测量） | 最高，可复现 |
| `[disasm]` | 只有反汇编形态（`disasm/`，17,106 份）。⚠ **常量池可信**（常量走 triangular M 流、不过 code 的每-Proto RC4）；**指令序列有弱 key 噪声** | 中。结构性结论可用，逐指令语义要交叉验证 |
| `[推断]` | 由命名、并列关系、足迹计数等推出来的 | 低。⛔ 不许当事实引用，必须带「推断」字样 |

★ 前缀表示**已独立复核**（不只是调研 agent 报的）。首核 13 条为维护者本人重跑/原地读；
2026-09-22 **补核轮**（维护者指派、AI 助手执行，逐条原地核对 pointer + 找反例）覆盖其余 41 条。

### 本文档的核验深度（2026-09-22 起：**全部已核验**）

本文档 54 处证据标记**当前全部带 ★**：

| | 来源 | 核验状况 |
|---|---|---|
| 首核 13 条 | 维护者本人重跑过脚本 / 原地读过文件 | **已核验**。可直接当依据动手 |
| 补核 41 条 | 2026-09-22 维护者指派 AI 助手逐条原地核对 pointer + 找反例 | **已核验**，裁定与修正就地写回 |

原计划的「逐条断言独立对抗核验」首轮因额度被终止、零结果；**补核轮已于 2026-09-22 完成**。
⚠ 补核轮的收获证明「自标不可尽信」是对的，三类错误都抓到了实例：

- **内容错误 5 处**（已就地修正）：§2 的 `MAP_ZORDER` 值表（枚举实为 `i×100`，原记的
  101/102/108… 是「索引 +100」）；§4.1 `conver_res_config` 示例（实为 `river_12_1_x`，
  原写 `ground_river_12_1_x`，base.cw 串池 0 命中）；§6 `client_res` 源路径列数（**12 列**，
  原写十列）；§6.1 根资源数字（两版 APK 实含 119 条、「1,784/95.2%」无现存出处，现值见 §6.1）；
  §8 「2D 拉到头换小地图」（该链路是 **3D/自走棋**行为，2D 视口从不派发 `vp_scale_max_limit`）。
- **证据档位标错 9 处**（已就地改标）：多条只存在于 `disasm/` 的文件被自标 `[干净集]`
  （`ground_block_grid` / `river_layer_logic` / `res_layer_logic` / `layer_aoi_build` /
  `share_res` / `_get_ground_res_id` 等）；反向地，`logic_road` 的消费者实为**干净集**铁证，
  自标 `[disasm]` 反而标低了。
- **表述过宽 3 处**（已收窄）：§1.6 `_top_group`「6+ sprite、low_z 逐个递增」与
  `_polygon_mask_group` 的 `tt_03`/`scale 2.42`（单样本被写成定义）、§3.1「res_multi
  消费者全是逻辑」（有渲染侧例外 `terrain_layer_view`，S1 无实际绘制）。

首核阶段抓到的两处自标出错同列备案：
① 调研说「原版一格 150×75」，实测 `scene/grid_state/png/*.png` 逐格件画布正好 **300×150**
（`TILE_WIDTH=150` 是**半宽**）；
② 调研说「ShowLayers2d 27 条」，实测是 **36 条**。

---

## 1. 地表底：一块 10×10 格、三层叠加的多边形

### 1.1 数据层是三个，显示层只有一个

★ `[干净集]` `script/config/map_layer_config.lua` 的 DataLayers 里有**三个平级**的地表层：
`ground2.bytes`→`ground_layer_logic`、`ground_desert.bytes` + `ground_desert_path.json`、
`ground_snow.bytes` + `ground_snow_path.json`。
而 ShowLayers2d 里**只有一条** `ground`（`scene_clz = "2d.background.ground_layer_view"`，
`grid_type = LAYER_TYPE.BLOCK`，`level = MAP_ZORDER.BG`）—— desert/snow **没有自己的显示层**，
被 ground 的 view 一起画。

★ `[干净集]` 三层 bytes 格式相同：`[u16 BE rows][u16 BE cols][行主序 u8]`，取值
`string.byte(gridInfo, col*r + c + 5)`（offset=5）。**整块字符串留在内存不解析。**
（取值实现的直读落点是 `map_lua.lua`；基类 `base_layer_logic` 同构但只有 disasm 形态。）

### 1.2 「一格」= 一个 10×10 格的 block

★ `[干净集]` 基类 `get_grid_size()` 返回 `TILE_WIDTH*2, TILE_HEIGHT*2` = **300×150**（一个逻辑格）；
但 `GroundLayerData` / `BaseSurfaceLayerData` **都覆写成** `TILE_WIDTH*20, TILE_HEIGHT*20`
= **3000×1500** ⇒ 这三层的「一格」是一个 **10×10 逻辑格的 block**。S1 是 **152×152 块**
（150 格 + 一圈 margin；`layer_info.lua` 给三层的 `offset` 都是 `{-10,-10}`）。
（补核轮：基类定义只在 disasm（常量池 `×2` 级），两个覆写在干净集 `ground_layer_logic.lua:7-9` /
`base_surface_layer_logic.lua:14-16` 直读；`layer_info.lua` 三层 offset 逐字命中。）

> ★ `[实测]` **原版一个逻辑格 = 300×150 px**。`config_2d.lua` 的 `TILE_WIDTH=150` / `TILE_HEIGHT=75`
> 是**半宽/半高**。独立佐证：`scene/grid_state/png/*.png` 这些**逐格**状态件画布正好 300×150、
> `scene/grid/png/grid_sel.png` 是 200×100 的 2:1。
> ⚠ 早先有过「一格 150×75」的说法（把 `get_grid_size = TILE_WIDTH*20` 读成 20 格一块），**是错的**：
> `TILE_WIDTH*20 = 半宽 × 2 × BLOCK_SIZE(10)`，自洽于「10 格一块」。

### 1.3 三层是「叠」不是「替」

★ `[disasm]` `GroundBlockGrid:create_view` 里 `for _, ground_type in ipairs(GROUND_DATA_TYPE)`，
`GROUND_DATA_TYPE = {"ground","desert","snow"}`，每种地貌各建一个 polygon 节点 + 一个 top 节点：

```
POLYGON_LAYER_ORDER = { ground=100, desert=200, snow=300 }
TOP_LAYER_ORDER     = { ground=101, desert=201, snow=301 }
```

（⚠ 补核轮改标：`ground_block_grid.lua` **不在干净集**，证据是 `ground_block_grid.lua.disasm`；
数值 100/200/101/201/301 从常量池直接解出，snow=300 落在未打印槽位、系结构推断。）

★ `[实测]` S1：ground 层 23,104 块**全非零**；desert 4,762 块（20.6%）、snow 4,186 块（18.1%）、
两者同时有的 489 块（补核轮 numpy 复算逐项一致）。⇒ 同一块可以同时挂草地底 + 沙漠贴片 + 雪贴片。

### 1.4 ★ 铺满一块的办法：整数次 GL_REPEAT + 微量拉伸

这是「原版怎么用一张 256² 的图铺满 3000×1500」的答案。★ `[disasm]` `ground_layer_view.lua` 的 `_init`
（补核轮逐指令+常量池核对吻合；⚠ `GROUND_VB_TBL` 一行实在**文件作用域**构建、非 `_init` 内，并列于此只是呈现）：

```lua
local sprite_info = Texture:get_quad_info(grass_res.src_name, true)  -- ★ 第 2 参 = gl_repeat
local u = sprite_info.w * math.floor(block_w / sprite_info.w)        -- 256 * floor(3000/256) = 2816
local v = sprite_info.h * math.floor(block_h / sprite_info.h)        -- 256 * floor(1500/256) = 1280
GROUND_PIC_TBL = { 0, v/2,  u/2, 0,  u, v/2,  u/2, v }               -- 纹理空间的菱形
GROUND_VB_TBL  = { -24000, 0,  0, -12000,  24000, 0,  0, 12000 }     -- 1/16 px 定点 ⇒ 半宽 1500/半高 750
```

- **横向 repeat 11 次、纵向 5 次**；2816 texel 铺到 3000 px ⇒ 拉伸 1.065×，1280→1500 ⇒ 1.172×。
- 取 `floor` 的意义是**让块边界落在整周期上**，块与块之间不出现半个花纹的错茬。
- UV 是世界/屏幕**轴对齐**的线性映射 ⇒ 底纹**不跟着菱形转**。
  ⇒ 观感是「**一整张连续的大地毯被菱形裁出来**」，⛔ **不是「每格一块菱形地砖」**。
- ★ `[disasm]` 节点摆在块的几何中心：`x, y = grid2pos(r-10, c-10); y -= TILE_HEIGHT * 9.0`
  ⇒ 等价于块中心格 `(r-5.5, c-5.5)` 的坐标。（⚠ 补核轮改标：该摆位代码只在 disasm；
  `9.0` 的 double 位形在常量池精确命中，回代 `grid2pos` 公式吻合。原自标 `[干净集]`。）

### 1.5 ★ 平地底全图只有一张图

★ `[干净集]` `ground_layer_logic:get_grid_res()` = `share_res.get_client_res_by_id(id).src_name`，
id 来自 `IdConsts.RES_GRASS_1`；★ `[干净集]` `season_func_def.lua:418` 的 `get_ground_grass_res = false`
⇒ **常规季无季节覆盖**（补核轮：行号与内容精确命中）。★ `[disasm]` 2D 视图侧另有一条**独立入口**按名直取：
`ground_layer_view.lua.disasm` 常量池 `['share_res','get_client_res_by_name','草1',…]`。

★ `[实测]` `IdConsts` 的键在包里是乱码 `TES_RRASS_,`，经 **KS[11] 定点修复**还原为 `RES_GRASS_1`：
差位 idx 0/4/10、XOR 差量 `0x06 / 0x15 / 0x1D`。同一组差量对另外三个 11 字符串**四中四**：

```
TES_RRASS_,  → RES_GRASS_1     RILEJHEIGHI → TILE_HEIGHT
QORLQ_WIDTU  → WORLD_WIDTH     JOGIV_FRAMX → LOGIC_FRAME
```

⇒ ★ `[推断→实证]` `草1` / `RES_GRASS_1` 的落点是 **`ground_down/underground1.png`**（256²、ETC2 RGB、
100% 不透明由压缩格式直接成立、双向 wrap 缝比 0.90/0.92［1px 边带 RGB Pearson 口径；
原记 0.90/0.91 未注明口径，定性一致］）。
⚠ 它**在任何 prefab 里都不留路径** —— 按 id/名从 `share_res` 取 ⇒ 扫 prefab 永远扫不到它。
「0 个 prefab 消费者」是**机制使然**，⛔ 不是缺证据。
（补核轮：全量 100,689 个 prefab.bin 字节扫描 `underground1` **0 命中**；
阳性对照 `underground2`/`underground3` 各中 60 个且位置与 §1.6 吻合，扫描方法有效。）

> ⇒ **整张 S1 的地表底就是一张 `underground1` 铺满**，再叠 snow/desert 的 block 覆盖。
> 画面上的颜色变化**全部来自上层的 res_field 摆件与山体件**，⛔ 不来自地表底。

### 1.6 `_polygon_group` / `_top_group` 基本成对（⚠ river_hean 例外）

★ `[实测]` 三种 prefab 后缀是三套不同的东西，⛔ 别混（补核轮：name_map 全量计数 + prefab_bin 结构解析；
包内真后缀是 `.prefab.bin`）：

| 后缀 | 结构 | 角色 |
|---|---|---|
| `_group` | 一个 `node_2d` 挂**一个** `sprite_2d` | **立体件本体**（山、树、资源田）。⚠ 该形态对山/树成立（mountain_new 13/13、senlin 10/10），但 scene/ground 全量 1,162 个 `_group` 里严格同构的约 61%（zhaoze/grass 等有多节点/动画帧变体） |
| `_polygon_group` + `_top_group` | 前者 = `polygon_2d` 铺一张底图（177/177 零例外）；后者 = 若干个 `sprite_2d`（desert 5–17、snow 12–23、**river 仅 0–4**——⚠ 2026-09-23 实测收窄：这条只对 `scene/ground/river/` 的 57 个成立；同族的 `river_yellowriver` 是 **0–30**（中位 21）、`river_longriver` 是 **0–19**（中位 6），⛔ 别读成整个 river 族），各带独立 pos/scale/angle 与**互不相同的** `low_z`（约 2/3 按子序递增——原写「6+ 个、逐个递增」，补核轮按实测收窄） | **区域底色多边形 + 手摆细节**。⚠ **只出现在 snow/desert/river 三族 block 级地貌带**（desert 60+60、snow 60+60、river 57+57；river 系另有 bohai/longriver/yellowriver 变体目录；**`river_hean` 有 8 个 `_top_group` 无 polygon 对**，「永远成对」不绝对） |
| `_polygon_mask_group` | `sprite_2d`（带 `comp_mask`，222/222）+ `polygon_2d` | 足迹形多边形用填充贴图（`tt_02` 占 150/224）、遮罩做**软边**。遮罩 sprite 名 = 其贴图基名（`tt_03` 只是 63/222）、`comp_mask` 的 `scale 2.42` 仅 36/222——两者都是**示例值不是定义**（原写成了定义，已收窄）。挂 `MAP_ZORDER.TERRAIN_MASK`（证据在 disasm 的 `terrain_layer_view`） |

★ `[实测]` desert 的 60 个 `*_polygon_group` 铺 `ground_down/underground3.png`、
snow 的 60 个铺 `underground2.png`、river 的铺 `river/png/26.png`（补核轮 177/177 全中、零例外）。

### 1.7 ⚠ `_polygon_mask` 那套多格地貌在 S1 **恒不生效**

★ `[实测]` `TerrainLayerView` 只监听 `multi_grid_forest / wetland / wild / hill` 四张 res_pro 表，
而 S1 这四张**全是空表** —— 反汇编里每张都只有 `NEWTABLE` + `RETURN`、`nk=0`：

```
disasm/asset/config/S1/cn/res_pro/multi_grid_{forest,hill,wetland,wild}.lua.disasm
  Proto d0 sc=6 nk=0 …  [2] NEWTABLE  [4] RETURN0
```

⇒ 森林/湿地/丘陵/荒漠的软边地貌层**在 S1 一格都不画**。
⚠ **这条直接打到本 kit 的选源**：`bake_content.py` 的 `TEXTURE_OF` 里那七张
`scene/ground/<生物群系>/png/tt_02` 正是这些 `_polygon_mask_group` 用的贴图 ——
「它们是 2D 侧素材」成立，「S1 画面上真的用它们」**不成立**。

---

## 2. 逐格地块与状态：三条互不相同的层

★ `[干净集]` 跟「一格上画什么」有关的是**三条**，⛔ 不是一条：

| 层名 | 数据 | 视图类 | MAP_ZORDER |
|---|---|---|---|
| `res` | `res.bytes` | `common.res_show.res_logic_view` → `layer_res_field` | `RES` = 3400 |
| `terrain` | `res.bytes`（**同一份数据**） | `common.map.terrain_layer_view` → `terrain_layer_grid` | `TERRAIN`=300 / `TERRAIN_MASK`=200 |
| `grid_state` | 走 **AOI**（服务端） | `2d.map.grid_state_2d_view` | `STATE_DEFAULT`=2000 / `STATE_TOP`=3800 |

★ `[干净集]` `MAP_ZORDER` 是 step=100 的连号枚举（`const.lua:105` 调 `bef_pnum_ee(..., }, 100)`，
函数体 `const.lua:90` 是 `enum_val = i * step`）。⚠ **补核轮修正**：原记的 101/102/108… 是
「枚举索引 +100」，**真实值 = 索引 ×100**（顺序与「归属色块压在资源摆件之下」的推论不受影响）：

```
BG(100) < TERRAIN_MASK(200) < TERRAIN(300) < ROAD(900) < RIVER(1600)
        < STATE_DEFAULT(2000) < CREATURE(3200) < RES(3400) < STATE_TOP(3800) < BUILD_TOP(3900)
```

⇒ **归属色块默认压在资源摆件之下**，只有「顶层建筑」的格才抬到摆件之上。

### 2.1 `res` 层确实是「逐格一个 res_field 单位」

★ `[disasm]` `ViewModelResField:check_validate(row,col)` 逐条筛，四道门（补核轮：
`view_model_resfield.lua.disasm` 常量池与指令结构逐门对上、顺序一致）：

1. `map_data` 没好 → 不画；
2. 新手引导抑制（`_ns0_should_suppress_res_field`）→ 不画；
3. **`res_data:is_terrain_by_type(grid_type)` 为真 → 不画** ⇒ 属于多格地形的格**交给 `terrain` 层整片画**；
4. 该格有 build 且 `build:is_show_res_field()` 为假 → 不画 ⇒ **城/营占的格不叠资源件**。

过筛的格进 `layer_res_field`，`_create_unit` 里
`get_grid_res_by_pos(row,col)` → `sc_create_unit_by_type('res_field', res_cfg, row, col)`。

> ⇒ 本 kit「每个资源格都摆一件 res_field」的做法是**对的**；但漏了第 4 道门
> （城格应抑制资源件）。

---

## 3. ★ 多格地形：锚点 + 覆盖掩码，原版没有「多格地形层」

这是本轮最重要的发现，**推翻了本 kit terrain 管线的核心假设**。

### 3.1 `res.bytes` 就是锚点表，`res_multi` 只是掩码

★ `[实测]` 六项判据全中（本人跑的）：

| 判据 | 实测 |
|---|---|
| `res ∈ 48..61` = **锚点** | **55,127** 格 |
| `res == 0` = 被覆盖但非锚点 | **142,958** 格 |
| `res==0 且 multi==0` | **0 格**（两者**完全互补**） |
| `multi != 0` | 198,085 格 |
| 锚点处 `res == multi` | **55,127 / 55,127** |

★ `[实测]` 每值足迹 = 覆盖格数 ÷ 同值锚点数：

| res 值 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 57 | 58 | 59 | 60 | 61 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 锚点 | 4570 | 4331 | 4515 | 4316 | 8996 | 4054 | 4913 | 6315 | 3609 | 3546 | 3663 | 1210 | 1089 |
| 足迹 | 1 | 1 | 1 | 1 | **2** | 2 | 2 | **4** | **7** | 7 | 7 | **19** | 19 |

1 / 2 / 4 / 7 / 19 是**六边形环**（7 = 中心+6 邻、19 = 半径 2）。
★ `[实测]` 逐值足迹形状（补核轮从数据逐值复算全中；邻接约定 = 按行奇偶错行的六边形）：
48..51 单格；52 = 中心+西；53 = 中心+东南；54 = 中心+西南；
55 = 中心+W+NW+SW；57/58/59 = 半径 1 的 7 格；60/61 = 半径 2 的 19 格。
回代 55,127 个锚点只有 2 例不吻合（99.996%）。⚠ 复现「2 例」依赖两条回代约定：
**越界格跳过不计**（另有 71 例纯边缘裁切）+ **覆盖格允许是同值锚点本身**；从严口径是 74 例。

> ⇒ **美术只按 `res.bytes` 的非零锚点出件；`res_multi` 是「这格属于哪个件」的掩码，⛔ 不参与出图。**
> ★ `[disasm]` `res_multi` 的消费者**几乎全是逻辑**：`shape_mgr` 的架桥判定（`.is_block`）、
> 地貌 tips、环境音（补核轮升格：干净集 `audio/amb/rule_grid_type.lua:10-15`）、`map_mgr`（mapallmodel 透传）。
> ⚠ **有一个渲染侧例外**：`terrain_layer_view` 直接读 res_multi（§3.5 的连通区机制）——
> 原写「全是逻辑不是渲染」的全称判断不成立；但 S1 四张 multi_grid 表全空、无实际绘制（§1.7），
> 「res_multi 不参与 48..61 山体撒件」的核心意思仍成立。
> ★ `[实测]` 覆盖格的通行性继承多格 land 行的 `is_block` ⇒ **整片足迹都挡路**
> （2026-09-23 解开 `base.cw` 的 `land` 表，⛔ 不再是推断）：
> land id **1..46 全部可通行、47..61 全部挡路**（47 名「河」、48..61 名「山1..山14」）。
> ⚠ 因此挡路的是**全部 14 形**（198,085 格），⛔ 不只是 19 格的大山 ——
> 本 kit 早先硬编码只挡 `multi ∈ {60,61}`（43,533 格），**少挡了 154,552 格**，已改正。

### 3.2 48..61 是同一族山体的 14 种足迹

★ `[disasm]` `base.cw` 串池里 `山1..山14` 依次指向
`scene/ground/mountain_new/mountain{1m_01..04, 2m_x_01, 2m_xy_01, 2m_y_01, 4m_01, (空), 7m_01..03, 19m_01, 19m_02}_group.prefab`
（补核轮逐串核对：13 件精确吻合、无第 14 件；⚠ 山3..山8 的相邻性被 ctable 串池去重掩盖，
其归属靠「13 形 × 足迹尺寸序 + 56/山9 双缺」三角定位成立），
另有平行的 `雪山1..14`(mountain_snow) / `荒地山1..14` / `秋季山N`（⚠ 2D 秋季件挂在
**`新秋季山N`** → `mountain_new/grass_fall_new/`，`秋季山N` 标签只带 3D）。
**山9 没有 2D prefab，而数据里字节 56 恰好 0 命中**（res/multi 双侧均 0，补核轮复算；
48..61 各值计数与 §3.1 表逐值一致）⇒ `res 值 v ↔ 山(v−47)`，`RES_LAND_MOUNTAIN_1 = 48`。
★ `[实测]` **2026-09-23 已坐实**（⛔ 不再是三角定位）：`base.cw` 的 `land` 表里
id 48..61 的 `name` 逐条就是 **`山1`..`山14`**，且 id 47 名「河」—— 与 `TERRAIN_TYPE.RIVER = 47` 吻合。

★ `[disasm]` 代码铁证：`res_layer_logic:get_res_multi()` 在 `res_multi.bytes` 缺失时
**直接 `return IdConsts.RES_LAND_MOUNTAIN_1`** ⇒ res_multi 的值空间就是「山」的 land id 空间。
（⚠ 补核轮改标：`res_layer_logic.lua` **不在干净集**，原自标 `[干净集]`；行为在 disasm 逐指令吻合。）

★ `[disasm]` 选哪一套（草/雪/荒）由 `check_ground_type(row,col)` 在 land 行的
`client_res_id / snow_client_res_id / desert_client_res_id` 三列里挑
（补核轮：定义在 `map_mgr.lua.disasm`，调用现场三处独立印证，列名全对）。

★ `[实测]` **带归属在 cell 级不在块级**（2026-09-23 N1 坐实）：`check_ground_type(row,col)`
= `GROUND_TYPE_NAMES[logic_background.bytes 格值] or "ground"`（枚举定义 = 干净集
`const.lua:252` 的 `def_enum("GROUND_TYPE","ground","snow","desert")`；层归属 = 干净集
`map_layer_config.lua` 的 `logic_ground = logic_background.bytes`；选件消费现场 = 干净集
`sparse_layer_block.lua:22-27`）。⇒ 逐格单值、**雪/沙块双挂不产生优先级问题**
（489 个双挂块内实测：41,295 格雪 / 3,292 格沙 / 813 格草；值 2 格 100% ⊆ 雪块、
值 3 格 100% ⊆ 沙块）。本 kit 已照此落地为 `mapoBandAt`（`bands.data.ts`）。
⚠ 附带实测：`荒地山1..14` 的 **2D 件与基础季同件**（`src_name` 逐字相同，仅 `src_name_3d`
不同，13/13）⇒ 沙漠带的山件就是基础季件，没有沙件山。

> ⇒ 本 kit 把 48..61 拆成「山脉/林丛/散落」三族是**本仓自创的分类**，原版是**一族 14 形**。

### 3.3 件的大小 = 原图像素 × prefab 里的 scale

★ `[实测]` `mountain19m_01_group.prefab` = 一个 `node_2d` 挂一个 `sprite_2d`，
贴图 `scene/ground/mountain_new/png/m2.png`，**scale 2.163**、pos(−7.8, 23.0)、`low_z=1`。
`19m_02` 用**同一张 m2**，scale(2.279, 2.083)、angle −0.518；`1m_01` 与 `1m_04` 共用 m7、
靠 scale(1.166 vs 1.238/1.112) 区分。

> ⇒ m1..m10 只有 10 张图，**14 个件靠 transform 变出来**。
> 本 kit 只用了原图像素、**漏了 prefab 里的 `scale`/`pos`/`angle`**。

### 3.4 `mountain_patch.bytes` 是第二遍补件，不是主锚点表

★ `[实测]` 布局 `[u24 BE 条数][条数 × {u16 row, u16 col, u8 件id}]`，3 + 5×3942 = **19,713 B 逐字节吻合**。
件 id ∈ {52,53,55,58,59}，**全部落在 `res==0`、`res_multi ∈ 57..61` 的格上**（即大山**内部**的非锚点格），
3,939/3,942（99.92%）落在多格覆盖区内 ⇒ 件 id 与 res 是**同一值空间**。
★ `[disasm]` GM 面板把它叫「切换山体拼接」（`enable_mountain_patch`，改了要重启——
补核轮：面板项与 handler 俱在，tips 原文「打开/关闭山体拼接，请重启客户端」）。

> ⇒ 作用是**在被 19m 大件平铺的大山区里再补中小件**打散重复感。
> ⚠ 本 kit 把它当**主锚点源**用错了位置。

### 3.5 「按连通区一件」的机制存在，但 S1 恒关

★ `[disasm]` `TerrainLayerView` 的 `get_center_pos` 查 `MultiGridDict[land_type]`（格key→中心key 预计算表），
`make_dict` 用 `shape_mgr:get_land_range(shape,row,col)` 把该件全部格反向登记；
一件只要有 ≥1 格进视口就整件显示。
（补核轮：三个机制点全部对上；⚠ `MultiGridDict` 的构建点落在弱 key 噪声区，「预计算」系推断。）
⇒ 原版**确实同时存在**「按锚点撒件」与「按连通区一件」两套，但 S1 只跑前者（§1.7 四张表全空）。

---

## 4. 河流与道路：选片规则是**制图期烘死的**

### 4.1 河

★ `[disasm]` `river.bytes` 是「河格 → `river_path.json` 下标」的单字节图
（⚠ 补核轮改标：`river_layer_logic.lua` 不在干净集，原自标 `[干净集]`；
字节值实测 ≤102 恰 = 路径表条数，强支持下标语义），
★ `[实测]` 头 `01f8 01f8` = **504×504**、body 254,016 B，**列主序** `byte(c*row + r + 5)`
（disasm 取值式 `p2*self.row + p1 + self.offset`，与基类行主序式形成结构对照）。
★ `[disasm]` `river_layer_logic:_init` 里 `grid_width = TILE_WIDTH*6` ⇒ **一个「河格」= 3×3 逻辑格 = 900×450 px**
（常量 6 以 denormal 位型 `3e-323` 出现，同档标错已改）。

★ `[实测]` `river_path.json` **102 条**（river 51 / yellowriver 26 / longriver 25），每条形如
`["scene/ground/river{,_yellowriver,_longriver}/<形状>_<n>[_x][_y][_xy].group"]`
（⚠ 补核轮修正：longriver 实际多一层 `river_longriver_high/` 目录；第二数字不恒为 1——
`_1`×92、`_2`×6、`_3`×2、`_4`×2）；
`conver_res_config()` 就地改写成 res 名（`scene/ground/river/12_1_x.group` → **`river_12_1_x`**，
即剥掉 `scene/ground/` 两段；⚠ 原写的 `ground_river_12_1_x` 在 base.cw 串池 **0 命中**，已修正）。

> ⇒ `_x/_y/_xy` 就是 x/y 镜像变体，形状号 1..22 是「直/弯/汇/岸」的**手工枚举**（原写 1..21，漏 22）。
> **运行时不做任何邻接判断** —— 选片在制图期就烘死在 `river.bytes` 的字节值里。

★ `[disasm]` 三条水系的颜色差来自**一张 2048² 全图蒙版**（`river_color_mask.ktx`，实测 2048×2048 ETC2A8）：
作为 `normal_river` 材质的额外 `set_param` 纹理采样，⛔ 不是换贴图。

### 4.2 道

★ `[实测]` 图集片按邻接方向分类 ⇒ 机制与河同构（制图期烘死）。⚠ 补核轮修正：分类全集是 **9 类**
（`line / horizonalturn［原版拼写如此］ / upverticalturn / downverticalturn / upend / downend /
uptcross / downtcross / xcross`，另有 1 片 `mask`），原文档只列了 6 类。
三套皮肤：`road` / `road_ash` / `road_snow`（**共用** `road.xml`，58 片）
+ `road_official` / `ss_road`（图集实名 `road_direct.xml`）/ `road_liangdao`。

> ⇒ 本 kit **完全没有道路层**，而数据与素材（三套 road 图集）**都在手**。
>
> ★ `[干净集]` **坐标系已定**：`asset/config/S1/cn/res_pro/road_info.lua` 的 `layer_info` 直给
>
> ```lua
> { width = 1125, height = 1125, grid_width = 200, aridJheighi = 100 }
> ```
>
> ⚠ `aridJheighi` 是 **KS[11] 定点损坏**的键名；用 §1.5 那组已知差量（差位 idx 0/4/10、
> XOR `0x06 / 0x15 / 0x1D`）还原正是 **`grid_height`** —— 该差量组原记「四中四」，**这是第五例命中**。
> ⇒ 一个路格 = **半宽 200 / 半高 100**（逻辑格是 150 / 75）= **4/3 个逻辑格**；
> `1500 × 150/200 = 1125` 与 `width/height` 精确自洽。
>
> ★ `[实测]` **`road_info.lua` 与 `road_info.bytes` 是同一份数据**：`tiles` 与记录都是
> **42,018** 条，逐条 key/value **42,018 / 42,018 全等**。
> ⚠ 但 **bytes 的第一个 u16 是 `col`、第二个才是 `row`**（转置！按 `(row, col)` 读只有
> 115/42,018 对上）。lua 侧的键是客户端格键 `(row << 16) | col`。
>
> ★ `[实测]` `road_info.bytes` 结构（⛔ 推翻「半文本未解」的旧说法 —— 可打印只占 **15.6%**，
> 它是二进制）：
>
> ```
> [u8 组数 = 37]
> [37 × {u8 a（70..87 = ASCII 'F'..'W'）, u8 b（0/1）}]   ← 75 B 前缀
> [u16 BE rows = 1125][u16 BE cols = 1125]                 ← 与其它层同款网格头
> [42,018 × {u16 BE col, u16 BE row, u8 类型 1..37}]
> ```
>
> **75 + 4 + 42018×5 = 210,169 B**，与文件长度精确相等。
>
> ★ `[干净集]` **片是制图期烘死的**，与河同构 —— 上面那条推断成立。那个 u8 是
> `type_info` 的下标（37 条，每条 `{client_res id ∈ 1170..1187, 水平翻转 ±1, 1}`）。
> ⚠ 本文档 2026-09-23 曾一度据「记录只带组号」改写成「运行时按邻接拼」，**那是错的**
> （把类型下标误读成了组号），已撤回。
>
> ★ `[实测]` **id → 精灵的绑定已由 `base.cw` 的 `client_res` 表给出**（2026-09-23，见 §11-1）：
> 表里 **19 条**路片本体（id **1169..1187**），名「路1..路19」，
> 按 prefab 名字母序排，但 `up_end_2`（名「**路19**」）反倒占了**最前的 1169**、S1 不用
> ⇒ `type_info` 覆盖的 1170..1187 正好是「路1..路18」这 18 条。
> ⚠ **`type_info` 的 id 与 `client_res` id 是 1:1**（⛔ 无偏移）。
> 本文档 2026-09-23 一度写成「小 1、要 +1」——那是**启发式扫表整体错位一格**的产物
> （当时把 1169 读成了 1170），已由真解码器（§11-1）纠正。
> ⚠ **绑定结果不受影响**：当时「错位一格」与「+1」两个错误互相抵消，18/18 条绑定本就是对的，
> 路图集逐字节未变；改的只是**推理**。
>
> ```
> type#1170 → cr1170 路1  down_end_1    → downend/7-1
> type#1172 → cr1172 路3  down_tcross_1 → downtcross/9-1
> type#1179 → cr1179 路10 line_1        → line/1-1
> type#1183 → cr1183 路14 up_end_1      → upend/6-1
> type#1184 → cr1184 路15 up_tcross_1   → uptcross/8-1
> type#1187 → cr1187 路18 xcross_1      → xcross/5-1
> ```
>
> ⚠ **早先的「邻接度签名 + 字母序」推断 17/18 命中**，唯一错的正是当时就标为「未定」的
> 那张（应 `upend/6-1`，推断取了 `6-2`）—— 已由本表改正。
> 邻接度签名**保留为交叉校验**：`build_roads.py` 每次构建都重算，与 `client_res` 给出的类
> 不符即退出。⚠ 度 0 = **孤立的一格路头**（实测 16 例），归入 1。
>
> 复现：`tools/maporiginal-assets/recon_road.py`。⇒ **道路层已解除阻塞**。

---

## 5. 建筑 / 城 / 营：AOI 驱动的 unit

★ `[实测]` `city.bytes` 格式：`[u16 BE 城数=249][每城: u8 格数 N][N × {u16 BE row, u16 BE col}]`，
**11,007 B 精确读完不多不少**。每城的**第 1 个格 == `res_pro/city_center.lua[i]`，249/249 逐条相等**。
占格形态只有 5 种：

| 格数 | 座数 | 判读 |
|---|---:|---|
| 11 | 204 | 普通城池（3 行 × 4 列菱形去一角） |
| 23 | 9 | **大型城池**（州城/洛阳级） |
| 7 | 24 | 关隘 |
| 6 | 11 | 长条件（城门/渡口类） |
| 4 | 1 | 单件 |

★ `[实测]` **249 座城的真名 / 类型 / 等级 / 形状已全部取到**（2026-09-23，`base.cw` 的
`city[1]` 桶，经 `city_shape_grids` 的「格 → 城序号」对上，249/249 零缺）：
类型 = 大型 71 / 中型 104 / 小型 74，等级实测 **3..10**（⛔ 不是 1..8），10 级唯一一座是**洛阳**。
⚠ 本文档与 `emit_labels.py` 一度写着「⛔ 无名字（名字在服务端 AOI 里）」——**那是错的**，
名字一直在客户端配置里，只是当时 `base.cw` 没解开。

★ `[实测]` **上表的「判读」列由此独立坐实**：形状（来自 `base.cw`）与占格数（来自 `city.bytes`）
**1:1 无例外** —— `H_SHAPE`=11 格 204 座、`DOUBLE_H_SHAPE`=23 格 9 座（即「州城 / 洛阳级」，
洛阳确在其中）、`RADIUS_2`=7 格 24 座（关隘）、`PIER_1/2`=6 格 11 座、`PIER_4`=4 格 1 座。
两条完全独立的数据链给出同一张表。

★ `[实测]` **城址件已取到**（2026-09-23）：`city[1].client_res_id` → `city_res.editor_brush_res_path`
（`asset/scene/build/<子目录>/<名>.group`）→ 磁盘上配对的 `<名>_group.prefab.bin`。
⚠ 配置里目录名写 `Gate/` / `Wharf/`，VFS 里是**小写** ⇒ 必须大小写不敏感地查。
★ 件的内部结构与 `_top_group` **完全同构**（§1.6）：`node_2d` 根 + 一串 `sprite_2d`，
各带 pos / scale / angle / `low_z`，按 `low_z` 升序决定压盖。
★ **15 个件覆盖全部 249 座**（东/南/西/北 × 小城/都城 8 + 关卡 3 + 码头 3 + 洛阳专用 1），
合计 1,642 个 sprite、158 张贴图。
⚠ 本文档一度判 `.group` 是「3D 件、2D 沙盘用不上」——**那是错的**：路径在 `scene/`（2D 树）下，
`scene_3d/` 才是 3D 树。
⚠ 贴图散在 8 张图集里（`atlas_tex/{s17_main_city, remain_tex, gate, pk21_*, pk19_*, gongchengying}.xml`），
且图集 XML 的 `n=` 常写成 `…/atlas_mutil_assets/asset/<真路径>@@<材质名>.png`
⇒ **两边都要过归一化再比**，⛔ 直接拿 prefab 的路径去查会 50/158 落空。

★ `[实测]` **城根本不在 `res.bytes` 里**：2,689 个城格 **100% 是 `res==1`（平地）且 `res_multi==0`**
⇒ 地块层完全不知道城的存在，城是**建筑层**画上去的。

★ `[disasm]` 画它的是 `res` 层下的 `res_show/layer/layer_aoi_build.lua`：
`scene_mgr:sc_create_unit_by_aoi(...)` 按**服务端 AOI** 建单位 ⇒
**城/营/建筑一律是 AOI 驱动的 unit，⛔ 不是地块贴图，也不是逐格摆件。**
（⚠ 补核轮改标：`layer_aoi_build.lua` 只在 disasm，原自标 `[干净集]`；干净集旁证：
兄弟文件 `layer_aoi_unit.lua:11` 同款调用，装配链 `logic_layer_config.lua:55-60` 闭合。）

★ `[实测]` `birth_point.bytes` = `[u16 点数=19097][19097 × {u16 row,u16 col}]`，76,390 B 精确读完、
零重复 ⇒ 是**出生/迁城候选格的稀疏点阵**，⛔ 与画面无关。

---

## 6. 资源加载：三段表 `share_res`

★ `[disasm]` `share_res` 的三个索引都是**构建期预生成、随包发货**，⛔ 不是运行时建的
（⚠ 补核轮改标：`share_res.lua` 不在干净集；第一行实际带 `___get_special_cfg` 回退参）：

```lua
share_res.client_res_cfg       = get_cfg("client_res", ___get_special_cfg)
share_res.client_res_id_2_name = get_cfg("res:id2name")
share_res.client_res_name_2_id = get_cfg("res:name2id")
```

★ `[disasm]` 表本体在**一个 ctable 大包**里：`config/<赛季小写>/<语言>/base.cw`（+ `base_patch.cw`），
`ctable.new(read_file_vfs(...))` **整包一次读入、不展开成 Lua 表**；字段**按需从 ctable 读**
（所以 63.7 MB 配置常驻代价 ≈ 文件本身）。
（补核轮：base.cw 本体经 namehash 密码学级锁定 = 66,776,016 B、头 `fc49ee02…` 偏移表首项 0x5458 全中；
base_patch.cw 两版 APK 俱在。⚠ ctable 是 C 模块，「按需读」为 Lua 侧结构佐证。）

★ `[disasm]` `client_res` 行里有**十二列源路径**（⚠ 补核轮修正：原写十列，漏 `_color_v` 与 `_color_3d_v`）：
`src_name` / `_v` / `_3d` / `_3d_v` / `_color` / `_color_v` / `_color_3d` / `_color_3d_v` /
`_common` / `_common_v` / `_common_7th` / `_common_v_7th`
⇒ **皮肤（2D/3D UI）、竖屏、无障碍色彩增强全靠「同一行里换一列」**
（换列机制另有干净集直证：`create_res_factory.lua:19-33`）。

> ⇒ 原版的寻址是「**逻辑名 → id → 真实路径**」三段表；本 kit 把格 id 直接焊进图集坐标。
> ⚠ 这是**架构差异不是缺陷**：我们的像素在合并图集里，UV 只在那张 PNG 的坐标系里有意义。

### 6.1 `.group` 是组名不是文件名

★ `[实测]` `*_path.json` 里的 `<n>_<m>.group` **不是文件名**，是**组名**；真身是
`<名>_polygon_group.prefab` + `<名>_top_group.prefab`（另有 `_polygon_mask_group`）。
（补核轮全量验证：name_map 里 `.group` 结尾条目 0 个；snow 52 + desert 51 组名 103/103 成对存在。）
★ `[disasm]` `_get_ground_res_id(path, suffix)` 把它拼成 `snow_13_2_polygon` / `snow_13_2_top` 再查
`share_res.res_id`（⚠ 补核轮改标：该函数只在 disasm，原自标 `[干净集]`）。

★ `[实测]` `scene/ground/**` 根资源共 **1,873 条**（清单 `all_root_res_list.cw`），其中 **119 条两版
APK 自带**（`road/*_complex_path_*` 116 条 + `grass/bianjieyun*` 3 条——⚠ 补核轮修正：
原写「两版 APK 一条不含」，系较早的 `missing_ground_roots.json` 漏算 `+.bin` 变体所致）；
**1,754/1,873（93.6%）靠运行时下载**。到位现状（按 `root_res_coverage.json` 口径复算）：
CDN 已取 1,673、APK∪CDN 并集 **1,792（95.7%）**、仍缺 81。
（⚠ 原写的「1,784/1,873 = 95.2%」在现存产物里找不到出处，疑似 CDN 增量抓取的中间态。）

---

## 7. 分层与 zorder：三级叠加

★ `[干净集]` 原版任何可见物的绘制次序由**三级**决定，缺一不可（补核轮：①② 的配置侧干净集直读；
③ 的 `sort_child_by_id` 消费端与 `grid2pos` 公式只在 disasm，为 `[disasm]` 结构级）：

1. **render_layer（引擎绘制桶）** —— `node:set_render_layer(render.LAYER_*)`。桶之间是硬分离的绘制批次。
2. **层根 zorder（`MAP_ZORDER`，步长 100）** —— 每层 `layer_root:set_zorder(cfg.level)`。
   步长 100 是**留缝**的：配置里大量出现 `RES + 1`、`TERRAIN + 1`、`RES - 2`（按真值即 3401/301/3398，
   插在相邻两个整百层之间），用来在两个语义层之间插队而不动枚举表。
3. **层内逐节点 zorder = 屏幕 y 画家序** ——
   `grid_node:set_zorder(-pos_y - zorder_base + zorder_offset)` + 层根上
   `sort_child_by_id(true)`。因为 `grid2pos` 给出 `y = -(row+col+c)*75`
   ⇒ **本质就是 (row+col) 升序、同斜线上奇偶行错开**（⚠ 弱 key 噪声下「奇压偶」的方向不可逐值确认）。

★ `[实测]` 四段实测条数：DataLayers **53** / ShowLayersCommon **31** / ShowLayers2d **36** /
ShowLayers3d **42**（补核轮双重计数复核一致；附带发现：ShowLayers3d 末尾有一对同名重复
`fudao_decorate`，疑原版自身笔误）。2D 实际生效的显示层 = Common 31 + 2d 36 = **67 条**。
⚠ 早先记的「ShowLayers2d 27 条」**是错的**。

> ⇒ 本 kit 只有 6 层、深度**只有兄弟序**，缺的是第 ② 级那把「可插队的刻度」。

### 7.1 ⚠ 一条被用反的论据

★ `[disasm]` 原版 2D 对**平铺层**（ground 细节 / road / grid_state）**本身也在合批**；
逐节点的是**立件层** + `sort_child_by_id`。
（补核轮说破机制：Lua 侧平铺层**也逐格建节点**，合批发生在共有基类 `base_layer_view` 的
`update_static_node` → `obj2d.static_nodes` 的 **2D 专属分支**［3D 分支只 set_parent］；
消费方 grid_state/road/ground 三处俱在。例外：`ground_decal` 走 `decorate_layer_view`
逐格建 unit、不烘焙。原自标 `[干净集]` 已改。）

> ⇒ 「合并 mesh」的结论仍然对（Cocos 下 225 万格会变成上万节点），但
> ⛔ **别再拿 `grid_state_2d_view` 的逐格 `sc_create_scene_node` 当论据** —— 那会把读者引向相反结论。
> 真正的代价是：我们丢了立件层的**跨类共排序**（原版用 `parent_layer_name` 把会互相遮挡的两类
> 塞进同一个 root 解决），而本 kit 的 region 与 decor 是两张独立 mesh、次序恒定。

---

## 8. 小地图与「看全局」：原版 2D 没有「远档」

★ `[disasm]` `viewport.lua` 的 `reset_cam_param`：

```
vp_scale_min     = DESIGN_HEIGHT(720) / screen_h * CAM_SCALE_FACTOR
vp_scale_max     = vp_scale_min * CAM_SCALE_MAX_FACTOR * (is_ob_player and 1.5 or 1)
vp_scale_default = vp_scale_max        ← 默认值就是 max
```

`scale` 的极性是**越大看得越多**（`range = screen_w * target_scale / TILE_WIDTH // 2 + 1`，乘不是除）
⇒ **2D 打开时就已经在最远端**，玩家只能往里推。整个 2D 的缩放行程只有约 **1.4×**
（`CAM_SCALE_MAX_FACTOR` 候选 1.45 / 1.35）；GM 接口 `unlock_view_scale` 做的事是
`vp_scale_max *= 99` ⇒ 发行版这个上限是**刻意钉死的硬夹**。

★ `[disasm]` 「拉到头换小地图」链路 `vp_scale_max_limit → on_vp_change_to_scale_max` →
`close_main_and_open_minimap`（关主界面、开小地图面板）**真实存在，但只在 3D/自走棋成立**：
⚠ **补核轮抓错** —— `vp_scale_max_limit` 全库只由 `viewport_3d`（3 处）与 `viewport_autochess` 派发，
**2D 视口 `viewport.lua` 从无此事件**（`minimap` 一词 0 命中）；2D 到顶仅硬夹、不换视图。
小地图面板底图是**预制静态美术贴图**（`minimap_bg` 配置 id 直取）、⛔ 不是数据烘出来的
（这部分属实；「手绘」是对素材来源的推断）。

> ⇒ 修正后的结论：**2D 的「远」就是到此为止**（默认即最远、行程 ~1.4× 钉死，见上文 ★ 段）；
> 「拉到头换视图 + 换预制素材」是 **3D** 的行为，原写「所谓『远』在原版是换视图」把 3D 误记到了 2D 头上。
> 本 kit 的 6 档 LOD + 自烘远档底图 + 常显缩略图整套是**自创**——见 §10 的定性（结论不变）。

### 8.1 鸟瞰在 2D 恒不生效

★ `[disasm]` `viewport_lod.lua`（`is_in_2d_scene` 全库**仅**此一文件出现）：
`reset_lod_fields` 置 `self.is_in_2d_scene = not dimension_mgr:is_3d()`；
`on_vp_scale_change` **首条指令**就是取它然后 `TEST/JMP/RETURN`
⇒ **2D 下 `_lod` 恒为复位值、`vp_lod_change` 从不派发、`_try_set_birdview_mode`
（全库仅在该文件出现）从不被调**。

⇒ 那 141 张 `map_birdview_icons` 在 2D **一张都画不出来**。
⚠ 「鸟瞰」在原版是**三义**，⛔ 不可一刀切：3D 专属的鸟瞰**视角** / 两版共用的无极缩放
`birdview_mode` / 两版共用的**小地图 UI**。

---

## 9. 本 kit 与原版对照表

| 层 | 原版做法 | 本 kit 做法 | 差异性质 |
|---|---|---|---|
| 地表底 | 一块 10×10 格一个 polygon，**一张 256² 底纹**整数次 REPEAT 铺满；snow/desert 叠 block 补丁 | ✅ **已对齐**（M2-B1 / M2-B2，2026-09-23）：同款 block + REPEAT，snow/desert 块层也已补齐 | ~~★ 架构不同构~~ 已消除；自造的逐格图集整套已删 |
| 多格地形 | `res.bytes` 非零值 = **锚点**，一族 14 形足迹，件 = 图 × prefab scale | ✅ **已对齐**（M0-B1 / M0-B2，2026-09-22）：55,127 锚点直接出件，件 = 图 × prefab scale | ~~★ 核心假设错误~~ 已修；连通域整套已删 |
| 山体拼接 | `mountain_patch` 是大山内部的**第二遍补件** | ✅ **已对齐**：降为补件（3,942 条），主表是 `res.bytes` 的锚点 | ~~用错位置~~ 已修 |
| 逐格资源件 | 每资源格一个 res_field，**四道筛选门** | ✅ 第 4 门已补（M0-B4）：`city.bytes` 的 2,689 个城格抑制资源件 | ~~缺第 4 门~~ 已补 |
| 季/地貌变体件 | `land` 表四套件列（基础/雪/沙/秋），`check_ground_type` 按 **cell 级** `logic_background` 选件（§3.2） | ✅ **已对齐**（N1，2026-09-23）：`mapoBandAt` 同一条数据链；摆件三套件 + 雪山件进图集 | ~~所有格一律基础件~~ 已修。⚠ `autumn_*` 不接（M0-B3 拍板）；沙漠山 2D 与基础季同件（实测 13/13）⇒ 无沙件山 |
| 河流 | 独立几何层，河格 = 3×3 逻辑格，102 条手工形状、制图期烘死 | ✅ **已建**（M3-B2）：102 条原版多边形 + 31,140 片，对位覆盖 100% 的 `res==47` | ~~整层缺失~~ 已补，含 `_top_group` 597 件 |
| 道路 | 选片**制图期烘死**（`type_info` 下标 + 水平翻转），三套皮肤 | ✅ **已建**（M3-B1）：路格 1125²、半宽 200/半高 100 = 4/3 逻辑格，42,018 片 | ~~整层缺失~~ 已补。~~id→精灵绑定是 `[推断]`~~ ✅ 已由 `base.cw.client_res` 升为 `[实测]`（§4.2） |
| 建筑城营 | **AOI 驱动的 unit**，两级配置表选件 | 城址件按「面积前 8 大」**启发式**挑 | 机制不同（AOI 需服务端）。~~**选件**卡在 base.cw~~ ✅ **已建**（2026-09-23）：`city[1].client_res_id` → `city_res.editor_brush_res_path` → prefab，**15 个件覆盖 249 座**，1,642 sprite 已入 `cities.bin`；城名/类型/等级/形状入 `MAPO_CITY_SITES`。✅ **已过真机**（同日 N0）：洛阳 218 sprite 在屏，层序 / 第 4 道门 / 尺寸四项肉眼全过。⚠ 早先判 `.group` 是 3D 件是**错的**：路径在 `scene/`（2D 树）下，与 `_top_group` 完全同构。⛔ 余下未做的是 AOI 驱动的**动态** unit（军队/营） |
| 归属状态 | `grid_state` 层，两个 z 档（2000 / 3800） | 无 | 需服务端 |
| 分层深度 | render_layer + `MAP_ZORDER`（留缝） + 层内画家序**三级** | ✅ **已补第 ② 级**（2026-09-23）：`MAPO_LAYERS` 每层带 `zorder`（照抄 MAP_ZORDER、留缝），**每层一个容器节点**按它升序建 | ~~缺第 ② 级刻度~~ 已补。⚠ 补之前实测有真缺陷：次序取决于「谁先 render」，地表底挂在路/河/山之后把它们全盖住。⚠ 补之后又一条真机缺陷（N0 抓到）：容器节点没继承 layer（Cocos `addChild` 不传播）⇒ 全部 mesh 层被 UI 相机裁掉黑屏，已修 |
| 看全局 | 2D 到顶仅硬夹；**3D** 拉到头才换视图（小地图面板，预制静态底图） | 同相机 6 档 LOD + 自烘远档底图 | 自创（见 §10） |
| 资源寻址 | 逻辑名 → id → 路径**三段表**，十列源路径换皮 | 格 id 焊进图集坐标 | 架构差异，非缺陷 |

---

## 10. 本 kit 自创的东西及定性

| 自创项 | 定性 | 理由 |
|---|---|---|
| 合并 mesh + 单台正交 UI 相机 + 兄弟序 | **必要补充** | Cocos 下上万节点不可行。⚠ 代价见 §7.1 |
| `mapoPainterCompare` 把画家序做进索引顺序 | **必要补充** | 与原版 `-pos_y ∝ (row+col)` 同序；⚠ 只在同一张 mesh 内有效 |
| 6 档 LOD + 40× 缩放行程（0.05–2.0） | **必要补充** | 我们把「沙盘 + 小地图面板」压成一条连续缩放，行程必须比原版沙盘的 1.4× 大得多。⚠ 但门控表是**纯性能手段**，⛔ 不可拿它反推原版行为 |
| ~~8 自造粗类 × 4 变体 + 逐格 UV 翻转~~ | ✅ **已退役**（M2-B1，2026-09-23） | 整套在绕开「图集里不能 GL_REPEAT」这个自我限制。产物 / shared API / mesh builder / 渲染器 / 烘焙函数全部删除 |
| 顶点色调色板 + ACES 预补偿 | **必要补充** | 原版靠美术贴图给色，我们只取灰度 ⇒ 必须有一层上色。⚠ 与原版「色彩模式/色+」毫无关系 |
| ~~`regions.bin` 连通域 + 无锚区补件~~ | ✅ **已被 res 锚点取代**（M0-B1，2026-09-22） | 它存在的原因是我们自己销毁了锚点信息。连通域与 scipy 依赖整套删除 |
| `plate-lod4/5` 由 terrain 自烘 | **必要补充** | 原版远档是手绘、我们没有画师 |
| ~~缩略图贴原版鸟瞰插画~~ | ✅ **已换**（2026-09-23） | 它是 3D 透视渲染，与正交等距无可靠对齐（实测相似变换 IoU 0.62、河网 NCC 0.30）。⚠ 而缩略图在本 kit 里是**可点击导航**的（`mapoMinimapCell` → `centerOn`）⇒ 图与点选换算必须同源。现在由地形按 `mapoWorldToMinimap` 的同一套投影烘 |
| ~~画质档 → 分帧建格步长~~ | ✅ **已删**（M1-B2） | `mapoCreateStepFor` / `createStep` 无任何消费方；近档一屏本来只有几十格，⛔ 不需要分帧建格 |
| ~~`grid` 层 `implemented: true` 但无渲染器~~ | ✅ **已止血**（M1-B1） | 改 `implemented: false`，并加了**通用**守门用例（层 → 渲染器字段的对照表 + 扫视图），新增层自动受管 |

---

## 11. 仍不清楚的

1. ✅ **`base.cw`（66,776,016 B ctable）格式已完全解开**（2026-09-23，逆自 `libnative-lib.so`）。
   余下的是**个别字段的语义**，⛔ 不再是格式问题。

   ★ `[实测]` **头与串池**：`[0] u32 = 0x02ee49fc` 是**串池偏移**（其后 17.6 MB 是
   NUL 分隔串池，含全部字段名）；`[4] u32 = 712,948` 是**对象总数**；
   `[8..]` 是 **对象偏移表**（712,948 项，句柄 → 文件偏移，递增）。
   ⚠ 早先把 `[4]` 记成「串索引偏移」是**错的**（2026-09-23 更正）：在 0xae0f4 处读到的
   「池内偏移」其实是偏移表的表项，值恰好落在数据区、被当成池偏移误解了。
   ⚠ base.cw **不在 `name_map` 里**（没有路径条目），按容器内文件名直取。

   ★ `[实测]` **顶层表目录就是根的第 0 个子项**（`child(0)`），一张 **2,397 项**的
   「表名 → 子项索引」哈希表（`build` … `zhongshuling_market_level_cfg`）。
   ⚠ 早先靠「串池里扫字母序键值对」只看见 1,339 项，且判据要用「池里前一字节是 NUL」
   （真键必指向串**起点**，⛔ 软判据「像标识符」会在 `IER_1` / `RY_6` 这类池内巧合上截断）
   —— 有了解码器后**这套启发式整套作废**，直接读 `child(0)` 即可。
   ⚠ 本文档一度写成「那个 u32 不是对象句柄、语义未知」，**那是错的** —— 当时把 entries 当成了
   **绝对**文件偏移，正确是**相对**偏移（差一个常数 `8 + count*4 = 0x2B83D8`，
   那正好是 entries 数组的末尾）。

   ★ `[实测]` **值编码已从 `libnative-lib.so` 的 ctable 模块逆出**（⛔ 不再靠猜）：
   值解码器在 `0xb3fdb0`，`cmp w2, #5` + 字节跳转表 `@0x11832b0 = 00 0b 10 1a 1f 25`
   ⇒ **类型标签只有 0..5**：

   | tag | 取值 | 含义 |
   |---|---|---|
   | 0 | — | `nil` |
   | 1 | `ldrsw [ptr]` | **int32**（符号扩展） |
   | 2 | `ldr s0,[ptr]` + `fcvt` | **float32** |
   | 3 | `ldr w1,[ptr]` | **boolean** |
   | 4 | `ldr w2,[ptr]` → `0xb3f930` | **嵌套表**：值是**容器内索引**，⛔ 不是全局句柄 |
   | 5 | — | **字符串**：`ptr = base + *(u32*)base + value` |

   ⇒ 「根容器 `[0]` 是串池偏移」由 tag 5 的公式**直接印证**。
   ⇒ `land` 行里 `offset_2d` / `vector` / `variant_*_list` / `even_res_center` 那些「连号大数」
   是 **tag 4 的容器内索引**（同一行的多个子表按序分配），⛔ 不是数字、也不是全局句柄。

   ★ `[实测]` **子容器寻址**（`0xb3f930`）：
   `entries[i] = *(i32*)(base + 8 + i*4)`（`-1` = 不存在）、`count = *(u32*)(base + 4)`、
   **`child(i) = base + 8 + count*4 + entries[i]`**。按它解出 `client_res` → 容器 @0x98ffac、
   `land` → @0x1c2da50、`city_res` → @0x93cbf8，均落在合理位置。

   ★ `[实测]` **表对象的二进制布局**（2026-09-23 从 `0xb3fb50` 的寄存器来源追出，⛔ 不再靠猜）：

   ```
   O+0                        u32  n_array     数组部分长度
   O+4                        u32  n_hash      哈希部分长度
   O+8                        u8   tags[n_array + n_hash]     每项一个 0..5 的类型标签
   O+8+pad                    u32  array[n_array]             数组值
   O+8+pad+4*n_array          {u32 key, u32 value} × n_hash    哈希项，**步长 8 B**
        其中 pad = (n_array + n_hash + 3) & ~3                 （标签区 4 B 对齐）
   ```

   哈希项的 `key` 与 `value` **各自按同一张 tag 表解释**（键多为 tag 5 = 串池偏移，
   于是「字段名 → 值」自然浮现）。⇒ **不需要任何逐表定长假设**。

   ⚠ **早先「行 = 定长 KV 数组」的模型是错的**（`client_res` 曾被定死成「100 B / 25 个 u32」、
   `land` 曾被定死成「392 B / 49 列」）。真相是：**每行本身就是一个独立的表对象**，
   长度天然可变，「变长行边界」这个问题**根本不存在**。
   ⚠ 同理，`is_block` 的「真值是 0x01000000 而不是 1」也是错觉 —— 它是 **tag 3 (boolean)**，
   解码器直接给 `True` / `False`，早先看到的是把标签字节连读进值里的产物。

   ★ `[实测]` **表是多级分桶的**：`client_res` 是两级（桶 → 行），所以要展平后才见到行。
   `rows()` 按「含 `id` 键的子表即为一行」向下展平（`maxdepth=6`）。

   ★ `[实测]` **原先列为「仍未解」的 8 张表，现在 8 张全开**：

   | 表 | 行数 | 列数 | 备注 |
   |---|---:|---:|---|
   | `client_res` | 73,679 | 12 | ⚠ **不是 848 行** —— 早先的定长扫描只看见一个桶 |
   | `land` | 353 | 49 | `is_block` 是真 bool；124 行挡路 |
   | `city` | — | — | ⚠ **是个命名空间**：9 张互不相干的表，真城在 `[1]` 桶（**249 行 / 40 列**，名/类型/等级/形状/`client_res_id` 全有）。⛔ 别合并（`[0]` 桶的「部队攻击/谋略…」会撞 id） |
   | `city_res` | 1,532 | 12 | ★ 带 `editor_brush_res_path` 直指 `asset/scene/build/main_city/*.group` |
   | `city_shape` | 49 | 31 | ★ `even_res_center` / `odd_res_center` / `shape_box` / `even_grids` 都在这 |
   | `city_shape_grids` | — | — | ⚠ **名字有误导**：不是形状表，是 2,689 项的 `grid_key → **城序号**` 反向索引 |
   | `land_shape` | 8 | 4 | 只有 `historic/id/name/season`，与形状无关 |
   | `minimap_plate` | 10 | 17 | |

   ★ `[实测]` **`city_shape_grids` 的键就是 `(row<<16)|col`**：`1179955 = 0x12_0073` = (18,115)、
   `1245491 = 0x13_0073` = (19,115)（同列相邻行）—— 与 §4.2 道路层的键约定**同源**，
   是对那条客户端键式的独立交叉印证。
   ★ 更强的一条：它的 **2,689 个键与 `city.bytes` 的城格集合精确相等**（交集 2,689、两边各 0 剩余）
   ⇒ 它就是「这一格属于哪座城」的反向索引，值域 1..249、每城独占一个。

   ★ `[实测]` **`even_res_center` 解出来了**（Q2 的目标）：在 `city_shape`，2 元数组，
   与 `odd_res_center` 成对，单位是**格**，含义 = 该形状美术件相对锚点的偏移。
   49 个形状里**只有 8 个非零，且全是渡口 / 码头**（`PIER_1..6`、`WHARF_PORT_X/Z`）：

   ```
   id  allias        shape_box  even_res_center  odd_res_center
   5   PIER_1        [1, 6]     [ 0, -2]         [ 0, -2]
   8   PIER_4        [3, 2]     [-1,  0]         [-1,  1]
   37  WHARF_PORT_X  [8, 3]     [-2,  0]         [-2,  0]
   39  PIER_5        [3, 2]     [ 1, -1]         [ 1,  0]
   ```

   ⚠ **影响面**（2026-09-23 收窄）：249 座城址里**有 12 座是渡口**（`PIER_1/2/4`：孟津、
   风陵渡、蒲坂津、白马、夏口…），正落在这 8 个非零形状里
   ⇒ ⛔ 别再说「渡口本 kit 不渲染」。准确说法是：**本 kit 目前不画城址件**（只用城址做
   资源件抑制），所以**今天**没有影响；**将来画城址件时这 12 座必须套偏移**，其余 237 座为 0。
   ⛔ 山体不在这 8 个形状里，别据此去调山体摆位。

   复现：`tools/maporiginal-assets/ctable_cw.py`（`tables()` / `rows()` / `table()`）。

   ⛔ **仍未解**：`client_res` 行里那几个 tag 4 子表（`ui_offset` / `vector` / `variant_*_list`）
   的**语义**（结构可读，含义未考）；以及 `city` 这张表到底管什么。

2. ~~`road_info.bytes` 是半文本、未解~~ ✅ **已解**（2026-09-23，见 §4.2）：它是**二进制**
   （可打印仅 15.6%），且坐标系由干净集 `road_info.lua` 直给、片由 `type_info` 烘死。
   ⚠ ~~余下 id → 精灵的绑定仍是 `[推断]`~~ ✅ 也已解（`client_res`，见第 1 条与 §4.2）⇒ **本条整条清空**。
3. ~~覆盖格通行性「整片足迹都挡路」是 `[推断]`~~ ✅ **已实证**（2026-09-23）：
   `land` 表 id **1..46 通行 / 47..61 挡路**，⇒ 挡路的是**全部 14 形**（198,085 格）。
   ⚠ 顺带查出本 kit 早先只挡 `{60,61}`（43,533 格）、**少挡了 154,552 格**，已改正。
4. `CAM_SCALE_MAX_FACTOR` 的确切值 —— **已收窄、仍未定死**（2026-09-23）：
   ★ `[disasm]` 1.45 与 1.35 **都是 `script/util/viewport.lua` 的文件作用域局部**，
   且落在**相邻寄存器**（R15 = 1.45、R16 = 1.35，主 chunk 的 LOADK 序）
   ⇒ 这一对就是 `{CAM_SCALE_FACTOR, CAM_SCALE_MAX_FACTOR}`，按声明序绑定。
   ⚠ **哪个是哪个读不出来**：该 Proto 的 disasm 没有 `locvar` 名表。
   同批相邻常量还有 1.7778（= 16/9 横屏比）、0.5625（= 9/16 竖屏比）、0.76，
   对得上 `PORTRAIT/LANDSCAPE_STAND_ASPECT_RADIO` 等同组局部。
   **怎么定死**：拿到该 Proto 的 locvar 名表，或运行时读一次。
5. ~~小地图底图的落位是否数据驱动，未验证~~ ✅ **是数据驱动的**（2026-09-23）：
   ★ `[disasm]` `script/ui/view/map/minimap_main.lua` 走
   `share_res.get_cfg('minimap_plate')` → `pairs` → 按 **`canton_group_id`** 分组插表
   ⇒ 底图是**按大区分块**的一组 plate，⛔ 不是一张静态整图。
   ★ `[干净集]` `minimap_attr.lua:38` 的 **`WORLD_PLATE_ID = 9999`** 是「整幅世界」那块的哨兵 id
   （与逐大区的 plate 并列）；同文件还有 `MAP_MODE = {RHOMBUS = 0, SQUARE = 1}`。
   ⚠ 对本 kit **已无影响**：缩略图现在由地形按 `mapoWorldToMinimap` 的同一套投影自烘
   （见 §10），⛔ 不走 plate 表。
