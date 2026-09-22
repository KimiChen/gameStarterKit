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
| 近档贴片 | 概念图切片 + 美术重绘 | **原版 2D 沙盘地表底纹合成**（`tt_02` 族 + `underground1`） |
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
| 画质 | 流畅 / 普通 / 高清 / 超高 | ✅ 映射到分帧建格步长与**建不建摆件层**。⚠ 摆件是**全有或全无**（见下），⛔ 不是密度系数。⚠ 原作 `quality_mgr_2d.lua` 是**空壳**（旋钮全在 `quality_mgr_3d.lua`）⇒ 这是自创的等价实现，⛔ 无原版对照 |

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
⚠ 真机重放第 10 步现在是**否定判据**：面板里出现「沙盘模式/2D 沙盘/3D 沙盘/镜头视角/鸟瞰」
任一字样即红，同时要求「色彩模式」「画质」两行都在。

## 六、分层门控

`logic/mapoLayers.ts` 的 `MAPO_LAYERS` 是唯一真源，每层带 `implemented`。
⚠ **未实现的层 `mapoLayerVisible` 恒回 false** —— ⛔ 不许「门控说该建、渲染器根本没写」的两张皮
（sgzzmap 真机重放为此红过一次）。

| 层 | 档位 | 状态 |
|---|---|---|
| `terrain` 地表菱形 | L0–L2 | ✅ 合并 mesh + 图集贴片 + 逐格 UV 翻转 |
| `grid` 网格线 | L0–L1 | ✅ |
| `plate` 远档底图 | L3–L5 | ✅ 由地形烘焙 |
| `region` 山族件 | L0–L3 | ✅ ★ **按原版锚点出件**：`res.bytes` 的 55,127 个非零锚点（值 48..61 = `山1..山14`）各一件 + `mountain_patch.bytes` 的 3,942 条补件。件是原版 2D 山体 `m1..m10`，形与贴图由值直接查表 |
| `decor` 摆件 | L0–L2 | ✅ ★ **按原游戏参数摆放**：图集**按原版值建格**（格 id = res 值 2..46，45 格资源/金矿 + 8 格城址），客户端拿到格值直接查到图，⛔ 零概率零哈希。249 座城按 `city_center.lua` 的**真坐标**恒放并放大。⚠ 超出菱形 ⇒ 必须画在地表之上并按**画家序**排 |
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
| 足迹 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 4 | 7 | 7 | 7 | 19 | 19 |
| 锚点 | 4570 | 4331 | 4515 | 4316 | 8996 | 4054 | 4913 | 6315 | 3609 | 3546 | 3663 | 1210 | 1089 |

贴图对应是**读 prefab 的字符串池得到的**（`tools/maporiginal-assets/mountain_forms.py`），
⛔ 不是按面积/绿度挑的；13 形只用到 m1..m10 十张图，三对共用、靠 prefab 的 transform 区分。

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

### 件的大小也是原版参数，⛔ 不按格拉伸

原版 2D 一格 **300×150 px**（`config_2d` 的 `TILE_WIDTH/HEIGHT=150/75` 是半值），所以
「一张图多少像素宽」就等于「它在原版里占几格」。本 kit 按同比例还原
（`mapoOriginalPxToWorld` = `px × MAPO_TILE_HALF_W / 150`）：

| 件 | 原图宽 | 占格 |
|---|---:|---|
| 资源 res_field | 159–329 px | **0.53–1.10** 格（等级差就在这上面） |
| 山族件 `m1..m10` | 281–697 px | 0.94–2.32 格 |

⚠ 两版都踩过：先按**固定 1.0 格宽**拉资源件（把等级差抹平了），再按**连通区跨度**拉区域件
（真机上是糊成一团的大绿斑）。⛔ 都别改回去 —— `native`（原图像素）才是尺寸的唯一依据。
⚠ **但只用 native 也还不够**：原版件的实际大小 = 原图像素 **×prefab 里的 scale**
（如 `mountain19m_01` 的 sprite scale 2.163），m2 只有 563 px 却要盖满 19 格的足迹。
这一层是 **M0-B2**，见 [docs/MAPORIGINAL-2D-PLAN.md](../../../docs/MAPORIGINAL-2D-PLAN.md)。

### 摆件为什么是「全有或全无」

原作近档不是「底图 + 撒一些装饰」，而是**底图 + 逐格一个 `res_field` 单位**，那个单位由该格的
`res` 值（类型 + 等级）唯一决定。所以：

- 摆件图集 `decor-atlas.png` 的**格 id 就是原版值**（2..46 资源与金矿；城址从 `MAPO_DECOR_CITY_BASE = 64` 起）；
- `mapoDecorAt(row, col, value, enabled)` 是**纯查表**，⛔ 没有概率、没有哈希撒件
  （哈希只剩一处：在 8 件城址图里按位置稳定挑一件）；
- ⛔ **别再加「密度系数」**：按密度砍一半会出现「同样的 3 级粮田有的有有的没有」的穿帮。
  要省开销只有整层关掉（流畅档）这一条路 —— 近档一屏本来也只有几十格（一格 300×150 世界像素）。
- 原版没单独出图的等级用**最近一级**顶上，逐条记在 `MAPO_DECOR_SUBSTITUTIONS`（当前 8 条，
  如「粮 1..4 级用 5 级图」）；⚠ 这是**存证**不是兜底，将来补图要把它清空。

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

★ 除 `plain` 外**七条都是实证**：`scene/ground/<生物群系>/` 各有 **10 个在手的 `*_polygon_mask_group.prefab`**，
其中 `polygon_2d` 节点直引本目录的 `tt_02`（各 10 次）—— 这就是原版 2D 铺该地貌时真正用的底纹。

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
