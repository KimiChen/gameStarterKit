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
| `build_name_map.py` | 全量反查 → `out/name_map.json`（路径 → hash/容器/下标/扩展名/大小）+ `out/coverage.json`。⚠ **多根**（APK + CDN），双根下命名率 37.8%（108,927/287,967） |
| `fetch_cdn_assets.py` | ★ 按发行商清单从 CDN 全量取 APK 没带的那部分（2,712 条 / 9.56 GB，断点续传+大小校验） |
| `verify_root_res.py` | ★ 用根资源清单核对本地到位率（含**追加式 `.bin`** 规则，⛔ 少了它 prefab 全判缺失） |
| `prefab_bin.py` | ★★ ejoy2dx **二进制 prefab 解析器** → JSON（节点树 / 变换 / 贴图 / 多边形顶点索引）；`--scan <前缀>` 批量 |
| `decode_ktx.py` / `decode_batch.py` | KTX(ETC2/ASTC/R8) → PNG；`--name` 走 name_map 按真名取 |
| `slice_atlas.py` | `<TextureAtlas>` XML 切片（含 `r="y"` 旋转与 `oW/oH/oX/oY` 去裁边还原）→ `out/png/` + `out/sprites.jsonl` |
| `build_terrain.py` | ★ 原版层 → `terrain.bytes`（**直接存原版 res 值**，`res==0` 用 `res_multi` 顶替）+ 3 类通行层 + 61 条调色板 |
| `bake_content.py` | 远档底图 / 缩略图 / 近档地表图集（**按 8 个粗类 × 4 变体**建，⛔ 不按 61 个值建） |
| `pack_decor.py` | ★ 摆件图集：**格 id = 原版 res 值**（2..46）+ 城址件从 64 起；缺级用最近一级顶上并存证 |
| `mountain_forms.py` | ★ 「山」族 14 形的**单一真源**：值 ↔ prefab ↔ 贴图 ↔ 足迹；足迹按 odd-row offset 生成并**逐锚点回代校验** |
| `pack_regions.py` | ★ 山族件图集（13 形各一格，**格 id = 原版 res 值**，682×409 大格，**基础季**）；贴图与 `scale`/`pos`/`angle`/`pivot` 全从 prefab 读出，⛔ 不按面积/绿度挑、⛔ 不裁 bbox |
| `build_ground.py` | ★ 地表底：`ground_down/underground1.png` → `ground-base.png`（256² POT）+ 块/REPEAT 常量；校验 POT、满幅不透明、整周期 |
| `build_blocks.py` | ★ snow / desert 块层：`ground_{desert,snow}.bytes`（152² **行主序**）+ 路径表 51/52 条 → 几何库 + 摆放表 + 两张底纹；校 POT / 贴图归属 / 单位阵 transform |
| `build_rivers.py` | ★ 河流几何层：`river.bytes`（504² 列主序 / 3×3 逻辑格 / 偏移 −6）+ `river_path.json` 102 条 → 几何库 `river-geo.bin` + 摆放表 `rivers.bin` + 填充色图 `river-fill.png`；带对位校验（覆盖 100.0% 的 `res==47`） |
| `build_regions.py` | ★ 件摆放表 `regions.bin`：`res.bytes` 的 55,127 个锚点 + `mountain_patch` 的 3,942 条补件，按画家序落盘 |
| `build_labels.py` / `emit_labels.py` | 原版地名（9 大区 / 55 郡 / 249 城址）→ `labels.json` → shared TS |
| `emit_display_palette.py` | ★ 61 值调色板 + `MAPO_VALUE_KIND_ID` 粗类下标表 → shared TS |
| `build_labels.py` / `emit_labels.py` | 地名（9 大区 / 55 郡）+ 城址真坐标 + ★ **城占格表**（`city.bytes` → 249 座 / 2,689 格）→ shared TS |
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
（每张 4,194,372 B），**仅**作装饰性缩略图来源；⛔ **不能**作远档 plate —— 它是 3D 相机的透视渲染，与正交等距不存在可靠 2D 对齐（实测相似变换 IoU 0.62、河网 NCC 0.30），判据见 kit README §四。

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

> ✅ **已从 CDN 取到**（见 4.2·一 / 4.2·一·五）：1,784/1,873 = 95.2%。
> ⚠ 包里的名字是 `<完整路径>.prefab**.bin**`（追加式），⛔ 别按替换扩展名查。

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

### 4.2·一·五 ★★ 编译型资源在包里叫 `<完整路径>.bin`（**追加**，不是替换）

这条让我两次误判「`.group` 预制体两包都没有」。真相：

```
根资源清单里            asset/scene/ground/desert/10_1_polygon_group.prefab
包里的 namehash 用的是   scene/ground/desert/10_1_polygon_group.prefab.bin   ← 追加 .bin
```

⛔ **别按「替换扩展名」去查**（`.prefab` → `.bin`）——那是 0 命中。
`prefab / mesh / material / timeline` 这些编译型资源都走**追加**规则（少数落成 `.txt`/`.json`）。
纠正后：`scene/ground/**` 根资源 **1,784/1,873 = 95.2% 到位**（全部 `+.bin`）；
全量根资源从 22.6% → **65.6%**（52,147/79,521）。
剩下的缺口主要是 `.png` 12,891（本来就被合进图集、⛔ 无独立条目）与 `fairy/ui/**` 的 UI prefab。

单格地表的真身长这样（`10_1_polygon_group.prefab.bin`，637 B）：

```
node_2d "10_1_polygon"
  └ polygon_2d "underground3"   + material + 顶点/UV 浮点数据
                                + 贴图 asset/ground_down/underground3.png
```
即 **多边形网格 + 贴图**，⛔ 不是一张现成的方块图 —— 要还原得解这个二进制 prefab。
配套还有 `<名>_top_group.prefab.bin`（上层）与 `<名>_polygon_mask_group.prefab.bin`（遮罩，
对上 2D 代码 `big_city_house_layer_grid.lua` 的 `res_name .. "_polygon_mask"`）。

`verify_root_res.py` 是这条的机检：

```bash
python3 tools/maporiginal-assets/verify_root_res.py --prefix scene/ground/
python3 tools/maporiginal-assets/verify_root_res.py          # 全量
```

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

⚠ **这一段早先写成「近档贴片用原版可平铺的 3D 地表 albedo」，已作废**（2026-09-22 换源）：
本 kit 只收原版 **2D 沙盘**素材（见 §4.8），近档八个粗类的源全部改成 2D 侧。

| 用途 | 素材 | 规格 |
|---|---|---|
| 远档 plate / 缩略图 | `fairy/ui/ui_common_map/map/map_s1/image/noexpo_birdview_map_1.ktx` | **4096×2048 ETC2**。⚠ 它在**共用 UI 包**树下（`fairy/ui_3d/` 无 `ui_common_map`），但像素是 3D 相机的透视渲染 ⇒ 归属是灰色地带，目前只当装饰性缩略图 |
| 近档地表（八个粗类） | `ground_down/underground1` + `scene/ground/{caodi_gan,huangmo,zhaoze,caodi_shi,senlin,caodi_huijin,dongtu_tuxue}/png/tt_02` | 256² / 512² ETC2；判据见 §4.8、源表见 `bake_content.py` 的 `TEXTURE_OF` |
| 逐格摆件（资源 res_field / 城址） | `scene/resource/{wood,iron,stone,food,gold}-new/png/<级>` + `scene/build{,_snow}/main_city/**` | 见 §4.4 |
| 山族件（13 形） | `scene/ground/mountain_new/png/m1..m10`（**基础季**，由 `scene/_output_atlas_scene/atlas_tex/mountain.xml` 切出） | 见 §4.5 |
| 行军线 / 旗帜 / 建筑 | `scene/_output_atlas_scene/atlas_tex/{armyline,ext_building_flag,build_attachment,…}-1.ktx` + 同名 `.xml` | 图集，XML 里有逐 sprite 原始路径 |

⚠ 原版 2D 地表的真实分层是「`*_polygon_group` 平铺底纹 + `_top_group`/MiddleLevel 散布贴片」，
本 kit 的分工与它一致（底纹 = 地表图集、散布 = 摆件层与区域件层），但**不同构**：
原版底纹是 256px 铺满一整块（`ground_layer_logic.lua:8` 的 `TILE_WIDTH*20` = 10 格一块）、
每格只摊到约 25 texel，我们是**每格一张 240×120 贴片**，格内纹理密度高于原版。
⛔ 不要为了「对齐原版」去取 25×13 的窗口放大 —— 那是不可用的糊。

### 4.2·一·六 ★★★ 二进制 prefab 格式已破（`prefab_bin.py`）

**怎么破的**：包里有 155 个**文本（JSON）形态**的 prefab（`*_easset.prefab`），它们是**同一个
序列化器的文本模式输出** ⇒ 字段顺序逐项照抄，⛔ 不用猜；二进制侧再用同尺寸对照组
（`mountain2m_x_01` vs `_x_02`，502 B 对 502 B）差分定位变量字段。

```
字符串 = [u32 LE 长度][ASCII]            ⚠ 空串就是长度 0，⛔ 无终止符
节点   = [str class][u32 blockSize][类特有前缀][u32 node3dVersion=1][str tag][i16 render_level]
         [str name][u32 components_size][component…]
         [3f position][3f angle][3f scale][4B color][4B add_color]
         [i16 high_z][i16 low_z][u8 faceToCamera][u8 ignoreParentFTC]
         [u8 inheritColor][u8 inheritAlpha][u8 inheritBlend]
         [u32 blendMode][i16 prefab_type][u32 prefab_id]
         [str render_layer][u8 polygonOffset][u32 poly_block_size][u32 children_size][child…]
         可绘制类再接：[u16][2f size][u16][2f pivot][15 B][str "material"][u32 4][u32 0][u16 0]
                       polygon_2d 在此多一段几何：
                         [u32 nv][2f × nv 顶点][u32 ni][u16 × ni 索引]
                         [u32 n2][u16 × n2][u32 nuv][2f × nuv UV][u32 nc][u32 × nc 顶点色]
                         [3 B][2f uvScale][12 B]
                       [str 贴图路径]
组件   = [str class][u32 blockSize][u16 version][…]   ★ 有块长 ⇒ 未知组件整块跳过
```

⚠ 四条坑（⛔ 别重蹈）：
1. **字节紧凑、不按 4 对齐**：`render_level/high_z/low_z/prefab_type` 是 i16、五个继承开关是 u8
   ⇒ f32 常落在非 4 倍偏移。按 4 对齐读会满屏 denormal。
2. **`blockSize` 是重同步的命根**：下一个兄弟就从「块起点 + 块长」开始。局部解析失败时跳到边界
   继续，整棵树不会被带歪。
3. **文件末尾那 ~30 B 是根节点的尾巴、整个文件只有一份** —— 挂到每个可绘制节点上会吃掉
   下一个兄弟的头（实测因此错位 26%）。
4. **个别节点在 `children_size` 与首个子节点之间多 1~3 个字节** ⇒ 读子节点前要对齐探测，
   否则 class 会读成 `"\x00polygon_2d…"`。

**成果**（`scene/ground/**` 1,872 个 prefab 全量）：

| 量 | 数 |
|---|---:|
| 解析成功 / 剩余字节 | **1872 / 1872，0 B** |
| 节点 | 7,385（sprite_2d 4,807 / node_2d 2,038 / polygon_2d 447 / frame_sprite_2d 93） |
| 内部重同步（未完全解出的子块） | 524（7.1%） |
| 多边形 / 顶点 | 447 / 19,637 |
| 引用到的不同贴图 | 415 张 |

一块地表长这样（`10_1_top_group`）：6 个 sprite 各带位置 / 贴图 / 尺寸，
配 `10_1_polygon_group` 的多边形底层（7 顶点 5 三角形 + `ground_down/underground3.png` 平铺）
⇒ **逐块地表可以原样重建**。

```bash
python3 tools/maporiginal-assets/prefab_bin.py scene/ground/desert/10_1_top_group.prefab.bin
# ⚠ 已知缺陷：根节点带 tag + 组件表的 prefab（如 mountain_new/grass_fall_new/ 秋季那批）
#   会被**静默**解成 0 个子节点、却仍报 _bytes_left=0 ⇒ 取 transform 前必须查 children 非空。
#   基础季 mountain_new/ 的 13 个全部零残留可解。
python3 tools/maporiginal-assets/prefab_bin.py --scan scene/ground/      # 批量 + 成功率
```

### 4.2·一·七 ★ 大小写：namehash 有的按原样算、有的按**全小写**算（2026-09-22）

`scene/ground/grass/MiddleLevel_01_group.prefab` 一度被判「不在包里」——实际在，
只是包里的 namehash 用的是**小写**路径 `scene/ground/grass/middlelevel_01_group.prefab.bin`。
⛔ 只试原样会漏；⚠ 同源坑早有记录：赛季目录 VFS 里是小写 `s1`，`map_path_config.lua` 写大写 `S1`。

补上「小写形态」+「追加式 `.bin`」两条规则后：

| 量 | 只按原样 | 补两条规则后 |
|---|---:|---:|
| `build_name_map.py` 命名率 | 37.8%（108,927） | **70.0%（201,443 / 287,967）** |
| `scene/ground/**` 根资源到位 | 1,784 / 1,873 | **1,792 / 1,873（95.7%）** |
| 全量根资源到位 | 65.6% | **69.5%（55,277 / 79,521）** |

剩余 81 条 `scene/ground` 缺口全是季节·特殊图变体：qiuling 20 / zhuandibiao_neicheng_fall 20 /
zhuandibiao_waicheng_fall 20 / ss_chibi_shan 9 / sanxia_shan_fall 6 / zudang_fall 4 /
river_hean 1 / road/mask/lu_mask.png 1。⚠ 与常规季 s1 无关。

### 4.2·一·八·五 ★★★ 实锤：默认地表 pass = `ground_layer_logic` → `RES_GRASS_1` → `underground1.png`

⚠ **不在 native 里**（`libnative-lib.so` 全无 `underground`/`ground2` 字符串），在 Lua 层：

```lua
-- script/logic/mapmodel/layermodel/ground_layer_logic.lua（全文 27 行）
function GroundLayerData:get_grid_size()
  return Config.TILE_WIDTH * 20, Config.TILE_HEIGHT * 20      -- 20×20 格一块
end
function GroundLayerData:get_grid_res()                        -- ⚠ **不带 row/col**
  local res_id = self:get_jijie_grass_res()                    --   ⇒ 全图每块同一个资源
  return { Global.share_res.get_client_res_by_id(res_id).src_name, 1, 1 }
end
function GroundLayerData:get_jijie_grass_res()
  local res_id = IdConsts["TES_RRASS_,"]                       -- ★ 残字 = RES_GRASS_1
  return MapUtil.get_ground_grass_res() or res_id              --   季节覆盖优先
end
```

完整链条（每一环都有实证）：

```
map_layer_config.lua: ground2.bytes → name "ground" → logic_clz "ground_layer_logic"
  → get_jijie_grass_res() → IdConsts.RES_GRASS_1
  → share_res.get_client_res_by_id(...).src_name
  → 配置表里「草1」→ ground_down/underground1.png            ★ 实锤，非推断
  秋季覆盖 → 「秋季草1」→ ground_down/underground1_qiutian.png
```

证据：
- 残字键 `TES_RRASS_,` 与 `RES_GRASS_1` **11 位中 8 位相同**（差位正是长字符串 XOR 残余），
  且 `RES_GRASS_1` 确实存在于 66 MB 配置表的**按字母排序**常量名表里
  （`RES_FALL_PLOT_2` → **`RES_GRASS_1`** → `RES_GRID_SURFACE`）。
- 同一张表里「草1」与 `ground_down/underground1.png` **紧邻成对**，
  紧接着是「地1/3/4」→ `grass/MiddleLevel_01/03/04_group.prefab`。
- 常量名表里另有 **`RES_EARTH_1/2`** —— 「地」= EARTH、「草」= GRASS，两族泾渭分明：
  **`RES_GRASS_1` = 底（一张平铺贴图）**，**`RES_EARTH_1..4` = MiddleLevel 草丛散布层（4 个变体）**。

⇒ 「零消费者」的原因也清楚了：它是**按 share_res 的 id 取的**，⛔ 不是由哪个 prefab 写死路径引用，
所以任何「扫 prefab 里的贴图路径」的做法都永远找不到它。

⚠ 与之对照：`underground2/3.png` **不在**这张配置表里 —— 它们是 snow/desert 的 `polygon_2d`
直接写死路径引用的（各 60 个）。**两套机制，⛔ 别混为一谈**：
常规季草地走 share_res id + 20×20 块整层平铺；沙漠/雪走 `_path.json` 的逐块 group 预制体。

### 4.2·一·八 ★★ 「常规季平地底 = underground1」的证据链（2026-09-22 查证）

先更正一条**我自己的误判**：`grass/MiddleLevel_01..04` 曾被当成「最要紧的缺口」。
拿到并解开后发现——**它们不是平地底**：

```
MiddleLevel_01  node_2d，35 个 sprite_2d，全部引用 grass/png/a1..a8.png
                ⛔ 零 polygon_2d、零 underground* 引用   ⇒ 是**草丛散布层**
```
⇒ 拿到 MiddleLevel **并不能**回答 underground1 的归属；它从来就不是那个缺失的消费者。

`underground1` 仍然**零消费者**，但现在有两条独立证据把推断顶到很高的可信度：

| # | 证据 | 来源 |
|---|---|---|
| ① **排除法** | `underground3` → 沙漠（desert 的 60/60 个 polygon）；`underground2` → 雪（snow 的 60/60）；河流各用 `river*/png/26.png`。盘上 `underground*` 只有 1/2/3 三张，⇒ 剩下的 1 归常规季草地 | `prefab_bin.py` 全量解 1,872 个 ground prefab |
| ② **命名与季节表** | 季节/昼夜换资源表（27 MB 串池 `c1168e183082/107_671fe911405430ee.bin`，字段 `day_night_res_type/res_season/src_name`）里有 **「秋季草1」→ `ground_down/underground1_qiutian.png`**；`_qiutian` 是基础件的秋季变体 ⇒ `underground1` 属「草」族 | 同上串池 |
| ③ **结构** | `grass/` 的根资源只有 8 个 MiddleLevel + 5 个边界云，**没有任何 polygon/底层组**；且 `ground2.bytes`（基础地表块层）**没有配套 `_path.json`**，而 `ground_snow`/`ground_desert` 各有 | 根资源清单 + s1 层清单 |

⇒ 合起来的结论：**常规季草地是「底」，沙漠/雪是盖在它上面的覆盖层**——所以草地根本没有逐块
group 预制体。
✅ **已于同日坐实**，见上一节 4.2·一·八·五（`ground_layer_logic` → `RES_GRASS_1` → 「草1」）。
⚠ 上表第②条当时写「全盘没有 `ground_down/underground1.png`」是**错的**：它在 66 MB 配置表里，
只是我当时只搜了 27 MB 那个串池。⛔ 别只搜一个表就下「不存在」的结论。

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

⛔ ~~**多格地形（值 48..61，占 8.8%）目前没有摆件**~~ **已由 M0-B1 按锚点模型解决**，下文留作沿革：原作是**一个模型跨整片连通区**
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
⇒ ~~本 kit 的用法：有原版锚点的区**只用原版的**，没有的按连通域每区补一件。~~
**2026-09-22 M0-B1 更正**：`mountain_patch` 是**第二遍补件**，⛔ 不是主锚点表。
主锚点表是 `res.bytes` 自己的 55,127 个非零值（48..61），连通域整套已删除。
见 `docs/MAPORIGINAL-2D.md` §3.1/§3.4 与 `mountain_forms.py`。

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
客户端按它定世界尺寸。⛔ 别按格宽或连通区跨度拉伸（两版都踩过，见 `apps/kits/mapOriginal/README.md` 的「件的大小也是原版参数，⛔ 不按格拉伸」一节）。

### 4.8 ★ 本 kit 只收原版 **2D 沙盘**素材（2026-09-22 拍板）

3D 沙盘（`asset/scene_3d/**`、`config_3d.lua`、`mapview/3d/**`）另开 kit `mapOriginal3d`。
`select.json` 里 ⛔ 不许再出现这些前缀，机检在
`apps/server/test/mapOriginal-content.test.ts`（两条：产物 `info.json` 的 `source` 白名单 + 选材表入口）。

| 前缀 | 归属 | 判据 |
|---|---|---|
| `asset/scene/**` | ✅ 2D 沙盘 | `res_load_control/res_2d_atlas.lua`（名字就带 2d）整表是它；基础包里 `scene/**` 下**一个模型件都没有** |
| `asset/ground_down/**` | ✅ 2D 侧地面底 | desert / snow 各 **60 个** `*_polygon_group.prefab` 引用 `underground3` / `underground2` |
| `map/<赛季>/cn/**` | ✅ 两版共用 | `map_layer_config.lua` 的 `DataLayers` 段与 `ShowLayers2d/3d` **平级并列**，条目无维度字段 |
| `asset/scene_3d/**` | ⛔ 3D 沙盘 | 全包 `.prefab`(89)/`.mesh`(17)/`.material`(45)/`.static_scene`(4) 全落在这儿 |
| `fairy/atlas_3d/**`、`fairy/ui_3d/**`、`ui_3d/**` | ⛔ 两个沙盘 kit 都不收 | 它是 **3D UI 皮肤**，与沙盘维度**正交**：`const.lua:651-657` 是 `SCENE_TAG_TYPE` 与 `UI_TAG_TYPE` 两套独立 tag，设置里是四个并列按钮（2D场景/3D场景/2D界面/3D界面）。要地图 UI 用 `fairy/atlas/map_s1`（2D UI）或 `fairy/atlas_common/map_s1`（共用） |
| `scene_3d/pcg_v5/**` | ⛔ 3D | PCG 地形系统贴图；`quality_mgr_3d.lua` 是全仓唯一 require `pcg_terrain_system` 的文件，`quality_mgr_2d.lua` 是只继承 base 的空壳 |

### 4.9 ★ 地表组预制体的贴图引用已全量扫出（1,872/1,872）

CDN 素材落地后，`scene/ground/**.prefab.bin` **1,872 个全部在手**。不必等结构解析器对齐——
prefab 里的资源路径是 **u32 LE 长度 + ASCII**，直接扫长度前缀串就能拿到「每类地表用哪些贴图」：

```python
ln = struct.unpack_from("<I", b, i)[0]            # 4 ≤ ln ≤ 200
if all(32 <= c < 127 for c in b[i+4:i+4+ln]): ...  # 再按 .png/.ktx 结尾筛
```

结果（引用次数 = 该类地表的主片）：

| 地表类 | 主贴图 | 次数 |
|---|---|---:|
| desert | `ground_down/underground3.png`（**底**）+ `scene/ground/desert/png/1..5`（装饰） | 60 / 154+ |
| snow | `ground_down/underground2.png`（**底**）+ `snow/png/{a,b,1,5}` | 60 / 409+ |
| river | `scene/ground/river/png/26.png` | 57 |
| river_longriver（长江） | `river_longriver/png/27.png` | 349 |
| river_yellowriver / river_bohai（黄河/渤海） | `river_yellowriver/png/{g,b,c}` | 125 / 100 / 50 |
| gaodi / gaodi_shan（高地） | 各自 `png/01.png` + `xiepo_*` | 1 / 20 |
| mountain_new | `mountain_new/png/m*.png`（★ 山族件正在用的那批，基础季）；`grass_fall_new/png/m*.png` 是换季版 | 2 |
| road / road_official / ss_road | `xcross/5-1.png`、`downtcross/9-1.png`… | 26 / 12 |

⚠ **常规季平地底仍是推断**：在手的 `grass` 组 prefab **只引用云和阴影**，真正的底在缺失的
`scene/ground/grass/MiddleLevel_01..04_group.prefab` 里（89 条缺项之一）。
`underground1.ktx` 与 `underground2/3` **字节数完全相同**（32836 B）、同族同编号，
而 2=snow、3=desert 已实证 ⇒ 「1 = 常规季」是**强推断**，⛔ 不是实证。拿到那 4 个 prefab 即可定案。

## 五、待办

- ~~多格地形的连通域摆件~~ **已被 M0-B1 取代**：改按 `res.bytes` 的 55,127 个锚点出件
  （`mountain_forms.py` + `build_regions.py` + `pack_regions.py`），连通域整套删除。
  ⚠ 山脉区仍偏空 —— 原版锚点密度就是 1 件/20 格，不是我们漏了。
- `road_info` / `logic_road` 的记录表格式（半文本，尚未解）⇒ 道路层。
- 长字符串 L≥77 的残字：`terrain_attr.lua` 里仍有 `["CXTE[D_LANY"] = 17` 这类键，
  ⚠ 照抄数值表前**逐条目检**。
- 1620² 的 pk 系赛季图（等 s1 这张跑顺）。
