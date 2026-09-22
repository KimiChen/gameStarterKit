# tools/maporiginal-assets — 三战原版素材反查与转换管线

把仓外只读的 `apkdecode/sgzz-1768.2084/elp-unpacked/`（365 个 ELP → 126,061 个 **hash 命名**的文件，
6.75 GB）还原成按真实资源路径检索的素材库，再转成 `mapOriginal` kit 能用的 PNG 与内容包。

⚠ `tools/` 不属 kit 所有权（`apps/server/tools/plugin/ownership.ts` 的 `HARD_EXCLUDED_DIRS`），
本管线是**宿主侧**改动，⛔ 不会被打进 kit 包——与 `tools/sgzzmap-maps` ↔ `apps/kits/sgzzmap/data` 同构。

⛔ **原始 ELP / KTX / APK 永远留仓外只读**，⛔ 不拷进仓库、不软链、不进 submodule。
只有过了目检与机检的**派生产物**才入库，并在 `apps/kits/mapOriginal/art/LICENSES.md` 按九字段登记
（口径见 `docs/3D-ASSETS.md` §14 与 `apps/plugins/snake/README.md` §2）。

## 一、namehash（2026-09-22 逆向实测）

```
namehash = SipHash-2-4(key = 16 字节全零, 去掉 "asset/" 前缀的资源路径)
```

- 出处：`libnative-lib.so`(arm64) `0xb0fd18` 按路径查条目 →
  `strlen(path)` → `func_0xb10860(out, path, len, &栈上 16 字节全零 key)` →
  在 `(end-begin)/24` 个 24 字节条目里二分；`0xb10860` 反编译即标准 SipHash-2-4
  （2 轮压缩 / 4 轮收尾、`v2 ^= 0xff`、返回 `v0^v1^v2^v3`）。
- 找法（**别盲扫哈希族**）：先用「等长且差 1 字符」的路径对做差分——算术差与异或差都不恒定，
  一次排除多项式滚动哈希与 CRC 族；再扫 `.text` 的 movz/movk 立即数指纹（1.4 s），
  SipHash 四个初始化常量就落在 ELP 代码块隔壁。

### 四条坑（⛔ 别重蹈）

1. **输入去掉 `asset/` 前缀**。`ltask_env.get_res_path` 运行时补 `asset/`，配置里写的
   `map/s1/cn/res.bytes` 才是哈希输入；带前缀算出来全不中。
2. **VFS 里赛季目录名小写**（`map/s1/...`），`map_path_config.lua` 里写的却是大写 `S1`。
3. **材质/prefab 引用 `.tga`/`.png` 源名，包里是构建期转出的 `.ktx`** ⇒ 反查要换扩展名再试。
   命中的 9,018 张 KTX 绝大多数由此而来。
4. ⛔ **`pathmap_verified.json` 不能当 oracle**：luac 在包内的路径 ≠ 其 chunk source 名，
   16,024 对一条都对不上。正确验证集是图集 XML 路径与 `map/<赛季>/cn/<层>`。

## 二、脚本

| 脚本 | 用途 |
|---|---|
| `namehash.py` | 纯标准库。`namehash(path)` / `namehash_hex(path)`；`--selftest` 跑官方 SipHash 向量 + 3 条真实条目 |
| `build_name_map.py` | 全量反查 → `out/name_map.json`（路径 → hash/容器/下标/扩展名/大小）+ `out/coverage.json` |
| `decode_ktx.py` / `decode_batch.py` | KTX(ETC2/ASTC/R8) → PNG；`--name` 走 name_map 按真名取 |
| `slice_atlas.py` | `<TextureAtlas>` XML 切片（含 `r="y"` 旋转与 `oW/oH/oX/oY` 去裁边还原）→ `out/png/` + `out/sprites.jsonl` |
| `build_terrain.py` | ★ 原版层 → `terrain.bytes`（**直接存原版 res 值**，`res==0` 用 `res_multi` 顶替）+ 3 类通行层 + 61 条调色板 |
| `bake_content.py` | 远档底图 / 缩略图 / 近档地表图集（**按 8 个粗类 × 4 变体**建，⛔ 不按 61 个值建） |
| `pack_decor.py` | ★ 摆件图集：**格 id = 原版 res 值**（2..46）+ 城址件从 64 起；缺级用最近一级顶上并存证 |
| `pack_regions.py` | ★ 多格地形的**区域件**图集（山体 m1..m10 / 树簇 / 草丛，512×320 大格）；树簇用**绿度**剔掉伐木道具 |
| `build_regions.py` | ★ 区域摆件表 `regions.bin`：原版 `mountain_patch` 锚点 + 无锚连通区每区一件，按画家序落盘 |
| `build_labels.py` / `emit_labels.py` | 原版地名（9 大区 / 55 郡 / 249 城址）→ `labels.json` → shared TS |
| `emit_display_palette.py` | ★ 61 值调色板 + `MAPO_VALUE_KIND_ID` 粗类下标表 → shared TS |
| `emit_shared_terrain.py` | 通行层 → shared TS（varint-RLE + base64，111 KB） |
| `install_to_kit.py` | 装 kit 数据目录 + Cocos 运行时镜像 + 确定性铸 `.meta`（uuid = `sha1("mapOriginal::<相对路径>")`） |

```bash
python3 tools/maporiginal-assets/namehash.py --selftest
python3 tools/maporiginal-assets/namehash.py map/s1/cn/res.bytes      # 单条查
python3 tools/maporiginal-assets/build_name_map.py                     # 全量（约 80 s）
```

仓外素材根写在 `assets.config.json`，换机器只改那两行。产物落 `out/`（**已 gitignore**）。

## 三、当前反查结果

**11,489 / 126,047（9.1%）** 得到真名，其中 **KTX 9,018 / 13,471（67%）**。
未命名的大头是 luac（17,091，另有整合版已反编译的 6,620 个 .lua）与无路径引用的 bin/txt 中间产物。

### s1（中原正图）数据层 —— 23 个全部点名

| 文件 | 大小 | 说明 |
|---|---:|---|
| `map/s1/cn/res.bytes` | 2,250,004 | **主地块/资源层**，4B 大端头(row,col) + 行主序 u8；1=LAND、47=RIVER，`等级×10+资源类型` |
| `map/s1/cn/res_multi.bytes` | 2,250,004 | 多格地形（森林/湿地/丘陵簇） |
| `map/s1/cn/logic_background.bytes` | 2,250,004 | 地表底色层 |
| `map/s1/cn/map_region.bytes` | 2,250,974 | 郡/州分区 |
| `map/s1/cn/river.bytes` / `river_area_id` / `waterway` | 各 254,020 | 河道 / 水域 id / 水路 |
| `map/s1/cn/road_info.bytes` | 210,169 | 道路走向（取值 52–61，对应 `road_pivot.lua`） |
| `map/s1/cn/ground2` / `ground_snow` / `ground_desert` | 各 23,108 | block 级地表（152×152） |
| `map/s1/cn/city` / `birth_point` / `piers` / `mountain_patch` | 11,007 / 76,390 / 3,023 / 19,713 | 城 / 出生点 / 渡口 / 山体补丁 |
| `map/s1/cn/river_color_mask.ktx` | 4,194,404 | 河流着色遮罩 |
| `river_path` / `river_area_info` / `mountain_effect` / `ground_*_path` .json | — | 路径与效果元数据 |

另有**各赛季鸟瞰世界底图** `fairy/ui/ui_common_map/map/map_<赛季>/image/noexpo_birdview_map_1.ktx`
（每张 4,194,372 B），可直接作远档 plate 与缩略图的来源。

## 四、原版数据层与素材来源实况（P2 逐层定性，2026-09-22 实测）

### 4.1 s1 层格式（4B 大端头 `(u16 rows, u16 cols)` + 行主序 u8）

**整齐的网格层**（`rows*cols` 与 body 长度严格相等）：

| 层 | 网格 | 取值 | 判定 |
|---|---|---:|---|
| `res.bytes` | **1500×1500** | 61 | 主地块/资源层。1=LAND(844,134)、47=RIVER(235,292)、0=142,958（多格地形锚点）、**2..41 = 资源：类型 `(v-2)//10`、等级 `(v-2)%10+1`**；42..46 金矿 1..5 级 |
| `res_multi.bytes` | **1500×1500** | 14 | 多格地形簇（0 占 91%，55–60 稀疏） |
| `logic_background.bytes` | **1500×1500** | 11 | 地表底色（1/2/3/18/11/13…） |
| `map_region.bytes` | 1500×1500 **+970 B** | 227 | 郡/州分区；255=图外(434,011)。尾部多出的 970 B 是附加表，⚠ 解析时按 `rows*cols` 截断 |
| `ground2.bytes` | **152×152** | 4 | **block 级**地表（1500/`BLOCK_SIZE`=10 → 150，四周各留 1 格 → 152） |
| `ground_snow` / `ground_desert.bytes` | 152×152 | 52 / 53 | 雪/沙 block 层，值是 `*_path.json` 里 group 列表的下标 |
| `river` / `river_area_id` / `waterway.bytes` | **504×504** | 103 / 6 / 1 | 河道在 **1/3 分辨率**网格（1500/3=500，四周各留 2 → 504）。`waterway` 本图全 0 |

**⚠ 不是网格层**（头 4 字节不是尺寸，是记录表，格式另解）：
`birth_point` / `city` / `logic_road` / `mountain_patch` / `piers` / `road_info`（后者内容是半文本）。

配套 JSON：`river_path` / `ground_snow_path` / `ground_desert_path`（**group 资源名表**）、
`river_area_info`、`mountain_effect`（大整数即 `(row<<16)|col` 客户端格键）。

### 4.2 ★ 近档地表的真身 = `*_group.prefab` **根资源**，两版 APK 都没打进包（2026-09-22 定案）

从手机（真机 2066.1489）拉回第二个样本后查清，结论比早先精确得多：

| 事实 | 证据 |
|---|---|
| `*_path.json` 里的 `scene/ground/**/<n>_<m>.group` **不是文件名**，是**组名** | 按 `.group` 及 8 种换扩展名变体在两包里 hash 反查，命中 **0** |
| 真身是 `<名>_polygon_group.prefab` + `<名>_top_group.prefab`（另有 `_polygon_mask_group.prefab`） | `debug_res/ignore_file_cfg.json` 与 `config/res_config/season_all_root_res/all_root_res_list.cw` 里逐条列着；`_polygon_mask` 正好对上 2D 代码 `big_city_house_layer_grid.lua` 的 `res_name .. "_polygon_mask"` |
| 它们是**根资源**，共 1,873 条（`scene/ground/**`，1,872 prefab + 1 png） | `all_root_res_list.cw` 是 NUL 分隔的路径清单，共 79,521 条根资源 |
| **两包都一条不含** | 1,873/1,873 在 2084.1768 与 2066.1489 里按 hash 全未命中 ⇒ 运行时下载 |

完整缺失清单落 `out/missing_ground_roots.json`。按目录：river_longriver 137 / road 136 /
desert 120 / snow 120 / river 114 / river_bohai 81 / river_yellowriver 80 / road_liangdao 74 /
gaodi* 129 / gaodi_shan* 90 / mountain_new 26 / menfacheng* 80 …

（2026-09-22 实测，三星 SM-S9370 / Android 16）：
- 应用外部目录 `/sdcard/Android/data/com.aligames.sgzzlb/files/` **只有 shader 缓存**（11 MB），
  没有任何下载的资源包 ⇒ 下载物落在内部存储；
- 无 root、`su` 不存在、应用 `not debuggable`（`run-as` 拒绝）、`/proc/<pid>/{maps,fd}` 权限拒绝
  ⇒ `/data/data/<pkg>/` 读不到；`adb backup` 在 Android 12+ 已废。
- 顺带拉回的真机包 **2066.1489 比 2084.1768 素材更少**：`scene/ground` 图集精灵 137 < 184，
  连 2D 山体件 `mountain_new/grass_fall_new` 都没有 ⇒ ⛔ 别拿它当更全的样本。

### 4.2·一 ★ 从发行商 CDN 全量取（2026-09-22 打通）

线索链全部来自包内，⛔ 无猜测：

1. `assets/unisdk/ejoy_pack_config.json` → 资源根 `files/data/Library/ejoy_s3`、`storage_type: internal`
   —— 这解释了为什么真机外部目录只有 shader 缓存。
2. **`assets/pkg/version.conf`** → 四组 URL × 四个频道 + `mods/sub_mod` 清单。
   本包 `is_review="true"` ⇒ 频道 **REVIEW_RELEASE**：
   `https://p10445-ob-hotfix-cdn.ejoy.com/S3-CN-OB-Publish/ob_v7_review`
3. 最新清单 `{urls[频道]}/Newest/version_v2.conf`（804 KB）。
   ⚠ 它的 `build_ver=1764`/`script_ver=1887` 与我们这个 APK **完全一致** ——
   同一个构建，APK 只是**带了一部分**：清单 13.05 GB vs 包内 4.57 GB。
4. **单文件 URL（探测实证）**：`{urls[频道]}/Newest/<md5>_<size>.elp`。
   ⚠ `sound/video/asset_raw/asset_extra` 这些 `is_elp:false` 的模块**也用 `.elp` 后缀**
   （sub_mod 里虽有 `base_path`，但 CDN 不按它寻址）——⛔ 按 base_path 拼 URL 是 404。
   ⚠ 文件名自带 md5 与字节数 ⇒ 校验就是比对文件名 + 大小。

| 量 | 数 |
|---|---:|
| 清单总条目 / 大小 | 3,586 条 / 13.05 GB |
| 其中 ELP | 2,178 条 / 10.43 GB |
| APK 内已有 | 872 条 |
| **需从 CDN 取** | **2,712 条 / 9.56 GB** |

脚本 `fetch_cdn_assets.py`（断点续传 + 大小校验 + 并发 6，⚠ 别调高，这是别人的 CDN）：

```bash
python3 tools/maporiginal-assets/fetch_cdn_assets.py --manifest        # 只刷清单看差集
python3 tools/maporiginal-assets/fetch_cdn_assets.py --run             # 全量
python3 tools/maporiginal-assets/fetch_cdn_assets.py --run --module scene_2d_S1   # 只取某模块
# 解包（与 APK 用同一个解包器，只改 PKG/OUT）：
python3 /Volumes/KimData/unlockTheWorld/apkdecode/sgzz-1768.2084/elp_unpack_cdn.py
```

产物落仓外 `apkdecode/sgzz-1768.2084/cdn-pkg/`（原始 elp）与 `cdn-unpacked/`（解包）。
`assets.config.json` 新增 **`elpRootsExtra`**，`decode_ktx.resolve_by_name` 与
`build_name_map.py` 都改成**多根**查找 —— 容器目录名是 `<md5>_<size>`，⛔ 两根之间不会撞车。

⚠ 模块名就是内容分类，按需取即可：2D 档是 `scene_2d_S<赛季>[_tex_mobile|_tex_pc]`、
`scene_common_S<赛季>*`；3D 是 `scene_3d_S<赛季>*`；UI 是 `ui_*`。

### 4.2·二 ⛔ 真机这条路走不通

### 4.2·旧 近档素材：`.group` 预制体不在包里，但**它引用的精灵在**

⚠ **更正（2026-09-22，早先这里写错过）**：`*_path.json` 里那 205 条
`scene/ground/{river,snow,desert}/<n>_<m>.group` 确实一条都不在 ELP 中（**预制体**按需热更），
但它们引用的**精灵本身在包里** —— 就在 `scene/_output_atlas_scene/atlas_tex/` 下的 62 个图集里：

| 图集 | 内容 | 切片数 |
|---|---|---:|
| `ground.xml` | 云、飞鸟、**不规则地表斑块**（沙/草有机色块）—— 原版打散「铺地砖」的手法 | 49 |
| `resource.xml` / `resource_food` / `resource_gold` | **逐格地皮精灵**：草丘/岩山/城楼/营寨，原版靠它们互相叠压出连续地貌 | 612 |
| `small_build*.xml` | 小建筑 | 471 |
| `npc_city` / `player_city*` / `junying` | NPC 城 / 玩家城 / 军营 | 1,001 |
| `road.xml` | 道路片（配 `road_info.bytes` 的 52–61 走向编码） | 58 |
| `map_birdview_icons.xml` | 鸟瞰图标 | 141 |
| `grid.xml` | 格线与状态格 | 97 |

⚠ 找不到它们的原因是**图集页的扩展名**：XML 里的 `imagePath` 写的是 `.png`，包里却是构建期
转出的 `.ktx`（与 §1 坑③同源）。`slice_atlas.py` 现在会按扩展名回退再找一遍。
现已切出 **3,510 张**原版切片。

因此近档贴片的来源改为**原版可平铺的 3D 地表 albedo**（仍是原版像素）：

| 用途 | 素材 | 规格 |
|---|---|---|
| 远档 plate / 缩略图 | `fairy/ui/ui_common_map/map/map_s1/image/noexpo_birdview_map_1.ktx` | **4096×2048 ETC2**，等距菱形陆块 + 州郡线 + 河网 + 云雾。⚠ 带云雾外扩、与数据层不同尺度，落位要标定 |
| 草地 / 雪地 | `scene_3d/ground/gaodi{,_snow}/tex/grass.ktx` | 1024×1024 ETC2 RGBA |
| 山体（草/沙/雪三套 × 4 档） | `scene_3d/ground/mountain_new_lod/{th_shan,sand,snow}/tex/m_*_xl_0*_lod2_{d,n}.ktx` | 1024×1024 ASTC，201 张 |
| 地表花纹贴花 | `scene_3d/ground/dibiaohuawen{,_snow}/tex/xiaobujian_{d,n,ao}.ktx` | 256×256 / 128×128 ASTC |
| 河流 | `scene_3d/ground/terrain/albedo_river_v2.ktx` + `normal_river_v2.ktx` | 512×64 ETC2 RGBA |
| 水面 | `scene_3d/pcg_v5/water/{normal,bank,whitwave,flow_map}.ktx` | 256² / 2048² |
| s1 全局法线 | `scene_3d/pcg_v5/s1/cf_global_normal.ktx` | **4096×4096 ASTC** |
| 行军线 / 旗帜 / 建筑 | `scene/_output_atlas_scene/atlas_tex/{armyline,ext_building_flag,build_attachment,…}-1.ktx` + 同名 `.xml` | 图集，XML 里有逐 sprite 原始路径 |

⛔ 包里**没有**合并好的地表 diffuse/splat 图集（`merge`/`splat`/`diffuse` 关键词 0 命中）——
原版 3D 地表是按 splat 权重实时混合可平铺贴图的，所以近档菱形贴片要由这些可平铺 albedo
**合成**（`pack-atlas.py` 的活），⛔ 不存在「直接拿来就是一张地块图」的素材。

### 4.3 ★ `res` 的「类型 / 等级」读反过一次（2026-09-22 更正）

早先把 `(v-2)%10+2` 当 LAND_TYPE、`(v-2)//10` 当「4 款变体」，**正好反了**。
单测钉不出来（钉的就是那个错假设），判据只能来自**与地理相关的统计量**：

| 量 | 若 `//10` 是类型 | 实测（按距图心半径分箱） | 结论 |
|---|---|---|---|
| `//10` 的均值 | 平坦（类型与远近无关） | 1.50 → 1.50 恒平 | ✔ 是资源类型 |
| `%10` 的均值 | 递减（越靠边越低级） | 3.26 → 1.33 | ✔ 是地块等级 |

⇒ 从此 `terrain.bytes` **直接存原版值**（不再折算成自造类），近档「这一格长什么样」变成纯查表。
⚠ 类型编号→中文（0木/1铁/2石/3粮）仍是**假设**：静态数据定不了是否被置换。

### 4.4 摆件 = 逐格 `res_field`，⛔ 不是撒装饰

原作近档 = 底图 + **逐格一个 `res_field` 单位**，由该格的 `res` 值唯一决定 ⇒
`pack_decor.py` 把图集**按原版值建格**（格 id = 值），客户端零猜测。
素材取 `scene/resource/{wood,iron,stone,food,gold}-new/png/<等级>.png`（45 格）+ 城址 8 件。

⚠ **原版没出全 10 级**：wood 缺 4/6 级、iron/stone 缺 1 级、food 只有 5..10 级 ⇒
8 处用最近一级顶上，逐条记在 `decor-atlas.info.json` 的 `substitutions`。

⛔ **多格地形（值 48..61，占 8.8%）目前没有摆件**：原作是**一个模型跨整片连通区**
（山脉平均 26 格、最大 228），其 `.group` 预制体不在 ELP 里（见 4.2）。
⚠ 要补的话正确做法是**连通域 → 每区一件、锚在区内最低格、按区尺寸缩放**，
⛔ 不是逐格放一棵树 —— 那是我们编的，不是原版参数。

### 4.5 `mountain_patch.bytes` = 原版的**大件摆放表**（2026-09-22 逆出）

```
[u24 BE 条数][条数 × { u16 row, u16 col, u8 件id }]      3 + 5×3942 = 19713 B  逐字节吻合
```
判据：row 全程非降序、row/col 都在 0..1499、**99.67% 的锚点落在 `res==0` 的多格地形锚点格上**。
`件id` ∈ {52,53,55,58,59} 是**原版的美术 id**（⚠ 与 res 值不同空间，`share_res.id2name("res", id)`
才是名字，那张表不在反编译源码里）。

⚠ **它不是「每区一条」**：3,930 条只覆盖 1,689 个连通区，744 个区有多条，4,717 个区一条没有。
实测密度 ≈ **1 件 / 20 格**（3,578 格的大区 14 件；中位 7 格的小区 0 件）。
⇒ 本 kit 的用法：有原版锚点的区**只用原版的**，没有的按连通域每区补一件。

### 4.6 ⚠ `slice_atlas.py` 只切了多页图集的第一页（已修）

`remain_tex.xml` 有 **17 页 1,284 张**，而早先的 `root.find("TextureAtlas")` 只取第一页
⇒ 后 16 页整片丢失。**原版 2D 山体件 `scene/ground/mountain_new/grass_fall_new/png/m1..m10`
就在里面**，于是一度误判「原版 2D 山林素材不在包里」。
修正后切片从 3,510 涨到 **4,881 张**；`select.json` 的 atlas `only` 也补收了 `remain_tex`。
⛔ 别再改回 `find()`。

### 4.7 件的尺寸 = 原图像素 × (本 kit 半格宽 / 150)

原版 2D 一格 300×150 px（`config_2d` 的 TILE_WIDTH/HEIGHT 是半值）⇒
「图多少像素宽」= 「它在原版里占几格」。实测：资源件 0.53–1.10 格、山体 0.94–2.25 格、
树簇 0.12–0.45 格、草丛 0.82–2.03 格。所以图集里逐格记 `native`（原图像素），
客户端按它定世界尺寸。⛔ 别按格宽或连通区跨度拉伸（两版都踩过，见 kit README §六·五）。

## 五、待办

- ~~多格地形的连通域摆件~~ **已完成**（见 4.5）：`build_regions.py` + `pack_regions.py`。
  ⚠ 山脉区仍偏空 —— 原版锚点密度就是 1 件/20 格，不是我们漏了。
- `road_info` / `logic_road` 的记录表格式（半文本，尚未解）⇒ 道路层。
- 长字符串 L≥77 的残字：`terrain_attr.lua` 里仍有 `["CXTE[D_LANY"] = 17` 这类键，
  ⚠ 照抄数值表前**逐条目检**。
- 1620² 的 pk 系赛季图（等 s1 这张跑顺）。
