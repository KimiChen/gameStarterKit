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
| `res.bytes` | **1500×1500** | 61 | 主地块/资源层。1=LAND(844,134)、47=RIVER(235,292)、0=142,958（郡界/障碍）、`等级×10+资源类型`（4/14/24/34…） |
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

### 4.2 近档地表素材：原版 2D 档 `.group` ⛔ 不在基础包里

`*_path.json` 里那 205 条 `scene/ground/{river,snow,desert}/<n>_<m>[_x|_y].group`
**一条都不在 ELP 中**（直查与 8 种扩展名变体全 0）——原版 2D 沙盘的地表是按需热更下发的，
基础包里只有 3D 那一套。⛔ 别再去包里找它们。

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

## 五、待办

- `decode-ktx.py`：KTX(ETC2/ASTC) → PNG（venv 装 `texture2ddecoder` + Pillow；
  ⚠ Creator 3.8 不收 `.ktx`，且 `docs/3D-ASSETS.md` §5 ⛔ 禁压缩纹理入库）
- `slice-atlas.py`：718 个 `<TextureAtlas>` XML × `<sprite n x y w h>` → 按原始路径切片
- `collect-sources.py`：逐文件存证（源路径 / 容器 md5 / namehash / SHA-256）→ 授权台账素材
