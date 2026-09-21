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

## 四、待办

- `decode-ktx.py`：KTX(ETC2/ASTC) → PNG（venv 装 `texture2ddecoder` + Pillow；
  ⚠ Creator 3.8 不收 `.ktx`，且 `docs/3D-ASSETS.md` §5 ⛔ 禁压缩纹理入库）
- `slice-atlas.py`：718 个 `<TextureAtlas>` XML × `<sprite n x y w h>` → 按原始路径切片
- `collect-sources.py`：逐文件存证（源路径 / 容器 md5 / namehash / SHA-256）→ 授权台账素材
