# tools/sgzzmap-maps — sgzzmap 大地图素材管线

把 `~/Downloads/maps/` 的国风缩放概念图（**仓外只读**）转成 `sgzzmap` kit 的运行时数据：
`terrain.bytes`（1 字节/格的地形索引图）、`regions.json`（郡分区）、各档 `plate-lod*.png`（远档底图）
与 `atlas-lod*.png`（近档地块贴片）、`minimap.png`。

⚠ `tools/` 不属 kit 所有权（`apps/server/tools/plugin/ownership.ts` 的 `HARD_EXCLUDED_DIRS`），
本管线是宿主侧改动，**不会**被打进 kit 包——与 `tools/slg-maps` ↔ `apps/kits/slg/data` 的安排一致。

## 素材实况（动手前必读）

10 张图（`Z10` 与 `Z09` 逐字节相同，md5 `722ef68e10f8aa53e9f942575bc7543a`）**不是同一张图的多级切片**。
目检结论：

| 图 | 画的是什么 | 因此只能怎么用 |
|---|---|---|
| Z00 | 一座城的近景 | 地块贴片来源（笔触与设色） |
| Z02 / Z04 | 数个聚落 / 一个郡（带郡界黄线） | 地块贴片来源 |
| Z06 | 数郡（边界地标档） | 地块贴片来源 |
| Z08 / Z09 | **整个世界**（势力总览） | 远档底图；**Z09 = 世界地理权威** |

所以：**海陆轮廓与郡分区只能来自 Z09**（唯一画了全世界的一张）。
陆内的山/林/丘/水/湿地**不是从图上判出来的**——Z09 的色块是势力设色不是地貌，且
2048×1152 ≈ 2.36 Mpx 对 2.25 M 格只有约 1 px/格。它们按 seed 程序化铺设，密度对齐
`maps.config.json` 的 `density`（照 Z04/Z06 的目检观感定的）。同 seed + 同配置 ⇒ 逐字节同产物。

**⛔ 不要把 `~/Downloads/maps/` 的 PNG 拷进仓库**（用户拍板：只入派生产物）。原图路径写在
`maps.config.json` 的 `sourceRoot`，换机器改这一行。

## 依赖

```bash
python3 -m venv /tmp/sgzzmap-maps-venv
/tmp/sgzzmap-maps-venv/bin/pip install pillow numpy scipy
```

## 流程

```bash
P=/tmp/sgzzmap-maps-venv/bin/python
$P prepare-source.py zhongyuan --all      # 去水印 + 来源 sha256 存证 → out/<id>/sources/
$P extract-world.py  zhongyuan            # Z09 → 海陆掩膜 + 郡分区 → world.npz / regions.json
$P calibrate.py      zhongyuan --overlay  # ★ 人工闸：陆缘红线/海缘蓝线/郡界琥珀线叠回素材，目检签字
$P synth-terrain.py  zhongyuan            # → terrain.bytes + terrain.meta.json + terrain-preview.png
$P verify-redraw.py  zhongyuan            # 机检闸，非 0 退出即不合格
$P bake-plate.py     zhongyuan            # Z08/Z09 → 世界空间底图（与地形同一 warp）
$P bake-minimap.py   zhongyuan            # 由最远档底图派生缩略图 + 菱形蒙版
$P cut-atlas.py      zhongyuan            # Z00/Z02/Z04/Z06 → 各档地块贴片图集
$P calibrate.py      zhongyuan --check-links   # links.json 落点可通行 + 对称性（有该文件时）
```

产物落 `out/<mapId>/`（**已 gitignore**）。**目检通过后**再拷进
`apps/kits/sgzzmap/data/maps/<mapId>/` 与 `apps/Cocos/assets/resources/kits/sgzzmap/maps/<mapId>/`
（两处必须逐字节一致，`apps/server/test/sgzzmap-content.test.ts` 钉住）。

## 对齐是构造出来的，不是标定出来的

`fit: "grid"` —— 地形取源图 `(col/cols, row/rows)` 处；`bake-plate.py` 对底图做同一映射的
**逆变换**；`bake-minimap.py` 又由底图派生。三者同一个仿射，所以「图比格偏了几格」这类 bug
在构造上就不可能存在。代价是画面在等距屏幕空间里读作旋转 45°，而世界包围盒是 2:1、可玩区是
其内接菱形——源图四角（都是云雾装饰）正好落到地图不可达的四极。

## 踩过的坑（⛔ 别重蹈）

1. **只按「偏蓝」判海会把蓝色系势力色块一起吃掉。** V 直方图在 120–130 有低谷：海在 90–120，
   势力蓝块在 130–150。先用 `sea.maxValue` 切一刀。
2. **逐像素判完还不够**：纸纹让蓝色块里散落暗像素同样过关，会在大陆内部打出成片空洞
   （`--overlay` 上表现为内陆到处是陆缘红线）。真正的海是连到图边的那一片 ⇒
   `sea.borderConnectedOnly` 做结构判定。
3. **闭运算 + 填洞会把海湾一起吞掉**（实测吃掉约一半海面）。轮廓用形态学求，海面按原始掩膜挖回来。
4. **在源分辨率上量化色块会碎成几万个噪点连通域**，逐块 dilation 归并在 1500² 上跑不完。
   先降到网格分辨率再中值滤波再量化；碎块用**一次 EDT 最近邻**整体归并。
5. **碎块吸收必须迭代到不动点**：把 A 并进邻类 B 之后 B 那侧可能仍不足 `minRegionTiles`。
6. **河流必须豁免碎块吸收**——河本来就是细长连通域，一并吸收会把整个河网抹平。
7. **贴片打分不能奖励「平」**：Z09 的势力色块天生平色，不罚就永远是它赢，近档要的恰恰是笔触。
   ⇒ `MIN_STD`/`FLAT_PENALTY` 罚太平的窗口，`FALLBACK_PENALTY` 压住跨素材回退。
8. **自动挑的贴片会把栅栏／小人／桥一起平铺到成千上万个格子上。** 正式出品要人工策展：
   `bands[].cells = {"plain": ["Z00-默认.png", x, y]}` 钉死 rect。

## 当前产物（zhongyuan，1500×1500）

陆 68.9% / 海 9.7% / 图外 21.4%，**可玩陆地 1,549,931 格**，郡 135 个。
陆内：平原 55.9%、森林 14.9%、丘陵 12.1%、山地 8.0%、水域 6.1%、湿地 2.9%。
`terrain.bytes` = 2,250,008 字节（8 字节大端头 `rows`/`cols` + 行主序 u8）。
