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

★ 前缀表示**本轮由维护者本人独立复核过**（不只是调研 agent 报的）。

---

## 1. 地表底：一块 10×10 格、三层叠加的多边形

### 1.1 数据层是三个，显示层只有一个

`[干净集]` `script/config/map_layer_config.lua` 的 DataLayers 里有**三个平级**的地表层：
`ground2.bytes`→`ground_layer_logic`、`ground_desert.bytes` + `ground_desert_path.json`、
`ground_snow.bytes` + `ground_snow_path.json`。
而 ShowLayers2d 里**只有一条** `ground`（`scene_clz = "2d.background.ground_layer_view"`，
`grid_type = LAYER_TYPE.BLOCK`，`level = MAP_ZORDER.BG`）—— desert/snow **没有自己的显示层**，
被 ground 的 view 一起画。

`[干净集]` 三层 bytes 格式相同：`[u16 BE rows][u16 BE cols][行主序 u8]`，取值
`string.byte(gridInfo, col*r + c + 5)`（offset=5）。**整块字符串留在内存不解析。**

### 1.2 「一格」= 一个 10×10 格的 block

`[干净集]` 基类 `get_grid_size()` 返回 `TILE_WIDTH*2, TILE_HEIGHT*2` = **300×150**（一个逻辑格）；
但 `GroundLayerData` / `BaseSurfaceLayerData` **都覆写成** `TILE_WIDTH*20, TILE_HEIGHT*20`
= **3000×1500** ⇒ 这三层的「一格」是一个 **10×10 逻辑格的 block**。S1 是 **152×152 块**
（150 格 + 一圈 margin；`layer_info.lua` 给三层的 `offset` 都是 `{-10,-10}`）。

> ★ `[实测]` **原版一个逻辑格 = 300×150 px**。`config_2d.lua` 的 `TILE_WIDTH=150` / `TILE_HEIGHT=75`
> 是**半宽/半高**。独立佐证：`scene/grid_state/png/*.png` 这些**逐格**状态件画布正好 300×150、
> `scene/grid/png/grid_sel.png` 是 200×100 的 2:1。
> ⚠ 早先有过「一格 150×75」的说法（把 `get_grid_size = TILE_WIDTH*20` 读成 20 格一块），**是错的**：
> `TILE_WIDTH*20 = 半宽 × 2 × BLOCK_SIZE(10)`，自洽于「10 格一块」。

### 1.3 三层是「叠」不是「替」

`[干净集]` `GroundBlockGrid:create_view` 里 `for _, ground_type in ipairs(GROUND_DATA_TYPE)`，
`GROUND_DATA_TYPE = {"ground","desert","snow"}`，每种地貌各建一个 polygon 节点 + 一个 top 节点：

```
POLYGON_LAYER_ORDER = { ground=100, desert=200, snow=300 }
TOP_LAYER_ORDER     = { ground=101, desert=201, snow=301 }
```

`[实测]` S1：ground 层 23,104 块**全非零**；desert 4,762 块（20.6%）、snow 4,186 块（18.1%）、
两者同时有的 489 块。⇒ 同一块可以同时挂草地底 + 沙漠贴片 + 雪贴片。

### 1.4 ★ 铺满一块的办法：整数次 GL_REPEAT + 微量拉伸

这是「原版怎么用一张 256² 的图铺满 3000×1500」的答案。`[disasm]` `ground_layer_view.lua` 的 `_init`：

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
- `[干净集]` 节点摆在块的几何中心：`x, y = grid2pos(r-10, c-10); y -= TILE_HEIGHT * 9.0`
  ⇒ 等价于块中心格 `(r-5.5, c-5.5)` 的坐标。

### 1.5 ★ 平地底全图只有一张图

`[干净集]` `ground_layer_logic:get_grid_res()` = `share_res.get_client_res_by_id(id).src_name`，
id 来自 `IdConsts.RES_GRASS_1`；`[干净集]` `season_func_def.lua:418` 的 `get_ground_grass_res = false`
⇒ **常规季无季节覆盖**。`[disasm]` 2D 视图侧另有一条**独立入口**按名直取：
`ground_layer_view.lua.disasm` 常量池 `['share_res','get_client_res_by_name','草1',…]`。

★ `[实测]` `IdConsts` 的键在包里是乱码 `TES_RRASS_,`，经 **KS[11] 定点修复**还原为 `RES_GRASS_1`：
差位 idx 0/4/10、XOR 差量 `0x06 / 0x15 / 0x1D`。同一组差量对另外三个 11 字符串**四中四**：

```
TES_RRASS_,  → RES_GRASS_1     RILEJHEIGHI → TILE_HEIGHT
QORLQ_WIDTU  → WORLD_WIDTH     JOGIV_FRAMX → LOGIC_FRAME
```

⇒ `[推断→实证]` `草1` / `RES_GRASS_1` 的落点是 **`ground_down/underground1.png`**（256²、ETC2 RGB、
100% 不透明、双向 wrap 缝比 0.90/0.91）。
⚠ 它**在任何 prefab 里都不留路径** —— 按 id/名从 `share_res` 取 ⇒ 扫 prefab 永远扫不到它。
「0 个 prefab 消费者」是**机制使然**，⛔ 不是缺证据。

> ⇒ **整张 S1 的地表底就是一张 `underground1` 铺满**，再叠 snow/desert 的 block 覆盖。
> 画面上的颜色变化**全部来自上层的 res_field 摆件与山体件**，⛔ 不来自地表底。

### 1.6 `_polygon_group` / `_top_group` 永远成对

`[实测]` 三种 prefab 后缀是三套不同的东西，⛔ 别混：

| 后缀 | 结构 | 角色 |
|---|---|---|
| `_group` | 一个 `node_2d` 挂**一个** `sprite_2d` | **立体件本体**（山、树、资源田） |
| `_polygon_group` + `_top_group` | 前者 = `polygon_2d` 铺一张底图；后者 = 6+ 个 `sprite_2d`，各带独立 pos/scale/angle 与逐个递增的 `low_z` | **区域底色多边形 + 手摆细节**。⚠ **只出现在 snow/desert/river 三条 block 级地貌带**（desert 60+60、snow 60+60、river 57+57…） |
| `_polygon_mask_group` | `sprite_2d tt_03` + `comp_mask`(scale 2.42) + `polygon_2d tt_02` | 足迹形多边形用 `tt_02` 填充、`tt_03` 当遮罩做**软边**。挂 `MAP_ZORDER.TERRAIN_MASK` |

`[实测]` desert 的 60 个 `*_polygon_group` 铺 `ground_down/underground3.png`、
snow 的 60 个铺 `underground2.png`、river 的铺 `river/png/26.png`。

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
| `res` | `res.bytes` | `common.res_show.res_logic_view` → `layer_res_field` | `RES` = 133 |
| `terrain` | `res.bytes`（**同一份数据**） | `common.map.terrain_layer_view` → `terrain_layer_grid` | `TERRAIN`=102 / `TERRAIN_MASK`=101 |
| `grid_state` | 走 **AOI**（服务端） | `2d.map.grid_state_2d_view` | `STATE_DEFAULT`=119 / `STATE_TOP`=137 |

`[干净集]` `MAP_ZORDER` 是 base=100 的连号枚举（`const.lua:105`）：

```
BG(100) < TERRAIN_MASK(101) < TERRAIN(102) < ROAD(108) < RIVER(115)
        < STATE_DEFAULT(119) < CREATURE(131) < RES(133) < STATE_TOP(137) < BUILD_TOP(138)
```

⇒ **归属色块默认压在资源摆件之下**，只有「顶层建筑」的格才抬到摆件之上。

### 2.1 `res` 层确实是「逐格一个 res_field 单位」

`[disasm]` `ViewModelResField:check_validate(row,col)` 逐条筛，四道门：

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
`[推断]` 逐值足迹形状：48..51 单格；52 = 中心+西；53 = 中心+东南；54 = 中心+西南；
55 = 中心+W+NW+SW；57/58/59 = 半径 1 的 7 格；60/61 = 半径 2 的 19 格。
回代 55,127 个锚点只有 2 例不吻合（99.996%）。

> ⇒ **美术只按 `res.bytes` 的非零锚点出件；`res_multi` 是「这格属于哪个件」的掩码，⛔ 不参与出图。**
> `[disasm]` `res_multi` 的消费者全是**逻辑**不是渲染：`shape_mgr` 的架桥判定（`.is_block`）、
> 地貌 tips、环境音、`map_mgr`。
> `[推断]` 覆盖格的通行性继承多格 land 行的 `is_block` ⇒ **整片 19 格都挡路**
> （⚠ `land` 表在未解的 `base.cw` 里，这条是推断）。

### 3.2 48..61 是同一族山体的 14 种足迹

`[disasm]` `base.cw` 串池里 `山1..山14` 依次指向
`scene/ground/mountain_new/mountain{1m_01..04, 2m_x_01, 2m_xy_01, 2m_y_01, 4m_01, (空), 7m_01..03, 19m_01, 19m_02}_group.prefab`，
另有平行的 `雪山1..14`(mountain_snow) / `荒地山1..14` / `秋季山N`。
**山9 没有 2D prefab，而数据里字节 56 恰好 0 命中** ⇒ `res 值 v ↔ 山(v−47)`，`RES_LAND_MOUNTAIN_1 = 48`。

`[干净集]` 代码铁证：`res_layer_logic:get_res_multi()` 在 `res_multi.bytes` 缺失时
**直接 `return IdConsts.RES_LAND_MOUNTAIN_1`** ⇒ res_multi 的值空间就是「山」的 land id 空间。

`[disasm]` 选哪一套（草/雪/荒）由 `check_ground_type(row,col)` 在 land 行的
`client_res_id / snow_client_res_id / desert_client_res_id` 三列里挑。

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
`[disasm]` GM 面板把它叫「切换山体拼接」（`enable_mountain_patch`，改了要重启）。

> ⇒ 作用是**在被 19m 大件平铺的大山区里再补中小件**打散重复感。
> ⚠ 本 kit 把它当**主锚点源**用错了位置。

### 3.5 「按连通区一件」的机制存在，但 S1 恒关

`[disasm]` `TerrainLayerView` 的 `get_center_pos` 查 `MultiGridDict[land_type]`（格key→中心key 预计算表），
`make_dict` 用 `shape_mgr:get_land_range(shape,row,col)` 把该件全部格反向登记；
一件只要有 ≥1 格进视口就整件显示。
⇒ 原版**确实同时存在**「按锚点撒件」与「按连通区一件」两套，但 S1 只跑前者（§1.7 四张表全空）。

---

## 4. 河流与道路：选片规则是**制图期烘死的**

### 4.1 河

`[干净集]` `river.bytes` 是「河格 → `river_path.json` 下标」的单字节图，
`[实测]` 头 `01f8 01f8` = **504×504**、body 254,016 B，**列主序** `byte(c*row + r + 5)`。
`[干净集]` `river_layer_logic:_init` 里 `grid_width = TILE_WIDTH*6` ⇒ **一个「河格」= 3×3 逻辑格 = 900×450 px**。

`[实测]` `river_path.json` **102 条**，每条形如
`["scene/ground/river{,_yellowriver,_longriver}/<形状>_1[_x][_y][_xy].group"]`；
`conver_res_config()` 就地改写成 res 名（`scene/ground/river/12_1_x.group` → `ground_river_12_1_x`）。

> ⇒ `_x/_y/_xy` 就是 x/y 镜像变体，形状号 1..21 是「直/弯/汇/岸」的**手工枚举**。
> **运行时不做任何邻接判断** —— 选片在制图期就烘死在 `river.bytes` 的字节值里。

`[disasm]` 三条水系的颜色差来自**一张 2048² 全图蒙版**（`river_color_mask.ktx`），⛔ 不是换贴图。

### 4.2 道

`[实测]` 图集片按 `line / horizonalturn / upverticalturn / downend / uptcross / xcross` 分类
⇒ 明显是按邻接方向选片，机制与河同构（制图期烘死）。三套皮肤：`road` / `road_ash` / `road_snow`
+ `road_official` / `ss_road` / `road_liangdao`。

> ⇒ 本 kit **完全没有道路层**，而数据（`road_info.bytes` 半文本未解 / `logic_road.bytes`）
> 与素材（三套 road 图集）**都在手**。
> ⚠ `[disasm]` `logic_road.bytes` 是 **3D 地形 PCG 的压平遮罩源**，S1 连路径登记都没有、
> 97.7% 落在平地 ⇒ 原版的路是**纯表现层**。⛔ 别拿它做通行/行军判定。

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

★ `[实测]` **城根本不在 `res.bytes` 里**：2,689 个城格 **100% 是 `res==1`（平地）且 `res_multi==0`**
⇒ 地块层完全不知道城的存在，城是**建筑层**画上去的。

`[干净集]` 画它的是 `res` 层下的 `res_show/layer/layer_aoi_build.lua`：
`scene_mgr:sc_create_unit_by_aoi(...)` 按**服务端 AOI** 建单位 ⇒
**城/营/建筑一律是 AOI 驱动的 unit，⛔ 不是地块贴图，也不是逐格摆件。**

★ `[实测]` `birth_point.bytes` = `[u16 点数=19097][19097 × {u16 row,u16 col}]`，76,390 B 精确读完、
零重复 ⇒ 是**出生/迁城候选格的稀疏点阵**，⛔ 与画面无关。

---

## 6. 资源加载：三段表 `share_res`

`[干净集]` `share_res` 的三个索引都是**构建期预生成、随包发货**，⛔ 不是运行时建的：

```lua
share_res.client_res_cfg       = get_cfg("client_res")
share_res.client_res_id_2_name = get_cfg("res:id2name")
share_res.client_res_name_2_id = get_cfg("res:name2id")
```

`[disasm]` 表本体在**一个 ctable 大包**里：`config/<赛季小写>/<语言>/base.cw`（+ `base_patch.cw`），
`ctable.new(read_file_vfs(...))` **整包一次读入、不展开成 Lua 表**；字段**按需从 ctable 读**
（所以 63.7 MB 配置常驻代价 ≈ 文件本身）。

`[disasm]` `client_res` 行里有**十列源路径**：
`src_name` / `_v` / `_3d` / `_3d_v` / `_color` / `_color_3d` / `_common` / `_common_v` /
`_common_7th` / `_common_v_7th` ⇒ **皮肤（2D/3D UI）、竖屏、无障碍色彩增强全靠「同一行里换一列」**。

> ⇒ 原版的寻址是「**逻辑名 → id → 真实路径**」三段表；本 kit 把格 id 直接焊进图集坐标。
> ⚠ 这是**架构差异不是缺陷**：我们的像素在合并图集里，UV 只在那张 PNG 的坐标系里有意义。

### 6.1 `.group` 是组名不是文件名

`[实测]` `*_path.json` 里的 `<n>_<m>.group` **不是文件名**，是**组名**；真身是
`<名>_polygon_group.prefab` + `<名>_top_group.prefab`（另有 `_polygon_mask_group`）。
`[干净集]` `_get_ground_res_id(path, suffix)` 把它拼成 `snow_13_2_polygon` / `snow_13_2_top` 再查表。

`[实测]` `scene/ground/**` 根资源共 **1,873 条，两版 APK 一条不含** ⇒ 运行时下载；
已从发行商 CDN 取回 **1,784/1,873 = 95.2%**。

---

## 7. 分层与 zorder：三级叠加

`[干净集]` 原版任何可见物的绘制次序由**三级**决定，缺一不可：

1. **render_layer（引擎绘制桶）** —— `node:set_render_layer(render.LAYER_*)`。桶之间是硬分离的绘制批次。
2. **层根 zorder（`MAP_ZORDER`，步长 100）** —— 每层 `layer_root:set_zorder(cfg.level)`。
   步长 100 是**留缝**的：配置里大量出现 `RES + 1`、`TERRAIN + 1`、`RES - 2`，用来在两个语义层之间
   插队而不动枚举表。
3. **层内逐节点 zorder = 屏幕 y 画家序** ——
   `grid_node:set_zorder(-pos_y - zorder_base + zorder_offset)` + 层根上
   `sort_child_by_id(true)`。因为 `grid2pos` 给出 `y = -(row+col+c)*75`
   ⇒ **本质就是 (row+col) 升序、同斜线上奇数行压偶数行**。

`[实测]` 四段实测条数：DataLayers **53** / ShowLayersCommon **31** / ShowLayers2d **36** /
ShowLayers3d **42**。2D 实际生效的显示层 = Common 31 + 2d 36 = **67 条**。
⚠ 早先记的「ShowLayers2d 27 条」**是错的**。

> ⇒ 本 kit 只有 6 层、深度**只有兄弟序**，缺的是第 ② 级那把「可插队的刻度」。

### 7.1 ⚠ 一条被用反的论据

`[干净集]` 原版 2D 对**平铺层**（ground 细节 / road / grid_state）**本身也在合批**；
逐节点的是**立件层** + `sort_child_by_id`。

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

`[disasm]` 拉到头触发 `vp_scale_max_limit → on_vp_change_to_scale_max` →
`close_main_and_open_minimap` ⇒ **关掉主界面、打开另一套 UI（小地图面板）**，
面板底图是**美术手绘的位图**、⛔ 不是数据烘出来的。

> ⇒ 所谓「远」在原版是**换视图 + 换手绘素材**，⛔ 不是同一个相机继续缩小。
> 本 kit 的 6 档 LOD + 自烘远档底图 + 常显缩略图整套是**自创**——见 §10 的定性。

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
| 地表底 | 一块 10×10 格一个 polygon，**一张 256² 底纹**整数次 REPEAT 铺满；snow/desert 叠 block 补丁 | 逐格 240×120 菱形贴片，**8 自造粗类 × 4 变体** | ★ 架构不同构；且 7/8 源出自 S1 不跑的层（§1.7） |
| 多格地形 | `res.bytes` 非零值 = **锚点**，一族 14 形足迹，件 = 图 × prefab scale | `merged = where(res==0, multi, res)` **销毁锚点** ⇒ 只能连通域自算 | ★ **核心假设错误** |
| 山体拼接 | `mountain_patch` 是大山内部的**第二遍补件** | 当**主锚点源** | 用错位置 |
| 逐格资源件 | 每资源格一个 res_field，**四道筛选门** | 每资源格一件，无筛选门 | 缺第 4 门（城格应抑制） |
| 河流 | 独立几何层，河格 = 3×3 逻辑格，102 条手工形状、制图期烘死 | 地表粗类的**一种颜色** | 整层缺失 |
| 道路 | 按邻接方向选片，三套皮肤，制图期烘死 | **完全没有** | 整层缺失（数据素材都在手） |
| 建筑城营 | **AOI 驱动的 unit**，两级配置表选件 | 城址件按「面积前 8 大」**启发式**挑 | 机制不同（AOI 需服务端） |
| 归属状态 | `grid_state` 层，两个 z 档（119 / 137） | 无 | 需服务端 |
| 分层深度 | render_layer + `MAP_ZORDER`（留缝） + 层内画家序**三级** | 只有兄弟序 | 缺第 ② 级刻度 |
| 看全局 | 拉到头**换视图**（小地图面板，手绘底图） | 同相机 6 档 LOD + 自烘远档底图 | 自创（见 §10） |
| 资源寻址 | 逻辑名 → id → 路径**三段表**，十列源路径换皮 | 格 id 焊进图集坐标 | 架构差异，非缺陷 |

---

## 10. 本 kit 自创的东西及定性

| 自创项 | 定性 | 理由 |
|---|---|---|
| 合并 mesh + 单台正交 UI 相机 + 兄弟序 | **必要补充** | Cocos 下上万节点不可行。⚠ 代价见 §7.1 |
| `mapoPainterCompare` 把画家序做进索引顺序 | **必要补充** | 与原版 `-pos_y ∝ (row+col)` 同序；⚠ 只在同一张 mesh 内有效 |
| 6 档 LOD + 40× 缩放行程（0.05–2.0） | **必要补充** | 我们把「沙盘 + 小地图面板」压成一条连续缩放，行程必须比原版沙盘的 1.4× 大得多。⚠ 但门控表是**纯性能手段**，⛔ 不可拿它反推原版行为 |
| 8 自造粗类 × 4 变体 + 逐格 UV 翻转 | **过渡补丁（应退役）** | 整套在绕开「图集里不能 GL_REPEAT」这个自我限制 |
| 顶点色调色板 + ACES 预补偿 | **必要补充** | 原版靠美术贴图给色，我们只取灰度 ⇒ 必须有一层上色。⚠ 与原版「色彩模式/色+」毫无关系 |
| `regions.bin` 连通域 + 无锚区补件 | **替代品（应被 res 锚点取代）** | 它存在的原因是我们自己销毁了锚点信息 |
| `plate-lod4/5` 由 terrain 自烘 | **必要补充** | 原版远档是手绘、我们没有画师 |
| 缩略图贴原版鸟瞰插画 | **应换** | 它是 3D 透视渲染，与正交等距无可靠对齐 |
| 画质档 → 分帧建格步长 | **半个空头** | `mapoCreateStepFor` / `createStep` **无任何消费方** |
| `grid` 层 `implemented: true` 但无渲染器 | **必须止血** | 违反该文件自己抬头的铁律，且会向状态行与真机重放**谎报** |

---

## 11. 仍不清楚的

1. ★ **`config/s1/cn/base.cw`（63.7 MB ctable）没解开** —— 本轮最大缺口。里面是
   `client_res` 三段表、`land` / `land_shape`（含 **`even_res_center` = 件的美术锚点偏移**，
   直接影响摆位精度）、`city_info` / `city_res`（249 城各用哪个方位×规模件）、`minimap_plate`。
   ⇒ 现在 `land` 表的语义是由命名 + 足迹计数**反推**的。
   **怎么查清**：文件头是 `fc 49 ee 02 | f4 e0 0a 00 | <u32 偏移表…>`（首项 0x5458），
   尾部约 49 MB 起是明文串池；需要啃 `ejoy2dx.ctable` 的行结构。
2. `road_info.bytes` 是半文本、未解 ⇒ 道路层的方向编码规则还没拿到。
3. 覆盖格通行性「整片足迹都挡路」是 `[推断]`（依赖 `land` 行的 `is_block`，在 base.cw 里）。
4. `CAM_SCALE_MAX_FACTOR` 的确切值（1.45 / 1.35 两个候选）。
5. 小地图底图的落位是否数据驱动（线索：`grid2point_pid` / `WORLD_PLATE_ID`），未验证。
