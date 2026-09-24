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
| `bake_content.py` | 由 terrain 烘远档 plate；逐格地表图集已经删除，近档由 build_ground.py 生成块底纹 |
| `pack_decor.py` | land → client_res → 135 个完整 prefab；659 节点/320 纹理，递归引用、父子变换、时间线、帧动画；缺件报错，替代项为 0 |
| `land_variants.py` | `base.cw.land` 四套资源列与 client_res 寻址；已删除最大主片选择器和邻级替换 |
| `build_bands.py` | ★ cell 级地貌带（N1 选件判据）：`logic_background.bytes` → `bands.bytes`（原样留档）+ shared TS（完整文件 235,797 B / 230.3 KiB）；语义 = 原版 `check_ground_type`（2=雪 3=沙 其余回基础季）；交叉校验复用 `build_blocks.py` 的块→格映射（值2 ⊆ 雪块 / 值3 ⊆ 沙块，100%） |
| `mountain_forms.py` | ★ 「山」族 14 形的**单一真源**：值 ↔ prefab ↔ 贴图 ↔ 足迹；足迹按 odd-row offset 生成并**逐锚点回代校验** |
| `pack_regions.py` | ★ 山族件图集（13 形各一格 ×**基础季+雪山两套**（N1），格 id = 原版 res 值，682×409 大格）；贴图与 `scale`/`pos`/`angle`/`pivot` 全从**该套件** prefab 读出（雪山的 transform 与基础季不同，⛔ 不抄），⛔ 不按面积/绿度挑、⛔ 不裁 bbox；沙漠山 2D 与基础季同件（实测 13/13）⇒ ⛔ 无沙件格 |
| `build_ground.py` | ★ 地表底：`ground_down/underground1.png` → `ground-base.png`（256² POT）+ 块/REPEAT 常量；校验 POT、满幅不透明、整周期 |
| `ctable_cw.py` | ★ `base.cw`（66.8 MB ctable）**通用解码器**，格式逆自 `libnative-lib.so`（值解码 `0xb3fdb0` / 子项寻址 `0xb3f930` / 表布局 `0xb3fb50`）。`tables()` 读表目录（= 根的第 0 个子项，2,397 张）、`table(idx)` 解 `(array, hash)`、`rows(idx)` 按「含 `id` 键」向下展平多级分桶出行。⚠ **每行本身就是一个表对象**（长度天然可变）⇒ ⛔ 别再假设定长行；⚠ 根子项里也有**非表**的裸值对象，`table()` 对它们回 `None`（⛔ 别让它抛异常打断遍历）
| `build_roads.py` | 42,018 路片摆放 + 18 基础/18 雪地皮肤；运行时按路片中心的 logic_background 选皮 |
| `recon_road.py` | ⏸ 道路层数据链勘察（**只勘察不出产物**）：坐标系由干净集 `road_info.lua` 直给（1125²、半宽 200/半高 100 = 4/3 逻辑格）、lua 与 bytes **42,018/42,018 逐条互证**（⚠ bytes 是 (col,row) 转置）、`type_info` 烘死片、id→精灵靠邻接度签名绑定 |
| `build_tops.py` | 三族 1,899 静态记录/92 纹理；完整视觉字段 60 B；含引用/动画的组另导出 top-scenes.data.ts |
| `asset_source.py` | 只读原包寻址与切片查询，处理大小写 / @@ 别名 / hash fallback |
| `prefab_scene.py` / `timeline_bin.py` / `scene_export.py` | 展开 prefab 引用与覆盖、时间线和事件子件；遇到未支持的视觉语义拒绝导出 |
| `prefab_visual.py` | 城池/手摆静态精灵共用的 56 B 参数记录 |
| `build_choose.py` | city_shape.GRID.click_res=2080；普通点选 8 片 UI XML、Scale/Color 轨道、24 fps 缺省值 |
| `build_surface.py` / `shaders/` | 原格线、颜色蒙版、法线；移植 normal_river 无结冰分支与节点乘色/加色 |
| `verify_fidelity.py` | 对照原包复核 381 个入口及引用、635 切片的全部 RGBA；只读校验，不重写产物 |
| `audit_assets.py` / `atlas_layout.py` | O0 仓内只读统计、逐片哈希、完整动画引用/全图可达性、每侧 2 px 外间隔的确定性矩形试排；不修改素材 |
| `compare_images.py` / `test_asset_audit.py` | 同后端 PNG 与局部 ROI 对照；空纹理、共享矩形、透明 RGB 和 packer 回归 |
| `texture-policy.json` / `texture_policy.py` | 地图逐图压缩分类与质量限值；颜色图使用地图专用 ASTC 4×4 + 原 PNG，水色/法线/细线保持 PNG；安装器统一设置并拒绝未分类的新图 |
| `measure_compression.py` / `capture_water.mjs` | Creator astcenc 4×4 / 5×5 试验；可见像素、黑/灰/白合成、alpha 边缘、64 px 局部误差；原河流 shader 固定位置/时间重放，直接上传含透明 RGB 的原始字节 |
| `audit_compression_quality.py` / `test_texture_compression.py` | 冻结压缩限值、固定几何/时间对照与分离水色/法线试验；不得用压缩限值放宽 O2 无损检查 |
| `audit_bundle_build.py` | 实际发布包的 ASTC 头/尺寸/单级载荷、ImageAsset 格式登记、试验字节绑定、PNG 逐字节回退与分包体积检查 |
| `test_prefab_bin.py` | 无原包也可运行的严格边界/中文节点/未知组件回归 |
| `build_blocks.py` | ★ snow / desert 块层：`ground_{desert,snow}.bytes`（152² **行主序**）+ 路径表 51/52 条 → 几何库 + 摆放表 + 两张底纹；校 POT / 贴图归属 / 单位阵 transform |
| `build_rivers.py` | ★ 河流几何层：`river.bytes`（504² 列主序 / 3×3 逻辑格 / 偏移 −6）+ `river_path.json` 102 条 → 几何库 `river-geo.bin` + 摆放表 `rivers.bin` + 填充色图 `river-fill.png`；带对位校验（覆盖 100.0% 的 `res==47`） |
| `build_regions.py` | ★ 件摆放表 `regions.bin`：`res.bytes` 的 55,127 个锚点 + `mountain_patch` 的 3,942 条补件，按画家序落盘 |
| `build_labels.py` / `emit_labels.py` | 原版地名（9 大区 / 55 郡 / 249 城址）→ `labels.json` → shared TS |
| `emit_display_palette.py` | ★ 61 值调色板 + `MAPO_VALUE_KIND_ID` 粗类下标表 → shared TS |
| `build_labels.py` / `emit_labels.py` | 地名（9 大区 / 55 郡）+ 城址真坐标 + ★ **城占格表**（`city.bytes` → 249 座 / 2,689 格）→ shared TS |
| `emit_shared_terrain.py` | 通行层 → shared TS（varint-RLE + base64，完整文件 374,652 B / 365.9 KiB） |
| `install_to_kit.py` | 装 kit 数据目录 + 独立 2D Bundle、生成 manifest/编译期版本绑定 + 确定性铸 `.meta`（uuid = `sha1("mapOriginal::<相对路径>")`） |

```bash
python3 tools/maporiginal-assets/namehash.py --selftest
python3 tools/maporiginal-assets/namehash.py map/s1/cn/res.bytes      # 单条查
python3 tools/maporiginal-assets/build_name_map.py                     # 全量（约 80 s）
```

仓外素材根写在 `assets.config.json`，换机器只改那两行。产物落 `out/`（**已 gitignore**）。

地图压缩试验只写 `.cache`；源 PNG 仍由现有导出器维护。`install_to_kit.py` 保留现有 UUID 和
无关导入选项，但会按 `texture-policy.json` 统一压缩预设、`mipfilter:none` 与透明 RGB 保留。
手动改某张 `.meta` 不是持久配置；新增/调整地图图片时先修改策略，再安装和运行 `--check`。
`builder.json` 的 `maporiginal-color` 预设必须与策略相符，PNG quality=100；3D 预设与全局 mip 开关独立。
压缩候选不能仅凭整图误差转正；现行限值与发布验证记录见优化文档 §9。

```bash
python3 tools/maporiginal-assets/measure_compression.py --encoder /path/to/Creator/tools/astc-encoder/astcenc --out .cache/mapo-compression/trials
node --import tsx tools/maporiginal-assets/capture_layout.ts --seconds 0.37 --gallery --opaque-gallery --out .cache/mapo-compression/layout/png
node --import tsx tools/maporiginal-assets/capture_layout.ts --seconds 0.37 --gallery --opaque-gallery --out .cache/mapo-compression/layout/4x4 --textures .cache/mapo-compression/trials/4x4
node tools/maporiginal-assets/capture_water.mjs --textures apps/kits/mapOriginal/data/maps/s1 --out .cache/mapo-compression/water-raw/png
# 4x4 / 5x5 及 mask-4x4 / normal-4x4 分别重放；后两种目录只有一张使用候选，另一张用源 PNG。
# capture_water.mjs 用 MAPO_PYTHON 指定有 Pillow 的 Python；缺省 python3。
python3 tools/maporiginal-assets/audit_compression_quality.py --evidence .cache/mapo-compression
python3 tools/maporiginal-assets/audit_bundle_build.py --build-dir /path/to/web-mobile --quality-report .cache/mapo-compression/trials/report.json --out .cache/mapo-compression/build-audit.json
node tools/creator-preview/probe-maporiginal-compression.mjs http://127.0.0.1:7469/ .cache/mapo-compression/build-audit.json .cache/mapo-compression/release
# 同一发布包另跑 --webgl1 / --landscape；仅创建和关闭自己的标签页。
```

发布探针要求已有 Chrome 9222 与本机静态发布服务器，不使用编辑器 7456 预览。
每次打开都走 `AppRuntime.launch → PluginHost.install → NavigationService.open`，确保地图 ticker
和卸载流程真实接线；不能只用 `ViewMgr.open` 代替入口安装。它记录真实 GPU 格式与字节、
L1 烘焙/L3 释放、点选和十次重开；PNG 路径通过启动前隐藏 ASTC
扩展触发，报告明确标注为故障注入。
测试页启用 CDP focus emulation，避免切到其它窗口使引擎停止推进；报告登记该条件，
此探针不能用来宣称真实前台帧时。

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
`birth_point` / `city` / `logic_road` / `mountain_patch` / `piers` / `road_info`
（⚠ **`road_info` 不是半文本**，可打印只占 15.6%——是二进制，结构已解，见 `recon_road.py`）。

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

2026-09-24 A04 已纠正旧解析器的“跳到块尾即成功”：此前 1,872/1,872 的零残留统计
包含 524 个内部重同步，**不能证明完整解析**。当前按声明长度逐层验证，任何未知组件或
未消费字节都会报错，不能把解析失败判成“素材没进包”。

```text
字符串 = [u32 LE UTF-8 字节数][UTF-8]
节点 = [str class][u32 blockSize][子节点特有 u8 继承深度，不计入 blockSize]
       [逐层 u32 基类块长][u16 node3dVersion][str tag][i32 render_level]
       [str name][u32 组件数][component…]
       [3f position][3f angle][3f scale][4B color][4B add_color]
       [i16 high_z][i16 low_z][5 × u8 继承/面向开关]
       [u32 blendMode][i16 prefab_type][u32 prefab_id][str render_layer]
       [u8 polygonOffset][u32 poly_block_size][u32 children_size][child…]
node_2d 尾 = [u16 version][2f size][u8 mirror_x][u8 mirror_y][2f pivot][2f skew][u8 child_to_pivot]
sprite 尾 = [graphic2dVersion/深度与alpha测试字段][str material][材质字段][str texture]
frame_sprite 尾 = [u16 version][i32 start][f32 duration][i32 loops][u32 帧数][str texture × 帧数]
组件 = [str class][u32 blockSize][u16 version][类型专属字段]
comp_prefab 节点以引用/覆盖表 + 8 B 零尾收束，不按内联节点读取 transform。
```

node3dVersion 是 **u16**，render_level 是 **i32**；旧文档写反会让有 tag 的节点整体错位。
node_2d / sprite_2d / polygon_2d / frame_sprite_2d 的继承深度分别是 1 / 3 / 3 / 4，
不再启发式搜索下一个字符串，也不进行 4 字节对齐。
当前 S1 消费的 381 个不同入口及其引用展开后共有 4,504 节点，严格解析通过；
这不代表整个原包所有未消费资源都已支持。

```bash
python3 tools/maporiginal-assets/test_prefab_bin.py
python3 tools/maporiginal-assets/prefab_bin.py scene/ground/desert/10_1_top_group.prefab.bin
python3 tools/maporiginal-assets/verify_fidelity.py --map s1 --report .cache/maporiginal-audit/fidelity-after.json
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
~~⚠ 类型编号→中文（0木/1铁/2石/3粮）仍是**假设**~~ ✅ **已由 `base.cw` 的 land 表定死**
（2026-09-23 N1）：真值是 **0木/1石/2粮/3铁** —— land 12..21 名「N级石料」→ `stone-new/`、
22..31「N级粮食」→ `food-new/`、32..41「N级铁矿」→ `iron-new/`，`name` 与 `src_name` 两列互证；
早先的假设把铁/石/粮**轮转错位**，已改正（`build_terrain.py` 抬头）。

### 4.4 摆件 = 逐格 `res_field`，⛔ 不是撒装饰

原作近档 = 底图 + **逐格一个 `res_field` 单位**，由该格的 `res` 值唯一决定 ⇒
`pack_decor.py` 把图集**按原版值建格**（格 id = 值），客户端零猜测。
素材按 `land` 表三套件列读完整 prefab：`scene/resource{,_snow,_desert}/<类>-new/`（45 格 × 3 套）
+ 城址 8 件（N1 起；早先按 `png/<等级>` 文件名取，⚠ 且 `wood/iron/stone/food` 次序假设是
**轮转错位**的 —— land 表真值 `wood/stone/food/iron`，已改正）。

⚠ **个别级没有可用件**：基础季铁矿 5/8/9/10 级的 prefab 没进包、雪地粮草 1/2 级全是阴影占位 ⇒
用**同套同类最近一级**顶上，逐条记在 `decor-atlas.info.json` 的 `substitutions`（按套件分键）。

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

### 4.7 图片尺寸、锚点与层级变换

图集 `native` 仅表示贴图像素；最终显示使用 prefab 的 `size/scale/position/pivot/angle/skew/mirror`，
统一世界比例为 32/150。资源全层级展开，不能强制父节点是单位阵，也不能把整组压成最大一张图。
静态城池/手摆参数记录是 56 B，top 另加 4 B 排序字段；资源 schemaVersion=5，使用完整节点图。
颜色/透明度和 add_color 在材质处理；所有图集用无 mask 的 paste 保留 RGBA。

原 native 的 skew 量化、mirror、frame sprite 周期、loopTimes 与普通点选 24 fps 缺省语义
见 [MAPORIGINAL-2D §2.2](../../docs/MAPORIGINAL-2D.md#22-资源件与选中框共用格心图片按-prefab-锚点与层级变换定位)。
保真复核覆盖 8 张图集、635 切片、19,164,211 像素（含 2,839,676 个半透明像素），RGBA 差异为 0。

### 4.8 ★ 本 kit 只收原版 **2D 沙盘**素材（2026-09-22 拍板）

3D 沙盘（`asset/scene_3d/**`、`config_3d.lua`、`mapview/3d/**`）另开 kit `mapOriginal3d`。
水面仅例外允许 `scene_3d/water/water_normal2.ktx` 与 `shaders/3d_water2.fs`：它们有原 2D river_grid 消费证据，
经 build_surface.py 精确提取，不放开目录。`select.json` 里仍不允许 3D 前缀，机检在
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

## O0：可复测素材与预览基线

实施状态只登记在 [优化方案 §9](../../docs/MAPORIGINAL-2D-OPTIMIZATION.md#9-实施状态唯一登记处)。
统计入口仅需仓内生成物、Python 3.9+、Pillow 与 numpy；不读取或改写外部原包。
报告包含每片的尺寸与 RGBA 哈希、逻辑引用/物理矩形/独立图片数量、全帧依赖、三种地貌复用、
当前 importer 采样设置、水色 RGB 与法线 RG 的约束，以及每张图片的镜像校验。
数据表的可达性按各自格式解析；道路/山体保留所有运行时地貌变体，不能据静态图表删除皮肤。

```bash
python3 tools/maporiginal-assets/test_asset_audit.py
python3 tools/maporiginal-assets/audit_assets.py --map s1 --out .cache/creator-preview/maporiginal-optimization/o0/assets.json
python3 tools/maporiginal-assets/audit_assets.py --map s1 --out .cache/creator-preview/maporiginal-optimization/o0/assets-repeat.json
cmp .cache/creator-preview/maporiginal-optimization/o0/assets.json .cache/creator-preview/maporiginal-optimization/o0/assets-repeat.json
node tools/creator-preview/run.mjs mapOriginal --format png --out .cache/creator-preview/maporiginal-optimization/o0/portrait
```

重放默认沿用网页选好的设备尺寸；`MAPO_PREVIEW_ORIENTATION=landscape` 可临时测横版，结束恢复先前画布。
实际 CSS/backing canvas、设计尺寸、DPR 分别写入 `maporiginal-metrics.json`，现有截图采集另有 1.5 倍输出比例。
报告同时记录编译产物与源码匹配、请求时序、纹理格式/字节、含深度的 RT、数据读取器持有的 ArrayBuffer、
城市/top 对象数量，以及每个固定阶段的帧时、WebGL 上传量和 draw call（含同画布 UI）。
ArrayBuffer 与 BufferAsset 引用有重合，**不得相加**；对象数不伪装成精确 JS 堆字节。
首近景时间取第一帧地表 Mesh，点选步骤另证实可交互；首概览只表示第一次实际显示，当前 L0 默认隐藏概览。
这是已运行预览的桌面样本，不能当作清缓存首装、移动端或 GPU 总内存。
生命周期与视口恢复明确使用宿主 `ViewMgr.close/open`，其余地图操作走普通鼠标；探针只读统计，不改地图 Logic。
复用预览时先关闭旧地图再重新挂载，检查根节点尺寸等于引擎实际可见区，避免只转画布而沿用旧页面尺寸。

矩形试排不产生图片。源内 alpha 护边 2 px 与图集外间隔每侧 2 px 分开记录，不旋转、不改缩采样，
每次校验不重叠/不越界；四种排序试排失败不证明更小布局不可能，也不证明实现后的画面已通过。
图片对照必须输入相同相机、动画时间、shader 和分辨率的 PNG，并指定关键物件/边缘 ROI，例如：

```bash
python3 tools/maporiginal-assets/compare_images.py --before .cache/before.png --after .cache/after.png --roi selection:100,200,80,60 --out .cache/image-comparison.json
```

限值为 RGBA 每通道平均误差 ≤ 1（8-bit），任一通道差值 > 8 的像素占比 ≤ 0.1%；整图和每个 ROI 均须通过。
本工具不自动对齐相机/帧、不接受用大面积背景稀释局部错位，也不替代原包逐像素核验与发布格式验证。

## 五、待办

- ~~多格地形的连通域摆件~~ **已被 M0-B1 取代**：改按 `res.bytes` 的 55,127 个锚点出件
  （`mountain_forms.py` + `build_regions.py` + `pack_regions.py`），连通域整套删除。
  ⚠ 山脉区仍偏空 —— 原版锚点密度就是 1 件/20 格，不是我们漏了。
- `road_info` / `logic_road` 的记录表格式（半文本，尚未解）⇒ 道路层。
- 长字符串 L≥77 的残字：`terrain_attr.lua` 里仍有 `["CXTE[D_LANY"] = 17` 这类键，
  ⚠ 照抄数值表前**逐条目检**。
- 1620² 的 pk 系赛季图（等 s1 这张跑顺）。

## 六、2026-09-24 修复产物的重建与复核

先保证 name_map 与 select.json 对应的 atlas 切片齐全。全部命令只读外部原包，产物写 out 与 kit。

```bash
python3 tools/maporiginal-assets/pack_decor.py --map s1
python3 tools/maporiginal-assets/pack_regions.py --map s1
python3 tools/maporiginal-assets/build_cities.py --map s1
python3 tools/maporiginal-assets/build_tops.py --map s1
python3 tools/maporiginal-assets/build_roads.py --map s1
python3 tools/maporiginal-assets/build_rivers.py --map s1
python3 tools/maporiginal-assets/build_choose.py --map s1
python3 tools/maporiginal-assets/build_surface.py --map s1
python3 tools/maporiginal-assets/install_to_kit.py --map s1
npm run sync:shared
python3 tools/maporiginal-assets/test_prefab_bin.py
python3 tools/maporiginal-assets/verify_fidelity.py --map s1
```

导出需要本目录原有 Pillow/纹理解码依赖，保真检查另需 numpy。
install_to_kit.py 同步 shared 数据、kit 资产和 Cocos 资产镜像；TS 镜像由 sync 脚本刷新。
不手改生成物。A01–A12 的证据和边界见 [机制 §9.1](../../docs/MAPORIGINAL-2D.md#91-复刻简化审计-a01a12-的修复记录2026-09-24)。

## 2026-09-24：四档 LOD 的同源概览

先生成并装入 ground / blocks / tops / regions / rivers / roads 的派生包，再运行：

```sh
node --import tsx tools/maporiginal-assets/bake_overview.ts
python3 tools/maporiginal-assets/install_to_kit.py
```

需要本机 Chrome 9222。工具只创建并关闭自己的烘焙标签页，用 WebGL1 对近景共用的
`mapoStaticScene` 做正交绘制，2× 超采样后生成 `overview.png`（2048×1024）与居中的
`minimap.png`（512²）；`overview.info.json` 记录输入资产、代码和几何指纹。
旧 `bake_content.py` 仅转调新入口，旧 `plate-lod4/5` 安装时清理，禁止再用 res 调色板生成地图。
运行时 L1 / L2 分块缓存复用同一展开逻辑；L3 仅采样 overview，范围和预算见 kit README §六。

## O1：图集去重重排

`texture_layout.py` 与 `atlas_layout.py` 负责图片身份、完整 RGBA 去重和非旋转确定性装箱。
图片条目与逻辑件分离，四个导出器保留原逻辑 ID 顺序。图片 ID 使用图集族＋规范来源路径的 SHA-256 前 20 位；
同图来源排序最前的路径作规范来源，加入其他不同图片或改变布局不会改变该 ID；调整别名集合需重建引用。
去重同时比较完整 RGBA、像素尺寸和 nativeSize；透明像素 RGB 也参与，贴入时不用 alpha mask。
河岸和沙地 top 本批保留原架式位置，山体/道路/城市/雪 top 使用每侧 2 px 外间隔的 MaxRects。
`atlas-layout.types.ts` 为公共生成契约；长来源路径、别名放 info JSON，运行时只存 ID 与布局。

修改前先备份 kit 数据和 shared 内容到 `.cache`，并在旧布局下采集固定时间画面；改后再采集一次。
以下命令中的 Python 需要 Pillow/numpy，固定时间采集与概览烘焙需要本机 Chrome 9222：

```bash
python3 tools/maporiginal-assets/test_texture_layout.py
node --import tsx tools/maporiginal-assets/capture_layout.ts --out .cache/mapo-repack/render-before
# 修改导出器或输入后：
python3 tools/maporiginal-assets/pack_regions.py
python3 tools/maporiginal-assets/build_roads.py
python3 tools/maporiginal-assets/build_cities.py
python3 tools/maporiginal-assets/build_tops.py
python3 tools/maporiginal-assets/verify_repack.py --before .cache/mapo-repack/before/data --after tools/maporiginal-assets/out/pack/s1 --report .cache/mapo-repack/repack.json
python3 tools/maporiginal-assets/install_to_kit.py
npm run sync:shared
node --import tsx tools/maporiginal-assets/bake_overview.ts
python3 tools/maporiginal-assets/install_to_kit.py
python3 tools/maporiginal-assets/emit_ledger.py --out apps/kits/mapOriginal/art/LICENSES.md
node --import tsx tools/maporiginal-assets/capture_layout.ts --out .cache/mapo-repack/render-after
python3 tools/maporiginal-assets/verify_fidelity.py --report .cache/mapo-repack/fidelity.json
python3 tools/maporiginal-assets/compare_images.py --before .cache/mapo-repack/render-before/luoyang/overview.png --after .cache/mapo-repack/render-after/luoyang/overview.png --roi city-wall:350,420,320,170 --roi mountain:160,320,220,140 --out .cache/mapo-repack/luoyang-diff.json
```

`verify_repack.py` 对全部逻辑条目逐片比较像素、原画布、变换和来源，并比较全部 `.bin/.bytes`、城市件库与 top 件数。
`verify_fidelity.py` 继续独立对照原包；新布局还校验版本、哈希、完整画布、别名、越界与重叠。
打包重复两次需对 PNG / info / data TS / 二进制逐文件比较字节；安装后使用 `install_to_kit.py --check` 核对镜像。
固定时间采集覆盖草地、雪地、沙地、洛阳与跨块范围，1024² 输出、2× 超采样、动画时间 0，
通过近景同源 Logic 展开、WebGL1 和 overview 相同混合公式渲染；每个 report 记录源图哈希、几何指纹和批次。
它不代替 Creator 的真实四档 LOD、缓存接缝、点选和横竖版回归，水面仍按既有静态填充色口径。
全图和所有关键局部 ROI 必须分别过 §7 阈值；只比较整图平均值不能验收。

## O2：保留原画布的透明裁边

`pack_decor / build_roads / build_tops` 沿用原缩采样，再对资源件、道路、河岸与雪 top 的 alpha>0
包围盒保留源内 2 px 护边；图集外另留每侧 2 px。保留区 RGBA 原样复制，无 alpha mask、extrude、
阈值去阴影或再次缩图。山体、城市、沙 top 维持完整画布，底纹/水色/法线/格线/选框不参与此裁剪。
每片的 `storageSize / trimRect` 传给同一个 mesh 展开入口；先按原 size/pivot 定位裁剪窗口，再走
父矩阵、skew、旋转、缩放，UV 镜像同时镜像窗口。帧表及纹理轨道引用的逻辑编号不变。

资源图集采用 2048×4096 单页。两页候选由 `trial_decor_pages.py` 仅写 `.cache`，不装入 kit；
`capture_layout.ts --decor-pages <候选目录>` 严格按画家序分连续纹理段，在 WebGL1 实际提交并记录
draw call、纹理批次（含首次绑定）和首次烘焙耗时。该耗时包括解码/上传，不能冒充稳定帧时。
切片分组只看帧表/纹理轨道引用，不据此改变节点更新或透明层序。

先把当前 kit 数据和 shared content 各备份到 `.cache/mapo-trim/before/{data,content}`，再修改/重建。
以下命令只读原包；Python 需 Pillow/numpy。`verify_repack` 的裁边基线须包含完整存储画布。

```bash
python3 tools/maporiginal-assets/pack_decor.py
python3 tools/maporiginal-assets/build_roads.py
python3 tools/maporiginal-assets/build_tops.py
python3 tools/maporiginal-assets/install_to_kit.py
npm run sync:shared
node --import tsx tools/maporiginal-assets/bake_overview.ts
python3 tools/maporiginal-assets/install_to_kit.py
python3 tools/maporiginal-assets/emit_ledger.py --out apps/kits/mapOriginal/art/LICENSES.md
python3 tools/maporiginal-assets/verify_repack.py --before .cache/mapo-trim/before/data --before-content .cache/mapo-trim/before/content --minimap-source tools/maporiginal-assets/out/pack/s1/minimap-source.png --report .cache/mapo-trim/repack.json
python3 tools/maporiginal-assets/verify_fidelity.py --report .cache/mapo-trim/fidelity.json
python3 tools/maporiginal-assets/test_texture_layout.py
node --import tsx tools/maporiginal-assets/capture_layout.ts --gallery --seconds 0.37 --out .cache/mapo-trim/after
python3 tools/maporiginal-assets/trial_decor_pages.py --before .cache/mapo-trim/before --out .cache/mapo-trim/two-pages
node --import tsx tools/maporiginal-assets/capture_layout.ts --gallery --seconds 0.37 --decor-pages .cache/mapo-trim/two-pages --out .cache/mapo-trim/page-trial
```

`bake_overview` 保留同一次缩采样的正方形 `out/pack/s1/minimap-source.png` 作为裁边核验输入，
安装器不发布该留白副本；`verify_repack --minimap-source` 逐字节检查内容带的 524,288 B RGBA。
图、导航区域、点选和视口框的布局常量共用 `mapoFar.ts`。

素材陈列图支持 `--gallery-only --opaque-gallery`，采用中性不透明底，检查可见边缘与每个物件的紧邻 ROI。
O1 原画布基线可加 `--decor-baseline .cache/mapo-trim/before/data`；完整 prefab 图先由 `verify_repack`
确认不变，再核对基线几何哈希、原图哈希与修改前截图记录一致。透明 PNG 的解除预乘会放大低 alpha
的 RGB 舍入噪声，保留其原始对照结果，不把它写成通过；实际地图及不透明背景陈列图仍使用相同
RGBA 阈值（MAE≤1、差值>8 的比例≤0.1%），不能靠扩大 ROI 消解误差。


## O3：独立地图 Bundle 与版本绑定

真源仍是本目录管线与 `apps/kits/mapOriginal/data/maps/s1/`。安装器在
`apps/Cocos/assets/bundles/kit-mapOriginal-s1/2d/` 生成按组归档的运行时素材；每个文件的物理名
带 SHA-256 前 16 位，调用方按稳定逻辑名查询 `manifest.data.ts`，不手写物理文件名。
`manifest.json` 与生成 TS 同时绑定全部 shared 内容配置哈希、图集布局、组依赖、源文件字节数和哈希。
修改任一配置或源素材后必须重跑安装器。它先核对输入，再更新产物，清除已知旧副本；遇到未知文件拒绝删除。
现有 `.meta` 保留 Creator 的导入设置，新地址按确定性 UUID 铸造。根使用宿主 `package2d` 配置。

运行时先经 AssetLease 加载 manifest 并严格核对版本和内容，然后才启动其它组。二进制在解析前检查
长度和 CRC32（损坏/混版检测，非安全摘要）；纹理检查尺寸。完整 SHA-256 是源制品的身份，
不用于校验 ASTC/ETC 平台输出；Creator 的内容寻址地址和构建版本负责平台缓存。
32 个运行时素材以外，`minimap-mask.png`、`decor-atlas.info.json`、`region-atlas.info.json` 等
制作信息只留在 kit，`resources/kits/mapOriginal/maps/s1/` 不再发布地图副本。
源文件大小不等于构建输出或网络流量，审计报告分别列 Bundle 源字节、主包地图素材字节及脚本配置字节。

```bash
python3 tools/maporiginal-assets/install_to_kit.py
npm run sync:shared
node --import tsx tools/maporiginal-assets/bake_overview.ts
python3 tools/maporiginal-assets/install_to_kit.py
npm run sync:shared
python3 tools/maporiginal-assets/emit_ledger.py --out apps/kits/mapOriginal/art/LICENSES.md
python3 tools/maporiginal-assets/install_to_kit.py --check
python3 tools/maporiginal-assets/audit_assets.py --out .cache/mapo-bundle/assets.json
node tools/creator-preview/run.mjs mapOriginal --reuse --out .cache/mapo-bundle/portrait
node tools/creator-preview/probe-maporiginal-bundle.mjs <已有预览标签ID> .cache/mapo-bundle/faults
# O4 起构建审计同时要求对应压缩试验报告（前文流程）：
python3 tools/maporiginal-assets/audit_bundle_build.py --build-dir <web-mobile构建目录> --quality-report .cache/mapo-compression/trials/report.json --out .cache/mapo-bundle/build.json
```

最后一个探针在指定的 localhost:7456 预览内注入旧内容版本、旧布局版本与真实 Bundle 地址缺片，
确认图层不误安装且恢复加载；再测试已加载 Asset 的断网复用，以及释放后禁 HTTP 缓存的断网失败路径。
不会新建缓存或改 CDN；finally 撤掉钩子、恢复网络和地图页。故障期控制台错误保留在报告中。
修改宿主 builder profile 后需重启 Creator 使其重新读取设置；默认配置回退警告不能当成 profile 已生效。
