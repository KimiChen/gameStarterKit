# mapOriginal — 三战**原版**大地图 kit

把《三国志·战略版》2084.1768 的大地图**用它自己的地块数据与美术**在本框架上复刻。
逆向可读源码在仓外 `sourceVersion/sgzz-2084.1768/`，原始素材在 `apkdecode/sgzz-1768.2084/elp-unpacked/`
（**仓外只读**，⛔ 永不入库）。

## 一、身份与边界

- **宿主自有 kit**（`kit.json` 无 `version`）：与 `apps/kits/{slg,sgzzmap}` 同形，只活在主树里，
  不打包、不进锁。⛔ 因此 `plugin -- pack/install/test` 与 `verify:kit-clean-install` 都不适用，
  验收靠 `verify:all`。
- **与 `sgzzmap` 的关系**：机制同源、内容不同。sgzzmap 是「三战**式**」——机制复刻 + AI 概念图派生的
  自造地形；本 kit 是「三战**原版**」——**原版 1500×1500 地块数据 + 原版美术**。
  ⛔ 机检禁 kit 依赖 kit（`docs/KIT.md:162`），所以 `hexmap` 面是**抄改**的一份；
  ⚠ 两边的六邻表 / 环序 / 投影公式 / LOD 滞回必须保持一致，改一边记得同步另一边。

| 维度 | sgzzmap | mapOriginal |
|---|---|---|
| 地形来源 | 10 张 AI 概念图 + seed 程序化 | **原版 `map/s1/cn/res.bytes` 等 23 个数据层** |
| 地形类数 | 9 | **16**（原版 `LAND_TYPE` 语义） |
| 远档底图 | 概念图 warp 进世界空间 | **由地形烘焙**（逐格精确对齐） |
| 河流 | 无（值 47 平涂蓝） | **原版水面多边形**（102 条几何 + 3.1 万片摆放，制图期烘死的选片） |
| 地表底 | 概念图切片 + 美术重绘（逐格菱形地砖） | **一张 `underground1` 整数次 GL_REPEAT 铺满 block**（原版机制，M2-B1） |
| 缩略图 | 贴原版鸟瞰插画（3D 透视渲染） | **由地形按与点选同一套投影烘** —— 它是可点击导航的，图与换算必须同源 |
| 玩法 | 占领 / 行军 / 同盟 / 鸟瞰聚合 | ⛔ v1 无（无 SQL / 无 RPC / 无 worker） |

## 二、v1 范围：只做「看得见的原版地图」

有：原版地形 + 原版美术 + 相机（拖拽/捏合/惯性/钳位）+ 6 档 LOD + 远档底图 + 缩略图 +
点选详情 + **画面设置（现只剩画质一项）**。
⛔ 没有：占领、连地、行军、同盟、鸟瞰聚合、AOI —— 那些要服务端，抄 sgzzmap 的现成面即可，
但 ⛔ 不在 v1 里留半套。

## 三、地形数据：**两层**，这是本 kit 最要紧的一条

| 层 | 值空间 | 落点 | 用途 |
|---|---|---|---|
| **通行层** | 3（0 陆 / 1 河 / 2 山） | `apps/shared/src/kits/mapOriginal/content/terrain.data.ts`（varint-RLE + base64，**157 KB**） | 首帧即可画轮廓；将来服务端通行判定 |
| **显示层** | **原版 res 值 1..61** | `data/maps/s1/terrain.bytes`（2.25 MB）+ Cocos 镜像，客户端 **BufferAsset** 加载 | 近档选地表粗类 + **逐格摆件** + 点选详情 |

★ **显示层存的就是原版的值本身**（⛔ 不再折算成 16 个自造类）。一个字节无损承载原版全部语义，
于是「这一格长什么样」变成**纯查表**：
`MAPO_VALUE_KIND_ID[v]` → 地表图集第几行；`v` 本身 → 摆件图集第几格；`MAPO_VALUE_BY_ID.get(v)` → 中文名/颜色/通行。
⚠ **为什么显示层不进 shared**：它一阶熵 **2.95 bit/格**（zlib 也只到 772 KB），
varint-RLE 反而**胀到 125.6%**（3.9 MB TS）。通行层只有 3 类、游程极长，RLE 后 111 KB —— 只有它能进 shared。
⚠ 显示层没到位时 `mapoValueAt` 按通行类**退回同一值空间**（陆→1 / 河→47 / 山→60），面板标「读取中…」；
⛔ 不拿退回值冒充真相，也 ⛔ 不让首帧空着，更 ⛔ 不让渲染器去分辨「这个数是 3 类还是原版值」。

### 原版字节语义（权威表 `asset/config/S1/cn/res_pro/terrain_attr.lua`）

```
res==1            LAND 平地                                    844,134 格 37.5%
2 <= res <= 41    资源地块：类型 = (res-2)//10、等级 = (res-2)%10+1   42.7%
42 <= res <= 46   金矿 1..5 级                                            0.5%
res==47           RIVER 河流                                             10.5%
res==0 或 >=48    **多格地形本体/锚点**，类型取 res_multi：
                  60/61 平均 26 格、最大 228 ⇒ 山脉（⛔ 不可通行）        1.9%
                  52..55 + 57..59 ⇒ 林丛 6.1%；48..51 单格散落地物 0.8%
```
⚠ **这里更正过一次**：早先把 `(res-2)%10+2` 读成 LAND_TYPE、`(res-2)//10` 读成「4 款变体」，
**是反的**。统计实证：块序号（`//10`）在全图分布均匀、随距中心半径**平坦不变**（1.50 恒定）⇒ 是**资源类型**；
块内序号（`%10`）的均值随半径从 3.26 递减到 1.33 ⇒ 是**地块等级**（越靠边越低级，这正是三战的分布）。
⚠ 类型编号→中文（0木/1铁/2石/3粮）是**假设**：静态数据定不了是否被置换，见 `MAPO_RES_TYPE_CN`。
⚠ 字节值**就是资源 id**：`res_bytes_id_map.lua` 的 id 集合跳过 56，而数据里 56 恰好零命中。

## 四、美术：⛔ 两条否定结论（省得重走）

1. **`.group` 预制体不在包里，但它引用的精灵在**（⚠ 早先这条写反过，已更正）。
   205 条 `scene/ground/**.group` 确实不在 ELP（预制体按需热更），但
   `scene/_output_atlas_scene/atlas_tex/` 下的 62 个图集里有**逐格地皮精灵、小建筑、城、营、道路、
   鸟瞰图标**共 3,510 张。找不到它们的原因是图集页扩展名：XML 的 `imagePath` 写 `.png`、
   包里是构建期转出的 `.ktx`。⇒ **摆件层直接用原版切片**；底下那层菱形由原版 **2D** 地表底纹合成
   （2026-09-22 换源，见本文「★ 地表图集的源已换成原版 **2D 沙盘**侧」一节；
   早先用的是 `scene_3d/**` 的 3D albedo，已随「只用 2D 素材」拍板换掉）。
2. **原版鸟瞰底图不能当远档 plate**。`noexpo_birdview_map_1.ktx`（4096×2048 ETC2）是
   **3D 相机的透视渲染**，与本仓正交等距 ⛔ 不存在可靠 2D 对齐 ——
   实测相似变换 IoU 0.62、河网 NCC 0.30、全仿射拟合退化成竖条纹假峰（NCC 0.51）。
   逐格对齐的层必须自己烘（`bake_content.py`，与 `mapoWorldBounds()` 同式 ⇒ **对齐是构造出来的**）。
   原版那张改作**装饰性缩略图**，落位由客户端现算（`mapoFar.ts` 的 `mapoWorldBounds()` +
   `0.25 + v*0.5`，与 `bake_minimap` 的 resize→paste 构造同式）。
   ⛔ 早先那份 `plate.calib.json` 已删（全仓零消费、生成脚本在 palette schemaVersion 2 后必崩）。

素材授权按九字段登记在 [`art/LICENSES.md`](art/LICENSES.md)（⚠ 法务 load-bearing，⛔ 不得删改）。

## 五、画面设置（只复刻原作「设置 → 画面设置」里**属于 2D 沙盘**的两项）

| 项 | 档位 | 状态 |
|---|---|---|
| 色彩模式 | 标准 / 鲜艳 / 低饱和 | ✅ 在 `mapoPalette` 的顶点色 + tonemapping 预补偿那层做。⚠ 原作选项名是图片按钮、没留字符串，这是**等价实现** |
| 画质 | 流畅 / 普通 / 高清 / 超高 | ✅ 映射到**建不建摆件层**（⚠ M1-B2 起⛔ 不再声称「分帧建格步长」——那个旋钮一个消费方都没有，已删）。⚠ 摆件是**全有或全无**（见下），⛔ 不是密度系数。⚠ 原作 `quality_mgr_2d.lua` 是**空壳**（旋钮全在 `quality_mgr_3d.lua`）⇒ 这是自创的等价实现，⛔ 无原版对照 |

### ⛔ 这里**没有**沙盘模式 / 镜头视角 / 鸟瞰（2026-09-22 拍板）

本 kit 只承载原版 **2D 沙盘**，3D 沙盘另开 kit `mapOriginal3d`。所以：

- **沙盘模式**是跨 kit 的事，⛔ 不该由 2D kit 提供一个永远选不动的 3D 档位当「契约占位」；
- **镜头视角**（fov / angle / distance）只存在于原作 `script/util/viewport_3d_cfg.lua`，
  2D 的 `util/viewport.lua` 只有 `vp_scale_min/max/default`；
- **鸟瞰**的 7 条显示层（`birdview_*`）在 `map_layer_config.lua` 里**全部且仅**落在 `ShowLayers3d`
  （2d 段与 common 段各 0 条）。

⚠ 早先这里写「按原作同因置灰」并引了「2D沙盘不支持鸟瞰视角」「2d不支持调整镜头参数」——
**出处是错的**：那两句只在 GM 调试台（`gm_client_cmd.lua`）的串里，零售面板是把镜头区
**整块隐藏**（`setting_screen_dimension` 的 `show_camera_view(is_select_3d_scene)`），⛔ 不是置灰。
⚠ 真机重放第 10 步现在是**否定判据**：面板里出现「沙盘模式/2D 沙盘/3D 沙盘/镜头视角/鸟瞰/
色彩模式」任一字样即红，同时要求「画质」那一行在。
⚠ 早先这里还写着「要求『色彩模式』『画质』两行都在」—— **已随色彩模式移除而失效**，
与本文 §十 的否定判据自相矛盾，M1 止血时一并改正。

## 六、分层门控

`logic/mapoLayers.ts` 的 `MAPO_LAYERS` 是唯一真源，每层带 `implemented` 与 **`zorder`**。

★ **第 ② 级刻度**（2026-09-23 补）：原版是 `render_layer` + `MAP_ZORDER`（留缝）+ 层内画家序
**三级**，本 kit 早先只有兄弟序 —— 次序取决于**谁先 render**。实测那有真缺陷：
地表底挂在路 / 河 / 山**之后**，把它们全盖住。
现在**每层一个容器节点**、按 `MAPO_LAYER_ORDER` 升序建，次序与调用时机无关：

```
plate 90 < terrain 100 < blocks 110 < region 300 < road 900 < grid 950
      < river 1600 < decor 3400 < city 3900 < banner 3950 < label 4000
```

值尽量照抄原版 `MAP_ZORDER`（`BG 100 / TERRAIN 300 / ROAD 900 / RIVER 1600 / RES 3400 /
BUILD_TOP 3900`）。⛔ **留缝是故意的**，新增层往缝里插；机检要求相邻刻度至少差 10、
且渲染器**必须挂 `this.layer(<层>)`**，⛔ 不许直接挂 `world`。
⚠ **未实现的层 `mapoLayerVisible` 恒回 false** —— ⛔ 不许「门控说该建、渲染器根本没写」的两张皮
（sgzzmap 真机重放为此红过一次）。

| 层 | 档位 | 状态 |
|---|---|---|
| `terrain` 地表底 | L0–L2 | ✅ ★ **一块 10×10 格 + 一张 256² 底纹整数次 GL_REPEAT**（原版做法）。⛔ 早先是「8 粗类 × 4 变体的逐格菱形贴片」——本仓自创，M2-B1 已删 |
| `grid` 网格线 | L0–L1 | ⛔ **未实现**（M1-B1 止血：此前写着 `implemented: true` 而渲染器里一行都没有）。⚠ 原版 2D 的逐格三层是 res / terrain / grid_state，`grid_state` 是 AOI 归属态**叠图**、⛔ 不是线框网格 —— 「原版有没有线框网格」目前无证据，要做先补证据 |
| `tops` 手摆细节 | 随各多边形层 | ✅ ★ `_top_group` 的 1,899 个手摆件（river 597 / desert 481 / snow 821），紧贴在对应多边形层**之上**（原版 `TOP_LAYER_ORDER` = polygon + 1） |
| `blocks` 雪 / 沙漠带 | L0–L2 | ✅ ★ **block 级地貌带，叠在地表底之上**（⛔ 不是替换）：`ground_desert`/`ground_snow` 各 152² **行主序**、字节值即路径表下标（51 / 52 条），片是原版 `polygon_group` 的多边形，铺 `underground3` / `underground2`。desert 4,762 块 / snow 4,186 块 / **489 块两者兼有** |
| `road` 道路 | L0–L2 | ✅ ★ **原版路片**：`road_info.lua` 的 42,018 格，选片制图期烘死（`type_info` 下标 + 水平翻转）。⚠ 路格**自成一套网格**（1125²、半宽 200/半高 100 = 4/3 逻辑格），⛔ 别用逻辑格坐标。⚠ 在地表与河流**之间**（MAP_ZORDER 300 < 900 < 1600） |
| `river` 河流 | L0–L3 | ✅ ★ **原版水面多边形**：`river.bytes`（504² 列主序、一格 = 3×3 逻辑格、起点偏移 −6）的字节值直接是 `river_path.json` 的下标，102 条几何取自原版 `polygon_group` 的 `vertices`/`indices`。⚠ 必须在地表**之上**、山族件**之下**（原版 `MAP_ZORDER`：TERRAIN 300 < RIVER 1600 < RES 3400） |
| `plate` 远档底图 | L3–L5 | ✅ 由地形烘焙 |
| `region` 山族件 | L0–L3 | ✅ ★ **按原版锚点出件**：`res.bytes` 的 55,127 个非零锚点（值 48..61 = `山1..山14`）各一件 + `mountain_patch.bytes` 的 3,942 条补件。件是原版 2D 山体 `m1..m10`，形与贴图由值直接查表。★ **雪带里的锚点换雪山件**（N1）：`mountain_snow` 同形 prefab、transform 逐形重读；**沙带不换**（荒地山 2D 与基础季同件，实测 13/13） |
| `decor` 摆件 | L0–L2 | ✅ ★ **按原游戏参数摆放**：图集**按原版值建格**（格 id = res 值 2..46），客户端拿到格值直接查到图，⛔ 零概率零哈希。★ **季/地貌变体（N1）**：先判带再选件 —— 雪带 `MAPO_DECOR_SNOW_CELLS` / 沙带 `MAPO_DECOR_DESERT_CELLS` / 否则基础季，带归属 = cell 级 `logic_background`（原版 `check_ground_type` 同一条链，⛔ 不看块带）。⚠ 城**不归这层**（见下行）：城占的 2,689 格一律不叠资源件（原版第 4 道门）。⚠ 超出菱形 ⇒ 必须画在地表之上并按**画家序**排 |
| `city` 城址 | L0–L3 | ✅ ★ **原版城址件**（2026-09-23）：`base.cw` 两级配置直给（`city[1].client_res_id` → `city_res.editor_brush_res_path` → prefab），**15 个件覆盖 249 座**（东/南/西/北 × 小城/都城 8 + 关卡 3 + 码头 3 + 洛阳专用 1），1,642 个 sprite、158 张贴图。⚠ 件内按 `low_z` 升序（打包期排好）。⚠ 摆位 row/col **打包期已套** `city_shape` 的 `even/odd_res_center`（12 座渡口非零），⛔ 渲染侧别再套。⛔ 早先由摆件层按「面积前 8 大 + 位置散列」挑 —— 本仓自创，已删 |
| `label` 地名 | L0–L5 | ✅ **原版地名**：9 个大区（西凉/山东/河北/巴蜀/荆楚/江东/司隶/关中/江汉）+ 55 个郡，坐标取原表自带的 `grid`。⚠ 远档只画大区、近档只画郡，⛔ 两档不要一起画 |
| `banner` 目标旗 | — | ⛔ **未实现**（要服务端的归属数据） |

### 多格地形：**锚点 + 覆盖掩码**，一族 14 形（2026-09-22 M0-B1 改）

值 48..61（占全图 2.4% = 55,127 格）**就是锚点**，`res_multi` 只是「这格属于哪个件」的
**覆盖掩码**（142,958 个覆盖格在 `res` 里是 0）。原版这 14 个值是**同一族山体的 14 种足迹**
（`山1..山14`，山9 无 2D prefab、数据里也 0 命中），⛔ 不是「山脉 / 林丛 / 散落」三族 ——
那是本仓早先自创的分类。依据见 [docs/MAPORIGINAL-2D.md](../../../docs/MAPORIGINAL-2D.md) §3。

| 值 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 57 | 58 | 59 | 60 | 61 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| prefab | 1m_01 | 1m_02 | 1m_03 | 1m_04 | 2m_x_01 | 2m_xy_01 | 2m_y_01 | 4m_01 | 7m_01 | 7m_02 | 7m_03 | 19m_01 | 19m_02 |
| 贴图 | m7 | m6 | m6 | m7 | m8 | m3 | m9 | m10 | m1 | m4 | m5 | m2 | m2 |
| scale | 1.166 | 1.227 | 1.179 | 1.238/1.112 | 1.195/1.009 | 1.235 | 1.144 | 1.143 | 1.118 | 1.121 | 1.159 | **2.163** | 2.279/2.083 |
| 世界宽 | 1.09 | 1.17 | 1.13 | 1.16 | 1.68 | 1.25 | 1.95 | 1.97 | 2.44 | 2.45 | 2.69 | **4.06** | 4.28 |
| 足迹 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 4 | 7 | 7 | 7 | 19 | 19 |
| 锚点 | 4570 | 4331 | 4515 | 4316 | 8996 | 4054 | 4913 | 6315 | 3609 | 3546 | 3663 | 1210 | 1089 |

贴图对应是**读 prefab 的字符串池得到的**（`tools/maporiginal-assets/mountain_forms.py`），
⛔ 不是按面积/绿度挑的；13 形只用到 m1..m10 十张图，三对共用、靠 prefab 的 transform 区分。
美术取**基础季** `mountain_new/png/`（⛔ 不是 `grass_fall_new/` 秋季版）；13 张切片的尺寸与
prefab 里 sprite 的 `size` 逐项相等 —— 这同时是「贴图对应没搞错」的交叉校验。
★ **雪带换雪山件**（N1）：`land` 表的 `snow_client_res_id` 指向 `mountain_snow/` 同形 prefab
（贴图 `mountain_snow/png/1..9`，transform 与基础季**不同**、逐形重读 —— 雪山 19m 的 scale
是 2.0，基础季是 2.163）；`desert_client_res_id`（荒地山）的 2D `src_name` 与基础季**逐字相同**
（13/13 实测）⇒ 沙带的山件就是基础季件，⛔ 没有沙件图集格。⛔ `autumn_*` 不接（M0-B3）。

本 kit 用 `regions.bin`（5.9 万条 / 461 KB，Cocos BufferAsset）摆它，两个来源：

| 来源 | 条数 | 依据 |
|---|---:|---|
| ① **`res.bytes` 锚点** | 55,127 | 值 48..61 的非零格，每个锚点一件，形与贴图由值查表 |
| ② **`mountain_patch` 补件** | 3,942 | 原版第二遍补件，落在大山**内部**打散重复感（3,929 落覆盖格、13 落别的件的锚点格） |

⚠ **早先这里是错的**：`build_terrain.py` 第一步 `merged = np.where(res == 0, multi, res)`
把 142,958 个覆盖格**填成了锚点值**、销毁了锚点信息 —— 本 kit 当初不得不发明「八邻连通域 +
每区一件」正是为了补救它。⛔ 别再合并、别再求连通域。
⚠ 足迹表（1/2/4/7/19 的六边形）每次构建都**逐锚点回代校验**：实测 198,086 命中 / 2 不符
（99.999%），命中率低于 99.9% 直接退出构建。
⚠ 表**按 s = row+col 升序落盘 = 画家序**，客户端只做二分 + 矩形裁剪，
⛔ 不要每帧对 5.9 万条排序。二分下界要往下多放 `S_MARGIN` 格，否则「锚点在屏幕下方、
身子探进来」的大山会漏掉。

### 地表底：一整张地毯被菱形裁出来，⛔ 不是每格一块地砖

原版的地表底是 **block 级**的（MAPORIGINAL-2D §1.2/§1.4/§1.5）：

| 事实 | 值 |
|---|---|
| 一块 | **10×10 逻辑格** = 3000×1500 原版 px（`GroundLayerData:get_grid_size()` 覆写成 `TILE_WIDTH*20`） |
| 块网格 | **152×152**（150 块 + 一圈 margin），块 i 覆盖逻辑行 `10·i−10 .. 10·i−1` |
| 底纹 | **全图只有一张** `ground_down/underground1.png`（256² POT、满幅不透明）—— `get_grid_res()` 取定值 `RES_GRASS_1`，常规季无季节覆盖 |
| 铺法 | **整数次 `GL_REPEAT`**：横 **11** 次（2816 texel）、纵 **5** 次（1280），再微量拉伸 **1.065×** / **1.172×** |
| UV | **世界轴对齐**的线性映射（W/N/E/S 四点）⇒ 底纹**不跟着菱形转** |

⇒ 观感是「**一整张连续的大地毯被菱形裁出来**」。取 floor 的意义是让**块边界落在整周期上**，
块与块之间不出现半个花纹的错茬 —— ⛔ 别为了"消除拉伸"改成非整数次。
⇒ **画面上的颜色变化全部来自上层的 res_field 摆件与山体件**，⛔ 不来自地表底。

⚠ 本 kit 早先的「8 粗类 × 4 变体的逐格菱形贴片」与这条**直接矛盾**，M2-B1 已整套删除
（`atlas-lod{0,1,2}` 产物、`MAPO_ATLAS_*`、`mapoAtlasCellId/Uv/TileVariant`、
`buildMapoDiamondMesh`、`bake_content.py` 的 `pack_atlas`/`TEXTURE_OF`）。
⚠ 底纹**必须单独一张贴图**：图集里做不到 `GL_REPEAT`，且 WebGL1 要求 POT。
⚠ 块的可视裁剪是**菱形精确判**（缩放坐标下 `min|u| + min|v| ≤ 1`），
⛔ 不是 AABB —— 块的 AABB 互相重叠，只判 AABB 一个点会命中 5 块。

### 雪 / 沙漠：三层是「叠」不是「替」

原版三个地表数据层是**平级**的（`ground2` / `ground_desert` / `ground_snow`），但 ShowLayers2d 里
**只有一条** `ground` —— desert/snow 没有自己的显示层，被 ground 的 view 一起画，
次序 `POLYGON_LAYER_ORDER = {ground: 100, desert: 200, snow: 300}`（MAPORIGINAL-2D §1.1/§1.3）。

| 事实 | 实测 |
|---|---|
| 网格 | 与地表底**同构**：152² 块、一块 10×10 格、原点偏移 −10 |
| 主序 | ⚠ **行主序** —— ⛔ 与 `river.bytes` 的列主序不同。判据：行主序下 desert 块中心 **88.58%** 落在 `logic_background == 3`，列主序只有 **4.29%**（snow ↔ 2 同理） |
| 下标 | 字节值就是 `ground_<kind>_path.json` 的下标（desert **1..51**、snow **1..52**，与表长 1:1）⇒ 选片同样**制图期烘死** |
| 片 | desert 51 条 / 432 顶点、snow 52 条 / 421 顶点，铺 `underground3` / `underground2`（§1.6 实测 177/177） |
| 叠 | desert 4,762 块、snow 4,186 块、**489 块两者兼有** —— 这就是「叠不是替」的硬证 |

⚠ **UV 规则是有依据的推断**：原版 `polygon_2d` 的 `uvs` 全零 ⇒ 运行时按世界坐标算，
但**真式子在引擎 C++ 侧、不在证据集里**。本仓采用**与地表底完全相同的块级投影**
（同周期、同相位、锚在块中心）—— 只有它能让「块边界落在整周期上」（§1.4 明写的设计意图）
且与底纹对齐。⛔ 别改成按多边形自身包围盒投影：边缘片比整块小，相邻块的花纹相位会跳。
⚠ 每层**各自一个批**：一个材质只能挂一张 `mainTexture`，⛔ 别把两层塞进同一张 mesh。

### 道路：坐标系是干净集直给的，片也是烘死的

| 事实 | 值 |
|---|---|
| 坐标系 | `road_info.lua` 的 `layer_info` = `{width=1125, height=1125, grid_width=200, aridJheighi=100}`。⚠ `aridJheighi` 是 **KS[11] 定点损坏**的 `grid_height`（用 §1.5 那组差量还原，**第五例命中**） |
| 一个路格 | **半宽 200 / 半高 100**（逻辑格是 150/75）= **4/3 个逻辑格**；`1500 × 150/200 = 1125` 自洽 |
| 独立佐证 | 18 张路片**每张都正好 400×200 px** = `grid_width×2 / grid_height×2` —— 半值约定不必只靠算术 |
| 格键 | `(row << 16) | col`（客户端格键）。⚠ `road_info.bytes` 侧是 **(col, row) 转置**，两份数据 **42,018 / 42,018 逐条互证** |
| 选片 | `tiles` 的值就是 `type_info` 下标 ⇒ **制图期烘死**，运行时 ⛔ 零邻接判断（与河同构） |
| 片 | 18 个 `client_res` id（1170..1187）× 水平翻转；三套皮肤 `road / road_ash / road_snow` 结构相同，S1 取 `road` |

★ **id → 精灵的绑定是 `[实测]`**（2026-09-23 解开 `base.cw` 的 `client_res` 表）：
表里 19 条路片本体（id 1170..1188，按 prefab 名字母序，`up_end_2`「路19」占最前的 1170、
S1 不用）。⚠ **`type_info` 的 id 比 `client_res` id 小 1**，+1 后 18 条逐条对上 prefab，
再读 prefab 拿到贴图 —— 全链路都是数据。
⚠ 早先的「邻接度签名 + 字母序」推断 **17/18 命中**，唯一错的正是当时就标为「未定」的
那张（应 `upend/6-1`，推断取了 `6-2`）—— 已改正。邻接度签名**保留为交叉校验**，
`build_roads.py` 每次构建都重算，与 `client_res` 给出的类不符即退出。
⚠ 邻接度 **0 = 孤立的一格路头**（实测 16 例），归入 1；⛔ 别因此放宽纯度阈值。
⚠ 路是**纯表现层**，⛔ 别拿它做通行/行军判定。

### 通行性：挡路集由 `base.cw` 的 `land.is_block` 直给

★ **实测**（2026-09-23 解开 `base.cw` 的 `land` 表）：land id **1..46 全部可通行、
47..61 全部挡路** —— 47 名「河」、48..61 名「山1..山14」。
⇒ 挡路的是**全部 14 个山形**（`res_multi ∈ 挡路集`，**198,085 格**），
⛔ **不只是 19 格的大山**。
⚠ 本 kit 早先硬编码只挡 `multi ∈ {60,61}`（43,533 格），**少挡了 154,552 格**，已改正。
现在挡路集由 `build_terrain.py` 每次构建从 `base.cw` 现读，⛔ 不再硬编码。

### 河流：选片是**制图期烘死的**，运行时零判断

值 47（占全图 10.46%）是河。原版**不做任何邻接判断** —— `river.bytes` 每个河格的字节值
**就是** `river_path.json` 的下标（1..102），选哪一片在制图期就定死了（MAPORIGINAL-2D §4.1）。

| 事实 | 实测 |
|---|---|
| 网格 | **504×504**、**列主序** `byte(c*row + r + 5)`；一个河格 = **3×3 逻辑格** |
| 起点偏移 | **−6**（logic row = 3·i − 6）。命中率随偏移**单峰**，−6 处 0.8638 |
| 对位硬证 | 河格覆盖了 **235,290 / 235,292** 个 `res==47` 格（**100.0%**） |
| 几何 | 102 条，**原版自带三角化**（`polygon_2d.vertices/indices`），4,379 顶点 / 4,170 三角，零失败解析 |
| transform | 102/102 的根节点与多边形节点**全是单位阵** ⇒ 顶点可直接用（已钉成入库断言） |
| 水系 | river 51 / yellowriver 26 / longriver 25 |

⚠ **水面是平色填充**：三张原版填充图都是 **2×2 的单一平色**
（river 78,88,94 / yellowriver 148,154,155 / longriver 99,108,113）⇒ 这一层
⛔ 不需要 `GL_REPEAT`、⛔ 不需要世界投影 UV（那是**地表底**才需要的，见 §1.4 / M2-B1）。
⚠ 原版三条水系的颜色差来自 `river_color_mask.ktx` 的材质蒙版，本仓**不复刻**：
改成「**原版相对明度**（`river-fill.png` 给）× **本仓色相**（`MAPO_RIVER_TINT` 给）」——
两者都有出处，⛔ 不是拍脑袋调色。
★ `_top_group` 的**手摆细节**已做（见下节）。

### 手摆细节 `_top_group`：底是「面」，它是「点」

原版每个 `_polygon_group` 都配一个 `_top_group`，里面是若干个 `sprite_2d`，
各带独立 pos / scale / angle 与互不相同的 `low_z`（MAPORIGINAL-2D §1.6）。

| 族 | 组 | 件 | 贴图 | 图集 |
|---|---:|---:|---:|---|
| river | 102 | **597** | 78 | 2048²（填充 59%） |
| desert | 51 | **481** | 5 | 512² |
| snow | 52 | **821** | 8 | 1024² |

⚠ **贴图路径要先归一化**：34 种写成
`asset/scene/_output_atlas_scene/atlas_mutil_assets/asset/<真路径>@@<材质名>.png` ——
前缀是图集打包器塞的、`@@` 后是**材质名不是文件名**，剥掉两者才查得到。
⚠ 组内次序按 **`low_z` 升序**（同值按子序）：原版靠它定同组内谁压谁，⛔ 别按子节点原序画。
⚠ **每族一张图集**：三族合并放不进 4096²（river 一族贴图总面积就有 1,546 万 px²），
而每族本来各有一个材质。
⚠ 图集按 **0.4× 缩存**，`native` 记**原版像素**（世界尺寸的唯一依据，与山族件同惯例）：
本仓世界尺度 = 32/150 = 0.213 ⇒ 900 px 的件在 LOD0 只占 192 世界像素，存 360 px 仍有
约 1.9× 过采样。⛔ 别按原生像素装，那要 59 MB 显存。
⚠ top 层**复用多边形层本帧已裁剪的结果**（`render()` 返回裁出来的片），⛔ 别让它再裁一遍。

### 件的大小也是原版参数，⛔ 不按格拉伸

原版 2D 一格 **300×150 px**（`config_2d` 的 `TILE_WIDTH/HEIGHT=150/75` 是半值），所以
「一张图多少像素宽」就等于「它在原版里占几格」。本 kit 按同比例还原
（`mapoOriginalPxToWorld` = `px × MAPO_TILE_HALF_W / 150`）：

| 件 | 原图宽 | 占格 |
|---|---:|---|
| 资源 res_field（基础季） | 50–329 px | **0.17–1.10** 格（等级差就在这上面；N1 起取 prefab 主片） |
| 资源 res_field（雪 / 沙套，N1） | 122–312 / 49–319 px | 0.41–1.04 / 0.16–1.06 格 |
| 山族件基础季 `m1..m10` | 281–697 px | 0.94–2.32 格（⛔ 仅 native；**再乘** prefab 的 scale 才是实际大小，见下行） |
| 山族件雪山（N1，`mountain_snow/png/1..9`） | 265–893 px | 0.88–2.98 格（scale 全 1.0；19m 那对靠 2.0 到 4.17 格） |

⚠ 两版都踩过：先按**固定 1.0 格宽**拉资源件（把等级差抹平了），再按**连通区跨度**拉区域件
（真机上是糊成一团的大绿斑）。⛔ 都别改回去；上表只列贴图原始尺寸，显示仍须应用 prefab 参数。
★ **但只用 native 不够**（M0-B2 已补）：件的实际大小 = 原图像素 **× prefab 里的 scale**。
m2 只有 563 px，只用 native 的话 19 格的形会缩成 **1.88 格 —— 比 7 格的形还小**；
补上 2.163 才是 4.06 格。三对共用贴图的形（m7/m6/m2）**全靠 transform 区分**，
只抄像素会把 14 形压成 10 形。位置同理：精灵**中心** = 锚点格位置 + prefab 的 `pos`
（pivot 恒 `[0.5, 0.5]`），渲染按底边中点对齐 ⇒ 再往下 `h/2`。
`angle` 13 形里只有 2 形非零（−1.74° / −0.52°），绕精灵中心转。

资源件同样保留 prefab 的 `size/scale/position/pivot/angle`（2026-09-23 选中错位修复，
[MAPORIGINAL-2D §2.2](../../../docs/MAPORIGINAL-2D.md#22-资源件与选中框共用格心主图按-prefab-的中心锚点和偏移摆放)）。
三套 135 个主片均为中心锚点，其中 4 项 `size` 不等于 `native`，所以资源件显示尺寸用
`transform.size × transform.scale`；中心放在格心加 `transform.offset`，再减半高交给 mesh。
旧版统一把图底放在格心下方 8 世界单位，导致 `(750,749)` 5 级粮田上浮约 30 个原版像素。
选中框继续对准格心，不加补偿偏移；各资源等级与雪/沙变体使用各自的原版参数。

### 城占的格不叠资源件（第 4 道门）

原版 `ViewModelResField:check_validate` 逐格四道门（MAPORIGINAL-2D §2.1），最后一道是
「该格有 build 且 `is_show_res_field()` 为假 ⇒ **不画**」。城占的是 **2,689 格**
（249 座，形态只有 5 种：11 格 ×204、23 格 ×9、7 格 ×24、6 格 ×11、4 格 ×1），
⛔ **不是 249 个中心格**。

⚠ 城**根本不在 `res.bytes` 里**：2,689 个城格 100% 是 `res==1` 平地、`res_multi==0` ——
地块层完全不知道城的存在 ⇒ 抑制**只能靠占格表**（`MAPO_CITY_CELL_KEYS`，来自
`map/s1/cn/city.bytes`），⛔ 没法从地形值推出来。
⚠ 也因此在 s1 这张图上这道门**今天不改变画面**（城格全是平地、本来就没资源件）；
它挡的是「城址件与资源件在同一格叠画」，换图/换季就会撞上。

### 摆件为什么是「全有或全无」

原作近档不是「底图 + 撒一些装饰」，而是**底图 + 逐格一个 `res_field` 单位**，那个单位由该格的
`res` 值（类型 + 等级）唯一决定。所以：

- 摆件图集 `decor-atlas.png` 的**格 id 就是原版值**（2..46 资源与金矿；城址从 `MAPO_DECOR_CITY_BASE = 64` 起）；
- `mapoDecorAt(row, col, value, enabled)` 是**纯查表**，⛔ 没有概率、没有哈希撒件
  （哈希只剩一处：在 8 件城址图里按位置稳定挑一件）；
- ⛔ **别再加「密度系数」**：按密度砍一半会出现「同样的 3 级粮田有的有有的没有」的穿帮。
  要省开销只有整层关掉（流畅档）这一条路 —— 近档一屏本来也只有几十格（一格 300×150 世界像素）。
- ★ **先判带再选件**（N1）：`land` 表每地块类型有 `client_res_id / snow_client_res_id /
  desert_client_res_id` 三套件列（⛔ `autumn_*` 不接），带归属 = **cell 级** `logic_background.bytes`
  （原版 `check_ground_type(row,col)` = `GROUND_TYPE_NAMES[格值] or "ground"`，2=雪 3=沙——
  枚举定义是干净集 `const.lua:252`，层归属是干净集 `map_layer_config.lua` 的 `logic_ground`）。
  ⛔ **别拿雪/沙「块」层当判据**：489 块双挂、粒度 10×10 格，块级会把雪块里 38,066 个草地格
  误换雪件；cell 级在双挂块里逐格各有唯一定论（打包期交叉校验：值2 格 100% ⊆ 雪块、
  值3 格 100% ⊆ 沙块）。选件数据 = `bands.data.ts`（shared，varint-RLE 213 KB）。
- 类型/等级与贴图都**从 `land` 表读出**（套件列 → client_res → prefab 主片），⛔ 不按文件名猜
  —— 早先的 `wood/iron/stone/food` 次序假设被 land 表证伪（真值 **wood/stone/food/iron**），
  旧映射把 12..41 的铁/石/粮**轮转错位**（详情面板的类型名曾同样错），N1 已一并改正。
- 原版个别级的 prefab 缺/无可用 sprite（如基础季铁矿 5/8/9/10 级没进包），用**同套同类最近一级**
  顶上，逐条记在 `decor-atlas.info.json` 的 `substitutions`（按套件分键）；⚠ 这是**存证**不是兜底。

⚠ 相应地，**地表图集改按 8 个粗类建**（plain/resource/gold/river/mountain/grove/scatter/unknown
× 4 变体 = 32 格）：61 个原版值铺不进 8×4 的图集，而值里的「等级」差别本来就该由摆件层体现，
地表那层只需垫底色调。值 → 粗类走 `MAPO_VALUE_KIND_ID`，⛔ 别把原版值直接喂给 `mapoAtlasCellId`。

### 六·六 ★ 地表图集的源已换成原版 **2D 沙盘**侧（2026-09-22）

本 kit 只承载原版 2D 沙盘 ⇒ 八个粗类的底纹全部从 `scene_3d/**` 换成 2D 侧
（机检实体在 `apps/server/test/mapOriginal-content.test.ts`，两条：产物 `source` 白/黑名单、`select.json` 入口）：

| 粗类 | 2D 源 | 依据 |
|---|---|---|
| `plain` 平地 | `ground_down/underground1` | ⚠ **唯一带推断的一条**。2D 归属是实证（赛季配置表登记名「草1」、`all_root_res_list.cw` 常驻根资源、无 scene_3d 对位）；但「被 polygon 平铺成草地底」**没有**直接证据——grass 的四个 `middlelevel_0N_group.prefab` 在手且只引 `a1..a8`。更可能是编辑器的**地表笔刷**（代码直贴） |
| `resource` 资源格 | `scene/ground/caodi_gan/png/tt_02`（干草地） | 低频能量全库最低 ⇒ 铺满 96 万格不露节律 |
| `gold` 金矿 | `scene/ground/huangmo/png/tt_02`（荒漠） | 偏亮细砂 |
| `river` 河流 | `scene/ground/zhaoze/png/tt_02`（沼泽） | 水系里唯一满幅不透明的地表底 |
| `mountain` 山脉 | `scene/ground/caodi_shi/png/tt_02`（石草地） | 暗于平地 |
| `grove` 林丛 | `scene/ground/senlin/png/tt_02`（森林） | 语义对上 `LAND_TYPE.FOREST` |
| `scatter` 散落 | `scene/ground/caodi_huijin/png/tt_02`（草地灰烬） | 对上 `sparse_flammable_layer_logic` 的 10 个 `RES_LAND_GRASS_ASHES_*` |
| `unknown` 兜底 | `scene/ground/dongtu_tuxue/png/tt_02`（冻土） | 纹理最强，兜底哨兵一眼可辨 |

★ 除 `plain` 外七条的**2D 归属**是实证：`scene/ground/<生物群系>/` 各有 **10 个在手的
`*_polygon_mask_group.prefab`**，其中 `polygon_2d` 节点直引本目录的 `tt_02`（各 10 次）。

⚠⚠ **口径修正（M1-B3，MAPORIGINAL-2D §1.7）**：上面这条只证明「这七张是**2D 侧素材**」，
⛔ **不证明「S1 画面上真在用」**。驱动 `_polygon_mask` 那层的四张 `multi_grid_*` 表在 S1
**是空表**（`NEWTABLE` + `RETURN`、nk=0）⇒ 那一层在 S1 **一格都不画**。
⇒ **本 kit 这 8 张粗类底纹是自创的**：原版 2D 的地表底是 block 级（10×10 格）的
「一张 256² 底纹整数次 `GL_REPEAT`」（§1.4），⛔ 不是逐格贴片。对齐它是 **M2-B1**，本单未排期。

### 六·七 顺带修掉的三个烘焙缺陷（换任何源都得先修）

1. **透明区被读成黑**：`bake_content.py` 原来是 `.convert("RGB")`。**换源前**的 3D 源里 6 张带 alpha
   （`albedo_river_v2` 不透明率仅 **0.177**、`xiaobujian_d` 仅 **0.003**）⇒ 透明区 `lum≈0`、被压成
   `0.62×底色` 的暗块。⇒ 改成**合成到中性灰 128** 再转 RGB（`lum=0.5` ⇒ 增益 1.0 = 调色板原色，
   是唯一不改色相的中性值）。
2. **四个变体里有两个是同一张**：旧式 `side = min(w,h)//2**lod` + 角窗，对**正方源在 LOD0 必然退化**
   （`ox=oy=0` ⇒ v0 与 v3 逐像素相同）；实测旧产物 8 类里 **7 类 v0≡v3**。
   ⇒ 改成 **2:1 定形窗 + 四个错开相位**（任意两个既不共行也不共列），并**去掉旋转**
   （旋转会让四片分裂成「横向拖影」与「正常颗粒」两种观感）。512² 源取 240×120 是 1:1 像素、零重采样。
3. **LOD 极性反了**：注释写「远档取更大的纹理块 ⇒ 更平」，代码 `//2**lod` 取的却是**更小**的块，
   实测 lod0→lod2 的 std 是**上升**的。⇒ 改成**先低通再取同一窗**（`GaussianBlur(0.8*2**lod)`）。

⚠ 另外 `bake_content.py` 现在在源没落位时**直接报错**，⛔ 不再静默降级成纯色 —— 旧行为是
`os.path.exists` 落空即 `src=None`，画面变平涂却不报，极难查。

## 七、客户端五条硬规矩（与 sgzzmap 同，⛔ 别再踩）

1. **只有一台正交 UI 相机**：一切经 `UIMeshRenderer` 走 2D UI 管线，深度**只有兄弟序**。
2. ⛔ **不写 `director.getScene().globals`**：只**读**管线档位，由 `mapoCompensate` 预补偿顶点色。
3. **地表必须是合并 mesh**：原作每格一个场景节点（`grid_state_2d_view.lua`），在 Cocos 上会是上万节点。
4. **平移只动父节点 transform**，⛔ 不重建网格。
5. **资源加载失败也 resolve**、路由关掉按代际自收 —— 否则晚到的成功回调会给已 decRef 的资源再 addRef。

## 八、复现

```bash
P=/tmp/maporiginal-venv/bin/python     # python3 -m venv + pip install texture2ddecoder pillow numpy scipy
$P tools/maporiginal-assets/build_name_map.py          # 素材反查（namehash）
$P tools/maporiginal-assets/decode_batch.py            # 选材解码 KTX → PNG + 存证
$P tools/maporiginal-assets/slice_atlas.py --all       # 图集切片
$P tools/maporiginal-assets/build_terrain.py           # 原版层 → terrain.bytes（原版值）+ 通行层 + 调色板
$P tools/maporiginal-assets/bake_content.py            # 远档底图 / 缩略图 / 近档图集（按粗类）
$P tools/maporiginal-assets/pack_decor.py              # ★ 摆件图集：格 id = 原版 res 值
$P tools/maporiginal-assets/build_labels.py && $P tools/maporiginal-assets/emit_labels.py
$P tools/maporiginal-assets/emit_display_palette.py \
     --out apps/shared/src/kits/mapOriginal/content/display.data.ts   # ★ 61 值调色板 + 粗类下标表
$P tools/maporiginal-assets/emit_shared_terrain.py --layer pass \
     --out apps/shared/src/kits/mapOriginal/content/terrain.data.ts
$P tools/maporiginal-assets/install_to_kit.py          # 装 kit + Cocos 镜像 + 铸 .meta
$P tools/maporiginal-assets/emit_ledger.py --out apps/kits/mapOriginal/art/LICENSES.md
npm --workspace @game/server run codegen:plugins && npm run sync:shared
```

⚠ **别在 `/tmp` 下跑脚本**：本机 `/tmp/token.py` 会遮蔽标准库 `token`，numpy 导入即炸。
⚠ **首次用 Creator 打开本仓**：`resources/kits/mapOriginal/**` 的 `.meta` 是脚本确定性铸的、
不是 Creator 导入出来的。Creator 会正式导入并可能改写 uuid —— 把它改完的 `.meta` 一并提交。

## 八·五、真机重放抓出来的两条（2026-09-22）

单测钉的是我当时**写错的那个假设**，所以两条都只有真引擎能发现。

| # | 症状 | 根因 | 封印 |
|---|---|---|---|
| 1 | 地图区**全黑**，只剩选中框 | world 节点 transform 把「相机坐标原点」当节点位置用了 —— 相机坐标原点在地图区**左上**且 y 向下，而根局部原点在屏幕中心、y 向上。整张网格被推到屏幕外 | `refresh()` 里改成 `rootX=(wx−cam.x)·scale`、`rootY=centre+(wy−cam.y)·scale`；选中框与 world **共用同一套换算**，⛔ 不再各写一份 |
| 2 | 详情把「森林」显示成「可走陆地」、近档配色全落回第 0 类 | 拿显示层 id 去查**通行层**的 `MAPO_TERRAIN_PALETTE` | 新增生成物 `content/display.data.ts`；⛔ 两份调色板不许混用 |

### 追加一条：Creator 的「动态加载 URL 相同」warn（2026-09-22，已根治）

症状：`资源 …/decor-atlas.png@b2b1d 与 …/decor-atlas.png@6c48a 的动态加载 URL 相同
(kits/mapOriginal/maps/s1/decor-atlas/texture)`，七张图各一条，反复刷。

根因有**两层**，只修第一层会复发：

| # | 根因 | 修法 |
|---|---|---|
| ① | `install_to_kit.py` **无条件覆写 `.meta`**，把 Creator 导入出来的换成我们铸的 | 改成**只在 `.meta` 不存在时铸**（`--remint` 才覆写）——确定性 uuid 只有第一次落地需要，之后 Creator 是权威 |
| ② | 我们铸的 subMeta id 是 `sha1("mapOriginal::sub::<路径>")`，而 **Creator 3.8 给图片的 texture 子资源用固定 id `6c48a`** ⇒ 首次落地就会造出两套 | 铸的时候**直接用 `6c48a`**，并把 `.meta` 形状逐字对齐 Creator 的导入结果（含 `wrapMode=repeat`、`hasAlpha` 按 PNG 的 IHDR 色彩类型算） |

⚠ 只修 ① 的话，**干净克隆第一次打开仍会复发**（那时没有 `.meta`，走的就是铸的那条路）。
现在九张图「铸出来的 == Creator 导入出来的」逐字节一致，机检钉在
`mapOriginal-content.test.ts`「图片 .meta 只有 Creator 那一个 texture 子资源」。
⚠ 坏 `.meta` 一旦提交过，Creator 的**本地缓存** `apps/Cocos/library/.assets-data.json`
会留下孤儿条目（库里并没有对应文件），即使仓库已自愈也继续刷 warn ——
删掉那条即可（该文件 gitignore、可重建）。

### 追加一条：重放第一次红是**旧 chunk**，不是代码错（2026-09-22）

改完源码直接跑重放，第 9 步「点选一格」超时，可见文本里详情还是旧格式 `(750, 750) 平地`。
根因：**Creator 只在应用被激活时才重编译脚本**（`tools/creator-preview/README.md` 已写），
预览拿的是上一次的 chunk。⇒ 跑重放前先 `osascript -e 'tell application "CocosCreator" to activate'`
并等 `apps/Cocos/temp/programming/packer-driver/targets/preview/chunks` 出现新文件。
⚠ 这不是「重放不稳定」，⛔ 别去加重试 —— 判据是 chunk 的 mtime。

### 追加一条：`res` 字节语义读反了（2026-09-22，非真机、统计自查）

近档接摆件时发现「同一块地里资源等级乱跳」，回头做分布检验才发现把 `(res-2)//10` 当成了变体、
`(res-2)%10+2` 当成了地形类型 —— **正好反了**（更正见 §三）。这一条**单测钉不出来**：
当时的用例钉的就是那个错假设。判据是两条与地理相关的统计量：

| 量 | 若 `//10` 是类型 | 实测 | 结论 |
|---|---|---|---|
| `//10` 随距中心半径的均值 | 平坦（类型与远近无关） | 1.50 → 1.50 恒平 | ✔ 是类型 |
| `%10` 随距中心半径的均值 | 递减（越靠边越低级） | 3.26 → 1.33 | ✔ 是等级 |

⇒ 从此**显示层直接存原版值**，不再折算成自造类；地表按粗类垫底、等级差交给摆件层。

⚠ 还有一条**不是本 kit 的**但会挡住所有重放：登录页 Spine 骨骼版本不匹配
（`GLoader3D.onChangeSpine` → `Cannot read properties of null (reading 'skins')`）会弹出 DOM 浮层
`#error`，它盖在画布之上、吃掉 CDP 的全部点击。已在 `runner.tap()` 里统一关掉并记进
`report.json` 的 `overlayDismissals`。

## 九、进度

- ✅ **P0** namehash 反查（`SipHash-2-4(零 key, 去 asset/ 前缀路径)`），11,489 个文件改回真名。
- ✅ **P1** 素材管线：29 张 KTX 解码 + 805 张图集切片 + 九字段台账。
- ✅ **P2** 内容包：s1 全 23 层定性、**原版值显示层**（61 值）+ 3 类通行层、远档底图/缩略图/三档图集
  （地表按 8 粗类 × 4 变体）、**摆件图集按原版值建格**（45 资源 + 8 城址）、原版地名三级。
- ✅ **P3** kit 骨架 + `hexmap` 面（抄改 700 行）+ shared 内容模块。
- ✅ **P4** 客户端地图页 `mapOriginalWorld`（首屏菜单「原版大地图」）+ 画面设置面板。
- ✅ **P5 真引擎验收**：`node tools/creator-preview/run.mjs mapOriginal --out <dir>` 全绿。
  覆盖：进入 → 近档地表 → 点选（含坐标换算判据）→ **逐格摆件 + 多格地形区域件 + 郡名** →
  **画面设置只剩画质一行（否定判据：出现沙盘模式/镜头视角/鸟瞰/色彩模式任一即红）** →
  拉远换远档底图 → 缩略图跳转 → 推回近档。
  ⚠ **步数按真跑一次的 `report.json` 计**，⛔ 别在文档里写死：`maporiginal.mjs` 自有的
  `runner.step` 数与 `run.mjs` 的前置步（scenarioSettings/scenarioHome）会随 `--reuse` 浮动。
  ⚠ 帧率/draw call 以最近一次证据目录为准，⛔ 别把历次数字并列在文里（曾出现 48/130 与
  50/136 两组互斥的数）。
- ⛔ **3D 沙盘不再是本 kit 的 P6**（2026-09-22 拍板）：原版 3D 沙盘（`asset/scene_3d/**`、
  `config_3d.lua`、`mapview/3d/**`、鸟瞰与镜头视角）整体归新 kit **`mapOriginal3d`**。
  ⚠ 框架 `docs/3d.md` 的 Stage3D（SC0–SC5）仍是它的前置，本 kit ⛔ 不再登记 3D 阶段。
  ⚠ kit 间禁依赖（`docs/KIT.md:162`）⇒ mapOriginal3d 要用 `MAPO_*` 几何/调色板只能**抄改一份**
  （与当初 mapOriginal 抄 sgzzmap 同例），⛔ 不许 import。
- ✅ **多格地形区域件**（2026-09-22）：`regions.bin` 2.78 万条 = 原版 `mountain_patch` 3,942 条锚点
  + 无锚连通区每区一件；件用原版 2D 山体 `m1..m10` / 树簇 / 草丛，尺寸按原图像素还原。
  真机近档实测「山林 41」件、50 FPS / 136 draw call。
- ⚠ 山脉区仍偏空：原版锚点密度就是 **1 件 / 20 格**（3,578 格的大山区才 14 件），
  原作靠 3D 地形起伏撑体量、2D 只补几块山石。要更满只能自己加件 —— ⛔ 那就不是原版参数了。
